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
 * True when the browser's own Tab from `currentIndex` would leave the dialog,
 * so the caller must intervene. A move that stays inside needs no handling —
 * letting the browser do it preserves normal tab order and any `tabindex`
 * subtleties we did not model.
 */
export function shouldInterceptTab(count: number, currentIndex: number): boolean {
  if (count <= 0) return true
  return currentIndex < 0 || currentIndex >= count
}
