/**
 * V8 ticket 06 — the weekly series' pure seams (src/lib/series.ts).
 *
 * The load-bearing test here is the DST pair: a 10:00 AM series in
 * `America/Los_Angeles` must produce 10:00 AM local occurrences across BOTH
 * the March and the November transition — the UTC instants shift by an hour
 * (18:00Z → 17:00Z → 18:00Z), and that shift IS the feature working. A
 * stored UTC instant would have moved the meetup to 9:00 or 11:00 local;
 * the wall-clock + IANA-zone model is what keeps it put.
 *
 * Every expectation below is written as a literal INSTANT (not as a
 * re-evaluation of the seam), so the tests can actually fail: the seam is
 * checked against the clock, not against itself.
 */
import { describe, expect, it } from 'vitest'
import {
  SERIES_HORIZON_DAYS,
  SERIES_HORIZON_MAX_DAYS,
  deviceTimeZone,
  everyWeekdayLabel,
  missingOccurrences,
  nextOccurrenceDates,
  resolveTimeZone,
  seriesIdField,
  seriesInsertRow,
  seriesLineLabel,
  seriesTimeLabel,
  seriesWeekdayName,
  weekdayFromDateIso,
  weeklyMetaSuffix,
  zonedWallClockToIso,
} from './series'

/** The wall clock (HH:MM) an instant reads as in a zone — the invariant helper. */
function localTimeInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** The local calendar date (YYYY-MM-DD) an instant falls on in a zone. */
function localDateInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

describe('weekdayFromDateIso (the /new date field → the weekday in words)', () => {
  it('reads the date parts as a LOCAL calendar day, never through UTC midnight', () => {
    // 2026-09-12 is a Saturday; Date.parse('2026-09-12') is UTC midnight,
    // which is still Friday 2026-09-11 in the Americas — the off-by-one that
    // would post the whole series a day early.
    expect(weekdayFromDateIso('2026-09-12')).toBe(6)
    expect(weekdayFromDateIso('2026-09-13')).toBe(0)
    expect(weekdayFromDateIso('2026-03-08')).toBe(0)
  })

  it('returns null for an empty or impossible value (the form’s date can be cleared)', () => {
    expect(weekdayFromDateIso('')).toBeNull()
    expect(weekdayFromDateIso('   ')).toBeNull()
    expect(weekdayFromDateIso(null)).toBeNull()
    expect(weekdayFromDateIso(undefined)).toBeNull()
    expect(weekdayFromDateIso('not-a-date')).toBeNull()
    expect(weekdayFromDateIso('2026-02-31')).toBeNull()
    expect(weekdayFromDateIso('2026-13-01')).toBeNull()
  })

  it('labels the weekday back in words, and says nothing when nothing is chosen', () => {
    expect(everyWeekdayLabel(weekdayFromDateIso('2026-09-12'))).toBe('every Saturday')
    expect(everyWeekdayLabel(0)).toBe('every Sunday')
    expect(everyWeekdayLabel(6)).toBe('every Saturday')
    expect(everyWeekdayLabel(null)).toBe('')
    expect(seriesWeekdayName(6)).toBe('Saturday')
    expect(seriesWeekdayName(7)).toBe('Sunday') // wraps, never crashes a render
  })
})

describe('the timezone seam', () => {
  it('falls back to UTC only when the device reports nothing', () => {
    expect(resolveTimeZone('America/Los_Angeles')).toBe('America/Los_Angeles')
    expect(resolveTimeZone('  Europe/Paris ')).toBe('Europe/Paris')
    expect(resolveTimeZone('')).toBe('UTC')
    expect(resolveTimeZone('   ')).toBe('UTC')
    expect(resolveTimeZone(null)).toBe('UTC')
    expect(resolveTimeZone(undefined)).toBe('UTC')
  })

  it('deviceTimeZone() always answers with a non-empty zone name', () => {
    expect(resolveTimeZone(deviceTimeZone())).toBe(deviceTimeZone())
    expect(deviceTimeZone().length).toBeGreaterThan(0)
  })

  it('zonedWallClockToIso interprets a naive wall clock in the given zone', () => {
    // 10:00 on 2026-03-07 in Los Angeles is PST (-8) → 18:00Z.
    expect(zonedWallClockToIso(2026, 3, 7, 600, 'America/Los_Angeles')).toBe(
      '2026-03-07T18:00:00.000Z',
    )
    // The same wall clock a week later, on PDT (-7) → 17:00Z.
    expect(zonedWallClockToIso(2026, 3, 14, 600, 'America/Los_Angeles')).toBe(
      '2026-03-14T17:00:00.000Z',
    )
    // A zone Intl does not know degrades to UTC instead of throwing.
    expect(zonedWallClockToIso(2026, 3, 7, 600, 'Not/AZone')).toBe('2026-03-07T10:00:00.000Z')
  })
})

