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
  nextCard,
  nextUnfinishedCard,
  previousCard,
  progressLabel,
  resolveCard,
  SKIPPABLE_CARDS,
  type FirstRunCardId,
  type FirstRunFacts,
  type FirstRunState,
} from './firstRun'

/** A complete facts object; each test overrides only what it exercises. */
function facts(over: Partial<FirstRunFacts> = {}): FirstRunFacts {
  return {
    signedIn: true,
    hasName: false,
    hasKids: false,
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
  it('is exactly the four cards, in order', () => {
    expect(FIRST_RUN_CARDS).toEqual(['account', 'name', 'kids', 'area'])
  })
})

describe('SKIPPABLE_CARDS — the one authority for which cards may be skipped', () => {
  // V28 r2 slice 6a fix 1: `isSkippable` used to decide with its own
  // `card === 'kids'`, while the copy module pinned the same fact a second time
  // as a `kids:` key in its type annotation, with only a comment claiming they
  // agreed. Now the list is the source, the id type is derived from it, and
  // firstRunCopy.ts derives its copy shape from that type.
  it('is exactly kids', () => {
    expect(SKIPPABLE_CARDS).toEqual(['kids'])
  })

  it('is what isSkippable decides — every card agrees with the list', () => {
    for (const card of FIRST_RUN_CARDS) {
      expect(isSkippable(card)).toBe((SKIPPABLE_CARDS as readonly string[]).includes(card))
    }
  })

  it('contains only ids that are in FirstRunCardId', () => {
    // V28 r2 slice 6a fix 2 (item D): `as const` alone did not tie the list to
    // the card union — `['kidz']` was a valid statement, and it would have made
    // `SkippableFirstRunCardId` a type no card inhabits, so every card became
    // non-skippable and the required `skipLabel` vanished from the copy shape
    // with nothing to catch it. `satisfies readonly FirstRunCardId[]` puts the
    // error on the constant itself (measured: firstRun.ts(56,33) TS2322 Type
    // '"kidz"' is not assignable to type 'FirstRunCardId', plus OnboardingPage
    // reporting `skipLabel: string | undefined` no longer assignable — the exact
    // degradation the reviewer predicted). This pin is the runtime shadow of a
    // compile-time tie: cheap, and it says what the tie is for.
    for (const card of SKIPPABLE_CARDS) {
      expect(FIRST_RUN_CARDS).toContain(card)
    }
  })
})

