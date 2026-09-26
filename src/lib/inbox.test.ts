import { describe, expect, it } from 'vitest'
import {
  activeTodayLabel,
  firstNamedCounterpart,
  mergeConversations,
  messageSenderLabel,
  singleSenderCounterpart,
} from './inbox'
import type { DmConversationRow, MessageSenderFields, PlaydateConversationRow } from './inbox'

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
 *   7. two playdate threads with the same counterpart — the newer winner
 *      keeps its own unreadCount.
 *   8. a DM plus multiple playdate rows sums the newest row of each kind.
 */

function dm(overrides: Partial<DmConversationRow> = {}): DmConversationRow {
  return {
    otherPartyId: 'dm-parent',
    otherPartyName: 'Parent A',
    otherPartyAvatarUrl: null,
    otherPartyLastSeenAt: null,
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
    otherPartyAvatarUrl: null,
    otherPartyLastSeenAt: null,
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

  it('two playdate threads with the same counterpart: the newer winner keeps its unreadCount', () => {
    const pdOne = pd({ otherPartyId: 'same', playdateId: 'p1', latestMessageAt: '2026-09-23T10:00:00Z', unreadCount: 2 })
    const pdTwo = pd({ otherPartyId: 'same', playdateId: 'p2', latestMessageAt: '2026-09-23T11:00:00Z', unreadCount: 1 })
    const result = mergeConversations([], [pdOne, pdTwo])
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('playdate')
    expect(result[0].playdateId).toBe('p2')
    expect(result[0].unreadCount).toBe(1)
  })

  it('DM plus two read playdate threads keeps the DM unreadCount', () => {
    const dmRow = dm({ otherPartyId: 'same', latestAt: '2026-09-23T10:00:00Z', unreadCount: 2 })
    const pdOne = pd({ otherPartyId: 'same', playdateId: 'p1', latestMessageAt: '2026-09-23T11:00:00Z', unreadCount: 0 })
    const pdTwo = pd({ otherPartyId: 'same', playdateId: 'p2', latestMessageAt: '2026-09-23T12:00:00Z', unreadCount: 0 })
    const result = mergeConversations([dmRow], [pdOne, pdTwo])
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('playdate')
    expect(result[0].playdateId).toBe('p2')
    expect(result[0].unreadCount).toBe(2)
  })

  it('DM plus two playdate threads sums the newest row from each kind', () => {
    const dmRow = dm({ otherPartyId: 'same', latestAt: '2026-09-23T10:00:00Z', unreadCount: 2 })
    const pdOne = pd({ otherPartyId: 'same', playdateId: 'p1', latestMessageAt: '2026-09-23T11:00:00Z', unreadCount: 1 })
    const pdTwo = pd({ otherPartyId: 'same', playdateId: 'p2', latestMessageAt: '2026-09-23T12:00:00Z', unreadCount: 4 })
    const result = mergeConversations([dmRow], [pdOne, pdTwo])
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('playdate')
    expect(result[0].playdateId).toBe('p2')
    expect(result[0].unreadCount).toBe(6)
  })
})

describe('activeTodayLabel (V24 slice 04 — the honest, non-presence activity line)', () => {
  const nowIso = '2026-09-25T21:00:00.000Z'

  it('says "Active today" for a cursor written earlier the same local day', () => {
    expect(activeTodayLabel('2026-09-25T16:02:00.000Z', nowIso)).toBe('Active today')
  })

  it('is absent for an older cursor — never a claim the data cannot support', () => {
    expect(activeTodayLabel('2026-09-24T16:02:00.000Z', nowIso)).toBeNull()
    expect(activeTodayLabel('2026-08-01T16:02:00.000Z', nowIso)).toBeNull()
  })

  it('is absent when the counterpart has no cursor at all (migration 0024 not applied)', () => {
    expect(activeTodayLabel(null, nowIso)).toBeNull()
    expect(activeTodayLabel(undefined, nowIso)).toBeNull()
    expect(activeTodayLabel('', nowIso)).toBeNull()
  })

  it('says "Active today" even for a cursor one second old — the label never varies with recency', () => {
    // WHAT THIS PROVES: the label is one string for the whole local day, so the
    // row cannot say "now" or "online" however fresh the cursor is — that is the
    // anti-presence rule. It does NOT prove anything about the row's OTHER text:
    // `relativeTimeLabel` (InboxPage.tsx:66) legitimately says "just now" for the
    // latest MESSAGE's age, and that honest message-age copy is not the activity
    // line. This test is about `activeTodayLabel` only.
    const label = activeTodayLabel('2026-09-25T20:59:59.000Z', nowIso)
    expect(label).toBe('Active today')
    expect(label ?? '').not.toMatch(/now|online/i)
  })
})

