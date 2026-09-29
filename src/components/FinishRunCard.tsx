import { Link } from 'react-router'
import { formatDistanceLabel } from '../lib/feed'
import { placeHasHours, placeKindLabel, placePath, type FinishRunPlace } from '../lib/places'
import { FirstRunCard } from './FirstRunCard'
import { RadiusEmptyState } from './RadiusEmptyState'

/**
 * V28 slice 6 — the finish card: the run's own ending, rendered at
 * /onboarding when the run is complete (the re-keyed guard no longer bounces
 * the finished parent to the feed). It shows up to 3 REAL places near the
 * viewer (hours-published first, the lib decision `finishRunPlaces`), each
 * linking into the place page where hosting starts, and its primary CTA
 * carries the parent to the feed — the way the removed redirect used to.
 *
 * PRESENTATIONAL (the build law): the ranking arrives as `picks`; this
 * component renders:
 * - the picks (name, kind, distance, hours — each row a Link to placePath),
 * - an in-flight placeholder while the places read is pending,
 * - the flow's honest empty state (the SHARED RadiusEmptyState — its
 *   escapes + post CTA are the next steps) when the picks are empty,
 * - an honest error line when the read failed (the CTA below still lands
 *   the parent on the feed).
 *
 * It makes NO claim about upcoming drop-ins — the list is where the parent
 * CAN host, not what is already happening. The card's words are module
 * constants (data, not JSX — the 4a precedent) and live HERE: not in
 * FIRST_RUN_COPY (whose key set its test pins to the 5-card inventory) and
 * not in the nudge copy (the nudge stays generic, per the plan).
 */
const FINISH_RUN_CARD_COPY = {
  progressLabel: 'All done',
  title: 'You’re all set',
  primaryLabel: 'Go to your feed',
} as const

/**
 * The card's body, keyed by the PICKS STATE (fix 1, the batch's honesty
 * ruling): the places claim is true only when the list actually renders.
 * The other states each show their OWN honest line below (the loading
 * line, the shared RadiusEmptyState, the error line) and pass NO body —
 * a claim above them would say "here are a few real places near you"
 * and then say there are none (the plan's pinned bullet: the no-places
 * fallback makes no claim about places that do not exist).
 */
const FINISH_RUN_CARD_BODY = {
  /** picks non-empty — the list is on screen; the sentence is true. */
  withPicks:
    'Here are a few real places near you to host a drop-in. Pick one and start from its page.',
  /** loading / empty / error — no body: the state's own line is the truth. */
  withoutPicks: undefined,
} as const

export function FinishRunCard({
  picks,
  picksLoading,
  picksError,
  radiusMiles,
  onGoToFeed,
  testId = 'first-run-finish-card',
}: {
  /** The ranked selection (lib/finishRunPlaces; ≤3, hours-published first). */
  picks: FinishRunPlace[]
  /** The places read is in flight (the shared empty state never renders in its place). */
  picksLoading: boolean
  /** The places read failed (honest line; the CTA below still works). */
  picksError: string | null
  /** The viewer's radius — the empty state's honest count speaks in it. */
  radiusMiles: number
  /** The CTA's navigation (the caller decides the destination). */
  onGoToFeed: () => void
  testId?: string
}) {
  // Fix 1: the body branches on the picks state IN THE component (the
  // build law — presentation branching, not a lib decision): the places
  // claim renders only when there ARE picks; loading, empty, and error
  // each carry their own honest line and no claim above it.
  const body =
    picks.length > 0 ? FINISH_RUN_CARD_BODY.withPicks : FINISH_RUN_CARD_BODY.withoutPicks
  return (
    <FirstRunCard
      progressLabel={FINISH_RUN_CARD_COPY.progressLabel}
      title={FINISH_RUN_CARD_COPY.title}
      body={body}
      primaryLabel={FINISH_RUN_CARD_COPY.primaryLabel}
      onPrimary={onGoToFeed}
      testId={testId}
    >
      {picksError !== null ? (
        <p role="alert" className="text-sm text-red-600">
          {picksError}
        </p>
      ) : picksLoading ? (
        <p className="text-sm text-slate-500" data-testid="finish-run-places-loading">
          Finding places near you…
        </p>
      ) : picks.length === 0 ? (
        <RadiusEmptyState radiusMiles={radiusMiles} />
      ) : (
        <ul className="flex flex-col gap-2" data-testid="finish-run-places">
          {picks.map((pick) => {
            const hours =
              placeHasHours(pick.place) && pick.place.hours !== null && pick.place.hours !== undefined
                ? pick.place.hours
                : null
            return (
              <li key={pick.place.id}>
                <Link
                  to={placePath(pick.place.id)}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 transition-colors motion-reduce:transition-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <span className="text-sm font-medium text-slate-800">{pick.place.name}</span>
                  <span className="text-right text-xs text-slate-500">
                    {placeKindLabel(pick.place.kind)} · {formatDistanceLabel(pick.distanceMiles)}
                    {hours !== null ? ` · ${hours.display}` : ''}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </FirstRunCard>
  )
}