describe('nextOccurrenceDates — the occurrence seam (migration 0028 parity)', () => {
  it('keeps 10:00 AM across the MARCH transition (America/Los_Angeles)', () => {
    // Local today is Sunday 2026-03-01 (16:00 PST); +21 days reaches
    // 2026-03-22 — three Saturdays, straddling the 2026-03-08 transition.
    const dates = nextOccurrenceDates(6, 600, 'America/Los_Angeles', '2026-03-02T00:00:00Z', 21)
    expect(dates).toEqual([
      '2026-03-07T18:00:00.000Z', // PST, -8
      '2026-03-14T17:00:00.000Z', // PDT, -7
      '2026-03-21T17:00:00.000Z', // PDT, -7
    ])
    for (const iso of dates) {
      expect(localTimeInZone(iso, 'America/Los_Angeles')).toBe('10:00')
    }
  })

  it('keeps 10:00 AM across the NOVEMBER transition (America/Los_Angeles)', () => {
    // Local today is Sunday 2026-10-25; +21 days reaches 2026-11-15, so the
    // set straddles the 2026-11-01 transition in the other direction.
    const dates = nextOccurrenceDates(6, 600, 'America/Los_Angeles', '2026-10-26T00:00:00Z', 21)
    expect(dates).toEqual([
      '2026-10-31T17:00:00.000Z', // PDT, -7
      '2026-11-07T18:00:00.000Z', // PST, -8
      '2026-11-14T18:00:00.000Z', // PST, -8
    ])
    for (const iso of dates) {
      expect(localTimeInZone(iso, 'America/Los_Angeles')).toBe('10:00')
      expect(localDateInZone(iso, 'America/Los_Angeles').endsWith('-06')).toBe(false)
    }
  })

  it('is exactly weekly: 7 days apart, ± the DST hour, in ascending order, with no repeats', () => {
    const dates = nextOccurrenceDates(6, 600, 'America/Los_Angeles', '2026-03-02T00:00:00Z', 21)
    expect(new Set(dates).size).toBe(dates.length)
    for (let i = 1; i < dates.length; i++) {
      const gapHours =
        (Date.parse(dates[i] as string) - Date.parse(dates[i - 1] as string)) / 3_600_000
      expect(Math.abs(gapHours - 168)).toBeLessThanOrEqual(1)
    }
  })

  it('generates only FUTURE occurrences (a Saturday already under way is not re-generated)', () => {
    // 10:30 AM local on Saturday 2026-09-12: that day's 10:00 slot has passed.
    const dates = nextOccurrenceDates(6, 600, 'America/Los_Angeles', '2026-09-12T17:30:00Z', 21)
    expect(dates[0]).toBe('2026-09-19T17:00:00.000Z')
    expect(dates).toHaveLength(3)
  })

  it('matches the weekday it was asked for, and nothing else', () => {
    const saturdays = nextOccurrenceDates(6, 600, 'UTC', '2026-09-12T00:00:00Z', 21)
    const sundays = nextOccurrenceDates(0, 600, 'UTC', '2026-09-12T00:00:00Z', 21)
    expect(saturdays).toHaveLength(4) // 09-12, 09-19, 09-26, 10-03
    expect(sundays).toHaveLength(3) // 09-13, 09-20, 09-27
    for (const iso of saturdays) expect(new Date(iso).getUTCDay()).toBe(6)
    for (const iso of sundays) expect(new Date(iso).getUTCDay()).toBe(0)
  })

  it('honours the 21-day default and clamps a caller-supplied horizon (the work bound)', () => {
    const from = '2026-09-12T00:00:00Z'
    expect(nextOccurrenceDates(6, 600, 'UTC', from)).toEqual(
      nextOccurrenceDates(6, 600, 'UTC', from, SERIES_HORIZON_DAYS),
    )
    // 500 days would be ~72 Saturdays; the cap bounds one call to 60 days (9).
    expect(nextOccurrenceDates(6, 600, 'UTC', from, 500)).toHaveLength(9)
    expect(nextOccurrenceDates(6, 600, 'UTC', from, 500)).toEqual(
      nextOccurrenceDates(6, 600, 'UTC', from, SERIES_HORIZON_MAX_DAYS),
    )
    // A nonsense horizon is clamped up to one day, never to nothing at all.
    expect(nextOccurrenceDates(6, 600, 'UTC', from, 0)).toHaveLength(1)
  })

  it('returns [] for an unparseable "from" instead of throwing', () => {
    expect(nextOccurrenceDates(6, 600, 'UTC', 'nope')).toEqual([])
  })
})

