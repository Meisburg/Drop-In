import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeEndIso,
  computeStartIso,
  durationLabel,
  filterFeed,
  formatDistanceLabel,
  formatTimeLabel,
  haversineMiles,
  hostDistanceMiles,
  isDuration,
  isHappeningNow,
  isHiddenPost,
  isSteppedTime,
  PLAYDATE_DURATIONS_MINUTES,
  queryMyPlaydatesWithClient,
  queryUpcomingFeedWithClient,
  RADIUS_MILES_OPTIONS,
  startOfTodayIso,
  stepTimeMinutes,
  TIME_STEP_MINUTES,
  toDuplicatePrefill,
  validateHomeZip,
  validatePlaydateForm,
  validateRadiusMiles,
  withinRadius,
  type FeedPost,
  type PlaydateFormValues,
  type RadiusViewer,
  type ZipCoords,
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

/**
 * The seeded gazetteer shape (V2 slice 3): the two known WA zips from
 * migration 0012 — 98107 (West Seattle) and 98007 (Bellevue), ~11.5 mi
 * apart — enough to exercise inside/outside-radius and the unknown-zip
 * exclusion without a DB.
 */
const ZIP_COORDS: Map<string, ZipCoords> = new Map([
  ['98107', { lat: 47.66757, lng: -122.37789 }],
  ['98007', { lat: 47.61392, lng: -122.14378 }],
])
/** The viewer: home zip 98107, a generous 20-mi radius (98007 is inside it). */
const VIEWER: RadiusViewer = { homeZip: '98107', radiusMiles: 20 }
const NARROW_VIEWER: RadiusViewer = { homeZip: '98107', radiusMiles: 5 }
const BLOCKED_HOSTS = new Set(['host-blocked'])

/** A radius-feed post: the host's home zip (null = the host never set one). */
function postAt(
  hostZip: string | null,
  hostProfileId: string,
  minutesAfterMidnight: number,
): FeedPost {
  return {
    host_profile_id: hostProfileId,
    starts_at: at(minutesAfterMidnight),
    host: hostZip === null ? { home_zip: null } : { home_zip: hostZip },
  }
}

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

