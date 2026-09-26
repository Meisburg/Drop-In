/**
 * V24 slice 11B (finding N2) — the READ surface's accepted-partner seam,
 * `getLinkedPartnerForProfileWithClient` in db.ts.
 *
 * WHY THIS FILE EXISTS. The function was the one seam in its section with no
 * `*WithClient` variant, so its zero-rows / pending-only / accepted-in-either-
 * direction branches had no test at all — while every sibling a few lines above
 * it did. That absence is exactly what this file closes. The rules themselves
 * are pure and already tested (`acceptedCounterpartyForProfile` in links.test.ts);
 * what is asserted HERE is the WIRING: which table is asked, that the
 * counterparty is resolved through a second narrow profile read, and that a
 * missing profile row degrades to null rather than throwing.
 *
 * Importing db.ts runs its module-scope Supabase client creation (reads the repo
 * .env via Vitest's env loading), but every assertion below runs against a
 * recording mock client — never the network.
 */
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getLinkedPartnerForProfileWithClient } from './db'

interface Recorded {
  client: SupabaseClient
  calls: string[]
}

/**
 * A mock that answers BOTH reads this seam makes: `account_links` (by the
 * caller's own RLS, modelled as "whatever rows the test supplies") and
 * `profiles` (the counterparty summary).
 */
function makeLinkMockClient({
  links,
  profiles,
}: {
  links: Array<Record<string, unknown>>
  profiles: Array<Record<string, unknown>>
}): Recorded {
  const calls: string[] = []
  const client = {
    from: (table: string) => {
      calls.push(`from(${table})`)
      const rows = table === 'account_links' ? links : profiles
      const builder = {
        select: (cols: string) => {
          calls.push(`select(${table}:${cols})`)
          return builder
        },
        or: (filter: string) => {
          calls.push(`or(${filter})`)
          return builder
        },
        eq: (col: string, value: string) => {
          calls.push(`eq(${table}:${col}=${value})`)
          return builder
        },
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (onfulfilled?: (value: { data: unknown; error: unknown }) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(onfulfilled),
      }
      return builder
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

const ME = 'profile-me'
const THEM = 'profile-them'

describe('getLinkedPartnerForProfileWithClient (V24 11A read seam; N2 test)', () => {
  it('returns the accepted partner’s handle, and reads only two narrow rows', async () => {
    const { client, calls } = makeLinkMockClient({
      links: [
        {
          id: 'l1',
          requester_id: ME,
          addressee_id: THEM,
          status: 'accepted',
        },
      ],
      profiles: [{ id: THEM, display_name: 'Nicole', avatar_url: null }],
    })
    expect(await getLinkedPartnerForProfileWithClient(client, ME)).toEqual({ handle: 'Nicole' })
    // The wiring, not just the answer: the links table anchored on the VIEWED
    // profile, then ONE narrow profile read for the counterparty.
    expect(calls).toContain('from(account_links)')
    expect(calls).toContain(`or(requester_id.eq.${ME},addressee_id.eq.${ME})`)
    expect(calls).toContain(`eq(profiles:id=${THEM})`)
  })

  it('finds the partner when the viewed profile is the ADDRESSEE', async () => {
    const { client } = makeLinkMockClient({
      links: [{ id: 'l1', requester_id: THEM, addressee_id: ME, status: 'accepted' }],
      profiles: [{ id: THEM, display_name: 'Nicole', avatar_url: null }],
    })
    expect(await getLinkedPartnerForProfileWithClient(client, ME)).toEqual({ handle: 'Nicole' })
  })

  it('is null for a THIRD account: RLS hands the caller zero rows', async () => {
    const { client, calls } = makeLinkMockClient({ links: [], profiles: [] })
    expect(await getLinkedPartnerForProfileWithClient(client, ME)).toBeNull()
    // Nothing to resolve, so the second read never happens — no query per
    // request, and no profile row is even in play.
    expect(calls).not.toContain('from(profiles)')
  })

  it('is null for pending and declined rows: only an accepted link is a partner', async () => {
    const { client } = makeLinkMockClient({
      links: [
        { id: 'p', requester_id: ME, addressee_id: THEM, status: 'pending' },
        { id: 'd', requester_id: ME, addressee_id: THEM, status: 'declined' },
      ],
      profiles: [{ id: THEM, display_name: 'Nicole', avatar_url: null }],
    })
    expect(await getLinkedPartnerForProfileWithClient(client, ME)).toBeNull()
  })

  it('degrades to null when the counterparty profile cannot be read', async () => {
    // The deleted-profile / RLS edge: the link exists but the summary does not,
    // and the read surface must render plain text rather than throw.
    const { client } = makeLinkMockClient({
      links: [{ id: 'l1', requester_id: ME, addressee_id: THEM, status: 'accepted' }],
      profiles: [],
    })
    expect(await getLinkedPartnerForProfileWithClient(client, ME)).toBeNull()
  })

  it('carries the HANDLE alone — no dead profileId (finding N3)', async () => {
    const { client } = makeLinkMockClient({
      links: [{ id: 'l1', requester_id: ME, addressee_id: THEM, status: 'accepted' }],
      profiles: [{ id: THEM, display_name: 'Nicole', avatar_url: null }],
    })
    const partner = await getLinkedPartnerForProfileWithClient(client, ME)
    expect(Object.keys(partner ?? {})).toEqual(['handle'])
  })
})
