/**
 * Shared types, pinned to the data model in plan.md (Interfaces).
 * Supabase column names are used verbatim (snake_case).
 */

/** A parent's public handle + account row. id = Supabase auth user id. */
export interface Profile {
  id: string
  display_name: string
  created_at: string
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