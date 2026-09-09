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