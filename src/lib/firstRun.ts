/**
 * V28 slice 1 — the pure first-run model.
 *
 * The first run interviews a new parent one card at a time:
 * account → name → kids → area. A later slice renders the cards; this
 * module owns the card sequence and the resume rule.
 *
 * Purity is a requirement, not a preference: this file has no dependencies at
 * all — no client, no clock, no I/O, no browser globals. Facts are a snapshot
 * of what the profile already has, read by the caller from the session and
 * never stored here. Both properties are pinned by firstRun.test.ts.
 */

/** The four cards of the first run, in order. */
export type FirstRunCardId = 'account' | 'name' | 'kids' | 'area'

export const FIRST_RUN_CARDS: readonly FirstRunCardId[] = [
  'account',
  'name',
  'kids',
  'area',
]

/** What the profile already has. Read from the session; NEVER stored. */
export interface FirstRunFacts {
  signedIn: boolean
  hasName: boolean // a profiles row exists with a display_name
  hasKids: boolean // at least one kids row
  hasZip: boolean // home_zip is set
}

/** Which cards may be left unanswered. account/name/area = false. */
export function isSkippable(card: FirstRunCardId): boolean {
  return card === 'kids'
}

/**
 * The card a returning parent should land on, or null when the run is done.
 *
 * THE RULE (pinned in plan.md → Interfaces — the plan text is authoritative,
 * this comment restates it):
 *   (a) If every required card is answered, the run is finished → null.
 *   (b) Otherwise, the first card in `FIRST_RUN_CARDS` order that is
 *       unanswered and is either required, or optional with every required
 *       card before it already answered.
 * `account` counts as answered exactly when `signedIn`. Clause (a) is not
 * decoration: clause (b) alone NEVER returns null for a childless parent —
 * a skipped `kids` is indistinguishable from a not-reached one — so the
 * termination path is clause (a)'s early return, not clause (b).
 *
 * Consequences, both accepted and recorded:
 * - It terminates, by clause (a). `area` is required and last, so a parent who
 *   sets a zip ends the run even having skipped kids.
 * - A *skipped* optional card IS re-offered while the run is unfinished
 *   (a required card is still unanswered), because "skipped" and "not
 *   reached" are indistinguishable from derived facts. That is up to two extra
 *   taps, on cards that still show Skip, and it is the price of not adding a
 *   step column. Do NOT add one.
 */
export function nextUnfinishedCard(facts: FirstRunFacts): FirstRunCardId | null {
  if (!facts.signedIn) return 'account'
  if (!facts.hasName) return 'name'
  // `area` is required and last: once the zip is set the run is done, so a
  // skipped kids card is finished too — null, no re-offer.
  if (facts.hasZip) return null
  if (!facts.hasKids) return 'kids'
  return 'area'
}

/** "2 of 4" — 1-based position within `FIRST_RUN_CARDS`. */
export function progressLabel(card: FirstRunCardId): string {
  return `${FIRST_RUN_CARDS.indexOf(card) + 1} of ${FIRST_RUN_CARDS.length}`
}
