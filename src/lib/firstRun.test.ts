/**
 * V28 slice 1 — the pure first-run model.
 *
 * The contract lives in plan.md → Interfaces; the slice-1 acceptance
 * criteria are pinned here, one by one. A later slice renders the cards and
 * calls these functions. Purity is a requirement, not a preference: the
 * module must import no client, read no clock, and touch no browser global —
 * the "purity" block below proves it two ways (a source scan for absence,
 * and a clock spy for behaviour).
 */
import { describe, expect, it, vi } from 'vitest'
import firstRunSource from './firstRun.ts?raw'
import {
  FIRST_RUN_CARDS,
  isSkippable,
  nextUnfinishedCard,
  progressLabel,
  type FirstRunFacts,
} from './firstRun'

/** A complete facts object; each test overrides only what it exercises. */
function facts(over: Partial<FirstRunFacts> = {}): FirstRunFacts {
  return {
    signedIn: true,
    hasName: false,
    hasKids: false,
    hasPhoto: false,
    hasZip: false,
    ...over,
  }
}

describe('FIRST_RUN_CARDS', () => {
  it('is exactly the five cards, in order', () => {
    expect(FIRST_RUN_CARDS).toEqual(['account', 'name', 'kids', 'photo', 'area'])
  })
})

describe('isSkippable', () => {
  it('account, name, and area are required — not skippable', () => {
    expect(isSkippable('account')).toBe(false)
    expect(isSkippable('name')).toBe(false)
    expect(isSkippable('area')).toBe(false)
  })

  it('kids and photo are skippable', () => {
    expect(isSkippable('kids')).toBe(true)
    expect(isSkippable('photo')).toBe(true)
  })
})

describe('nextUnfinishedCard', () => {
  it('a signed-out visitor lands on the account card', () => {
    expect(nextUnfinishedCard(facts({ signedIn: false }))).toBe('account')
  })

  it('a signed-in parent with no profile row lands on the name card', () => {
    expect(nextUnfinishedCard(facts({ signedIn: true, hasName: false }))).toBe('name')
  })

  it('a named parent without kids lands on the kids card', () => {
    expect(nextUnfinishedCard(facts({ hasName: true, hasKids: false }))).toBe('kids')
  })

  it('a parent with kids but no photo lands on the photo card', () => {
    expect(nextUnfinishedCard(facts({ hasName: true, hasKids: true, hasPhoto: false }))).toBe(
      'photo',
    )
  })

  it('a parent who has everything but a zip lands on the area card', () => {
    expect(
      nextUnfinishedCard(facts({ hasName: true, hasKids: true, hasPhoto: true, hasZip: false })),
    ).toBe('area')
  })

  it('is null when name and zip are both set — even with kids and photo skipped', () => {
    expect(nextUnfinishedCard(facts({ hasName: true, hasZip: true }))).toBeNull()
  })

  it('terminates for a parent who never sets hasKids: name and zip set is null', () => {
    expect(
      nextUnfinishedCard(facts({ hasName: true, hasKids: false, hasPhoto: false, hasZip: true })),
    ).toBeNull()
  })

  it('is never null while the name or the zip is missing', () => {
    expect(nextUnfinishedCard(facts({ signedIn: false }))).not.toBeNull()
    expect(nextUnfinishedCard(facts({ hasName: false }))).not.toBeNull()
    expect(nextUnfinishedCard(facts({ hasName: true, hasZip: false }))).not.toBeNull()
  })

  it('pins guard order: the name guard runs before the clause-(a) zip early return', () => {
    // {signedIn: true, hasName: false, hasZip: true} → 'name'. Unreachable in
    // production (a zip implies a profile row implies a display name), but if
    // the `if (facts.hasZip) return null` moved above the name guard this dies
    // (it would return null instead of 'name').
    expect(nextUnfinishedCard(facts({ signedIn: true, hasName: false, hasZip: true }))).toBe(
      'name',
    )
  })

  it('pins guard order: the signedIn guard runs first — even ahead of clause (a)', () => {
    // {signedIn: false, hasZip: true} → 'account'. A signed-out visitor has no
    // run to finish, no matter what a stale facts snapshot says about a zip;
    // if the zip early return moved ahead of the signedIn guard this dies.
    expect(nextUnfinishedCard(facts({ signedIn: false, hasZip: true }))).toBe('account')
  })

  it('re-offers a skipped optional card while the run is unfinished', () => {
    // The parent skipped kids and photo and quit before area. "Skipped" and
    // "not reached" are indistinguishable from the derived facts, so they
    // resume on the kids card and tap Skip again — the accepted price of not
    // adding a step column (plan.md, slice 1).
    expect(
      nextUnfinishedCard(facts({ hasName: true, hasKids: false, hasPhoto: false, hasZip: false })),
    ).toBe('kids')
  })
})

describe('progressLabel', () => {
  it('is the 1-based position within the five cards', () => {
    expect(progressLabel('account')).toBe('1 of 5')
    expect(progressLabel('name')).toBe('2 of 5')
    expect(progressLabel('kids')).toBe('3 of 5')
    expect(progressLabel('photo')).toBe('4 of 5')
    expect(progressLabel('area')).toBe('5 of 5')
  })
})

describe('purity', () => {
  // Acceptance criterion: "the module imports no client, reads no clock, and
  // touches no browser global." Two proofs: a source scan (absence) and a
  // clock spy (behaviour).
  it('firstRun.ts imports nothing and names no clock, client, or browser global', () => {
    // `?raw` pulls in the module's own source as a string, so the scan cannot
    // drift from the code: it is the very file vitest executed above.
    for (const forbidden of [
      /\bDate\.now\b|\bnew Date\b/, // no clock
      /\bDate\(/, // no bare Date() call form
      /\bperformance\b/, // no clock
      /\bwindow\b|\bdocument\b/, // no browser global
      /\blocation\b|\bnavigator\b/, // no browser global — location is domain-relevant here
      /\blocalStorage\b|\bsessionStorage\b/, // no browser storage
      /\bfetch\b|\bXMLHttpRequest\b/, // no I/O
      /supabase/i, // no client
    ]) {
      expect(firstRunSource, `firstRun.ts must not match ${forbidden}`).not.toMatch(forbidden)
    }
    // The model has no dependencies at all — no import statements whatsoever.
    expect(firstRunSource).not.toMatch(/^\s*import\s/m)
  })

  it('never reads the clock — every fact combination runs with Date.now spied', () => {
    const spy = vi.spyOn(Date, 'now')
    try {
      for (const card of FIRST_RUN_CARDS) progressLabel(card)
      for (const card of FIRST_RUN_CARDS) isSkippable(card)
      // All 32 fact combinations, so the spy walks every branch of
      // nextUnfinishedCard — including the photo and area branches the old
      // two-sample loop never traversed.
      for (const signedIn of [false, true])
        for (const hasName of [false, true])
          for (const hasKids of [false, true])
            for (const hasPhoto of [false, true])
              for (const hasZip of [false, true])
                nextUnfinishedCard({ signedIn, hasName, hasKids, hasPhoto, hasZip })
    } finally {
      spy.mockRestore()
    }
    expect(spy).not.toHaveBeenCalled()
  })
})
