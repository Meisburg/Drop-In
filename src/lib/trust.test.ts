import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isHostBlocked,
  issueReportInsert,
  planPing,
  togglePingWithClient,
  validateReportReason,
  type ReportInsertPayload,
} from './trust'

/**
 * Trust-logic tests (slice 4): the ping-toggle round-trip against a mocked
 * supabase client (the same pattern as auth.test.ts), the host-cannot-ping-
 * own-post guard, report-reason validation, and the detail-path block
 * filter. All pure or mock-only — no database or browser needed.
 */

const PLAYDATE_ID = 'pd-1'

interface MockPingOptions {
  /** The signed-in user's id (auth.getUser). */
  userId: string
  /** The playdate's host_profile_id (the playdates select). */
  hostId: string
  /** Profile ids that already pinged the playdate. */
  pings?: string[]
}

/**
 * Minimal in-memory mock of the client surface the ping round-trip uses:
 * auth.getUser + from('playdates') select + from('going_pings')
 * select/upsert/delete. Every mutation is recorded in `ops` so tests can
 * assert the upsert→delete round-trip; `pings` is the in-memory
 * going_pings table.
 */
function makeMockClient(opts: MockPingOptions): {
  client: SupabaseClient
  ops: string[]
  pings: Set<string>
} {
  const ops: string[] = []
  const pings = new Set(opts.pings ?? [])

  const fakeFrom = (table: string) => {
    const filters: Record<string, unknown> = {}
    const selectChain = {
      select: (_cols: string, _options?: unknown) => selectChain,
      eq: (col: string, value: unknown) => {
        filters[col] = value
        return selectChain
      },
      maybeSingle: async () => {
        if (table === 'playdates') {
          ops.push(`select playdates id=${String(filters.id)}`)
          if (filters.id !== PLAYDATE_ID) return { data: null, error: null }
          return { data: { host_profile_id: opts.hostId }, error: null }
        }
        ops.push(
          `select going_pings playdate_id=${String(filters.playdate_id)} profile_id=${String(filters.profile_id)}`,
        )
        const hit = filters.playdate_id === PLAYDATE_ID && pings.has(String(filters.profile_id))
        return { data: hit ? { profile_id: filters.profile_id } : null, error: null }
      },
    }
    const deleteChain = {
      eq: (col: string, value: unknown) => {
        filters[col] = value
        return deleteChain
      },
      then: (onfulfilled?: (value: { data: null; error: null }) => unknown) => {
        ops.push(`delete going_pings profile_id=${String(filters.profile_id)}`)
        if (filters.playdate_id === PLAYDATE_ID) pings.delete(String(filters.profile_id))
        return Promise.resolve({ data: null, error: null }).then(onfulfilled)
      },
    }
    return {
      ...selectChain,
      upsert: (row: { playdate_id: string; profile_id: string }) => {
        ops.push(`upsert going_pings profile_id=${row.profile_id}`)
        pings.add(row.profile_id)
        return Promise.resolve({ data: row, error: null })
      },
      delete: () => deleteChain,
    }
  }

  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: opts.userId } }, error: null }),
    },
    from: fakeFrom,
  } as unknown as SupabaseClient

  return { client, ops, pings }
}

describe('planPing (the host-cannot-ping-own-post guard)', () => {
  it('no-ops when the viewer is the host (with or without an existing ping)', () => {
    expect(planPing(false, true)).toBe('noop-host')
    expect(planPing(true, true)).toBe('noop-host')
  })

  it('pings when there is no existing ping', () => {
    expect(planPing(false, false)).toBe('ping')
  })

  it('unpings when a ping already exists', () => {
    expect(planPing(true, false)).toBe('unping')
  })
})