/**
 * V25 ticket 11 — the per-MESSAGE identity rules.
 *
 * The founder's live defect: `"UnknownComing👍"`. The bubble label was
 * thread-level (`threadHeaderName || 'Unknown'`), so (a) a thread whose header
 * had not resolved printed "Unknown" over a real parent's message, and (b) a
 * group thread labelled a third participant's message with the counterpart's
 * name. These tests pin the replacements: the label comes from the message's
 * OWN sender, and the only honest answer for an unnameable sender is NO label.
 */
function msg(overrides: Partial<MessageSenderFields> = {}): MessageSenderFields {
  return {
    sender_id: 'sender-1',
    sender_display_name: 'Nicole Meisburg',
    ...overrides,
  }
}

describe('messageSenderLabel (V25 t11 — each bubble names its OWN sender)', () => {
  it("labels an other-party bubble with THAT sender's display name", () => {
    expect(
      messageSenderLabel(msg({ sender_id: 'nicole', sender_display_name: 'Nicole Meisburg' }), {
        viewerId: 'me',
        viewerDisplayName: 'Jon Meisburg',
        counterpart: { id: 'nicole', name: 'Nicole Meisburg' },
      }),
    ).toBe('Nicole Meisburg')
  })

  it('labels a group thread by the message sender, NOT the thread counterpart', () => {
    // The measured defect: Priya's message wore the counterpart's name.
    const counterpart = { id: 'nicole', name: 'Nicole Meisburg' }
    expect(
      messageSenderLabel(msg({ sender_id: 'priya', sender_display_name: 'Priya Patel' }), {
        viewerId: 'me',
        viewerDisplayName: 'Jon Meisburg',
        counterpart,
      }),
    ).toBe('Priya Patel')
    expect(
      messageSenderLabel(msg({ sender_id: 'nicole', sender_display_name: 'Nicole Meisburg' }), {
        viewerId: 'me',
        viewerDisplayName: 'Jon Meisburg',
        counterpart,
      }),
    ).toBe('Nicole Meisburg')
  })

  it('labels the viewer\'s own bubble with their own name, falling back to "You"', () => {
    expect(
      messageSenderLabel(msg({ sender_id: 'me', sender_display_name: null }), {
        viewerId: 'me',
        viewerDisplayName: 'Jon Meisburg',
      }),
    ).toBe('Jon Meisburg')
    expect(
      messageSenderLabel(msg({ sender_id: 'me', sender_display_name: null }), {
        viewerId: 'me',
        viewerDisplayName: null,
      }),
    ).toBe('You')
    expect(
      messageSenderLabel(msg({ sender_id: 'me', sender_display_name: null }), {
        viewerId: 'me',
        viewerDisplayName: '   ',
      }),
    ).toBe('You')
  })

  it('NEVER says "Unknown": an unnameable sender gets NO label (null)', () => {
    expect(
      messageSenderLabel(msg({ sender_id: 'ghost', sender_display_name: null }), {
        viewerId: 'me',
        viewerDisplayName: 'Jon Meisburg',
        counterpart: { id: 'nicole', name: 'Nicole Meisburg' },
      }),
    ).toBeNull()
    expect(
      messageSenderLabel(msg({ sender_id: 'ghost', sender_display_name: '  ' }), {
        viewerId: 'me',
      }),
    ).toBeNull()
    // And the literal word is unreachable even when the counterpart is unnamed.
    expect(
      messageSenderLabel(msg({ sender_id: 'ghost', sender_display_name: null }), {
        viewerId: 'me',
        counterpart: { id: 'ghost', name: '' },
      }),
    ).toBeNull()
  })

  it('uses the thread counterpart ONLY when the sender id IS the counterpart', () => {
    // A Realtime INSERT payload carries no embed — the counterpart name may
    // stand in, but strictly by ID, never by position.
    expect(
      messageSenderLabel(msg({ sender_id: 'nicole', sender_display_name: undefined }), {
        viewerId: 'me',
        counterpart: { id: 'nicole', name: 'Nicole Meisburg' },
      }),
    ).toBe('Nicole Meisburg')
    // A different participant's embed-less message must stay unlabelled.
    expect(
      messageSenderLabel(msg({ sender_id: 'priya', sender_display_name: undefined }), {
        viewerId: 'me',
        counterpart: { id: 'nicole', name: 'Nicole Meisburg' },
      }),
    ).toBeNull()
    // An id-less counterpart (nothing resolved) can never stand in.
    expect(
      messageSenderLabel(msg({ sender_id: 'nicole', sender_display_name: undefined }), {
        viewerId: 'me',
        counterpart: { id: '', name: 'Nicole Meisburg' },
      }),
    ).toBeNull()
  })
})

