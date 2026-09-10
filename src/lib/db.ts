import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import type {
  CommentWithAuthor,
  Kid,
  MembershipWithNeighborhood,
  Neighborhood,
  Playdate,
  PlaydateWithNeighborhood,
  Profile,
  ProfileWithKids,
  PublicPlaydateDetail,
  Report,
} from './types'
import {
  filterFeed,
  hostDistanceMiles,
  queryUpcomingFeedWithClient,
  startOfTodayIso,
  validateHomeZip,
  validateRadiusMiles,
  type RadiusViewer,
  type ZipCoords,
} from './feed'
import {
  buildShareUrl,
  issueReportInsert,
  togglePingWithClient,
  validateCommentBody,
  validateReportReason,
  type ReportInsertPayload,
} from './trust'
import { issueModeratorUpdate, isProfileBanned } from './moderation'

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
  /**
   * True when the current profile's home zip is set (V2 slice 3: the
   * onboarding gate keys on home_zip, not memberships — neighborhoods are
   * display labels only, discovery is radius-based). Derived from the
   * profile load; false until it settles (and when the column is absent —
   * the documented DB-not-applied behavior).
   */
  homeZipSet: boolean
/**
   * True while the signed-in user's profile fetch is in flight
   * (ticket 06: the onboarding-gate race; V2 slice 3: the gate reads
   * home_zip off the same profile row, so one load settles both). The app
   * shell's gate renders its loading state while this is set, so a
   * signed-in user is never bounced to /onboarding before the fetch
   * settles. Derived: true whenever the settled load (if any) belongs to a
   * different user than the current session — including the first fetch
   * after a session is restored from storage or a new user signs in.
   */
  profileLoading: boolean
  /**
   * True once the signed-in user's profile has banned_at set (slice 5):
   * the session is rejected — the user is signed out and the shell renders
   * the suspended state (no app access). Sticky within the SPA session so
   * the screen survives the auto sign-out (a different, non-banned user
   * signing in clears it).
   */
  suspended: boolean
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
 *
 * It also enforces the slice-5 banned-session gate: a profile with
 * banned_at set is rejected (signed out, `suspended` set — the shell
 * renders the suspended screen, no app access).
 *
 * And it exposes `profileLoading` (ticket 06): true while the signed-in
 * user's profile + membership fetch is in flight, so the shell's
 * onboarding gate can render its loading state on a cold load instead of
 * bouncing a signed-in member to /onboarding before the fetch settles.
 */
export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [homeZipSet, setHomeZipSet] = useState(false)
  const [suspended, setSuspended] = useState(false)
  /**
   * The user id whose profile + membership load has settled (ticket 06).
   * `profileLoading` is derived from it: a session is present but the
   * settled load belongs to someone else (or nobody — first fetch) → the
   * membership load is still in flight.
   */
  const [profileSettledFor, setProfileSettledFor] = useState<string | null>(null)

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
      setHomeZipSet(false)
      // No user → nothing is loaded for anyone; a re-sign-in must re-fetch.
      setProfileSettledFor(null)
      // suspended is sticky on purpose: a banned user who was just
      // auto-signed-out keeps seeing the suspended screen (the shell
      // renders it before the signed-out redirect).
      return
    }
    let nextProfile: Profile | null = null
    try {
      nextProfile = await getProfile(uid)
    } catch {
      // profiles table not applied yet / DB error: keep rendering without a
      // profile; individual pages surface their own load errors.
    }
    if (isProfileBanned(nextProfile)) {
      // The banned-session gate (slice 5 AC: banned profiles cannot sign
      // in): the profile's banned_at is set → reject the session. The
      // decision itself is the pure isProfileBanned (unit-tested); this is
      // the Supabase-facing side (sign out, no app access).
      setSuspended(true)
      setProfile(null)
      setHomeZipSet(false)
      await signOutUser()
      return
    }
    // Don't clobber state if the signed-in user changed mid-flight.
    const {
      data: { session: after },
    } = await supabase.auth.getSession()
    if (after?.user?.id !== uid) return
    // A fresh, non-banned profile load clears the sticky suspended flag
    // (a different user signed in after a banned one was rejected).
    setSuspended(false)
    setProfile(nextProfile)
    // V2 slice 3: the onboarding gate keys on home_zip (off the same
    // profile row — no separate query; a failed/absent column settles as
    // unset, the documented DB-not-applied behavior).
    setHomeZipSet(nextProfile?.home_zip != null && nextProfile.home_zip !== '')
    // Ticket 06: the profile load has settled for THIS user — the shell
    // gate may now redirect.
    setProfileSettledFor(uid)
  }, [])

  useEffect(() => {
    if (userId === null) {
      setProfile(null)
      setHomeZipSet(false)
      // Signed out → nothing is loaded; a later sign-in (even as the same
      // user) must re-fetch before the gate settles (ticket 06).
      setProfileSettledFor(null)
      return
    }
    void refresh()
  }, [userId, refresh])

  return {
    session,
    loading,
    profile,
    homeZipSet,
    // Ticket 06: the profile load is pending whenever a session is present
    // but the settled load (if any) belongs to a different user.
    profileLoading: session !== null && profileSettledFor !== session.user.id,
    suspended,
    refresh,
  }
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

