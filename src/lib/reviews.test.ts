import { describe, expect, it } from 'vitest'
import {
  REVIEW_BODY_MAX_LENGTH,
  REVIEW_SCORE_MAX,
  REVIEW_SCORE_MIN,
  isCommentedReview,
  rankTopRated,
  summarizeReviews,
  validateReviewBody,
  validateReviewScore,
  type Review,
} from './reviews'

/**
 * V24 ticket 06 — the review rules.
 *
 * The bound tests are the important ones: 1–5 and 500 are ALSO enforced by
 * migration 0052's CHECK constraints, and if these two drift the parent gets a
 * raw Postgres error instead of the sentence `validateReviewScore` /
 * `validateReviewBody` returns. So the numbers are pinned here as well as
 * exercised through the validators.
 */

// ---------------------------------------------------------------------------
// The pinned numbers (client mirror <-> DB wall).
// ---------------------------------------------------------------------------

describe('REVIEW_SCORE_MIN / REVIEW_SCORE_MAX', () => {
  it('are 1 and 5 — the same range migration 0052 enforces in the DB CHECK', () => {
    expect(REVIEW_SCORE_MIN).toBe(1)
    expect(REVIEW_SCORE_MAX).toBe(5)
  })
})

describe('REVIEW_BODY_MAX_LENGTH', () => {
  it('is 500 — the same bound migrations 0050 and 0052 enforce in their DB CHECKs', () => {
    expect(REVIEW_BODY_MAX_LENGTH).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// Score validation.
// ---------------------------------------------------------------------------

describe('validateReviewScore', () => {
  it('accepts every integer from 1 to 5', () => {
    for (const s of [1, 2, 3, 4, 5]) {
      expect(validateReviewScore(s)).toBeNull()
    }
  })

  it('rejects below the floor with the actionable sentence', () => {
    expect(validateReviewScore(0)).toBe('Pick a score from 1 to 5 stars.')
    expect(validateReviewScore(-3)).toBe('Pick a score from 1 to 5 stars.')
  })

  it('rejects above the ceiling with the actionable sentence', () => {
    expect(validateReviewScore(6)).toBe('Pick a score from 1 to 5 stars.')
    expect(validateReviewScore(99)).toBe('Pick a score from 1 to 5 stars.')
  })

  it('rejects fractional scores (a rating is a single choice among five)', () => {
    expect(validateReviewScore(2.5)).toBe('Pick a whole number of stars, from 1 to 5.')
  })

  it('rejects non-finite values', () => {
    expect(validateReviewScore(Number.NaN)).toBe('Pick a whole number of stars, from 1 to 5.')
    expect(validateReviewScore(Number.POSITIVE_INFINITY)).toBe(
      'Pick a whole number of stars, from 1 to 5.',
    )
  })
})

// ---------------------------------------------------------------------------
// Body validation (optional, capped at the comment-wall bound).
// ---------------------------------------------------------------------------

describe('validateReviewBody', () => {
  it('accepts null (a stars-only review is legal)', () => {
    expect(validateReviewBody(null)).toBeNull()
  })

  it('accepts an empty or whitespace-only body (still a stars-only review)', () => {
    expect(validateReviewBody('')).toBeNull()
    expect(validateReviewBody('   \n\t ')).toBeNull()
  })

  it('accepts an ordinary comment', () => {
    expect(validateReviewBody('The splash pad is great in summer.')).toBeNull()
  })

  it('accepts exactly the cap (the boundary the DB allows)', () => {
    expect(validateReviewBody('x'.repeat(REVIEW_BODY_MAX_LENGTH))).toBeNull()
  })

  it('rejects one character past the cap', () => {
    expect(validateReviewBody('x'.repeat(REVIEW_BODY_MAX_LENGTH + 1))).toBe(
      `Keep the comment to ${REVIEW_BODY_MAX_LENGTH} characters.`,
    )
  })

  it('measures the TRIMMED length, so padding around a legal body passes', () => {
    const padded = `   ${'x'.repeat(REVIEW_BODY_MAX_LENGTH)}   `
    expect(validateReviewBody(padded)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The empty-vs-commented shape.
// ---------------------------------------------------------------------------

describe('isCommentedReview', () => {
  it('treats a real body as commented', () => {
    expect(isCommentedReview({ body: 'Shade under the big oak.' })).toBe(true)
  })

  it('treats null, absent, and blank bodies as empty (stars-only)', () => {
    expect(isCommentedReview({ body: null })).toBe(false)
    expect(isCommentedReview({})).toBe(false)
    expect(isCommentedReview({ body: '   ' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The aggregate summary — zero reviews, one review, a tie, a rounding boundary.
// ---------------------------------------------------------------------------

function review(placeId: string, score: number, body?: string | null): Review {
  return {
    placeId,
    authorProfileId: `parent-${Math.random().toString(36).slice(2, 8)}`,
    score,
    body,
    createdAt: '2026-09-01T10:00:00.000Z',
  }
}

describe('summarizeReviews', () => {
  it('zero reviews: the honest zero case — count 0, average null, hasReviews false', () => {
    expect(summarizeReviews([])).toEqual({
      count: 0,
      displayAverage: null,
      hasReviews: false,
    })
  })

  it('one review: the average IS that score', () => {
    expect(summarizeReviews([review('p1', 4)]).displayAverage).toBe(4)
    expect(summarizeReviews([review('p1', 4)]).count).toBe(1)
    expect(summarizeReviews([review('p1', 4)]).hasReviews).toBe(true)
  })

  it('a tie: two places with the same average keep both averages intact', () => {
    // Place A: 5 and 3 -> 4.0. Place B: 4 and 4 -> 4.0. Same average.
    const a = summarizeReviews([review('a', 5), review('a', 3)])
    const b = summarizeReviews([review('b', 4), review('b', 4)])
    expect(a.displayAverage).toBe(4)
    expect(b.displayAverage).toBe(4)
    expect(a.displayAverage).toBe(b.displayAverage)
  })

  it('rounding boundary: half-up at the first decimal — 4.25 displays as 4.3, just-below stays down', () => {
    // Exact half: 4, 4, 4, 5 -> sum 17, avg 4.25 -> rounds UP to 4.3.
    expect(
      summarizeReviews([review('p', 4), review('p', 4), review('p', 4), review('p', 5)]).displayAverage,
    ).toBe(4.3)
    // Just below a .x5 boundary: nineteen 4s and one 5 -> sum 81, 81/20 = 4.05
    // -> Math.round(4.05 * 10) / 10 = Math.round(40.5) / 10 = 41 / 10 = 4.1.
    const justUnder = [
      ...Array.from({ length: 19 }, () => review('p', 4)),
      review('p', 5),
    ]
    expect(summarizeReviews(justUnder).displayAverage).toBe(4.1)
    // And the documented arithmetic itself (Math.round(x*10)/10), pinned so a
    // future change to the rounding rule fails loudly:
    expect(Math.round(4.25 * 10) / 10).toBe(4.3)
    expect(Math.round(4.249 * 10) / 10).toBe(4.2)
  })

  it('rounds a multi-review average to one decimal', () => {
    // 5, 4, 4 -> 13/3 = 4.333... -> 4.3
    expect(summarizeReviews([review('p', 5), review('p', 4), review('p', 4)]).displayAverage).toBe(4.3)
    // 5, 5, 4 -> 14/3 = 4.666... -> 4.7
    expect(summarizeReviews([review('p', 5), review('p', 5), review('p', 4)]).displayAverage).toBe(4.7)
  })
})

// ---------------------------------------------------------------------------
// The top-rated ordering — unrated mixed with rated, ties, stability.
// ---------------------------------------------------------------------------

describe('rankTopRated', () => {
  it('an unrated place never ranks as if it scored zero — it sorts after every rated place', () => {
    const rated = {
      placeId: 'park-a',
      placeName: 'Green Lake Park',
      reviews: [review('park-a', 2)], // a LOW score, but still rated
    }
    const unrated = {
      placeId: 'park-b',
      placeName: 'New Corner Park',
      reviews: [],
    }
    const ranked = rankTopRated([unrated, rated])
    // The unrated place must come LAST, not first (a missing average is not 0.0).
    expect(ranked.map((r) => r.placeId)).toEqual(['park-a', 'park-b'])
    expect(ranked[1].summary.hasReviews).toBe(false)
    expect(ranked[1].summary.displayAverage).toBeNull()
  })

  it('orders rated places by average, best first', () => {
    const low = { placeId: 'low', placeName: 'Low', reviews: [review('low', 2)] }
    const high = { placeId: 'high', placeName: 'High', reviews: [review('high', 5)] }
    const mid = { placeId: 'mid', placeName: 'Mid', reviews: [review('mid', 3)] }
    expect(rankTopRated([low, high, mid]).map((r) => r.placeId)).toEqual(['high', 'mid', 'low'])
  })

  it('a tie on the display average breaks on COUNT — more reviews ranks first (the spec rule)', () => {
    // Both places average 4.0, but A has TWO reviews and B has ONE: a 4.0
    // backed by two parents is stronger evidence than a 4.0 from one, so A
    // must rank first even though it comes SECOND in the incoming order. This
    // test distinguishes the count tiebreak from a plain stable sort (which
    // would keep B first).
    const a = { placeId: 'a', placeName: 'A', reviews: [review('a', 5), review('a', 3)] }
    const b = { placeId: 'b', placeName: 'B', reviews: [review('b', 4)] }
    expect(rankTopRated([b, a]).map((r) => r.placeId)).toEqual(['a', 'b'])
  })

  it('a full tie (equal average AND equal count) keeps the incoming order (stable)', () => {
    const a = { placeId: 'a', placeName: 'A', reviews: [review('a', 4)] }
    const b = { placeId: 'b', placeName: 'B', reviews: [review('b', 4)] }
    const c = { placeId: 'c', placeName: 'C', reviews: [review('c', 4)] }
    expect(rankTopRated([a, b, c]).map((r) => r.placeId)).toEqual(['a', 'b', 'c'])
  })

  it('unrated places among themselves keep the incoming order', () => {
    const x = { placeId: 'x', placeName: 'X', reviews: [] }
    const y = { placeId: 'y', placeName: 'Y', reviews: [] }
    const z = { placeId: 'z', placeName: 'Z', reviews: [review('z', 1)] }
    const ranked = rankTopRated([x, y, z])
    // z is rated (even at 1 star) and beats both unrated places; x and y keep order.
    expect(ranked.map((r) => r.placeId)).toEqual(['z', 'x', 'y'])
  })

  it('does not mutate its input', () => {
    const a = { placeId: 'a', placeName: 'A', reviews: [review('a', 5)] }
    const b = { placeId: 'b', placeName: 'B', reviews: [] }
    const input = [a, b]
    rankTopRated(input)
    expect(input.map((p) => p.placeId)).toEqual(['a', 'b'])
  })

  it('handles the all-unrated list (every entry carries the honest zero case)', () => {
    const a = { placeId: 'a', placeName: 'A', reviews: [] }
    const b = { placeId: 'b', placeName: 'B', reviews: [] }
    const ranked = rankTopRated([a, b])
    expect(ranked.map((r) => r.summary.hasReviews)).toEqual([false, false])
    expect(ranked.map((r) => r.summary.displayAverage)).toEqual([null, null])
  })
})