import { Link } from 'react-router'

/**
 * V28 slice 2a: the "we need a place before you can do this" line, shared by
 * the two write sites that now carry the home-ZIP requirement at the point of
 * action — the going-ping toggle (PlaydateDetailPage) and the host submit
 * (NewPlaydatePage). Slice 2b removes the app-wide onboarding wall; this is
 * what replaces it in place, so the requirement exists at both write sites
 * BEFORE the wall comes down.
 *
 * Presentational only (the build law: React renders and does not decide): no
 * data access, no routing logic. The page decides WHEN the notice shows (it
 * checks its own `profile.home_zip`); this component only says what it says
 * and where its control goes. The card reuses RadiusEmptyState's empty-state
 * pattern (rounded bordered card + indigo CTA) rather than inventing one; the
 * control is a real Link to the /onboarding location card — the 44px floor
 * (`min-h-11`, the app's N9 tap-target idiom) and its own visible focus cue,
 * never a bare string.
 */
export function LocationRequiredNotice() {
  return (
    <div
      data-testid="location-required-notice"
      className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm"
    >
      <p className="text-sm text-slate-600">
        Set your home location first — we need a place to know which drop-ins are near you.
      </p>
      <Link
        to="/onboarding"
        className="flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors motion-reduce:transition-none hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
      >
        Set location
      </Link>
    </div>
  )
}
