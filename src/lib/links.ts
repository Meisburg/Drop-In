/**
 * V19 t04: the pure rules behind linking two parent accounts.
 *
 * The workflow is a handshake: one parent types the other's @handle, the other
 * parent accepts, and then each appears on the other's profile. Everything here
 * is a pure function over strings and rows — no database, no React — so the
 * rules can be tested without a socket, per the build law
 * (`docs/agents/code-structure.md`).
 *
 * Why the validation is worth its own module: each rejection below is a
 * DIFFERENT thing to tell the parent, and collapsing them into one generic
 * "that didn't work" is the failure this file exists to prevent. "There is no
 * one with that handle" and "that's you" need different fixes from the user,
 * so they get different sentences.
 */
import type { AccountLink, AccountLinkStatus } from './types'

/**
 * A handle as it should be compared: a leading `@` stripped, trimmed, and
 * lowercased.
 *
 * Handles in this app are `display_name`, which is unique in the database but
 * NOT case-normalized there. Parents type `@Nicole` and `nicole` and mean the
 * same person, so the comparison happens here rather than in the query — a
 * case-sensitive lookup would fail on a handle the parent can see spelled that
 * way on the screen in front of them.
 */
export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, '').trim().toLowerCase()
}

/** The message shown when the typed handle matches nobody. */
export const LINK_UNKNOWN_HANDLE_MESSAGE =
  'No parent has that handle. Check the spelling — it is the @name on their profile.'

/** The message shown when a parent tries to link to themselves. */
export const LINK_SELF_MESSAGE = 'That is your own handle.'

/** The message shown for an empty input. */
export const LINK_EMPTY_MESSAGE = 'Enter the @handle of the other parent.'

/**
 * Validate a link request BEFORE it reaches the network.
 *
 * Returns an error message, or null when the request may proceed. `selfHandle`
 * is the requester's own handle: passing it is what lets this catch a self-link
 * locally, so a parent gets an instant answer instead of a round trip that ends
 * in a constraint violation.
 *
 * The comparison uses `normalizeHandle` on both sides for the same reason the
 * lookup does — `@Nicole` and `nicole` are the same parent, and a self-link is
 * a self-link however it is spelled.
 */
export function validateLinkRequest(handle: string, selfHandle: string | null): string | null {
  const normalized = normalizeHandle(handle)
  if (normalized === '') return LINK_EMPTY_MESSAGE
  if (selfHandle !== null && normalized === normalizeHandle(selfHandle)) {
    return LINK_SELF_MESSAGE
  }
  return null
}

/**
 * The label for a link's status, or null for `accepted`.
 *
 * `accepted` returns null because an accepted link is not a STATUS to show —
 * it is a relationship to RENDER (the partner's name on the profile). Showing a
 * "Linked" chip beside the person's own card would be saying the same thing
 * twice. Pending and declined are states the parent must act on or read, so
 * they get words.
 */
export function linkStatusLabel(status: AccountLinkStatus): string | null {
  switch (status) {
    case 'pending':
      return 'Invite sent'
    case 'declined':
      return 'Invite declined'
    case 'accepted':
      return null
  }
}

/**
 * What the profile's link section should say, as a discriminated result.
 *
 * The profile page renders one of these and decides nothing. Every branch is a
 * real state a parent can be in:
 *
 *   - `none`     — no link at all. Show the "link a parent" form.
 *   - `outgoing` — an invitation this parent SENT that is unanswered. Show
 *                  "waiting for them", plus the ability to withdraw.
 *   - `incoming` — an invitation this parent RECEIVED. Show Accept / Decline,
 *                  because they are the one who can answer it.
 *   - `declined` — a link that was refused. Show it plainly; do not hide it,
 *                  because the parent who sent it needs to know what happened.
 *   - `linked`   — an accepted partner. Render them.
 *
 * `declined` is deliberately its own state rather than folded into `none`: an
 * invitation that was refused is information the sender is owed, and silently
 * reverting to the empty form would leave them wondering whether it ever sent.
 */
export type LinkView =
  | { kind: 'none' }
  | { kind: 'outgoing'; linkId: string; otherHandle: string }
  | { kind: 'incoming'; linkId: string; otherHandle: string }
  | { kind: 'declined'; linkId: string; otherHandle: string; outgoing: boolean }
  | { kind: 'linked'; linkId: string; otherProfileId: string; otherHandle: string }

/** The row shape `linkView` reads. A subset of `AccountLink` plus the handles. */
export interface LinkRowForView {
  id: string
  requester_id: string
  addressee_id: string
  status: AccountLinkStatus
  requester_handle?: string | null
  addressee_handle?: string | null
}

