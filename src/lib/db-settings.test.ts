import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  deleteMyAccountWithClient,
  exportMyDataWithClient,
  listMyBlocksWithClient,
  unblockProfileWithClient,
} from './db'

/**
 * The V27 settings db paths against a recording mock client (the db-v3/db-v5
 * pattern — importing db.ts runs its module-scope Supabase client creation,
 * which reads the repo .env).
 *
 * Pinned here rather than by the live specs because these are the shapes the
 * live specs cannot cheaply reach:
 *  - the blocked-families READ is the caller's own rows (`.eq(blocker...)`) then
 *    ONE batched profiles read;
 *  - the UNBLOCK deletes the exact pair, never a single id;
 *  - the EXPORT reads every table with the caller's own column and never
 *    silently returns a partial object (a table error throws);
 *  - the DELETE is one RPC, so the auth row and its cascades move together.
 */
interface Recorded {
  client: SupabaseClient
  calls: string[]
  rpcCalls: string[]
}

function makeMock(
  options: {
    rows?: Record<string, unknown[]>
    errorTable?: string
    rpcError?: { message: string; code?: string }
  } = {},
): Recorded {
  const calls: string[] = []
  const rpcCalls: string[] = []

  function resolve(table: string): { data: unknown; error: unknown } {
    if (options.errorTable === table) {
      return { data: null, error: new Error(`${table} is unavailable`) }
    }
    return { data: options.rows?.[table] ?? [], error: null }
  }

  function builder(table: string) {
    const self = {
      select: (cols: string) => {
        calls.push(`${table}.select(${cols})`)
        return self
      },
      eq: (col: string, value: unknown) => {
        calls.push(`${table}.eq(${col}, ${String(value)})`)
        return self
      },
      in: (col: string, values: unknown[]) => {
        calls.push(`${table}.in(${col}, ${values.length})`)
        return self
      },
      delete: () => {
        calls.push(`${table}.delete()`)
        return self
      },
      maybeSingle: () => {
        const result = resolve(table)
        const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data
        return Promise.resolve({ data, error: result.error })
      },
      then: (onfulfilled?: (value: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve(resolve(table)).then(onfulfilled),
    }
    return self
  }

  const client = {
    from: (table: string) => {
      calls.push(`from(${table})`)
      return builder(table)
    },
    rpc: (fn: string) => {
      rpcCalls.push(fn)
      return Promise.resolve({ data: null, error: options.rpcError ?? null })
    },
  } as unknown as SupabaseClient

  return { client, calls, rpcCalls }
}

describe('listMyBlocksWithClient', () => {
  it('reads the caller\'s own block rows, then names them in one profiles read', async () => {
    const { client, calls } = makeMock({
      rows: {
        blocks: [{ blocked_profile_id: 'p1' }, { blocked_profile_id: 'p2' }],
        profiles: [{ id: 'p1', display_name: 'Ada', avatar_url: 'a.jpg' }],
      },
    })
    const blocked = await listMyBlocksWithClient(client, 'me')
    expect(calls).toEqual([
      'from(blocks)',
      'blocks.select(blocked_profile_id)',
      'blocks.eq(blocker_profile_id, me)',
      'from(profiles)',
      'profiles.select(id, display_name, avatar_url)',
      'profiles.in(id, 2)',
    ])
    expect(blocked).toEqual([
      { profileId: 'p1', displayName: 'Ada', avatarUrl: 'a.jpg' },
      { profileId: 'p2', displayName: null, avatarUrl: null },
    ])
  })

  it('does not touch profiles when there are no blocks', async () => {
    const { client, calls } = makeMock({ rows: { blocks: [] } })
    expect(await listMyBlocksWithClient(client, 'me')).toEqual([])
    expect(calls).toEqual([
      'from(blocks)',
      'blocks.select(blocked_profile_id)',
      'blocks.eq(blocker_profile_id, me)',
    ])
  })

  it('throws on a failed blocks read', async () => {
    const { client } = makeMock({ errorTable: 'blocks' })
    await expect(listMyBlocksWithClient(client, 'me')).rejects.toThrow('blocks is unavailable')
  })
})

describe('unblockProfileWithClient', () => {
  it('deletes the exact pair, never a single-id delete', async () => {
    const { client, calls } = makeMock()
    await unblockProfileWithClient(client, 'me', 'p1')
    expect(calls).toEqual([
      'from(blocks)',
      'blocks.delete()',
      'blocks.eq(blocker_profile_id, me)',
      'blocks.eq(blocked_profile_id, p1)',
    ])
  })
})

describe('exportMyDataWithClient', () => {
  it('reads every owned table with the caller\'s own column, and shapes the file', async () => {
    const { client, calls } = makeMock({
      rows: {
        kids: [{ id: 'k1' }],
        playdates: [{ id: 'd1' }],
        going_pings: [{ playdate_id: 'd1' }],
        follows: [{ id: 'f1' }],
        blocks: [{ blocked_profile_id: 'p1' }],
        comments: [{ id: 'c1' }],
        reviews: [{ place_id: 'pl1' }],
        profiles: [{ id: 'me', display_name: 'Me' }],
      },
    })
    const exported = await exportMyDataWithClient(client, 'me', '2026-09-27T00:00:00.000Z')
    expect(exported.exported_at).toBe('2026-09-27T00:00:00.000Z')
    expect(exported.profile).toEqual({ id: 'me', display_name: 'Me' })
    expect(exported.kids).toHaveLength(1)
    expect(exported.hosted_playdates).toHaveLength(1)
    expect(exported.going).toHaveLength(1)
    expect(exported.follows).toHaveLength(1)
    expect(exported.blocks).toHaveLength(1)
    expect(exported.comments).toHaveLength(1)
    expect(exported.reviews).toHaveLength(1)
    for (const column of [
      'kids.eq(profile_id, me)',
      'playdates.eq(host_profile_id, me)',
      'going_pings.eq(profile_id, me)',
      'follows.eq(follower_profile_id, me)',
      'blocks.eq(blocker_profile_id, me)',
      'comments.eq(author_profile_id, me)',
      'reviews.eq(author_profile_id, me)',
      'profiles.eq(id, me)',
    ]) {
      expect(calls).toContain(column)
    }
  })

  it('throws rather than returning a partial export', async () => {
    const { client } = makeMock({ errorTable: 'reviews' })
    await expect(
      exportMyDataWithClient(client, 'me', '2026-09-27T00:00:00.000Z'),
    ).rejects.toThrow('reviews is unavailable')
  })
})

describe('deleteMyAccountWithClient', () => {
  it('calls the one RPC', async () => {
    const { client, rpcCalls } = makeMock()
    await deleteMyAccountWithClient(client)
    expect(rpcCalls).toEqual(['delete_my_account'])
  })

  it('throws when the function is not applied yet', async () => {
    const { client } = makeMock({ rpcError: { message: 'Could not find the function' } })
    await expect(deleteMyAccountWithClient(client)).rejects.toThrow('Could not find the function')
  })
})
