/**
 * V19 t05: the pure rules for a family's PARENT CARDS.
 *
 * A parent card is one person: a name, an optional photo, and some words about
 * themselves. An account has up to two — the founder's ask was literally "up to
 * two parents", and the database enforces it (a CHECK on `position` plus a
 * unique index on `(profile_id, position)`), so nothing here is load-bearing
 * for correctness. What lives here is the ORDER and the CAP as the UI needs
 * them, so the page renders a list rather than deciding one.
 */
import type { ParentCard } from './types'

/** The most parent cards one account can have. Mirrors the 0047 CHECK. */
export const MAX_PARENT_CARDS = 2

/** The message shown above the parent cards. */
export const PARENT_CARDS_BLURB =
  'Up to two parents, each with a photo and a few words about themselves.'

/**
 * The cards to render, in slot order, capped at two.
 *
 * Sorts by `position` rather than trusting the caller's array order, because
 * the order is the SLOT (1, then 2) — a database round trip is not guaranteed
 * to hand them back that way, and a parent appearing above their partner by
 * accident would be a visible, confusing reshuffle between loads.
 *
 * The cap is applied here as well as in the database. That is deliberately
 * belt-and-braces: the DB refuses a third card, and this makes the RENDER
 * incapable of showing one even if a row somehow predates the constraint. A
 * profile that renders three parents on a two-parent layout is the failure this
 * line prevents.
 *
 * Cards with no name are dropped: a card's whole content is who the person is,
 * and a nameless one would render as a blank frame.
 */
export function parentCardList(cards: ReadonlyArray<ParentCard> | null): ParentCard[] {
  if (cards === null) return []
  return [...cards]
    .filter((card) => card.name.trim() !== '')
    .sort((a, b) => a.position - b.position)
    .slice(0, MAX_PARENT_CARDS)
}

/**
 * Which slot a NEW card should take: the lowest free position, or null when
 * both are taken.
 *
 * Returning null (rather than always 2, or position 1 again) is what lets the
 * page hide the "add another parent" control at the cap instead of offering a
 * button whose write the database would refuse.
 */
export function nextParentPosition(cards: ReadonlyArray<ParentCard> | null): number | null {
  const used = new Set((cards ?? []).map((card) => card.position))
  for (let position = 1; position <= MAX_PARENT_CARDS; position++) {
    if (!used.has(position)) return position
  }
  return null
}
