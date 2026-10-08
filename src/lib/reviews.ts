/**
 * V24 ticket 06 — the review rules that must not live in markup.
 *
 * The wall itself is a table (`reviews`, migration 0052) and, later, a page.
 * This module holds the decisions that belong in `src/lib/` per the build law:
 * score validation, the empty/commented review shape, the aggregate summary
 * (display average, count, the honest zero case), and the top-rated ordering —
 * including the unrated-place rule. Pure functions, no Supabase client, no
 * React — trivially testable, mock-free.
 */

// ---------------------------------------------------------------------------
// The client-side mirrors of the database walls (the house pattern: the client
// sentence plus the DB wall, with a test pinning the numbers so they cannot
// drift).
// ---------------------------------------------------------------------------

/**
 * The score range, mirroring 0052's CHECK (`score between 1 and 5`) exactly.
 *
 * THE DUPLICATION IS DELIBERATE and is the house rule for a bound that exists
 * on both sides (cf. `profiles_radius_miles_chk` <-> `RADIUS_MIN_MILES`, and
 * `PLACE_COMMENT_MAX_LENGTH` <-> 0050's CHECK): the client cap gives the parent
 * a sentence they can act on; the DB CHECK is the wall that makes it true. If
 * these two ever disagree the DB wins and the parent sees a raw Postgres error
 * — so a test pins the numbers.
 */
export const REVIEW_SCORE_MIN = 1
export const REVIEW_SCORE_MAX = 5

/**
 * The body cap, mirroring 0052's CHECK (`char_length(body) <= 500`) and 0050's
 * place-comment bound exactly, so the two walls agree: a body that posts to the
 * comment wall also posts to a review, and vice versa.
 */
export const REVIEW_BODY_MAX_LENGTH = 500

// ---------------------------------------------------------------------------
// Score validation — the client-side mirror of 0052's CHECK constraint.
// ---------------------------------------------------------------------------

/**
 * Validate a star score before sending. Returns an error string (the sentence
 * the parent reads), or null when the score is sendable.
 *
 * A score is an integer from 1 to 5. A fractional value (2.5) is rejected
 * because the star control is a radio group — a rating is a single choice among
 * five, and a half-star is not one of them. A non-numeric value is rejected
 * the same way: the form never produces one, but the validator must not trust
 * the wire.
 */
export function validateReviewScore(score: number): string | null {
  if (!Number.isInteger(score)) {
    return 'Pick a whole number of stars, from 1 to 5.'
  }
  if (score < REVIEW_SCORE_MIN || score > REVIEW_SCORE_MAX) {
    return `Pick a score from ${REVIEW_SCORE_MIN} to ${REVIEW_SCORE_MAX} stars.`
  }
  return null
}

/**
 * Validate a review body before sending — the client-side mirror of 0052's
 * CHECK constraint. Unlike the place-comment wall (0050), the review body is
 * OPTIONAL: a stars-only review is legal, so an empty body is valid. A stored
 * body must be at most 500 characters (the trimmed length, matching 0050's
 * trim-then-measure discipline).
 */
export function validateReviewBody(body: string | null): string | null {
  if (body === null) return null
  const trimmed = body.trim()
  if (trimmed.length === 0) return null // stars-only review, legal
  if (trimmed.length > REVIEW_BODY_MAX_LENGTH) {
    return `Keep the comment to ${REVIEW_BODY_MAX_LENGTH} characters.`
  }
  return null
}

// ---------------------------------------------------------------------------
// The review shape — empty vs commented.
// ---------------------------------------------------------------------------

/**
 * A review as it arrives from the database (or as it is about to be sent).
 * `body` is optional: a stars-only review carries no words.
 */
export interface Review {
  /** The place this review is about. */
  placeId: string
  /** The parent who wrote it. */
  authorProfileId: string
  /** 1–5, the star score. */
  score: number
  /** Optional comment; absent or blank means a stars-only review. */
  body?: string | null
  /** When the review was first written. */
  createdAt: string
}

/**
 * A review ready to submit: a validated score plus an optional (validated)
 * body. The form is one submit — stars required, comment optional — and this
 * type is the shape that submit produces.
 */
export interface ReviewInput {
  placeId: string
  authorProfileId: string
  score: number
  body?: string | null
}

