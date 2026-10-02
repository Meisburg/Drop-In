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

/**
 * The cards that may be left unanswered — THE AUTHORITY for which ones.
 *
 * V28 r2 slice 6a fix 1: before this, "kids is the skippable card" was written
 * twice — once as `card === 'kids'` in `isSkippable` below, once as the `kids:`
 * key of the copy module's type annotation — with only a comment claiming they
 * agreed. The type below is DERIVED from this list and
 * `src/lib/firstRunCopy.ts` derives its copy shape from that type, so the
 * decision lives in one place and the copy module cannot drift from the thing
 * that decides.
 *
 * V28 r2 slice 6a fix 2 (item D): `as const` alone did not tie the list to the
 * card union — `SKIPPABLE_CARDS = ['kidz']` was a valid statement, and it would
 * have made `SkippableFirstRunCardId` a type no card can inhabit (every card
 * non-skippable, `skipLabel` required by no one) with nothing to catch it. The
 * `satisfies` clause makes a name outside `FirstRunCardId` a compile error while
 * keeping the literal tuple type the derived id type needs.
 *
 * What is and is not true about "named once": the DECISION is named once. The
 * word `'kids'` still appears elsewhere in src (the page's progress label, its
 * a11y ids, its copy lookup) for reasons of their own — those sites are tied to
 * this list by the copy shape and by the `isSkippable` pin in firstRun.test.ts,
 * not by the text of this comment.
 */
export const SKIPPABLE_CARDS = ['kids'] as const satisfies readonly FirstRunCardId[]

/** The ids of the skippable cards, derived from `SKIPPABLE_CARDS`. */
export type SkippableFirstRunCardId = (typeof SKIPPABLE_CARDS)[number]

/** Which cards may be left unanswered. account/name/area = false. */
export function isSkippable(card: FirstRunCardId): boolean {
  return SKIPPABLE_CARDS.some((skippable) => skippable === card)
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

/**
 * V28 r2 slice 8a — THE VIEW THE RUN RENDERS, decided purely.
 *
 * `resolveCard` is `nextUnfinishedCard`'s RENDER-SITE twin, and the difference
 * between them is the whole reason it exists: `nextUnfinishedCard` answers "is
 * there a next card?" from the profile's facts, and the PAGE then had to decide,
 * over four `if`s, which view to paint — including two states that are not cards
 * at all (`kids-pending`: the lazy kids read has not settled, and the kids card
 * must not render in that gap or a returning parent could re-answer it; and
 * `finish`: the run is over and the ending card renders). A ladder of `if`s that
 * encodes a rule is a rule decided in a `.tsx`, which is what
 * docs/agents/code-structure.md's one rule forbids — so the ladder moved here,
 * where a table of inputs can pin it without React.
 */

/** Which view `/onboarding` paints. `kids-pending` and `finish` are not cards. */
export type FirstRunView = 'name' | 'kids-pending' | 'kids' | 'area' | 'finish'

/** What the page knows about the parent when it renders. Read, never stored. */
export interface FirstRunState {
  /** A profiles row exists — the NAME card is what creates it. */
  hasProfile: boolean
  /** At least one kids row, or `null` while the lazy read has not settled. */
  hasKids: boolean | null
  /** A home zip is set — the run's completion clause (see `nextUnfinishedCard`). */
  hasZip: boolean
}

/**
 * The view for a state, given the cards the SESSION has already answered.
 *
 * `skippedCards` is the session's fact, not the profile's: a skipped optional
 * card is indistinguishable from a not-reached one in the profile (see
 * `nextUnfinishedCard`), so the run only advances within a session because the
 * page records the Skip. `'kids'` is the card that may be listed — the same
 * authority (`SKIPPABLE_CARDS`) the page reads at the call site.
 *
 * Order matters and is the whole decision: the NAME card owns a parent with no
 * row; a set zip ENDS the run regardless of kids; then the kids card (or its
 * pending state) comes before the area card.
 *
 * ⚠️ `skippedCards` IS REQUIRED, and it used to default to `[]` (V28 r2 slice 8a
 * fix round 1). The default made an OMITTED argument the decision "nothing was
 * skipped" — the page always passed one, so no behaviour changed, but that is
 * D-030's shape exactly: a measurement that did not happen, read as a fact. A
 * caller with no session fact must now say `[]` out loud, and a new call site
 * cannot inherit an answer it never computed.
 */
export function resolveCard(
  state: FirstRunState,
  skippedCards: readonly FirstRunCardId[],
): FirstRunView {
  if (!state.hasProfile) return 'name'
  if (state.hasZip) return 'finish'
  const kidsAnswered = skippedCards.includes('kids')
  if (kidsAnswered) return 'area'
  if (state.hasKids === null) return 'kids-pending'
  if (!state.hasKids) return 'kids'
  return 'area'
}

/** "2 of 4" — 1-based position within `FIRST_RUN_CARDS`. */
export function progressLabel(card: FirstRunCardId): string {
  return `${FIRST_RUN_CARDS.indexOf(card) + 1} of ${FIRST_RUN_CARDS.length}`
}
