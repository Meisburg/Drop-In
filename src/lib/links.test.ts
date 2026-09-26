import { describe, expect, it } from 'vitest'
import {
  LINK_EMPTY_MESSAGE,
  LINK_SELF_MESSAGE,
  acceptedCounterpartyForProfile,
  linkStatusLabel,
  linkView,
  linkedNameTargetForViewer,
  normalizeHandle,
  parentCardLinkState,
  validateLinkRequest,
  type LinkRowForView,
} from './links'
import type { AccountLink } from './types'

/**
 * V19 t04 — the pure rules behind linking two parent accounts.
 *
 * The theme of these tests is that each rejection is a DIFFERENT message. A
 * parent who typed their own handle and a parent who typed a handle nobody has
 * need different fixes, so they must not collapse into one generic failure.
 */

describe('normalizeHandle', () => {
  it('strips a leading @, trims, and lowercases', () => {
    expect(normalizeHandle('@Nicole')).toBe('nicole')
    expect(normalizeHandle('  nicole  ')).toBe('nicole')
    expect(normalizeHandle('@@nicole')).toBe('nicole')
  })

  it('is what makes @Nicole and nicole the same parent', () => {
    // display_name is unique in the DB but NOT case-normalized there, so the
    // comparison has to happen here or a parent fails to find someone whose
    // handle is spelled exactly as they see it on screen.
    expect(normalizeHandle('@Nicole')).toBe(normalizeHandle('nicole'))
  })

  it('leaves an inner @ alone — only a LEADING one is an addressing sigil', () => {
    expect(normalizeHandle('an@drew')).toBe('an@drew')
  })

  it('returns empty for whitespace or a bare @', () => {
    expect(normalizeHandle('   ')).toBe('')
    expect(normalizeHandle('@')).toBe('')
  })
})

describe('validateLinkRequest', () => {
  it('accepts a normal handle', () => {
    expect(validateLinkRequest('@nicole', 'jon')).toBeNull()
  })

  it('rejects an empty handle with its OWN message', () => {
    expect(validateLinkRequest('   ', 'jon')).toBe(LINK_EMPTY_MESSAGE)
  })

  it('rejects a self-link with its OWN message', () => {
    expect(validateLinkRequest('@Jon', 'jon')).toBe(LINK_SELF_MESSAGE)
    expect(validateLinkRequest('jon', 'Jon')).toBe(LINK_SELF_MESSAGE)
  })

  it('does not mistake a similar handle for a self-link', () => {
    expect(validateLinkRequest('jonathan', 'jon')).toBeNull()
  })

  it('still validates when the caller has no known self handle', () => {
    // The profile may not have settled yet; an empty input is still invalid,
    // and the self-check simply cannot run.
    expect(validateLinkRequest('', null)).toBe(LINK_EMPTY_MESSAGE)
    expect(validateLinkRequest('@nicole', null)).toBeNull()
  })
})

describe('linkStatusLabel', () => {
  it('labels the states a parent must read or act on', () => {
    expect(linkStatusLabel('pending')).toBe('Invite sent')
    expect(linkStatusLabel('declined')).toBe('Invite declined')
  })

  it('returns null for accepted — a relationship is rendered, not labelled', () => {
    // Showing a "Linked" chip beside the partner's own name would say the same
    // thing twice.
    expect(linkStatusLabel('accepted')).toBeNull()
  })
})