/**
 * The viewer's link state, from the rows they can see.
 *
 * RLS already guarantees the viewer only ever receives rows they are part of,
 * so this does not re-filter for privacy — it selects WHICH of those rows is
 * the relevant one. An accepted link wins over everything: if a parent is
 * linked, that is the state, whatever older invitations may also be sitting in
 * the table.
 *
 * Handles may be missing (the embed can fail); they fall back to an empty
 * string rather than the word "undefined", and the caller renders a neutral
 * placeholder. That is the `host_display_name` null-fidelity lesson.
 */
export function linkView(
  rows: ReadonlyArray<LinkRowForView>,
  viewerId: string,
): LinkView {
  const accepted = rows.find((row) => row.status === 'accepted')
  if (accepted !== undefined) {
    const outgoing = accepted.requester_id === viewerId
    return {
      kind: 'linked',
      linkId: accepted.id,
      otherProfileId: outgoing ? accepted.addressee_id : accepted.requester_id,
      otherHandle: (outgoing ? accepted.addressee_handle : accepted.requester_handle) ?? '',
    }
  }

  // No accepted link: a pending one is the live state, and its DIRECTION is
  // what decides whether this parent waits or answers.
  const pending = rows.find((row) => row.status === 'pending')
  if (pending !== undefined) {
    const outgoing = pending.requester_id === viewerId
    return {
      kind: outgoing ? 'outgoing' : 'incoming',
      linkId: pending.id,
      otherHandle: (outgoing ? pending.addressee_handle : pending.requester_handle) ?? '',
    }
  }

  const declined = rows.find((row) => row.status === 'declined')
  if (declined !== undefined) {
    const outgoing = declined.requester_id === viewerId
    return {
      kind: 'declined',
      linkId: declined.id,
      otherHandle: (outgoing ? declined.addressee_handle : declined.requester_handle) ?? '',
      outgoing,
    }
  }

  return { kind: 'none' }
}

/**
 * V24 slice 11B: WHICH ONE CARD CARRIES THE ACCOUNT-LEVEL LINK STATE — the
 * LIST-level decision, and the reason it must be list-level.
 *
 * THE ASSOCIATION IS THE SAME NAME MATCH THE READ SURFACE USES
 * (`parentNameRows`, src/lib/parentCards.ts): a card is the linked partner when
 * its name equals the other account's handle, case- and @-insensitively. There
 * is no stored card↔account identity in 0047 to read, so this is the only
 * honest association available.
 *
 * WHY THIS TAKES THE WHOLE LIST. A per-card rule cannot answer it. The first
 * version decided one card at a time — "match, or else the first card" — which
 * printed the SAME relationship on TWO cards the moment the first card did not
 * match but a later one did (card 1 "Jon", card 2 "Nicole", linked to @Nicole:
 * both cards matched the "front of the list" branch in turn). One accepted
 * partner is one person, so ONE card must carry the state; that is a property of
 * the list, not of a card, exactly as `parentNameRows`' `claimed` flag is.
 *
 * THE WINNER, in order, and documented because each case is a real page:
 *   1. the FIRST card whose name is the counterparty's handle — the person the
 *      relationship belongs to;
 *   2. the FIRST card, when NO card matches (the N5 residual: a card name is
 *      free text and may match nothing). The link is still a live relationship
 *      the parent must be able to end, withdraw or answer, so it has to be
 *      rendered SOMEWHERE, and the first card is the only stable place for it.
 *      This is the one case where the edit surface carries a link the read
 *      surface does not show — the read view links names, and no name matches;
 *      see the note on the `hidden` state below.
 *   3. `-1` when there are no cards at all: nothing carries it.
 *
 * Two cards bearing the same name cannot both claim it: (1) picks the first.
 * An empty or missing handle matches NOTHING (an unresolved embed must not turn
 * the first nameless card into the partner), so (2) applies.
 */
export function parentCardLinkOwnerIndex(
  cardNames: ReadonlyArray<string>,
  otherHandle: string,
): number {
  const handle = normalizeHandle(otherHandle)
  if (handle !== '') {
    const matched = cardNames.findIndex((name) => normalizeHandle(name) === handle)
    if (matched !== -1) return matched
  }
  return cardNames.length > 0 ? 0 : -1
}

