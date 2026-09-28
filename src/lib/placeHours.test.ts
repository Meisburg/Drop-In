import { describe, expect, it } from 'vitest'
import { hoursSourceNote, hoursStatus, isOpenNow, parseHm } from './placeHours'
import type { PlaceWeeklyHours } from './placeHours'

/**
 * V27 — the pure open/closed rule. The cases that matter are the ones a naive
 * `open <= now <= close` comparison gets wrong: overnight intervals, a day the
 * schedule omits (closed) versus a schedule we cannot read (UNKNOWN), and a
 * string that must never be guessed into a status.
 *
 * The dates are constructed in LOCAL time because the rule reads `getDay()`
 * and `getHours()` — the same clock a parent's phone reads.
 */

/** Jan 4 2026 is a Sunday; Jan 5 a Monday; Jan 6 a Tuesday. */
const sunday = (h: number, m = 0) => new Date(2026, 0, 4, h, m)
const monday = (h: number, m = 0) => new Date(2026, 0, 5, h, m)

const daily = (open: string, close: string): PlaceWeeklyHours => ({
  display: `${open} – ${close}`,
  weekly: Object.fromEntries(
    ['0', '1', '2', '3', '4', '5', '6'].map((day) => [day, [[open, close]]]),
  ),
})

describe('parseHm', () => {
  it('accepts 24h times and rejects anything else', () => {
    expect(parseHm('06:00')).toBe(360)
    expect(parseHm('22:30')).toBe(1350)
    expect(parseHm('6:05')).toBe(365)
    expect(parseHm('24:00')).toBeNull()
    expect(parseHm('10:60')).toBeNull()
    expect(parseHm('ten')).toBeNull()
    expect(parseHm(600)).toBeNull()
  })
})

describe('isOpenNow', () => {
  it('returns UNKNOWN (null) for no hours, an empty weekly map, or junk', () => {
    expect(isOpenNow(null, sunday(10))).toBeNull()
    expect(isOpenNow(undefined, sunday(10))).toBeNull()
    expect(isOpenNow({ display: '', weekly: {} }, sunday(10))).toBeNull()
    expect(
      isOpenNow({ display: '', weekly: { '0': [['not-a-time', '22:00']] } }, sunday(10)),
    ).toBeNull()
  })

  it('is open inside a same-day interval and closed outside it', () => {
    const hours = daily('06:00', '22:00')
    expect(isOpenNow(hours, sunday(5, 59))).toBe(false)
    expect(isOpenNow(hours, sunday(6, 0))).toBe(true)
    expect(isOpenNow(hours, sunday(21, 59))).toBe(true)
    expect(isOpenNow(hours, sunday(22, 0))).toBe(false)
  })

  it('handles an overnight interval that wraps midnight', () => {
    const hours: PlaceWeeklyHours = {
      display: '22:00 – 02:00',
      weekly: { '0': [['22:00', '02:00']], '1': [['22:00', '02:00']] },
    }
    expect(isOpenNow(hours, sunday(23, 0))).toBe(true)
    expect(isOpenNow(hours, sunday(1, 0))).toBe(true)
    expect(isOpenNow(hours, sunday(12, 0))).toBe(false)
  })

  it('supports a midday closure as two intervals', () => {
    const hours: PlaceWeeklyHours = {
      display: '10:00 – 14:00, 16:00 – 20:00',
      weekly: { '0': [['10:00', '14:00'], ['16:00', '20:00']] },
    }
    expect(isOpenNow(hours, sunday(12))).toBe(true)
    expect(isOpenNow(hours, sunday(15))).toBe(false)
    expect(isOpenNow(hours, sunday(18))).toBe(true)
  })

  it('treats a weekday the schedule omits as CLOSED, not unknown', () => {
    const hours: PlaceWeeklyHours = {
      display: 'Sundays only',
      weekly: { '0': [['10:00', '16:00']] },
    }
    expect(isOpenNow(hours, sunday(12))).toBe(true)
    expect(isOpenNow(hours, monday(12))).toBe(false)
  })

  it('treats a zero-length interval as closed', () => {
    expect(isOpenNow({ display: '', weekly: { '0': [['10:00', '10:00']] } }, sunday(10))).toBe(
      false,
    )
  })

  it('reads the correct weekday', () => {
    const hours: PlaceWeeklyHours = {
      display: '',
      weekly: { '1': [['09:00', '17:00']] },
    }
    expect(isOpenNow(hours, monday(10))).toBe(true)
    expect(isOpenNow(hours, sunday(10))).toBe(false)
  })
})

describe('hoursStatus', () => {
  it('maps the boolean to a label and passes UNKNOWN through', () => {
    expect(hoursStatus(daily('06:00', '22:00'), sunday(12))).toBe('open')
    expect(hoursStatus(daily('06:00', '22:00'), sunday(3))).toBe('closed')
    expect(hoursStatus(null, sunday(12))).toBeNull()
  })
})

describe('hoursSourceNote', () => {
  it('qualifies only the citywide default', () => {
    expect(hoursSourceNote('city_default')).toBe('typical hours')
    expect(hoursSourceNote('osm')).toBeNull()
    expect(hoursSourceNote(null)).toBeNull()
  })
})
