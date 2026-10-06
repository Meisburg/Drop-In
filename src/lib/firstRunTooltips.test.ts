/**
 * r3-7 — the first-run tooltips' pure module.
 *
 * What is pinned:
 *
 * 1. THE ONE-COPY RULE, as an identity: `TOOLTIPS_STEPS` carries the tour's
 *    five lines VERBATIM — same labels, same details, same order. The module
 *    imports `TOUR_LINES`, it does not restate it; a line that drifts from
 *    the tour's words fails here instead of shipping a second copy.
 * 2. THE "WHAT IT DOES" PROPERTY, asserted on the NEW surface: every step's
 *    detail names an action (`TOUR_ACTION_VERBS`), and no step carries any
 *    `TOUR_BANNED_COPY` phrase. The property is the guard; the banned-copy
 *    check is the regression pin.
 * 3. TARGET BINDING: every label the tour carries resolves to a known target
 *    (the fallback branch is for a future sixth line, not an escape hatch),
 *    and the label→target table is the one the tour teaches.
 * 4. THE GATE's truth table — each clause load-bearing (see the module).
 * 5. THE TRIGGER: the armed-state guard accepts the state the finish
 *    redirect sets and nothing else.
 * 6. THE DISMISSAL FACT: the helpers read and write the nudge's key (the
 *    shared fact, one name in one place) and survive a locked-down browser.
 * 7. STEP ADVANCEMENT and the progress chrome.
 * 8. PLACEMENT: the card sits below the target when there is room, above it
 *    when there is not, and stays inside the viewport either way.
 */

import { describe, expect, it } from 'vitest'
import {
  FIRST_RUN_DISMISSED_KEY,
  FIRST_RUN_TOOLTIPS_ARMED_STATE,
  FIRST_RUN_TOOLTIPS_LABELS,
  TOOLTIP_TARGET_TEST_IDS,
  TOOLTIPS_STEPS,
  isFirstRunTooltipsArmed,
  markFirstRunDismissed,
  nextTooltipStepIndex,
  placeTooltip,
  readFirstRunDismissed,
  shouldShowTooltips,
  tooltipProgressLabel,
  tooltipTargetForLabel,
  type FirstRunTooltipFacts,
} from './firstRunTooltips'
import { TOUR_ACTION_VERBS, TOUR_BANNED_COPY, TOUR_LINES } from './firstRunTour'
import { escapeForRegExp } from './escapeForRegExp.mjs'

describe('TOOLTIPS_STEPS — the tour lines, verbatim', () => {
  it('carries the tour five lines, in the nav order, word for word', () => {
    expect(TOOLTIPS_STEPS).toHaveLength(TOUR_LINES.length)
    expect(TOOLTIPS_STEPS.map((step) => [step.label, step.detail])).toEqual(
      TOUR_LINES.map((line) => [line.label, line.detail]),
    )
  })

  it('binds every step to a named target (no step is untargeted)', () => {
    for (const step of TOOLTIPS_STEPS) {
      expect(Object.keys(TOOLTIP_TARGET_TEST_IDS)).toContain(step.target)
    }
  })
})

describe('the "what it does" property, on the tooltip surface', () => {
  it('every step detail names an action a control takes', () => {
    // Zero-is-a-finding: the loop iterates the module's own pinned array
    // (five lines, pinned above), so a silent empty loop is impossible.
    for (const step of TOOLTIPS_STEPS) {
      const namesAnAction = TOUR_ACTION_VERBS.some((verb) =>
        new RegExp(`\\b${escapeForRegExp(verb)}\\b`, 'i').test(step.detail),
      )
      expect(namesAnAction, `"${step.label}" — "${step.detail}" names no action`).toBe(true)
    }
  })

  it('no step carries a banned phrase', () => {
    for (const step of TOOLTIPS_STEPS) {
      for (const phrase of TOUR_BANNED_COPY) {
        expect(step.detail.toLowerCase()).not.toContain(phrase.toLowerCase())
      }
    }
  })
})

