/**
 * Focus-trap logic tests (V22 slice 5).
 *
 * WHY THESE EXIST, and why they are not an e2e: the slice's original acceptance
 * criterion was `grep -rn 'activeElement' src/` being non-empty — which proves
 * the hook is imported, not that it traps. The real failure modes are edge
 * cases in the wrap decision:
 *   - focus on the LAST control must wrap FORWARD to the first (not escape) —
 *     corrected in V25 ticket 13, where the edge itself must be intercepted;
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

  // V25 ticket 13 corrected this contract. The first version answered only
  // "is focus outside?" and returned false at index 0 and index count-1, on the
  // theory that an in-dialog move needs no handling because the browser keeps it
  // inside. The theory is false at the edges, and the edges are the whole point
  // of a trap. The two escapes are DIFFERENT DIRECTIONS, and the archived probes
  // separate them.
  //
  // BOTH CITATIONS BELOW ARE PRE-FIX EVIDENCE — they are the measurement that
  // MOTIVATED the correction, taken while `shouldInterceptTab` still returned
  // false at the edges. They are not a description of today's behaviour: today
  // the predicate claims both edges (`src/lib/focusTrap.ts:82-87`, the
  // both-edges return; pinned by the `it()` at `:95-97` below), so the trap
  // calls `preventDefault()` and moves focus itself, and a Tab from the last
  // control wraps to the first instead of reaching `<body>`. The same log lines
  // are labelled "against the pre-fix predicate" at `focusTrap.ts:52-55`; this
  // note says it too.
  //   - PRE-FIX, Tab from the LAST control left the dialog and Chrome landed it
  //     on `<body>`: `[EXP] active on open: BUTTON#rsvp-confirmation-got-it` →
  //     `[EXP] A: after Tab #1 immediately: BODY#`
  //     (`.scratch/v25/t13-trap-exp.log`). (That log does NOT show a second Tab
  //     pulling focus back; scenario B of that probe hand-refocuses the button
  //     with `.focus()`, settles, then presses ONE Tab — which lands on `BODY#`
  //     too, so it presses no second Tab. The "pulls focus back" claim was not
  //     in any log and is dropped.)
  //   - PRE-FIX, Shift+Tab from the FIRST control is what walked focus into the
  //     page behind: `focusout BUTTON#rsvp-confirmation-dismiss` →
  //     `focusin TEXTAREA#comment-composer`
  //     (`.scratch/v25/t13-focus-probe4.log`).
  // (An earlier version of this note attributed the composer landing to Tab from
  // the LAST control; the fix — claim both edges — was right, the direction was
  // not.) So both edges must be claimed; the caller knows the shift direction
  // and sends focus to `nextTrapTarget`'s destination.
  it('intercepts at BOTH edges, where the browser would leave the dialog', () => {
    expect(shouldInterceptTab(3, 0)).toBe(true)
    expect(shouldInterceptTab(3, 2)).toBe(true)
    // The interior really is normal tab order: index 1 of 3 has a focusable
    // neighbour on each side, so the browser's own move stays inside.
    expect(shouldInterceptTab(3, 1)).toBe(false)
  })

  it('treats a single-control dialog as both edges at once, so Tab wraps onto itself', () => {
    expect(shouldInterceptTab(1, 0)).toBe(true)
  })
})
