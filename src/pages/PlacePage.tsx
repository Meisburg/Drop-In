import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BackControl } from '../components/BackControl'
import { DropInCard, HostAvatar } from '../components/DropInCard'
import { PlaceMap } from '../components/PlaceMapLazy'
import { PlaceKindArt } from '../components/PlaceKindArt'
import { PlaceRatingLine } from '../components/PlaceRatingLine'
import { ModalShell } from '../components/ModalShell'
import { PlacePhotoAdmin } from '../components/PlacePhotoAdmin'
import { ReviewForm } from '../components/ReviewForm'
import { useSessionContext } from '../components/SessionProvider'
import { usePrefersReducedMotion } from '../components/usePrefersReducedMotion'
import { NAV_ICONS, PLACE_KIND_ICONS } from '../components/icons'
import { scrollBehaviorFor } from '../lib/mapStrip'
import {
  countPlaceFollowers,
  getPlaceById,
  getPlaceFollowState,
  getReviewSummary,
  kidAgesByPostForPosts,
  listPingsForPosts,
  listPlaceFeed,
  listPlaceReviews,
  loadZipCodes,
  toggleFollowPlace,
  type PingForPost,
  type ReviewSummaryRow,
} from '../lib/db'
import { cardAgeRangeLabel, formatDistanceLabel, goingPingsByPost } from '../lib/feed'
import type { ZipCoords } from '../lib/feed'
import { placeFollowerLine, planSaveToggle } from '../lib/follows'
// v30-9: the ONE moderator predicate the /mod route guard also reads.
import { canModerate } from '../lib/moderation'
import { MODAL_OVER_LEAFLET_Z_CLASS } from '../lib/stacking'
import {
  photoCreditLine,
  placePhotoNeedsReview,
  placePhotoVisibleTo,
  placeAgeFitLabel,
  placeDistanceMiles,
  placeHasCoffeeNearby,
  placeIndoorLabel,
  placeKindLabel,
  placeDetailsPath,
  placeOutboundLinks,
  sortPlaceUpcoming,
} from '../lib/places'
import type { Place, PlacePrefill, PlaydateWithNeighborhood } from '../lib/types'
// reviews-inline: every decision the inline block makes is a pure seam here —
// the compose button's label, whether the viewer has already reviewed this
// place, which rows show, and the honest sentence when there is nothing to show.
import {
  INLINE_REVIEW_LIMIT,
  hasReviewed,
  inlineReviewHighlights,
  inlineReviewsEmptyLine,
  reviewComposeLabel,
  type ReviewWithAuthor,
} from '../lib/reviews'

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
 * currently unowned; see the V20 note at the photo slot). The rating and a few
 * review bodies NOW LIVE HERE TOO (the reviews-inline slice; see the block's
 * own note above the section) — his annotation on the old "What parents say
 * about this place →" link asked for exactly that — and the FULL wall and the
 * comment thread stay on the research page, which the link at the bottom of
 * this page still reaches (relabelled to name what it adds). He also
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
   *
   * V30 batch close (2026-10-05): the failure is keyed to the URL THAT FAILED,
   * not to the component. A boolean pinned it to the mount, so after a moderator
   * replaced a dead picture the hero kept drawing the illustration — the save
   * looked like it had not worked (found by v30-9 against the live row whose
   * seattle.gov URL 404s). Derived state, no effect: a new URL is simply not the
   * one that failed.
   */
  const [photoFailedUrl, setPhotoFailedUrl] = useState<string | null>(null)
  /**
   * v30-9 — the moderator's photo editor, the SAME one /mod and the directory
   * card mount. It lives here so the fix can start from the place the moderator
   * is looking at, which is the founder's complaint verbatim.
   *
   * KEYED BY PLACE ID, not a boolean (v30-10 `ocr` finding, medium): a boolean
   * survived a same-mount A → B navigation, so the dialog re-appeared over the
   * NEW place with the OLD url still in the field, and a moderator could save a
   * photo onto a row they never opened it on. Deriving openness from the id
   * closes it on navigation and keeps it open across a same-place re-read —
   * without an effect that sets state during render (which the lint rule bans).
   */
  const [photoEditorForId, setPhotoEditorForId] = useState<string | null>(null)
  const photoEditorOpen = photoEditorForId !== null && photoEditorForId === id
  /**
   * v30-9 — bumping this re-reads the place, so the hero shows the photo that
   * was just written. The page's row is its own read; a locally patched URL
   * would be a second source of truth for `places.photo_url`.
   */
  const [placeReloadTick, setPlaceReloadTick] = useState(0)
  /**
   * place-photo-crop slice 4 — after the editor closes, the hero is brought back
   * into view (the founder: *"Ideally, it would show you that place
   * automatically so you don't have to scroll down and find it, but whatever."*)
   * and, when a host refused the copy, one sentence says so. The sentence cannot
   * live in the editor: the editor unmounts on save.
   */
  const [photoNotice, setPhotoNotice] = useState<string | null>(null)
  const [pendingPhotoScroll, setPendingPhotoScroll] = useState(false)
  const photoSlotRef = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  // The pure rule decides what the preference MEANS (src/lib/mapStrip.ts); this
  // page only reads it, exactly as the directory does.
  const photoScrollBehavior = scrollBehaviorFor(reducedMotion)

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

  /**
   * reviews-inline — WHAT PARENTS SAY, ON THIS PAGE.
   *
   * The founder, annotated on the link this page used to send parents away on:
   * *"Why would this link to a separate page? Like, wouldn't you see what
   * parents say about this place and they're rating right here? And then you
   * have the option to click on something to leave a review And I think that
   * review should be like a modal that gets light boxed in where you just
   * leave the review"*. So the block below renders the aggregate (the 0052
   * review_summary RPC — the same read the details page does) plus up to
   * INLINE_REVIEW_LIMIT bodies from the same `reviews` rows the wall reads, and
   * ONE button opens the existing ReviewForm inside ModalShell.
   *
   * `reviewRows === null` means NOT READ or the read failed, and the two are
   * deliberately the same rendering (nothing): a failed read must never be
   * shown as "no one has reviewed this place", which is a claim about the
   * world. The empty state therefore keys on a SETTLED read (`reviewRows !==
   * null`) with no bodies to show, and its sentence takes the aggregate count
   * so a place with ratings-but-no-words is not told it has no reviews.
   */
  const [reviewRows, setReviewRows] = useState<ReviewWithAuthor[] | null>(null)
  const [reviewSummary, setReviewSummary] = useState<ReviewSummaryRow | null>(null)
  /** Keyed by place id, not a boolean — a same-mount A → B navigation closes it (the photo editor's lesson). */
  const [composeForId, setComposeForId] = useState<string | null>(null)
  /** Bumped after a save: the page re-reads its own rows rather than patching a copy. */
  const [reviewsReloadTick, setReviewsReloadTick] = useState(0)

  useEffect(() => {
    if (id === undefined) return
    let cancelled = false
    // v30-9: a re-read of the SAME place (a moderator just replaced its photo)
    // keeps the row on screen. Slice 4 gave that a second reason: the scroll that
    // brings the hero back into view has no node to move if the re-read blanks the
    // page, and the hero keeps its 2:1 box so nothing the moderator was looking at
    // jumps. (v30-9's original reason — not throwing away the editor's own "Photo
    // updated." line — is gone with that line: the editor now closes on save.)
    // Navigating to a DIFFERENT place still clears, exactly as before.
    setPlace((current) => (current !== null && current.id === id ? current : null))
    setMissing(false)
    setLoadError(null)
    // v30-6: the hero's fallback is per-place state — a failed image on one
    // place must not follow the parent to the next one in the same mount. Two
    // places CAN share one URL (a duplicated seeded photo), so the URL key alone
    // would carry the failure across; this clears it on the id change too.
    setPhotoFailedUrl(null)
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
  }, [id, placeReloadTick])

  /**
   * place-photo-crop slice 4, change 3 — bring the hero back into view once the
   * editor has closed. It runs AFTER the modal's own cleanup has released the
   * page's scroll lock (React flushes the deleted subtree's effect cleanups
   * before the new effects of the same commit), so this scroll is not fought by
   * `body { overflow: hidden }`.
   *
   * The retry key is `place`: a same-place re-read keeps the row on screen, but
   * the slot is not rendered at all until the read has landed, and a scroll
   * attempted before that has no node to move.
   */
  useEffect(() => {
    if (!pendingPhotoScroll) return
    const node = photoSlotRef.current
    if (node === null) return
    node.scrollIntoView({ block: 'center', behavior: photoScrollBehavior })
    setPendingPhotoScroll(false)
  }, [pendingPhotoScroll, place, photoScrollBehavior])

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
   * reviews-inline — the page's OWN review read: the rows the inline block
   * shows and the aggregate the rating line prints. Two independent reads, both
   * best-effort and both contained here (the details page's discipline): a
   * failure leaves its own value null, so a 0052-not-applied state renders no
   * rating line and no empty sentence rather than a 0.0 or an error card.
   *
   * Re-read on `reviewsReloadTick` (the page's photo re-read precedent) rather
   * than patched locally: after a save the row we render is the row the
   * database returned.
   */
  useEffect(() => {
    if (loading || session === null || id === undefined) return
    let cancelled = false
    ;(async () => {
      try {
        const rows = await listPlaceReviews(id)
        if (!cancelled) setReviewRows(rows)
      } catch {
        // Not read ≠ nobody reviewed it: render no rows and no empty sentence.
        if (!cancelled) setReviewRows(null)
      }
    })()
    ;(async () => {
      try {
        const summary = await getReviewSummary(id)
        if (!cancelled) setReviewSummary(summary)
      } catch {
        // Pre-0052-apply / transient: no rating line at all (never "0.0 out of 5").
        if (!cancelled) setReviewSummary(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, loading, session, reviewsReloadTick])

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
  //
  // slice 5: the DATA half is viewer-aware. A tier-2 sourcing fill is stored on
  // the row so the moderator can judge it, and a parent sees the per-kind
  // illustration instead until it is confirmed — exactly what these rows show
  // today, so nothing regresses while the review is pending.
  const isModeratorViewer = canModerate(profile)
  const placePhotoUrl = place.photo_url
  const showPlacePhoto =
    placePhotoVisibleTo(place, isModeratorViewer ? 'moderator' : 'parent') &&
    photoFailedUrl !== placePhotoUrl
  const photoNeedsReview = placePhotoNeedsReview(place)
  const placePhotoCredit = photoCreditLine(place)

  // reviews-inline — the block's decisions, ALL from the pure seams (no `if`
  // above the JSX decides a rule): who counts as "you have reviewed this", the
  // button's one label, which bodies show and how many, and the honest sentence
  // when none do. The modal is open only for THIS place id, so navigating to
  // another place closes it instead of re-opening over the new one.
  const composeOpen = composeForId !== null && composeForId === place.id
  const hasMine = hasReviewed(reviewRows ?? [], profile === null ? null : profile.id)
  const composeLabel = reviewComposeLabel(hasMine)
  const reviewHighlights =
    reviewRows === null ? [] : inlineReviewHighlights(reviewRows, INLINE_REVIEW_LIMIT)
  const reviewCount = reviewSummary?.review_count ?? reviewRows?.length ?? 0
  const reviewsEmptyLine = inlineReviewsEmptyLine(reviewCount, place.name)

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
            photo's attribution has to.

            place-photo-crop slice 3 (2026-10-05): the slot's height used to be
            `h-48`, which measured 358×192 at 390px, 664×192 at 768px and
            740×192 at 844px (this column is `max-w-md md:max-w-3xl`) — 1.86:1
            climbing to 3.85:1, so `object-cover` re-cropped whatever the
            moderator framed. It now carries the STORED shape
            (`PLACE_PHOTO_SIZE`, 1400×700), which makes the crop window and this
            surface the same 2:1 rectangle at every width. */}
        <div
          ref={photoSlotRef}
          data-testid="place-page-photo-slot"
          className="relative mt-2 aspect-[2/1] w-full overflow-hidden rounded-2xl bg-slate-100"
        >
          {showPlacePhoto ? (
            <img
              data-testid="place-page-photo"
              src={placePhotoUrl ?? ''}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setPhotoFailedUrl(placePhotoUrl)}
              className="h-full w-full object-cover"
            />
          ) : (
            <PlaceKindArt kind={place.kind} className="h-16 w-16" />
          )}
          {/* slice 5 — the moderator's review checklist, on the picture itself. */}
          {photoNeedsReview && isModeratorViewer ? (
            <span
              data-testid="place-photo-review"
              className="absolute left-2 top-2 rounded bg-amber-100/95 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 shadow-sm"
            >
              review
            </span>
          ) : null}
          {showPlacePhoto && placePhotoCredit !== null ? (
            <span
              data-testid="place-photo-credit"
              className="absolute bottom-1 right-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/90"
            >
              {placePhotoCredit}
            </span>
          ) : null}
          {/* v30-9 — the moderator's way in, on the surface where the wrong or
              missing picture is actually seen. It sits on the picture's
              top-right, the corner the credit chip does not use, and renders
              ONLY for a moderator: the same canModerate the /mod guard reads. */}
          {canModerate(profile) ? (
            <button
              type="button"
              data-testid="place-edit-photo"
              aria-label={`Edit the photo for ${place.name}`}
              onClick={() => setPhotoEditorForId(place.id)}
              className="absolute right-2 top-2 inline-flex min-h-11 items-center rounded-full border border-slate-300 bg-white/95 px-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition-colors motion-reduce:transition-none hover:bg-white focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Edit photo
            </button>
          ) : null}
        </div>

        {/* place-photo-crop slice 4 — the editor's one sentence, after it closes.
            `role="status"` rather than `role="alert"`: the write succeeded (the
            photo is on the hero), so this is a report. Only the link fallback
            sets it; a save that framed the photo leaves it null, because the new
            picture above IS the confirmation. */}
        {photoNotice !== null ? (
          <p
            role="status"
            data-testid="place-photo-notice"
            className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
          >
            {photoNotice}
          </p>
        ) : null}

        <h1 className="mt-2 text-xl font-semibold text-slate-900">{place.name}</h1>
        {/* V34 slice D — THE PLACE'S OWN ATTRIBUTES, AS PILLS.
            The founder, anchored on this block: *"The same filters that were
            used on the places page to get to this place could be populated here
            and be shown in the same way in pill form to show like these pills
            represent this place, so like coffee nearby, outdoor, playground."*

            The pills reuse the directory filter row's ANATOMY verbatim
            (`whitespace-nowrap`, `shrink-0`, `rounded-full`, `px-4`,
            `text-sm font-medium`, the same slate border and white ground) and
            come from the SAME label seams the directory chips read
            (`placeKindLabel`, `placeIndoorLabel`) — so a kind cannot be worded
            one way in the filter row and another way here. */}
        <ul
          data-testid="place-pill-row"
          className="mt-2 flex flex-wrap gap-2 list-none p-0"
          aria-label="About this place"
        >
          {/* The kind is `not null` on the row (0029's CHECK), so this pill
              always renders; the seam is still what decides its word. */}
          <li
            data-testid="place-pill-kind"
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-700"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-slate-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={PLACE_KIND_ICONS[place.kind] ?? PLACE_KIND_ICONS.other} />
            </svg>
            {placeKindLabel(place.kind)}
          </li>
          {/* The indoor/outdoor pill is its own WORD and nothing else — the
              seam's output, verbatim. ⚠️ AN EARLIER DRAFT OF THIS SLICE PUT THE
              KIND'S TEXT IN AN `sr-only` SPAN INSIDE THIS PILL, trying to keep
              `places.e2e.ts`'s old `getByText('Playground · Outdoor')` joined
              string alive while the visible row read as two labels. That was
              WRONG on both counts, and the spec caught it:

                - the joined literal was never asserted outside that one old
                  line, which this slice replaces with per-pill assertions (the
                  brief's rule: assert the pills, which are the facts);
                - the `sr-only` text made this pill's text content
                  "Playground · Outdoor", so the natural, correct assertion
                  `toHaveText('Outdoor')` failed — the hack broke the very
                  surface it was meant to serve.

              The two facts live in two pills, each carrying its own seam's
              word. Nothing is announced twice. */}
          <li
            data-testid="place-pill-indoor"
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-700"
          >
            {placeIndoorLabel(place)}
          </li>
          {/* ☕ THE THREE-VALUED COLUMN, AND WHY ONLY `true` RENDERS.
              `places.coffee_nearby` is three-valued on purpose: `true` (OSM was
              asked and a cafe is near), `false` (asked, none found) and `null`
              (NEVER ASKED — what every pre-0068 row carries). A `false` or
              `null` place gets NO pill at all: a pill reading "No coffee
              nearby" would state something the `null` rows never established,
              and even for `false` a badge about an absence is not an attribute a
              parent filtering by "coffee nearby" was ever shown. The predicate
              is the EXISTING pure seam — never a second copy of `=== true` in a
              render site. */}
          {placeHasCoffeeNearby(place) ? (
            <li
              data-testid="place-pill-coffee"
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-700"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-amber-700"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 8h13v5.5A4.5 4.5 0 0 1 12.5 18h-4A4.5 4.5 0 0 1 4 13.5V8Z M17 9.5h1.6a2.6 2.6 0 0 1 0 5.2H17 M3.5 21h14" />
              </svg>
              Coffee nearby
            </li>
          ) : null}
        </ul>
        {/* V34 slice D — THE META LINE'S KIND · INDOOR IS GONE FROM HERE AND
            NOW LIVES IN THE PILLS ABOVE. Leaving both would print the same two
            words twice in the space of forty pixels (the founder's *"the same
            filters … shown in the same way in pill form"* — a pill REPLACES the
            sentence, it does not join it).

            ⚠️ WHAT THE DISTANCE LINE MUST DO ABOUT THAT, because the two rules
            have to hold together: a bare `${distance}` interpolation would
            render an EMPTY `<p>` on a place with no distance (lat/lng NULL, or
            the gazetteer not loaded), silently dropping "· from your zip" with
            it. So the paragraph renders ONLY when there IS a distance. The pill
            row above already carries the kind and indoor facts at every width,
            so nothing is lost by the swap; what would be lost is the sentence's
            own honesty about which fact it is stating.

            The spec that asserted the OLD joined line on this page —
            `getByText('Playground · Outdoor')` in `e2e/places.e2e.ts` ("a place
            page renders the seeded data") — was corrected in the same diff to
            assert the two pills, because the two facts are still on the page,
            just no longer as one string. */}
        {distance !== null ? (
          <p className="mt-1 text-sm text-slate-600">
            {formatDistanceLabel(distance)} from your zip
          </p>
        ) : null}
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

      {/* reviews-inline — WHAT PARENTS SAY, RIGHT HERE, with ONE compose door.
          The founder's annotation on the link this page used to send parents
          away on is the spec: *"wouldn't you see what parents say about this
          place and they're rating right here? And then you have the option to
          click on something to leave a review And I think that review should be
          like a modal that gets light boxed in"*.

          It sits between the save row and "Start here" — after the parent has
          seen the place's own facts, before the one action this page exists to
          offer. The rating line is the SAME element the research page renders
          (components/PlaceRatingLine.tsx); the rows are the SAME `reviews` rows
          the wall reads (db.listPlaceReviews, newest first), projected by the
          pure inlineReviewHighlights, so the two surfaces cannot disagree about
          a parent's own review.

          SIGNED OUT: the section keeps the page's own posture (the save row and
          the drop-in list both do this) — an honest prompt and a sign-in link,
          no aggregate, no rows and NO compose control. `/place/:id` is a PUBLIC
          route (V8 ticket 07: `isPublicPlacePath` in lib/auth.ts), so a
          signed-out visitor really does reach this page, and the V24 ruling
          covers a SIGNED-IN parent reading other parents' words. An anon read
          would be a different product decision and a migration, so the review
          reads are not even issued without a session (the effect above returns
          early) and nothing about them renders here. A compose button that
          could only ever say "Sign in to leave a review" is the dead control the
          page's other sections deliberately do not offer. */}
      <section data-testid="place-reviews" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          What parents say
        </h2>

        {session === null ? (
          <>
            <p className="text-sm text-slate-600">Reviews are for signed-in parents.</p>
            <Link
              to="/login"
              className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-indigo-600"
            >
              Sign in to read them
            </Link>
          </>
        ) : (
          <>
            {/* The aggregate, from the DATABASE (the 0052 review_summary RPC). A
                failed/absent summary renders nothing — never a 0.0. */}
            {reviewSummary !== null ? (
              <PlaceRatingLine
                summary={reviewSummary}
                placeName={place.name}
                className="flex items-center gap-2"
              />
            ) : null}

            {reviewHighlights.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {reviewHighlights.map((review) => (
                  <li
                    key={review.authorProfileId}
                    data-testid={`place-review-row-${review.authorProfileId}`}
                    className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    {/* A commented review: the row only exists because there are
                        words (the pure projection drops stars-only rows). */}
                    <p className="text-sm text-slate-800">{review.body?.trim()}</p>
                    {/* V35 slice A (`muzk8c1g`) — THE REVIEWER'S FACE, LEFT OF
                        THEIR NAME.
                        The founder's ruling, verbatim: *"in a message thread,
                        show the other person's profile photo in a circle to the
                        LEFT of their name. That is the conventional messaging
                        pattern."* He wants that pattern here too.

                        THE PRIMITIVE IS REUSED, NOT COPIED OR EDITED: this is
                        the app's one avatar (`HostAvatar`, `DropInCard.tsx`) —
                        the same circle the feed card, the comment row and the
                        follow list draw. It already owns the 40px box, the
                        `rounded-full` crop, the `onError` suppression of a dead
                        URL, and the initial-placeholder fallback below, so the
                        reviewer row inherits all four rather than re-deciding
                        them.

                        ⚠️ THE `host` SHAPE IS THE PRIMITIVE'S CONTRACT, and the
                        two fields it needs are the two the review read already
                        has (`authorDisplayName`, `authorAvatarUrl`). The `id` is
                        the reviewer's profile id — it is the primitive's key, not
                        a second identity for the row (the row is already keyed on
                        `authorProfileId`). */}
                    <div className="mt-1 flex items-center gap-2">
                      {/* ⚠️ THE `review-avatar` TESTID LIVES ON A WRAPPER, NOT ON
                          THE PRIMITIVE. `HostAvatar` is the app's one avatar and
                          this slice must not edit it (the brief's rule), so it
                          cannot grow a testid of its own. The wrapper is the
                          row's addressable handle on the avatar; it adds no
                          markup the primitive does not already draw — no second
                          circle, no second box. */}
                      <span data-testid="review-avatar" className="flex shrink-0 items-center">
                        <HostAvatar
                          host={{
                            id: review.authorProfileId,
                            display_name: review.authorDisplayName,
                            avatar_url: review.authorAvatarUrl,
                          }}
                          size="sm"
                        />
                      </span>
                      {/* THE NAME LINKS TO THAT PERSON'S PROFILE.
                          `/u/<handle>` is the route this app already uses for
                          exactly this (see `FollowingSection`, `ProfileView`,
                          `PlaydateDetailPage`), and it needs no new column: the
                          handle a `/u/:handle` URL carries IS
                          `profiles.display_name` (`getProfileByHandle` matches
                          `.eq('display_name', handle)` in `src/lib/db.ts`), which
                          is the `authorDisplayName` this row already renders.
                          The brief's "reuse the route that already exists; BLOCKED
                          rather than invent one" is therefore satisfied with no
                          invented route — and no invented handle column.

                          A nameless profile keeps the SAME words it always had
                          ("A parent") but does NOT become a link: `/u/` with an
                          empty segment resolves nothing, and a link to a page
                          that cannot load is the dead control this repo's other
                          surfaces refuse to render. */}
                      {review.authorDisplayName.trim() === '' ? (
                        <span className="text-xs text-slate-500">A parent</span>
                      ) : (
                        <Link
                          to={`/u/${encodeURIComponent(review.authorDisplayName)}`}
                          data-testid="review-author-link"
                          className="text-xs font-medium text-indigo-600 hover:underline"
                        >
                          {review.authorDisplayName}
                        </Link>
                      )}
                      <span className="text-xs text-slate-500">
                        {review.score} star{review.score === 1 ? '' : 's'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : reviewRows !== null ? (
              // Only a SETTLED read may say nobody has written anything — and the
              // sentence takes the aggregate count, so ratings-without-words are
              // reported as exactly that (the pure inlineReviewsEmptyLine).
              <p data-testid="place-reviews-empty" className="text-sm text-slate-600">
                {reviewsEmptyLine}
              </p>
            ) : null}

            {/* ONE compose control, one label, 44px, opening the lightboxed
                modal. Outlined rather than filled: this page's one primary
                action is "Start a drop-in here" below. */}
            <button
              type="button"
              data-testid="place-review-compose-btn"
              aria-haspopup="dialog"
              onClick={() => setComposeForId(place.id)}
              className="inline-flex min-h-11 items-center justify-center self-start rounded-xl border border-indigo-300 bg-white px-4 text-sm font-medium text-indigo-700 outline-none transition-colors motion-reduce:transition-none hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {composeLabel}
            </button>
          </>
        )}
      </section>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
        <button
          type="button"
          data-testid="start-here"
          onClick={startHere}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors motion-reduce:transition-none hover:bg-indigo-500"
        >
          Host a drop-in here
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

            reviews-inline slice: THE LABEL STOPPED PROMISING WHAT IS NOW
            INLINE. It read "What parents say about this place →", which became
            a lie the moment the block above started showing what parents say —
            it sent a parent away to read something they were already looking
            at, which is precisely the confusion the founder's annotation
            expressed ("Why would this link to a separate page?"). The RULING is
            to keep the door and relabel it to name what the research page
            ADDS: the full review wall, the comment thread, hours and the web
            search. The test id is kept byte-for-byte (nothing selected it
            before this slice, so keeping it costs nothing and dropping it would
            break the one handle a spec could adopt). The MAP POPUP's
            `placeDetailsPath` link is deliberately NOT touched: the popup has
            no inline summary, so that door is still its only one.

            It sits INSIDE this card rather than as a peer full-width button:
            "Start a drop-in" is the one action this page exists to offer, and an
            equal-weight button beside it would split that choice.
            min-h-11 keeps it at the 44px tap floor even though it is a link. */}
        <Link
          to={placeDetailsPath(place.id)}
          data-testid="place-more-details"
          className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-indigo-700 underline-offset-2 hover:underline"
        >
          All reviews and comments →
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

      {/* reviews-inline — the ONE compose door, lightboxed on the shell the
          whole app uses. It contains the EXISTING ReviewForm (one review per
          parent per place; the form loads the parent's own row and the same
          submit replaces it) and nothing about that form's logic is rewritten:
          the only addition is `onSaved`, which closes this modal and makes the
          page re-read its own rows, so the new review appears inline without a
          reload. There is no second `review-form` anywhere on this page — the
          modal is its only mount here, which is what a spec's `toHaveCount(1)`
          pins.

          `place-review-modal-close` is pinned explicitly (the shell otherwise
          derives `${testId}-dismiss`) because this is the way OUT of the
          lightbox and the id the spec asks for by name. The Leaflet z-class is
          the same one the photo editor passes: this page draws a map, and a
          dialog under it is the defect lib/stacking.ts records. */}
      {composeOpen ? (
        <ModalShell
          title={composeLabel}
          testId="place-review-modal"
          dismissTestId="place-review-modal-close"
          zClass={MODAL_OVER_LEAFLET_Z_CLASS}
          onDismiss={() => setComposeForId(null)}
          dismissLabel="Close"
        >
          <div data-testid="review-form" className="mt-3">
            <ReviewForm
              placeId={place.id}
              onSaved={() => {
                setComposeForId(null)
                setReviewsReloadTick((tick) => tick + 1)
              }}
            />
          </div>
        </ModalShell>
      ) : null}

      {/* v30-9 — the SHARED editor, opened from this page's picture. Same
          ModalShell and same PlacePhotoAdmin the directory card and /mod mount:
          one editor, three doors, never a second copy. The re-read is the
          page's own load, so the hero shows what was written. */}
      {photoEditorOpen ? (
        <ModalShell
          title="Fix a place photo"
          testId="place-photo-editor"
          /* THIS PAGE HAS A LEAFLET MAP. At the shell's default z-50 the map's
             own controls (z-index 1000) paint over the dialog — the exact defect
             lib/stacking.ts records as having shipped before, and what the
             batch-close `ocr` lane caught here. */
          zClass={MODAL_OVER_LEAFLET_Z_CLASS}
          onDismiss={() => setPhotoEditorForId(null)}
          dismissLabel="Close"
        >
          <PlacePhotoAdmin
            place={place}
            onSaved={(notice) => {
              /**
               * place-photo-crop slice 4 — FINISHING CLOSES THE EDITOR, and the
               * page re-reads its own row behind the closed dialog so the hero
               * shows the photo that was just written.
               *
               * The scroll flag is what carries the founder's "show you that
               * place automatically": closing alone can leave the hero above the
               * viewport the moderator is scrolled to.
               */
              setPhotoEditorForId(null)
              setPhotoNotice(notice ?? null)
              setPendingPhotoScroll(true)
              setPlaceReloadTick((tick) => tick + 1)
            }}
          />
        </ModalShell>
      ) : null}
    </div>
  )
}
