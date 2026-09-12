/**
 * Shared types, pinned to the data model in plan.md (Interfaces).
 * Supabase column names are used verbatim (snake_case).
 */

/** A parent's public handle + account row. id = Supabase auth user id. */
export interface Profile {
  id: string
  display_name: string
  created_at: string
  /**
   * Moderator flag (migration 0008; the one-time founder flag is manual
   * SQL — see the 0009 header). Optional: absent until the live project
   * is past 0008.
   */
  moderators?: boolean
  /**
   * Set when a moderator bans the profile (migration 0009). The session
   * gate (useSession) rejects banned profiles. Optional: absent until the
   * live project is past 0009.
   */
  banned_at?: string | null
  /**
   * The profile's avatar (V2 ticket 02, migration 0011): the public URL of
   * the client-resized 512px image in the 'avatars' bucket
   * (avatars/<uid>/avatar). Optional: absent until the live project is
   * past 0011.
   */
  avatar_url?: string | null
  /**
   * A short family bio (V2 ticket 02, migration 0011): <= 500 characters,
   * app-capped + the DB backstop. Optional: absent until the live project
   * is past 0011.
   */
  bio?: string | null
  /**
   * The family's home zip (V2 slice 3, migration 0012): the discovery
   * center — the feed shows drop-ins whose host sits within the viewer's
   * radius of this zip (via zip_codes). Nullable: unset until onboarding
   * (or /profile) sets it — the onboarding gate keys on it. Optional:
   * absent until the live project is past 0012.
   */
  home_zip?: string | null
  /**
   * The discovery radius in miles (V2 slice 3, migration 0012): 2–35,
   * default 5; the app offers the pinned options 2/5/10/20/35. Optional:
   * absent until the live project is past 0012.
   */
  radius_miles?: number
  /**
   * The family's interests (V3 slice 6, ticket 09, migration 0022):
   * <= 200 characters, app-capped (no DB CHECK — the 0021 address
   * lesson). Shown as an interests line under the bio on /u/:handle.
   * Optional: absent until the live project is past 0022 (undefined at
   * runtime — the render is null-safe).
   */
  interests?: string | null
  /**
   * The retention cursor (V3 slice 9, ticket 04, migration 0024): the
   * feed retention banner counts going_pings created after this
   * instant on the profile's OWN posts. Restamped by the app (FeedPage
   * mount when null or >= 1h stale, fire-and-forget; NO trigger — the
   * 0024 header). Optional — absent until 0024 is applied live
   * (undefined at runtime — the banner treats absence as no cursor
   * yet, the pre-0016 status-column discipline).
   */
  last_seen_at?: string | null
}

/**
 * The host's status for a drop-in (V3 slice 2, ticket 02, migration 0016;
 * trimmed by V3 slice 3, ticket 06, migration 0019): 'on' is the default;
 * 'cancelled' mutes the card + detail. V3/02's pin was "the event STAYS in
 * the feed — the host can revert; no auto-expiry"; V9 ticket 04 SUPERSEDED
 * half of it (recorded in that ticket's Comments): a cancellation with a
 * FUTURE end still stays, but a cancelled post whose window has ENDED leaves
 * `/` with every other ended drop-in — the feed's cutoff is time-based and
 * does not ask why a row is over. The status VALUE and its muted states are
 * unchanged. The third status option (redundant with Cancelled) was removed per
 * origin-user feedback 2026-09-09 (feedback/v3.md #5); the Open-Meteo "Rain
 * likely" badge is an independent forecast, not a status state.
 * Authenticated-only surface: 0015's get_public_playdate (the signed-out public
 * view) does NOT return it.
 */
export type PlaydateStatus = 'on' | 'cancelled'

