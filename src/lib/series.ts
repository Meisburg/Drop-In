/**
 * V8 ticket 06 — standing playdates (the weekly series): the PURE seams
 * (migration 0028). No imports, no I/O, no globals beyond `Intl` — the
 * `/new` form, the card, the detail page and the e2e spec all evaluate the
 * SAME rules through this module, and `series.test.ts` is the guarantee.
 *
 * The pinned model (ticket 06, "occurrences are real playdates rows"):
 *
 * - A series stores `weekday` + `start_minutes` (the LOCAL WALL CLOCK) + an
 *   IANA `timezone`, never a UTC instant. Storing an instant would drift an
 *   hour at a DST transition and silently move everyone's meetup: a 10:00 AM
 *   Saturday series must stay 10:00 AM in March and in November. The SQL
 *   generator computes the same thing as
 *   `((d::timestamp + make_interval(mins => start_minutes)) at time zone
 *   timezone)`; `nextOccurrenceDates` is its client-side twin (two-pass
 *   zone-offset resolution over `Intl`).
 *
 * - The horizon is 21 days (a generous but bounded window): the generator
 *   never plans a year of Saturdays. Re-running it is a no-op — the DB's
 *   `unique (series_id, starts_at)` + `on conflict do nothing` is the wall,
 *   and `missingOccurrences` is the pure mirror of that rule (unit-tested:
 *   feeding a full set back in yields nothing).
 *
 * - The marker that a post repeats is TEXT appended to the existing meta line
 *   (` · weekly`), NOT a new badge: the badge slot already carries
 *   status / ended / happening-now / starts-soon / rain.
 */

/** The generator's horizon in days (pinned: 21 days ahead). */
export const SERIES_HORIZON_DAYS = 21

/**
 * The generator's hard cap on a CALLER-SUPPLIED horizon. The 21-day pin is
 * the product rule; this is the work bound (the DB applies the same clamp),
 * so a bug or a curious caller can never ask for years of rows in one call.
 */
export const SERIES_HORIZON_MAX_DAYS = 60

/** The fallback zone when the device reports none (the pinned 'UTC' pin). */
export const SERIES_FALLBACK_TIMEZONE = 'UTC'

/** The one marker that says a post repeats — text, never a badge. */
export const WEEKLY_MARKER = ' · weekly'

/** Sunday-first weekday names (indices match Postgres `extract(dow)`). */
export const SERIES_WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/**
 * The /new form's weekly input (the values the series row is built from).
 * The page passes the form's own values plus the resolved timezone; the DB
 * column names are applied in `seriesInsertRow`.
 */
export interface NewPlaydateSeriesInput {
  title: string
  place: string
  /** <=120 chars, trimmed by the form; undefined = none. */
  address?: string
  details?: string
  neighborhoodId: string
  /** 0 = Sunday … 6 = Saturday (derived from the chosen start date). */
  weekday: number
  /** Minutes past local midnight (the form's 30-minute grid; NOT a UTC instant). */
  startMinutes: number
  durationMinutes: number
  /** IANA zone name, captured in the browser (see deviceTimeZone). */
  timezone: string
}

// ---------------------------------------------------------------------------
// The timezone seam
// ---------------------------------------------------------------------------

/**
 * An IANA zone name, or 'UTC' when the device gave us nothing usable. The
 * value is stored verbatim on the series row, so this never invents a zone —
 * it only closes the empty/whitespace hole (the pinned fallback).
 */
export function resolveTimeZone(timeZone: string | null | undefined): string {
  const trimmed = typeof timeZone === 'string' ? timeZone.trim() : ''
  return trimmed === '' ? SERIES_FALLBACK_TIMEZONE : trimmed
}

/**
 * The device's IANA timezone, captured at series creation
 * (`Intl.DateTimeFormat().resolvedOptions().timeZone`), falling back to
 * 'UTC' when the API is missing or reports nothing. This is the ONLY place
 * the series learns what "10:00 AM" means for this host.
 */
export function deviceTimeZone(): string {
  try {
    return resolveTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return SERIES_FALLBACK_TIMEZONE
  }
}

/** `Intl.DateTimeFormat` instances are expensive — one per zone, reused. */
const zoneFormatters = new Map<string, Intl.DateTimeFormat>()

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = zoneFormatters.get(timeZone)
  if (cached !== undefined) return cached
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  zoneFormatters.set(timeZone, formatter)
  return formatter
}

