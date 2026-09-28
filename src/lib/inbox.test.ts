import { describe, expect, it } from 'vitest'
import {
  activeTodayLabel,
  daySeparatorLabel,
  firstNamedCounterpart,
  groupLabel,
  mergeConversations,
  mergeKeyFor,
  messageSenderLabel,
  messageTimestampLabel,
  QUICK_REPLIES,
  singleSenderCounterpart,
  sumUnread,
  threadContextLine,
} from './inbox'
import { cardWhenLabel } from './feed'
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
 *   9. two rows whose counterpart could NOT be resolved both survive, and
 *      carry DISTINCT `mergeKey` identities (the list key / testid input).
 *  10. the `dm:` branch of that key rule — the one with no producer behind it
 *      — behaves the same, including on a shared timestamp.
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

  it('two playdate rows with an UNRESOLVED counterpart both survive, with DISTINCT identities', () => {
    // An unresolved playdate row IS reachable from the producer: db.ts
    // `listConversationsWithClient` derives otherPartyId as
    // `counterpartIds[playdateId] ?? ''` (db.ts:4384-4387) and only takes that
    // fallback when the caller SENT the last message, while `counterpartIds`
    // is '' whenever the caller is the HOST and no pinger resolves
    // (db.ts:4305 — `lastPinger?.id ?? ''`: nobody pinged, or the pinger
    // un-pinged, which DELETEs the row at trust.ts:68-75).
    //
    // The merge must not lump those rows into one '' bucket — before the fix
    // only ONE row survived per kind, with the unread counts summed onto the
    // survivor — AND the two survivors must carry DISTINCT identities, because
    // `otherPartyId` is '' on both, so a React list key or a data-testid built
    // from it collides.
    const pdOne = pd({
      otherPartyId: '',
      otherPartyDisplayName: '',
      playdateId: 'p1',
      latestMessageAt: '2026-09-23T10:00:00Z',
      unreadCount: 2,
    })
    const pdTwo = pd({
      otherPartyId: '',
      otherPartyDisplayName: '',
      playdateId: 'p2',
      latestMessageAt: '2026-09-23T11:00:00Z',
      unreadCount: 3,
    })
    const result = mergeConversations([], [pdOne, pdTwo])
    expect(result).toHaveLength(2)
    const p1 = result.find((r) => r.playdateId === 'p1')
    const p2 = result.find((r) => r.playdateId === 'p2')
    expect(p1?.otherPartyId).toBe('')
    expect(p2?.otherPartyId).toBe('')
    expect(p1?.unreadCount).toBe(2)
    expect(p2?.unreadCount).toBe(3)
    // THE BUG PINNED. At c253865 both rows were `otherPartyId === ''`, so the
    // consumer's `key={row.otherPartyId || row.kind}` gave BOTH the React key
    // 'playdate', and `data-testid={'inbox-row-' + otherPartyId}` gave both
    // the testid 'inbox-row-'.
    expect(p1?.mergeKey).toBe('playdate:p1')
    expect(p2?.mergeKey).toBe('playdate:p2')
    expect(new Set(result.map((r) => r.mergeKey)).size).toBe(2)
  })

  it('two DM rows with an UNRESOLVED counterpart both survive, with DISTINCT identities', () => {
    // THE `dm:` BRANCH — ZERO coverage before this test: the only unresolved
    // row a test had ever fed was a playdate. An unresolved DM row cannot come
    // from db.ts today (that producer's Map is keyed on profile PKs —
    // db.ts:4891 `row.sender_id`, db.ts:4905 `recipient.id`), but
    // `mergeConversations` is a public pure function, so it must not collapse
    // two distinct unresolved DM conversations if one ever can.
    const dmOne = dm({
      otherPartyId: '',
      otherPartyName: '',
      latestAt: '2026-09-23T10:00:00Z',
      unreadCount: 2,
    })
    const dmTwo = dm({
      otherPartyId: '',
      otherPartyName: '',
      latestAt: '2026-09-23T11:00:00Z',
      unreadCount: 3,
    })
    const result = mergeConversations([dmOne, dmTwo], [])
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.otherPartyId === '')).toBe(true)
    expect(new Set(result.map((r) => r.mergeKey)).size).toBe(2)
    expect(result.map((r) => r.mergeKey).sort()).toEqual([
      'dm:unresolved:0',
      'dm:unresolved:1',
    ])
  })

  it('two unresolved DM rows SHARING A TIMESTAMP stay two rows with two identities', () => {
    // The exact tie the old `dm:${row.latestAt}` key collapsed: two distinct
    // unresolved conversations whose latest messages share a created_at. That
    // is the original single-''-bucket bug resurfacing on a tie, so it is
    // pinned by count: two rows in, two rows out.
    const sameMoment = '2026-09-23T10:00:00Z'
    const result = mergeConversations(
      [
        dm({ otherPartyId: '', otherPartyName: '', latestAt: sameMoment }),
        dm({ otherPartyId: '', otherPartyName: '', latestAt: sameMoment }),
      ],
      [],
    )
    expect(result).toHaveLength(2)
    expect(new Set(result.map((r) => r.mergeKey)).size).toBe(2)
  })

  it('a RESOLVED row keeps the counterpart id as its identity (the consumer testids do not move)', () => {
    // Every resolved row's identity is its profile id, exactly what the list
    // key and the row testids used before this change — so the e2e specs that
    // address rows by `inbox-row-<profileId>` (e2e/dm.e2e.ts:109,123) keep
    // resolving.
    const result = mergeConversations(
      [dm({ otherPartyId: 'parent-1' })],
      [pd({ otherPartyId: 'parent-1' })],
    )
    expect(result).toHaveLength(1)
    expect(result[0].mergeKey).toBe('parent-1')
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

describe('mergeKeyFor (the per-conversation identity, tested on its own)', () => {
  it('a RESOLVED counterpart keys on its profile id — the id both kinds collapse under', () => {
    expect(mergeKeyFor({ otherPartyId: 'parent-1', kind: 'dm' })).toBe('parent-1')
    expect(mergeKeyFor({ otherPartyId: 'parent-1', kind: 'playdate', playdateId: 'p1' })).toBe(
      'parent-1',
    )
  })

  it('an UNRESOLVED playdate row keys on the playdate id — a durable identity', () => {
    expect(mergeKeyFor({ otherPartyId: '', kind: 'playdate', playdateId: 'p1' })).toBe(
      'playdate:p1',
    )
    expect(mergeKeyFor({ otherPartyId: '', kind: 'playdate', playdateId: 'p2' })).toBe(
      'playdate:p2',
    )
  })

  it('an UNRESOLVED DM row keys on the ordinal — NEVER on latestAt', () => {
    // `latestAt` is not an identity: a new message changes it, and two
    // distinct conversations whose latest messages share a timestamp would
    // collapse back into one bucket. The ordinal is what keeps them apart.
    expect(mergeKeyFor({ otherPartyId: '', kind: 'dm' }, 0)).toBe('dm:unresolved:0')
    expect(mergeKeyFor({ otherPartyId: '', kind: 'dm' }, 1)).toBe('dm:unresolved:1')
  })

  it('the ordinal is ignored by the resolved and playdate branches', () => {
    expect(mergeKeyFor({ otherPartyId: 'parent-1', kind: 'dm' }, 7)).toBe('parent-1')
    expect(mergeKeyFor({ otherPartyId: '', kind: 'playdate', playdateId: 'p1' }, 7)).toBe(
      'playdate:p1',
    )
  })

  it('two unresolved rows of different kinds never share one key', () => {
    const playdateKey = mergeKeyFor({ otherPartyId: '', kind: 'playdate', playdateId: 'p1' }, 0)
    const dmKey = mergeKeyFor({ otherPartyId: '', kind: 'dm' }, 0)
    expect(playdateKey).not.toBe(dmKey)
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

describe('groupLabel (V27 s4 — the thread names the group, never the viewer)', () => {
  it('returns null for no other participants or exactly one (a 1:1 keeps today\'s header)', () => {
    expect(groupLabel([], 'me')).toBeNull()
    expect(groupLabel([{ id: 'me', name: 'Jon' }], 'me')).toBeNull()
    expect(groupLabel([{ id: 'a', name: 'Nicole' }], 'me')).toBeNull()
  })

  it('drops the viewer by id and names the first named other, with the count', () => {
    expect(
      groupLabel(
        [
          { id: 'me', name: 'Jon Meisburg' },
          { id: 'a', name: 'Nicole Meisburg' },
          { id: 'b', name: 'Priya Patel' },
        ],
        'me',
      ),
    ).toBe('Nicole Meisburg + 1 more')
  })

  it('dedupes repeated participants by id so a duplicate cannot pad the count', () => {
    expect(
      groupLabel(
        [
          { id: 'a', name: 'Nicole Meisburg' },
          { id: 'a', name: 'Nicole Meisburg' },
          { id: 'b', name: 'Priya Patel' },
        ],
        'me',
      ),
    ).toBe('Nicole Meisburg + 1 more')
  })

  it('uses the FIRST participant with a non-blank name, never a blank one', () => {
    expect(
      groupLabel(
        [
          { id: 'a', name: '   ' },
          { id: 'b', name: '' },
          { id: 'c', name: 'Priya Patel' },
          { id: 'd', name: 'Nicole Meisburg' },
        ],
        'me',
      ),
    ).toBe('Priya Patel + 3 more')
  })

  it('falls back to the honest count when nobody has a name (never an invented name)', () => {
    expect(
      groupLabel(
        [
          { id: 'a', name: '' },
          { id: 'b', name: '  ' },
          { id: 'c', name: '' },
        ],
        'me',
      ),
    ).toBe('3 parents')
  })

  it('never names the viewer, even when the viewer is the first named row', () => {
    // The viewer is dropped before the "first named" pick, so their name cannot
    // leak into the label however the participants are ordered.
    const label = groupLabel(
      [
        { id: 'me', name: 'Jon Meisburg' },
        { id: 'a', name: '' },
        { id: 'b', name: 'Priya Patel' },
      ],
      'me',
    )
    expect(label).toBe('Priya Patel + 1 more')
    expect(label ?? '').not.toContain('Jon')
  })

  it('keeps everyone when the viewer id is unknown (null)', () => {
    expect(
      groupLabel(
        [
          { id: 'a', name: 'Nicole Meisburg' },
          { id: 'b', name: 'Priya Patel' },
        ],
        null,
      ),
    ).toBe('Nicole Meisburg + 1 more')
  })
})

describe('threadContextLine (V27 s4 — when · place, and a missing half renders nothing)', () => {
  const start = '2026-09-27T15:00:00.000Z'
  const end = '2026-09-27T16:00:00.000Z'

  it('joins the app\'s ONE card window formatter with the place name', () => {
    // The exact window wording is `cardWhenLabel`'s (feed.ts); this pins the
    // COMPOSITION, so a second date format cannot grow here.
    expect(threadContextLine(start, end, 'Gas Works Park')).toBe(
      `${cardWhenLabel(start, end)} · Gas Works Park`,
    )
  })

  it('renders just the place when the window is missing', () => {
    expect(threadContextLine(null, null, 'Gas Works Park')).toBe('Gas Works Park')
    expect(threadContextLine('', '', 'Gas Works Park')).toBe('Gas Works Park')
    expect(threadContextLine(undefined, undefined, 'Gas Works Park')).toBe('Gas Works Park')
  })

  it('renders just the window (no dangling separator) when the place is missing', () => {
    const when = cardWhenLabel(start, end)
    for (const place of [null, undefined, '', '   ']) {
      const line = threadContextLine(start, end, place)
      expect(line).toBe(when)
      // The card formatter's own day · window separator is fine; what must not
      // appear is a trailing/leading separator for the missing place half.
      expect((line ?? '').endsWith(' ·') || (line ?? '').startsWith('· ')).toBe(false)
    }
  })

  it('returns null when neither half is known', () => {
    expect(threadContextLine(null, null, null)).toBeNull()
    expect(threadContextLine('', '', '   ')).toBeNull()
  })

  it('never leaks "null", "undefined", "Invalid Date" or a stray separator', () => {
    const lines = [
      threadContextLine(null, null, 'Gas Works Park'),
      threadContextLine(start, end, null),
      threadContextLine('not-a-date', 'also-not', 'Gas Works Park'),
      threadContextLine(start, 'not-a-date', 'Gas Works Park'),
    ]
    for (const line of lines) {
      expect(line).not.toBeNull()
      expect(line ?? '').not.toMatch(/null|undefined|Invalid Date/)
      expect((line ?? '').startsWith(' · ') || (line ?? '').endsWith(' · ')).toBe(false)
    }
    // A half-window is not a window: with no place, it renders nothing at all.
    expect(threadContextLine('not-a-date', end, null)).toBeNull()
  })
})

describe('sumUnread (V27 s3 — the Inbox tab badge total)', () => {
  it('returns 0 for no rows', () => {
    expect(sumUnread([])).toBe(0)
  })

  it('sums both conversation kinds', () => {
    expect(sumUnread([dm({ unreadCount: 2 }), pd({ unreadCount: 3 })])).toBe(5)
  })

  it('clamps NaN, negative, undefined/null and non-numbers to 0 instead of poisoning the sum', () => {
    expect(
      sumUnread([
        { unreadCount: Number.NaN },
        { unreadCount: -4 },
        { unreadCount: undefined },
        { unreadCount: null },
        { unreadCount: 'lots' } as unknown as { unreadCount: number },
        { unreadCount: Number.POSITIVE_INFINITY },
        dm({ unreadCount: 7 }),
      ]),
    ).toBe(7)
  })

  it('never returns NaN, even when every row is nonsense', () => {
    const total = sumUnread([{ unreadCount: Number.NaN }, { unreadCount: undefined }])
    expect(Number.isNaN(total)).toBe(false)
    expect(total).toBe(0)
  })
})

describe('QUICK_REPLIES (V27 s5 — exactly five pinned label/body pairs)', () => {
  it('is exactly five, in the pinned order', () => {
    expect(QUICK_REPLIES).toHaveLength(5)
    expect(QUICK_REPLIES.map((reply) => reply.label)).toEqual([
      'On my way',
      'Running late',
      "We're here",
      'Still on?',
      "Can't make it",
    ])
  })

  it('carries a non-empty label and body for every chip', () => {
    for (const reply of QUICK_REPLIES) {
      expect(reply.label.trim()).not.toBe('')
      expect(reply.body.trim()).not.toBe('')
    }
  })

  it('pins the two bodies the brief spells out verbatim', () => {
    const runningLate = QUICK_REPLIES.find((reply) => reply.label === 'Running late')
    const cantMakeIt = QUICK_REPLIES.find((reply) => reply.label === "Can't make it")
    expect(runningLate?.body).toBe('Running about 10 minutes late.')
    expect(cantMakeIt?.body).toBe("Can't make it after all — sorry!")
  })
})

describe('messageTimestampLabel (V27 s5 — the local time-of-day)', () => {
  it('formats a local clock time with AM/PM, zero-padded minutes', () => {
    const iso = new Date(2026, 8, 27, 15, 4).toISOString()
    expect(messageTimestampLabel(iso, iso)).toBe('3:04 PM')
  })

  it('handles midnight and noon as 12-hour clocks, not 0', () => {
    expect(messageTimestampLabel(new Date(2026, 8, 27, 0, 5).toISOString(), 'now')).toBe('12:05 AM')
    expect(messageTimestampLabel(new Date(2026, 8, 27, 12, 0).toISOString(), 'now')).toBe('12:00 PM')
    expect(messageTimestampLabel(new Date(2026, 8, 27, 23, 59).toISOString(), 'now')).toBe('11:59 PM')
  })

  it('returns \'\' for empty or unparseable instants instead of throwing', () => {
    expect(messageTimestampLabel('', 'now')).toBe('')
    expect(messageTimestampLabel('not-a-date', 'now')).toBe('')
    expect(messageTimestampLabel('nonsense', 'also-nonsense')).toBe('')
  })

  it('does not leak "NaN", "undefined" or "Invalid Date"', () => {
    const label = messageTimestampLabel('', 'now')
    expect(label).not.toMatch(/NaN|undefined|Invalid Date/)
  })
})

describe('daySeparatorLabel (V27 s5 — Today / Yesterday / an older local date)', () => {
  // Built from LOCAL Date components so the cases mean the same thing in every
  // test-runner timezone (the helper is explicitly local-day based).
  const now = new Date(2026, 8, 27, 18, 0).toISOString()
  const todayIso = new Date(2026, 8, 27, 9, 30).toISOString()
  const yesterdayIso = new Date(2026, 8, 26, 23, 30).toISOString()
  const olderIso = new Date(2026, 8, 20, 9, 0).toISOString()

  it('says Today for the same local day', () => {
    expect(daySeparatorLabel(todayIso, now)).toBe('Today')
  })

  it('says Yesterday for the previous local day, however few hours apart', () => {
    // 11:30pm the night before is still "Yesterday", not "hours ago".
    expect(daySeparatorLabel(yesterdayIso, now)).toBe('Yesterday')
  })

  it('names an older local date with short weekday + month + day', () => {
    const expected = new Date(2026, 8, 20).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
    expect(daySeparatorLabel(olderIso, now)).toBe(expected)
    expect(daySeparatorLabel(olderIso, now)).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/)
  })

  it('never says Tomorrow for a past instant, even across a midnight clock skew', () => {
    const future = new Date(2026, 8, 28, 9, 0).toISOString()
    expect(daySeparatorLabel(future, now)).not.toBe('Tomorrow')
  })

  it('returns \'\' for empty or unparseable instants instead of throwing', () => {
    expect(daySeparatorLabel('', now)).toBe('')
    expect(daySeparatorLabel('not-a-date', now)).toBe('')
    // A broken `now` must not throw through `.toISOString()` either.
    expect(daySeparatorLabel('not-a-date', 'also-not-a-date')).toBe('')
    expect(daySeparatorLabel(todayIso, 'also-not-a-date')).not.toBe('Today')
  })
})