describe('filterFeed (the radius-feed invariants, V2 slice 3)', () => {
  it('keeps only posts whose host sits within the viewer\'s radius', () => {
    // 98007 is ~11.5 mi from 98107: inside the 20-mi radius, outside 5.
    const posts: FeedPost[] = [postAt('98007', 'h-far', 600), postAt('98107', 'h-near', 300)]
    const wide = filterFeed(posts, VIEWER, ZIP_COORDS, new Set(), TODAY_ISO, NOW_ISO)
    expect(wide.map((p) => p.host_profile_id)).toEqual(['h-near', 'h-far']) // starts_at order
    const narrow = filterFeed(posts, NARROW_VIEWER, ZIP_COORDS, new Set(), TODAY_ISO, NOW_ISO)
    expect(narrow.map((p) => p.host_profile_id)).toEqual(['h-near'])
  })

  it('excludes a host that has no home zip (coordinates are never invented)', () => {
    const posts: FeedPost[] = [
      postAt(null, 'h-nozip', 300),
      postAt('98107', 'h-ok', 400),
    ]
    const result = filterFeed(posts, VIEWER, ZIP_COORDS, new Set(), TODAY_ISO, NOW_ISO)
    expect(result.map((p) => p.host_profile_id)).toEqual(['h-ok'])
  })

  it('excludes a host whose zip is missing from the gazetteer', () => {
    const posts: FeedPost[] = [
      postAt('12345', 'h-unknown', 300),
      postAt('98107', 'h-ok', 400),
    ]
    const result = filterFeed(posts, VIEWER, ZIP_COORDS, new Set(), TODAY_ISO, NOW_ISO)
    expect(result.map((p) => p.host_profile_id)).toEqual(['h-ok'])
  })

  it('never returns posts hosted by a blocked profile', () => {
    const posts: FeedPost[] = [
      postAt('98107', 'host-blocked', 600),
      postAt('98107', 'h1', 300),
    ]
    const result = filterFeed(posts, VIEWER, ZIP_COORDS, BLOCKED_HOSTS, TODAY_ISO, NOW_ISO)
    expect(result.map((p) => p.host_profile_id)).toEqual(['h1'])
  })

  it('drops posts that start before local midnight of today', () => {
    const posts: FeedPost[] = [
      postAt('98107', 'h1', -1), // yesterday
      postAt('98107', 'h2', 0), // midnight exactly
      postAt('98107', 'h3', 90),
    ]
    const result = filterFeed(posts, VIEWER, ZIP_COORDS, new Set(), TODAY_ISO, NOW_ISO)
    expect(result.map((p) => p.host_profile_id)).toEqual(['h2', 'h3'])
  })

  it('orders by starts_at ascending', () => {
    const posts: FeedPost[] = [
      postAt('98107', 'a', 180),
      postAt('98107', 'b', 60),
      postAt('98007', 'c', 120),
    ]
    const result = filterFeed(posts, VIEWER, ZIP_COORDS, new Set(), TODAY_ISO, NOW_ISO)
    expect(result.map((p) => p.host_profile_id)).toEqual(['b', 'c', 'a'])
  })

  it('applies all rules together and returns [] when nothing qualifies', () => {
    const posts: FeedPost[] = [postAt('12345', 'host-blocked', -10)]
    expect(filterFeed(posts, VIEWER, ZIP_COORDS, BLOCKED_HOSTS, TODAY_ISO, NOW_ISO)).toEqual([])
  })

  it('never returns posts hidden by a moderator (hidden_at set)', () => {
    const posts: FeedPost[] = [
      postAt('98107', 'h1', 600),
      postAt('98107', 'h2', 300),
      postAt('98107', 'h3', 400),
    ]
    posts[0].hidden_at = 'x'
    posts[1].hidden_at = null
    // posts[2]: column absent (pre-0009)
    const result = filterFeed(posts, VIEWER, ZIP_COORDS, new Set(), TODAY_ISO, NOW_ISO)
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

describe('haversineMiles (the pure distance predicate — no PostGIS)', () => {
  it('is 0 for identical points', () => {
    const a: ZipCoords = { lat: 47.6, lng: -122.3 }
    expect(haversineMiles(a, a)).toBe(0)
  })

  it('measures the known WA pair (98107 West Seattle → 98007 Bellevue, ~11.5 mi)', () => {
    const miles = haversineMiles(ZIP_COORDS.get('98107')!, ZIP_COORDS.get('98007')!)
    expect(miles).toBeGreaterThan(11)
    expect(miles).toBeLessThan(12.5)
  })

  it('is symmetric', () => {
    expect(haversineMiles(ZIP_COORDS.get('98007')!, ZIP_COORDS.get('98107')!)).toBeCloseTo(
      haversineMiles(ZIP_COORDS.get('98107')!, ZIP_COORDS.get('98007')!),
      10,
    )
  })
})

describe('withinRadius (the boundary-inclusive predicate)', () => {
  it('is true at and under the radius', () => {
    expect(withinRadius(5, 5)).toBe(true)
    expect(withinRadius(4.9, 5)).toBe(true)
  })

  it('is false beyond the radius', () => {
    expect(withinRadius(5.1, 5)).toBe(false)
  })
})

describe('formatDistanceLabel (the card "N mi" label — integer miles)', () => {
  it('rounds to whole miles', () => {
    expect(formatDistanceLabel(4.4)).toBe('4 mi')
    expect(formatDistanceLabel(4.6)).toBe('5 mi')
    expect(formatDistanceLabel(0)).toBe('0 mi')
  })
})

describe('hostDistanceMiles (the feed key — null when unresolvable)', () => {
  it('returns the haversine distance for a known host + viewer zip pair', () => {
    const expected = haversineMiles(ZIP_COORDS.get('98107')!, ZIP_COORDS.get('98007')!)
    expect(hostDistanceMiles('98007', VIEWER, ZIP_COORDS)).toBeCloseTo(expected, 10)
  })

  it('is null when the host has no home zip', () => {
    expect(hostDistanceMiles(null, VIEWER, ZIP_COORDS)).toBeNull()
    expect(hostDistanceMiles(undefined, VIEWER, ZIP_COORDS)).toBeNull()
  })

  it('is null when the viewer has no home zip', () => {
    expect(hostDistanceMiles('98107', { homeZip: null, radiusMiles: 5 }, ZIP_COORDS)).toBeNull()
  })

  it('is null when either zip is missing from the gazetteer', () => {
    expect(hostDistanceMiles('12345', VIEWER, ZIP_COORDS)).toBeNull()
    expect(hostDistanceMiles('98107', { homeZip: '99999', radiusMiles: 5 }, ZIP_COORDS)).toBeNull()
  })
})

describe('validateHomeZip (the onboarding /profile zip rules)', () => {
  const KNOWN = new Set(['98107', '98007'])

  it('requires a zip (empty after trim)', () => {
    expect(validateHomeZip('   ', KNOWN)).toBe('Add your home zip.')
  })

  it('requires a 5-digit code', () => {
    expect(validateHomeZip('981', KNOWN)).not.toBeNull()
    expect(validateHomeZip('981070', KNOWN)).not.toBeNull()
    expect(validateHomeZip('ab107', KNOWN)).not.toBeNull()
  })

  it('rejects a zip missing from the gazetteer', () => {
    expect(validateHomeZip('12345', KNOWN)).not.toBeNull()
  })

  it('accepts a known zip (whitespace trimmed)', () => {
    expect(validateHomeZip(' 98107 ', KNOWN)).toBeNull()
  })
})

describe('validateRadiusMiles (the pinned 2–35 bounds, 0012 CHECK backstop)', () => {
  it('accepts every pinned option', () => {
    for (const miles of RADIUS_MILES_OPTIONS) {
      expect(validateRadiusMiles(miles)).toBeNull()
    }
  })

  it('rejects out-of-range and non-integer values', () => {
    expect(validateRadiusMiles(1)).not.toBeNull()
    expect(validateRadiusMiles(36)).not.toBeNull()
    expect(validateRadiusMiles(2.5)).not.toBeNull()
    expect(validateRadiusMiles(Number.NaN)).not.toBeNull()
  })
})

/**
 * Minimal mock of the client surface the injected-client queries use
 * (queryUpcomingFeedWithClient, queryMyPlaydatesWithClient):
 * from('playdates') returns a recording query builder — every filter call
 * (.in, .eq, .gte, .order, .is, .not) is recorded, in order, so tests can
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
    eq: (col: string, value: unknown) => {
      filters.push(`eq(${col}, ${String(value)})`)
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

describe('queryUpcomingFeedWithClient (mocked supabase client, V2 slice 3: distance-based)', () => {
  const CUTOFF = '2026-09-04T00:00:00.000Z'

  it('always applies the .is("hidden_at", null) hidden filter', async () => {
    const { client, filters } = makeFeedMockClient()
    await queryUpcomingFeedWithClient(client, CUTOFF, [])
    expect(filters).toContain('is(hidden_at, null)')
  })

  it('applies the .not() block filter only when the viewer has blocks', async () => {
    const withBlocks = makeFeedMockClient()
    await queryUpcomingFeedWithClient(withBlocks.client, CUTOFF, ['h-bad', 'h-worse'])
    expect(withBlocks.filters).toContain('not(host_profile_id, in, h-bad,h-worse)')

    const withoutBlocks = makeFeedMockClient()
    await queryUpcomingFeedWithClient(withoutBlocks.client, CUTOFF, [])
    expect(withoutBlocks.filters.some((f) => f.startsWith('not('))).toBe(false)
  })

  it('no longer filters by neighborhood (distance-based discovery — the radius runs client-side)', async () => {
    const { client, filters } = makeFeedMockClient()
    await queryUpcomingFeedWithClient(client, CUTOFF, [])
    expect(filters.some((f) => f.startsWith('in('))).toBe(false)
  })

  it('returns the raw rows from the (mocked) query', async () => {
    const rows = [{ id: 'pd-1' }, { id: 'pd-2' }]
    const { client } = makeFeedMockClient(rows)
    expect(await queryUpcomingFeedWithClient(client, CUTOFF, [])).toEqual(rows)
  })
})

describe('validatePlaydateForm (the /new form rules, V2 slice 1: date + stepper + chips)', () => {
  const valid: PlaydateFormValues = {
    title: 'Playground time',
    place: 'Green Lake',
    neighborhoodId: 'n1',
    startDate: '2026-09-04',
    startMinutes: 900, // 3:00 PM
    durationMinutes: 90, // 1.5h chip
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

  it('requires a start date (and rejects an unparseable one)', () => {
    expect(validatePlaydateForm({ ...valid, startDate: '' }).startDate).toBeDefined()
    expect(validatePlaydateForm({ ...valid, startDate: 'not-a-date' }).startDate).toBeDefined()
  })

  it('requires the start time on the 30-minute grid', () => {
    // Off-grid minutes (a typed-in 3:45) and out-of-range values fail.
    expect(validatePlaydateForm({ ...valid, startMinutes: 945 }).startMinutes).toBeDefined()
    expect(validatePlaydateForm({ ...valid, startMinutes: 1440 }).startMinutes).toBeDefined()
    expect(validatePlaydateForm({ ...valid, startMinutes: -30 }).startMinutes).toBeDefined()
    // Every grid point of the day passes.
    for (let m = 0; m < 24 * 60; m += TIME_STEP_MINUTES) {
      expect(validatePlaydateForm({ ...valid, startMinutes: m }).startMinutes).toBeUndefined()
    }
  })

  it('requires a duration chip', () => {
    expect(validatePlaydateForm({ ...valid, durationMinutes: 0 }).durationMinutes).toBeDefined()
    expect(validatePlaydateForm({ ...valid, durationMinutes: 45 }).durationMinutes).toBeDefined()
    for (const m of PLAYDATE_DURATIONS_MINUTES) {
      expect(validatePlaydateForm({ ...valid, durationMinutes: m }).durationMinutes).toBeUndefined()
    }
  })

  it('leaves age_hint and details optional', () => {
    expect(validatePlaydateForm(valid)).toEqual({})
    expect(
      validatePlaydateForm({ ...valid, ageHint: 'best for 2-5', details: 'Bring water' }),
    ).toEqual({})
  })
})

describe('duration math + the 30-minute stepper (pure, unit-tested)', () => {
  it('isSteppedTime accepts exactly the 30-minute grid of one day', () => {
    for (const m of [0, 30, 900, 1410]) expect(isSteppedTime(m)).toBe(true)
    for (const m of [1, 45, 1440, -30, 90.5, Number.NaN]) {
      expect(isSteppedTime(m)).toBe(false)
    }
  })

  it('stepTimeMinutes steps ±30 and wraps at midnight', () => {
    expect(stepTimeMinutes(900, TIME_STEP_MINUTES)).toBe(930)
    expect(stepTimeMinutes(930, -TIME_STEP_MINUTES)).toBe(900)
    expect(stepTimeMinutes(1410, TIME_STEP_MINUTES)).toBe(0) // 11:30 PM + 30
    expect(stepTimeMinutes(0, -TIME_STEP_MINUTES)).toBe(1410) // 12:00 AM − 30
  })

  it('formatTimeLabel gives 12-hour labels, wrapping past midnight', () => {
    expect(formatTimeLabel(0)).toBe('12:00 AM')
    expect(formatTimeLabel(600)).toBe('10:00 AM')
    expect(formatTimeLabel(930)).toBe('3:30 PM')
    expect(formatTimeLabel(1410)).toBe('11:30 PM')
    expect(formatTimeLabel(1470)).toBe('12:30 AM') // wraps
  })

  it('durationLabel names the chips (1h / 1.5h / 2h / 3h)', () => {
    expect(PLAYDATE_DURATIONS_MINUTES.map(durationLabel)).toEqual(['1h', '1.5h', '2h', '3h'])
  })

  it('isDuration accepts exactly the chips', () => {
    for (const m of PLAYDATE_DURATIONS_MINUTES) expect(isDuration(m)).toBe(true)
    expect(isDuration(0)).toBe(false)
    expect(isDuration(30)).toBe(false)
    expect(isDuration(240)).toBe(false)
  })

  it('computeStartIso turns a local date + minutes into the UTC instant', () => {
    const iso = computeStartIso('2026-09-04', 900) // local 3:00 PM
    const parsed = new Date(iso)
    // The instant must land at local 15:00 on 2026-09-04, whatever the
    // machine's timezone (same fixed-local-date discipline as the feed tests).
    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(8)
    expect(parsed.getDate()).toBe(4)
    expect(parsed.getHours()).toBe(15)
    expect(parsed.getMinutes()).toBe(0)
  })

  it('computeEndIso is start + duration (90-minute window)', () => {
    const start = computeStartIso('2026-09-04', 900)
    const end = computeEndIso('2026-09-04', 900, 90)
    expect(Date.parse(end) - Date.parse(start)).toBe(90 * 60_000)
    expect(new Date(end).getMinutes()).toBe(30)
    expect(new Date(end).getHours()).toBe(16) // local 4:30 PM
  })

  it('computeEndIso rolls into the next day when the window passes midnight', () => {
    const end = computeEndIso('2026-09-04', 1410, 180) // 11:30 PM + 3h
    const start = computeStartIso('2026-09-04', 1410)
    expect(Date.parse(end) - Date.parse(start)).toBe(180 * 60_000)
    // Local 2:30 AM on the NEXT calendar day — never clamped.
    const expected = new Date(2026, 8, 4, 23, 30).getTime() + 180 * 60_000
    expect(Date.parse(end)).toBe(expected)
  })
})

describe('toDuplicatePrefill (everything except the date/time)', () => {
  it('carries the post fields and drops date/time', () => {
    expect(
      toDuplicatePrefill({
        title: 'Playground time',
        place: 'Green Lake',
        neighborhood_id: 'n1',
        age_hint: '2-5',
        details: 'Bring water',
      }),
    ).toEqual({
      title: 'Playground time',
      place: 'Green Lake',
      neighborhoodId: 'n1',
      ageHint: '2-5',
      details: 'Bring water',
    })
  })

  it('maps null age_hint / details to empty strings', () => {
    expect(
      toDuplicatePrefill({
        title: 'T',
        place: 'P',
        neighborhood_id: 'n1',
        age_hint: null,
        details: null,
      }),
    ).toEqual({ title: 'T', place: 'P', neighborhoodId: 'n1', ageHint: '', details: '' })
  })
})

describe('queryMyPlaydatesWithClient (mocked supabase client)', () => {
  it('queries the host\'s own posts, newest first', async () => {
    const rows = [
      { id: 'pd-2', host_profile_id: 'me', title: 'Later', neighborhood_id: 'n1' },
      { id: 'pd-1', host_profile_id: 'me', title: 'Earlier', neighborhood_id: 'n1' },
    ]
    const { client, filters } = makeFeedMockClient(rows)
    const result = await queryMyPlaydatesWithClient(client, 'me')
    expect(result).toEqual(rows)
    expect(filters).toContain('eq(host_profile_id, me)')
    expect(filters).toContain('order(starts_at, false)')
  })

  it('returns [] when the host has no posts', async () => {
    const { client } = makeFeedMockClient([])
    expect(await queryMyPlaydatesWithClient(client, 'me')).toEqual([])
  })
})