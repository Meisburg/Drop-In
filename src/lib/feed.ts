/**
 * Pure, unit-testable feed + posting logic (slice 3).
 *
 * Everything in here is free of React/Supabase so it can be tested without
 * a database or browser (see feed.test.ts). The Supabase-facing wrappers
 * live in db.ts and call these helpers. The one exception is
 * queryUpcomingFeedWithClient (slice 5): the raw feed query itself takes
 * the Supabase client as a parameter (mocked in feed.test.ts — the same
 * injected-client pattern as trust.togglePingWithClient) so the DB-level
 * filter chain is unit-testable.
 *
 * V3 slice 10 (ticket 05): the guest-list seams (resolveGuestListVisibility, formatGuestLine).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DuplicatePrefill } from './types'

/**
 * Client-local midnight of today as an ISO string.
 *
 * V1 "today" boundary: the device's local timezone is the whole story —
 * there is no GPS or per-user timezone setting, so the feed's day starts at
 * local 00:00 on the viewer's clock. (Pinned integration decision, slice 3.)
 */
export function startOfTodayIso(now: Date = new Date()): string {
  const local = new Date(now)
  local.setHours(0, 0, 0, 0)
  return local.toISOString()
}

/**
 * A seeded zip coordinate (V2 slice 3, the zip_codes table): the plain
 * haversine math needs only the lat/lng pair (no PostGIS — pinned).
 */
export interface ZipCoords {
  lat: number
  lng: number
}

/**
 * The viewer side of the radius filter (V2 slice 3): their home zip + the
 * radius they chose. `homeZip` null = not set (the onboarding gate keeps
 * that state out of the feed; the filter itself treats it as "no posts").
 */
export interface RadiusViewer {
  homeZip: string | null
  radiusMiles: number
}

/** The radius options (pinned in plan-v2 Interfaces: 2/5/10/20/35). */
export const RADIUS_MILES_OPTIONS = [2, 5, 10, 20, 35] as const

/** The default radius (pinned: 5 miles). */
export const DEFAULT_RADIUS_MILES = 5

/** The DB backstop bounds (migration 0012 CHECK: between 2 and 35). */
export const RADIUS_MIN_MILES = 2
export const RADIUS_MAX_MILES = 35

/**
 * The haversine distance in miles between two lat/lng points (plain math,
 * no PostGIS — the pinned radius contract). Pure + unit-tested: this is
 * THE distance predicate of the radius feed (AC "pure distance predicate
 * unit-tested"), mirrored by the card label and the within-radius filter.
 */