describe('missingOccurrences — the no-duplicate guarantee', () => {
  it('yields the whole set the first time and NOTHING the second (on-conflict parity)', () => {
    const desired = nextOccurrenceDates(6, 600, 'America/Los_Angeles', '2026-03-02T00:00:00Z', 21)
    const first = missingOccurrences(desired, [])
    expect(first).toEqual(desired)
    // The generator ran: every occurrence now exists → a re-run creates 0 rows.
    expect(missingOccurrences(desired, first)).toEqual([])
  })

  it('reports only the gap when some occurrences already exist', () => {
    const desired = nextOccurrenceDates(6, 600, 'UTC', '2026-09-12T00:00:00Z', 21)
    // 09-12 and 09-26 already exist; 09-19 and 10-03 are the gaps.
    const existing = [desired[0] as string, desired[2] as string]
    expect(missingOccurrences(desired, existing)).toEqual([desired[1], desired[3]])
  })

  it('compares instants, not strings (PostgREST returns +00:00, the seam returns Z)', () => {
    const desired = nextOccurrenceDates(6, 600, 'UTC', '2026-09-12T00:00:00Z', 21)
    const existing = desired.map((iso) => iso.replace('Z', '+00:00'))
    expect(missingOccurrences(desired, existing)).toEqual([])
  })

  it('ignores an unparseable row rather than treating it as an occurrence', () => {
    expect(missingOccurrences([], ['garbage'])).toEqual([])
    expect(missingOccurrences(['garbage'], [])).toEqual([])
  })
})

describe('the display + payload seams', () => {
  it('labels the host panel line exactly as pinned', () => {
    expect(seriesLineLabel(6, 600)).toBe('Weekly · every Saturday 10 AM')
    expect(seriesLineLabel(0, 570)).toBe('Weekly · every Sunday 9:30 AM')
  })

  it('formats wall-clock labels (on-the-hour drops the ":00")', () => {
    expect(seriesTimeLabel(600)).toBe('10 AM')
    expect(seriesTimeLabel(630)).toBe('10:30 AM')
    expect(seriesTimeLabel(0)).toBe('12 AM')
    expect(seriesTimeLabel(720)).toBe('12 PM')
    expect(seriesTimeLabel(1439)).toBe('11:59 PM')
  })

  it('marks an occurrence with the text ` · weekly` and a one-off with nothing', () => {
    expect(weeklyMetaSuffix('series-1')).toBe(' · weekly')
    expect(weeklyMetaSuffix('')).toBe('')
    expect(weeklyMetaSuffix(null)).toBe('')
    expect(weeklyMetaSuffix(undefined)).toBe('')
  })

  it('omits the series_id key entirely for a standalone post (pre-0028-apply safety)', () => {
    expect(seriesIdField()).toEqual({})
    expect(seriesIdField(null)).toEqual({})
    expect(seriesIdField('')).toEqual({})
    expect('series_id' in seriesIdField(undefined)).toBe(false)
    expect(seriesIdField('series-1')).toEqual({ series_id: 'series-1' })
  })

  it('builds the series row with the pinned columns and no invented zone', () => {
    expect(
      seriesInsertRow('user-1', {
        title: 'Green Lake, Saturdays',
        place: 'Green Lake playground',
        neighborhoodId: 'hood-1',
        weekday: 6,
        startMinutes: 600,
        durationMinutes: 120,
        timezone: '',
      }),
    ).toEqual({
      host_profile_id: 'user-1',
      title: 'Green Lake, Saturdays',
      place: 'Green Lake playground',
      address: null,
      details: null,
      neighborhood_id: 'hood-1',
      weekday: 6,
      start_minutes: 600,
      duration_minutes: 120,
      timezone: 'UTC',
    })
    const full = seriesInsertRow('user-1', {
      title: 't',
      place: 'p',
      address: '7200 4th Ave NE',
      details: 'bring snacks',
      neighborhoodId: 'hood-1',
      weekday: 0,
      startMinutes: 570,
      durationMinutes: 60,
      timezone: 'America/Los_Angeles',
    })
    expect(full).toMatchObject({
      address: '7200 4th Ave NE',
      details: 'bring snacks',
      timezone: 'America/Los_Angeles',
    })
  })
})