/**
 * Whether a review carries a comment (the "commented" shape) or is stars-only
 * (the "empty" shape). A blank or whitespace-only body counts as empty: the
 * display layer should not render an empty quote block for `"   "`.
 */
export function isCommentedReview(review: Pick<Review, 'body'>): boolean {
  return typeof review.body === 'string' && review.body.trim().length > 0
}

// ---------------------------------------------------------------------------
// The aggregate summary — display average, count, the honest zero case.
// ---------------------------------------------------------------------------

/**
 * The per-place summary a card renders: the count and the display average
 * (rounded to one decimal), or the honest zero case when there are no reviews.
 *
 * The zero case is EXPLICIT rather than a missing value landing wherever it
 * lands: `hasReviews` is false and `displayAverage` is null, so a caller that
 * renders the average checks the flag first and shows the invitation copy
 * ("Be the first to rate") instead of a 0.0 that would read as "terrible".
 */
export interface ReviewSummary {
  /** How many parents have reviewed this place. */
  count: number
  /** The average rounded to one decimal, or null when there are no reviews. */
  displayAverage: number | null
  /** False when count is zero — the honest zero case. */
  hasReviews: boolean
}

/**
 * Compute the per-place summary from a place's review rows.
 *
 * Rounding: the average is rounded to ONE decimal place (the shape a card
 * renders, matching 0052's `round(avg(score)::numeric, 1)`). Standard
 * half-up rounding via `Math.round(x * 10) / 10` — so 4.25 displays as 4.3
 * and 4.24 displays as 4.2. The boundary is pinned by a test.
 *
 * Does not mutate its input.
 */
export function summarizeReviews(rows: readonly Review[]): ReviewSummary {
  const count = rows.length
  if (count === 0) {
    return { count: 0, displayAverage: null, hasReviews: false }
  }
  const sum = rows.reduce((acc, r) => acc + r.score, 0)
  const displayAverage = Math.round((sum / count) * 10) / 10
  return { count, displayAverage, hasReviews: true }
}

// ---------------------------------------------------------------------------
// The aggregate rating line — the sentence a place page renders above the wall.
// ---------------------------------------------------------------------------

/**
 * How the aggregate rating reads on a place page: the display average, the
 * review count, and the honest zero case.
 *
 * The input is what the DATABASE computed (the 0052 `review_summary` RPC:
 * `count(*)` plus `round(avg(score)::numeric, 1)`, NULL when unrated), so this
 * function NEVER averages or rounds anything itself — it only formats numbers
 * that are already final. The one-decimal formatting is a DISPLAY rule, not a
 * rounding rule: the DB's numeric arrives as "4.3" (a string) or null, and
 * `Number("4.3")` recovers the value without any arithmetic. A null average is
 * the explicit unrated signal (the same shape `summarizeReviews` returns for an
 * empty row set), and the zero case follows the house empty-state pattern from
 * `placeCommentCountLabel`: it names the PLACE and invites the first review
 * rather than reporting a shortfall — so the two lines on the details page
 * ("say something" / "rate it") agree in tone instead of disagreeing.
 */
export function reviewRatingLine(
  count: number,
  displayAverage: number | null,
  placeName: string,
): string {
  if (displayAverage === null || count <= 0) {
    const name = placeName.trim()
    return name === ''
      ? 'Be the first to rate this place.'
      : `Be the first to rate ${name}.`
  }
  // The average is already rounded to one decimal by the database; Number()
  // recovers it from the RPC's numeric-as-string without re-rounding.
  const avg = Number(displayAverage)
  const countWord = count === 1 ? 'review' : 'reviews'
  return `${avg.toFixed(1)} out of 5 · ${count} ${countWord}`
}

