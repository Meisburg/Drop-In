/**
 * Pure + client-injected moderation logic (slice 5): the /mod route guard,
 * the banned-session gate, and the moderator update round-trip.
 *
 * Pure decisions are free of React/Supabase so they can be tested without a
 * database or browser (see moderation.test.ts, matching the feed.ts /
 * trust.ts convention). The moderator UPDATE takes the SupabaseClient as a
 * parameter (mocked in tests — same pattern as trust.issueReportInsert);
 * the Supabase-facing wrappers (hidePlaydate / banProfile) live in db.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** The shape the /mod route guard needs (Profile and its fetch results qualify). */
export interface ModeratableProfile {
  /** Moderator flag (migration 0008; optional — absent on pre-0008 rows). */
  moderators?: boolean
}

/**
 * The /mod route guard (slice 5 AC: non-moderator cannot reach /mod).
 * True exactly when the profile carries the moderators flag; a missing
 * profile or a missing flag is a no-access.
 */
export function canModerate(profile: ModeratableProfile | null): boolean {
  return profile !== null && profile.moderators === true
}

/** The shape the banned-session gate needs (Profile and its fetch results qualify). */
export interface BannableProfile {
  /** Set when a moderator bans the profile (migration 0009). */
  banned_at?: string | null
}

/**
 * The banned-session gate (slice 5 AC: banned profiles cannot sign in).
 * A profile with banned_at set is rejected — the session is signed out and
 * the shell renders the suspended state; a missing column or null is fine.
 */
export function isProfileBanned(profile: BannableProfile | null): boolean {
  return profile !== null && profile.banned_at != null
}

/** The tables the mod tools update (hide = playdates, ban = profiles). */
export type ModeratorTable = 'playdates' | 'profiles'

/**
 * Issue a moderator update on a plain chain (no .select()).
 *
 * 42501 regression guard (same discipline as trust.issueReportInsert): a
 * .select() on the update chain makes Supabase send UPDATE ... RETURNING,
 * which makes PostgREST SELECT the row under RLS — a plain UPDATE is all
 * the mod tools need (success/failure; the banned user is rejected by the
 * session gate, never by a read-back). The client is injected so a mock
 * can model the live behavior (see moderation.test.ts).
 */
export async function issueModeratorUpdate(
  client: SupabaseClient,
  table: ModeratorTable,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.from(table).update(patch).eq('id', id)
  if (error) throw error
}