describe('isSkippable', () => {
  it('account, name, and area are required — not skippable', () => {
    expect(isSkippable('account')).toBe(false)
    expect(isSkippable('name')).toBe(false)
    expect(isSkippable('area')).toBe(false)
  })

  it('kids is the only skippable card', () => {
    expect(isSkippable('kids')).toBe(true)
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

  it('a parent who has everything but a zip lands on the area card', () => {
    expect(
      nextUnfinishedCard(facts({ hasName: true, hasKids: true, hasZip: false })),
    ).toBe('area')
  })

  it('is null when name and zip are both set — even with kids skipped', () => {
    expect(nextUnfinishedCard(facts({ hasName: true, hasZip: true }))).toBeNull()
  })

  it('terminates for a parent who never sets hasKids: name and zip set is null', () => {
    expect(
      nextUnfinishedCard(facts({ hasName: true, hasKids: false, hasZip: true })),
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
    // The parent skipped kids and quit before area. "Skipped" and
    // "not reached" are indistinguishable from the derived facts, so they
    // resume on the kids card and tap Skip again — the accepted price of not
    // adding a step column (plan.md, slice 1).
    expect(
      nextUnfinishedCard(facts({ hasName: true, hasKids: false, hasZip: false })),
    ).toBe('kids')
  })
})

describe('resolveCard — the render-site decision (V28 r2 slice 8a)', () => {
  /** A complete state; each test overrides only what it exercises. */
  function state(over: Partial<FirstRunState> = {}): FirstRunState {
    return { hasProfile: true, hasKids: null, hasZip: false, ...over }
  }

  it('no profiles row → the NAME card, whatever else is true', () => {
    // The row is what the name card creates, so this branch owns every parent
    // without one — including a session whose zip/kids facts are stale.
    expect(resolveCard(state({ hasProfile: false }), [])).toBe('name')
    expect(resolveCard(state({ hasProfile: false, hasZip: true }), [])).toBe('name')
    expect(resolveCard(state({ hasProfile: false, hasKids: true }), [])).toBe('name')
  })

  it('a SET zip ends the run → the ending view, whatever the kids fact says', () => {
    expect(resolveCard(state({ hasZip: true, hasKids: null }), [])).toBe('finish')
    expect(resolveCard(state({ hasZip: true, hasKids: false }), [])).toBe('finish')
    expect(resolveCard(state({ hasZip: true, hasKids: true }), [])).toBe('finish')
    // Even a card the session skipped does not outrank the completion clause.
    expect(resolveCard(state({ hasZip: true, hasKids: false }), ['kids'])).toBe('finish')
  })

  it('an unsettled kids fact renders the PENDING state, never the kids card', () => {
    // The gap is the defect's write path: offering the card while the read is
    // in flight lets a returning parent with kids answer it again (addKid).
    expect(resolveCard(state({ hasKids: null }), [])).toBe('kids-pending')
  })

  it('a settled empty kids fact → the kids card', () => {
    expect(resolveCard(state({ hasKids: false }), [])).toBe('kids')
  })

  it('a settled kids fact with kids present → straight to the area card', () => {
    expect(resolveCard(state({ hasKids: true }), [])).toBe('area')
  })

  it('a SKIPPED kids card advances to the area card, settled or not', () => {
    // The session's Skip is the only thing that can advance past a card whose
    // fact still says "offer again" — firstRun's documented rule for a skipped
    // optional card, and the reason the page owns `kidsCardDone` as well as the
    // lazy read. Without this clause a Skip would re-render the card forever.
    expect(resolveCard(state({ hasKids: false }), ['kids'])).toBe('area')
    expect(resolveCard(state({ hasKids: null }), ['kids'])).toBe('area')
  })

  it('skipping is the SESSION fact: an EMPTY list means the card is offered again', () => {
    // The control direction of the clause above: a session that skipped nothing
    // must not advance, or the resume rule is lost. V28 r2 slice 8a fix round 1:
    // `skippedCards` is REQUIRED, so `[]` is written out at every call site — the
    // old default read an OMITTED argument as the decision "nothing was skipped"
    // (D-030: a measurement that did not happen, consumed as a fact).
    expect(resolveCard(state({ hasKids: false }), [])).toBe('kids')
    expect(resolveCard(state({ hasKids: null }), [])).toBe('kids-pending')
  })

  it('a non-skippable card in the list does not advance anything', () => {
    // `skippedCards` is typed as any card id, so a caller that handed in the
    // wrong id must not silently skip a REQUIRED card: only `kids` advances.
    expect(resolveCard(state({ hasKids: null }), ['area', 'name'])).toBe('kids-pending')
    expect(resolveCard(state({ hasKids: false }), ['area', 'name'])).toBe('kids')
  })
})

describe('progressLabel', () => {
  it('is the 1-based position within the four cards', () => {
    expect(progressLabel('account')).toBe('1 of 4')
    expect(progressLabel('name')).toBe('2 of 4')
    expect(progressLabel('kids')).toBe('3 of 4')
    expect(progressLabel('area')).toBe('4 of 4')
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
      // All 16 fact combinations, so the spy walks every branch of
      // nextUnfinishedCard — including the kids and area branches the old
      // two-sample loop never traversed.
      for (const signedIn of [false, true])
        for (const hasName of [false, true])
          for (const hasKids of [false, true])
            for (const hasZip of [false, true])
              nextUnfinishedCard({ signedIn, hasName, hasKids, hasZip })
    } finally {
      spy.mockRestore()
    }
    expect(spy).not.toHaveBeenCalled()
  })
})

/**
 * V28 r3-5 (r3-D2) — the ordered neighbours the back/forward move reads.
 *
 * Table-driven, because these are pure and have no branches worth a bespoke test:
 * every card in, its two neighbours out, plus the two ends.
 */
describe('previousCard / nextCard — the ordered neighbours', () => {
  it('walks FIRST_RUN_CARDS in order and null-terminates both ends', () => {
    const table: Array<[FirstRunCardId, FirstRunCardId | null, FirstRunCardId | null]> = [
      ['account', null, 'name'],
      ['name', 'account', 'kids'],
      ['kids', 'name', 'area'],
      ['area', 'kids', null],
    ]
    // The table is the WHOLE card list — a new card must be added here, so a
    // card the neighbours silently skipped cannot pass.
    expect(table.map(([card]) => card)).toEqual([...FIRST_RUN_CARDS])
    for (const [card, previous, next] of table) {
      expect(previousCard(card), `previousCard(${card})`).toBe(previous)
      expect(nextCard(card), `nextCard(${card})`).toBe(next)
    }
  })

  it('the ends are ONE null each — no card has two, and none wraps', () => {
    const starts = FIRST_RUN_CARDS.filter((card) => previousCard(card) === null)
    const ends = FIRST_RUN_CARDS.filter((card) => nextCard(card) === null)
    expect(starts).toEqual(['account'])
    expect(ends).toEqual(['area'])
    // No wrap: the first card is never the last card's next, which a modular
    // implementation would return.
    expect(nextCard('area')).not.toBe(FIRST_RUN_CARDS[0])
    expect(previousCard('account')).not.toBe(FIRST_RUN_CARDS[FIRST_RUN_CARDS.length - 1])
  })

  it("the neighbours are MUTUAL — b is a's next exactly when a is b's previous", () => {
    for (const card of FIRST_RUN_CARDS) {
      const next = nextCard(card)
      if (next !== null) expect(previousCard(next), `${card} -> ${next}`).toBe(card)
      const previous = previousCard(card)
      if (previous !== null) expect(nextCard(previous), `${previous} -> ${card}`).toBe(card)
    }
  })

  it('derives from FIRST_RUN_CARDS rather than a literal list', () => {
    // The source reads the array and never an index literal — the invariant
    // progressLabel already obeys, so a future card change cannot leave the
    // neighbours behind while the label moves.
    const block = firstRunSource.slice(firstRunSource.indexOf('export function previousCard'))
    expect(block).toContain('FIRST_RUN_CARDS.indexOf')
    expect(block).toContain('FIRST_RUN_CARDS.length')
    // No hard-coded positional numbers in either body. ⚠️ COMMENTS ARE STRIPPED
    // FIRST, because `nextCard`'s own comment quotes `FIRST_RUN_CARDS[0]` while
    // explaining why it must never return it — a naive scan fires on the
    // documentation of the rule it is checking. Same quotation-vs-claim
    // distinction the acceptance-grep guard had to make.
    const code = block
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n')
    expect(
      /\[\s*[0-9]\s*\]/.test(code),
      'a literal index is a second source of order',
    ).toBe(false)
  })

  it('an unknown card has NO neighbours, rather than a wrong one', () => {
    // Unreachable through the type, and answered honestly anyway: `indexOf`
    // returns -1, and +1 would hand back FIRST_RUN_CARDS[0] — a wrong card
    // rather than no card.
    const bogus = 'not-a-card' as FirstRunCardId
    expect(previousCard(bogus)).toBeNull()
    expect(nextCard(bogus)).toBeNull()
  })

  it('is pure — no clock, and no mutation of the list it reads', () => {
    const spy = vi.spyOn(Date, 'now')
    const before = [...FIRST_RUN_CARDS]
    try {
      for (const card of FIRST_RUN_CARDS) {
        previousCard(card)
        nextCard(card)
      }
    } finally {
      spy.mockRestore()
    }
    expect(spy).not.toHaveBeenCalled()
    expect([...FIRST_RUN_CARDS]).toEqual(before)
  })
})