/**
 * Fetch one profile by id (null if not found / no access). The `*` select
 * also surfaces the moderation columns once applied (migration 0008:
 * moderators; migration 0009: banned_at) — useSession's banned gate
 * (isProfileBanned) and the /mod route guard (canModerate) read them from
 * the shared profile here.
 */
export async function getProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as Profile | null) ?? null
}

/**
 * Find a profile by its public display_name handle, with its kids joined in
 * (V2 ticket 02: first name + age only — the privacy pin). Null when unknown.
 *
 * The kids embed is pinned to the FK constraint name (PGRST201 lesson: pin
 * FK hints in embeds) — `kids_profile_id_fkey` is the 0011 constraint. A
 * plain (left) one-to-many embed: a profile with no kids gets an empty
 * array, never a not-found.
 */
export async function getProfileByHandle(handle: string): Promise<ProfileWithKids | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, kids:kids!kids_profile_id_fkey ( id, first_name, age )')
    .eq('display_name', handle)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as ProfileWithKids | null) ?? null
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
 * Raw upcoming-playdate query (V2 slice 3): all posts starting at or after
 * the cutoff, ordered by starts_at (the neighborhood filter is gone —
 * discovery is radius-based). The DB-level filters (the .not() block
 * filter — only when the viewer actually has blocks, and the
 * .is('hidden_at', null) hidden filter — slice 5) live in the injected-
 * client query (feed.queryUpcomingFeedWithClient, unit-tested with a mock).
 */
async function queryUpcomingPlaydates(
  cutoffIso: string,
  blockedHostIds: string[],
): Promise<PlaydateWithNeighborhood[]> {
  const rows = await queryUpcomingFeedWithClient(supabase, cutoffIso, blockedHostIds)
  // Cast via unknown: without generated DB types, the embeds are inferred
  // loosely (same pattern as listMemberships).
  return rows as unknown as PlaydateWithNeighborhood[]
}

/**
 * The viewer's radius feed (V2 slice 3): posts whose HOST sits within the
 * viewer's haversine radius (via the seeded zip map), starting today or
 * later (client-local midnight), excluding posts by blocked hosts and
 * hidden posts, ordered by starts_at — each survivor tagged with its
 * `distanceMiles` for the card's "N mi" label. Used by both the / feed
 * and /browse (the latter groups the same rows by day).
 *
 * Execution point (pinned choice, ticket 03): the distance predicate runs
 * CLIENT-SIDE over a pinned-embed fetch (the host embed carries home_zip +
 * radius_miles; the zip coordinates come from loadZipCodes) — plain
 * haversine math, no PostGIS. The pure predicate (feed.haversineMiles /
 * withinRadius / filterFeed) is the unit-tested guarantee.
 *
 * Pinned exclusion: a host with no home_zip, or with a zip missing from
 * the gazetteer, is EXCLUDED — coordinates are never invented. A viewer
 * with no home zip gets an empty feed (the onboarding gate keeps that
 * state out of the routes; this is the defensive fallback).
 */
