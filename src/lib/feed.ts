/**
 * Pure, unit-testable feed + posting logic (slice 3).
 *
 * Everything in here is free of React/Supabase so it can be tested without
 * a database or browser (see feed.test.ts). The Supabase-facing wrappers
 * live in db.ts and call these helpers.
 */

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

/** The shape filterFeed needs (Playdate and its joined variants qualify). */
export interface FeedPost {
  neighborhood_id: string
  host_profile_id: string
  starts_at: string
}

/**
 * Filter posts down to the viewer's feed: in a followed neighborhood,
 * starting today or later (client-local midnight), and not hosted by a
 * blocked profile — ordered by starts_at ascending.
 *
 * The DB query in db.ts applies the same rules (the .not() block filter is
 * skipped when the viewer has no blocks); this pure re-filter is the
 * unit-testable guarantee that a blocked host's post can never reach the
 * feed, plus the canonical ordering.
 *
 * `nowIso` is part of the pinned signature (it drives the "happening now"
 * badge in the UI); the filter itself only needs the start-of-today cutoff,
 * so it is intentionally unused here.
 */
export function filterFeed<T extends FeedPost>(
  posts: T[],
  followedNeighborhoodIds: ReadonlySet<string>,
  blockedHostIds: ReadonlySet<string>,
  startOfTodayIso: string,
  nowIso: string,
): T[] {
  void nowIso
  const todayStart = Date.parse(startOfTodayIso)
  return posts
    .filter(
      (post) =>
        followedNeighborhoodIds.has(post.neighborhood_id) &&
        !blockedHostIds.has(post.host_profile_id) &&
        Date.parse(post.starts_at) >= todayStart,
    )
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
}

/** The /new form's field values (datetime-local strings, pre-conversion). */
export interface PlaydateFormValues {
  title: string
  place: string
  neighborhoodId: string
  /** <input type="datetime-local"> value, e.g. "2026-09-04T15:00". */
  startsAt: string
  /** <input type="datetime-local"> value, e.g. "2026-09-04T17:00". */
  endsAt: string
  /** Optional, e.g. "best for 2-5" (advisory only). */
  ageHint: string
  details: string
}

/** Per-field errors for the /new form (a field key absent = valid). */
export type PlaydateFormErrors = Partial<Record<keyof PlaydateFormValues, string>>

/**
 * Validate the /new drop-in form (pinned rules: title required + ≤ 80
 * characters after trim; place required; neighborhood required; start + end
 * required; end after start; age_hint / details optional).
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
  if (values.startsAt.length === 0) {
    errors.startsAt = 'Pick a start time.'
  }
  if (values.endsAt.length === 0) {
    errors.endsAt = 'Pick an end time.'
  }
  if (values.startsAt.length > 0 && values.endsAt.length > 0) {
    const start = Date.parse(values.startsAt)
    const end = Date.parse(values.endsAt)
    if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
      errors.endsAt = 'End has to be after the start.'
    }
  }
  return errors
}