import { useEffect } from 'react'
import type { RefObject } from 'react'
import { nextTrapTarget, shouldInterceptTab } from '../lib/focusTrap'

/**
 * Traps Tab/Shift+Tab inside `ref.current` while `active`: focus is moved into
 * the dialog by its own opener effect and the browser's escaping move is
 * intercepted at both edges.
 *
 * RESTORING FOCUS TO THE OPENER IS CONDITIONAL, and the cleanup below is why it
 * silently does nothing for some callers. It gives focus back to whatever had
 * focus when this effect RAN. An owner that focuses its first control in an
 * effect declared BEFORE its `useFocusTrap` call moves focus into the dialog
 * first, so `previouslyFocused` here is that IN-DIALOG control rather than the
 * trigger; when the dialog unmounts, `document.contains(previouslyFocused)` is
 * false and the restore is skipped, leaving `document.activeElement` on `<body>`.
 * That order is the whole mechanism and it is verifiable by reading the call
 * sites — no run is needed to see which effect React executes first.
 *
 * The affected set is therefore exact, and it is NOT every caller:
 *   - `DeletePlaydateDialog.tsx` (focus at `:46`, trap at `:53`) and
 *     `ReportDialog.tsx` (`:46`, `:53`) declare focus first — restore LOST;
 *   - `ModalShell.tsx` does the same (its focus effect precedes its
 *     `useFocusTrap`), so its two consumers `ConfirmDialog` and
 *     `RsvpConfirmationDialog` lose it too;
 *   - `LocationModal.tsx` and `NewPlaydatePage.tsx:380` have NO
 *     focus-into-dialog effect (LocationModal's `:88` only clears a draft), so
 *     they capture the real opener and the restore DOES run.
 * Tracked as its own follow-up ticket (the fix is an opener-capture change in
 * the calling shell, not here).
 *
 * `useFocusTrap` is used by `ModalShell.tsx` and directly by
 * `DeletePlaydateDialog.tsx`, `ReportDialog.tsx`, `LocationModal.tsx` and
 * `NewPlaydatePage.tsx` — five call sites, not "the three portal dialogs", and
 * `CropPhotoDialog` does not use it at all. Hand-written — no dependency.
 *
 * The WRAP DECISION lives in `lib/focusTrap.ts` as a pure function, because
 * this repo's test environment has no DOM (every other test is `src/lib/*`),
 * and adding jsdom would mean a new dependency. The DOM work — querying,
 * focusing, listening — stays here; only the "where does Tab go next" question
 * is pure, and that is the part with the edge cases worth pinning.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return

    // Record who had focus before the dialog opened, so we can give it back.
    const previouslyFocused = document.activeElement as HTMLElement | null

    function getFocusable(): HTMLElement[] {
      const root = ref.current
      if (root === null) return []
      return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null && !el.hidden,
      )
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return
      const root = ref.current
      if (root === null) return
      const focusable = getFocusable()

      // Where should Tab go, and must we intervene at all? Both are pure
      // decisions (see lib/focusTrap.ts) — this effect only applies them.
      const current = document.activeElement as HTMLElement | null
      const currentIndex = focusable.indexOf(current as HTMLElement)
      const indexInside = current !== null && root.contains(current) ? currentIndex : -1
      const targetIndex = nextTrapTarget(focusable.length, indexInside, event.shiftKey)

      if (targetIndex === null) {
        // Nothing focusable in the dialog: keep focus from leaving entirely.
        event.preventDefault()
        return
      }
      // A move that stays inside the dialog needs no handling — letting the
      // browser do it preserves normal tab order.
      if (!shouldInterceptTab(focusable.length, indexInside)) return

      event.preventDefault()
      focusable[targetIndex].focus()
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      // Hand focus back to whatever had it when this effect ran. For a caller
      // whose focus-into-dialog effect is declared before its `useFocusTrap`
      // call, that is a control INSIDE the dialog, and the guard below turns the
      // restore into a silent skip: the captured control unmounts with the
      // dialog, so `document.contains` is false and nothing is focused. For a
      // caller with no such effect (`LocationModal`, `NewPlaydatePage`) the
      // capture is the real opener and this restore works. See the header for
      // which callers are which.
      if (previouslyFocused !== null && document.contains(previouslyFocused) && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [active, ref])
}