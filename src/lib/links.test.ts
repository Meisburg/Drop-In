import { describe, expect, it } from 'vitest'
import {
  LINK_EMPTY_MESSAGE,
  LINK_SELF_MESSAGE,
  linkStatusLabel,
  linkView,
  normalizeHandle,
  validateLinkRequest,
  type LinkRowForView,
} from './links'

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
