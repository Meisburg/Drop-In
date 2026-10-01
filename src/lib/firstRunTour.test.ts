/**
 * V28 r2 slice 5 — the ending card's tour copy.
 *
 * This file pins the two rules the slice exists to enforce, plus the two
 * identifiers the e2e suite is built on:
 *
 * 1. Every line says what a control DOES, never what is IN it. Measured
 *    (plan.md fact 12): zero upcoming drop-ins, every one of them in a single
 *    ZIP — so a line that promises content is false for every parent alive.
 * 2. The card makes no claim about places anywhere on it.
 *
 * The label list is pinned against the REAL nav (`src/App.tsx`: the four
 * `NavTab` labels and `PostActionButton`'s aria-label, in the bar's order), so
 * a tour that drifts from the bar it is describing fails here rather than on
 * a parent's phone.
 */
import { describe, expect, it } from 'vitest'
import {
  TOUR_ACTION_VERBS,
  TOUR_BODY,
  TOUR_FORBIDDEN_CLAIMS,
  TOUR_LINES,
  TOUR_PRIMARY_LABEL,
  TOUR_PROGRESS_LABEL,
  TOUR_TITLE,
} from './firstRunTour'

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

  // The claim class this batch keeps finding. Measured today: ZERO upcoming
  // drop-ins and all 20 hosted from one ZIP, so any existential line on this
  // card is a lie about an empty feed.
  it('makes no existential claim about content anywhere on the card', () => {
    for (const claim of TOUR_FORBIDDEN_CLAIMS) {
      expect(
        CARD_WORDS.toLowerCase(),
        `the card claims "${claim}"`,
      ).not.toContain(claim.toLowerCase())
    }
  })

  // The slice's acceptance, verbatim: "no claim about places anywhere on the
  // card". The Places LABEL is the one exception — the four tabs must each be
  // named — so the ban covers the title, the body and every detail.
  it('never says the word "place" outside the Places tab’s own label', () => {
    expect(CARD_WORDS).not.toMatch(/\bplaces?\b/i)
  })
})

describe('the two built-but-invisible capabilities are named', () => {
  // Both live on Profile (measured): the parent-name search
  // (`searchProfilesByName`, driven from ProfilePage's parent-card link
  // control) and the partner link. The card NAMES them; it does not build them.
  it('the Profile line names finding a parent by name AND linking a partner', () => {
    const profile = TOUR_LINES.find((line) => line.label === 'Profile')
    expect(profile, 'the Profile line is missing from the tour').toBeDefined()
    expect(profile?.detail).toMatch(/by name/i)
    expect(profile?.detail).toMatch(/link/i)
    // Nothing else on the card may claim them (they are not Inbox features).
    const others = TOUR_LINES.filter((line) => line.label !== 'Profile')
    for (const line of others) {
      expect(line.detail, `${line.label} also claims the name search`).not.toMatch(/by name/i)
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