describe('singleSenderCounterpart (V25 t11 — the header can name a one-sender thread)', () => {
  it('names the one non-own sender when every other message is theirs', () => {
    expect(
      singleSenderCounterpart(
        [
          msg({ sender_id: 'me', sender_display_name: 'Jon Meisburg' }),
          msg({ sender_id: 'nicole', sender_display_name: 'Nicole Meisburg' }),
          msg({ sender_id: 'nicole', sender_display_name: 'Nicole Meisburg' }),
        ],
        'me',
      ),
    ).toEqual({ id: 'nicole', name: 'Nicole Meisburg' })
  })

  it('returns null for a group: two distinct non-own senders have no one name', () => {
    expect(
      singleSenderCounterpart(
        [
          msg({ sender_id: 'nicole', sender_display_name: 'Nicole Meisburg' }),
          msg({ sender_id: 'priya', sender_display_name: 'Priya Patel' }),
        ],
        'me',
      ),
    ).toBeNull()
  })

  it('returns null for an empty thread or a thread of only own messages', () => {
    expect(singleSenderCounterpart([], 'me')).toBeNull()
    expect(
      singleSenderCounterpart([msg({ sender_id: 'me', sender_display_name: 'Jon' })], 'me'),
    ).toBeNull()
  })

  it('keeps the sender id even when its display name never arrived', () => {
    // The id is still real information (it is what the bubble's fallback and
    // the header's priority chain key on); only the name is ''.
    expect(singleSenderCounterpart([msg({ sender_id: 'nicole', sender_display_name: null })], 'me')).toEqual({
      id: 'nicole',
      name: '',
    })
  })
})

describe('firstNamedCounterpart (V25 t11 — first real name wins, blanks are unknown)', () => {
  it('takes the first candidate with a non-blank name, preserving its id', () => {
    expect(
      firstNamedCounterpart([
        { id: 'a', name: '' },
        { id: 'b', name: 'Nicole Meisburg' },
        { id: 'c', name: 'Priya Patel' },
      ]),
    ).toEqual({ id: 'b', name: 'Nicole Meisburg' })
  })

  it('skips null/undefined candidates and returns an unnamed counterpart when none carry a name', () => {
    expect(firstNamedCounterpart([null, undefined, { id: 'a', name: '  ' }])).toEqual({ id: '', name: '' })
    expect(firstNamedCounterpart([])).toEqual({ id: '', name: '' })
  })
})