export async function listRadiusFeed(
  viewer: RadiusViewer,
  profileId: string,
): Promise<PlaydateWithNeighborhood[]> {
  if (viewer.homeZip === null) return []
  const [zipCoords, blockedIds] = await Promise.all([
    loadZipCodes(),
    listBlockedHostIds(profileId),
  ])
  const cutoffIso = startOfTodayIso()
  const posts = await queryUpcomingPlaydates(cutoffIso, blockedIds)
  const filtered = filterFeed(
    posts,
    viewer,
    zipCoords,
    new Set(blockedIds),
    cutoffIso,
    new Date().toISOString(),
  )
  return filtered.map((post) => ({
    ...post,
    // Survivors always have a distance (filterFeed excludes nulls); the
    // fallback only covers a host embed missing the zip entirely.
    distanceMiles: hostDistanceMiles(post.host?.home_zip, viewer, zipCoords) ?? undefined,
  }))
}

/**
 * The seeded gazetteer (V2 slice 3, the zip_codes table, migration 0012):
 * zip → lat/lng, fetched once and cached for the SPA session (the WA
 * extract is ~600 rows — trivially small; a re-fetch per feed load would
 * be waste, not correctness). Throws when the table is missing (0012 not
 * applied yet — the pages render their designed error state, house
 * discipline).
 */
let zipCodesCache: Promise<ReadonlyMap<string, ZipCoords>> | null = null
export function loadZipCodes(): Promise<ReadonlyMap<string, ZipCoords>> {
  zipCodesCache ??= (async () => {
    const { data, error } = await supabase.from('zip_codes').select('zip, lat, lng')
    if (error) throw error
    const coords = new Map<string, ZipCoords>()
    for (const row of (data ?? []) as Array<{ zip: string; lat: string | number; lng: string | number }>) {
      coords.set(row.zip, { lat: Number(row.lat), lng: Number(row.lng) })
    }
    return coords
  })()
  return zipCodesCache
}

/**
 * Save the caller's home zip + radius (V2 slice 3: onboarding's Continue +
 * the /profile location card). Runs the pure validators first (the same
 * defense in depth as uploadAvatar): the zip must be a 5-digit code in the
 * seeded gazetteer and the radius an integer in 2–35 (the 0012 CHECK is
 * the DB backstop).
 */
