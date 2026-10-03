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
  disabled = false,
}: {
  /** Button mode: fires when tapped (e.g. closing the Inbox thread view). */
  onClick?: () => void
  /** Link mode: navigates (e.g. a place page back to /browse). Mutually exclusive with `onClick`. */
  to?: string
  /** Optional data-testid for specs (the call site keeps its own id, e.g. details-back-to-place). */
  testId?: string
  /**
   * V28 r3-5 (r3-D2): refuse the move while a write is in flight.
   *
   * ⚠️ THIS IS THE VISIBLE HALF, NOT THE GUARD. The caller's handler refuses
   * independently (`goBack` returns early on `saving`), because a disabled button
   * is not a wall: a keyboard, a stale render or a future caller reaches the
   * handler directly. Both halves exist so the control is not merely *disabled*
   * but genuinely *load-bearing* — see the handler's comment in OnboardingPage.
   *
   * Link mode ignores it (a `Link` has no disabled state); a caller that can be
   * busy uses button mode.
   */
  disabled?: boolean
}) {
  const classes =
    'flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm outline-none transition-colors motion-reduce:transition-none hover:bg-slate-50 focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 disabled:opacity-50 disabled:hover:bg-white'
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
      disabled={disabled}
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

/**
 * V28 r3-5 (r3-D2) — THE FORWARD TWIN, added here so the two first-run arrows are
 * one control pair (same circle, same glyph family, same focus ring) rather than
 * a chevron left invented twice.
 *
 * ⚠️ IT IS BUTTON-ONLY, and that is deliberate: "forward" on the first run is not
 * a destination, it is the UNDO of a back move (see `goForward` in
 * OnboardingPage — advancing is the card's WRITE, so a general next-link would
 * have to duplicate every card's primary). There is therefore no `to` mode to
 * support, and offering one would invite exactly that duplication.
 */
export function ForwardControl({
  onClick,
  testId,
  disabled = false,
}: {
  /** Fires when tapped. */
  onClick?: () => void
  /** Optional data-testid for specs. */
  testId?: string
  /** Refuse the move while a write is in flight — the visible half of the guard. */
  disabled?: boolean
}) {
  const classes =
    'flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm outline-none transition-colors motion-reduce:transition-none hover:bg-slate-50 focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 disabled:opacity-50 disabled:hover:bg-white'

  return (
    <button
      type="button"
      aria-label="Forward"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={classes}
    >
      <ChevronRight />
    </button>
  )
}

/** The mirrored chevron — the same stroked family, rendered at 24px. */
function ChevronRight() {
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
      <path d={NAV_ICONS['chevron-right']} />
    </svg>
  )
}
