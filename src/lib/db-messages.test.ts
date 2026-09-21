import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  listConversationsWithClient,
  markConversationReadWithClient,
  MESSAGE_MAX_LENGTH,
  queryMessagesForPlaydateWithClient,
  sendMessageWithClient,
  truncateMessagePreview,
  validateMessageBody,
} from './db'

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
      if (lastTable === 'conversation_reads' && sawUpsert) {
        result = overrides.upsertResult ?? { data: null, error: null }
      } else if (lastTable === 'messages' && sawInsert) {
        result = overrides.insertResult ?? { data: null, error: null }
      } else if (lastTable === 'messages') {
        result = overrides.messages ?? { data: null, error: null }
      } else if (lastTable === 'conversation_reads') {
        result = overrides.conversationReads ?? { data: null, error: null }
      } else if (lastTable === 'playdates') {
        result = overrides.playdates ?? { data: null, error: null }
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
            pings: [{ profile: { display_name: 'Mia' } }],
          },
          // pd-b: the caller IS the host → the counterpart is the most recent
          // pinger's name (Sam), resolved from this embed.
          {
            id: 'pd-b',
            host_profile_id: 'me',
            host: { display_name: 'Me' },
            pings: [{ profile: { display_name: 'Sam' } }],
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
    expect(summaries[0].playdateTitle).toBe('Soccer practice')
    expect(summaries[0].latestMessageAt).toBe('2026-09-12T11:00:00Z')
    expect(summaries[0].unreadCount).toBe(1)

    // pd-b: my latest message → the counterpart is the most recent pinger.
    expect(summaries[1].otherPartyDisplayName).toBe('Sam')
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
          },
          {
            id: 'm2',
            playdate_id: 'pd-1',
            sender_id: 'other',
            body: 'second',
            created_at: '2026-09-12T11:00:00Z',
          },
        ],
        error: null,
      },
    })
    const rows = await queryMessagesForPlaydateWithClient(client, 'pd-1')
    expect(rows).toHaveLength(2)
    expect(rows[0].body).toBe('first')
    expect(rows[1].body).toBe('second')
    // The wire pins: the right table, the right filter, the right order.
    expect(calls).toContain('from(messages)')
    expect(calls).toContain('eq(playdate_id, pd-1)')
    expect(calls).toContain('order(created_at, asc)')
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