/** A drop-in playdate ("at this playground, 3–5, come by if you like"). */
export interface Playdate {
  id: string
  host_profile_id: string
  title: string
  place: string
  /**
   * The parent's neighbourhood, when we know it. V9 ticket 01 (migration
   * 0035) makes it NULLABLE: /new stopped asking (the place pick fills it only
   * for a place that carries one, and every seeded place carries none), so a
   * new post normally has none. The FK stays `on delete restrict`, no RLS
   * policy changed, and every existing row keeps its value.
   */
  neighborhood_id: string | null
  starts_at: string
  ends_at: string
  /** Advisory only, e.g. "best for 2-5". Nullable. */
  age_hint: string | null
  details: string | null
  /**
   * The host's status (V3 slice 2, ticket 02, migration 0016; trimmed to
   * 'on' | 'cancelled' by 0019, ticket 06): 'on' is the DB default;
   * 'cancelled' renders the muted states. Pre-0016-apply the `*` selects
   * omit the column (undefined at runtime — the UI treats missing as 'on').
   */
  status: PlaydateStatus
  /**
   * Set when a moderator hides the post (migration 0009). Null = visible;
   * hidden posts vanish from the feed DB-level and render a hidden state
   * on the detail page. Optional: absent until the live project is past
   * 0009.
   */
  hidden_at?: string | null
  /**
   * The post's street address (V3 slice 5, ticket 08, migration 0021):
   * optional (null when the host didn't type one); the /new field's cap
   * is <=120 chars, trim only (no DB CHECK). When present, the detail
   * page's place line becomes a tappable Google Maps link (the signed-out
   * public view too — the 0021 12-field payload). Optional: absent until
   * the live project is past 0021 (undefined at runtime — the UI treats
   * missing as no address, the pre-0016 status discipline).
   */
  address?: string | null
  /**
   * The series this post is one occurrence of (V8 ticket 06, migration
   * 0028): null/absent = a one-off post. Set on every occurrence — including
   * the first, which the host creates through /new — and NEVER nulled by
   * "Stop repeating" (that flips playdate_series.active; the weeks already
   * posted stay as ordinary posts). Optional: absent until the live project
   * is past 0028 (undefined at runtime — no `· weekly` marker renders).
   */
  series_id?: string | null
  /**
   * The place this post is at (V8 ticket 07, migration 0030): null/absent =
   * a free-text place ("Somewhere else"), which stays fully supported. Set
   * when the parent PICKED a place from the directory — and it is what moves
   * the post's location onto the place's own coordinates (the distance-model
   * fix; feed.postDistanceMiles). Optional: absent until the live project is
   * past 0030 (undefined at runtime — the render shows no place link).
   */
  place_id?: string | null
}

/**
 * A standing weekly playdate (V8 ticket 06, migration 0028): the RULE
 * ("every Saturday, 10:00, in this zone"), not an event. Its occurrences are
 * ordinary `playdates` rows carrying its id, which is why the whole rest of
 * the app (feed, pings, guest list, kids, comments, ICS, share, public view)
 * needs no knowledge of this table at all.
 *
 * The time is WALL CLOCK in `timezone` — never a stored UTC instant: a
 * 10:00 AM series stays 10:00 AM across both DST transitions (the pinned
 * correctness rule; src/lib/series.ts is the pure seam).
 */
export interface PlaydateSeries {
  id: string
  host_profile_id: string
  title: string
  place: string
  address: string | null
  details: string | null
  /**
   * V9 ticket 01 (migration 0035) made this NULLABLE — the same column, and the
   * same decision, as `Playdate.neighborhood_id`: /new stopped asking, and the
   * series row is built from that form, so "Repeat weekly" now creates series
   * with no neighbourhood. The type said `string` until review cycle 1 (F5);
   * it had no runtime effect (the client never dereferences it), which is
   * exactly why it was worth fixing before the next reader trusted it.
   */
  neighborhood_id: string | null
  /** 0 = Sunday … 6 = Saturday (the client derives it from the chosen date). */
  weekday: number
  /** Minutes past LOCAL midnight (the app keeps it on a 30-minute grid). */
  start_minutes: number
  duration_minutes: number
  /** IANA zone name captured in the browser ('UTC' when the device had none). */
  timezone: string
  /** false = "Stop repeating": generation halts, existing occurrences stay. */
  active: boolean
  created_at: string
  /**
   * The place this series meets at (V8 ticket 07, migration 0030): stored so a
   * standing meetup can carry its place, and set by /new when the parent picked
   * one. KNOWN GAP, documented in 0030's header: the 0028 occurrence generator
   * inserts an explicit column list that predates this column, so the weeks it
   * generates carry place_id null while the first occurrence carries the value.
   * Those later occurrences therefore use the host-zip fallback distance.
   * Optional: absent until the live project is past 0030.
   */
  place_id?: string | null
}

