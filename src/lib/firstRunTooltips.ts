/**
 * r3-7 — the first-run tooltips: pure decisions for the lightbox tour that
 * teaches the feed's controls to a parent whose first run JUST ended.
 *
 * The run ends by navigating to the feed (r3-D3 removed the ending card — the
 * feed IS the landing). r3-7 adds a short lightboxed tour on arrival: a dim
 * veil, a ring around the control the current step teaches, and a small card
 * that says what that control does. The steps are the tour's own five lines
 * (`TOUR_LINES` in `firstRunTour.ts`), each bound to the real control it
 * describes — the module IMPORTS the copy, it never restates it (the one-copy
 * rule; `firstRunTooltips.test.ts` pins the identity).
 *
 * The pieces this module owns (all pure — the component renders, it does not
 * decide):
 *
 *   - the SHARED dismissal fact. The nudge's key (previously named in
 *     `App.tsx`) is extended: writing it stands down BOTH the resume nudge
 *     (unfinished runs) and the tooltips (finished runs) for the rest of the
 *     tab. The two surfaces are mutually exclusive — the gate below reads the
 *     run's completion clause (`homeZipSet`) — so one stored fact covers
 *     both. That is the "existing persisted fact" the brief reuses; no
 *     second or third dismissal fact exists.
 *   - the TRANSIENT trigger. "The run just ended in this tab" is a router
 *     navigation state (set by `OnboardingPage`'s finish redirect), not a
 *     stored key: it dies with the tab's history, so a new tab, a back/forward
 *     revisit without the state, or a plain load of the feed never re-arms.
 *     (The state IS `history.state`, which survives a reload of the same
 *     entry — deliberate: a parent who reloads before dismissing the tour
 *     gets it again; the persisted dismissal fact above is what keeps a
 *     second load quiet once they stand it down.)
 *   - the steps: the tour's lines, each mapped to the testid of the real
 *     control it teaches.
 *   - the gate: when the tour shows at all.
 *   - the card placement: a pure function of the target's rect, the viewport,
 *     and the card's own size.
 */

import { TOUR_LINES } from './firstRunTour'

/**
 * The one stored dismissal fact for the first-run surfaces (nudge AND
 * tooltips). sessionStorage — per tab, the same lifetime the nudge's docblock
 * chose in `App.tsx`. The value is UNCHANGED from the nudge's; moving the
 * name here keeps it named in exactly one place, and both call sites now
 * read and write it through the helpers below.
 */
export const FIRST_RUN_DISMISSED_KEY = 'dropin.first-run.nudge-dismissed'

/**
 * Read the dismissal fact. Injected storage (the `theme.ts` precedent — the
 * module stays free of browser globals); the caller owns the window guard.
 * Defensive: a locked-down browser (sessionStorage throws) degrades to
 * "not dismissed" — the surfaces show, they never crash.
 */
export function readFirstRunDismissed(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return storage.getItem(FIRST_RUN_DISMISSED_KEY) !== null
  } catch {
    return false
  }
}

/**
 * Write the dismissal fact. Best-effort: a locked-down browser simply does
 * not carry it to the next mount (the current mount already stood the
 * surface down in its own state), so the write swallows its throw.
 */
export function markFirstRunDismissed(storage: Pick<Storage, 'setItem'>): void {
  try {
    storage.setItem(FIRST_RUN_DISMISSED_KEY, '1')
  } catch {
    // A locked-down browser: the dismissal applies to this mount only.
  }
}

/**
 * The transient trigger — "the run just ended in this tab". `OnboardingPage`
 * sets it on the finish redirect's navigation; the feed's gate reads it.
 * A plain object (structured-cloned into `history.state`), never a function
 * or DOM node — router state must survive a reload losslessly.
 */
export const FIRST_RUN_TOOLTIPS_ARMED_STATE = { firstRunTooltipsArmed: true } as const

/** The navigation state that arms the tour for the entry that carries it. */
export type FirstRunTooltipsArmedState = typeof FIRST_RUN_TOOLTIPS_ARMED_STATE

/**
 * Pure guard for the navigation state. It reads, it does not navigate: the
 * armed flag is a fact about the ENTRY, and stripping the state (the way
 * `justPosted` strips its own) would break the reload-survival that makes
 * "does not reshow on a second load" fall out of the persisted fact alone.
 */
export function isFirstRunTooltipsArmed(state: unknown): state is FirstRunTooltipsArmedState {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { firstRunTooltipsArmed?: unknown }).firstRunTooltipsArmed === true
  )
}

/**
 * The real control each tour line points at, by the control's testid.
 *
 * "Drop Ins" points at the feed's own section header — the surface the line
 * teaches (the feed IS the Drop Ins tab); the other four point at the nav
 * controls in the order the nav renders them (bottom bar below `md`, left
 * rail above it — the tour works in both arrangements because it measures
 * the target's rect, not its layout).
 */
export const TOOLTIP_TARGET_TEST_IDS = {
  feed: 'feed-section-header',
  inbox: 'nav-tab-inbox',
  post: 'feed-post-drop-in',
  places: 'nav-tab-places',
  profile: 'nav-tab-profile',
} as const

/** Which real control a tooltip step points at. */
export type TooltipTargetId = keyof typeof TOOLTIP_TARGET_TEST_IDS

/** One tooltip step: a tour line bound to the control it describes. */
export interface TooltipStep {
  /** The control's own word (the tour line's label). */
  label: string
  /** What the control DOES (the tour line's detail). */
  detail: string
  /** The real control the tooltip points at. */
  target: TooltipTargetId
}

/**
 * The label→target table. It covers exactly the labels in
 * `FIRST_RUN_TOOLTIPS_LABELS` (pinned together: a label that joins
 * `TOUR_LINES` without a table entry degrades to pointing at the feed
 * instead of crashing the lookup, and the sibling test pins that every
 * CURRENT label resolves through the table, not the fallback).
 */
