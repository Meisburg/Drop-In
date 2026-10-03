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
  /**
   * The profile handle this name links to, else null. Two sources:
   *   - the accepted linked account, when this name IS that account (V24 11A);
   *   - the ACCOUNT BEING VIEWED itself, when this name IS that account (V27,
   *     the founder's annotation "you could link my name to this profile") —
   *     a self-link to the page's own public `/u/:handle`, which reveals no
   *     relationship and is public information already shown in the identity
   *     block above it.
   */
  handle: string | null
  /**
   * V25 t09: the card's own words — the DESCRIPTION half of the parent's row.
   * Trimmed; null when the card has none, so the row renders no empty
   * paragraph (the same "a decoration is never an error state" discipline the
   * photo follows).
   *
   * V27: on the LINKED parent's row, an empty `parent_cards.about` falls back to
   * the linked account's own self-card `about`, and on the ACCOUNT's own row it
   * falls back to that account's `bio`. The founder's model is that a profile's
   * text is the PARENT's own words about themself ("About me"), so the linked
   * row shows HER words, authored on her own account — never text the owner
   * typed for her. A card's own `about` always wins.
   */
  about: string | null
  /**
   * V25 t09: the card's own picture, as a source an `<img>` can actually load
   * — or null. See `parentCardPhotoSrc` for what "actually load" means and
   * why an empty string is folded into null rather than rendered.
   *
   * V27 (the founder's /profile annotation): on the READ surface this is a
   * FALLBACK, because there is no parent-photo upload and `parent_cards`
   * `photo_url` is empty for every card. Two sources, each claimed by one card:
   *   - the LINKED counterparty's public `profiles.avatar_url`, on the card
   *     whose name IS that account;
   *   - the ACCOUNT BEING VIEWED's own public `avatar_url`, on the card whose
   *     name IS the account (the same conservative `normalizeHandle` name match
   *     the link rule uses, with the same refusal: a near miss like "Jon"
   *     against "Jon Meisburg" is a different person and gets no face).
   * A card carrying its own photo always keeps it.
   */
  photo: string | null
}

/**
 * V25 t09: A PARENT CARD'S PHOTO, AS THE ROW MAY RENDER IT — or null.
 *
 * The row is "photo · name · description", and this is the pure decision of
 * whether there is a photo at all. The rule is deliberately narrow, and the
 * narrowness is a DATA fact rather than a product choice — state it plainly,
 * because a future reader will otherwise "fix" it by rendering the value
 * straight into an `<img>`:
 *
 *   - `parent_cards.photo_url` is documented (migration 0047) as a
 *     PRIVATE-BUCKET object path, "never a public URL". A path is not a URL:
 *     put into `<img src>` it resolves relative to the app's origin and yields
 *     a broken image / a 404, which is a lie about there being a picture.
 *   - NOTHING CAN MINT ONE TODAY. The two mints this app has are
 *     `kidPhotoMintPaths` and `familyPhotoMintPaths` (`photoStorage.ts:139`,
 *     `:290`), which build the object paths for the `kid-photos` bucket; the
 *     normaliser they read stored values through is `familyPhotoObjectPath`
 *     (`:247`). None of the three knows a `parents` class. 0038's storage
 *     policies scope READS by folder class
 *     (`foldername(name)[2] = 'kids'` | `'family'`) — there is NO `parents`
 *     class, no `parentPhotoPath` convention and no parent-photo upload
 *     control (the card editor's own comment defers it). So a path could not
 *     be signed even if this function guessed a folder name.
 *   - The live data is empty anyway: `select count(photo_url) from
 *     parent_cards` answers 0 of 4 cards.
 *
 * So this renders a value the browser can fetch AS GIVEN — an http(s)/data/blob
 * source — and refuses anything else. When the schema decision lands (a
 * `parentPhotoPath` convention + the workspace storage policy + the mint), the
 * path branch is added HERE, in the pure rule, next to the tests that pin it.
 */
