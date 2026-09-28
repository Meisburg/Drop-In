import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BackControl } from '../components/BackControl'
import { DropInCard } from '../components/DropInCard'
import { ReviewForm } from '../components/ReviewForm'
import { useSessionContext } from '../components/SessionProvider'
import { NAV_ICONS } from '../components/icons'
import {
  countPlaceFollowers,
  createPlaceComment,
  getPlaceById,
  getPlaceFollowState,
  getReviewSummary,
  kidAgesByPostForPosts,
  listPlaceComments,
  listPlaceDropInProofs,
  listPlaceFeed,
  loadZipCodes,
  toggleFollowPlace,
  type PlaceCommentRow,
  type ReviewSummaryRow,
} from '../lib/db'
import { cardAgeRangeLabel, formatDistanceLabel, mapsHref } from '../lib/feed'
import type { ZipCoords } from '../lib/feed'
import { placeFollowerLine, planSaveToggle } from '../lib/follows'
import { hoursSourceNote, hoursStatus } from '../lib/placeHours'
import { dropInProofLine, type PlaceDropInProof } from '../lib/placeSocial'
import { reviewRatingLine, REVIEW_SCORE_MAX } from '../lib/reviews'
import {
  placeAgeFitLabel,
  placeIndoorLabel,
  placeKindLabel,
  placeDistanceMiles,
  placeWebSearchHref,
  placePath,
  PLACE_WEB_SEARCH_LABEL,
  sortPlaceUpcoming,
} from '../lib/places'
import {
  placeCommentCountLabel,
  PLACE_COMMENT_MAX_LENGTH,
  sortPlaceComments,
  validatePlaceComment,
} from '../lib/placeComments'
import type { Place, PlacePrefill, PlaydateWithNeighborhood } from '../lib/types'

/**
 * /place/:id/details — MORE about one place (V23 slice 5).
 *
 * WHY THIS PAGE EXISTS, in the founder's words:
 *
 *   *"when you click details, it takes you to that page where you can see what
 *    other parents have said about it like in the comment section and you can
 *    see how many parents follow it by hearting it and you could click a link
 *    there that does a Google search in your browser for that location and then
 *    it can just like look up more information. That'd probably be like the
 *    easiest way to not have to maintain a database on all this but then still
 *    like get them to a place where they could learn more about the place."*
 *
 * The four blocks below are those four asks, in that order: what parents have
 * said (the wall), how many follow it + the heart, a way to the wider web, and
 * what is happening there.
 *
 * HOW IT RELATES TO `/place/:id`. They are NOT two pages about the same thing —
 * that is the "same fact, two spellings" defect this repo keeps recording, and
 * the split is deliberate:
 *   * `/place/:id` is the DECISION page: is this place good for my kid, where is
 *     it, and the one action ("Start a drop-in here"). It stays short.
 *   * `/place/:id/details` is the RESEARCH page: what other parents said, who
 *     follows it, how to read more, what is on there.
 * Both read the SAME `Place` row through the SAME `getPlaceById` seam and the
 * SAME pure labels (`placeKindLabel`, `placeIndoorLabel`, `placeAgeFitLabel`),
 * so they cannot disagree about the place's own facts. The header here links
 * back to the decision page, and the decision page links forward to this one —
 * `placeDetailsPath` is the ONE builder for the forward direction.
 *
 * SIGNED-OUT visitors: this page is inside the ProtectedShell, so they are sent
 * to /login like every other protected route. That is deliberate rather than
 * incidental — the wall renders other parents' names, and 0050 grants no anon
 * SELECT at all. A signed-out reader would see an empty wall and would be
 * unable to tell "nobody has written anything" from "you cannot see it", which
 * is exactly the false claim the place page's own drop-in section refuses to
 * make.
 *
 * A missing place and a failed read are DIFFERENT states (the place page's
 * rule): not-found is permanent, while a failure is the documented
 * DB-not-applied state and says so. The comment wall degrades SEPARATELY from
 * the place itself: if 0050 is not applied yet, the place still renders and the
 * wall says it is unavailable, rather than the whole page failing.
 */
