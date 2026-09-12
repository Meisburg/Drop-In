import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type {
  CommentWithAuthor,
  Kid,
  MembershipWithNeighborhood,
  Neighborhood,
  Place,
  Playdate,
  PlaydateKid,
  PlaydateSeries,
  PlaydateStatus,
  PlaydateWithNeighborhood,
  Profile,
  ProfileWithKids,
  PublicPlaydateDetail,
  Report,
} from './types'
// The crop step's source of truth (photo-crop ticket 03): the encoder takes the
// frame the user chose rather than computing one of its own, and refuses a frame
// that could not be drawn.
import { isDrawableRect, type CropRect } from './photoCrop'
import {
  filterFeed,
  localDayKey,
  postDistanceMiles,
  queryRecentOwnPlacesWithClient,
  queryUpcomingFeedWithClient,
  recentPlacesFrom,
  startOfTodayIso,
  validateHomeZip,
  validateRadiusMiles,
  type GoingPinger,
  type RadiusViewer,
  type RecentPlace,
  type WhileAwayCommentRow,
  type WhileAwayMyPost,
  type WhileAwayPingedPostRow,
  type ZipCoords,
} from './feed'
// V8 ticket 07: the places directory's pure payload seam (the playdates /
// playdate_series `place_id` key — omitted entirely for a free-text place, so
// pre-0030-apply every existing insert stays byte-identical).
import { placeIdField, upcomingCountByPlace } from './places'
import {
  buildShareUrl,
  issueReportInsert,
  togglePingWithClient,
  validateCommentBody,
  validateReportReason,
  type ReportInsertPayload,
} from './trust'
import { issueModeratorUpdate, isProfileBanned } from './moderation'
import { oauthRedirectTo, probeOAuthProvider, type OAuthProvider } from './oauth'
import { resetRedirectTo } from './passwordReset'
// V8 ticket 06: the weekly series' pure payload seams (the series row and the
// playdates `series_id` key — omitted entirely for a standalone post, so
// pre-0028-apply every existing post path stays byte-identical).
import {
  seriesIdField,
  seriesInsertRow,
  type NewPlaydateSeriesInput,
} from './series'

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
 * Start a social sign-in round-trip (V4 slice 4). On success Supabase
 * redirects the browser to the provider and this promise never settles in a
 * meaningful way; an error means the provider could not be reached — most
 * often because it is not enabled for this project yet (the console setup in
 * docs/social-login-setup.md). The caller renders oauthErrorMessage(error)
 * inline, so a not-yet-configured provider is a sentence, never a no-op.
 *
 * A first-time OAuth user comes back with a session but NO profiles row (the
 * email path creates it on /login) — the shell's onboarding gate sends them
 * to /onboarding, whose handle step collects the display name.
 */
export async function signInWithOAuthProvider(provider: OAuthProvider): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: oauthRedirectTo(window.location.origin),
      // Take the URL instead of being navigated to it: a provider that is not
      // enabled would otherwise drop the user on Supabase's raw JSON error
      // page (see probeOAuthProvider).
      skipBrowserRedirect: true,
    },
  })
  if (error) throw error
  if (!data?.url) throw new Error('Could not start sign-in. Try again.')
  const blocked = await probeOAuthProvider(data.url)
  if (blocked !== null) throw new Error(blocked)
  window.location.assign(data.url)
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
 * (V2 ticket 02: first name + age — the privacy pin; V3 slice 6, ticket 09
 * widens the surface: the kid photo + likes + the profile's interests,
 * migration 0022). Null when unknown.
 *
 * Both the profile's `*` and the kids embed's `*` surface the new 0022
 * columns (kids.avatar_url, kids.likes, profiles.interests) once 0022 is
 * applied — undefined at runtime before then (the /u/:handle renders are
 * null-safe, the pre-0016 status-column discipline). An explicit new-
 * column list would 42703 the fetch pre-apply and break the page (the
 * DB-not-applied discipline: /u/:handle stays green, the new lines simply
 * stay hidden).
 *
 * The kids embed is pinned to the FK constraint name (PGRST201 lesson: pin
 * FK hints in embeds) — `kids_profile_id_fkey` is the 0011 constraint. A
 * plain (left) one-to-many embed: a profile with no kids gets an empty
 * array, never a not-found.
 */
export async function getProfileByHandle(handle: string): Promise<ProfileWithKids | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, kids:kids!kids_profile_id_fkey ( * )')
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
 * The viewer's radius feed (V2 slice 3): posts LOCATED within the viewer's
 * haversine radius (via the seeded zip map), starting today or later
 * (client-local midnight), excluding posts by blocked hosts and hidden posts,
 * ordered by starts_at — each survivor tagged with its `distanceMiles` for the
 * card's "N mi" label. Used by the `/` feed (and no longer by /browse, which
 * V8 ticket 07 turned into the places directory).
 *
 * V8 ticket 07 (the distance-model fix): "located" now means the POST'S PLACE
 * when it names one, and the host's home zip only as the fallback — see
 * feed.postDistanceMiles. The place coordinates are stitched in from a
 * separate read (loadPlacesOrEmpty), NOT an embed; see listRadiusFeed's own
 * comment for why an embed would take the whole feed down pre-0029-apply.
 *
 * Execution point (pinned choice, ticket 03): the distance predicate runs
 * CLIENT-SIDE over a pinned-embed fetch (the host embed carries home_zip +
 * radius_miles; the zip coordinates come from loadZipCodes) — plain
 * haversine math, no PostGIS. The pure predicate (feed.haversineMiles /
 * withinRadius / filterFeed) is the unit-tested guarantee.
 *
 * Pinned exclusion: a post that resolves to NO location — no place, no host
 * home_zip, or a zip missing from the gazetteer — is EXCLUDED; coordinates are
 * never invented. A viewer with no home zip gets an empty feed (the onboarding
 * gate keeps that state out of the routes; this is the defensive fallback).
 */
export async function listRadiusFeed(
  viewer: RadiusViewer,
  profileId: string,
): Promise<PlaydateWithNeighborhood[]> {
  if (viewer.homeZip === null) return []
  const [zipCoords, blockedIds, places] = await Promise.all([
    loadZipCodes(),
    listBlockedHostIds(profileId),
    // V8 ticket 07: the place coordinates are a SEPARATE read, never an embed
    // on the feed query. An embed into a table that does not exist yet fails
    // the WHOLE request (PGRST205): pre-0029-apply that would take the entire
    // feed down, not just the places surface. A separate read that degrades to
    // an empty map leaves the feed exactly as it was yesterday (see
    // loadPlacesOrEmpty).
    loadPlacesOrEmpty(),
  ])
  const cutoffIso = startOfTodayIso()
  const rows = await queryUpcomingPlaydates(cutoffIso, blockedIds)
  // Stitch each post's place coordinates in (place_id -> {lat,lng}), so the
  // pure distance model sees them. A post with no place_id, or one whose place
  // is missing from the map, gets null and falls back to the host's home zip.
  const posts = rows.map((post) => ({ ...post, place_coords: placeCoordsFor(post.place_id, places) }))
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
    // fallback only covers a place/host embed missing its coordinates.
    distanceMiles: postDistanceMiles(post, viewer, zipCoords) ?? undefined,
  }))
}

/**
 * The place coordinates for a post, from the loaded places map (V8 ticket 07).
 * Null when the post names no place, or when the place is not in the map (a
 * failed/never-run places read) — the caller's distance model then takes its
 * host-zip fallback leg.
 */
export function placeCoordsFor(
  placeId: string | null | undefined,
  places: ReadonlyMap<string, Place>,
): { lat: number | null; lng: number | null } | null {
  if (placeId === null || placeId === undefined || placeId === '') return null
  const place = places.get(placeId)
  if (place === undefined) return null
  return { lat: place.lat, lng: place.lng }
}

/**
 * The places directory, fetched once and cached for the SPA session (V8 ticket
 * 07): the seed is a few hundred rows — trivially small, and every feed load
 * and browse render needs it. Throws when the table is missing (0029 not
 * applied yet); a rejected fetch does NOT stick in the cache, so the next call
 * re-issues it (the loadZipCodes discipline, no page reload required).
 */
let placesCache: Promise<ReadonlyMap<string, Place>> | null = null
export function loadPlaces(): Promise<ReadonlyMap<string, Place>> {
  placesCache ??= (async () => {
    try {
      const { data, error } = await supabase.from('places').select('*')
      if (error) throw error
      const places = new Map<string, Place>()
      for (const row of (data ?? []) as Place[]) {
        places.set(row.id, row)
      }
      return places
    } catch (err) {
      placesCache = null
      throw err
    }
  })()
  return placesCache
}

/**
 * loadPlaces, degraded to an EMPTY map on failure — the feed's and Browse's
 * dependency on a table that may not exist yet.
 *
 * Deliberate: pre-0029-apply this makes the distance model fall back to the
 * host's home zip (the pre-ticket behaviour, EXACTLY — every existing post has
 * no place_id anyway) instead of failing the whole feed. The places SURFACES
 * (the /browse directory, the place page) still report the failure honestly
 * through their own designed error states, because those pages are ABOUT
 * places and must not pretend the directory is empty.
 */
export async function loadPlacesOrEmpty(): Promise<ReadonlyMap<string, Place>> {
  try {
    return await loadPlaces()
  } catch {
    return new Map<string, Place>()
  }
}

