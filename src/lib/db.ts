import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import type {
  MembershipWithNeighborhood,
  Neighborhood,
  Playdate,
  PlaydateWithNeighborhood,
  Profile,
} from './types'
import { filterFeed, startOfTodayIso } from './feed'
import {
  issueReportInsert,
  togglePingWithClient,
  validateReportReason,
  type ReportInsertPayload,
} from './trust'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY (see .env)')
}

/** Shared Supabase client (auth + Postgres via PostgREST). */
export const supabase = createClient(url, anonKey)

export interface SessionState {
  session: Session | null
  /** True until the persisted session has been read. */
  loading: boolean
  /** The signed-in user's profile row (null while loading / signed out). */
  profile: Profile | null
  /** True when the current profile has at least one neighborhood membership. */
  hasMemberships: boolean
  /**
   * Re-fetch profile + membership count for the current user. Await it
   * before navigating after a save (onboarding, profile edits) so the
   * route gates and the app-shell header see fresh state.
   */
  refresh: () => Promise<void>
}

/**
 * Reactive session state, driven by supabase.auth.onAuthStateChange.
 * Use `loading` to avoid redirecting signed-in users before their
 * persisted session is restored.
 *
 * The session layer also tracks the signed-in user's profile + membership
 * count (the onboarding gate and the header handle). Wrap the app in
 * `<SessionProvider>` (src/components/SessionProvider.tsx) and consume the
 * shared instance via `useSessionContext()` so exactly one instance feeds
 * the header, the route gates, and every page.
 */
export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [hasMemberships, setHasMemberships] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setSession(data.session)
        setLoading(false)
      }
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!cancelled) {
        setSession(nextSession)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user?.id ?? null

  /** Re-fetch the current user's profile + membership count (awaitable). */
  const refresh = useCallback(async (): Promise<void> => {
    // Read the session at call time so a sign-out/sign-in mid-flight is
    // honored (and skipped in the guard below if the user changed).
    const {
      data: { session: current },
    } = await supabase.auth.getSession()
    const uid = current?.user?.id ?? null
    if (uid === null) {
      setProfile(null)
      setHasMemberships(false)
      return
    }
    let nextProfile: Profile | null = null
    try {
      nextProfile = await getProfile(uid)
    } catch {
      // profiles table not applied yet / DB error: keep rendering without a
      // profile; individual pages surface their own load errors.
    }
    let nextHasMemberships = false
    try {
      const { count, error } = await supabase
        .from('memberships')
        .select('profile_id', { count: 'exact', head: true })
        .eq('profile_id', uid)
      if (!error) nextHasMemberships = (count ?? 0) > 0
    } catch {
      // memberships table not applied yet / DB error: treat as no
      // memberships, so the onboarding gate behaves once tables exist.
    }
    // Don't clobber state if the signed-in user changed mid-flight.
    const {
      data: { session: after },
    } = await supabase.auth.getSession()
    if (after?.user?.id !== uid) return
    setProfile(nextProfile)
    setHasMemberships(nextHasMemberships)
  }, [])

  useEffect(() => {
    if (userId === null) {
      setProfile(null)
      setHasMemberships(false)
      return
    }
    void refresh()
  }, [userId, refresh])

  return { session, loading, profile, hasMemberships, refresh }
}

export async function signOutUser(): Promise<void> {
  await supabase.auth.signOut()
}

/**
 * Insert the caller's profiles row (id = auth user id).
 * Idempotent: if the caller's row already exists (unique on id), returns it.
 * Throws HandleTakenError when the chosen display_name is already used by
 * another profile (unique on display_name, slice 2 migration 0004).
 */
export async function createProfile(displayName: string): Promise<Profile> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('No authenticated user — cannot create profile.')

  const { data, error } = await supabase
    .from('profiles')
    .insert({ id: user.id, display_name: displayName })
    .select()
    .single()

  if (error) {
    // 23505 = unique_violation. Two constraints can fire on this insert:
    // - profiles_display_name_key: the chosen handle is taken → surface it
    // - profiles_pkey: this user's row already exists → fetch and return it
    if (error.code === '23505' && error.message.includes('profiles_display_name_key')) {
      throw new HandleTakenError(displayName)
    }
    if (error.code !== '23505') throw error
  }
  if (data) return data as Profile

  const existing = await getProfile(user.id)
  if (!existing) throw error
  return existing
}

