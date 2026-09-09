import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  filterFeed,
  isHappeningNow,
  isHiddenPost,
  queryUpcomingFeedWithClient,
  startOfTodayIso,
  validatePlaydateForm,
  type FeedPost,
  type PlaydateFormValues,
} from './feed'

/**
 * Feed-logic tests (slice 3). All time-based cases are built relative to a
 * fixed local midnight so they hold on any machine timezone (and across
 * DST states) — see startOfTodayIso's tests for the fixed-clock cases.
 */

/** A fixed clock: 2026-09-04 12:00 in the machine's local timezone. */
const FIXED_NOW = new Date(2026, 8, 4, 12, 0, 0, 0)
const TODAY_ISO = startOfTodayIso(FIXED_NOW)
const NOW_ISO = FIXED_NOW.toISOString()

/** ISO string `minutes` after local midnight of 2026-09-04. */
function at(minutesAfterMidnight: number): string {
  return new Date(Date.parse(TODAY_ISO) + minutesAfterMidnight * 60_000).toISOString()
}

const FOLLOWED = new Set(['n1', 'n2'])
const BLOCKED_HOSTS = new Set(['host-blocked'])

describe('startOfTodayIso (fixed clock, DST-agnostic local midnight)', () => {
  it('returns local midnight of the given day', () => {
    // 13:30 local on 2026-09-04, whatever the machine's timezone/DST state.
    const iso = startOfTodayIso(new Date(2026, 8, 4, 13, 30))
    const parsed = new Date(iso)
    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(8) // September
    expect(parsed.getDate()).toBe(4)
    expect(parsed.getHours()).toBe(0)
    expect(parsed.getMinutes()).toBe(0)
    expect(parsed.getSeconds()).toBe(0)
    expect(parsed.getMilliseconds()).toBe(0)
  })

  it('is not affected by DST: a winter date gives the same local midnight', () => {
    // 23:59 local on 2026-01-15 (the opposite DST half of the year in
    // most timezones): still local midnight of that calendar day.
    const iso = startOfTodayIso(new Date(2026, 0, 15, 23, 59, 59, 999))
    const parsed = new Date(iso)
    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(0) // January
    expect(parsed.getDate()).toBe(15)
    expect(parsed.getHours()).toBe(0)
    expect(parsed.getMinutes()).toBe(0)
  })

  it('never moves past the given clock (it is the start of that day)', () => {
    expect(Date.parse(startOfTodayIso(FIXED_NOW)) <= Date.parse(NOW_ISO)).toBe(true)
  })
})

describe('isHappeningNow (window checks)', () => {
  const window = { starts_at: at(60), ends_at: at(180) } // 1h–3h after midnight

  it('is true when now is inside the window', () => {
    expect(isHappeningNow(window, at(120))).toBe(true)
  })

  it('is false when now is before the start', () => {
    expect(isHappeningNow(window, at(59))).toBe(false)
  })

  it('is false when now is after the end', () => {
    expect(isHappeningNow(window, at(181))).toBe(false)
  })

  it('is true at the start boundary (now === starts_at)', () => {
    expect(isHappeningNow(window, at(60))).toBe(true)
  })

  it('is true at the end boundary (now === ends_at)', () => {
    expect(isHappeningNow(window, at(180))).toBe(true)
  })
})