/**
 * V32 v32-9 (A10) — MAY THIS PLACE'S RATING BE DRAWN AT ALL?
 *
 * The drop-in detail page mounts `PlaceRatingLine` beside the place it
 * describes. That element renders its ZERO case as an INVITATION — *"Be the
 * first to rate {place}."* — which is right on a place page (where a parent can
 * actually write one) and wrong on a drop-in page, which is not where anyone
 * reviews a place. So the drop-in page must render NOTHING for an unrated place:
 * not a zero, not an empty star row, and not that invitation.
 *
 * This is the threshold that decides it, here rather than as a bare
 * `review_count > 0` inlined in the `.tsx` (the build law: React renders, `lib/`
 * decides). Both halves are required on purpose:
 *   - `review_count > 0` is the "has anyone reviewed it" fact;
 *   - `display_average !== null` is the "is there a number to show" fact.
 * A count with a NULL average cannot be produced by the current RPC — the
 * normaliser in db.ts keeps null distinct from 0 precisely so it never can — but
 * the guard is checked anyway, because the failure it prevents is drawing a
 * rating the place has not earned, and that is worth refusing structurally
 * rather than trusting an upstream shape to stay still.
 *
 * ⚠️ IT IS NOT A TRUTHINESS CHECK ON THE AVERAGE. `0` is falsy, so `if (!avg)`
 * would hide a legitimate average of 0. The normaliser hands this a real
 * `number | null`, so the null test is explicit.
 */
export function hasPlaceRating(summary: {
  review_count: number
  display_average: number | null
}): boolean {
  return summary.review_count > 0 && summary.display_average !== null
}

// ---------------------------------------------------------------------------
// The top-rated ordering — including the unrated-place rule.
// ---------------------------------------------------------------------------

/**
 * One place's position in the top-rated list: its summary plus the name the
 * list renders.
 */
export interface PlaceRating {
  placeId: string
  placeName: string
  /** The place's review rows (may be empty). */
  reviews: readonly Review[]
}

/**
 * The result of ranking places: each entry carries the place id, its summary,
 * and whether it is rated at all. Unrated places carry `hasReviews: false`
 * and sort AFTER every rated place (the unrated-place rule below).
 */
export interface RankedPlace {
  placeId: string
  placeName: string
  summary: ReviewSummary
}

/**
 * Rank places by their review average, best first.
 *
 * THE UNRATED-PLACE RULE (pinned by a test): a place with no reviews must
 * NEVER rank as if it scored zero. It sorts after every rated place — last,
 * not first — because a missing average is not a 0.0; it is the absence of an
 * opinion, and presenting it as the worst place would punish the new park
 * that simply has not been visited yet. Ties among rated places (equal
 * display averages) break on COUNT: the place with more reviews ranks first —
 * a 4.0 backed by twenty parents is stronger evidence than a 4.0 from one
 * (spec "top-rated ordering"). Ties among unrated places keep their incoming
 * order (stable sort).
 *
 * Does not mutate its input.
 */
export function rankTopRated(places: readonly PlaceRating[]): RankedPlace[] {
  const summaries = places.map((p) => ({
    place: p,
    summary: summarizeReviews(p.reviews),
  }))
  return [...summaries]
    .sort((a, b) => {
      // Unrated places always sort after rated ones (the unrated-place rule).
      if (a.summary.hasReviews !== b.summary.hasReviews) {
        return a.summary.hasReviews ? -1 : 1
      }
      // Both rated: higher average first; on an equal display average, the
      // place with MORE reviews ranks first (the spec's count tiebreak).
      if (a.summary.hasReviews && b.summary.hasReviews) {
        const byAverage = (b.summary.displayAverage ?? 0) - (a.summary.displayAverage ?? 0)
        if (byAverage !== 0) return byAverage
        return b.summary.count - a.summary.count
      }
      // Both unrated: stable (keep incoming order).
      return 0
    })
    .map(({ place, summary }) => ({
      placeId: place.placeId,
      placeName: place.placeName,
      summary,
    }))
}

// ---------------------------------------------------------------------------
// The place page's inline block (the reviews-inline slice) — what parents say
// is READ on /place/:id, and the compose door is a lightboxed modal.
//
// The founder, annotated on the place page's old "What parents say about this
// place →" link: *"Why would this link to a separate page? Like, wouldn't you
// see what parents say about this place and they're rating right here? And then
// you have the option to click on something to leave a review And I think that
// review should be like a modal that gets light boxed in where you just leave
// the review"*. So the place page renders the aggregate rating line and a few
// review bodies inline, and ONE button opens the compose modal. Every decision
// those two need — the button's label, whether the viewer has already reviewed
// this place, which rows are worth showing, and the honest sentence when there
// is nothing to show — is a pure function here, never an `if` in the page.
// ---------------------------------------------------------------------------

