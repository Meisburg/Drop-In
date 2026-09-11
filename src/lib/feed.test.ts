import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildGoingLine,
  computeEndIso,
  computeStartIso,
  durationLabel,
  dueToRefreshLastSeen,
  filterFeed,
  formatDayLabel,
  formatDistanceLabel,
  formatGuestLine,
  formatTimeLabel,
  groupByDay,
  GOING_CIRCLE_LIMIT,
  haversineMiles,
  hostDistanceMiles,
  isDuration,
  isEnded,
  isHappeningNow,
  isHiddenPost,
  isStartingSoon,
  isSteppedTime,
  kidsComingLine,
  localDayKey,
  mapsHref,
  PLAYDATE_DURATIONS_MINUTES,
  queryMyPlaydatesWithClient,
  queryUpcomingFeedWithClient,
  rainBadgeLabel,
  RADIUS_MILES_OPTIONS,
  resolveGuestListVisibility,
  startOfTodayIso,
  stepTimeMinutes,
  TIME_STEP_MINUTES,
  toDuplicatePrefill,
  validateHomeZip,
  validatePlaydateForm,
  validateRadiusMiles,
  withinRadius,
  type FeedPost,
  type GoingPinger,
  type PlaydateFormValues,
  type RadiusViewer,
  type ZipCoords,
} from './feed'
// V3 slice 9 (ticket 04): the retention db round-trips are unit-tested
// here too — importing db.ts runs its module-scope Supabase client
// creation (VITE_* env from the repo .env via Vite's env loading; the
// db-v3.test.ts note — the suite already imports db.ts elsewhere).
import {
  countPingsOnMyPostsWithClient,
  countPostsByHostWithClient,
  fetchGuestListWithClient,
  touchLastSeen,
} from './db'

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

describe('localDayKey (the day-section key, DST-agnostic local day)', () => {
  it('is the device-local YYYY-MM-DD of the instant', () => {
    expect(localDayKey(NOW_ISO)).toBe('2026-09-04') // local 12:00
    expect(localDayKey(at(0))).toBe('2026-09-04') // local midnight
    expect(localDayKey(at(1439))).toBe('2026-09-04') // 11:59 PM
    expect(localDayKey(at(1440))).toBe('2026-09-05') // 12:00 AM next day
  })

  it('never shifts with the machine timezone (fixed local date)', () => {
    // Local 2026-01-15 23:59, whatever the machine timezone / DST state.
    expect(localDayKey(new Date(2026, 0, 15, 23, 59).toISOString())).toBe('2026-01-15')
  })
})

describe('formatDayLabel ("Today" / "Tomorrow" / "Sat, Sep 12")', () => {
  it('is "Today" for the same local day (2026-09-04 is a Friday)', () => {
    expect(formatDayLabel(at(1200), NOW_ISO)).toBe('Today') // local 8:00 PM
  })

  it('is "Tomorrow" for the next local day', () => {
    expect(formatDayLabel(at(1500), NOW_ISO)).toBe('Tomorrow') // Sat 1:00 AM
  })

  it('rolls at the midnight boundary', () => {
    expect(formatDayLabel(at(1439), NOW_ISO)).toBe('Today') // 11:59 PM
    expect(formatDayLabel(at(1440), NOW_ISO)).toBe('Tomorrow') // 12:00 AM
  })

  it('is a fixed English "Www, Mmm D" label for later days (locale-independent)', () => {
    // 2026-09-12 is a Saturday; 2026-12-25 is a Friday.
    expect(formatDayLabel(new Date(2026, 8, 12, 15, 0).toISOString(), NOW_ISO)).toBe(
      'Sat, Sep 12',
    )
    expect(formatDayLabel(new Date(2026, 11, 25, 9, 0).toISOString(), NOW_ISO)).toBe(
      'Fri, Dec 25',
    )
  })

  it('"Tomorrow" is the next local day even across a DST boundary (winter case)', () => {
    const now = new Date(2026, 0, 15, 23, 30).toISOString()
    expect(formatDayLabel(new Date(2026, 0, 16, 9, 0).toISOString(), now)).toBe('Tomorrow')
  })
})