describe('target binding', () => {
  it('resolves every tour label through the table (no current label relies on the fallback)', () => {
    for (const line of TOUR_LINES) {
      // The fallback returns 'dropIns' for any unknown label — for the five
      // labels the tour carries, the label MUST be a key of the table, so
      // the mapping below is what resolves it, not the escape hatch.
      expect(FIRST_RUN_TOOLTIPS_LABELS, `"${line.label}" has no table entry`).toContain(line.label)
    }
  })

  it('maps the labels to the controls the tour teaches', () => {
    expect(tooltipTargetForLabel('Drop Ins')).toBe('dropIns')
    expect(tooltipTargetForLabel('Inbox')).toBe('inbox')
    expect(tooltipTargetForLabel('Post a drop-in')).toBe('post')
    expect(tooltipTargetForLabel('Places')).toBe('places')
    expect(tooltipTargetForLabel('Profile')).toBe('profile')
  })

  /**
   * THE FOUNDER'S RULE, PINNED WHERE IT CAN FAIL (2026-10-05).
   *
   * His report, verbatim: *"the first thing at lightboxes should be the drop-in
   * icon on the bottom left of the app, but it doesn't do that at lightboxes
   * something else randomly."* The first step's label was already "Drop Ins";
   * its TARGET was the feed's `feed-section-header` — the "Near you" `<h1>` at
   * the top of the page — while every step after it rang a nav control.
   *
   * Two assertions, because two things must stay true: the first step is the
   * Drop Ins line, and the element that line rings is the nav's first tab. The
   * regression this pins is a silent retarget back to a heading (or to any
   * element that is not a control).
   */
  it('rings the nav’s Drop Ins tab on the FIRST step, not the feed heading', () => {
    expect(TOOLTIPS_STEPS[0].label).toBe('Drop Ins')
    expect(TOOLTIPS_STEPS[0].target).toBe('dropIns')
    expect(TOOLTIP_TARGET_TEST_IDS.dropIns).toBe('nav-tab-drop-ins')
    // And the old target is GONE, not merely unused: a leftover id would let a
    // future edit point back at the heading without reading as a change.
    expect(Object.values(TOOLTIP_TARGET_TEST_IDS)).not.toContain('feed-section-header')
  })

  it('the fallback (a future sixth line) points at the Drop Ins tab, never crashes', () => {
    expect(tooltipTargetForLabel('A line the tour does not carry yet')).toBe('dropIns')
  })
})

describe('shouldShowTooltips — the gate', () => {
  const facts: FirstRunTooltipFacts = { signedIn: true, homeZipSet: true, armed: true, dismissed: false }

  it('shows for the parent whose run just ended', () => {
    expect(shouldShowTooltips(facts)).toBe(true)
  })

  it.each([
    ['a signed-out visitor', { signedIn: false }],
    ['an unfinished run (the nudge owns those)', { homeZipSet: false }],
    ['an arrival that was not the run ending', { armed: false }],
    ['a first-run surface already stood down', { dismissed: true }],
  ] as const)('does not show for %s', (_name, override) => {
    expect(shouldShowTooltips({ ...facts, ...override })).toBe(false)
  })
})

describe('the transient trigger', () => {
  it('accepts the state the finish redirect sets', () => {
    expect(isFirstRunTooltipsArmed(FIRST_RUN_TOOLTIPS_ARMED_STATE)).toBe(true)
    // A structured-clone of the same state (what a reload leaves behind)
    // is the same shape.
    expect(isFirstRunTooltipsArmed(structuredClone(FIRST_RUN_TOOLTIPS_ARMED_STATE))).toBe(true)
  })

  it.each([
    ['no state (a plain load)', undefined],
    ['no state (a nav arrival)', null],
    ['another entry state', { justPosted: { id: 'p1', title: 'x' } }],
    ['a lie', { firstRunTooltipsArmed: 'truthy' }],
    ['a non-object', 'firstRunTooltipsArmed'],
  ] as const)('rejects %s', (_name, state) => {
    expect(isFirstRunTooltipsArmed(state)).toBe(false)
  })
})

describe('the shared dismissal fact', () => {
  it('is the nudge key — the extended fact, one name in one place', () => {
    expect(FIRST_RUN_DISMISSED_KEY).toBe('dropin.first-run.nudge-dismissed')
  })

  function fakeStorage(entries: Record<string, string> = {}, broken = false) {
    return {
      getItem(key: string) {
        if (broken) throw new Error('locked-down browser')
        return Object.hasOwn(entries, key) ? (entries[key] ?? null) : null
      },
      setItem(key: string, value: string) {
        if (broken) throw new Error('locked-down browser')
        entries[key] = value
      },
    }
  }

  it('reads the fact from storage', () => {
    expect(readFirstRunDismissed(fakeStorage())).toBe(false)
    expect(readFirstRunDismissed(fakeStorage({ [FIRST_RUN_DISMISSED_KEY]: '1' }))).toBe(true)
  })

  it('degrades to "not dismissed" when the read throws', () => {
    expect(readFirstRunDismissed(fakeStorage({}, true))).toBe(false)
  })

  it('writes the fact', () => {
    const storage = fakeStorage()
    markFirstRunDismissed(storage)
    expect(readFirstRunDismissed(storage)).toBe(true)
  })

  it('a throwing write swallows (the dismissal still applies to this mount)', () => {
    expect(() => markFirstRunDismissed(fakeStorage({}, true))).not.toThrow()
  })
})

describe('step advancement', () => {
  it('walks the steps and stops after the last', () => {
    expect(nextTooltipStepIndex(0, 5)).toBe(1)
    expect(nextTooltipStepIndex(1, 5)).toBe(2)
    expect(nextTooltipStepIndex(3, 5)).toBe(4)
    expect(nextTooltipStepIndex(4, 5)).toBeNull()
  })

  it('a broken index never advances past the end', () => {
    expect(nextTooltipStepIndex(-1, 5)).toBeNull()
    expect(nextTooltipStepIndex(9, 5)).toBeNull()
    expect(nextTooltipStepIndex(0, 0)).toBeNull()
  })

  it('the progress chrome counts from one', () => {
    expect(tooltipProgressLabel(0, 5)).toBe('1 of 5')
    expect(tooltipProgressLabel(4, 5)).toBe('5 of 5')
  })
})

