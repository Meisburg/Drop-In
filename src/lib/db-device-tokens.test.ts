/**
 * Slice 2b-ii — the `device_tokens` read/write/delete paths in db.ts, against a
 * recording mock client (the db-email-optout / db-series pattern: importing
 * db.ts runs its module-scope Supabase client creation, which reads the repo
 * .env).
 *
 * WHY THESE PINS EXIST. The native path cannot be driven on this box (no
 * installed app, no FCM key), so the persistence seam is proven here instead of
 * inferred from the UI:
 *
 *  - the WRITE is an `upsert(..., { onConflict: 'token' })` — 0065's upsert key
 *    (pin b) — and it asks for `profile_id` BACK, because a non-owner's upsert
 *    silently updates zero rows and would otherwise be reported as a success (a
 *    false "Notifications are on" for a device that was never registered);
 *  - the READ is scoped to the caller's own id (0065 pin a: owner-only SELECT)
 *    and never selects `token`, which is a capability rather than a field;
 *  - the DELETE is a single profile-scoped delete, which is the whole opt-out
 *    (0065's DELETE policy): a token-scoped delete would leave the parent
 *    reachable whenever the row in the table is not the token we hold.
 */
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  deleteDeviceTokensForProfileWithClient,
  listDeviceTokensWithClient,
  saveDeviceTokenWithClient,
} from './db'
import { DEVICE_TOKEN_CONFLICT_KEY, type DeviceTokenRow } from './nativePushToken'

interface Recorded {
  client: SupabaseClient
  calls: string[]
  payloads: unknown[]
  options: unknown[]
}

/**
 * One chained builder that records every call — `upsert`/`select`/`delete`
 * return it, `eq`/`order` return it, and it is thenable so the awaited tail
 * resolves the configured result. The table name is asserted, so a write that
 * lands on the wrong table fails loudly instead of passing.
 */
