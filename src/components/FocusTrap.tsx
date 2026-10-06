import { useEffect } from 'react'
import type { RefObject } from 'react'
import { nextTrapTarget, shouldInterceptTab, shouldYieldToNestedDialog } from '../lib/focusTrap'

/**
 * Traps Tab/Shift+Tab inside `ref.current` while `active`: focus is moved into
 * the dialog by its own opener effect and the browser's escaping move is
 * intercepted at both edges.
 *
 * RESTORING FOCUS TO THE OPENER IS CONDITIONAL, and the cleanup below is why it
 * silently does nothing for some callers — which is why those callers no longer
 * rely on it. It gives focus back to whatever had focus when this effect RAN. An
 * owner that focuses its first control in an effect declared BEFORE its
 * `useFocusTrap` call moves focus into the dialog first, so `previouslyFocused`
 * here is that IN-DIALOG control rather than the trigger; when the dialog
 * unmounts, `document.contains(previouslyFocused)` is false and the restore is
 * skipped, leaving `document.activeElement` on `<body>`. That order is the whole
 * mechanism and it is verifiable by reading the call sites — no run is needed to
 * see which effect React executes first.
 *
 * THAT SET IS FIXED ELSEWHERE, as the follow-up ticket here said it should be:
 * the fix is an opener capture in the CALLING SHELL, never in this file.
 * `DeletePlaydateDialog.tsx`, `ReportDialog.tsx` and `ModalShell.tsx` (hence
 * `ConfirmDialog` and `RsvpConfirmationDialog`) each capture the real opener with
 * `useOpenerFocusRestore` — a LAYOUT effect, which React flushes before this
 * PASSIVE one — and restore through the pure `planFocusRestore`. The lane
 * `scripts/focus-trap-check.mjs` measured the Report dialog's focus falling to
 * `<body>` and now GATES the restore.
 *
 * The cleanup below is therefore the WORKING path for exactly the callers with
 * no focus-into-dialog effect — `LocationModal.tsx` and
 * `NewPlaydatePage.tsx:380` (LocationModal's `:88` only clears a draft) — and it
 * stays as it is for them. Do not "simplify" it away.
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

      // THE TOPMOST DIALOG TRAPS. A nested dialog is portalled to <body>, so it
      // is outside `root` — and without this the trap would drag focus straight
      // back out of it (the measured crop-dialog defect; see the pure rule).
      // Standing down leaves the browser's own tab order inside that dialog.
      if (
        shouldYieldToNestedDialog(
          current !== null && root.contains(current),
          current !== null && current.closest('[role="dialog"]') !== null,
        )
      ) {
        return
      }

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
      // Hand focus back to whatever had it when this effect ran. This IS the
      // restore for a caller with no focus-into-dialog effect (`LocationModal`,
      // `NewPlaydatePage`): the capture is the real opener. For a caller whose
      // focus-into effect is declared before its `useFocusTrap` call it is a
      // control INSIDE the dialog, and the guard below turns the restore into a
      // silent skip — that control unmounts with the dialog. Those callers no
      // longer depend on it: they capture the opener in the shell
      // (`useOpenerFocusRestore`). See the header.
      if (previouslyFocused !== null && document.contains(previouslyFocused) && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [active, ref])
}
