/**
 * V27 — "is this place open right now?", as a PURE rule.
 *
 * THE FOUNDER'S PRIORITY LIST for a place card: *"is it open? … is it indoor or
 * outdoor? … how other parents have reviewed it … and how close it is to me.
 * Those are the prominent things."* Indoor/outdoor, distance and stars come from
 * data the directory already has; open/closed does not exist anywhere, so
 * migration 0056 adds `places.hours` and this module is the one place that
 * decides what it MEANS.
 *
 * WHY THE DECISION IS NORMALIZED AND NOT A PARSER. The OSM `opening_hours`
 * grammar (month ranges, "PH closed", quoted comments) is hard enough that the
 * research memo advised a real parser over regex, and shipping that parser in
 * the app bundle for a card label would be the wrong trade. So the grammar is
 * handled ONCE at backfill time (a script, with the `opening_hours` package),
 * stored as a normalized weekly map, and this module only ever evaluates simple
 * `[open, close]` intervals. A string the backfill could not normalize is simply
 * not written — the row stays NULL.
 *
 * THE SHAPE (migration 0056's `places.hours`):
 *
 *   { display: '6:00 AM – 10:00 PM',
 *     weekly: { '0': [['06:00','22:00']], '1': [['06:00','22:00']], ... } }
 *
 * keyed by JS `Date.getDay()` (0 = Sunday). Each day is a LIST of intervals, so
 * a midday-closed library ("10:00-14:00, 16:00-20:00") is expressible.
 *
 * HONEST-UNKNOWN RULE (the module's standing convention, the same one
 * `upcomingCount` and `displayAverage` follow): anything this module cannot
 * understand returns `null` — unknown — never `false`. "We do not know" and
 * "it is closed" are different statements, and only one of them is safe to make
 * from an unparseable schedule. The card renders NO chip for `null`.
 */

/** A normalized weekly schedule, as stored in `places.hours`. */
export interface PlaceWeeklyHours {
  /** The human string shown beside the status, e.g. "6:00 AM – 10:00 PM". */
  display: string
  /** `[open, close]` 24h "HH:MM" pairs, keyed by `getDay()` (0 = Sunday). */
  weekly: Record<string, string[][]>
}

/** Where a row's hours came from. Mirrors the `places.hours_source` values. */
export type PlaceHoursSource = 'osm' | 'city_default'

/** "HH:MM" (24h) → minutes since midnight, or null when it is not a valid time. */
export function parseHm(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (match === null) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/**
 * Is the place open at `now`?
 *
 * `true` / `false` are a real answer from a well-formed schedule; `null` is
 * UNKNOWN (no hours, an empty weekly map, or a day whose intervals are all
 * unparseable). A day the schedule OMITS is CLOSED (`false`), because a real
 * weekly schedule that lists some days and not others is stating those days are
 * closed — that is different from a schedule we cannot read at all.
 *
 * Overnight intervals are handled: when `close <= open` the interval wraps
 * midnight ("22:00-02:00" is open at 23:00 and at 01:00). A zero-length
 * interval (`close === open`) is treated as closed rather than as all-day.
 */
export function isOpenNow(
  hours: PlaceWeeklyHours | null | undefined,
  now: Date,
): boolean | null {
  if (hours === null || hours === undefined) return null
  const weekly = hours.weekly
  if (weekly === null || typeof weekly !== 'object') return null
  const keys = Object.keys(weekly)
  if (keys.length === 0) return null

  const intervals = weekly[String(now.getDay())]
  if (intervals === undefined) return false
  if (!Array.isArray(intervals) || intervals.length === 0) return false

  const minutes = now.getHours() * 60 + now.getMinutes()
  let parsedAny = false
  for (const pair of intervals) {
    if (!Array.isArray(pair) || pair.length < 2) continue
    const open = parseHm(pair[0])
    const close = parseHm(pair[1])
    if (open === null || close === null) continue
    parsedAny = true
    if (close > open) {
      if (minutes >= open && minutes < close) return true
    } else if (close < open) {
      // Wraps midnight.
      if (minutes >= open || minutes < close) return true
    }
    // close === open: a zero-length interval is closed; keep checking the rest.
  }
  return parsedAny ? false : null
}

/** `'open' | 'closed'`, or null when the schedule is unknown. */
export function hoursStatus(
  hours: PlaceWeeklyHours | null | undefined,
  now: Date,
): 'open' | 'closed' | null {
  const open = isOpenNow(hours, now)
  if (open === null) return null
  return open ? 'open' : 'closed'
}

/**
 * The qualifier for a chip sourced from a citywide default rather than a real
 * per-venue schedule. The founder's ask was an honest "is it open?", and a
 * default is not a schedule — so the card says so where the two could be
 * confused. A real OSM schedule needs no qualifier.
 */
export function hoursSourceNote(source: PlaceHoursSource | null | undefined): string | null {
  return source === 'city_default' ? 'typical hours' : null
}
