import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
// The cross-seam agreement pin (review cycle 1, F6): the place page's age line
// and a drop-in's stated range must spell one band the same way.
import { placeAgeFitLabel } from './places'
import {
  AGE_RANGE_ALL_AGES_WIDTH,
  ageBounds,
  ageBoundsFromSelectedKids,
  ageBoundsLine,
  ageRangeFields,
  ageRangeLine,
  cardAgeLineDecision,
  cardAgeRangeLabel,
  cardWhenLabel,
  buildGoingLine,
  buildWhileAwayItems,
  cloneLastPost,
  clonedStart,
  computeEndIso,
  computeStartIso,
  daySectionIso,
  DEFAULT_RADIUS_MILES,
  defaultStartDateIso,
  durationChipForUntilNextHour,
  durationLabel,
  dueToRefreshLastSeen,
  emptyRadiusCopy,
  EMPTY_RADIUS_BROWSE_HEADLINE,
  EMPTY_RADIUS_BROWSE_LABEL,
  filterFeed,
  formatDayLabel,
  formatDistanceLabel,
  formatGuestLine,
  formatMonthLabel,
  formatStartDayLabel,
  formatTimeLabel,
  formatTimeWindow,
  groupByDay,
  GOING_CIRCLE_LIMIT,
  beyondRadiusCount,
  emptyRadiusBeyondCopy,
  smallHoursStartNote,
  SMALL_HOURS_END_MINUTES,
  goingCountsLabel,
  goingPingsByPost,
  haversineMiles,
  hostCommonGroundLine,
  hostDistanceMiles,
  instantDayLabel,
  isDuration,
  isEnded,
  isHappeningNow,
  isHiddenPost,
  isStartingSoon,
  isPostableDuration,
  isSteppedTime,
  isStillAhead,
  kidHeading,
  kidLabel,
  kidsComingLine,
  KID_AGE_MAX,
  KID_AGE_MIN,
  lastOwnPlaydateFrom,
  localDayKey,
  localMonthKey,
  mapsHref,
  MORE_OPTIONS_FIELDS,
  moreOptionsHoldsError,
  neighborhoodIdField,
  nextSlotMinutes,
  partitionPostsByTime,
  pastDropInsHref,
  PAST_DROP_INS_LABEL,
  pastPostStatusLabel,
  PLAYDATE_DURATIONS_MINUTES,
  playdateAgeRangeLine,
  playdateEditFieldsChanged,
  playdateEditKidIdsChanged,
  playdateFormValuesFromPost,
  playdateKidsKidIds,
  queryLastOwnPlaydateWithClient,
  queryMyPlaydatesWithClient,
  queryPastOwnPlaydatesWithClient,
  queryRecentOwnPlacesWithClient,
  queryUpcomingFeedWithClient,
  rainBadgeLabel,
  RADIUS_MAX_MILES,
  RADIUS_MIN_MILES,
  RADIUS_SAVE_FAILED_COPY,
  RADIUS_SAVE_REJECTED_COPY,
  radiusSaveErrorMessage,
  distanceChoiceFromValue,
  feedZipSaveIsNoop,
  milesWord,
  distanceSelectValue,
  type DistanceChoice,
  RADIUS_MILES_OPTIONS,
  RADIUS_SLIDER_CEILING_MILES,
  radiusEscapes,
  radiusSliderCeiling,
  homeZipControlLabel,
  feedCardCountdown,
  feedLocationSummary,
  feedNowSummary,
  radiusChoices,
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
  statedAgeRangeLine,
  stepTimeMinutes,
  suggestedDurationMinutes,
  TIME_STEP_MINUTES,
  TITLE_MAX_LENGTH,
  toDuplicatePrefill,
  validateHomeZip,
  validatePlaydateForm,
  validateRadiusMiles,
  WHILE_AWAY_ITEM_LIMIT,
  WIDEN_RADIUS_MILES,
  withinRadius,
  type FeedPost,
  type GoingPinger,
  type LastOwnPlaydate,
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
// V10 ticket 01: the REAL generated-title seam, to pin the clone's
// cycle-avoiding restatement against (they must not drift).
import { generatedTitle as realGeneratedTitle } from './postSummary'

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

describe('instantDayLabel (the bare date both the card and the archive row print)', () => {
  it('is the always-the-date wording, never "Today"/"Tomorrow"', () => {
    expect(instantDayLabel(at(1200))).toBe('Fri, Sep 4') // same local day as NOW_ISO
    expect(instantDayLabel(new Date(2026, 8, 12, 15, 0).toISOString())).toBe('Sat, Sep 12')
    expect(instantDayLabel(new Date(2026, 11, 25, 9, 0).toISOString())).toBe('Fri, Dec 25')
  })

  it('is the day half of the card’s when line (one expression, two surfaces)', () => {
    const start = new Date(2026, 8, 12, 18, 30).toISOString()
    const end = new Date(2026, 8, 12, 19, 30).toISOString()
    expect(cardWhenLabel(start, end).startsWith(instantDayLabel(start))).toBe(true)
  })

  it('is empty for an instant that does not parse (no invented day)', () => {
    expect(instantDayLabel('not-a-date')).toBe('')
  })
})

describe('localMonthKey / formatMonthLabel (the profile archive’s month anchors)', () => {
  it('is the device-local YYYY-MM of the instant', () => {
    expect(localMonthKey(NOW_ISO)).toBe('2026-09')
    expect(localMonthKey(new Date(2026, 0, 15, 23, 59).toISOString())).toBe('2026-01')
    expect(localMonthKey(new Date(2026, 11, 31, 23, 59).toISOString())).toBe('2026-12')
  })

  it('rolls at the local month boundary, not before it', () => {
    expect(localMonthKey(new Date(2026, 8, 30, 23, 59).toISOString())).toBe('2026-09')
    expect(localMonthKey(new Date(2026, 9, 1, 0, 0).toISOString())).toBe('2026-10')
  })

  it('labels a month with the app’s own short month words', () => {
    expect(formatMonthLabel(NOW_ISO)).toBe('Sep 2026')
    expect(formatMonthLabel(new Date(2026, 11, 25, 9, 0).toISOString())).toBe('Dec 2026')
    expect(formatMonthLabel(new Date(2027, 0, 2, 9, 0).toISOString())).toBe('Jan 2027')
  })

  it('invents no month for an instant that does not parse', () => {
    expect(localMonthKey('not-a-date')).toBe('')
    expect(formatMonthLabel('not-a-date')).toBe('')
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

  it('is false when the host ended the post early — even while the window is still ahead (V12 t03)', () => {
    // The host's "End this post now": the window ends at 3 PM and has not
    // ended yet (now is noon), but the post is over, so it is no longer
    // "ahead" under the feed rule.
    // (The DB half of the same rule — .neq('status', 'ended') — is asserted in
    // the queryUpcomingFeedWithClient suite.)
    // `starts_at` is deliberately absent: isStillAhead reads only `ends_at` +
    // `status` (the sibling test pins that the start time is irrelevant to the
    // cutoff), so a post ending at 3 PM is "ended-early" regardless of its start.
    const ended = { ends_at: at(900), status: 'ended' }
    expect(isStillAhead(ended, at(720))).toBe(false) // noon, two hours before the end
    // The 'on' twin of the same window (and the one with no status at all)
    // is still ahead — only the explicit 'ended' flag changes the answer.
    expect(isStillAhead({ ends_at: at(900), status: 'on' }, at(720))).toBe(true)
    expect(isStillAhead({ ends_at: at(900) }, at(720))).toBe(true)
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

describe('feedCardCountdown (V27 slice 2: the per-card time-to-start-or-end line)', () => {
  // NOW_ISO is local 12:00 PM (minute 720) on the fixed day.
  it('says "starts in 20 min" (tone starting) when the start is within the hour', () => {
    expect(feedCardCountdown({ starts_at: at(740), ends_at: at(800) }, NOW_ISO)).toEqual({
      tone: 'starting',
      label: 'starts in 20 min',
      minutes: 20,
    })
  })

  it('is inclusive at the 60-minute boundary ("starts in 60 min")', () => {
    expect(feedCardCountdown({ starts_at: at(780), ends_at: at(840) }, NOW_ISO)).toEqual({
      tone: 'starting',
      label: 'starts in 60 min',
      minutes: 60,
    })
  })

  it('is null one minute beyond the window (61 min out)', () => {
    expect(feedCardCountdown({ starts_at: at(781), ends_at: at(841) }, NOW_ISO)).toBeNull()
  })

  it('says "ends in N min" (tone ending) for a post that is happening now', () => {
    expect(feedCardCountdown({ starts_at: at(700), ends_at: at(760) }, NOW_ISO)).toEqual({
      tone: 'ending',
      label: 'ends in 40 min',
      minutes: 40,
    })
  })

  it('says "ending now" at the exact end boundary (now === ends_at)', () => {
    expect(feedCardCountdown({ starts_at: at(660), ends_at: at(720) }, NOW_ISO)).toEqual({
      tone: 'ending',
      label: 'ending now',
      minutes: 0,
    })
  })

  it('is null after the end (an ended post has no countdown)', () => {
    expect(feedCardCountdown({ starts_at: at(600), ends_at: at(719) }, NOW_ISO)).toBeNull()
  })

  it('is null when any of the three instants is unparseable (never invented)', () => {
    expect(feedCardCountdown({ starts_at: 'nope', ends_at: at(800) }, NOW_ISO)).toBeNull()
    expect(feedCardCountdown({ starts_at: at(740), ends_at: 'nope' }, NOW_ISO)).toBeNull()
    expect(feedCardCountdown({ starts_at: at(740), ends_at: at(800) }, 'nope')).toBeNull()
  })
})

describe('feedNowSummary (V27 slice 2: "N happening now · M today")', () => {
  it('joins the live and today counts, dropping the zero part', () => {
    // Two live (started, not ended) + one future today = 3 in today's section;
    // the tomorrow post is in the feed but not in today's count.
    const posts = [
      { starts_at: at(660), ends_at: at(780) }, // live
      { starts_at: at(700), ends_at: at(800) }, // live
      { starts_at: at(780), ends_at: at(840) }, // today, later
      { starts_at: at(1500), ends_at: at(1560) }, // tomorrow
    ]
    expect(feedNowSummary(posts, NOW_ISO)).toBe('2 happening now · 3 today')
  })

  it('is null when there is nothing live or today', () => {
    expect(feedNowSummary([], NOW_ISO)).toBeNull()
    const tomorrowOnly = [{ starts_at: at(1500), ends_at: at(1560) }]
    expect(feedNowSummary(tomorrowOnly, NOW_ISO)).toBeNull()
  })

  it('says "3 today" when none of them are live', () => {
    const posts = [
      { starts_at: at(780), ends_at: at(840) },
      { starts_at: at(840), ends_at: at(900) },
      { starts_at: at(900), ends_at: at(960) },
    ]
    expect(feedNowSummary(posts, NOW_ISO)).toBe('3 today')
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

describe('beyondRadiusCount (V29 v29-6 — the empty state\'s honest "is it worth widening?")', () => {
  it('counts what the WIDEST radius would reveal and the current one hides', () => {
    // 98007 is ~11.5 mi from 98107: outside 5, inside 20 and 35.
    const posts: FeedPost[] = [postAt('98007', 'h-far', 900), postAt('98107', 'h-near', 780)]
    expect(beyondRadiusCount(posts, NARROW_VIEWER, ZIP_COORDS, new Set(), NOW_ISO)).toBe(1)
    // At 20 miles it is already on screen, so nothing is "further out".
    expect(beyondRadiusCount(posts, VIEWER, ZIP_COORDS, new Set(), NOW_ISO)).toBe(0)
  })

  it('is 0 at the widest radius — there is nothing further to widen TO', () => {
    const posts: FeedPost[] = [postAt('98007', 'h-far', 900)]
    const widest: RadiusViewer = { homeZip: '98107', radiusMiles: SEE_ALL_RADIUS_MILES }
    expect(beyondRadiusCount(posts, widest, ZIP_COORDS, new Set(), NOW_ISO)).toBe(0)
  })

  it('counts only what an escape would ACTUALLY reveal — a blocked host is not counted', () => {
    const posts: FeedPost[] = [
      postAt('98007', 'host-blocked', 900),
      postAt('98007', 'h-far', 900),
    ]
    expect(beyondRadiusCount(posts, NARROW_VIEWER, ZIP_COORDS, BLOCKED_HOSTS, NOW_ISO)).toBe(1)
  })

  it('does not count an ENDED post — the number can never promise what the feed would hide', () => {
    const posts: FeedPost[] = [postAt('98007', 'h-ended', 600)] // 10:00–11:00, now is 12:00
    expect(beyondRadiusCount(posts, NARROW_VIEWER, ZIP_COORDS, new Set(), NOW_ISO)).toBe(0)
  })

  it('is 0 for an empty city — never negative, never invented', () => {
    expect(beyondRadiusCount([], NARROW_VIEWER, ZIP_COORDS, new Set(), NOW_ISO)).toBe(0)
  })
})

describe('emptyRadiusBeyondCopy (V29 v29-6)', () => {
  it('renders nothing for 0 or a negative count — an empty city is not sold a number', () => {
    expect(emptyRadiusBeyondCopy(0)).toBeNull()
    expect(emptyRadiusBeyondCopy(-1)).toBeNull()
  })

  it('is singular for one, plural for more, and names the SAME ceiling the escape writes', () => {
    expect(emptyRadiusBeyondCopy(1)).toBe('1 drop-in is further out, within 35 miles.')
    expect(emptyRadiusBeyondCopy(3)).toBe('3 drop-ins are further out, within 35 miles.')
    expect(emptyRadiusBeyondCopy(3)).toContain(String(SEE_ALL_RADIUS_MILES))
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

  it('V29 v29-7: the viewer\'s OWN post is exempt from the radius — and nobody else\'s is', () => {
    // 98007 is ~11.5 mi from 98107: outside 5, inside 35.
    const posts: FeedPost[] = [postAt('98007', 'me', 900), postAt('98007', 'someone-else', 900)]
    // The default (no viewer id) is exactly today's rule: everything beyond the
    // radius is out, including one's own post.
    expect(filterFeed(posts, NARROW_VIEWER, ZIP_COORDS, new Set(), NOW_ISO)).toEqual([])
    expect(filterFeed(posts, NARROW_VIEWER, ZIP_COORDS, new Set(), NOW_ISO, null)).toEqual([])
    expect(
      filterFeed(posts, NARROW_VIEWER, ZIP_COORDS, new Set(), NOW_ISO, 'me').map(
        (p) => p.host_profile_id,
      ),
    ).toEqual(['me'])
  })

  it('V29 v29-7: the exemption is DISTANCE ONLY — ended, blocked and unplaceable own posts stay out', () => {
    const ended: FeedPost[] = [postAt('98007', 'me', 600)] // 10:00–11:00, now is 12:00
    expect(filterFeed(ended, NARROW_VIEWER, ZIP_COORDS, new Set(), NOW_ISO, 'me')).toEqual([])
    const blocked: FeedPost[] = [postAt('98007', 'me', 900)]
    expect(filterFeed(blocked, NARROW_VIEWER, ZIP_COORDS, new Set(['me']), NOW_ISO, 'me')).toEqual(
      [],
    )
    // "coordinates are never invented": an own post with no resolvable location
    // has no distance and no place on the map, so it stays out of the feed.
    const unplaceable: FeedPost[] = [postAt(null, 'me', 900)]
    expect(filterFeed(unplaceable, NARROW_VIEWER, ZIP_COORDS, new Set(), NOW_ISO, 'me')).toEqual([])
  })

  it('V29 v29-7: an own post INSIDE the radius is unchanged — once, in starts_at order', () => {
    const posts: FeedPost[] = [postAt('98107', 'me', 900), postAt('98107', 'other', 780)]
    expect(
      filterFeed(posts, NARROW_VIEWER, ZIP_COORDS, new Set(), NOW_ISO, 'me').map(
        (p) => p.host_profile_id,
      ),
    ).toEqual(['other', 'me'])
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

describe('validateRadiusMiles (the pinned 1–35 bounds, 0045 CHECK backstop)', () => {
  it('accepts every pinned option — including the new 1-mile floor', () => {
    for (const miles of RADIUS_MILES_OPTIONS) {
      expect(validateRadiusMiles(miles)).toBeNull()
    }
  })

  it('accepts the 1-mile option (V16 t07 item 3: the UI must not offer what it cannot save)', () => {
    // The defect this pins: RADIUS_MILES_OPTIONS carrying 1 while
    // RADIUS_MIN_MILES stayed 2 would render a "Within 1 mile" choice that
    // validateRadiusMiles rejects at save time. The two constants must agree.
    expect(RADIUS_MILES_OPTIONS).toContain(1)
    expect(RADIUS_MIN_MILES).toBe(1)
    expect(validateRadiusMiles(RADIUS_MIN_MILES)).toBeNull()
  })

  it('rejects out-of-range and non-integer values', () => {
    expect(validateRadiusMiles(0)).not.toBeNull()
    expect(validateRadiusMiles(36)).not.toBeNull()
    expect(validateRadiusMiles(1.5)).not.toBeNull()
    expect(validateRadiusMiles(Number.NaN)).not.toBeNull()
  })

  it('states the same bounds its constants carry', () => {
    expect(validateRadiusMiles(0)).toBe(
      `Pick a radius between ${RADIUS_MIN_MILES} and ${RADIUS_MAX_MILES} miles.`,
    )
  })
})

/**
 * V16 t09: what the user READS when a radius write is rejected.
 *
 * The bug this covers was live, not hypothetical: the deployed UI offered
 * "Within 1 mile" while the deployed DB still had
 * `profiles_radius_miles_chk = check (radius_miles between 2 and 35)` (0045
 * committed, not applied), so choosing it threw a PostgREST error whose
 * `.message` — "new row for relation \"profiles\" violates check constraint
 * \"profiles_radius_miles_chk\"" — was rendered verbatim into the red line.
 *
 * The middle case below is the one that matters most: the app's OWN validator
 * messages are already written for a parent, and a mapper that "improves" them
 * is a regression, not a fix.
 */
describe('radiusSaveErrorMessage (V16 t09 — the DB error, said in English)', () => {
  it('explains a CHECK-constraint violation without leaking the constraint name', () => {
    // The real shape PostgREST sends: a plain object with a `code`, NOT an
    // Error instance — the trap that makes `err instanceof Error` alone wrong.
    const postgrestError = {
      code: '23514',
      message:
        'new row for relation "profiles" violates check constraint "profiles_radius_miles_chk"',
      details: 'Failing row contains (..., 1).',
      hint: null,
    }
    const copy = radiusSaveErrorMessage(postgrestError)
    expect(copy).toBe(RADIUS_SAVE_REJECTED_COPY)
    expect(copy).toContain(`${RADIUS_MIN_MILES} and ${RADIUS_MAX_MILES}`)
    // The whole point: no SQL, no table name, no constraint identifier.
    expect(copy).not.toContain('profiles_radius_miles_chk')
    expect(copy).not.toContain('check constraint')
    expect(copy).not.toContain('new row for relation')
    expect(copy).not.toMatch(/23514|relation "|SQL/i)
  })

  it('still catches it when the code was lost and only the message survived', () => {
    // A rethrown / stringified error keeps the prose but drops the SQLSTATE.
    const copy = radiusSaveErrorMessage(
      new Error('new row for relation "profiles" violates check constraint "profiles_radius_miles_chk"'),
    )
    expect(copy).toBe(RADIUS_SAVE_REJECTED_COPY)
    expect(copy).not.toContain('profiles_radius_miles_chk')
  })

  it('passes the app’s OWN validator messages through UNCHANGED', () => {
    // These are the exact strings db.ts throws (new Error(zipError) /
    // new Error(radiusError)); each one must survive byte for byte.
    const ownErrors = [
      'Add your home zip.',
      'Use a 5-digit zip code.',
      'We don’t cover that zip yet — try one we serve.',
      `Pick a radius between ${RADIUS_MIN_MILES} and ${RADIUS_MAX_MILES} miles.`,
    ]
    for (const ownError of ownErrors) {
      expect(radiusSaveErrorMessage(new Error(ownError))).toBe(ownError)
    }
    // And the same value the validator actually produces, end to end — so this
    // test fails if either the validator's wording OR the mapper drifts.
    const zipMessage = validateHomeZip('', new Set(['98107']))
    expect(zipMessage).not.toBeNull()
    expect(radiusSaveErrorMessage(new Error(zipMessage as string))).toBe(zipMessage)
    const radiusMessage = validateRadiusMiles(0)
    expect(radiusMessage).not.toBeNull()
    expect(radiusSaveErrorMessage(new Error(radiusMessage as string))).toBe(radiusMessage)
  })

  it('falls back to copy the user can act on when there is no message at all', () => {
    // The fallback exists for a throwable the mapper cannot read a sentence out
    // of — NOT for a real (if technical) Error message, which still beats a
    // generic line by naming something the user can retry or report.
    expect(radiusSaveErrorMessage(null)).toBe(RADIUS_SAVE_FAILED_COPY)
    expect(radiusSaveErrorMessage(undefined)).toBe(RADIUS_SAVE_FAILED_COPY)
    expect(radiusSaveErrorMessage(42)).toBe(RADIUS_SAVE_FAILED_COPY)
    expect(radiusSaveErrorMessage({})).toBe(RADIUS_SAVE_FAILED_COPY)
    // A non-Error object carrying a message but no CHECK code: unrecognised DB
    // failure, so it gets the generic copy rather than leaking `details`.
    expect(
      radiusSaveErrorMessage({ code: '42501', message: 'permission denied for table profiles' }),
    ).toBe(RADIUS_SAVE_FAILED_COPY)
    // An empty message is not a passthrough — it would render a blank red line.
    expect(radiusSaveErrorMessage(new Error('   '))).toBe(RADIUS_SAVE_FAILED_COPY)
    expect(RADIUS_SAVE_FAILED_COPY.trim()).not.toBe('')
  })

  it('passes a non-CHECK Error message through, so a network failure stays actionable', () => {
    // Deliberate: "Failed to fetch" tells the user to check their connection,
    // which the generic line does not. Only the CHECK case is rewritten.
    expect(radiusSaveErrorMessage(new Error('Failed to fetch'))).toBe('Failed to fetch')
  })

  it('beats the passthrough when supabase-js hands the rejection back as an Error', () => {
    // The trap the FIRST version of this mapper fell into: supabase-js
    // normalises the PostgREST body into an Error, so a passthrough branch
    // keyed on `instanceof Error` runs first and re-renders the SQL. The
    // CHECK branch must win for a DB rejection while an app-authored Error
    // (no `23514`, no constraint prose) still passes through untouched.
    const asError = Object.assign(
      new Error(
        'new row for relation "profiles" violates check constraint "profiles_radius_miles_chk"',
      ),
      { code: '23514' },
    )
    expect(radiusSaveErrorMessage(asError)).toBe(RADIUS_SAVE_REJECTED_COPY)
    expect(radiusSaveErrorMessage(asError)).not.toContain('profiles_radius_miles_chk')
  })
})

/**
 * Minimal mock of the client surface the injected-client queries use
 * (queryUpcomingFeedWithClient, queryMyPlaydatesWithClient):
 * from('playdates') returns a recording query builder — every filter call
 * (.in, .eq, .neq, .gte, .order, .is, .not) is recorded, in order, so tests can
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
    neq: (col: string, value: unknown) => {
      filters.push(`neq(${col}, ${String(value)})`)
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

  it('excludes host-ended posts at the DB level (V12 t03: the feed never fetches them)', async () => {
    // The read half of the ticket: an 'ended' post is fetched-and-kept in the
    // profile lists (Past, "Ended" label) but must not reach the feed query at
    // all. The pure half of the same rule is in the isStillAhead suite.
    const { client, filters } = makeFeedMockClient()
    await queryUpcomingFeedWithClient(client, CUTOFF, [])
    expect(filters).toContain('neq(status, ended)')
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

  it('accepts any positive duration on the 30-minute grid up to 24h, and still refuses off-grid lengths', () => {
    // The validator uses isPostableDuration (v33-7a): a window's length is free
    // on the form's own step grid — the founder: "I don't want it to be telling
    // people it has to be an hour." 30 minutes is reachable from the End
    // stepper but used to be refused ("Pick a duration.").
    expect(validatePlaydateForm({ ...valid, durationMinutes: 30 }).durationMinutes).toBeUndefined()
    expect(validatePlaydateForm({ ...valid, durationMinutes: 150 }).durationMinutes).toBeUndefined()
    expect(validatePlaydateForm({ ...valid, durationMinutes: 1440 }).durationMinutes).toBeUndefined()
    expect(validatePlaydateForm({ ...valid, durationMinutes: 0 }).durationMinutes).toBeDefined()
    expect(validatePlaydateForm({ ...valid, durationMinutes: 45 }).durationMinutes).toBeDefined()
    for (const m of PLAYDATE_DURATIONS_MINUTES) {
      expect(validatePlaydateForm({ ...valid, durationMinutes: m }).durationMinutes).toBeUndefined()
    }
  })

  it('isPostableDuration accepts exactly the positive 30-minute grid up to 24h', () => {
    for (const m of [30, 60, 90, 120, 150, 180, 1440]) expect(isPostableDuration(m)).toBe(true)
    for (const m of [0, 20, 45, 1470, 2880, -30, 30.5, Number.NaN]) {
      expect(isPostableDuration(m)).toBe(false)
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

describe('toDuplicatePrefill (V2 slice 1, re-aimed by V12 ticket 04)', () => {
  it('carries the parent\'s words AND the plan (slot, duration, kids)', () => {
    expect(
      toDuplicatePrefill(
        {
          title: 'Playground time',
          place: 'Green Lake',
          neighborhood_id: 'n1',
          age_hint: '2-5',
          details: 'Bring water',
          starts_at: '2026-09-04T15:00:00.000Z',
          ends_at: '2026-09-04T16:30:00.000Z', // 90-minute span
        },
        ['kid-1', 'kid-2'],
      ),
    ).toEqual({
      title: 'Playground time',
      place: 'Green Lake',
      neighborhoodId: 'n1',
      ageHint: '2-5',
      details: 'Bring water',
      startsAt: '2026-09-04T15:00:00.000Z',
      durationMinutes: 90, // snapped to the form\'s own options
      kidIds: ['kid-1', 'kid-2'],
    })
  })

  it('maps null age_hint / details / neighborhood to empty strings, and no kids to []', () => {
    expect(
      toDuplicatePrefill(
        {
          title: 'T',
          place: 'P',
          neighborhood_id: null,
          age_hint: null,
          details: null,
          starts_at: '2026-09-04T15:00:00.000Z',
          ends_at: '2026-09-04T16:00:00.000Z', // 60-minute span
        },
        [],
      ),
    ).toEqual({
      title: 'T',
      place: 'P',
      neighborhoodId: '',
      ageHint: '',
      details: '',
      startsAt: '2026-09-04T15:00:00.000Z',
      durationMinutes: 60,
      kidIds: [],
    })
  })

  it('a stored 2.5-hour window (150 minutes) reads back as 150 through toDuplicatePrefill', () => {
    // v33-7a: the parse/snap gate is the form's own step grid, not chip
    // membership — a 2.5-hour span must carry, not degrade to 0.
    expect(
      toDuplicatePrefill(
        {
          title: 'T',
          place: 'P',
          neighborhood_id: null,
          age_hint: null,
          details: null,
          starts_at: '2026-09-04T15:00:00.000Z',
          ends_at: '2026-09-04T17:30:00.000Z', // 150-minute span
        },
        [],
      ),
    ).toMatchObject({ durationMinutes: 150 })
  })

  it('a legacy off-grid span (45 minutes) still degrades to 0 (the parent picks the duration)', () => {
    expect(
      toDuplicatePrefill(
        {
          title: 'T',
          place: 'P',
          neighborhood_id: null,
          age_hint: null,
          details: null,
          starts_at: '2026-09-04T15:00:00.000Z',
          ends_at: '2026-09-04T15:45:00.000Z', // 45-minute span — not a chip
        },
        [],
      ),
    ).toMatchObject({ durationMinutes: 0 })
  })
})

describe('playdateKidsKidIds (V12 ticket 04: the playdate_kids embed → kid ids)', () => {
  it('extracts kid_id from the embed rows', () => {
    expect(playdateKidsKidIds([{ kid_id: 'kid-1' }, { kid_id: 'kid-2' }])).toEqual([
      'kid-1',
      'kid-2',
    ])
  })

  it('is [] for an empty embed and for a select that did not ask for it', () => {
    expect(playdateKidsKidIds([])).toEqual([])
    expect(playdateKidsKidIds(undefined)).toEqual([])
    expect(playdateKidsKidIds(null)).toEqual([])
  })

  it('drops rows without a non-empty string kid_id (defensive)', () => {
    expect(
      playdateKidsKidIds([{ kid_id: 'kid-1' }, { kid_id: null }, null, 42, { kid_id: '' }]),
    ).toEqual(['kid-1'])
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

  it('selects status (V12 t03: the profile Past list renders the "Ended" label from it)', async () => {
    // The read side of the ticket: ended posts stay in this host's own list
    // (Past, "Ended" label) — so the select must carry the column down.
    const { client, filters } = makeFeedMockClient()
    await queryMyPlaydatesWithClient(client, 'me')
    const select = filters.find((f) => f.startsWith('select(')) ?? ''
    expect(select).toContain('details, status')
  })

  it('selects starts_at/ends_at + the playdate_kids embed (V12 t04: the duplicate prefill carries the plan and the linked kids)', async () => {
    const { client, filters } = makeFeedMockClient()
    await queryMyPlaydatesWithClient(client, 'me')
    const select = filters.find((f) => f.startsWith('select(')) ?? ''
    expect(select).toContain('starts_at, ends_at')
    expect(select).toContain('playdate_kids(kid_id)')
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

describe('smallHoursStartNote (V29 v29-5 — the note, never a refusal)', () => {
  it('says so throughout the small hours, on both sides of the boundary', () => {
    expect(smallHoursStartNote(0)).toContain('middle of the night')
    expect(smallHoursStartNote(2 * 60)).toContain('middle of the night')
    expect(smallHoursStartNote(5 * 60 + 30)).toContain('middle of the night')
    expect(smallHoursStartNote(SMALL_HOURS_END_MINUTES - 1)).toContain('middle of the night')
  })

  it('says nothing from 06:00 on — the ordinary playground morning is never lectured', () => {
    expect(smallHoursStartNote(SMALL_HOURS_END_MINUTES)).toBeNull()
    expect(smallHoursStartNote(7 * 60)).toBeNull()
    expect(smallHoursStartNote(15 * 60)).toBeNull()
    expect(smallHoursStartNote(23 * 60 + 30)).toBeNull()
  })

  it('is total — a value the stepper cannot produce gets no note at all', () => {
    expect(smallHoursStartNote(Number.NaN)).toBeNull()
    expect(smallHoursStartNote(-30)).toBeNull()
    expect(smallHoursStartNote(24 * 60)).toBeNull()
  })

  it('never claims the post is blocked — the sentence says the opposite', () => {
    expect(smallHoursStartNote(3 * 60)).toContain('still post it')
  })
})

describe('goingPingsByPost (V29 v29-2 — the card may only claim what was read)', () => {
  const rows = [
    { playdateId: 'a', displayName: 'first' },
    { playdateId: 'b', displayName: 'only-b' },
    { playdateId: 'a', displayName: 'second' },
  ]

  it('groups by post and preserves the read order inside each group', () => {
    const grouped = goingPingsByPost(rows)
    expect(Object.keys(grouped).sort()).toEqual(['a', 'b'])
    // The query orders by created_at ascending; regrouping must not reshuffle,
    // because that order IS the order the card's circles render in.
    expect(grouped.a.map((r) => r.displayName)).toEqual(['first', 'second'])
    expect(grouped.b.map((r) => r.displayName)).toEqual(['only-b'])
  })

  it('gives a post nobody pinged NO key at all — the caller supplies the empty group', () => {
    const grouped = goingPingsByPost(rows)
    expect(grouped.c).toBeUndefined()
  })

  it('reads an empty read as an empty record — what that MEANS is the caller\'s decision, not this function\'s', () => {
    // The card's rule lives in its `goingPingsLoaded` prop: {} from a settled
    // read means "nobody is going", while a caller that failed must keep null
    // and get silence. This function cannot tell the two apart, and does not
    // pretend to.
    expect(goingPingsByPost([])).toEqual({})
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
      expect(buildGoingLine(2, pingers(2), GOING_CIRCLE_LIMIT, 0)!.label).toBe('2 parents')
      expect(buildGoingLine(2, pingers(2), GOING_CIRCLE_LIMIT)!.label).toBe('2 parents')
    })

    it('reads "N parents · M kids" when kids are coming', () => {
      expect(buildGoingLine(2, pingers(2), GOING_CIRCLE_LIMIT, 3)!.label).toBe('2 parents · 3 kids')
    })

    it('says "1 kid", not "1 kids"', () => {
      expect(buildGoingLine(1, pingers(1), GOING_CIRCLE_LIMIT, 1)!.label).toBe('1 parent · 1 kid')
    })

    it('ignores a nonsense negative count rather than printing it', () => {
      expect(buildGoingLine(1, pingers(1), GOING_CIRCLE_LIMIT, -2)!.label).toBe('1 parent')
    })

    it('leaves the circles and overflow to the parents alone', () => {
      const line = buildGoingLine(5, pingers(5), GOING_CIRCLE_LIMIT, 4)!
      expect(line.circles).toHaveLength(3)
      expect(line.overflow).toBe(2)
      expect(line.label).toBe('5 parents · 4 kids')
    })
  })

  // v33-5: both counts name their people as words (annotation muyed1t6 — "how
  // many kids … how many parents"), singular at 1, and a zero-kid card says
  // parents only (there is no "0 kids" state).
  describe('the named counts (v33-5)', () => {
    it('names parents and kids as words with the attendee band', () => {
      expect(goingCountsLabel(3, 2, { min: 2, max: 5 })).toBe('3 parents · 2 kids (ages 2–5)')
    })

    it('is singular at one parent and one kid', () => {
      expect(goingCountsLabel(1, 1, { min: 4, max: 4 })).toBe('1 parent · 1 kid (age 4)')
    })

    it('pluralises correctly at two', () => {
      expect(goingCountsLabel(2, 2)).toBe('2 parents · 2 kids')
    })

    it('keeps a truthful label when the band read failed (no fabricated age)', () => {
      expect(goingCountsLabel(3, 2)).toBe('3 parents · 2 kids')
      expect(goingCountsLabel(3, 2, null)).toBe('3 parents · 2 kids')
    })

    it('never says "0 kids" — a zero-kid card reads parents only', () => {
      expect(goingCountsLabel(2, 0, { min: 2, max: 5 })).toBe('2 parents')
      expect(goingCountsLabel(2, 0)).toBe('2 parents')
    })
  })

  // V27 slice 4 (migration 0056): the aggregate age BAND of the kids coming.
  // AGGREGATE ONLY — the band is two integers (min/max), never a per-kid age
  // or identity.
  describe('the kids age band', () => {
    it('states the range as "ages min–max" (the en dash the app’s ranges use)', () => {
      expect(goingCountsLabel(3, 2, { min: 2, max: 5 })).toBe('3 parents · 2 kids (ages 2–5)')
    })

    it('collapses a one-year band to "age N"', () => {
      expect(goingCountsLabel(1, 1, { min: 4, max: 4 })).toBe('1 parent · 1 kid (age 4)')
    })

    it('omits the kids segment (and the band) when nobody is bringing kids', () => {
      expect(goingCountsLabel(2, 0, { min: 2, max: 5 })).toBe('2 parents')
    })

    it('is threaded through buildGoingLine as the fifth argument', () => {
      const line = buildGoingLine(3, pingers(3), GOING_CIRCLE_LIMIT, 2, { min: 2, max: 5 })!
      expect(line.label).toBe('3 parents · 2 kids (ages 2–5)')
    })
  })

  it('labels exactly 3 pingers with no overflow', () => {
    const line = buildGoingLine(3, pingers(3), GOING_CIRCLE_LIMIT)
    expect(line).not.toBeNull()
    expect(line!.label).toBe('3 parents')
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
    expect(line.label).toBe('5 parents')
  })

  it('uses the display-name initial (upper-cased) when there is no avatar', () => {
    const line = buildGoingLine(1, [{ avatarUrl: null, displayName: 'sam' }], GOING_CIRCLE_LIMIT)!
    expect(line.circles).toEqual([{ avatarUrl: null, initial: 'S' }])
  })

  it('falls back to "?" for an empty display name', () => {
    const line = buildGoingLine(1, [{ avatarUrl: null, displayName: '' }], GOING_CIRCLE_LIMIT)!
    expect(line.circles).toEqual([{ avatarUrl: null, initial: '?' }])
  })

  it('labels a single pinger "1 parent"', () => {
    expect(buildGoingLine(1, pingers(1), GOING_CIRCLE_LIMIT)!.label).toBe('1 parent')
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

describe('cardAgeLineDecision (v33-5: one age line per card)', () => {
  // The defect this seam exists to catch: TWO age ranges on one card — the
  // host's `card-age-range` AND the attendee band inside the going line. The
  // decision is pure, so the e2e absence assertion (exactly one of the two
  // lines in the rendered DOM) is only as strong as this rule.
  it('never renders two age ranges on one card (going-band suppresses card-age-range)', () => {
    // Someone is going and the attendee band exists: the going line carries
    // the ages, so the host range must be suppressed — both at once would be
    // the duplicate-line failure the design reviews reject.
    expect(
      cardAgeLineDecision({
        goingLineRenders: true,
        attendeeBandPresent: true,
        hostRangePresent: true,
      }),
    ).toBe('going-band')
  })

  it('lets card-age-range stand alone when nobody is going', () => {
    // A fresh post (or a failed ping read): no going line, no band — the host's
    // intended ages are the only age signal the card has.
    expect(
      cardAgeLineDecision({
        goingLineRenders: false,
        attendeeBandPresent: false,
        hostRangePresent: true,
      }),
    ).toBe('host-range')
  })

  it('keeps card-age-range when the going line renders but its band read failed', () => {
    // buildGoingLine still shows the counts ("2 parents · 1 kid") without a
    // band; the ages then ride the host range, not a fabricated attendee band.
    expect(
      cardAgeLineDecision({
        goingLineRenders: true,
        attendeeBandPresent: false,
        hostRangePresent: true,
      }),
    ).toBe('host-range')
  })

  it('renders nothing when neither source has an age to say', () => {
    expect(
      cardAgeLineDecision({
        goingLineRenders: false,
        attendeeBandPresent: false,
        hostRangePresent: false,
      }),
    ).toBeNull()
  })
})

describe('hostCommonGroundLine (V27 slice 5: the follow edge only)', () => {
  const HOST = 'host-1'
  const VIEWER = 'viewer-1'
  const FOLLOWING = new Set([HOST])

  it('is "You follow this host" when the viewer follows the host', () => {
    expect(hostCommonGroundLine(HOST, VIEWER, FOLLOWING)).toBe('You follow this host')
  })

  it('is null when the host is not in the viewer\'s follows', () => {
    expect(hostCommonGroundLine(HOST, VIEWER, new Set())).toBeNull()
    expect(hostCommonGroundLine(HOST, VIEWER, new Set(['someone-else']))).toBeNull()
  })

  it('is null when the viewer is signed out (viewerId null)', () => {
    expect(hostCommonGroundLine(HOST, null, FOLLOWING)).toBeNull()
  })

  it('never says it on the parent\'s own post (hostId === viewerId)', () => {
    // A parent's own post with their own id somehow in their follows: the guard
    // `hostId !== viewerId` wins, so the line is absent.
    expect(hostCommonGroundLine(HOST, HOST, new Set([HOST]))).toBeNull()
  })

  it('is null for an empty followees set', () => {
    expect(hostCommonGroundLine(HOST, VIEWER, new Set())).toBeNull()
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

describe('kidsComingLine (V3 slice 6, ticket 09; AGES-FIRST per V9 ticket 05)', () => {
  it('returns null for nothing to say (0 kids and no stated range)', () => {
    expect(kidsComingLine([])).toBeNull()
  })

  it('is AGES-FIRST: the range, then the names ("Ages 4–6 · Bernie, Lily")', () => {
    // THE RULE CHANGE (V9 ticket 05, quoted from the ticket: the line "is
    // demoted from names-first to ages-first ('Ages 3–6 · Bernie, Lily' —
    // names last)"). The old expectation here was "Bernie · 6, Lily · 4":
    // per-kid ages glued to each name, which buried the crowd's age — the one
    // fact the parent is deciding on — behind a list of names.
    expect(
      kidsComingLine([
        { name: 'Bernie', age: 6 },
        { name: 'Lily', age: 4 },
      ]),
    ).toBe('Ages 4–6 · Bernie, Lily')
  })

  it('renders one kid as "Age 6 · Bernie" (ages first, one age → "Age N")', () => {
    expect(kidsComingLine([{ name: 'Bernie', age: 6 }])).toBe('Age 6 · Bernie')
  })

  it('T3: an AGE-ONLY kid still renders, through the range (no name to show)', () => {
    // The trap this pins: the line used to filter `kid.name.trim() !== ''`, so
    // once a first name became optional a nameless kid was INVISIBLE on the one
    // line that lists them. Now the age carries them.
    expect(kidsComingLine([{ name: '', age: 6 }])).toBe('Age 6')
    expect(
      kidsComingLine([
        { name: 'Bernie', age: 6 },
        { name: '   ', age: 4 },
      ]),
    ).toBe('Ages 4–6 · Bernie')
  })

  it('takes the AUTHORITATIVE range when the caller has one (stated wins over derived)', () => {
    // The detail page hands in the precedence seam's output, so a host who
    // stated "ages 2–5" out loud reads that here instead of the derived 4–6 —
    // and this line can never disagree with the feed card, which runs the same
    // rule.
    expect(
      kidsComingLine(
        [
          { name: 'Bernie', age: 6 },
          { name: 'Lily', age: 4 },
        ],
        'ages 2–5',
      ),
    ).toBe('Ages 2–5 · Bernie, Lily')
  })

  it('renders the stated range ALONE when the host listed no kids (the chips case)', () => {
    expect(kidsComingLine([], 'ages 2–5')).toBe('Ages 2–5')
  })

  it('treats an EMPTY range string as nothing to say (no leading " · ")', () => {
    // Review cycle 1, F7: `?? ` let an empty string through, so these two
    // returned '' and ' · Bernie' — the dangling-separator class this whole
    // ticket is about. Unreachable from the app today (every producer returns
    // null or a real range); guarded so it stays unreachable.
    expect(kidsComingLine([], '')).toBeNull()
    expect(kidsComingLine([], '   ')).toBeNull()
    expect(kidsComingLine([{ name: 'Bernie', age: null }], '')).toBe('Bernie')
    expect(kidsComingLine([{ name: '', age: 4 }], '')).toBe('Age 4')
  })

  it('omits a null age from the range (never "null" in the line)', () => {
    expect(
      kidsComingLine([
        { name: 'Bernie', age: null },
        { name: 'Lily', age: 4 },
      ]),
    ).toBe('Age 4 · Bernie, Lily')
    // No age anywhere and names present → the names alone, no dangling range.
    expect(kidsComingLine([{ name: 'Bernie', age: null }])).toBe('Bernie')
  })
})

describe('the age-range seams (V9 ticket 05: ages first on a card)', () => {
  describe('ageBounds', () => {
    it('is null when there are no ages at all (never a guess)', () => {
      expect(ageBounds([])).toBeNull()
      expect(ageBounds([null, undefined])).toBeNull()
    })

    it('takes the min and max, ignoring unknown ages', () => {
      expect(ageBounds([6, null, 3, undefined, 4])).toEqual({ min: 3, max: 6 })
    })
  })

  describe('ageRangeLine', () => {
    it('empty → null (the card shows nothing)', () => {
      expect(ageRangeLine([])).toBeNull()
      expect(ageRangeLine([null])).toBeNull()
    })

    it('one kid → "age 4"', () => {
      expect(ageRangeLine([4])).toBe('age 4')
      // Two kids the same age are that one age, not a range.
      expect(ageRangeLine([4, 4])).toBe('age 4')
    })

    it('a spread → "ages 2–9" (EN DASH, the ticket\'s spelling)', () => {
      expect(ageRangeLine([2, 9])).toBe('ages 2–9')
      expect(ageRangeLine([6, 3, 4])).toBe('ages 3–6')
    })

    it('the wide-spread cap → "all ages" (the ticket names a cap; this pins where it starts)', () => {
      // The ticket names this case without giving it a number, so the number
      // lives in AGE_RANGE_ALL_AGES_WIDTH and the boundary is pinned here on
      // BOTH sides: one year under is still a range, at the cap it is not.
      expect(ageRangeLine([KID_AGE_MIN, KID_AGE_MIN + AGE_RANGE_ALL_AGES_WIDTH - 1])).toBe(
        `ages ${KID_AGE_MIN}–${KID_AGE_MIN + AGE_RANGE_ALL_AGES_WIDTH - 1}`,
      )
      expect(ageRangeLine([KID_AGE_MIN, KID_AGE_MIN + AGE_RANGE_ALL_AGES_WIDTH])).toBe('all ages')
      expect(ageRangeLine([KID_AGE_MIN, KID_AGE_MAX])).toBe('all ages')
    })

    it('the ticket\'s own examples hold: 2 and 9 is a RANGE, not "all ages"', () => {
      expect(ageRangeLine([2, 9])).toBe('ages 2–9')
      expect(ageBoundsLine({ min: 2, max: 9 })).toBe('ages 2–9')
    })
  })

  describe('statedAgeRangeLine (the /new chips, playdates.age_min / age_max)', () => {
    it('nothing stated → null (and pre-0037 the columns are absent, not null)', () => {
      expect(statedAgeRangeLine(null, null)).toBeNull()
      expect(statedAgeRangeLine(undefined, undefined)).toBeNull()
    })

    it('a chip pair reads exactly like a derived range', () => {
      expect(statedAgeRangeLine(2, 5)).toBe('ages 2–5')
      expect(statedAgeRangeLine(0, 2)).toBe('ages 0–2')
      expect(statedAgeRangeLine(8, 12)).toBe('ages 8–12')
    })

    it('reads a ONE-SIDED pair the way the app\'s other one-sided age copy does', () => {
      // REVIEW CYCLE 1, F6 — THE RULE CHANGE, quoted: this assertion used to be
      // `expect(statedAgeRangeLine(5, null)).toBe('age 5')` (and `(null, 5)`),
      // i.e. a one-sided pair collapsed into a single age. 0037 legalizes
      // one-sided pairs on purpose, and `places.placeAgeFitLabel` already read
      // the identical `{age_min, age_max}` shape as "5 and up" / "3 and under",
      // so one row's band had two spellings in one app. They now agree.
      expect(statedAgeRangeLine(5, null)).toBe('ages 5 and up')
      expect(statedAgeRangeLine(null, 5)).toBe('ages 5 and under')
      expect(statedAgeRangeLine(null, 3)).toBe('ages 3 and under')
    })

    it('agrees with the place page\'s line over the same shape (one rule, two prefixes)', () => {
      // The structural pin: placeAgeFitLabel IS `'Best for ' + this seam`, so
      // the two surfaces cannot drift into different words for one band.
      for (const band of [
        { age_min: 2, age_max: 5 },
        { age_min: 5, age_max: null },
        { age_min: null, age_max: 3 },
        { age_min: null, age_max: null },
      ]) {
        const range = statedAgeRangeLine(band.age_min, band.age_max)
        expect(placeAgeFitLabel(band)).toBe(range === null ? null : `Best for ${range}`)
      }
    })

    it('a same-age pair is "age N"', () => {
      expect(statedAgeRangeLine(4, 4)).toBe('age 4')
    })
  })

  describe('playdateAgeRangeLine — THE PRECEDENCE (the ticket\'s T5 pin)', () => {
    it('the EXPLICIT chips win over the derived range when both exist', () => {
      // "the explicit chips win (the parent said so out loud)".
      expect(
        playdateAgeRangeLine({ ageMin: 2, ageMax: 5, kidAges: [3, 6] }),
      ).toBe('ages 2–5')
    })

    it('the derived range answers when nothing was stated', () => {
      expect(playdateAgeRangeLine({ ageMin: null, ageMax: null, kidAges: [3, 6] })).toBe('ages 3–6')
      // Pre-0037 the columns are simply absent from the row.
      expect(playdateAgeRangeLine({ kidAges: [3, 6] })).toBe('ages 3–6')
      expect(playdateAgeRangeLine({ kidAges: [4] })).toBe('age 4')
    })

    it('nothing at all → null (no line, and therefore no empty line)', () => {
      expect(playdateAgeRangeLine({})).toBeNull()
      expect(playdateAgeRangeLine({ ageMin: null, ageMax: null, kidAges: [] })).toBeNull()
      expect(playdateAgeRangeLine({ kidAges: [null, undefined] })).toBeNull()
    })

    it('cardAgeRangeLabel applies the SAME rule to a feed row\'s own columns', () => {
      // The one composition every card surface uses (FeedPage, PlacePage,
      // UserPage), so a row plus its batched ages always yields one label.
      expect(cardAgeRangeLabel({ age_min: 2, age_max: 5 }, [3, 6])).toBe('ages 2–5')
      expect(cardAgeRangeLabel({ age_min: null, age_max: null }, [3, 6])).toBe('ages 3–6')
      // Pre-0037 the columns are ABSENT from the row, not null.
      expect(cardAgeRangeLabel({}, [3, 6])).toBe('ages 3–6')
      expect(cardAgeRangeLabel({}, [])).toBeNull()
    })

    it('the "All ages" band (the full kid domain) reads "all ages"', () => {
      // V16 t03 item 1: the chip LIST is gone, but the wide band it used to
      // store is still a legal stated pair — a post from the chip era carries
      // it, and the card must keep reading it back.
      expect(playdateAgeRangeLine({ ageMin: KID_AGE_MIN, ageMax: KID_AGE_MAX })).toBe('all ages')
      // …and it still beats a derived range, like every other stated pair.
      expect(
        playdateAgeRangeLine({ ageMin: KID_AGE_MIN, ageMax: KID_AGE_MAX, kidAges: [6] }),
      ).toBe('all ages')
    })
  })

  describe('ageBoundsFromSelectedKids (V16 t03 item 1: /new DERIVES what it used to ask)', () => {
    /**
     * The bounds as the `ageRangeFields(min, max)` argument pair — the exact
     * shape the page's submit passes, so the tests below exercise the real
     * call rather than a paraphrase of it. Null bounds spread to
     * `(undefined, undefined)`, which is what `ageRangeFields` sees when no kid
     * with a known age was selected.
     */
    const boundsPair = (
      bounds: { min: number; max: number } | null,
    ): [number | undefined, number | undefined] => [bounds?.min, bounds?.max]

    const kids = [
      { id: 'a', age: 3 },
      { id: 'b', age: 6 },
      { id: 'c', age: 11 },
    ]

    it('no kids selected → null (and the insert then names no column)', () => {
      expect(ageBoundsFromSelectedKids(kids, [])).toBeNull()
      // A selection that names no kid this host has (a stale id) is the same
      // nothing: never a guess.
      expect(ageBoundsFromSelectedKids(kids, ['zzz'])).toBeNull()
      expect(ageBoundsFromSelectedKids([], ['a'])).toBeNull()
    })

    it('one kid → a single-age bound, both ends equal', () => {
      expect(ageBoundsFromSelectedKids(kids, ['b'])).toEqual({ min: 6, max: 6 })
    })

    it('several kids → the min and max of the SELECTED ones only, in any order', () => {
      expect(ageBoundsFromSelectedKids(kids, ['a', 'c'])).toEqual({ min: 3, max: 11 })
      expect(ageBoundsFromSelectedKids(kids, ['c', 'a'])).toEqual({ min: 3, max: 11 })
      // The unselected kid (6) is not in the range's reach, but it is inside it.
      expect(ageBoundsFromSelectedKids(kids, ['a', 'b', 'c'])).toEqual({ min: 3, max: 11 })
    })

    it('kids with unknown ages are ignored — the name/age-may-be-absent discipline', () => {
      const partial = [
        { id: 'a', age: null },
        { id: 'b', age: undefined },
        { id: 'c', age: 9 },
      ]
      expect(ageBoundsFromSelectedKids(partial, ['a', 'b'])).toBeNull()
      expect(ageBoundsFromSelectedKids(partial, ['a', 'b', 'c'])).toEqual({ min: 9, max: 9 })
      // A kid row with no `age` key at all (the optional shape) reads the same.
      expect(ageBoundsFromSelectedKids([{ id: 'a' }], ['a'])).toBeNull()
    })

    it('the bounds are the SAME ones the card\'s derived line words (one derivation)', () => {
      // The pin that matters: what /new STORES and what the card derives from
      // the same kids can never disagree, because both come from `ageBounds`.
      for (const selected of [[], ['a'], ['b'], ['a', 'c'], ['a', 'b', 'c']]) {
        const bounds = ageBoundsFromSelectedKids(kids, selected)
        const selectedAges = kids.filter((kid) => selected.includes(kid.id)).map((kid) => kid.age)
        expect(bounds).toEqual(ageBounds(selectedAges))
        expect(ageBoundsLine(bounds)).toBe(ageRangeLine(selectedAges))
      }
    })

    it('a stored pair round-trips through ageRangeFields, and null writes NOTHING', () => {
      // The no-kids case is the byte-identical-to-pre-0037 guarantee.
      expect(ageRangeFields(...boundsPair(ageBoundsFromSelectedKids(kids, [])))).toEqual({})
      expect(ageRangeFields(...boundsPair(ageBoundsFromSelectedKids(kids, ['a', 'c'])))).toEqual({
        age_min: 3,
        age_max: 11,
      })
      // …and the STATED pair then wins on the card, which is the rule the
      // chip-era posts still rely on.
      expect(
        playdateAgeRangeLine({
          ...ageRangeFields(...boundsPair(ageBoundsFromSelectedKids(kids, ['a', 'c']))),
          kidAges: [3, 11],
        }),
      ).toBe('ages 3–11')
    })
  })

  describe('ageRangeFields (the insert keys — present only when a range was stated)', () => {
    it('nothing stated → {} (the payload never names the columns)', () => {
      expect(ageRangeFields(undefined, undefined)).toEqual({})
      expect(ageRangeFields(null, null)).toEqual({})
      // A half-pair is not a range: both or neither.
      expect(ageRangeFields(2, undefined)).toEqual({})
      expect(ageRangeFields(undefined, 5)).toEqual({})
      expect(ageRangeFields(2, null)).toEqual({})
    })

    it('a stated pair → both columns', () => {
      expect(ageRangeFields(2, 5)).toEqual({ age_min: 2, age_max: 5 })
      expect(ageRangeFields(KID_AGE_MIN, KID_AGE_MAX)).toEqual({ age_min: 0, age_max: 17 })
    })
  })

  describe('kidLabel (a kid whose name may be absent — V9 ticket 05, V15 T05 A13)', () => {
    it('reads "Name · Age N" when both are known', () => {
      expect(kidLabel('Bernie', 6)).toBe('Bernie · Age 6')
    })

    it('reads "Age 6" for a nameless kid — never " · 6", never "null"', () => {
      expect(kidLabel('', 6)).toBe('Age 6')
      expect(kidLabel('   ', 6)).toBe('Age 6')
      expect(kidLabel(null, 6)).toBe('Age 6')
      expect(kidLabel(undefined, 6)).toBe('Age 6')
    })

    it('reads the name alone when there is no age', () => {
      expect(kidLabel('Bernie', null)).toBe('Bernie')
      expect(kidLabel('Bernie', undefined)).toBe('Bernie')
    })

    it('is "" when there is nothing to say (the caller decides the fallback)', () => {
      expect(kidLabel('', null)).toBe('')
      expect(kidLabel(null, undefined)).toBe('')
    })
  })

  describe('kidHeading (V25 t09 — the profile row, split for typography)', () => {
    // The read surface's kid row leads with the NAME and marks the AGE
    // secondarily. These tests pin the SPLIT, and that the words themselves are
    // still `kidLabel`'s: the privacy pin (first name + age only) is unchanged,
    // only the arrangement moved.

    it('splits a named kid with an age into a lead and an age mark', () => {
      expect(kidHeading({ first_name: 'Bernie', age: 6 })).toEqual({
        name: 'Bernie',
        age: 'Age 6',
        fallback: 'Bernie · Age 6',
      })
    })

    it('trims the name so the renderer never has to', () => {
      expect(kidHeading({ first_name: '  Bernie  ', age: 6 }).name).toBe('Bernie')
    })

    it('leaves the age mark null for a kid with no age (name alone leads)', () => {
      expect(kidHeading({ first_name: 'Bernie', age: null })).toEqual({
        name: 'Bernie',
        age: null,
        fallback: 'Bernie',
      })
    })

    it('gives a nameless kid NO lead and carries "Age 6" in the fallback', () => {
      // There is nothing for a secondary mark to sit beside, so the row renders
      // the label as one piece — never " · Age 6", never the word "null".
      expect(kidHeading({ first_name: '', age: 6 })).toEqual({
        name: '',
        age: null,
        fallback: 'Age 6',
      })
      expect(kidHeading({ first_name: null, age: 6 }).fallback).toBe('Age 6')
    })

    it('is empty all round when a kid has neither name nor age', () => {
      expect(kidHeading({ first_name: '', age: null })).toEqual({
        name: '',
        age: null,
        fallback: '',
      })
    })

    it('refuses a non-finite age rather than printing NaN', () => {
      expect(kidHeading({ first_name: 'Bernie', age: Number.NaN }).age).toBeNull()
      expect(kidHeading({ first_name: 'Bernie', age: Number.NaN }).fallback).toBe('Bernie')
    })

    it('ROUND-TRIPS: the row re-joins to exactly kidLabel’s string', () => {
      // THE INVARIANT THE READ SURFACE DEPENDS ON. `ProfileView` renders the
      // name and the age as separate, separately-styled elements (`{' · '}`
      // between them), and two e2e assertions read that row as ONE text node
      // (`getByText(kidLabel(name, age), { exact: true })` in
      // e2e/profiles-v2 and e2e/polish). If a styling change ever makes the
      // pieces stop re-joining to `kidLabel`'s exact words — a new separator, a
      // dropped space — those live assertions fail for a reason nothing in the
      // unit layer names. This is that name.
      const cases: Array<{ first_name: string | null; age: number | null }> = [
        { first_name: 'Bernie', age: 6 },
        { first_name: '  Bernie  ', age: 6 },
        { first_name: 'Bernie', age: null },
        { first_name: '', age: 6 },
        { first_name: null, age: 6 },
        { first_name: '', age: null },
        { first_name: null, age: null },
        { first_name: 'Bernie', age: Number.NaN },
      ]
      for (const kid of cases) {
        const heading = kidHeading(kid)
        const joined =
          heading.name !== '' && heading.age !== null
            ? `${heading.name} · ${heading.age}`
            : heading.name !== ''
              ? heading.name
              : heading.fallback
        expect(joined, JSON.stringify(kid)).toBe(kidLabel(kid.first_name, kid.age))
      }
    })
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

  // V16 t07 item 3: the floor dropped to 1, which breaks the "always plural by
  // construction" invariant this function's doc used to rely on. Before the
  // change every reachable radius was plural, so nothing caught it — the empty
  // state literally shipped "Nothing within 1 miles yet."
  it('says "1 mile", not "1 miles"', () => {
    expect(emptyRadiusCopy(1)).toBe('Nothing within 1 mile yet.')
  })

  it('never claims "today" (the list is not-ended-yet — the old copy\'s lie)', () => {
    for (const radius of RADIUS_MILES_OPTIONS) {
      expect(emptyRadiusCopy(radius).toLowerCase()).not.toContain('today')
    }
  })
})

describe('the empty state\'s door to the directory (V31 v31-1)', () => {
  /**
   * The two strings are pinned as LITERALS here on purpose, for the reason the
   * archive link's test gives: the e2e spec asserts the app's own rule through
   * these consts, so a rename would keep every browser assertion green while
   * changing the product's words. Changing the copy must break a test here.
   */
  it('pins the door\'s label', () => {
    expect(EMPTY_RADIUS_BROWSE_LABEL).toBe('See what’s around')
  })

  it('pins the headline', () => {
    expect(EMPTY_RADIUS_BROWSE_HEADLINE).toBe('Find something to do nearby')
  })

  /**
   * The headline sits directly above `emptyRadiusCopy`, which carries the only
   * honest count on the screen. A digit in the headline would be a second,
   * unbacked number — the class of claim the empty state exists to avoid.
   */
  it('puts no number in the headline', () => {
    expect(EMPTY_RADIUS_BROWSE_HEADLINE).not.toMatch(/\d/)
  })

  /**
   * No place CATEGORY either: `lib/feed.ts` is not in the taxonomy guard's
   * COPY_MODULES registry, so a category word here would be judged by nothing.
   * Pinned as a rule rather than trusted to the comment above the const.
   */
  it('names no place category', () => {
    const categoryWord = /\b(park|playground|library|libraries|pool|beach|splash|museum|trail)s?\b/i
    expect(EMPTY_RADIUS_BROWSE_HEADLINE).not.toMatch(categoryWord)
    expect(EMPTY_RADIUS_BROWSE_LABEL).not.toMatch(categoryWord)
  })

  it('does not promise content (the directory is radius-filtered too)', () => {
    const promises = /\b(has|have|there are|you.ll find|full)\b/i
    expect(EMPTY_RADIUS_BROWSE_HEADLINE).not.toMatch(promises)
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

  // V16 t04: the destination MOVED. The Past list used to live in /profile's
  // "Hosted drop-ins" card; that card was removed, so a constant pointing at
  // /profile became a dead end whose label promised a list the page no longer
  // rendered. The archive surface is now the viewer's own public page.
  it('points at the viewer\'s own public page, where their past drop-ins now live', () => {
    expect(pastDropInsHref('Jon Meisburg')).toBe('/u/Jon%20Meisburg')
  })

  it('falls back to /profile rather than producing a dead href for an empty handle', () => {
    expect(pastDropInsHref(null)).toBe('/profile')
    expect(pastDropInsHref(undefined)).toBe('/profile')
    expect(pastDropInsHref('   ')).toBe('/profile')
  })
})

describe('radiusEscapes (V8 ticket 02 + V11 ticket 01: the way out of an empty radius)', () => {
  it('offers both widen escapes at the 5-mile default (no "Back to 5" — you are already there)', () => {
    // V35-C moved the default back 1 → 5, so the "already at the default, no
    // narrow escape" case is now 5. If this ever returns a "Back to 5 miles"
    // candidate, the narrow-escape predicate has drifted to `>=`.
    expect(radiusEscapes(5)).toEqual([
      { radiusMiles: 20, label: 'Widen to 20 miles' },
      { radiusMiles: 35, label: 'See everything in Seattle' },
    ])
  })

  it('pins the radii to the ticket (5 = default, 20 = widen, 35 = the max, the DB ceiling)', () => {
    // V35-C moved the default back to 5; the widen and the ceiling did NOT.
    expect(DEFAULT_RADIUS_MILES).toBe(5)
    expect(WIDEN_RADIUS_MILES).toBe(20)
    expect(SEE_ALL_RADIUS_MILES).toBe(35)
    expect(SEE_ALL_RADIUS_MILES).toBe(RADIUS_MAX_MILES)
    expect(RADIUS_MILES_OPTIONS).toContain(DEFAULT_RADIUS_MILES)
    expect(RADIUS_MILES_OPTIONS).toContain(WIDEN_RADIUS_MILES)
    expect(RADIUS_MILES_OPTIONS).toContain(SEE_ALL_RADIUS_MILES)
  })

  it('treats 10 as a NARROW case: 10 offers "Back to 5 miles" (10 → 5, 20, 35)', () => {
    // The inversion v32-3 created is reversed by V35-C: 5 is the default again,
    // so 10 must offer "Back to 5 miles", and must NOT offer a no-op "Back to
    // 10 miles" for a radius it is not at.
    expect(radiusEscapes(10)).toEqual([
      { radiusMiles: 5, label: 'Back to 5 miles' },
      { radiusMiles: 20, label: 'Widen to 20 miles' },
      { radiusMiles: 35, label: 'See everything in Seattle' },
    ])
  })

  it('offers NO narrow escape BELOW the default: a 1-mile parent is already narrower (1 → 20, 35)', () => {
    // V35-C moved the default back to 5, so 1 is now BELOW it. The narrow
    // escape widens toward nothing here: `radiusEscapes` offers "Back to
    // <default>" only when `radius > DEFAULT`, because at or under the default
    // the parent is already narrower — a "Back to 5 miles" button would WIDEN,
    // which is the widen escape's job, not the narrow one's. So at 1 only the
    // two widen escapes render.
    expect(radiusEscapes(1)).toEqual([
      { radiusMiles: 20, label: 'Widen to 20 miles' },
      { radiusMiles: 35, label: 'See everything in Seattle' },
    ])
  })

  it('drops candidates that would not change the radius (20 → back-to-5 + see-all only)', () => {
    expect(radiusEscapes(20)).toEqual([
      { radiusMiles: 5, label: 'Back to 5 miles' },
      { radiusMiles: 35, label: 'See everything in Seattle' },
    ])
  })

  it('is empty at the 35-mile max (nothing to escape to — the ceiling is honest)', () => {
    expect(radiusEscapes(35)).toEqual([])
  })

  it('returns the escapes ascending (narrow-first), and the narrow escape is offered only between the default and the max', () => {
    for (const radius of RADIUS_MILES_OPTIONS) {
      const radii = radiusEscapes(radius).map((e) => e.radiusMiles)
      expect(radii).toEqual([...radii].sort((a, b) => a - b))
      for (const r of radii) {
        expect(r).toBeLessThanOrEqual(RADIUS_MAX_MILES)
      }
      // At 5 you are already at the default; at 35 the state is honestly
      // terminal (narrowing can never surface what 35 did not). The predicate
      // itself is unchanged by V35-C — only the value of the default it reads.
      expect(radii.includes(DEFAULT_RADIUS_MILES)).toBe(
        radius > DEFAULT_RADIUS_MILES && radius < SEE_ALL_RADIUS_MILES,
      )
    }
  })

  it('keeps the escapes present for a 2-mile radius (the far-zip e2e case)', () => {
    // 2 is BELOW the default (5), so there is no narrow escape — only the two
    // widen escapes. The case still matters: a far-zip parent at 2 miles must
    // never be left with an empty escape list.
    expect(radiusEscapes(2).map((e) => e.radiusMiles)).toEqual([20, 35])
  })
})

describe('radiusChoices (V16 t06 item 1: the radius control that stays on screen)', () => {
  it('offers the whole ladder, not just the radii below the saved one', () => {
    // The founder's ask is "widen OR narrow" from the feed. A picker that only
    // listed radii <= the saved one would make 35 unreachable from the default
    // — the exact dead end this slice removes.
    expect(radiusChoices(5).map((c) => c.radiusMiles)).toEqual([1, 2, 5, 10, 20, 35])
    expect(radiusChoices(20).map((c) => c.radiusMiles)).toEqual([1, 2, 5, 10, 20, 35])
  })

  it('labels the 1-mile option "1 mile", not "1 miles"', () => {
    // V16 t07 item 3: the label template is what the <option> in the feed and
    // the onboarding picker both render, so the grammar fix has to be here and
    // not only in the empty-state copy.
    const labels = new Map(radiusChoices(5).map((c) => [c.radiusMiles, c.label]))
    expect(labels.get(1)).toBe('Within 1 mile')
    expect(labels.get(2)).toBe('Within 2 miles')
    expect(labels.get(35)).toBe('See everything in Seattle (35 mi)')
  })

  it('is the pinned option list itself at every shipped radius', () => {
    for (const radius of RADIUS_MILES_OPTIONS) {
      expect(radiusChoices(radius).map((c) => c.radiusMiles)).toEqual([
        ...RADIUS_MILES_OPTIONS,
      ])
    }
  })

  it('always includes the saved radius itself (the control cannot misreport the filter)', () => {
    for (const radius of RADIUS_MILES_OPTIONS) {
      const chosen = radiusChoices(radius).map((c) => c.radiusMiles)
      expect(chosen).toContain(radius)
      expect(chosen).toEqual([...chosen].sort((a, b) => a - b))
    }
  })

  it('offers "See everything in Seattle" only at the 35-mile ceiling, and never past it', () => {
    expect(radiusChoices(35).at(-1)).toEqual({
      radiusMiles: 35,
      label: 'See everything in Seattle (35 mi)',
    })
    for (const radius of RADIUS_MILES_OPTIONS) {
      for (const choice of radiusChoices(radius)) {
        expect(choice.radiusMiles).toBeLessThanOrEqual(RADIUS_MAX_MILES)
        expect(choice.radiusMiles).toBeGreaterThan(0)
      }
    }
  })

  it('represents an off-menu saved radius rather than rounding it (the picker must not lie)', () => {
    // No such value ships today (validateRadiusMiles + the DB CHECK pin 2–35),
    // so this pins the guard, not a live state: a <select> whose value matches
    // no <option> renders the FIRST option while the list filters on something
    // else. 7 must appear as itself.
    expect(radiusChoices(7).map((c) => c.radiusMiles)).toEqual([1, 2, 5, 7, 10, 20, 35])
  })

  it('keeps the ladder intact when the viewer sits below the narrowest option', () => {
    // 1 mile IS an option now (V16 t07 item 3 / migration 0045), so this case is
    // reachable rather than hypothetical: 1 is on the ladder itself, so a
    // viewer sitting there sees it as the first rung, at its own value. The
    // guard still matters for any sub-floor radius the DB could not hold
    // before — the picker must represent it as itself, never silently render
    // "Within 2 miles" while the feed filters on something else.
    expect(radiusChoices(1).map((c) => c.radiusMiles)).toEqual([1, 2, 5, 10, 20, 35])
  })

  it('labels each option once, and every label carries the number it writes', () => {
    for (const radius of RADIUS_MILES_OPTIONS) {
      const labels = radiusChoices(radius).map((c) => c.label)
      expect(new Set(labels).size).toBe(labels.length)
      for (const choice of radiusChoices(radius)) {
        expect(choice.label).toContain(String(choice.radiusMiles))
      }
    }
  })

  it('carries the 35-mile option at every radius (the founder\'s "widen" path is always one tap)', () => {
    for (const radius of RADIUS_MILES_OPTIONS) {
      expect(radiusChoices(radius).map((c) => c.radiusMiles)).toContain(SEE_ALL_RADIUS_MILES)
    }
  })
})

describe('radiusSliderCeiling (V32 v32-3 / A3b: the slider must hold the radius it reports)', () => {
  it('leaves a normal parent\'s control at 30 (the regression to guard is a silent WIDENING)', () => {
    // The /browse control deliberately offers 1–30, narrower than the 1–35
    // CHECK. If the ceiling ever becomes 35 for everyone, this fails: that is a
    // public-behaviour change nobody asked for.
    expect(RADIUS_SLIDER_CEILING_MILES).toBe(30)
    expect(radiusSliderCeiling(30)).toBe(30)
    expect(radiusSliderCeiling(20)).toBe(30)
  })

  it('widens to hold the founder\'s own 35 — the pinned THUMB (A3b)', () => {
    // The defect: a `<input type=range>` whose `value` exceeds its `max` pins
    // its thumb at `max` while the label reads the stored number, so he saw
    // "Radius: 35 miles" with the thumb stuck at 30. 35 must be representable.
    expect(radiusSliderCeiling(35)).toBe(35)
  })

  it('never drops below this control\'s own ceiling, for any radius at or under it', () => {
    // A ceiling below the offered range would make the slider unable to reach
    // radii the ladder already offers. 1 is the floor case.
    expect(radiusSliderCeiling(1)).toBe(30)
    for (let r = 1; r <= RADIUS_SLIDER_CEILING_MILES; r++) {
      expect(radiusSliderCeiling(r)).toBe(RADIUS_SLIDER_CEILING_MILES)
    }
  })

  it('keeps the two maxima distinct — the slider default reach is not the DB ceiling', () => {
    // Two maxima exist on purpose: 30 is this control's reach, 35 is the data
    // ceiling. Collapsing them would either widen the public control or make a
    // stored 35 unrepresentable.
    expect(RADIUS_SLIDER_CEILING_MILES).toBeLessThan(RADIUS_MAX_MILES)
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
    expect(inbox.items[0].label).toBe("A drop-in you’re going to was cancelled — you said you'd go")
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

  it('a host-ended post is PAST even while its window is still ahead (V12 t03)', () => {
    // The "End this post now" case: the window starts ten minutes from now,
    // but the host ended the post early — it lands in Past (rendered with an
    // "Ended" label by the profile page), not in Upcoming.
    const nowIso = at(600)
    const endedEarly = { id: 'ended-early', starts_at: at(610), ends_at: at(670), status: 'ended' }
    const { upcoming, past } = partitionPostsByTime([endedEarly], nowIso)
    expect(past.map((post) => post.id)).toEqual(['ended-early'])
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
  /** The upcoming query's exact count (nothing renders it — only the past cap has a tail). */
  upcomingCount?: number | null
  /** The past section's rows. */
  pastRows?: unknown[]
  /** The past query's exact count — the honest older-rows line's source. */
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

  it('reports the past rows beyond the cap as an honest count (profileArchive.olderPastNote)', async () => {
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

  it('an off-grid stored duration (45 minutes) still prefills as "none picked"', () => {
    const values = playdateFormValuesFromPost(
      storedPost({ ends_at: computeEndIso('2026-09-12', 15 * 60 + 30, 45) }),
    )
    expect(values.durationMinutes).toBe(0)
    expect(isDuration(values.durationMinutes)).toBe(false)
  })

  it('a stored 30-minute window reads back as 30, not 0 (v33-7a: the parse/snap gate is the step grid, not chip membership)', () => {
    // The defect this slice fixes: a 30-minute span was postable from the End
    // stepper but playdateFormValuesFromPost snapped it to 0, so /edit asked
    // the parent to re-pick a length they already had.
    const values = playdateFormValuesFromPost(
      storedPost({ ends_at: computeEndIso('2026-09-12', 15 * 60 + 30, 30) }),
    )
    expect(values.durationMinutes).toBe(30)
    // Round trip: saving these values recomputes the same instants.
    const post = storedPost({ ends_at: computeEndIso('2026-09-12', 15 * 60 + 30, 30) })
    expect(
      computeEndIso(values.startDate, values.startMinutes, values.durationMinutes),
    ).toBe(post.ends_at)
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

describe('cardWhenLabel (V25 ticket 05: the feed card’s day · time line)', () => {
  // Local wall clock on purpose (the seam reads the DEVICE's calendar day, the
  // same one the section headers group on): Saturday, September 26 2026, 5 PM.
  const STARTS = new Date(2026, 8, 26, 17, 0).toISOString()
  const ENDS = new Date(2026, 8, 26, 18, 30).toISOString()

  it('leads with the day in the app’s own short words, then the window', () => {
    const label = cardWhenLabel(STARTS, ENDS)
    // The day half is locale-independent (the fixed English tables) and is the
    // founder's reference form — his screenshot's "Sat, Sep 26".
    expect(label.startsWith('Sat, Sep 26 · ')).toBe(true)
    // The window half is `formatTimeWindow` — the ONE window rule, not a copy.
    expect(label.endsWith(formatTimeWindow(STARTS, ENDS))).toBe(true)
    expect(label).toContain('–')
  })

  it('reads the day from the SAME seam the /new summary uses (no second day rule)', () => {
    // If a future edit reaches for formatDayLabel's today/tomorrow branch, or
    // invents its own table, this agreement pin fails.
    expect(cardWhenLabel(STARTS, ENDS).startsWith(formatStartDayLabel(localDayKey(STARTS)))).toBe(
      true,
    )
  })

  it('prints the DATE even when the section header says "Today"', () => {
    // The deliberate difference: the header above the card is relative ("Today"),
    // the card is a date — it also renders on browse, place pages and profiles,
    // where there is no header to borrow the day from.
    const nowIso = new Date(2026, 8, 26, 9, 0).toISOString()
    expect(formatDayLabel(STARTS, nowIso)).toBe('Today')
    expect(cardWhenLabel(STARTS, ENDS).startsWith('Sat, Sep 26 · ')).toBe(true)
    expect(cardWhenLabel(STARTS, ENDS)).not.toContain('Today')
  })

  it('falls back to the window alone when the start cannot name a day (no dangling separator)', () => {
    const bad = cardWhenLabel('not-a-date', 'not-a-date')
    expect(bad).toBe(formatTimeWindow('not-a-date', 'not-a-date'))
    expect(bad).not.toContain(' · ')
  })
})

describe('moreOptionsHoldsError (V9 ticket 03: no error hidden behind the disclosure; V11 t05: the list is empty)', () => {
  it('is false for every field, because no required answer lives behind the disclosure', () => {
    // V11 ticket 05: the start moved into the visible "When" section, so NOTHING
    // required renders behind the disclosure anymore. The rule is the drift
    // hook — it only ever returns true once a required field is added to
    // MORE_OPTIONS_FIELDS (which the next test pins to empty).
    expect(moreOptionsHoldsError({ startDate: 'Pick a start date.' })).toBe(false)
    expect(moreOptionsHoldsError({ startMinutes: 'Pick a start time.' })).toBe(false)
    // The visible answers do not need the disclosure opened to be seen.
    expect(moreOptionsHoldsError({ place: 'Add a place (park, lot, field).' })).toBe(false)
    expect(moreOptionsHoldsError({ durationMinutes: 'Pick a duration.' })).toBe(false)
    expect(moreOptionsHoldsError({})).toBe(false)
  })

  it('pins the list to EMPTY (the drift hook: a required field behind the door must be added here)', () => {
    // V11 ticket 05: the start (date + the 30-minute stepper) is in the visible
    // "When" section, so the disclosure holds only OPTIONAL answers (the kids
    // picker, the address, the details and the repeat toggle). An empty list
    // means a failed start-date submit leaves the disclosure closed — which
    // e2e/post-fast.e2e.ts pins end to end. The moment a required field is
    // added behind the door, it must be added here too or its error is invisible.
    expect([...MORE_OPTIONS_FIELDS]).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// V10 ticket 01: "Post again" — the whole last post, one tap.

describe('clonedStart (V10 ticket 01: the time rule the Post-again clone moves by)', () => {
  // The row the chip clones: last Saturday-style post at 15:00 local.
  const LAST_START = localIso(15, 0)

  it('the same slot again when it is still ahead today', () => {
    expect(clonedStart(LAST_START, localIso(14, 10))).toEqual({
      startDate: localDayKey(LAST_START),
      startMinutes: 15 * 60,
    })
  })

  it('the same slot, on the exact boundary (now == slot is still ahead — "now" has not passed it)', () => {
    // 15:00 now vs a 15:00 last post, BOTH on the fixed clock's day (Sep 12
    // local — day 12): the slot is not YET past, so today's 15:00 is offered
    // (a parent opening the form at the very minute the group usually meets
    // still gets "same time today").
    const lastToday = localIso(15, 0, 12)
    expect(clonedStart(lastToday, localIso(15, 0, 12))).toEqual({
      startDate: localDayKey(lastToday),
      startMinutes: 15 * 60,
    })
  })

  it('tomorrow at the same time once today\u2019s slot has passed', () => {
    const out = clonedStart(LAST_START, localIso(16, 10))
    expect(out.startMinutes).toBe(15 * 60)
    expect(out.startDate).toBe(localDayKey(localIso(0, 0, 13)))
  })

  it('snaps a legacy OFF-GRID stored start to the 30-minute grid', () => {
    // Legacy rows exist (playdateFormValuesFromPost deliberately never snaps);
    // a CLONE is a new post through the form, so it must be postable.
    expect(clonedStart(localIso(15, 10), localIso(14, 0)).startMinutes).toBe(15 * 60)
    expect(clonedStart(localIso(15, 40), localIso(14, 0)).startMinutes).toBe(15 * 60 + 30)
  })

  it('the DAY is now\u2019s day, not the stored row\u2019s (a days-old post still clones to today/tomorrow)', () => {
    // The last post was Sep 3; NOW is Sep 12 14:10 — the 15:00 slot is still
    // ahead today, so the clone lands TODAY (Sep 12), not on the old date.
    const oldPost = localIso(15, 0, 3)
    const out = clonedStart(oldPost, localIso(14, 10, 12))
    expect(out.startDate).toBe(localDayKey(localIso(0, 0, 12)))
    expect(out.startMinutes).toBe(15 * 60)
  })

  it('keeps the slot across a midnight wrap (a 00:30 last post → tomorrow 00:30 when now is 23:45)', () => {
    const lateNow = localIso(23, 45)
    const out = clonedStart(localIso(0, 30), lateNow)
    expect(out.startMinutes).toBe(30)
    expect(out.startDate).toBe(localDayKey(localIso(0, 0, 13)))
  })

  it('an on-grid slot is never shifted by the snap', () => {
    expect(clonedStart(localIso(15, 30), localIso(14, 0)).startMinutes).toBe(15 * 60 + 30)
  })
})

describe('cloneLastPost (V10 ticket 01: the Post-again values, pure)', () => {
  // A post from "yesterday-ish" relative to the fixed clock, with everything
  // a clone should carry. Starts 2026-09-03 15:00, ends 17:00 (2h), has an
  // address, details and two kids.
  const LAST: LastOwnPlaydate = {
    id: 'pd-1',
    title: 'Playdate at Green Lake Park',
    place: 'Green Lake Park',
    neighborhood_id: 'n-green',
    starts_at: new Date(2026, 8, 3, 15, 0, 0, 0).toISOString(),
    ends_at: new Date(2026, 8, 3, 17, 0, 0, 0).toISOString(),
    details: '  Bring snacks.  ',
    address: ' 7201 East Green Lake Dr N ',
    kid_ids: ['kid-a', 'kid-b'],
  }

  it('carries the whole plan: place, address, neighbourhood, duration, details, kids', () => {
    const out = cloneLastPost(LAST, NOW_ISO)
    expect(out.values.place).toBe('Green Lake Park')
    expect(out.values.neighborhoodId).toBe('n-green')
    expect(out.values.durationMinutes).toBe(120)
    expect(out.values.details).toBe('Bring snacks.')
    expect(out.address).toBe('7201 East Green Lake Dr N')
    expect(out.kidIds).toEqual(['kid-a', 'kid-b'])
  })

  it('moves the start by the clonedStart rule (the same slot, today here)', () => {
    const out = cloneLastPost(LAST, NOW_ISO)
    // The last post was Sep 3 15:00 local; NOW is Sep 4 12:00, so the 15:00
    // slot is still ahead TODAY (Sep 4) — the same slot again.
    expect(out.values.startDate).toBe(localDayKey(localIso(0, 0, 4)))
    expect(out.values.startMinutes).toBe(15 * 60)
  })

  it('keeps the parent\u2019s own title when it fits the cap', () => {
    // A STORED title is a parent's own words and is reproduced verbatim — it is
    // NOT regenerated, so this asserts the fixture's literal value. V23 renamed
    // the GENERATED prefix ("Playdate at" -> "Drop-in at") and deliberately did
    // NOT rewrite stored posts, so this expectation staying on the old string is
    // the behaviour, not a stale assertion. The two cases below are the ones
    // that regenerate, and they carry the new word.
    expect(cloneLastPost(LAST, NOW_ISO).values.title).toBe('Playdate at Green Lake Park')
  })

  it('REGENERATES the title when the stored one would be refused (over the cap)', () => {
    const longTitle = 'x'.repeat(81)
    const out = cloneLastPost({ ...LAST, title: longTitle }, NOW_ISO)
    expect(out.values.title).toBe('Drop-in at Green Lake Park')
    expect(out.values.title.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH)
  })

  it('regenerates from the place when the stored title is empty', () => {
    const out = cloneLastPost({ ...LAST, title: '' }, NOW_ISO)
    expect(out.values.title).toBe('Drop-in at Green Lake Park')
  })

  it('a title that names a DIFFERENT place is still kept (the parent\u2019s words win)', () => {
    const out = cloneLastPost({ ...LAST, title: 'Saturday soccer crew' }, NOW_ISO)
    expect(out.values.title).toBe('Saturday soccer crew')
  })

  it('a legacy off-grid stored duration (45 minutes) still becomes 0 ("none picked yet")', () => {
    // The end is computed from start + a legal chip today, but legacy/manual
    // rows could carry e.g. 45 minutes; the form's step grid is a pinned
    // contract (playdateFormValuesFromPost's same rule).
    const out = cloneLastPost(
      {
        ...LAST,
        starts_at: new Date(2026, 8, 3, 15, 0, 0, 0).toISOString(),
        ends_at: new Date(2026, 8, 3, 15, 45, 0, 0).toISOString(),
      },
      NOW_ISO,
    )
    expect(out.values.durationMinutes).toBe(0)
  })

  it('maps a NULL neighbourhood to "" and trims nullable text (the 0035 shapes)', () => {
    const out = cloneLastPost({ ...LAST, neighborhood_id: null, details: null, address: null }, NOW_ISO)
    expect(out.values.neighborhoodId).toBe('')
    expect(out.values.details).toBe('')
    expect(out.address).toBe('')
  })

  it('the clone\u2019s values pass validatePlaydateForm (a chip that writes an unpostable form is broken)', () => {
    const out = cloneLastPost(LAST, NOW_ISO)
    // The clone fills everything EXCEPT what the parent must still confirm is
    // fine — but nothing the clone writes may be invalid: place, date, grid
    // time, duration all have rules.
    expect(validatePlaydateForm({ ...out.values, ageHint: '' })).toEqual({})
  })

  it('agrees with the real generatedTitle seam on a regenerated title', () => {
    // generatedTitleFromParts is the cycle-avoiding restatement of
    // postSummary.generatedTitle; the test pins the two together so they
    // cannot drift. The seam itself is imported from postSummary (where it
    // lives — feed.ts cannot import it without closing the places cycle).
    const out = cloneLastPost({ ...LAST, title: '' }, NOW_ISO)
    expect(out.values.title).toBe(realGeneratedTitle('Green Lake Park'))
    expect(realGeneratedTitle('')).toBe('Drop-in')
  })
})

describe('queryLastOwnPlaydateWithClient (V10 ticket 01, mocked supabase client)', () => {
  const row = {
    id: 'pd-9',
    title: 'Playdate at Green Lake Park',
    place: 'Green Lake Park',
    neighborhood_id: null,
    starts_at: '2026-09-03T22:00:00.000Z',
    ends_at: '2026-09-04T00:00:00.000Z',
    details: null,
    address: '7201 East Green Lake Dr N',
    playdate_kids: [{ kid_id: 'kid-a' }],
  }

  it('scopes to the host, newest by START (not created_at), one row', async () => {
    const { client, filters } = makeFeedMockClient([row])
    expect(await queryLastOwnPlaydateWithClient(client, 'me')).toEqual(row)
    expect(filters).toContain('eq(host_profile_id, me)')
    expect(filters).toContain('order(starts_at, false)')
    expect(filters).toContain('order(id, false)')
    expect(filters).toContain('limit(1)')
  })

  it('returns null when the parent has never posted', async () => {
    const { client } = makeFeedMockClient([])
    expect(await queryLastOwnPlaydateWithClient(client, 'me')).toBeNull()
  })
})

describe('lastOwnPlaydateFrom (V10 ticket 01: the embed row → the typed payload)', () => {
  it('maps the happy row, keeping only real kid ids', () => {
    const out = lastOwnPlaydateFrom({
      id: 'pd-1',
      title: 'T',
      place: 'P',
      neighborhood_id: null,
      starts_at: '2026-09-03T22:00:00.000Z',
      ends_at: '2026-09-04T00:00:00.000Z',
      details: null,
      address: null,
      playdate_kids: [{ kid_id: 'kid-a' }, { kid_id: null }, {}],
    })
    expect(out).not.toBeNull()
    expect(out?.kid_ids).toEqual(['kid-a'])
    expect(out?.neighborhood_id).toBeNull()
  })

  it('an empty/null embed is "no kids"', () => {
    const base = {
      id: 'pd-1',
      title: 'T',
      place: 'P',
      starts_at: '2026-09-03T22:00:00.000Z',
      ends_at: '2026-09-04T00:00:00.000Z',
    }
    expect(lastOwnPlaydateFrom({ ...base, playdate_kids: [] })?.kid_ids).toEqual([])
    expect(lastOwnPlaydateFrom({ ...base, playdate_kids: null })?.kid_ids).toEqual([])
  })

  it('a row missing a required field maps to null (the chip degrades to absent)', () => {
    expect(lastOwnPlaydateFrom({ title: 'T', place: 'P', starts_at: 'x', ends_at: 'y' })).toBeNull()
    expect(lastOwnPlaydateFrom(null)).toBeNull()
  })
})

describe('queryPastOwnPlaydatesWithClient (V13 ticket 04, mocked supabase client)', () => {
  const rows = [
    {
      id: 'pd-2',
      title: 'Newer post',
      place: 'Green Lake Park',
      neighborhood_id: null,
      starts_at: '2026-09-05T22:00:00.000Z',
      ends_at: '2026-09-06T00:00:00.000Z',
      details: null,
      address: '7201 East Green Lake Dr N',
      status: 'ended',
      playdate_kids: [{ kid_id: 'kid-a' }],
    },
    {
      id: 'pd-1',
      title: 'Older post',
      place: 'Seward Park',
      neighborhood_id: null,
      starts_at: '2026-09-03T22:00:00.000Z',
      ends_at: '2026-09-04T00:00:00.000Z',
      details: null,
      address: null,
      status: 'cancelled',
      playdate_kids: [],
    },
  ]

  it('scopes to the host, newest by START (not created_at), ALL rows with status + kids embed', async () => {
    const { client, filters } = makeFeedMockClient(rows)
    expect(await queryPastOwnPlaydatesWithClient(client, 'me')).toEqual(rows)
    expect(filters).toContain('eq(host_profile_id, me)')
    expect(filters).toContain('order(starts_at, false)')
    expect(filters).toContain('order(id, false)')
    // No limit — every past post is listed (AC3: ended/cancelled stay visible).
    expect(filters.some((f: string) => f.startsWith('limit'))).toBe(false)
  })

  it('returns [] when the parent has never posted', async () => {
    const { client } = makeFeedMockClient([])
    expect(await queryPastOwnPlaydatesWithClient(client, 'me')).toEqual([])
  })
})

describe('pastPostStatusLabel (V13 ticket 04: the picker row status chip)', () => {
  it('maps ended → "Ended", cancelled → "Cancelled"', () => {
    expect(pastPostStatusLabel('ended')).toBe('Ended')
    expect(pastPostStatusLabel('cancelled')).toBe('Cancelled')
  })

  it('on / undefined / null → null (no chip — an upcoming post needs no label)', () => {
    expect(pastPostStatusLabel('on')).toBeNull()
    expect(pastPostStatusLabel(undefined)).toBeNull()
    expect(pastPostStatusLabel(null)).toBeNull()
  })
})

/**
 * V16 t07 item 4: the Browse distance filter's three-way choice. These were a
 * nested ternary inline in the page's JSX — which the repo's review rules flag
 * outright ("Nested ternary expressions are not allowed"), and which nothing
 * could test. Extracting them makes the round trip assertable: whatever the
 * select renders as its `value` must map back to the same choice, or the
 * control shows one thing while the list filters on another (the same
 * "control that lies" failure the feed picker's off-ladder guard exists for).
 */
describe('distanceSelectValue / distanceChoiceFromValue (V16 t07 item 4)', () => {
  it('renders the two sentinels as their own strings', () => {
    expect(distanceSelectValue('profile')).toBe('profile')
    expect(distanceSelectValue('any')).toBe('any')
  })

  it('renders a numeric choice as its digit string (the DOM value attribute)', () => {
    expect(distanceSelectValue(1)).toBe('1')
    expect(distanceSelectValue(35)).toBe('35')
  })

  it('maps a select value back to the same choice, for every option offered', () => {
    // The round trip is the point: a value that does not survive it would make
    // the select display one radius while filtering on another.
    const choices: DistanceChoice[] = ['profile', 'any', ...RADIUS_MILES_OPTIONS]
    for (const choice of choices) {
      expect(distanceChoiceFromValue(distanceSelectValue(choice))).toBe(choice)
    }
  })

  it('parses a numeric value to a NUMBER, not a string', () => {
    // The bug this guards: a string "5" reaching the distance filter would
    // compare / sort as text and silently select the wrong radius.
    expect(distanceChoiceFromValue('5')).toBe(5)
    expect(typeof distanceChoiceFromValue('5')).toBe('number')
  })
})

describe('homeZipControlLabel (V16 t06 item 2: the feed says where "near you" is)', () => {
  it('names the zip the radius filter is actually spending', () => {
    // The value is rendered as stored, so the label and the query can never
    // disagree about which zip is in effect.
    expect(homeZipControlLabel('98107')).toBe('Showing drop-ins near 98107')
  })

  it('says there is no zip in words, rather than rendering a blank label', () => {
    // The case a blank render gets wrong: an empty label next to a live input
    // reads as a loading state or a bug, and this is the exact state the feed's
    // own control exists to fix (the escapes are suppressed here).
    for (const missing of [null, undefined, '', '   ']) {
      expect(homeZipControlLabel(missing)).toBe('No home zip set yet.')
    }
  })

  it('treats a whitespace-padded stored zip as the zip it is', () => {
    // The same trim `validateHomeZip` applies before it checks the shape, so a
    // padded value is not reported as missing by one and accepted by the other.
    expect(homeZipControlLabel(' 98107 ')).toBe('Showing drop-ins near 98107')
  })

  it('never claims a location the viewer does not have', () => {
    // The honesty pin: the missing-zip label must not name a zip, a city or a
    // radius — it is the one line on this screen stating what the app does NOT
    // know.
    expect(homeZipControlLabel(null)).not.toMatch(/\d/)
    expect(homeZipControlLabel(null).toLowerCase()).not.toContain('seattle')
  })
})

/**
 * V23 slice 1: the feed's single secondary location control. It replaces the
 * two permanent controls (the radius select + the zip form) with ONE button
 * that opens the shared LocationModal, so its copy must carry BOTH halves of
 * the filter — where AND how far — in one line.
 */
describe('feedLocationSummary (V23 slice 1: one control says where AND how far)', () => {
  it('names the stored zip and the current radius together', () => {
    expect(feedLocationSummary('98107', 5)).toBe('Near 98107 · within 5 miles')
  })

  it('renders the zip as stored (no reformatting) and the radius through milesWord', () => {
    expect(feedLocationSummary(' 98107 ', 5)).toBe('Near 98107 · within 5 miles')
    expect(feedLocationSummary('98107', 1)).toBe('Near 98107 · within 1 mile')
    expect(feedLocationSummary('98007', 20)).toBe('Near 98007 · within 20 miles')
  })

  it('says "Set your location" when no zip is saved — never a fake "Near …"', () => {
    for (const missing of [null, undefined, '', '   ']) {
      expect(feedLocationSummary(missing, 5)).toBe('Set your location')
    }
  })
})

/**
 * V16 t06 item 2 review: whether the Feed's zip Save should write at all. The
 * first version of this rule let an empty draft through over a saved zip — the
 * ORDINARY flow, since the field is a scratch buffer — so tapping Save showed
 * "Add your home zip." directly beneath "Showing drop-ins near 98107", a false
 * error contradicting the label above it. These cases pin all five branches.
 */
describe('feedZipSaveIsNoop (V16 t06 item 2 — Save must not raise a false error)', () => {
  it('no-ops an empty draft over a SAVED zip (the scratch-buffer case)', () => {
    expect(feedZipSaveIsNoop('', '98107')).toBe(true)
    expect(feedZipSaveIsNoop('   ', '98107')).toBe(true)
  })

  it('no-ops a draft identical to the saved zip', () => {
    expect(feedZipSaveIsNoop('98107', '98107')).toBe(true)
    expect(feedZipSaveIsNoop('  98107  ', '98107')).toBe(true)
  })

  it('WRITES an empty draft when no zip is saved, so the validator can answer', () => {
    // The one case that must not be swallowed: "Add your home zip." is the true
    // and useful message here.
    expect(feedZipSaveIsNoop('', null)).toBe(false)
    expect(feedZipSaveIsNoop('', undefined)).toBe(false)
    expect(feedZipSaveIsNoop('', '')).toBe(false)
    expect(feedZipSaveIsNoop('   ', '   ')).toBe(false)
  })

  it('WRITES a real change in either direction', () => {
    expect(feedZipSaveIsNoop('98101', '')).toBe(false)
    expect(feedZipSaveIsNoop('98101', null)).toBe(false)
    expect(feedZipSaveIsNoop('98101', '98107')).toBe(false)
  })
})

/**
 * V16 t09 review: the generic fallback is shared by FOUR surfaces that all
 * perform the same write — the Feed's radius control, the Feed's zip control,
 * RadiusEmptyState's escape, and onboarding. It must therefore name no subject:
 * a zip failure rendering "Could not update your radius" misattributes the
 * failure to the control the user did NOT touch. The t09 review caught exactly
 * that, and also caught that onboarding (a fourth call site) was still inlining
 * `err.message` and therefore still showing the raw PostgREST text.
 */
describe('RADIUS_SAVE_FAILED_COPY (V16 t09 review — one fallback, no wrong subject)', () => {
  it('names no single control, since four different controls render it', () => {
    const copy = RADIUS_SAVE_FAILED_COPY.toLowerCase()
    expect(copy).not.toContain('radius')
    expect(copy).not.toContain('zip')
  })

  it('says what to do next rather than only that something broke', () => {
    expect(RADIUS_SAVE_FAILED_COPY).toContain('Try again')
  })
})

/**
 * V16 t07 item 3 — `milesWord`, the singular/plural helper.
 *
 * It WAS untested directly, which is precisely how "1 miles" reached a running
 * app: the floor dropped to 1, three templates each hardcoded "miles", and the
 * only reason it was caught is that a REVIEW read the rendered copy. The
 * indirect coverage was no coverage — `emptyRadiusCopy(1)` and the option ladder
 * each assert a full string, so they would have caught a break in THEIR OWN
 * template but not in the two page-level call sites (BrowsePage's filter label,
 * OnboardingPage's picker), which have no unit test at all and are guarded by
 * nothing but this helper being right.
 *
 * Deliberately `=== 1` and not `<= 1`: a radius of 0 or a negative is not a
 * real input (validateRadiusMiles rejects it), so 1 is the only singular case.
 * The last case pins that reading — if someone "simplifies" it to `<= 1`, this
 * fails and they have to decide deliberately.
 */
describe('milesWord (V16 t07 item 3 — the plural that shipped wrong once)', () => {
  it('says "mile" for exactly 1', () => {
    expect(milesWord(1)).toBe('mile')
  })

  it('says "miles" for every other real radius', () => {
    expect(milesWord(2)).toBe('miles')
    expect(milesWord(5)).toBe('miles')
    expect(milesWord(20)).toBe('miles')
    expect(milesWord(35)).toBe('miles')
  })

  it('is singular ONLY at 1 — 0 and negatives are not real radii but must not read "mile"', () => {
    // Pins the `=== 1` reading against a future `<= 1` "simplification".
    expect(milesWord(0)).toBe('miles')
    expect(milesWord(-1)).toBe('miles')
  })

  it('reads correctly in the exact sentence the app renders', () => {
    expect(`Nothing within 1 ${milesWord(1)} yet.`).toBe('Nothing within 1 mile yet.')
    expect(`Within 1 ${milesWord(1)}`).toBe('Within 1 mile')
    expect(`Radius: 1 ${milesWord(1)}`).toBe('Radius: 1 mile')
  })
})
