import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildGoingLine,
  buildWhileAwayItems,
  computeEndIso,
  computeStartIso,
  daySectionIso,
  defaultStartDateIso,
  durationChipForUntilNextHour,
  durationLabel,
  dueToRefreshLastSeen,
  emptyRadiusCopy,
  filterFeed,
  formatDayLabel,
  formatDistanceLabel,
  formatGuestLine,
  formatStartDayLabel,
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
  isStillAhead,
  kidsComingLine,
  localDayKey,
  mapsHref,
  MORE_OPTIONS_FIELDS,
  moreOptionsHoldsError,
  neighborhoodIdField,
  nextSlotMinutes,
  partitionPostsByTime,
  PAST_DROP_INS_HREF,
  PAST_DROP_INS_LABEL,
  PLAYDATE_DURATIONS_MINUTES,
  playdateEditFieldsChanged,
  playdateEditKidIdsChanged,
  playdateFormValuesFromPost,
  queryMyPlaydatesWithClient,
  queryRecentOwnPlacesWithClient,
  queryUpcomingFeedWithClient,
  rainBadgeLabel,
  RADIUS_MAX_MILES,
  RADIUS_MILES_OPTIONS,
  radiusEscapes,
  coordNumber,
  placeDistanceMiles,
  postDistanceMiles,
  recentPlacesFrom,
  RECENT_PLACES_SCANNED,
  RECENT_PLACES_SHOWN,
  resolveGuestListVisibility,
  SEE_ALL_RADIUS_MILES,
  shouldRefreshFeed,
  startOfTodayIso,
  stepTimeMinutes,
  suggestedDurationMinutes,
  TIME_STEP_MINUTES,
  toDuplicatePrefill,
  validateHomeZip,
  validatePlaydateForm,
  validateRadiusMiles,
  WHILE_AWAY_ITEM_LIMIT,
  WIDEN_RADIUS_MILES,
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
  countPostsByHostWithClient,
  fetchGuestListWithClient,
  HOST_POSTS_LIMIT,
  listCommentsOnPostsWithClient,
  listMyPingedPostsWithClient,
  listMyPostRefsWithClient,
  listPostsByHostWithClient,
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

/**
 * A radius-feed post: the host's home zip (null = the host never set one) and
 * its window. `minutesAfterMidnight` is the START (the `at()` grid); the post
 * ends `durationMinutes` later (default 60 — the /new "1h" chip).
 *
 * V9 ticket 04: the feed's cutoff is the post's own END against NOW (the fixed
 * noon, at(720)), so the end is part of every fixture now. That is also why the
 * "kept" fixtures below sit AFTER noon: a post whose window closed before noon
 * is, correctly, dropped — asserting the radius/block/hide rules against rows
 * the filter legitimately excludes would prove nothing about those rules.
 */