/**
 * The ten place kinds the schema allows (the 0029 CHECK constraint, verbatim).
 * `other` is the honest catch-all — a community center is not a playground.
 */
export type PlaceKind =
  | 'park'
  | 'playground'
  | 'indoor_play'
  | 'museum'
  | 'pool'
  | 'splash_pad'
  | 'library'
  | 'beach'
  | 'trail'
  | 'other'

/**
 * A place in the directory (V8 ticket 07, migration 0029): the entity the
 * product's premise assumes — "fun places around the city" — which until now
 * did not exist (a post's `place` was free text, so nothing knew that Green
 * Lake exists).
 *
 * Public infrastructure: `places` is anon-readable (the signed-out detail page
 * links to a place page) and has NO write policy at all — the client never
 * writes a place, the seed is the only writer (postgres/service_role).
 *
 * `lat` / `lng` are NULLABLE in the TYPE even though the 0029 columns are NOT
 * NULL, because the app must tolerate a place whose coordinates it cannot
 * parse (postgrest returns `numeric` as a string). Null means UNKNOWN — never
 * invented, and never a reason to hide the place.
 *
 * `age_min` / `age_max` are null for every seeded row: no source states age
 * ranges. NULL is UNKNOWN, and the "fits my kid's age" filter keeps unknown
 * places (places.placeFitsKidAges).
 */
export interface Place {
  id: string
  name: string
  kind: PlaceKind
  address: string
  lat: number | null
  lng: number | null
  indoor: boolean
  age_min: number | null
  age_max: number | null
  notes: string | null
  /** NULL for every seeded row: third-party photos are never scraped. */
  photo_url: string | null
  /** Null for every seeded row — no source field carries a neighborhood. */
  neighborhood_id: string | null
  /** 'seattle-parks' (the city's open data) or 'hand' (the curated indoor list). */
  source: string
  created_at?: string
}

/** A (seeded) Seattle neighborhood tag. */
export interface Neighborhood {
  id: string
  name: string
}

/** A user's membership in a neighborhood. */
export interface Membership {
  profile_id: string
  neighborhood_id: string
}

/** A membership row with its neighborhood joined in (listMemberships result). */
export interface MembershipWithNeighborhood extends Membership {
  neighborhood: Neighborhood
}

/**
 * A structured kid row (V2 ticket 02, migration 0011): first name + age
 * ONLY — never full names, never gender (privacy pin, plan-v2 Interfaces).
 * V3 slice 6 (ticket 09, migration 0022) adds the optional photo + likes;
 * both are optional fields: absent until the live project is past 0022
 * (undefined at runtime — the renders are null-safe, the pre-0016
 * status discipline).
 */
export interface Kid {
  id: string
  profile_id: string
  first_name: string
  age: number
  /**
   * The kid's photo (V3 slice 6, ticket 09, migration 0022): the public
   * URL of the client-resized 512px image in the 'avatars' bucket at
   * <uid>/kids/<kidId> (the 0011 owner-scoped write policy's documented
   * coverage — the 0022 header). Shown ONLY in the profile kids list
   * (the /u/:handle 40px render) — never on cards or event lines (the
   * kid-photo pin, human-approved 2026-09-09).
   */
  avatar_url?: string | null
  /**
   * The kid's "likes" (V3 slice 6, ticket 09, migration 0022): <= 100
   * characters, app-capped (no DB CHECK — the 0021 address lesson); the
   * conversation-starter line on /u/:handle.
   */
  likes?: string | null
}

/** A profile with its kids joined in (getProfileByHandle result, V2 ticket 02). */
export interface ProfileWithKids extends Profile {
  kids: Kid[]
}