function makeDeviceTokensMockClient(
  table: string,
  result: { data?: unknown; error?: unknown } = {},
): Recorded {
  const calls: string[] = []
  const payloads: unknown[] = []
  const options: unknown[] = []
  const builder = {
    upsert: (payload: unknown, opts?: unknown) => {
      calls.push('upsert')
      payloads.push(payload)
      options.push(opts)
      return builder
    },
    select: (cols: string) => {
      calls.push(`select(${cols})`)
      return builder
    },
    delete: () => {
      calls.push('delete')
      return builder
    },
    eq: (col: string, value: unknown) => {
      calls.push(`eq(${col}, ${String(value)})`)
      return builder
    },
    order: (col: string, opts?: unknown) => {
      calls.push(`order(${col}, ${JSON.stringify(opts)})`)
      return builder
    },
    then: (onfulfilled?: (value: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(onfulfilled),
  }
  const client = {
    from: (name: string) => {
      if (name !== table) throw new Error(`unexpected table: ${name}`)
      calls.push(`from(${name})`)
      return builder
    },
  } as unknown as SupabaseClient
  return { client, calls, payloads, options }
}

const ROW: DeviceTokenRow = {
  profile_id: 'prof-1',
  platform: 'android',
  token: 'fcm-token-1',
  app_version: '2.0.0',
  last_seen_at: '2026-10-06T12:00:00.000Z',
}

describe('saveDeviceTokenWithClient (mocked supabase client, migration 0065)', () => {
  it('upserts the seam’s row on the token, and reads the caller’s own row back', async () => {
    const { client, calls, payloads, options } = makeDeviceTokensMockClient('device_tokens', {
      data: [{ profile_id: 'prof-1' }],
    })

    await saveDeviceTokenWithClient(client, ROW)

    expect(calls).toEqual(['from(device_tokens)', 'upsert', 'select(profile_id)'])
    expect(payloads).toEqual([ROW])
    expect(options).toEqual([{ onConflict: DEVICE_TOKEN_CONFLICT_KEY }])
  })

  it('throws when NOTHING came back — the silent 0-row non-owner upsert', async () => {
    const { client } = makeDeviceTokensMockClient('device_tokens', { data: [] })

    await expect(saveDeviceTokenWithClient(client, ROW)).rejects.toThrow(
      /different Drop In account/,
    )
  })

  it('throws when the row that came back belongs to somebody else', async () => {
    const { client } = makeDeviceTokensMockClient('device_tokens', {
      data: [{ profile_id: 'someone-else' }],
    })

    await expect(saveDeviceTokenWithClient(client, ROW)).rejects.toThrow(
      /different Drop In account/,
    )
  })

  it('rethrows the client’s own error rather than reporting a write', async () => {
    const { client } = makeDeviceTokensMockClient('device_tokens', {
      error: new Error('permission denied for table device_tokens'),
    })

    await expect(saveDeviceTokenWithClient(client, ROW)).rejects.toThrow(/permission denied/)
  })
})

describe('listDeviceTokensWithClient', () => {
  it('reads only the caller’s rows, never the token itself', async () => {
    const { client, calls } = makeDeviceTokensMockClient('device_tokens', {
      data: [
        {
          id: 'row-2',
          platform: 'android',
          app_version: '2.0.0',
          last_seen_at: '2026-10-06T12:00:00.000Z',
        },
      ],
    })

    const rows = await listDeviceTokensWithClient(client, 'prof-1')

    expect(calls).toEqual([
      'from(device_tokens)',
      'select(id, platform, app_version, last_seen_at)',
      'eq(profile_id, prof-1)',
      'order(created_at, {"ascending":false})',
    ])
    expect(rows).toEqual([
      {
        id: 'row-2',
        platform: 'android',
        appVersion: '2.0.0',
        lastSeenAt: '2026-10-06T12:00:00.000Z',
      },
    ])
  })

  it('is an empty list — not a throw — when this profile has no device', async () => {
    const { client } = makeDeviceTokensMockClient('device_tokens', { data: null })
    expect(await listDeviceTokensWithClient(client, 'prof-1')).toEqual([])
  })

  it('rethrows a failed read, so the section can say so instead of rendering "off"', async () => {
    const { client } = makeDeviceTokensMockClient('device_tokens', {
      error: new Error('PGRST205: could not find the table'),
    })
    await expect(listDeviceTokensWithClient(client, 'prof-1')).rejects.toThrow(/PGRST205/)
  })
})

describe('deleteDeviceTokensForProfileWithClient — the opt-out', () => {
  it('deletes this profile’s rows and nothing else', async () => {
    const { client, calls } = makeDeviceTokensMockClient('device_tokens')

    await deleteDeviceTokensForProfileWithClient(client, 'prof-1')

    expect(calls).toEqual(['from(device_tokens)', 'delete', 'eq(profile_id, prof-1)'])
  })

  it('rethrows a failed delete, so "off" is never claimed over a live row', async () => {
    const { client } = makeDeviceTokensMockClient('device_tokens', {
      error: new Error('permission denied for table device_tokens'),
    })

    await expect(deleteDeviceTokensForProfileWithClient(client, 'prof-1')).rejects.toThrow(
      /permission denied/,
    )
  })
})

/**
 * FIX ROUND 1, finding 3 — THE WRAPPER'S CONTRACT WITH THE SEAM.
 *
 * `saveDeviceToken` is the function the /settings call site actually passes into
 * `registerForNativePush`, so it is where the row the seam built becomes the row
 * the database receives. Nothing above this pins that trip: a wrapper that
 * rebuilt the row, re-timestamped it, or dropped the version would leave every
 * other test here green while `app_version` silently went null on every install
 * — the exact "null by lack of a caller" the reviewer flagged, one layer down.
 * The call site today passes NO version (the app has no build-version env, and
 * that is stated at the call site), so both halves of the contract are pinned:
 * whatever it IS given goes through, and an absent one is null rather than
 * invented.
 */
describe('saveDeviceToken — the wrapper passes the seam’s row through unchanged', () => {
  it('writes exactly the row it was handed, version included', async () => {
    const { client, calls, payloads } = makeDeviceTokensMockClient('device_tokens', {
      data: [{ profile_id: 'prof-1' }],
    })

    await saveDeviceTokenWithClient(client, ROW)

    expect(calls).toEqual(['from(device_tokens)', 'upsert', 'select(profile_id)'])
    expect(payloads).toEqual([ROW])
    expect((payloads[0] as DeviceTokenRow).app_version).toBe('2.0.0')
  })

  it('keeps a null version null — the documented state, not a default', async () => {
    const { client, payloads } = makeDeviceTokensMockClient('device_tokens', {
      data: [{ profile_id: 'prof-1' }],
    })

    await saveDeviceTokenWithClient(client, { ...ROW, app_version: null })

    expect((payloads[0] as DeviceTokenRow).app_version).toBeNull()
  })
})
