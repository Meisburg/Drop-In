import { useLayoutEffect, useRef } from 'react'
import { planFocusRestore } from '../lib/focusTrap'

/**
 * Give focus back to the control that OPENED this dialog, when the dialog
 * closes. One copy, for the three shells that need it: `ReportDialog`,
 * `DeletePlaydateDialog` and `ModalShell` (which covers its two consumers,
 * `ConfirmDialog` and `RsvpConfirmationDialog`).
 *
 * THE DEFECT THIS FIXES, measured by `scripts/focus-trap-check.mjs` on a fresh
 * build: closing the Report dialog dropped `document.activeElement` to `<body>`,
 * so a keyboard user lost their place. `useFocusTrap` restores to whatever had
 * focus when ITS effect ran — and a shell that focuses its first control in an
 * effect declared BEFORE the `useFocusTrap` call makes that captured element an
 * in-dialog control, so on unmount the trap's `document.contains` guard skips
 * the restore. (`LocationModal` and `NewPlaydatePage` have no focus-into effect;
 * the trap's own capture is the real opener there, so their restore already
 * works and they do NOT call this hook — their behaviour must not change.)
 *
 * WHY A LAYOUT EFFECT, and why the capture cannot simply move into the trap:
 * React flushes every layout effect in a commit BEFORE the first passive one, so
 * this reads the trigger the parent actually pressed even though the
 * focus-into-dialog effect and `useFocusTrap` both run later in the same commit.
 * The trap itself is left untouched so the two callers whose restore works stay
 * on exactly the path they were measured on.
 *
 * WHERE FOCUS GOES is not decided here: `planFocusRestore` (pure,
 * `lib/focusTrap.ts`) returns the opener or `null`, and this hook only performs
 * the DOM work — capture, `document.contains`, `.focus()`. If the opener is gone
 * (the row that opened a confirm was unmounted by the confirm itself), focus is
 * left where it is: there is no honest target, and picking one is a product
 * decision, not a bug fix.
 */
export function useOpenerFocusRestore(): void {
  const openerRef = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    // The capture. `document.activeElement` is `<body>` at worst, which is never
    // restored to anything useful and is dropped by the null/contains check on
    // the way out.
    openerRef.current = document.activeElement as HTMLElement | null

    return () => {
      const opener = openerRef.current
      const plan = planFocusRestore(opener, opener !== null && document.contains(opener))
      plan?.focus()
    }
  }, [])
}