/**
 * One row of the detail page's "Kids coming" line (V3 slice 6, ticket 09,
 * migration 0022): the host's picked kid, mapped to name + age ONLY (the
 * privacy pin; the kid's avatar_url is deliberately NOT selected — the
 * kid-photo pin: photos render only in the profile kids list, never on
 * the event line). `age` null = a defensive gap (the DB column is NOT
 * NULL); the render shows the name only.
 */
export interface PlaydateKid {
  /** The playdate_kids row's id (the embed's join key). */
  id: string
  /** The kid's first name (the 0011 first_name column). */
  name: string
  /** The kid's age (the 0011 age column; null = render the name only). */
  age: number | null
}

/**
 * A user's block: the blocker never sees the blocked user's posts
 * (pinned data model in plan.md Interfaces: unique pair, slice 3
 * migration 0006).
 */
export interface Block {
  blocker_profile_id: string
  blocked_profile_id: string
}

/** The host's public handle, joined into a playdate row (feed results). */
export interface PlaydateHost {
  id: string
  display_name: string
  /** The host's avatar public URL (V2 ticket 02 — the 40px round render). */
  avatar_url?: string | null
  /** The host's home zip (V2 slice 3 — the post's location; the radius filter's key). */
  home_zip?: string | null
  /** The host's discovery radius (V2 slice 3 — informational on the card). */
  radius_miles?: number
}

/**
 * A playdate with its neighborhood + host joined in (feed/browse results).
 *
 * V9 ticket 01 (migration 0035): `neighborhood` is NULLABLE. The parent's
 * neighbourhood stopped being a question on /new, and every seeded place
 * carries a NULL neighbourhood (0029's header), so a post created from this
 * version on has none — the embed is a LEFT JOIN (PostgREST's default, once
 * the `!inner` hint is gone) and yields `null`. Every render site must omit
 * the label rather than print an empty one: `place · window`, never
 * "place · " and never the string "null".
 */
export interface PlaydateWithNeighborhood extends Playdate {
  neighborhood: Neighborhood | null
  host: PlaydateHost
  /**
   * The haversine distance, in miles, from the viewer's home zip to the
   * POST'S LOCATION (V2 slice 3; V8 ticket 07 moved the location onto the
   * place's coordinates — see feed.postDistanceMiles). Computed client-side by
   * the pure feed predicate; set on feed/place results only.
   */
  distanceMiles?: number
  /**
   * The named place's coordinates, stitched onto the row by listRadiusFeed
   * (V8 ticket 07) — the distance model's first leg. Named `place_coords` and
   * not `place` because Playdate.place is the free-text STRING the parent
   * typed. Null/absent when the post names no place or the places read
   * degraded — the host's home zip is then the fallback.
   */
  place_coords?: { lat: number | null; lng: number | null } | null
}

/**
 * A family's optional "we're going" ping for a drop-in (pinned data model in
 * plan.md Interfaces: unique pair). Counts are shown only — the UI never
 * lists per-person attendees.
 */
export interface GoingPing {
  playdate_id: string
  profile_id: string
}

/**
 * A report of a post and/or a profile (pinned data model in plan.md
 * Interfaces). playdate_id is set for a post report, reported_profile_id for
 * a profile report; both are nullable. Visible to moderators only.
 */
export interface Report {
  id: string
  reporter_profile_id: string
  playdate_id: string | null
  reported_profile_id: string | null
  reason: string
  created_at: string
}

/**
 * A public comment on a drop-in (V2 ticket 04, migration 0013): the
 * per-event question thread. body <= 500 chars (the 0013 CHECK is the DB
 * backstop); hidden_at = the moderator soft-hide (the /mod model) — hidden
 * comments are invisible to non-moderators (the 0014 SELECT policy:
 * `hidden_at is null OR moderator`; deletes are hard, hides are soft).
 * V3 ticket 10 (migration 0023): parent_id = the one-level reply parent
 * (null = top-level; a reply answers a top-level comment — the one-level
 * pin is enforced client-side, the DB allows no reply-to-replies UI, and
 * deleting a parent hard-deletes its replies, the FK's ON DELETE CASCADE).
 */