export function haversineMiles(a: ZipCoords, b: ZipCoords): number {
  const R = 3958.8 // Earth radius, miles
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * The within-radius predicate: a post's host is reachable when the
 * haversine distance is at most the viewer's radius (boundary inclusive).
 */
export function withinRadius(miles: number, radiusMiles: number): boolean {
  return miles <= radiusMiles
}

/**
 * The card distance label (pinned: integer miles, e.g. "4 mi").
 */
export function formatDistanceLabel(miles: number): string {
  return `${Math.round(miles)} mi`
}

/**
 * The distance, in miles, between the viewer's home zip and a post host's
 * home zip, looked up in the seeded zip map. Null when either side is
 * unresolvable (home zip unset, or the zip missing from the gazetteer) —
 * the pinned rule: such a post is EXCLUDED from the radius feed, never
 * given invented coordinates.
 */
export function hostDistanceMiles(
  hostZip: string | null | undefined,
  viewer: RadiusViewer,
  zipCoords: ReadonlyMap<string, ZipCoords>,
): number | null {
  if (hostZip === null || hostZip === undefined || viewer.homeZip === null) return null
  const host = zipCoords.get(hostZip)
  const viewerCoords = zipCoords.get(viewer.homeZip)
  if (host === undefined || viewerCoords === undefined) return null
  return haversineMiles(viewerCoords, host)
}

/**
 * Validate a home-zip entry (V2 slice 3): the shape is a 5-digit code and
 * it must exist in the seeded gazetteer (zip_codes) — unknown zips show an
 * inline error rather than saving. Pure + unit-tested.
 */
export function validateHomeZip(zip: string, knownZips: ReadonlySet<string>): string | null {
  const trimmed = zip.trim()
  if (trimmed.length === 0) return 'Add your home zip.'
  if (!/^\d{5}$/.test(trimmed)) return 'Use a 5-digit zip code.'
  if (!knownZips.has(trimmed)) return 'We don’t cover that zip yet — try one we serve.'
  return null
}

/** Validate a radius choice (pinned options 2/5/10/20/35; DB CHECK 2–35). */
export function validateRadiusMiles(radiusMiles: number): string | null {
  if (
    !Number.isInteger(radiusMiles) ||
    radiusMiles < RADIUS_MIN_MILES ||
    radiusMiles > RADIUS_MAX_MILES
  ) {
    return 'Pick a radius between 2 and 35 miles.'
  }
  return null
}

/**
 * A drop-in is "happening now" when starts_at <= now <= ends_at
 * (boundaries inclusive).
 */
export function isHappeningNow(
  playdate: { starts_at: string; ends_at: string },
  nowIso: string,
): boolean {
  const now = Date.parse(nowIso)
  const start = Date.parse(playdate.starts_at)
  const end = Date.parse(playdate.ends_at)
  return start <= now && now <= end
}

/** Fixed English weekday + month tables (the day labels are locale-independent). */
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/**
 * The local calendar day key (YYYY-MM-DD in the device's timezone) of an
 * ISO instant (V3 ticket 01: the key the feed's day sections group on).
 */
export function localDayKey(iso: string): string {
  const d = new Date(iso)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/**
 * The day section header label (V3 ticket 01): "Today" when startIso falls
 * on the same local calendar day as nowIso, "Tomorrow" when it falls on the
 * NEXT local day, otherwise a locale-independent "Sat, Sep 12" label
 * (short weekday + short month + day, from the fixed English tables above —
 * the device locale is never consulted, so the label is stable across
 * machines, test runs, and screenshots).
 */
export function formatDayLabel(startIso: string, nowIso: string): string {
  const start = new Date(startIso)
  const key = localDayKey(startIso)
  if (key === localDayKey(nowIso)) return 'Today'
  const tomorrow = new Date(nowIso)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (key === localDayKey(tomorrow.toISOString())) return 'Tomorrow'
  return `${WEEKDAYS_SHORT[start.getDay()]}, ${MONTHS_SHORT[start.getMonth()]} ${start.getDate()}`
}

/**
 * A post is ended when ends_at <= nowIso (V3 ticket 01: the feed's Today
 * section demotes ended events behind the upcoming ones and the card grays
 * them).
 */
export function isEnded(post: { ends_at: string }, nowIso: string): boolean {
  return Date.parse(post.ends_at) <= Date.parse(nowIso)
}

/**
 * A post starts soon when it has not started yet and starts within the
 * next 60 minutes: nowIso < starts_at <= nowIso + 60 min (V3 ticket 01 —
 * the "Starts soon" badge window). An already-started post is NOT "soon"
 * (it is "happening now" instead).
 */
export function isStartingSoon(post: { starts_at: string }, nowIso: string): boolean {
  const now = Date.parse(nowIso)
  const start = Date.parse(post.starts_at)
  return now < start && start <= now + 60 * 60_000
}

/** One local calendar day's group of posts (V3 ticket 01). */
export interface DayGroup<T> {
  key: string
  label: string
  posts: T[]
}

/**
 * Group posts by local calendar day (V3 ticket 01 — promoted from
 * BrowsePage's page-local groupByDay; this is the single implementation).
 * Days appear in the order their FIRST post appears, so the canonical
 * starts_at-ascending feed input yields ascending start-of-day groups.
 * Labels come from formatDayLabel; the nowIso seam is the same as
 * filterFeed's. Within a group, posts keep their input order.
 */
export function groupByDay<T extends { starts_at: string }>(
  posts: T[],
  nowIso: string,
): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>()
  for (const post of posts) {
    const key = localDayKey(post.starts_at)
    const group = groups.get(key)
    if (group === undefined) {
      groups.set(key, { key, label: formatDayLabel(post.starts_at, nowIso), posts: [post] })
    } else {
      group.posts.push(post)
    }
  }
  return [...groups.values()]
}

/**
 * The shape filterFeed needs (Playdate and its joined variants qualify).
 */
export interface FeedPost {
  host_profile_id: string
  starts_at: string
  /** Set when a moderator has hidden the post (slice 5, migration 0009). */
  hidden_at?: string | null
  /** The host's location fields (V2 slice 3 — present on the joined host). */
  host?: { home_zip?: string | null }
}

/** A post is hidden when a moderator has set hidden_at (slice 5). */
export function isHiddenPost(post: { hidden_at?: string | null }): boolean {
  return post.hidden_at != null
}

/**
 * Filter posts down to the viewer's radius feed (V2 slice 3): starting
 * today or later (client-local midnight), not hosted by a blocked profile,
 * not hidden by a moderator (hidden_at set), AND hosted by a family within
 * the viewer's radius (haversine via the seeded zip map) — ordered by
 * starts_at ascending.
 *
 * Neighborhoods left the filter path in slice 3 (they are display labels
 * only); discovery is distance-based. A post whose host has no home zip, or
 * whose zip is missing from the gazetteer, is EXCLUDED (the pinned rule —
 * coordinates are never invented).
 *
 * The DB query (queryUpcomingFeedWithClient) applies the time + hidden +
 * block filters; this pure re-filter is the unit-testable guarantee that a
 * blocked host's post, a hidden post, a past post, and a beyond-radius
 * post can never reach the feed, plus the canonical ordering.
 *
 * `nowIso` is part of the pinned signature (it drives the "happening now"
 * badge in the UI); the filter itself only needs the start-of-today cutoff,
 * so it is intentionally unused here.
 */
export function filterFeed<T extends FeedPost>(
  posts: T[],
  viewer: RadiusViewer,
  zipCoords: ReadonlyMap<string, ZipCoords>,
  blockedHostIds: ReadonlySet<string>,
  startOfTodayIso: string,
  nowIso: string,
): T[] {
  void nowIso
  const todayStart = Date.parse(startOfTodayIso)
  return posts
    .filter((post) => {
      const distance = hostDistanceMiles(post.host?.home_zip, viewer, zipCoords)
      return (
        distance !== null &&
        withinRadius(distance, viewer.radiusMiles) &&
        !blockedHostIds.has(post.host_profile_id) &&
        !isHiddenPost(post) &&
        Date.parse(post.starts_at) >= todayStart
      )
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
}

/**
 * The raw DB feed query, against an injected Supabase client (mockable —
 * the same pattern as trust.togglePingWithClient / auth.hasActiveSession).
 * Upcoming playdates (starts_at >= cutoff, ordered by starts_at) with the
 * DB-level filters applied:
 * - .is('hidden_at', null) — hidden posts vanish from the feed for
 *   everyone (slice 5; the pure filterFeed re-filter is the defense in
 *   depth, unit-tested)
 * - .not() on blocked hosts — only when the viewer actually has blocks (an
 *   empty .in() would match nothing; slice 3)
 *
 * V2 slice 3: the neighborhood filter is GONE (distance-based discovery) —
 * the query fetches all upcoming posts and the pure radius filter decides.
 * Every embed path pins its FK hint (PGRST201 lesson): the host embed is
 * pinned to `playdates_host_profile_id_fkey` (commit 80f9b07) and now also
 * carries the host's home_zip + radius_miles — the radius filter's inputs.
 * The zip coordinates themselves are a separate tiny fetch (zip_codes, the
 * seeded gazetteer) because home_zip is a plain text column, not an FK.
 *
 * The result rows keep their loose (untyped) shape; db.ts casts them to
 * PlaydateWithNeighborhood (same pattern as listMemberships).
 */
export async function queryUpcomingFeedWithClient(
  client: SupabaseClient,
  cutoffIso: string,
  blockedHostIds: string[],
): Promise<unknown[]> {
  let query = client
    .from('playdates')
    .select(
      '*, neighborhood:neighborhoods!inner ( id, name ), host:profiles!playdates_host_profile_id_fkey ( id, display_name, avatar_url, home_zip, radius_miles )',
    )
    .gte('starts_at', cutoffIso)
    .order('starts_at', { ascending: true })
    .is('hidden_at', null)
  if (blockedHostIds.length > 0) {
    query = query.not('host_profile_id', 'in', blockedHostIds.join(','))
  }
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown[]
}

/**
 * The /new form's field values (V2 slice 1: the two datetime-local pickers
 * became a date picker + a 30-minute-stepper start time + duration chips —
 * the end time is always computed from start + duration, never typed;
 * pinned contract in plan-v2.md Interfaces).
 */
export interface PlaydateFormValues {
  title: string
  place: string
  neighborhoodId: string
  /** <input type="date"> value, e.g. "2026-09-04" (the device's local date). */
  startDate: string
  /** Start time as minutes since local midnight, on the 30-minute grid (0–1410). */
  startMinutes: number
  /**
   * Duration in minutes — one of PLAYDATE_DURATIONS_MINUTES. 0 = none picked
   * yet (the chips always produce a valid value; the validator still guards
   * the pure boundary).
   */
  durationMinutes: number
  /** Optional, e.g. "best for 2-5" (advisory only). */
  ageHint: string
  details: string
}

/** Per-field errors for the /new form (a field key absent = valid). */
export type PlaydateFormErrors = Partial<Record<keyof PlaydateFormValues, string>>

/** The duration chips (minutes): 1h / 1.5h / 2h / 3h (pinned, V2 slice 1). */
export const PLAYDATE_DURATIONS_MINUTES = [60, 90, 120, 180] as const

/** One step of the start-time stepper (pinned: 30-minute increments). */
export const TIME_STEP_MINUTES = 30

/**
 * Validate the /new drop-in form (pinned rules: title required + ≤ 80
 * characters after trim; place required; neighborhood required; start date
 * required; the start time sits on the 30-minute grid; the duration is one
 * of the chips; age_hint / details optional). The end time never needs a
 * check — it is computed (start + duration > start always, since every chip
 * duration is positive).
 */
export function validatePlaydateForm(values: PlaydateFormValues): PlaydateFormErrors {
  const errors: PlaydateFormErrors = {}
  const title = values.title.trim()
  if (title.length === 0) {
    errors.title = 'Give your drop-in a short title.'
  } else if (title.length > 80) {
    errors.title = 'Keep the title to 80 characters.'
  }
  if (values.place.trim().length === 0) {
    errors.place = 'Add a place (park, lot, field).'
  }
  if (values.neighborhoodId.length === 0) {
    errors.neighborhoodId = 'Pick a neighborhood.'
  }
  if (values.startDate.length === 0) {
    errors.startDate = 'Pick a start date.'
  } else if (Number.isNaN(Date.parse(values.startDate))) {
    errors.startDate = 'That start date does not look right.'
  }
  if (!isSteppedTime(values.startMinutes)) {
    errors.startMinutes = 'Pick a start time.'
  }
  if (!isDuration(values.durationMinutes)) {
    errors.durationMinutes = 'Pick a duration.'
  }
  return errors
}

/** True when `minutes` is a valid start time: on the 30-minute grid, one day. */
export function isSteppedTime(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= 0 &&
    minutes < 24 * 60 &&
    minutes % TIME_STEP_MINUTES === 0
  )
}

/** True when `minutes` is one of the duration chips. */
export function isDuration(minutes: number): boolean {
  return (PLAYDATE_DURATIONS_MINUTES as readonly number[]).includes(minutes)
}

/**
 * Step a start time (minutes since local midnight) by `deltaMinutes`
 * (±30), wrapping at midnight: 11:30 PM + 30 = 12:00 AM, 12:00 AM − 30 =
 * 11:30 PM. The stepper is the only UI entry for the time, so the 30-minute
 * grid is preserved for on-grid inputs.
 */
export function stepTimeMinutes(currentMinutes: number, deltaMinutes: number): number {
  const dayMinutes = 24 * 60
  return (currentMinutes + deltaMinutes + dayMinutes) % dayMinutes
}

/** "3:30 PM" from minutes since local midnight (12-hour, wraps past midnight). */
export function formatTimeLabel(minutes: number): string {
  const dayMinutes = 24 * 60
  const wrapped = ((minutes % dayMinutes) + dayMinutes) % dayMinutes
  const hour24 = Math.floor(wrapped / 60)
  const minute = wrapped % 60
  const meridiem = hour24 < 12 ? 'AM' : 'PM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`
}

/** The chip label for a duration in minutes (60 → "1h", 90 → "1.5h"). */
export function durationLabel(minutes: number): string {
  return `${minutes / 60}h`
}

/**
 * The start's UTC ISO instant for a local calendar date + minutes since
 * local midnight. `startDate` is the device's local date (the date input's
 * value); the stored timestamptz must be the local moment the parent meant,
 * whatever their timezone.
 */
export function computeStartIso(startDate: string, startMinutes: number): string {
  return new Date(Date.parse(`${startDate}T00:00:00`) + startMinutes * 60_000).toISOString()
}

/**
 * The end's UTC ISO instant (start + duration). Rolls into the next day
 * when the window passes midnight (11:30 PM + 3h = 2:30 AM) — that is
 * expected, never clamped. Pinned: the end is computed, never typed.
 */
export function computeEndIso(
  startDate: string,
  startMinutes: number,
  durationMinutes: number,
): string {
  return new Date(
    Date.parse(`${startDate}T00:00:00`) + (startMinutes + durationMinutes) * 60_000,
  ).toISOString()
}

/**
 * The caller's own posts, newest first (the /profile duplicate entry, V2
 * slice 1), against an injected client (the same pattern as
 * queryUpcomingFeedWithClient). The playdates SELECT policy is open to any
 * authenticated user, so the host's own rows come back directly. Rows keep
 * their loose shape; the caller (ProfilePage) casts to Playdate.
 */
export async function queryMyPlaydatesWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<unknown[]> {
  const { data, error } = await client
    .from('playdates')
    .select('id, host_profile_id, title, place, neighborhood_id, starts_at, ends_at, age_hint, details')
    .eq('host_profile_id', profileId)
    .order('starts_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown[]
}

/**
 * Everything from a post worth carrying into a duplicate — everything
 * EXCEPT the date/time: the start date, start time, and duration are always
 * re-entered (pinned: the end is computed, never typed). The duplicate
 * navigates to /new with this as router state.
 */
export function toDuplicatePrefill(post: {
  title: string
  place: string
  neighborhood_id: string
  age_hint: string | null
  details: string | null
}): DuplicatePrefill {
  return {
    title: post.title,
    place: post.place,
    neighborhoodId: post.neighborhood_id,
    ageHint: post.age_hint ?? '',
    details: post.details ?? '',
  }
}

// ---------------------------------------------------------------------------
// V3 slice 2 (ticket 02): host status + the Open-Meteo rain badge.

/** The "Rain likely" threshold (orchestrator pin): >= 50% daily precipitation probability. */
export const RAIN_BADGE_THRESHOLD = 50

/**
 * The "Rain likely" badge label (V3 slice 2, ticket 02): the pure
 * threshold decision — a daily precipitation probability of at least
 * RAIN_BADGE_THRESHOLD (50) shows "Rain likely"; anything below, or a
 * missing probability (null — a failed or out-of-range fetch), shows
 * nothing (null: the badge is silently absent, no error state — the
 * zero-pressure soul).
 */
export function rainBadgeLabel(probability: number | null): string | null {
  if (probability === null) return null
  return probability >= RAIN_BADGE_THRESHOLD ? 'Rain likely' : null
}

// ---------------------------------------------------------------------------
// V3 slice 4 (ticket 07): the card's going line — "N going" + circles.

/**
 * One pinger the card's going line shows (V3 slice 4, ticket 07): the
 * pinger's avatar (public URL) + display name (the fallback-initial
 * source). `avatarUrl` null = the card renders the initial-fallback
 * circle. `displayName` is the fallback only — names never surface on the
 * card (the guest list stays on the detail page per ticket 05).
 */
export interface GoingPinger {
  avatarUrl: string | null
  displayName: string
}

/** One circle in the going line (V3 slice 4, ticket 07). */
export interface GoingCircle {
  /** The pinger's avatar URL (null = the initial-fallback circle). */
  avatarUrl: string | null
  /** The fallback circle's initial (the display name's first char, upper). */
  initial: string
}

/** The card's going line (V3 slice 4, ticket 07). Null = the line is hidden. */
export interface GoingLine {
  /** The "N going" label. */
  label: string
  /** The circles to show (at most `limit`), in ping order. */
  circles: GoingCircle[]
  /** The pingers beyond the shown circles (the "+N" chip; 0 = no chip). */
  overflow: number
}

/** The card's circle cap (V3 slice 4, ticket 07: up to 3 circles + a "+N" chip). */
export const GOING_CIRCLE_LIMIT = 3

/**
 * The card's going line (V3 slice 4, ticket 07; V6 adds the kids count):
 * "N going · M kids" + up to `limit` pinger circles (avatar, or the
 * display-name initial on a slate-200 circle when there is no avatar) + a "+N"
 * overflow chip. The kids count is a bare number by design (decision #2,
 * 2026-09-11) — names and ages only reach the host and the people going.
 *
 * Pure + unit-tested: the caller (the feed page) groups the pings by post
 * and hands each card its group; this builds the renderable line.
 * - count <= 0 → null (the line is hidden — "0 going" is not a state).
 * - exactly `limit` circles shown; the rest collapse into `overflow`
 *   (5 pingers, limit 3 → 3 circles + "+2").
 * - a pinger with no avatar_url gets the initial-fallback circle.
 */
export function buildGoingLine(
  count: number,
  pingers: ReadonlyArray<GoingPinger>,
  limit: number,
  kidsCount = 0,
): GoingLine | null {
  if (count <= 0) return null
  const circles = pingers.slice(0, limit).map((pinger) => ({
    avatarUrl: pinger.avatarUrl,
    initial: (pinger.displayName.charAt(0) || '?').toUpperCase(),
  }))
  const overflow = Math.max(0, count - circles.length)
  return {
    label: goingCountsLabel(count, kidsCount),
    circles,
    overflow,
  }
}

/**
 * "N going" / "N going · M kids" (V6).
 *
 * First phone feedback: "it only says like one going as in like the parent, but
 * it doesn't show the kids that are going... you're trying to set this up for
 * kids to have a play date with other kids." Parents are how the app is used;
 * kids are why it exists, so both numbers belong on the card.
 *
 * "1 kid" is singular; a post with nobody going shows nothing at all (the
 * caller hides the line — "0 going" is not a state, the V3 pin).
 */
export function goingCountsLabel(pingCount: number, kidsCount: number): string {
  const going = `${pingCount} going`
  if (kidsCount <= 0) return going
  return `${going} · ${kidsCount} ${kidsCount === 1 ? 'kid' : 'kids'}`
}

// ---------------------------------------------------------------------------
// V3 slice 5 (ticket 08): the detail page's tappable Google Maps link.

/**
 * The detail page's tappable Google Maps link (V3 slice 5, ticket 08):
 * `https://www.google.com/maps?q=<URL-encoded "place, address">` — the
 * query is the post's place + the street address, comma-joined. Returns
 * null when the address is null, empty, or whitespace-only (no link — a
 * query is never invented; the place line stays plain text). Pure +
 * unit-tested (the e2e asserts the same href the app renders, via this
 * seam).
 */
export function mapsHref(place: string, address: string | null | undefined): string | null {
  const trimmedAddress = (address ?? '').trim()
  if (trimmedAddress === '') return null
  return `https://www.google.com/maps?q=${encodeURIComponent(`${place}, ${trimmedAddress}`)}`
}

// ---------------------------------------------------------------------------
// V3 slice 6 (ticket 09): the detail page's "Kids coming" line.

/**
 * The detail page's "Kids coming" line (V3 slice 6, ticket 09, migration
 * 0022): "Bernie · 6, Lily · 4" — each kid is its first name + " · " +
 * age (a null age renders the name only, never " · null"), kids joined
 * with ", " in INPUT ORDER (the caller orders by name — db.
 * listPlaydateKidNamesWithClient returns the rows name-ordered and the
 * detail page hands them over as-is; this seam never re-sorts). 0 kids →
 * null (the line is hidden — "Kids coming:" with nothing after is not a
 * state, like a 0 going line). Empty-name kids are skipped (defensive
 * guard — the 0011 first_name is NOT NULL, so a blank here is a data
 * gap, not a render); if every kid is skipped, null. Names + ages ONLY —
 * no photos (the kid-photo pin: photos render only in the profile kids
 * list, never on the event line). Pure + unit-tested.
 */
export function kidsComingLine(
  kids: ReadonlyArray<{ name: string; age: number | null }>,
): string | null {
  const lines = kids
    .filter((kid) => kid.name.trim() !== '')
    .map((kid) => (kid.age !== null ? `${kid.name} · ${kid.age}` : kid.name))
  if (lines.length === 0) return null
  return lines.join(', ')
}

// ---------------------------------------------------------------------------
// V3 slice 9 (ticket 04): the feed retention banner's cursor throttle.

/**
 * Whether the retention cursor (profiles.last_seen_at, V3 slice 9,
 * ticket 04, migration 0024) is due for a restamp: no cursor yet (null
 * — the first visit establishes it) or the cursor is at least `windowMs`
 * old (the >= 1h throttle; the window itself is owned by the FeedPage
 * call site). Pure + unit-tested; the restamp itself is the
 * db.touchLastSeen fire-and-forget (pre-0024-apply it 42703s on the
 * missing column — the caller swallows, the cursor just never lands).
 */
export function dueToRefreshLastSeen(
  lastSeenIso: string | null,
  nowIso: string,
  windowMs: number,
): boolean {
  if (lastSeenIso === null) return true
  return Date.parse(nowIso) - Date.parse(lastSeenIso) >= windowMs
}

// ---------------------------------------------------------------------------
// V3 slice 10 (ticket 05): the guest list — progressive disclosure on going
// pings. The DB gate is the SECURITY DEFINER get_guest_list RPC (0025);
// these seams decide the CLIENT-SIDE render (which viewers see the named
// list vs the count-only line) and format the line copy. Pure + unit-tested.

/**
 * Whether the viewer sees the NAMED guest-list block (vs the count-only
 * line, the V1 zero-pressure surface for strangers) — V3 slice 10, ticket
 * 05 (founder-approved progressive disclosure, .scratch/guest-list/spec.md).
 * The host sees who pinged their own event (they need it to welcome
 * people); pingers see co-attendee names (they committed; no lurker
 * exposure); everyone else sees counts only. The block is hidden when
 * count = 0 (an empty named list is not a state).
 */
export function resolveGuestListVisibility(
  viewerIsHost: boolean,
  viewerHasPinged: boolean,
  count: number,
): boolean {
  return (viewerIsHost || viewerHasPinged) && count > 0
}

/**
 * The guest-list line copy (V3 slice 10, ticket 05). The host's view is
 * "Going: Sarah, Mia + 2 families" (up to 3 names, then the "+ N more"
 * overflow). A pinger's view is "You, Sarah, Mia + 2 families" — the
 * pinger's own display_name (the caller's profile name) is dropped from
 * the DB-returned names and stood in for by "You"; "You" takes one of the
 * line's 3-name slots, so up to 2 others show before the "+ N more"
 * overflow. A pinger who is the ONLY attendee renders just "You". The
 * names arrive ordered by ping created_at (the 0025 RPC).
 */
export function formatGuestLine(
  names: string[],
  viewerDisplayName: string | null,
  isHost: boolean,
): string {
  if (isHost) {
    const shown = names.slice(0, 3)
    const extra = names.length - shown.length
    const base = extra > 0 ? `${shown.join(', ')} + ${extra} more` : shown.join(', ')
    return base === '' ? '' : `Going: ${base}`
  }
  const others =
    viewerDisplayName !== null
      ? names.filter((n) => n !== viewerDisplayName)
      : names
  // "You" takes one of the line's 3-name slots (the JSDoc example: "You,
  // Sarah, Mia + 2 families") — so up to 2 others show, then the overflow.
  const shown = others.slice(0, 2)
  const extra = others.length - shown.length
  const base = extra > 0 ? `${shown.join(', ')} + ${extra} more` : shown.join(', ')
  return base === '' ? 'You' : `You, ${base}`
}

// ---------------------------------------------------------------------------
// V8 ticket 01: quick post — mount-once defaults + remembered places.
//
// The core spontaneous gesture ("we're at the park right now") used to cost
// six decisions, with a start date of '' and a start time pinned to 10:00 AM.
// These seams make the /new form's DEFAULT state already correct: today, the
// next 30-minute slot, and the places this parent last posted to. Nothing
// here bypasses validation — a parent can still schedule three days out by
// changing the fields, exactly as before.

/** How many recent places the /new chips show (ticket 01 pin). */
export const RECENT_PLACES_SHOWN = 3

/** How many of the caller's own recent posts the chips are derived from. */
export const RECENT_PLACES_SCANNED = 10

/**
 * The next 30-minute slot at or after `nowIso`, as minutes since LOCAL
 * midnight (the /new stepper's own unit — `isSteppedTime` accepts it).
 *
 * On-grid input returns itself (2:30 → 2:30: posting "we're here now" should
 * not silently round a parent forward to 3:00). Past midnight it wraps to 0
 * — `defaultStartDateIso` is the seam that advances the DATE in that case,
 * so the pair is always consistent.
 */
export function nextSlotMinutes(nowIso: string): number {
  const now = new Date(nowIso)
  const minutes = now.getHours() * 60 + now.getMinutes()
  const dayMinutes = 24 * 60
  return (Math.ceil(minutes / TIME_STEP_MINUTES) * TIME_STEP_MINUTES) % dayMinutes
}

/**
 * The /new start date the form opens with: today, local — tomorrow when the
 * next slot has wrapped past midnight (23:45 → the 00:00 slot belongs to
 * tomorrow; defaulting to today would open the form on a start time that
 * already passed). Returns the `<input type="date">` value format, which is
 * `localDayKey`'s (the two must agree — the date input IS a local day key).
 */
export function defaultStartDateIso(nowIso: string): string {
  const now = new Date(nowIso)
  const minutes = now.getHours() * 60 + now.getMinutes()
  const wrapsToMidnight = minutes > 0 && nextSlotMinutes(nowIso) === 0
  const day = new Date(now)
  if (wrapsToMidnight) day.setDate(day.getDate() + 1)
  return localDayKey(day.toISOString())
}

/**
 * The duration chip that reaches the next whole hour from a start slot on
 * the 30-minute grid, clamped to the chip set (60–180).
 *
 * Exported for the unit test: on today's grid a slot is always :00 or :30,
 * so the answer is a constant 1h in the app — the seam stays general so a
 * finer grid, or a different "until" rule, is a rule change and not a
 * rewrite.
 */
export function durationChipForUntilNextHour(slotMinutes: number): number {
  const minutesToNextHour = (60 - (slotMinutes % 60)) % 60 || 60
  const chips = PLAYDATE_DURATIONS_MINUTES as readonly number[]
  return chips.find((chip) => chip >= minutesToNextHour) ?? chips[chips.length - 1]
}

/** The suggested duration for the /new quick-fill preset (see above). */
export function suggestedDurationMinutes(nowIso: string): number {
  return durationChipForUntilNextHour(nextSlotMinutes(nowIso))
}

/**
 * One remembered place, ready to fill three /new fields in a single tap
 * (ticket 01): the place text, its address ('' when the post had none), and
 * the neighborhood the post used.
 */
export interface RecentPlace {
  place: string
  address: string
  neighborhoodId: string
}

/**
 * The recent-place chips from the caller's own posts, newest first
 * (`queryRecentOwnPlacesWithClient` order): rows with no place are dropped,
 * duplicates collapse on a case/whitespace-insensitive place key (the NEWEST
 * wins — the input order), and the result is capped at `limit`.
 */
export function recentPlacesFrom(
  rows: ReadonlyArray<{ place: string; address: string | null; neighborhood_id: string }>,
  limit: number = RECENT_PLACES_SHOWN,
): RecentPlace[] {
  const seen = new Set<string>()
  const out: RecentPlace[] = []
  for (const row of rows) {
    const place = row.place.trim()
    if (place === '') continue
    const key = place.replace(/\s+/g, ' ').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      place,
      address: (row.address ?? '').trim(),
      neighborhoodId: row.neighborhood_id,
    })
    if (out.length >= limit) break
  }
  return out
}

/**
 * The caller's own recent posts' places, newest first, against an injected
 * client (the `queryMyPlaydatesWithClient` pattern — mocked in
 * feed.test.ts). Ordered by created_at DESC because this is about what the
 * parent ACTUALLY posted last, not what starts soonest. The playdates SELECT
 * policy is open to any authenticated user, so the host's own rows come back
 * directly.
 */
export async function queryRecentOwnPlacesWithClient(
  client: SupabaseClient,
  profileId: string,
  scanLimit: number = RECENT_PLACES_SCANNED,
): Promise<unknown[]> {
  const { data, error } = await client
    .from('playdates')
    .select('place, address, neighborhood_id, created_at')
    .eq('host_profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(scanLimit)
  if (error) throw error
  return (data ?? []) as unknown[]
}

// ---------------------------------------------------------------------------
// V8 ticket 02: the first visit that is not a dead end — the empty-radius
// copy + escape hatches, and the visibility-refresh gate.

/**
 * The empty-radius copy (V8 ticket 02), shared by the feed ("Near you") and
 * Browse so the two screens can never drift apart.
 *
 * Two lies were in the old string ("Nothing happening near you today — post
 * the first one."): the query is today-AND-LATER (`filterFeed` drops only
 * PAST posts, and the day sections prove it), and it named no radius — so a
 * parent on the 5-mile default had no idea that 35 was even possible. N is
 * the VIEWER's actual radius: the number the filter just used, which is the
 * only honest one to quote.
 *
 * Always plural by construction (radius options are 2/5/10/20/35, and the DB
 * CHECK is 2–35), so there is no "1 miles" case to guard.
 */
export function emptyRadiusCopy(radiusMiles: number): string {
  return `Nothing within ${radiusMiles} miles yet.`
}

/** The "widen" escape's radius (V8 ticket 02 pin: 20 miles). */
export const WIDEN_RADIUS_MILES = 20

/**
 * The "see everything" escape's radius (V8 ticket 02 pin: 35 — the max, the
 * same value as RADIUS_MAX_MILES and the DB CHECK's ceiling; the assertion
 * below keeps the two from drifting).
 */
export const SEE_ALL_RADIUS_MILES = RADIUS_MAX_MILES

/** One escape out of an empty radius: the radius it writes + its button copy. */
export interface RadiusEscape {
  radiusMiles: number
  label: string
}

/**
 * The escape hatches an empty-radius state offers (V8 ticket 02, pure +
 * unit-tested): "Widen to 20 miles" and "See everything in Seattle" (35 mi,
 * the max).
 *
 * Both call the EXISTING `updateHomeZipRadius` write path — this seam only
 * decides which controls render, so the page stays a thin call site.
 *
 * An escape whose radius is not actually WIDER than the viewer's current one
 * is dropped: at 20 miles, "Widen to 20 miles" would be a no-op button, which
 * is just a second dead end wearing a control's clothes. At the 35-mile max
 * the list is empty and the empty state is honestly terminal (the radius
 * ceiling is the whole discovery surface) — the "Post a drop-in" CTA remains
 * either way.
 */
export function radiusEscapes(radiusMiles: number): RadiusEscape[] {
  const escapes: RadiusEscape[] = []
  if (WIDEN_RADIUS_MILES > radiusMiles) {
    escapes.push({ radiusMiles: WIDEN_RADIUS_MILES, label: `Widen to ${WIDEN_RADIUS_MILES} miles` })
  }
  if (SEE_ALL_RADIUS_MILES > radiusMiles) {
    escapes.push({ radiusMiles: SEE_ALL_RADIUS_MILES, label: 'See everything in Seattle' })
  }
  return escapes
}

/**
 * Whether the feed is due for a visibility-triggered refetch (V8 ticket 02):
 * no load yet (null — the first load establishes the clock) or the last load
 * is at least `windowMs` old. `windowMs` is owned by the call site
 * (FeedPage's FEED_REFRESH_WINDOW_MS), the same split as
 * dueToRefreshLastSeen / LAST_SEEN_WINDOW_MS.
 *
 * The gate exists so returning to the tab does not become a refetch storm:
 * a quick app switch (background, back) leaves the last load well inside the
 * window and starts nothing. Pure + unit-tested; the listener wiring and the
 * actual refetch are the page's.
 */
export function shouldRefreshFeed(
  lastLoadedIso: string | null,
  nowIso: string,
  windowMs: number,
): boolean {
  if (lastLoadedIso === null) return true
  return Date.parse(nowIso) - Date.parse(lastLoadedIso) >= windowMs
}
