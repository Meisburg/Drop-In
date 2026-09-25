import { Link } from 'react-router'
import { NAV_ICONS } from './icons'

/**
 * V24 slice 02: THE ONE BACK CONTROL.
 *
 * Every page-level back affordance in the app renders through this component,
 * so a parent always sees the same circular control with the same glyph, size,
 * and focus ring — instead of one text "←" per page (the Inbox thread header's
 * bordered square, PlacePage's bare link, PlaceDetailsPage's labelled link).
 *
 * The destination label does NOT live inside the control: the control says
 * "Back" (its accessible name) and the page's heading names where it goes, so
 * the two can never drift apart. Callers that need a visible label render it
 * beside the control, not inside it.
 *
 * Shape rules (the mobile-audit floor): a 44px CIRCLE (h-11 w-11 rounded-full),
 * the stroked chevron-left glyph from the icon family (24px viewBox, stroke
 * 1.8, currentColor — see icons.ts), an outline-suppressed focus state that
 * puts its cue BACK on (border + ring, the repo convention), and no transition
 * under reduced motion. The tokens are theme-safe (slate/indigo re-point by the
 * dark block in index.css), so the control reads correctly in both appearances.
 */
export function BackControl({
  onClick,
  to,
  testId,
}: {
  /** Button mode: fires when tapped (e.g. closing the Inbox thread view). */
  onClick?: () => void
  /** Link mode: navigates (e.g. a place page back to /browse). Mutually exclusive with `onClick`. */
  to?: string
  /** Optional data-testid for specs (the call site keeps its own id, e.g. details-back-to-place). */
  testId?: string
}) {
  const classes =
    'flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm outline-none transition-colors motion-reduce:transition-none hover:bg-slate-50 focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200'
  const ariaLabel = 'Back'

  if (to !== undefined) {
    return (
      <Link to={to} aria-label={ariaLabel} data-testid={testId} className={classes}>
        <ChevronLeft />
      </Link>
    )
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      data-testid={testId}
      onClick={onClick}
      className={classes}
    >
      <ChevronLeft />
    </button>
  )
}

/** The chevron itself — the stroked family's path, rendered at 24px. */
function ChevronLeft() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={NAV_ICONS['chevron-left']} />
    </svg>
  )
}