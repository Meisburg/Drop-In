import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  deletePlaydateWithClient,
  listPlaydateKidIdsWithClient,
  updatePlaydateWithClient,
} from './db'

/**
 * The V8 ticket-05 writes (post edit + delete) against a recording mock
 * client (the db-v3/db-v4 pattern — importing db.ts runs its module-scope
 * Supabase client creation, which reads the repo .env; the db-v2 note).
 *
 * Two pins are asserted here rather than by the live specs:
 *  - NO `.select()` on either write. The 42501 lesson: a write whose row the
 *    SELECT policy excludes 403s on the read-back, so the edit + delete are
 *    plain chains and the caller re-reads / navigates instead. The mock
 *    records every chain call, so a future `.select()` added "to get the row
 *    back" fails here with the reason attached.
 *  - the edit payload carries ONLY the editable fields: no `status` (an edit
 *    never cancels or un-cancels a post) and no `age_hint` (the form no
 *    longer renders it — the stored value must survive an edit).
 */
interface Recorded {
  client: SupabaseClient
  calls: string[]
  payloads: unknown[]
}

function makeWriteMockClient(
  result: { data?: unknown; error?: unknown } = {},
): Recorded {
  const calls: string[] = []
  const payloads: unknown[] = []
  const builder = {
    update: (payload: unknown) => {
      calls.push('update')
      payloads.push(payload)
      return builder
    },
    delete: () => {
      calls.push('delete')
      return builder
    },
    select: (cols: string) => {
      calls.push(`select(${cols})`)
      return builder
    },
    eq: (col: string, value: unknown) => {
      calls.push(`eq(${col}, ${String(value)})`)
      return builder
    },
    then: (onfulfilled?: (value: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(
        onfulfilled,
      ),
  }
  const client = {
    from: (table: string) => {
      calls.push(`from(${table})`)
      return builder
    },
  } as unknown as SupabaseClient
  return { client, calls, payloads }
}

const INPUT = {
  title: 'Playground time',
  place: 'Green Lake playground',
  neighborhoodId: 'hood-1',
  startsAt: '2026-09-12T22:30:00.000Z',
  endsAt: '2026-09-13T00:00:00.000Z',
  details: 'Bring snacks',
  address: '7200 4th Ave NE',
}

describe('updatePlaydateWithClient (V8 ticket 05)', () => {
  it('writes exactly the editable fields, scoped to the row, with no RETURNING', async () => {
    const { client, calls, payloads } = makeWriteMockClient()
    await updatePlaydateWithClient(client, 'pd-1', INPUT)
    expect(calls).toEqual(['from(playdates)', 'update', 'eq(id, pd-1)'])
    expect(payloads[0]).toEqual({
      title: 'Playground time',
      place: 'Green Lake playground',
      neighborhood_id: 'hood-1',
      starts_at: '2026-09-12T22:30:00.000Z',
      ends_at: '2026-09-13T00:00:00.000Z',
      details: 'Bring snacks',
      address: '7200 4th Ave NE',
    })
  })

  it('never touches status or age_hint (an edit is not a cancellation, and the hint survives)', async () => {
    const { client, payloads } = makeWriteMockClient()
    await updatePlaydateWithClient(client, 'pd-1', INPUT)
    const payload = payloads[0] as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual([
      'address',
      'details',
      'ends_at',
      'neighborhood_id',
      'place',
      'starts_at',
      'title',
    ])
    expect('status' in payload).toBe(false)
    expect('age_hint' in payload).toBe(false)
  })

  it('carries the empty → null rules through (clearing details and the address)', async () => {
    const { client, payloads } = makeWriteMockClient()
    await updatePlaydateWithClient(client, 'pd-1', { ...INPUT, details: null, address: null })
    expect(payloads[0]).toMatchObject({ details: null, address: null })
  })

  it('throws on a write error (the page renders its designed error line)', async () => {
    const { client } = makeWriteMockClient({
      error: { code: '42501', message: 'new row violates row-level security policy' },
    })
    await expect(updatePlaydateWithClient(client, 'pd-1', INPUT)).rejects.toThrow(
      'new row violates row-level security policy',
    )
  })
})

describe('deletePlaydateWithClient (V8 ticket 05)', () => {
  it('is a plain delete of the one row, with no RETURNING and no child cleanup', async () => {
    const { client, calls } = makeWriteMockClient()
    await deletePlaydateWithClient(client, 'pd-1')
    // One table, one row: the cascades (going_pings, comments, playdate_kids,
    // ping_kids) are the DATABASE's job — no hand-delete of children here.
    expect(calls).toEqual(['from(playdates)', 'delete', 'eq(id, pd-1)'])
  })

  it('throws on a delete error (the confirmation dialog stays open)', async () => {
    const { client } = makeWriteMockClient({
      error: { code: '42501', message: 'permission denied' },
    })
    await expect(deletePlaydateWithClient(client, 'pd-1')).rejects.toThrow('permission denied')
  })
})

describe('listPlaydateKidIdsWithClient (V8 ticket 05, the edit form’s kids prefill)', () => {
  it('reads kid_id — not the playdate_kids row id — for the post', async () => {
    const { client, calls } = makeWriteMockClient({
      data: [{ kid_id: 'kid-1' }, { kid_id: 'kid-2' }],
    })
    await expect(listPlaydateKidIdsWithClient(client, 'pd-1')).resolves.toEqual(['kid-1', 'kid-2'])
    expect(calls).toEqual(['from(playdate_kids)', 'select(kid_id)', 'eq(playdate_id, pd-1)'])
  })

  it('drops a row with no kid_id instead of handing the picker a null', async () => {
    const { client } = makeWriteMockClient({ data: [{ kid_id: null }, { kid_id: 'kid-1' }] })
    await expect(listPlaydateKidIdsWithClient(client, 'pd-1')).resolves.toEqual(['kid-1'])
  })

  it('throws pre-0022-apply (the caller catches it into [] and skips the kids write)', async () => {
    const { client } = makeWriteMockClient({
      error: { code: '42P01', message: 'relation "playdate_kids" does not exist' },
    })
    await expect(listPlaydateKidIdsWithClient(client, 'pd-1')).rejects.toThrow(
      'relation "playdate_kids" does not exist',
    )
  })
})