describe('placeTooltip', () => {
  const viewport = { width: 390, height: 844 }

  it('sits below the target when there is room', () => {
    const target = { left: 150, top: 300, width: 90, height: 40 }
    const card = { width: 288, height: 160 }
    const placement = placeTooltip(target, viewport, card)
    expect(placement.side).toBe('below')
    expect(placement.top).toBe(target.top + target.height + 12)
  })

  it('sits above the target when it is near the bottom', () => {
    const target = { left: 150, top: 800, width: 90, height: 36 } // the nav bar
    const card = { width: 288, height: 160 }
    const placement = placeTooltip(target, viewport, card)
    expect(placement.side).toBe('above')
    expect(placement.top).toBe(target.top - 12 - card.height)
  })

  it('centers on the target when the viewport allows', () => {
    const target = { left: 150, top: 300, width: 90, height: 40 }
    const card = { width: 288, height: 160 }
    const placement = placeTooltip(target, viewport, card)
    expect(placement.left).toBe(150 + 90 / 2 - 288 / 2)
  })

  it('clamps to the viewport edges when centered would spill', () => {
    const target = { left: 4, top: 300, width: 40, height: 40 } // far left
    const card = { width: 288, height: 160 }
    const placement = placeTooltip(target, viewport, card)
    expect(placement.left).toBe(8)
    const targetRight = { left: 386, top: 300, width: 40, height: 40 }
    const placementRight = placeTooltip(targetRight, viewport, card)
    expect(placementRight.left).toBe(viewport.width - card.width - 8)
  })

  it('stays inside the viewport for a card taller than the viewport', () => {
    const target = { left: 150, top: 400, width: 90, height: 40 }
    const card = { width: 288, height: 2000 }
    const placement = placeTooltip(target, viewport, card)
    expect(placement.top).toBeGreaterThanOrEqual(8)
    expect(placement.top).toBeLessThan(viewport.height)
    expect(placement.left).toBeGreaterThanOrEqual(8)
  })

  /**
   * ⚠️ THE MEASURED DEFECT THIS RULE REPAIRS (2026-10-05, 1280×720).
   *
   * Above `md` the app's navigation is a LEFT RAIL at the viewport's left edge,
   * and the tour's steps ring nav controls. With the first step ringing the
   * Drop Ins tab, the card was placed BELOW it and left-clamped to 8 — so it
   * occupied x 8..296, straight over the rail's own column (x 0..72), and
   * `document.elementFromPoint` at the centre of `nav-tab-inbox` returned THE
   * TOUR rather than the tab. A parent's tap on Inbox was swallowed.
   * `e2e/first-run-tooltips.e2e.ts`'s pass-through leg caught it. The card now
   * starts at the rail's right edge, for every rail item.
   *
   * The rects are the MEASURED ones (probe, 390×844 and 1280×720), not invented:
   * the rail's items are 71×58 at x 0, stacked from y 53.
   */
  it('sits to the RIGHT of a vertical nav rail, so it can never cover a tab', () => {
    const nav = { left: 0, top: 53, width: 72, height: 667 }
    const card = { width: 288, height: 210 }
    const wide = { width: 1280, height: 720 }
    const railItems = [
      { left: 0, top: 53, width: 71, height: 58 }, // Drop Ins
      { left: 0, top: 111, width: 71, height: 58 }, // Inbox
      { left: 0, top: 169, width: 71, height: 58 }, // Post
      { left: 0, top: 227, width: 71, height: 58 }, // Places
      { left: 0, top: 285, width: 71, height: 58 }, // Profile
    ]
    for (const target of railItems) {
      const placement = placeTooltip(target, wide, card, undefined, nav)
      // The RULE, as one number: the rail's right edge plus the gap.
      expect(placement.left).toBe(nav.left + nav.width + 12)
      // And the PROPERTY the rule exists for: the card never touches the rail.
      expect(
        placement.left,
        'the card must clear the rail, or a tap on a covered tab is swallowed',
      ).toBeGreaterThanOrEqual(nav.left + nav.width)
    }
  })

  it('leaves the phone bottom bar alone — a horizontal nav does not fire the rail rule', () => {
    // Measured at 390×844: the bar spans the viewport, 58px tall at y 786.
    const nav = { left: 0, top: 786, width: 390, height: 58 }
    const target = { left: 0, top: 786, width: 84, height: 58 } // the Drop Ins tab
    const card = { width: 288, height: 160 }
    const placement = placeTooltip(target, { width: 390, height: 844 }, card, undefined, nav)
    expect(placement.side).toBe('above')
    expect(placement.left).toBe(8)
    expect(placement.top + card.height, 'the card sits clear above the bar').toBeLessThanOrEqual(
      nav.top,
    )
  })

  it('is byte-identical when there is no nav (a route without the shell)', () => {
    const target = { left: 150, top: 300, width: 90, height: 40 }
    const card = { width: 288, height: 160 }
    expect(placeTooltip(target, viewport, card)).toEqual(
      placeTooltip(target, viewport, card, undefined, null),
    )
  })
})
