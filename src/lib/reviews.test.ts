import { describe, expect, it } from 'vitest'
import {
  INLINE_REVIEW_LIMIT,
  REVIEW_BODY_MAX_LENGTH,
  REVIEW_SCORE_MAX,
  REVIEW_SCORE_MIN,
  hasPlaceRating,
  hasReviewed,
  inlineReviewHighlights,
  inlineReviewsEmptyLine,
  isCommentedReview,
  rankTopRated,
  reviewComposeLabel,
  reviewRatingLine,
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
// The aggregate rating line — the sentence a place page renders above the wall.
// ---------------------------------------------------------------------------

describe('reviewRatingLine', () => {
  it('rated: "4.3 out of 5 · 12 reviews" (the screen-reader value, not glyphs)', () => {
    expect(reviewRatingLine(12, 4.3, 'Green Lake Park')).toBe('4.3 out of 5 · 12 reviews')
  })

  it('one review: singular "review", not "reviews"', () => {
    expect(reviewRatingLine(1, 5, 'Corner Park')).toBe('5.0 out of 5 · 1 review')
  })

  it('formats the DB average to one decimal without re-rounding (a display rule, not arithmetic)', () => {
    // The RPC returns round(avg::numeric, 1) — already final. Number() recovers
    // it from the numeric-as-string; toFixed(1) only formats for display.
    expect(reviewRatingLine(3, 4.7, 'P')).toBe('4.7 out of 5 · 3 reviews')
    expect(reviewRatingLine(2, 4, 'P')).toBe('4.0 out of 5 · 2 reviews')
  })

  it('zero reviews: names the place and invites the first review (never "0.0")', () => {
    expect(reviewRatingLine(0, null, 'New Corner Park')).toBe(
      'Be the first to rate New Corner Park.',
    )
  })

  it('a blank place name degrades to the invitation without a trailing space', () => {
    expect(reviewRatingLine(0, null, '   ')).toBe('Be the first to rate this place.')
  })

  it('a null average with a positive count still reads as unrated (never 0.0)', () => {
    expect(reviewRatingLine(0, null, 'P')).toBe('Be the first to rate P.')
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

// ---------------------------------------------------------------------------
// The place page's inline block (the reviews-inline slice).
//
// Four seams, each pinned on the boundary the page depends on: the button's
// label in both states, who counts as the viewer's own review, how many
// commented reviews the projection keeps (and that it does NOT re-order them),
// and the honest sentence when there is no body to show.
// ---------------------------------------------------------------------------

describe('reviewComposeLabel', () => {
  it('invites a review when the viewer has none', () => {
    expect(reviewComposeLabel(false)).toBe('Add your review')
  })

  it('offers the edit when the viewer already reviewed this place', () => {
    expect(reviewComposeLabel(true)).toBe('Edit your review')
  })
})

describe('INLINE_REVIEW_LIMIT', () => {
  it('is 3 — the place page shows three bodies and the wall holds the rest', () => {
    expect(INLINE_REVIEW_LIMIT).toBe(3)
  })
})

describe('hasReviewed', () => {
  const rows = [
    { authorProfileId: 'parent-a' },
    { authorProfileId: 'parent-b' },
  ]

  it('is true when the profile wrote one of these rows', () => {
    expect(hasReviewed(rows, 'parent-b')).toBe(true)
  })

  it('is false for a signed-in parent who has not reviewed this place', () => {
    expect(hasReviewed(rows, 'parent-c')).toBe(false)
  })

  it('is false for an unknown viewer — a settling profile is not an author', () => {
    expect(hasReviewed(rows, null)).toBe(false)
    expect(hasReviewed(rows, undefined)).toBe(false)
    expect(hasReviewed(rows, '')).toBe(false)
  })

  it('is false for an empty row set (the zero case)', () => {
    expect(hasReviewed([], 'parent-a')).toBe(false)
  })
})

describe('inlineReviewHighlights', () => {
  function withAuthor(id: string, body: string | null, score = 5): Review {
    return { ...review('park-a', score, body), authorProfileId: id }
  }

  it('keeps at most `limit` bodies and drops the rest', () => {
    const rows = [
      withAuthor('a', 'first'),
      withAuthor('b', 'second'),
      withAuthor('c', 'third'),
      withAuthor('d', 'fourth'),
      withAuthor('e', 'fifth'),
    ]
    const highlights = inlineReviewHighlights(rows, INLINE_REVIEW_LIMIT)
    expect(highlights.map((r) => r.body)).toEqual(['first', 'second', 'third'])
  })

  it('preserves the incoming order rather than sorting (the wall read owns the order)', () => {
    // Deliberately NOT newest-first: if this function sorted, the order would
    // change here and the inline block would disagree with the wall.
    const rows = [
      { ...review('park-a', 4, 'older'), createdAt: '2026-08-01T10:00:00.000Z' },
      { ...review('park-a', 5, 'newer'), createdAt: '2026-09-01T10:00:00.000Z' },
    ]
    expect(inlineReviewHighlights(rows, INLINE_REVIEW_LIMIT).map((r) => r.body)).toEqual([
      'older',
      'newer',
    ])
  })

  it('skips stars-only reviews — a row with no words has nothing to show', () => {
    const rows = [
      withAuthor('a', null),
      withAuthor('b', '   '),
      withAuthor('c', 'the only words'),
    ]
    const highlights = inlineReviewHighlights(rows, INLINE_REVIEW_LIMIT)
    expect(highlights).toHaveLength(1)
    expect(highlights[0].body).toBe('the only words')
  })

  it('returns nothing for a zero or negative limit, and nothing for no rows', () => {
    expect(inlineReviewHighlights([withAuthor('a', 'words')], 0)).toEqual([])
    expect(inlineReviewHighlights([withAuthor('a', 'words')], -1)).toEqual([])
    expect(inlineReviewHighlights([], INLINE_REVIEW_LIMIT)).toEqual([])
  })

  it('returns the author-carrying row type unchanged (the read shape flows through)', () => {
    const rows = [{ ...withAuthor('a', 'words'), authorDisplayName: 'Sam R.' }]
    expect(inlineReviewHighlights(rows, INLINE_REVIEW_LIMIT)[0].authorDisplayName).toBe('Sam R.')
  })

  it('does not mutate its input', () => {
    const rows = [withAuthor('a', 'first'), withAuthor('b', 'second')]
    inlineReviewHighlights(rows, 1)
    expect(rows.map((r) => r.body)).toEqual(['first', 'second'])
  })
})

describe('inlineReviewsEmptyLine', () => {
  it('names the place when nobody has reviewed it', () => {
    expect(inlineReviewsEmptyLine(0, 'Green Lake Park')).toBe(
      'No one has reviewed Green Lake Park yet.',
    )
  })

  it('falls back to "this place" rather than a dangling sentence', () => {
    expect(inlineReviewsEmptyLine(0, '   ')).toBe('No one has reviewed this place yet.')
  })

  it('reports ratings without words honestly, never "no reviews"', () => {
    // The rating line above this sentence shows "3 reviews"; a "no reviews"
    // sentence under it would contradict the number the parent just read.
    expect(inlineReviewsEmptyLine(1, 'Green Lake Park')).toBe(
      'One rating so far, with no comment.',
    )
    expect(inlineReviewsEmptyLine(3, 'Green Lake Park')).toBe(
      '3 ratings so far, with no comments.',
    )
  })

  it('treats a negative count as the zero case (an unread count is not a review)', () => {
    expect(inlineReviewsEmptyLine(-1, 'Green Lake Park')).toBe(
      'No one has reviewed Green Lake Park yet.',
    )
  })
})

/**
 * V32 v32-9 (A10) — the drop-in page's visibility threshold.
 *
 * Each case names the defect it detects. The dangerous ones are silent: a
 * zero-average rating drawn as a real score, or the "Be the first to rate"
 * invitation leaking onto a page that is not where anyone reviews a place.
 */
describe('hasPlaceRating (V32-9 — the drop-in page draws only an EARNED rating)', () => {
  it('is true for a place that has reviews and an average', () => {
    expect(hasPlaceRating({ review_count: 12, display_average: 4.3 })).toBe(true)
  })

  it('is FALSE for an unrated place — the case the drop-in page exists to hide', () => {
    // The defect: `PlaceRatingLine`'s zero case is an INVITATION ("Be the first
    // to rate {place}."), which is right on a place page and noise on a drop-in
    // page. An unrated place must render nothing at all.
    expect(hasPlaceRating({ review_count: 0, display_average: null })).toBe(false)
  })

  it('is FALSE when the count is positive but the average is null (the guard, not a live shape)', () => {
    // The current RPC cannot produce this — db.ts's normaliser keeps a null
    // average distinct from 0 for exactly this reason — but the guard refuses it
    // structurally, because what it prevents is drawing a rating the place has
    // not earned. Pinning it means a future shape change cannot quietly start
    // rendering a numberless rating.
    expect(hasPlaceRating({ review_count: 7, display_average: null })).toBe(false)
  })

  it('is NOT a truthiness check on the average — a real 0 behaves like a real number', () => {
    // `if (!average)` would hide a legitimate 0. The normaliser yields a real
    // `number | null`, so 0 must be treated as a VALUE: present, and therefore
    // visible when the count says someone rated it.
    expect(hasPlaceRating({ review_count: 3, display_average: 0 })).toBe(true)
  })

  it('is false for a negative count (defensive: no count is not a rating)', () => {
    expect(hasPlaceRating({ review_count: 0, display_average: 5 })).toBe(false)
  })
})
