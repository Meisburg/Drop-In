import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  applyReactionSet,
  applyReactionToggle,
  listConversationsWithClient,
  listDirectConversationsWithClient,
  markConversationReadWithClient,
  markDirectConversationReadWithClient,
  mergeIncomingMessage,
  MESSAGE_MAX_LENGTH,
  queryDirectMessagesWithClient,
  queryMessagesForPlaydateWithClient,
  reactionButtonClasses,
  reactionHitAreaClasses,
  reactionCountLabel,
  reactionStatesForMessagesWithClient,
  reconcileOptimisticMessage,
  sendMessageWithClient,
  truncateMessagePreview,
  validateMessageBody,
  REACTION_KINDS,
} from './db'
import type { MessageRow, ReactionState } from './db'
import { REACTION_ICONS } from '../components/icons'

/**
 * V14 ticket 01 (migration 0042): the inbox's db.ts seams against a recording
 * mock client (the db-v5 pattern — importing db.ts runs its module-scope
 * Supabase client creation, which reads the repo .env; the db-v2 note).
 *
 * Pins asserted here rather than by the live specs:
 *  - the WIRE SHAPE of each seam (which table, which columns, which filters)
 *    so a future "convenience" refactor that changes the query fails loudly.
 *  - the client-side validation mirror of 0042's CHECK constraint
 *    (trim, 1–2000 chars) — the DB is the final authority, but the UI must
 *    not round-trip an invalid body just to be told about it.
 *  - the read-cursor upsert's onConflict target (the composite PK) so a
 *    future single-column onConflict does not silently start clobbering
 *    other participants' cursors.
 */

interface Recorded {
  client: SupabaseClient
  calls: string[]
  payloads: unknown[]
}

/**
 * A recording mock for the message seams. Unlike makeWriteMockClient (which
 * answers every chain with one fixed result), this records the per-table
 * results: `from('messages')` and `from('conversation_reads')` and
 * `from('playdates')` each get their own data/error, because
 * listConversationsWithClient issues THREE sequential requests and the test
 * wants to assert the grouping logic across all three.
 *
 * The terminal `then` routes on the LAST recorded from() call (the chains are
 * sequential, never nested) — so a `from(conversation_reads)` that then calls
 * `.upsert()` gets the upsertResult, while a plain read gets conversationReads.
 */
function makeMessageMockClient(overrides: {
  messages?: { data: unknown; error: unknown }
  conversationReads?: { data: unknown; error: unknown }
  playdates?: { data: unknown; error: unknown }
  messageReactions?: { data: unknown; error: unknown }
  directConversationReads?: { data: unknown; error: unknown }
  messageRecipients?: { data: unknown; error: unknown }
  insertResult?: { data: unknown; error: unknown }
  upsertResult?: { data: unknown; error: unknown }
} = {}): Recorded {
  const calls: string[] = []
  const payloads: unknown[] = []
  let lastTable = ''
  let sawUpsert = false
  let sawInsert = false
  const builder = {
    select: (cols: string) => {
      calls.push(`select(${cols})`)
      return builder
    },
    order: (col: string, opts: { ascending?: boolean }) => {
      calls.push(`order(${col}, ${opts.ascending ? 'asc' : 'desc'})`)
      return builder
    },
    eq: (col: string, value: unknown) => {
      calls.push(`eq(${col}, ${String(value)})`)
      return builder
    },
    in: (col: string, values: unknown[]) => {
      calls.push(`in(${col}, ${values.map(String).join('|')})`)
      return builder
    },
    is: (col: string, value: unknown) => {
      calls.push(`is(${col}, ${String(value)})`)
      return builder
    },
    neq: (col: string, value: unknown) => {
      calls.push(`neq(${col}, ${String(value)})`)
      return builder
    },
    or: (filter: string) => {
      calls.push(`or(${filter})`)
      return builder
    },
    insert: (payload: unknown) => {
      calls.push('insert')
      sawInsert = true
      payloads.push(payload)
      return builder
    },
    upsert: (payload: unknown, opts?: { onConflict?: string }) => {
      calls.push(`upsert${opts?.onConflict !== undefined ? `(onConflict=${opts.onConflict})` : ''}`)
      sawUpsert = true
      payloads.push(payload)
      return builder
    },
    then: (onfulfilled?: (value: { data: unknown; error: unknown }) => unknown) => {
      // Route the terminal result by the table this chain started from + the
      // write it performed (if any). The saw* flags are reset per from() call
      // so a later read never inherits an earlier write's result.
      let result: { data: unknown; error: unknown }
      if (
        (lastTable === 'conversation_reads' || lastTable === 'direct_conversation_reads') &&
        sawUpsert
      ) {
        result = overrides.upsertResult ?? { data: null, error: null }
      } else if (lastTable === 'messages' && sawInsert) {
        result = overrides.insertResult ?? { data: null, error: null }
      } else if (lastTable === 'messages') {
        result = overrides.messages ?? { data: null, error: null }
      } else if (lastTable === 'conversation_reads') {
        result = overrides.conversationReads ?? { data: null, error: null }
      } else if (lastTable === 'direct_conversation_reads') {
        result = overrides.directConversationReads ?? { data: null, error: null }
      } else if (lastTable === 'message_recipients') {
        result = overrides.messageRecipients ?? { data: null, error: null }
      } else if (lastTable === 'playdates') {
        result = overrides.playdates ?? { data: null, error: null }
      } else if (lastTable === 'message_reactions') {
        result = overrides.messageReactions ?? { data: null, error: null }
      } else {
        result = { data: null, error: null }
      }
      return Promise.resolve({
        data: result.data ?? null,
        error: result.error ?? null,
      }).then(onfulfilled)
    },
  }
  const client = {
    from: (table: string) => {
      calls.push(`from(${table})`)
      lastTable = table
      sawUpsert = false
      sawInsert = false
      return builder
    },
  } as unknown as SupabaseClient
  return { client, calls, payloads }
}