const LABEL_TO_TARGET: Record<string, TooltipTargetId> = {
  'Drop Ins': 'feed',
  Inbox: 'inbox',
  'Post a drop-in': 'post',
  Places: 'places',
  Profile: 'profile',
}

/**
 * The labels the table covers — derived from the table itself (one source
 * of truth), so the test's "every current label resolves through the table"
 * pin cannot drift from the mapping it polices.
 */
export const FIRST_RUN_TOOLTIPS_LABELS: readonly string[] = Object.keys(LABEL_TO_TARGET)

/** Which control a tour line teaches. */
export function tooltipTargetForLabel(label: string): TooltipTargetId {
  return LABEL_TO_TARGET[label] ?? 'feed'
}

/**
 * The tooltip sequence: the tour's five lines, in the nav's order, each bound
 * to the real control it describes. The copy is IMPORTED from
 * `firstRunTour.ts` (the one-copy rule) — a line that drifts from the tour's
 * words is a caught divergence, not a silent one.
 */
export const TOOLTIPS_STEPS: readonly TooltipStep[] = TOUR_LINES.map((line) => ({
  label: line.label,
  detail: line.detail,
  target: tooltipTargetForLabel(line.label),
}))

/**
 * The gate's inputs. Every fact the component would otherwise decide on,
 * named once:
 *
 *   - `signedIn` — the feed is a protected surface; the gate says it.
 *   - `homeZipSet` — the run's COMPLETION clause (the same fact the nudge
 *     reads, from `lib/homeZip`): a zip set means the run is done, and the
 *     tooltips are the done-run's surface. The nudge is the not-done-run's.
 *   - `armed` — the transient trigger: the run just ended in this tab.
 *   - `dismissed` — the stored fact: a first-run surface was stood down.
 */
export interface FirstRunTooltipFacts {
  signedIn: boolean
  homeZipSet: boolean
  armed: boolean
  dismissed: boolean
}

/**
 * When the tour shows: a signed-in parent, whose run is DONE, arriving the
 * moment it ended, who has not stood a first-run surface down. Each clause
 * is load-bearing:
 *
 *   - no `armed` — a parent arriving any other way (nav, a fresh tab, a
 *     revisit) was never taught the tour; the feed teaches by doing.
 *   - no `homeZipSet` — the run is not over; the nudge owns unfinished runs.
 *   - `dismissed` — the parent already stood the tour (or the nudge) down;
 *     the persisted fact is what makes a second load quiet.
 */
export function shouldShowTooltips(facts: FirstRunTooltipFacts): boolean {
  return facts.signedIn && facts.homeZipSet && facts.armed && !facts.dismissed
}

/** Advance one step; `null` when the last step is done (the tour ends), or
 *    when `index` is not a step the tour can advance from (advance is only
 *    defined for a valid step that is not the last — a broken index never
 *    advances anywhere). */
export function nextTooltipStepIndex(index: number, total: number): number | null {
  if (total <= 0 || index < 0 || index >= total - 1) return null
  return index + 1
}

/** The step's progress chrome — "1 of 5". */
export function tooltipProgressLabel(index: number, total: number): string {
  return `${index + 1} of ${total}`
}

/** The target control's viewport rect (from `getBoundingClientRect`). */
export interface TooltipTargetRect {
  left: number
  top: number
  width: number
  height: number
}

/** The viewport the card must stay inside. */
export interface TooltipViewport {
  width: number
  height: number
}

/** The card's own size (measured by the caller, not assumed). */
export interface TooltipCardMetrics {
  width: number
  height: number
}

/** Where the card sits for a target, and which way it points. */
export interface TooltipPlacement {
  /** Which side of the target the card sits on. */
  side: 'above' | 'below'
  /** The card's viewport position (the overlay's coordinate space). */
  top: number
  left: number
}

const TOOLTIP_VIEWPORT_MARGIN = 8
const TOOLTIP_TARGET_GAP = 12

/**
 * Where the card sits for a target:
 *
 *   - BELOW it when there is room, ABOVE it when there is not (the nav's
 *     bottom-bar targets sit near the viewport's bottom edge — the card must
 *     not push them off-screen);
 *   - centered on the target when the viewport allows, clamped to
 *     `TOOLTIP_VIEWPORT_MARGIN` from the left/right edges otherwise;
 *   - clamped into the viewport top-to-bottom as well, so a degenerate
 *     target+card pair (card taller than the viewport) still renders
 *     somewhere sensible rather than at a negative top.
 *
 * Pure: the caller measures the three inputs (the card is rendered once,
 * invisibly, before its first placement).
 */
export function placeTooltip(
  target: TooltipTargetRect,
  viewport: TooltipViewport,
  card: TooltipCardMetrics,
  gap: number = TOOLTIP_TARGET_GAP,
): TooltipPlacement {
  const belowTop = target.top + target.height + gap
  const side: 'above' | 'below' =
    belowTop + card.height + TOOLTIP_VIEWPORT_MARGIN <= viewport.height ? 'below' : 'above'
  const top = side === 'below' ? belowTop : target.top - gap - card.height
  const centeredLeft = target.left + target.width / 2 - card.width / 2
  const left = clampNumber(
    centeredLeft,
    TOOLTIP_VIEWPORT_MARGIN,
    Math.max(TOOLTIP_VIEWPORT_MARGIN, viewport.width - card.width - TOOLTIP_VIEWPORT_MARGIN),
  )
  return { side, top: clampNumber(top, TOOLTIP_VIEWPORT_MARGIN, viewport.height - 1), left }
}

/** `clamp` that survives a degenerate range (card wider than the viewport). */
function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}