describe('isEnded (ends_at <= nowIso)', () => {
  const window = { starts_at: at(60), ends_at: at(180) } // local 1:00 PM - 3:00 PM

  it('is false while the window is still running', () => {
    expect(isEnded(window, at(179))).toBe(false)
  })

  it('is true at the end boundary (now === ends_at)', () => {
    expect(isEnded(window, at(180))).toBe(true)
  })

  it('is true after the end', () => {
    expect(isEnded(window, at(181))).toBe(true)
  })

  it('is false before the start (an upcoming post is not ended)', () => {
    expect(isEnded(window, at(0))).toBe(false)
  })
})

describe('isStartingSoon (nowIso < starts_at <= nowIso + 60 min)', () => {
  // NOW_ISO is local 12:00 PM (minute 720); the window is 12:01 PM - 1:00 PM.
  it('is true just inside the 60-minute window', () => {
    expect(isStartingSoon({ starts_at: at(721) }, NOW_ISO)).toBe(true) // 12:01 PM
  })

  it('is true at the window edge (starts exactly 60 min out)', () => {
    expect(isStartingSoon({ starts_at: at(780) }, NOW_ISO)).toBe(true) // 1:00 PM
  })

  it('is false just beyond the window', () => {
    expect(isStartingSoon({ starts_at: at(781) }, NOW_ISO)).toBe(false) // 1:01 PM
  })

  it('is false when the post has already started ("happening now" instead)', () => {
    expect(isStartingSoon({ starts_at: at(719) }, NOW_ISO)).toBe(false) // 11:59 AM
    expect(isStartingSoon({ starts_at: at(720) }, NOW_ISO)).toBe(false) // starts_at === nowIso
  })

  it('is false for a post that starts the next day', () => {
    expect(isStartingSoon({ starts_at: at(1441) }, NOW_ISO)).toBe(false)
  })
})

