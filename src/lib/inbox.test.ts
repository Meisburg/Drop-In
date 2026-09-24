import { describe, expect, it } from 'vitest'
import { mergeConversations } from './inbox'
import type { DmConversationRow, PlaydateConversationRow } from './inbox'

/**
 * V23 s7 — the inbox's id-keyed merge seam (src/lib/inbox.ts).
 *
 * The acceptance criteria pin these cases:
 *   1. no overlap — two distinct counterparts stay two rows;
 *   2. overlap with DM newer — one row, the DM row wins (newer latestAt);
 *   3. overlap with playdate newer — one row, the playdate row wins;
 *   4. three-way — a counterpart present in BOTH lists + a third, distinct
 *      counterpart → exactly two rows;
 *   5. same-name-different-id — two DIFFERENT parents who share a display
 *      name must render TWO rows (the merge must not collapse on name);
 *   6. both threads — the winning row (DM newer, playdate newer, or tied)
 *      carries the SUM of both threads' unreadCounts (disjoint cursors);
 *   7. two playdate threads with the same counterpart — one row, counts
 *      summed (the per-playdate cursors are disjoint too).
 */

function dm(overrides: Partial<DmConversationRow> = {}): DmConversationRow {
  return {
    otherPartyId: 'dm-parent',
    otherPartyName: 'Parent A',
    latestAt: '2026-09-23T10:00:00Z',
    preview: 'DM preview',
    unreadCount: 0,
    ...overrides,
  }
}

function pd(overrides: Partial<PlaydateConversationRow> = {}): PlaydateConversationRow {
  return {
    playdateId: 'playdate-1',
    playdateTitle: 'Playground time',
    otherPartyDisplayName: 'Parent A',
    otherPartyId: 'pd-parent',
    latestMessagePreview: 'PD preview',
    latestMessageAt: '2026-09-23T10:00:00Z',
    unreadCount: 0,
    ...overrides,
  }
}