describe('validateMessageBody (V14 ticket 01, the 0042 CHECK mirror)', () => {
  it('rejects an empty or whitespace-only body', () => {
    expect(validateMessageBody('')).not.toBeNull()
    expect(validateMessageBody('   ')).not.toBeNull()
  })

  it('accepts a body at exactly the cap', () => {
    expect(validateMessageBody('a'.repeat(MESSAGE_MAX_LENGTH))).toBeNull()
  })

  it('rejects a body over the cap', () => {
    expect(validateMessageBody('a'.repeat(MESSAGE_MAX_LENGTH + 1))).not.toBeNull()
  })

  it('trims before measuring (leading/trailing spaces do not count toward the cap)', () => {
    // 2000 chars + surrounding padding: the trimmed body is exactly at the cap.
    expect(validateMessageBody(`  ${'a'.repeat(MESSAGE_MAX_LENGTH)}  `)).toBeNull()
  })
})

describe('truncateMessagePreview (the list card\'s ~60-char line)', () => {
  it('returns short bodies unchanged (trimmed)', () => {
    expect(truncateMessagePreview('  hi there  ')).toBe('hi there')
  })

  it('truncates long bodies to 57 chars + an ellipsis (60 total)', () => {
    const long = 'x'.repeat(80)
    const preview = truncateMessagePreview(long)
    // The ellipsis is a single Unicode char, so 57 + 1 = 58 code units.
    expect(preview.length).toBe(58)
    expect(preview.endsWith('…')).toBe(true)
    expect(preview.startsWith('x'.repeat(57))).toBe(true)
  })
})

describe('listConversationsWithClient (V14 ticket 01)', () => {
  it('groups messages by playdate, computes unread counts, and resolves the counterpart name', async () => {
    const { client } = makeMessageMockClient({
      messages: {
        // Newest-first, matching the wire contract: request 1 orders by
        // created_at DESC, so the FIRST row seen per playdate is its latest.
        data: [
          // Playdate A: two messages, latest from the OTHER party (pinger "Mia").
          {
            id: 'm2',
            playdate_id: 'pd-a',
            sender_id: 'other',
            body: 'Yes, he loves the playground!',
            created_at: '2026-09-12T11:00:00Z',
            playdate: { title: 'Soccer practice' },
            sender: { display_name: 'Mia' },
          },
          {
            id: 'm1',
            playdate_id: 'pd-a',
            sender_id: 'me',
            body: 'Hi! Is Max okay to bring?',
            created_at: '2026-09-12T10:00:00Z',
            playdate: { title: 'Soccer practice' },
            sender: { display_name: 'Me' },
          },
          // Playdate B: one message, from ME (host) — the counterpart is the pinger.
          {
            id: 'm3',
            playdate_id: 'pd-b',
            sender_id: 'me',
            body: 'See you Saturday!',
            created_at: '2026-09-11T09:00:00Z',
            playdate: { title: 'Pool day' },
            sender: { display_name: 'Me' },
          },
        ],
        error: null,
      },
      conversationReads: {
        data: [
          // pd-a: I read up to m1 → m2 is unread (count 1).
          { playdate_id: 'pd-a', last_read_at: '2026-09-12T10:30:00Z' },
          // pd-b: no read row → all messages unread (count 1).
        ],
        error: null,
      },
      playdates: {
        data: [
          // pd-a: the caller is the pinger (host_profile_id = 'other') → the
          // counterpart is the host. The latest message is from Mia, so her
          // name comes straight off the message row (not this map).
          {
            id: 'pd-a',
            host_profile_id: 'other',
            host: { display_name: 'Alex' },
            pings: [{ profile: { id: 'pinger-mia', display_name: 'Mia' } }],
          },
          // pd-b: the caller IS the host → the counterpart is the most recent
          // pinger's name (Sam), resolved from this embed.
          {
            id: 'pd-b',
            host_profile_id: 'me',
            host: { display_name: 'Me' },
            pings: [{ profile: { id: 'pinger-sam', display_name: 'Sam' } }],
          },
        ],
        error: null,
      },
    })

    const summaries = await listConversationsWithClient(client, 'me')

    // Two conversations, newest-first (pd-a's latest message is newer).
    expect(summaries).toHaveLength(2)
    expect(summaries[0].playdateId).toBe('pd-a')
    expect(summaries[1].playdateId).toBe('pd-b')

    // pd-a: the latest message is from Mia → she is the named counterpart.
    expect(summaries[0].otherPartyDisplayName).toBe('Mia')
    // V23 s7: the merge key — when the latest sender is the OTHER party, their
    // profile id comes straight off request 1's sender embed (sender_id).
    expect(summaries[0].otherPartyId).toBe('other')
    expect(summaries[0].playdateTitle).toBe('Soccer practice')
    expect(summaries[0].latestMessageAt).toBe('2026-09-12T11:00:00Z')
    expect(summaries[0].unreadCount).toBe(1)

    // pd-b: my latest message → the counterpart is the most recent pinger.
    expect(summaries[1].otherPartyDisplayName).toBe('Sam')
    // The caller hosts, so the counterpart is the pinger — we need that
    // pinger's PROFILE id (not just their name) as the merge key.
    expect(summaries[1].otherPartyId).toBe('pinger-sam')
    expect(summaries[1].playdateTitle).toBe('Pool day')
    expect(summaries[1].unreadCount).toBe(1)
  })

  it('issues the three expected requests in order (messages, conversation_reads, playdates)', async () => {
    const { client, calls } = makeMessageMockClient({
      messages: { data: [], error: null },
      conversationReads: { data: [], error: null },
      playdates: { data: [], error: null },
    })
    await listConversationsWithClient(client, 'me')
    // The wire shape: three from() calls, in this order, with the right tables.
    expect(calls.filter((c) => c.startsWith('from('))).toEqual([
      'from(messages)',
      'from(conversation_reads)',
      // No third request when there are no messages (the playdate set is empty).
    ])
  })

  it('skips rows with a missing playdate_id (defensive — the FK cascade normally prevents it)', async () => {
    const { client } = makeMessageMockClient({
      messages: {
        data: [
          {
            id: 'm1',
            playdate_id: null,
            sender_id: 'me',
            body: 'orphan',
            created_at: '2026-09-12T10:00:00Z',
            playdate: null,
            sender: null,
          },
        ],
        error: null,
      },
      conversationReads: { data: [], error: null },
      playdates: { data: [], error: null },
    })
    const summaries = await listConversationsWithClient(client, 'me')
    expect(summaries).toEqual([])
  })

  it('propagates a messages-read error (pre-0042-apply 42703 discipline)', async () => {
    const { client } = makeMessageMockClient({
      messages: { data: null, error: new Error('42703: column does not exist') },
    })
    await expect(listConversationsWithClient(client, 'me')).rejects.toThrow('42703')
  })
})

