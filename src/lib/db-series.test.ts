/**
 * V8 ticket 06 — the weekly series' Supabase-facing writes (db.ts), against
 * recording mock clients (the db-v3/db-v4/db-v5 pattern: importing db.ts runs
 * its module-scope Supabase client creation, which reads the repo .env).
 *
 * Two pins are asserted here rather than by the live spec:
 *  - the series row is written with the WALL CLOCK rule (weekday +
 *    start_minutes + the IANA zone) and the host's own id — never a UTC
 *    instant, which would drift an hour at DST;
 *  - "Stop repeating" is a plain `active` flip with NO RETURNING and NO
 *    delete: the occurrences already generated are other families' plans and
 *    stay as ordinary posts (the pinned never-silently-delete rule).
 *
 * The pre-0028-apply red-by-design path is covered by the payload seam
 * (`seriesIdField` in series.test.ts: the `series_id` key is ABSENT for a
 * standalone post) and by the e2e spec (series creation fails with the
 * documented PGRST205 class and the page reports it, never crashes).
 */
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createPlaydateSeriesWithClient,
  setSeriesActiveWithClient,
} from './db'
import type { NewPlaydateSeriesInput } from './series'

interface Recorded {
  client: SupabaseClient
  calls: string[]
  payloads: unknown[]
}

/** A recording mock: every chain call in order + the write payloads. */
function makeMockClient(result: { data?: unknown; error?: unknown } = {}): Recorded {
  const calls: string[] = []
  const payloads: unknown[] = []
  const builder = {
    insert: (payload: unknown) => {
      calls.push('insert')
      payloads.push(payload)
      return builder
    },
    update: (payload: unknown) => {
      calls.push('update')
      payloads.push(payload)
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
    single: () => {
      calls.push('single')
      return builder
    },
    maybeSingle: () => {
      calls.push('maybeSingle')
      return builder
    },
    then: (onfulfilled?: (value: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(onfulfilled),
  }
  const client = {
    from: (table: string) => {
      calls.push(`from(${table})`)
      return builder
    },
    rpc: (name: string, args: unknown) => {
      calls.push(`rpc(${name})`)
      payloads.push(args)
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
    },
  } as unknown as SupabaseClient
  return { client, calls, payloads }
}

const INPUT: NewPlaydateSeriesInput = {
  title: 'Green Lake, Saturdays',
  place: 'Green Lake playground',
  address: '7200 4th Ave NE',
  details: 'Bring scooters',
  neighborhoodId: 'hood-1',
  weekday: 6,
  startMinutes: 600,
  durationMinutes: 120,
  timezone: 'America/Los_Angeles',
}

describe('createPlaydateSeriesWithClient (V8 ticket 06)', () => {
  it('writes the wall-clock rule + the IANA zone as the host, with the RETURNING read-back', async () => {
    const { client, calls, payloads } = makeMockClient({ data: { id: 'series-1' } })
    await createPlaydateSeriesWithClient(client, 'user-1', INPUT)
    expect(calls).toEqual([
      'from(playdate_series)',
      'insert',
      'select(undefined)',
      'single',
    ])
    expect(payloads[0]).toEqual({
      host_profile_id: 'user-1',
      title: 'Green Lake, Saturdays',
      place: 'Green Lake playground',
      address: '7200 4th Ave NE',
      details: 'Bring scooters',
      neighborhood_id: 'hood-1',
      weekday: 6,
      start_minutes: 600,
      duration_minutes: 120,
      timezone: 'America/Los_Angeles',
    })
  })

  it('never sends a UTC instant for the meetup time (the DST pin)', async () => {
    const { client, payloads } = makeMockClient({ data: { id: 'series-1' } })
    await createPlaydateSeriesWithClient(client, 'user-1', INPUT)
    const payload = payloads[0] as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual([
      'address',
      'details',
      'duration_minutes',
      'host_profile_id',
      'neighborhood_id',
      'place',
      'start_minutes',
      'timezone',
      'title',
      'weekday',
    ])
    expect('starts_at' in payload).toBe(false)
    expect('ends_at' in payload).toBe(false)
  })

  it('throws pre-0028-apply (the missing table — the e2e’s documented red point)', async () => {
    const { client } = makeMockClient({
      error: {
        code: 'PGRST205',
        message: "Could not find the table 'public.playdate_series' in the schema cache",
      },
    })
    await expect(createPlaydateSeriesWithClient(client, 'user-1', INPUT)).rejects.toThrow(
      'Could not find the table',
    )
  })
})

describe('setSeriesActiveWithClient (Stop repeating)', () => {
  it('is a plain active flip on the one row, with no RETURNING and no delete', async () => {
    const { client, calls, payloads } = makeMockClient()
    await setSeriesActiveWithClient(client, 'series-1', false)
    expect(calls).toEqual(['from(playdate_series)', 'update', 'eq(id, series-1)'])
    expect(payloads[0]).toEqual({ active: false })
  })

  it('throws on a write error (the host panel keeps its designed error line)', async () => {
    const { client } = makeMockClient({
      error: { code: '42501', message: 'permission denied for table playdate_series' },
    })
    await expect(setSeriesActiveWithClient(client, 'series-1', false)).rejects.toThrow(
      'permission denied',
    )
  })
})