describe('linkView — which state the profile is in', () => {
  const row = (over: Partial<LinkRowForView>): LinkRowForView => ({
    id: 'l1',
    requester_id: 'me',
    addressee_id: 'them',
    status: 'pending',
    requester_handle: 'jon',
    addressee_handle: 'nicole',
    ...over,
  })

  it('is none with no rows', () => {
    expect(linkView([], 'me')).toEqual({ kind: 'none' })
  })

  it('reports an outgoing invite as "waiting on them"', () => {
    expect(linkView([row({})], 'me')).toEqual({
      kind: 'outgoing',
      linkId: 'l1',
      otherHandle: 'nicole',
    })
  })

  it('reports an incoming invite as something to ANSWER', () => {
    // The direction is the whole difference: the addressee can accept, the
    // requester cannot. Getting this backwards would render Accept/Decline to
    // the wrong parent, whose attempt would then be refused by RLS.
    expect(linkView([row({ requester_id: 'them', addressee_id: 'me' })], 'me')).toEqual({
      kind: 'incoming',
      linkId: 'l1',
      otherHandle: 'jon',
    })
  })

  it('reports an accepted link with the OTHER parent, either direction', () => {
    const asRequester = linkView([row({ status: 'accepted' })], 'me')
    expect(asRequester).toEqual({
      kind: 'linked',
      linkId: 'l1',
      otherProfileId: 'them',
      otherHandle: 'nicole',
    })
    const asAddressee = linkView(
      [row({ status: 'accepted', requester_id: 'them', addressee_id: 'me' })],
      'me',
    )
    expect(asAddressee).toEqual({
      kind: 'linked',
      linkId: 'l1',
      otherProfileId: 'them',
      otherHandle: 'jon',
    })
  })

  it('lets an ACCEPTED link win over an older pending one', () => {
    // A parent who is linked sees the link, whatever invitations are also in
    // the table — otherwise a stale pending row could hide a live partner.
    const view = linkView(
      [
        row({ id: 'old', status: 'pending' }),
        row({ id: 'live', status: 'accepted' }),
      ],
      'me',
    )
    expect(view.kind).toBe('linked')
    expect(view.kind === 'linked' && view.linkId).toBe('live')
  })

  it('surfaces a DECLINED invite rather than reverting to the empty form', () => {
    // The sender is owed the news. Silently showing the "link a parent" form
    // again would leave them wondering whether it ever sent.
    const view = linkView([row({ status: 'declined' })], 'me')
    expect(view.kind).toBe('declined')
    expect(view.kind === 'declined' && view.outgoing).toBe(true)
  })

  it('tolerates a missing handle rather than rendering "undefined"', () => {
    const view = linkView([row({ addressee_handle: null })], 'me')
    expect(view.kind === 'outgoing' && view.otherHandle).toBe('')
  })
})

describe('parentCardLinkState — where the link action lives (V24 11B)', () => {
  const linked = {
    kind: 'linked',
    linkId: 'l1',
    otherProfileId: 'them',
    otherHandle: 'Nicole',
  } as const
  const outgoing = { kind: 'outgoing', linkId: 'l1', otherHandle: 'Nicole' } as const
  const incoming = { kind: 'incoming', linkId: 'l1', otherHandle: 'Nicole' } as const
  const declined = {
    kind: 'declined',
    linkId: 'l1',
    otherHandle: 'Nicole',
    outgoing: true,
  } as const

  it('puts the accepted link on the card whose NAME is the linked account', () => {
    // The same name match the read surface renders the link with, so the two
    // surfaces cannot disagree about whose card carries the relationship.
    expect(parentCardLinkState(linked, 'nicole', false)).toBe('linked')
    expect(parentCardLinkState(linked, '@Nicole', false)).toBe('linked')
  })

  it('hides the account-level state on a card it does not concern', () => {
    expect(parentCardLinkState(linked, 'Jon', false)).toBe('hidden')
    expect(parentCardLinkState(outgoing, 'Jon', false)).toBe('hidden')
  })

  it('falls back to the FIRST card when no card name matches the handle', () => {
    // The N5 residual: the card is free text and may not match the handle. The
    // relationship still has to be endable/answerable from somewhere, and the
    // first card is the only stable place for it.
    expect(parentCardLinkState(linked, 'Jon', true)).toBe('linked')
    expect(parentCardLinkState(incoming, 'Jon', true)).toBe('incoming')
  })

  it('keeps the pending and declined states distinct so the right controls render', () => {
    expect(parentCardLinkState(outgoing, 'Nicole', false)).toBe('outgoing')
    expect(parentCardLinkState(incoming, 'Nicole', false)).toBe('incoming')
    expect(parentCardLinkState(declined, 'Nicole', false)).toBe('declined')
  })

  it('offers the invite on EVERY card while no link exists', () => {
    expect(parentCardLinkState({ kind: 'none' }, 'Jon', true)).toBe('invite')
    expect(parentCardLinkState({ kind: 'none' }, 'Nicole', false)).toBe('invite')
    // A nameless (not-yet-saved) slot offers it too — the control lives with
    // the person, and a family with no saved card must still be able to link.
    expect(parentCardLinkState({ kind: 'none' }, '', false)).toBe('invite')
  })

  it('does not match an empty card name to a missing handle', () => {
    // The handle can be '' when the embed failed; an empty name must not be
    // treated as "this nameless card is the partner".
    const handleless = { kind: 'outgoing', linkId: 'l1', otherHandle: '' } as const
    expect(parentCardLinkState(handleless, '', false)).toBe('hidden')
    expect(parentCardLinkState(handleless, '', true)).toBe('outgoing')
  })
})

