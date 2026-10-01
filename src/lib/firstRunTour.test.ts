/**
 * V28 r2 slice 5 — the ending card's tour copy.
 *
 * FIX ROUND 3 changed the shape of the category property. The reviewer and
 * `ocr` reported one defect from two sides: the negative half derived the
 * withheld categories BY LABEL while the vacuity guard counted KINDS, and the
 * e2e derived them BY KIND MEMBERSHIP with its own copy of the escape
 * one-liner. The label view is lossy (`placeKindLabel`'s `default: 'Place'`
 * proves two kinds can share a word), so a withheld kind whose label collides
 * with an offered one vanished from the generated loop while the guard stayed
 * green. Both derivations now come from ONE exported implementation in
 * `firstRunTour.ts` (`withheldPlaceCategories` / `withheldCategoryPattern`),
 * the guard counts the exact array the loop iterates, and the pattern builder
 * throws rather than emitting a pattern that matches nothing. Which derivation
 * was correct, and why, is argued at the module; the collision hazard the
 * label view exposed is kept as a LOUD assertion, not folded away.
 *
 * FIX ROUND 2 changed two things about these tests.
 *
 * (1) The negative half of the category property GENERATES one test per kind
 *     withheld from `PLACE_KIND_CHIP_KINDS`. If that set ever covers every
 *     `PLACE_KINDS` entry — a future slice re-adding the park chip once rows
 *     appear — the loop emits ZERO tests and the property silently degrades to
 *     its positive half alone. The positive half already had a vacuity guard;
 *     the negative half had none. It has one now, and since round 3 the empty
 *     case is also unconstructable in the pattern builder.
 *
 * (2) The Profile assertion compared the FIRST-OCCURRENCE INDICES of "link"
 *     and "name", which enforces SEQUENCE, not SUBORDINATION: "…link your
 *     partner's account. You can also search any parent by name" passed it,
 *     making exactly the standalone claim the test exists to prevent. It now
 *     requires the two to sit in the SAME SENTENCE and the searched name to be
 *     POSSESSIVELY BOUND to the partner ("their name"). The proxy and what it
 *     still misses are stated at the test itself.
 *
 * What is pinned:
 *
 * 1. Every line says what a control DOES (an action verb), never what is IN it.
 * 2. PROPERTY: the card names no place category the app itself refuses to
 *    offer — a kind withheld from `PLACE_KIND_CHIP_KINDS` is withheld because
 *    it holds zero rows. This is the test that caught the shipped defect.
 * 3. The body's positional claim covers BOTH layouts, states them in the terms
 *    the layout switches on (width, not device class), and does not classify
 *    the centre Post action as navigation.
 * 4. The built-but-invisible flow (linking a partner) is named as one flow,
 *    with the name search subordinate inside it.
 * 5. The two identifiers the whole e2e suite is built on.
 *
 * The label list is pinned against the REAL nav (`src/App.tsx`: the four
 * `NavTab` labels and `PostActionButton`'s aria-label, in the nav's order), so
 * a tour that drifts from the nav it is describing fails here rather than on a
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
  escapeForRegExp,
  placeCategoryPattern,
  withheldCategoryPattern,
  withheldPlaceCategories,
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
  // parent will read in the nav — the four NavTab labels and
  // PostActionButton's aria-label ("Post a drop-in").
  it('names exactly the four tabs plus the Post action, in the nav’s order', () => {
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
        new RegExp(`\\b${escapeForRegExp(verb)}\\b`, 'i').test(line.detail),
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

  // R1 of fix round 2: the body told the parent the controls sit "along the
  // bottom of the screen". App.tsx:482-484 renders the nav TWO ways —
  // `fixed inset-x-0 bottom-0` below md, and `md:sticky md:top-16` +
  // `md:flex-col` + `md:border-r` above it ("a left rail", App.tsx:612) — so
  // that body was wrong on every wide viewport, on the one card whose whole
  // job is saying where the controls are.
  //
  // THE RULE IS A PAIRING, NOT A BAN: naming one arrangement is fine only if
  // the other is named too. Its honest limit: it cannot tell that a PAIR of
  // position words is itself wrong (only App.tsx's classes can settle that),
  // and it cannot catch a body that names no position at all — which is also
  // legal, and is what a future rewrite should reach for instead of a third
  // layout claim.
  //
  // E of fix round 3: the assertion is symmetric, so the MESSAGE has to pick
  // the direction that actually failed. A body naming only the rail used to
  // fail with a complaint about the bottom, which mis-described the failure.
  it('the body places the controls in both arrangements, or in neither', () => {
    const lower = TOUR_BODY.toLowerCase()
    const namesBottom = /\bbottom\b/.test(lower)
    const namesRail = /\b(left|side|rail)\b/.test(lower)
    const message = namesBottom
      ? `the body names the narrow-screen bottom bar but never the md+ left rail: "${TOUR_BODY}"`
      : namesRail
        ? `the body names the md+ left rail but never the narrow-screen bottom bar: "${TOUR_BODY}"`
        : `the body names neither arrangement, which is legal only if it names no position at all: "${TOUR_BODY}"`
    expect(namesRail, message).toBe(namesBottom)
  })

  // B and C of fix round 3, both the same over-claim in one sentence:
  //
  // (B) The shipped body called the whole set "how you move around the app".
  //     The third entry is the centre Post action, which App.tsx:489-499 and
  //     this module's header record as an ACTION, not a fifth NavTab
  //     destination — the invariant this file already pins at the LINE level
  //     ("never as a tab"), violated one level up by the framing sentence.
  // (C) It mapped the `md:` breakpoint onto DEVICE CLASSES ("a phone" / "a
  //     tablet or desktop"). The app switches on WIDTH, so that sentence was
  //     marginally stronger than the classes warrant: a narrow desktop window
  //     and a wide phone both break it.
  //
  // THE HONEST LIMIT: these are word-level checks on ONE sentence. They cannot
  // catch a navigation-only paraphrase ("the places you go") or a device-class
  // paraphrase ("smaller devices"). What they do is make the two wrong framings
  // expensive to re-introduce while the copy itself names USE and WIDTH.
  it('the body frames the set as use, not navigation, and switches on width, not device class', () => {
    expect(
      TOUR_BODY,
      `the body calls every control a way to get around the app, which reclassifies the centre Post action as navigation: "${TOUR_BODY}"`,
    ).not.toMatch(/\b(move around|get around|navigat\w*)\b/i)
    expect(
      TOUR_BODY,
      `the body attributes an arrangement to a device class; App.tsx switches on the md WIDTH breakpoint: "${TOUR_BODY}"`,
    ).not.toMatch(/\b(phone|tablet|desktop|laptop|mobile|monitor)\b/i)
  })
})

describe('the PROPERTY — every category the card names is one the app offers', () => {
  // THE TEST THAT CAUGHT THE SHIPPED DEFECT. "look up parks and playgrounds"
  // names a category the app WILL NOT OFFER, because a chip for it could only
  // come back empty: `places.ts` states the founder's binding decision — "no
  // chip that can only ever return an empty list" — and `PLACE_KIND_CHIP_KINDS`
  // therefore omits `park` and `trail`, which hold ZERO of the directory's 239
  // rows (measured live, 2026-09-29; playground 155 · splash_pad 30 · other 26
  // · pool 10 · beach 9 · library 6 · indoor_play 2 · museum 1). The app even
  // says so to the parent: "No “Park” places in the directory yet."
  //
  // So the property is: if the app has a WORD for a category and refuses to
  // put it in front of the parent, the run's last card may not promise it
  // either. The vocabulary is imported from the app's own taxonomy, not
  // written next to the copy it polices — which is what makes this a property
  // and not a longer blocklist.
  //
  // ⚠️ WHAT THE PROXY IS AND IS NOT: it is CHIP MEMBERSHIP, not a row count.
  // `places.ts:157-166` records that a shipped kind can go EMPTY at runtime,
  // so this test cannot promise rows — it promises only that the app offers
  // the category. And the counts above are of the WHOLE directory, while the
  // Places tab defaults to the viewer's own radius (`PlaceDirectory.tsx:266`,
  // `distanceChoice = 'profile'`), so they justify that a kind EXISTS, never
  // what a given parent will see.
  //
  // THE HONEST LIMIT: this catches every category the app has a word for. A
  // noun outside that taxonomy (a "café", which the directory also lacks) is
  // not checkable here — it needs a live row count, and that guard is
  // V28 r2 slice 6's, not this file's. Nor can a unit test check an
  // attribute's COVERAGE (hours: 184 of 239 rows, 55 without), so the copy
  // makes no such promise at all rather than testing for one.
  const withheld = withheldPlaceCategories()
  const offeredKinds = new Set<string>(PLACE_KIND_CHIP_KINDS)
  const offeredLabels = new Set(PLACE_KIND_CHIP_KINDS.map((kind) => placeKindLabel(kind)))

  // THE VACUITY GUARD. The loop below is generated, so an empty `withheld` is
  // not a passing property — it is ZERO TESTS, and the suite stays green while
  // the negative half quietly disappears. This is the vacuity class this batch
  // has paid for repeatedly. Since fix round 3 the guard counts the EXACT array
  // the loop iterates, so the two cannot drift apart.
  it('the negative half has something to check (it never emits zero tests)', () => {
    expect(
      withheld.length,
      'PLACE_KIND_CHIP_KINDS now covers every PLACE_KINDS entry, so the ' +
        'withheld-category property generates zero tests and has silently ' +
        'degraded to its positive half alone. Either a kind is genuinely ' +
        'withheld again, or this property must be replaced by the live-count ' +
        'guard (V28 r2 slice 6) — do not leave the loop empty and green.',
    ).toBeGreaterThan(0)
  })

  // THE DERIVATION'S CONTRACT, and the finding that made this test necessary.
  // Withholding is a set difference over KINDS, so its size is fixed by the
  // taxonomy and no label can shrink it. The round-2 derivation filtered by
  // LABEL, and a label is a lossy projection of a kind — `placeKindLabel`'s own
  // `default: return 'Place'` proves two kinds can share one word — so a
  // withheld kind whose label collided with an offered one dropped out of the
  // loop while this count stayed green. Proven red both ways: the old
  // derivation is green over the collision, this assertion is not.
  it('the withheld set is the KIND difference, so no label can silently shrink it', () => {
    expect(withheld.length).toBe(PLACE_KINDS.length - PLACE_KIND_CHIP_KINDS.length)
    expect(withheld.map((category) => category.kind)).toEqual(
      PLACE_KINDS.filter((kind) => !offeredKinds.has(kind)),
    )
  })

  // The hazard the label view was reaching for, kept as a LOUD assertion
  // instead of being folded into the derivation. If a withheld kind's label
  // ever equals an offered kind's label, the per-kind test below would forbid
  // this card from using a word the app itself puts on a chip — a false
  // positive that must not be papered over by dropping the kind. TWO
  // RESOLUTIONS, and only these: give the kinds distinct labels in
  // `placeKindLabel`, or retire this property for the live-count guard (slice
  // 6) that asks the question the label really answers.
  it('no withheld category shares a word with an offered one (else the property below is a false positive)', () => {
    const withheldLabels = withheld.map((category) => category.label)
    expect(
      new Set(withheldLabels).size,
      `two withheld kinds share a display word, so the generated loop would ` +
        `test it once and lose the other: ${withheldLabels.join(', ')}`,
    ).toBe(withheldLabels.length)
    const colliding = withheldLabels.filter((label) => offeredLabels.has(label))
    expect(
      colliding,
      `a withheld kind is labelled "${colliding.join('", "')}", which an ` +
        'OFFERED kind also shows — fix placeKindLabel, or retire this property ' +
        "for slice 6's live-count guard; do not drop the kind",
    ).toEqual([])
  })

  // The pattern builder the e2e spec uses. It must REFUSE an empty set: a
  // `toHaveCount(0)` over an empty alternation is green over every regression
  // it claims to pin, and the caller's guard is not the safety net — this is.
  it('the browser pattern cannot be built from an empty withheld set', () => {
    expect(() => withheldCategoryPattern(PLACE_KINDS, PLACE_KINDS)).toThrow(/no kind is withheld/)
    // …and it is built from the same derivation, not a second copy of it.
    const pattern = withheldCategoryPattern()
    for (const category of withheld) {
      const sample = `a ${category.label} place`
      expect(pattern.test(sample), `${category.label} missing from the pattern`).toBe(true)
    }
    const offeredSample = 'a Playground place'
    expect(
      pattern.test(offeredSample),
      `an OFFERED kind matches the withheld pattern: "${offeredSample}"`,
    ).toBe(false)
  })

  for (const category of withheld) {
    it(`never names "${category.label}", a category the app withholds because it has no rows`, () => {
      expect(
        CARD_WORDS,
        `the card names ${category.label} places the app does not have`,
      ).not.toMatch(placeCategoryPattern(category.label))
    })
  }

  // The other half of the same property, stated positively: the Places line
  // earns its nouns from kinds the app offers, and its promise is a capability
  // (the post form's place picker is fed by this same directory — `listPlaces`
  // in NewPlaydatePage.tsx), so it stays true on an empty day. "Offered" is
  // asked of the SAME derivation the negative half iterates, so the two halves
  // cannot disagree (and the e2e's `as readonly string[]` cast is gone).
  it('the Places line names only kinds the app offers a chip for', () => {
    const places = TOUR_LINES.find((line) => line.label === 'Places')
    expect(places, 'the Places line is missing from the tour').toBeDefined()
    const withheldKinds = new Set(withheld.map((category) => category.kind))
    const namesKind = (kind: (typeof PLACE_KINDS)[number]) =>
      placeCategoryPattern(placeKindLabel(kind)).test(places?.detail ?? '')
    const named = PLACE_KINDS.filter(namesKind)
    expect(named.length, 'the Places line names no category at all').toBeGreaterThan(0)
    for (const kind of named) {
      expect(
        withheldKinds.has(kind),
        `the Places line names ${kind}, which the app does not offer`,
      ).toBe(false)
    }
  })
})

describe('the built-but-invisible capability is named, and named truly', () => {
  // Linking a partner's account is the ONE production driver of
  // `searchProfilesByName` (`ProfilePage.tsx:362`; the name field and the
  // @handle field are the same section of the same form). "Find another
  // parent by name" as a standalone discovery feature DOES NOT exist.
  //
  // THE PROXY, and it is not sequence. Comparing the first-occurrence indices
  // of "link" and "name" accepted "…link your partner's account. You can also
  // search any parent by name" — exactly the standalone claim this test exists
  // to prevent. Two structural cues carry subordination instead, and both are
  // required:
  //   (a) SAME SENTENCE — no [.!?] terminator between the link and the search,
  //       so the search cannot be introduced as a new offer; and
  //   (b) POSSESSIVE BINDING — the name searched is the PARTNER'S ("their
  //       name"), a bound object, not "any parent by name" / "a parent's name",
  //       which is what a standalone discovery feature would say.
  //
  // WHAT IT STILL MISSES, stated rather than buried: it reads the SENTENCE, not
  // the app. If a standalone name search were shipped somewhere else while this
  // copy stayed possessive, the sentence would still pass; and a possessive
  // phrase could still describe a standalone feature in wording I have not
  // imagined ("search their name from the search bar"). Only a check against
  // the app's entry points — the class guard slice 6 owns — closes that.
  it('the Profile line keeps the name search inside the link flow, not beside it', () => {
    const profile = TOUR_LINES.find((line) => line.label === 'Profile')
    expect(profile, 'the Profile line is missing from the tour').toBeDefined()
    const detail = profile?.detail ?? ''

    expect(detail, 'the Profile line never mentions linking').toMatch(/\blink\b/i)
    expect(detail, 'the Profile line never mentions a name search').toMatch(/\bname\b/i)

    const sentences = detail.split(/(?<=[.!?])\s+/)
    const linkSentence = sentences.filter((sentence) => /\blink\b/i.test(sentence))
    expect(
      linkSentence.length,
      `the link is spread over ${linkSentence.length} sentences: "${detail}"`,
    ).toBe(1)
    expect(
      linkSentence[0],
      `the name search is offered outside the sentence that links an account: "${detail}"`,
    ).toMatch(/\bname\b/i)

    expect(
      detail,
      `the name search is not bound to the partner whose account is being linked: "${detail}"`,
    ).toMatch(/\b(their|his|her)\s+name\b/i)
    expect(
      detail,
      `the Profile line frames the name search as a standalone feature: "${detail}"`,
    ).not.toMatch(/\b(any|every|all|other)\s+parent\b/i)
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
