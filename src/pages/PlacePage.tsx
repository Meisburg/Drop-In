import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BackControl } from '../components/BackControl'
import { DropInCard } from '../components/DropInCard'
import { PlaceMap } from '../components/PlaceMapLazy'
import { PlaceKindArt } from '../components/PlaceKindArt'
import { useSessionContext } from '../components/SessionProvider'
import { NAV_ICONS } from '../components/icons'
import {
  countPlaceFollowers,
  getPlaceById,
  getPlaceFollowState,
  kidAgesByPostForPosts,
  listPingsForPosts,
  listPlaceFeed,
  loadZipCodes,
  toggleFollowPlace,
  type PingForPost,
} from '../lib/db'
import { cardAgeRangeLabel, formatDistanceLabel, goingPingsByPost } from '../lib/feed'
import type { ZipCoords } from '../lib/feed'
import { placeFollowerLine, planSaveToggle } from '../lib/follows'
import {
  hasPlacePhoto,
  photoCreditLine,
  placeAgeFitLabel,
  placeDistanceMiles,
  placeIndoorLabel,
  placeKindLabel,
  placeDetailsPath,
  placeOutboundLinks,
  sortPlaceUpcoming,
} from '../lib/places'
import type { Place, PlacePrefill, PlaydateWithNeighborhood } from '../lib/types'

/**
 * /place/:id — one place in the directory (V8 ticket 07, migration 0029).
 *
 * What the page answers, in the order V25 ticket 04 put it in: what is this
 * place (name, kind, indoor or outdoor) → what should I know (`places.notes`,
 * the description) → where can I go next (the two actions: "Learn more" and
 * "Get directions") → where is it (the SAME tappable Google Maps link the
 * detail page uses, the pure `feed.mapsHref` seam, then the map it points at,
 * then the age line — silent when the directory has no age data, rather than
 * implying "all ages"; V11 t03). Then the one action: "Start a drop-in here".
 *
 * V25 t04 — THE SEQUENCE, AND THE BUTTON THAT STOPPED CONTRADICTING THE MAP.
 * The founder, reading this page top to bottom, asked for name → picture →
 * description → two buttons → map → "Start a drop-in" → the rating → comments;
 * this page owns everything but the picture (V20 t01 removed it on purpose and
 * NO planned ticket restores one — ticket 16 is research-only, "no product code,
 * no migration, no schema change, no DB write" — so a photo's return is
 * currently unowned; see the V20 note at the photo slot) and the rating/comments
 * (they live on the research page, `PlaceDetailsPage.tsx`, reached from the link
 * at the bottom of this page — deliberately NOT duplicated here). He also
 * flagged the control that used to sit BELOW the map: *"This doesn't really make
 * sense to me because I can see the map above this button. So I already have
 * found it on a map. Really it should be like get directions … I guess if you
 * wanted to have a button here."* The old "Find it on the map"
 * label is gone; the row now offers "Learn more" and "Get directions", and both
 * hrefs come from seams that already existed (`placeOutboundLinks`).
 *
 * V20 t01 — THE PHOTO IS GONE, THE WEBSITE LINK REPLACED IT. V18 sourced
 * Wikimedia Commons photos for a curated subset of rows; the founder's ruling
 * is that 239 hand-maintained images are not maintainable ("I can't police this
 * and fix all the broken images"), so the page no longer renders one at all.
 * `places.photo_url` and its attribution columns stay exactly as they are —
 * nothing is migrated or dropped — and `photoCreditLine` keeps its tests;
 * what was removed is this page's use of them. In its place, "Learn more"
 * opens the place's own site when the reviewed backfill verified one, and the
 * derived OSM map search when it did not — the seam decides which, and V25 t04
 * carries that decision on the anchor as `data-link-kind` rather than in the
 * label (both kinds read "Learn more"; the action row's note records exactly
 * what that keeps and what it gives up).
 *
 * UPCOMING DROP-INS ARE RADIUS-INDEPENDENT (the pinned decision): the parent
 * asked about THIS place, so the viewer's discovery radius must not filter its
 * own page — a place 30 miles away that you deliberately opened still has
 * drop-ins, and hiding them would make the page lie. Blocks still apply: the
 * one filter that is about people rather than distance. The ordering is the
 * pure sortPlaceUpcoming (soonest first).
 *
 * SIGNED OUT: the place's own public columns render (the 0029 anon SELECT —
 * the reason that grant exists), and the drop-in list does NOT. Not a tease:
 * profiles and neighborhoods carry no anon policy, so an anon drop-in read
 * returns nothing and the list would render "Nothing planned yet" — a claim
 * about the world that we cannot make. The sign-in prompt is the honest
 * version of the same wall the public detail page puts in front of comments.
 *
 * A missing place, and a failed read, are two DIFFERENT states: not-found is
 * permanent (that id is not in the directory), while a failure is the
 * documented DB-not-applied state (0029 not applied yet is exactly PGRST205
 * here) and says so.
 *
 * V8 ticket 09 (migration 0033): the page grows ONE more block — "N families
 * follow this place" (the SECDEF `count_place_followers`, the only sanctioned
 * way a count crosses to another viewer) with the Follow / Unfollow control
 * for the place. A SIGNED-OUT visitor sees NEITHER: the block renders the same
 * sign-in prompt its "Upcoming drop-ins here" section already shows, because
 * the count function is EXECUTE-to-authenticated-only by design (0033's header
 * documents the three reasons — one posture for both counts, a count next to a
 * control a visitor cannot press is decoration, and failing closed keeps the
 * whole directory's follow numbers out of an unauthenticated crawler's reach).
 * The count is an aggregate over a PARK, never per-person data, and no
 * follower LIST exists anywhere for anyone.
 */