describe('queryMessagesForPlaydateWithClient (the thread view\'s read)', () => {
  it('reads the playdate\'s messages oldest-first (created_at asc)', async () => {
    const { client, calls } = makeMessageMockClient({
      messages: {
        data: [
          {
            id: 'm1',
            playdate_id: 'pd-1',
            sender_id: 'me',
            body: 'first',
            created_at: '2026-09-12T10:00:00Z',
            sender: { display_name: 'Jon Meisburg' },
          },
          {
            id: 'm2',
            playdate_id: 'pd-1',
            sender_id: 'other',
            body: 'second',
            created_at: '2026-09-12T11:00:00Z',
            sender: { display_name: 'Nicole Meisburg' },
          },
        ],
        error: null,
      },
    })
    const rows = await queryMessagesForPlaydateWithClient(client, 'pd-1')
    expect(rows).toHaveLength(2)
    expect(rows[0].body).toBe('first')
    expect(rows[1].body).toBe('second')
    // V25 ticket 11: each row carries the SENDER's OWN display name in the same
    // request (the embed), which is what labels every bubble by its sender
    // instead of by the thread-level counterpart.
    expect(rows[0].sender_display_name).toBe('Jon Meisburg')
    expect(rows[1].sender_display_name).toBe('Nicole Meisburg')
    // The wire pins: the right table, the right filter, the right order, and the
    // sender embed (so a "convenience" refactor that drops it fails loudly).
    expect(calls).toContain('from(messages)')
    expect(calls).toContain(
      'select(id, playdate_id, sender_id, body, created_at, sender:profiles!messages_sender_id_fkey ( display_name ))',
    )
    expect(calls).toContain('eq(playdate_id, pd-1)')
    expect(calls).toContain('order(created_at, asc)')
  })

  it('carries a null sender_display_name when the embed is absent (no name invented)', async () => {
    const { client } = makeMessageMockClient({
      messages: {
        data: [
          {
            id: 'm1',
            playdate_id: 'pd-1',
            sender_id: 'other',
            body: 'first',
            created_at: '2026-09-12T10:00:00Z',
            sender: null,
          },
        ],
        error: null,
      },
    })
    const rows = await queryMessagesForPlaydateWithClient(client, 'pd-1')
    expect(rows[0].sender_display_name).toBeNull()
  })

  it('returns an empty array when the read yields no rows', async () => {
    const { client } = makeMessageMockClient({ messages: { data: null, error: null } })
    const rows = await queryMessagesForPlaydateWithClient(client, 'pd-1')
    expect(rows).toEqual([])
  })
})

describe('sendMessageWithClient (V14 ticket 01)', () => {
  it('inserts the trimmed body scoped to the playdate + sender', async () => {
    const { client, calls, payloads } = makeMessageMockClient()
    await sendMessageWithClient(client, 'pd-1', '  Hello there  ', 'me')
    expect(calls).toContain('from(messages)')
    expect(calls).toContain('insert')
    expect(payloads).toEqual([
      { playdate_id: 'pd-1', sender_id: 'me', body: 'Hello there' },
    ])
  })

  it('throws on an empty body BEFORE any wire call (the client-side gate)', async () => {
    const { client, calls } = makeMessageMockClient()
    await expect(sendMessageWithClient(client, 'pd-1', '   ', 'me')).rejects.toThrow(
      'cannot be empty',
    )
    // No insert was issued (validation runs first).
    expect(calls).not.toContain('insert')
  })

  it('throws on an over-cap body BEFORE any wire call', async () => {
    const { client, calls } = makeMessageMockClient()
    await expect(
      sendMessageWithClient(client, 'pd-1', 'a'.repeat(MESSAGE_MAX_LENGTH + 1), 'me'),
    ).rejects.toThrow(`${MESSAGE_MAX_LENGTH}`)
    expect(calls).not.toContain('insert')
  })

  it('propagates a failed insert (the RLS policy rejects non-participants)', async () => {
    const { client } = makeMessageMockClient({
      insertResult: { data: null, error: new Error('new row violates row-level security policy') },
    })
    await expect(sendMessageWithClient(client, 'pd-1', 'hi', 'stranger')).rejects.toThrow(
      'row-level security',
    )
  })
})