function postAt(
  hostZip: string | null,
  hostProfileId: string,
  minutesAfterMidnight: number,
  durationMinutes: number = 60,
): FeedPost {
  return {
    host_profile_id: hostProfileId,
    starts_at: at(minutesAfterMidnight),
    ends_at: at(minutesAfterMidnight + durationMinutes),
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

describe('isStillAhead (V9 ticket 04: the feed\'s inclusion rule — NOT ended)', () => {
  // The same window the isEnded suite uses: 1:00 PM - 3:00 PM on the fixed day,
  // with NOW_ISO at local noon.
  const window = { starts_at: at(780), ends_at: at(900) }

  it('is true for a post that has not started yet', () => {
    expect(isStillAhead(window, at(0))).toBe(true) // midnight
    expect(isStillAhead(window, at(779))).toBe(true) // one minute before the start
  })

  it('is true for a drop-in that is HAPPENING NOW (started, not ended)', () => {
    // The AC's whole point (the trap in the ticket): "a drop-in that has
    // STARTED but not ended STAYS — those are the ones a parent can still walk
    // to". A `starts_at >= now` cutoff would delete exactly this post.
    expect(isStillAhead(window, at(780))).toBe(true) // at the start
    expect(isStillAhead(window, at(840))).toBe(true) // mid-window
  })

  it('is false at the end boundary (ends_at === nowIso is ENDED)', () => {
    // ONE definition of the boundary, pinned: `ends_at <= nowIso` is ended
    // (isEnded), so exactly at the end the post is NOT ahead — the same
    // boundary partitionPostsByTime (the profile Past list) and the card's
    // "Ended" chip use.
    expect(isStillAhead(window, at(900))).toBe(false)
    expect(isEnded(window, at(900))).toBe(true)
  })

  it('is false after the end', () => {
    expect(isStillAhead(window, at(901))).toBe(false)
  })

  it('is the exact complement of isEnded (never a second, drifting comparison)', () => {
    const other = { starts_at: at(-600), ends_at: at(1000) } // an all-night window
    for (const minute of [-1, 0, 720, 900, 1000, 1001, 1440]) {
      const now = at(minute)
      expect(isStillAhead(window, now)).toBe(!isEnded(window, now))
      expect(isStillAhead(other, now)).toBe(!isEnded(other, now))
    }
  })

  it('reads the SAME column as isEnded: the start time is irrelevant to the cutoff', () => {
    // Two posts that share an end are both ahead/ended together, whatever their
    // starts say — the property the DB query's `.gt('ends_at', cutoff)` and the
    // pure filter must share.
    const earlyStart = { starts_at: at(-2000), ends_at: at(900) }
    const lateStart = { starts_at: at(890), ends_at: at(900) }
    expect(isStillAhead(earlyStart, at(899))).toBe(isStillAhead(lateStart, at(899)))
    expect(isStillAhead(earlyStart, at(900))).toBe(isStillAhead(lateStart, at(900)))
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

describe('daySectionIso (V9 ticket 04: the day a feed row belongs to)', () => {
  it('is the post’s own start while it is still in the future', () => {
    expect(daySectionIso({ starts_at: at(780) }, NOW_ISO)).toBe(at(780))
    expect(daySectionIso({ starts_at: at(1440) }, NOW_ISO)).toBe(at(1440))
  })

  it('is clamped to now once the post has started', () => {
    // Already started (earlier today, or a day earlier): the row belongs to the
    // day the parent is looking at.
    expect(daySectionIso({ starts_at: at(700) }, NOW_ISO)).toBe(NOW_ISO)
    expect(daySectionIso({ starts_at: at(-30) }, NOW_ISO)).toBe(NOW_ISO) // 11:30 PM yesterday
    expect(daySectionIso({ starts_at: at(-1440) }, NOW_ISO)).toBe(NOW_ISO)
  })

  it('does not clamp a post starting exactly at nowIso (it is already today)', () => {
    expect(daySectionIso({ starts_at: NOW_ISO }, NOW_ISO)).toBe(NOW_ISO)
  })

  it('falls back to the raw start on an unparseable clock (never a second rule)', () => {
    expect(daySectionIso({ starts_at: at(780) }, 'nope')).toBe(at(780))
    expect(daySectionIso({ starts_at: 'nope' }, NOW_ISO)).toBe('nope')
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

  it('V9 ticket 04: a still-running post that STARTED YESTERDAY groups under Today, not under a past-dated header', () => {
    // The review's case, exactly: 11:30 PM + 3h = 2:30 AM is a window /new can
    // produce (computeEndIso pins the roll-over), the feed's cutoff admits it
    // (it has not ended), and rows arrive starts_at-ascending — so without the
    // clamp this group is the FIRST thing on the feed, headed "Fri, Sep 11",
    // holding one card badged "Happening now". It was unreachable before this
    // ticket (the old start-of-today cutoff dropped the row).
    const overnight: DayPost = { id: 'overnight', starts_at: at(-30) } // yesterday 11:30 PM
    const today: DayPost = { id: 'today', starts_at: at(780) }
    const groups = groupByDay([overnight, today], NOW_ISO)
    expect(groups.map((g) => g.key)).toEqual(['2026-09-04'])
    expect(groups[0].label).toBe('Today')
    // Input order is kept inside the group: the overnight row is still first (it
    // started first), which is the ordering the feed's own query produced.
    expect(groups[0].posts.map((p) => p.id)).toEqual(['overnight', 'today'])
    // …and no group carries a past-dated key: the only key is today's.
    expect(groups.map((g) => g.key)).not.toContain('2026-09-03')
  })

  it('V9 ticket 04: an overnight post does NOT merge the day it started into a section of its own', () => {
    // Two overnight rows (both still running) plus a tomorrow row: today's
    // section holds both clamped rows, and tomorrow's is untouched.
    const groups = groupByDay(
      [
        { id: 'o1', starts_at: at(-60) },
        { id: 'o2', starts_at: at(-20) },
        { id: 't', starts_at: at(1500) },
      ],
      NOW_ISO,
    )
    expect(groups.map((g) => g.key)).toEqual(['2026-09-04', '2026-09-05'])
    expect(groups[0].posts.map((p) => p.id)).toEqual(['o1', 'o2'])
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
    const posts: FeedPost[] = [postAt('98007', 'h-far', 900), postAt('98107', 'h-near', 780)]
    const wide = filterFeed(posts, VIEWER, ZIP_COORDS, new Set(), NOW_ISO)
    expect(wide.map((p) => p.host_profile_id)).toEqual(['h-near', 'h-far']) // starts_at order
    const narrow = filterFeed(posts, NARROW_VIEWER, ZIP_COORDS, new Set(), NOW_ISO)
    expect(narrow.map((p) => p.host_profile_id)).toEqual(['h-near'])
  })

  it('excludes a host that has no home zip (coordinates are never invented)', () => {
    const posts: FeedPost[] = [
      postAt(null, 'h-nozip', 780),
      postAt('98107', 'h-ok', 840),
    ]
    const result = filterFeed(posts, VIEWER, ZIP_COORDS, new Set(), NOW_ISO)
    expect(result.map((p) => p.host_profile_id)).toEqual(['h-ok'])
  })

  it('excludes a host whose zip is missing from the gazetteer', () => {
    const posts: FeedPost[] = [
      postAt('12345', 'h-unknown', 780),
      postAt('98107', 'h-ok', 840),
    ]
    const result = filterFeed(posts, VIEWER, ZIP_COORDS, new Set(), NOW_ISO)
    expect(result.map((p) => p.host_profile_id)).toEqual(['h-ok'])
  })

  it('never returns posts hosted by a blocked profile', () => {
    const posts: FeedPost[] = [
      postAt('98107', 'host-blocked', 900),
      postAt('98107', 'h1', 780),
    ]
    const result = filterFeed(posts, VIEWER, ZIP_COORDS, BLOCKED_HOSTS, NOW_ISO)
    expect(result.map((p) => p.host_profile_id)).toEqual(['h1'])
  })

  it('drops a post that has ENDED and keeps the ones that are live or ahead (V9 ticket 04)', () => {
    // The ticket's cutoff, on the filter: 10:00-11:00 is over at noon and
    // leaves the feed ENTIRELY (no greyed card, no demotion); 11:40-12:40 has
    // started and is happening now, so it stays (the AC's pin); 15:00-16:00 is
    // still ahead.
    const posts: FeedPost[] = [
      postAt('98107', 'h-ended', 600), // 10:00 – 11:00
      postAt('98107', 'h-live', 700), // 11:40 – 12:40 (now is 12:00)
      postAt('98107', 'h-ahead', 900), // 15:00 – 16:00
    ]
    const result = filterFeed(posts, VIEWER, ZIP_COORDS, new Set(), NOW_ISO)
    expect(result.map((p) => p.host_profile_id)).toEqual(['h-live', 'h-ahead'])
  })

  it('the boundary: a post ending exactly AT now is ended, so it is out', () => {
    // `ends_at === nowIso` is ENDED by isEnded's `<=` — the one boundary the
    // filter, the profile Past split and the card's "Ended" chip share. One
    // second later is still ahead, so this is a real edge and not a tolerance.
    const posts: FeedPost[] = [
      postAt('98107', 'h-ends-at-now', 660, 60), // 11:00 + 60 min = 12:00 = now
      postAt('98107', 'h-ends-a-minute-later', 660, 61), // 12:01
    ]
    const result = filterFeed(posts, VIEWER, ZIP_COORDS, new Set(), NOW_ISO)
    expect(result.map((p) => p.host_profile_id)).toEqual(['h-ends-a-minute-later'])
  })

  it('drops YESTERDAY\'s post (ended is ended, whatever the calendar day)', () => {
    // The old rule dropped a post by START day, so an ended post from earlier
    // TODAY survived it. The new rule cannot be gamed by the calendar: both of
    // these are out, and they are out for the same reason.
    const posts: FeedPost[] = [
      postAt('98107', 'h-yesterday', -600), // yesterday 02:00 – 03:00
      postAt('98107', 'h-this-morning', 60), // today 01:00 – 02:00
    ]
    expect(filterFeed(posts, VIEWER, ZIP_COORDS, new Set(), NOW_ISO)).toEqual([])
  })

  it('keeps a drop-in that STARTED yesterday and has not ended (the old midnight cutoff dropped it)', () => {
    // The flip side of the same change, and the reason `starts_at` cannot be
    // the cutoff: an all-night drop-in is still walkable at noon.
    const allNight: FeedPost = {
      host_profile_id: 'h-allnight',
      starts_at: at(-600), // yesterday 02:00
      ends_at: at(1000), // today 16:40
      host: { home_zip: '98107' },
    }
    expect(filterFeed([allNight], VIEWER, ZIP_COORDS, new Set(), NOW_ISO).map((p) => p.host_profile_id)).toEqual([
      'h-allnight',
    ])
  })

  it('orders by starts_at ascending', () => {
    const posts: FeedPost[] = [
      postAt('98107', 'a', 900),
      postAt('98107', 'b', 780),
      postAt('98007', 'c', 840),
    ]
    const result = filterFeed(posts, VIEWER, ZIP_COORDS, new Set(), NOW_ISO)
    expect(result.map((p) => p.host_profile_id)).toEqual(['b', 'c', 'a'])
  })

  it('applies all rules together and returns [] when nothing qualifies', () => {
    const posts: FeedPost[] = [postAt('12345', 'host-blocked', -10)]
    expect(filterFeed(posts, VIEWER, ZIP_COORDS, BLOCKED_HOSTS, NOW_ISO)).toEqual([])
  })

  it('never returns posts hidden by a moderator (hidden_at set)', () => {
    const posts: FeedPost[] = [
      postAt('98107', 'h1', 900),
      postAt('98107', 'h2', 780),
      postAt('98107', 'h3', 840),
    ]
    posts[0].hidden_at = 'x'
    posts[1].hidden_at = null
    // posts[2]: column absent (pre-0009)
    const result = filterFeed(posts, VIEWER, ZIP_COORDS, new Set(), NOW_ISO)
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
    // Recorded (V9 ticket 01): the embed string is part of the contract now —
    // a `!inner` on the neighborhood embed silently deletes posts, so the
    // select is asserted rather than assumed.
    select: (cols: string) => {
      filters.push(`select(${cols})`)
      return builder
    },
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
    gt: (col: string, value: string) => {
      filters.push(`gt(${col}, ${value})`)
      return builder
    },
    order: (col: string, opts: { ascending: boolean }) => {
      filters.push(`order(${col}, ${opts.ascending})`)
      return builder
    },
    limit: (n: number) => {
      filters.push(`limit(${n})`)
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

  it('cuts on ends_at > cutoff (V9 ticket 04), never on starts_at', async () => {
    // The DB half of the ticket's AC: the read must stop FETCHING ended
    // drop-ins rather than fetch-and-hide them. Asserted on the filter CHAIN,
    // which is what the client actually sends — and it is the half the feed's
    // own spec cannot see (it asserts the titles that are absent).
    const { client, filters } = makeFeedMockClient()
    await queryUpcomingFeedWithClient(client, CUTOFF, [])
    expect(filters).toContain(`gt(ends_at, ${CUTOFF})`)
    // The old cutoff is GONE, in both directions: `starts_at >= today` kept an
    // ended post all day, and `starts_at >= now` would delete a live one. (The
    // ORDER still comes from starts_at — asserted on the next line — so this is
    // "no starts_at FILTER", not "starts_at never appears".)
    expect(filters.some((f) => /^(gte|gt|lt|lte|eq)\(starts_at/.test(f))).toBe(false)
    // …and the ordering still comes from starts_at (the day sections depend on
    // it).
    expect(filters).toContain('order(starts_at, true)')
  })

  it('LEFT-joins the neighborhood embed (V9 ticket 01: no `!inner`, or a post with none vanishes)', async () => {
    // The inner join was the invisible bug this ticket removes: a post whose
    // host was never asked for a neighbourhood would not come back AT ALL.
    // Pinned here because the failure mode is silence — an empty feed, not an
    // error.
    const { client, filters } = makeFeedMockClient()
    await queryUpcomingFeedWithClient(client, CUTOFF, [])
    const select = filters.find((f) => f.startsWith('select(')) ?? ''
    expect(select).toContain('neighborhood:neighborhoods ( id, name )')
    expect(select).not.toContain('!inner')
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

  it('does NOT require a neighborhood (V9 ticket 01: a place is enough to post)', () => {
    // The rule this replaces asserted `neighborhoodId: ''` was an ERROR. It is
    // now the ordinary state of the form: /new does not ask the question (the
    // select is gone from that page), so a missing neighbourhood must not stop
    // a parent from posting. `neighborhoodId` stays in the values shape and in
    // the errors map (the edit form still renders the field).
    const errors = validatePlaydateForm({ ...valid, neighborhoodId: '' })
    expect(errors.neighborhoodId).toBeUndefined()
    // …and with a place and nothing else, the whole form is valid: this is the
    // ticket's "a post is postable with a place and nothing else".
    expect(errors).toEqual({})
    // A neighbourhood that IS chosen is equally fine (no rule either way).
    expect(validatePlaydateForm(valid).neighborhoodId).toBeUndefined()
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
 * 04) retention queries use (countPostsByHostWithClient, touchLastSeen —
 * the makeFeedMockClient / db-v3.test.ts style): each from(table) returns
 * a thenable builder recording every call (.select, .eq, .in, .gte,
 * .update) in order, so tests can assert the query SHAPE —
 * countPostsByHost's no-filter count chain and touchLastSeen's plain
 * update. Results are table-keyed config (the counts ride on the select's
 * count option).
 */
interface RetentionMockConfig {
  /** The playdates select's exact count (countPostsByHost's N). */
  playdatesCount?: number | null
  /** Rows the playdates select returns (the post-id list). */
  playdatesRows?: unknown[]
  /** The going_pings select's exact count (unused by the surviving tests). */
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

// ---------------------------------------------------------------------------
// V8 ticket 01: quick post — the /new mount-once defaults + remembered places.

/** Local 2026-09-12 at h:m as an ISO instant (timezone-independent, like `at`). */
function localIso(hour: number, minute: number, day = 12): string {
  return new Date(2026, 8, day, hour, minute, 0, 0).toISOString()
}

describe('nextSlotMinutes (V8 ticket 01, the /new start-time default)', () => {
  it('rounds an off-grid time UP to the next 30-minute slot', () => {
    expect(nextSlotMinutes(localIso(14, 20))).toBe(14 * 60 + 30)
    expect(nextSlotMinutes(localIso(14, 1))).toBe(14 * 60 + 30)
    expect(nextSlotMinutes(localIso(14, 59))).toBe(15 * 60)
  })

  it('returns an on-grid time unchanged (2:30 PM stays 2:30 PM)', () => {
    expect(nextSlotMinutes(localIso(14, 30))).toBe(14 * 60 + 30)
    expect(nextSlotMinutes(localIso(14, 0))).toBe(14 * 60)
  })

  it('is always a value the stepper considers legal (the form opens on a valid time)', () => {
    for (let hour = 0; hour < 24; hour++) {
      for (const minute of [0, 1, 15, 29, 30, 31, 45, 59]) {
        expect(isSteppedTime(nextSlotMinutes(localIso(hour, minute)))).toBe(true)
      }
    }
  })

  it('wraps past midnight to 0 (the date seam is what advances)', () => {
    expect(nextSlotMinutes(localIso(23, 45))).toBe(0)
    expect(nextSlotMinutes(localIso(23, 30))).toBe(23 * 60 + 30)
  })
})

describe('defaultStartDateIso (V8 ticket 01, the /new date default)', () => {
  it('is today, local, in the date input\u2019s own format', () => {
    expect(defaultStartDateIso(localIso(9, 5))).toBe('2026-09-12')
  })

  it('agrees with localDayKey (the date input IS a local day key)', () => {
    expect(defaultStartDateIso(localIso(9, 5))).toBe(localDayKey(localIso(9, 5)))
  })

  it('advances to tomorrow when the next slot wraps past midnight', () => {
    expect(defaultStartDateIso(localIso(23, 45))).toBe('2026-09-13')
  })

  it('stays on today at exactly midnight (00:00 is its own slot)', () => {
    expect(defaultStartDateIso(localIso(0, 0))).toBe('2026-09-12')
  })
})

describe('durationChipForUntilNextHour / suggestedDurationMinutes (V8 ticket 01)', () => {
  it('gives the smallest chip that reaches the next whole hour', () => {
    expect(durationChipForUntilNextHour(14 * 60)).toBe(60)
    expect(durationChipForUntilNextHour(14 * 60 + 30)).toBe(60)
  })

  it('is always one of the real chips (the preset can only write a legal duration)', () => {
    for (let minutes = 0; minutes < 24 * 60; minutes += TIME_STEP_MINUTES) {
      expect(isDuration(durationChipForUntilNextHour(minutes))).toBe(true)
    }
  })

  it('the suggested duration for a now is a valid chip (1h on today\u2019s 30-minute grid)', () => {
    expect(suggestedDurationMinutes(localIso(14, 20))).toBe(60)
    expect(isDuration(suggestedDurationMinutes(localIso(14, 20)))).toBe(true)
  })
})

describe('recentPlacesFrom (V8 ticket 01, the /new "Recent places" chips)', () => {
  const rows = [
    { place: 'Green Lake playground', address: '7200 4th Ave NE', neighborhood_id: 'n-green' },
    { place: 'green lake playground  ', address: null, neighborhood_id: 'n-green' },
    { place: 'Ballard Commons', address: '  5701 22nd Ave NW  ', neighborhood_id: 'n-ballard' },
    { place: '   ', address: 'nope', neighborhood_id: 'n-x' },
    { place: 'Discovery Park', address: null, neighborhood_id: 'n-disc' },
    { place: 'Golden Gardens', address: null, neighborhood_id: 'n-gg' },
  ]

  it('keeps the NEWEST row of each place (the input is newest-first)', () => {
    const out = recentPlacesFrom(rows)
    expect(out[0]).toEqual({
      place: 'Green Lake playground',
      address: '7200 4th Ave NE',
      neighborhoodId: 'n-green',
    })
  })

  it('collapses duplicates on a case/whitespace-insensitive place key', () => {
    const out = recentPlacesFrom(rows)
    expect(out.filter((p) => p.place.toLowerCase().includes('green lake'))).toHaveLength(1)
  })

  it('drops rows with no place at all', () => {
    expect(recentPlacesFrom(rows).some((p) => p.place === '')).toBe(false)
  })

  it('caps at RECENT_PLACES_SHOWN (the ticket-01 pin: 3) and honours an explicit limit', () => {
    expect(RECENT_PLACES_SHOWN).toBe(3)
    expect(recentPlacesFrom(rows)).toHaveLength(RECENT_PLACES_SHOWN)
    expect(recentPlacesFrom(rows, 1)).toHaveLength(1)
    expect(recentPlacesFrom(rows, 99)).toHaveLength(4)
  })

  it('normalizes a null address to "" and trims a real one', () => {
    const out = recentPlacesFrom(rows)
    expect(out[1]).toEqual({
      place: 'Ballard Commons',
      address: '5701 22nd Ave NW',
      neighborhoodId: 'n-ballard',
    })
    expect(out[2].address).toBe('')
  })

  it('no rows → no chips', () => {
    expect(recentPlacesFrom([])).toEqual([])
  })

  it('maps a NULL neighborhood_id to "" — the chips work on BOTH paths (V9 ticket 01)', () => {
    // T9 of the ticket: the picked-place path and the free-text path must both
    // keep their chips. Every seeded place carries a NULL neighbourhood (0029),
    // so the PICKED path is the NULL path in practice — a chip must still fill
    // the place and its address, with no neighbourhood to carry.
    const out = recentPlacesFrom([
      { place: 'Green Lake Park', address: '7201 East Green Lake Dr N', neighborhood_id: null },
    ])
    expect(out).toEqual([
      {
        place: 'Green Lake Park',
        address: '7201 East Green Lake Dr N',
        neighborhoodId: '',
      },
    ])
  })
})

describe('queryRecentOwnPlacesWithClient (V8 ticket 01, mocked supabase client)', () => {
  const rows = [{ place: 'Green Lake', address: null, neighborhood_id: 'n1' }]

  it('scopes to the host, newest first, with a bounded scan', async () => {
    const { client, filters } = makeFeedMockClient(rows)
    expect(await queryRecentOwnPlacesWithClient(client, 'me')).toEqual(rows)
    expect(filters).toContain('eq(host_profile_id, me)')
    expect(filters).toContain('order(created_at, false)')
    expect(filters).toContain(`limit(${RECENT_PLACES_SCANNED})`)
  })

  it('honours an explicit scan limit', async () => {
    const { client, filters } = makeFeedMockClient(rows)
    await queryRecentOwnPlacesWithClient(client, 'me', 2)
    expect(filters).toContain('limit(2)')
  })

  it('returns [] when the host has never posted', async () => {
    const { client } = makeFeedMockClient([])
    expect(await queryRecentOwnPlacesWithClient(client, 'me')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// V8 ticket 02: the empty-radius copy + escapes, and the refresh gate.

describe('emptyRadiusCopy (V8 ticket 02: the honest empty state)', () => {
  it('names the viewer\'s own radius', () => {
    expect(emptyRadiusCopy(2)).toBe('Nothing within 2 miles yet.')
    expect(emptyRadiusCopy(5)).toBe('Nothing within 5 miles yet.')
    expect(emptyRadiusCopy(35)).toBe('Nothing within 35 miles yet.')
  })

  it('never claims "today" (the list is not-ended-yet — the old copy\'s lie)', () => {
    for (const radius of RADIUS_MILES_OPTIONS) {
      expect(emptyRadiusCopy(radius).toLowerCase()).not.toContain('today')
    }
  })
})

describe('the archive link (V9 ticket 04: the feed\'s door to the Past list)', () => {
  /**
   * The LITERAL is pinned here on purpose. The e2e spec asserts the link with
   * this same constant (the `emptyRadiusCopy` discipline: a spec asserts the
   * app's own rule, never a copy of it), which means a rename to "History" would
   * keep every e2e assertion green while changing the product's words. This is
   * the one place that says what the words ARE.
   */
  it('carries the one label both doors render, and no count in it', () => {
    expect(PAST_DROP_INS_LABEL).toBe('See past drop-ins')
    // Never "See your 3 past drop-ins": the feed does not read the viewer's
    // history, so a number here would be a claim it cannot make — and the empty
    // state must not imply the archive is empty (or full).
    expect(PAST_DROP_INS_LABEL).not.toMatch(/\d/)
  })

  it('points at V8 ticket 04\'s Past list on /profile', () => {
    expect(PAST_DROP_INS_HREF).toBe('/profile')
  })
})

describe('radiusEscapes (V8 ticket 02: the way out of an empty radius)', () => {
  it('offers both escapes at the 5-mile default', () => {
    expect(radiusEscapes(5)).toEqual([
      { radiusMiles: 20, label: 'Widen to 20 miles' },
      { radiusMiles: 35, label: 'See everything in Seattle' },
    ])
  })

  it('pins the radii to the ticket (20 = widen, 35 = the max, the DB ceiling)', () => {
    expect(WIDEN_RADIUS_MILES).toBe(20)
    expect(SEE_ALL_RADIUS_MILES).toBe(35)
    expect(SEE_ALL_RADIUS_MILES).toBe(RADIUS_MAX_MILES)
    expect(RADIUS_MILES_OPTIONS).toContain(WIDEN_RADIUS_MILES)
    expect(RADIUS_MILES_OPTIONS).toContain(SEE_ALL_RADIUS_MILES)
  })

  it('drops an escape that would not widen anything (20 → the 20-mi button is gone)', () => {
    expect(radiusEscapes(20)).toEqual([{ radiusMiles: 35, label: 'See everything in Seattle' }])
  })

  it('is empty at the 35-mile max (nothing wider exists — the ceiling is honest)', () => {
    expect(radiusEscapes(35)).toEqual([])
  })

  it('always widens: every escape is strictly wider than the current radius', () => {
    for (const radius of RADIUS_MILES_OPTIONS) {
      for (const escape of radiusEscapes(radius)) {
        expect(escape.radiusMiles).toBeGreaterThan(radius)
        expect(escape.radiusMiles).toBeLessThanOrEqual(RADIUS_MAX_MILES)
      }
    }
  })

  it('keeps the escapes present for a 2-mile radius (the far-zip e2e case)', () => {
    expect(radiusEscapes(2).map((e) => e.radiusMiles)).toEqual([20, 35])
  })
})

describe('shouldRefreshFeed (V8 ticket 02: the visibility-refresh gate)', () => {
  const NOW = '2026-09-12T12:00:00.000Z'
  const WINDOW_MS = 60_000 // the 60s pin, owned by FeedPage
  const secondsAgo = (seconds: number) =>
    new Date(Date.parse(NOW) - seconds * 1000).toISOString()

  it('is due when nothing has loaded yet (null — the first load sets the clock)', () => {
    expect(shouldRefreshFeed(null, NOW, WINDOW_MS)).toBe(true)
  })

  it('is NOT due on a quick app switch (a load 5s old)', () => {
    expect(shouldRefreshFeed(secondsAgo(5), NOW, WINDOW_MS)).toBe(false)
  })

  it('is not due one millisecond inside the window', () => {
    expect(shouldRefreshFeed(secondsAgo(59.999), NOW, WINDOW_MS)).toBe(false)
  })

  it('is due exactly at the window (>=, not > — the dueToRefreshLastSeen rule)', () => {
    expect(shouldRefreshFeed(secondsAgo(60), NOW, WINDOW_MS)).toBe(true)
  })

  it('is due when the tab has been away for minutes', () => {
    expect(shouldRefreshFeed(secondsAgo(600), NOW, WINDOW_MS)).toBe(true)
  })

  it('honours the window the caller owns (a 0ms window is always due)', () => {
    expect(shouldRefreshFeed(secondsAgo(0), NOW, 0)).toBe(true)
  })
})

describe('buildWhileAwayItems (V8 ticket 03: the while-away inbox)', () => {
  const CURSOR = '2026-09-12T10:00:00.000Z'
  const NOW = '2026-09-12T12:00:00.000Z'
  /** An ISO string N hours AFTER the cursor (news). */
  const after = (hours: number) => new Date(Date.parse(CURSOR) + hours * 3_600_000).toISOString()
  /** An ISO string N hours BEFORE the cursor (already seen). */
  const seen = (hours: number) => new Date(Date.parse(CURSOR) - hours * 3_600_000).toISOString()
  /** An ISO string N hours after NOW (a drop-in still ahead of the viewer). */
  const ahead = (hours: number) => new Date(Date.parse(NOW) + hours * 3_600_000).toISOString()

  const MY_POSTS = [
    { id: 'mine-1', title: 'Park morning' },
    { id: 'mine-2', title: 'Library run' },
  ]

  const ping = (playdateId: string, createdAt: string, displayName: string) => ({
    playdateId,
    createdAt,
    avatarUrl: null,
    displayName,
  })
  const comment = (playdateId: string, createdAt: string) => ({ playdateId, createdAt })
  const pinged = (playdateId: string, title: string | null, status: string | null, startsAt: string | null) => ({
    playdateId,
    title,
    status,
    startsAt,
  })

  /** The empty inputs (only the cursor + now), spread into each case. */
  const base = {
    sinceIso: CURSOR,
    nowIso: NOW,
    myPosts: MY_POSTS,
    pingsOnMyPosts: [] as ReturnType<typeof ping>[],
    commentsOnMyPosts: [] as ReturnType<typeof comment>[],
    pingedPosts: [] as ReturnType<typeof pinged>[],
  }

  it('orders: cancellation first, then pings newest-first, then comments (newest-first)', () => {
    const inbox = buildWhileAwayItems(
      {
        ...base,
        myPosts: [
          { id: 'mine-1', title: 'One' },
          { id: 'mine-2', title: 'Two' },
          { id: 'mine-3', title: 'Three' },
          { id: 'mine-4', title: 'Four' },
        ],
        pingedPosts: [pinged('pd-cancel', 'Green Lake', 'cancelled', ahead(20))],
        pingsOnMyPosts: [ping('mine-2', after(1), 'Ada'), ping('mine-1', after(3), 'Bea')],
        commentsOnMyPosts: [
          // The NEWEST timestamps of all — and still last: kind order wins.
          comment('mine-4', after(2)),
          comment('mine-3', after(4)),
        ],
      },
      10,
    )
    expect(inbox.items.map((item) => item.kind)).toEqual([
      'cancelled',
      'pings',
      'pings',
      'comments',
      'comments',
    ])
    // Pings: the newest ping's post first (mine-1 is 3h, mine-2 is 1h).
    expect(inbox.items[1].playdateId).toBe('mine-1')
    expect(inbox.items[2].playdateId).toBe('mine-2')
    // Comments: newest first too (mine-3 is 4h, mine-4 is 2h).
    expect(inbox.items[3].playdateId).toBe('mine-3')
    expect(inbox.items[4].playdateId).toBe('mine-4')
    expect(inbox.moreCount).toBe(0)
  })

  it('caps at the limit and reports the rest as the "+N more" count', () => {
    const inbox = buildWhileAwayItems({
      ...base,
      myPosts: [
        { id: 'mine-1', title: 'One' },
        { id: 'mine-2', title: 'Two' },
        { id: 'mine-3', title: 'Three' },
        { id: 'mine-4', title: 'Four' },
      ],
      pingsOnMyPosts: [
        ping('mine-1', after(1), 'Ada'),
        ping('mine-2', after(2), 'Bea'),
        ping('mine-3', after(3), 'Cara'),
        ping('mine-4', after(4), 'Dana'),
      ],
    })
    expect(inbox.items).toHaveLength(WHILE_AWAY_ITEM_LIMIT)
    expect(inbox.items).toHaveLength(3)
    // Newest first: mine-4, mine-3, mine-2 — mine-1 fell off.
    expect(inbox.items.map((item) => item.playdateId)).toEqual(['mine-4', 'mine-3', 'mine-2'])
    expect(inbox.moreCount).toBe(1)
  })

  it('honours a caller-owned limit (the page passes WHILE_AWAY_ITEM_LIMIT)', () => {
    const inbox = buildWhileAwayItems(
      {
        ...base,
        pingsOnMyPosts: [ping('mine-1', after(1), 'Ada'), ping('mine-2', after(2), 'Bea')],
      },
      1,
    )
    expect(inbox.items).toHaveLength(1)
    expect(inbox.moreCount).toBe(1)
  })

  it('dedupes a post that is BOTH pinged and commented (pings win, one item)', () => {
    const inbox = buildWhileAwayItems({
      ...base,
      pingsOnMyPosts: [ping('mine-1', after(1), 'Ada')],
      commentsOnMyPosts: [comment('mine-1', after(2)), comment('mine-2', after(3))],
    })
    expect(inbox.items.map((item) => item.playdateId)).toEqual(['mine-1', 'mine-2'])
    expect(inbox.items[0].kind).toBe('pings')
    expect(inbox.items[0].label).toBe('1 family is going to "Park morning"')
    // The comment on mine-1 is the loser of the dedupe; mine-2's survives.
    expect(inbox.items[1].kind).toBe('comments')
    expect(inbox.items[1].label).toBe('1 new comment on "Library run"')
  })

  it('returns an empty inbox when everything is at or before the cursor', () => {
    const inbox = buildWhileAwayItems({
      ...base,
      // A ping exactly AT the cursor was already seen (strictly-after, not >=).
      pingsOnMyPosts: [ping('mine-1', CURSOR, 'Ada'), ping('mine-2', seen(3), 'Bea')],
      commentsOnMyPosts: [comment('mine-1', CURSOR), comment('mine-2', seen(1))],
      // A cancellation of a drop-in that already started is not news either.
      pingedPosts: [pinged('pd-past', 'Old lot', 'cancelled', seen(30))],
    })
    expect(inbox).toEqual({ items: [], moreCount: 0 })
  })

  it('reads correctly at 1: the singular "1 family is going to" (and the plural beyond)', () => {
    const one = buildWhileAwayItems({
      ...base,
      pingsOnMyPosts: [ping('mine-1', after(1), 'Ada')],
    })
    expect(one.items[0].label).toBe('1 family is going to "Park morning"')
    expect(one.items[0].count).toBe(1)

    const three = buildWhileAwayItems({
      ...base,
      pingsOnMyPosts: [
        ping('mine-1', after(1), 'Ada'),
        ping('mine-1', after(2), 'Bea'),
        ping('mine-1', after(3), 'Cara'),
      ],
    })
    expect(three.items).toHaveLength(1)
    expect(three.items[0].label).toBe('3 families are going to "Park morning"')
    expect(three.items[0].count).toBe(3)

    const oneComment = buildWhileAwayItems({
      ...base,
      commentsOnMyPosts: [comment('mine-1', after(1))],
    })
    expect(oneComment.items[0].label).toBe('1 new comment on "Park morning"')
    expect(
      buildWhileAwayItems({
        ...base,
        commentsOnMyPosts: [comment('mine-1', after(1)), comment('mine-1', after(2))],
      }).items[0].label,
    ).toBe('2 new comments on "Park morning"')
  })

  it('surfaces the newest pingers as faces, capped at the circle limit', () => {
    const inbox = buildWhileAwayItems({
      ...base,
      pingsOnMyPosts: [
        ping('mine-1', after(1), 'Ada'),
        ping('mine-1', after(4), 'Dana'),
        ping('mine-1', after(2), 'Bea'),
        ping('mine-1', after(3), 'Cara'),
      ],
    })
    expect(inbox.items[0].faces.map((face) => face.displayName)).toEqual(['Dana', 'Cara', 'Bea'])
  })

  it('renders a cancellation for a post whose row is GONE (null title — never a crash)', () => {
    const inbox = buildWhileAwayItems({
      ...base,
      pingedPosts: [pinged('pd-gone', null, null, null)],
    })
    expect(inbox.items).toHaveLength(1)
    expect(inbox.items[0].kind).toBe('cancelled')
    expect(inbox.items[0].title).toBeNull()
    expect(inbox.items[0].label).toBe("A drop-in you pinged was cancelled — you said you'd go")
    expect(inbox.items[0].playdateId).toBe('pd-gone')
  })

  it('keeps an upcoming cancellation and drops a started one (the "empty park" window)', () => {
    const inbox = buildWhileAwayItems({
      ...base,
      pingedPosts: [
        pinged('pd-soon', 'Tomorrow', 'cancelled', ahead(5)),
        pinged('pd-over', 'Yesterday', 'cancelled', seen(30)),
      ],
    })
    expect(inbox.items.map((item) => item.playdateId)).toEqual(['pd-soon'])
    expect(inbox.items[0].label).toBe('"Tomorrow" was cancelled — you said you\'d go')
  })

  it('orders two cancellations soonest-start first', () => {
    const inbox = buildWhileAwayItems({
      ...base,
      pingedPosts: [
        pinged('pd-later', 'Later', 'cancelled', ahead(30)),
        pinged('pd-gone', null, null, null),
        pinged('pd-sooner', 'Sooner', 'cancelled', ahead(2)),
      ],
    })
    // Soonest first; the undatable (gone) row sorts last.
    expect(inbox.items.map((item) => item.playdateId)).toEqual(['pd-sooner', 'pd-later', 'pd-gone'])
  })

  it('ignores posts that are not cancelled (a plain ping is not a cancellation)', () => {
    const inbox = buildWhileAwayItems({
      ...base,
      pingedPosts: [pinged('pd-on', 'Still on', 'on', ahead(3))],
    })
    expect(inbox).toEqual({ items: [], moreCount: 0 })
  })

  it('a null cursor means no ping/comment news (the first visit establishes the baseline)', () => {
    const inbox = buildWhileAwayItems({
      ...base,
      sinceIso: null,
      pingsOnMyPosts: [ping('mine-1', after(1), 'Ada')],
      commentsOnMyPosts: [comment('mine-1', after(1))],
      // ...but a cancellation is NOT cursor-gated (the schema records no
      // cancellation time), so it still surfaces on the very first visit.
      pingedPosts: [pinged('pd-cancel', 'Green Lake', 'cancelled', ahead(20))],
    })
    expect(inbox.items.map((item) => item.kind)).toEqual(['cancelled'])
  })

  it('groups per post and uses the post title from myPosts', () => {
    const inbox = buildWhileAwayItems({
      ...base,
      pingsOnMyPosts: [ping('mine-2', after(1), 'Ada'), ping('mine-2', after(2), 'Bea')],
    })
    expect(inbox.items).toHaveLength(1)
    expect(inbox.items[0].label).toBe('2 families are going to "Library run"')
  })
})

/**
 * Minimal recording mock of the client surface the V8 ticket 03 inbox reads
 * use (listMyPostRefsWithClient / listCommentsOnPostsWithClient /
 * listMyPingedPostsWithClient — the makeRetentionMockClient style): each
 * from(table) returns a thenable builder recording every call in order (the
 * chain SHAPE is the assertion), with per-table canned rows + one shared
 * error (the pre-apply / RLS failure the callers swallow).
 */
interface InboxMockConfig {
  playdatesRows?: unknown[]
  commentsRows?: unknown[]
  goingPingsRows?: unknown[]
  error?: { code: string; message: string }
}

function makeInboxMockClient(config: InboxMockConfig = {}): {
  client: SupabaseClient
  calls: string[]
} {
  const calls: string[] = []
  const error =
    config.error === undefined
      ? null
      : Object.assign(new Error(config.error.message), { code: config.error.code })
  const makeBuilder = (table: 'playdates' | 'comments' | 'going_pings') => {
    const builder = {
      select: (cols: string) => {
        calls.push(`${table}.select(${cols})`)
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
      then: (onfulfilled?: (value: { data: unknown; error: unknown }) => unknown) => {
        const rows =
          table === 'playdates'
            ? (config.playdatesRows ?? [])
            : table === 'comments'
              ? (config.commentsRows ?? [])
              : (config.goingPingsRows ?? [])
        return Promise.resolve({ data: rows, error }).then(onfulfilled)
      },
    }
    return builder
  }
  const client = {
    from: (table: string) => {
      if (table !== 'playdates' && table !== 'comments' && table !== 'going_pings') {
        throw new Error(`unexpected table: ${table}`)
      }
      return makeBuilder(table as 'playdates' | 'comments' | 'going_pings')
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

describe('the while-away inbox reads (V8 ticket 03)', () => {
  it('listMyPostRefsWithClient reads the host\'s own posts (id + title, no status/end filter)', async () => {
    const { client, calls } = makeInboxMockClient({
      playdatesRows: [{ id: 'pd-1', title: 'Park' }, { id: null, title: 'orphan' }],
    })
    expect(await listMyPostRefsWithClient(client, 'me')).toEqual([{ id: 'pd-1', title: 'Park' }])
    expect(calls).toEqual(['playdates.select(id, title)', 'playdates.eq(host_profile_id, me)'])
  })

  it('listMyPostRefsWithClient rejects on a query error (the caller shows no card)', async () => {
    const { client } = makeInboxMockClient({
      error: { code: '42703', message: 'column "title" does not exist' },
    })
    await expect(listMyPostRefsWithClient(client, 'me')).rejects.toThrow(
      'column "title" does not exist',
    )
  })

  it('listCommentsOnPostsWithClient reads visible comments for the post set', async () => {
    const { client, calls } = makeInboxMockClient({
      commentsRows: [
        { playdate_id: 'pd-1', created_at: '2026-09-12T11:00:00.000Z', hidden_at: null },
        { playdate_id: 'pd-2', created_at: '2026-09-12T11:30:00.000Z', hidden_at: null },
      ],
    })
    expect(await listCommentsOnPostsWithClient(client, ['pd-1', 'pd-2'])).toEqual([
      { playdateId: 'pd-1', createdAt: '2026-09-12T11:00:00.000Z' },
      { playdateId: 'pd-2', createdAt: '2026-09-12T11:30:00.000Z' },
    ])
    expect(calls).toEqual([
      'comments.select(playdate_id, created_at, hidden_at)',
      'comments.in(playdate_id, pd-1,pd-2)',
    ])
  })

  it('listCommentsOnPostsWithClient skips a hidden comment (the mod view — no phantom news)', async () => {
    const { client } = makeInboxMockClient({
      commentsRows: [
        { playdate_id: 'pd-1', created_at: '2026-09-12T11:00:00.000Z', hidden_at: '2026-09-12T11:05:00.000Z' },
      ],
    })
    expect(await listCommentsOnPostsWithClient(client, ['pd-1'])).toEqual([])
  })

  it('listCommentsOnPostsWithClient issues NO query for an empty post set', async () => {
    const { client, calls } = makeInboxMockClient()
    expect(await listCommentsOnPostsWithClient(client, [])).toEqual([])
    expect(calls).toEqual([])
  })

  it('listMyPingedPostsWithClient reads the viewer\'s own pings + the pinned playdates embed', async () => {
    const { client, calls } = makeInboxMockClient({
      goingPingsRows: [
        {
          playdate_id: 'pd-1',
          playdate: { id: 'pd-1', title: 'Park', status: 'cancelled', starts_at: '2026-09-13T17:00:00.000Z' },
        },
      ],
    })
    expect(await listMyPingedPostsWithClient(client, 'me')).toEqual([
      {
        playdateId: 'pd-1',
        title: 'Park',
        status: 'cancelled',
        startsAt: '2026-09-13T17:00:00.000Z',
      },
    ])
    expect(calls).toEqual([
      'going_pings.select(playdate_id, playdate:playdates!going_pings_playdate_id_fkey ( id, title, status, starts_at ))',
      'going_pings.eq(profile_id, me)',
    ])
  })

  it('listMyPingedPostsWithClient tolerates a missing post row (nulls, never a crash)', async () => {
    const { client } = makeInboxMockClient({
      goingPingsRows: [{ playdate_id: 'pd-gone', playdate: null }],
    })
    expect(await listMyPingedPostsWithClient(client, 'me')).toEqual([
      { playdateId: 'pd-gone', title: null, status: null, startsAt: null },
    ])
  })
})

// ---------------------------------------------------------------------------
// V8 ticket 04: the profile post lists (/u/:handle and /profile).

describe('partitionPostsByTime (V8 ticket 04: the Upcoming / Past split)', () => {
  /** A post by id, from `startMinutes` to `endMinutes` after local midnight. */
  const slot = (id: string, startMinutes: number, endMinutes: number) => ({
    id,
    starts_at: at(startMinutes),
    ends_at: at(endMinutes),
  })

  it('a post starting exactly at nowIso is UPCOMING (the pinned boundary)', () => {
    const nowIso = at(600)
    const { upcoming, past } = partitionPostsByTime([slot('now', 600, 660)], nowIso)
    expect(upcoming.map((post) => post.id)).toEqual(['now'])
    expect(past).toEqual([])
  })

  it('an ended post is PAST — the boundary is ends_at <= now (isEnded, the card’s mute rule)', () => {
    const nowIso = at(600)
    const { upcoming, past } = partitionPostsByTime([slot('over', 540, 600)], nowIso)
    expect(past.map((post) => post.id)).toEqual(['over'])
    expect(upcoming).toEqual([])
  })

  it('a drop-in that is happening right now is UPCOMING (still joinable, and the card badges it live)', () => {
    const nowIso = at(600)
    const { upcoming, past } = partitionPostsByTime([slot('live', 570, 630)], nowIso)
    expect(upcoming.map((post) => post.id)).toEqual(['live'])
    expect(past).toEqual([])
  })

  it('orders upcoming ascending by starts_at and past descending', () => {
    const nowIso = at(600)
    const posts = [
      slot('past-oldest', 300, 360),
      slot('later-today', 900, 960),
      slot('past-newest', 480, 540),
      slot('soonest', 630, 690),
      slot('past-middle', 420, 480),
    ]
    const { upcoming, past } = partitionPostsByTime(posts, nowIso)
    expect(upcoming.map((post) => post.id)).toEqual(['soonest', 'later-today'])
    expect(past.map((post) => post.id)).toEqual(['past-newest', 'past-middle', 'past-oldest'])
  })

  it('is empty/empty for no posts, and never mutates the caller’s array', () => {
    expect(partitionPostsByTime([], NOW_ISO)).toEqual({ upcoming: [], past: [] })
    const posts = [slot('a', 900, 960), slot('b', 300, 360)]
    const before = posts.map((post) => post.id)
    const { upcoming, past } = partitionPostsByTime(posts, at(600))
    expect(posts.map((post) => post.id)).toEqual(before) // input order untouched
    expect(upcoming.map((post) => post.id)).toEqual(['a'])
    expect(past.map((post) => post.id)).toEqual(['b'])
  })
})

/**
 * Minimal recording mock of the client surface
 * listPostsByHostWithClient uses (V8 ticket 04). Each from('playdates')
 * STARTS A NEW QUERY — index 0 is the upcoming one, index 1 the past one
 * (the order the function issues them) — and every call is recorded in
 * sequence (the retention-mock pattern), so tests can pin the query SHAPE
 * and the per-section rows/counts. An unexpected table throws, and a blocked
 * host resolving with `calls: []` is the assertion that NO query is issued.
 */
interface HostPostsMockConfig {
  /** The upcoming section's rows. */
  upcomingRows?: unknown[]
  /** The upcoming query's exact count (nothing renders it — the past tail is the "+N older"). */
  upcomingCount?: number | null
  /** The past section's rows. */
  pastRows?: unknown[]
  /** The past query's exact count — the "+N older" source. */
  pastCount?: number | null
  /** Models a failing playdates query (the designed error line). */
  queryError?: { code: string; message: string }
}

function makeHostPostsMockClient(config: HostPostsMockConfig = {}): {
  client: SupabaseClient
  calls: string[]
} {
  const calls: string[] = []
  let queryIndex = -1
  const asError = (err: { code: string; message: string } | undefined): Error | null =>
    err === undefined ? null : Object.assign(new Error(err.message), { code: err.code })
  const makeBuilder = () => {
    const index = queryIndex
    const builder = {
      select: (cols: string, opts?: { count?: string }) => {
        calls.push(`playdates.select(${cols}, count:${opts?.count})`)
        return builder
      },
      eq: (col: string, value: unknown) => {
        calls.push(`playdates.eq(${col}, ${String(value)})`)
        return builder
      },
      is: (col: string, value: unknown) => {
        calls.push(`playdates.is(${col}, ${String(value)})`)
        return builder
      },
      gt: (col: string, value: string) => {
        calls.push(`playdates.gt(${col}, ${value})`)
        return builder
      },
      lte: (col: string, value: string) => {
        calls.push(`playdates.lte(${col}, ${value})`)
        return builder
      },
      order: (col: string, opts: { ascending: boolean }) => {
        calls.push(`playdates.order(${col}, ${opts.ascending})`)
        return builder
      },
      limit: (n: number) => {
        calls.push(`playdates.limit(${n})`)
        return builder
      },
      then: (
        onfulfilled?: (value: {
          data: unknown[]
          error: unknown
          count: number | null
        }) => unknown,
      ) =>
        Promise.resolve(
          index === 0
            ? {
                data: config.upcomingRows ?? [],
                error: asError(config.queryError),
                count: config.upcomingCount ?? null,
              }
            : {
                data: config.pastRows ?? [],
                error: asError(config.queryError),
                count: config.pastCount ?? null,
              },
        ).then(onfulfilled),
    }
    return builder
  }
  const client = {
    from: (table: string) => {
      if (table !== 'playdates') throw new Error(`unexpected table: ${table}`)
      queryIndex += 1
      return makeBuilder()
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

describe('listPostsByHostWithClient (V8 ticket 04: one host’s posts)', () => {
  const HOST = 'host-1'

  it('selects the card shape with BOTH FK hints, on both queries (the PGRST201 lesson)', async () => {
    const { client, calls } = makeHostPostsMockClient()
    await listPostsByHostWithClient(client, HOST, [], NOW_ISO)
    const selects = calls.filter((call) => call.startsWith('playdates.select('))
    expect(selects).toHaveLength(2)
    for (const select of selects) {
      // V9 ticket 01: the neighborhood embed is a PLAIN (LEFT) join. The old
      // pin here was `neighborhoods!inner ( id, name )`; with a nullable
      // neighbourhood that hint would drop every post the profile is supposed
      // to list — silently, on the host's own Upcoming/Past sections.
      expect(select).toContain('neighborhood:neighborhoods ( id, name )')
      expect(select).not.toContain('!inner')
      expect(select).toContain(
        'host:profiles!playdates_host_profile_id_fkey ( id, display_name, avatar_url, home_zip, radius_miles )',
      )
      expect(select).toContain('count:exact')
    }
  })

  it('excludes hidden posts and scopes to the host, then splits by ends_at with per-section order + the 50 cap', async () => {
    const { client, calls } = makeHostPostsMockClient()
    await listPostsByHostWithClient(client, HOST, [], NOW_ISO)
    expect(calls.filter((call) => !call.startsWith('playdates.select('))).toEqual([
      `playdates.eq(host_profile_id, ${HOST})`,
      'playdates.is(hidden_at, null)',
      `playdates.gt(ends_at, ${NOW_ISO})`,
      'playdates.order(starts_at, true)',
      `playdates.limit(${HOST_POSTS_LIMIT})`,
      `playdates.eq(host_profile_id, ${HOST})`,
      'playdates.is(hidden_at, null)',
      `playdates.lte(ends_at, ${NOW_ISO})`,
      'playdates.order(starts_at, false)',
      `playdates.limit(${HOST_POSTS_LIMIT})`,
    ])
  })

  it('returns the upcoming rows then the past rows, with no truncation when nothing overflows', async () => {
    const { client } = makeHostPostsMockClient({
      upcomingRows: [{ id: 'u1' }, { id: 'u2' }],
      upcomingCount: 2,
      pastRows: [{ id: 'p1' }],
      pastCount: 1,
    })
    const result = await listPostsByHostWithClient(client, HOST, [], NOW_ISO)
    expect(result.posts).toEqual([{ id: 'u1' }, { id: 'u2' }, { id: 'p1' }])
    expect(result.olderCount).toBe(0)
  })

  it('reports the past rows beyond the cap as a plain count ("+N older")', async () => {
    const pastRows = Array.from({ length: HOST_POSTS_LIMIT }, (_, i) => ({ id: `p${i}` }))
    const { client } = makeHostPostsMockClient({
      pastRows,
      pastCount: HOST_POSTS_LIMIT + 3,
    })
    const result = await listPostsByHostWithClient(client, HOST, [], NOW_ISO)
    expect(result.posts).toHaveLength(HOST_POSTS_LIMIT)
    expect(result.olderCount).toBe(3)
  })

  it('is 0 older when the count is unavailable (never an invented number)', async () => {
    const { client } = makeHostPostsMockClient({ pastRows: [{ id: 'p1' }], pastCount: null })
    expect((await listPostsByHostWithClient(client, HOST, [], NOW_ISO)).olderCount).toBe(0)
  })

  it('a blocked host yields no posts and issues NO query (a blocked host’s page must not leak posts)', async () => {
    const { client, calls } = makeHostPostsMockClient({ pastRows: [{ id: 'p1' }] })
    const result = await listPostsByHostWithClient(client, HOST, [HOST, 'someone-else'], NOW_ISO)
    expect(result).toEqual({ posts: [], olderCount: 0 })
    expect(calls).toEqual([])
  })

  it('still reads the host’s posts when the viewer’s blocks name someone else', async () => {
    const { client } = makeHostPostsMockClient({ upcomingRows: [{ id: 'u1' }] })
    expect(
      (await listPostsByHostWithClient(client, HOST, ['someone-else'], NOW_ISO)).posts,
    ).toEqual([{ id: 'u1' }])
  })

  it('rejects on a query error (the page renders its designed error line)', async () => {
    const { client } = makeHostPostsMockClient({
      queryError: { code: '42P01', message: 'relation "playdates" does not exist' },
    })
    await expect(listPostsByHostWithClient(client, HOST, [], NOW_ISO)).rejects.toThrow(
      'relation "playdates" does not exist',
    )
  })
})

// ---------------------------------------------------------------------------
// V8 ticket 05 (post edit): the edit form's pure seams. The prefill is the
// exact inverse of the create path (computeStartIso / computeEndIso), and
// the change comparison is what makes "a save that changes nothing is a
// no-op with no write" true at the seam level — the page only writes when
// one of these says something changed.

/** A stored post as getPlaydateDetail returns it (the fields the form reads). */
function storedPost(overrides: Partial<Parameters<typeof playdateFormValuesFromPost>[0]> = {}) {
  const startMinutes = 15 * 60 + 30
  const startDate = '2026-09-12'
  return {
    title: 'Playground time',
    place: 'Green Lake playground',
    neighborhood_id: 'hood-1',
    starts_at: computeStartIso(startDate, startMinutes),
    ends_at: computeEndIso(startDate, startMinutes, 90),
    details: 'Bring snacks',
    ...overrides,
  }
}

describe('playdateFormValuesFromPost (V8 ticket 05)', () => {
  it('inverts the create path: the stored instant comes back as the form values that produced it', () => {
    const values = playdateFormValuesFromPost(storedPost())
    expect(values).toEqual({
      title: 'Playground time',
      place: 'Green Lake playground',
      neighborhoodId: 'hood-1',
      startDate: '2026-09-12',
      startMinutes: 15 * 60 + 30,
      durationMinutes: 90,
      ageHint: '',
      details: 'Bring snacks',
    })
    // The round trip is exact: saving these values unchanged recomputes the
    // same instants, which is what lets the no-op check stay quiet.
    const post = storedPost()
    expect(computeStartIso(values.startDate, values.startMinutes)).toBe(post.starts_at)
    expect(
      computeEndIso(values.startDate, values.startMinutes, values.durationMinutes),
    ).toBe(post.ends_at)
  })

  it('nulls become empty strings (no details / no address are not the string "null")', () => {
    const values = playdateFormValuesFromPost(storedPost({ details: null }))
    expect(values.details).toBe('')
  })

  it('a stored NULL neighbourhood prefills the select as "none" (V9 ticket 01)', () => {
    // The /edit form's select value must be a string; '' is the empty option
    // the form already renders, and it is what a post with no neighbourhood
    // has to show. React would warn on a null select value, and the update
    // payload would try to write ''. 
    const values = playdateFormValuesFromPost(storedPost({ neighborhood_id: null }))
    expect(values.neighborhoodId).toBe('')
  })

  it('keeps an off-grid stored start EXACTLY (never silently snapped to the 30-minute grid)', () => {
    const values = playdateFormValuesFromPost(
      storedPost({
        starts_at: computeStartIso('2026-09-12', 15 * 60 + 17),
        ends_at: computeEndIso('2026-09-12', 15 * 60 + 17, 60),
      }),
    )
    expect(values.startMinutes).toBe(15 * 60 + 17)
    expect(values.startDate).toBe('2026-09-12')
  })

  it('invents no fifth duration chip: a stored duration outside the pinned set prefills as "none picked"', () => {
    const values = playdateFormValuesFromPost(
      storedPost({ ends_at: computeEndIso('2026-09-12', 15 * 60 + 30, 45) }),
    )
    expect(values.durationMinutes).toBe(0)
    expect(isDuration(values.durationMinutes)).toBe(false)
  })
})

describe('playdateEditFieldsChanged (V8 ticket 05)', () => {
  const original = {
    title: 'Playground time',
    place: 'Green Lake playground',
    address: '7200 4th Ave NE',
    neighborhood_id: 'hood-1',
    starts_at: computeStartIso('2026-09-12', 15 * 60 + 30),
    ends_at: computeEndIso('2026-09-12', 15 * 60 + 30, 90),
    details: 'Bring snacks',
    kidIds: ['kid-1'],
  }
  const values = playdateFormValuesFromPost(original)

  it('is false for an untouched form (the no-op save writes nothing)', () => {
    expect(playdateEditFieldsChanged(original, values, original.address)).toBe(false)
  })

  it('is false for whitespace the form would trim anyway', () => {
    expect(
      playdateEditFieldsChanged(
        original,
        { ...values, title: `  ${values.title}  `, details: `${values.details} ` },
        ` ${original.address} `,
      ),
    ).toBe(false)
  })

  it('is false when the stored timestamps are spelled differently but are the same instant', () => {
    // Postgres answers in whatever offset it likes: "+00:00" and "Z" are the
    // same moment and must never read as an edit.
    expect(
      playdateEditFieldsChanged(
        {
          ...original,
          starts_at: original.starts_at.replace('Z', '+00:00'),
          ends_at: original.ends_at.replace('Z', '+00:00'),
        },
        values,
        original.address,
      ),
    ).toBe(false)
  })

  it('is false when both sides have no details/address (null vs empty string)', () => {
    const bare = { ...original, address: null, details: null }
    expect(playdateEditFieldsChanged(bare, playdateFormValuesFromPost(bare), '')).toBe(false)
  })

  it('is true for each editable field', () => {
    expect(playdateEditFieldsChanged(original, { ...values, title: 'New title' }, original.address)).toBe(true)
    expect(playdateEditFieldsChanged(original, { ...values, place: 'New place' }, original.address)).toBe(true)
    expect(playdateEditFieldsChanged(original, values, '9 Elsewhere St')).toBe(true)
    expect(playdateEditFieldsChanged(original, { ...values, neighborhoodId: 'hood-2' }, original.address)).toBe(true)
    expect(playdateEditFieldsChanged(original, { ...values, details: 'Changed' }, original.address)).toBe(true)
    expect(playdateEditFieldsChanged(original, { ...values, details: '' }, original.address)).toBe(true)
    expect(playdateEditFieldsChanged(original, { ...values, startDate: '2026-09-13' }, original.address)).toBe(true)
    expect(
      playdateEditFieldsChanged(
        original,
        { ...values, startMinutes: values.startMinutes + TIME_STEP_MINUTES },
        original.address,
      ),
    ).toBe(true)
    expect(playdateEditFieldsChanged(original, { ...values, durationMinutes: 180 }, original.address)).toBe(true)
  })

  it('does not consider the age hint (the edit form neither renders nor writes it)', () => {
    expect(playdateEditFieldsChanged(original, { ...values, ageHint: 'best for 2-5' }, original.address)).toBe(false)
  })

  it('treats a stored NULL neighbourhood and an untouched empty field as UNCHANGED (V9 ticket 01)', () => {
    // A post created after this ticket carries no neighbourhood, and the form's
    // value for "none" is ''. Comparing them raw would report an edit on every
    // open and make the form write on a save that changed nothing.
    const bare = { ...original, neighborhood_id: null }
    expect(playdateEditFieldsChanged(bare, playdateFormValuesFromPost(bare), original.address)).toBe(false)
    // Setting one where there was none IS a change, and so is clearing one.
    expect(
      playdateEditFieldsChanged(bare, { ...values, neighborhoodId: 'hood-1' }, original.address),
    ).toBe(true)
    expect(
      playdateEditFieldsChanged(original, { ...values, neighborhoodId: '' }, original.address),
    ).toBe(true)
  })
})

describe('neighborhoodIdField (V9 ticket 01: the /new insert with no neighbourhood)', () => {
  it('omits the key entirely when no neighbourhood was chosen', () => {
    // '' is the form's "none" — and an empty string is NOT a uuid: sending it
    // would 22P02 both before and after 0035. The key is absent instead, which
    // pre-0035 is the documented 23502 red and post-0035 is simply NULL.
    expect(neighborhoodIdField('')).toEqual({})
    expect(neighborhoodIdField(null)).toEqual({})
    expect(neighborhoodIdField(undefined)).toEqual({})
    expect(neighborhoodIdField('   ')).toEqual({})
    expect('neighborhood_id' in neighborhoodIdField('')).toBe(false)
  })

  it('carries a real id (and trims it)', () => {
    expect(neighborhoodIdField('hood-1')).toEqual({ neighborhood_id: 'hood-1' })
    expect(neighborhoodIdField(' hood-1 ')).toEqual({ neighborhood_id: 'hood-1' })
  })
})

describe('playdateEditKidIdsChanged (V8 ticket 05)', () => {
  it('is order-insensitive (the read is name-ordered, the picker is tap-ordered)', () => {
    expect(playdateEditKidIdsChanged(['a', 'b'], ['b', 'a'])).toBe(false)
  })

  it('is false for two empty selections (the failed-read case: no write, no clobbering)', () => {
    expect(playdateEditKidIdsChanged([], [])).toBe(false)
  })

  it('is true for an added, removed, or replaced kid', () => {
    expect(playdateEditKidIdsChanged(['a'], ['a', 'b'])).toBe(true)
    expect(playdateEditKidIdsChanged(['a', 'b'], ['a'])).toBe(true)
    expect(playdateEditKidIdsChanged(['a'], ['b'])).toBe(true)
    expect(playdateEditKidIdsChanged(['a'], [])).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// V8 ticket 07: the distance-model fix — a drop-in's location is the PLACE it
// names, not the host's driveway (migration 0030). Added alongside the existing
// filterFeed suite; nothing above it was changed.

/** A place ~2.5 mi from the viewer's 98107 (the Green Lake area). */
const NEAR_PLACE = { lat: 47.6805, lng: -122.3267 }
/** A place ~53 mi from the viewer (way outside any pinned radius). */
const FAR_PLACE = { lat: 46.9, lng: -122.0 }

describe('postDistanceMiles (V8 ticket 07: place coordinates first, host zip as the fallback)', () => {
  it('uses the PLACE coordinates when the post names a place', () => {
    const viaPlace = postDistanceMiles({ host: { home_zip: '98007' }, place_coords: NEAR_PLACE }, VIEWER, ZIP_COORDS)
    expect(viaPlace).not.toBeNull()
    expect(viaPlace!).toBeCloseTo(haversineMiles(ZIP_COORDS.get('98107')!, NEAR_PLACE), 10)
    // …and NOT the host-zip answer (~11.5 mi), which is what the old model used.
    expect(viaPlace!).toBeLessThan(5)
  })

  it('ignores the host zip entirely once a place is present (the park across town)', () => {
    const atPlace = postDistanceMiles({ host: { home_zip: '98107' }, place_coords: FAR_PLACE }, VIEWER, ZIP_COORDS)
    expect(atPlace!).toBeGreaterThan(35)
  })

  it('falls back to the host home zip when the post names no place', () => {
    const viaHost = postDistanceMiles({ host: { home_zip: '98007' } }, VIEWER, ZIP_COORDS)
    expect(viaHost).not.toBeNull()
    expect(viaHost!).toBeCloseTo(
      haversineMiles(ZIP_COORDS.get('98107')!, ZIP_COORDS.get('98007')!),
      10,
    )
  })

  it('falls back to the host zip when the place row is unreadable or coordinate-less', () => {
    const noCoords = postDistanceMiles(
      { host: { home_zip: '98007' }, place_id: 'p1', place_coords: { lat: null, lng: null } },
      VIEWER,
      ZIP_COORDS,
    )
    expect(noCoords!).toBeCloseTo(haversineMiles(ZIP_COORDS.get('98107')!, ZIP_COORDS.get('98007')!), 10)
    // place_id with NO joined place at all behaves identically (the join failed).
    const noJoin = postDistanceMiles({ host: { home_zip: '98007' }, place_id: 'p1' }, VIEWER, ZIP_COORDS)
    expect(noJoin!).toBeCloseTo(noCoords!, 10)
  })

  it('is null when neither leg resolves (no place, no host zip) — coordinates are never invented', () => {
    expect(postDistanceMiles({ host: { home_zip: null } }, VIEWER, ZIP_COORDS)).toBeNull()
    expect(postDistanceMiles({}, VIEWER, ZIP_COORDS)).toBeNull()
    expect(postDistanceMiles({ host: { home_zip: '98107' } }, { homeZip: null, radiusMiles: 5 }, ZIP_COORDS)).toBeNull()
    expect(postDistanceMiles({ host: { home_zip: '00000' } }, VIEWER, ZIP_COORDS)).toBeNull()
    // A place_id whose place never joined, with no usable host zip either.
    expect(postDistanceMiles({ place_id: 'p1' }, VIEWER, ZIP_COORDS)).toBeNull()
    expect(
      postDistanceMiles({ place_id: 'p1', place_coords: { lat: null, lng: null } }, VIEWER, ZIP_COORDS),
    ).toBeNull()
  })

  it('coerces the numeric-as-string coordinates postgrest actually returns', () => {
    const viaStrings = postDistanceMiles(
      { place_coords: { lat: String(NEAR_PLACE.lat), lng: String(NEAR_PLACE.lng) } },
      VIEWER,
      ZIP_COORDS,
    )
    expect(viaStrings!).toBeCloseTo(haversineMiles(ZIP_COORDS.get('98107')!, NEAR_PLACE), 10)
  })
})

describe('placeDistanceMiles / coordNumber (V8 ticket 07)', () => {
  it('measures from the place to the viewer, null for anything unknown', () => {
    expect(placeDistanceMiles(NEAR_PLACE, VIEWER, ZIP_COORDS)).toBeCloseTo(
      haversineMiles(ZIP_COORDS.get('98107')!, NEAR_PLACE),
      10,
    )
    expect(placeDistanceMiles(null, VIEWER, ZIP_COORDS)).toBeNull()
    expect(placeDistanceMiles({ lat: null, lng: -122.3 }, VIEWER, ZIP_COORDS)).toBeNull()
    expect(placeDistanceMiles(NEAR_PLACE, { homeZip: null }, ZIP_COORDS)).toBeNull()
    expect(placeDistanceMiles(NEAR_PLACE, { homeZip: '00000' }, ZIP_COORDS)).toBeNull()
  })

  it('coordNumber accepts numbers and numeric strings, and rejects what is not a coordinate', () => {
    expect(coordNumber(47.5)).toBe(47.5)
    expect(coordNumber('47.5')).toBe(47.5)
    expect(coordNumber(null)).toBeNull()
    expect(coordNumber(undefined)).toBeNull()
    expect(coordNumber('')).toBeNull()
    expect(coordNumber('not-a-number')).toBeNull()
    expect(coordNumber(Number.NaN)).toBeNull()
    expect(coordNumber(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('filterFeed with places (V8 ticket 07: the MIXED feed)', () => {
  /**
   * The whole point of the ticket in one array: a place-hosted post whose HOST
   * is near but whose PLACE is far (must drop — it used to be kept), a
   * place-hosted post whose HOST is far but whose PLACE is near (must be kept —
   * it used to be dropped), a legacy free-text post (host zip only, unchanged),
   * a place post whose place row never joined, and a post with nothing at all.
   *
   * V9 ticket 04: every fixture's END is after the fixed noon (at(720)), so the
   * only reason a row is dropped below is the rule the test is about. The
   * starts_at times are the ticket-07 ones (the expectations and their comments
   * are unchanged); the `legacy-free-text` row keeps its 11:00 start with a
   * 15:00 end because an ENDED row would be dropped before the distance model
   * ever saw it — which is the point of the other suite, not this one.
   */
  const mixed: Array<FeedPost & { id: string }> = [
    {
      id: 'place-host-near-place-far',
      host_profile_id: 'h1',
      starts_at: at(600),
      ends_at: at(900),
      host: { home_zip: '98007' },
      place_id: 'p-far',
      place_coords: FAR_PLACE,
    },
    {
      id: 'place-host-far-place-near',
      host_profile_id: 'h2',
      starts_at: at(720),
      ends_at: at(780),
      host: { home_zip: '98007' },
      place_id: 'p-near',
      place_coords: NEAR_PLACE,
    },
    {
      id: 'legacy-free-text',
      host_profile_id: 'h3',
      starts_at: at(660),
      ends_at: at(900),
      host: { home_zip: '98007' },
      place_id: null,
    },
    {
      id: 'place-not-joined',
      host_profile_id: 'h4',
      starts_at: at(780),
      ends_at: at(840),
      host: { home_zip: '98007' },
      place_id: 'p-unreadable',
      place_coords: null,
    },
    {
      id: 'nothing-at-all',
      host_profile_id: 'h5',
      starts_at: at(840),
      ends_at: at(900),
      host: { home_zip: null },
    },
  ]

  it('keeps exactly the posts a radius feed can locate, ordered by starts_at', () => {
    const kept = filterFeed(mixed, VIEWER, ZIP_COORDS, new Set(), NOW_ISO)
    // starts_at order: 660 (free text) < 720 (place, host far) < 780 (place, not joined).
    expect(kept.map((post) => post.id)).toEqual([
      'legacy-free-text',
      'place-host-far-place-near',
      'place-not-joined',
    ])
  })

  it('drops a place-hosted post whose PLACE is out of radius even though its host is in it', () => {
    const kept = filterFeed(mixed, VIEWER, ZIP_COORDS, new Set(), NOW_ISO)
    expect(kept.some((post) => post.id === 'place-host-near-place-far')).toBe(false)
  })

  it('keeps a place-hosted post whose PLACE is in radius even though its host zip is not', () => {
    const tight: RadiusViewer = { homeZip: '98107', radiusMiles: 5 }
    const kept = filterFeed(mixed, tight, ZIP_COORDS, new Set(), NOW_ISO)
    // At 5 miles the 98007 host (11.5 mi) is out for the host-zip posts…
    expect(kept.map((post) => post.id)).toEqual(['place-host-far-place-near'])
    // …and the place-hosted post that IS 2.5 mi away survives — the fix.
    expect(postDistanceMiles(kept[0], tight, ZIP_COORDS)!).toBeLessThan(5)
  })

  it('leaves the legacy free-text feed untouched (no place_id anywhere = yesterdays behaviour)', () => {
    const legacy: Array<FeedPost & { id: string }> = [
      {
        id: 'a',
        host_profile_id: 'h1',
        starts_at: at(780),
        ends_at: at(840),
        host: { home_zip: '98007' },
      },
      {
        id: 'b',
        host_profile_id: 'h2',
        starts_at: at(840),
        ends_at: at(900),
        host: { home_zip: '00000' },
      },
    ]
    const kept = filterFeed(legacy, VIEWER, ZIP_COORDS, new Set(), NOW_ISO)
    expect(kept.map((post) => post.id)).toEqual(['a'])
  })

  it('still applies the block, hide, and ended filters to place-hosted posts', () => {
    // V9 ticket 04: the three dropped fixtures all sit AFTER the fixed noon, so
    // each is dropped by the rule it is here for — a row that is dropped for
    // being ended could hide a broken block or hide filter completely.
    const posts: Array<FeedPost & { id: string }> = [
      {
        id: 'blocked',
        host_profile_id: 'h1',
        starts_at: at(780),
        ends_at: at(840),
        place_coords: NEAR_PLACE,
      },
      {
        id: 'hidden',
        host_profile_id: 'h2',
        starts_at: at(840),
        ends_at: at(900),
        place_coords: NEAR_PLACE,
        hidden_at: 'x',
      },
      {
        id: 'ended',
        host_profile_id: 'h3',
        starts_at: at(600),
        ends_at: at(660),
        place_coords: NEAR_PLACE,
      },
      {
        id: 'ok',
        host_profile_id: 'h4',
        starts_at: at(900),
        ends_at: at(960),
        place_coords: NEAR_PLACE,
      },
    ]
    expect(filterFeed(posts, VIEWER, ZIP_COORDS, new Set(['h1']), NOW_ISO).map((p) => p.id)).toEqual(['ok'])
  })
})

describe('formatStartDayLabel (V9 ticket 03: the /new summary day line)', () => {
  it('names the day from the form’s date value, locale-independently', () => {
    expect(formatStartDayLabel('2026-08-29')).toBe('Sat, Aug 29')
    expect(formatStartDayLabel('2026-08-31')).toBe('Mon, Aug 31')
    expect(formatStartDayLabel('2026-01-01')).toBe('Thu, Jan 1')
  })

  it('trims, and says NOTHING rather than inventing a day', () => {
    expect(formatStartDayLabel('  2026-08-29  ')).toBe('Sat, Aug 29')
    // The summary turns '' into "no day picked"; a wrong day would be worse.
    expect(formatStartDayLabel('')).toBe('')
    expect(formatStartDayLabel('not-a-date')).toBe('')
  })

  it('agrees with formatDayLabel once the day is neither today nor tomorrow', () => {
    // One table, one parse, one set of words — the summary and the feed's own
    // day header cannot drift apart for a future day.
    expect(formatStartDayLabel('2026-08-29')).toBe(
      formatDayLabel('2026-08-29T15:30:00', '2026-07-04T12:00:00'),
    )
  })
})

describe('moreOptionsHoldsError (V9 ticket 03: no error hidden behind the disclosure)', () => {
  it('is true exactly when a DISCLOSURE field failed', () => {
    expect(moreOptionsHoldsError({ startDate: 'Pick a start date.' })).toBe(true)
    expect(moreOptionsHoldsError({ startMinutes: 'Pick a start time.' })).toBe(true)
    // The visible answers do not need the disclosure opened to be seen.
    expect(moreOptionsHoldsError({ place: 'Add a place (park, lot, field).' })).toBe(false)
    expect(moreOptionsHoldsError({ durationMinutes: 'Pick a duration.' })).toBe(false)
    expect(moreOptionsHoldsError({})).toBe(false)
  })

  it('names the fields the disclosure actually renders', () => {
    // The list is the contract: the start date + the 30-minute stepper are the
    // only REQUIRED answers behind "More options" (the kids picker, the address,
    // the details and the repeat toggle are optional, so no rule of theirs can
    // fire). A required field added to the disclosure without being added here
    // would hide its own error — which is why this list is pinned.
    expect([...MORE_OPTIONS_FIELDS]).toEqual(['startDate', 'startMinutes'])
  })
})
