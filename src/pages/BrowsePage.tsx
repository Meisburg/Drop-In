import { useEffect, useRef, useState } from 'react'
import { PlaceDirectory } from '../components/PlaceDirectoryLazy'
import { useSessionContext } from '../components/SessionProvider'
import {
  getReviewSummaries,
  listMyFollows,
  listPlaceDropInProofs,
  listPlaceReviewHighlights,
  listPlaces,
  loadZipCodes,
  toggleFollowPlace,
  upcomingStartTimesByPlace,
} from '../lib/db'
import type { ReviewSummaryRow } from '../lib/db'
import { DEFAULT_RADIUS_MILES, type ZipCoords } from '../lib/feed'
import { placeFollowIdSet } from '../lib/places'
import { planSaveToggle, savedPlaceIdSetAfterToggle } from '../lib/follows'
import type { PlaceDropInProof, PlaceReviewHighlight } from '../lib/placeSocial'
import type { ReviewSummary } from '../lib/reviews'
import type { Place } from '../lib/types'

/**
 * The bulk rating read's result into the directory's row shape: a Map of
 * place id → `ReviewSummary` (the lib seam's shape). A null average is the
 * unrated signal — it stays null all the way to the card, which renders
 * nothing for it (never a 0.0).
 */
function toReviewSummaryMap(rows: ReadonlyMap<string, ReviewSummaryRow>): Map<string, ReviewSummary> {
  const out = new Map<string, ReviewSummary>()
  rows.forEach((row, placeId) => {
    out.set(placeId, {
      count: row.review_count,
      displayAverage: row.display_average,
      hasReviews: row.review_count > 0 && row.display_average !== null,
    })
  })
  return out
}

/**
 * /browse — the PLACES directory (V8 ticket 07). The day-grouped list of
 * drop-ins is GONE from this screen: it was the same `listRadiusFeed` call the
 * feed makes (the ticket's opening complaint — a tab that showed the feed's own
 * content), and it lives on the feed only. What is left is the thing the
 * product's premise needs and nothing had: a searchable directory of the city's
 * playgrounds, pools, splash pads, beaches, community centers and indoor
 * options, with "N upcoming" per place.
 *
 * V21 t02 PHASE A: the DIRECTORY SURFACE itself — the map band, the search /
 * filter / distance controls, the grouped list with its overflow door, the
 * "Not on the map yet" section, both modals, and the floating "Map" button —
 * now lives in ONE component, `PlaceDirectory`, which this page renders. This
 * page keeps only what a PAGE owns: the data reads (places, gazetteer, counts,
 * follows — each with its own failure discipline), the session context, and the
 * follow write. The component is the single implementation of the directory;
 * `/new` opens the SAME component in a full-screen sheet (Phase B), so there is
 * one surface, two consumers — never a copy-pasted second directory.
 *
 * WHY THE PLACES READ FAILING IS NOT A WALL: this page's empty state is the
 * SAME shared RadiusEmptyState the feed uses (V8 ticket 02's one-component
 * decision, pinned by an existing e2e assertion about this exact route). When
 * the directory read fails — the documented pre-0029-apply state, PGRST205 —
 * there is genuinely nothing to show within the radius, so the page renders
 * that state with the escapes AND says plainly that the directory could not be
 * loaded. The failure is disclosed, never swallowed; it is not turned into a
 * full-page error only because a bare error card would assert that nothing is
 * near you without offering the way out that this state exists to offer.
 *
 * A place with UNKNOWN distance (no coordinates for it yet — three hand-seeded
 * rows, 0029's header) is NEVER hidden by the distance filter: it moves to its
 * own clearly-labelled section instead, because the rule is that a filter may
 * not hide a place for missing data. That section is also why 0029's lat/lng
 * are nullable.
 *
 * V17 t02 (re-worded for annotation 5): THE SAVE CONTROL IS THE EXISTING FOLLOW, not a second save concept. A
 * signed-in parent sees one Save / Saved bookmark per card — filled when they already save that place — and tapping it toggles the SAME `follows` row the /place/:id control writes (0033's exactly-one-target table, owner-only RLS) —
  * there is no `saved_places` table and no per-card follower COUNT. A count would be one
  * `countPlaceFollowers` RPC PER CARD (239 cards = 239 round trips, and a popularity score on a place), so the
  * grid shows only the caller's OWN state, read ONCE for the whole page via `listMyFollows` + the pure
  * `placeFollowIdSet` seam. Signed out renders no save control at all, and issues no follows request — the
  * /place/:id decision (a control a visitor cannot press is decoration).
 *
 * THE FOLLOW READ IS BEST-EFFORT, exactly like the gazetteer read above it: a
 * failure (pre-0033-apply: PGRST205) leaves every bookmark unfilled and the
 * directory rendering normally. The control is a card decoration; it is never
 * worth an error state, and it must never cost the page its places.
 */
