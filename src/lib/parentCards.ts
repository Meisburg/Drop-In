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
import { normalizeHandle } from './links'

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

/**
 * V24 slice 02: the PARENT CARD'S SAVE-BUTTON LABEL — one save-state pattern
 * app-wide, unified on the `'idle' | 'saving' | 'saved' | 'error'` machine the
 * profile autosave already runs (`lib/autosave.ts` `AutosaveStatus`). The
 * button's own label walks Save → Saving… → Saved and back to Save after a short
 * dwell; an error surfaces its message beside the button rather than in it.
 *
 * Pure decision, unit-tested here (the build law: lib/ decides, components
 * render). The caller owns the dwell timer that carries `saved` back to
 * `idle`; this seam only names what the button says at each state.
 */
export function parentCardSaveLabel(
  status: 'idle' | 'saving' | 'saved' | 'error',
  isNew: boolean,
  errorMessage?: string | null,
): string {
  if (status === 'saving') return 'Saving…'
  if (status === 'saved') return 'Saved'
  if (status === 'error') {
    return errorMessage !== undefined && errorMessage !== null && errorMessage !== ''
      ? `Error: ${errorMessage}`
      : 'Try again'
  }
  // idle: the verb depends on whether this editor is adding or updating.
  return isNew ? 'Add parent' : 'Save'
}

/**
 * V24 slice 11A: ONE PARENT NAME as the read surface renders it — the name, and
 * the handle of the accepted linked account that name IS (or null for a plain
 * name).
 *
 * WHY THE ASSOCIATION IS A NAME MATCH, AND WHY THAT IS THE HONEST RULE HERE.
 * `parent_cards` has no column pointing at an account (migration 0047 gives it
 * `profile_id`, `name`, `photo_url`, `about`, `position`), and `account_links`
 * relates two ACCOUNTS, not two cards. There is therefore NO stored card↔account
 * identity to read — the only evidence that the card "Nicole" is the account
 * `@Nicole` is that a parent typed the same name in both places. So the rule is
 * deliberately conservative:
 *
 *   - the name matches the linked account's handle (case- and @-insensitive,
 *     via the same `normalizeHandle` the handshake compares handles with) →
 *     that ONE card is the link;
 *   - anything else → a PLAIN NAME. A card alone is never a link, and a near
 *     miss ("Nicole" against a handle "Nicole Rivera") renders plain text
 *     rather than guessing a person's identity from a prefix.
 *
 * THE MATCH FAILS OPEN ON A NAME COLLISION, and that is the residual this rule
 * accepts deliberately: a card's name is FREE TEXT the parent typed, so if a
 * card names a DIFFERENT person who happens to share the linked partner's
 * handle, that card renders as the link to the partner. The handle itself is
 * unique among accounts (`profiles_display_name_key`), so only the card↔account
 * association can collide — and 0047 stores no identity to disambiguate it with.
 * The alternative (matching more loosely, or not at all) would either guess an
 * identity or drop the one association the schema can express.
 *
 * The `handle` on the returned row is the value a caller uses for `/u/<handle>`
 * — not a display string, so the caller must URL-encode it.
 *
 * `linked` is the accepted counterparty of the profile being read (null when
 * there is none the reader may see). Only the FIRST matching card links: one
 * accepted partner is one person, and two cards bearing the same name must not
 * both claim them.
 */
export interface ParentNameRow {
  /** Stable key for React — the card's id. */
  key: string
  name: string
  /** The linked account's handle when this name IS that account, else null. */
  handle: string | null
}

export function parentNameRows(
  cards: ReadonlyArray<ParentCard> | null,
  linked: { handle: string } | null,
): ParentNameRow[] {
  const linkedHandle = linked === null ? '' : normalizeHandle(linked.handle)
  let claimed = false
  return parentCardList(cards).map((card) => {
    const isLinked =
      !claimed && linkedHandle !== '' && normalizeHandle(card.name) === linkedHandle
    if (isLinked) claimed = true
    return {
      key: card.id,
      name: card.name,
      handle: isLinked && linked !== null ? linked.handle : null,
    }
  })
}
