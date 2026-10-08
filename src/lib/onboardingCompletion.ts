/**
 * V34-C — THE ONBOARDING FINISH TRANSITION'S ONE DECISION (the build law:
 * pages render, lib decides).
 *
 * The founder annotation on `/onboarding`:
 *
 *   "When you click on finish here, I feel like it jumps into the main app
 *    really quickly and it's like kind of jarring. Maybe there should be some
 *    kind of animation state or loading state or like building your profile
 *    state or something."
 *
 * WHAT IS BEING DECIDED, and why it is a rule rather than a page branch: once
 * the REAL completion work has settled, the handoff to the feed is held back
 * for a short, explicit visible window — so the parent is told what happened
 * instead of being jumped into the app. That is arithmetic over one timestamp
 * and a constant, so it is a pure function here and the page only renders its
 * answer.
 *
 * ⚠️ WHY THE WINDOW STARTS AT THE SETTLE, NOT AT THE TAP — this is the shape
 * the specs decided, and it is worth stating because the obvious design is the
 * other one. Two existing specs
 * (`e2e/signup-zip-fallback.e2e.ts`, the frozen-zip-field and the
 * navigation-guard legs) hold the area card's `profiles` PATCH open and assert
 * the card's OWN in-flight state: the zip field is `disabled` and still shows
 * the value being written, and the back/forward controls are refused while
 * `saving`. Replacing the card the instant the parent taps — the first cut of
 * this slice — UNMOUNTED that field, and both specs failed with "element(s)
 * not found": the brief's "leaves the failure path and every signup walk
 * unchanged" was violated by the transition itself.
 *
 * So the card keeps owning the tap→settle window (unchanged from before this
 * slice), and the transition owns settle→feed. The window is therefore a full
 * `ONBOARDING_COMPLETION_MIN_MS` from the moment the state appears, which also
 * makes the paint unconditionally certain: the state's own floor cannot have
 * elapsed before it is on screen, so React can never batch it away. (That
 * batching was real and measured — see `.scratch/v34-c-report.md`.)
 */

/**
 * THE MINIMUM HOLD — 500 ms, and why this number.
 *
 * The brief's guidance was "a minimum under ~600 ms is fine; state the number
 * you chose and why". Three anchors, all from this repo:
 *
 *  - **The house's longest authored moment is the boot splash at 300 ms**
 *    (`DESIGN.md`, Motion). A finish transition is a lesser moment than the
 *    brand's arrival, but its job is to be READ, where the splash's job is to
 *    be felt.
 *  - **~400 ms is the usual floor for "this is a transition, not a flicker"**;
 *    below it a viewer reads the frame as a stutter.
 *  - **The measured cost.** The walk's tap → feed window was timed on this
 *    machine (`.scratch/v34-c-report.md`): ~348 ms before this slice, ~860 ms
 *    after, because the save itself runs 250–400 ms here and the floor starts
 *    after it. The floor is the whole of the growth and stays under the brief's
 *    ceiling.
 *
 * 500 is a deliberate, stated number — not `600` because the brief's ceiling is
 * "~600 ms" and a floor AT the ceiling leaves no room below it; not `300`
 * because a flash that short reads as a glitch.
 */
export const ONBOARDING_COMPLETION_MIN_MS = 500

/**
 * Is there still time owed on the state, given when it became visible?
 *
 * `visibleSince` is the moment the STATE APPEARED (`performance.now()`, read
 * after the completion work settled — see the module header for why that is the
 * right origin). `now` is injectable so the rule is testable without waiting.
 *
 * A NEGATIVE REMAINDER CLAMPS TO `0`, never to a negative number: the caller
 * feeds this to a timer, and the VALUE should not read as "hold for minus
 * 120 ms". Clamping is what makes "the floor already elapsed" indistinguishable
 * from "there was never a floor to serve".
 */
export function completionHoldRemainingMs(
  visibleSince: number,
  now: number,
  minimumMs: number = ONBOARDING_COMPLETION_MIN_MS,
): number {
  return Math.max(0, visibleSince + minimumMs - now)
}

/**
 * The phase, given whether the work settled and what the clock says. The page
 * never branches on elapsed time itself — it asks this.
 *
 * ⚠️ IT IS `'done'` ONLY ON BOTH CLAUSES, and each is load-bearing. The work
 * clause is what makes this a real state rather than a sleep (a bare timer
 * would be an animation hidden over the write path — the brief forbids it
 * explicitly); the clock clause is the visible window that stops a handoff
 * from jumping the parent straight into the feed.
 */
export function onboardingCompletionPhase(
  settled: boolean,
  holdRemainingMs: number,
): 'working' | 'done' {
  if (!settled) return 'working'
  return holdRemainingMs > 0 ? 'working' : 'done'
}