describe('groupByDay (the promoted day-section grouping, nowIso seam)', () => {
  type DayPost = { id: string; starts_at: string }

  it('groups starts_at-ascending posts by local day in ascending start-of-day order', () => {
    const posts: DayPost[] = [
      { id: 'a', starts_at: at(120) }, // Fri 2:00 AM (today)
      { id: 'b', starts_at: at(1400) }, // Fri 11:20 PM
      { id: 'c', starts_at: at(1500) }, // Sat 1:00 AM (tomorrow)
      { id: 'd', starts_at: at(1560) }, // Sat 2:00 AM
      { id: 'e', starts_at: at(2880 + 120) }, // Sun 2:00 PM
    ]
    const groups = groupByDay(posts, NOW_ISO)
    expect(groups.map((g) => g.key)).toEqual(['2026-09-04', '2026-09-05', '2026-09-06'])
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Tomorrow', 'Sun, Sep 6'])
    expect(groups[0].posts.map((p) => p.id)).toEqual(['a', 'b'])
    expect(groups[1].posts.map((p) => p.id)).toEqual(['c', 'd'])
    expect(groups[2].posts.map((p) => p.id)).toEqual(['e'])
  })

  it('labels far days with the fixed English "Www, Mmm D" form', () => {
    const groups = groupByDay(
      [{ id: 'x', starts_at: new Date(2026, 8, 12, 15, 0).toISOString() }],
      NOW_ISO,
    )
    expect(groups[0].label).toBe('Sat, Sep 12')
  })

  it('keeps input order within a group', () => {
    const groups = groupByDay(
      [
        { id: 'b', starts_at: at(1400) },
        { id: 'a', starts_at: at(120) },
      ],
      NOW_ISO,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].posts.map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('collects non-contiguous same-day posts into one group (input order kept)', () => {
    const groups = groupByDay(
      [
        { id: 't1', starts_at: at(120) },
        { id: 'm', starts_at: at(1500) },
        { id: 't2', starts_at: at(1400) },
      ],
      NOW_ISO,
    )
    expect(groups.map((g) => g.key)).toEqual(['2026-09-04', '2026-09-05'])
    expect(groups[0].posts.map((p) => p.id)).toEqual(['t1', 't2'])
  })

  it('returns [] for an empty feed', () => {
    expect(groupByDay([], NOW_ISO)).toEqual([])
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

describe('rainBadgeLabel (the "Rain likely" threshold, V3 ticket 02)', () => {
  it('shows "Rain likely" exactly at the 50 threshold (>=, not >)', () => {
    expect(rainBadgeLabel(50)).toBe('Rain likely')
  })

  it('shows "Rain likely" above the threshold', () => {
    expect(rainBadgeLabel(72)).toBe('Rain likely')
    expect(rainBadgeLabel(100)).toBe('Rain likely')
  })

  it('is null just below the threshold (no badge under 50%)', () => {
    expect(rainBadgeLabel(49)).toBeNull()
    expect(rainBadgeLabel(0)).toBeNull()
  })

  it('is null for a missing probability (a failed / out-of-range fetch — silently absent)', () => {
    expect(rainBadgeLabel(null)).toBeNull()
  })
})

describe('buildGoingLine (the card\'s going line, V3 ticket 07)', () => {
  /** `n` pingers; withAvatars=false models the no-avatar fallback. */
  function pingers(n: number, withAvatars = true): GoingPinger[] {
    return Array.from({ length: n }, (_, i) => ({
      avatarUrl: withAvatars ? `https://x/${i}.jpg` : null,
      displayName: `p${i}`,
    }))
  }

  it('is null for a count of 0 (the line is hidden — "0 going" is not a state)', () => {
    expect(buildGoingLine(0, [], GOING_CIRCLE_LIMIT)).toBeNull()
  })

  // V6: the kids half of the line (migration 0027's batched count feeds it).
  describe('the kids count', () => {
    it('is omitted entirely when nobody has said they are bringing kids', () => {
      expect(buildGoingLine(2, pingers(2), GOING_CIRCLE_LIMIT, 0)!.label).toBe('2 going')
      expect(buildGoingLine(2, pingers(2), GOING_CIRCLE_LIMIT)!.label).toBe('2 going')
    })

    it('reads "N going · M kids" when kids are coming', () => {
      expect(buildGoingLine(2, pingers(2), GOING_CIRCLE_LIMIT, 3)!.label).toBe('2 going · 3 kids')
    })

    it('says "1 kid", not "1 kids"', () => {
      expect(buildGoingLine(1, pingers(1), GOING_CIRCLE_LIMIT, 1)!.label).toBe('1 going · 1 kid')
    })

    it('ignores a nonsense negative count rather than printing it', () => {
      expect(buildGoingLine(1, pingers(1), GOING_CIRCLE_LIMIT, -2)!.label).toBe('1 going')
    })

    it('leaves the circles and overflow to the parents alone', () => {
      const line = buildGoingLine(5, pingers(5), GOING_CIRCLE_LIMIT, 4)!
      expect(line.circles).toHaveLength(3)
      expect(line.overflow).toBe(2)
      expect(line.label).toBe('5 going · 4 kids')
    })
  })

  it('labels exactly 3 pingers with no overflow', () => {
    const line = buildGoingLine(3, pingers(3), GOING_CIRCLE_LIMIT)
    expect(line).not.toBeNull()
    expect(line!.label).toBe('3 going')
    expect(line!.circles).toHaveLength(3)
    expect(line!.circles).toEqual([
      { avatarUrl: 'https://x/0.jpg', initial: 'P' },
      { avatarUrl: 'https://x/1.jpg', initial: 'P' },
      { avatarUrl: 'https://x/2.jpg', initial: 'P' },
    ])
    expect(line!.overflow).toBe(0)
  })

  it('caps at the limit with the "+N" overflow math (5 → 3 circles + "+2")', () => {
    const line = buildGoingLine(5, pingers(5), GOING_CIRCLE_LIMIT)!
    expect(line.circles).toHaveLength(3)
    expect(line.overflow).toBe(2)
    expect(line.label).toBe('5 going')
  })

  it('uses the display-name initial (upper-cased) when there is no avatar', () => {
    const line = buildGoingLine(1, [{ avatarUrl: null, displayName: 'sam' }], GOING_CIRCLE_LIMIT)!
    expect(line.circles).toEqual([{ avatarUrl: null, initial: 'S' }])
  })

  it('falls back to "?" for an empty display name', () => {
    const line = buildGoingLine(1, [{ avatarUrl: null, displayName: '' }], GOING_CIRCLE_LIMIT)!
    expect(line.circles).toEqual([{ avatarUrl: null, initial: '?' }])
  })

  it('labels a single pinger "1 going"', () => {
    expect(buildGoingLine(1, pingers(1), GOING_CIRCLE_LIMIT)!.label).toBe('1 going')
  })

  it('keeps the pings\' order (the circles are the first `limit`)', () => {
    const line = buildGoingLine(5, pingers(5), GOING_CIRCLE_LIMIT)!
    expect(line.circles.map((c) => c.avatarUrl)).toEqual([
      'https://x/0.jpg',
      'https://x/1.jpg',
      'https://x/2.jpg',
    ])
  })
})

describe('mapsHref (V3 slice 5, ticket 08: the detail page\'s tappable Maps link)', () => {
  it('URL-encodes the comma-joined "place, address" query (spaces + commas)', () => {
    expect(mapsHref('Green Lake playground', '7200 4th Ave NE, Seattle')).toBe(
      'https://www.google.com/maps?q=Green%20Lake%20playground%2C%207200%204th%20Ave%20NE%2C%20Seattle',
    )
  })

  it('URL-encodes unicode in both halves', () => {
    expect(mapsHref('Zürich Spielplatz', 'Café str. 12')).toBe(
      'https://www.google.com/maps?q=Z%C3%BCrich%20Spielplatz%2C%20Caf%C3%A9%20str.%2012',
    )
  })

  it('returns null for a null, empty, or whitespace-only address (no invented query)', () => {
    expect(mapsHref('Green Lake playground', null)).toBeNull()
    expect(mapsHref('Green Lake playground', undefined)).toBeNull()
    expect(mapsHref('Green Lake playground', '')).toBeNull()
    expect(mapsHref('Green Lake playground', '   ')).toBeNull()
  })

  it('uses the trimmed address in the query (a stored value is never whitespace-padded)', () => {
    expect(mapsHref('Green Lake playground', '  7200 4th Ave NE  ')).toBe(
      'https://www.google.com/maps?q=Green%20Lake%20playground%2C%207200%204th%20Ave%20NE',
    )
  })
})

describe('kidsComingLine (V3 slice 6, ticket 09: the detail page\'s "Kids coming" line)', () => {
  it('returns null for 0 kids (the line is hidden)', () => {
    expect(kidsComingLine([])).toBeNull()
  })

  it('renders one kid as "Name · Age"', () => {
    expect(kidsComingLine([{ name: 'Bernie', age: 6 }])).toBe('Bernie · 6')
  })

  it('joins kids with ", " in input order ("Bernie · 6, Lily · 4")', () => {
    expect(
      kidsComingLine([
        { name: 'Bernie', age: 6 },
        { name: 'Lily', age: 4 },
      ]),
    ).toBe('Bernie · 6, Lily · 4')
  })

  it('omits the age for a null age (never " · null")', () => {
    expect(
      kidsComingLine([
        { name: 'Bernie', age: null },
        { name: 'Lily', age: 4 },
      ]),
    ).toBe('Bernie, Lily · 4')
  })

  it('skips empty-name kids (and returns null when nothing remains)', () => {
    expect(kidsComingLine([{ name: '   ', age: 6 }, { name: 'Lily', age: 4 }])).toBe('Lily · 4')
    expect(kidsComingLine([{ name: '', age: 6 }])).toBeNull()
  })
})

describe('dueToRefreshLastSeen (the >= 1h cursor throttle, V3 slice 9, ticket 04)', () => {
  const NOW = '2026-09-10T12:00:00.000Z'
  const WINDOW_MS = 3_600_000 // the 1h pin
  const hoursAgo = (hours: number) =>
    new Date(Date.parse(NOW) - hours * 3_600_000).toISOString()

  it('is due when the cursor is null (the first visit establishes it)', () => {
    expect(dueToRefreshLastSeen(null, NOW, WINDOW_MS)).toBe(true)
  })

  it('is not due within the window', () => {
    expect(dueToRefreshLastSeen(hoursAgo(0.5), NOW, WINDOW_MS)).toBe(false)
  })

  it('is due exactly at the window (>=, not >)', () => {
    expect(dueToRefreshLastSeen(hoursAgo(1), NOW, WINDOW_MS)).toBe(true)
  })

  it('is due beyond the window', () => {
    expect(dueToRefreshLastSeen(hoursAgo(2), NOW, WINDOW_MS)).toBe(true)
  })
})

/**
 * Minimal recording mock of the client surface the V3 slice 9 (ticket
 * 04) retention queries use (countPingsOnMyPostsWithClient,
 * countPostsByHostWithClient, touchLastSeen — the makeFeedMockClient /
 * db-v3.test.ts style): each from(table) returns a thenable builder
 * recording every call (.select, .eq, .in, .gte, .update) in order, so
 * tests can assert the query SHAPE — the playdates→going_pings
 * sequence, countPostsByHost's no-filter count chain, and
 * touchLastSeen's plain update. Results are table-keyed config (the
 * counts ride on the select's count option).
 */
interface RetentionMockConfig {
  /** The playdates select's exact count (countPostsByHost's N). */
  playdatesCount?: number | null
  /** Rows the playdates select returns (the post-id list). */
  playdatesRows?: unknown[]
  /** The going_pings select's exact count (the banner's N). */
  goingPingsCount?: number | null
  /** Models a failing playdates/going_pings query (pre-apply 42703). */
  queryError?: { code: string; message: string }
  /** Models a failing profiles update (pre-0024-apply missing column). */
  updateError?: { code: string; message: string }
}

function makeRetentionMockClient(
  config: RetentionMockConfig = {},
): { client: SupabaseClient; calls: string[] } {
  const calls: string[] = []
  const asError = (err: { code: string; message: string } | undefined): Error | null =>
    err === undefined
      ? null
      : Object.assign(new Error(err.message), { code: err.code })
  const makeBuilder = (table: 'playdates' | 'going_pings' | 'profiles') => {
    const builder = {
      select: (cols: string, opts?: { count?: string; head?: boolean }) => {
        calls.push(
          opts?.count !== undefined
            ? `${table}.select(${cols}, count:${opts.count})`
            : `${table}.select(${cols})`,
        )
        return builder
      },
      eq: (col: string, value: unknown) => {
        calls.push(`${table}.eq(${col}, ${String(value)})`)
        return builder
      },
      in: (col: string, values: string[]) => {
        calls.push(`${table}.in(${col}, ${values.join(',')})`)
        return builder
      },
      gte: (col: string, value: string) => {
        calls.push(`${table}.gte(${col}, ${value})`)
        return builder
      },
      update: (payload: Record<string, unknown>) => {
        calls.push(`${table}.update(${JSON.stringify(payload)})`)
        return builder
      },
      then: (
        onfulfilled?: (value: { data: unknown[]; error: unknown; count: number | null }) => unknown,
      ) => {
        const value =
          table === 'playdates'
            ? {
                data: config.playdatesRows ?? ([] as unknown[]),
                error: asError(config.queryError),
                count: config.playdatesCount ?? null,
              }
            : table === 'going_pings'
              ? {
                  data: [] as unknown[],
                  error: asError(config.queryError),
                  count: config.goingPingsCount ?? null,
                }
              : {
                  data: [] as unknown[],
                  error: asError(config.updateError),
                  count: null,
                }
        return Promise.resolve(value).then(onfulfilled)
      },
    }
    return builder
  }
  const client = {
    from: (table: string) => {
      if (table !== 'playdates' && table !== 'going_pings' && table !== 'profiles') {
        throw new Error(`unexpected table: ${table}`)
      }
      return makeBuilder(table as 'playdates' | 'going_pings' | 'profiles')
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

describe('countPingsOnMyPostsWithClient (the banner\'s N, V3 slice 9, ticket 04)', () => {
  const SINCE = '2026-09-10T11:00:00.000Z'

  it('returns 0 for a null cursor WITHOUT issuing any query', async () => {
    const { client, calls } = makeRetentionMockClient({ playdatesRows: [{ id: 'pd-1' }] })
    expect(await countPingsOnMyPostsWithClient(client, 'me', null)).toBe(0)
    expect(calls).toEqual([])
  })

  it('returns 0 for a host with no posts (no going_pings query)', async () => {
    const { client, calls } = makeRetentionMockClient({ playdatesRows: [] })
    expect(await countPingsOnMyPostsWithClient(client, 'me', SINCE)).toBe(0)
    expect(calls).toEqual(['playdates.select(id)', 'playdates.eq(host_profile_id, me)'])
  })

  it('counts the pings on the host\'s posts created after the cursor (the recorded chain)', async () => {
    const { client, calls } = makeRetentionMockClient({
      playdatesRows: [{ id: 'pd-1' }, { id: 'pd-2' }],
      goingPingsCount: 3,
    })
    expect(await countPingsOnMyPostsWithClient(client, 'me', SINCE)).toBe(3)
    expect(calls).toEqual([
      'playdates.select(id)',
      'playdates.eq(host_profile_id, me)',
      'going_pings.select(profile_id, count:exact)',
      'going_pings.in(playdate_id, pd-1,pd-2)',
      'going_pings.gte(created_at, 2026-09-10T11:00:00.000Z)',
    ])
  })

  it('rejects on a query error (the caller catches — the banner degrades to hidden)', async () => {
    const { client } = makeRetentionMockClient({
      queryError: { code: '42703', message: 'column "created_at" does not exist' },
    })
    await expect(countPingsOnMyPostsWithClient(client, 'me', SINCE)).rejects.toThrow(
      'column "created_at" does not exist',
    )
  })
})

describe('countPostsByHostWithClient (the all-time hosted count, V3 slice 9, ticket 04)', () => {
  it('returns the exact count; the recorded chain is select+eq ONLY (no status/end filter)', async () => {
    const { client, calls } = makeRetentionMockClient({ playdatesCount: 4 })
    expect(await countPostsByHostWithClient(client, 'me')).toBe(4)
    expect(calls).toEqual(['playdates.select(id, count:exact)', 'playdates.eq(host_profile_id, me)'])
  })

  it('rejects on a query error (the caller degrades to a hidden line)', async () => {
    const { client } = makeRetentionMockClient({
      queryError: { code: '42P01', message: 'relation "playdates" does not exist' },
    })
    await expect(countPostsByHostWithClient(client, 'me')).rejects.toThrow(
      'relation "playdates" does not exist',
    )
  })
})

describe('touchLastSeen (the fire-and-forget restamp, V3 slice 9, ticket 04)', () => {
  it('issues a plain profiles update (no RETURNING) + the id filter', async () => {
    const { client, calls } = makeRetentionMockClient()
    await touchLastSeen(client, 'me')
    // The last_seen_at value is "now-ish" (new Date().toISOString()) —
    // assert the shape, not the timestamp.
    expect(calls[0]).toContain('profiles.update(')
    expect(calls[0]).toContain('"last_seen_at"')
    expect(calls[1]).toBe('profiles.eq(id, me)')
    expect(calls).toHaveLength(2)
  })

  it('rejects on a 42703 (pre-0024-apply missing column — the caller swallows)', async () => {
    const { client } = makeRetentionMockClient({
      updateError: { code: '42703', message: 'column "last_seen_at" does not exist' },
    })
    await expect(touchLastSeen(client, 'me')).rejects.toThrow(
      'column "last_seen_at" does not exist',
    )
  })
})

/**
 * Minimal mock of the client surface the ticket-05 guest-list RPC uses
 * (fetchGuestListWithClient — db.ts): records the rpc(name, args) call and
 * resolves a canned { data, error } (the 0025 pre-apply 404 is modeled by
 * a non-null error; an empty/absent result by data null).
 */
function makeRpcMockClient(
  result: { data?: unknown; error?: unknown },
): { client: SupabaseClient; calls: Array<{ name: string; args: Record<string, unknown> }> } {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const client = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

describe('resolveGuestListVisibility (V3 slice 10, ticket 05)', () => {
  it('shows the named list for the host (count > 0)', () => {
    expect(resolveGuestListVisibility(true, false, 2)).toBe(true)
  })
  it('shows the named list for a pinger (count > 0)', () => {
    expect(resolveGuestListVisibility(false, true, 1)).toBe(true)
  })
  it('hides the named list from a stranger (count-only)', () => {
    expect(resolveGuestListVisibility(false, false, 5)).toBe(false)
  })
  it('hides the named list when count = 0 (even for the host)', () => {
    expect(resolveGuestListVisibility(true, false, 0)).toBe(false)
  })
})

describe('formatGuestLine (V3 slice 10, ticket 05)', () => {
  it('host: up to 3 names then "+ N more"', () => {
    expect(formatGuestLine(['A', 'B', 'C'], null, true)).toBe('Going: A, B, C')
    expect(formatGuestLine(['A', 'B', 'C', 'D', 'E'], null, true)).toBe(
      'Going: A, B, C + 2 more',
    )
  })
  it('pinger: "You" + the others (self dropped)', () => {
    expect(formatGuestLine(['me', 'B', 'C'], 'me', false)).toBe('You, B, C')
    expect(formatGuestLine(['me', 'B', 'C', 'D', 'E'], 'me', false)).toBe(
      'You, B, C + 2 more',
    )
  })
  it('a pinger who is the only attendee renders just "You"', () => {
    expect(formatGuestLine(['me'], 'me', false)).toBe('You')
  })
  it('a pinger whose own name is absent from the list: "You" + all', () => {
    expect(formatGuestLine(['B', 'C'], 'me', false)).toBe('You, B, C')
  })
})

describe('fetchGuestListWithClient (V3 slice 10, ticket 05)', () => {
  it('returns the names array (and records the rpc call)', async () => {
    const { client, calls } = makeRpcMockClient({ data: ['a', 'b'] })
    await expect(fetchGuestListWithClient(client, 'p1')).resolves.toEqual(['a', 'b'])
    expect(calls).toEqual([{ name: 'get_guest_list', args: { p_id: 'p1' } }])
  })
  it('a null/empty result -> []', async () => {
    const { client } = makeRpcMockClient({ data: null })
    await expect(fetchGuestListWithClient(client, 'p1')).resolves.toEqual([])
  })
  it('propagates the rpc error (pre-0025-apply 404)', async () => {
    const { client } = makeRpcMockClient({ error: new Error('404: function does not exist') })
    await expect(fetchGuestListWithClient(client, 'p1')).rejects.toThrow()
  })
})
