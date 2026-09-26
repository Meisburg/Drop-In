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
