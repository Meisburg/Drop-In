/**
 * V21 t07 — the name-prefix autocomplete seam (searchProfilesByName) in db.ts.
 *
 * The rails under test are the PINNED PRIVACY RAILS, asserted here rather than
 * by a live spec:
 *   - the cap: at most 8 rows even when asked for more / more exist;
 *   - the shape: each row carries ONLY display_name + handle — no id, email,
 *     zip or bio can leak through this seam;
 *   - short queries (< 2 chars) and empty/whitespace queries fire NO request.
 *
 * Importing db.ts runs its module-scope Supabase client creation (reads the
 * repo .env via Vitest's env loading — the db-v2 note), but every assertion
 * below runs against a recording mock client, never the network.
 */
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PARENT_NAME_SEARCH_MAX_RESULTS,
  PARENT_NAME_SEARCH_MIN_QUERY_LENGTH,
  planParentNameSearch,
  searchProfilesByNameWithClient,
} from './db'

interface Recorded {
  client: SupabaseClient
  calls: string[]
  payloads: unknown[]
}

/**
 * A recording mock that answers `from('profiles')` reads with whatever rows the
 * test supplies, and records every builder call so the WIRE SHAPE of the query
 * (which columns, which filter, which limit) is assertable.
 */
function makeProfileMockClient(rows: Array<Record<string, unknown>>): Recorded {
  const calls: string[] = []
  const payloads: unknown[] = []
  let sawLimit = false
  let lastLimit = 0
  const builder = {
    select: (cols: string) => {
      calls.push(`select(${cols})`)
      return builder
    },
    ilike: (col: string, pattern: string) => {
      calls.push(`ilike(${col}, ${pattern})`)
      payloads.push(pattern)
      return builder
    },
    order: (col: string, opts: { ascending?: boolean }) => {
      calls.push(`order(${col}, ${opts.ascending ? 'asc' : 'desc'})`)
      return builder
    },
    limit: (n: number) => {
      calls.push(`limit(${n})`)
      sawLimit = true
      lastLimit = n
      return builder
    },
    then: (onfulfilled?: (value: { data: unknown; error: unknown }) => unknown) => {
      // When the seam short-circuits (no builder method was called) there is no
      // wire request at all — report "nothing was queried" instead of faking a
      // successful read.
      if (!sawLimit) {
        return Promise.resolve({ data: null, error: null }).then(onfulfilled)
      }
      // Simulate the database returning MORE rows than the limit asks for, so
      // the cap assertion is about the LIMIT clause, not a stub that happens to
      // be small. PostgREST enforces the limit server-side; the mock mirrors
      // that by slicing.
      const limited = rows.slice(0, lastLimit)
      return Promise.resolve({ data: limited, error: null }).then(onfulfilled)
    },
  }
  const client = {
    from: (table: string) => {
      calls.push(`from(${table})`)
      sawLimit = false
      lastLimit = 0
      return builder
    },
  } as unknown as SupabaseClient
  return { client, calls, payloads }
}

describe('planParentNameSearch (the pinned rails, pure)', () => {
  it('refuses queries shorter than the minimum length', () => {
    expect(PARENT_NAME_SEARCH_MIN_QUERY_LENGTH).toBe(2)
    expect(planParentNameSearch('', 8)).toBeNull()
    expect(planParentNameSearch('a', 8)).toBeNull()
    expect(planParentNameSearch('  ', 8)).toBeNull() // whitespace-only counts as empty
    expect(planParentNameSearch(' \t ', 8)).toBeNull()
  })

  it('accepts a 2-char query and trims it', () => {
    expect(planParentNameSearch('sa', 8)).toEqual({ prefix: 'sa', limit: 8 })
    expect(planParentNameSearch('  sa  ', 8)).toEqual({ prefix: 'sa', limit: 8 })
  })

  it('caps the requested limit at the pinned rail (8)', () => {
    expect(PARENT_NAME_SEARCH_MAX_RESULTS).toBe(8)
    expect(planParentNameSearch('sam', 50)?.limit).toBe(8)
    expect(planParentNameSearch('sam', 3)?.limit).toBe(3) // a smaller ask stands
  })

  it('falls back to the cap for a nonsense requested limit', () => {
    expect(planParentNameSearch('sam', 0)?.limit).toBe(8)
    expect(planParentNameSearch('sam', Number.NaN)?.limit).toBe(8)
  })
})

describe('searchProfilesByNameWithClient (cap + shape)', () => {
  it('returns at most 8 rows even when asked for more and more exist', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      display_name: `Sam Rivera${i}`,
    }))
    const { client, calls } = makeProfileMockClient(many)
    const results = await searchProfilesByNameWithClient(client, 'sam', 50)
    expect(results.length).toBe(8)
    // The cap rides the LIMIT clause, not a client-side slice after a big read.
    expect(calls).toContain('limit(8)')
  })

  it('respects a smaller requested limit', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      display_name: `Sam Rivera${i}`,
    }))
    const { client, calls } = makeProfileMockClient(many)
    const results = await searchProfilesByNameWithClient(client, 'sam', 3)
    expect(results.length).toBe(3)
    expect(calls).toContain('limit(3)')
  })

  it('carries ONLY display_name + handle on every row', async () => {
    const rows = [
      {
        display_name: 'Sam Rivera',
        // Fields that must NOT survive the seam, present on the source row:
        id: 'uuid-1',
        email: 'sam@example.com',
        home_zip: '98107',
        bio: 'we love drop-ins',
        avatar_url: 'https://x/a.jpg',
      },
      { display_name: 'Sam Okafor', id: 'uuid-2', home_zip: '98103' },
    ]
    const { client } = makeProfileMockClient(rows)
    const results = await searchProfilesByNameWithClient(client, 'sam')
    expect(results).toEqual([
      { display_name: 'Sam Rivera', handle: 'Sam Rivera' },
      { display_name: 'Sam Okafor', handle: 'Sam Okafor' },
    ])
    for (const row of results) {
      expect(Object.keys(row).sort()).toEqual(['display_name', 'handle'])
    }
  })

  it('queries only the display_name column (prefix match, ordered)', async () => {
    const { client, calls, payloads } = makeProfileMockClient([])
    await searchProfilesByNameWithClient(client, 'sam')
    expect(calls).toContain('from(profiles)')
    expect(calls).toContain('select(display_name)')
    expect(calls).toContain('ilike(display_name, sam%)')
    expect(calls).toContain('order(display_name, asc)')
    expect(payloads).toEqual(['sam%'])
  })

  it('escapes ILIKE wildcards in the typed prefix', async () => {
    const { client, payloads } = makeProfileMockClient([])
    await searchProfilesByNameWithClient(client, 's_a%m')
    expect(payloads).toEqual(['s\\_a\\%m%'])
  })

  it('fires NO request for a query shorter than 2 characters', async () => {
    for (const q of ['a', '']) {
      const { client, calls } = makeProfileMockClient([{ display_name: 'A' }])
      const results = await searchProfilesByNameWithClient(client, q)
      expect(results).toEqual([])
      expect(calls).toEqual([]) // nothing reached the client at all
    }
  })

  it('fires NO request for an empty/whitespace query', async () => {
    for (const q of ['   ', '\t\n', '  s ']) {
      const { client, calls } = makeProfileMockClient([{ display_name: 'S' }])
      const results = await searchProfilesByNameWithClient(client, q)
      expect(results).toEqual([])
      expect(calls).toEqual([])
    }
  })

  it('returns an empty list when the database has no matches', async () => {
    const { client } = makeProfileMockClient([])
    expect(await searchProfilesByNameWithClient(client, 'zzz')).toEqual([])
  })
})