/**
 * The compose button's ONE label, decided purely (the caller renders it).
 *
 * "Add your review" when the viewer has not reviewed this place, "Edit your
 * review" when they have — one review per parent per place (0052's composite
 * primary key), so the verb is the form's real behaviour: the ReviewForm loads
 * the existing row and the same submit replaces it.
 */
export function reviewComposeLabel(hasMine: boolean): 'Add your review' | 'Edit your review' {
  return hasMine ? 'Edit your review' : 'Add your review'
}

/**
 * How many review bodies the place page's inline block shows. Three, because
 * the block sits above "Start here" on a phone and the full wall lives on
 * `/place/:id/details` (spec §7's default).
 */
export const INLINE_REVIEW_LIMIT = 3

/**
 * A review plus the author's display name — the shape the wall's own read
 * returns (`db.listPlaceReviews`), so the inline block renders the SAME rows
 * the details page reads rather than a second projection of the table.
 */
export interface ReviewWithAuthor extends Review {
  /** The author's `profiles.display_name`; '' when the profile row carries none. */
  authorDisplayName: string
  /**
   * The author's `profiles.avatar_url`, or null when they have no photo.
   *
   * V35 slice A (`muzk8c1g`): the reviewer row draws the author's face in a
   * circle LEFT of their name, so the read has to carry the photo. Null means
   * "no photo" and the row renders the initial placeholder.
   *
   * ⚠️ THIS IS THE ONLY FIELD THE SLICE ADDED TO THE READ. The name is a link to
   * `/u/<handle>`, and that route needs no new column: `getProfileByHandle`
   * resolves a handle by matching `profiles.display_name`
   * (`src/lib/db.ts` — `.eq('display_name', handle)`), so `authorDisplayName`
   * IS the handle. Nothing new is fetched for the link.
   */
  authorAvatarUrl: string | null
}

/**
 * Whether the viewer is among these rows' authors — the `hasMine` input to
 * `reviewComposeLabel`.
 *
 * A missing/blank profile id is NOT the author of anything: the protected
 * shell guarantees a session, but the profile row can still be settling, and
 * treating "unknown viewer" as "has a review" would label the button "Edit
 * your review" for a parent who has never written one.
 */
export function hasReviewed(
  rows: readonly Pick<Review, 'authorProfileId'>[],
  profileId: string | null | undefined,
): boolean {
  if (profileId === null || profileId === undefined || profileId === '') return false
  return rows.some((row) => row.authorProfileId === profileId)
}

/**
 * The inline projection: at most `limit` COMMENTED reviews, in the order given.
 *
 * THE ORDER IS THE READER'S, NOT THIS FUNCTION'S. It does not sort: the caller
 * passes the rows exactly as the wall's read returns them (newest first,
 * `order('created_at', { ascending: false })` — the same order the browse
 * directory's highlight read uses), and this takes the first `limit` of them.
 * A second ordering here is how the inline block and the wall would start
 * disagreeing about which review is "first".
 *
 * A stars-only review is deliberately NOT a highlight, matching
 * `listPlaceReviewHighlightsWithClient`: a row with no words has nothing to
 * show in a block whose whole job is "what parents SAY". It still counts in
 * the aggregate the rating line renders, which is why the honest empty line
 * below takes the count rather than the row length.
 */
export function inlineReviewHighlights<T extends Pick<Review, 'body'>>(
  rows: readonly T[],
  limit: number,
): T[] {
  if (limit <= 0) return []
  return rows.filter((row) => isCommentedReview(row)).slice(0, limit)
}

/**
 * The honest sentence the inline block shows when it has no review BODY to
 * show, keyed on the aggregate count so a place with ratings-but-no-words is
 * never told it has no reviews.
 *
 * Same discipline as `reviewRatingLine`: it names the place when it has a name
 * ("No one has reviewed Green Lake Park yet."), falls back to "this place"
 * rather than a dangling sentence, and reports the count it was given instead
 * of inventing one.
 */
export function inlineReviewsEmptyLine(count: number, placeName: string): string {
  const name = placeName.trim()
  const subject = name === '' ? 'this place' : name
  if (count <= 0) return `No one has reviewed ${subject} yet.`
  if (count === 1) return 'One rating so far, with no comment.'
  return `${count} ratings so far, with no comments.`
}