/** Fetch one profile by id (null if not found / no access). */
export async function getProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as Profile | null) ?? null
}

/** Find a profile by its public display_name handle (null when unknown). */
export async function getProfileByHandle(handle: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('display_name', handle)
    .maybeSingle()
  if (error) throw error
  return (data as Profile | null) ?? null
}

/** All seeded neighborhoods, ordered by name. */
export async function listNeighborhoods(): Promise<Neighborhood[]> {
  const { data, error } = await supabase
    .from('neighborhoods')
    .select('id, name')
    .order('name')
  if (error) throw error
  return (data ?? []) as Neighborhood[]
}

/** One profile's memberships, with the neighborhood name joined in. */
export async function listMemberships(
  profileId: string,
): Promise<MembershipWithNeighborhood[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select('profile_id, neighborhood_id, neighborhood:neighborhoods!inner ( id, name )')
    .eq('profile_id', profileId)
  if (error) throw error
  // Cast via unknown: without generated DB types, the embed is inferred as
  // an array; the !inner hint makes PostgREST return it as a single object.
  const rows = (data ?? []) as unknown as MembershipWithNeighborhood[]
  rows.sort((a, b) => a.neighborhood.name.localeCompare(b.neighborhood.name))
  return rows
}

/**
 * Follow a neighborhood. Idempotent: re-adding an existing membership
 * (23505 on the (profile_id, neighborhood_id) primary key) is success.
 */
export async function addMembership(
  profileId: string,
  neighborhoodId: string,
): Promise<void> {
  const { error } = await supabase
    .from('memberships')
    .insert({ profile_id: profileId, neighborhood_id: neighborhoodId })
  if (error && error.code !== '23505') throw error
}

/** Stop following a neighborhood (no-op when not a member). */
export async function removeMembership(
  profileId: string,
  neighborhoodId: string,
): Promise<void> {
  const { error } = await supabase
    .from('memberships')
    .delete()
    .eq('profile_id', profileId)
    .eq('neighborhood_id', neighborhoodId)
  if (error) throw error
}

/**
 * Update the caller's display_name (the persistent public handle).
 * A unique violation is surfaced as HandleTakenError so the UI can render
 * "that handle is taken".
 */
export async function updateDisplayName(
  userId: string,
  displayName: string,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId)
  if (error) {
    // This update only touches display_name, so any unique violation
    // (23505) is the profiles_display_name_key constraint (migration 0004).
    if (error.code === '23505') throw new HandleTakenError(displayName)
    throw error
  }
}

/** Thrown when a display_name handle is already taken (23505). */
export class HandleTakenError extends Error {
  readonly handle: string
  constructor(handle: string) {
    super(`The handle "${handle}" is already taken.`)
    this.name = 'HandleTakenError'
    this.handle = handle
  }
}

// ---------------------------------------------------------------------------
// Slice 3: playdates (drop-in feed + posting) + blocks.
//
// The playdates table (migration 0005) and blocks table (migration 0006)
// may not exist in the live project until the human applies them via the
// dashboard — every function here throws on that, and the pages render a
// designed error state instead of crashing (same discipline as the
// onboarding load-error).

/**
 * The ids of profiles the given profile has blocked (the blocks table's
 * owner RLS only returns the caller's own rows, so no join to profiles is
 * needed).
 */
export async function listBlockedHostIds(profileId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_profile_id')
    .eq('blocker_profile_id', profileId)
  if (error) throw error
  return (data ?? []).map((row) => row.blocked_profile_id as string)
}

/**
 * Raw upcoming-playdate query: in the given neighborhoods, starting at or
 * after the cutoff, ordered by starts_at. The block filter (a PostgREST
 * .not()) is applied only when the viewer actually has blocks — an empty
 * .not('host_profile_id', 'in', '') would match nothing.
 */
