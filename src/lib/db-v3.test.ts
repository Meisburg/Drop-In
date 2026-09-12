/**
 * Unit tests for the V3 ticket-07 injected-client going_pings query in
 * db.ts (listPingsForPostsWithClient) + ticket 06's listMyPingPostIdsWithClient
 * (house TDD hygiene — both were untested; the Supabase-facing round-trips
 * around the pure helpers are covered by the e2e specs). The mock client
 * records the filter chain (the makeFeedMockClient style in feed.test.ts)
 * so the FK-hint pin + the created_at order are asserted without a DB.
 *
 * Note: importing db.ts runs its module-scope Supabase client creation,
 * which reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from the repo
 * .env (Vitest inherits Vite's env loading). The gate runs in this repo,
 * where .env is present (the db-v2.test.ts note).
 */
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listMyPingPostIdsWithClient, listPingsForPostsWithClient, updateKidWithClient } from './db'

/** A going_pings row as the (loose) select returns it (the profile embed). */
interface PingRowFixture {
  playdate_id: string | null
  created_at: string
  profile: { avatar_url: string | null; display_name: string } | null
}

/**
 * Minimal mock of the client surface the going_pings queries use:
 * from('going_pings') returns a recording query builder — every filter
 * call (.select, .in, .eq, .order) is recorded, in order, so tests can
 * assert the FK-hint pin (PGRST201 lesson) and the created_at order.
 * `rows` is the (mocked) select result; `error` models the query
 * failing (pre-0020-apply 42703: the created_at column is missing).
 */
function makeGoingPingsMockClient(
  rows: unknown[] = [],
  error?: { code: string; message: string },
): { client: SupabaseClient; filters: string[] } {
  const filters: string[] = []
  const builder = {
    select: (cols: string) => {
      filters.push(`select(${cols})`)
      return builder
    },
    in: (col: string, values: string[]) => {
      filters.push(`in(${col}, ${values.join(',')})`)
      return builder
    },
    eq: (col: string, value: unknown) => {
      filters.push(`eq(${col}, ${String(value)})`)
      return builder
    },
    order: (col: string, opts: { ascending: boolean }) => {
      filters.push(`order(${col}, ${opts.ascending})`)
      return builder
    },
    then: (onfulfilled?: (value: { data: unknown; error: unknown }) => unknown) => {
      const err =
        error === undefined
          ? null
          : Object.assign(new Error(error.message), { code: error.code })
      return Promise.resolve({ data: rows, error: err }).then(onfulfilled)
    },
  }
  const client = {
    from: (table: string) => {
      if (table !== 'going_pings') throw new Error(`unexpected table: ${table}`)
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, filters }
}

describe('listPingsForPostsWithClient (mocked supabase client, V3 ticket 07)', () => {
  it('returns [] for empty postIds without issuing a query', async () => {
    const { client, filters } = makeGoingPingsMockClient()
    expect(await listPingsForPostsWithClient(client, [])).toEqual([])
    expect(filters).toEqual([])
  })

  it('maps the rows (playdateId + the pinger embed) in the query\'s created_at order', async () => {
    const rows: PingRowFixture[] = [
      {
        playdate_id: 'pd-1',
        created_at: '2026-09-09T12:00:00Z',
        profile: { avatar_url: 'https://x/a.jpg', display_name: 'sam' },
      },
      {
        playdate_id: 'pd-2',
        created_at: '2026-09-09T12:05:00Z',
        profile: { avatar_url: null, display_name: 'rita' },
      },
    ]
    const { client, filters } = makeGoingPingsMockClient(rows)
    const result = await listPingsForPostsWithClient(client, ['pd-1', 'pd-2'])
    expect(result).toEqual([
      {
        playdateId: 'pd-1',
        avatarUrl: 'https://x/a.jpg',
        displayName: 'sam',
        createdAt: '2026-09-09T12:00:00Z',
      },
      {
        playdateId: 'pd-2',
        avatarUrl: null,
        displayName: 'rita',
        createdAt: '2026-09-09T12:05:00Z',
      },
    ])
    expect(filters).toContain('in(playdate_id, pd-1,pd-2)')
    expect(filters).toContain('order(created_at, true)')
  })

  it('pins the profiles embed to the FK hint (PGRST201 — two playdates→profiles paths exist)', async () => {
    const { client, filters } = makeGoingPingsMockClient()
    await listPingsForPostsWithClient(client, ['pd-1'])
    expect(filters[0]).toContain('profiles!going_pings_profile_id_fkey')
    expect(filters[0]).toContain('avatar_url, display_name')
  })

  it('skips rows with a missing playdate_id or a vanished pinger profile', async () => {
    const rows: PingRowFixture[] = [
      { playdate_id: null, created_at: 'x', profile: { avatar_url: null, display_name: 'ghost' } },
      { playdate_id: 'pd-1', created_at: 'x', profile: null },
      { playdate_id: 'pd-1', created_at: 'x', profile: { avatar_url: null, display_name: 'ok' } },
    ]
    const { client } = makeGoingPingsMockClient(rows)
    expect(await listPingsForPostsWithClient(client, ['pd-1'])).toEqual([
      { playdateId: 'pd-1', avatarUrl: null, displayName: 'ok', createdAt: 'x' },
    ])
  })

  it('throws on a query error (pre-0020-apply 42703 — the caller degrades to no lines)', async () => {
    const { client } = makeGoingPingsMockClient([], {
      code: '42703',
      message: 'column "created_at" does not exist',
    })
    await expect(listPingsForPostsWithClient(client, ['pd-1'])).rejects.toThrow(
      'does not exist',
    )
  })
})

describe('listMyPingPostIdsWithClient (mocked supabase client, V3 ticket 06)', () => {
  it('returns the set of playdate ids the profile has pinged', async () => {
    const rows = [{ playdate_id: 'pd-2' }, { playdate_id: 'pd-1' }]
    const { client, filters } = makeGoingPingsMockClient(rows)
    const ids = await listMyPingPostIdsWithClient(client, 'u-1')
    expect([...ids].sort()).toEqual(['pd-1', 'pd-2'])
    expect(filters).toContain('eq(profile_id, u-1)')
  })

  it('skips null playdate_id rows', async () => {
    const rows = [{ playdate_id: null }, { playdate_id: 'pd-1' }]
    const { client } = makeGoingPingsMockClient(rows)
    const ids = await listMyPingPostIdsWithClient(client, 'u-1')
    expect(ids).toContain('pd-1')
    expect(ids.size).toBe(1)
  })

  it('returns an empty set when the profile has no pings', async () => {
    const { client } = makeGoingPingsMockClient([])
    expect(await listMyPingPostIdsWithClient(client, 'u-1')).toEqual(new Set())
  })

  it('throws on a query error', async () => {
    const { client } = makeGoingPingsMockClient([], {
      code: '42703',
      message: 'column "profile_id" does not exist',
    })
    await expect(listMyPingPostIdsWithClient(client, 'u-1')).rejects.toThrow('does not exist')
  })
})

/**
 * V8 ticket 10: the in-place kid row edit (name + age) on the same injected-
 * client writer the likes save already used. The mock records the payload, so
 * the pins are: only the provided fields go on the wire, the name is trimmed,
 * each field validates on its own (the row editor can change one or both), and
 * an empty patch issues NO write at all.
 */
function makeKidPatchMockClient(): {
  client: SupabaseClient
  calls: Array<{ table: string; id: string; patch: Record<string, unknown> }>
} {
  const calls: Array<{ table: string; id: string; patch: Record<string, unknown> }> = []
  const client = {
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, value: unknown) => {
          calls.push({ table, id: String(value), patch })
          return Promise.resolve({ data: null, error: null })
        },
      }),
    }),
  }
  return { client: client as unknown as SupabaseClient, calls }
}

