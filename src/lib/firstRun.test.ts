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

/**
 * The forbidden tokens, every one kept from the slice-1 contract: the
 * clocks, the browser globals (location is domain-relevant for this
 * module), storage, I/O, the client. Matched against code only — comments
 * are stripped first, so prose can never fail a purity test.
 */
const FORBIDDEN_TOKENS: readonly { pattern: RegExp; name: string }[] = [
  { pattern: /\bDate\.now\b|\bnew Date\b/, name: 'Date.now / new Date (clock)' },
  { pattern: /\bDate\(/, name: 'bare Date( call (clock)' },
  { pattern: /\bperformance\b/, name: 'performance (clock)' },
  { pattern: /\bwindow\b|\bdocument\b/, name: 'window / document (browser global)' },
  { pattern: /\blocation\b|\bnavigator\b/, name: 'location / navigator (browser global)' },
  { pattern: /\blocalStorage\b|\bsessionStorage\b/, name: 'localStorage / sessionStorage (browser storage)' },
  { pattern: /\bfetch\b|\bXMLHttpRequest\b/, name: 'fetch / XMLHttpRequest (I/O)' },
  { pattern: /supabase/i, name: 'supabase (client)' },
]

/**
 * Remove line and block comments from a TypeScript source string, leaving
 * the code (including string literals) intact, so a token scan proves the
 * CODE is pure rather than the prose. Scope: the strings this scanner sees
 * (quoted literals, backticks without nested quotes, line and block
 * comments); it does not parse template interpolation or regex literals.
 */
function stripComments(source: string): string {
  let out = ''
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]
    if (ch === "'" || ch === '"' || ch === '`') {
      // Copy a string or template literal verbatim.
      out += ch
      i += 1
      while (i < source.length && source[i] !== ch) {
        if (source[i] === '\\') i += 1
        out += source[i]
        i += 1
      }
      out += source[i] // the closing quote (or EOF)
      i += 1
      continue
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1 // drop the line comment
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < source.length && (source[i] !== '*' || source[i + 1] !== '/')) i += 1
      i += 2 // drop the block comment including the closing `*/`
      continue
    }
    out += ch
    i += 1
  }
  return out
}

/** The first forbidden token found in the CODE of `source`, or null. */
function firstForbidden(source: string): string | null {
  const code = stripComments(source)
  for (const token of FORBIDDEN_TOKENS) {
    if (token.pattern.test(code)) return token.name
  }
  return null
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

describe('the purity scanner — stripComments + firstForbidden', () => {
  // The scanner's own contract, proven on samples rather than assumed
  // through the real file: prose is out of scope, code is in scope.
  it('a source whose comments mention location and window yields no finding', () => {
    const prose = [
      '// The area card sets the home location before the run ends.',
      '/* window.location and navigator are browser globals this module never touches. */',
      "const label = '2 of 5'",
    ].join('\n')
    expect(firstForbidden(prose)).toBeNull()
  })

  it('a source whose code mentions location yields a finding', () => {
    const code = ['function whereAmI() {', '  return window.location.href', '}'].join('\n')
    expect(firstForbidden(code)).not.toBeNull()
  })
})

describe('purity', () => {
  // Acceptance criterion: "the module imports no client, reads no clock, and
  // touches no browser global." Two proofs: a source scan (absence) and a
  // clock spy (behaviour).
  it('firstRun.ts code imports nothing and names no clock, client, or browser global', () => {
    // `?raw` pulls in the module's own source as a string, so the scan cannot
    // drift from the code: it is the very file vitest executed above.
    // Comments are stripped first, so the scan proves the CODE is pure — a
    // doc comment saying "the area card sets the home location" must not
    // fail a purity test.
    expect(firstForbidden(firstRunSource)).toBeNull()
    // The model has no dependencies at all — no import statements whatsoever.
    expect(stripComments(firstRunSource)).not.toMatch(/^\s*import\s/m)
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
