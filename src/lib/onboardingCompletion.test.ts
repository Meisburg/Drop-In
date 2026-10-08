import { describe, expect, it } from 'vitest'
// The render site's own SOURCE, the way avatarUrl.test.ts reads ProfilePage's
// (`?raw`): the point is that the PAGE consumes this seam rather than
// restating the rule inline, and only the source can pin that.
import onboardingPageSource from '../pages/OnboardingPage.tsx?raw'
import {
  completionHoldRemainingMs,
  ONBOARDING_COMPLETION_MIN_MS,
  onboardingCompletionPhase,
} from './onboardingCompletion'

/**
 * V34-C — the finish transition's ONE rule (the build law): once the REAL
 * completion work has settled, the handoff to the feed is held for a short,
 * explicit visible window.
 *
 * WHAT THE TABLE PINS, and each leg is a failure the slice exists to prevent:
 * a window a fast save under-serves (the flash), a window that outlives the
 * handoff (the wall), and the phase, which needs both clauses.
 */
describe('completionHoldRemainingMs (the visible window)', () => {
  it('owes the FULL floor at the instant the state appears', () => {
    // `visibleSince` IS the moment the state appears, so nothing has been
    // served yet — all of the floor is owed. This is what makes the paint
    // certain: the state cannot be cleared in the same commit that creates it.
    expect(completionHoldRemainingMs(1000, 1000, 500)).toBe(500)
  })

  it('owes only the REMAINDER as the window is served', () => {
    expect(completionHoldRemainingMs(1000, 1120, 500)).toBe(380)
    expect(completionHoldRemainingMs(1000, 1499, 500)).toBe(1)
  })

  it('owes NOTHING once the window has elapsed', () => {
    expect(completionHoldRemainingMs(1000, 1500, 500)).toBe(0)
    expect(completionHoldRemainingMs(1000, 1900, 500)).toBe(0)
  })

  it('CLAMPS a negative remainder to zero rather than reporting a negative hold', () => {
    expect(completionHoldRemainingMs(1000, 2600, 500)).toBe(0)
  })

  it('is monotone: a later `now` can only owe less, never more', () => {
    const early = completionHoldRemainingMs(0, 100, 500)
    const late = completionHoldRemainingMs(0, 400, 500)
    expect(early).toBeGreaterThan(late)
    expect(late).toBeGreaterThanOrEqual(0)
  })

  it('uses 500 ms as the default floor — under the brief ceiling, above flicker', () => {
    expect(ONBOARDING_COMPLETION_MIN_MS).toBe(500)
    // The brief's own ceiling: "a minimum under ~600 ms is fine".
    expect(ONBOARDING_COMPLETION_MIN_MS).toBeLessThan(600)
    // And above the flicker threshold: a floor this short would flash.
    expect(ONBOARDING_COMPLETION_MIN_MS).toBeGreaterThanOrEqual(400)
    expect(completionHoldRemainingMs(0, 0)).toBe(ONBOARDING_COMPLETION_MIN_MS)
  })
})

describe('onboardingCompletionPhase (the state, given the two facts)', () => {
  it('is working while the real work has not settled, whatever the clock says', () => {
    expect(onboardingCompletionPhase(false, 0)).toBe('working')
    expect(onboardingCompletionPhase(false, 400)).toBe('working')
  })

  it('is still working while the visible window is unserved', () => {
    expect(onboardingCompletionPhase(true, 1)).toBe('working')
    expect(onboardingCompletionPhase(true, 500)).toBe('working')
  })

  it('is done only when BOTH clauses hold', () => {
    expect(onboardingCompletionPhase(true, 0)).toBe('done')
  })
})

/**
 * THE CALL SITE, pinned at the source level. A pure module nothing renders is
 * the "field that describes a word the UI never shows" defect this repo has
 * recorded twice (V28 r2 slice 6a's skipLabel); these legs are what stop the
 * finish path from drifting back to a bare navigation.
 */
describe('OnboardingPage consumes the completion seam', () => {
  it('imports the seam rather than restating the floor inline', () => {
    expect(onboardingPageSource).toContain("from '../lib/onboardingCompletion'")
  })

  it('holds the transition behind a testid the spec can see', () => {
    expect(onboardingPageSource).toContain('data-testid="onboarding-completing"')
  })

  it('renders the completion copy from the copy module, not a literal', () => {
    expect(onboardingPageSource).toContain('FIRST_RUN_COMPLETION_COPY')
    // The sentence must not be RENDERED from an inline literal — one home for
    // words. The page's comments quote the line (that is how the founder's
    // annotation is recorded), so this reads the JSX/string shapes, not the
    // file's prose.
    expect(onboardingPageSource).not.toMatch(/>\s*Building your profile/)
    expect(onboardingPageSource).not.toMatch(/'Building your profile[^']*'/)
  })

  it('starts the visible window AFTER the work settles, not at the tap', () => {
    // ⚠️ THIS ORDERING IS THE REGRESSION GUARD. The first cut set the flag at
    // the tap, which replaced the area card the instant it was tapped: the
    // card's frozen zip field and its refused navigation controls vanished
    // mid-write, and two existing specs failed with "element(s) not found".
    // `setCompleting(true)` must appear AFTER the completion work's final
    // await, so the card keeps owning tap -> settle.
    const settleAt = onboardingPageSource.indexOf('await refresh()')
    const completingAt = onboardingPageSource.indexOf('setCompleting(true)')
    expect(settleAt).toBeGreaterThan(-1)
    expect(completingAt).toBeGreaterThan(settleAt)
  })

  it('anchors the window at the moment the state appears, so the floor is always full', () => {
    // The other half of the same fix: `completionHoldRemainingMs` must be fed
    // the state's OWN appearance time, never the tap's. Measured-from-the-tap
    // could compute 0 and let React batch the set-true and the clear into one
    // commit — the state then exists in no frame at all.
    expect(onboardingPageSource).toContain('completionHoldRemainingMs(visibleSince, visibleSince)')
  })

  it('renders the transition inside the finish branch, where paintedView is already finish', () => {
    // `refresh()` flips `homeZipSet`, which is what makes `resolveCard` answer
    // 'finish'; the flag is set after that, so this is the branch in force for
    // the whole visible window. `'name'` is the first card branch, so the
    // transition must sit after it.
    const finishAt = onboardingPageSource.indexOf("if (paintedView === 'finish')")
    const completingAt = onboardingPageSource.indexOf('if (completing) {')
    expect(finishAt).toBeGreaterThan(-1)
    expect(completingAt).toBeGreaterThan(finishAt)
  })

  it('waits for a REAL PAINT before clearing the state (the batching guard)', () => {
    // Source-level because the failure is a RACE the e2e spec caught only
    // sometimes. The page must yield past the paint, not merely schedule a
    // callback — a lone rAF runs BEFORE the frame is painted. The idiom is a
    // rAF whose callback then yields a task (`setTimeout`), so the commit that
    // includes the state has landed by the time this resolves.
    expect(onboardingPageSource).toMatch(/requestAnimationFrame\(\(\) => \{\s*setTimeout\(/)
  })
})