export async function updateHomeZipRadius(
  userId: string,
  homeZip: string,
  radiusMiles: number,
): Promise<void> {
  const zipError = validateHomeZip(homeZip, new Set((await loadZipCodes()).keys()))
  if (zipError !== null) throw new Error(zipError)
  const radiusError = validateRadiusMiles(radiusMiles)
  if (radiusError !== null) throw new Error(radiusError)
  const { error } = await supabase
    .from('profiles')
    .update({ home_zip: homeZip, radius_miles: radiusMiles })
    .eq('id', userId)
  if (error) throw error
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
 *
 * The `*` select also surfaces hidden_at once migration 0009 is applied.
 * Unlike the feed (DB-level .is('hidden_at', null) filter), the detail
 * path fetches the post directly — so the hidden check happens after the
 * fetch (feed.isHiddenPost in the detail page; same client-side discipline
 * as the slice-4 blocked-detail pattern). A hidden post renders the hidden
 * state, never the content.
 */
export async function getPlaydateDetail(id: string): Promise<PlaydateWithNeighborhood | null> {
  const { data, error } = await supabase
    .from('playdates')
    .select(
      '*, neighborhood:neighborhoods!inner ( id, name ), host:profiles!playdates_host_profile_id_fkey ( id, display_name, avatar_url )',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as PlaydateWithNeighborhood | null) ?? null
}

/**
 * The signed-out public surface for one drop-in (V2 slice 5, ticket 05,
 * migration 0015): the SECURITY DEFINER get_public_playdate RPC — the
 * post's public fields + neighborhood label + host handle/avatar + going
 * count, and NOTHING else (no comments, no ping rows, no profile columns
 * beyond the pinned two). Null when the post is missing OR hidden — a
 * hidden post's existence is never confirmed to a signed-out visitor.
 *
 * No FK embeds on this path (the function projects the joins server-side),
 * so there is nothing to pin (the PGRST201 discipline covers the existing
 * embeds, which this slice does not touch). Pre-0015-apply the RPC 404s
 * (the function does not exist yet) — the detail page's public load settles
 * its error state, same DB-not-applied discipline as slices 2–4.
 */
export async function getPublicPlaydateDetail(id: string): Promise<PublicPlaydateDetail | null> {
  const { data, error } = await supabase.rpc('get_public_playdate', { p_id: id })
  if (error) throw error
  return (data as unknown as PublicPlaydateDetail | null) ?? null
}

/**
 * The share URL for a drop-in (V2 slice 5, ticket 05):
 * VITE_PUBLIC_BASE_URL when set (deployment, DECISION 3), otherwise the
 * window origin — placeholder-safe before deployment. The pure buildShareUrl
 * decides the fallback (unit-tested in trust.test.ts); this is the
 * Supabase/env-facing wrapper (the same injected-value seam the RPC above
 * uses for its id).
 */
export function getShareUrl(playdateId: string): string {
  return buildShareUrl(playdateId, import.meta.env.VITE_PUBLIC_BASE_URL ?? '', window.location.origin)
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

// ---------------------------------------------------------------------------
// Slice 5: moderator tools — the /mod report list, hide, ban.
//
// The moderation columns (migration 0009: playdates.hidden_at,
// profiles.banned_at) and the moderator UPDATE policies may not exist in
// the live project until the orchestrator applies 0009/0010 — every
// function here throws on that, and the mod page renders a designed error
// state instead of crashing (same discipline as slices 2–4). Reports are
// SELECT-able by moderators only (migration 0008): a non-moderator gets 0
// rows from listReports, and the /mod route guard (canModerate) keeps them
// off the page in the first place.

/** One report with its handles + the reported post's title joined in (/mod). */
export interface ModReport {
  /** The report row (pinned shape, migration 0008). */
  report: Report
  /** The reporter's display_name (null when the row is gone). */
  reporter: string | null
  /** The reported profile's display_name (post reports set the post's host). */
  reported: string | null
  /** The reported post's title (post reports only — null for profile reports). */
  postTitle: string | null
}

/**
 * The moderator report list, newest first, with the reporter's and
 * reported profile's display names + the reported post's title joined in.
 * Two follow-up fetches (profiles, playdates) both use SELECT policies
 * open to any authenticated user, so only the reports read itself needs
 * the moderators flag.
 */
export async function listReports(): Promise<ModReport[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('id, reporter_profile_id, playdate_id, reported_profile_id, reason, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  const reports = (data ?? []) as Report[]

  // Reporter/reported handles in one profiles fetch (a deleted profile's
  // reference was nulled by the reports table's ON DELETE SET NULL, so an
  // empty id set just means "no handles to join").
  const profileIds = [
    ...new Set(
      reports
        .flatMap((r) => [r.reporter_profile_id, r.reported_profile_id])
        .filter((id): id is string => id !== null),
    ),
  ]
  const handleById = new Map<string, string>()
  if (profileIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', profileIds)
    if (profileError) throw profileError
    for (const row of (profileRows ?? []) as unknown as Array<{ id: string; display_name: string }>) {
      handleById.set(row.id, row.display_name)
    }
  }

  // The reported posts' titles (post reports only).
  const playdateIds = [
    ...new Set(
      reports.map((r) => r.playdate_id).filter((id): id is string => id !== null),
    ),
  ]
  const postById = new Map<string, string>()
  if (playdateIds.length > 0) {
    const { data: postRows, error: postError } = await supabase
      .from('playdates')
      .select('id, title')
      .in('id', playdateIds)
    if (postError) throw postError
    for (const row of (postRows ?? []) as unknown as Array<{ id: string; title: string }>) {
      postById.set(row.id, row.title)
    }
  }

  return reports.map((report) => ({
    report,
    reporter:
      report.reporter_profile_id !== null
        ? handleById.get(report.reporter_profile_id) ?? null
        : null,
    reported:
      report.reported_profile_id !== null
        ? handleById.get(report.reported_profile_id) ?? null
        : null,
    postTitle:
      report.playdate_id !== null ? postById.get(report.playdate_id) ?? null : null,
  }))
}

/**
 * Hide a post (moderator op, slice 5): set playdates.hidden_at. Hidden
 * posts vanish from every feed (the DB-level filter) and render the hidden
 * state on the detail page. No unhide in V1 (V1-minimum, documented in
 * ModPage). Plain update, no .select() — see issueModeratorUpdate (42501
 * discipline).
 */
export async function hidePlaydate(playdateId: string): Promise<void> {
  await issueModeratorUpdate(supabase, 'playdates', playdateId, {
    hidden_at: new Date().toISOString(),
  })
}

/**
 * Ban a profile (moderator op, slice 5): set profiles.banned_at. The
 * session gate (useSession) signs the profile out and renders the
 * suspended state. No unban in V1 (V1-minimum, documented in ModPage).
 * Plain update, no .select() — see issueModeratorUpdate (42501
 * discipline).
 */
export async function banProfile(profileId: string): Promise<void> {
  await issueModeratorUpdate(supabase, 'profiles', profileId, {
    banned_at: new Date().toISOString(),
  })
}

// ---------------------------------------------------------------------------
// V2 slice 2 (ticket 02): avatars, bio, kids.
//
// The schema (migration 0011) may not be applied to the live project until
// the orchestrator applies it — every function here throws on that, and the
// pages render designed states instead of crashing (same discipline as
// slices 1–5). Pure validators + caps are exported and unit-tested; the
// Supabase-facing round-trips follow the injected-client discipline where
// the house pattern has one.

/** Avatar input cap (V2 ticket 02): files > 5 MB are rejected BEFORE upload. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024

/** The avatar's stored size: client-resized to a 256px square before upload. */
export const AVATAR_SIZE_PX = 256

/** Bio cap (plan-v2 Interfaces: <= 500 chars; the 0011 CHECK is the backstop). */
export const BIO_MAX_LENGTH = 500

/** The kids cap per profile (plan-v2 Interfaces: app-enforced, not DB). */
export const MAX_KIDS_PER_PROFILE = 5

/**
 * Pure avatar input validation: an error message, or null when valid.
 * Rejects non-images and files over AVATAR_MAX_BYTES — the rejection happens
 * before any upload (ticket AC: "> 5 MB rejected before upload").
 */
export function validateAvatarFile(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return 'Pick an image file (a photo) for the avatar.'
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return 'Keep the photo under 5 MB.'
  }
  return null
}

/** Pure bio validation (<= BIO_MAX_LENGTH characters after trim). */
export function validateBio(bio: string): string | null {
  if (bio.trim().length > BIO_MAX_LENGTH) {
    return `Keep the bio to ${BIO_MAX_LENGTH} characters.`
  }
  return null
}

/**
 * Pure kid-row validation (first name + age only — the privacy pin). Age is
 * a whole number in 0–17: these are kids.
 */
export function validateKid(firstName: string, age: number): string | null {
  if (firstName.trim().length === 0) {
    return 'Give your kid a first name.'
  }
  if (!Number.isInteger(age) || age < 0 || age > 17) {
    return 'Age must be a whole number from 0 to 17.'
  }
  return null
}

/**
 * The profile items missing for the /profile nudge banner (V2 ticket 02):
 * photo + bio + kids all present dismisses it. `kidsCount` is null when the
 * kids load has not settled (it counts as not-present — the nudge is
 * best-effort, never hides what is there).
 */
export type MissingProfileItem = 'photo' | 'bio' | 'kids'

export function missingProfileItems(
  profile: Pick<Profile, 'avatar_url' | 'bio'> | null,
  kidsCount: number | null,
): MissingProfileItem[] {
  const missing: MissingProfileItem[] = []
  const avatarUrl = profile?.avatar_url ?? null
  const bio = profile?.bio ?? null
  if (avatarUrl === null || avatarUrl === '') missing.push('photo')
  if (bio === null || bio.trim() === '') missing.push('bio')
  if (kidsCount === null || kidsCount === 0) missing.push('kids')
  return missing
}

/**
 * Client-side resize of an avatar to a 256px square (V2 ticket 02):
 * center-crop to square, scale, encode as JPEG. Runs in the browser (canvas)
 * — the network only sees the small result, never the original.
 */
export async function prepareAvatarFile(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const size = AVATAR_SIZE_PX
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('Could not resize the photo (canvas unavailable).')
  // Cover-crop: scale the photo to fill the square, center-crop the overflow.
  const scale = Math.max(size / bitmap.width, size / bitmap.height)
  const drawWidth = bitmap.width * scale
  const drawHeight = bitmap.height * scale
  ctx.drawImage(bitmap, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight)
  bitmap.close()
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) reject(new Error('Could not encode the avatar image.'))
        else resolve(blob)
      },
      'image/jpeg',
      0.85,
    )
  })
}

