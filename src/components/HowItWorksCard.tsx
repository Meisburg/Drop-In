import { FirstRunCard } from './FirstRunCard'
import {
  TOUR_BODY,
  TOUR_LINES,
  TOUR_PRIMARY_LABEL,
  TOUR_PROGRESS_LABEL,
  TOUR_TITLE,
} from '../lib/firstRunTour'

/**
 * V28 r2 slice 5 — the run's ending: the "How Drop In works" tour card.
 *
 * It replaces the places list (r1's ending). The run now ends by TEACHING the
 * app: one line for each of the four tabs and for the centre Post action, and
 * the Profile line carries the built-but-invisible flow (linking a partner's
 * account, whose form is the only driver of the parent-name search). This is
 * the parent's
 * first meeting with the nav: the nav does not render during the run at all
 * (`navRenders` in App.tsx is signed-in AND not the first run), so this card
 * is the bridge and its CTA is the crossing.
 *
 * PRESENTATIONAL (the build law): the words are data in
 * `src/lib/firstRunTour.ts`, where `firstRunTour.test.ts` pins the honesty
 * rule as PROPERTIES — every line says what a control DOES, and every category
 * the card names is one the app offers a chip for (a kind it withholds has
 * zero rows). This component renders them and emits the one callback it has —
 * it reads nothing, decides nothing, and performs no places read.
 *
 * ⚠️ THE testid is STILL `first-run-finish-card`, on purpose. It is asserted
 * by `e2e/auth.setup.ts` (EVERY spec's setup), `e2e/fixtures.ts`
 * (`finishSignup`, 17 consumers) and `e2e/signup-zip-fallback.e2e.ts`. The
 * component's name changed with its job; the locator did not, because renaming
 * it would break the shared setup of the whole e2e suite.
 */
export function HowItWorksCard({
  onGoToFeed,
  testId = 'first-run-finish-card',
}: {
  /** The CTA's navigation — the caller decides the destination. */
  onGoToFeed: () => void
  testId?: string
}) {
  return (
    <FirstRunCard
      progressLabel={TOUR_PROGRESS_LABEL}
      title={TOUR_TITLE}
      body={TOUR_BODY}
      primaryLabel={TOUR_PRIMARY_LABEL}
      onPrimary={onGoToFeed}
      testId={testId}
    >
      <ul className="flex flex-col gap-2">
        {TOUR_LINES.map((line) => (
          <li
            key={line.label}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2"
          >
            <span className="text-sm font-medium text-slate-800">{line.label}</span>
            <span className="mt-0.5 block text-sm text-slate-600">{line.detail}</span>
          </li>
        ))}
      </ul>
    </FirstRunCard>
  )
}