describe('linkedNameTargetForViewer — the reader’s own card is not a link (V24 11B, N4)', () => {
  it('keeps the counterparty when it is somebody else', () => {
    expect(linkedNameTargetForViewer({ handle: 'Nicole' }, 'Jon')).toEqual({ handle: 'Nicole' })
  })

  it('suppresses the link when the counterparty IS the reader', () => {
    // A party viewing the profile is the other parent of the link; linking
    // their own name to their own profile is a control that does nothing.
    expect(linkedNameTargetForViewer({ handle: 'Nicole' }, 'nicole')).toBeNull()
    expect(linkedNameTargetForViewer({ handle: 'Nicole' }, '@Nicole')).toBeNull()
  })

  it('suppresses nothing while the viewer handle has not settled', () => {
    expect(linkedNameTargetForViewer({ handle: 'Nicole' }, null)).toEqual({ handle: 'Nicole' })
  })

  it('is null with no link', () => {
    expect(linkedNameTargetForViewer(null, 'Jon')).toBeNull()
  })
})

describe('acceptedCounterpartyForProfile — the OTHER parent of a VIEWED profile', () => {
  // The read surface is anchored on the profile being looked at, not on the
  // viewer: it asks "does THIS family have an accepted partner?". These rows are
  // whatever the caller's RLS returned — the tests below pin what the function
  // does with them, not what RLS hands it (that is asserted live in e2e).
  const row = (over: Partial<AccountLink>): AccountLink => ({
    id: 'l1',
    requester_id: 'sam',
    addressee_id: 'nicole',
    status: 'accepted',
    ...over,
  })

  it('returns the counterparty when the viewed profile is the requester', () => {
    expect(acceptedCounterpartyForProfile([row({})], 'sam')).toBe('nicole')
  })

  it('returns the counterparty when the viewed profile is the addressee', () => {
    expect(acceptedCounterpartyForProfile([row({})], 'nicole')).toBe('sam')
  })

  it('is null for a profile the readable rows do not concern', () => {
    // The RLS case, from the function's side: a third account's own link rows
    // are readable to them but say nothing about the family they are viewing.
    // Returning a counterparty here would put a stranger's partner on someone
    // else's card grid.
    expect(acceptedCounterpartyForProfile([row({})], 'someone-else')).toBeNull()
  })

  it('is null with no rows — the third-account read, which returns zero', () => {
    expect(acceptedCounterpartyForProfile([], 'sam')).toBeNull()
  })

  it('ignores pending and declined rows: only an accepted link is a partner', () => {
    expect(
      acceptedCounterpartyForProfile(
        [row({ id: 'p', status: 'pending' }), row({ id: 'd', status: 'declined' })],
        'sam',
      ),
    ).toBeNull()
  })

  it('lets an accepted link win over a pending one for the SAME profile', () => {
    // Same rule as linkView: a live partner is the state, whatever older
    // invitations are also readable.
    expect(
      acceptedCounterpartyForProfile(
        [row({ id: 'invite', status: 'pending' }), row({ id: 'live', status: 'accepted' })],
        'sam',
      ),
    ).toBe('nicole')
  })

  it('finds the accepted link even when a pending row comes first', () => {
    // Ordering must not decide the answer: the accepted row is the relationship.
    const counterparty = acceptedCounterpartyForProfile(
      [
        row({ id: 'old', status: 'declined', requester_id: 'sam', addressee_id: 'other' }),
        row({ id: 'live', status: 'accepted', requester_id: 'other2', addressee_id: 'sam' }),
      ],
      'sam',
    )
    expect(counterparty).toBe('other2')
  })
})
