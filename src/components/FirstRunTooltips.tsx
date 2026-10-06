import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  TOOLTIP_TARGET_TEST_IDS,
  TOOLTIPS_STEPS,
  nextTooltipStepIndex,
  placeTooltip,
  tooltipProgressLabel,
  type TooltipCardMetrics,
  type TooltipPlacement,
  type TooltipTargetRect,
} from '../lib/firstRunTooltips'
import { MODAL_OVER_LEAFLET_Z_CLASS } from '../lib/stacking'
import { TOUR_PROGRESS_LABEL, TOUR_TITLE } from '../lib/firstRunTour'

/**
 * r3-7 — the first-run tooltip tour, rendered over the feed.
 *
 * A lightbox VEIL (visual only), a ring around the control the current step
 * teaches, and a small card saying what that control does — the step's line
 * is the tour's own word (imported from `firstRunTour.ts`), never restated.
 *
 * v30-4: the veil and the ring are the SAME rectangle — the veil is a 9999px
 * spread shadow cast by the ring's own box, so the highlighted control sits in
 * a transparent hole rather than under the darkening. Before the first
 * measurement lands there is no ring, so a flat veil stands in for that one
 * frame.
 *
 * It is a tour, not a modal: no `role="dialog"`, no `aria-modal`, no focus
 * trap, no scroll lock, and it NEVER captures focus on load — the parent's
 * focus stays exactly where it was, Tab moves normally, and the two buttons
 * carry the repo's focus-visible rings like every other control.
 *
 * The v1 failure is pinned here so it cannot come back: the overlay root is
 * `pointer-events-none`. The veil, ring and card sit visually on top of the
 * app but are NOT interactive — a parent who ignores the tour taps straight
 * through to the control underneath, and that tap dismisses the tour (the
 * capture-phase `pointerdown` listener below). Only the Skip/Next buttons
 * opt back in (`data-first-run-tooltips-interactive`), so the tour is
 * drivable by pointer AND never blocks the app (the e2e suite's taps pass
 * through the first run exactly as they would without the tour).
 *
 * Dismissal, every path calling the caller's `onDismiss` (which persists the
 * shared first-run dismissal fact and stands the tour down for the tab — and
 * unmounts this component, whose listeners clean up with it):
 *   - Escape — a window `keydown` listener, cleaned up on unmount (the
 *     `ModalShell.tsx:135` pattern, WITHOUT the trap);
 *   - the Skip button;
 *   - any `pointerdown` that is not on the tour's own buttons.
 */