describe('updateKidWithClient (mocked supabase client, V8 ticket 10)', () => {
  it('writes the in-place name + age edit, trimmed, in one update', async () => {
    const { client, calls } = makeKidPatchMockClient()
    await updateKidWithClient(client, 'kid-1', {
      first_name: '  Bernadette  ',
      age: 7,
      likes: 'sharks',
    })
    expect(calls).toEqual([
      { table: 'kids', id: 'kid-1', patch: { first_name: 'Bernadette', age: 7, likes: 'sharks' } },
    ])
  })

  it('sends only the fields that were provided', async () => {
    const { client, calls } = makeKidPatchMockClient()
    await updateKidWithClient(client, 'kid-1', { age: 8 })
    expect(calls).toEqual([{ table: 'kids', id: 'kid-1', patch: { age: 8 } }])
  })

  it('writes NULL for a blank name — the name is optional (V9 ticket 05)', async () => {
    // THE RULE CHANGE: this test used to be "rejects an empty name before any
    // write" (`rejects.toThrow('first name')`, with `calls` empty). The ticket's
    // AC is the opposite — "the field is not required to save a kid" — so a
    // blank name is a legal edit that CLEARS the column (NULL, not '': a fake
    // name every reader would have to special-case). 0037 drops the 0011
    // `not null` that would otherwise refuse exactly this write with 23502.
    const { client, calls } = makeKidPatchMockClient()
    await updateKidWithClient(client, 'kid-1', { first_name: '   ' })
    expect(calls).toEqual([{ table: 'kids', id: 'kid-1', patch: { first_name: null } }])
  })

  it('rejects an out-of-range age before any write (NaN included — the blank field)', async () => {
    const { client, calls } = makeKidPatchMockClient()
    await expect(updateKidWithClient(client, 'kid-1', { age: NaN })).rejects.toThrow('0 to 17')
    await expect(updateKidWithClient(client, 'kid-1', { age: 18 })).rejects.toThrow('0 to 17')
    expect(calls).toEqual([])
  })

  it('an empty patch issues no write at all (a no-op save costs no round trip)', async () => {
    const { client, calls } = makeKidPatchMockClient()
    await updateKidWithClient(client, 'kid-1', {})
    expect(calls).toEqual([])
  })
})