describe('togglePingWithClient (mocked supabase client)', () => {
  it('upserts, then deletes, on a ping→unping round-trip', async () => {
    const { client, ops, pings } = makeMockClient({ userId: 'u1', hostId: 'host-1' })

    expect(await togglePingWithClient(client, PLAYDATE_ID)).toBe(true)
    expect(pings.has('u1')).toBe(true)

    expect(await togglePingWithClient(client, PLAYDATE_ID)).toBe(false)
    expect(pings.has('u1')).toBe(false)

    expect(ops).toContain('upsert going_pings profile_id=u1')
    expect(ops).toContain('delete going_pings profile_id=u1')
  })

  it('no-ops when the viewer is the host of the post (no ping writes)', async () => {
    const { client, ops, pings } = makeMockClient({ userId: 'host-1', hostId: 'host-1' })

    expect(await togglePingWithClient(client, PLAYDATE_ID)).toBe(false)
    expect(pings.size).toBe(0)
    expect(
      ops.some((op) => op.startsWith('upsert') || op.startsWith('delete')),
    ).toBe(false)
  })

  it("an existing ping by another user doesn't affect this user's toggle", async () => {
    const { client, pings } = makeMockClient({
      userId: 'u1',
      hostId: 'host-1',
      pings: ['u2'],
    })

    expect(await togglePingWithClient(client, PLAYDATE_ID)).toBe(true)
    expect(pings.has('u1')).toBe(true)
    expect(pings.has('u2')).toBe(true)
  })
})

describe('validateReportReason (required, non-empty after trim)', () => {
  it('rejects an empty reason', () => {
    expect(validateReportReason('')).not.toBeNull()
  })

  it('rejects a whitespace-only reason', () => {
    expect(validateReportReason('   ')).not.toBeNull()
  })

  it('accepts a non-empty reason', () => {
    expect(validateReportReason('Shared a home address instead of a public meet-up')).toBeNull()
  })
})

describe('isHostBlocked (the detail-path block filter)', () => {
  const post = { host_profile_id: 'host-1' }

  it('hides a post whose host is in the viewer’s block set', () => {
    expect(isHostBlocked(post, new Set(['host-1', 'other']))).toBe(true)
  })

  it('shows a post whose host is not blocked', () => {
    expect(isHostBlocked(post, new Set(['other']))).toBe(false)
    expect(isHostBlocked(post, new Set())).toBe(false)
  })
})

/**
 * Minimal mock of the client surface issueReportInsert uses: the insert
 * chain records every .select() call (the 42501 tripwire). With
 * modelRls42501, .select().single() resolves with the live behavior
 * (REST probe 2026-09-09): a 42501 RLS violation, since INSERT ...
 * RETURNING SELECTs the new row under the moderators-only reports
 * SELECT policy.
 */
function makeReportsMockClient(modelRls42501: boolean): {
  client: SupabaseClient
  calls: { select: number; inserted: unknown[] }
} {
  const calls = { select: 0, inserted: [] as unknown[] }
  const insertChain = {
    select: () => {
      calls.select += 1
      if (modelRls42501) {
        // Live behavior: the SELECT half of RETURNING is RLS-forbidden
        // for non-moderators → 42501.
        return {
          single: async () => ({
            data: null,
            error: {
              code: '42501',
              message: 'new row violates row-level security policy for table "reports"',
            },
          }),
        }
      }
      return { single: async () => ({ data: null, error: null }) }
    },
    then: (onfulfilled?: (value: { data: null; error: null }) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(onfulfilled),
  }
  const client = {
    from: (table: string) => {
      if (table !== 'reports') throw new Error(`unexpected table: ${table}`)
      return {
        insert: (payload: unknown) => {
          calls.inserted.push(payload)
          return insertChain
        },
      }
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const REPORT_PAYLOAD: ReportInsertPayload = {
  reporter_profile_id: 'u1',
  playdate_id: PLAYDATE_ID,
  reported_profile_id: 'host-1',
  reason: 'Shared a home address instead of a public meet-up',
}

describe('issueReportInsert (42501 regression: plain insert, no RETURNING)', () => {
  it('issues the reports INSERT without a .select() in the chain', async () => {
    const { client, calls } = makeReportsMockClient(false)
    await issueReportInsert(client, REPORT_PAYLOAD)
    expect(calls.inserted).toEqual([REPORT_PAYLOAD])
    expect(calls.select).toBe(0)
  })

  it('succeeds under a mock that models live 42501 for RETURNING (tripwire: re-adding .select() fails this test)', async () => {
    const { client, calls } = makeReportsMockClient(true)
    // A bare INSERT (no RETURNING) succeeds live (HTTP 201, verified).
    // If anyone re-adds .select() to the insert, the helper would await a
    // chain that resolves the 42501 error and reject — this test fails.
    await expect(issueReportInsert(client, REPORT_PAYLOAD)).resolves.toBeUndefined()
    expect(calls.select).toBe(0)
  })
})