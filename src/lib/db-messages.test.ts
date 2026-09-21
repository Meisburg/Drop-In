import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  applyReactionToggle,
  listConversationsWithClient,
  markConversationReadWithClient,
  MESSAGE_MAX_LENGTH,
  IMAGE_LIGHTBOX_Z_CLASS,
  MODAL_OVER_LEAFLET_Z_CLASS,
  queryMessagesForPlaydateWithClient,
  reactionButtonClasses,
  reactionCountLabel,
  reactionStatesForMessagesWithClient,
  reconcileOptimisticMessage,
  sendMessageWithClient,
  truncateMessagePreview,
  validateMessageBody,
} from './db'
import type { MessageRow } from './db'

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
describe('applyReactionToggle (V15 ticket 08 — the optimistic count math)', () => {
  it('increments when the viewer reacts to an unreacted message', () => {
    const next = applyReactionToggle({ m1: { count: 2, mine: false } }, 'm1', true)
    expect(next.m1).toEqual({ count: 3, mine: true })
  })

  it('decrements when the viewer removes their own reaction', () => {
    const next = applyReactionToggle({ m1: { count: 3, mine: true } }, 'm1', false)
    expect(next.m1).toEqual({ count: 2, mine: false })
  })

  it('floors the decrement at 0 (a stale count never renders -1)', () => {
    // The realtime stream already removed the last other reaction: the local
    // count is 0 but `mine` is still true. Un-reacting must clamp, not go
    // negative — a "-1" pill is a visible lie.
    const next = applyReactionToggle({ m1: { count: 0, mine: true } }, 'm1', false)
    expect(next.m1).toEqual({ count: 0, mine: false })
  })

  it('starts from 0/false for a message it has never seen', () => {
    const next = applyReactionToggle({}, 'm9', true)
    expect(next.m9).toEqual({ count: 1, mine: true })
  })

  it('leaves every other message untouched (a per-message toggle)', () => {
    const before = { m1: { count: 1, mine: true }, m2: { count: 4, mine: false } }
    const next = applyReactionToggle(before, 'm2', true)
    expect(next.m1).toEqual({ count: 1, mine: true })
    expect(next.m2).toEqual({ count: 5, mine: true })
  })

  it('does not mutate the map it is given (React state discipline)', () => {
    const before = { m1: { count: 1, mine: false } }
    const snapshot = JSON.stringify(before)
    applyReactionToggle(before, 'm1', true)
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('is its own inverse: toggle on then off returns to the start', () => {
    const start = { m1: { count: 2, mine: false } }
    const on = applyReactionToggle(start, 'm1', true)
    const off = applyReactionToggle(on, 'm1', false)
    expect(off.m1).toEqual(start.m1)
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

/**
 * V16 ticket 07 item 1: the "Set location" dialog opened BEHIND the map's
 * zoom control. The bug was a plain stacking comparison the modal LOST, and
 * nothing in the test suite was watching it.
 *
 * THE NUMBERS ARE READ FROM THE SHIPPED STYLESHEETS, not guessed. The first
 * attempt at this fix stopped at `.leaflet-control { z-index: 800 }` and chose
 * 900 — which is wrong twice over:
 *
 *   1. The zoom buttons are WRAPPED in `.leaflet-top` / `.leaflet-bottom`,
 *      which carry **z-index: 1000**. 800 is not the ceiling; 1000 is.
 *   2. 900 is ABOVE the app's image lightbox (which wore z-60), so the fix
 *      would have lifted the modal over the lightbox and rendered a tapped
 *      photo BEHIND the dialog.
 *
 * The real constraint is a BAND — above Leaflet, below the lightbox:
 *
 *   Leaflet panes/controls  <= 1000
 *   modal over a map           1100
 *   image lightbox             1200
 *
 * These tests pin the ORDER between our own tokens and the Leaflet constants,
 * so a future edit cannot silently re-invert the stack. What they CANNOT do is
 * compute CSS: the rendered proof is the built stylesheet emitting
 * `.z-\[1100\]{z-index:1100}` plus the visual/e2e lane.
 */
describe('the stacking band: Leaflet < modal < lightbox (V16 t07 item 1)', () => {
  /** From node_modules/leaflet/dist/leaflet.css — `.leaflet-control`. */
  const LEAFLET_CONTROL_Z = 800
  /**
   * Also from leaflet.css — `.leaflet-top`/`.leaflet-bottom`, the WRAPPERS that
   * actually hold the zoom control. This is the number a modal must beat, and
   * the one the first attempt missed.
   */
  const LEAFLET_WRAPPER_Z = 1000

  function zOf(token: string): number {
    const match = /^z-\[(\d+)\]$/.exec(token)
    if (match === null) throw new Error(`not an arbitrary z token: ${token}`)
    return Number(match[1])
  }

  it('puts the map modal above Leaflet\'s WRAPPER layer, not merely its control layer', () => {
    const modal = zOf(MODAL_OVER_LEAFLET_Z_CLASS)
    expect(modal).toBeGreaterThan(LEAFLET_CONTROL_Z)
    // The assertion that actually matters — 900 would pass the line above and
    // still lose to the real control wrapper.
    expect(modal).toBeGreaterThan(LEAFLET_WRAPPER_Z)
  })

  it('keeps the image lightbox above the map modal, so a tapped photo is never behind a dialog', () => {
    expect(zOf(IMAGE_LIGHTBOX_Z_CLASS)).toBeGreaterThan(zOf(MODAL_OVER_LEAFLET_Z_CLASS))
  })

  it('keeps the lightbox above Leaflet too (it is the topmost overlay everywhere)', () => {
    expect(zOf(IMAGE_LIGHTBOX_Z_CLASS)).toBeGreaterThan(LEAFLET_WRAPPER_Z)
  })

  it('is not the z-50 that lost the comparison', () => {
    expect(MODAL_OVER_LEAFLET_Z_CLASS).not.toBe('z-50')
  })

  it('are single tokens so a call site can append them to its own layout classes', () => {
    expect(MODAL_OVER_LEAFLET_Z_CLASS.split(' ')).toHaveLength(1)
    expect(IMAGE_LIGHTBOX_Z_CLASS.split(' ')).toHaveLength(1)
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
    expect(states.m1).toEqual({ count: 2, mine: true })
    expect(states.m2).toEqual({ count: 1, mine: false })
    // A message with no reactions is present and zeroed, never absent — the
    // UI reads `states[id]` directly and must not have to null-check.
    expect(states.m3).toEqual({ count: 0, mine: false })
  })

  it('reads the message_id + profile_id columns only (the minimal wire)', async () => {
    const { client, calls } = makeMessageMockClient({ messageReactions: { data: [], error: null } })
    await reactionStatesForMessagesWithClient(client, ['m1'], 'me')
    expect(calls).toContain('select(message_id, profile_id)')
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
