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
import type { DuplicatePrefill, PlaydateStatus } from './types'

/**
 * Client-local midnight of today as an ISO string.
 *
 * The device's local timezone is the whole story — there is no GPS or
 * per-user timezone setting — so a day-scoped read starts at local 00:00 on the
 * viewer's clock. (Pinned integration decision, slice 3.)
 *
 * V9 ticket 04: this is NO LONGER the feed's cutoff. The radius feed cuts on the
 * post's own end against the clock (`ends_at > now`, isStillAhead /
 * queryUpcomingFeedWithClient), so nothing on `/` calls this any more — the two
 * remaining callers are OUTSIDE this ticket and still day-scoped on purpose:
 * db.listPlaceFeed (the /place/:id page's own list) and
 * db.upcomingCountsByPlace (Browse's "N upcoming" chips). Moving those is a
 * recorded follow-up, not a silent side effect of the feed's change.
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
 *
 * V8 ticket 07: this is now the FALLBACK leg of the distance model — see
 * postDistanceMiles, which filterFeed actually calls.
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
 * The DAY the parent is agreeing to, said back in the /new summary (V9 ticket
 * 03): "Sat, Aug 30" — always the date itself, never "Today".
 *
 * WHY no "Today"/"Tomorrow" (the labels `formatDayLabel` gives the feed's day
 * sections): the summary is a read-back of what WILL BE POSTED, and it is a
 * pure function of the form's values — `postSummaryLines(values)` is not given
 * a `now`, on purpose. A "Today" in a read-back would be a second clock
 * (recomputed per render, moving under the parent's finger — the V8 ticket 01
 * mount-once pin), and it would silently mean a different calendar day on a
 * form left open across midnight. The date cannot be misread; "Sat" can.
 *
 * The tables and the parse are `formatDayLabel`'s (the feed's own day words):
 * locale-independent, and the same strings the feed's own headers show for a
 * day that is neither today nor tomorrow. An empty or unparseable date yields
 * '' — the caller says "no day picked" rather than inventing a day.
 */
