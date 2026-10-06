import { REVIEW_SCORE_MAX, reviewRatingLine } from '../lib/reviews'
import type { ReviewSummaryRow } from '../lib/db'

/**
 * The aggregate rating line — the numbers the DATABASE computed (0052's
 * `review_summary` RPC), rendered as the value, five stars and the review
 * count. The sentence and the honest zero case are `reviews.reviewRatingLine`
 * (a pure rule with its sibling test); this component only draws them.
 *
 * WHY IT IS A COMPONENT AND NOT MARKUP IN ONE PAGE (the reviews-inline slice).
 * It used to live in `PlaceDetailsPage.tsx` alone. That slice renders the same
 * line on `/place/:id` as well — the founder, annotated on the place page's old
 * "What parents say about this place →" link: *"wouldn't you see what parents
 * say about this place and they're rating right here?"* — and a second copy of
 * this block is exactly the drift the one-copy rule exists to stop. The shared
 * element keeps ONE `data-testid="place-rating-line"`, one rounding, and one
 * source (the RPC); only its mount site differs.
 *
 * A failed read renders NOTHING — every caller mounts this only when its
 * summary read settled (`summary !== null`), so a failed read can never render
 * "0.0 out of 5". The zero case is the explicit invitation
 * ("Be the first to rate {place}."), never a score the place did not earn.
 */
export function PlaceRatingLine({
  summary,
  placeName,
  className = 'mt-1 flex items-center gap-2',
}: {
  /** The RPC's row: `review_count` plus the one-decimal average, or null. */
  summary: ReviewSummaryRow
  /** The place's name, for the sentence the zero case names it in. */
  placeName: string
  /** The wrapper's layout classes; the default is the details page's own. */
  className?: string
}) {
  const rated = summary.display_average !== null && summary.review_count > 0
  return (
    <div data-testid="place-rating-line" className={className}>
      {rated ? (
        <>
          <span className="text-base font-semibold text-slate-900">
            {Number(summary.display_average).toFixed(1)}
          </span>
          <span aria-hidden="true" className="flex items-center gap-0.5 text-amber-700">
            {Array.from({ length: REVIEW_SCORE_MAX }, (_, i) => (
              <StarGlyph
                key={i}
                filled={i + 1 <= Math.round(Number(summary.display_average ?? 0))}
              />
            ))}
          </span>
          <span className="sr-only">
            {reviewRatingLine(summary.review_count, summary.display_average, placeName)}
          </span>
          <span aria-hidden="true" className="text-sm text-slate-600">
            {summary.review_count === 1 ? '1 review' : `${summary.review_count} reviews`}
          </span>
        </>
      ) : (
        <p className="text-sm text-slate-600">
          {reviewRatingLine(summary.review_count, summary.display_average, placeName)}
        </p>
      )}
    </div>
  )
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