export function FirstRunTooltips({ onDismiss }: { onDismiss: () => void }) {
  const [step, setStep] = useState(0)
  const [targetRect, setTargetRect] = useState<TooltipTargetRect | null>(null)
  const [cardMetrics, setCardMetrics] = useState<TooltipCardMetrics | null>(null)
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  const testId = TOOLTIP_TARGET_TEST_IDS[TOOLTIPS_STEPS[step].target]

  // Measure the target and the card, and place the card beside it. The
  // component mounts in the SAME render as its first target (the feed's
  // content state), so the first pass finds it; the poll covers a target
  // that (re)mounts after the tour is already up. Re-runs on every step
  // (a new target) and on resize/scroll (the parent moving the world).
  useLayoutEffect(() => {
    let timer: number | undefined
    let disposed = false
    const measure = () => {
      if (disposed) return
      const target = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
      const card = cardRef.current
      if (target === null || card === null) {
        timer = window.setTimeout(() => measure(), 150)
        return
      }
      const rect = target.getBoundingClientRect()
      const rectNow: TooltipTargetRect = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }
      const metrics: TooltipCardMetrics = { width: card.offsetWidth, height: card.offsetHeight }
      /**
       * The app's PRIMARY NAVIGATION rect, handed to the placement so a card
       * beside the desktop left rail cannot cover the rail's own items — the
       * measured defect `placeTooltip`'s docblock records (a swallowed tap on
       * `nav-tab-inbox`). Below `md` the same `<nav>` is a horizontal bottom
       * bar and the rule does not fire, so the phone's placement is unchanged.
       * Absent on a route without the shell: the placement is then exactly
       * what it was before this parameter existed.
       */
      const navElement = document.querySelector<HTMLElement>('nav[aria-label="Primary"]')
      const navRect = navElement === null ? null : navElement.getBoundingClientRect()
      setTargetRect(rectNow)
      setCardMetrics(metrics)
      setPlacement(
        placeTooltip(
          rectNow,
          { width: window.innerWidth, height: window.innerHeight },
          metrics,
          undefined,
          navRect === null
            ? null
            : { left: navRect.left, top: navRect.top, width: navRect.width, height: navRect.height },
        ),
      )
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      disposed = true
      if (timer !== undefined) window.clearTimeout(timer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [testId])

  // Escape ends the whole tour, wherever focus is. A window-level listener
  // (the ModalShell pattern) WITHOUT the trap: the tour never captured
  // focus, so there is none to break out of.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  // Pointer dismissal: the first tap anywhere that is NOT on the tour's own
  // buttons ends the tour. Capture phase on document, so it runs before the
  // control underneath handles the event — and the control still gets the
  // event (the tour is pointer-events-none; nothing was blocked).
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const el: Element | null = event.target instanceof Element ? event.target : null
      if (el !== null && el.closest('[data-first-run-tooltips-interactive]') !== null) return
      onDismiss()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [onDismiss])

  const total = TOOLTIPS_STEPS.length
  const line = TOOLTIPS_STEPS[step]
  const advance = () => {
    const next = nextTooltipStepIndex(step, total)
    if (next === null) {
      onDismiss()
    } else {
      // A new step is a new target: clear the placement so the card hides
      // for the one frame before the new measurement lands.
      setStep(next)
      setPlacement(null)
      setTargetRect(null)
      setCardMetrics(null)
    }
  }

  // The decorations (ring + connector) need all three measurements; one
  // narrowed object keeps the render branch free of non-null assertions.
  const deco =
    placement !== null && targetRect !== null && cardMetrics !== null
      ? {
          ring: {
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          },
          connector:
            placement.side === 'below'
              ? {
                  top: targetRect.top + targetRect.height,
                  left: targetRect.left + targetRect.width / 2 - 1,
                  height: Math.max(0, placement.top - (targetRect.top + targetRect.height)),
                }
              : {
                  top: placement.top + cardMetrics.height,
                  left: targetRect.left + targetRect.width / 2 - 1,
                  height: Math.max(0, targetRect.top - placement.top - cardMetrics.height),
                },
        }
      : null

  return (
    <div
      data-testid="first-run-tooltips"
      className={`pointer-events-none fixed inset-0 ${MODAL_OVER_LEAFLET_Z_CLASS}`}
    >
      {deco === null ? (
        // Before the first measurement lands there is no ring to spotlight, so
        // the flat veil stands in for the one frame the card is still invisible.
        // It carries the SAME testid as the cutout veil (v30-10 `ocr` finding):
        // without it the element does not exist in that frame, and a spec that
        // waits for it inherits Playwright's 5s default instead of this tour's
        // own 30s gate on a slow host. The box-identity assertion in the spec
        // still measures the CUTOUT veil, because it checks the ring first.
        <div
          aria-hidden="true"
          data-testid="first-run-tooltips-veil"
          className="absolute inset-0 bg-slate-900/25"
        />
      ) : (
        // v30-4: the veil IS the ring's own shadow — a 9999px spread around
        // `deco.ring`, so the hole in the dark is exactly the rectangle the ring
        // outlines and the control being taught renders at full brightness.
        // ONE derivation feeds both (founder annotation 2: the darkened icon
        // inside the ring was the defect). Same idiom as CropPhotoDialog's
        // circular mask.
        <div
          aria-hidden="true"
          data-testid="first-run-tooltips-veil"
          className="absolute rounded-2xl"
          style={{ ...deco.ring, boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.25)' }}
        />
      )}

      {deco !== null ? (
        <div
          aria-hidden="true"
          data-testid="first-run-tooltips-ring"
          className="absolute rounded-2xl ring-2 ring-indigo-400"
          style={deco.ring}
        />
      ) : null}

      {deco !== null ? (
        <div
          aria-hidden="true"
          className="absolute w-0.5 bg-indigo-400/60"
          style={deco.connector}
        />
      ) : null}

      <div
        ref={cardRef}
        className={`pointer-events-auto absolute w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 bg-white p-4 shadow-lg ${deco !== null ? '' : 'invisible'}`}
        style={
          placement !== null
            ? { top: placement.top, left: placement.left }
            : { top: 0, left: 0 }
        }
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{TOUR_TITLE}</p>
        <p className="mt-2 text-base font-semibold text-slate-900">{line.label}</p>
        <p className="mt-1 text-sm leading-5 text-slate-600">{line.detail}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs tabular-nums text-slate-500">{tooltipProgressLabel(step, total)}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-first-run-tooltips-interactive="true"
              onClick={onDismiss}
              className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              Skip
            </button>
            <button
              type="button"
              data-first-run-tooltips-interactive="true"
              onClick={advance}
              className="flex min-h-11 items-center rounded-md bg-indigo-600 px-3 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              {step === total - 1 ? TOUR_PROGRESS_LABEL : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
