/**
 * V28 slice 1 — the copy seam.
 *
 * Card titles, bodies and button labels are data, not JSX: the words are
 * reviewed in one place and the load-bearing ones are pinned here. The
 * precedent is src/lib/vibeChips.ts — a small, tested module of
 * labels-as-data.
 */
import { describe, expect, it } from 'vitest'
import { FIRST_RUN_CARDS } from './firstRun'
import { FIRST_RUN_COPY, FIRST_RUN_NUDGE_COPY } from './firstRunCopy'

describe('FIRST_RUN_COPY', () => {
  it('covers exactly the four first-run cards, in card order', () => {
    expect(Object.keys(FIRST_RUN_COPY)).toEqual([...FIRST_RUN_CARDS])
  })

  it('gives every card a non-empty title, body, and primary label', () => {
    for (const card of FIRST_RUN_CARDS) {
      const copy = FIRST_RUN_COPY[card]
      expect(copy.title.length, `${card}.title`).toBeGreaterThan(0)
      expect(copy.body.length, `${card}.body`).toBeGreaterThan(0)
      expect(copy.primaryLabel.length, `${card}.primaryLabel`).toBeGreaterThan(0)
    }
  })

  it('reserves a skip label for the skippable cards only', () => {
    expect(FIRST_RUN_COPY.kids.skipLabel?.length).toBeGreaterThan(0)
    expect(FIRST_RUN_COPY.account.skipLabel).toBeUndefined()
    expect(FIRST_RUN_COPY.name.skipLabel).toBeUndefined()
    expect(FIRST_RUN_COPY.area.skipLabel).toBeUndefined()
  })

  // The e2e helpers (finishSignup and friends) locate the name card's button
  // by /^Continue/ — that contract lives in the copy, so it is pinned here.
  it('the name card keeps a Continue-matching primary label', () => {
    expect(FIRST_RUN_COPY.name.primaryLabel).toMatch(/^Continue/)
  })

  // /login's signup button has always read "Create account"; the card keeps
  // it so the trimmed signup (slice 3b) does not change a working label.
  it('the account card keeps the signup form\u2019s "Create account" label', () => {
    expect(FIRST_RUN_COPY.account.primaryLabel).toBe('Create account')
  })
})

describe('FIRST_RUN_NUDGE_COPY (the resume nudge\u2019s generic line)', () => {
  // The nudge's lead is the one word the verify lane (the slice's drive
  // script) locates by, so it is pinned exactly.
  it('keeps the "Finish setting up" lead', () => {
    expect(FIRST_RUN_NUDGE_COPY.title).toBe('Finish setting up')
  })

  it('has a card-agnostic body and a Continue-matching generic action label', () => {
    expect(FIRST_RUN_NUDGE_COPY.body.length).toBeGreaterThan(0)
    expect(FIRST_RUN_NUDGE_COPY.actionLabel).toMatch(/^Continue/)
  })

  // The fix round's whole point: the line must not name a card — no per-card
  // title may leak into it (slice 4 may swap in card-specific wording then).
  it('does not duplicate any per-card title', () => {
    const words = `${FIRST_RUN_NUDGE_COPY.title} ${FIRST_RUN_NUDGE_COPY.body}`.toLowerCase()
    for (const card of FIRST_RUN_CARDS) {
      expect(words, `${card} title leaked into the nudge line`).not.toContain(
        FIRST_RUN_COPY[card].title.toLowerCase(),
      )
    }
  })
})
