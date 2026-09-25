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