/**
 * Upload the signed-in user's avatar (V2 ticket 02): validate first (a
 * > 5 MB file is rejected before any upload), client-resize to 256px,
 * upload to the 'avatars' bucket at <uid>/avatar (the owner-scoped write
 * policy from 0011 — no cross-user writes), then point
 * profiles.avatar_url at the public URL. Returns the public URL.
 */
export async function uploadAvatar(profileId: string, file: File): Promise<string> {
  const fileError = validateAvatarFile(file)
  if (fileError !== null) throw new Error(fileError)
  const blob = await prepareAvatarFile(file)
  const objectPath = `${profileId}/avatar`
  const { error } = await supabase.storage
    .from('avatars')
    .upload(objectPath, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('avatars').getPublicUrl(objectPath)
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: data.publicUrl })
    .eq('id', profileId)
  if (profileError) throw profileError
  return data.publicUrl
}

/** Update the caller's bio (V2 ticket 02): <= 500 chars, validated pure. */
export async function updateBio(userId: string, bio: string): Promise<void> {
  const bioError = validateBio(bio)
  if (bioError !== null) throw new Error(bioError)
  const { error } = await supabase
    .from('profiles')
    .update({ bio: bio.trim() })
    .eq('id', userId)
  if (error) throw error
}

/**
 * One profile's kid rows, ordered by age (V2 ticket 02: first name + age
 * only — the privacy pin; no full names or gender exist to fetch). The
 * kids SELECT policy is open to any authenticated user (the public profile
 * surface); a read failure (0011 not applied yet) throws, and the caller
 * renders a designed state.
 */