describe('markConversationReadWithClient (the read-cursor upsert)', () => {
  it('upserts the cursor with the composite-PK onConflict', async () => {
    const { client, calls, payloads } = makeMessageMockClient()
    await markConversationReadWithClient(client, 'pd-1', 'me')
    expect(calls).toContain('from(conversation_reads)')
    expect(calls).toContain('upsert(onConflict=playdate_id,profile_id)')
    const payload = payloads[0] as Record<string, unknown>
    expect(payload.playdate_id).toBe('pd-1')
    expect(payload.profile_id).toBe('me')
    // last_read_at is a fresh ISO timestamp (the cursor moves forward).
    expect(typeof payload.last_read_at).toBe('string')
    expect(new Date(payload.last_read_at as string).getTime()).not.toBeNaN()
  })

  it('propagates a failed upsert', async () => {
    const { client } = makeMessageMockClient({
      upsertResult: { data: null, error: new Error('boom') },
    })
    await expect(markConversationReadWithClient(client, 'pd-1', 'me')).rejects.toThrow('boom')
  })
})
describe('applyReactionToggle (V15 ticket 08 — the optimistic count math)', () => {
  it('increments when the viewer reacts to an unreacted message', () => {
    const next = applyReactionToggle({ m1: { count: 2, mine: false, myKind: null } }, 'm1', true)
    expect(next.m1).toEqual({ count: 3, mine: true, myKind: 'like' })
  })

  it('decrements when the viewer removes their own reaction', () => {
    const next = applyReactionToggle({ m1: { count: 3, mine: true, myKind: 'like' } }, 'm1', false)
    expect(next.m1).toEqual({ count: 2, mine: false, myKind: null })
  })

  it('floors the decrement at 0 (a stale count never renders -1)', () => {
    // The realtime stream already removed the last other reaction: the local
    // count is 0 but `mine` is still true. Un-reacting must clamp, not go
    // negative — a "-1" pill is a visible lie.
    const next = applyReactionToggle({ m1: { count: 0, mine: true, myKind: 'like' } }, 'm1', false)
    expect(next.m1).toEqual({ count: 0, mine: false, myKind: null })
  })

  it('starts from 0/false for a message it has never seen', () => {
    const next = applyReactionToggle({}, 'm9', true)
    expect(next.m9).toEqual({ count: 1, mine: true, myKind: 'like' })
  })

  it('leaves every other message untouched (a per-message toggle)', () => {
    const before: Record<string, ReactionState> = { m1: { count: 1, mine: true, myKind: 'like' }, m2: { count: 4, mine: false, myKind: null } }
    const next = applyReactionToggle(before, 'm2', true)
    expect(next.m1).toEqual({ count: 1, mine: true, myKind: 'like' })
    expect(next.m2).toEqual({ count: 5, mine: true, myKind: 'like' })
  })

  it('does not mutate the map it is given (React state discipline)', () => {
    const before: Record<string, ReactionState> = { m1: { count: 1, mine: false, myKind: null } }
    const snapshot = JSON.stringify(before)
    applyReactionToggle(before, 'm1', true)
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('is its own inverse: toggle on then off returns to the start', () => {
    const start = { m1: { count: 2, mine: false, myKind: null } }
    const on = applyReactionToggle(start, 'm1', true)
    const off = applyReactionToggle(on, 'm1', false)
    expect(off.m1).toEqual(start.m1)
  })
})

/**
 * V21 t03: the generalised SET seam — one reaction per person per message, kind
 * is a mutable attribute. Set adds (count +1), replace-in-place holds the count,
 * remove decrements (floored at 0), and an unknown/absent state starts from
 * zero. The existing applyReactionToggle tests above are the proof that the
 * single-kind "like" behaviour is provably intact through the alias.
 */
describe('applyReactionSet (V21 t03 — set / replace / remove)', () => {
  it('sets a new reaction on an unreacted message (count + 1, mine, myKind)', () => {
    const next = applyReactionSet({ m1: { count: 2, mine: false, myKind: null } }, 'm1', 'love')
    expect(next.m1).toEqual({ count: 3, mine: true, myKind: 'love' })
  })

  it('replacing a DIFFERENT kind does NOT increment the count (in place)', () => {
    // The viewer already has 👍; switching to ❤️ must keep the count at 1.
    const next = applyReactionSet({ m1: { count: 1, mine: true, myKind: 'like' } }, 'm1', 'love')
    expect(next.m1).toEqual({ count: 1, mine: true, myKind: 'love' })
  })

  it('setting the SAME kind you already have is a no-op (count unchanged)', () => {
    const before: Record<string, ReactionState> = { m1: { count: 4, mine: true, myKind: 'laugh' } }
    const next = applyReactionSet(before, 'm1', 'laugh')
    expect(next.m1).toEqual({ count: 4, mine: true, myKind: 'laugh' })
  })

  it('removes the reaction (null) and decrements the count', () => {
    const next = applyReactionSet({ m1: { count: 3, mine: true, myKind: 'sad' } }, 'm1', null)
    expect(next.m1).toEqual({ count: 2, mine: false, myKind: null })
  })

  it('floors the removal at 0 (a stale count never renders -1)', () => {
    const next = applyReactionSet({ m1: { count: 0, mine: true, myKind: 'angry' } }, 'm1', null)
    expect(next.m1).toEqual({ count: 0, mine: false, myKind: null })
  })

  it('starts from 0/false/null for a message it has never seen', () => {
    const next = applyReactionSet({}, 'm9', 'wow')
    expect(next.m9).toEqual({ count: 1, mine: true, myKind: 'wow' })
  })

  it('leaves every other message untouched (a per-message set)', () => {
    const before: Record<string, ReactionState> = { m1: { count: 1, mine: true, myKind: 'like' }, m2: { count: 4, mine: false, myKind: null } }
    const next = applyReactionSet(before, 'm2', 'love')
    expect(next.m1).toEqual({ count: 1, mine: true, myKind: 'like' })
    expect(next.m2).toEqual({ count: 5, mine: true, myKind: 'love' })
  })

  it('does not mutate the map it is given (React state discipline)', () => {
    const before: Record<string, ReactionState> = { m1: { count: 1, mine: false, myKind: null } }
    const snapshot = JSON.stringify(before)
    applyReactionSet(before, 'm1', 'like')
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('set then remove returns to the start (the picker round trip)', () => {
    const start: Record<string, ReactionState> = { m1: { count: 2, mine: false, myKind: null } }
    const set = applyReactionSet(start, 'm1', 'love')
    const removed = applyReactionSet(set, 'm1', null)
    expect(removed.m1).toEqual({ count: 2, mine: false, myKind: null })
  })
})

/**
 * V21 t03: the six kinds + their icons are complete and match migration 0049's
 * CHECK constraint value list. This is the drift guard between SQL and TS — if
 * the SQL list ever changes, this assertion fails loudly rather than rendering
 * an unknown kind as nothing.
 *
 * inbox-messenger slice B: the map holds STROKED SVG PATHS now, not emoji
 * (`components/icons.REACTION_ICONS`), so "is it a real glyph?" is assertable
 * the same way `icons.test.ts` asserts the place-kind map: non-blank, carries a
 * drawing command, and no two kinds draw the same thing.
 */
describe('REACTION_KINDS + REACTION_ICONS (V21 t03 — completeness vs the 0049 CHECK)', () => {
  // The exact value list in 0049_message_reaction_kinds.sql's CHECK constraint.
  const SQL_CHECK_VALUES = ['like', 'love', 'laugh', 'wow', 'sad', 'angry']

  it('exports exactly the six pinned kinds, in order', () => {
    expect([...REACTION_KINDS]).toEqual(SQL_CHECK_VALUES)
  })

  it('has an icon for every kind (no missing key)', () => {
    for (const kind of REACTION_KINDS) {
      expect(REACTION_ICONS[kind]).toBeTruthy()
    }
  })

  it('has no icon keys beyond the six kinds (no orphan icon)', () => {
    const iconKeys = Object.keys(REACTION_ICONS)
    expect(iconKeys.sort()).toEqual([...SQL_CHECK_VALUES].sort())
  })

  it('every icon is a real, non-empty path — never a blank slot', () => {
    for (const kind of REACTION_KINDS) {
      const path = REACTION_ICONS[kind]
      expect(typeof path, `${kind} must map to a path string`).toBe('string')
      // A whitespace-only or empty `d` draws nothing, which is the "empty box"
      // an unknown kind must never render as.
      expect(path.trim().length, `${kind}'s path must not be blank`).toBeGreaterThan(0)
      // Every icon must at least move the pen; a bare `M` draws an invisible dot.
      expect(path, `${kind}'s path must contain a drawing command`).toMatch(/[MLCAQZmlcaqz]/)
    }
  })

  it('draws every kind with a DISTINCT path (no two kinds share an icon)', () => {
    const paths = REACTION_KINDS.map((kind) => REACTION_ICONS[kind])
    // Duplicates would make two reactions visually identical, so the picker
    // would claim a distinction it does not draw.
    expect(new Set(paths).size).toBe(paths.length)
  })
})

/**
 * V16 ticket 02: the founder read the react button at rest as "looks yellow /
 * already selected". The fill was already white at rest — the yellow was the
 * 👍 EMOJI, which paints its own colour and ignores the button's `color`. So
 * the rule being pinned here is: the rest state carries NO saturated styling,
 * and the glyph (an inline SVG now) inherits `currentColor`. The emoji is gone,
 * so this can be asserted as text.
 */
describe('reactionButtonClasses (V16 ticket 02 — rest must not read as selected)', () => {
  /** Every "active" signal the button is allowed to use, in one place. */
  const SATURATED = ['indigo', 'bg-indigo-600', 'text-white']

  it('rest state carries no saturated fill and no active text colour', () => {
    const rest = reactionButtonClasses(false)
    expect(rest).toContain('bg-white')
    expect(rest).toContain('text-slate-500')
    expect(rest).toContain('border-slate-300')
    for (const token of SATURATED) expect(rest).not.toContain(token)
  })

  it('pressed state carries the active indigo fill', () => {
    const pressed = reactionButtonClasses(true)
    expect(pressed).toContain('bg-indigo-600')
    expect(pressed).toContain('text-white')
    expect(pressed).not.toContain('bg-white')
  })

  it('the two states never share their fill (they cannot look alike)', () => {
    const rest = reactionButtonClasses(false).split(' ')
    const pressed = reactionButtonClasses(true).split(' ')
    const fill = (classes: string[]) => classes.filter((c) => c.startsWith('bg-'))
    expect(fill(rest)).not.toEqual(fill(pressed))
  })

  it('keeps the shared pill geometry in both states', () => {
    // Only the colour half may vary — the tap target must not change with state.
    for (const mine of [false, true]) {
      expect(reactionButtonClasses(mine)).toContain('h-7')
      expect(reactionButtonClasses(mine)).toContain('rounded-full')
    }
  })

  it('extends the TAP TARGET to the 44px floor without drawing a bigger pill', () => {
    // Measured 2026-10-05: the pill rendered 28px tall — under the 44px floor
    // DESIGN.md sets and ocr's tap-target rule enforces. The two numbers are now
    // split: the BUTTON is 44px, the pill it contains stays 28px drawn. Both
    // halves are pinned here so a later tidy-up cannot collapse them.
    // `-my-2` is what keeps the 44px box from becoming 44px of LAYOUT: without
    // it every message row grows 16px and the landscape geometry spec fails.
    expect(reactionHitAreaClasses()).toContain('h-11')
    expect(reactionHitAreaClasses()).toContain('-my-2')
    for (const mine of [false, true]) {
      expect(reactionButtonClasses(mine)).toContain('h-7')
      expect(reactionButtonClasses(mine)).not.toContain('h-11')
    }
  })
})

describe('reactionCountLabel (V16 ticket 02 — the pill is hidden at 0)', () => {
  it('renders nothing at 0 (no "👍 0" litter in a quiet thread)', () => {
    expect(reactionCountLabel(0)).toBeNull()
  })

  it('renders the number once anyone has reacted', () => {
    expect(reactionCountLabel(1)).toBe('1')
    expect(reactionCountLabel(3)).toBe('3')
    expect(reactionCountLabel(12)).toBe('12')
  })

  it('stays hidden for a negative count rather than rendering a lie', () => {
    // A stale realtime delivery must never paint "-1" (applyReactionToggle
    // floors the optimistic math for the same reason).
    expect(reactionCountLabel(-1)).toBeNull()
  })
})

describe('reactionStatesForMessagesWithClient (the thread\'s initial batch read)', () => {  it('groups rows into per-message counts and flags the viewer\'s own reaction', async () => {
    const { client, calls } = makeMessageMockClient({
      messageReactions: {
        data: [
          { message_id: 'm1', profile_id: 'me' },
          { message_id: 'm1', profile_id: 'other' },
          { message_id: 'm2', profile_id: 'other' },
        ],
        error: null,
      },
    })
    const states = await reactionStatesForMessagesWithClient(client, ['m1', 'm2', 'm3'], 'me')
    expect(calls).toContain('from(message_reactions)')
    // V21 t03: the wire now carries kind too. The mock rows have no `kind`
    // field (pre-0049 shape), so the viewer's own row defaults to 'like'.
    expect(states.m1).toEqual({ count: 2, mine: true, myKind: 'like' })
    expect(states.m2).toEqual({ count: 1, mine: false, myKind: null })
    // A message with no reactions is present and zeroed, never absent — the
    // UI reads `states[id]` directly and must not have to null-check.
    expect(states.m3).toEqual({ count: 0, mine: false, myKind: null })
  })

  it('records the viewer\'s own kind when their row carries one', async () => {
    const { client } = makeMessageMockClient({
      messageReactions: {
        data: [{ message_id: 'm1', profile_id: 'me', kind: 'love' }],
        error: null,
      },
    })
    const states = await reactionStatesForMessagesWithClient(client, ['m1'], 'me')
    expect(states.m1).toEqual({ count: 1, mine: true, myKind: 'love' })
  })

  it('reads the message_id + profile_id + kind columns only (the minimal wire)', async () => {
    const { client, calls } = makeMessageMockClient({ messageReactions: { data: [], error: null } })
    await reactionStatesForMessagesWithClient(client, ['m1'], 'me')
    expect(calls).toContain('select(message_id, profile_id, kind)')
    expect(calls).toContain('in(message_id, m1)')
  })

  it('issues ONE request for a whole thread (not one per message)', async () => {
    const { client, calls } = makeMessageMockClient({ messageReactions: { data: [], error: null } })
    await reactionStatesForMessagesWithClient(client, ['m1', 'm2', 'm3', 'm4'], 'me')
    expect(calls.filter((c) => c === 'from(message_reactions)').length).toBe(1)
  })

  it('returns every id zeroed without a wire call when the thread is empty', async () => {
    const { client, calls } = makeMessageMockClient()
    const states = await reactionStatesForMessagesWithClient(client, [], 'me')
    expect(states).toEqual({})
    expect(calls).not.toContain('from(message_reactions)')
  })

  it('propagates a failed read (the caller treats it as best-effort)', async () => {
    const { client } = makeMessageMockClient({
      messageReactions: { data: null, error: new Error('permission denied') },
    })
    await expect(
      reactionStatesForMessagesWithClient(client, ['m1'], 'me'),
    ).rejects.toThrow('permission denied')
  })

  it('chunks a very long thread so the id list never overflows one URL', async () => {
    const { client, calls } = makeMessageMockClient({ messageReactions: { data: [], error: null } })
    const ids = Array.from({ length: 250 }, (_, i) => `m${i}`)
    const states = await reactionStatesForMessagesWithClient(client, ids, 'me')
    // 250 ids at a chunk of 100 → three requests (100 + 100 + 50).
    expect(calls.filter((c) => c === 'from(message_reactions)').length).toBe(3)
    expect(Object.keys(states).length).toBe(250)
  })
})

describe('reconcileOptimisticMessage (V15 send fix — the duplicate-bubble guard)', () => {
  const row = (over: Partial<MessageRow>): MessageRow => ({
    id: 'real-1',
    playdate_id: '',
    sender_id: 'me',
    body: 'hello',
    created_at: '2026-09-21T00:00:00.000Z',
    ...over,
  })

  it('replaces the pending placeholder with the realtime row', () => {
    const pending = row({ id: 'pending-123', body: 'hello' })
    const incoming = row({ id: 'real-1', body: 'hello' })
    const next = reconcileOptimisticMessage([pending], incoming)
    expect(next).not.toBeNull()
    expect(next).toHaveLength(1)
    expect(next?.[0].id).toBe('real-1')
  })

  it('is null when the real row is already present (duplicate delivery)', () => {
    const existing = row({ id: 'real-1' })
    // No placeholder, and the id already exists: the caller must NOT append.
    expect(reconcileOptimisticMessage([existing], row({ id: 'real-1' }))).toBeNull()
  })

  it('is null for a genuinely new message (the caller appends)', () => {
    const other = row({ id: 'real-9', sender_id: 'them', body: 'hi back' })
    expect(reconcileOptimisticMessage([row({ id: 'real-1' })], other)).toBeNull()
  })

  it('does not match a pending row with a different body', () => {
    const pending = row({ id: 'pending-1', body: 'first' })
    const incoming = row({ id: 'real-2', body: 'second' })
    expect(reconcileOptimisticMessage([pending], incoming)).toBeNull()
  })

  it('does not match a pending row from a different sender', () => {
    const pending = row({ id: 'pending-1', sender_id: 'them', body: 'hello' })
    const incoming = row({ id: 'real-2', sender_id: 'me', body: 'hello' })
    expect(reconcileOptimisticMessage([pending], incoming)).toBeNull()
  })

  it('keeps surrounding messages and their order', () => {
    const messages = [
      row({ id: 'real-0', body: 'before' }),
      row({ id: 'pending-1', body: 'hello' }),
      row({ id: 'real-2', body: 'after' }),
    ]
    const next = reconcileOptimisticMessage(messages, row({ id: 'real-1', body: 'hello' }))
    expect(next?.map((m) => m.id)).toEqual(['real-0', 'real-1', 'real-2'])
  })

  it('does not mutate the array it is given (React state discipline)', () => {
    const messages = [row({ id: 'pending-1' })]
    const next = reconcileOptimisticMessage(messages, row({ id: 'real-1' }))
    expect(messages[0].id).toBe('pending-1')
    expect(next).not.toBe(messages)
  })
})

/**
 * V27 Inbox duplicate-render defect. The realtime INSERT handler appended the
 * `reconcileOptimisticMessage` result whenever it was null — but null means
 * BOTH "already present" and "append me". When the initial thread read already
 * had the row, the echo appended a second copy and the thread rendered two
 * `other-message` bubbles (reactions.e2e.ts:286 strict-mode violation).
 * `mergeIncomingMessage` is the unambiguous seam the handler now stores with.
 */
describe('mergeIncomingMessage (V27 — the duplicate-bubble guard)', () => {
  const row = (over: Partial<MessageRow>): MessageRow => ({
    id: 'real-1',
    playdate_id: 'p1',
    sender_id: 'them',
    body: 'React to me live',
    created_at: '2026-09-21T00:00:00.000Z',
    ...over,
  })

  it('leaves the array UNCHANGED when the real id is already present', () => {
    const existing = [row({ id: 'real-1' })]
    const next = mergeIncomingMessage(existing, row({ id: 'real-1' }))
    expect(next).toBe(existing)
    expect(next).toHaveLength(1)
  })

  it('appends a genuinely new message exactly once', () => {
    const next = mergeIncomingMessage([row({ id: 'real-0', body: 'before' })], row({ id: 'real-9' }))
    expect(next.map((m) => m.id)).toEqual(['real-0', 'real-9'])
  })

  it('replaces a matching pending placeholder rather than adding to it', () => {
    const pending = row({ id: 'pending-123', sender_id: 'me', body: 'hello' })
    const next = mergeIncomingMessage([pending], row({ id: 'real-1', sender_id: 'me', body: 'hello' }))
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('real-1')
  })

  it('is idempotent across a duplicate delivery of the same row', () => {
    const first = mergeIncomingMessage([], row({ id: 'real-1' }))
    const second = mergeIncomingMessage(first, row({ id: 'real-1' }))
    expect(second).toBe(first)
    expect(second).toHaveLength(1)
  })

  it('does not mutate the input array (React state discipline)', () => {
    const messages = [row({ id: 'real-0' })]
    const next = mergeIncomingMessage(messages, row({ id: 'real-9' }))
    expect(messages).toHaveLength(1)
    expect(next).not.toBe(messages)
  })
})

/**
 * V23 follow-up (migration 0051): the DM read cursor. `conversation_reads` is keyed by a
 * NOT NULL `playdate_id` (0042), so free-form DMs had no read position and the
 * inbox hardcoded `unreadCount: 0`. These pin the count logic and the cursor's
 * wire shape against `direct_conversation_reads`.
 */
describe('listDirectConversationsWithClient (V23 follow-up — the DM unread count)', () => {
  it('counts messages from the counterpart newer than the read cursor', async () => {
    const { client } = makeMessageMockClient({
      messages: {
        data: [
          {
            id: 'm2',
            sender_id: 'other',
            body: 'newest',
            created_at: '2026-09-12T12:00:00Z',
            sender: { display_name: 'Pat' },
          },
          {
            id: 'm1',
            sender_id: 'other',
            body: 'older',
            created_at: '2026-09-12T09:00:00Z',
            sender: { display_name: 'Pat' },
          },
        ],
        error: null,
      },
      directConversationReads: {
        data: [{ other_profile_id: 'other', last_read_at: '2026-09-12T10:00:00Z' }],
        error: null,
      },
    })
    const convs = await listDirectConversationsWithClient(client, 'me')
    expect(convs).toHaveLength(1)
    expect(convs[0].otherPartyId).toBe('other')
    expect(convs[0].otherPartyName).toBe('Pat')
    expect(convs[0].unreadCount).toBe(1)
    expect(convs[0].preview).toBe('newest')
  })

  it('counts every received message as unread when no cursor exists', async () => {
    const { client } = makeMessageMockClient({
      messages: {
        data: [
          {
            id: 'm2',
            sender_id: 'other',
            body: 'newest',
            created_at: '2026-09-12T12:00:00Z',
            sender: { display_name: 'Pat' },
          },
          {
            id: 'm1',
            sender_id: 'other',
            body: 'older',
            created_at: '2026-09-12T09:00:00Z',
            sender: { display_name: 'Pat' },
          },
        ],
        error: null,
      },
      directConversationReads: { data: [], error: null },
    })
    const convs = await listDirectConversationsWithClient(client, 'me')
    expect(convs[0].unreadCount).toBe(2)
  })

  it('reports 0 when the cursor is at or after the latest received message', async () => {
    const { client } = makeMessageMockClient({
      messages: {
        data: [
          {
            id: 'm1',
            sender_id: 'other',
            body: 'read',
            created_at: '2026-09-12T12:00:00Z',
            sender: { display_name: 'Pat' },
          },
        ],
        error: null,
      },
      directConversationReads: {
        data: [{ other_profile_id: 'other', last_read_at: '2026-09-12T13:00:00Z' }],
        error: null,
      },
    })
    const convs = await listDirectConversationsWithClient(client, 'me')
    expect(convs[0].unreadCount).toBe(0)
  })

  it('never counts the viewer\'s own sent messages as unread', async () => {
    const { client } = makeMessageMockClient({
      messages: {
        data: [
          {
            id: 'm1',
            sender_id: 'me',
            body: 'mine',
            created_at: '2026-09-12T11:00:00Z',
            sender: { display_name: 'Me' },
          },
        ],
        error: null,
      },
      messageRecipients: {
        data: [{ message_id: 'm1', profile_id: 'other', profile: { display_name: 'Pat' } }],
        error: null,
      },
      directConversationReads: { data: [], error: null },
    })
    const convs = await listDirectConversationsWithClient(client, 'me')
    expect(convs).toHaveLength(1)
    expect(convs[0].otherPartyId).toBe('other')
    expect(convs[0].otherPartyName).toBe('Pat')
    expect(convs[0].unreadCount).toBe(0)
  })

  it('collapses a counterpart who both sent and received into one row', async () => {
    const { client } = makeMessageMockClient({
      messages: {
        data: [
          {
            id: 'sent',
            sender_id: 'me',
            body: 'mine',
            created_at: '2026-09-12T12:00:00Z',
            sender: { display_name: 'Me' },
          },
          {
            id: 'recv',
            sender_id: 'other',
            body: 'theirs',
            created_at: '2026-09-12T11:00:00Z',
            sender: { display_name: 'Pat' },
          },
        ],
        error: null,
      },
      messageRecipients: {
        data: [{ message_id: 'sent', profile_id: 'other', profile: { display_name: 'Pat' } }],
        error: null,
      },
      directConversationReads: { data: [], error: null },
    })
    const convs = await listDirectConversationsWithClient(client, 'me')
    expect(convs).toHaveLength(1)
    expect(convs[0].otherPartyId).toBe('other')
    expect(convs[0].unreadCount).toBe(1)
    // The newest row (the one I sent) wins the preview.
    expect(convs[0].preview).toBe('mine')
  })

  it('reads the caller\'s DM cursors (own rows, the 0051 wire shape)', async () => {
    const { client, calls } = makeMessageMockClient({
      messages: { data: [], error: null },
      directConversationReads: { data: [], error: null },
    })
    await listDirectConversationsWithClient(client, 'me')
    expect(calls).toContain('from(direct_conversation_reads)')
    expect(calls).toContain('select(other_profile_id, last_read_at)')
    expect(calls).toContain('eq(profile_id, me)')
  })

  it('propagates a failed cursor read (pre-0051-apply 42703 discipline)', async () => {
    const { client } = makeMessageMockClient({
      messages: { data: [], error: null },
      directConversationReads: { data: null, error: new Error('42703: relation does not exist') },
    })
    await expect(listDirectConversationsWithClient(client, 'me')).rejects.toThrow('42703')
  })
})

describe('markDirectConversationReadWithClient (the DM read-cursor upsert)', () => {
  it('upserts the cursor with the composite-PK onConflict', async () => {
    const { client, calls, payloads } = makeMessageMockClient()
    await markDirectConversationReadWithClient(client, 'other', 'me')
    expect(calls).toContain('from(direct_conversation_reads)')
    expect(calls).toContain('upsert(onConflict=profile_id,other_profile_id)')
    const payload = payloads[0] as Record<string, unknown>
    expect(payload.profile_id).toBe('me')
    expect(payload.other_profile_id).toBe('other')
    expect(typeof payload.last_read_at).toBe('string')
    expect(new Date(payload.last_read_at as string).getTime()).not.toBeNaN()
  })

  it('propagates a failed upsert', async () => {
    const { client } = makeMessageMockClient({
      upsertResult: { data: null, error: new Error('boom') },
    })
    await expect(markDirectConversationReadWithClient(client, 'other', 'me')).rejects.toThrow('boom')
  })
})

/**
 * V23 follow-up repair: the DM thread's read seam was SENDER-ONLY. It asked
 * `message_recipients` for the OTHER party's rows, which the SELECT policy
 * (`profile_id = auth.uid() OR is_message_sender`) hides from a recipient — so
 * a DM the other person started opened as "No messages yet" on my side. These
 * pin the caller's own-row scoping; the recipient-side dm e2e proves it live.
 */
describe('queryDirectMessagesWithClient (the DM thread — recipient side)', () => {
  it("reads the caller's own participation rows, not the counterpart's", async () => {
    const { client, calls } = makeMessageMockClient({
      messageRecipients: { data: [{ message_id: 'm1' }], error: null },
      messages: {
        data: [
          {
            id: 'm1',
            playdate_id: null,
            sender_id: 'other',
            body: 'theirs',
            created_at: '2026-09-12T11:00:00Z',
            recipient_hint: 'me',
          },
        ],
        error: null,
      },
    })
    const rows = await queryDirectMessagesWithClient(client, 'other', 'me')
    expect(calls).toContain('eq(profile_id, me)')
    expect(calls).not.toContain('eq(profile_id, other)')
    expect(rows).toHaveLength(1)
    expect(rows[0].sender_id).toBe('other')
    expect(rows[0].body).toBe('theirs')
  })

  it('returns [] before querying messages when the caller has no rows yet', async () => {
    const { client, calls } = makeMessageMockClient({
      messageRecipients: { data: [], error: null },
    })
    const rows = await queryDirectMessagesWithClient(client, 'other', 'me')
    expect(rows).toEqual([])
    expect(calls.some((c) => c.startsWith('from(messages)'))).toBe(false)
  })

  it('propagates a failed participation read', async () => {
    const { client } = makeMessageMockClient({
      messageRecipients: { data: null, error: new Error('42501: rls') },
    })
    await expect(queryDirectMessagesWithClient(client, 'other', 'me')).rejects.toThrow('42501')
  })
})
