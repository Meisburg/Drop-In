import { describe, expect, it } from 'vitest'
import {
  LINK_EMPTY_MESSAGE,
  LINK_SELF_MESSAGE,
  acceptedCounterpartyForProfile,
  linkStatusLabel,
  linkView,
  linkedNameTargetForViewer,
  normalizeHandle,
  parentCardLinkOwnerIndex,
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

describe('parentCardLinkOwnerIndex — ONE card carries the account state (V24 11B fix round 1)', () => {
  it('THE CANONICAL CASE: card 1 does not match, card 2 does — card 2 wins', () => {
    // The defect this rule was written for, executed against the real rule: a
    // per-card "match, else the first card" fallback printed the SAME accepted
    // link on BOTH cards (two "Linked to @Nicole", two Unlink buttons) because
    // the first card also fell through to its fallback branch.
    expect(parentCardLinkOwnerIndex(['Jon', 'Nicole'], 'Nicole')).toBe(1)
    // ...and the mirror image: the matching card FIRST keeps it.
    expect(parentCardLinkOwnerIndex(['Nicole', 'Jon'], 'Nicole')).toBe(0)
  })

  it('matches the way the handshake and the read surface compare handles', () => {
    expect(parentCardLinkOwnerIndex(['Jon', 'Nicole'], '@Nicole')).toBe(1)
    expect(parentCardLinkOwnerIndex(['Jon', 'nicole'], 'Nicole')).toBe(1)
    // A near miss is NOT a match (parentNameRows' rule): so the fallback lands.
    expect(parentCardLinkOwnerIndex(['Jon', 'Nicole Rivera'], 'Nicole')).toBe(0)
  })

  it('falls back to the FIRST card ONLY when no card matches', () => {
    // Reachability: a link whose handle matches no card name must still be
    // endable/answerable somewhere, and the first card is the stable place.
    expect(parentCardLinkOwnerIndex(['Jon', 'Nicole'], 'Nobody')).toBe(0)
    expect(parentCardLinkOwnerIndex(['Jon'], 'Nobody')).toBe(0)
    // The not-yet-saved slot is a rendered card too, and matches nothing.
    expect(parentCardLinkOwnerIndex([''], 'Nicole')).toBe(0)
  })

  it('lets ONE card claim a name two cards share', () => {
    // One accepted partner is one person; the first bearer claims it, exactly
    // as `parentNameRows`' `claimed` flag does on the read surface.
    expect(parentCardLinkOwnerIndex(['Nicole', 'Nicole'], 'Nicole')).toBe(0)
  })

  it('treats an empty or missing handle as matching NOBODY', () => {
    // A failed handle embed must not turn the first nameless card into the
    // partner; the fallback still lands on the first card.
    expect(parentCardLinkOwnerIndex(['Jon', 'Nicole'], '')).toBe(0)
    expect(parentCardLinkOwnerIndex(['', 'Nicole'], '')).toBe(0)
  })

  it('is -1 with no cards at all — nothing carries it', () => {
    expect(parentCardLinkOwnerIndex([], 'Nicole')).toBe(-1)
  })
})

describe('parentCardLinkState — what one card shows (V24 11B)', () => {
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

  it('THE CANONICAL CASE: exactly ONE card carries the accepted link', () => {
    // cards ["Jon", "Nicole"], linked to @Nicole. The old per-card rule answered
    // 'linked' for BOTH cards here; the list-level rule answers it once.
    const owner = parentCardLinkOwnerIndex(['Jon', 'Nicole'], 'Nicole')
    const states = ['Jon', 'Nicole'].map((_name, i) => parentCardLinkState(linked, i, owner))
    expect(states).toEqual(['hidden', 'linked'])
    expect(states.filter((s) => s === 'linked')).toHaveLength(1)
  })

  it('prints the pending and declined states ONCE, whichever direction', () => {
    const owner = parentCardLinkOwnerIndex(['Jon', 'Nicole'], 'Nicole')
    expect([
      parentCardLinkState(incoming, 0, owner),
      parentCardLinkState(incoming, 1, owner),
    ]).toEqual(['hidden', 'incoming'])
    expect([
      parentCardLinkState(outgoing, 0, owner),
      parentCardLinkState(outgoing, 1, owner),
    ]).toEqual(['hidden', 'outgoing'])
    expect([
      parentCardLinkState(declined, 0, owner),
      parentCardLinkState(declined, 1, owner),
    ]).toEqual(['hidden', 'declined'])
  })

  it('puts the unmatched fallback on the FIRST card alone', () => {
    const owner = parentCardLinkOwnerIndex(['Jon', 'Nicole'], 'Nobody')
    expect(owner).toBe(0)
    expect([
      parentCardLinkState(incoming, 0, owner),
      parentCardLinkState(incoming, 1, owner),
    ]).toEqual(['incoming', 'hidden'])
  })

  it('hides the state everywhere when there are no cards to carry it', () => {
    const owner = parentCardLinkOwnerIndex([], 'Nicole')
    expect(owner).toBe(-1)
    expect([
      parentCardLinkState(linked, 0, owner),
      parentCardLinkState(linked, 1, owner),
    ]).toEqual(['hidden', 'hidden'])
  })

  it('offers the invite on EVERY card while no link exists', () => {
    // Linking is per-person ("link an account to that person's name"), so unlike
    // the account-level states this one is not exclusive. `ownerIndex` is
    // irrelevant here.
    expect(parentCardLinkState({ kind: 'none' }, 0, 0)).toBe('invite')
    expect(parentCardLinkState({ kind: 'none' }, 1, 0)).toBe('invite')
    expect(parentCardLinkState({ kind: 'none' }, 1, -1)).toBe('invite')
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
