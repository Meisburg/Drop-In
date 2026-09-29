/**
 * V28 slice 1 — the pure first-run model.
 *
 * The first run interviews a new parent one card at a time:
 * account → name → kids → photo → area. A later slice renders the cards; this
 * module owns the card sequence and the resume rule.
 *
 * Purity is a requirement, not a preference: this file has no dependencies at
 * all — no client, no clock, no I/O, no browser globals. Facts are a snapshot
 * of what the profile already has, read by the caller from the session and
 * never stored here. Both properties are pinned by firstRun.test.ts.
 */

/** The five cards of the first run, in order. */
export type FirstRunCardId = 'account' | 'name' | 'kids' | 'photo' | 'area'

export const FIRST_RUN_CARDS: readonly FirstRunCardId[] = [
  'account',
  'name',
  'kids',
  'photo',
  'area',
]

/** What the profile already has. Read from the session; NEVER stored. */
export interface FirstRunFacts {
  signedIn: boolean
  hasName: boolean // a profiles row exists with a display_name
  hasKids: boolean // at least one kids row
  hasPhoto: boolean // avatar_url is set
  hasZip: boolean // home_zip is set
}

/** Which cards may be left unanswered. account/name/area = false. */
export function isSkippable(card: FirstRunCardId): boolean {
  return card === 'kids' || card === 'photo'
}

/**
 * The card a returning parent should land on, or null when the run is done.
 *
 * THE RULE (pinned in plan.md → Interfaces): the first card in
 * `FIRST_RUN_CARDS` order that is unanswered AND is either required, or
 * optional with every required card before it already answered.
 *
 * Consequences, both accepted and recorded:
 * - It terminates: `area` is required and last, so answering it ends the run —
 *   a parent who skipped kids or photo gets null, not a re-offer.
 * - A *skipped* optional card IS re-offered while the run is still unfinished
 *   (the required card behind it is still unanswered), because "skipped" and
 *   "not reached" are indistinguishable from derived facts. That is one extra
 *   tap on a card that still shows Skip — the price of not adding a step
 *   column. Do NOT add one.
 */
export function nextUnfinishedCard(facts: FirstRunFacts): FirstRunCardId | null {
  if (!facts.signedIn) return 'account'
  if (!facts.hasName) return 'name'
  // `area` is required and last: once the zip is set the run is done, so a
  // skipped kids or photo card is finished too — null, no re-offer.
  if (facts.hasZip) return null
  if (!facts.hasKids) return 'kids'
  if (!facts.hasPhoto) return 'photo'
  return 'area'
}

/** "2 of 5" — 1-based position within `FIRST_RUN_CARDS`. */
export function progressLabel(card: FirstRunCardId): string {
  return `${FIRST_RUN_CARDS.indexOf(card) + 1} of ${FIRST_RUN_CARDS.length}`
}