/**
 * V22 slice 10: this page is loaded through the dynamic import in App.tsx
 * (the /browse route is deep-link only, so its chunk — and the places
 * directory + map it pulls in — load on demand). A default export lets that
 * `lazy()` factory resolve it.
 */
export function BrowsePage() {
  const { session, loading, profile } = useSessionContext()
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [placesFailed, setPlacesFailed] = useState(false)
  const [zipCoords, setZipCoords] = useState<ReadonlyMap<string, ZipCoords> | null>(null)
  // null = the start-time read failed (pre-0030-apply: no place_id column) → no
  // start times rendered at all, because "0 upcoming" is a claim we cannot make.
  const [upcomingStartTimes, setUpcomingStartTimes] = useState<Map<string, string[]> | null>(null)
  /**
   * V17 t02 (re-worded for annotation 5): the PLACE ids the caller already saves (the pure
   * placeFollowIdSet seam) — what each card's Save / Saved bookmark reads. ONE batched read for
   * the whole grid, never one call per card, and never `countPlaceFollowers` (a
   * grid of 239 cards must not make 239 RPCs; the control shows the caller's OWN
   * state, which is all this read returns).
   *
   * The empty set is the honest default twice over: a signed-out viewer (the
   * effect never runs) and a FAILED read (the catch below lands the empty set)
   * both render every bookmark unfilled — identical to the page before this slice,
   * never an error state and never an empty page (the `zipCoords` precedent).
   */
  const [followedPlaceIds, setFollowedPlaceIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  )
  /**
   * A MONOTONIC COUNT OF SAVE TOGGLES since mount. The initial `listMyFollows`
   * read and a tap are concurrent: if the read is slow, its response can land
   * AFTER an optimistic toggle and overwrite the whole set with the state the
   * database had when the read STARTED — silently un-saving a place the parent
   * just saved. The read records this counter when it begins and refuses to
   * apply its answer if a toggle has happened since; the optimistic set is then
   * the truth until the next read (a fresh page load). This is the fix for the
   * race the handler's own comment names.
   */
  const followsToggleSeq = useRef(0)
  /**
   * V24: the per-place aggregate ratings (the DB-computed display average +
   * review count), hydrated by ONE bulk read for the whole grid — never one RPC
   * per card. `null` while the read is in flight OR when it failed → every
   * card renders no rating line at all (never a 0.0). The empty map is the
   * honest default twice over: places not yet loaded and a FAILED read both
   * land here, exactly like the `upcoming` counts above.
   */
  const [ratings, setRatings] = useState<Map<string, ReviewSummary> | null>(null)

  /**
   * V27 — the two SOCIAL-PROOF reads, each keyed by place id and each
   * best-effort exactly like `ratings` above: the newest review WITH a body,
   * and the past-drop-in activity. `null` means "in flight or failed" and every
   * card simply renders no extra line — never an error state. The pure
   * `placeSocial` seams turn these into the card's quote / activity copy.
   */
  const [reviewHighlights, setReviewHighlights] = useState<Map<string, PlaceReviewHighlight> | null>(
    null,
  )
  const [dropInProofs, setDropInProofs] = useState<Map<string, PlaceDropInProof> | null>(null)
  /**
   * V27 — the ONE clock the activity line is measured against. It is captured
   * when the proofs read RUNS and handed to the directory unchanged, so every
   * card in one render agrees on "2 days ago" instead of each recomputing now
   * and drifting across a minute boundary.
   */
  const [proofNowIso, setProofNowIso] = useState<string | null>(null)

  // The directory. A failed read is disclosed (placesFailed) rather than
  // rendered as a wall — see the page doc.
  useEffect(() => {
    let cancelled = false
    setPlaces(null)
    setPlacesFailed(false)
    listPlaces()
      .then((rows) => {
        if (!cancelled) setPlaces(rows)
      })
      .catch(() => {
        if (!cancelled) {
          setPlaces([])
          setPlacesFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The gazetteer (for every place distance). A failed load leaves zipCoords
  // null → every distance is UNKNOWN → every place lands in the
  // "not on the map yet" section rather than being hidden or mis-measured.
  useEffect(() => {
    let cancelled = false
    loadZipCodes()
      .then((coords) => {
        if (!cancelled) setZipCoords(coords)
      })
      .catch(() => {
        if (!cancelled) setZipCoords(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The "N upcoming" start times. Signed-in only (the read is RLS-scoped to the
  // authenticated role anyway); a failure yields null → no start times rendered.
  useEffect(() => {
    if (loading || session === null) return
    let cancelled = false
    upcomingStartTimesByPlace()
      .then((times) => {
        if (!cancelled) setUpcomingStartTimes(times)
      })
      .catch(() => {
        if (!cancelled) setUpcomingStartTimes(null)
      })
    return () => {
      cancelled = true
    }
  }, [loading, session])

  // V17 t02 (re-worded for annotation 5): the caller's own place follows, ONCE for the whole grid — the
  // bookmarks' first paint comes from this read, never from a per-card call. The
  // same signed-in-only shape as the counts effect above: signed out returns
  // before the call, so no follows request is ever issued, and a failure lands
  // the EMPTY SET so every bookmark renders unfilled and the page is otherwise
  // untouched.
  //
  // The read is the DEFAULT-CLIENT wrapper (listMyFollows), the repo's
  // established page-side pattern — no page in src/ imports the Supabase client
  // directly. The wrapper resolves the user itself; the `session` guard here is
  // what keeps a signed-out visitor from issuing the request at all.
  useEffect(() => {
    if (loading || session === null) return
    let cancelled = false
    // Snapshot the toggle counter: if a save lands while this read is in flight,
    // the read's answer is STALE about that place and must not overwrite it.
    const seqAtStart = followsToggleSeq.current
    listMyFollows()
      .then((rows) => {
        if (!cancelled && followsToggleSeq.current === seqAtStart) {
          setFollowedPlaceIds(placeFollowIdSet(rows))
        }
      })
      .catch(() => {
        if (!cancelled && followsToggleSeq.current === seqAtStart) {
          setFollowedPlaceIds(new Set<string>())
        }
      })
    return () => {
      cancelled = true
    }
  }, [loading, session])

  // V24: the bulk rating read — ONE logical read step for every place in the
  // grid (the helper loops the per-place RPC; see db.getReviewSummaries). Runs
  // whenever the places list lands; a failure yields null → no rating line on
  // any card (never a 0.0), exactly like the `upcoming` counts above.
  useEffect(() => {
    if (places === null || places.length === 0) return
    let cancelled = false
    const ids = places.map((p) => p.id)
    getReviewSummaries(ids)
      .then((rows) => {
        if (!cancelled) setRatings(toReviewSummaryMap(rows))
      })
      .catch(() => {
        if (!cancelled) setRatings(null)
      })
    return () => {
      cancelled = true
    }
  }, [places])

  // V27: the review-quote read — ONE batched read for the whole grid, the same
  // shape and failure discipline as `getReviewSummaries` above (cancellation
  // guard; a failure lands null so no card shows a quote). Runs whenever the
  // places list lands.
  useEffect(() => {
    if (places === null || places.length === 0) return
    let cancelled = false
    const ids = places.map((p) => p.id)
    listPlaceReviewHighlights(ids)
      .then((rows) => {
        if (!cancelled) setReviewHighlights(rows)
      })
      .catch(() => {
        if (!cancelled) setReviewHighlights(null)
      })
    return () => {
      cancelled = true
    }
  }, [places])

  // V27: the drop-in-activity read. `nowIso` is captured ONCE per run and
  // stored so the directory measures every "last one X ago" against the same
  // instant; a failure lands null (and clears the clock) so no card shows an
  // activity line rather than an invented one.
  useEffect(() => {
    if (places === null || places.length === 0) return
    let cancelled = false
    const nowIso = new Date().toISOString()
    listPlaceDropInProofs(nowIso)
      .then((rows) => {
        if (!cancelled) {
          setDropInProofs(rows)
          setProofNowIso(nowIso)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDropInProofs(null)
          setProofNowIso(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [places])

  if (loading || profile === null) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  const viewerRadius = profile.radius_miles ?? DEFAULT_RADIUS_MILES
  // V15 t02: the home pin's coords — the stored home_zip resolved through the
  // same gazetteer seam the feed uses. Null when the zip is unset or missing
  // from the gazetteer (AC5: no home pin renders for a new user).
  const homePinCoords = (() => {
    if (profile.home_zip === null || profile.home_zip === undefined) return null
    if (zipCoords === null) return null
    const found = zipCoords.get(profile.home_zip)
    return found === undefined ? null : { lat: found.lat, lng: found.lng }
  })()

  /**
   * V17 t02 (re-worded for annotation 5): save / unsave ONE place — the EXISTING
   * follow write, never a competing "save". The DECISION is the pure
   * `planSaveToggle` seam (the same one the place pages call); execution goes
   * through `toggleFollowPlace`, which is a read-then-write against the
   * owner-only row (it resolves the follow row itself) and already treats a
   * concurrent 23505 as success. Saving keeps a place on your shortlist so you
   * can find it again; nothing here promises notifications.
   *
   * The local set is flipped FIRST (the control moves on tap, the ping toggle's
   * optimistic discipline); on SUCCESS nothing else happens — the flip already
   * IS the final state and the write's return value is deliberately unused. Only
   * a REJECTED write touches the set again, rolling the one place back.
   *
   * V25 t08: the SECOND half of the pair is the pure
   * `savedPlaceIdSetAfterToggle` — the same set rule the /new picker sheet
   * applies — so a save or unsave reads identically on both hearts surfaces and
   * the Saved filter on one cannot disagree with the bookmark on the other
   * within one page load. The optimistic flip stays here because this page's
   * control must move on tap (it is the primary affordance); the sheet's list
   * refreshes from the write's answer instead (see NewPlaydatePage's handler),
   * and `follows.savedPlaceIdSetAfterToggle` names that difference at the seam.
   *
   * Both writes use the FUNCTIONAL updater, not a value captured from this
   * render's closure. The follows read is a concurrent effect: it can land a
   * fresh set between the tap and the write settling, and rolling back to a
   * captured `previous` would then restore a set that is no longer the one we
   * replaced — silently discarding a read that arrived mid-flight. The updater
   * receives the CURRENT state and inverts only this place, so the rollback
   * restores exactly what it changed.
   */
  async function handleTogglePlaceFollow(placeId: string) {
    const wasFollowed = followedPlaceIds.has(placeId)
    // The decision: save or unsave? The pure seam decides; execution below.
    const decision = planSaveToggle(wasFollowed)
    // Mark this toggle so an in-flight `listMyFollows` read cannot clobber it.
    followsToggleSeq.current += 1
    setFollowedPlaceIds((prev) => savedPlaceIdSetAfterToggle(prev, placeId, decision))
    try {
      await toggleFollowPlace(placeId)
    } catch {
      setFollowedPlaceIds((prev) =>
        savedPlaceIdSetAfterToggle(prev, placeId, decision === 'save' ? 'unsave' : 'save'),
      )
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* V27: the page's title is now the search pill's own text (the reference's
          "Places · Seattle, WA"), so the visible SectionHeader is gone. The page
          still owns exactly one h1 — screen-reader only — so the document
          outline is unchanged. */}
      <h1 className="sr-only">Places</h1>

      {placesFailed ? (
        <p className="text-sm text-red-600">
          The places directory couldn’t be loaded — it may not be set up on the server yet.
        </p>
      ) : null}

      {/* V21 t02: the directory surface — ONE component, also embedded in /new. */}
      <PlaceDirectory
        places={places}
        zipCoords={zipCoords}
        upcomingStartTimes={upcomingStartTimes}
        ratings={ratings}
        reviewHighlights={reviewHighlights}
        dropInProofs={dropInProofs}
        nowIso={proofNowIso ?? undefined}
        followedPlaceIds={followedPlaceIds}
        canFollow={session !== null}
        onToggleFollow={(placeId) => void handleTogglePlaceFollow(placeId)}
        homePin={homePinCoords}
        viewerRadius={viewerRadius}
        homeZip={profile.home_zip ?? null}
        locationLabel="Seattle, WA"
      />
    </div>
  )
}
/** V22 slice 10: default export for the lazy route (see above). */
export { BrowsePage as default }