/**
 * The zone's UTC offset (ms) at one instant, read off `Intl`. A zone name
 * `Intl` does not know yields 0 — the documented last-resort UTC reading:
 * a bad stored zone must degrade, never throw inside a render.
 */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const wholeSecond = Math.floor(instantMs / 1000) * 1000
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = zoneFormatter(timeZone).formatToParts(new Date(wholeSecond))
  } catch {
    return 0
  }
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type)
    return part === undefined ? 0 : Number(part.value)
  }
  const asUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour'),
    read('minute'),
    read('second'),
  )
  return asUtc - wholeSecond
}

/**
 * The UTC instant for a WALL CLOCK reading (a calendar date + minutes past
 * local midnight) in `timeZone` — the pure twin of Postgres's
 * `(timestamp at time zone zone)`.
 *
 * Two passes: guess the offset at the naive instant, correct, then re-read
 * the offset at the corrected instant (the second pass is what makes a DST
 * boundary land right — the offset on the far side of the transition is the
 * one that applies).
 *
 * The spring-forward GAP (a local time that does not exist, e.g. 2:30 AM on
 * the transition day) is not a state the product can reach: occurrences are
 * on the series' own 30-minute grid and the pinned case is a mid-morning
 * meetup. Postgres resolves that gap in the same way (forward), so parity
 * holds for every time that exists.
 */
export function zonedWallClockToIso(
  year: number,
  month: number,
  day: number,
  minutes: number,
  timeZone: string,
): string {
  const zone = resolveTimeZone(timeZone)
  const naiveUtc = Date.UTC(year, month - 1, day) + minutes * 60_000
  const guessed = naiveUtc - zoneOffsetMs(naiveUtc, zone)
  const correctedOffset = zoneOffsetMs(guessed, zone)
  const instant = correctedOffset === zoneOffsetMs(naiveUtc, zone) ? guessed : naiveUtc - correctedOffset
  return new Date(instant).toISOString()
}

// ---------------------------------------------------------------------------
// The weekday + label seams
// ---------------------------------------------------------------------------

/**
 * A `YYYY-MM-DD` date-input value → 0 (Sunday) … 6 (Saturday), or null when
 * the field is empty/unparseable (the form's date can be cleared — a render
 * must never throw on it).
 *
 * The parts are read EXPLICITLY as a local calendar date rather than through
 * `Date.parse('2026-09-12')` (which is UTC midnight and would report the
 * previous day's weekday west of UTC — the classic off-by-one-day bug in the
 * one place it would silently move the meetup).
 */
export function weekdayFromDateIso(dateIso: string | null | undefined): number | null {
  if (typeof dateIso !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso.trim())
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(year, month - 1, day)
  // Reject a roll-over (2026-02-31 → Mar 3): no such date is ever a weekday.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date.getDay()
}

/** 0..6 → "Saturday" (out-of-range values wrap, so callers never crash). */
export function seriesWeekdayName(weekday: number): string {
  const index = ((Math.trunc(weekday) % 7) + 7) % 7
  return SERIES_WEEKDAY_NAMES[index]
}

/**
 * The weekday said back in words: "every Saturday" ('' when no date is
 * chosen yet — the /new control renders its hint line only when this has
 * something to say). Derived from the chosen start date, never typed.
 */
export function everyWeekdayLabel(weekday: number | null): string {
  return weekday === null ? '' : `every ${seriesWeekdayName(weekday)}`
}

/** "10 AM" / "10:30 AM" — the wall-clock label (on-the-hour drops ":00"). */
export function seriesTimeLabel(minutes: number): string {
  const dayMinutes = 24 * 60
  const wrapped = ((Math.trunc(minutes) % dayMinutes) + dayMinutes) % dayMinutes
  const hour24 = Math.floor(wrapped / 60)
  const minute = wrapped % 60
  const meridiem = hour24 < 12 ? 'AM' : 'PM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return minute === 0
    ? `${hour12} ${meridiem}`
    : `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`
}

/**
 * The host panel's series line — the pinned copy shape: "Weekly · every
 * Saturday 10 AM" (the weekday in words + the wall clock, so the host reads
 * back the rule, not a timestamp).
 */
export function seriesLineLabel(weekday: number, startMinutes: number): string {
  return `Weekly · ${everyWeekdayLabel(weekday)} ${seriesTimeLabel(startMinutes)}`
}

/**
 * The meta line's weekly marker: ` · weekly` for an occurrence (a post whose
 * series_id is set), '' for a one-off. Appended to the EXISTING meta line as
 * text — the badge slot stays as it is (the no-new-badge pin).
 */
export function weeklyMetaSuffix(seriesId: string | null | undefined): string {
  return typeof seriesId === 'string' && seriesId !== '' ? WEEKLY_MARKER : ''
}

/**
 * The playdates insert's series key. A standalone post gets an EMPTY object,
 * so the `series_id` key is absent from the payload entirely: pre-0028-apply
 * every existing post path stays byte-identical (the 0021 address lesson —
 * omit the missing column rather than sending it as null).
 */