export function PlacePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session, loading, profile } = useSessionContext()
  const [place, setPlace] = useState<Place | null>(null)
  const [missing, setMissing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  // null = still loading; [] = signed-out (no read) or nothing upcoming.
  const [posts, setPosts] = useState<PlaydateWithNeighborhood[] | null>(null)
  const [postsError, setPostsError] = useState<string | null>(null)
  /**
   * V9 ticket 05: post id -> the ages of the kids that post's host is bringing
   * (the 0022 playdate_kids selection, projected to `kids.age` ONLY). ONE
   * batched read for the whole list, never one per card. {} (the initial value)
   * = nothing read yet; a failure lands {} too and every card omits its ages line
   * (silently — a card decoration is never worth an error state).
   */
  const [kidAgesByPostId, setKidAgesByPostId] = useState<Record<string, number[]>>({})
  /**
   * v30-6 — did this place's picture fail to load? Component state, like the
   * directory card's: the shared predicate answers the DATA half ("is there a
   * URL"), and a URL that errors falls back to the per-kind illustration here.
   */
  const [photoFailed, setPhotoFailed] = useState(false)
  /**
   * V29 v29-2: this place's posts' going pings, in ONE batched read (never one
   * per card). null = NOT READ — and that is the distinction the card needs:
   * only a settled read may say "No one's going yet". A failed read stays null.
   */
  const [goingPingsByPostId, setGoingPingsByPostId] = useState<Record<string, PingForPost[]> | null>(
    null,
  )
  const [zipCoords, setZipCoords] = useState<ReadonlyMap<string, ZipCoords> | null>(null)
  /**
   * V8 ticket 09 (migration 0033): the place-follow state + the follower
   * COUNT. The count comes from the SECDEF `count_place_followers` RPC
   * (authenticated only) — never a broad read of the follows table, which is
   * owner-only by policy. `null` = not applicable or not loadable: signed out
   * (no count is shown at all — see the section render) or the read failed
   * (pre-0033-apply PGRST205), in which case the line is simply absent and
   * the control reports the truth when pressed.
   */
  const [following, setFollowing] = useState(false)
  const [followerCount, setFollowerCount] = useState<number | null>(null)
  const [followBusy, setFollowBusy] = useState(false)
  const [followError, setFollowError] = useState<string | null>(null)

  useEffect(() => {
    if (id === undefined) return
    let cancelled = false
    setPlace(null)
    setMissing(false)
    setLoadError(null)
    // v30-6: the hero's fallback is per-place state — a failed image on one
    // place must not follow the parent to the next one in the same mount.
    setPhotoFailed(false)
    getPlaceById(id)
      .then((row) => {
        if (cancelled) return
        if (row === null) setMissing(true)
        else setPlace(row)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'Could not load this place.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // The gazetteer, for the "N mi from you" line. A failed load degrades to no
  // distance line at all — never to a guess (the pure seam returns null and the
  // render omits the line, the formatDistanceLabel discipline).
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

  // The drop-ins here. Signed-in only (see the page doc): a signed-out visitor
  // does not issue this read at all, so the page can never render a false
  // "Nothing planned yet".
  useEffect(() => {
    if (loading || session === null || id === undefined) return
    let cancelled = false
    setPosts(null)
    setPostsError(null)
    listPlaceFeed(id, session.user.id)
      .then((rows) => {
        if (!cancelled) setPosts(sortPlaceUpcoming(rows))
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPostsError(err instanceof Error ? err.message : 'Could not load drop-ins here.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [loading, session, id])

  /**
   * V9 ticket 05: the card's age range is the first line of the card's meta on
   * every surface that renders a DropInCard (the AC is about the card, not only
   * the feed), so this page runs the same one label rule over ONE batched read
   * of its own posts.
   */
  useEffect(() => {
    if (posts === null) return
    let cancelled = false
    // No synchronous reset (see UserPage): the map is keyed by post id, so a
    // stale key renders nothing, and the empty object is already the honest
    // "nothing read yet" default — identical to what a failed read lands.
    kidAgesByPostForPosts(posts.map((post) => post.id))
      .then((ages) => {
        if (!cancelled) setKidAgesByPostId(ages)
      })
      .catch(() => {
        if (!cancelled) setKidAgesByPostId({})
      })
    return () => {
      cancelled = true
    }
  }, [posts])

  /**
   * V29 v29-2: the going line's input for this place's posts — one batched read
   * (the same listPingsForPosts the feed uses), grouped by the pure
   * goingPingsByPost.
   *
   * The failure path is deliberately NOT the ages read's: an empty map there
   * only hides a decoration, while here it would be read by the card as "nobody
   * is going" — a claim about a query that never answered. A failed read leaves
   * this null, and the card says nothing.
   */
  useEffect(() => {
    if (posts === null) return
    let cancelled = false
    // Reset BEFORE the read (found by `ocr` on the V29 range, 2026-10-04): a map
    // describing the PREVIOUS posts set must never be read as "loaded" for this
    // one, because `goingPingsLoaded` at the render site is `map !== null`. FeedPage
    // sets this precedent.
    setGoingPingsByPostId(null)
    listPingsForPosts(posts.map((post) => post.id))
      .then((rows) => {
        if (!cancelled) setGoingPingsByPostId(goingPingsByPost(rows))
      })
      .catch(() => {
        if (!cancelled) setGoingPingsByPostId(null)
      })
    return () => {
      cancelled = true
    }
  }, [posts])

  /**
   * V8 ticket 09: the Follow control's state and the follower count, read once
   * per settled place (signed-in only — see the render: a signed-out visitor
   * gets the sign-in prompt, never a count, because the SECDEF count is
   * EXECUTE-to-authenticated-only by design). Both reads are independent and
   * BOTH are best-effort: a failure (pre-0033-apply: PGRST205 on every follows
   * read) leaves the control unpressed and the count line absent, and the page
   * itself is untouched — the place's own data is what this page is for.
   */
  useEffect(() => {
    if (loading || session === null || id === undefined) return
    let cancelled = false
    setFollowError(null)
    getPlaceFollowState(id)
      .then((isFollowing) => {
        if (!cancelled) setFollowing(isFollowing)
      })
      .catch(() => {
        // no-op: the control simply starts unpressed
      })
    countPlaceFollowers(id)
      .then((count) => {
        if (!cancelled) setFollowerCount(count)
      })
      .catch(() => {
        if (!cancelled) setFollowerCount(null)
      })
    return () => {
      cancelled = true
    }
  }, [loading, session, id])

  /**
   * Save / unsave THIS place (the owner-only 0033 row). The DECISION is the
   * pure `planSaveToggle` seam — save or unsave? Execution below goes through
   * db.toggleFollowPlace, never a re-implemented toggle. Saving keeps a place
   * on your shortlist so you can find it again; nothing here promises
   * notifications. The count is re-read after a successful write so "N families
   * have saved {name}" moves with the button that changed it; a failed count
   * re-read leaves the previous number rather than blanking a fact we already
   * had (the ticket-02 count discipline). A failed WRITE reports the designed
   * error line.
   */
  async function handleToggleFollowPlace() {
    if (id === undefined || followBusy) return
    const placeId = id
    // The decision: save or unsave? The pure seam decides; execution below.
    planSaveToggle(following)
    setFollowBusy(true)
    setFollowError(null)
    try {
      const nowFollowing = await toggleFollowPlace(placeId)
      setFollowing(nowFollowing)
      const count = await countPlaceFollowers(placeId).catch(() => null)
      if (count !== null) setFollowerCount(count)
    } catch (err) {
      setFollowError(
        err instanceof Error ? err.message : 'Could not update the save. Try again.',
      )
    } finally {
      setFollowBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  if (loadError !== null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Place</h1>
        <p className="text-sm text-red-600">{loadError}</p>
        <p className="text-xs text-slate-500">
          The places directory may not be set up on the server yet.
        </p>
        <Link to="/browse" className="text-sm font-medium text-indigo-600">
          Back to places
        </Link>
      </div>
    )
  }

  if (missing) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">We couldn’t find this place</h1>
        <p className="text-sm text-slate-600">
          It may have been removed from the directory.
        </p>
        <Link to="/browse" className="text-sm font-medium text-indigo-600">
          Back to places
        </Link>
      </div>
    )
  }

  if (place === null) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  /**
   * V25 t04 — the page's TWO outbound actions, from ONE seam.
   *
   * `learnMore` is V20 t01's chain (the verified operator site, else the
   * derived OSM search, else nothing). `directions` is the SAME `feed.mapsHref`
   * the address link renders — one builder, one binding, so the address and
   * "Get directions" cannot drift. `directions` is null on a place with no
   * address, and the button is then ABSENT rather than a dead link (the feed
   * card's no-address convention).
   */
  const links = placeOutboundLinks(place)
  const ageFit = placeAgeFitLabel(place)
  const distance =
    zipCoords === null
      ? null
      : placeDistanceMiles(place, { homeZip: profile?.home_zip ?? null }, zipCoords)

  /**
   * "Start a drop-in here" — the duplicate-prefill router-state pattern, with
   * the place as the payload: /new's route reads `state.place` and hands the
   * page a typed PlacePrefill (App.tsx NewRoute). It carries the place's id,
   * name, address and neighborhood, so the post lands with the place link and
   * the place's coordinates for distance — and the parent still picks the time,
   * exactly as the ticket pins.
   */
  function startHere() {
    const prefill: PlacePrefill = {
      placeId: place!.id,
      place: place!.name,
      address: place!.address,
      neighborhoodId: place!.neighborhood_id,
    }
    navigate('/new', { state: { place: prefill } })
  }

  // v30-6 — the hero's two facts. The DATA half is the shared pure predicate
  // (the directory card asks the same question); the failed-load half is this
  // page's own state. The credit comes from the one existing formatter.
  const placePhotoUrl = place.photo_url
  const showPlacePhoto = hasPlacePhoto(place) && !photoFailed
  const placePhotoCredit = photoCreditLine(place)

  return (
    <div className="flex flex-col gap-4">
      <div>
        {/* V24 slice 02: the shared back control (the ad-hoc "← Places" link became
            BackControl); the destination lives in the h1 below. */}
        <BackControl to="/browse" />

        {/* v30-6 (founder annotation 6): THE PICTURE RETURNS, ABOVE THE NAME —
            *"a photo of the place above the heading text for every place. I
            think that's the first thing you should see."* Only the back control
            sits above it, because that is navigation, not the page's subject.

            V20 t01 removed this block because he could not maintain 239 images:
            *"I can't police this and fix all the broken images."* What changed is
            that he now CAN — the moderator's place-photo tool (V28 r4, migration
            0062) replaces a picture by link or upload from the place itself. The
            reversal is recorded in docs/adr/0002-place-photos-return.md, because
            a reader who remembers V20 is otherwise right to call this a
            regression; the applied migration that recorded the removal is not
            edited.

            The fallback is the SAME per-kind illustration the directory card
            draws (components/PlaceKindArt) — never a grey frame, and never a
            broken image: a URL that fails falls back on `onError` exactly as the
            card does. The credit travels with the picture, because a Commons
            photo's attribution has to. */}
        <div
          data-testid="place-page-photo-slot"
          className="relative mt-2 h-48 w-full overflow-hidden rounded-2xl bg-slate-100"
        >
          {showPlacePhoto ? (
            <img
              data-testid="place-page-photo"
              src={placePhotoUrl ?? ''}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setPhotoFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <PlaceKindArt kind={place.kind} className="h-16 w-16" />
          )}
          {showPlacePhoto && placePhotoCredit !== null ? (
            <span
              data-testid="place-photo-credit"
              className="absolute bottom-1 right-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/90"
            >
              {placePhotoCredit}
            </span>
          ) : null}
        </div>

        <h1 className="mt-2 text-xl font-semibold text-slate-900">{place.name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {placeKindLabel(place.kind)} · {placeIndoorLabel(place)}
          {distance !== null ? ` · ${formatDistanceLabel(distance)} from your zip` : ''}
        </p>
      </div>

      {/* V25 t04 — THE DESCRIPTION, directly under the name.
          `places.notes` used to render BELOW the map, after the age line. The
          founder's sequence puts the text about the place before its actions
          and before the map, so it moves here. `whitespace-pre-line` is kept
          from the old position: the column is hand-entered multi-line text. */}
      {place.notes !== null ? (
        <p data-testid="place-description" className="whitespace-pre-line text-sm text-slate-700">
          {place.notes}
        </p>
      ) : null}

      {/* V25 t04 — THE TWO ACTIONS, SIDE BY SIDE, ABOVE THE MAP.
          The founder's own pair: *"one that's like, learn more, that does the
          Google search on it, and the other one's like, get directions."* Both
          hrefs come from `placeOutboundLinks` and neither builds a URL here:
          `learnMore` is V20 t01's chain (the operator's verified site when
          there is one, else the derived OSM search — the "Google search" he
          means already existed, so no second search is added), and `directions`
          is the same `feed.mapsHref` the address link below renders.

          "FIND IT ON THE MAP" IS GONE. It sat under the map and told a parent
          to go and find the place they were already looking at: *"This doesn't
          really make sense to me because I can see the map above this button."*
          Both controls stay real anchors (`target="_blank" rel="noopener"`)
          because both leave the app.

          WHAT THE LABEL STILL DECLARES, AND WHAT IT NO LONGER DOES. The
          ticket's surviving honesty channel is the anchor's `data-link-kind`
          (website | map-search), which `e2e/places.e2e.ts` asserts PER KIND
          against the href — so the V20 t01 lie this repo records ("Visit
          website" over a search URL, PlaceMap.tsx) cannot recur: the label no
          longer varies with the kind at all, both read "Learn more". What is
          NOT preserved is the human-facing half of that rule: a parent reading
          "Learn more" cannot tell a verified site from a map search before
          tapping, which the pre-t04 page did disclose in the label. That is the
          ticket's own naming (its two-button criterion names the label
          "Learn more" and names `data-link-kind` as the honesty rule that
          survives the rename), and it is recorded for the orchestrator as an
          open product question rather than quietly settled here: if the
          map-search branch must disclose itself in the LABEL, the wording has
          to include "search" or "map" — and "Find it on the map", the phrase
          the founder rejected, cannot be the one that comes back.

          WHY BOTH ARE OUTLINED AND NEITHER IS FILLED: this page's one primary
          action is "Start a drop-in here" (see the card below), and a filled
          button here would be an equal-weight peer competing with it.

          THE ROW WRAPS RATHER THAN SHRINKS: `flex-wrap` with a `basis-36` floor
          and `whitespace-nowrap` keeps each control at or above the 44px tap
          floor (min-h-11) at 320px, where the two no longer fit on one line.
          The V25 t04 spec measures both at 320px and pins the absence of
          horizontal overflow. */}
      <div data-testid="place-actions" className="flex flex-wrap gap-2">
        {links.learnMore !== null ? (
          <a
            href={links.learnMore.url}
            target="_blank"
            rel="noopener"
            data-testid="place-learn-more"
            data-link-kind={links.learnMore.kind}
            className="inline-flex min-h-11 flex-1 basis-36 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-indigo-300 bg-white px-4 py-3 text-sm font-medium text-indigo-700 outline-none transition-colors motion-reduce:transition-none hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {/* The outbound arrow — decorative; the accessible name is the
                label. Same stroked 24px family as the rest of the app. */}
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
            </svg>
            Learn more
          </a>
        ) : null}
        {links.directions !== null ? (
          <a
            href={links.directions}
            target="_blank"
            rel="noopener"
            data-testid="place-get-directions"
            className="inline-flex min-h-11 flex-1 basis-36 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-indigo-300 bg-white px-4 py-3 text-sm font-medium text-indigo-700 outline-none transition-colors motion-reduce:transition-none hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {/* The map pin (the shared NAV_ICONS family) — decorative. */}
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={NAV_ICONS.nearby} />
            </svg>
            Get directions
          </a>
        ) : null}
      </div>

      {/* V25 t04 — THE LOCATION BLOCK, after the actions: the address (still the
          tappable Google Maps link the detail page uses) and then the map it
          points at. The address link renders from the SAME `links.directions`
          binding as "Get directions", so the two cannot drift apart. */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-slate-700">
          {links.directions !== null ? (
            <a
              href={links.directions}
              target="_blank"
              rel="noopener"
              className="font-medium text-indigo-600 hover:underline"
            >
              {place.address}
            </a>
          ) : (
            place.address
          )}
        </p>
        {/* V12 t05: where this place IS — the shared Leaflet + OpenStreetMap
            map, from stored coordinates only (the place's own lat/lng, else the
            gazetteer's coordinates for the zip in its address). No
            coordinates at all → nothing renders (0029's rule: no fake pin),
            and the map never uses a browser location API (the ticket's invariant). */}
        <PlaceMap place={place} zipCoords={zipCoords} className="mt-3" />
        {/* The age line states the data we have and NOTHING more: when the
            directory carries no age range, the page stays silent rather than
            implying "all ages" — a claim the data would not support (V11 t03). */}
        {ageFit !== null ? (
          <p className="mt-2 text-sm text-slate-600">{ageFit}</p>
        ) : null}
      </div>

      {/* V8 ticket 09 (migration 0033): the place's SAVED state — the COUNT (via
          the SECDEF RPC, never a broad read of the owner-only follows table) and
          the Save / Saved control. Saving keeps a place on your shortlist so you
          can find it again — that is the benefit stated plainly; nothing here
          promises notifications. Signed out: the same sign-in prompt the drop-ins
          section uses, and NO count (see the page doc for why the public route
          shows none). */}
      <div className="flex flex-col gap-2">
        {session === null ? (
          <>
            <p className="text-sm text-slate-600">Saving a place is for signed-in parents.</p>
            <Link
              to="/login"
              className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-indigo-600"
            >
              Sign in to save it
            </Link>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-700" data-testid="place-followers">
              {followerCount === null
                ? 'Save this place'
                : placeFollowerLine(followerCount, place.name)}
            </p>
            <button
              type="button"
              data-testid="follow-place"
              aria-pressed={following}
              disabled={followBusy}
              onClick={() => void handleToggleFollowPlace()}
              className={
                'inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-base font-medium outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 ' +
                (following
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-indigo-300 bg-white text-indigo-700')
              }
            >
              {/* The pressed state is conveyed by MORE THAN colour: the bookmark
                  glyph fills when saved (stroked otherwise) AND the label flips
                  Save → Saved. The glyph is decorative (aria-hidden); the button's
                  accessible name comes from its text content. */}
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-5 w-5"
                fill={following ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={NAV_ICONS.bookmark} />
              </svg>
              {followBusy
                ? 'Updating…'
                : following
                  ? `Saved ${place.name}`
                  : `Save ${place.name}`}
            </button>
          </div>
        )}
        {followError !== null ? (
          <p data-testid="place-follow-error" className="mt-2 text-sm text-red-600">
            {followError}
          </p>
        ) : null}
        {session !== null && followerCount === null && followError === null ? (
          <p className="mt-2 text-xs text-slate-500">
            Saving a place keeps it on your shortlist — you'll find it with your
            saved places on the Places page.
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
        <button
          type="button"
          data-testid="start-here"
          onClick={startHere}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors motion-reduce:transition-none hover:bg-indigo-500"
        >
          Start a drop-in here
        </button>
        <p className="mt-2 text-xs text-indigo-700">
          Fills this place in on the post form — you pick the time.
        </p>
        {/* V23 slice 4/5: the forward door to the RESEARCH page. The founder
            asked for a "Details" action beside "Start a drop-in", and this is
            the place page's own instance of it. It is a real <Link> (not a
            button) because it navigates, and the path comes from
            `placeDetailsPath` so this surface, the map popup and the picker's
            selection panel cannot drift to different destinations.

            It sits INSIDE this card rather than as a peer full-width button:
            "Start a drop-in" is the one action this page exists to offer, and an
            equal-weight button beside it would split that choice. The label says
            what the page HOLDS rather than "Details" — a bare "Details" on a
            page that is itself a place's detail page reads as a link to nowhere.
            min-h-11 keeps it at the 44px tap floor even though it is a link. */}
        <Link
          to={placeDetailsPath(place.id)}
          data-testid="place-more-details"
          className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-indigo-700 underline-offset-2 hover:underline"
        >
          What parents say about this place →
        </Link>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Upcoming drop-ins here
        </h2>
        {session === null ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-slate-600">Drop-ins are for signed-in parents.</p>
            <Link to="/login" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-indigo-600">
              Sign in to see them
            </Link>
          </div>
        ) : postsError !== null ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-red-600">{postsError}</p>
          </div>
        ) : posts === null ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-600 shadow-sm">
            Loading…
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-slate-600">
              Nothing planned here yet — start the first one.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {posts.map((post) => (
              <DropInCard
                key={post.id}
                playdate={post}
                nowIso={new Date().toISOString()}
                ageRangeLabel={cardAgeRangeLabel(post, kidAgesByPostId[post.id] ?? [])}
                goingPings={goingPingsByPostId?.[post.id] ?? []}
                goingPingsLoaded={goingPingsByPostId !== null}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