/**
 * The whole directory, name-ordered (V8 ticket 07). The ORDER OF THE ROWS IS
 * NOT THE ORDER OF THE SCREEN: Browse sorts by distance (pure browsePlaces).
 * Throws when 0029 is not applied — the caller renders its designed state.
 */
export async function listPlaces(): Promise<Place[]> {
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Place[]
}

/** One place by id (the /place/:id page). Null when it does not exist. */
export async function getPlaceById(placeId: string): Promise<Place | null> {
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('id', placeId)
    .maybeSingle()
  if (error) throw error
  return (data as Place | null) ?? null
}

/**
 * The upcoming drop-ins AT one place (V8 ticket 07) — the place page's list.
 *
 * RADIUS-INDEPENDENT BY DESIGN: the parent asked about THIS place, so the
 * viewer's radius must not filter its own page (a place 30 miles away that you
 * deliberately opened has drop-ins; hiding them would make the page lie). The
 * viewer's BLOCKS still apply — the one filter that is about people rather
 * than distance — and hidden posts are excluded as everywhere else. Ordered by
 * starts_at (soonest first).
 *
 * Pre-0030-apply `place_id` does not exist and this 42703s; the place page
 * never gets that far pre-0029-apply anyway (its places read fails first), and
 * either way the page renders a designed error state, never a crash.
 */