export async function listKids(profileId: string): Promise<Kid[]> {
  const { data, error } = await supabase
    .from('kids')
    .select('id, first_name, age')
    .eq('profile_id', profileId)
    .order('age', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as Kid[]
}

/**
 * Add a kid row (V2 ticket 02). The max-5 cap is app-enforced here (plan-v2
 * Interfaces — not a DB constraint): the current count is read first, and
 * a full profile's add throws before any insert. The owner-only INSERT
 * policy (0011) is the DB wall for non-owners.
 */
export async function addKid(profileId: string, firstName: string, age: number): Promise<Kid> {
  const existing = await listKids(profileId)
  if (existing.length >= MAX_KIDS_PER_PROFILE) {
    throw new Error(`You can add up to ${MAX_KIDS_PER_PROFILE} kids.`)
  }
  const kidError = validateKid(firstName, age)
  if (kidError !== null) throw new Error(kidError)
  const { data, error } = await supabase
    .from('kids')
    .insert({ profile_id: profileId, first_name: firstName.trim(), age })
    .select()
    .single()
  if (error) throw error
  return data as unknown as Kid
}

/**
 * Remove a kid row (owner-only via the 0011 DELETE policy; the profile_id
 * scope keeps a known id from ever touching another family's row). A
 * non-owner delete is a silent RLS no-op (the logged PostgREST 2xx lesson)
 * — the owner is the only caller.
 */
export async function removeKid(profileId: string, kidId: string): Promise<void> {
  const { error } = await supabase
    .from('kids')
    .delete()
    .eq('id', kidId)
    .eq('profile_id', profileId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// V2 slice 4 (ticket 04): comments on events.
//
// The comments table (migration 0013) may not exist in the live project
// until the orchestrator applies it — every function here throws on that,
// and the detail page hides the comment section instead of crashing (same
// discipline as the ping section in PlaydateDetailPage).

/**
 * A playdate's comment thread (V2 ticket 04): flat, chronological
 * (created_at ascending), the author joined in (avatar + handle). The
 * author embed is pinned to the FK constraint name (PGRST201 lesson):
 * `comments_author_profile_id_fkey` is the 0013 constraint. Hidden
 * comments come back to moderators only (0014: the SELECT policy is
 * `hidden_at is null OR moderator` — non-moderators never receive
 * hidden rows; the DB-level soft-hide holds for everyone else).
 */
export async function listComments(playdateId: string): Promise<CommentWithAuthor[]> {
  const { data, error } = await supabase
    .from('comments')
    .select(
      'id, playdate_id, author_profile_id, body, created_at, hidden_at, author:profiles!comments_author_profile_id_fkey ( id, display_name, avatar_url )',
    )
    .eq('playdate_id', playdateId)
    .order('created_at', { ascending: true })
  if (error) throw error
  // Cast via unknown: without generated DB types, the embed is inferred
  // loosely (same pattern as listMemberships).
  return (data ?? []) as unknown as CommentWithAuthor[]
}

/**
 * Post a comment as the signed-in user (author_profile_id = auth user id —
 * the 0013 INSERT policy is the wall for non-authors). The body is
 * validated first with the pure validateCommentBody (same defense in depth
 * as createReport): an empty/over-cap body throws before any insert (the
 * 0013 CHECK is the DB backstop). Plain insert, no .select() — the caller
 * re-fetches the thread for the new row (issueReportInsert discipline).
 */
export async function addComment(playdateId: string, body: string): Promise<void> {
  const bodyError = validateCommentBody(body)
  if (bodyError !== null) throw new Error(bodyError)

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('No authenticated user — cannot comment on a drop-in.')

  const { error } = await supabase
    .from('comments')
    .insert({ playdate_id: playdateId, author_profile_id: user.id, body: body.trim() })
  if (error) throw error
}

/**
 * Delete a comment (hard delete; ticket 04: the author deletes their own,
 * the event's host deletes any comment on their event — the 0013 DELETE
 * policy is the wall; the UI offers the button only per the pure
 * planCommentAction, so a non-privileged delete is a silent RLS no-op —
 * the logged PostgREST 2xx lesson).
 */
export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('comments').delete().eq('id', commentId)
  if (error) throw error
}

/**
 * Hide a comment (moderator op, ticket 04): set comments.hidden_at — the
 * soft-hide (the /mod model; hidden comments are invisible to everyone via
 * the SELECT policy). No unhide in V2 (mirrored from hidePlaydate's
 * V1-minimum). Plain update, no .select() — the 42501 discipline: pre-0014
 * the RETURNING read-back of the new row 403'd under the SELECT policy;
 * the plain chain stays the simple path.
 */
export async function hideComment(commentId: string): Promise<void> {
  const { error } = await supabase
    .from('comments')
    .update({ hidden_at: new Date().toISOString() })
    .eq('id', commentId)
  if (error) throw error
}