export interface Comment {
  id: string
  playdate_id: string
  author_profile_id: string
  body: string
  created_at: string
  /** Set when a moderator hides the comment (migration 0013). Null = visible. */
  hidden_at: string | null
  /**
   * One-level reply parent (V3 ticket 10, migration 0023): null = a
   * top-level comment; otherwise the top-level comment this reply
   * answers. Pre-0023-apply the DB won't return the field at all — a
   * row missing it behaves as a top-level comment (client code treats a
   * missing value as null).
   */
  parent_id: string | null
}

/** A comment with its author joined in (listComments result, V2 ticket 04). */
export interface CommentWithAuthor extends Comment {
  /** The comment's author (avatar + handle — the 40px round render). */
  author: PlaydateHost
}

/**
 * The /new duplicate-prefill (V2 slice 1, carried as router state on /new):
 * everything from a post EXCEPT the date/time — the start date, start time,
 * and duration are always re-entered by the user (pinned: the end is
 * computed, never typed).
 */
export interface DuplicatePrefill {
  title: string
  place: string
  neighborhoodId: string
  /** Carried over from the source post's (nullable) age_hint; '' = none. */
  ageHint: string
  /** Carried over from the source post's (nullable) details; '' = none. */
  details: string
}

/**
 * The /new PLACE prefill (V8 ticket 07), carried as router state by
 * "Start a drop-in here" on a place page — the DuplicatePrefill pattern: the
 * place page owns the place, /new's route reads the state and hands the page a
 * typed prop, and the page itself stays router-state-agnostic.
 *
 * It fills the same three fields a place pick fills on /new (place, address,
 * neighborhood) plus the place_id that makes the post's location the place's
 * coordinates. `neighborhoodId` is null when the place carries none (every
 * seeded row today) — the parent then picks one, exactly as before.
 */
export interface PlacePrefill {
  placeId: string
  place: string
  address: string
  neighborhoodId: string | null
}

/**
 * The signed-out public surface for one drop-in (V2 slice 5, ticket 05,
 * migration 0015): EXACTLY what the get_public_playdate RPC returns — the
 * post's public fields + the neighborhood display label + the host's
 * handle + avatar + the going count (a count, never the per-person rows).
 * A missing OR hidden post yields null (not-found — a hidden post's
 * existence is not confirmed to a signed-out visitor). No other profile,
 * comment, or ping data crosses to anon (the privacy pin, plan-v2).
 */
export interface PublicPlaydateDetail {
  id: string
  title: string
  place: string
  /**
   * The post's address (V3 slice 5, ticket 08, migration 0021): the 12th
   * public field (the 11 -> 12 pin change — the Maps link renders in the
   * signed-out view). Pre-0021-apply the 11-field payload omits it
   * (undefined at runtime — the render is null-safe: no link).
   */
  address?: string | null
  /**
   * The place this post is at (V8 ticket 07, migration 0030): the 13th public
   * field (the 12 -> 13 pin change). It crosses to anon ONLY as an id — the
   * place's NAME, address, coordinates and every other column stay behind the
   * anon-readable `places` table, which the client reads itself. So the
   * signed-out page can link its place line to /place/:id without a single
   * new place column crossing the RPC. Pre-0030-apply the 12-field payload
   * omits it (undefined at runtime — the place line just does not link).
   */
  place_id?: string | null
  starts_at: string
  ends_at: string
  age_hint: string | null
  details: string | null
  /**
   * V9 ticket 01 (migration 0035): NULL is a legal answer, not an error. The
   * re-created function LEFT JOINs the neighbourhood, so a post with no
   * neighbourhood still returns its 13 fields with this one null instead of
   * the whole RPC returning NULL (which the signed-out view would render as
   * "not found" for a post that plainly exists).
   */
  neighborhood_name: string | null
  host_display_name: string | null
  host_avatar_url: string | null
  going_count: number
}