export async function listPlaceFeed(
  placeId: string,
  viewerProfileId: string,
): Promise<PlaydateWithNeighborhood[]> {
  const blockedIds = await listBlockedHostIds(viewerProfileId)
  const { data, error } = await supabase
    .from('playdates')
    .select(
      '*, neighborhood:neighborhoods!inner ( id, name ), host:profiles!playdates_host_profile_id_fkey ( id, display_name, avatar_url, home_zip, radius_miles )',
    )
    .eq('place_id', placeId)
    .gte('starts_at', startOfTodayIso())
    .is('hidden_at', null)
    .order('starts_at', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as unknown as PlaydateWithNeighborhood[]
  const blocked = new Set(blockedIds)
  return rows.filter((post) => !blocked.has(post.host_profile_id))
}

/**
 * Upcoming drop-in counts per place, for Browse's "N upcoming" chips (V8
 * ticket 07). ONE read of the upcoming posts' (id, place_id) rather than a
 * count per place — the directory is a few hundred rows and the upcoming set
 * is small, so a request per place would be the expensive way to be wrong.
 *
 * Returns null when the read FAILS (pre-0030-apply: no place_id column), which
 * the caller renders as NO count at all — never as "0 upcoming", which would
 * be a claim we cannot make.
 */
export async function upcomingCountsByPlace(): Promise<Map<string, number> | null> {
  const { data, error } = await supabase
    .from('playdates')
    .select('id, place_id')
    .gte('starts_at', startOfTodayIso())
    .is('hidden_at', null)
  if (error) return null
  return upcomingCountByPlace((data ?? []) as Array<{ place_id: string | null }>)
}

/**
 * The seeded gazetteer (V2 slice 3, the zip_codes table, migration 0012):
 * zip → lat/lng, fetched once and cached for the SPA session (the WA
 * extract is ~600 rows — trivially small; a re-fetch per feed load would
 * be waste, not correctness). Throws when the table is missing (0012 not
 * applied yet — the pages render their designed error state, house
 * discipline). A failed fetch does not stick around: the cache resets on
 * rejection, so the next call retries (no page-reload required).
 */
let zipCodesCache: Promise<ReadonlyMap<string, ZipCoords>> | null = null
export function loadZipCodes(): Promise<ReadonlyMap<string, ZipCoords>> {
  zipCodesCache ??= (async () => {
    try {
      const { data, error } = await supabase.from('zip_codes').select('zip, lat, lng')
      if (error) throw error
      const coords = new Map<string, ZipCoords>()
      for (const row of (data ?? []) as Array<{ zip: string; lat: string | number; lng: string | number }>) {
        coords.set(row.zip, { lat: Number(row.lat), lng: Number(row.lng) })
      }
      return coords
    } catch (err) {
      // A rejected fetch (e.g. 0012 not applied yet) would otherwise pin THIS
      // rejected promise to the module cache forever — the only retry would be
      // a full page reload. Reset the cache before rethrowing so the next
      // call re-issues the fetch.
      zipCodesCache = null
      throw err
    }
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

/**
 * Input for createPlaydate (the /new form, after validation).
 *
 * V3 slice 6 (ticket 09): the /new "Best for ages" field is REPLACED by
 * the kids-you're-bringing picker (the playdate_kids table, migration
 * 0022) — the age hint is no longer written from /new (the DB column
 * stays; the duplicate prefill's dormant ageHint is pinned V2 and
 * test-referenced).
 */
export interface NewPlaydateInput {
  title: string
  place: string
  neighborhoodId: string
  /** ISO 8601 (UTC) timestamps — the form's datetime-local values converted. */
  startsAt: string
  endsAt: string
  details?: string
  /**
   * The optional street address (V3 slice 5, ticket 08, migration 0021):
   * <=120 chars, trimmed; UNDEFINED when empty (the /new field's
   * "omit when empty" — the insert payload then carries no address key,
   * so pre-0021-apply a post WITHOUT an address never touches the
   * missing column; a post WITH one 42703s — the e2e's documented RED).
   */
  address?: string
  /**
   * V8 ticket 06 (migration 0028): the weekly series this post is the first
   * occurrence of. UNDEFINED for a one-off — the `series_id` key is then
   * ABSENT from the insert payload rather than null, so pre-0028-apply every
   * existing post path is unchanged (the 0021 address lesson).
   */
  seriesId?: string
  /**
   * V8 ticket 07 (migration 0030): the place the parent PICKED from the
   * directory. UNDEFINED for "Somewhere else" (the free text stays in `place`)
   * — the `place_id` key is then ABSENT rather than null, so pre-0030-apply
   * every existing post path is unchanged. This is also what makes the post's
   * LOCATION the place's coordinates instead of the host's home zip.
   */
  placeId?: string
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
      // V3 slice 6 (ticket 09): the age hint is no longer written from /new
      // (the kids picker replaces the field; the DB column stays — the
      // duplicate prefill carries it dormant, pinned V2).
      details: input.details ?? null,
      // V3 slice 5 (ticket 08): the optional address — undefined when empty,
      // so the key is OMITTED from the insert payload (pre-0021-apply a
      // post without an address is unaffected; one with an address 42703s
      // — the e2e's documented RED-by-design pre-apply failure).
      address: input.address,
      // V8 ticket 06 (migration 0028): the weekly link — the key is present
      // ONLY for a series' first occurrence (seriesIdField returns {} for a
      // standalone post, so nothing about today's inserts changes).
      ...seriesIdField(input.seriesId),
      // V8 ticket 07 (migration 0030): the picked place — same discipline: the
      // key is present ONLY when a place was actually picked, so a free-text
      // post's payload is unchanged and pre-0030-apply nothing 42703s.
      ...placeIdField(input.placeId),
    })
    .select()
    .single()
  if (error) throw error
  return data as Playdate
}

/**
 * The /new "Recent places" chips (V8 ticket 01): the places this parent
 * actually posted to last — newest first, deduped on the place text, capped
 * at `limit` (the pure `recentPlacesFrom` is the seam; this is the fetch).
 *
 * Read-only over the caller's OWN playdates rows (the playdates SELECT
 * policy is open to any authenticated user; the `.eq(host_profile_id)` is
 * what scopes it). No session → [] rather than a throw: the chips are a
 * convenience, and a form that cannot load them must still render.
 *
 * Failure discipline matches the rest of the app: the caller swallows a
 * failed load into an empty chip row (no error state on /new — a parent who
 * has never posted gets the same thing legitimately).
 */
export async function listRecentOwnPlaces(limit?: number): Promise<RecentPlace[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) return []
  const rows = await queryRecentOwnPlacesWithClient(supabase, user.id)
  return recentPlacesFrom(
    rows as Array<{ place: string; address: string | null; neighborhood_id: string }>,
    limit,
  )
}

// ---------------------------------------------------------------------------
// V8 ticket 05: post edit + delete — the two writes behind the host's
// Edit / Delete actions on the detail page.
//
// NO MIGRATION: `playdates` ships host-only UPDATE and DELETE policies from
// 0005 (capability without UI), so both operations ride the existing
// whole-row posture. Two pins from the house lessons:
//   - no `.select()` / RETURNING on either write (the 42501 lesson: a write
//     whose row the SELECT policy excludes 403s on the read-back). The
//     callers re-read or navigate instead.
//   - the DELETE leaves the children to the DATABASE. going_pings (0007),
//     comments (0013), playdate_kids (0022) and ping_kids (0026) all carry
//     ON DELETE CASCADE to playdates, so nothing is hand-deleted
//     client-side (a partial client-side cascade is how a post loses its
//     comments but keeps its "going" rows, or vice versa).
//
// A non-host call is a silent RLS no-op (0 rows, 2xx — the 0014 lesson);
// the host-only controls on the detail page are the user-facing wall and
// the RLS policies are the backstop.

/**
 * The editable fields of a post (V8 ticket 05, the edit form's payload).
 * Everything else on the row is either not editable (host_profile_id,
 * age_hint, status, hidden_at, created timestamps) or the end instant,
 * which is always computed from start + duration.
 */
export interface UpdatePlaydateInput {
  title: string
  place: string
  neighborhoodId: string
  /** ISO 8601 (UTC) — the form's local date/minutes converted. */
  startsAt: string
  endsAt: string
  /** Null clears the stored details (the form's empty → null rule). */
  details: string | null
  /** Null clears the stored address (the form's empty → null rule). */
  address: string | null
}

/**
 * Update a post's own fields (V8 ticket 05), against an injected client
 * (the setPlaydateStatusWithClient pattern — mockable). A plain update with
 * no RETURNING: the caller (the edit page) navigates to the detail page,
 * which re-reads the row.
 *
 * `status` is deliberately NOT in the payload — an edit never resurrects a
 * cancelled post or cancels an on one; that stays the status control's job.
 * `age_hint` is deliberately absent too, so the stored value survives an
 * edit even though the form no longer renders the field.
 */
export async function updatePlaydateWithClient(
  client: SupabaseClient,
  playdateId: string,
  input: UpdatePlaydateInput,
): Promise<void> {
  const { error } = await client
    .from('playdates')
    .update({
      title: input.title,
      place: input.place,
      neighborhood_id: input.neighborhoodId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      details: input.details,
      address: input.address,
    })
    .eq('id', playdateId)
  if (error) throw error
}

/** The default-client wrapper (the edit form's save). */
export async function updatePlaydate(
  playdateId: string,
  input: UpdatePlaydateInput,
): Promise<void> {
  return updatePlaydateWithClient(supabase, playdateId, input)
}

/**
 * Delete a post (V8 ticket 05), against an injected client: a plain delete
 * with no RETURNING. The row's children go with it — the DATABASE's
 * cascades (going_pings, comments, playdate_kids, ping_kids), never a
 * client-side hand-delete. The caller navigates to / afterwards.
 */
export async function deletePlaydateWithClient(
  client: SupabaseClient,
  playdateId: string,
): Promise<void> {
  const { error } = await client.from('playdates').delete().eq('id', playdateId)
  if (error) throw error
}

/** The default-client wrapper (the detail page's Delete confirmation). */
export async function deletePlaydate(playdateId: string): Promise<void> {
  return deletePlaydateWithClient(supabase, playdateId)
}

// ---------------------------------------------------------------------------
// V3 slice 2 (ticket 02): host status + the Open-Meteo rain badge.
//
// The status column (migration 0016) may not be applied to the live
// project until the orchestrator applies it — the status write then throws
// (42703, unknown column), and the detail page surfaces a designed error
// line instead of crashing (same discipline as slices 2–5). The write is
// host-only: RLS `playdates_update_host` (0005) is the wall — a non-host
// API write is a silent 0-row 2xx (the 0014/PostgREST lesson), so the
// client hides the control from non-hosts. Pre-0016-apply the `*` selects
// omit the column (undefined at runtime — the UI treats missing as 'on').

/**
 * Set the host's status on a drop-in (V3 slice 2, ticket 02), against an
 * injected client (the trust.togglePingWithClient pattern — mockable).
 * Plain update, no RETURNING (42501 discipline: the playdates SELECT
 * posture stays untouched — 0016 changes no SELECT policy). A non-host
 * call is a silent RLS no-op (0 rows, 2xx), never an error — the DB wall
 * is the backstop, the hidden control is the user-facing wall.
 */
export async function setPlaydateStatusWithClient(
  client: SupabaseClient,
  playdateId: string,
  status: PlaydateStatus,
): Promise<void> {
  const { error } = await client
    .from('playdates')
    .update({ status })
    .eq('id', playdateId)
  if (error) throw error
}

/** The default-client wrapper (the detail page's host status control). */
export async function setPlaydateStatus(
  playdateId: string,
  status: PlaydateStatus,
): Promise<void> {
  return setPlaydateStatusWithClient(supabase, playdateId, status)
}

/**
 * The Open-Meteo daily rain-probability cache (V3 slice 2, ticket 02),
 * keyed per (zip, local event date). Holds settled promises (never
 * rejects — a failed attempt resolves to null AND is removed from the
 * cache below, the zip-cache lesson e0d3756: a pinned rejection would
 * need a page reload to clear).
 */
const rainProbabilityCache = new Map<string, Promise<number | null>>()

/**
 * One Open-Meteo daily fetch (no key, no location sensing — the plan pin):
 * the event's LOCAL date (YYYY-MM-DD, the device timezone — V1's only
 * timezone story) as a one-day range, timezone=auto. Throws on any
 * HTTP/parse problem (the caller retries once, then settles null).
 */
async function openMeteoDailyMaxProbability(
  lat: number,
  lng: number,
  dateYmd: string,
): Promise<number> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('daily', 'precipitation_probability_max')
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('start_date', dateYmd)
  url.searchParams.set('end_date', dateYmd)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`)
  const payload = (await res.json()) as {
    daily?: { precipitation_probability_max?: Array<number | null> }
  }
  const value = payload.daily?.precipitation_probability_max?.[0]
  if (value === null || value === undefined || !Number.isFinite(value)) {
    throw new Error('Open-Meteo returned no precipitation probability')
  }
  return value
}

/**
 * The daily precipitation-probability max for a zip's event date
 * (V3 slice 2, ticket 02): lat/lng from the 0012 client-side zip map
 * (a zip missing from the gazetteer → null — coordinates are never
 * invented, the radius feed's pinned rule). Best-effort per the plan
 * pin:
 * - ONE fetch per distinct (zip, event-date) — the module cache + the
 *   in-flight dedupe (concurrent callers share the cached promise);
 * - RETRY once on a failed fetch; a double failure (or an out-of-range
 *   date Open-Meteo rejects) resolves null and is NOT cached, so the
 *   next call retries — the zip-cache lesson (e0d3756);
 * - null, NEVER throws, on any error (the "Rain likely" badge is
 *   silently absent — no error state, the zero-pressure soul).
 */
export async function fetchRainProbabilityForZip(
  zip: string,
  eventDateIso: string,
): Promise<number | null> {
  const dateYmd = localDayKey(eventDateIso)
  const key = `${zip}:${dateYmd}`
  const pending = rainProbabilityCache.get(key)
  if (pending !== undefined) return pending

  // The in-flight promise (settled below, never rejects) is cached
  // SYNCHRONOUSLY so a concurrent caller dedupes onto this fetch.
  const inFlight = (async () => {
    let coordsMap: ReadonlyMap<string, ZipCoords>
    try {
      coordsMap = await loadZipCodes()
    } catch {
      // The gazetteer fetch failed (0012 not applied / transient) —
      // uncacheable: delete the in-flight entry so the NEXT call
      // re-issues the fetch (the zip-cache lesson — never cache a
      // rejection).
      rainProbabilityCache.delete(key)
      return null
    }
    const coords = coordsMap.get(zip)
    if (coords === undefined) {
      // Not in the seeded gazetteer — stable for the SPA session,
      // cacheable (no invented coordinates).
      return null
    }
    try {
      return await openMeteoDailyMaxProbability(coords.lat, coords.lng, dateYmd)
    } catch {
      // One retry on failure (the plan pin).
      try {
        return await openMeteoDailyMaxProbability(coords.lat, coords.lng, dateYmd)
      } catch {
        // Double failure / out-of-range date → null, uncacheable: delete
        // the in-flight entry so the NEXT call re-issues the fetch (the
        // zip-cache lesson — never cache a rejection).
        rainProbabilityCache.delete(key)
        return null
      }
    }
  })()
  rainProbabilityCache.set(key, inFlight)
  return inFlight
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
      // V3 slice 2 (ticket 02): the host embed also carries home_zip —
      // the weather lookup's key (the post's location = the host's home
      // zip, the V2 pin; the Open-Meteo fetch in the detail page).
      '*, neighborhood:neighborhoods!inner ( id, name ), host:profiles!playdates_host_profile_id_fkey ( id, display_name, avatar_url, home_zip )',
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
  return normalizePublicPlaydate(data as unknown as PublicPlaydateDetail | null)
}

/**
 * PostgREST serializes a composite-returning function's NULL as a row whose
 * EVERY field is null — verified live 2026-09-11: a bogus id returns HTTP 200
 * with `{id: null, title: null, ...}`, not a JSON null. A bare `?? null`
 * therefore let that row through, and a stale or mistyped /playdate/<id> link
 * rendered a phantom drop-in (epoch date, "null families going") instead of
 * the not-found state. The id IS the row's identity: no id, no post.
 */
export function normalizePublicPlaydate(
  data: PublicPlaydateDetail | null | undefined,
): PublicPlaydateDetail | null {
  if (data === null || data === undefined) return null
  return typeof data.id === 'string' && data.id.length > 0 ? data : null
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
 * Email a password-reset link (V5 beta readiness). Supabase answers the same
 * way whether or not the address has an account, so the caller shows the
 * neutral RESET_REQUEST_NOTICE rather than confirming existence.
 *
 * The link lands on /reset-password with a recovery token that supabase-js
 * turns into a session; setNewPassword finishes the job from there.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: resetRedirectTo(window.location.origin),
  })
  if (error) throw error
}

/** Set a new password for the session the recovery link established. */
export async function setNewPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

/**
 * Which of MY kids are coming to a drop-in (V6, migration 0026).
 *
 * The ping itself records only the parent — this is the second half, and it is
 * deliberately a REPLACE: the caller hands the complete selection and we
 * delete-then-insert. A diff would need the current rows, and the row set is
 * tiny (at most a handful of kids), so replace is both simpler and idempotent.
 *
 * RLS is the wall on both statements (insert/delete: profile_id = auth.uid()),
 * and the FK to going_pings means a selection cannot exist without the ping.
 */
export async function setPingKids(playdateId: string, kidIds: string[]): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('No authenticated user — cannot save who is coming.')

  const { error: deleteError } = await supabase
    .from('ping_kids')
    .delete()
    .eq('playdate_id', playdateId)
    .eq('profile_id', user.id)
  if (deleteError) throw deleteError

  if (kidIds.length === 0) return
  const { error: insertError } = await supabase.from('ping_kids').insert(
    kidIds.map((kidId) => ({ playdate_id: playdateId, profile_id: user.id, kid_id: kidId })),
  )
  if (insertError) throw insertError
}

/**
 * The names + ages of the kids coming to a drop-in (V6). The RPC's own gate
 * (0026, mirroring get_guest_list) decides: the host, a caller who has pinged,
 * or a moderator get rows; everyone else gets an empty set. Empty is therefore
 * "none I may see", not "none coming" — the card's count is the public number.
 */
export async function listKidsGoing(
  playdateId: string,
): Promise<Array<{ id: string; firstName: string; age: number | null }>> {
  const { data, error } = await supabase.rpc('get_kids_going', { p_id: playdateId })
  if (error) throw error
  const rows = (data ?? []) as Array<{ kid_id: string; first_name: string; age: number | null }>
  return rows.map((row) => ({
    id: row.kid_id,
    firstName: row.first_name,
    age: row.age,
  }))
}

/** This user's selections on one post (RLS: own rows), for the picker. */
export async function listMyPingKids(playdateId: string): Promise<string[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('ping_kids')
    .select('kid_id')
    .eq('playdate_id', playdateId)
    .eq('profile_id', user.id)
  if (error) throw error
  return ((data ?? []) as Array<{ kid_id: string }>).map((row) => row.kid_id)
}

/**
 * The batched kids count for a feed (V6, migration 0027): one call for every
 * card on screen, not one per card. Posts with nobody bringing kids are absent
 * from the response, so the caller defaults them to 0.
 *
 * The count is public to signed-in viewers; the IDENTITIES are not (they come
 * from get_kids_going, gated). That split is the whole point of the pair.
 */
export async function countKidsGoingForPosts(postIds: string[]): Promise<Record<string, number>> {
  if (postIds.length === 0) return {}
  const { data, error } = await supabase.rpc('count_kids_going_for', { p_ids: postIds })
  if (error) throw error
  const counts: Record<string, number> = {}
  for (const row of (data ?? []) as Array<{ playdate_id: string; kids_count: number }>) {
    counts[row.playdate_id] = row.kids_count
  }
  return counts
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

/**
 * The playdate ids a user has pinged (V3 slice 3, ticket 06 — the feed
 * card's "going" check toggle: one query gives every card its active
 * state). Injected-client pattern (trust.togglePingWithClient: the
 * client is a parameter so the round-trip is mockable in unit tests);
 * the default wrapper below resolves the auth user.
 */
export async function listMyPingPostIdsWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<ReadonlySet<string>> {
  const { data, error } = await client
    .from('going_pings')
    .select('playdate_id')
    .eq('profile_id', profileId)
  if (error) throw error
  const ids = new Set<string>()
  for (const row of (data ?? []) as Array<{ playdate_id: string | null }>) {
    if (row.playdate_id !== null && row.playdate_id !== undefined) ids.add(row.playdate_id)
  }
  return ids
}

/**
 * The default-client wrapper (the feed's card check toggle): the signed-in
 * user's own pings. Signed out → an empty set (the caller is a signed-in
 * surface; the empty set just keeps the toggles inactive, never a crash).
 */
export async function listMyPingPostIds(): Promise<ReadonlySet<string>> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return new Set<string>()
  return listMyPingPostIdsWithClient(supabase, user.id)
}

/**
 * One ping of a feed post, with the pinger's profile joined in (V3 slice
 * 4, ticket 07 — the card's going line: "N going" + the pinger circles).
 * `avatarUrl` null = the card's initial-fallback circle; `displayName`
 * feeds that fallback only (names never surface on cards — the guest list
 * stays on the detail page per ticket 05).
 */
export interface PingForPost extends GoingPinger {
  /** The post the ping is on. */
  playdateId: string
  /** The ping's created_at (migration 0020) — the circles' order key. */
  createdAt: string
}

/**
 * The pings for a set of posts (V3 slice 4, ticket 07), against an
 * injected client (the trust.togglePingWithClient / feed.
 * queryUpcomingFeedWithClient pattern — mockable in unit tests). One
 * query: the going_pings rows for the given posts, with the pinger's
 * profiles embed pinned to the FK constraint name (PGRST201 lesson: two
 * playdates→profiles paths exist — `profiles!going_pings_profile_id_fkey`
 * is the 0007 constraint), ordered by created_at (migration 0020) so the
 * cards' circles are in ping order. The caller (the feed page) groups the
 * rows by playdateId; each group feeds the pure buildGoingLine.
 *
 * Empty postIds → [] with NO query (an empty .in() would match nothing).
 * Rows with a missing playdate_id or a vanished pinger profile are
 * skipped (defensive — the 0007 FK cascade normally prevents the latter).
 * Pre-0020-apply the created_at select 42703s; the caller (the feed page)
 * catches and degrades to no going lines (the DB-not-applied discipline).
 */
export async function listPingsForPostsWithClient(
  client: SupabaseClient,
  postIds: string[],
): Promise<PingForPost[]> {
  if (postIds.length === 0) return []
  const { data, error } = await client
    .from('going_pings')
    .select(
      'playdate_id, created_at, profile:profiles!going_pings_profile_id_fkey ( avatar_url, display_name )',
    )
    .in('playdate_id', postIds)
    .order('created_at', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as unknown as Array<{
    playdate_id: string | null
    created_at: string
    profile: { avatar_url: string | null; display_name: string } | null
  }>
  return rows.flatMap((row) => {
    if (row.playdate_id === null || row.profile === null) return []
    return [
      {
        playdateId: row.playdate_id,
        avatarUrl: row.profile.avatar_url ?? null,
        displayName: row.profile.display_name,
        createdAt: row.created_at,
      },
    ]
  })
}

/** The default-client wrapper (the feed's card going lines). */
export async function listPingsForPosts(postIds: string[]): Promise<PingForPost[]> {
  return listPingsForPostsWithClient(supabase, postIds)
}

// ---------------------------------------------------------------------------
// V3 slice 9 (ticket 04): host retention loop.
//
// The retention cursor (migration 0024: profiles.last_seen_at) may not be
// applied to the live project until the orchestrator applies it —
// restampLastSeen then 42703s on the missing column, and the caller
// (FeedPage's fire-and-forget restamp) catches + swallows it (the pinned
// contract: never a crash — the e2e's documented red point, same
// discipline as slices 2–7). The cursor's READERS (V8 ticket 03's inbox)
// ride on existing tables (playdates, going_pings, comments), so they are
// green pre-apply; it is the cursor that gates them.

/**
 * The all-time hosted count (V3 slice 9, ticket 04): UserPage's "Hosted
 * N drop-ins" line — computed behavioral history (the 2026-09-09 design
 * verdict: NO reviews, NO vouching — trust transfers by repeated
 * exposure, made visible). NO status/end filters (all-time, cancelled
 * or ended posts included — the "behavioral" pin), against an injected
 * client (the *WithClient pattern — mockable in unit tests).
 */
export async function countPostsByHostWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<number> {
  const { count, error } = await client
    .from('playdates')
    .select('id', { count: 'exact', head: true })
    .eq('host_profile_id', profileId)
  if (error) throw error
  return count ?? 0
}

/** The default-client wrapper (UserPage's "Hosted N drop-ins" line). */
export async function countPostsByHost(profileId: string): Promise<number> {
  return countPostsByHostWithClient(supabase, profileId)
}

/**
 * Restamp the retention cursor (V3 slice 9, ticket 04, migration 0024):
 * set profiles.last_seen_at to now — a plain update, NO RETURNING (42501
 * discipline — the profiles SELECT posture stays untouched; 0024
 * changes no SELECT policy). Pre-0024-apply this 42703s on the missing
 * column — call sites catch + swallow (the pinned fire-and-forget
 * contract; the e2e's documented red point, never a crash — the cursor
 * just never lands, the banner stays hidden).
 */
export async function touchLastSeen(client: SupabaseClient, profileId: string): Promise<void> {
  const { error } = await client
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', profileId)
  if (error) throw error
}

/** The default-client wrapper (the feed page's mount restamp, fire-and-forget). */
export async function restampLastSeen(profileId: string): Promise<void> {
  return touchLastSeen(supabase, profileId)
}

// ---------------------------------------------------------------------------
// V8 ticket 03: "While you were away" — the feed-top inbox's three reads.
//
// NO new SQL surface for NAMES: the pinger rows come from the EXISTING gated
// read (listPingsForPostsWithClient, the going_pings → profiles embed pinned to
// the 0007 FK constraint) and the rest are the viewer's own rows or counts, so
// no broad profiles SELECT is added and no SECDEF helper is needed (the
// ticket's migration check: NONE). Every reader is cursor-free by design — the
// cursor decision is the pure buildWhileAwayItems (feed.ts), which is why the
// pings read can stay exactly the gated read the cards already use.

/**
 * The viewer's OWN posts (V8 ticket 03) — the title source for the ping and
 * comment items, against an injected client (the *WithClient pattern).
 * The playdates SELECT policy is open to any authenticated user (0005), so the
 * host's own rows come back directly; the status/end filters are deliberately
 * absent (a comment on a post that already happened is still news).
 */
export async function listMyPostRefsWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<WhileAwayMyPost[]> {
  const { data, error } = await client
    .from('playdates')
    .select('id, title')
    .eq('host_profile_id', profileId)
  if (error) throw error
  const rows = (data ?? []) as Array<{ id: string | null; title: string | null }>
  return rows.flatMap((row) =>
    row.id === null || row.id === undefined ? [] : [{ id: row.id, title: row.title ?? null }],
  )
}

/** The default-client wrapper (the feed's while-away inbox). */
export async function listMyPostRefs(): Promise<WhileAwayMyPost[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return []
  return listMyPostRefsWithClient(supabase, user.id)
}

/**
 * The visible comments on a set of posts (V8 ticket 03) — the "N new comments
 * on <title>" item's rows, against an injected client. The 0013/0014 SELECT
 * policy already hides hidden comments from non-moderators; the hidden_at
 * filter here is the same rule for the MODERATOR view (a comment the mod just
 * hid must not read as news and then not render on the detail page) — defense
 * in depth, never a second policy.
 *
 * Empty postIds → [] with NO query (an empty .in() would match nothing — the
 * listPingsForPostsWithClient rule). NO author embed: the item's copy is a
 * count, so no name is read here (names come only through the gated ping read).
 */
export async function listCommentsOnPostsWithClient(
  client: SupabaseClient,
  postIds: string[],
): Promise<WhileAwayCommentRow[]> {
  if (postIds.length === 0) return []
  const { data, error } = await client
    .from('comments')
    .select('playdate_id, created_at, hidden_at')
    .in('playdate_id', postIds)
  if (error) throw error
  const rows = (data ?? []) as Array<{
    playdate_id: string | null
    created_at: string
    hidden_at: string | null
  }>
  return rows.flatMap((row) =>
    row.playdate_id === null || row.hidden_at !== null
      ? []
      : [{ playdateId: row.playdate_id, createdAt: row.created_at }],
  )
}

/** The default-client wrapper (the feed's while-away inbox). */
export async function listCommentsOnPosts(postIds: string[]): Promise<WhileAwayCommentRow[]> {
  return listCommentsOnPostsWithClient(supabase, postIds)
}

/**
 * One post the viewer pinged, with its post row when it is readable (V8
 * ticket 03): the cancellation kind's rows, against an injected client. The
 * playdates embed is pinned to the 0007 FK constraint name
 * (`going_pings_playdate_id_fkey` — the PGRST201 house rule); the going_pings
 * SELECT policy is the broad authenticated one (0007), so this reads the
 * VIEWER's own pings only (`.eq('profile_id', profileId)` — no one else's).
 *
 * A row whose post is unreadable (deleted, or not handed back) yields nulls
 * for every post field — the join tolerates a missing row (the 0008
 * nullable-ref discipline) and the pure seam renders the fallback copy instead
 * of crashing on a null title. The status/upcoming decision is the pure seam's
 * (feed.buildWhileAwayItems), not this reader's.
 */
export async function listMyPingedPostsWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<WhileAwayPingedPostRow[]> {
  const { data, error } = await client
    .from('going_pings')
    .select(
      'playdate_id, playdate:playdates!going_pings_playdate_id_fkey ( id, title, status, starts_at )',
    )
    .eq('profile_id', profileId)
  if (error) throw error
  const rows = (data ?? []) as unknown as Array<{
    playdate_id: string | null
    playdate: { id: string; title: string | null; status: string | null; starts_at: string | null } | null
  }>
  return rows.flatMap((row) => {
    if (row.playdate_id === null || row.playdate_id === undefined) return []
    return [
      {
        playdateId: row.playdate_id,
        title: row.playdate?.title ?? null,
        status: row.playdate?.status ?? null,
        startsAt: row.playdate?.starts_at ?? null,
      },
    ]
  })
}

/** The default-client wrapper (the feed's while-away inbox). */
export async function listMyPingedPosts(): Promise<WhileAwayPingedPostRow[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return []
  return listMyPingedPostsWithClient(supabase, user.id)
}

// ---------------------------------------------------------------------------
// V8 ticket 04: one host's posts (/u/:handle's Upcoming/Past lists).
//
// Read-only over the EXISTING tables — no migration, no new policy: the
// playdates SELECT posture (0005, any authenticated user) already serves these
// rows, `hidden_at` exclusion is 0009's read rule, and `blocks` (0006) is reused
// through the existing listBlockedHostIds helper. The one thing this section
// adds is the query itself, in the two shapes the ticket pins: the card-shaped
// embed (so /u/:handle can render the existing DropInCard) and the cap.

/**
 * How many rows each of the host-post queries reads (V8 ticket 04 pin).
 *
 * Per SECTION, not per request: the two sections carry different orders, so they
 * are two queries — and an old host's history is the pile that grows, which is
 * why the past section's overflow is reported as a plain count
 * (HostPosts.olderCount → "+N older") instead of paginating. 50 is far past any
 * real host's data volume; the point is that the fetch is never unbounded.
 */
export const HOST_POSTS_LIMIT = 50

/**
 * The card-shaped SELECT for a host's posts (V8 ticket 04): the same shape the
 * feed's query uses (feed.queryUpcomingFeedWithClient), including BOTH FK hints
 * — `neighborhoods!inner` for the card's neighborhood label and
 * `profiles!playdates_host_profile_id_fkey` for the host embed (the PGRST201
 * lesson: two playdates→profiles embed paths exist, so an unpinned embed is an
 * error, not an ambiguity to resolve). Duplicated as a literal rather than
 * shared, because the feed query is not this ticket's to edit — the two strings
 * must stay identical.
 */
const HOST_POSTS_SELECT =
  '*, neighborhood:neighborhoods!inner ( id, name ), host:profiles!playdates_host_profile_id_fkey ( id, display_name, avatar_url, home_zip, radius_miles )'

/** One host's posts, ready for the profile pages (V8 ticket 04). */
export interface HostPosts {
  /** Upcoming (starts_at ascending) then past (starts_at descending). */
  posts: PlaydateWithNeighborhood[]
  /**
   * Past rows beyond HOST_POSTS_LIMIT — the plain "+N older" count the page
   * renders. 0 = nothing was truncated.
   */
  olderCount: number
}

/**
 * One host's visible posts, against an injected client (the *WithClient
 * pattern — mocked in feed.test.ts), for /u/:handle's Upcoming/Past lists.
 *
 * - NON-HIDDEN only: `.is('hidden_at', null)`, the same DB-level rule the feed
 *   applies (0009's read rule for everyone, moderator-hidden posts included).
 * - The viewer's own BLOCKS still filter the result. Every row this query can
 *   return is by `profileId`, so the rule collapses to exactly one case — the
 *   viewer blocked this host — and that case is answered WITHOUT a query: a
 *   blocked host's page must not leak posts through this new path (the ticket
 *   AC). The caller resolves the ids with the existing listBlockedHostIds.
 * - TWO queries, because the sections' orders differ and the cap is per section:
 *   upcoming ordered `starts_at` ascending, past ordered descending, each
 *   `limit(HOST_POSTS_LIMIT)` with an exact COUNT so the truncated past rows can
 *   be reported as a plain number (never a second unbounded fetch).
 * - The bucket split is `ends_at > nowIso` / `ends_at <= nowIso` — the same
 *   boundary the pure feed.partitionPostsByTime re-partitions these rows with, so
 *   the query's buckets and the render can never disagree. A drop-in happening
 *   RIGHT NOW (started, not ended) therefore lands in Upcoming, where a visitor
 *   can still join it, and the card badges it "Happening now".
 *
 * The result rows keep their loose (untyped) shape; the cast to
 * PlaydateWithNeighborhood happens here (the listMemberships pattern).
 */
export async function listPostsByHostWithClient(
  client: SupabaseClient,
  profileId: string,
  blockedHostIds: string[],
  nowIso: string,
): Promise<HostPosts> {
  if (blockedHostIds.includes(profileId)) return { posts: [], olderCount: 0 }
  const base = () =>
    client
      .from('playdates')
      .select(HOST_POSTS_SELECT, { count: 'exact' })
      .eq('host_profile_id', profileId)
      .is('hidden_at', null)
  const upcoming = await base()
    .gt('ends_at', nowIso)
    .order('starts_at', { ascending: true })
    .limit(HOST_POSTS_LIMIT)
  if (upcoming.error) throw upcoming.error
  const past = await base()
    .lte('ends_at', nowIso)
    .order('starts_at', { ascending: false })
    .limit(HOST_POSTS_LIMIT)
  if (past.error) throw past.error
  const pastRows = (past.data ?? []) as unknown as PlaydateWithNeighborhood[]
  const pastTotal = past.count ?? pastRows.length
  return {
    posts: [
      ...((upcoming.data ?? []) as unknown as PlaydateWithNeighborhood[]),
      ...pastRows,
    ],
    olderCount: Math.max(0, pastTotal - pastRows.length),
  }
}

/**
 * One host's visible posts (V8 ticket 04) — /u/:handle's Upcoming/Past lists —
 * against the shared client. The viewer's blocks come from the EXISTING helper
 * (listBlockedHostIds; the blocks RLS hands back the caller's own rows), so a
 * host the viewer has blocked renders no posts here either. With no signed-in
 * viewer (/u/:handle is auth-walled, so this is only a defensive branch) no
 * block filter is applied — nothing is claimed about a viewer that isn't there.
 *
 * A failed load throws: the page renders its designed error line (the
 * countPostsByHost / listRadiusFeed discipline — never a crash).
 */
export async function listPostsByHost(profileId: string): Promise<HostPosts> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const blockedHostIds = user === null ? [] : await listBlockedHostIds(user.id)
  return listPostsByHostWithClient(
    supabase,
    profileId,
    blockedHostIds,
    new Date().toISOString(),
  )
}

// ---------------------------------------------------------------------------
// V3 slice 10 (ticket 05): the guest list — the get_guest_list RPC.
//
// The SECURITY DEFINER function (migration 0025) may not be applied to the
// live project until the orchestrator applies it — the RPC 404s pre-apply
// (the function does not exist yet), and the caller (the detail page's
// guest-list block) catches and the block stays hidden (the DB-not-applied
// discipline, same as the ping / kids / comments sections). The count path
// (getGoingCount, the broad authenticated SELECT) is UNCHANGED by this
// function (the 0025 header's broad-SELECT-stays pin).

/**
 * The named guest list for a drop-in (V3 slice 10, ticket 05, migration
 * 0025): the SECURITY DEFINER get_guest_list RPC — the pingers'
 * display_names (ordered by ping created_at), and ONLY for the post's
 * host or a pinger (the function returns an empty set to everyone else,
 * so names never cross to strangers). An empty array when the caller has
 * no access OR there are no pings. Pre-0025-apply the RPC 404s (the
 * function does not exist yet) — the caller catches and the guest-list
 * block stays hidden (the DB-not-applied discipline, same as the ping /
 * kids / comments sections). The count path (getGoingCount, the broad
 * authenticated SELECT) is UNCHANGED by this function (the 0025 header's
 * broad-SELECT-stays pin) and keeps working for every viewer.
 */
export async function fetchGuestListWithClient(
  client: SupabaseClient,
  playdateId: string,
): Promise<string[]> {
  const { data, error } = await client.rpc('get_guest_list', { p_id: playdateId })
  if (error) throw error
  return (data as unknown as string[] | null) ?? []
}

/** The default-client wrapper (the detail page's guest-list block). */
export async function fetchGuestList(playdateId: string): Promise<string[]> {
  return fetchGuestListWithClient(supabase, playdateId)
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

/**
 * The avatar's stored size: encoded to a 512px square before upload.
 *
 * Was 256 until photo-crop ticket 04. 256 was sized for the circles (24px in the
 * feed needs 72px at 3x, so it was ample), but V6 added "photos should enlarge":
 * tapping an avatar opens `ImageLightbox` at essentially full screen, where a
 * 256px square on a 390pt phone is a ~4.5x upscale — mush, in the one place a
 * parent goes specifically to look closely.
 *
 * 512 is 2x what the circles need and sharp at phone size, while still encoding to
 * tens of KB. Deliberately NOT the original resolution: the privacy property of
 * this pipeline is that the original never leaves the device.
 */
export const AVATAR_SIZE_PX = 512

/** Bio cap (plan-v2 Interfaces: <= 500 chars; the 0011 CHECK is the backstop). */
export const BIO_MAX_LENGTH = 500

/** The kids cap per profile (plan-v2 Interfaces: app-enforced, not DB). */
export const MAX_KIDS_PER_PROFILE = 5

/**
 * The kid "likes" cap (V3 slice 6, ticket 09, migration 0022): <= 100
 * characters, UI pin — the caps are app-enforced (the UI wall), NO DB
 * CHECK (the 0021 address lesson; 0022 adds the column plain).
 */
export const LIKES_MAX_LENGTH = 100

/**
 * The profile "interests" cap (V3 slice 6, ticket 09, migration 0022):
 * <= 200 characters, UI pin — app-enforced, NO DB CHECK (the 0021
 * address lesson; 0022 adds the column plain).
 */
export const INTERESTS_MAX_LENGTH = 200

/**
 * Pure photo input validation (the avatar + kid-photo machinery, V2
 * ticket 02; the kid photo reuses it in V3 slice 6, ticket 09): an error
 * message, or null when valid. Rejects non-images and files over
 * AVATAR_MAX_BYTES.
 *
 * WHERE THE GATE LIVES, since photo-crop ticket 03 moved it: it is called from
 * `useCropStep.beginCrop`, NOT from `uploadAvatar`/`uploadKidPhoto`. Those take an
 * already-decoded source, so there is no File left to measure by the time they run.
 * The ticket AC ("> 5 MB rejected before upload") therefore holds by CONVENTION —
 * the upload functions are reachable only from the crop dialog's confirm, and the
 * dialog only exists once this returned null — rather than by construction inside
 * the upload path. Moving it back would cost a second ~48MB decode of every photo;
 * the trade is recorded here so the invariant is not mistaken for enforcement.
 */
export function validateAvatarFile(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return 'Pick an image file (a photo).'
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
 * Pure kid-likes validation (V3 slice 6, ticket 09, migration 0022):
 * <= LIKES_MAX_LENGTH characters after trim (the UI pin — no DB CHECK).
 */
export function validateKidLikes(likes: string): string | null {
  if (likes.trim().length > LIKES_MAX_LENGTH) {
    return `Keep likes to ${LIKES_MAX_LENGTH} characters.`
  }
  return null
}

/**
 * Pure interests validation (V3 slice 6, ticket 09, migration 0022):
 * <= INTERESTS_MAX_LENGTH characters after trim (the UI pin — no DB
 * CHECK).
 */
export function validateInterests(interests: string): string | null {
  if (interests.trim().length > INTERESTS_MAX_LENGTH) {
    return `Keep interests to ${INTERESTS_MAX_LENGTH} characters.`
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
 * The pixel size of a canvas source, whatever kind it is. `CanvasImageSource` is a
 * union (ImageBitmap, HTMLImageElement, HTMLCanvasElement, ImageData, VideoFrame…)
 * and they do not agree on where the size lives, so the guard in
 * `prepareAvatarFile` needs one place that knows.
 */
function sourceSize(source: CanvasImageSource): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight }
  }
  const sized = source as { width?: number; height?: number }
  return { width: sized.width ?? 0, height: sized.height ?? 0 }
}

/**
 * Client-side encode of the user's CHOSEN crop as a square JPEG (V2 ticket 02;
 * reframed by photo-crop ticket 03).
 *
 * It NO LONGER DECIDES THE CROP. This function used to scale the photo to cover a
 * square and keep the middle of it, which is why a portrait photo of a kid
 * arrived as a circle of shoulder (see `.scratch/photo-crop/spec.md`). The frame
 * now comes from the user as a `CropRect` from `src/lib/photoCrop.ts` — the same
 * rectangle the crop dialog previewed, so what was framed is what is kept.
 *
 * Size and format are still decided HERE, and that is the division of labour:
 * framing belongs to the crop step, "how big and in what format" belongs to the
 * encoder, and there is exactly one of each. Runs in the browser (canvas), so the
 * network only ever sees the small result and never the original.
 *
 * The source is NOT closed here — the caller owns it, because the same decoded
 * bitmap is what the crop dialog drew (`useCropStep` closes it when the flow
 * ends). Closing it here would blank the preview.
 */
export async function prepareAvatarFile(
  source: CanvasImageSource,
  rect: CropRect,
  size: number = AVATAR_SIZE_PX,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('Could not resize the photo (canvas unavailable).')
  // Refuse an undrawable frame LOUDLY. A zero or non-finite source rect makes
  // drawImage produce a blank square with no error at all, so the failure would
  // arrive as a successfully-uploaded grey avatar. Unreachable from the app (only
  // cropRectFor output reaches here) — which is the point: this is the one line
  // whose output is what the user actually ends up looking at.
  if (!isDrawableRect(rect, sourceSize(source))) {
    throw new Error('Could not crop the photo (the chosen area is outside the image).')
  }
  ctx.imageSmoothingQuality = 'high'
  // The 9-argument form: take `rect` from the source, draw it across the whole
  // output square. One scale, no second crop decision.
  ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, size, size)
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
 * The shared avatars-bucket upload core (V2 ticket 02; V3 slice 6, ticket 09
 * generalized it for kid photos; photo-crop ticket 03 reframed it): encode the
 * CHOSEN crop of an already-decoded source as a square JPEG (prepareAvatarFile —
 * the network only ever sees the small result), upload to the 'avatars' bucket at
 * `objectPath`, and return the public URL.
 *
 * The ≤5MB / image-only gate does NOT live here any more. It cannot: by this point
 * the caller has already decoded the file, so there is no File left to measure.
 * It lives in `useCropStep.beginCrop` instead — one place, running before the
 * decode and before the crop dialog opens, so a rejected file never gets either.
 *
 * The 0011 owner-scoped write policies (avatars_owner_insert / _update / _delete)
 * key on (storage.foldername(name))[1] = auth.uid()::text — the path's FIRST
 * folder must be the caller's own uid — so they cover EVERY path below `<uid>/`:
 * the parent's own avatar (<uid>/avatar) AND the kid photo (<uid>/kids/<kidId>,
 * the 0022 cover decision — the 0022 header is the audit record; no new storage
 * policy). A cross-user write is rejected by the same first-folder check.
 */
async function uploadAvatarObject(
  client: SupabaseClient,
  objectPath: string,
  source: CanvasImageSource,
  rect: CropRect,
): Promise<string> {
  const blob = await prepareAvatarFile(source, rect)
  const { error } = await client.storage
    .from('avatars')
    .upload(objectPath, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error
  const { data } = client.storage.from('avatars').getPublicUrl(objectPath)
  // CACHE-BUST. The object path is FIXED per user (<uid>/avatar,
  // <uid>/kids/<kidId>) and upsert REPLACES the object in place, but the public URL
  // does not change — so the CDN and the browser keep serving the PREVIOUS photo for
  // the object's cache lifetime (Supabase's default is an hour). That was always
  // true, but the crop step makes it visible and confusing: a parent re-crops to fix
  // a photo, sees the old one, and reasonably concludes the crop did not work.
  //
  // A changing query is safe here because nothing parses avatar_url — every reader
  // passes it straight to an <img src> (checked: no split/match/parse of it in src/).
  // Versioned by the write time rather than a random value, so it is stable for a
  // given upload rather than different on every render.
  return `${data.publicUrl}?v=${Date.now()}`
}

/**
 * Upload the signed-in user's avatar (V2 ticket 02; photo-crop ticket 03): encode
 * the chosen crop of the decoded `source`, upload to the 'avatars' bucket at
 * <uid>/avatar (the owner-scoped write policy from 0011 — no cross-user writes),
 * then point profiles.avatar_url at the public URL. Returns the public URL.
 *
 * `source` + `rect` rather than a File: the file was already validated and decoded
 * by the crop step, and re-decoding here would cost a second ~48MB decode of the
 * same 12MP photo to produce the identical bitmap.
 */
export async function uploadAvatar(
  profileId: string,
  source: CanvasImageSource,
  rect: CropRect,
): Promise<string> {
  const publicUrl = await uploadAvatarObject(supabase, `${profileId}/avatar`, source, rect)
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', profileId)
  if (profileError) throw profileError
  return publicUrl
}

/**
 * Upload one of the owner's kid photos (V3 slice 6, ticket 09, migration 0022;
 * photo-crop ticket 03): encode the chosen crop of the decoded `source`, stored in
 * the 'avatars' bucket at <uid>/kids/<kidId> (the 0011 owner-scoped write
 * policy's documented coverage — the 0022 header), then point kids.avatar_url at
 * the public URL. Returns the public URL. The kid-photo pin: this URL renders ONLY
 * in the profile kids list (the 40px circle) — never on cards or event lines.
 *
 * The ≤5MB / image-only gate moved to `useCropStep.beginCrop`, which runs before
 * the decode — see the note on uploadAvatarObject.
 */
export async function uploadKidPhoto(
  profileId: string,
  kidId: string,
  source: CanvasImageSource,
  rect: CropRect,
): Promise<string> {
  const publicUrl = await uploadAvatarObject(
    supabase,
    `${profileId}/kids/${kidId}`,
    source,
    rect,
  )
  const { error: kidError } = await supabase
    .from('kids')
    .update({ avatar_url: publicUrl })
    .eq('id', kidId)
    .eq('profile_id', profileId)
  if (kidError) throw kidError
  return publicUrl
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
 * Update the caller's interests (V3 slice 6, ticket 09, migration 0022):
 * the profile update path gains the interests field (the existing
 * display_name / bio / zip self-only UPDATE posture is unchanged — the
 * 0020/0021 column-add lesson: the column rides the existing UPDATE
 * policies, no RLS change, the <= INTERESTS_MAX_LENGTH cap is app-
 * enforced). Validated pure first (the updateBio defense-in-depth
 * pattern); an empty value clears the field (the /u/:handle line hides
 * it). Pre-0022-apply the missing column 42703s; the caller (the
 * profile edit) surfaces a designed error line, never a crash.
 */
export async function updateInterests(userId: string, interests: string): Promise<void> {
  const interestsError = validateInterests(interests)
  if (interestsError !== null) throw new Error(interestsError)
  const { error } = await supabase
    .from('profiles')
    .update({ interests: interests.trim() })
    .eq('id', userId)
  if (error) throw error
}

/**
 * One profile's kid rows, ordered by age (V2 ticket 02: first name + age —
 * the privacy pin; no full names or gender exist to fetch). V3 slice 6
 * (ticket 09, migration 0022) widens the surface: the `*` select also
 * surfaces the optional kid photo (avatar_url) + likes once 0022 is
 * applied (undefined at runtime before then — the renders are null-safe,
 * the pre-0016 status-column discipline; an explicit new-column list would
 * 42703 the load pre-apply and break the /new picker's designed empty
 * state). The kids SELECT policy is open to any authenticated user (the
 * public profile surface); a read failure (0011 not applied yet) throws,
 * and the caller renders a designed state.
 */
export async function listKids(profileId: string): Promise<Kid[]> {
  const { data, error } = await supabase
    .from('kids')
    .select('*')
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

/**
 * The patch shape for updateKidWithClient (V3 slice 6, ticket 09,
 * migration 0022): the kid's optional photo URL (normally written by
 * uploadKidPhoto, which owns the storage round-trip) + the "likes"
 * conversation starter (<= LIKES_MAX_LENGTH after trim — the UI pin; no
 * DB CHECK, the 0021 address lesson).
 */
export interface KidPatch {
  avatar_url?: string | null
  likes?: string | null
}

/**
 * Update one kid row (V3 slice 6, ticket 09, migration 0022), against an
 * injected client (the house *WithClient pattern — mockable): the owner's
 * kid editor's likes save (avatar_url is written directly by
 * uploadKidPhoto). The 0011 kids_update_own policy (owner-only) is the DB
 * wall — a non-owner write is a silent RLS no-op (the 0014 lesson); the
 * owner is the only caller. The likes value is validated pure first (the
 * updateBio defense-in-depth pattern); an empty/null likes is a clear (the
 * /u/:handle line hides it). Pre-0022-apply the missing column 42703s;
 * the caller (the profile kid editor) surfaces a designed error line,
 * never a crash.
 */
export async function updateKidWithClient(
  client: SupabaseClient,
  kidId: string,
  patch: KidPatch,
): Promise<void> {
  const payload: Record<string, string | null> = {}
  if (patch.avatar_url !== undefined) payload.avatar_url = patch.avatar_url
  if (patch.likes !== undefined) {
    if (patch.likes !== null) {
      const likesError = validateKidLikes(patch.likes)
      if (likesError !== null) throw new Error(likesError)
    }
    payload.likes = patch.likes === null ? null : patch.likes.trim()
  }
  if (Object.keys(payload).length === 0) return
  const { error } = await client.from('kids').update(payload).eq('id', kidId)
  if (error) throw error
}

/** The default-client wrapper (the profile kid editor's likes save). */
export async function updateKid(kidId: string, patch: KidPatch): Promise<void> {
  return updateKidWithClient(supabase, kidId, patch)
}

// ---------------------------------------------------------------------------
// V3 slice 6 (ticket 09): the per-post "kids you're bringing" selection
// (migration 0022's playdate_kids) — the /new picker's write + the detail
// page's "Kids coming" line read.

/**
 * A post's "Kids coming" rows (V3 slice 6, ticket 09, migration 0022),
 * against an injected client (the trust.togglePingWithClient pattern —
 * mockable in unit tests): the host's picked kids from playdate_kids,
 * each mapped to name + age ONLY (the PlaydateKid privacy pin; the kid's
 * avatar_url is deliberately NOT selected — the kid-photo pin: photos
 * render only in the profile kids list, never on the event line). The
 * kids embed joins on kid_id (the 0022 playdate_kids→kids FK); the rows
 * come back ordered by name (the line's order — listPlaydateKidNames's
 * callers pass the result straight to the pure feed.kidsComingLine,
 * which keeps input order). A row with a vanished kid (the 0022 kid_id
 * FK cascade normally prevents it) is skipped, defensively.
 *
 * The playdate_kids SELECT policy is open to any authenticated user
 * (the 0022 playdate_kids_select_authenticated): the detail page is a
 * signed-in surface; signed-out the query returns no rows (RLS) and the
 * line simply stays hidden. Pre-0022-apply the missing-table 42P01
 * throws; the caller (the detail page) catches and hides the line (the
 * DB-not-applied discipline, same as the ping section).
 */
export async function listPlaydateKidNamesWithClient(
  client: SupabaseClient,
  playdateId: string,
): Promise<PlaydateKid[]> {
  const { data, error } = await client
    .from('playdate_kids')
    .select('id, kid:kids!playdate_kids_kid_id_fkey ( first_name, age )')
    .eq('playdate_id', playdateId)
  if (error) throw error
  const rows = (data ?? []) as unknown as Array<{
    id: string
    kid: { first_name: string; age: number | null } | null
  }>
  return rows
    .filter((row): row is { id: string; kid: { first_name: string; age: number | null } } =>
      row.kid !== null,
    )
    .map((row) => ({
      id: row.id,
      name: row.kid.first_name,
      age: row.kid.age,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The default-client wrapper (the detail page's "Kids coming" line). */
export async function listPlaydateKidNames(playdateId: string): Promise<PlaydateKid[]> {
  return listPlaydateKidNamesWithClient(supabase, playdateId)
}

/**
 * A post's current "kids you're bringing" KID ids (V8 ticket 05, the edit
 * form's prefill), against an injected client. `listPlaydateKidNames` above
 * returns the playdate_kids ROW ids (it feeds the display line); the edit
 * form needs the kid ids, because that is what linkKidsToPlaydate writes and
 * what the picker's selectedKidIds holds. Same SELECT posture (any
 * authenticated user) and the same failure discipline: pre-0022-apply the
 * 42P01 throws and the caller catches it into [] (the edit page's
 * unchanged-selection rule then skips the kids write entirely, so a failed
 * read can never empty a post's selection).
 */
export async function listPlaydateKidIdsWithClient(
  client: SupabaseClient,
  playdateId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from('playdate_kids')
    .select('kid_id')
    .eq('playdate_id', playdateId)
  if (error) throw error
  return ((data ?? []) as unknown as Array<{ kid_id: string | null }>)
    .map((row) => row.kid_id)
    .filter((kidId): kidId is string => typeof kidId === 'string' && kidId.length > 0)
}

/** The default-client wrapper (the edit form's kids prefill). */
export async function listPlaydateKidIds(playdateId: string): Promise<string[]> {
  return listPlaydateKidIdsWithClient(supabase, playdateId)
}

/**
 * Replace a post's "kids you're bringing" selection (V3 slice 6, ticket
 * 09, migration 0022), against an injected client: delete the post's
 * playdate_kids rows first, then insert the new selection (replace-on-
 * duplicate — the duplicate flow re-posts with a fresh playdate row, so
 * each post carries its own selection; an empty kidIds is a delete-only,
 * i.e. the host picked no kids). 0022's RLS host-guards both writes:
 * INSERT and DELETE pass only for the post's host (the
 * playdate_kids_insert_host / _delete_host policies, the 0005
 * host-scoped pattern on playdates.host_profile_id = auth.uid()); a
 * non-host write is a silent RLS no-op (the 0014 lesson) — the /new
 * picker is offered to the host only, the RLS is the wall. Plain
 * delete/insert chains, no .select() (the 42501 discipline): the caller
 * (the /new submit) only needs success/failure.
 */
export async function linkKidsToPlaydateWithClient(
  client: SupabaseClient,
  playdateId: string,
  kidIds: string[],
): Promise<void> {
  const { error: deleteError } = await client
    .from('playdate_kids')
    .delete()
    .eq('playdate_id', playdateId)
  if (deleteError) throw deleteError
  if (kidIds.length === 0) return
  const { error: insertError } = await client
    .from('playdate_kids')
    .insert(kidIds.map((kidId) => ({ playdate_id: playdateId, kid_id: kidId })))
  if (insertError) throw insertError
}

/** The default-client wrapper (the /new kids picker's submit). */
export async function linkKidsToPlaydate(playdateId: string, kidIds: string[]): Promise<void> {
  return linkKidsToPlaydateWithClient(supabase, playdateId, kidIds)
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
 *
 * V3 slice 7 (ticket 10, migration 0023): the row set also carries
 * parent_id (the one-level reply parent — null = top-level; pre-apply
 * the column is absent and a missing value behaves as null, the
 * types.ts note), which the detail page threads with the pure
 * groupCommentsForRender (trust.ts).
 */
export async function listComments(playdateId: string): Promise<CommentWithAuthor[]> {
  const { data, error } = await supabase
    .from('comments')
    .select(
      'id, playdate_id, author_profile_id, body, created_at, hidden_at, parent_id, author:profiles!comments_author_profile_id_fkey ( id, display_name, avatar_url )',
    )
    .eq('playdate_id', playdateId)
    .order('created_at', { ascending: true })
  if (error) throw error
  // Cast via unknown: without generated DB types, the embed is inferred
  // loosely (same pattern as listMemberships).
  return (data ?? []) as unknown as CommentWithAuthor[]
}

/**
 * Post a comment (or a one-level reply, V3 ticket 10 / migration 0023)
 * as the signed-in user (author_profile_id = auth user id — the 0013
 * INSERT policy, comments_insert_own, is the wall for non-authors; it
 * already admits ANY authenticated user to author a reply — the
 * replies-open-to-all pin, human decision 2026-09-09). The body is
 * validated first with the pure validateCommentBody (same defense in
 * depth as createReport): an empty/over-cap body throws before any
 * insert (the 0013 CHECK is the DB backstop). Plain insert, no .select()
 * — the caller re-fetches the thread for the new row (issueReportInsert
 * discipline).
 *
 * `parentId` (optional): the top-level comment this reply answers (the
 * one-level pin — the client never offers a Reply affordance on a reply
 * itself). When provided, the insert carries parent_id; when omitted,
 * the key is OMITTED ENTIRELY — pre-0023-apply the column doesn't exist
 * (sending parent_id: null would 42703), and post-apply an omitted key
 * lands as the column's null default (a top-level comment).
 */
export async function addComment(
  playdateId: string,
  body: string,
  parentId?: string,
): Promise<void> {
  const bodyError = validateCommentBody(body)
  if (bodyError !== null) throw new Error(bodyError)

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('No authenticated user — cannot comment on a drop-in.')

  const payload: {
    playdate_id: string
    author_profile_id: string
    body: string
    parent_id?: string
  } = { playdate_id: playdateId, author_profile_id: user.id, body: body.trim() }
  if (parentId !== undefined) {
    payload.parent_id = parentId
  }
  const { error } = await supabase.from('comments').insert(payload)
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

// ---------------------------------------------------------------------------
// V8 ticket 06 (migration 0028): standing playdates — the weekly series.
//
// A series is the RULE ("Green Lake, Saturdays 10am"); its occurrences are
// REAL playdates rows carrying `series_id`, so every read path, RLS policy,
// RPC and e2e spec in the app keeps working untouched (the ticket's central
// pin). These are the only three Supabase-facing calls the feature needs:
// create the series, top up its occurrences, stop it.
//
// DB-not-applied discipline (the house rule): pre-0028-apply the
// `playdate_series` table and the RPC do not exist, so `createPlaydateSeries`
// throws (PGRST205 / 404 — the /new submit's designed error line, the
// documented e2e red point) and `ensureSeriesOccurrences` / `getPlaydateSeries`
// fail for their callers to swallow. The detail page and /new both degrade to
// today's behavior rather than crashing.
//
// Generation is triggered from the CLIENT at exactly two moments (the pinned
// strategy): series creation, and the HOST opening their own detail page.
// Never on a viewer's read — a viewer's page load must not write.
// ---------------------------------------------------------------------------

/**
 * The series insert, against an injected client (the setSeriesActive /
 * setPlaydateStatus pattern — mockable, so the payload's wall-clock shape is
 * unit-tested without a DB).
 *
 * The insert carries the host's own id (the RLS `playdate_series_insert_host`
 * policy is the wall) and the wall-clock rule + IANA zone, never a UTC
 * instant. `.select().single()` is safe here: the SELECT policy is open to
 * authenticated, so the RETURNING read-back cannot 403 (the 0014/42501
 * lesson only bites when the actor is excluded from the row).
 */
export async function createPlaydateSeriesWithClient(
  client: SupabaseClient,
  hostProfileId: string,
  input: NewPlaydateSeriesInput,
): Promise<PlaydateSeries> {
  const { data, error } = await client
    .from('playdate_series')
    .insert(seriesInsertRow(hostProfileId, input))
    .select()
    .single()
  if (error) throw error
  return data as PlaydateSeries
}

/**
 * Create a weekly series (the /new "Repeat weekly" path). Returns the created
 * row: the caller links the post it is about to create to `id`, then tops up
 * the occurrences.
 */
export async function createPlaydateSeries(
  input: NewPlaydateSeriesInput,
): Promise<PlaydateSeries> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('No authenticated user — cannot start a weekly series.')
  return createPlaydateSeriesWithClient(supabase, user.id, input)
}

/**
 * Top the series' occurrences up to the horizon (migration 0028's
 * `ensure_series_occurrences`: SECDEF, search_path pinned, EXECUTE to
 * authenticated only). Returns the number of rows CREATED by this call — 0 on
 * a re-run, on a stopped series (`active = false`) and for a series that no
 * longer exists, which is exactly the idempotency signal the ticket asks for.
 *
 * Callers: /new right after a series is created, and the host's own detail
 * page. Both treat a failure as non-fatal (the (a)+(b) fallback heals it).
 */
export async function ensureSeriesOccurrences(
  seriesId: string,
  horizonDays?: number,
): Promise<number> {
  const args: Record<string, unknown> = { p_series_id: seriesId }
  if (horizonDays !== undefined) args.p_horizon_days = horizonDays
  const { data, error } = await supabase.rpc('ensure_series_occurrences', args)
  if (error) throw error
  // The function returns an integer; a composite/null answer would be a
  // contract break, so report "nothing created" rather than NaN.
  return typeof data === 'number' ? data : 0
}

/** Read one series row (the detail page's host panel line + its active flag). */
export async function getPlaydateSeries(seriesId: string): Promise<PlaydateSeries | null> {
  const { data, error } = await supabase
    .from('playdate_series')
    .select('*')
    .eq('id', seriesId)
    .maybeSingle()
  if (error) throw error
  return (data as PlaydateSeries | null) ?? null
}

/**
 * "Stop repeating": flip `active` (against an injected client — mockable).
 * A plain update with NO `.select()`/RETURNING (the house write shape), and
 * NO delete: the occurrences already generated are other families' plans —
 * they stay as ordinary posts (the pinned "never silently delete" rule).
 * Host-only: `playdate_series_update_host` is the wall, so a non-host call is
 * a silent 0-row 2xx (the 0014 lesson) and the control lives in the host panel.
 */
export async function setSeriesActiveWithClient(
  client: SupabaseClient,
  seriesId: string,
  active: boolean,
): Promise<void> {
  const { error } = await client.from('playdate_series').update({ active }).eq('id', seriesId)
  if (error) throw error
}

/** The default-client wrapper (the host panel's Stop repeating). */
export async function setSeriesActive(seriesId: string, active: boolean): Promise<void> {
  return setSeriesActiveWithClient(supabase, seriesId, active)
}