describe('filterFeed (feed invariants)', () => {
  it('keeps only posts in followed neighborhoods', () => {
    const posts: FeedPost[] = [
      { neighborhood_id: 'n1', host_profile_id: 'h1', starts_at: at(600) },
      { neighborhood_id: 'n9', host_profile_id: 'h2', starts_at: at(300) },
    ]
    const result = filterFeed(posts, FOLLOWED, new Set(), TODAY_ISO, NOW_ISO)
    expect(result.map((p) => p.host_profile_id)).toEqual(['h1'])
  })

  it('never returns posts hosted by a blocked profile', () => {
    const posts: FeedPost[] = [
      { neighborhood_id: 'n1', host_profile_id: 'host-blocked', starts_at: at(600) },
      { neighborhood_id: 'n1', host_profile_id: 'h1', starts_at: at(300) },
    ]
    const result = filterFeed(posts, FOLLOWED, BLOCKED_HOSTS, TODAY_ISO, NOW_ISO)
    expect(result.map((p) => p.host_profile_id)).toEqual(['h1'])
  })

  it('drops posts that start before local midnight of today', () => {
    const posts: FeedPost[] = [
      { neighborhood_id: 'n1', host_profile_id: 'h1', starts_at: at(-1) }, // yesterday
      { neighborhood_id: 'n1', host_profile_id: 'h2', starts_at: at(0) }, // midnight exactly
      { neighborhood_id: 'n1', host_profile_id: 'h3', starts_at: at(90) },
    ]
    const result = filterFeed(posts, FOLLOWED, new Set(), TODAY_ISO, NOW_ISO)
    expect(result.map((p) => p.host_profile_id)).toEqual(['h2', 'h3'])
  })

  it('orders by starts_at ascending', () => {
    const posts: FeedPost[] = [
      { neighborhood_id: 'n1', host_profile_id: 'a', starts_at: at(180) },
      { neighborhood_id: 'n1', host_profile_id: 'b', starts_at: at(60) },
      { neighborhood_id: 'n2', host_profile_id: 'c', starts_at: at(120) },
    ]
    const result = filterFeed(posts, FOLLOWED, new Set(), TODAY_ISO, NOW_ISO)
    expect(result.map((p) => p.host_profile_id)).toEqual(['b', 'c', 'a'])
  })

  it('applies all rules together and returns [] when nothing qualifies', () => {
    const posts: FeedPost[] = [
      { neighborhood_id: 'n9', host_profile_id: 'host-blocked', starts_at: at(-10) },
    ]
    expect(filterFeed(posts, FOLLOWED, BLOCKED_HOSTS, TODAY_ISO, NOW_ISO)).toEqual([])
  })

  it('never returns posts hidden by a moderator (hidden_at set)', () => {
    const posts: FeedPost[] = [
      { neighborhood_id: 'n1', host_profile_id: 'h1', starts_at: at(600), hidden_at: 'x' },
      { neighborhood_id: 'n1', host_profile_id: 'h2', starts_at: at(300), hidden_at: null },
      { neighborhood_id: 'n1', host_profile_id: 'h3', starts_at: at(400) }, // column absent (pre-0009)
    ]
    const result = filterFeed(posts, FOLLOWED, new Set(), TODAY_ISO, NOW_ISO)
    expect(result.map((p) => p.host_profile_id)).toEqual(['h2', 'h3'])
  })
})

describe('isHiddenPost (the moderator-hide predicate)', () => {
  it('is true when hidden_at is set', () => {
    expect(isHiddenPost({ hidden_at: '2026-09-09T00:00:00.000Z' })).toBe(true)
  })

  it('is false when hidden_at is null or absent', () => {
    expect(isHiddenPost({ hidden_at: null })).toBe(false)
    expect(isHiddenPost({})).toBe(false)
  })
})

/**
 * Minimal mock of the client surface queryUpcomingFeedWithClient uses:
 * from('playdates') returns a recording query builder — every filter call
 * (.in, .gte, .order, .is, .not) is recorded, in order, so tests can
 * assert the filter chain (the .is('hidden_at', null) hidden filter,
 * slice 5, sits on the same chain as the .not() block filter, slice 3).
 */
