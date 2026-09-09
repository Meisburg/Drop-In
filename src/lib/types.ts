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
   * the client-resized 256px image in the 'avatars' bucket
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
}

/** A drop-in playdate ("at this playground, 3–5, come by if you like"). */
export interface Playdate {
  id: string
  host_profile_id: string
  title: string
  place: string
  neighborhood_id: string
  starts_at: string
  ends_at: string
  /** Advisory only, e.g. "best for 2-5". Nullable. */
  age_hint: string | null
  details: string | null
  /**
   * Set when a moderator hides the post (migration 0009). Null = visible;
   * hidden posts vanish from the feed DB-level and render a hidden state
   * on the detail page. Optional: absent until the live project is past
   * 0009.
   */
  hidden_at?: string | null
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
 */
export interface Kid {
  id: string
  profile_id: string
  first_name: string
  age: number
}

/** A profile with its kids joined in (getProfileByHandle result, V2 ticket 02). */
export interface ProfileWithKids extends Profile {
  kids: Kid[]
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
}

/** A playdate with its neighborhood + host joined in (feed/browse results). */
export interface PlaydateWithNeighborhood extends Playdate {
  neighborhood: Neighborhood
  host: PlaydateHost
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