export function seriesIdField(seriesId?: string | null): { series_id?: string } {
  if (typeof seriesId !== 'string' || seriesId === '') return {}
  return { series_id: seriesId }
}

/**
 * The new series row (the pinned column set). `timezone` goes through
 * `resolveTimeZone` so a missing device zone stores 'UTC' rather than ''.
 */
export function seriesInsertRow(
  hostProfileId: string,
  input: NewPlaydateSeriesInput,
): Record<string, unknown> {
  return {
    host_profile_id: hostProfileId,
    title: input.title,
    place: input.place,
    address: input.address ?? null,
    details: input.details ?? null,
    neighborhood_id: input.neighborhoodId,
    weekday: input.weekday,
    start_minutes: input.startMinutes,
    duration_minutes: input.durationMinutes,
    timezone: resolveTimeZone(input.timezone),
  }
}

// ---------------------------------------------------------------------------
// The occurrence seam
// ---------------------------------------------------------------------------

/** A calendar date as its UTC-noon-safe parts (pure calendar arithmetic). */
function shiftCalendarDay(
  year: number,
  month: number,
  day: number,
  offsetDays: number,
): { year: number; month: number; day: number; weekday: number } {
  const shifted = new Date(Date.UTC(year, month - 1, day) + offsetDays * 86_400_000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  }
}

/** The calendar date (in `timeZone`) of an instant — the series' local "today". */
function localDateInZone(
  fromIso: string,
  timeZone: string,
): { year: number; month: number; day: number } {
  const instant = Date.parse(fromIso)
  const offset = zoneOffsetMs(instant, resolveTimeZone(timeZone))
  const shifted = new Date(instant + offset)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

/**
 * The occurrences a series should have: every date matching `weekday` from
 * `fromIso`'s LOCAL date (in `timezone`) through `horizonDays` later, whose
 * wall-clock start (`startMinutes`) is still in the future — as UTC ISO
 * instants, ascending.
 *
 * This is the client-side twin of `ensure_series_occurrences`' date set:
 * same horizon, same "future only" rule (`starts_at > now()`), same
 * wall-clock-in-zone arithmetic. The unit tests pin it against the
 * `America/Los_Angeles` March and November DST transitions.
 *
 * A horizon is always clamped to [1, SERIES_HORIZON_MAX_DAYS] (the DB does
 * the same), so a bad value bounds the work instead of exploding it.
 */
export function nextOccurrenceDates(
  weekday: number,
  startMinutes: number,
  timezone: string,
  fromIso: string,
  horizonDays: number = SERIES_HORIZON_DAYS,
): string[] {
  const zone = resolveTimeZone(timezone)
  const horizon = Math.min(
    Math.max(Math.trunc(Number.isFinite(horizonDays) ? horizonDays : SERIES_HORIZON_DAYS), 1),
    SERIES_HORIZON_MAX_DAYS,
  )
  const fromMs = Date.parse(fromIso)
  if (!Number.isFinite(fromMs)) return []
  const today = localDateInZone(fromIso, zone)
  const target = ((Math.trunc(weekday) % 7) + 7) % 7
  const dates: string[] = []
  for (let offset = 0; offset <= horizon; offset++) {
    const day = shiftCalendarDay(today.year, today.month, today.day, offset)
    if (day.weekday !== target) continue
    const instant = zonedWallClockToIso(day.year, day.month, day.day, startMinutes, zone)
    // Only FUTURE occurrences (the DB's `where starts_at > now()`): a
    // Saturday that already started today is not generated again.
    if (Date.parse(instant) > fromMs) dates.push(instant)
  }
  return dates
}

/**
 * Which of `desired` are missing from `existing` — the pure mirror of the
 * generator's `on conflict (series_id, starts_at) do nothing`. Feeding a
 * complete set back in yields []: that is the no-duplicate guarantee the
 * unit test asserts (the DB's unique index is the wall behind it).
 *
 * Comparison is on the INSTANT, not the string: the same moment written as
 * `...Z` and `...+00:00` (PostgREST's own format) must not look like two
 * different occurrences.
 */
export function missingOccurrences(
  desired: ReadonlyArray<string>,
  existing: ReadonlyArray<string>,
): string[] {
  const seen = new Set<number>()
  for (const iso of existing) {
    const ms = Date.parse(iso)
    if (Number.isFinite(ms)) seen.add(ms)
  }
  const missing: string[] = []
  for (const iso of desired) {
    const ms = Date.parse(iso)
    if (!Number.isFinite(ms) || seen.has(ms)) continue
    seen.add(ms)
    missing.push(iso)
  }
  return missing
}