export function parentCardPhotoSrc(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined) return null
  const value = stored.trim()
  if (value === '') return null
  return /^(https?:|data:image\/|blob:)/i.test(value) ? value : null
}

/** A card's `about`, trimmed, or null when it carries no words. */
export function parentCardAboutText(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined) return null
  const value = stored.trim()
  return value === '' ? null : value
}

/**
 * V25 t09: THE ROWS THE READ SURFACE RENDERS — one per parent, in slot order,
 * each carrying everything its horizontal row shows: the photo, the name (and
 * the handle when that name IS an account), and the card's own words.
 *
 * The name/link rule is unchanged from V24 11A and is documented above; this
 * function simply grew the row's other two fields rather than making the JSX
 * reach back into `parentCards` for them. The component renders a row; it does
 * not decide one (the build law).
 *
 * V27 (the founder's /profile annotations): the row now fills itself from the
 * ACCOUNT a name belongs to, because `parent_cards` has neither a photo upload
 * nor, often, any `about` text:
 *   - `owner` is the account being viewed (its display name, public avatar and
 *     personal `bio`), and the one card whose name IS that account links to its
 *     own public profile and borrows its picture and description.
 *   - `linked` carries the accepted counterparty's public `avatarUrl` and
 *     personal `bio` as well as their handle, and the one card whose name IS
 *     that account falls back to them for its picture and description.
 * Both extra arguments are optional so every pre-V27 caller and test keeps its
 * exact meaning — no owner and a handle-only `linked` mean no fallbacks.
 */
export function parentNameRows(
  cards: ReadonlyArray<ParentCard> | null,
  linked: { handle: string; avatarUrl?: string | null; about?: string | null } | null,
  owner: { displayName: string; avatarUrl: string | null } | null = null,
): ParentNameRow[] {
  const linkedHandle = linked === null ? '' : normalizeHandle(linked.handle)
  const linkedAvatar = linked === null ? null : parentCardPhotoSrc(linked.avatarUrl ?? null)
  const linkedAbout = linked === null ? null : parentCardAboutText(linked.about ?? null)
  // V27: the account owner's own face, self-link and personal description,
  // offered to the one card whose name IS that account. `ownerClaimed` mirrors
  // `claimed` for the link rule: two cards bearing the same name must not both
  // wear one person's face.
  const ownerName = owner === null ? '' : normalizeHandle(owner.displayName)
  const ownerAvatar = owner === null ? null : parentCardPhotoSrc(owner.avatarUrl)
  let claimed = false
  let ownerClaimed = false
  const rows = parentCardList(cards).map((card) => {
    const isLinked =
      !claimed && linkedHandle !== '' && normalizeHandle(card.name) === linkedHandle
    if (isLinked) claimed = true
    const ownPhoto = parentCardPhotoSrc(card.photo_url)
    const cardAbout = parentCardAboutText(card.about)
    const isOwner =
      !ownerClaimed && ownerName !== '' && normalizeHandle(card.name) === ownerName
    if (isOwner) ownerClaimed = true
    return {
      key: card.id,
      name: card.name,
      handle: isLinked
        ? linked?.handle ?? null
        : isOwner && owner !== null
          ? owner.displayName
          : null,
      about: cardAbout ?? (isLinked ? linkedAbout : null),
      photo: ownPhoto ?? (isLinked ? linkedAvatar : isOwner ? ownerAvatar : null),
    }
  })
  // V27: a linked partner who has no card on THIS profile still gets her row —
  // her name, picture and words come from her own account. The synthesized row
  // appears only when the link is readable (the two parties), so a third account
  // never learns the relationship; a legacy card with the same name has already
  // claimed the link above and wins, so nothing renders twice. It waits for the
  // card list to settle (`cards !== null`) so a slow load cannot paint the row
  // twice — once synthesized, once from the matching card.
  if (cards !== null && linked !== null && linkedHandle !== '' && !claimed) {
    rows.push({
      key: `linked-${linked.handle}`,
      name: linked.handle,
      handle: linked.handle,
      about: linkedAbout,
      photo: linkedAvatar,
    })
  }
  return rows
}
