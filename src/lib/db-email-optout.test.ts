/**
 * Migration 0053 — the email opt-out read/write paths in db.ts, against a
 * recording mock client (the db-series / db-reviews pattern: importing db.ts
 * runs its module-scope Supabase client creation, which reads the repo .env).
 *
 * Three pins are asserted here rather than by a live spec:
 *  - the READ is scoped to the caller's own id and asks for the one column
 *    (`.eq('id', userId)`, `maybeSingle()`), never a wall-wide profile fetch;
 *  - a value that did not come back is `undefined` — the read helper does NOT
 *    flatten it to `false`, because `false` is a real, emailable stored value
 *    (the OPT-OUT polarity; a failed read must never read as "opted out");
 *  - the WRITE is a plain UPDATE of `email_optout` on the caller's own row, and
 *    an error is rethrown rather than swallowed (the caller shows it and does
 *    NOT flip the control).
 */
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getEmailOptoutWithClient, updateEmailOptoutWithClient } from './db'

interface Recorded {
  client: SupabaseClient
  calls: string[]
  payloads: unknown[]
}

function makeProfilesMockClient(result: { data?: unknown; error?: unknown } = {}): Recorded {
  const calls: string[] = []
  const payloads: unknown[] = []
  const builder = {
    select: (cols: string) => {
      calls.push(`select(${cols})`)
      return builder
    },
    update: (payload: unknown) => {
      calls.push('update')
      payloads.push(payload)
      return builder
    },
    eq: (col: string, value: unknown) => {
      calls.push(`eq(${col}, ${String(value)})`)
      return builder
    },
    maybeSingle: () => {
      calls.push('maybeSingle')
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
    },
    then: (onfulfilled?: (value: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(onfulfilled),
  }
  const client = {
    from: (table: string) => {
      if (table !== 'profiles') throw new Error(`unexpected table: ${table}`)
      calls.push('from(profiles)')
      return builder
    },
  } as unknown as SupabaseClient
  return { client, calls, payloads }
}

describe('getEmailOptoutWithClient (mocked supabase client, migration 0053)', () => {
  it("reads only the caller's own row, and only the one column", async () => {
    const { client, calls } = makeProfilesMockClient({ data: { email_optout: true } })
    const value = await getEmailOptoutWithClient(client, 'profile-1')
    expect(value).toBe(true)
    expect(calls).toEqual([
      'from(profiles)',
      'select(email_optout)',
      'eq(id, profile-1)',
      'maybeSingle',
    ])
  })

  it('returns the stored false (email IS allowed) — never confused with a missing value', async () => {
    const { client } = makeProfilesMockClient({ data: { email_optout: false } })
    expect(await getEmailOptoutWithClient(client, 'profile-1')).toBe(false)
  })

  it('returns undefined when the value did not come back: no row', async () => {
    const { client } = makeProfilesMockClient({ data: null })
    expect(await getEmailOptoutWithClient(client, 'profile-1')).toBeUndefined()
  })

  it('returns undefined for a row without the column (pre-0053 shape, defensively)', async () => {
    const { client } = makeProfilesMockClient({ data: { id: 'profile-1' } })
    expect(await getEmailOptoutWithClient(client, 'profile-1')).toBeUndefined()
  })

  it('returns undefined for a non-boolean value rather than coercing it', async () => {
    const { client } = makeProfilesMockClient({ data: { email_optout: 'true' } })
    expect(await getEmailOptoutWithClient(client, 'profile-1')).toBeUndefined()
  })

  it('throws when the query fails (the pre-0053-apply 42703)', async () => {
    const { client } = makeProfilesMockClient({
      error: Object.assign(new Error('column profiles.email_optout does not exist'), {
        code: '42703',
      }),
    })
    await expect(getEmailOptoutWithClient(client, 'profile-1')).rejects.toThrow(
      'column profiles.email_optout does not exist',
    )
  })
})

describe('updateEmailOptoutWithClient (mocked supabase client, migration 0053)', () => {
  it("updates email_optout on the caller's own row, and nothing else", async () => {
    const { client, calls, payloads } = makeProfilesMockClient()
    await updateEmailOptoutWithClient(client, 'profile-1', true)
    expect(calls).toEqual(['from(profiles)', 'update', 'eq(id, profile-1)'])
    expect(payloads).toEqual([{ email_optout: true }])
  })

  it('writes false when the parent turns email back on (the column is the opt-out)', async () => {
    const { client, payloads } = makeProfilesMockClient()
    await updateEmailOptoutWithClient(client, 'profile-1', false)
    expect(payloads).toEqual([{ email_optout: false }])
  })

  it('throws when the write fails, so the caller cannot silently flip the control', async () => {
    const { client } = makeProfilesMockClient({
      error: Object.assign(new Error('permission denied for table profiles'), { code: '42501' }),
    })
    await expect(updateEmailOptoutWithClient(client, 'profile-1', true)).rejects.toThrow(
      'permission denied',
    )
  })
})
