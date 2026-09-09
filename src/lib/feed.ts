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