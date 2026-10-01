/**
 * V28 r2 slice 5 — the ending card's tour copy.
 *
 * FIX ROUND 1 changed what these tests assert. The first round policed a
 * VOCABULARY (the card may not match /\bplaces?\b/i) and the shipped line
 * "look up parks and playgrounds, and see their hours and where they are"
 * passed it while making exactly the claim the rule forbids — a category with
 * ZERO rows in the directory, plus hours 55 of 239 rows do not have. A word
 * list authored next to the copy it polices is a spell-checker. So the tests
 * below assert PROPERTIES, over the app's own taxonomy and the app's own
 * measured decisions, and the copy is true first and tested second.
 *
 * What is pinned:
 *
 * 1. Every line says what a control DOES (an action verb), never what is IN it.
 * 2. PROPERTY: the card names no place category the app itself refuses to
 *    offer — a kind withheld from `PLACE_KIND_CHIP_KINDS` is withheld because
 *    it holds zero rows. This is the test that would have caught the defect.
 * 3. The built-but-invisible capability (linking a partner) is named as one
 *    flow, with the name search as a step inside it rather than as a feature
 *    that does not exist.
 * 4. The two identifiers the whole e2e suite is built on.
 *
 * The label list is pinned against the REAL nav (`src/App.tsx`: the four
 * `NavTab` labels and `PostActionButton`'s aria-label, in the bar's order), so
 * a tour that drifts from the bar it is describing fails here rather than on a
 * parent's phone.
 */
import { describe, expect, it } from 'vitest'
import {
  TOUR_ACTION_VERBS,
  TOUR_BANNED_COPY,
  TOUR_BODY,
  TOUR_LINES,
  TOUR_PRIMARY_LABEL,
  TOUR_PROGRESS_LABEL,
  TOUR_TITLE,
} from './firstRunTour'
import { PLACE_KINDS, PLACE_KIND_CHIP_KINDS, placeKindLabel } from './places'

/** Everything the card renders except the tab/control labels themselves. */
const CARD_WORDS = [
  TOUR_PROGRESS_LABEL,
  TOUR_TITLE,
  TOUR_BODY,
  ...TOUR_LINES.map((line) => line.detail),
].join(' ')

describe('TOUR_LINES — the four tabs and the Post action, one line each', () => {
  // The bar's real order (src/App.tsx): Drop Ins, Inbox, the Post action
  // between Inbox and Places, Places, Profile. The labels are the ones the
  // parent will read in the bar — the four NavTab labels and
  // PostActionButton's aria-label ("Post a drop-in").
  it('names exactly the four tabs plus the Post action, in the bar’s order', () => {
    expect(TOUR_LINES.map((line) => line.label)).toEqual([
      'Drop Ins',
      'Inbox',
      'Post a drop-in',
      'Places',
      'Profile',
    ])
  })

  it('gives every line a non-empty label and detail', () => {
    for (const line of TOUR_LINES) {
      expect(line.label.length, `${line.label}.label`).toBeGreaterThan(0)
      expect(line.detail.length, `${line.label}.detail`).toBeGreaterThan(0)
    }
  })

  // The founder's ruling, recorded in App.tsx: the centre control is an
  // ACTION, not a fifth tab ("Do NOT 'fix' the nav back to the V22 shape").
  // The tour must teach that shape, not undo it.
  it('describes the centre control as the + action, never as a tab', () => {
    const action = TOUR_LINES.find((line) => line.label === 'Post a drop-in')
    expect(action, 'the Post action line is missing from the tour').toBeDefined()
    expect(action?.detail).toContain('+')
    expect(action?.detail.toLowerCase()).not.toContain('tab')
  })
})

describe('the honesty rule — every line says what a control DOES', () => {
  // The mechanical form of the rule: a line that cannot be completed with an
  // action verb has turned into a description of contents.
  it('every detail carries an action verb', () => {
    for (const line of TOUR_LINES) {
      const hasVerb = TOUR_ACTION_VERBS.some((verb) =>
        new RegExp(`\\b${verb}\\b`, 'i').test(line.detail),
      )
      expect(hasVerb, `${line.label}: "${line.detail}" names no action`).toBe(true)
    }
  })

  // A regression pin of the wordings this batch shipped and removed (r1's
  // ending cost a review round). NOT the guard — see the docblock on
  // TOUR_BANNED_COPY. Measured today (plan.md fact 12): ZERO upcoming
  // drop-ins, all 20 hosted from one ZIP.
  it('never re-uses a claim this batch already removed', () => {
    for (const claim of TOUR_BANNED_COPY) {
      expect(CARD_WORDS.toLowerCase(), `the card claims "${claim}"`).not.toContain(
        claim.toLowerCase(),
      )
    }
  })
})