/**
 * V24 slice 11B: WHAT ONE PARENT CARD'S LINK CONTROL SHOWS.
 *
 * The edit surface used to render the whole account-link state machine in its
 * own "Linked parent" section. That section is gone: the action now lives with
 * the PERSON, inside the card that renders their name. This type is the pure
 * decision of what a single card carries, so the card JSX renders a case rather
 * than deciding one.
 *
 *   - `linked`   — this card IS the accepted partner: show "Linked to @handle"
 *                  and the Unlink that ends the relationship.
 *   - `outgoing` — the invitation this account sent concerns this card.
 *   - `incoming` — the invitation awaiting this account's answer concerns this
 *                  card.
 *   - `declined` — the declined link concerns this card.
 *   - `invite`   — no link exists, so this card offers the account-link form.
 *   - `hidden`   — the account-level state belongs to ANOTHER card (or to no
 *                  card at all). Rendered as nothing, so the same "Linked to @x"
 *                  / Unlink / Accept control is never printed twice on one page.
 */
export type ParentCardLinkState =
  | 'linked'
  | 'outgoing'
  | 'incoming'
  | 'declined'
  | 'invite'
  | 'hidden'

/**
 * What the card at `index` shows, given the ONE card that owns the account
 * state (`parentCardLinkOwnerIndex` over the SAME rendered card list — the two
 * calls must be made together or the ownership decision is meaningless).
 *
 * The `invite` case belongs to EVERY card with no link: linking is per-person —
 * "an option to click on something to link an account to that person's name" —
 * so each card offers it. Only one card renders the FORM at a time (the page
 * owns which), which is a presentation choice, not part of this rule.
 */
export function parentCardLinkState(
  view: LinkView,
  index: number,
  ownerIndex: number,
): ParentCardLinkState {
  if (view.kind === 'none') return 'invite'
  if (index !== ownerIndex) return 'hidden'
  switch (view.kind) {
    case 'linked':
      return 'linked'
    case 'outgoing':
      return 'outgoing'
    case 'incoming':
      return 'incoming'
    case 'declined':
      return 'declined'
  }
}

/**
 * V24 slice 11B (finding N4): the counterparty a NAME LINK may point at, from
 * the READER's own point of view — null when the counterparty IS the reader.
 *
 * The read surface asks "who is this profile's accepted partner?" and renders
 * that person's NAME as a `/u/<handle>` link. When a PARTY opens the profile
 * (the partner viewing their partner's page), the answer is the VIEWER: the
 * link would point at the reader's own profile, from a page that is not theirs.
 * It leaks nothing and it navigates somewhere real, which is why the review
 * called it harmless — but "click my own name to go to my own profile" is a
 * control that does nothing the reader needs, so it is suppressed here.
 *
 * A null `viewerHandle` (the session profile has not settled) suppresses
 * NOTHING: the honest link is rendered rather than hidden by a transient.
 */
export function linkedNameTargetForViewer<T extends { handle: string }>(
  linked: T | null,
  viewerHandle: string | null,
): T | null {
  if (linked === null || viewerHandle === null) return linked
  return normalizeHandle(linked.handle) === normalizeHandle(viewerHandle) ? null : linked
}

/**
 * V24 slice 11A: THE OTHER PARENT OF A PROFILE'S ACCEPTED LINK, or null.
 *
 * `linkView` answers "what is MY link state" — it is anchored on the VIEWER.
 * The read surface needs the mirror of that question: it renders a FAMILY's
 * profile and asks "does THIS profile have an accepted partner, and who is it?"
 * The anchor is the profile being viewed, which is why this is a second pure
 * rule rather than a second caller of `linkView`.
 *
 * RLS IS THE BOUNDARY, NOT THIS FUNCTION. `rows` is whatever the caller's own
 * client returned, and `account_links_select_parties` (migration 0047) hands a
 * caller ONLY rows they are a party to. So:
 *   - the owner's own profile read returns their accepted link → the partner;
 *   - a partner viewing that profile returns the same row → the same partner;
 *   - a THIRD account returns ZERO rows → null, and the profile renders plain
 *     names. That is the honest answer, not a fallback: the relationship is not
 *     theirs to see.
 * Nothing here widens that. It selects WHICH readable row concerns `profileId`.
 *
 * An accepted link wins over a pending one for the same reason it does in
 * `linkView`: if a partner is accepted, that is the relationship, whatever
 * older invitations may also be readable.
 */
export function acceptedCounterpartyForProfile(
  rows: ReadonlyArray<Pick<AccountLink, 'requester_id' | 'addressee_id' | 'status'>>,
  profileId: string,
): string | null {
  const accepted = rows.find(
    (row) =>
      row.status === 'accepted' &&
      (row.requester_id === profileId || row.addressee_id === profileId),
  )
  if (accepted === undefined) return null
  return accepted.requester_id === profileId ? accepted.addressee_id : accepted.requester_id
}
