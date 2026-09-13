import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  deletePlaydateWithClient,
  kidAgesByPostForPostsWithClient,
  listPlaydateKidIdsWithClient,
  listPlaydateKidNamesWithClient,
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
  rpcResult: { data?: unknown; error?: unknown } = { data: null, error: null },
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
    in: (col: string, values: unknown[]) => {
      calls.push(`in(${col}, ${values.map(String).join('|')})`)
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
    // V9 ticket 10: the gated reads are RPCs, so the mock records the function
    // name and its arguments — the same "assert the wire, not the intent"
    // discipline the SELECT-string pins above use.
    rpc: (fn: string, args?: unknown) => {
      calls.push(`rpc(${fn}, ${JSON.stringify(args ?? {})})`)
      return {
        then: (onfulfilled?: (value: { data: unknown; error: unknown }) => unknown) =>
          Promise.resolve({
            data: rpcResult.data ?? null,
            error: rpcResult.error ?? null,
          }).then(onfulfilled),
      }
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

  it('writes NULL — never an empty string — when the neighbourhood is cleared (V9 ticket 01)', async () => {
    // The select's empty option used to be un-submittable: the validator
    // required a neighbourhood. It is a legal answer now (a post may carry
    // none), and '' is not a uuid — PostgREST would 22P02 before AND after
    // 0035 drops the NOT NULL.
    const { client, payloads } = makeWriteMockClient()
    await updatePlaydateWithClient(client, 'pd-1', { ...INPUT, neighborhoodId: '' })
    expect(payloads[0]).toMatchObject({ neighborhood_id: null })
    const again = makeWriteMockClient()
    await updatePlaydateWithClient(again.client, 'pd-1', { ...INPUT, neighborhoodId: '  ' })
    expect(again.payloads[0]).toMatchObject({ neighborhood_id: null })
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

describe('kidAgesByPostForPostsWithClient (V9 ticket 05, the feed\'s batched ages read; gated by ticket 10)', () => {
  /**
   * THE ONE ASSERTION V9 TICKET 10 CHANGES, quoted before and after.
   *
   * Before (V9 ticket 05 — the read ticket 05 shipped, correct while
   * `playdate_kids` was `using (true)`):
   *
   *   const { client, calls } = makeWriteMockClient({
   *     data: [
   *       { playdate_id: 'pd-1', kid: { age: 3 } },
   *       { playdate_id: 'pd-1', kid: { age: 6 } },
   *       { playdate_id: 'pd-2', kid: { age: 4 } },
   *     ],
   *   })
   *   const ages = await kidAgesByPostForPostsWithClient(client, ['pd-1', 'pd-2'])
   *   expect(ages).toEqual({ 'pd-1': [3, 6], 'pd-2': [4] })
   *   expect(calls).toEqual([
   *     'from(playdate_kids)',
   *     'select(playdate_id, kid:kids!playdate_kids_kid_id_fkey ( age ))',
   *     'in(playdate_id, pd-1|pd-2)',
   *   ])
   *
   * After: the read is the ages-only SECURITY DEFINER `kid_ages_for`
   * (migration 0040), because that same table read now runs under a narrowed
   * SELECT policy and is best-effort by contract — narrowing it without moving
   * the derivation would have blanked every card's ages line silently. The
   * RETURNED VALUE is unchanged for the same input (min/max are all the pure
   * seam reads), and the privacy pin gets STRONGER, not weaker: the payload is
   * two integers, so a name or a kid id is no longer merely "not selected" —
   * it never leaves the database.
   */
  it('is ONE gated call for every post, and the payload is the BOUNDS only — never a name, never a kid id', async () => {
    const { client, calls } = makeWriteMockClient(
      {},
      {
        data: [
          { playdate_id: 'pd-1', age_min: 3, age_max: 6 },
          { playdate_id: 'pd-2', age_min: 4, age_max: 4 },
        ],
      },
    )
    const ages = await kidAgesByPostForPostsWithClient(client, ['pd-1', 'pd-2'])
    // Same ranges the row-by-row read produced for ages [3, 6] and [4]: the
    // seam only ever consumes min and max (feed.ageBounds).
    expect(ages).toEqual({ 'pd-1': [3, 6], 'pd-2': [4] })
    expect(calls).toEqual(['rpc(kid_ages_for, {"p_ids":["pd-1","pd-2"]})'])
    for (const forbidden of ['first_name', 'kid_id', 'avatar_url', 'playdate_kids']) {
      expect(calls[0]).not.toContain(forbidden)
    }
  })

  it('is a no-op for an empty feed (no call at all)', async () => {
    const { client, calls } = makeWriteMockClient()
    await expect(kidAgesByPostForPostsWithClient(client, [])).resolves.toEqual({})
    expect(calls).toEqual([])
  })

  it('skips a row with a missing bound (never a NaN in the range)', async () => {
    const { client } = makeWriteMockClient(
      {},
      {
        data: [
          { playdate_id: 'pd-1', age_min: null, age_max: 6 },
          { playdate_id: 'pd-1', age_min: 5, age_max: null },
          { playdate_id: 'pd-2', age_min: 5, age_max: 5 },
        ],
      },
    )
    await expect(kidAgesByPostForPostsWithClient(client, ['pd-1', 'pd-2'])).resolves.toEqual({
      'pd-2': [5],
    })
  })

  it('THROWS when the function is absent (PGRST202) — there is no fallback path any more (F3)', async () => {
    // Review cycle 1, F3: the pre-0040 fallback to the legacy batched table
    // read is deleted. This is the pin that keeps it deleted. A PGRST202 on an
    // APPLIED project means the function was dropped, renamed or never created,
    // and the dangerous answer is the quiet one: the fallback read runs under
    // the narrowed policy, so a stranger got an empty ages line and nobody was
    // told. The read must now fail LOUDLY — the same posture as every other
    // read path in db.ts — and exactly ONE call is issued (no silent second
    // source of truth).
    const { client, calls } = makeWriteMockClient(
      { data: [{ playdate_id: 'pd-1', kid: { age: 3 } }] },
      {
        error: {
          code: 'PGRST202',
          message: 'Could not find the function public.kid_ages_for(p_ids) in the schema cache',
        },
      },
    )
    await expect(kidAgesByPostForPostsWithClient(client, ['pd-1'])).rejects.toThrow(
      'Could not find the function public.kid_ages_for(p_ids) in the schema cache',
    )
    expect(calls).toEqual(['rpc(kid_ages_for, {"p_ids":["pd-1"]})'])
  })

  it('throws on any other failure (the caller settles to {} — cards without an ages line, no crash)', async () => {
    const { client, calls } = makeWriteMockClient(
      {},
      { error: { code: '42501', message: 'permission denied for function kid_ages_for' } },
    )
    await expect(kidAgesByPostForPostsWithClient(client, ['pd-1'])).rejects.toThrow(
      'permission denied for function kid_ages_for',
    )
    // ONE call: a real failure never silently re-reads the table.
    expect(calls).toEqual(['rpc(kid_ages_for, {"p_ids":["pd-1"]})'])
  })
})

describe('listPlaydateKidNamesWithClient (V9 ticket 10, the gated "Kids coming" read)', () => {
  it('reads the gated RPC and maps kid_id + first_name + age, name-ordered', async () => {
    const { client, calls } = makeWriteMockClient(
      {},
      {
        data: [
          { kid_id: 'kid-2', first_name: 'Lily', age: 4 },
          { kid_id: 'kid-1', first_name: 'Bernie', age: 6 },
        ],
      },
    )
    await expect(listPlaydateKidNamesWithClient(client, 'pd-1')).resolves.toEqual([
      { id: 'kid-1', name: 'Bernie', age: 6 },
      { id: 'kid-2', name: 'Lily', age: 4 },
    ])
    expect(calls).toEqual(['rpc(get_playdate_kids, {"p_id":"pd-1"})'])
  })

  it('normalises a NULL first name to an empty string (never a null in the render) and drops a row with no kid id', async () => {
    const { client } = makeWriteMockClient(
      {},
      {
        data: [
          { kid_id: 'kid-1', first_name: null, age: 4 },
          { kid_id: null, first_name: 'Ghost', age: 5 },
        ],
      },
    )
    await expect(listPlaydateKidNamesWithClient(client, 'pd-1')).resolves.toEqual([
      { id: 'kid-1', name: '', age: 4 },
    ])
  })

  it('an empty array (the stranger\'s answer) is a RESULT, not an error — no fallback, no throw', async () => {
    const { client, calls } = makeWriteMockClient({}, { data: [] })
    await expect(listPlaydateKidNamesWithClient(client, 'pd-1')).resolves.toEqual([])
    expect(calls).toEqual(['rpc(get_playdate_kids, {"p_id":"pd-1"})'])
  })

  it('THROWS when the function is absent (PGRST202) and on any other error — no legacy embed read survives (F3)', async () => {
    // Review cycle 1, F3: the pre-0040 fallback (the `playdate_kids ⋈ kids`
    // embed with `id, kid:...`) is deleted, and this pin keeps it deleted. Both
    // failures must be LOUD and must issue exactly one call: a fallback here
    // would read the narrowed table and hand a stranger an empty "Kids coming"
    // line with no error anywhere.
    const absent = makeWriteMockClient(
      { data: [{ id: 'pk-1', kid: { first_name: 'Bernie', age: 6 } }] },
      {
        error: {
          code: 'PGRST202',
          message: 'Could not find the function public.get_playdate_kids in the schema cache',
        },
      },
    )
    await expect(listPlaydateKidNamesWithClient(absent.client, 'pd-1')).rejects.toThrow(
      'Could not find the function public.get_playdate_kids in the schema cache',
    )
    expect(absent.calls).toEqual(['rpc(get_playdate_kids, {"p_id":"pd-1"})'])

    const denied = makeWriteMockClient(
      {},
      { error: { code: '42501', message: 'permission denied for function get_playdate_kids' } },
    )
    await expect(listPlaydateKidNamesWithClient(denied.client, 'pd-1')).rejects.toThrow(
      'permission denied for function get_playdate_kids',
    )
    expect(denied.calls).toEqual(['rpc(get_playdate_kids, {"p_id":"pd-1"})'])
  })
})