function makeFeedMockClient(rows: unknown[] = []): {
  client: SupabaseClient
  filters: string[]
} {
  const filters: string[] = []
  const builder = {
    select: (_cols: string) => builder,
    in: (col: string, values: string[]) => {
      filters.push(`in(${col}, ${values.join(',')})`)
      return builder
    },
    gte: (col: string, value: string) => {
      filters.push(`gte(${col}, ${value})`)
      return builder
    },
    order: (col: string, opts: { ascending: boolean }) => {
      filters.push(`order(${col}, ${opts.ascending})`)
      return builder
    },
    is: (col: string, value: unknown) => {
      filters.push(`is(${col}, ${String(value)})`)
      return builder
    },
    not: (col: string, op: string, values: string) => {
      filters.push(`not(${col}, ${op}, ${values})`)
      return builder
    },
    then: (onfulfilled?: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(onfulfilled),
  }
  const client = {
    from: (table: string) => {
      if (table !== 'playdates') throw new Error(`unexpected table: ${table}`)
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, filters }
}

describe('queryUpcomingFeedWithClient (mocked supabase client)', () => {
  const CUTOFF = '2026-09-04T00:00:00.000Z'

  it('always applies the .is("hidden_at", null) hidden filter', async () => {
    const { client, filters } = makeFeedMockClient()
    await queryUpcomingFeedWithClient(client, ['n1', 'n2'], CUTOFF, [])
    expect(filters).toContain('is(hidden_at, null)')
  })

  it('applies the .not() block filter only when the viewer has blocks', async () => {
    const withBlocks = makeFeedMockClient()
    await queryUpcomingFeedWithClient(withBlocks.client, ['n1'], CUTOFF, [
      'h-bad',
      'h-worse',
    ])
    expect(withBlocks.filters).toContain('not(host_profile_id, in, h-bad,h-worse)')

    const withoutBlocks = makeFeedMockClient()
    await queryUpcomingFeedWithClient(withoutBlocks.client, ['n1'], CUTOFF, [])
    expect(withoutBlocks.filters.some((f) => f.startsWith('not('))).toBe(false)
  })

  it('skips the query entirely when the viewer follows no neighborhoods', async () => {
    const { client, filters } = makeFeedMockClient([{ id: 'pd-1' }])
    expect(await queryUpcomingFeedWithClient(client, [], CUTOFF, [])).toEqual([])
    expect(filters).toEqual([])
  })

  it('returns the raw rows from the (mocked) query', async () => {
    const rows = [{ id: 'pd-1' }, { id: 'pd-2' }]
    const { client } = makeFeedMockClient(rows)
    expect(await queryUpcomingFeedWithClient(client, ['n1'], CUTOFF, [])).toEqual(rows)
  })
})

describe('validatePlaydateForm (the /new form rules)', () => {
  const valid: PlaydateFormValues = {
    title: 'Playground time',
    place: 'Green Lake',
    neighborhoodId: 'n1',
    startsAt: '2026-09-04T15:00',
    endsAt: '2026-09-04T17:00',
    ageHint: '',
    details: '',
  }

  it('accepts a fully valid form (no errors)', () => {
    expect(validatePlaydateForm(valid)).toEqual({})
  })

  it('requires a title (empty after trim)', () => {
    expect(validatePlaydateForm({ ...valid, title: '   ' }).title).toBeDefined()
  })

  it('rejects a title longer than 80 characters after trim', () => {
    expect(validatePlaydateForm({ ...valid, title: 'x'.repeat(81) }).title).toBeDefined()
    // 80 after trim is the boundary: 79 chars + trailing spaces is fine.
    expect(validatePlaydateForm({ ...valid, title: 'x'.repeat(79) + '  ' }).title).toBeUndefined()
    // Exactly 80 after trim is fine.
    expect(validatePlaydateForm({ ...valid, title: 'x'.repeat(80) }).title).toBeUndefined()
  })

  it('requires a place', () => {
    expect(validatePlaydateForm({ ...valid, place: '  ' }).place).toBeDefined()
  })

  it('requires a neighborhood', () => {
    expect(validatePlaydateForm({ ...valid, neighborhoodId: '' }).neighborhoodId).toBeDefined()
  })

  it('requires a start time', () => {
    expect(validatePlaydateForm({ ...valid, startsAt: '' }).startsAt).toBeDefined()
  })

  it('requires an end time', () => {
    expect(validatePlaydateForm({ ...valid, endsAt: '' }).endsAt).toBeDefined()
  })

  it('requires the end to be strictly after the start', () => {
    expect(validatePlaydateForm({ ...valid, endsAt: valid.startsAt }).endsAt).toBeDefined()
    expect(
      validatePlaydateForm({ ...valid, endsAt: '2026-09-04T14:00' }).endsAt,
    ).toBeDefined()
  })

  it('leaves age_hint and details optional', () => {
    expect(validatePlaydateForm(valid)).toEqual({})
    expect(
      validatePlaydateForm({ ...valid, ageHint: 'best for 2-5', details: 'Bring water' }),
    ).toEqual({})
  })
})