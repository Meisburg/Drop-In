/**
 * Focus-trap decision logic (V22 slice 5) — PURE.
 *
 * WHY THIS IS ITS OWN MODULE: the trap's DOM work (querying, focusing,
 * listening) can only be tested with a DOM, and this repo has no DOM test
 * environment — every test is `src/lib/*` over pure functions, and adding jsdom
 * would mean a new dependency the plan forbids. So the part with the actual
 * edge cases is separated out and pinned here, and `components/FocusTrap.tsx`
 * does nothing but call it and move focus.
 *
 * The bug this prevents: a trap that only handles "focus is on the last
 * element" lets Tab escape when focus is on some MIDDLE element in a
 * non-sequential order, or when focus sits outside the dialog entirely.
 * `nextTrapTarget` answers "given N focusable controls and where focus is now,
 * where must Tab land?" for every case, including focus-outside (index -1).
 */

/** Where Tab (or Shift+Tab) should move focus inside a trapped dialog. */
export function nextTrapTarget(
  count: number,
  currentIndex: number,
  shift: boolean,
): number | null {
  // Nothing focusable: the caller must preventDefault and keep focus put.
  if (count <= 0) return null

  // Focus is outside the dialog (or on <body>): pull it back to an edge.
  // Forward Tab enters at the first control; Shift+Tab enters at the last.
  if (currentIndex < 0 || currentIndex >= count) return shift ? count - 1 : 0

  const delta = shift ? -1 : 1
  const next = currentIndex + delta

  // Wrap at the boundaries rather than escaping to the page behind.
  if (next < 0) return count - 1
  if (next >= count) return 0
  return next
}

/**
 * True when the caller must intercept the Tab (or Shift+Tab) the browser is
 * about to perform, because the browser's own move would leave the dialog.
 *
 * THE BUG THIS CORRECTS (V25 ticket 13, measured in the RSVP confirmation
 * lightbox). The first version of this predicate answered only "is focus outside
 * the dialog?" — `currentIndex < 0 || currentIndex >= count` — on the theory
 * that an in-dialog move needed no handling because the browser would keep it
 * inside. That theory is false at the EDGES, and the edges are the whole point
 * of a trap:
 *
 *  - on the LAST control, Tab's next focusable is the page behind the modal, so
 *    the trap must wrap forward. Measured in the throwaway experiment against
 *    the pre-fix predicate: `[EXP] active on open:
 *    BUTTON#rsvp-confirmation-got-it` → `[EXP] A: after Tab #1 immediately:
 *    BODY#` — one Tab from an edge landed on the document body;
 *  - on the FIRST control, Shift+Tab's previous focusable is likewise behind the
 *    modal. The instrumented run that caught the escape in the dialog's own
 *    event log was a Shift+Tab from the FIRST control, which walked focus into
 *    the composer behind the modal: `focusout
 *    BUTTON#rsvp-confirmation-dismiss` → `focusin TEXTAREA#comment-composer`.
 *    (The earlier note here attributed that composer landing to Tab from the
 *    LAST control; the escape direction was wrong even though the fix — claim
 *    both edges — is the same.)
 *
 * Instrumented live in the dialog (the page's own `getFocusable()` query and
 * focusin/focusout events, run headless): `getFocusable()` returned the dialog's
 * TWO buttons on every keystroke, and yet the browser's own move walked focus
 * out of the `aria-modal` and into the composer behind it. The trap's own index
 * arithmetic was right; this predicate let the browser do the escaping move. It
 * also explains the old unit test below, which pinned a Shift+Tab-from-the-first
 * escape as correct ("leaves normal in-dialog moves to the browser").
 *
 * So the question is not "is focus inside?" but "would the next move END UP
 * outside?" — and without the shift direction that means either edge. The
 * interior still needs no handling: a move that genuinely stays inside is left
 * to the browser, preserving normal tab order and any `tabindex` subtleties we
 * did not model.
 */
export function shouldInterceptTab(count: number, currentIndex: number): boolean {
  // Nothing focusable: the caller must keep focus from leaving entirely.
  if (count <= 0) return true
  // Focus is outside the dialog (or on <body>): pull it back to an edge.
  if (currentIndex < 0 || currentIndex >= count) return true
  // At an edge, one of Tab/Shift+Tab escapes. The caller knows which one it is
  // and uses `nextTrapTarget` for the destination, so both edges are claimed
  // here; a single-control dialog is both edges at once and always wraps.
  return currentIndex === 0 || currentIndex === count - 1
}