export function formatStartDayLabel(startDate: string): string {
  const trimmed = startDate.trim()
  if (trimmed === '') return ''
  const date = new Date(`${trimmed}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return `${WEEKDAYS_SHORT[date.getDay()]}, ${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`
}

/**
 * A post is ended when ends_at <= nowIso — the ONE boundary of the app's
 * time-based rules.
 *
 * V3 ticket 01 introduced it as the feed's Today-section demotion rule (ended
 * events were pushed behind the upcoming ones and greyed on the card). V9
 * ticket 04 REMOVED that demotion: the feed no longer returns an ended post at
 * all (the cutoff IS this predicate, negated — isStillAhead), so what this seam
 * still drives is (a) the card's muted "Ended" styling, (b) the profile
 * Upcoming/Past split (partitionPostsByTime) on /profile and /u/:handle, and
 * (c) V8/09's "ended within 7 days" window (follows.endedWithinDays). Same
 * boundary in all of them: exactly at `ends_at` the post is ended.
 */
export function isEnded(post: { ends_at: string }, nowIso: string): boolean {
  return Date.parse(post.ends_at) <= Date.parse(nowIso)
}

/**
 * A post is still ahead when it has NOT ended (V9 ticket 04) — i.e. the feed's
 * whole inclusion rule is `ends_at > nowIso`: "still ahead or happening now".
 *
 * WHY NOT `starts_at >= nowIso` (the trap this seam exists to close): the feed
 * used to keep every post that STARTED today and demote the ended ones to the
 * bottom of the Today section, greyed. Ticket 04 removes ended drop-ins from
 * Nearby entirely, and the tempting way to say "only what is ahead" —
 * `starts_at >= now` — would delete the drop-in that is HAPPENING RIGHT NOW,
 * which is exactly the post the AC pins as STAY ("those are the ones a parent
 * can still walk to"; DropInCard badges it "Happening now"). `ends_at > nowIso`
 * subsumes the future post (an end is always after its own start) and keeps the
 * live one, so it is the honest expression of "still ahead or happening now".
 *
 * A COMPLEMENT, NOT A SECOND COMPARISON: this is `!isEnded` by construction —
 * the very boundary `partitionPostsByTime` (the profile Upcoming/Past split,
 * V8 ticket 04) and DropInCard's muted "Ended" styling already use. One
 * definition of ended (`ends_at <= nowIso`, so a post ending exactly AT now is
 * ended, and therefore not ahead), unit-tested at that boundary, so the feed,
 * the profile lists and the card cannot drift apart.
 *
 * V12 ticket 03 (migration 0041) adds a SECOND clause: an 'ended' post is not
 * ahead EITHER, even while its window has not passed — the host ended it early
 * (option A, honest history), so it leaves the feed while it stays in the
 * owner's Past list, labelled "ended" (distinct from "cancelled"). The feed's
 * DB query excludes it at the source (.neq('status', 'ended'),
 * queryUpcomingFeedWithClient); this predicate is the defense-in-depth twin,
 * agreeing with it by construction — the same two-layers-agree discipline as
 * the time cutoff above.
 */
export function isStillAhead(
  post: { ends_at: string; status?: string | null },
  nowIso: string,
): boolean {
  return !isEnded(post, nowIso) && post.status !== 'ended'
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
 * The instant a feed row's DAY SECTION is decided by (V9 ticket 04).
 *
 * The post's own start — CLAMPED UP to `nowIso` once that start is in the past.
 * So a row belongs to the day the parent is looking at, never to the calendar
 * day it began on, and the day-section rule is the same rule the feed's
 * inclusion cutoff uses (`ends_at > now`, isStillAhead).
 *
 * WHY THIS EXISTS (a defect this ticket would otherwise have introduced, found
 * by the review): `filterFeed` admits every post that has not ENDED, which
 * includes a drop-in whose window CROSSED MIDNIGHT — 11:30 PM + 3h = 2:30 AM is
 * an ordinary thing a parent can post (`computeEndIso` pins that roll-over, the
 * stepper wraps modulo 24h, and the chips go to 3h). Grouping such a row by its
 * RAW start day made the feed's FIRST section a past-dated header — a section
 * headed "Fri, Sep 11" holding one card badged "Happening now" — because rows
 * arrive starts_at-ascending, so the oldest start sorts first. That combination
 * was UNREACHABLE before this ticket (the old start-of-today cutoff dropped the
 * row entirely), which is exactly why no test covered it.
 *
 * ONE RULE, NOT THREE: with this seam the section key, its label
 * (formatDayLabel), and the V3/02 rain badge's "is this today" filter all ask
 * the same question of the same instant. A post starting exactly at `nowIso` is
 * NOT clamped (it is already in the current day); an unparseable `nowIso` or
 * `starts_at` falls back to the raw start (garbage in, unchanged behaviour —
 * never a second invented rule).
 */
export function daySectionIso(post: { starts_at: string }, nowIso: string): string {
  const start = Date.parse(post.starts_at)
  const now = Date.parse(nowIso)
  if (Number.isNaN(start) || Number.isNaN(now) || start >= now) return post.starts_at
  return nowIso
}

/**
 * Group posts by local calendar day (V3 ticket 01 — promoted from
 * BrowsePage's page-local groupByDay; this is the single implementation).
 * Days appear in the order their FIRST post appears, so the canonical
 * starts_at-ascending feed input yields ascending start-of-day groups.
 * Labels come from formatDayLabel; the nowIso seam is the same as
 * filterFeed's. Within a group, posts keep their input order.
 *
 * V9 ticket 04: the day a post belongs to is `daySectionIso(post, nowIso)` —
 * its start, clamped up to now when it has already started — NOT its raw
 * `starts_at`. That is what keeps a still-running overnight drop-in in TODAY's
 * section (badged "Happening now") instead of in a past-dated section at the top
 * of the feed. Everything else about this seam is unchanged: same order, same
 * keys, same labels, and a post that starts at or after `nowIso` groups exactly
 * where it always did.
 */
export function groupByDay<T extends { starts_at: string }>(
  posts: T[],
  nowIso: string,
): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>()
  for (const post of posts) {
    const sectionIso = daySectionIso(post, nowIso)
    const key = localDayKey(sectionIso)
    const group = groups.get(key)
    if (group === undefined) {
      groups.set(key, { key, label: formatDayLabel(sectionIso, nowIso), posts: [post] })
    } else {
      group.posts.push(post)
    }
  }
  return [...groups.values()]
}

/**
 * A numeric column's value as a real number, or null (V8 ticket 07).
 *
 * PostgREST returns `numeric` columns (places.lat / places.lng — the 0029
 * schema) as JSON STRINGS, not numbers (the zip_codes lesson: loadZipCodes
 * does `Number(row.lat)`). So a coordinate read off a row is `string | number`
 * and must be coerced; anything unparseable (null, '', a malformed value) is
 * null — a coordinate is NEVER invented from a bad value.
 */
export function coordNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The distance, in miles, from the viewer's home zip to a PLACE's OWN
 * coordinates (V8 ticket 07, migration 0030).
 *
 * Null means UNKNOWN — no home zip, a zip missing from the gazetteer, or a
 * place with no coordinates. The two callers treat that null differently, and
 * deliberately:
 * - filterFeed EXCLUDES the post (a radius feed cannot place it, and
 *   coordinates are never invented — the pinned rule);
 * - the places directory KEEPS the place (hiding a real park because we lack
 *   its coordinates would hide the information we DO have — the same
 *   discipline as the age filter's null = unknown = keep).
 */
export function placeDistanceMiles(
  place: { lat?: number | string | null; lng?: number | string | null } | null | undefined,
  viewer: { homeZip: string | null },
  zipCoords: ReadonlyMap<string, ZipCoords>,
): number | null {
  if (place === null || place === undefined) return null
  if (viewer.homeZip === null) return null
  const viewerCoords = zipCoords.get(viewer.homeZip)
  if (viewerCoords === undefined) return null
  const lat = coordNumber(place.lat)
  const lng = coordNumber(place.lng)
  if (lat === null || lng === null) return null
  return haversineMiles(viewerCoords, { lat, lng })
}

/**
 * THE DISTANCE-MODEL FIX (V8 ticket 07): the distance, in miles, to a POST's
 * location — the PLACE's coordinates when the post names a place, and the
 * host's home zip ONLY when it does not.
 *
 * What was wrong: through V8 a drop-in's location WAS the host's home zip (the
 * 2026-09-09 V2 decision), so a parent hosting at a park across town was
 * filtered as if the meetup were in their driveway. Now the post's own place
 * wins, and the host zip is the documented fallback for the posts that name no
 * place (free text, `place_id` null) — which is the entire existing corpus, so
 * nothing about today's feed changes until a parent picks a place.
 *
 * The fallback is also taken when `place_id` is set but its place row is
 * unreadable or coordinate-less: the host zip is real data we hold, and the
 * alternative is hiding a real meetup because a join failed.
 *
 * Null when NEITHER leg resolves — filterFeed treats that as EXCLUDED (the
 * pinned rule: coordinates are never invented).
 */
export function postDistanceMiles(
  post: {
    host?: { home_zip?: string | null } | null
    /**
     * Accepted but never read: the decision is made on `place_coords` ALONE, and
     * a place_id with no readable coordinates must take the host-zip fallback
     * exactly like a post with no place at all. It is in the signature so a real
     * Playdate row can be passed without narrowing it first.
     */
    place_id?: string | null
    place_coords?: { lat?: number | string | null; lng?: number | string | null } | null
  },
  viewer: RadiusViewer,
  zipCoords: ReadonlyMap<string, ZipCoords>,
): number | null {
  const viaPlace = placeDistanceMiles(post.place_coords, viewer, zipCoords)
  if (viaPlace !== null) return viaPlace
  return hostDistanceMiles(post.host?.home_zip, viewer, zipCoords)
}

/**
 * The shape filterFeed needs (Playdate and its joined variants qualify).
 */
export interface FeedPost {
  host_profile_id: string
  starts_at: string
  /**
   * The post's end (V9 ticket 04): the feed's cutoff column. Required — the
   * filter's inclusion rule IS `ends_at > nowIso` (isStillAhead), so a shape
   * without it could not be filtered honestly. Every real row carries it
   * (0005: `ends_at timestamptz not null`).
   */
  ends_at: string
  /**
   * The host's status (V3 ticket 02, migration 0016; the third value added by
   * V12 ticket 03, migration 0041): 'on' is the DB default; 'cancelled' and
   * 'ended' mute the card. OPTIONAL in this seam — pre-0016 rows (and the
   * while-away inbox's unreadable-row shape) omit the column, and the UI
   * treats missing as 'on' (the pre-0016 status discipline). The DB column
   * itself is NOT NULL since 0016. 'ended' is the feed exclusion (this
   * interface feeds isStillAhead and the queryUpcomingFeedWithClient .neq).
   */
  status?: string | null
  /** Set when a moderator has hidden the post (slice 5, migration 0009). */
  hidden_at?: string | null
  /** The host's location fields (V2 slice 3 — present on the joined host). */
  host?: { home_zip?: string | null }
  /**
   * The place this drop-in is at (V8 ticket 07, migration 0030): its id, and
   * its coordinates when the caller could join them in.
   *
   * `place_coords` is deliberately NOT called `place`: a playdate already has
   * a `place` and it is a STRING (the free-text name the parent typed, which
   * the directory does not always know). Overloading it with an object would
   * make the two meanings indistinguishable at every call site.
   *
   * `place_coords` is the distance model's FIRST leg; a post with a `place_id`
   * but no readable coordinates falls back to the host zip exactly like a post
   * with no place at all.
   */
  place_id?: string | null
  place_coords?: { lat?: number | string | null; lng?: number | string | null } | null
}

/** A post is hidden when a moderator has set hidden_at (slice 5). */
export function isHiddenPost(post: { hidden_at?: string | null }): boolean {
  return post.hidden_at != null
}

/**
 * Filter posts down to the viewer's radius feed (V2 slice 3): NOT ENDED
 * (`ends_at > nowIso` — isStillAhead, so a drop-in that is happening right now
 * stays), not hosted by a blocked profile, not hidden by a moderator
 * (hidden_at set), AND locatable within the viewer's radius — ordered by
 * starts_at ascending.
 *
 * V8 ticket 07 (the distance-model fix): "locatable" is now
 * postDistanceMiles, which prefers the POST'S PLACE coordinates and falls
 * back to the host's home zip only for a post that names no place. Before
 * this, a meetup at a park across town was filtered as if it were in the
 * host's driveway.
 *
 * Neighborhoods left the filter path in slice 3 (they are display labels
 * only); discovery is distance-based. A post whose location resolves to
 * NOTHING — no place, no host home zip, or a zip missing from the gazetteer
 * — is EXCLUDED (the pinned rule — coordinates are never invented).
 *
 * V9 ticket 04 — THE CUTOFF MOVED FROM START-OF-TODAY TO NOW. The old rule was
 * `Date.parse(post.starts_at) >= startOfTodayIso`, which kept an ended drop-in
 * on the feed all day (greyed and demoted at the bottom of the Today section —
 * the demotion the ticket removes) and dropped a post that had merely crossed
 * local midnight. The rule is now the post's own END against the clock the page
 * already reads, and it is the SAME comparison the DB query applies
 * (queryUpcomingFeedWithClient: `.gt('ends_at', cutoffIso)`), so the two layers
 * cannot disagree about which posts the feed has. This is a `nowIso` seam, not
 * a midnight one: `startOfTodayIso` is no longer used here at all (it is still
 * the cutoff of the place page's own list and Browse's upcoming counts — see
 * db.listPlaceFeed / db.upcomingCountsByPlace, both OUTSIDE this ticket).
 *
 * The DB query (queryUpcomingFeedWithClient) applies the time + hidden +
 * block filters; this pure re-filter is the unit-testable guarantee that a
 * blocked host's post, a hidden post, an ENDED post, and a beyond-radius post
 * can never reach the feed, plus the canonical ordering.
 *
 * `nowIso` is the single time input (it is also what drives the "happening
 * now" / "starts soon" badges in the UI), so the badge a card shows and the
 * decision to include it come from one instant.
 */
export function filterFeed<T extends FeedPost>(
  posts: T[],
  viewer: RadiusViewer,
  zipCoords: ReadonlyMap<string, ZipCoords>,
  blockedHostIds: ReadonlySet<string>,
  nowIso: string,
): T[] {
  return posts
    .filter((post) => {
      const distance = postDistanceMiles(post, viewer, zipCoords)
      return (
        distance !== null &&
        withinRadius(distance, viewer.radiusMiles) &&
        !blockedHostIds.has(post.host_profile_id) &&
        !isHiddenPost(post) &&
        isStillAhead(post, nowIso)
      )
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
}

/**
 * The raw DB feed query, against an injected Supabase client (mockable —
 * the same pattern as trust.togglePingWithClient / auth.hasActiveSession).
 * The viewer's feed rows — posts that have NOT ENDED (`.gt('ends_at',
 * cutoffIso)`; `cutoffIso` is the caller's NOW, not a midnight), ordered by
 * starts_at — with the DB-level filters applied:
 * - .is('hidden_at', null) — hidden posts vanish from the feed for
 *   everyone (slice 5; the pure filterFeed re-filter is the defense in
 *   depth, unit-tested)
 * - .neq('status', 'ended') — V12 ticket 03 (migration 0041): a host who
 *   ends an event early takes it OUT of the feed immediately (honest
 *   history, option A: it stays in the owner's Past list, labelled
 *   "ended"). The pure filterFeed re-filter (isStillAhead) is the defense
 *   in depth, unit-tested
 * - .not() on blocked hosts — only when the viewer actually has blocks (an
 *   empty .in() would match nothing; slice 3)
 *
 * V9 ticket 04: THE CUTOFF COLUMN IS `ends_at`, NOT `starts_at`. `.gte(
 * 'starts_at', cutoffIso)` was the old rule (start-of-today): it handed the
 * client posts that had already finished — the fetched-then-hidden shape the
 * ticket removes (the read returns fewer rows now). Moving the filter to
 * `starts_at >= now` would instead have deleted every drop-in already under way
 * (the AC's "a drop-in that has STARTED but not ended STAYS"). `ends_at >
 * nowIso` is the same predicate the pure filter uses (isStillAhead = !isEnded,
 * `ends_at <= now`), so the two layers agree by construction — including at the
 * boundary, where `ends_at === now` is ENDED on both.
 *
 * TWO HONEST CAVEATS, neither of them this ticket's to fix:
 * (1) CORRECTNESS, and it is a wrong LABEL, not a performance note: two reads
 *     outside the feed still cut at start-of-today — db.listPlaceFeed (the
 *     /place/:id list) and db.upcomingCountsByPlace (Browse's "N upcoming"
 *     chip). So /browse can print "1 upcoming" for a place whose only drop-in
 *     has already ENDED, which the feed now contradicts, and /place/:id can
 *     still list that drop-in. Both are day-scoped reads with their own ACs and
 *     tests; fixing them needs no migration. Recorded in the ticket's Comments
 *     (V9 ticket 04) as an explicit follow-up.
 * (2) PERFORMANCE, and it is minor: the only index on `playdates` is
 *     (neighborhood_id, starts_at) (0005), so an `ends_at` range predicate is
 *     itself an unindexed scan. Free at this table's size; an `(ends_at)` index
 *     would be DDL, i.e. the migration this read-path-only ticket explicitly
 *     does not carry.
 *
 * V2 slice 3: the neighborhood filter is GONE (distance-based discovery) —
 * the query fetches all upcoming posts and the pure radius filter decides.
 * Every embed path pins its FK hint (PGRST201 lesson): the host embed is
 * pinned to `playdates_host_profile_id_fkey` (commit 80f9b07) and now also
 * carries the host's home_zip + radius_miles — the radius filter's inputs.
 * The zip coordinates themselves are a separate tiny fetch (zip_codes, the
 * seeded gazetteer) because home_zip is a plain text column, not an FK.
 *
 * V9 ticket 01 (migration 0035): the neighborhood embed is a PLAIN embed —
 * PostgREST's default LEFT JOIN — because `neighborhood_id` is now nullable
 * and a NULL-neighbourhood post must still be IN the feed. `!inner` is an
 * INNER JOIN: with it, the row would not come back at all, so a post created
 * from a picked place (every seeded place has a NULL neighbourhood — 0029's
 * header) would vanish from the feed AND from the profile lists entirely.
 * The embed name stays `neighborhood:`, so the row shape is unchanged for
 * posts that DO carry one: object when present, `null` when not (the render
 * sites — DropInCard, PlaydateDetailPage — handle the null, never a label).
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
      // V9 ticket 01: NO `!inner` on the neighborhood embed (see the note
      // above) — an inner join would drop every post that has no neighbourhood.
      '*, neighborhood:neighborhoods ( id, name ), host:profiles!playdates_host_profile_id_fkey ( id, display_name, avatar_url, home_zip, radius_miles )',
    )
    .gt('ends_at', cutoffIso)
    // V12 ticket 03 (0041): a host-early-ended post leaves the feed immediately.
    .neq('status', 'ended')
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
  /**
   * The chosen neighbourhood id, or '' for "none".
   *
   * V9 ticket 01: /new no longer ASKS this question (the neighbourhood select
   * is gone from that form — the place pick fills it only when the place
   * carries one, and every seeded place today carries none), but the KEY stays
   * in this shape: `PlaydateFormErrors` is `keyof PlaydateFormValues`, and
   * /edit still renders and writes the field (its post may have one). So a
   * '' here means "no neighbourhood", which is a legal post as of 0035 — and
   * the write path omits the column rather than sending an empty string
   * (feed.neighborhoodIdField: '' is not a uuid, and PostgREST would 22P02).
   */
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

/**
 * The title's character cap — ONE number behind three uses: the validator's
 * rule, the live `n/80` counter the form renders, and the cap the GENERATED
 * title is truncated at (postSummary.generatedTitle, V9 ticket 03). The
 * counter used to own a copy of this in PlaydateFormFields.tsx; a generated
 * title that the validator then refused (81 characters) would be a form that
 * asks the parent to fix a value it wrote itself, so the three now agree by
 * construction.
 */
export const TITLE_MAX_LENGTH = 80

/** The duration chips (minutes): 1h / 1.5h / 2h / 3h (pinned, V2 slice 1). */
export const PLAYDATE_DURATIONS_MINUTES = [60, 90, 120, 180] as const

/** One step of the start-time stepper (pinned: 30-minute increments). */
export const TIME_STEP_MINUTES = 30

/**
 * Validate the /new drop-in form (pinned rules: title required + ≤ 80
 * characters after trim; place required; start date required; the start time
 * sits on the 30-minute grid; the duration is one of the chips; age_hint /
 * details optional). The end time never needs a check — it is computed
 * (start + duration > start always, since every chip duration is positive).
 *
 * V9 ticket 01: the NEIGHBOURHOOD rule is DELETED (pinned in the ticket), not
 * made optional — "maybe you just put in the address and not a neighborhood
 * because people aren't going to know that". `neighborhoodId` stays in the
 * values shape (see the field's doc) but an empty one is not an error: a post
 * with a place and nothing else must be postable, which is the whole point of
 * the ticket. /edit shares this validator, so an edit that leaves the field at
 * "none" is legal too — and writes NULL rather than an empty string.
 */
export function validatePlaydateForm(values: PlaydateFormValues): PlaydateFormErrors {
  const errors: PlaydateFormErrors = {}
  const title = values.title.trim()
  if (title.length === 0) {
    errors.title = 'Give your drop-in a short title.'
  } else if (title.length > TITLE_MAX_LENGTH) {
    errors.title = 'Keep the title to 80 characters.'
  }
  if (values.place.trim().length === 0) {
    errors.place = 'Add a place (park, lot, field).'
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

/**
 * The /new fields that render INSIDE the "More options" disclosure — EMPTY as
 * of V11 ticket 05. V9 ticket 03 kept the start (date + the 30-minute stepper)
 * behind the disclosure, so it listed `startDate`/`startMinutes`; the rule
 * below opened the door whenever a submit failed on one of them, so a required
 * field's error was never rendered inside something the parent had collapsed.
 *
 * V11 ticket 05 moved the start into the visible "When" section, so NOTHING
 * required renders behind the disclosure anymore (the address, the kids picker,
 * the details and the repeat toggle are all optional). The list is therefore
 * empty and `moreOptionsHoldsError` never returns true — but BOTH are kept, not
 * deleted: they are the drift hook. The moment a REQUIRED field is added behind
 * the door it must be added here too, or its error is invisible. The unit tests
 * in feed.test.ts pin the empty list; e2e/post-fast.e2e.ts pins the rule's
 * reachability (an empty list means the disclosure stays closed on a failed
 * start-date submit).
 */
export const MORE_OPTIONS_FIELDS = [] as readonly (keyof PlaydateFormErrors)[]

/** Does a failed submit need the disclosure opened to be seen? V11 ticket 05:
    the list is empty, so no — nothing required lives behind the disclosure.
    Kept (not deleted) as the drift hook above. */
export function moreOptionsHoldsError(errors: PlaydateFormErrors): boolean {
  return MORE_OPTIONS_FIELDS.some((field) => errors[field] !== undefined)
}

/**
 * The `neighborhood_id` insert key — present ONLY when a neighbourhood was
 * actually chosen (the `seriesIdField` (V8 ticket 06) / `placeIdField` (V8
 * ticket 07) pattern, and the 0021 address lesson before them).
 *
 * WHY the spread and not `neighborhood_id: input.neighborhoodId ?? null`:
 *
 * 1. An EMPTY STRING must never reach PostgREST. Since V9 ticket 01 removed
 *    the select from /new, the form's value is '' for a normal post — and
 *    `''` is not a uuid, so sending it would fail with 22P02 ("invalid input
 *    syntax for type uuid") BOTH before and AFTER 0035 drops the NOT NULL.
 *    Omitting the key is the only spelling that means "no neighbourhood".
 * 2. Pre-0035-apply, an omitted key on a NOT NULL column is a 23502
 *    ("null value in column \"neighborhood_id\" ... violates not-null
 *    constraint") — the documented red-by-design point of e2e/post-location,
 *    and exactly the failure the ticket predicts for a post with no
 *    neighbourhood. After 0035 it is simply NULL.
 */
export function neighborhoodIdField(
  neighborhoodId?: string | null,
): { neighborhood_id?: string } {
  const id = (neighborhoodId ?? '').trim()
  if (id === '') return {}
  return { neighborhood_id: id }
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
 * The card's meta-line time window, locale-formatted: "3 PM–5 PM" (the minutes
 * drop at :00, so an on-the-hour window stays short).
 *
 * Moved here from DropInCard (V9 ticket 01, review cycle 1, F3): it is a pure
 * formatting rule with no React in it, and the e2e that pins the card's meta
 * line needs THE RULE rather than a second copy of it (`formatTimeWindow` is
 * what the card renders, so the spec now asserts against the same function —
 * the house lesson about importing a seam instead of restating it).
 *
 * Locale-sensitive by design (`toLocaleTimeString` with the device's locale):
 * the spec compares with whitespace collapsed, because some ICU builds put a
 * NARROW NO-BREAK SPACE before AM/PM and others a plain one.
 */
export function formatTimeWindow(startIso: string, endIso: string): string {
  const format = (iso: string): string => {
    const d = new Date(iso)
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: d.getMinutes() === 0 ? undefined : '2-digit',
    })
  }
  return `${format(startIso)}–${format(endIso)}`
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

// ---------------------------------------------------------------------------
// V8 ticket 05 (post edit): the pure seams the /playdate/:id/edit form runs
// on — the INVERSE of computeStartIso / computeEndIso (a stored row → the
// shared form's values) and the "did this save change anything" comparison
// (the no-op pin: a save that changes nothing issues no write). Both are
// pure so the edit form's whole prefill/change story is unit-tested without
// React or a database.

/**
 * A stored post → the shared form's values (the edit form's prefill).
 *
 * `startDate` + `startMinutes` are the DEVICE's local date and minutes since
 * local midnight — exactly the inverse of computeStartIso, so a post that
 * was never touched in the form round-trips to the same instant.
 *
 * Two deliberate non-rounding rules (V8 ticket 05: "no new rule invented"):
 * - the start time is prefilled EXACTLY as stored, never snapped to the
 *   30-minute grid. Every post created since V2 slice 1 is already on the
 *   grid (the stepper is the only time entry); a legacy off-grid row stays
 *   off-grid in the field and the shared validator asks for a grid time
 *   before it can be saved, rather than the form silently moving it.
 * - the duration is the exact end − start when it is one of the pinned
 *   chips (1h / 1.5h / 2h / 3h), and 0 ("none picked yet") otherwise: the
 *   chip set is a pinned contract, so no fifth chip is invented to match a
 *   stored duration, and the validator asks for a pick.
 *
 * `ageHint` is always '' — the edit form does not render or write the age
 * hint (the /new field went away in V3 ticket 09), and the update payload
 * omits the column, so the stored value survives untouched.
 */
export function playdateFormValuesFromPost(post: {
  title: string
  place: string
  /** V9 ticket 01: NULL once 0035 lands (a post may carry no neighbourhood). */
  neighborhood_id: string | null
  starts_at: string
  ends_at: string
  details: string | null
}): PlaydateFormValues {
  const start = new Date(post.starts_at)
  const durationMinutes = Math.round(
    (Date.parse(post.ends_at) - Date.parse(post.starts_at)) / 60_000,
  )
  return {
    title: post.title,
    place: post.place,
    // NULL → '' : a select's value is a string, and '' is this shape's "none"
    // (the empty option the /edit form already renders).
    neighborhoodId: post.neighborhood_id ?? '',
    startDate: localDayKey(start.toISOString()),
    startMinutes: start.getHours() * 60 + start.getMinutes(),
    durationMinutes: isDuration(durationMinutes) ? durationMinutes : 0,
    ageHint: '',
    details: post.details ?? '',
  }
}

/**
 * The stored shape the edit form's change comparison reads (the post + its
 * current playdate_kids selection). Everything the form can write.
 */
export interface PlaydateEditOriginal {
  title: string
  place: string
  /** Null when the post has no address (or pre-0021-apply). */
  address: string | null
  /** V9 ticket 01: null when the post carries no neighbourhood (post-0035). */
  neighborhood_id: string | null
  starts_at: string
  ends_at: string
  /** Null when the post has no details. */
  details: string | null
  /** The current playdate_kids kid ids (any order). */
  kidIds: readonly string[]
}

/**
 * Did the form's FIELD save change anything? Compares what the form would
 * WRITE (the trimmed strings, the computed start/end instants, the address
 * with its empty → null rule) against what is stored — never the raw field
 * text, so trailing whitespace the form trims anyway is not a change.
 *
 * Timestamps compare by instant (Date.parse), so the ISO spelling Postgres
 * returns (e.g. "+00:00" vs "Z") is never mistaken for a change.
 *
 * V9 ticket 01: the neighbourhood compares `''`-to-NULL as UNCHANGED. The
 * stored value may now be NULL and the form's is always a string ('' is its
 * "none"), so comparing them raw would report a change on every open of a
 * neighbourhood-less post and make the edit form write on a save that changed
 * nothing.
 */
export function playdateEditFieldsChanged(
  original: PlaydateEditOriginal,
  values: PlaydateFormValues,
  address: string,
): boolean {
  const addressNext = address.trim()
  return (
    values.title.trim() !== original.title ||
    values.place.trim() !== original.place ||
    addressNext !== (original.address ?? '') ||
    values.neighborhoodId !== (original.neighborhood_id ?? '') ||
    Date.parse(computeStartIso(values.startDate, values.startMinutes)) !==
      Date.parse(original.starts_at) ||
    Date.parse(
      computeEndIso(values.startDate, values.startMinutes, values.durationMinutes),
    ) !== Date.parse(original.ends_at) ||
    values.details.trim() !== (original.details ?? '')
  )
}

/**
 * Did the "Kids you're bringing" selection change? Order-insensitive (the
 * stored ids are read in whatever order the table returns; the picker keeps
 * tap order) and safe against a failed / pre-0022-apply read, which hands in
 * [] — see the edit page: an unchanged selection skips the replace-on-save
 * write entirely, so a failed read can never empty a post's selection.
 */
export function playdateEditKidIdsChanged(
  originalKidIds: readonly string[],
  nextKidIds: readonly string[],
): boolean {
  const same = (a: readonly string[], b: readonly string[]): boolean => {
    if (a.length !== b.length) return false
    const left = [...a].sort()
    const right = [...b].sort()
    return left.every((id, index) => id === right[index])
  }
  return !same(originalKidIds, nextKidIds)
}

/**
 * The caller's own posts, newest first (the /profile duplicate entry, V2
 * slice 1), against an injected client (the same pattern as
 * queryUpcomingFeedWithClient). The playdates SELECT policy is open to any
 * authenticated user, so the host's own rows come back directly. Rows keep
 * their loose shape; the caller (ProfilePage) casts to Playdate.
 *
 * V12 ticket 04 adds the `playdate_kids(kid_id)` embed: the duplicate
 * prefill now carries the source post's linked kids (the page intersects
 * them with the parent's mounted kids), so the owner's read is the one that
 * asks for the join.
 */
export async function queryMyPlaydatesWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<unknown[]> {
  const { data, error } = await client
    .from('playdates')
    .select(
      'id, host_profile_id, title, place, neighborhood_id, starts_at, ends_at, age_hint, details, status, playdate_kids(kid_id)',
    )
    .eq('host_profile_id', profileId)
    .order('starts_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown[]
}

/**
 * The `playdate_kids` PostgREST embed → the kid ids it carries (V12 ticket
 * 04). Defensive on the embed shape: a post with no kids embeds `playdate_kids:
 * []`, and a select that did not ask for it has no such key at all (the
 * pre-0016 `status` discipline — undefined, never a crash). The same
 * extraction `lastOwnPlaydateFrom` uses for the "Post again" clone.
 */
export function playdateKidsKidIds(embed: unknown): string[] {
  const rows = Array.isArray(embed) ? embed : []
  return rows
    .map((row) => (row as { kid_id?: unknown } | null)?.kid_id)
    .filter((kidId): kidId is string => typeof kidId === 'string' && kidId.length > 0)
}

/**
 * Everything from a post worth carrying into a duplicate (V2 slice 1,
 * re-aimed by V12 ticket 04): the parent's words and the plan — AND the
 * source post's start slot, duration, and linked kids. /new moves the slot
 * with `clonedStart` (the same rule the "Post again" chip uses: the same
 * slot again when it is still ahead today, otherwise tomorrow at that time)
 * and intersects the kids with the parent's mounted list, so the only
 * required input left for the parent is the new start time. The duplicate
 * navigates to /new with this as router state.
 */
export function toDuplicatePrefill(
  post: {
    title: string
    place: string
    /** V9 ticket 01: NULL once 0035 lands — '' ("none") in the prefill. */
    neighborhood_id: string | null
    age_hint: string | null
    details: string | null
    /** V12 ticket 04: the source post's slot — what /new moves. */
    starts_at: string
    /** V12 ticket 04: the source post's end — the duration is what carries. */
    ends_at: string
  },
  /** V12 ticket 04: the source post's linked kids (feed.playdateKidsKidIds). */
  kidIds: string[],
): DuplicatePrefill {
  // The span as its duration, snapped to the form's own options — a legacy
  // post with an off-grid span yields 0, which /new reads as "parent picks"
  // (the auto value stands in; the form never opens on a 0 duration).
  const durationRaw = Math.round((Date.parse(post.ends_at) - Date.parse(post.starts_at)) / 60_000)
  return {
    title: post.title,
    place: post.place,
    neighborhoodId: post.neighborhood_id ?? '',
    ageHint: post.age_hint ?? '',
    details: post.details ?? '',
    startsAt: post.starts_at,
    durationMinutes: isDuration(durationRaw) ? durationRaw : 0,
    kidIds,
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
// V9 ticket 05: a drop-in's AGE RANGE — the headline signal on a card.
//
// Her words (the ticket): "I think age of the kid should be the most important
// cuz the kids people want to know what age they're playing with … names are
// optional and when people start to put names like some people get weird about
// that. But ages, if you just say kid age, I feel like that's not weird."
//
// The range has TWO sources, and they are NOT equal:
//   * DERIVED — the ages of the kids the HOST said they are bringing
//     (playdate_kids → kids.age, live since 0022). The host does nothing new:
//     pick your kids and the crowd's age is stated. No kids picked → nothing
//     is shown, and nothing is invented.
//   * STATED — the "Ages (optional)" chip row on /new, stored in
//     playdates.age_min / age_max (0037). A host with no kids listed can still
//     say it out loud.
// The STATED pair WINS whenever both exist ("the parent said so out loud").
// That precedence lives HERE, in a pure seam, never inline in a component
// (ticket pin T5), and every consumer — the feed card, the detail line — runs
// the same one rule.
//
// NAMES NEVER CROSS. Only ages reach these seams: the card carries the RANGE
// as a string, and the batched read behind the derived half projects
// `kids.age` only (db.kidAgesByPostForPosts) — never a name, never a kid id.
// ---------------------------------------------------------------------------

/** The kid age domain (0011/0022: kids.age is 0–17 — validateKidAge's range). */
export const KID_AGE_MIN = 0
export const KID_AGE_MAX = 17

/**
 * A range this WIDE (max − min) stops reading as a range at all, so the line
 * stops pretending and says `all ages` — the same two words the "All ages"
 * chip uses, so no new vocabulary is invented for the same fact.
 *
 * 12 is the pin, and it is chosen against the chip set above it: the widest
 * band the chips offer is 8–12 (width 4), and the ticket's own example of a
 * *wide* spread is 2–9 (width 7, which must still READ as `ages 2–9`), so the
 * cap has to sit above 7. 12 also has to cover the whole domain, because the
 * "All ages" chip stores exactly that: KID_AGE_MAX − KID_AGE_MIN = 17 ≥ 12, so
 * one rule covers both the stored chip and a derived newborn-to-teen spread.
 */
export const AGE_RANGE_ALL_AGES_WIDTH = 12

/** A closed age interval (both ends inclusive, both real ages). */
export interface AgeBounds {
  min: number
  max: number
}

/**
 * The min/max of a set of kid ages, ignoring unknown ages (null/undefined —
 * the render-time defensive gap the DB's NOT NULL cannot produce). Nothing to
 * say (no ages at all) → null, never a guess.
 */
export function ageBounds(
  ages: ReadonlyArray<number | null | undefined>,
): AgeBounds | null {
  const known = ages.filter((age): age is number => typeof age === 'number' && Number.isFinite(age))
  if (known.length === 0) return null
  return { min: Math.min(...known), max: Math.max(...known) }
}

/**
 * The bounds as the line a parent reads: one age → `age 4`; a spread →
 * `ages 3–6` (EN DASH, the ticket's spelling); a spread at or past
 * AGE_RANGE_ALL_AGES_WIDTH → `all ages`. null bounds → null (no line).
 *
 * Lower-case on purpose: this string is the CARD's first meta line, mid-flow
 * under a title, and the ticket spells it `ages 3–6`. The detail page's line
 * capitalises it (kidsComingLine) because there it heads a sentence.
 */
export function ageBoundsLine(bounds: AgeBounds | null): string | null {
  if (bounds === null) return null
  if (bounds.max - bounds.min >= AGE_RANGE_ALL_AGES_WIDTH) return 'all ages'
  if (bounds.min === bounds.max) return `age ${bounds.min}`
  return `ages ${bounds.min}–${bounds.max}`
}

/**
 * The DERIVED line (the ticket's `ageRangeLine(ages)`): the ages of the kids
 * the host is bringing → `ages 3–6`. The batched read hands over ages, this
 * seam decides the words. Empty (no kids picked, or none with an age) → null:
 * the card shows nothing rather than guessing.
 */
export function ageRangeLine(
  ages: ReadonlyArray<number | null | undefined>,
): string | null {
  return ageBoundsLine(ageBounds(ages))
}

/**
 * The STATED line: a row's own `age_min` / `age_max` pair — the /new "Ages
 * (optional)" chips on a playdate (`playdates.age_min` / `age_max`, 0037), and
 * the same shape on a place (`places.age_min` / `age_max`). Both null (nothing
 * stated, or the columns are absent pre-0037 — `undefined` at runtime) → null.
 *
 * A ONE-SIDED pair is a real state (0037 legalizes it on purpose: the CHECK
 * fires only when both ends are present), and it reads the way the app's other
 * one-sided age copy already reads — `ages 5 and up` / `ages 3 and under`.
 * THAT AGREEMENT IS STRUCTURAL: `places.placeAgeFitLabel` (the place page's
 * "Best for ages …" line, over this exact shape) is `'Best for ' + this seam`,
 * so the two spellings of one row's band cannot drift apart. (places.ts imports
 * this module and this module imports nothing from places.ts — no cycle.)
 */
export function statedAgeRangeLine(
  ageMin: number | null | undefined,
  ageMax: number | null | undefined,
): string | null {
  const min = typeof ageMin === 'number' && Number.isFinite(ageMin) ? ageMin : null
  const max = typeof ageMax === 'number' && Number.isFinite(ageMax) ? ageMax : null
  if (min === null && max === null) return null
  if (min === null) return `ages ${max} and under`
  if (max === null) return `ages ${min} and up`
  return ageBoundsLine({ min, max })
}

/**
 * THE PRECEDENCE (ticket pin T5): what a drop-in's age line says, given both
 * sources. The host's explicit statement wins over the derived range — "the
 * parent said so out loud" — and the derived range answers only when nothing
 * was stated. Neither → null (the card renders no line at all, never an empty
 * one and never a stray separator).
 *
 * One seam, both surfaces: the feed card and the detail page's "Kids coming"
 * line call this (the latter through kidsComingLine, which takes its range).
 */
export function playdateAgeRangeLine(input: {
  /** playdates.age_min — absent pre-0037 (the `*` select carries it after). */
  ageMin?: number | null
  /** playdates.age_max — absent pre-0037. */
  ageMax?: number | null
  /** The host's picked kids' ages (db.kidAgesByPostForPosts). */
  kidAges?: ReadonlyArray<number | null | undefined>
}): string | null {
  const stated = statedAgeRangeLine(input.ageMin, input.ageMax)
  if (stated !== null) return stated
  return ageRangeLine(input.kidAges ?? [])
}

/**
 * THE CARD'S LABEL for one row, given that row's batched kid ages: the
 * precedence seam above, applied to a row's own age_min / age_max columns.
 *
 * It exists so every surface that renders a DropInCard runs ONE rule rather
 * than three copies of one: the feed (`FeedPage`), a place's list
 * (`PlacePage`) and a family's lists (`UserPage`) all call this with their own
 * batched read's slice. The stated pair rides the row's own `*` select (free);
 * the derived ages come from ONE batched read per surface — never one query per
 * card.
 */
export function cardAgeRangeLabel(
  post: { age_min?: number | null; age_max?: number | null },
  kidAges: ReadonlyArray<number | null | undefined>,
): string | null {
  return playdateAgeRangeLine({
    ageMin: post.age_min,
    ageMax: post.age_max,
    kidAges,
  })
}

/**
 * The "Ages (optional)" chips of /new (V9 ticket 05) — ONE list, so the row,
 * the stored pair and the unit tests cannot disagree. `All ages` is stored as
 * the full kid domain rather than as "no answer": a chip the parent pressed is
 * an answer, and it must still be an answer after a reload (null/null is
 * exactly what "nothing stated" is, and the derived range would then win).
 */
export const AGE_RANGE_CHIPS = [
  { label: '0–2', min: 0, max: 2 },
  { label: '2–5', min: 2, max: 5 },
  { label: '5–8', min: 5, max: 8 },
  { label: '8–12', min: 8, max: 12 },
  { label: 'All ages', min: KID_AGE_MIN, max: KID_AGE_MAX },
] as const

/**
 * The age_min / age_max INSERT keys — present ONLY when the host actually
 * picked a chip (the neighborhoodIdField / seriesIdField / placeIdField
 * pattern), and both or neither (a half-pair would store a range with one end
 * missing).
 *
 * This is what keeps an ORDINARY post's payload untouched by 0037: a post
 * whose host picked no chip never names either column, so it posts exactly as
 * it did before the migration — which is why the DERIVED half of
 * e2e/feed-ages is green before 0037 is applied, while the chips half fails
 * at the documented point (42703 on the missing column) and only there.
 */
export function ageRangeFields(
  ageMin?: number | null,
  ageMax?: number | null,
): { age_min?: number; age_max?: number } {
  if (ageMin === null || ageMin === undefined) return {}
  if (ageMax === null || ageMax === undefined) return {}
  return { age_min: ageMin, age_max: ageMax }
}

/**
 * One kid's own label, where the NAME MAY BE ABSENT (V9 ticket 05: a first
 * name is optional — "names are optional and when people start to put names
 * like some people get weird about that"). "Bernie · Age 6" when both are known,
 * "Bernie" for a name with no age, "Age 6" for an age with no name — never
 * " · 6" (the dangling separator that reads as a rendering bug) and never the
 * word "null". A named kid with an age now includes the "Age" prefix:
 * "Bernie · Age 6" (V15 T05 A13). Nothing at all → '' (the caller decides what, if anything, to
 * render).
 */
export function kidLabel(
  name: string | null | undefined,
  age: number | null | undefined,
): string {
  const trimmed = (name ?? '').trim()
  const hasAge = typeof age === 'number' && Number.isFinite(age)
  if (trimmed !== '' && hasAge) return `${trimmed} · Age ${age}`
  if (trimmed !== '') return trimmed
  if (hasAge) return `Age ${age}`
  return ''
}

/** Upper-case the first character (the detail line heads its own sentence). */
function capitalizeFirst(line: string): string {
  return line.charAt(0).toUpperCase() + line.slice(1)
}

// ---------------------------------------------------------------------------
// V3 slice 6 (ticket 09): the detail page's "Kids coming" line.

/**
 * The detail page's "Kids coming" line (V3 slice 6, ticket 09, migration
 * 0022), AGES-FIRST as of V9 ticket 05: "Ages 3–6 · Bernie, Lily" — the range
 * the parent actually needs, then the names, and "names last" is the whole
 * point of the ticket.
 *
 * What changed from the names-first line it replaced ("Bernie · 6, Lily · 4")
 * and why, in one place:
 *   * the ages are ONE RANGE over every kid (ageRangeLine), not an age glued
 *     to each name. The per-kid pair was the only place a host's kids' ages
 *     appeared at all, and it buried the decision the parent is making ("is
 *     this the right age crowd?") behind a list of names.
 *   * `rangeLine` — the caller may hand the AUTHORITATIVE range in (the
 *     precedence seam's output, so a host who stated "ages 2–5" out loud reads
 *     that here too; the feed card and this line then cannot disagree).
 *     Omitted, the range is derived from these kids' own ages.
 *   * a kid with NO NAME still renders, as the range (T3): the old filter
 *     (`kid.name.trim() !== ''`) dropped a nameless kid entirely, so an
 *     age-only kid would have been invisible on the one line that names them.
 *   * no kids and no range → null (the line is hidden — "Kids coming:" with
 *     nothing after is not a state, like a 0 going line). No kids WITH a
 *     stated range → "Ages 2–5": the host said what crowd is coming even
 *     though they listed no kid, and that is exactly the no-kids case the
 *     chips exist for.
 *
 * Kids are joined with ", " in INPUT ORDER (the caller orders by name — db.
 * listPlaydateKidNamesWithClient sorts the rows and the detail page hands them
 * over as-is; this seam never re-sorts). Names + ranges ONLY — no photos (the
 * kid-photo pin: photos render only in the profile kids list, never on the
 * event line). Pure + unit-tested.
 */
export function kidsComingLine(
  kids: ReadonlyArray<{ name: string; age: number | null }>,
  rangeLine: string | null = null,
): string | null {
  // An EMPTY range string is "nothing to say", not a part: `''` would otherwise
  // join as a leading separator (" · Bernie" — the dangling-separator class this
  // ticket is about; unreachable from the app today, since every producer
  // returns null or a real range, and guarded here so it stays that way).
  const range = rangeLine !== null && rangeLine.trim() !== '' ? rangeLine : null
  const ages = range ?? ageRangeLine(kids.map((kid) => kid.age))
  const names = kids
    .map((kid) => kid.name.trim())
    .filter((name) => name !== '')
    .join(', ')
  const parts: string[] = []
  if (ages !== null) parts.push(capitalizeFirst(ages))
  if (names !== '') parts.push(names)
  if (parts.length === 0) return null
  return parts.join(' · ')
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
 * the neighborhood the post used — '' when it had none, which since V9
 * ticket 01 is the ordinary case (every seeded place has a NULL
 * neighbourhood, and /new no longer asks). The chip's REAL payload is the
 * place + its address; the neighbourhood rides along unchanged for the paths
 * that still carry one.
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
 *
 * V9 ticket 01: the row's `neighborhood_id` is nullable and maps to '' — the
 * chip still works on BOTH paths (a remembered free-text place, and a
 * remembered picked place, whose neighbourhood was NULL all along).
 */
export function recentPlacesFrom(
  rows: ReadonlyArray<{
    place: string
    address: string | null
    neighborhood_id: string | null
  }>,
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
      neighborhoodId: row.neighborhood_id ?? '',
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

/**
 * The ONE row the "Post again" chip clones from (V10 ticket 01), against an
 * injected client (the queryRecentOwnPlacesWithClient pattern — mocked in
 * feed.test.ts).
 *
 * NEWEST BY START, not by created_at: "post again" means the plan the parent
 * most recently PUT ON THE CALENDAR — a series occurrence created ahead of
 * time, or a duplicate posted out of order, would make created_at lie about
 * "the last thing I did". The id is the tiebreak for two posts starting at
 * the same instant (the order clause needs a total order to be deterministic).
 *
 * `status` is deliberately NOT filtered: a cancelled post is still the last
 * plan the parent made, and a clone the parent then edits or re-cancels is
 * harmless — the chip is an offer, the parent taps Post themselves. The
 * playdates SELECT policy is open to any authenticated user; the
 * .eq(host_profile_id) is the scoping.
 *
 * The kid ids ride along as ONE embed (the 0022 attachment table; the
 * `playdate_kids(kid_id)` embed is a plain LEFT join — a post with no kids
 * comes back with an empty array, which is exactly the chip's "no kids" case;
 * the PGRST201 lesson does not apply, playdate_kids has one FK to playdates).
 */
export async function queryLastOwnPlaydateWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<unknown | null> {
  const { data, error } = await client
    .from('playdates')
    .select(
      'id, title, place, neighborhood_id, starts_at, ends_at, details, address, playdate_kids(kid_id)',
    )
    .eq('host_profile_id', profileId)
    .order('starts_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
  if (error) throw error
  const rows = (data ?? []) as unknown[]
  return rows.length > 0 ? rows[0] : null
}

/**
 * The user's past posts for the "Post again" picker (V13 ticket 04): every
 * post the parent has made, newest by START (the same ordering as
 * queryLastOwnPlaydateWithClient — a series occurrence created ahead of time
 * would make created_at lie about "the last thing I did"), with status and
 * the playdate_kids embed so the picker can render labels and pre-fill kids.
 *
 * `status` is deliberately NOT filtered: ended and cancelled posts stay in
 * the list (AC3) — they are still plans the parent made, and duplicating one
 * is harmless (the clone is a new post; the parent taps Post themselves).
 */
export async function queryPastOwnPlaydatesWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<unknown[]> {
  const { data, error } = await client
    .from('playdates')
    .select(
      'id, title, place, neighborhood_id, starts_at, ends_at, details, address, status, playdate_kids(kid_id)',
    )
    .eq('host_profile_id', profileId)
    .order('starts_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown[]
}

/**
 * The picker row's status label (V13 ticket 04): 'ended' → "Ended",
 * 'cancelled' → "Cancelled", anything else (including missing, the
 * pre-0016 discipline) → null (no label — an 'on' post needs no chip).
 * Mirrors DropInCard's own rendering so the two sites cannot drift.
 */
export function pastPostStatusLabel(status: PlaydateStatus | undefined | null): string | null {
  if (status === 'ended') return 'Ended'
  if (status === 'cancelled') return 'Cancelled'
  return null
}

// ---------------------------------------------------------------------------
// V8 ticket 02: the first visit that is not a dead end — the empty-radius
// copy + escape hatches, and the visibility-refresh gate.

/**
 * The empty-radius copy (V8 ticket 02), shared by the feed ("Near you") and
 * Browse so the two screens can never drift apart.
 *
 * Two lies were in the old string ("Nothing happening near you today — post
 * the first one."): the list is not "today" (it is whatever has not ended
 * yet — V9 ticket 04 moved the feed's cutoff from start-of-today to now, and
 * `filterFeed` drops only ENDED posts either way), and it named no radius —
 * so a parent on the 5-mile default had no idea that 35 was even possible. N
 * is the VIEWER's actual radius: the number the filter just used, which is
 * the only honest one to quote.
 *
 * Always plural by construction (radius options are 2/5/10/20/35, and the DB
 * CHECK is 2–35), so there is no "1 miles" case to guard.
 */
export function emptyRadiusCopy(radiusMiles: number): string {
  return `Nothing within ${radiusMiles} miles yet.`
}

/**
 * The archive link's one label (V9 ticket 04): "See past drop-ins".
 *
 * ONE constant behind the feed's day-sections archive line in FeedPage, so the
 * e2e spec asserts the link against the SAME string the app renders rather than
 * a copy of it (the `emptyRadiusCopy` / `formatTimeWindow` discipline).
 * V13 ticket 05 (A1) removed the empty-radius state's archive link — the
 * RadiusEmptyState no longer carries it; the day-sections line is the only
 * remaining consumer.
 *
 * WHAT IT IS ALLOWED TO IMPLY (the ticket's honesty pin): the link says where
 * the past ones ARE, never that there are any. It is deliberately not "See
 * your past drop-ins (3)" — the feed does not read the viewer's history.
 */
export const PAST_DROP_INS_LABEL = 'See past drop-ins'

/**
 * Where the archive link goes.
 *
 * V16 t04: this was the constant `/profile`, because the viewer's Past list
 * lived in the "Hosted drop-ins" card on /profile. That card is GONE, so the
 * old value pointed at a page that no longer lists past drop-ins at all — the
 * link's label promised a list its destination did not render. The archive
 * surface is now the viewer's OWN public page (`/u/<handle>`), whose "Hosted
 * drop-ins" section carries the same Upcoming/Past split.
 *
 * It is a FUNCTION of the handle rather than a constant because the handle is
 * per-viewer state, not a fixed route. A null/empty handle falls back to
 * `/profile` (the editor still exists) so the link is never a dead href.
 */
export function pastDropInsHref(handle: string | null | undefined): string {
  const trimmed = (handle ?? '').trim()
  return trimmed === '' ? '/profile' : `/u/${encodeURIComponent(trimmed)}`
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
 * unit-tested; V11 ticket 01 added the narrow escape): "Back to 5 miles"
 * (only when the current radius is wider than the 5-mile default),
 * "Widen to 20 miles", and "See everything in Seattle" (35 mi, the max).
 *
 * All three call the EXISTING `updateHomeZipRadius` write path — this seam
 * only decides which controls render, so the page stays a thin call site.
 *
 * A candidate equal to the viewer's current radius is dropped: at 20 miles,
 * "Widen to 20 miles" would be a no-op button, which is just a second dead
 * end wearing a control's clothes. The narrow escape is its mirror: it is
 * offered only strictly BETWEEN the default and the max (at 5 you are already
 * there; at the 35-mile max the list is empty and the empty state is honestly
 * terminal — the radius ceiling is the whole discovery surface, and
 * narrowing can never surface what 35 already did not). The "Post a
 * drop-in" CTA remains either way.
 *
 * The list returns ascending (5, 20, 35) so narrow-first reads naturally.
 */
export function radiusEscapes(radiusMiles: number): RadiusEscape[] {
  const escapes: RadiusEscape[] = []
  if (radiusMiles > DEFAULT_RADIUS_MILES && radiusMiles < SEE_ALL_RADIUS_MILES) {
    escapes.push({ radiusMiles: DEFAULT_RADIUS_MILES, label: `Back to ${DEFAULT_RADIUS_MILES} miles` })
  }
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

// ---------------------------------------------------------------------------
// V8 ticket 03: "While you were away" — the feed-top inbox.
//
// Lives here (not in trust.ts) for the same reason groupByDay / buildGoingLine
// do: this is FEED render-grouping — a pure order/group/cap decision over row
// sets the feed has already read. trust.ts owns permissions and validation
// (planPing, planCommentAction, validateCommentBody), which is a different
// question.
//
// The cursor is the EXISTING one (profiles.last_seen_at, 0024) — no new
// "read" flag, no new cursor: opening the inbox restamps it (FeedPage's
// awaited restampLastSeen + refresh, the V3 slice 9 path).

/** The inbox's item cap (V8 ticket 03 pin: up to 3 items + a "+N more" line). */
export const WHILE_AWAY_ITEM_LIMIT = 3

/** The three kinds of news, in the order they render (V8 ticket 03 pin). */
export type WhileAwayItemKind = 'cancelled' | 'pings' | 'comments'

/** One of the viewer's own posts (the pings/comments kinds' title source). */
export interface WhileAwayMyPost {
  id: string
  title: string | null
}

/**
 * One ping on one of the viewer's own posts — structurally the same row
 * db.listPingsForPostsWithClient returns (the 0020 created_at + the pinger's
 * display_name/avatar_url through the existing gated embed), flattened so the
 * page can pass the rows straight through.
 */
export interface WhileAwayPingRow extends GoingPinger {
  playdateId: string
  createdAt: string
}

/** One visible comment on one of the viewer's own posts. */
export interface WhileAwayCommentRow {
  playdateId: string
  createdAt: string
}

/**
 * One post the VIEWER pinged, with its post row when it is readable. Every
 * field except `playdateId` is null when the row is NOT readable (the post was
 * deleted, or RLS does not hand it back) — the join tolerates a missing row
 * (the 0008 nullable-ref discipline) and the item still renders.
 */
export interface WhileAwayPingedPostRow {
  playdateId: string
  title: string | null
  /** `null` = the post row is unreadable (gone) — the item still renders. */
  status: string | null
  startsAt: string | null
}

/** Everything the inbox is built from (all four reads, one call site). */
export interface WhileAwayInputs {
  /** The retention cursor (profiles.last_seen_at). null = no baseline yet. */
  sinceIso: string | null
  /** Now — the "is this drop-in still ahead of me" gate for cancellations. */
  nowIso: string
  /** The viewer's own posts (id + title), the pings/comments title source. */
  myPosts: ReadonlyArray<WhileAwayMyPost>
  /** ALL pings on the viewer's own posts — this seam applies the cursor. */
  pingsOnMyPosts: ReadonlyArray<WhileAwayPingRow>
  /** Visible comments on the viewer's own posts — the cursor applies here too. */
  commentsOnMyPosts: ReadonlyArray<WhileAwayCommentRow>
  /** The posts the viewer pinged (status/upcoming decide the cancellation kind). */
  pingedPosts: ReadonlyArray<WhileAwayPingedPostRow>
}

/** One renderable line of the inbox. */
export interface WhileAwayItem {
  kind: WhileAwayItemKind
  /** The post the item taps through to (/playdate/:id) — also the dedupe key. */
  playdateId: string
  /** The post's title when the row was readable; null = the fallback copy. */
  title: string | null
  /** The kind's count (pings / comments; 1 for a cancellation). */
  count: number
  /** The pings kind's faces (newest first, at most GOING_CIRCLE_LIMIT). */
  faces: GoingPinger[]
  /** The one-line copy (verbatim template — the caller renders it as-is). */
  label: string
}

/** The card's whole render input: the capped items + the "+N more" count. */
export interface WhileAwayInbox {
  items: WhileAwayItem[]
  /** Distinct items beyond the cap ("+N more"); 0 = no line. */
  moreCount: number
}

/** `"<title>"` when the post row was readable, else null (the fallback copy). */
function quotedTitle(title: string | null): string | null {
  const trimmed = (title ?? '').trim()
  return trimmed === '' ? null : `"${trimmed}"`
}

/**
 * `N families are going to "<title>"` — and, at exactly 1, the singular the
 * ticket pins ("1 family is going to…": the plural template would read
 * "1 families"). A post whose title is unreadable falls back to "your drop-in"
 * rather than rendering `"null"` or an empty pair of quotes.
 */
function whileAwayPingsLabel(count: number, quoted: string | null): string {
  const subject = quoted ?? 'your drop-in'
  return count === 1
    ? `1 family is going to ${subject}`
    : `${count} families are going to ${subject}`
}

/**
 * `N new comments on "<title>"` — with the same singular treatment as the
 * families line ("1 new comments on…" is the same broken English the ticket
 * called out for the family case, so the 1 case reads "1 new comment on").
 */
function whileAwayCommentsLabel(count: number, quoted: string | null): string {
  const subject = quoted ?? 'your drop-in'
  return count === 1 ? `1 new comment on ${subject}` : `${count} new comments on ${subject}`
}

/**
 * `"<title>" was cancelled — you said you'd go`, and the generic subject used
 * when the post row is gone (a deleted post has no title to quote — the item
 * must still render, never crash).
 */
function whileAwayCancelledLabel(title: string | null): string {
  const quoted = quotedTitle(title)
  if (quoted === null) return "A drop-in you pinged was cancelled — you said you'd go"
  return `${quoted} was cancelled — you said you'd go`
}

/** The item's sort key (larger = later). A malformed/absent time sorts last. */
function timeOrInfinity(iso: string | null): number {
  if (iso === null) return Number.POSITIVE_INFINITY
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms
}

/** One candidate + its sort key (internal to buildWhileAwayItems). */
interface WhileAwayCandidate {
  at: number
  item: WhileAwayItem
}

/**
 * Ascending by `at`, ties broken by post id — a STABLE order, so two items
 * with the same timestamp can never swap places between renders (the query
 * order is not part of the contract).
 */
function byAtAscending(a: WhileAwayCandidate, b: WhileAwayCandidate): number {
  if (a.at !== b.at) return a.at - b.at
  return a.item.playdateId < b.item.playdateId
    ? -1
    : a.item.playdateId > b.item.playdateId
      ? 1
      : 0
}

/** Descending by `at`, the same id tie-break. */
function byAtDescending(a: WhileAwayCandidate, b: WhileAwayCandidate): number {
  return byAtAscending(b, a)
}

/**
 * The "While you were away" inbox (V8 ticket 03) — the feed-top card's whole
 * decision, pure + unit-tested: which news is NEW, how it groups, what it says,
 * how it orders, and where it is capped.
 *
 * - NEW = strictly after the cursor (`sinceIso`, the 0024 profiles.last_seen_at).
 *   A row exactly AT the cursor was already seen; a null cursor (no baseline
 *   yet — the first visit establishes it via the restamp) is no news at all.
 * - KINDS, in render order: a cancellation first (the one thing that must not
 *   be missed), then new pings on the viewer's own posts (newest post first),
 *   then new comments on the viewer's own posts (newest post first). Pings and
 *   comments group PER POST — one item per post, with its count ("2 families…")
 *   and, for pings, the newest pingers' faces.
 * - DEDUPE: one item per post, so a post that is both pinged and commented
 *   appears ONCE, keeping the highest-priority kind (cancelled > pings >
 *   comments). The detail page carries the rest.
 * - CAP: at most `limit` items; everything beyond collapses into `moreCount`
 *   (the "+N more" line).
 *
 * CANCELLATIONS ARE NOT CURSOR-GATED — they are gated on the drop-in still
 * being AHEAD (`startsAt` in the future): the schema records no cancellation
 * timestamp (playdates has created_at only — 0005/0016 add no status set_at),
 * so "since the cursor" is not answerable for them without a migration, which
 * this ticket forbids. The gate used instead is the one the message is FOR:
 * "don't drive to an empty park" stops mattering once the drop-in's start time
 * has passed, and that is exactly when the item clears itself. A row whose post
 * is unreadable (deleted / not handed back by RLS) can't be dated at all — it
 * is reported as cancelled and never crashes (the ticket's null-title AC).
 */
export function buildWhileAwayItems(
  inputs: WhileAwayInputs,
  limit: number = WHILE_AWAY_ITEM_LIMIT,
): WhileAwayInbox {
  const sinceMs = inputs.sinceIso === null ? null : Date.parse(inputs.sinceIso)
  const nowMs = Date.parse(inputs.nowIso)
  /** Strictly after the cursor (the "already seen" boundary is inclusive). */
  const isNew = (iso: string): boolean => {
    if (sinceMs === null || Number.isNaN(sinceMs)) return false
    const ms = Date.parse(iso)
    return !Number.isNaN(ms) && ms > sinceMs
  }

  const titleById = new Map<string, string | null>()
  for (const post of inputs.myPosts) titleById.set(post.id, post.title)

  const candidates: WhileAwayCandidate[] = []
  /** The dedupe key set — first (highest-priority) kind wins. */
  const claimed = new Set<string>()

  // 1. Cancellations: a drop-in the viewer said they'd go to that is now
  // cancelled — soonest start first (the most urgent "don't drive there").
  for (const row of inputs.pingedPosts) {
    const unreadable = row.status === null
    if (!unreadable && row.status !== 'cancelled') continue
    // Still ahead of the viewer (a readable row only; a gone row can't be dated).
    if (!unreadable && row.startsAt !== null && !Number.isNaN(nowMs)) {
      const startsMs = Date.parse(row.startsAt)
      if (!Number.isNaN(startsMs) && startsMs <= nowMs) continue
    }
    if (claimed.has(row.playdateId)) continue
    claimed.add(row.playdateId)
    candidates.push({
      at: timeOrInfinity(row.startsAt),
      item: {
        kind: 'cancelled',
        playdateId: row.playdateId,
        title: row.title,
        count: 1,
        faces: [],
        label: whileAwayCancelledLabel(row.title),
      },
    })
  }
  candidates.sort(byAtAscending)

  // 2. New pings on the viewer's own posts, grouped per post, newest first.
  const pushGrouped = (
    kind: 'pings' | 'comments',
    groupByPost: Map<string, string[]>,
    label: (count: number, quoted: string | null) => string,
    facesByPost: Map<string, GoingPinger[]>,
  ): void => {
    const groups = [...groupByPost.entries()].map(([playdateId, ats]) => {
      const newestFirst = ats.slice().sort((a, b) => Date.parse(b) - Date.parse(a))
      const title = titleById.get(playdateId) ?? null
      const count = newestFirst.length
      return {
        at: Date.parse(newestFirst[0]),
        item: {
          kind,
          playdateId,
          title,
          count,
          faces: facesByPost.get(playdateId) ?? [],
          label: label(count, quotedTitle(title)),
        } satisfies WhileAwayItem,
      }
    })
    groups.sort(byAtDescending)
    for (const group of groups) {
      if (claimed.has(group.item.playdateId)) continue
      claimed.add(group.item.playdateId)
      candidates.push(group)
    }
  }

  const pingRowsByPost = new Map<string, WhileAwayPingRow[]>()
  for (const row of inputs.pingsOnMyPosts) {
    if (!isNew(row.createdAt)) continue
    const rows = pingRowsByPost.get(row.playdateId)
    if (rows === undefined) pingRowsByPost.set(row.playdateId, [row])
    else rows.push(row)
  }
  const pingTimesByPost = new Map<string, string[]>()
  const facesByPost = new Map<string, GoingPinger[]>()
  for (const [playdateId, rows] of pingRowsByPost) {
    // Newest ping first — the faces are the most recent families to say yes.
    const newestFirst = rows
      .slice()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    pingTimesByPost.set(playdateId, newestFirst.map((row) => row.createdAt))
    facesByPost.set(
      playdateId,
      newestFirst
        .slice(0, GOING_CIRCLE_LIMIT)
        .map((row) => ({ avatarUrl: row.avatarUrl, displayName: row.displayName })),
    )
  }
  pushGrouped('pings', pingTimesByPost, whileAwayPingsLabel, facesByPost)

  const commentTimesByPost = new Map<string, string[]>()
  for (const row of inputs.commentsOnMyPosts) {
    if (!isNew(row.createdAt)) continue
    const times = commentTimesByPost.get(row.playdateId)
    if (times === undefined) commentTimesByPost.set(row.playdateId, [row.createdAt])
    else times.push(row.createdAt)
  }
  pushGrouped('comments', commentTimesByPost, whileAwayCommentsLabel, new Map())

  const cap = Math.max(0, Math.floor(limit))
  const items = candidates.slice(0, cap).map((candidate) => candidate.item)
  return { items, moreCount: candidates.length - items.length }
}

// ---------------------------------------------------------------------------
// V8 ticket 04: real post lists on /u/:handle and /profile.
//
// A profile's posts render as two lists — what is still ahead of the visitor
// ("Upcoming") and what already happened ("Past"). Both pages read rows that
// arrive already ordered (the DB query orders each section for its cap's sake;
// /profile reads the caller's own rows newest-first) and both must agree on the
// boundary AND the order, so the split is ONE pure seam here rather than a
// per-page filter chain. It lives in feed.ts for the same reason groupByDay /
// buildWhileAwayItems do: this is feed render-grouping — an order/split decision
// over rows the page has already read.

/** The two profile post lists (V8 ticket 04). */
export interface PostPartition<T> {
  /** Not ended yet, soonest first (the one to join). */
  upcoming: T[]
  /** Ended, most recent first (the social proof of history). */
  past: T[]
}

/**
 * Split a host's posts into the Upcoming / Past lists (V8 ticket 04), pure +
 * unit-tested.
 *
 * UPCOMING = NOT ended (`ends_at > nowIso`) — exactly the complement of the
 * existing `isEnded`. That is deliberate, and it is not the same as
 * `starts_at >= nowIso`:
 * - A drop-in that is HAPPENING RIGHT NOW (started, not ended) is something a
 *   visitor can still walk to — "we're at the park right now" is the app's core
 *   gesture, and DropInCard badges exactly that post "Happening now". Filing it
 *   under "Past" would contradict the card the section renders.
 * - The pinned empty state ("posts exist but none upcoming → 'Nothing coming up
 *   — past drop-ins below.'") must be TRUE. Under a start-time boundary, a
 *   profile whose only post is live right now would announce "nothing coming up"
 *   directly above that live post.
 * Both pinned boundary cases hold: a post starting exactly at `nowIso` is
 * upcoming (its end is later — the end is always computed as start + a positive
 * duration, and the /new validator only accepts those chips), and an ended post
 * (`ends_at <= nowIso`, the `isEnded` boundary the card's muted styling uses) is
 * past. So the split lines up with the card exactly: every Past card is muted
 * (opacity-60 + the "Ended" chip) and no Upcoming card is.
 *
 * V12 t03 (migration 0041) adds a SECOND reason to be Past: a host who ENDED
 * the event early (status 'ended', the third status option) files it under
 * Past even while its window has not passed — the "ended" label is honest
 * history (option A), distinct from "cancelled". The constraint's `status` is
 * OPTIONAL (pre-0016 rows and the while-away unreadable shape omit it); a
 * missing status reads as 'on', so only an explicit 'ended' value ever pushes
 * a not-yet-time-ended post to Past.
 *
 * ORDER is applied HERE, from the rows the caller has: upcoming ascending by
 * `starts_at` (soonest first), past descending (most recent first). The DB
 * orders its two queries for the cap's sake; this seam is the contract the
 * render depends on, so a differently-ordered input still renders correctly.
 *
 * The caller's array is never mutated (the lists are new arrays; only the
 * shared row objects are re-ordered, inside those new arrays).
 */
export function partitionPostsByTime<
  T extends { starts_at: string; ends_at: string; status?: string | null },
>(
  posts: readonly T[],
  nowIso: string,
): PostPartition<T> {
  const upcoming: T[] = []
  const past: T[] = []
  for (const post of posts) {
    // V12 t03 (0041): a host-early-ended post lands in Past even while its
    // window has not passed — the owner's "ended" label (the card mutes it,
    // the Past list says "Ended"), distinct from "cancelled".
    if (isEnded(post, nowIso) || post.status === 'ended') past.push(post)
    else upcoming.push(post)
  }
  upcoming.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
  past.sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))
  return { upcoming, past }
}

// ---------------------------------------------------------------------------
// V10 ticket 01: "Post again" — the whole last post, one tap. The pure half
// lives here so the clone's values are unit-tested without React or a
// database; db.listLastOwnPlaydate is the fetch.

/**
 * The one row the "Post again" chip clones from — the caller's most recent
 * post (by start, then id — see queryLastOwnPlaydateWithClient), with the
 * kids it announced. `kidIds` are the playdate_kids rows' kid ids; filtering
 * them against the mounted kids list is the PAGE's job (a deleted kid must
 * not resurrect as a ghost chip).
 */
export interface LastOwnPlaydate {
  id: string
  title: string
  place: string
  /** V9 ticket 01: NULL once 0035 lands — '' ("none") in the clone. */
  neighborhood_id: string | null
  starts_at: string
  ends_at: string
  details: string | null
  address: string | null
  kid_ids: string[]
}

/**
 * The raw embed row → the chip's typed payload. Defensive on every nullable
 * (the wire can carry nulls the schema does not promise) and on the embed
 * shape (a post with no kids embeds `playdate_kids: []`; a null embed means
 * the join itself returned nothing, which for a LEFT join is also "no kids").
 */
export function lastOwnPlaydateFrom(row: unknown): LastOwnPlaydate | null {
  if (row === null || typeof row !== 'object') return null
  const r = row as {
    id?: unknown
    title?: unknown
    place?: unknown
    neighborhood_id?: unknown
    starts_at?: unknown
    ends_at?: unknown
    details?: unknown
    address?: unknown
    playdate_kids?: unknown
  }
  if (
    typeof r.id !== 'string' ||
    r.id === '' ||
    typeof r.title !== 'string' ||
    typeof r.place !== 'string' ||
    typeof r.starts_at !== 'string' ||
    typeof r.ends_at !== 'string'
  ) {
    return null
  }
  const kidIds = playdateKidsKidIds(r.playdate_kids)
  return {
    id: r.id,
    title: r.title,
    place: r.place,
    neighborhood_id: typeof r.neighborhood_id === 'string' ? r.neighborhood_id : null,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    details: typeof r.details === 'string' ? r.details : null,
    address: typeof r.address === 'string' ? r.address : null,
    kid_ids: kidIds,
  }
}

/**
 * The clone's VALUES + page-local writes, ready for the page's existing
 * setters (the same invariants as `applyRecentPlace` — the address the chip
 * wrote is the chip's, so a later place-text edit clears it).
 */
export interface CloneLastPostResult {
  values: Pick<
    PlaydateFormValues,
    'title' | 'place' | 'neighborhoodId' | 'startDate' | 'startMinutes' | 'durationMinutes' | 'details'
  >
  /** '' when the post had none — a stale address is worse than none. */
  address: string
  /** Kid ids the clone carries; the page intersects them with its mounted kids. */
  kidIds: string[]
}

/**
 * The TIME rule, as its own seam so the ticket's pinned boundaries are
 * testable without a whole clone:
 *
 * - last post started 15:00, now 14:10 → TODAY 15:00 (the same slot is still
 *   ahead — "post again" means the same time again, not "right now").
 * - last post started 15:00, now 16:10 → TOMORROW 15:00 (today's slot is
 *   gone; tomorrow at the same time is the habitual thing).
 *
 * The DAY is NOW's day (never the stored row's — that post may be days old;
 * "today if still ahead" means today on the parent's clock), and the
 * boundary is inclusive: opening the form at the very minute the group
 * usually meets still offers "same time today".
 *
 * The slot-time-of-day survives even when the stored row is off the grid
 * (legacy rows exist: playdateFormValuesFromPost deliberately never snaps),
 * but a CLONE is a new post through the same form, so the result is snapped
 * to the 30-minute grid — a value the form's own validator would refuse is
 * not something this affordance may write. The day is local (the form's
 * `<input type="date">` shape), DST-agnostic like the rest of the form's
 * clock math.
 */
export function clonedStart(
  lastStartIso: string,
  nowIso: string,
): { startDate: string; startMinutes: number } {
  const last = new Date(lastStartIso)
  const slotMinutes = Math.round((last.getHours() * 60 + last.getMinutes()) / TIME_STEP_MINUTES) *
    TIME_STEP_MINUTES
  const dayMinutes = 24 * 60
  const now = new Date(nowIso)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  if (slotMinutes >= nowMinutes) {
    return { startDate: localDayKey(nowIso), startMinutes: slotMinutes % dayMinutes }
  }
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return { startDate: localDayKey(tomorrow.toISOString()), startMinutes: slotMinutes % dayMinutes }
}

/**
 * The "Post again" clone (V10 ticket 01): the last post's WHOLE plan — place,
 * address, neighbourhood, duration, details, title, kids — with the start
 * moved by `clonedStart` (the same slot again when it is still ahead today,
 * otherwise tomorrow at that time).
 *
 * The title rule is the generated-title contract: the stored title is kept
 * when it fits the form's own cap (the parent's words survive a clone), and
 * REGENERATED from the place when it does not — a title the validator would
 * refuse must never be cloned into the form. Everything else passes the same
 * trim rules the fields themselves apply.
 *
 * Pure: no fetch, no React, no clock — `nowIso` is injected (the
 * fixed-clock test pattern).
 */
export function cloneLastPost(last: LastOwnPlaydate, nowIso: string): CloneLastPostResult {
  const { startDate, startMinutes } = clonedStart(last.starts_at, nowIso)
  const durationRaw = Math.round((Date.parse(last.ends_at) - Date.parse(last.starts_at)) / 60_000)
  const durationMinutes = isDuration(durationRaw) ? durationRaw : 0
  const title = last.title.trim()
  return {
    values: {
      // The generated-title rule: keep the parent's words when they fit the
      // cap, regenerate when they do not (a clone must be POSTABLE — and the
      // form's validator, which the clone's output feeds, refuses >80).
      title: title.length > 0 && title.length <= TITLE_MAX_LENGTH
        ? title
        : generatedTitleFromParts(last.place),
      place: last.place,
      neighborhoodId: last.neighborhood_id ?? '',
      startDate,
      startMinutes,
      durationMinutes,
      details: (last.details ?? '').trim(),
    },
    address: (last.address ?? '').trim(),
    kidIds: last.kid_ids,
  }
}

/**
 * The clone's title fallback. The real `generatedTitle` seam lives in
 * postSummary.ts, which imports places.ts — and places.ts imports feed.ts,
 * so importing it here would close feed → postSummary → places → feed
 * (the exact cycle the module split exists to avoid). This restates the rule
 * for the ONE input the clone has: prefix + trimmed place, capped, never
 * empty, with the same fallback word. The unit tests pin the two together.
 */
function generatedTitleFromParts(place: string): string {
  const name = place.trim()
  if (name === '') return 'Playdate'
  return `Playdate at ${name}`.slice(0, TITLE_MAX_LENGTH)
}