async function queryUpcomingPlaydates(
  neighborhoodIds: string[],
  cutoffIso: string,
  blockedHostIds: string[],
): Promise<PlaydateWithNeighborhood[]> {
  if (neighborhoodIds.length === 0) return []
  let query = supabase
    .from('playdates')
    .select(
      '*, neighborhood:neighborhoods!inner ( id, name ), host:profiles!inner ( id, display_name )',
    )
    .in('neighborhood_id', neighborhoodIds)
    .gte('starts_at', cutoffIso)
    .order('starts_at', { ascending: true })
  if (blockedHostIds.length > 0) {
    query = query.not('host_profile_id', 'in', blockedHostIds.join(','))
  }
  const { data, error } = await query
  if (error) throw error
  // Cast via unknown: without generated DB types, the embeds are inferred
  // loosely (same pattern as listMemberships).
  return (data ?? []) as unknown as PlaydateWithNeighborhood[]
}

/** Query + the pure filterFeed re-filter (defense in depth, unit-tested). */
async function queryAndFilter(
  neighborhoodIds: string[],
  blockedHostIds: string[],
  cutoffIso: string,
): Promise<PlaydateWithNeighborhood[]> {
  if (neighborhoodIds.length === 0) return []
  const posts = await queryUpcomingPlaydates(neighborhoodIds, cutoffIso, blockedHostIds)
  return filterFeed(
    posts,
    new Set(neighborhoodIds),
    new Set(blockedHostIds),
    cutoffIso,
    new Date().toISOString(),
  )
}

/**
 * Today's feed for one profile (the / route): drop-ins in the profile's
 * followed neighborhoods, starting today or later (client-local midnight),
 * excluding posts by blocked hosts, ordered by starts_at.
 */
export async function listTodayFeed(profileId: string): Promise<PlaydateWithNeighborhood[]> {
  const [memberships, blockedIds] = await Promise.all([
    listMemberships(profileId),
    listBlockedHostIds(profileId),
  ])
  return queryAndFilter(
    memberships.map((m) => m.neighborhood_id),
    blockedIds,
    startOfTodayIso(),
  )
}

/**
 * Upcoming drop-ins in the given neighborhoods (the /browse chips),
 * block-filtered by the current user, ordered by starts_at.
 */
export async function listUpcomingByNeighborhood(
  neighborhoodIds: string[],
  startOfTodayIso: string,
): Promise<PlaydateWithNeighborhood[]> {
  const { data: { user } } = await supabase.auth.getUser()
  const blockedIds = user ? await listBlockedHostIds(user.id) : []
  return queryAndFilter(neighborhoodIds, blockedIds, startOfTodayIso)
}

/** Input for createPlaydate (the /new form, after validation). */
export interface NewPlaydateInput {
  title: string
  place: string
  neighborhoodId: string
  /** ISO 8601 (UTC) timestamps — the form's datetime-local values converted. */
  startsAt: string
  endsAt: string
  /** Optional, advisory only (e.g. "best for 2-5"). */
  ageHint?: string
  details?: string
}

/**
 * Post a drop-in as the signed-in user (host_profile_id = auth user id).
 * Replicates createProfile's session guard: throws when there is no
 * session. Returns the created row.
 */
