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
 * A mock that answers the three reads this seam makes: `account_links` (by the
 * caller's own RLS, modelled as "whatever rows the test supplies"), the
 * counterparty `profiles` summary, and the counterparty's `parent_cards` (V27 —
 * her own self-card `about` is the linked row's description).
 */
function makeLinkMockClient({
  links,
  profiles,
  cards = [],
}: {
  links: Array<Record<string, unknown>>
  profiles: Array<Record<string, unknown>>
  cards?: Array<Record<string, unknown>>
}): Recorded {
  const calls: string[] = []
  const client = {
    from: (table: string) => {
      calls.push(`from(${table})`)
      const rows = table === 'account_links' ? links : table === 'parent_cards' ? cards : profiles
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
        order: (col: string, opts: { ascending: boolean }) => {
          calls.push(`order(${table}:${col},${opts.ascending})`)
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

describe('getLinkedPartnerForProfileWithClient (V24 11A read seam; N2 test; V27 avatar + self-card about)', () => {
  it('returns the partner’s handle, avatar and her own card about', async () => {
    const { client, calls } = makeLinkMockClient({
      links: [
        {
          id: 'l1',
          requester_id: ME,
          addressee_id: THEM,
          status: 'accepted',
        },
      ],
      profiles: [
        {
          id: THEM,
          display_name: 'Nicole',
          avatar_url: 'https://example.test/nicole.jpg',
        },
      ],
      cards: [{ id: 'c1', profile_id: THEM, name: 'Nicole', about: 'We like parks.', position: 1 }],
    })
    expect(await getLinkedPartnerForProfileWithClient(client, ME)).toEqual({
      handle: 'Nicole',
      avatarUrl: 'https://example.test/nicole.jpg',
      about: 'We like parks.',
    })
    // The wiring, not just the answer: the links table anchored on the VIEWED
    // profile, ONE narrow profile read for the counterparty, then HER cards for
    // the words.
    expect(calls).toContain('from(account_links)')
    expect(calls).toContain(`or(requester_id.eq.${ME},addressee_id.eq.${ME})`)
    expect(calls).toContain(`eq(profiles:id=${THEM})`)
    expect(calls).toContain(`eq(parent_cards:profile_id=${THEM})`)
  })

  it('finds the partner when the viewed profile is the ADDRESSEE', async () => {
    const { client } = makeLinkMockClient({
      links: [{ id: 'l1', requester_id: THEM, addressee_id: ME, status: 'accepted' }],
      profiles: [{ id: THEM, display_name: 'Nicole', avatar_url: null }],
    })
    expect(await getLinkedPartnerForProfileWithClient(client, ME)).toEqual({
      handle: 'Nicole',
      avatarUrl: null,
      about: null,
    })
  })

  it('V27: about is null when she has no self-card, or one with a blank about', async () => {
    const { client } = makeLinkMockClient({
      links: [{ id: 'l1', requester_id: ME, addressee_id: THEM, status: 'accepted' }],
      profiles: [{ id: THEM, display_name: 'Nicole', avatar_url: null }],
      cards: [
        { id: 'c1', profile_id: THEM, name: 'Someone else', about: 'Not hers', position: 1 },
        { id: 'c2', profile_id: THEM, name: 'Nicole', about: '   ', position: 2 },
      ],
    })
    expect((await getLinkedPartnerForProfileWithClient(client, ME))?.about).toBeNull()
  })

  it('is null for a THIRD account: RLS hands the caller zero rows', async () => {
    const { client, calls } = makeLinkMockClient({ links: [], profiles: [] })
    expect(await getLinkedPartnerForProfileWithClient(client, ME)).toBeNull()
    // Nothing to resolve, so neither the profile nor the card read happens — no
    // query per request, and no row is even in play.
    expect(calls).not.toContain('from(profiles)')
    expect(calls).not.toContain('from(parent_cards)')
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

  it('V27: carries exactly handle + avatarUrl + about — no dead profileId (finding N3)', async () => {
    const { client } = makeLinkMockClient({
      links: [{ id: 'l1', requester_id: ME, addressee_id: THEM, status: 'accepted' }],
      profiles: [{ id: THEM, display_name: 'Nicole', avatar_url: null }],
      cards: [{ id: 'c1', profile_id: THEM, name: 'Nicole', about: 'A line about me.', position: 1 }],
    })
    const partner = await getLinkedPartnerForProfileWithClient(client, ME)
    expect(partner).toEqual({ handle: 'Nicole', avatarUrl: null, about: 'A line about me.' })
    expect(Object.keys(partner ?? {}).sort()).toEqual(['about', 'avatarUrl', 'handle'])
  })
})