export function PlaceDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session, profile } = useSessionContext()
  const [place, setPlace] = useState<Place | null>(null)
  const [missing, setMissing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [zipCoords, setZipCoords] = useState<ReadonlyMap<string, ZipCoords> | null>(null)

  // ONE clock reading for the whole render (the "is it open?" chip and the
  // drop-in activity age must agree). Captured once per mount so `new Date()`
  // never runs inside JSX.
  const [nowIso] = useState(() => new Date().toISOString())

  // --- Drop-in activity (the browse card's social-proof seam) ------------
  // null = not read yet OR the read failed — both render NO line at all. A
  // failed read must never read as "0 drop-ins hosted here" (a verdict).
  const [dropInProof, setDropInProof] = useState<PlaceDropInProof | null>(null)

  // --- The wall ---------------------------------------------------------
  // null = not read yet; [] = read, nothing there (or hidden). `commentsError`
  // is SEPARATE from `loadError` on purpose: an unapplied 0050 must not take
  // the whole page down with it.
  const [comments, setComments] = useState<PlaceCommentRow[] | null>(null)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)

  // --- The aggregate rating line (the 0052 review_summary RPC) -----------
  // null = not read yet OR the read failed — both render as NO line at all.
  // A failed read must never read as "this place is bad", so there is no
  // error card here: the honest unrated invitation is what a zero count says,
  // and an unknown count says nothing.
  const [reviewSummary, setReviewSummary] = useState<ReviewSummaryRow | null>(null)

  // --- Follow + upcoming (the place page's own seams) -------------------
  const [following, setFollowing] = useState(false)
  const [followerCount, setFollowerCount] = useState<number | null>(null)
  const [followBusy, setFollowBusy] = useState(false)
  const [followError, setFollowError] = useState<string | null>(null)
  const [posts, setPosts] = useState<PlaydateWithNeighborhood[] | null>(null)
  const [kidAgesByPostId, setKidAgesByPostId] = useState<Record<string, number[]>>({})

  useEffect(() => {
    if (id === undefined) return
    let cancelled = false
    setPlace(null)
    setMissing(false)
    setLoadError(null)
    setComments(null)
    setCommentsError(null)
    setReviewSummary(null)
    setDropInProof(null)
    setPosts(null)
    ;(async () => {
      try {
        const row = await getPlaceById(id)
        if (cancelled) return
        if (row === null) {
          setMissing(true)
          return
        }
        setPlace(row)
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  // The wall read — its own effect so a 0050-not-applied failure is contained.
  useEffect(() => {
    if (id === undefined) return
    let cancelled = false
    ;(async () => {
      try {
        const rows = await listPlaceComments(id)
        if (!cancelled) setComments(sortPlaceComments(rows))
      } catch {
        // The wall is unavailable (most likely 0050 not applied). Say so in the
        // wall's own block; never fail the page for it.
        if (!cancelled) {
          setComments([])
          setCommentsError('Comments are not available yet.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  // The aggregate rating line — its own effect so a 0052-not-applied failure is
  // contained (the wall's discipline): the place still renders and the line is
  // simply absent. A failed read must never render as a 0.0 or an error card.
  useEffect(() => {
    if (id === undefined) return
    let cancelled = false
    ;(async () => {
      try {
        const summary = await getReviewSummary(id)
        if (!cancelled) setReviewSummary(summary)
      } catch {
        // Pre-0052-apply / transient: no line at all (never "0.0 out of 5").
        if (!cancelled) setReviewSummary(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  // The drop-in activity line — its own effect, degrading like the rating line:
  // a failed read renders NO line, never "0 drop-ins hosted here". Takes the
  // per-place proof out of the map this place's read already returns.
  useEffect(() => {
    if (id === undefined) return
    let cancelled = false
    ;(async () => {
      try {
        const proofs = await listPlaceDropInProofs(nowIso)
        if (!cancelled) setDropInProof(proofs.get(id) ?? null)
      } catch {
        if (!cancelled) setDropInProof(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, nowIso])

  // Follower count + own follow state (the 0033 SECDEF RPC + own row).
  useEffect(() => {
    if (id === undefined || session === null) return
    let cancelled = false
    ;(async () => {
      try {
        const [count, isFollowing] = await Promise.all([
          countPlaceFollowers(id),
          getPlaceFollowState(id),
        ])
        if (cancelled) return
        setFollowerCount(count)
        setFollowing(isFollowing)
      } catch {
        // Pre-0033-apply: the line is simply absent and the control reports the
        // truth when pressed (the place page's own posture).
        if (!cancelled) setFollowerCount(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, session])

  // Upcoming drop-ins here + the ages each host is bringing (batched).
  useEffect(() => {
    if (id === undefined || session === null || profile === null) return
    let cancelled = false
    ;(async () => {
      try {
        const rows = await listPlaceFeed(id, profile.id)
        if (cancelled) return
        setPosts(sortPlaceUpcoming(rows))
        const ages = await kidAgesByPostForPosts(rows.map((r) => r.id))
        if (!cancelled) setKidAgesByPostId(ages)
      } catch {
        if (!cancelled) setPosts([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, session, profile])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const map = await loadZipCodes()
        if (!cancelled) setZipCoords(map)
      } catch {
        if (!cancelled) setZipCoords(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Save / unsave THIS place (the owner-only 0033 row). The DECISION is the
   * pure `planSaveToggle` seam — save or unsave? Execution below goes through
   * db.toggleFollowPlace, never a re-implemented toggle. Saving keeps a place
   * on your shortlist so you can find it again; nothing here promises
   * notifications. Re-read the count from the SECDEF RPC rather than
   * incrementing locally: the count is other people's data too, and a local
   * +/- would drift the moment someone else saves.
   */
  async function handleToggleFollow() {
    if (id === undefined || followBusy) return
    const placeId = id
    // The decision: save or unsave? The pure seam decides; execution below.
    planSaveToggle(following)
    setFollowBusy(true)
    setFollowError(null)
    try {
      const nowFollowing = await toggleFollowPlace(placeId)
      setFollowing(nowFollowing)
      setFollowerCount(await countPlaceFollowers(placeId))
    } catch {
      setFollowError('That did not save. Try again.')
    } finally {
      setFollowBusy(false)
    }
  }

  async function handlePostComment() {
    if (id === undefined || posting) return
    const problem = validatePlaceComment(draft)
    if (problem !== null) {
      setPostError(problem)
      return
    }
    setPosting(true)
    setPostError(null)
    try {
      const created = await createPlaceComment(id, draft)
      // Optimistic-append is avoided deliberately: the row we render is the row
      // the DB returned (including its real created_at and author), so the wall
      // never shows a comment that failed to save.
      setComments((prev) => sortPlaceComments([created, ...(prev ?? [])]))
      setDraft('')
    } catch {
      setPostError('That did not post. Try again.')
    } finally {
      setPosting(false)
    }
  }

  function startHere() {
    if (place === null) return
    const prefill: PlacePrefill = {
      placeId: place.id,
      place: place.name,
      address: place.address,
      neighborhoodId: place.neighborhood_id,
    }
    navigate('/new', { state: { place: prefill } })
  }

  if (missing) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">We couldn’t find this place</h1>
        <p className="text-sm text-slate-600">It may have been removed from the directory.</p>
        <Link to="/browse" className="text-sm font-medium text-indigo-600">
          Back to places
        </Link>
      </div>
    )
  }

  if (loadError !== null) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p role="alert" className="text-sm text-red-700">
          {loadError}
        </p>
        <Link to="/browse" className="mt-2 inline-block text-sm font-medium text-red-700 underline">
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

  const maps = mapsHref(place.name, place.address)
  const ageFit = placeAgeFitLabel(place)
  const webSearch = placeWebSearchHref(place)
  // The distance uses the SAME seam the place page and the browse cards use —
  // a second formula here is how two surfaces start disagreeing about "1 mi".
  const distance =
    zipCoords === null
      ? null
      : placeDistanceMiles(place, { homeZip: profile?.home_zip ?? null }, zipCoords)
  const commentCount = comments?.length ?? 0
  const draftLength = draft.trim().length
  const draftProblem = postError
  // Both decisions are the pure seams' — this page renders, it does not decide
  // whether a schedule means "open" or whether activity is worth stating.
  const openStatus = hoursStatus(place.hours ?? null, new Date(nowIso))
  const openNote = hoursSourceNote(place.hours_source ?? null)
  const activityLine = dropInProofLine(dropInProof, nowIso)

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Header: the place's own facts, from the shared label seams ---- */}
      <div>
        {/* V24 slice 02: the shared back control (the ad-hoc "← {place.name}" link
            became BackControl); the destination lives in the h1 below. The spec id
            stays on the control itself. */}
        <BackControl to={placePath(place.id)} testId="details-back-to-place" />
        <h1 className="mt-2 text-xl font-semibold text-slate-900">{place.name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {placeKindLabel(place.kind)} · {placeIndoorLabel(place)}
          {distance !== null ? ` · ${formatDistanceLabel(distance)} from your zip` : ''}
        </p>
        {place.address !== '' ? (
          <p className="mt-1 text-sm text-slate-600">
            {maps !== null ? (
              <a
                href={maps}
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
        ) : null}
        {ageFit !== null ? <p className="mt-1 text-sm text-slate-600">{ageFit}</p> : null}
      </div>

      {/* ---- The one action carried over from the decision page ---- */}
      <button
        type="button"
        data-testid="details-start-drop-in"
        onClick={startHere}
        className="min-h-11 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors motion-reduce:transition-none hover:bg-indigo-700"
      >
        Start a drop-in here
      </button>

      {/* ---- Save: how many families, and the bookmark. Saving keeps a place on
          your shortlist so you can find it again — that is the benefit stated
          plainly; nothing here promises notifications. The pressed state is
          conveyed by MORE THAN colour: the bookmark glyph fills when saved
          (stroked otherwise) AND the label flips Save → Saved. */}
      <div className="flex flex-col gap-2">
        <p data-testid="details-follower-line" className="text-sm text-slate-700">
          {followerCount === null
            ? 'Save this place'
            : placeFollowerLine(followerCount, place.name)}
        </p>
        <button
          type="button"
          data-testid="details-follow-toggle"
          onClick={() => void handleToggleFollow()}
          disabled={followBusy || session === null}
          aria-pressed={following}
          className={
            'mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 ' +
            (following
              ? 'border border-indigo-300 bg-white text-indigo-700'
              : 'bg-indigo-600 text-white hover:bg-indigo-700')
          }
        >
          {/* The glyph is decorative (aria-hidden); the button's accessible name
              comes from its text content. */}
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
        {followError !== null ? (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {followError}
          </p>
        ) : null}
      </div>

      {/* ---- The web search link: the founder's "just Google it" ---- */}
      {webSearch !== null ? (
        <a
          href={webSearch}
          target="_blank"
          rel="noopener"
          data-testid="place-web-search"
          className="flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors motion-reduce:transition-none hover:bg-slate-50"
        >
          {PLACE_WEB_SEARCH_LABEL}
        </a>
      ) : null}

      {/* ---- What parents have said ---- */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          What parents say
        </h2>

        {/* V27: is it open, and how much is going on there — the two facts a
            parent weighs beside the rating. Hours render only when the place
            actually carries a schedule (never a guessed status); the status
            chip is the directory's own idiom, and the `typical hours`
            qualifier says when the schedule is a citywide default rather than
            a per-venue one. */}
        {place.hours !== null && place.hours !== undefined ? (
          <div data-testid="details-hours" className="mt-1 flex flex-wrap items-center gap-2">
            {openStatus !== null ? (
              <span
                className={
                  'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ' +
                  (openStatus === 'open'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500')
                }
              >
                <span
                  aria-hidden="true"
                  className={openStatus === 'open' ? 'text-emerald-500' : 'text-slate-400'}
                >
                  ●
                </span>
                {openStatus === 'open' ? 'Open now' : 'Closed'}
              </span>
            ) : null}
            <span className="text-sm text-slate-600">
              {place.hours.display}
              {openNote !== null ? (
                <span className="text-slate-400"> · {openNote}</span>
              ) : null}
            </span>
          </div>
        ) : null}

        {/* The drop-in activity line, from the browse card's own pure seam.
            Null (no past drop-ins, not read, or a failed read) renders
            NOTHING — never "0 drop-ins hosted here", which reads as a
            verdict. */}
        {activityLine !== null ? (
          <p data-testid="details-dropin-proof" className="text-xs text-slate-500">
            {activityLine}
          </p>
        ) : null}

        {/* V24 ticket 06: the AGGREGATE rating line, above everything else in
            this section — the founder's "a total star rating above what
            parents say". The numbers come from the DATABASE (the 0052
            review_summary RPC), never averaged in markup; the sentence is the
            pure reviews.reviewRatingLine rule. A null summary (not read yet or
            a failed read) renders NO line at all — no 0.0, no error card. The
            zero case names the place and invites the first review, in the same
            tone as the wall's count line below (placeCommentCountLabel). */}
        {reviewSummary !== null ? (
          <div data-testid="place-rating-line" className="mt-1 flex items-center gap-2">
            {reviewSummary.display_average !== null && reviewSummary.review_count > 0 ? (
              <>
                <span className="text-base font-semibold text-slate-900">
                  {Number(reviewSummary.display_average).toFixed(1)}
                </span>
                <span aria-hidden="true" className="flex items-center gap-0.5 text-amber-700">
                  {Array.from({ length: REVIEW_SCORE_MAX }, (_, i) => (
                    <StarGlyph key={i} filled={i + 1 <= Math.round(Number(reviewSummary.display_average ?? 0))} />
                  ))}
                </span>
                <span className="sr-only">
                  {reviewRatingLine(
                    reviewSummary.review_count,
                    reviewSummary.display_average,
                    place.name,
                  )}
                </span>
                <span aria-hidden="true" className="text-sm text-slate-600">
                  {reviewSummary.review_count === 1
                    ? '1 review'
                    : `${reviewSummary.review_count} reviews`}
                </span>
              </>
            ) : (
              <p className="text-sm text-slate-600">
                {reviewRatingLine(reviewSummary.review_count, reviewSummary.display_average, place.name)}
              </p>
            )}
          </div>
        ) : null}

        {/* V24 ticket 06: the review form (stars + optional comment, one review
            per parent) mounts ABOVE the wall — the founder's ask was "a total
            star rating above what parents say". The existing wall below is
            untouched; reconciling the two surfaces is explicitly deferred. */}
        <div data-testid="review-form" className="mt-1">
          <ReviewForm placeId={id ?? ''} />
        </div>

        <p data-testid="place-comment-count" className="text-sm text-slate-600">
          {placeCommentCountLabel(commentCount, place.name)}
        </p>

        {/* The composer. One write path (`createPlaceComment`), the validator's
            own sentence on rejection, and a live count that turns red at the
            cap — the parent sees the limit before they hit it. */}
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Add what you know</span>
            <textarea
              data-testid="place-comment-input"
              className="min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
              value={draft}
              maxLength={PLACE_COMMENT_MAX_LENGTH}
              placeholder="Is the playground shaded? Is parking easy? What should we bring?"
              onChange={(e) => {
                setDraft(e.target.value)
                // The error belongs to the value that produced it.
                setPostError(null)
              }}
              aria-describedby={draftProblem !== null ? 'place-comment-error' : undefined}
              aria-invalid={draftProblem !== null}
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <span
              className={
                'text-xs ' +
                (draftLength > PLACE_COMMENT_MAX_LENGTH ? 'text-red-600' : 'text-slate-500')
              }
            >
              {draftLength}/{PLACE_COMMENT_MAX_LENGTH}
            </span>
            <button
              type="button"
              data-testid="place-comment-submit"
              onClick={() => void handlePostComment()}
              disabled={posting || draft.trim() === ''}
              className="min-h-11 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
          {draftProblem !== null ? (
            <p role="alert" id="place-comment-error" className="text-sm text-red-600">
              {draftProblem}
            </p>
          ) : null}
        </div>

        {commentsError !== null ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            {commentsError}
          </p>
        ) : comments === null ? (
          <p className="text-sm text-slate-600">Loading comments…</p>
        ) : comments.length === 0 ? (
          // The count line above already invites the first word, so this block
          // stays quiet rather than repeating it.
          <p className="text-sm text-slate-600">Nothing here yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {comments.map((comment) => (
              <li
                key={comment.id}
                data-testid="place-comment"
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <p className="text-sm text-slate-800">{comment.body}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {comment.author_display_name === '' ? 'A parent' : comment.author_display_name}
                  {' · '}
                  {relativeDay(comment.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- What is happening there (the place page's own rule) ---- */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Upcoming drop-ins here
        </h2>
        {posts === null ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-slate-600">Nothing planned yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {posts.map((post) => (
              <DropInCard
                key={post.id}
                playdate={post}
                nowIso={nowIso}
                ageRangeLabel={cardAgeRangeLabel(post, kidAgesByPostId[post.id] ?? [])}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * A comment's age as a short relative string. Deliberately tiny and local: the
 * inbox's richer `relativeTimeLabel` lives in feed territory and is tuned for a
 * message list, while a park wall only ever needs "today / yesterday / N days /
 * a date". Keeping it here means this page cannot change the inbox's wording.
 */
function relativeDay(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * A 24px star glyph, stroked like the app's icon family (24px viewBox, stroke
 * 1.8, currentColor). Filled when lit, outlined otherwise — a decorative
 * companion to the rating line's text value (the screen reader reads the
 * sr-only sentence, never five glyphs with no alternative).
 */
function StarGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" />
    </svg>
  )
}

export default PlaceDetailsPage
