import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { canModerate, isProfileBanned, issueModeratorUpdate } from './moderation'

/**
 * Moderation-logic tests (slice 5): the /mod route guard (canModerate),
 * the banned-session gate (isProfileBanned), and the moderator update
 * round-trip against a mocked supabase client (the same pattern as
 * trust.test.ts's issueReportInsert mock — including the 42501 tripwire
 * for a re-added .select()).
 */

describe('canModerate (the /mod route guard)', () => {
  it('is true for a moderator-flagged profile', () => {
    expect(canModerate({ moderators: true })).toBe(true)
  })

  it('is false for a non-moderator (flag false or absent)', () => {
    expect(canModerate({ moderators: false })).toBe(false)
    expect(canModerate({})).toBe(false)
  })

  it('is false for a null profile (nothing to check)', () => {
    expect(canModerate(null)).toBe(false)
  })
})

describe('isProfileBanned (the session-rejection gate)', () => {
  it('rejects a profile with banned_at set', () => {
    expect(isProfileBanned({ banned_at: '2026-09-09T00:00:00.000Z' })).toBe(true)
  })

  it('passes a profile without banned_at (null or column absent)', () => {
    expect(isProfileBanned({ banned_at: null })).toBe(false)
    expect(isProfileBanned({})).toBe(false)
  })

  it('passes a null profile (nothing to reject)', () => {
    expect(isProfileBanned(null)).toBe(false)
  })
})

/**
 * Minimal mock of the client surface issueModeratorUpdate uses: the update
 * chain records the table, the id (on .eq), and the patch, plus every
 * .select() call (the 42501 tripwire). With modelRls42501, .select().single()
 * resolves with the live behavior: a 42501 RLS violation, since UPDATE
 * ... RETURNING SELECTs the row under RLS.
 */
function makeModUpdateMockClient(modelRls42501: boolean): {
  client: SupabaseClient
  calls: {
    updates: Array<{ table: string; id: string; patch: Record<string, unknown> }>
    select: number
  }
} {
  const calls: {
    updates: Array<{ table: string; id: string; patch: Record<string, unknown> }>
    select: number
  } = { updates: [], select: 0 }

  const updateChain = (table: string, patch: Record<string, unknown>) => {
    const chain = {
      eq: (col: string, value: unknown) => {
        if (col !== 'id') throw new Error(`unexpected column: ${col}`)
        calls.updates.push({ table, id: String(value), patch })
        return chain
      },
      select: () => {
        calls.select += 1
        if (modelRls42501) {
          // Live behavior: the SELECT half of RETURNING is RLS-forbidden
          // for the mod tools' update targets → 42501.
          return {
            single: async () => ({
              data: null,
              error: {
                code: '42501',
                message: 'new row violates row-level security policy',
              },
            }),
          }
        }
        return { single: async () => ({ data: null, error: null }) }
      },
      then: (onfulfilled?: (value: { data: null; error: null }) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(onfulfilled),
    }
    return chain
  }

  const client = {
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => updateChain(table, patch),
    }),
  }

  return { client: client as unknown as SupabaseClient, calls }
}

describe('issueModeratorUpdate (plain update, no RETURNING)', () => {
  it('issues the update on the right table + id, without a .select()', async () => {
    const { client, calls } = makeModUpdateMockClient(false)
    await issueModeratorUpdate(
      client,
      'playdates',
      'pd-1',
      { hidden_at: '2026-09-09T12:00:00.000Z' },
    )
    await issueModeratorUpdate(
      client,
      'profiles',
      'u-bad',
      { banned_at: '2026-09-09T12:30:00.000Z' },
    )
    expect(calls.updates).toEqual([
      { table: 'playdates', id: 'pd-1', patch: { hidden_at: '2026-09-09T12:00:00.000Z' } },
      { table: 'profiles', id: 'u-bad', patch: { banned_at: '2026-09-09T12:30:00.000Z' } },
    ])
    expect(calls.select).toBe(0)
  })

  it('succeeds under a mock that models live 42501 for RETURNING (tripwire: re-adding .select() fails this test)', async () => {
    const { client, calls } = makeModUpdateMockClient(true)
    // A bare UPDATE (no RETURNING) succeeds live. If anyone re-adds
    // .select() to the update, the helper would await a chain that
    // resolves the 42501 error and reject — this test fails.
    await expect(
      issueModeratorUpdate(client, 'playdates', 'pd-1', { hidden_at: 'x' }),
    ).resolves.toBeUndefined()
    expect(calls.select).toBe(0)
  })

  it('rejects on an update error', async () => {
    const client = {
      from: () => ({
        update: (_patch: Record<string, unknown>) => ({
          eq: () => {
            const chain = {
              then: (onfulfilled?: (value: { data: null; error: unknown } | undefined) => unknown) =>
                Promise.resolve({
                  data: null,
                  error: { code: '42501', message: 'rls' },
                }).then(onfulfilled),
            }
            return chain
          },
        }),
      }),
    } as unknown as SupabaseClient
    await expect(
      issueModeratorUpdate(client, 'playdates', 'pd-1', { hidden_at: 'x' }),
    ).rejects.toMatchObject({ code: '42501' })
  })

  /**
   * V8 ticket 10: the comment UNHIDE rides this same helper. It is the same
   * write as the hide with a different value (hidden_at: null), which is the
   * whole reason no migration was needed: the live policy
   * (comments_update_moderators — 0013's mirror of 0009's) has USING =
   * WITH CHECK = "the actor is a moderator" and never looks at the row, so
   * clearing the column is admitted exactly like setting it. Probed live with
   * pg_policies before this code was written; the value this test pins is the
   * half the probe cannot show — that the client sends a plain UPDATE with no
   * RETURNING (the 42501 discipline) and puts null on the wire.
   */
  it('carries a comment unhide (hidden_at: null) through the same plain chain', async () => {
    const { client, calls } = makeModUpdateMockClient(false)
    await issueModeratorUpdate(client, 'comments', 'c-1', { hidden_at: null })
    expect(calls.updates).toEqual([{ table: 'comments', id: 'c-1', patch: { hidden_at: null } }])
    expect(calls.select).toBe(0)
  })

  it('a comment unhide survives the live-42501 model too (no .select() anywhere on the comments path)', async () => {
    const { client, calls } = makeModUpdateMockClient(true)
    await expect(
      issueModeratorUpdate(client, 'comments', 'c-1', { hidden_at: null }),
    ).resolves.toBeUndefined()
    expect(calls.select).toBe(0)
  })
})