export async function createPlaydate(input: NewPlaydateInput): Promise<Playdate> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('No authenticated user — cannot post a drop-in.')

  const { data, error } = await supabase
    .from('playdates')
    .insert({
      host_profile_id: user.id,
      title: input.title,
      place: input.place,
      neighborhood_id: input.neighborhoodId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      age_hint: input.ageHint ?? null,
      details: input.details ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Playdate
}

// ---------------------------------------------------------------------------
// Slice 4: going-pings + reports + blocks (trust basics).
//
// The going_pings table (migration 0007) and reports table (migration 0008)
// may not exist in the live project until the orchestrator applies them —
// every function here throws on that, and the pages render a designed
// error state instead of crashing (same discipline as slices 2–3).

/**
 * The detail-page payload for one playdate: the row with its neighborhood +
 * host handle joined in (null when not found / no access). Same shape as a
 * feed row (PlaydateWithNeighborhood).
 */
export async function getPlaydateDetail(id: string): Promise<PlaydateWithNeighborhood | null> {
  const { data, error } = await supabase
    .from('playdates')
    .select(
      '*, neighborhood:neighborhoods!inner ( id, name ), host:profiles!inner ( id, display_name )',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as PlaydateWithNeighborhood | null) ?? null
}

/**
 * Toggle the current user's "we're going" ping on a drop-in. Client guard:
 * the host of a post cannot ping their own post (the call is a no-op and
 * returns false). Returns the new state (true = going). The Supabase
 * round-trip lives in trust.togglePingWithClient (client injected so it can
 * be tested with a mock — see auth.hasActiveSession for the same pattern).
 */
export async function togglePing(playdateId: string): Promise<boolean> {
  return togglePingWithClient(supabase, playdateId)
}

/**
 * The friendly ping count for a drop-in (counts only — the UI never lists
 * per-person attendees).
 */
export async function getGoingCount(playdateId: string): Promise<number> {
  const { count, error } = await supabase
    .from('going_pings')
    .select('profile_id', { count: 'exact', head: true })
    .eq('playdate_id', playdateId)
  if (error) throw error
  return count ?? 0
}

/** Whether the current user has pinged this drop-in (the toggle's state). */
export async function hasPinged(playdateId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return false
  const { data, error } = await supabase
    .from('going_pings')
    .select('profile_id')
    .eq('playdate_id', playdateId)
    .eq('profile_id', user.id)
    .maybeSingle()
  if (error) throw error
  return data !== null
}

/** Input for createReport (a post report and/or a profile report). */
export interface ReportInput {
  /** Set for a post report (the post's host is the reported profile). */
  playdateId?: string
  /** Set for a profile report. */
  profileId?: string
  /** Required, non-empty after trim — validated before the insert. */
  reason: string
}

/**
 * File a report as the signed-in user (reporter_profile_id = auth user id).
 * The reason is validated with the pure validateReportReason (unit-tested) —
 * an empty/whitespace reason throws before any insert. A post report sets
 * playdate_id (reported_profile_id = the post's host, passed by the caller);
 * a profile report sets reported_profile_id only.
 *
 * The INSERT is issued on a plain chain, without .select()/.single() (42501
 * regression — live probe 2026-09-09): a select on the insert chain becomes
 * INSERT ... RETURNING, which SELECTs the new row under the moderators-only
 * reports SELECT policy, so every non-moderator reporter got 42501. A bare
 * INSERT succeeds; the caller (the report dialog) only needs success/failure.
 */
export async function createReport(input: ReportInput): Promise<void> {
  const reasonError = validateReportReason(input.reason)
  if (reasonError !== null) throw new Error(reasonError)

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('No authenticated user — cannot file a report.')

  const payload: ReportInsertPayload = {
    reporter_profile_id: user.id,
    playdate_id: input.playdateId ?? null,
    reported_profile_id: input.profileId ?? null,
    reason: input.reason.trim(),
  }
  await issueReportInsert(supabase, payload)
}

/** Whether the current user has blocked the given profile (blocks table, 0006). */
export async function getBlockState(profileId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return false
  const { data, error } = await supabase
    .from('blocks')
    .select('blocker_profile_id')
    .eq('blocker_profile_id', user.id)
    .eq('blocked_profile_id', profileId)
    .maybeSingle()
  if (error) throw error
  return data !== null
}

/**
 * Toggle the current user's block on a profile (blocker = the auth user).
 * Returns the new state (true = now blocked). A concurrent block of the same
 * pair (23505 on the primary key) counts as blocked.
 */
export async function toggleBlock(profileId: string): Promise<boolean> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('No authenticated user — cannot block a profile.')

  const blocked = await getBlockState(profileId)
  if (blocked) {
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_profile_id', user.id)
      .eq('blocked_profile_id', profileId)
    if (error) throw error
    return false
  }
  const { error } = await supabase
    .from('blocks')
    .insert({ blocker_profile_id: user.id, blocked_profile_id: profileId })
  if (error && error.code !== '23505') throw error
  return true
}