describe('mergeConversations', () => {
  it('no overlap: two distinct counterparts stay two rows', () => {
    const result = mergeConversations([dm({ otherPartyId: 'p1' })], [pd({ otherPartyId: 'p2' })])
    expect(result).toHaveLength(2)
    // Newest-first sort; both have the same latestAt so order is stable by
    // insertion (dm first). Assert by key set, not position.
    const keys = result.map((r) => r.otherPartyId).sort()
    expect(keys).toEqual(['p1', 'p2'])
  })

  it('overlap with DM newer: one row, the DM row wins', () => {
    const dmNewer = dm({ otherPartyId: 'same', latestAt: '2026-09-23T12:00:00Z' })
    const pdOlder = pd({ otherPartyId: 'same', latestMessageAt: '2026-09-23T10:00:00Z' })
    const result = mergeConversations([dmNewer], [pdOlder])
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('dm')
    expect(result[0].otherPartyId).toBe('same')
  })

  it('overlap with playdate newer: one row, the playdate row wins', () => {
    const dmOlder = dm({ otherPartyId: 'same', latestAt: '2026-09-23T10:00:00Z' })
    const pdNewer = pd({ otherPartyId: 'same', latestMessageAt: '2026-09-23T12:00:00Z' })
    const result = mergeConversations([dmOlder], [pdNewer])
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('playdate')
    expect(result[0].playdateId).toBe('playdate-1')
    expect(result[0].otherPartyId).toBe('same')
  })

  it('three-way: a shared counterpart collapses, a distinct one stays', () => {
    // "shared" appears in BOTH lists; "solo" appears only in the DM list.
    const sharedDm = dm({ otherPartyId: 'shared', latestAt: '2026-09-23T11:00:00Z' })
    const soloDm = dm({ otherPartyId: 'solo', latestAt: '2026-09-23T09:00:00Z' })
    const sharedPd = pd({ otherPartyId: 'shared', latestMessageAt: '2026-09-23T10:00:00Z' })
    const result = mergeConversations([sharedDm, soloDm], [sharedPd])
    expect(result).toHaveLength(2)
    const keys = result.map((r) => r.otherPartyId).sort()
    expect(keys).toEqual(['shared', 'solo'])
    // The shared row is the DM (newer).
    const shared = result.find((r) => r.otherPartyId === 'shared')
    expect(shared?.kind).toBe('dm')
  })

  it('same-name-different-id: two parents sharing a name stay two rows', () => {
    // Both are named "Parent A" but have DIFFERENT profile ids — the merge
    // must NOT collapse them (collapsing would merge two real people).
    const dmA = dm({ otherPartyId: 'id-A', otherPartyName: 'Parent A' })
    const pdB = pd({ otherPartyId: 'id-B', otherPartyDisplayName: 'Parent A' })
    const result = mergeConversations([dmA], [pdB])
    expect(result).toHaveLength(2)
    const keys = result.map((r) => r.otherPartyId).sort()
    expect(keys).toEqual(['id-A', 'id-B'])
  })

  it('does not mutate its inputs (React state discipline)', () => {
    const dmRows = [dm({ otherPartyId: 'x' })]
    const pdRows = [pd({ otherPartyId: 'y' })]
    const before = JSON.stringify({ dmRows, pdRows })
    mergeConversations(dmRows, pdRows)
    expect(JSON.stringify({ dmRows, pdRows })).toBe(before)
  })

  it('both threads, DM newer: the DM row wins and carries the summed unreadCount', () => {
    // The concrete sequence: 2 unread DMs (cursor never stamped) + 1 unread
    // playdate message. The DM thread is newer, so the DM row wins — but its
    // badge must show 3, not 2 (the playdate dot must not be hidden).
    const dmNewer = dm({ otherPartyId: 'same', latestAt: '2026-09-23T12:00:00Z', unreadCount: 2 })
    const pdOlder = pd({ otherPartyId: 'same', latestMessageAt: '2026-09-23T10:00:00Z', unreadCount: 1 })
    const result = mergeConversations([dmNewer], [pdOlder])
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('dm')
    expect(result[0].otherPartyId).toBe('same')
    expect(result[0].unreadCount).toBe(3)
  })

  it('both threads, playdate newer: the playdate row wins and carries the summed unreadCount', () => {
    const dmOlder = dm({ otherPartyId: 'same', latestAt: '2026-09-23T10:00:00Z', unreadCount: 2 })
    const pdNewer = pd({ otherPartyId: 'same', latestMessageAt: '2026-09-23T12:00:00Z', unreadCount: 1 })
    const result = mergeConversations([dmOlder], [pdNewer])
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('playdate')
    expect(result[0].playdateId).toBe('playdate-1')
    expect(result[0].otherPartyId).toBe('same')
    expect(result[0].unreadCount).toBe(3)
  })

  it('both threads, tied latestAt: the playdate row wins and the counts still sum', () => {
    const dmTied = dm({ otherPartyId: 'same', unreadCount: 4 })
    const pdTied = pd({ otherPartyId: 'same', unreadCount: 5 })
    const result = mergeConversations([dmTied], [pdTied])
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('playdate')
    expect(result[0].unreadCount).toBe(9)
  })

  it('two playdate threads with the same counterpart: one row, counts summed', () => {
    // A parent who hosts two playdates both messaged with the caller: the
    // per-playdate cursors are disjoint, so the collapsed badge is the sum.
    const pdOne = pd({ otherPartyId: 'same', playdateId: 'p1', latestMessageAt: '2026-09-23T10:00:00Z', unreadCount: 2 })
    const pdTwo = pd({ otherPartyId: 'same', playdateId: 'p2', latestMessageAt: '2026-09-23T11:00:00Z', unreadCount: 1 })
    const result = mergeConversations([], [pdOne, pdTwo])
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('playdate')
    expect(result[0].playdateId).toBe('p2')
    expect(result[0].unreadCount).toBe(3)
  })
})