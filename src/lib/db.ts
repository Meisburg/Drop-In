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
// V9 ticket 11: where a family's images live and who may fetch each kind. The
// paths are the pure seams (photoStorage.ts) so this file never spells one out.
import {
  FAMILY_PHOTO_URL_TTL_SECONDS,
  PHOTO_BUCKET,
  familyPhotoMintPaths,
  familyPhotoObjectPath,
  familyPhotoPath,
} from './photoStorage'
import {
  ageRangeFields,
  filterFeed,
  lastOwnPlaydateFrom,
  localDayKey,
  neighborhoodIdField,
  postDistanceMiles,
  queryLastOwnPlaydateWithClient,
  queryRecentOwnPlacesWithClient,
  queryUpcomingFeedWithClient,
  recentPlacesFrom,
  startOfTodayIso,
  validateHomeZip,
  validateRadiusMiles,
  type GoingPinger,
  type LastOwnPlaydate,
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
// V8 ticket 08: the notification kind guard + the fallback list's page size.
// The push RULES themselves (payload copy, dedupe key, iOS detection, the
// permission memory) live in ./push and are not duplicated here — db.ts only
// moves rows.
import { RECENT_NOTIFICATIONS_LIMIT, isNotificationKind, type NotificationKind } from './push'
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
 * Raw feed query (V2 slice 3): all posts that have NOT ENDED at the cutoff
 * (`ends_at > cutoffIso` — V9 ticket 04; the cutoff is the caller's NOW, not a
 * midnight), ordered by starts_at (the neighborhood filter is gone — discovery
 * is radius-based). The DB-level filters (the .not() block filter — only when
 * the viewer actually has blocks, and the .is('hidden_at', null) hidden filter
 * — slice 5) live in the injected-client query (feed.queryUpcomingFeedWithClient,
 * unit-tested with a mock).
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
 * haversine radius (via the seeded zip map), NOT YET ENDED (V9 ticket 04:
 * `ends_at > now`, read once and handed to BOTH layers), excluding posts by
 * blocked hosts and hidden posts, ordered by starts_at — each survivor tagged
 * with its `distanceMiles` for the card's "N mi" label. Used by the `/` feed
 * (and no longer by /browse, which V8 ticket 07 turned into the places
 * directory).
 *
 * V9 ticket 04 (the cutoff): this function used to cut at `startOfTodayIso()`
 * and hand the filter a SECOND, later clock (`new Date().toISOString()`), so
 * the DB could return a post the filter then dropped — and an ended drop-in
 * stayed on the feed all day, greyed and demoted. Now there is ONE `nowIso`,
 * read once, used for the query's `ends_at` cutoff AND the pure re-filter, so
 * the two layers cannot disagree even mid-request (the house
 * defense-in-depth pattern: the DB does less work, the filter is the
 * unit-tested guarantee).
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
  // V9 ticket 04: ONE instant for both layers — the query's `ends_at` cutoff
  // and filterFeed's nowIso are the same clock read, so a post can never be
  // fetched and then dropped for being a millisecond older than a second read.
  const nowIso = new Date().toISOString()
  const rows = await queryUpcomingPlaydates(nowIso, blockedIds)
  // Stitch each post's place coordinates in (place_id -> {lat,lng}), so the
  // pure distance model sees them. A post with no place_id, or one whose place
  // is missing from the map, gets null and falls back to the host's home zip.
  const posts = rows.map((post) => ({ ...post, place_coords: placeCoordsFor(post.place_id, places) }))
  const filtered = filterFeed(posts, viewer, zipCoords, new Set(blockedIds), nowIso)
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
 *
 * V9 ticket 01: the neighborhood embed lost its `!inner` hint (see feed.ts's
 * note) — a place page's list must show a drop-in whose host never answered a
 * neighbourhood question, and an INNER JOIN would silently drop it.
 *
 * V9 ticket 04 (a KNOWN inconsistency, recorded, deliberately not fixed here):
 * "upcoming" is this read's `.gte('starts_at', startOfTodayIso())` — the
 * start-of-today rule the FEED stopped using, so this list can still show a
 * drop-in that ended earlier today. Same follow-up as
 * db.upcomingCountsByPlace above (see the V9 ticket 04 Comments).
 */
export async function listPlaceFeed(
  placeId: string,
  viewerProfileId: string,
): Promise<PlaydateWithNeighborhood[]> {
  const blockedIds = await listBlockedHostIds(viewerProfileId)
  const { data, error } = await supabase
    .from('playdates')
    .select(
      // V9 ticket 01: NO `!inner` — a NULL neighbourhood must not remove the
      // post from its own place page.
      '*, neighborhood:neighborhoods ( id, name ), host:profiles!playdates_host_profile_id_fkey ( id, display_name, avatar_url, home_zip, radius_miles )',
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
 *
 * V9 ticket 04 (a KNOWN inconsistency, recorded, deliberately not fixed here):
 * "upcoming" is this read's `.gte('starts_at', startOfTodayIso())` — the
 * start-of-today rule the FEED stopped using. So Browse can print "1 upcoming"
 * for a place whose only drop-in has already ENDED, which the feed (and the
 * place page's own list, same cutoff) now contradicts. It is a wrong LABEL, at
 * any table size, fixable with no migration (`.gt('ends_at', now)`, exactly the
 * feed's predicate) — but this ticket is scoped to the feed's read path and
 * these chips have their own ACs and specs (V8/07), so the change belongs to a
 * follow-up: see the V9 ticket 04 Comments.
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
 * the /settings location card). Runs the pure validators first (the same
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
  /**
   * The chosen neighbourhood, or '' / null for NONE (V9 ticket 01: /new no
   * longer asks, and every seeded place carries none). An empty value is
   * OMITTED from the payload by feed.neighborhoodIdField — never sent as ''
   * (22P02: an empty string is not a uuid) — so pre-0035-apply the insert
   * fails honestly on the NOT NULL column (23502) and post-0035 it stores NULL.
   */
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
   * V9 ticket 05 (migration 0037): the age range the host STATED with the
   * "Ages (optional)" chips on /new. UNDEFINED when no chip was picked — the
   * age_min / age_max keys are then ABSENT from the insert payload rather than
   * null (the neighborhoodIdField / seriesIdField / placeIdField pattern via
   * feed.ageRangeFields), so a chipless post posts exactly as it did before
   * 0037 and pre-apply nothing 42703s on that path.
   */
  ageMin?: number
  ageMax?: number
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
      // V9 ticket 01 (migration 0035): the neighbourhood is no longer a
      // question on /new, so this key is now ABSENT for the ordinary post
      // (neighborhoodIdField, the seriesIdField/placeIdField pattern). An
      // empty string is never sent: '' is not a uuid, so it would 22P02 both
      // before and after 0035. Pre-0035-apply the omitted key is the
      // documented 23502 red-by-design for e2e/post-location; post-0035 it is
      // simply a NULL neighbourhood, which the LEFT JOIN embeds render.
      ...neighborhoodIdField(input.neighborhoodId),
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      // V3 slice 6 (ticket 09): the age hint is no longer written from /new
      // (the kids picker replaces the field; the DB column stays — the
      // duplicate prefill carries it dormant, pinned V2). V9 ticket 05 leaves
      // `age_hint` alone entirely (the ticket pins that the new chips do NOT
      // repurpose it) and writes the STRUCTURED pair instead — only when the
      // host actually picked a chip (ageRangeFields; 0037's columns).
      ...ageRangeFields(input.ageMin, input.ageMax),
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
    // V9 ticket 01 (migration 0035): `neighborhood_id` is nullable now — the
    // cast must say so (review cycle 1, F5), or the next reader would be told
    // every remembered post has a neighbourhood. recentPlacesFrom maps a NULL
    // to '' (the chip's "none"), which is what the chip path writes.
    rows as Array<{ place: string; address: string | null; neighborhood_id: string | null }>,
    limit,
  )
}

/**
 * The ONE row the "Post again" chip clones from (V10 ticket 01) — the
 * caller's most recent post with the kids it announced, newest by START (the
 * plan the parent most recently put on the calendar — see
 * queryLastOwnPlaydateWithClient for why that is not created_at).
 *
 * No session → null, and a failed read THROWS: the caller (the /new page)
 * swallows both into "no chip" (the recent-places convenience discipline —
 * a form that cannot load the clone must still render). The pure mapper
 * (feed.lastOwnPlaydateFrom) is the seam the unit tests pin.
 */
export async function listLastOwnPlaydate(): Promise<LastOwnPlaydate | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) return null
  const row = await queryLastOwnPlaydateWithClient(supabase, user.id)
  return lastOwnPlaydateFrom(row)
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
  /**
   * The chosen neighbourhood, or '' for NONE — which the payload writes as
   * NULL, not as '' (V9 ticket 01: the /edit select's empty option is now a
   * legal answer, since a post may carry no neighbourhood at all, and '' is
   * not a uuid: PostgREST would 22P02 before AND after 0035).
   */
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
      // V9 ticket 01 (migration 0035): '' → NULL. The update always carries the
      // key (unlike the insert, which omits it): an edit is the one place a
      // parent can CLEAR a neighbourhood, and "leave it alone" is what the
      // change detector above already skips.
      neighborhood_id: input.neighborhoodId.trim() === '' ? null : input.neighborhoodId,
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
      // V9 ticket 01: NO `!inner` on the neighborhood embed — an INNER JOIN
      // makes a NULL-neighbourhood post return NO ROW, which this function
      // reports as "not found": the detail page of a post that plainly exists
      // (its own host's, right after posting) would 404.
      '*, neighborhood:neighborhoods ( id, name ), host:profiles!playdates_host_profile_id_fkey ( id, display_name, avatar_url, home_zip )',
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
  const rows = (data ?? []) as Array<{
    kid_id: string
    first_name: string | null
    age: number | null
  }>
  return rows.map((row) => ({
    id: row.kid_id,
    // V9 ticket 05: the name is optional, so the wire can carry NULL here
    // (0026's `first_name text` output column, off a now-nullable kids column).
    // Normalised to '' so a `string` never holds a null — the caller renders
    // with feed.kidLabel, which reads a blank name as "age only".
    firstName: row.first_name ?? '',
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
 * The HOST's announced kids' AGES for a batch of posts — ONE read for every
 * card on screen, the same "one call per feed, never one per card" shape
 * countKidsGoingForPosts (0027) established, and the reason the card component
 * itself owns no fetching.
 *
 * WHAT CROSSES, exactly (the T1 privacy line, now enforced in the DATABASE and
 * not only in this projection): `playdate_id`, `age_min`, `age_max`. NOT a
 * name, NOT a kid id, NOT an avatar_url, NOT the playdate_kids row id, and not
 * even a count. `kid_ages_for` (migration 0040) projects two integers and
 * nothing else, so a nameless kid and a named one are indistinguishable here —
 * which is the whole point of the range.
 *
 * WHICH QUESTION: `playdate_kids` is the HOST's own selection ("who I'm
 * bringing" — the /new picker's table, live since 0022). The 0026/0027 pair
 * asks the OTHER question (the PINGERS' kids, through the gated
 * get_kids_going) and is deliberately untouched: this read neither widens that
 * gate nor reuses its counter. One function, one question.
 *
 * WHY IT IS A SECURITY DEFINER RPC AS OF V9 TICKET 10 (and not the batched
 * table read ticket 05 shipped): ticket 05 could derive the range from
 * `playdate_kids ⋈ kids.age` because the policy was `using (true)` for
 * authenticated. Ticket 10 narrows that policy, and this read is
 * BEST-EFFORT BY CONTRACT (the caller settles to `{}` on failure), so the same
 * read after the narrowing would have returned nothing for a stranger with no
 * error at all — every card's ages line silently missing. The derivation is
 * therefore its own SECDEF function, ages-only: the ROWS stay closed while the
 * RANGE stays broadly visible (the confirmed scope).
 *
 * Best-effort by contract, like every other card decoration: the RPC throws on
 * any failure (an absent function included — see the note below) and the caller
 * settles to {} — every card simply omits its ages line, never an error state,
 * never a crash.
 *
 * THE NOT-YET-APPLIED PATH IS GONE ON PURPOSE (review cycle 1, F3): this
 * function used to fall back to the legacy batched table read whenever the RPC
 * answered PGRST202. That fallback was deleted once 0040 was applied, for the
 * same reason every other read path in this file THROWS instead of guessing:
 * 0040 is now the live schema, and a PGRST202 here would mean the function was
 * dropped, renamed or never created — exactly the condition under which a
 * silent second source of truth is most dangerous, because the fallback read
 * ran under the narrowed policy and would have returned a stranger nothing
 * (a blank ages line) while telling no one. If the RPC is missing now, the
 * decoration goes missing too, and the failure is loud in the spec that asserts
 * the function is present.
 */
export async function kidAgesByPostForPostsWithClient(
  client: SupabaseClient,
  postIds: string[],
): Promise<Record<string, number[]>> {
  if (postIds.length === 0) return {}
  // V9 ticket 10 (T1, THE COUPLING): the derivation crosses through the
  // ages-only SECURITY DEFINER function `kid_ages_for` (migration 0040) — ONE
  // call for the whole batch, exactly the 0027 shape. It has to: the read it
  // replaced (`playdate_kids ⋈ kids.age`) runs under the very SELECT policy 0040
  // narrows, and this read is BEST-EFFORT BY CONTRACT (every caller settles to
  // `{}` on failure), so narrowing the policy without moving the derivation
  // would have blanked every card's ages line in silence — no error, no
  // warning, just no line.
  //
  // WHAT COMES BACK, exactly: one row per post that has kids —
  // `(playdate_id, age_min, age_max)`. No name, no kid id, no avatar_url, no
  // count. The array this function hands the pure seam carries the BOUNDS,
  // because `feed.ageBounds` — the only consumer — reads nothing but min and
  // max; `ages 3–6` is therefore byte-identical to what the row-by-row read
  // produced, while nothing but a range ever crosses the wire.
  //
  // The null-bound guard below is the surviving half of the old read's
  // skip-a-row-if-the-age-is-unknown rule (its `kid === null` half cannot occur
  // here: the function INNER JOINs `kids`, so a vanished kid produces no row at
  // all). It is unit-tested.
  const { data, error } = await client.rpc('kid_ages_for', { p_ids: postIds })
  if (error) throw error
  const agesByPostId: Record<string, number[]> = {}
  for (const row of (data ?? []) as unknown as Array<{
    playdate_id: string
    age_min: number | null
    age_max: number | null
  }>) {
    if (typeof row.age_min !== 'number' || typeof row.age_max !== 'number') continue
    agesByPostId[row.playdate_id] =
      row.age_min === row.age_max ? [row.age_min] : [row.age_min, row.age_max]
  }
  return agesByPostId
}

/** The default-client wrapper (the feed's one batched ages read). */
export async function kidAgesByPostForPosts(
  postIds: string[],
): Promise<Record<string, number[]>> {
  return kidAgesByPostForPostsWithClient(supabase, postIds)
}

/**
 * ONE post's derived kid ages (V9 ticket 10): the detail page's ages line has
 * to stay intact for a viewer who may NOT see the names (a stranger reads
 * "Ages 3–6" alone), so the range comes from the ages-only RPC through the same
 * batched seam with a single id — never from a second, name-shaped read.
 * Empty array = "nothing to say" (no kids picked, or the read failed): the
 * caller renders no derived range rather than guessing, exactly as the card
 * does.
 */
export async function kidAgesForPlaydate(playdateId: string): Promise<number[]> {
  const byPostId = await kidAgesByPostForPosts([playdateId])
  return byPostId[playdateId] ?? []
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
 * — the (now plain, V9 ticket 01: no `!inner`) neighborhoods embed for the
 * card's neighborhood label and `profiles!playdates_host_profile_id_fkey` for
 * the host embed (the PGRST201 lesson: two playdates→profiles embed paths
 * exist, so an unpinned embed is an error, not an ambiguity to resolve).
 * Duplicated as a literal rather than shared, because the feed query is not
 * this ticket's to edit — the two strings must stay identical.
 *
 * V9 ticket 01: the profile's Upcoming/Past sections are exactly where an
 * INNER JOIN would have been invisible-as-a-bug — the host's newer posts
 * (no neighbourhood) would simply be missing from their own profile, with no
 * error anywhere.
 */
const HOST_POSTS_SELECT =
  '*, neighborhood:neighborhoods ( id, name ), host:profiles!playdates_host_profile_id_fkey ( id, display_name, avatar_url, home_zip, radius_miles )'

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
 * Pure photo input validation (the avatar machinery, V2 ticket 02; the kid
 * photo reused it in V3 slice 6, ticket 09 until V9 ticket 11 ended that path;
 * the FAMILY photo reuses it through `validateFamilyPhotoFile`): an error
 * message, or null when valid. Rejects non-images and files over
 * AVATAR_MAX_BYTES.
 *
 * WHERE THE GATE LIVES, since photo-crop ticket 03 moved it: it is called from
 * `useCropStep.beginCrop`, NOT from `uploadAvatar`/`uploadFamilyPhoto`. Those take an
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

/**
 * Pure family-photo input validation (V9 ticket 11): the AVATAR rules, verbatim
 * — an error message, or null when valid.
 *
 * It is a one-line delegation ON PURPOSE rather than a second copy of the two
 * checks: ticket 08's AC is "the existing avatar pipeline's rules: square crop,
 * ≤5MB, the crop step", so the family photo must be validated by the SAME gate,
 * and two copies of a 5MB constant is how they drift. The unit test asserts the
 * delegation directly (same message for the same file, including the boundary
 * case at exactly AVATAR_MAX_BYTES).
 *
 * WHERE THE GATE LIVES IS UNCHANGED: `useCropStep.beginCrop` calls this — not
 * the upload function — for exactly the reason documented on `validateAvatarFile`
 * (by the time an upload runs, the File has been decoded and there is nothing
 * left to measure).
 */
export function validateFamilyPhotoFile(file: File): string | null {
  return validateAvatarFile(file)
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
 * Pure kid first-name validation (V8 ticket 10: the in-place kid row editor
 * writes the name on its OWN, so the name rule is its own pure unit; the
 * combined validateKid composes this and the age rule — same messages, one
 * source for the /settings inline error and the db-layer defense in depth).
 *
 * V9 ticket 05: THE NAME IS OPTIONAL, so this rule no longer rejects a blank
 * one — "names are optional and when people start to put names like some
 * people get weird about that". It is kept (rather than deleted with its
 * message) because it is the seam every caller already goes through and the
 * place a future cap would live; a blank name is now simply valid, and the
 * write path stores NULL for it (addKid / updateKidWithClient below), which is
 * why 0037 also drops the 0011 `first_name not null`.
 */
export function validateKidName(firstName: string): string | null {
  // No rule fires on a blank name any more. The parameter stays in the
  // signature: the call sites are unchanged, and the rule's home is here.
  void firstName
  return null
}

/** Pure kid age validation (V8 ticket 10): a whole number from 0 to 17. */
export function validateKidAge(age: number): string | null {
  if (!Number.isInteger(age) || age < 0 || age > 17) {
    return 'Age must be a whole number from 0 to 17.'
  }
  return null
}

/**
 * Pure kid-row validation (first name + age only — the privacy pin). Age is
 * a whole number in 0–17: these are kids.
 */
export function validateKid(firstName: string, age: number): string | null {
  return validateKidName(firstName) ?? validateKidAge(age)
}

/**
 * The profile items missing for the /settings nudge banner (V2 ticket 02):
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
 * generalized it for kid photos — WITHDRAWN by V9 ticket 11; photo-crop ticket
 * 03 reframed it): encode the CHOSEN crop of an already-decoded source as a
 * square JPEG (prepareAvatarFile — the network only ever sees the small
 * result), upload to the PUBLIC 'avatars' bucket at `objectPath`, and return the
 * public URL.
 *
 * IT SERVES PARENT AVATARS ONLY NOW. V9 ticket 11 ends kid photos (`<uid>/kids/
 * <kidId>`, the class that made this bucket's public read an exposure) and adds
 * `uploadPrivatePhotoObject` for the private bucket; the family photo goes
 * through THAT one, not this one, and `uploadKidPhoto` no longer exists. What
 * stays here is the public posture the ticket deliberately preserved (T5): every
 * card, the detail page and both profile pages render an avatar straight from
 * this URL, and putting those behind signed URLs was the option the human did
 * NOT choose.
 *
 * The ≤5MB / image-only gate does NOT live here any more. It cannot: by this point
 * the caller has already decoded the file, so there is no File left to measure.
 * It lives in `useCropStep.beginCrop` instead — one place, running before the
 * decode and before the crop dialog opens, so a rejected file never gets either.
 *
 * The 0011 owner-scoped write policies (avatars_owner_insert / _update / _delete)
 * key on (storage.foldername(name))[1] = auth.uid()::text — the path's FIRST
 * folder must be the caller's own uid — so they cover EVERY path below `<uid>/`:
 * today that is the parent's own avatar (<uid>/avatar) alone. A cross-user write
 * is rejected by the same first-folder check.
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
 * The PRIVATE-bucket upload core (V9 ticket 11): encode the chosen crop of the
 * decoded `source` as a square JPEG (the same encoder the avatar uses — one
 * pipeline, ticket 08's AC) and upload it to `PHOTO_BUCKET` at `objectPath`.
 * Returns the OBJECT PATH, never a URL.
 *
 * It is a sibling of `uploadAvatarObject` rather than a generalisation of it,
 * and the difference is the whole point of the ticket:
 *   - different bucket (`kid-photos`, `public = false` — 0038) with
 *     owner-scoped, path-scoped policies of its own;
 *   - no `getPublicUrl` (a private object has none) and therefore no
 *     `?v=` cache-buster. That is not an omission: the buster exists because an
 *     avatar's PUBLIC url does not change when the object is replaced, while a
 *     signed URL is minted fresh on every render with its own token and
 *     expiry, so a re-upload can never be shadowed by a cached URL.
 *
 * The write policy is the wall (0011's pattern, re-stated for this bucket in
 * 0038): the path's FIRST folder must be the caller's own uid, so this function
 * cannot write into another family's folder even if it were handed one.
 */
async function uploadPrivatePhotoObject(
  client: SupabaseClient,
  objectPath: string,
  source: CanvasImageSource,
  rect: CropRect,
): Promise<string> {
  const blob = await prepareAvatarFile(source, rect)
  const { error } = await client.storage
    .from(PHOTO_BUCKET)
    .upload(objectPath, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error
  return objectPath
}

/**
 * Upload the signed-in user's family photo (V9 ticket 11, folded ticket 08):
 * encode the chosen crop of the decoded `source`, upload to `PHOTO_BUCKET` at
 * `<uid>/family/photo.jpg` (the pure `familyPhotoPath`), then point
 * `profiles.family_photo_url` at the OBJECT PATH. Returns that path.
 *
 * A PATH, not a URL — deliberately, and it is the one place a reader might
 * expect otherwise given the column's name: a signed URL expires, so persisting
 * one would hand the parent a broken image on a timer (T6). The render sites
 * mint from the path (`signedFamilyPhotoUrls`) and never write back.
 *
 * `source` + `rect` rather than a File: the file was already validated and
 * decoded by the crop step (`validateFamilyPhotoFile` runs there) and
 * re-decoding here would cost a second ~48MB decode of the same 12MP photo.
 *
 * Pre-0038-apply this 42703s on the missing `profiles.family_photo_url` column
 * (and the bucket would 404) — the caller surfaces a designed error line, never
 * a crash (the DB-not-applied discipline).
 */
export async function uploadFamilyPhoto(
  profileId: string,
  source: CanvasImageSource,
  rect: CropRect,
): Promise<string> {
  const objectPath = familyPhotoPath(profileId, 'jpg')
  const storedPath = await uploadPrivatePhotoObject(supabase, objectPath, source, rect)
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ family_photo_url: storedPath })
    .eq('id', profileId)
  if (profileError) throw profileError
  return storedPath
}

/**
 * Mint family-photo signed URLs for a page, ONE batched call for every image it
 * renders (T6), against an injected client (the house *WithClient pattern).
 *
 * BEST-EFFORT BY CONTRACT: it never throws. A signed-URL failure — the bucket
 * not applied yet, a storage outage, a policy refusal, an expired session —
 * means "no image", and the caller renders the page without one. A decoration
 * is never worth an error state (the zero-pressure soul); a parent cannot fix a
 * storage error, so showing them one would only imply the profile is broken.
 *
 * Keyed by the STORED VALUE the caller holds (`profiles.family_photo_url`), so
 * a render site maps its own data straight through without re-deriving paths.
 * Values that cannot be minted (empty, URL-shaped, a non-family path — see
 * `familyPhotoObjectPath`) are skipped silently rather than attempted.
 *
 * NEVER PERSISTED: the result is render-time state only. A signed URL in the
 * database is a URL that stops working at an unannounced moment.
 */
export async function signedFamilyPhotoUrlsWithClient(
  client: SupabaseClient,
  storedValues: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const paths = familyPhotoMintPaths(storedValues)
  if (paths.length === 0) return {}
  const minted: Record<string, string> = {}
  try {
    const { data, error } = await client.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(paths, FAMILY_PHOTO_URL_TTL_SECONDS)
    if (error) return {}
    const urlByPath = new Map<string, string>()
    for (const row of data ?? []) {
      if (typeof row.path === 'string' && typeof row.signedUrl === 'string' && row.signedUrl !== '') {
        urlByPath.set(row.path, row.signedUrl)
      }
    }
    for (const value of storedValues) {
      if (value === null || value === undefined || minted[value] !== undefined) continue
      const path = familyPhotoObjectPath(value)
      if (path === null) continue
      const url = urlByPath.get(path)
      if (url !== undefined) minted[value] = url
    }
  } catch {
    return {}
  }
  return minted
}

/** The default-client wrapper (the family-photo render sites: /settings, /profile, /u/:handle). */
export async function signedFamilyPhotoUrls(
  storedValues: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  return signedFamilyPhotoUrlsWithClient(supabase, storedValues)
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
 * state).
 *
 * V9 ticket 11: `avatar_url` still arrives on these rows and NOTHING RENDERS
 * IT — no kid photo appears anywhere in the app any more, so a caller that
 * starts reading it for display is re-opening a closed decision (and, after
 * migration 0038, the value is a private-bucket object PATH, not a URL, so an
 * `<img src>` fed from it would simply break). The kids SELECT policy is gate
 * 0040's (`kids_select_own_host_pinger_mod`); a read failure throws, and the
 * caller renders a designed state.
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
 *
 * V9 ticket 05: a blank first name is written as NULL, not as '' — "no name"
 * is the absence of a name, and it is what the 0037 `drop not null` exists
 * for. (Pre-0037-apply the NOT NULL column refuses the NULL with 23502: the
 * page's designed error line, and the documented consequence of the relaxed
 * rule until the migration lands.)
 */
export async function addKid(profileId: string, firstName: string, age: number): Promise<Kid> {
  const existing = await listKids(profileId)
  if (existing.length >= MAX_KIDS_PER_PROFILE) {
    throw new Error(`You can add up to ${MAX_KIDS_PER_PROFILE} kids.`)
  }
  const kidError = validateKid(firstName, age)
  if (kidError !== null) throw new Error(kidError)
  const trimmedName = firstName.trim()
  const { data, error } = await supabase
    .from('kids')
    .insert({ profile_id: profileId, first_name: trimmedName === '' ? null : trimmedName, age })
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
 * migration 0022): the kid's optional photo URL + the "likes" conversation
 * starter (<= LIKES_MAX_LENGTH after trim — the UI pin; no DB CHECK, the 0021
 * address lesson).
 *
 * `avatar_url` IS KEPT BUT HAS NO CALLER (V9 ticket 11). The kid-photo upload
 * that used to write it is gone and nothing renders it, so no app path sets it;
 * it stays a writable field because the column stays (the human's
 * "delete nothing" intent) and because the reversal this decision allows needs
 * a place to write — the column is documented on `photoStorage.kidPhotoStoredRef`
 * (after migration 0038 the value is an OBJECT PATH like
 * `kid-photos/<uid>/kids/<kidId>`, never a URL).
 *
 * V8 ticket 10 adds the in-place row edit: first_name + age (the row used to
 * be Remove + re-add to change a name, which threw away the photo, the likes
 * and the row's identity in every "who's coming" selection). Same 0011
 * owner-only UPDATE policy, same columns the INSERT always wrote — no schema
 * change, no migration.
 */
export interface KidPatch {
  avatar_url?: string | null
  likes?: string | null
  /**
   * The kid's first name (the privacy pin: first name ONLY) — OPTIONAL as of
   * V9 ticket 05 (validateKidName no longer rejects a blank one), in which case
   * the write stores NULL rather than ''.
   */
  first_name?: string
  /** The kid's age (0–17 whole number). Validated by validateKidAge. */
  age?: number
}

/**
 * Update one kid row (V3 slice 6, ticket 09, migration 0022), against an
 * injected client (the house *WithClient pattern — mockable): the owner's
 * kid editor's row save (name, age, likes — `avatar_url` has no caller any
 * more, see KidPatch). The 0011 kids_update_own policy (owner-only) is the DB
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
  const payload: Record<string, string | number | null> = {}
  if (patch.avatar_url !== undefined) payload.avatar_url = patch.avatar_url
  if (patch.likes !== undefined) {
    if (patch.likes !== null) {
      const likesError = validateKidLikes(patch.likes)
      if (likesError !== null) throw new Error(likesError)
    }
    payload.likes = patch.likes === null ? null : patch.likes.trim()
  }
  // V8 ticket 10: the in-place row edit (name + age). Each field validates on
  // its own — the row editor can change one or both — and the trimmed name
  // lands on the wire (the addKid discipline; validateKidName is the same
  // rule). V9 ticket 05: a blank name is written as NULL rather than '' (the
  // addKid pin) — clearing a name is a real edit, and it must clear the column.
  if (patch.first_name !== undefined) {
    const nameError = validateKidName(patch.first_name)
    if (nameError !== null) throw new Error(nameError)
    const trimmedName = patch.first_name.trim()
    payload.first_name = trimmedName === '' ? null : trimmedName
  }
  if (patch.age !== undefined) {
    const ageError = validateKidAge(patch.age)
    if (ageError !== null) throw new Error(ageError)
    payload.age = patch.age
  }
  if (Object.keys(payload).length === 0) return
  const { error } = await client.from('kids').update(payload).eq('id', kidId)
  if (error) throw error
}

/** The default-client wrapper (the profile kid editor's row save). */
export async function updateKid(kidId: string, patch: KidPatch): Promise<void> {
  return updateKidWithClient(supabase, kidId, patch)
}

// ---------------------------------------------------------------------------
// V3 slice 6 (ticket 09): the per-post "kids you're bringing" selection
// (migration 0022's playdate_kids) — the /new picker's write + the detail
// page's "Kids coming" line read.

/**
 * A post's "Kids coming" rows (V3 slice 6, ticket 09, migration 0022;
 * GATED BY V9 ticket 10 / migration 0040), against an injected client (the
 * trust.togglePingWithClient pattern — mockable in unit tests): the host's
 * picked kids, each mapped to name + age ONLY (the PlaydateKid privacy pin;
 * the kid's avatar_url is deliberately NOT read at all — the kid-photo pin:
 * photos render only in the profile kids list, never on the event line).
 *
 * WHO SEES IT, as of 0040: the RPC's own gate — the post's host, a family who
 * pinged it, or a moderator (0026's get_kids_going gate, the same rule). A
 * signed-in stranger gets an empty array, which is why the detail page renders
 * their ages line without names; signed out there is no session to call with.
 * The result is name-ordered (the line's order — its caller passes the rows
 * straight to the pure feed.kidsComingLine, which keeps input order).
 *
 * THE NOT-YET-APPLIED PATH IS GONE ON PURPOSE (review cycle 1, F3): pre-0040
 * this fell back to the legacy table select whenever the RPC answered
 * PGRST202. That fallback was deleted once 0040 was applied — for the same
 * reason every other read path in this file throws instead of guessing, and
 * because its trigger was CODE-INDEPENDENT (any error whose message mentioned
 * a missing function took the open path). A missing RPC today throws, the
 * detail page catches it (its designed DB-not-applied discipline) and the line
 * stays hidden: fail-closed, and loudly visible in the spec that asserts the
 * function is present.
 */
export async function listPlaydateKidNamesWithClient(
  client: SupabaseClient,
  playdateId: string,
): Promise<PlaydateKid[]> {
  // V9 ticket 10 (migration 0040): THE ONE GATED READ of the host's announced
  // kids. The gate lives in the database — `get_playdate_kids` is SECURITY
  // DEFINER with 0026's gate (host / going / moderator) — because a table read
  // here cannot express it: `playdate_kids` and `kids` are both narrowed by
  // 0040, so the gate must be the same rule in one place (the AC's own
  // wording), and a signed-in stranger must receive ZERO ROWS from this call
  // rather than a client-side decision. Names + ages only: no avatar_url
  // crosses (the kid-photo pin), and the caller's own membership is never
  // inferred from what comes back.
  const { data, error } = await client.rpc('get_playdate_kids', { p_id: playdateId })
  if (error) throw error
  return ((data ?? []) as unknown as Array<{
    kid_id: string | null
    first_name: string | null
    age: number | null
  }>)
    .filter((row) => typeof row.kid_id === 'string' && row.kid_id !== '')
    .map((row) => ({
      id: row.kid_id as string,
      // V9 ticket 05 (T3): a first name is OPTIONAL, so the wire carries NULL
      // for a nameless kid. Normalised to '' here — a null leaking into this
      // `string` is how " · 4" and `null` reach the render — and
      // feed.kidsComingLine renders such a kid through the AGE RANGE instead
      // of dropping them.
      name: row.first_name ?? '',
      age: row.age,
    }))
    // Name order (the line's order). A nameless kid sorts first — the
    // database's own `order by ... first_name asc nulls last` puts NULLs LAST,
    // so this client-side sort is the one place the two disagree; it is also
    // the order the line wants (ages first, then the names, which never
    // include a blank). Kept as-is so the existing specs' expectation is
    // unchanged.
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The default-client wrapper (the detail page's "Kids coming" line). */
export async function listPlaydateKidNames(playdateId: string): Promise<PlaydateKid[]> {
  return listPlaydateKidNamesWithClient(supabase, playdateId)
}

/**
 * A post's current "kids you're bringing" KID ids (V8 ticket 05, the edit
 * form's prefill), against an injected client. `listPlaydateKidNames` above
 * returns the KID ids (it feeds the display line); the edit form needs the
 * same ids, because that is what linkKidsToPlaydate writes and what the
 * picker's selectedKidIds holds — so this is the raw `playdate_kids` read the
 * host's prefill needs (the SELECT policy's host clause is what makes it
 * answer), while the DISPLAY read goes through the gated RPC.
 *
 * Same failure discipline as always: a failed read THROWS and the caller
 * catches it into [] (the edit page's unchanged-selection rule then skips the
 * kids write entirely, so a failed read can never empty a post's selection).
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
 * host-scoped pattern on playdates.host_profile_id = auth.uid()) — and, as of
 * 0040's amendment, the INSERT additionally requires that the kid being
 * attached is the caller's OWN (`kid_owned_by_caller`): the attachment row is
 * the input the kid-name gate reads, so a row naming someone else's child
 * would BE the bypass. Every picker offers only the caller's own kids, so the
 * clause costs a legitimate write nothing. A non-host write is a silent RLS
 * no-op (the 0014 lesson) — the /new picker is offered to the host only, the
 * RLS is the wall. Plain delete/insert chains, no .select() (the 42501
 * discipline): the caller (the /new submit) only needs success/failure.
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
 * soft-hide (the /mod model; hidden comments are invisible to everyone but
 * moderators via the SELECT policy). Plain update, no .select() — the 42501
 * discipline: pre-0014 the RETURNING read-back of the new row 403'd under the
 * SELECT policy; the plain chain stays the simple path.
 *
 * V8 ticket 10: hide + UNHIDE are now one function (setCommentHidden) riding
 * moderation.issueModeratorUpdate — the path the /mod tools already use —
 * because the moderator UPDATE policy is column-agnostic (verified live; see
 * moderation.ts's ModeratorTable note), so clearing hidden_at is the same
 * write as setting it. No migration.
 */
export async function hideComment(commentId: string): Promise<void> {
  return setCommentHidden(commentId, true)
}

/**
 * Unhide a comment (V8 ticket 10) — the moderator's way back: hidden_at back
 * to NULL, so the row is visible to every signed-in parent again (0014's
 * widened SELECT policy keeps it readable to the moderator either way, which
 * is how the hidden row is on screen to be unhidden at all).
 *
 * Same write path as hideComment (issueModeratorUpdate), same reason: the
 * policy is any-column, and a plain UPDATE avoids the RETURNING read-back.
 */
export async function unhideComment(commentId: string): Promise<void> {
  return setCommentHidden(commentId, false)
}

/** The one moderator comment-visibility write: hidden_at = now, or NULL. */
async function setCommentHidden(commentId: string, hidden: boolean): Promise<void> {
  await issueModeratorUpdate(supabase, 'comments', commentId, {
    hidden_at: hidden ? new Date().toISOString() : null,
  })
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

// ---------------------------------------------------------------------------
// V8 ticket 08: web push — the subscription rows (0031) and the log (0032).
//
// NO new SQL surface beyond those two tables: the producers are the SECURITY
// DEFINER triggers in 0032 and the sender is the `send-push` Edge Function, so
// everything here is a plain RLS-scoped read/write. In particular there is
// deliberately NO insert-into-notification_log helper — 0032 has no
// authenticated INSERT policy, and adding one "so the client can log" would
// hand every signed-in parent the ability to push arbitrary copy to another
// parent's phone under our name.
//
// MISSING-TABLE BEHAVIOUR (the fail-safe, not the current state — 0031/0032
// were applied live on 2026-09-12): if a table is absent, every call below
// throws a PostgREST `PGRST205` / 404. The ONLY consumer is the /settings
// Notifications section, which catches that and renders a sentence — the rest
// of /settings keeps working, which is why nothing here is called from a shared
// load path.
// ---------------------------------------------------------------------------

/** One device that has opted in (never the keys — see 0031's capability pin). */
export interface PushSubscriptionSummary {
  id: string
  endpoint: string
  createdAt: string
  lastSeenAt: string
}

export interface NewPushSubscription {
  profileId: string
  endpoint: string
  p256dh: string | null
  auth: string | null
  userAgent: string | null
}

/** One row of the visible fallback list (the "we told you about this" trail). */
export interface NotificationLogItem {
  id: string
  /** The row's owner — always the reader (the SELECT policy is owner-only).
   *  Carried so the list can be run through the SAME dedupe-key derivation as
   *  the producers and the sender. */
  profileId: string
  kind: NotificationKind
  playdateId: string | null
  title: string
  body: string
  url: string
  createdAt: string
  sentAt: string | null
  error: string | null
}

/**
 * Register (or re-register) this device's push subscription, against an
 * injected client.
 *
 * An UPSERT keyed on `endpoint` (0031's global unique constraint), because the
 * push service hands the same endpoint back for the same browser profile
 * forever and this runs on every opt-in AND on every app open
 * (`startPushSubscriptionRepair`) — so it must bump `last_seen_at` rather than
 * pile up dead rows.
 *
 * THE COLLISION, HONESTLY (fix-round finding D; the earlier comment here
 * claimed PostgREST raises 42501 for a non-owner, and that is WRONG): when the
 * endpoint already belongs to another profile, Postgres takes the ON CONFLICT
 * UPDATE path, applies `push_subscriptions_update_owner`'s USING clause to it,
 * updates ZERO rows, and still answers success. There is no exception to catch,
 * so `error` is null and the caller would cheerfully report "Notifications are
 * on for this device." while the next read shows nothing — reachable on a
 * shared family tablet where another account already opted in.
 *
 * So this is the ONE WRITE IN THIS FILE THAT USES RETURNING, and the empty
 * representation is the detector: `ON CONFLICT DO UPDATE` that matched no
 * updatable row returns no rows, so `data` is `[]` exactly when the write did
 * not land as this caller. A real insert/update returns the row it wrote.
 *
 * AND IT MUST BE RETURNING RATHER THAN A FOLLOW-UP `select()`: measured on this
 * project, an immediate read-after-`POST` can MISS the row it just wrote and see
 * it a few hundred milliseconds later (the app's own verification re-read did
 * exactly that during the fix round, in one run seeing the row and in the next
 * missing it). A separate GET would therefore be flaky in both directions —
 * false "already registered to another account" errors for a correct write.
 * RETURNING is produced by the same statement, so there is no read-after-write
 * gap at all.
 */
export async function savePushSubscriptionWithClient(
  client: SupabaseClient,
  input: NewPushSubscription,
): Promise<void> {
  const { data, error } = await client
    .from('push_subscriptions')
    .upsert(
      {
        profile_id: input.profileId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.userAgent,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )
    .select('profile_id')
  if (error) throw error

  const rows = (data ?? []) as Array<{ profile_id?: string }>
  if (rows.length !== 1 || rows[0]?.profile_id !== input.profileId) {
    throw new Error(
      'This browser is already registered for notifications under a different Drop In ' +
        'account on this device. Turn notifications off in that account, then try again here.',
    )
  }
}

/** The default-client wrapper (the opt-in path). */
export async function savePushSubscription(input: Omit<NewPushSubscription, 'profileId'>): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) throw new Error('Not signed in')
  return savePushSubscriptionWithClient(supabase, { ...input, profileId: user.id })
}

/**
 * "Turn off notifications": delete EVERY subscription row this profile owns,
 * against an injected client.
 *
 * Profile-scoped rather than endpoint-scoped on purpose. The endpoint the
 * browser reports today is not necessarily the endpoint in the table (the
 * browser rotates subscriptions behind our back — the very case
 * `pushsubscriptionchange` exists for), so an endpoint-scoped delete can
 * silently remove nothing while the UI claims notifications are off — a parent
 * who is still being buzzed after tapping "turn off" is the worst version of
 * this feature. Scoping to the profile makes "off" true. The cost is honest
 * and stated in the UI copy: it is off on every device they turned it on from,
 * and this app has no per-device list to be more surgical with.
 */
export async function deletePushSubscriptionsForProfileWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<void> {
  const { error } = await client.from('push_subscriptions').delete().eq('profile_id', profileId)
  if (error) throw error
}

/** The default-client wrapper ("Turn off notifications"). */
export async function deletePushSubscriptionsForProfile(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return
  return deletePushSubscriptionsForProfileWithClient(supabase, user.id)
}

/** This profile's registered devices (the RLS SELECT policy is the wall). */
export async function listPushSubscriptionsWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<PushSubscriptionSummary[]> {
  const { data, error } = await client
    .from('push_subscriptions')
    .select('id, endpoint, created_at, last_seen_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Array<{
    id: string
    endpoint: string | null
    created_at: string
    last_seen_at: string | null
  }>).map((row) => ({
    id: row.id,
    endpoint: row.endpoint ?? '',
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at ?? row.created_at,
  }))
}

/** The default-client wrapper (the /settings Notifications section). */
export async function listPushSubscriptions(): Promise<PushSubscriptionSummary[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return []
  return listPushSubscriptionsWithClient(supabase, user.id)
}

/**
 * The last few things we told this parent (the ticket's visible fallback for
 * anyone who denied the browser permission). Owner-only SELECT is the wall —
 * there is no cross-profile read anywhere, moderator included.
 *
 * `kind` is narrowed through `isNotificationKind` rather than trusted: a row
 * whose kind is not one of the four (a hand-edited table, a pre-CHECK row)
 * must not break the list, so unknown kinds are dropped.
 */
export async function listRecentNotificationsWithClient(
  client: SupabaseClient,
  profileId: string,
  limit: number = RECENT_NOTIFICATIONS_LIMIT,
): Promise<NotificationLogItem[]> {
  const { data, error } = await client
    .from('notification_log')
    .select('id, profile_id, kind, playdate_id, title, body, url, created_at, sent_at, error')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  const rows = (data ?? []) as Array<{
    id: string
    profile_id: string
    kind: string
    playdate_id: string | null
    title: string
    body: string
    url: string
    created_at: string
    sent_at: string | null
    error: string | null
  }>
  return rows.flatMap((row) =>
    isNotificationKind(row.kind)
      ? [
          {
            id: row.id,
            profileId: row.profile_id,
            kind: row.kind,
            playdateId: row.playdate_id,
            title: row.title,
            body: row.body,
            url: row.url,
            createdAt: row.created_at,
            sentAt: row.sent_at,
            error: row.error,
          },
        ]
      : [],
  )
}

/** The default-client wrapper (the /settings Notifications section). */
export async function listRecentNotifications(
  limit: number = RECENT_NOTIFICATIONS_LIMIT,
): Promise<NotificationLogItem[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return []
  return listRecentNotificationsWithClient(supabase, user.id, limit)
}

// ---------------------------------------------------------------------------
// V8 ticket 09 (migration 0033): FOLLOWS — the loop-closing bookmark.
//
// A follow targets EITHER another family OR a place, and there is exactly one
// row per (follower, target) — the DB's `follows_one_target_check` and the two
// PARTIAL unique indexes are the walls, and the pure
// `validateFollowTarget` (follows.ts) is the client's copy of the same rule so
// a malformed target never reaches the wire. The RLS posture is OWNER-ONLY on
// all four verbs: these reads and writes only ever touch the caller's own rows.
//
// MISSING-TABLE BEHAVIOUR (the documented pre-apply state, the 0031/0032
// discipline): until the coordinator applies 0033, every call below answers
// PostgREST `PGRST205` ("Could not find the table 'public.follows' in the
// schema cache"). Each CALLER catches it and degrades — the card's met-before
// line stays hidden, the Follow control reports the designed error line, and
// the /settings Following list renders one sentence. Nothing here is on a
// shared load path that could cost a post or a feed.
// ---------------------------------------------------------------------------

/**
 * One `follows` row (the columns the client reads). The exactly-one rule means
 * exactly one of `followee_profile_id` / `place_id` is non-null — see
 * follows.followTargetOf for the read-side resolution.
 */
export interface FollowRow {
  id: string
  followee_profile_id: string | null
  place_id: string | null
  created_at: string
}

/**
 * The caller's own follow rows (owner-only SELECT policy — a read of somebody
 * else's rows returns ZERO rows, 2xx, never an error). Injected client: the
 * `*WithClient` pattern every other read here uses, so the round-trip is
 * mockable.
 */
export async function listMyFollowsWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<FollowRow[]> {
  const { data, error } = await client
    .from('follows')
    .select('id, followee_profile_id, place_id, created_at')
    .eq('follower_profile_id', profileId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as FollowRow[]
}

/** The default-client wrapper (the feed's met-before line, /u/:handle). */
export async function listMyFollows(): Promise<FollowRow[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return []
  return listMyFollowsWithClient(supabase, user.id)
}

/** A followed FAMILY as the Following list renders it (handle + avatar for the row). */
export interface FollowingFamily {
  /** The follow row's id (the unfollow target). */
  followId: string
  profileId: string
  /** The family's public handle (profiles.display_name) — null if the row is gone. */
  handle: string | null
  avatarUrl: string | null
}

/** A followed PLACE as the Following list renders it (name + link to /place/:id). */
export interface FollowingPlace {
  followId: string
  placeId: string
  /** The place's name — null if the directory row is gone (FK cascade should prevent it). */
  name: string | null
}

/** The caller's Following list, split by target kind (the /settings section). */
export interface MyFollowing {
  families: FollowingFamily[]
  places: FollowingPlace[]
}

/**
 * The caller's Following list, NAMED: the follow rows, then one batched
 * profiles read (id, display_name, avatar_url — the 0001 authenticated read)
 * and one batched places read (the 0029 public read) for the handles and
 * names. Never a per-row query — the list is short and the batches are two.
 *
 * A follow whose target row vanished (it should not: all three FKs cascade)
 * keeps its row with a null handle/name rather than disappearing: silently
 * dropping it would hide the unfollow control for a row that still exists.
 */
export async function listMyFollowingWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<MyFollowing> {
  const rows = await listMyFollowsWithClient(client, profileId)
  const familyFollows = rows.filter((row) => row.followee_profile_id !== null)
  const placeFollows = rows.filter((row) => row.place_id !== null)

  const handleById = new Map<string, { handle: string | null; avatarUrl: string | null }>()
  const profileIds = [...new Set(familyFollows.map((row) => row.followee_profile_id as string))]
  if (profileIds.length > 0) {
    const { data, error } = await client
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', profileIds)
    if (error) throw error
    for (const row of (data ?? []) as unknown as Array<{
      id: string
      display_name: string
      avatar_url: string | null
    }>) {
      handleById.set(row.id, { handle: row.display_name, avatarUrl: row.avatar_url ?? null })
    }
  }

  const nameById = new Map<string, string | null>()
  const placeIds = [...new Set(placeFollows.map((row) => row.place_id as string))]
  if (placeIds.length > 0) {
    const { data, error } = await client.from('places').select('id, name').in('id', placeIds)
    if (error) throw error
    for (const row of (data ?? []) as unknown as Array<{ id: string; name: string }>) {
      nameById.set(row.id, row.name)
    }
  }

  return {
    families: familyFollows.map((row) => {
      const profileIdOfRow = row.followee_profile_id as string
      const named = handleById.get(profileIdOfRow)
      return {
        followId: row.id,
        profileId: profileIdOfRow,
        handle: named?.handle ?? null,
        avatarUrl: named?.avatarUrl ?? null,
      }
    }),
    places: placeFollows.map((row) => ({
      followId: row.id,
      placeId: row.place_id as string,
      name: nameById.get(row.place_id as string) ?? null,
    })),
  }
}

/** The default-client wrapper (/settings' Following section). */
export async function listMyFollowing(): Promise<MyFollowing> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return { families: [], places: [] }
  return listMyFollowingWithClient(supabase, user.id)
}

/**
 * The caller's own follow row for ONE target, or null — the single read the
 * state getters and both toggles share. The target kind decides which column
 * is filtered, so a family id is never looked up against `place_id`.
 */
async function findFollowRow(
  client: SupabaseClient,
  followerId: string,
  target: { followeeProfileId?: string; placeId?: string },
): Promise<{ id: string } | null> {
  const scoped = client.from('follows').select('id').eq('follower_profile_id', followerId)
  const filtered =
    target.followeeProfileId !== undefined
      ? scoped.eq('followee_profile_id', target.followeeProfileId)
      : scoped.eq('place_id', target.placeId as string)
  const { data, error } = await filtered.maybeSingle()
  if (error) throw error
  return (data as { id: string } | null) ?? null
}

/**
 * Whether the caller follows this family (the Follow control's initial state,
 * the getBlockState shape). Owner-only SELECT, one row or none.
 */
export async function getFollowStateWithClient(
  client: SupabaseClient,
  followerId: string,
  profileId: string,
): Promise<boolean> {
  return (await findFollowRow(client, followerId, { followeeProfileId: profileId })) !== null
}

/** The default-client wrapper (/u/:handle's Follow control). */
export async function getFollowState(profileId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return false
  return getFollowStateWithClient(supabase, user.id, profileId)
}

/** Whether the caller follows this place (the /place/:id control's state). */
export async function getPlaceFollowStateWithClient(
  client: SupabaseClient,
  followerId: string,
  placeId: string,
): Promise<boolean> {
  return (await findFollowRow(client, followerId, { placeId })) !== null
}

/** The default-client wrapper (/place/:id's Follow control). */
export async function getPlaceFollowState(placeId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return false
  return getPlaceFollowStateWithClient(supabase, user.id, placeId)
}

/**
 * Delete one of the caller's own follow rows (the Unfollow path, and the
 * unfollow half of both toggles). The DELETE policy scopes it to the caller:
 * a row that is not theirs matches nothing — a silent 0-row 2xx, never an
 * error (the 0014 lesson).
 */
async function deleteFollowRow(
  client: SupabaseClient,
  followerId: string,
  followId: string,
): Promise<void> {
  const { error } = await client
    .from('follows')
    .delete()
    .eq('id', followId)
    .eq('follower_profile_id', followerId)
  if (error) throw error
}

/**
 * Insert one of the caller's own follow rows, treating the uniqueness wall as
 * SUCCESS: a concurrent follow of the same target answers 23505 (the partial
 * unique index), which means the row the caller asked for already exists —
 * never a duplicate, never an error the user has to see (the toggleBlock
 * discipline, which the exactly-one-row rule depends on).
 */
async function insertFollowRow(
  client: SupabaseClient,
  row: { follower_profile_id: string; followee_profile_id?: string; place_id?: string },
): Promise<void> {
  const { error } = await client.from('follows').insert(row)
  if (error && error.code !== '23505') throw error
}

/**
 * Toggle the caller's follow of a family. Returns the new state (true = now
 * following). A second follow of the same family can never create a second
 * row: the read-then-write below is backed by the partial unique index.
 */
export async function toggleFollowProfile(profileId: string): Promise<boolean> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('No authenticated user — cannot follow a family.')

  const existing = await findFollowRow(supabase, user.id, { followeeProfileId: profileId })
  if (existing !== null) {
    await deleteFollowRow(supabase, user.id, existing.id)
    return false
  }
  await insertFollowRow(supabase, {
    follower_profile_id: user.id,
    followee_profile_id: profileId,
  })
  return true
}

/** Toggle the caller's follow of a place (the same shape, place_id target). */
export async function toggleFollowPlace(placeId: string): Promise<boolean> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('No authenticated user — cannot follow a place.')

  const existing = await findFollowRow(supabase, user.id, { placeId })
  if (existing !== null) {
    await deleteFollowRow(supabase, user.id, existing.id)
    return false
  }
  await insertFollowRow(supabase, { follower_profile_id: user.id, place_id: placeId })
  return true
}

/** Unfollow one of the caller's own rows by its follow id (the /settings list). */
export async function unfollowById(followId: string): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('No authenticated user — cannot unfollow.')
  await deleteFollowRow(supabase, user.id, followId)
}

/**
 * How many families follow this profile — the 0033 SECURITY DEFINER count
 * (`count_followers`), the ONLY sanctioned way a count crosses to another
 * viewer: the follows table has no cross-viewer SELECT policy at all.
 *
 * DELIBERATELY UNUSED BY THE UI: a visible "N families follow @someone" line
 * is a popularity score on a parent, and the settled no-reviews/no-vouching
 * verdict forbids exactly that (a follow is a bookmark, not a score). The
 * function is wrapped here so the sanctioned surface exists and is callable,
 * and so no future screen is tempted to widen a policy instead.
 */
export async function countFollowers(profileId: string): Promise<number> {
  const { data, error } = await supabase.rpc('count_followers', { p_profile_id: profileId })
  if (error) throw error
  return typeof data === 'number' ? data : 0
}

/**
 * How many families follow this place — the 0033 SECDEF count
 * (`count_place_followers`), rendered on /place/:id. A count, never a list:
 * the RLS policies are owner-only, so WHO follows a place is not readable by
 * anyone, including this caller. EXECUTE is granted to `authenticated` only,
 * so a signed-out visitor's page never issues this call (the signed-out
 * /place/:id shows the sign-in prompt instead — the documented decision).
 */
export async function countPlaceFollowers(placeId: string): Promise<number> {
  const { data, error } = await supabase.rpc('count_place_followers', { p_place_id: placeId })
  if (error) throw error
  return typeof data === 'number' ? data : 0
}

/**
 * One going ping reduced to what the met-before line needs: which family
 * pinged which post. Deliberately a SEPARATE read from
 * `listPingsForPosts` (which carries the avatars/names the card's circles
 * need): the card's data shape is pinned by its own unit tests, and this is
 * the only consumer of the ping's `profile_id`.
 */
export interface PingProfileRow {
  playdateId: string
  profileId: string
}

/**
 * The (post, family) pairs for a set of posts — the feed card's met-before
 * line input. One query over the EXISTING broad `going_pings` SELECT
 * (0007, unchanged: a count/aggregate read, never a name), and only the two
 * ids. Empty postIds → [] with no query.
 *
 * A failed read is the caller's to swallow (the feed's card decorations are
 * all best-effort): no met-before line is a decoration missing, not a feed
 * broken.
 */
export async function listPingProfileIdsForPostsWithClient(
  client: SupabaseClient,
  postIds: string[],
): Promise<PingProfileRow[]> {
  if (postIds.length === 0) return []
  const { data, error } = await client
    .from('going_pings')
    .select('playdate_id, profile_id')
    .in('playdate_id', postIds)
  if (error) throw error
  const rows = (data ?? []) as unknown as Array<{
    playdate_id: string | null
    profile_id: string | null
  }>
  return rows.flatMap((row) =>
    row.playdate_id === null || row.profile_id === null
      ? []
      : [{ playdateId: row.playdate_id, profileId: row.profile_id }],
  )
}

/** The default-client wrapper (the feed's met-before lines). */
export async function listPingProfileIdsForPosts(postIds: string[]): Promise<PingProfileRow[]> {
  return listPingProfileIdsForPostsWithClient(supabase, postIds)
}

/** One occurrence row of a series, as the next-occurrence chooser needs it. */
export interface SeriesOccurrenceRow {
  id: string
  starts_at: string
  ends_at: string | null
}

/**
 * The sibling occurrences of a series post (the REAL `playdates` rows the
 * 0028 generator materializes, filtered by `series_id`) — the input of the
 * pure `nextOccurrencePlan` chooser.
 *
 * This is a plain read on the EXISTING `playdates` SELECT policy (any signed-in
 * parent may read a post), NOT a generator call: a viewer's page load must
 * never write to the database (the 0028 pin (h)). Only the HOST's own detail
 * page tops the horizon up, through the existing `ensureSeriesOccurrences`.
 *
 * Pre-0028-apply the `series_id` column does not exist (42703) and the caller
 * catches it: no "same time next week" affordance, never a crash.
 */
export async function listSeriesOccurrences(seriesId: string): Promise<SeriesOccurrenceRow[]> {
  const { data, error } = await supabase
    .from('playdates')
    .select('id, starts_at, ends_at')
    .eq('series_id', seriesId)
    .order('starts_at', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as unknown as Array<{
    id: string
    starts_at: string
    ends_at: string | null
  }>
  return rows.map((row) => ({ id: row.id, starts_at: row.starts_at, ends_at: row.ends_at ?? null }))
}