describe('the PROPERTY — every category the card names has rows behind it', () => {
  // THE TEST THAT WOULD HAVE CAUGHT THE SHIPPED DEFECT. "look up parks and
  // playgrounds" names a category the app WILL NOT OFFER, because a chip for
  // it could only come back empty: `places.ts` states the founder's binding
  // decision — "no chip that can only ever return an empty list" — and
  // `PLACE_KIND_CHIP_KINDS` therefore omits `park` and `trail`, which hold
  // ZERO of the directory's 239 rows (measured live, 2026-09-29; playground
  // 155 · splash_pad 30 · other 26 · pool 10 · beach 9 · library 6 ·
  // indoor_play 2 · museum 1). The app even says so to the parent: "No “Park”
  // places in the directory yet."
  //
  // So the property is: if the app has a WORD for a category and refuses to
  // put it in front of the parent, the run's last card may not promise it
  // either. The vocabulary is imported from the app's own taxonomy, not
  // written next to the copy it polices — which is what makes this a property
  // and not a longer blocklist.
  //
  // THE HONEST LIMIT: this catches every category the app has a word for. A
  // noun outside that taxonomy (a "café", which the directory also lacks) is
  // not checkable here — it needs a live row count, and that guard is
  // V28 r2 slice 6's, not this file's. Nor can a unit test check an
  // attribute's COVERAGE (hours: 184 of 239 rows, 55 without), so the copy
  // makes no such promise at all rather than testing for one.
  const offeredLabels = new Set(PLACE_KIND_CHIP_KINDS.map((kind) => placeKindLabel(kind)))
  for (const kind of PLACE_KINDS) {
    const label = placeKindLabel(kind)
    if (offeredLabels.has(label)) continue
    it(`never names "${label}", a category the app withholds because it has no rows`, () => {
      expect(CARD_WORDS, `the card names ${label} places the app does not have`).not.toMatch(
        new RegExp(`\\b${label}s?\\b`, 'i'),
      )
    })
  }

  // The other half of the same property, stated positively: the Places line
  // earns its nouns from kinds that DO have rows, and its promise is a
  // capability (the post form's place picker is fed by this same directory —
  // `listPlaces` in NewPlaydatePage.tsx), so it stays true on an empty day.
  it('the Places line names only kinds the app offers a chip for', () => {
    const places = TOUR_LINES.find((line) => line.label === 'Places')
    expect(places, 'the Places line is missing from the tour').toBeDefined()
    const named = PLACE_KINDS.filter((kind) =>
      new RegExp(`\\b${placeKindLabel(kind)}s?\\b`, 'i').test(places?.detail ?? ''),
    )
    expect(named.length, 'the Places line names no category at all').toBeGreaterThan(0)
    for (const kind of named) {
      expect(
        (PLACE_KIND_CHIP_KINDS as readonly string[]).includes(kind),
        `the Places line names ${kind}, which has no rows`,
      ).toBe(true)
    }
  })
})

describe('the built-but-invisible capability is named, and named truly', () => {
  // Linking a partner's account is the ONE production driver of
  // `searchProfilesByName` (`ProfilePage.tsx:362`; the name field and the
  // @handle field are the same section of the same form). "Find another
  // parent by name" as a standalone discovery feature DOES NOT exist, so the
  // card states the search as a step inside the link flow — which means the
  // word "name" may only appear after the "link" it belongs to.
  it('the Profile line names the partner link, with the name search inside it', () => {
    const profile = TOUR_LINES.find((line) => line.label === 'Profile')
    expect(profile, 'the Profile line is missing from the tour').toBeDefined()
    const detail = profile?.detail ?? ''
    const lower = detail.toLowerCase()
    expect(lower).toMatch(/link/)
    expect(lower).toMatch(/name/)
    const linkAt = lower.indexOf('link')
    const nameAt = lower.indexOf('name')
    expect(
      nameAt,
      `the Profile line offers a name search before the link it belongs to: "${detail}"`,
    ).toBeGreaterThan(linkAt)
  })

  it('no other line offers the parent-name search as its own feature', () => {
    for (const line of TOUR_LINES.filter((line) => line.label !== 'Profile')) {
      expect(
        line.detail,
        `${line.label} also offers a name search: "${line.detail}"`,
      ).not.toMatch(/\bby name\b|search\b[^,.]*\bname/i)
    }
  })
})

describe('the pinned chrome', () => {
  // ⚠️ LOAD-BEARING: e2e/auth.setup.ts (every spec's setup), e2e/fixtures.ts
  // (finishSignup, 17 consumers) and e2e/signup-zip-fallback.e2e.ts all locate
  // this button by getByRole('button', { name: 'Go to your feed' }). Same
  // class as the name card's /^Continue/ pin.
  it('keeps the "Go to your feed" CTA the e2e suite clicks', () => {
    expect(TOUR_PRIMARY_LABEL).toBe('Go to your feed')
  })

  // The run's ending has no card number; the product record's own line for it
  // is "All done — How Drop In works".
  it('keeps the "All done" progress line and the tour title', () => {
    expect(TOUR_PROGRESS_LABEL).toBe('All done')
    expect(TOUR_TITLE).toBe('How Drop In works')
  })
})
