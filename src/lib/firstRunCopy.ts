/**
 * V28 slice 1 — the copy seam.
 *
 * Card titles, bodies and button labels live here as data, not inline in JSX,
 * so the words are reviewable in one place and the load-bearing ones are
 * pinned by firstRunCopy.test.ts. The shape follows the repo's precedent for
 * a small tested module of labels-as-data (src/lib/vibeChips.ts). Plain
 * strings only — no components, no formatting logic beyond interpolation.
 */
import type { FirstRunCardId, SkippableFirstRunCardId } from './firstRun'

/** The words one card shows. */
export interface FirstRunCardCopy {
  title: string
  body: string
  /** The primary action button. */
  primaryLabel: string
  /**
   * The Skip control's label. Present only on the skippable card — which card
   * that is comes from `SkippableFirstRunCardId` via `FirstRunCopyByCard`, not
   * from a card id named here.
   *
   * This value IS the word the button shows: FirstRunCard takes `skipLabel`
   * as a prop (passed by OnboardingPage from this module) and keeps no label
   * of its own, so the chrome cannot drift from it. V28 r2 slice 6a: it used
   * to read "Skip for now" while the chrome rendered a hard-coded "Skip" and
   * nothing in src read the field at all — a field that described a word the
   * UI never showed, in the module whose whole job is the UI's words.
   */
  skipLabel?: string
}

/**
 * The copy of a card that CAN be skipped: its Skip word is part of its shape,
 * not an optional extra. Which card that is comes from
 * `SkippableFirstRunCardId` (lib/firstRun.ts) — see `FirstRunCopyByCard` below;
 * this type only states that the entry which is skippable carries the word, so
 * the caller can hand FirstRunCard's `skipLabel` prop without a fallback and
 * the chrome never needs a word of its own.
 */
export interface SkippableFirstRunCardCopy extends FirstRunCardCopy {
  skipLabel: string
}

/**
 * The copy for all four cards, keyed by card id. `primaryLabel` on the name
 * card must keep matching /^Continue/ — the e2e helpers locate it by that
 * (plan.md, slice 3a).
 *
 * The skippable entry is the only one whose shape carries `skipLabel`, and
 * WHICH entry that is is DERIVED from `SkippableFirstRunCardId` — the same
 * authority `isSkippable` reads — rather than restated here as a `kids:` key.
 * V28 r2 slice 6a fix 1: the annotation used to be
 * `Record<FirstRunCardId, FirstRunCardCopy> & { kids: SkippableFirstRunCardCopy }`,
 * which pinned the skippable card a second time in a file whose job is words,
 * not decisions; if the authority changed, this module would keep requiring the
 * word on a card that had stopped being skippable, and the only thing noticing
 * would be a test that happens to assert which keys lack it.
 *
 * Totality is kept: the mapped type has a required key for every
 * `FirstRunCardId`, so adding a card without copy is still a compile error.
 *
 * It is MODULE-LOCAL. V28 r2 slice 6a fix 1 exported it so the copy guard could
 * resolve the annotation; fix 3 measured that claim by de-exporting it in a
 * sandbox and re-running the guard, which still reported every field — the walk
 * reads the module's own type declarations, export or not. An exported type with
 * no consumer is public surface, so the export is gone and the type stays.
 */
type FirstRunCopyByCard = {
  [K in FirstRunCardId]: K extends SkippableFirstRunCardId
    ? SkippableFirstRunCardCopy
    : FirstRunCardCopy
}

export const FIRST_RUN_COPY: FirstRunCopyByCard = {
  account: {
    title: 'Create your account',
    body: 'Email and password — that is all it takes to start. The rest of the setup takes about a minute.',
    primaryLabel: 'Create account',
  },
  name: {
    title: "What should we call you?",
    // V28 r2 slice 2: the body says what the name IS FOR — it is how other
    // parents find and recognize you (the public handle) — and names only
    // fields the card renders: the first/last name pair and the photo block
    // this same slice moved onto the card. The old body's "A first name is
    // plenty" sat under the LAST NAME field and read like a suggestion to
    // leave it empty. No privacy lecture — this card is a name step.
    body: 'This is how other parents find and recognize you — a first and last name, and a picture if you have one. That is your public handle, and you can change it later in settings.',
    primaryLabel: 'Continue',
  },
  kids: {
    title: "Who's coming?",
    body: 'Add the kids who will come to drop-ins. A name and an age are all we ask — it helps parents and hosts know who is showing up.',
    primaryLabel: 'Continue',
    // Exactly the word the button renders: the e2e specs (signup-zip-fallback,
    // onboarding-resume, fixtures, auth.setup) locate this control by
    // getByRole('button', { name: 'Skip' }), so the copy and that name are one
    // contract, pinned in firstRunCopy.test.ts.
    skipLabel: 'Skip',
  },
  area: {
    title: 'Where do you live?',
    body: 'We use your neighborhood to show nearby drop-ins. An address works best; a ZIP code works too.',
    primaryLabel: 'Finish',
  },
}

/**
 * V34-C — THE FINISH TRANSITION'S WORDS, on the same seam as every other word
 * the run renders (the copy module is the UI's words as data, so the sentence a
 * parent reads between the Finish tap and the feed is reviewable here rather
 * than inline in JSX).
 *
 * WHAT THE PARENT IS ACTUALLY WAITING ON, because the sentence claims it: the
 * tap writes the home zip + radius and then re-reads the session profile. That
 * IS the profile the feed will be built from, so "Building your profile…" is
 * the honest description — not a decorative verb, and not a claim about work
 * the app is not doing.
 *
 * The punctuation is part of the contract: the house's other busy labels
 * ("Saving…", "Checking your address…", "Loading…") all use the single U+2026,
 * and the e2e spec locates this line by a stable substring.
 *
 * ⚠️ NOT `as const` — deliberately. `copy-field-consumption-guard` reads an
 * object-literal export's SHAPE to judge whether every field is consumed, and
 * an `as const` assertion is not the shape it resolves: the guard reports the
 * const as "blind on it", which is a finding rather than a pass. The literal
 * needs no widening (nothing indexes it dynamically), so the assertion would
 * buy nothing and cost the instrument.
 */
export const FIRST_RUN_COMPLETION_COPY = {
  /** The state's one line, rendered inside the `role="status"` region. */
  message: 'Building your profile…',
}

/**
 * V28 slice 3c (fix 1) → slice 4a — the resume nudge's GENERIC line
 * (src/App.tsx).
 *
 * The nudge must not name the card it points at — PERMANENTLY (ruling after
 * defect #20): the generic line is never wrong, and naming a card couples
 * the shell to the card inventory — the exact coupling that caused the
 * blocking finding. Since slice 4a the name and kids cards DO read
 * FIRST_RUN_COPY (their words come from this module, not from hard-coded
 * strings), but the nudge still speaks FIRST_RUN_NUDGE_COPY and does not
 * swap onto card-specific titles; the card inventory keeps growing (area),
 * and a card-named line would have to track it. The line is
 * card-agnostic by construction.
 */
export const FIRST_RUN_NUDGE_COPY = {
  /** The line's lead, rendered medium-weight. */
  title: 'Finish setting up',
  /** Card-agnostic: names no card and claims nothing the app does not ask. */
  body: 'You stopped in the middle of setup — a minute or two finishes it.',
  /** The generic action label; it routes to /onboarding, wherever the next card is. */
  actionLabel: 'Continue',
}
