import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getMyReviewWithClient, saveReviewWithClient } from './db'

/**
 * The V24 ticket-06 review read/write paths against a recording mock client
 * (the db-v3/db-v5 pattern — importing db.ts runs its module-scope Supabase
 * client creation, which reads the repo .env; the db-v2 note).
 *
 * Two pins are asserted here rather than by the live specs:
 *  - the READ is scoped to (place_id, author_profile_id) with limit(1): one
 *    parent's own review for one place, never a wall-wide fetch.
 *  - the WRITE is an UPSERT on the composite PK (`place_id,author_profile_id`),
 *    the saveParentCard pattern: one statement covers the first write AND every
 *    later edit, so a second submission edits rather than duplicates. A blank
 *    body is stored as NULL (a stars-only review is legal — 0052 pin c).
 */
interface Recorded {
  client: SupabaseClient
  calls: string[]
  payloads: unknown[]
}

function makeReviewsMockClient(
  rows: unknown[] = [],
  error?: { code: string; message: string },
): Recorded {
  const calls: string[] = []
  const payloads: unknown[] = []
  const builder = {
    select: (cols: string) => {
      calls.push(`select(${cols})`)
      return builder
    },
    upsert: (payload: unknown, opts?: { onConflict?: string }) => {
      calls.push(`upsert(onConflict=${opts?.onConflict ?? ''})`)
      payloads.push(payload)
      return builder
    },
    eq: (col: string, value: unknown) => {
      calls.push(`eq(${col}, ${String(value)})`)
      return builder
    },
    limit: (n: number) => {
      calls.push(`limit(${n})`)
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
      if (table !== 'reviews') throw new Error(`unexpected table: ${table}`)
      calls.push('from(reviews)')
      return builder
    },
  } as unknown as SupabaseClient
  return { client, calls, payloads }
}

describe('getMyReviewWithClient (mocked supabase client, V24 ticket 06)', () => {
  it('reads exactly the caller\'s own row, scoped to (place_id, author_profile_id)', async () => {
    const { client, calls } = makeReviewsMockClient()
    await getMyReviewWithClient(client, 'profile-1', 'place-1')
    expect(calls).toEqual([
      'from(reviews)',
      'select(place_id, author_profile_id, score, body, created_at, updated_at)',
      'eq(place_id, place-1)',
      'eq(author_profile_id, profile-1)',
      'limit(1)',
    ])
  })

  it('returns null (not []) when the parent has not reviewed yet', async () => {
    const { client } = makeReviewsMockClient([])
    expect(await getMyReviewWithClient(client, 'profile-1', 'place-1')).toBeNull()
  })

  it('returns the row when one exists', async () => {
    const row = {
      place_id: 'place-1',
      author_profile_id: 'profile-1',
      score: 4,
      body: 'Great splash pad.',
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
    }
    const { client } = makeReviewsMockClient([row])
    expect(await getMyReviewWithClient(client, 'profile-1', 'place-1')).toEqual(row)
  })

  it('throws when the query fails (pre-0052-apply PGRST205)', async () => {
    const { client } = makeReviewsMockClient([], {
      code: 'PGRST205',
      message: 'Could not find the table \'public.reviews\' in the schema cache',
    })
    await expect(getMyReviewWithClient(client, 'profile-1', 'place-1')).rejects.toThrow(
      'Could not find the table',
    )
  })
})

describe('saveReviewWithClient (mocked supabase client, V24 ticket 06)', () => {
  it('upserts on the composite PK (one statement covers insert AND edit)', async () => {
    const { client, calls, payloads } = makeReviewsMockClient()
    await saveReviewWithClient(client, 'profile-1', 'place-1', 4, 'Great splash pad.')
    expect(calls).toEqual(['from(reviews)', 'upsert(onConflict=place_id,author_profile_id)'])
    const payload = payloads[0] as Record<string, unknown>
    expect(payload.place_id).toBe('place-1')
    expect(payload.author_profile_id).toBe('profile-1')
    expect(payload.score).toBe(4)
    expect(payload.body).toBe('Great splash pad.')
    // updated_at is stamped client-side (0052 ships no trigger — pin g).
    expect(typeof payload.updated_at).toBe('string')
  })

  it('stores a blank body as NULL (a stars-only review is legal)', async () => {
    const { client, payloads } = makeReviewsMockClient()
    await saveReviewWithClient(client, 'profile-1', 'place-1', 3, '   ')
    const payload = payloads[0] as Record<string, unknown>
    expect(payload.body).toBeNull()
  })

  it('trims the body before storing (the validators\' trim-then-measure discipline)', async () => {
    const { client, payloads } = makeReviewsMockClient()
    await saveReviewWithClient(client, 'profile-1', 'place-1', 5, '  Bring snacks  ')
    const payload = payloads[0] as Record<string, unknown>
    expect(payload.body).toBe('Bring snacks')
  })

  it('passes a null body through as NULL', async () => {
    const { client, payloads } = makeReviewsMockClient()
    await saveReviewWithClient(client, 'profile-1', 'place-1', 2, null)
    const payload = payloads[0] as Record<string, unknown>
    expect(payload.body).toBeNull()
  })

  it('throws when the upsert fails', async () => {
    const { client } = makeReviewsMockClient([], {
      code: 'PGRST205',
      message: 'Could not find the table \'public.reviews\' in the schema cache',
    })
    await expect(
      saveReviewWithClient(client, 'profile-1', 'place-1', 4, null),
    ).rejects.toThrow('Could not find the table')
  })
})