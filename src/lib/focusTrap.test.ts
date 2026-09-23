/**
 * Focus-trap logic tests (V22 slice 5).
 *
 * WHY THESE EXIST, and why they are not an e2e: the slice's original acceptance
 * criterion was `grep -rn 'activeElement' src/` being non-empty — which proves
 * the hook is imported, not that it traps. The real failure modes are edge
 * cases in the wrap decision:
 *   - focus on the LAST control must wrap FORWARD to the first (not escape);
 *   - focus on the FIRST must wrap BACK to the last;
 *   - focus OUTSIDE the dialog (index -1) must be pulled back to an edge;
 *   - an empty dialog must not throw and must keep focus put.
 *
 * A browser test was attempted first and abandoned honestly: every dialog in
 * this app sits behind auth or live Supabase data, so an e2e would have been
 * coupled to remote state rather than to this logic. This repo also has no DOM
 * test environment and the plan forbids new dependencies, so the decision was
 * extracted into `lib/` (pure) and pinned here.
 */
import { describe, expect, it } from 'vitest'
import { nextTrapTarget, shouldInterceptTab } from './focusTrap'

describe('nextTrapTarget', () => {
  it('advances normally in the middle of the dialog', () => {
    expect(nextTrapTarget(3, 0, false)).toBe(1)
    expect(nextTrapTarget(3, 1, false)).toBe(2)
  })

  it('wraps forward from the last control to the first', () => {
    expect(nextTrapTarget(3, 2, false)).toBe(0)
    expect(nextTrapTarget(1, 0, false)).toBe(0)
  })

  it('wraps backward from the first control to the last', () => {
    expect(nextTrapTarget(3, 0, true)).toBe(2)
    expect(nextTrapTarget(1, 0, true)).toBe(0)
  })

  it('pulls focus in from outside the dialog', () => {
    // index -1 means focus is on <body> or another element in the page.
    expect(nextTrapTarget(3, -1, false)).toBe(0)
    expect(nextTrapTarget(3, -1, true)).toBe(2)
  })

  it('pulls focus in when the index is stale or out of range', () => {
    expect(nextTrapTarget(3, 99, false)).toBe(0)
    expect(nextTrapTarget(3, 99, true)).toBe(2)
  })

  it('returns null when nothing is focusable', () => {
    expect(nextTrapTarget(0, -1, false)).toBeNull()
    expect(nextTrapTarget(0, 0, true)).toBeNull()
  })
})

describe('shouldInterceptTab', () => {
  it('intercepts when focus is outside or nothing is focusable', () => {
    expect(shouldInterceptTab(3, -1)).toBe(true)
    expect(shouldInterceptTab(3, 3)).toBe(true)
    expect(shouldInterceptTab(0, -1)).toBe(true)
  })

  it('leaves normal in-dialog moves to the browser', () => {
    expect(shouldInterceptTab(3, 0)).toBe(false)
    expect(shouldInterceptTab(3, 2)).toBe(false)
  })
})
