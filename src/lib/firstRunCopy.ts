/**
 * V28 slice 1 — the copy seam.
 *
 * Card titles, bodies and button labels live here as data, not inline in JSX,
 * so the words are reviewable in one place and the load-bearing ones are
 * pinned by firstRunCopy.test.ts. The shape follows the repo's precedent for
 * a small tested module of labels-as-data (src/lib/vibeChips.ts). Plain
 * strings only — no components, no formatting logic beyond interpolation.
 */
import type { FirstRunCardId } from './firstRun'

/** The words one card shows. */
export interface FirstRunCardCopy {
  title: string
  body: string
  /** The primary action button. */
  primaryLabel: string
  /** Present only on the skippable card (kids). */
  skipLabel?: string
}

/**
 * The copy for all four cards, keyed by card id. `primaryLabel` on the name
 * card must keep matching /^Continue/ — the e2e helpers locate it by that
 * (plan.md, slice 3a).
 */
export const FIRST_RUN_COPY: Record<FirstRunCardId, FirstRunCardCopy> = {
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
    skipLabel: 'Skip for now',
  },
  area: {
    title: 'Where do you live?',
    body: 'We use your neighborhood to show nearby drop-ins. An address works best; a ZIP code works too.',
    primaryLabel: 'Finish',
  },
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
