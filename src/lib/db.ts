import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type {
  AccountLink,
  CommentWithAuthor,
  ParentCard,
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
// V28 slice 2a fix 1/5: the ONE home-zip presence predicate (lib/homeZip.ts) —
// the gate's derivation below is built on it, so the guards in the pages can
// never drift looser than the wall they replace.
import { hasHomeZip } from './homeZip'
import { acceptedCounterpartyForProfile, normalizeHandle, type LinkRowForView } from './links'
// V9 ticket 11: where a family's images live and who may fetch each kind. The
// paths are the pure seams (photoStorage.ts) so this file never spells one out.
import {
  FAMILY_PHOTO_URL_TTL_SECONDS,
  PHOTO_BUCKET,
  familyPhotoMintPaths,
  familyPhotoObjectPath,
  familyPhotoPath,
  kidPhotoMintPaths,
  kidPhotoPath,
  kidPhotoStoredRef,
} from './photoStorage'
import {
  dropInProofsFromRows,
  type PlaceDropInProof,
  type PlaceDropInRow,
  type PlaceReviewHighlight,
} from './placeSocial'
import {
  ageRangeFields,
  beyondRadiusCount,
  filterFeed,
  lastOwnPlaydateFrom,
  localDayKey,
  neighborhoodIdField,
  postDistanceMiles,
  queryLastOwnPlaydateWithClient,
  queryPastOwnPlaydatesWithClient,
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
import { placeIdField, upcomingCountByPlace, groupUpcomingStartTimesByPlace } from './places'
// V24 slice 04 (ticket 04): the Open-Meteo daily forecast seam. The request
// shape (grounded variable names + the Fahrenheit/mph unit parameters), the
// parsed response shape, the presentation rule and the fetch's four invariants
// all live in ./weather, where they are unit-tested without a browser or a
// database; this file only binds the factory to the Supabase gazetteer + fetch.
import {
  createDailyForecastLoader,
  openMeteoDailyUrl,
  parseDailyForecast,
  type DailyForecast,
} from './weather'
import {
  buildShareUrl,
  issueReportInsert,
  togglePingWithClient,
  validateCommentBody,
  validateReportReason,
  type ReportInsertPayload,
} from './trust'
import { issueModeratorUpdate, isProfileBanned } from './moderation'
// V28 r4: the moderator's place-photo replacements. The pure path/patch builders
// live beside their sibling test; db.ts only moves bytes and rows.
import { placePhotoObjectPath, type PlacePhotoType } from './placePhotoAdmin'
import { oauthRedirectTo, probeOAuthProvider, type OAuthProvider } from './oauth'
import { currentPublicOrigin } from './publicUrl'
// The reviews-inline slice: the place page's inline block and the details page's
// wall read the SAME rows, so the row shape is the pure module's
// (`ReviewWithAuthor`) rather than a second interface spelled here.
import type { ReviewWithAuthor } from './reviews'
// V8 ticket 08: the notification kind guard + the fallback list's page size.
// The push RULES themselves (payload copy, dedupe key, iOS detection, the
// permission memory) live in ./push and are not duplicated here — db.ts only
// moves rows.
import { RECENT_NOTIFICATIONS_LIMIT, isNotificationKind, type NotificationKind } from './push'
// Slice 2b-ii: the native token's row shape and upsert key live in the seam
// (./nativePushToken) so the write here and the row the seam builds cannot
// drift — db.ts only moves the bytes.
import { DEVICE_TOKEN_CONFLICT_KEY, type DeviceTokenRow } from './nativePushToken'
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
    setHomeZipSet(hasHomeZip(nextProfile?.home_zip))
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
      // `currentPublicOrigin()` — NOT `window.location.origin`. In the native
      // shell the origin is https://localhost, which no provider can return to;
      // see lib/publicUrl.ts. The deep-link RETURN is still slice 3's job.
      redirectTo: oauthRedirectTo(currentPublicOrigin()),
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
 *
 * V28 r2 slice 2: the optional `avatarUrl`. The parent's photo now lives on
 * the NAME card — the card that CREATES this row — so the crop step runs
 * BEFORE the row exists: `uploadAvatar`'s storage-object write lands anyway
 * (the owner-scoped policy keys on auth.uid, not the row) but its
 * profiles.avatar_url UPDATE matches zero rows, and PostgREST no-ops a
 * 0-row update silently. The crop step hands its returned public URL in here
 * so the INSERT carries the column — without this the confirmed photo would
 * be an orphaned object in the avatars bucket (the column NULL on the new
 * row, and every render surface reads the column). Omitted (or the caller
 * picked no photo) inserts with avatar_url NULL exactly as before.
 */
export async function createProfile(
  displayName: string,
  avatarUrl?: string,
): Promise<Profile> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('No authenticated user — cannot create profile.')

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      display_name: displayName,
      ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
    })
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
export interface RadiusFeedResult {
  /** The posts inside the viewer's radius, in starts_at order. */
  posts: PlaydateWithNeighborhood[]
  /**
   * V29 v29-6: how many upcoming, unblocked, not-hidden drop-ins sit OUTSIDE the
   * viewer's radius but inside the widest one (feed.RADIUS_MAX_MILES) — 0 when
   * there is nothing further out, and 0 at the widest radius itself. It rides
   * THIS read because the radius filter is what discards those rows; asking for
   * them separately would be a second query for data already in hand.
   *
   * V29 v29-7 note: the viewer's OWN posts are deliberately NOT excluded from
   * this count. They are exempt from the radius in `posts` above, so a viewer
   * with an own post further out never sees an empty state at all — which makes
   * the overlap unreachable rather than a wrong number on screen.
   */
  beyondRadiusCount: number
}

export async function listRadiusFeed(
  viewer: RadiusViewer,
  profileId: string,
): Promise<RadiusFeedResult> {
  if (viewer.homeZip === null) return { posts: [], beyondRadiusCount: 0 }
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
  const blocked = new Set(blockedIds)
  // V29 v29-7: `profileId` is the VIEWER's own profile id — their own active
  // drop-ins are exempt from the radius (see feed.filterFeed's ownProfileId).
  const filtered = filterFeed(posts, viewer, zipCoords, blocked, nowIso, profileId)
  return {
    posts: filtered.map((post) => ({
      ...post,
      // Survivors always have a distance (filterFeed excludes nulls); the
      // fallback only covers a place/host embed missing its coordinates.
      distanceMiles: postDistanceMiles(post, viewer, zipCoords) ?? undefined,
    })),
    // V29 v29-6: the SAME fetched rows, filtered by the same rule at the widest
    // radius — the empty state's honest answer to "is it worth widening?". No
    // extra query: `queryUpcomingPlaydates` already returned every upcoming
    // post, and the radius is what discards them.
    beyondRadiusCount: beyondRadiusCount(posts, viewer, zipCoords, blocked, nowIso),
  }
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
 * Upcoming drop-in START TIMES per place, for the browse list's date chips
 * (annotation 15). ONE read of the upcoming posts' (place_id, starts_at) — the
 * same query shape as `upcomingCountsByPlace` but selecting the start time so a
 * window can ask "does this place have ANY drop-in on THIS day?" rather than
 * merely "does it have any at all?".
 *
 * Returns null when the read FAILS (pre-0030-apply: no place_id column), which
 * the caller renders as NO start times at all — never as an empty list, which
 * would be a claim we cannot make.
 */
export async function upcomingStartTimesByPlaceWithClient(
  client: SupabaseClient,
): Promise<Map<string, string[]> | null> {
  const { data, error } = await client
    .from('playdates')
    .select('place_id, starts_at')
    .gte('starts_at', startOfTodayIso())
    .is('hidden_at', null)
  if (error) return null
  return groupUpcomingStartTimesByPlace((data ?? []) as Array<{ place_id: string | null; starts_at: string }>)
}

/** The default-client wrapper (the browse directory's date-chip read). */
export async function upcomingStartTimesByPlace(): Promise<Map<string, string[]> | null> {
  return upcomingStartTimesByPlaceWithClient(supabase)
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
 * seeded gazetteer and the radius an integer in 1–35 (the 0045 CHECK is
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
   * V9 ticket 05 (migration 0037): the post's STATED age range. V16 t03 item 1
   * (option ii): /new derives it from the kids picked (feed.ageBoundsFromSelectedKids)
   * rather than asking — UNDEFINED when no selected kid has a known age, and the
   * age_min / age_max keys are then ABSENT from the insert payload rather than
   * null (the neighborhoodIdField / seriesIdField / placeIdField pattern via
   * feed.ageRangeFields), so a post that states nothing posts exactly as it did
   * before 0037 and pre-apply nothing 42703s on that path.
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
      // host actually stated a range (ageRangeFields; 0037's columns). V16 t03
      // item 1 (option ii): /new derives that range from the kids picked, so
      // "stated" now means "at least one selected kid has a known age".
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

/**
 * The caller's past posts for the "Post again" picker (V13 ticket 04) — every
 * post, newest by START, with status + kids embed (see
 * queryPastOwnPlaydatesWithClient). No session → []; a failed read THROWS:
 * the caller (the /new page) swallows it into "no picker" (the same
 * convenience discipline as listLastOwnPlaydate).
 */
export async function listPastOwnPlaydates(): Promise<unknown[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) return []
  return queryPastOwnPlaydatesWithClient(supabase, user.id)
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
 * ONE Open-Meteo daily fetch (no key, no location sensing — the plan pin):
 * the event's LOCAL date (YYYY-MM-DD, the device timezone — V1's only
 * timezone story) as a one-day range, timezone=auto, and the event's
 * coordinates. Throws on any HTTP/parse problem (the loader retries once, then
 * settles null).
 *
 * The URL comes from `weather.openMeteoDailyUrl` and the payload from
 * `weather.parseDailyForecast`, so the grounded request/response shapes are
 * asserted in `weather.test.ts` — a rejected variable name here is an HTTP 400
 * that the null contract would otherwise hide as a permanently inert chip.
 */
async function openMeteoDailyForecast(
  lat: number,
  lng: number,
  dateYmd: string,
): Promise<DailyForecast> {
  const res = await fetch(openMeteoDailyUrl(lat, lng, dateYmd))
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`)
  const forecast = parseDailyForecast(await res.json())
  if (forecast === null) throw new Error('Open-Meteo returned no usable daily forecast')
  return forecast
}

/**
 * The Open-Meteo DAILY FORECAST for a zip's event date (V3 slice 2, ticket 02;
 * widened from a bare probability to a forecast OBJECT by V24 slice 04,
 * ticket 04 — the tappable weather chip needs temperature, precipitation
 * probability and wind from the SAME single request).
 *
 * lat/lng come from the 0012 client-side zip map (a zip missing from the
 * gazetteer → null — coordinates are never invented, the radius feed's pinned
 * rule). Best-effort per the plan pin, and the four invariants below are
 * LOAD-BEARING (each is unit-tested in `weather.test.ts` against counting
 * fakes, because a cached rejection is a bug this repo already fixed once):
 * - ONE fetch per distinct (zip, event-date) — the module cache + the
 *   in-flight dedupe (concurrent callers share the cached promise);
 * - RETRY once on a failed fetch; a double failure (or an out-of-range date
 *   Open-Meteo rejects) resolves null and is NOT cached, so the next call
 *   retries — the zip-cache lesson (e0d3756);
 * - null, NEVER throws, on any error (the chip is silently absent — no error
 *   state, the zero-pressure soul).
 */
const fetchDailyForecast = createDailyForecastLoader({
  loadCoords: loadZipCodes,
  localDayKey,
  fetchForecast: openMeteoDailyForecast,
})

/** The wrapper (the default-client binding of the loader above). */
export async function fetchDailyForecastForZip(
  zip: string,
  eventDateIso: string,
): Promise<DailyForecast | null> {
  return fetchDailyForecast(zip, eventDateIso)
}

// V24 batch-end cleanup: `fetchRainProbabilityForZip` (the bare-probability
// wrapper over this same fetch) was DELETED here. V24 slice 04 migrated its
// last two callers (FeedPage, PlaydateDetailPage) to
// `fetchDailyForecastForZip` + `rainBadgeLabel(forecast?.precipitationProbability)`,
// and a repo-wide search found no other caller — no page, no test, no e2e. It
// was a pure derivation of the call above, so removing it changes no behaviour:
// the badge rule and the single-request cache live in `feed.rainBadgeLabel` and
// this loader, which is where the four invariants are unit-tested.

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
 * The share URL for a drop-in (V2 slice 5, ticket 05).
 *
 * The ORDER now lives in `lib/publicUrl.ts` and is one copy for all four
 * outbound-link sites: the configured `VITE_PUBLIC_BASE_URL` wins, a browser
 * tab falls back to its own origin, and the native shell falls back to the
 * app's public home rather than to `https://localhost` — which is what this
 * used to hand a friend. The pure `buildShareUrl` still decides the path
 * (unit-tested in trust.test.ts); this is the env-facing wrapper.
 */
export function getShareUrl(playdateId: string): string {
  return buildShareUrl(playdateId, '', currentPublicOrigin())
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
    // See lib/publicUrl.ts: the shell's own origin is not reachable from an
    // inbox, so the reset link must name the public web app.
    redirectTo: resetRedirectTo(currentPublicOrigin()),
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

/** An aggregate age band: the youngest and oldest kid coming (V27 slice 4). */
export interface KidAgeBand {
  min: number
  max: number
}

/**
 * The AGE BAND of the kids PINGERS are bringing, for a batch of posts (V27
 * slice 4, migration 0056): one call for every card on screen, the same "one
 * call per feed, never one per card" shape countKidsGoingForPosts (0027)
 * established — the reason the card component itself owns no fetching.
 *
 * WHAT CROSSES, exactly: `playdate_id`, `min_age`, `max_age` — two integers
 * derived with SQL `min`/`max`, and nothing else. It asks the OTHER question
 * from kidAgesByPostForPostsWithClient below: 0056 reads the PINGERS' own
 * ping_kids selections (0026), while the ages read is the HOST's playdate_kids
 * selection. One function, one question. Per-kid ages and identities stay
 * behind 0026's gated `get_kids_going`; a band is indistinguishable whether one
 * kid or a dozen is coming.
 *
 * Best-effort by contract, like every other card decoration: the RPC throws on
 * any failure (an absent function included — the pre-apply state) and the
 * caller settles to `{}` — every card simply omits its band, never an error
 * state, never a crash.
 */
export async function kidAgeBandsGoingForPostsWithClient(
  client: SupabaseClient,
  postIds: string[],
): Promise<Record<string, KidAgeBand>> {
  if (postIds.length === 0) return {}
  const { data, error } = await client.rpc('kid_age_band_going_for', { p_ids: postIds })
  if (error) throw error
  const bands: Record<string, KidAgeBand> = {}
  for (const row of (data ?? []) as unknown as Array<{
    playdate_id: string
    min_age: number | null
    max_age: number | null
  }>) {
    if (typeof row.min_age !== 'number' || typeof row.max_age !== 'number') continue
    bands[row.playdate_id] = { min: row.min_age, max: row.max_age }
  }
  return bands
}

/** The default-client wrapper (the feed's one batched age-band read). */
export async function kidAgeBandsGoingForPosts(
  postIds: string[],
): Promise<Record<string, KidAgeBand>> {
  return kidAgeBandsGoingForPostsWithClient(supabase, postIds)
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
 * 4, ticket 07 — the card's going line: the pinger circles + "N going").
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
 * How many rows each of the host-post queries reads (V8 ticket 04's pin,
 * RAISED 50 → 200 by the profile-archive slice, 2026-10-05).
 *
 * Per SECTION, not per request: the two sections carry different orders, so they
 * are two queries — and an old host's history is the pile that grows, which is
 * why the cap needs a door. The profile's Past list now pages LOCALLY through
 * the rows this fetch returns (5 on first paint, then +20 per "Show more",
 * src/lib/profileArchive.ts), so the fetch's job is to hold enough history for
 * that paging to reach a real host's whole archive.
 *
 * WHY 200 AND NOT 50 (`.scratch/profile-archive/spec.md` §1, option A, the
 * brief's default): at 50 the list ran out while the profile still had rows, so
 * its tail was "+N older" — a promise with no door, which is the defect the
 * slice exists to remove. 200 covers years of weekly drop-ins for one family;
 * the cost is a larger first read, and the benefit is that the dead text
 * disappears for every real host. What is STILL beyond 200 keeps an honest
 * one-line count (`HostPosts.olderCount` → profileArchive.olderPastNote, which
 * names this limit rather than promising the rows) — never a silent drop.
 *
 * The number is bounded, not unbounded: this is the query's cap, and the
 * remainder is reported rather than invented.
 *
 * ONE NUMBER FOR BOTH SECTIONS, so the Upcoming query's cap rises with the
 * past's. That costs nothing it can notice — a host with more than a handful of
 * drop-ins ahead is not the case this pin is about — and keeping one constant
 * is what stops the two sections' caps from drifting apart.
 */
export const HOST_POSTS_LIMIT = 200

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
   * Past rows beyond HOST_POSTS_LIMIT — the count of rows no query, column or
   * door reaches today. The page renders it as profileArchive.olderPastNote's
   * honest line (which names the limit), never as a promise. 0 = the fetch
   * reached the end of the archive.
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
 *   `limit(HOST_POSTS_LIMIT)` with an exact COUNT so the rows beyond the cap can
 *   be reported as an honest number (never a second unbounded fetch). The Past
 *   list pages through the rows this returns; `olderCount` is what is left over.
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

/**
 * V28 r4 — set a place's photo (moderator op).
 *
 * ⚠️ THIS IS THE FIRST WRITE PATH TO `places` IN THE APP'S HISTORY, and it is
 * not a plain update like its siblings above. `places` carried ONLY a SELECT
 * policy from 0029 until migration 0062 added `places_update_moderators`, and
 * 0029's header is explicit that this was deliberate: *"no INSERT/UPDATE/DELETE
 * policy exists anywhere, and RLS denies by default, so writes stay
 * postgres-only."* So a call to this function from a NON-moderator is rejected
 * by the database, not by this code — the guard below exists to fail early with
 * a clear error, never to be the security boundary. RLS is the boundary.
 *
 * The patch is built by `placePhotoPatch` (pure, tested) rather than inline, so
 * the "all five columns together" rule has one home.
 */
export async function setPlacePhoto(
  placeId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await issueModeratorUpdate(supabase, 'places', placeId, patch)
}

/**
 * V28 r4 — upload a moderator's replacement image, then point the place at it.
 *
 * THE PATH CARRIES A GENERATION (`placePhotoObjectPath`), which is what makes a
 * replaced photo actually re-render: the object path is deterministic per
 * place+generation, so bumping the generation produces a NEW URL and neither the
 * browser nor the CDN keeps serving the old bytes. `uploadAvatarObject` below
 * solves the same problem with a `?v=` query; this uses a path segment instead
 * because the generation is also useful to a human reading the bucket.
 *
 * `upsert: false` is deliberate: the generation is unique per replacement, so a
 * collision means a caller reused a generation — a bug worth failing on rather
 * than silently overwriting an image somebody may already be reviewing.
 */
export async function uploadPlacePhoto(
  placeId: string,
  file: File,
  generation: number,
): Promise<string> {
  const type = file.type as PlacePhotoType
  const objectPath = placePhotoObjectPath(placeId, type, generation)
  const { error } = await supabase.storage
    .from('place-photos')
    .upload(objectPath, file, { contentType: type, upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from('place-photos').getPublicUrl(objectPath)
  return data.publicUrl
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

/** The kids cap per profile (plan-v2 Interfaces: app-enforced, not DB). */
export const MAX_KIDS_PER_PROFILE = 5

/**
 * The kid "likes" cap (V3 slice 6, ticket 09, migration 0022): a UI pin — the
 * caps are app-enforced (the UI wall), NO DB CHECK (the 0021 address lesson;
 * 0022 adds the column plain). The column is `kids.likes text` (nullable), so
 * any length fits and NO migration is needed to change this number.
 *
 * 100 → 500 in V16 t04. The founder's complaint was that a parent cannot say
 * anything real about their kid in 100 characters: this is PROSE a parent
 * writes ("loves dinosaurs, building couch forts, and will eat anything with
 * peanut butter on it"), not a tag list — 100 is about one sentence. 500 is the
 * same ceiling the bio (BIO_MAX_LENGTH) uses, so the product has ONE prose
 * budget instead of two numbers to remember, and it is deliberately NOT
 * unlimited: the value rides profile/feed read paths and into kid labels, so a
 * finite pin keeps a pathological paste out of every render while still being
 * ~5× the space that felt too small.
 */
export const LIKES_MAX_LENGTH = 500

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
 * The blank-age rule in ONE place (V28 r2 fix round 2, R4): a blank age
 * INPUT maps to NaN, never `Number('')` === 0 — 0 is a LEGAL age
 * (`validateKidAge` passes it), so a blank age must be REFUSED, not
 * fabricated into an age-0 kid. NaN fails `validateKidAge`'s
 * `Number.isInteger` check, which is the refusal. The onboarding kids card
 * calls this at all three of its sites (the blank-row mirror, the photo
 * confirm's write, and the Continue write — which pre-R4 used a bare
 * `Number(row.age)` that was safe only because `invalidKidRows` ran first,
 * an order of two unrelated statements that any future edit could delete).
 */
export function kidAgeFromInput(ageInput: string): number {
  return ageInput.trim() === '' ? NaN : Number(ageInput)
}

/**
 * Pure kid-row validation (first name + age only — the privacy pin). Age is
 * a whole number in 0–17: these are kids.
 */
export function validateKid(firstName: string, age: number): string | null {
  return validateKidName(firstName) ?? validateKidAge(age)
}

/**
 * The pixel size of a canvas source, whatever kind it is. `CanvasImageSource` is a
 * union (ImageBitmap, HTMLImageElement, HTMLCanvasElement, ImageData, VideoFrame…)
 * and they do not agree on where the size lives, so the guard in
 * `prepareCroppedPhotoFile` needs one place that knows.
 */
function sourceSize(source: CanvasImageSource): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight }
  }
  const sized = source as { width?: number; height?: number }
  return { width: sized.width ?? 0, height: sized.height ?? 0 }
}

/** The pixel size a stored photo is encoded at. Not the source's size. */
export interface PhotoEncodeSize {
  width: number
  height: number
}

/**
 * The avatar's stored shape: a square at `AVATAR_SIZE_PX`. Named so the two
 * avatar upload cores say WHICH size they mean rather than repeating the pair
 * (the one-copy rule) — and so that "avatars stay square" is a value a reader
 * can point at after the encoder learned to take a rectangle.
 */
export const AVATAR_PHOTO_SIZE: PhotoEncodeSize = {
  width: AVATAR_SIZE_PX,
  height: AVATAR_SIZE_PX,
}

/**
 * Client-side encode of the caller's CHOSEN crop as a JPEG of the caller's
 * stored shape (V2 ticket 02; reframed by photo-crop ticket 03; renamed
 * `prepareSquarePhotoFile` → `prepareCroppedPhotoFile` by place-photo-crop slice
 * 3 on 2026-10-05, when the stored shape stopped being a square for places).
 *
 * It NO LONGER DECIDES THE CROP. This function used to scale the photo to cover a
 * square and keep the middle of it, which is why a portrait photo of a kid
 * arrived as a circle of shoulder (see `.scratch/photo-crop/spec.md`). The frame
 * now comes from the user as a `CropRect` from `src/lib/photoCrop.ts` — the same
 * rectangle the crop dialog previewed, so what was framed is what is kept.
 *
 * Size and format are still decided HERE, and that is the division of labour:
 * framing belongs to the crop step, "how big and in what format" belongs to the
 * encoder, and there is exactly one of each. The SHAPE is now an input rather
 * than an assumption, because the two families of stored photo genuinely differ
 * (slice 3): every avatar-family upload passes `AVATAR_PHOTO_SIZE` (square,
 * `AVATAR_SIZE_PX` — the circle mask and the square render sites are unchanged),
 * and a place photo passes `PLACE_PHOTO_SIZE` (1400×700, the 2:1 hero the
 * moderator is framing for). Runs in the browser (canvas), so the network only
 * ever sees the small result and never the original.
 *
 * The source is NOT closed here — the caller owns it, because the same decoded
 * bitmap is what the crop dialog drew (`useCropStep` closes it when the flow
 * ends). Closing it here would blank the preview.
 */
export async function prepareCroppedPhotoFile(
  source: CanvasImageSource,
  rect: CropRect,
  size: PhotoEncodeSize,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('Could not resize the photo (canvas unavailable).')
  // Refuse an undrawable frame LOUDLY. A zero or non-finite source rect makes
  // drawImage produce a blank image with no error at all, so the failure would
  // arrive as a successfully-uploaded grey photo. Unreachable from the app (only
  // cropRectFor output reaches here) — which is the point: this is the one line
  // whose output is what the user actually ends up looking at.
  if (!isDrawableRect(rect, sourceSize(source))) {
    throw new Error('Could not crop the photo (the chosen area is outside the image).')
  }
  ctx.imageSmoothingQuality = 'high'
  // The 9-argument form: take `rect` from the source, draw it across the whole
  // output. One scale, no second crop decision — and the caller's window shape
  // is what the user framed, so the two rectangles have the same aspect.
  ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, size.width, size.height)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // "The photo image", not "the avatar image": this encoder serves the
        // place-photo editor as well as the avatar pipeline, and the moderator
        // reading this sentence is not uploading an avatar.
        if (blob === null) reject(new Error('Could not encode the photo image.'))
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
 * square JPEG (`prepareCroppedPhotoFile` with `AVATAR_PHOTO_SIZE` — the network
 * only ever sees the small result), upload to the PUBLIC 'avatars' bucket at
 * `objectPath`, and return the public URL.
 *
 * IT SERVES PARENT AVATARS ONLY NOW. V9 ticket 11 ends kid photos (`<uid>/kids/
 * <kidId>`, the class that made this bucket's public read an exposure) and adds
 * `uploadPrivatePhotoObject` for the private bucket; the family photo goes
 * through THAT one, not this one; `uploadKidPhoto` (re-added by V13 ticket 01 for the /profile per-kid photo control) goes through it as well. What
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
  const blob = await prepareCroppedPhotoFile(source, rect, AVATAR_PHOTO_SIZE)
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
 * Clear the caller's avatar (V15 ticket 06, A19): point profiles.avatar_url at
 * NULL. The storage OBJECT stays in the bucket (the remove-kid-photo discipline:
 * a photo object is never deleted on clear — only the column stops pointing at
 * it), so this touches no storage logic, only the profile row's own UPDATE
 * policy (the same self-only posture updateDisplayName rides).
 */
export async function clearAvatar(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', userId)
  if (error) throw error
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
  const blob = await prepareCroppedPhotoFile(source, rect, AVATAR_PHOTO_SIZE)
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

/**
 * Mint signed URLs for a profile's kid photos (V12 t04), ONE batched call for
 * the whole list (T6), against an injected client (the house *WithClient
 * pattern).
 *
 * The paths are BUILT from `profileId` + each kid id (`kidPhotoMintPaths`),
 * never read from `kids.avatar_url` — the stored column is a bucket-qualified
 * path (or a legacy public URL), so the canonical `<uid>/kids/<kidId>` shape is
 * what the policy mints for. The result is keyed by KID ID (not path) so the
 * render site maps its own kids straight through.
 *
 * WHO MAY CALL IT (V25 t14, migration 0054): any signed-in parent. The
 * kid-class storage SELECT policy dropped its owner check and kept the
 * `[2] = 'kids'` class guard, so `profileId` is the profile whose kids these
 * are — not the caller — and the caller must pass only the kid ids the database
 * actually returned to that viewer (0040 filters `kids` row by row).
 *
 * BEST-EFFORT BY CONTRACT, exactly like the family-photo sibling: it never
 * throws. A failure — the bucket not applied, an outage, a policy refusal, or a
 * mint that comes back empty because the object was never uploaded — means "no
 * image for that kid", and the page renders the kid row without a photo. No
 * error state (a decoration is never worth one). NEVER PERSISTED: the URLs are
 * render-time state only.
 */
export async function signedKidPhotoUrlsWithClient(
  client: SupabaseClient,
  profileId: string,
  kidIds: string[],
): Promise<Record<string, string>> {
  const paths = kidPhotoMintPaths(profileId, kidIds)
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
    for (const kidId of kidIds) {
      if (kidId === '') continue
      const url = urlByPath.get(kidPhotoPath(profileId, kidId))
      if (url !== undefined) minted[kidId] = url
    }
  } catch {
    return {}
  }
  return minted
}

/** The default-client wrapper (the kid-photo render sites: /profile's editor and the profile kids card, including a signed-in non-owner's). */
export async function signedKidPhotoUrls(
  profileId: string,
  kidIds: string[],
): Promise<Record<string, string>> {
  return signedKidPhotoUrlsWithClient(supabase, profileId, kidIds)
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
 * V13 ticket 01 (reversing V9 ticket 11's "nothing renders it"): the owner's
 * /profile renders each kid's photo, but ONLY through the signed-URL mint
 * (`useKidPhotoUrls` / `signedKidPhotoUrls`, built from `kidPhotoMintPaths`) —
 * a caller that feeds this column to an `<img src>` is still re-opening the
 * closed decision (after migration 0038 the value is a private-bucket object
 * PATH, not a URL, so an `<img src>` fed from it would simply break).
 * `uploadKidPhoto` writes the path; the render site never reads it. The kids
 * SELECT policy is gate 0040's (`kids_select_own_host_pinger_mod`); a read
 * failure throws, and the caller renders a designed state.
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
 * `avatar_url` HAS A CALLER AGAIN (V13 ticket 01, reversing V9 ticket 11's
 * "no caller"). `uploadKidPhoto` — the /profile per-kid photo control — writes
 * the OBJECT PATH, and the owner's /profile renders the kid's photo through
 * the signed-URL mint (`useKidPhotoUrls` / `signedKidPhotoUrls`), never by
 * reading this column directly. It stays a writable field because the column
 * stays (the human's "delete nothing" intent) and because the reversal this
 * decision allows needs a place to write — the column is documented on
 * `photoStorage.kidPhotoStoredRef` (after migration 0038 the value is an OBJECT
 * PATH like `kid-photos/<uid>/kids/<kidId>`, never a URL).
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
 * kid editor's row save (name, age, likes, and — V13 ticket 01 — the photo's
 * object path via `uploadKidPhoto`, see KidPatch). The 0011
 * kids_update_own policy (owner-only) is the DB
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

/**
 * Upload the signed-in user's kid photo for one kid row (V13 ticket 01): the
 * per-kid photo control the /profile kid editor re-owns after V9 ticket 11
 * removed it. Encode the chosen crop of the decoded `source` (the SAME
 * square-JPEG encoder the avatar + family photo use — one pipeline), upload to
 * `PHOTO_BUCKET` at `<uid>/kids/<kidId>` (the pure `kidPhotoPath`), then point
 * `kids.avatar_url` at the BUCKET-QUALIFIED object path (`kidPhotoStoredRef` —
 * 0038's end state, the same shape the migration script's rewrite lands).
 * Returns that path.
 *
 * A PATH, not a URL — the `uploadFamilyPhoto` discipline (T6): a signed URL
 * expires, so persisting one would hand the parent a broken image on a timer.
 * The render site mints from the canonical path (`signedKidPhotoUrls`, via the
 * `useKidPhotoUrls` hook) and never reads `kids.avatar_url` for display.
 *
 * `source` + `rect` rather than a File: the file was already validated and
 * decoded by the crop step (the default avatar gate runs there, kid photos
 * never took the family-photo gate) and re-decoding here would cost a second
 * ~48MB decode of the same 12MP photo.
 *
 * The kid writer (`updateKidWithClient`) rather than a profiles-style update:
 * the kid row is the source of truth for its own photo, and the owner-only
 * 0011 kids_update_own policy is the DB wall (a non-owner write is a silent
 * RLS no-op). The upload is scoped the same way — the path's first folder is
 * the caller's own uid (the 0011/0038 write policy).
 */
export async function uploadKidPhoto(
  profileId: string,
  kidId: string,
  source: CanvasImageSource,
  rect: CropRect,
): Promise<string> {
  const objectPath = kidPhotoPath(profileId, kidId)
  await uploadPrivatePhotoObject(supabase, objectPath, source, rect)
  // The object lands at the in-bucket path; the column holds the BUCKET-
  // QUALIFIED form (kidPhotoStoredRef) so every post-0038 row — the migration
  // script's rewrites and the app's new uploads — carries the same shape.
  const storedRef = kidPhotoStoredRef(profileId, kidId)
  await updateKidWithClient(supabase, kidId, { avatar_url: storedRef })
  return storedRef
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

// ─────────────────────────────────────────────────────────────────────────────
// device_tokens (slice 2b-ii) — the NATIVE twin of the block above, against
// migration 0065. Same posture, deliberately: the write is profile-scoped and
// asks for the row back, the read is owner-only, and "turn off" is a delete of
// this profile's rows. The TOKEN is never returned to a caller that does not
// own the row — 0065 pin (a): a device token is a capability.
// ─────────────────────────────────────────────────────────────────────────────

/** One registered native install. The token itself is never read back (0065 pin a). */
export interface DeviceTokenSummary {
  id: string
  platform: string
  appVersion: string | null
  lastSeenAt: string
}

/**
 * Register (or re-register) this install's native push token, against an
 * injected client. `row` is built by the seam's `deviceTokenRow`, so the upsert
 * key (`DEVICE_TOKEN_CONFLICT_KEY`, 0065 pin b) is named in exactly one place.
 *
 * THE RETURNING CHECK IS THE SAME DEFECT 0031 NEEDED IT FOR, and 0065 pin (b)
 * records the same failure mode: when the token already belongs to another
 * profile, Postgres takes the ON CONFLICT UPDATE path, the UPDATE policy's USING
 * clause filters it out, ZERO rows are written and the call still answers
 * success. An empty representation is therefore the detector — a real write
 * returns the row it wrote — so a non-owner gets a real error instead of a false
 * "Notifications are on". (It cannot be a follow-up `select()`: an immediate
 * read-after-write on this project was measured missing the row it had just
 * written.)
 */
export async function saveDeviceTokenWithClient(
  client: SupabaseClient,
  row: DeviceTokenRow,
): Promise<void> {
  const { data, error } = await client
    .from('device_tokens')
    .upsert(row, { onConflict: DEVICE_TOKEN_CONFLICT_KEY })
    .select('profile_id')
  if (error) throw error

  const rows = (data ?? []) as Array<{ profile_id?: string }>
  if (rows.length !== 1 || rows[0]?.profile_id !== row.profile_id) {
    throw new Error(
      'This device is already registered for notifications under a different Drop In ' +
        'account. Turn notifications off in that account, then try again here.',
    )
  }
}

/** The default-client wrapper (the native opt-in path). */
export async function saveDeviceToken(row: DeviceTokenRow): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) throw new Error('Not signed in')
  return saveDeviceTokenWithClient(supabase, row)
}

/**
 * This profile's registered native installs. Owner-only SELECT is the wall
 * (0065 pin a). It exists so the /settings section can answer "are notifications
 * on?" for the NATIVE channel: inside the shell the web read is empty, and
 * rendering "off" over a live `device_tokens` row would tell a parent to turn on
 * something that is already on.
 */
export async function listDeviceTokensWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<DeviceTokenSummary[]> {
  const { data, error } = await client
    .from('device_tokens')
    .select('id, platform, app_version, last_seen_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Array<{
    id: string
    platform: string | null
    app_version: string | null
    last_seen_at: string | null
  }>).map((row) => ({
    id: row.id,
    platform: row.platform ?? '',
    appVersion: row.app_version,
    lastSeenAt: row.last_seen_at ?? '',
  }))
}

/** The default-client wrapper (the native status read). */
export async function listDeviceTokens(): Promise<DeviceTokenSummary[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return []
  return listDeviceTokensWithClient(supabase, user.id)
}

/**
 * "Turn off notifications" for the NATIVE channel: delete EVERY `device_tokens`
 * row this profile owns, against an injected client. This is the whole opt-out
 * (0065's own pin, on the DELETE policy): with no device row the sender has
 * nothing to address natively.
 *
 * Profile-scoped rather than token-scoped on purpose, exactly as the web twin
 * is: the token the plugin reported is not necessarily the row in the table, so
 * a token-scoped delete can remove nothing while the UI claims "off" — a parent
 * still being buzzed after tapping turn-off is the worst version of this control.
 */
export async function deleteDeviceTokensForProfileWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<void> {
  const { error } = await client.from('device_tokens').delete().eq('profile_id', profileId)
  if (error) throw error
}

/** The default-client wrapper (the native opt-out). */
export async function deleteDeviceTokensForProfile(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return
  return deleteDeviceTokensForProfileWithClient(supabase, user.id)
}

/**
 * The last few things we told this parent (the ticket's visible fallback for
 * anyone who denied the browser permission). Owner-only SELECT is the wall —
 * there is no cross-profile read anywhere, moderator included.
 *
 * `kind` is narrowed through `isNotificationKind` rather than trusted: a row
 * whose kind is not one of the six (a hand-edited table, a pre-CHECK row)
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
// Migration 0053: the channel-level EMAIL OPT-OUT (`profiles.email_optout`).
//
// A column on a table that ALREADY has the right posture, so there is no new
// SQL surface here: the owner UPDATE rides 0001's `profiles_update_own` (which
// covers every column — 0012_zip_radius.sql:682) and the read rides 0001's
// `profiles_select_authenticated`, scoped to the caller's own id by the query.
//
// THE POLARITY IS THE API, and it is why the read returns `boolean | undefined`
// rather than a boolean: `email_optout` is an OPT-OUT — `false` = email is
// ALLOWED (the NOT NULL default), `true` = the parent asked us to stop. A read
// that did not come back is `undefined`, NEVER `false`, because "false" is a
// real, stored, emailable value and conflating the two would make a failed read
// indistinguishable from a parent's explicit "yes". The render rule for that
// case is the pure `decideEmailOptoutControl` (src/lib/emailOptout.ts).
//
// MISSING-COLUMN BEHAVIOUR (the pre-0053 state, the 0031/0032/0052 discipline):
// selecting the absent column is PostgREST 42703, so `getEmailOptout` THROWS
// and the caller renders the default-on state with its note. Nothing here is on
// a shared load path — the only consumer is the /settings Notifications
// section, whose other reads keep working when this one fails.
// ---------------------------------------------------------------------------

/**
 * The caller's email opt-out flag (migration 0053), or `undefined` when the
 * value did not come back.
 *
 * `undefined` is deliberately NOT flattened into a boolean, because `false` is
 * a real, stored, emailable value (the OPT-OUT polarity): it means "no readable
 * row" (`maybeSingle`'s null) or "the payload carried no boolean". A pre-0053
 * project does not land on either — selecting the absent column is PostgREST
 * 42703, which this function THROWS, and the caller catches it into the same
 * default-on state. Both paths must render as email-is-on, never as "opted
 * out"; the rule lives in the pure `decideEmailOptoutControl`
 * (src/lib/emailOptout.ts).
 *
 * `maybeSingle()` rather than `single()`: a missing row is a legitimate "we
 * could not read this", not a PGRST116 the caller would have to tell apart from
 * a real failure.
 */
export async function getEmailOptoutWithClient(
  client: SupabaseClient,
  userId: string,
): Promise<boolean | undefined> {
  const { data, error } = await client
    .from('profiles')
    .select('email_optout')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  const value = (data as { email_optout?: unknown } | null)?.email_optout
  return typeof value === 'boolean' ? value : undefined
}

/** The default-client wrapper (the /settings Notifications section). */
export async function getEmailOptout(): Promise<boolean | undefined> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return undefined
  return getEmailOptoutWithClient(supabase, user.id)
}

/**
 * Set the caller's email opt-out flag (migration 0053) against an injected
 * client. The parameter is the COLUMN value, not the checkbox state: `true`
 * means "stop emailing me". One plain UPDATE with no RETURNING — the value is
 * the whole write, so there is nothing to read back (and 0031's saved-write
 * lesson is that an immediate re-read can miss the row it just wrote); the
 * caller can render what it just sent.
 */
export async function updateEmailOptoutWithClient(
  client: SupabaseClient,
  userId: string,
  emailOptout: boolean,
): Promise<void> {
  const { error } = await client
    .from('profiles')
    .update({ email_optout: emailOptout })
    .eq('id', userId)
  if (error) throw error
}

/** The default-client wrapper ("Email me about my drop-ins" on /settings). */
export async function updateEmailOptout(emailOptout: boolean): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) throw new Error('Not signed in')
  return updateEmailOptoutWithClient(supabase, user.id, emailOptout)
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

/** The default-client wrapper (the feed's met-before line). */
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

// ---------------------------------------------------------------------------
// V14 ticket 01 (migration 0042): parent↔parent messaging — the inbox.
//
// Messages are playdate-scoped: a conversation belongs to a drop-in and its
// participants are the post's host + pingers (the going_pings gate). The RLS
// policies in 0042 enforce participation at the DB level; these seams are the
// app's read/write paths on top of them. Pre-0042-apply every call here
// 42703s (missing table) and the caller catches it: the inbox shows an honest
// error state, never a crash (the house DB-not-applied discipline).
// ---------------------------------------------------------------------------

/** One row of `public.messages`, as the thread view renders it. */
export interface MessageRow {
  id: string
  playdate_id: string
  sender_id: string
  body: string
  created_at: string
  /**
   * V25 ticket 11: the SENDER's own display name, embedded by the thread read
   * (`sender:profiles!messages_sender_id_fkey ( display_name )`) so each bubble
   * can be labelled by its own sender rather than by the thread's counterpart.
   * Optional because NOT every producer of a MessageRow carries the embed: the
   * optimistic row and the Realtime INSERT payload have no join available
   * (`null` there is honest — the label falls back to the counterpart only when
   * the sender id matches it, else it is omitted).
   */
  sender_display_name?: string | null
}

/** One row of the inbox's conversation list (one per participating playdate with ≥1 message). */
export interface ConversationSummary {
  /** The playdate the conversation belongs to. */
  playdateId: string
  /** The post's title (the muted line under the other party's name). */
  playdateTitle: string
  /** The other participant's display name (the bold line). */
  otherPartyDisplayName: string
  /**
   * The other participant's PROFILE id (V23 s7). This is the merge key that lets
   * the inbox collapse a DM row and a playdate row for the same parent into one
   * row — never the display name (two parents can share a name; collapsing on
   * it would merge two real people, which is worse than the duplicate).
   */
  otherPartyId: string
  /**
   * V24 slice 04: the other participant's PUBLIC parent avatar
   * (`profiles.avatar_url`) — the inbox row's face, falling back to the initial
   * placeholder when null. Never a kid/family photo: those live in the PRIVATE
   * bucket and are not another family's row to show.
   */
  otherPartyAvatarUrl: string | null
  /**
   * V24 slice 04: the other participant's retention cursor
   * (`profiles.last_seen_at`, migration 0024) — the inbox row's honest
   * "Active today" line (`inbox.activeTodayLabel`). Not presence.
   */
  otherPartyLastSeenAt: string | null
  /** The latest message's body, truncated to 60 chars. */
  latestMessagePreview: string
  /** The latest message's created_at (ISO). */
  latestMessageAt: string
  /** Unread count: messages newer than this user's last_read_at (all when no read row). */
  unreadCount: number
}

/** The client-side validation cap for a message body (the DB CHECK matches). */
export const MESSAGE_MAX_LENGTH = 2000

/**
 * Validate a message body before sending (the client-side mirror of 0042's
 * CHECK constraint): trim must leave 1–2000 characters. Returns an error
 * string, or null when the body is sendable (the validateCommentBody shape).
 */
export function validateMessageBody(body: string): string | null {
  const trimmed = body.trim()
  if (trimmed.length === 0) return 'Write a message first — it cannot be empty.'
  if (trimmed.length > MESSAGE_MAX_LENGTH) {
    return `Keep messages to ${MESSAGE_MAX_LENGTH} characters.`
  }
  return null
}

/**
 * The inbox's conversation list (V14 ticket 01), against an injected client
 * (the trust.togglePingWithClient / feed.queryUpcomingFeedWithClient pattern
 * — mockable in unit tests).
 *
 * Two sequential requests (PostgREST cannot group-by in one query without a
 * custom RPC, and the ticket allows "two sequential requests"):
 *   1. Every message the caller may READ (the RLS SELECT policy already
 *      scopes to participation), joined to the post's title + the sender's
 *      display name, ordered by created_at desc. Grouped client-side: one
 *      summary per playdate, latest message wins (preview + time).
 *   2. The caller's conversation_reads rows (SELECT policy: own rows only) —
 *      the unread count per playdate = messages with created_at strictly
 *      after last_read_at, or the full count when no read row exists.
 *
 * The other party's name is derived from the latest message's sender: when
 * the latest sender is the caller themselves, the preview still names the
 * OTHER party (the host, when the caller pinged; the pinger, when the caller
 * hosts). A playdate where the caller has sent every message (no reply yet)
 * falls back to the host's name when the caller is a pinger, or the most
 * recent pinger's name when the caller hosts — both resolved from the same
 * request set below.
 */
export async function listConversationsWithClient(
  client: SupabaseClient,
  userId: string,
): Promise<ConversationSummary[]> {
  // Request 1: the caller's readable messages (RLS-scoped), newest first,
  // with the post's title + the sender's display name embedded.
  const { data: msgData, error: msgError } = await client
    .from('messages')
    .select(
      'id, playdate_id, sender_id, body, created_at, ' +
        'playdate:playdates!messages_playdate_id_fkey ( title ), ' +
        // V24 slice 04: the sender embed also carries the face + retention
        // cursor, so the counterpart's row data needs no extra wire call.
        'sender:profiles!messages_sender_id_fkey ( display_name, avatar_url, last_seen_at )',
    )
    .order('created_at', { ascending: false })
  if (msgError) throw msgError

  // Request 2: the caller's read cursors (own rows only by RLS).
  const { data: readData, error: readError } = await client
    .from('conversation_reads')
    .select('playdate_id, last_read_at')
    .eq('profile_id', userId)
  if (readError) throw readError

  // Request 3: who the other party is per playdate — the post's host + the
  // pinger profiles (the guest-list embed, pinned to the 0007 FK constraint).
  // Only needed for playdates that actually have messages; the set comes
  // from request 1.
  const playdateIds = Array.from(
    new Set(
      ((msgData ?? []) as unknown as Array<{ playdate_id: string | null }>)
        .map((row) => row.playdate_id)
        .filter((id): id is string => id !== null),
    ),
  )
  let counterpartNames: Record<string, string> = {}
  // V23 s7: the counterpart's PROFILE id per playdate — the merge key the inbox
  // uses to collapse a DM row + a playdate row for the same parent. Built from
  // the SAME request 3 (no extra wire call): the host's id is host_profile_id;
  // when the caller hosts, the counterpart is the most recent pinger, so we need
  // that pinger's profile id (not just their name).
  let counterpartIds: Record<string, string> = {}
  // V24 slice 04: the same request 3 fills the counterpart's face + retention
  // cursor (no new query — the profiles embed is already there).
  const counterpartAvatars: Record<string, string | null> = {}
  const counterpartLastSeen: Record<string, string | null> = {}
  if (playdateIds.length > 0) {
    const { data: postData, error: postError } = await client
      .from('playdates')
      .select(
        'id, host_profile_id, ' +
          'host:profiles!playdates_host_profile_id_fkey ( display_name, avatar_url, last_seen_at ), ' +
          'pings:going_pings ( profile:profiles!going_pings_profile_id_fkey ( id, display_name, avatar_url, last_seen_at ) )',
      )
      .in('id', playdateIds)
    if (postError) throw postError
    for (const post of (postData ?? []) as unknown as Array<{
      id: string
      host_profile_id: string
      host: { display_name: string; avatar_url: string | null; last_seen_at: string | null } | null
      pings: Array<{
        profile: {
          id: string
          display_name: string
          avatar_url: string | null
          last_seen_at: string | null
        } | null
      }>
    }>) {
      // The counterpart of THIS caller: the host when the caller is a pinger
      // (host_profile_id !== userId); otherwise the most recent pinger's name
      // (the pings array arrives in ping order — the embed's natural key).
      const pingerEntries = post.pings.filter((ping) => ping.profile !== null)
      if (post.host_profile_id !== userId) {
        // Caller is a pinger → counterpart is the host.
        counterpartNames[post.id] = post.host?.display_name ?? ''
        counterpartIds[post.id] = post.host_profile_id
        counterpartAvatars[post.id] = post.host?.avatar_url ?? null
        counterpartLastSeen[post.id] = post.host?.last_seen_at ?? null
      } else {
        // Caller is the host → counterpart is the most recent pinger.
        const lastPinger = pingerEntries[pingerEntries.length - 1]?.profile ?? null
        counterpartNames[post.id] = lastPinger?.display_name ?? ''
        counterpartIds[post.id] = lastPinger?.id ?? ''
        counterpartAvatars[post.id] = lastPinger?.avatar_url ?? null
        counterpartLastSeen[post.id] = lastPinger?.last_seen_at ?? null
      }
    }
  }

  const reads = new Map<
    string,
    { playdate_id: string; last_read_at: string }
  >()
  for (const row of (readData ?? []) as unknown as Array<{
    playdate_id: string
    last_read_at: string
  }>) {
    reads.set(row.playdate_id, row)
  }

  // Group request 1's rows by playdate (newest-first input → the FIRST row
  // seen per playdate is its latest message).
  const byPlaydate = new Map<
    string,
    {
      playdateTitle: string
      latest: {
        body: string
        created_at: string
        sender_id: string
        senderName: string
        senderAvatarUrl: string | null
        senderLastSeenAt: string | null
      }
      all: Array<{ created_at: string }>
    }
  >()
  for (const row of (msgData ?? []) as unknown as Array<{
    id: string
    playdate_id: string
    sender_id: string
    body: string
    created_at: string
    playdate: { title: string } | null
    sender: { display_name: string; avatar_url: string | null; last_seen_at: string | null } | null
  }>) {
    if (row.playdate_id === undefined || row.playdate_id === null) continue
    const entry = byPlaydate.get(row.playdate_id)
    if (entry === undefined) {
      byPlaydate.set(row.playdate_id, {
        playdateTitle: row.playdate?.title ?? '',
        latest: {
          body: row.body,
          created_at: row.created_at,
          sender_id: row.sender_id,
          senderName: row.sender?.display_name ?? '',
          senderAvatarUrl: row.sender?.avatar_url ?? null,
          senderLastSeenAt: row.sender?.last_seen_at ?? null,
        },
        all: [{ created_at: row.created_at }],
      })
    } else {
      entry.all.push({ created_at: row.created_at })
    }
  }

  const summaries: ConversationSummary[] = []
  for (const [playdateId, entry] of byPlaydate.entries()) {
    const readRow = reads.get(playdateId)
    const unreadCount =
      readRow === undefined
        ? entry.all.length
        : entry.all.filter((message) => message.created_at > readRow.last_read_at).length
    const counterpart =
      entry.latest.sender_id === userId
        ? (counterpartNames[playdateId] ?? '')
        : (entry.latest.senderName || counterpartNames[playdateId] || '')
    // The merge key: the counterpart's profile id. When the latest sender is the
    // caller, the counterpart is resolved from request 3 (host or pinger); when
    // the latest sender is someone else, that sender IS the counterpart and we
    // already have their profile id from request 1's embed.
    const otherPartyId =
      entry.latest.sender_id === userId
        ? (counterpartIds[playdateId] ?? '')
        : entry.latest.sender_id
    // The face + retention cursor follow the SAME counterpart branch as the
    // name/id above: the latest sender when it is someone else (request 1's
    // embed), otherwise the request-3 host/pinger resolution.
    const senderIsCounterpart = entry.latest.sender_id !== userId
    summaries.push({
      playdateId,
      playdateTitle: entry.playdateTitle,
      otherPartyDisplayName: counterpart,
      otherPartyId,
      otherPartyAvatarUrl: senderIsCounterpart
        ? entry.latest.senderAvatarUrl
        : (counterpartAvatars[playdateId] ?? null),
      otherPartyLastSeenAt: senderIsCounterpart
        ? entry.latest.senderLastSeenAt
        : (counterpartLastSeen[playdateId] ?? null),
      latestMessagePreview: truncateMessagePreview(entry.latest.body),
      latestMessageAt: entry.latest.created_at,
      unreadCount,
    })
  }
  // Latest conversation first (request 1 was newest-first, so insertion
  // order already is — but re-sort defensively: a playdate whose LATEST
  // message is older than another's must sort below it).
  summaries.sort((a, b) => (a.latestMessageAt < b.latestMessageAt ? 1 : -1))
  return summaries
}

/** Truncate a message body to a 60-char preview (the list card's muted line). */
export function truncateMessagePreview(body: string): string {
  const trimmed = body.trim()
  if (trimmed.length <= 60) return trimmed
  return `${trimmed.slice(0, 57)}…`
}

/** The default-client wrapper (the inbox page's list view). */
export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  return listConversationsWithClient(supabase, userId)
}

/**
 * Send one message on a playdate's conversation (V14 ticket 01), against an
 * injected client (mockable in unit tests). Client-side validation mirrors
 * the DB CHECK (trim, 1–2000 chars); the RLS INSERT policy enforces
 * sender_id = auth.uid() + participation at the DB level.
 */
export async function sendMessageWithClient(
  client: SupabaseClient,
  playdateId: string,
  body: string,
  senderId: string,
): Promise<void> {
  const validationError = validateMessageBody(body)
  if (validationError !== null) throw new Error(validationError)
  const { error } = await client
    .from('messages')
    .insert({
      playdate_id: playdateId,
      sender_id: senderId,
      body: body.trim(),
    })
  if (error) throw error
}

/** The default-client wrapper (resolves the auth user, then delegates). */
export async function sendMessage(playdateId: string, body: string): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (user === null) throw new Error('No authenticated user — cannot send a message.')
  return sendMessageWithClient(supabase, playdateId, body, user.id)
}

/**
 * All messages for one playdate, oldest first (the thread view's read),
 * against an injected client (mockable in unit tests). The RLS SELECT
 * policy scopes the rows to participants. The `sender` embed (V25 ticket 11)
 * carries each message's OWN sender display name in the same request, so the
 * thread view never has to guess a bubble's label from the thread-level
 * counterpart.
 */
export async function queryMessagesForPlaydateWithClient(
  client: SupabaseClient,
  playdateId: string,
): Promise<MessageRow[]> {
  const { data, error } = await client
    .from('messages')
    .select(
      'id, playdate_id, sender_id, body, created_at, ' +
        'sender:profiles!messages_sender_id_fkey ( display_name )',
    )
    .eq('playdate_id', playdateId)
    .order('created_at', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as unknown as Array<{
    id: string
    playdate_id: string
    sender_id: string
    body: string
    created_at: string
    sender: { display_name: string } | null
  }>
  return rows.map((row) => ({
    id: row.id,
    playdate_id: row.playdate_id,
    sender_id: row.sender_id,
    body: row.body,
    created_at: row.created_at,
    sender_display_name: row.sender?.display_name ?? null,
  }))
}

/** The default-client wrapper (the thread view's load). */
export async function queryMessagesForPlaydate(playdateId: string): Promise<MessageRow[]> {
  return queryMessagesForPlaydateWithClient(supabase, playdateId)
}

/**
 * Stamp the caller's read cursor for a playdate's conversation (V14 ticket
 * 01), against an injected client (mockable in unit tests). An upsert with
 * the composite PK's onConflict (the savePushSubscriptionWithClient pattern):
 * opening a thread again moves the cursor forward, never fails on the
 * existing row.
 */
export async function markConversationReadWithClient(
  client: SupabaseClient,
  playdateId: string,
  profileId: string,
): Promise<void> {
  const { error } = await client
    .from('conversation_reads')
    .upsert(
      {
        playdate_id: playdateId,
        profile_id: profileId,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: 'playdate_id,profile_id' },
    )
  if (error) throw error
}

/** The default-client wrapper (resolves the auth user, then delegates). */
export async function markConversationRead(playdateId: string): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (user === null) throw new Error('No authenticated user — cannot mark a conversation read.')
  return markConversationReadWithClient(supabase, playdateId, user.id)
}

/**
 * Stamp the caller's read cursor for a free-form direct conversation (V23 follow-up,
 * migration 0051), against an injected client (mockable in unit tests). The
 * DM counterpart of markConversationReadWithClient: a free-form thread has no
 * playdate id (0043), so the cursor is keyed on the OTHER party's profile id —
 * `direct_conversation_reads`'s composite PK (profile_id, other_profile_id).
 * An upsert with onConflict mirrors the playdate cursor's shape: opening the
 * thread again moves the cursor forward, never fails on the existing row.
 */
export async function markDirectConversationReadWithClient(
  client: SupabaseClient,
  otherProfileId: string,
  profileId: string,
): Promise<void> {
  const { error } = await client
    .from('direct_conversation_reads')
    .upsert(
      {
        profile_id: profileId,
        other_profile_id: otherProfileId,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id,other_profile_id' },
    )
  if (error) throw error
}

/** The default-client wrapper (resolves the auth user, then delegates). */
export async function markDirectConversationRead(otherProfileId: string): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (user === null) throw new Error('No authenticated user — cannot mark a conversation read.')
  return markDirectConversationReadWithClient(supabase, otherProfileId, user.id)
}

// ---------------------------------------------------------------------------
// V15 ticket 01: free-form DMs (message any parent by name search).
// ---------------------------------------------------------------------------

/** A profile match from the user-search modal. */
export interface ProfileSearchResult {
  id: string
  display_name: string
}

/**
 * Search profiles by display name (the "New message" user picker), against an
 * injected client (mockable in unit tests). Top 10 matches by ILIKE.
 */
export async function searchProfilesWithClient(
  client: SupabaseClient,
  query: string,
): Promise<ProfileSearchResult[]> {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []
  const { data, error } = await client
    .from('profiles')
    .select('id, display_name')
    .ilike('display_name', `%${trimmed}%`)
    .limit(10)
  if (error) throw error
  return ((data ?? []) as unknown as ProfileSearchResult[])
}

/** The default-client wrapper (the inbox's "New message" search). */
export async function searchProfiles(query: string): Promise<ProfileSearchResult[]> {
  return searchProfilesWithClient(supabase, query)
}

/**
 * Send a free-form message to a specific recipient (no playdate context).
 * ONE write: `recipient_hint` is consumed by the AFTER INSERT trigger, which
 * records the sender + recipient rows. Against an injected client (mockable).
 */
export async function sendDirectMessageWithClient(
  client: SupabaseClient,
  recipientId: string,
  body: string,
  senderId: string,
): Promise<void> {
  const validationError = validateMessageBody(body)
  if (validationError !== null) throw new Error(validationError)
  const { error: insErr } = await client.from('messages').insert({
    playdate_id: null,
    sender_id: senderId,
    body: body.trim(),
    recipient_hint: recipientId,
  })
  if (insErr) throw insErr
}

/**
 * Send a free-form message to a specific recipient (default client).
 * Two-step: insert the message (get its id via select single), then upsert
 * the recipient row.
 */
export async function sendDirectMessage(recipientId: string, body: string): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (user === null) throw new Error('No authenticated user — cannot send a message.')
  const validationError = validateMessageBody(body)
  if (validationError !== null) throw new Error(validationError)
  // ONE write. `recipient_hint` is read by the AFTER INSERT trigger
  // (messages_participation_guard), which records BOTH the sender and this
  // recipient as message_recipients rows.
  //
  // V15 fix: this used to be an insert followed by a client-side
  // `.upsert()` on message_recipients. That two-step never worked live —
  // ON CONFLICT DO UPDATE needs an UPDATE policy AND a SELECT of the
  // conflicting row, and the SELECT policy is scoped to `profile_id =
  // auth.uid()`, so a sender could never see (let alone update) the row
  // they were adding for the OTHER party: every send failed 403 "new row
  // violates row-level security policy". The trigger owns the write now;
  // the client sends one row and no longer touches message_recipients.
  const { error: insErr } = await supabase.from('messages').insert({
    playdate_id: null,
    sender_id: user.id,
    body: body.trim(),
    recipient_hint: recipientId,
  })
  if (insErr) throw insErr
}

/**
 * List all messages for a free-form conversation between two profiles,
 * oldest first. Against an injected client (mockable).
 *
 * `myId` is retained for signature compatibility with existing callers and
 * tests; the query no longer needs it because RLS + message_recipients
 * already pin the conversation to the caller.
 */
export async function queryDirectMessagesWithClient(
  client: SupabaseClient,
  otherPartyId: string,
  myId: string,
): Promise<MessageRow[]> {
  // V15 fix: a free-form thread is the pair {me, otherParty}, and the pair is
  // recorded in message_recipients — NOT inferable from sender_id alone.
  //
  // The previous filter was `.or(sender_id.eq.me, sender_id.eq.other)`, which
  // matches every free-form message either of us ever sent, including ones I
  // sent to a THIRD person. Those leaked into this thread (reproduced by the
  // dm e2e: a message to viewer A rendered inside the thread with viewer B).
  //
  // V23 follow-up repair: the candidate set is the CALLER's own participation rows
  // (`profile_id = myId`), NOT the other party's. The trigger records BOTH
  // parties of a DM as recipients (0044), so `profile_id = myId` yields every
  // message I am party to; the filter below then narrows to the pair. Asking
  // for `profile_id = otherPartyId` is invisible to me under the SELECT policy
  // (`profile_id = auth.uid() OR is_message_sender`), so a DM the other person
  // STARTED opened as "No messages yet" on my side — it only happened to work
  // for the SENDER, who satisfies `is_message_sender`. Pinned by the
  // recipient-side dm e2e.
  const { data: sentIds, error: idsError } = await client
    .from('message_recipients')
    .select('message_id')
    .eq('profile_id', myId)
  if (idsError) throw idsError
  const candidates = ((sentIds ?? []) as unknown as Array<{ message_id: string }>).map(
    (r) => r.message_id,
  )
  // Nothing addressed to them means there is no thread yet.
  if (candidates.length === 0) return []

  const { data, error } = await client
    .from('messages')
    .select('id, playdate_id, sender_id, body, created_at, recipient_hint')
    .is('playdate_id', null)
    .in('id', candidates)
    // Only the two parties of THIS thread: their messages to me and mine to
    // them. A message of theirs addressed to someone else is excluded.
    .or(`sender_id.eq.${otherPartyId},recipient_hint.eq.${otherPartyId}`)
    .order('created_at', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as unknown as Array<{
    id: string
    playdate_id: string | null
    sender_id: string
    body: string
    created_at: string
  }>
  return rows.map((row) => ({
    id: row.id,
    playdate_id: row.playdate_id ?? '',
    sender_id: row.sender_id,
    body: row.body,
    created_at: row.created_at,
  }))
}

/** The default-client wrapper (the thread view's load for free-form threads). */
export async function queryDirectMessages(otherPartyId: string): Promise<MessageRow[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (user === null) throw new Error('No authenticated user — cannot read messages.')
  return queryDirectMessagesWithClient(supabase, otherPartyId, user.id)
}

/**
 * Get the list of distinct counterparties the caller has free-form
 * conversations with (for the inbox's conversation list). Returns one entry
 * per other profile who has at least one message with the caller.
 */
export async function listDirectConversationsWithClient(
  client: SupabaseClient,
  userId: string,
): Promise<
  Array<{
    otherPartyId: string
    otherPartyName: string
    /** V24 slice 04: the counterpart's public parent avatar (profiles.avatar_url). */
    otherPartyAvatarUrl: string | null
    /** V24 slice 04: the counterpart's retention cursor (profiles.last_seen_at). */
    otherPartyLastSeenAt: string | null
    latestAt: string
    preview: string
    unreadCount: number
  }>
> {
  // All free-form messages the caller can see. RLS
  // (messages_select_participants) already scopes this to the caller's own
  // conversations — both the ones they SENT and the ones they RECEIVED — so
  // there is deliberately NO client-side sender filter here.
  //
  // V15 fix: this used to apply `.or('sender_id.eq.<me>')`, a single-condition
  // OR that meant "messages I sent". A parent who had only ever RECEIVED a DM
  // therefore saw an empty inbox ("No conversations yet") even though the
  // message was sitting in the database and readable. The filter was redundant
  // with RLS and actively wrong.
  const { data, error } = await client
    .from('messages')
    .select(
      // V24 slice 04: the sender's face + retention cursor ride the SAME embed
      // (no extra wire call) for the inbox row's avatar and "Active today" line.
      'id, sender_id, body, created_at, ' +
        'sender:profiles!messages_sender_id_fkey ( display_name, avatar_url, last_seen_at )',
    )
    .is('playdate_id', null)
    .order('created_at', { ascending: false })
  if (error) throw error

  const rows = (data ?? []) as unknown as Array<{
    id: string
    sender_id: string
    body: string
    created_at: string
    sender: { display_name: string; avatar_url: string | null; last_seen_at: string | null } | null
  }>

  // The caller's DM read cursors (own rows only by RLS), keyed by the OTHER
  // party's profile id — a free-form thread has no playdate id, so the
  // counterpart IS its identity (migration 0051).
  const { data: readData, error: readError } = await client
    .from('direct_conversation_reads')
    .select('other_profile_id, last_read_at')
    .eq('profile_id', userId)
  if (readError) throw readError
  const directReads = new Map<string, string>()
  for (const read of (readData ?? []) as unknown as Array<{
    other_profile_id: string
    last_read_at: string
  }>) {
    directReads.set(read.other_profile_id, read.last_read_at)
  }

  // Unread counts: messages FROM the counterpart newer than the viewer's read
  // cursor for them (all of them when no cursor exists). The viewer's OWN
  // messages never count — you have already read what you wrote. (The playdate
  // list counts every message after the cursor; for a DM the counterpart is
  // explicit, so this can be precise without touching the playdate path.)
  const unreadByCounterpart = new Map<string, number>()
  for (const row of rows) {
    if (row.sender_id === userId) continue
    const cursor = directReads.get(row.sender_id)
    if (cursor === undefined || row.created_at > cursor) {
      unreadByCounterpart.set(
        row.sender_id,
        (unreadByCounterpart.get(row.sender_id) ?? 0) + 1,
      )
    }
  }

  // For "__recipient__" entries, we need to find who the recipient was.
  // Query message_recipients for the messages where I'm the sender.
  //
  // V15 fix: this resolves the recipient's ID as well as their name. The
  // conversation card is keyed by `dm-conversation-<profileId>` and tapping it
  // navigates to /inbox?dm=<profileId>, so a name-only entry rendered a card
  // that could not be opened.
  const mySentIds = rows.filter((r) => r.sender_id === userId).map((r) => r.id)
  const recipientByMessage: Record<
    string,
    { id: string; name: string; avatarUrl: string | null; lastSeenAt: string | null }
  > = {}
  if (mySentIds.length > 0) {
    const { data: recData, error: recErr } = await client
      .from('message_recipients')
      .select(
        'message_id, profile_id, ' +
          'profile:profiles!message_recipients_profile_id_fkey ( display_name, avatar_url, last_seen_at )',
      )
      .in('message_id', mySentIds)
      .neq('profile_id', userId)
    if (!recErr && recData !== null) {
      for (const rec of recData as unknown as Array<{
        message_id: string
        profile_id: string
        profile: { display_name: string; avatar_url: string | null; last_seen_at: string | null } | null
      }>) {
        if (rec.profile !== null && rec.profile.display_name !== '') {
          recipientByMessage[rec.message_id] = {
            id: rec.profile_id,
            name: rec.profile.display_name,
            avatarUrl: rec.profile.avatar_url ?? null,
            lastSeenAt: rec.profile.last_seen_at ?? null,
          }
        }
      }
    }
  }

  // Build summaries: one per distinct counterparty, newest row wins (the wire
  // is ordered created_at DESC, so the FIRST row seen for a counterpart is its
  // latest). A Map — not an array scan — so a counterpart who both sent and
  // received never produces two rows (the inbox card is keyed on the id, and
  // the merge in src/lib/inbox.ts must find exactly one).
  const byOtherParty = new Map<
    string,
    {
      otherPartyName: string
      otherPartyAvatarUrl: string | null
      otherPartyLastSeenAt: string | null
      latestAt: string
      preview: string
    }
  >()
  for (const row of rows) {
    if (row.sender_id !== userId) {
      // They sent to me — counterparty is the sender.
      if (byOtherParty.has(row.sender_id)) continue
      byOtherParty.set(row.sender_id, {
        otherPartyName: row.sender?.display_name ?? '',
        otherPartyAvatarUrl: row.sender?.avatar_url ?? null,
        otherPartyLastSeenAt: row.sender?.last_seen_at ?? null,
        latestAt: row.created_at,
        preview: truncateMessagePreview(row.body),
      })
    } else {
      // I sent to them — counterparty is the recipient (resolved above). The ID
      // (not the name) is the card's identity: it keys the testid and the ?dm=
      // navigation.
      const recipient = recipientByMessage[row.id]
      if (recipient === undefined) continue
      if (byOtherParty.has(recipient.id)) continue
      byOtherParty.set(recipient.id, {
        otherPartyName: recipient.name,
        otherPartyAvatarUrl: recipient.avatarUrl,
        otherPartyLastSeenAt: recipient.lastSeenAt,
        latestAt: row.created_at,
        preview: truncateMessagePreview(row.body),
      })
    }
  }
  const results: Array<{
    otherPartyId: string
    otherPartyName: string
    otherPartyAvatarUrl: string | null
    otherPartyLastSeenAt: string | null
    latestAt: string
    preview: string
    unreadCount: number
  }> = Array.from(byOtherParty.entries()).map(([otherPartyId, entry]) => ({
    otherPartyId,
    otherPartyName: entry.otherPartyName,
    otherPartyAvatarUrl: entry.otherPartyAvatarUrl,
    otherPartyLastSeenAt: entry.otherPartyLastSeenAt,
    latestAt: entry.latestAt,
    preview: entry.preview,
    unreadCount: unreadByCounterpart.get(otherPartyId) ?? 0,
  }))
  results.sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1))
  return results
}

/** The default-client wrapper (the inbox's free-form conversation list). */
export async function listDirectConversations(userId: string): Promise<
  Awaited<ReturnType<typeof listDirectConversationsWithClient>>
> {
  return listDirectConversationsWithClient(supabase, userId)
}

// ---------------------------------------------------------------------------
// V15 ticket 08: message reactions (thumbs-up).
// V21 t03: six reaction kinds — one row per person per message, kind is a
// mutable attribute (the Facebook model). The DB stores the STRING kind, never
// the icon; the STROKED PATH map lives in components/icons.ts
// (REACTION_ICONS — emoji until inbox-messenger slice B drew it),
// mirroring the PLACE_KINDS / PLACE_KIND_ICONS house pattern.
// ---------------------------------------------------------------------------

/**
 * The reaction kinds the schema allows (migration 0049's CHECK constraint,
 * verbatim — the DB is the backstop, this is the app's mirror). One reaction
 * per person per message; changing kind replaces it in place, so these are the
 * only values a row may carry. A unit test asserts this list equals the SQL
 * value list so drift between the two is caught as a divergence, not rendered
 * as nothing.
 */
export const REACTION_KINDS = ['like', 'love', 'laugh', 'wow', 'sad', 'angry'] as const
export type ReactionKind = (typeof REACTION_KINDS)[number]

/** Toggle a reaction on a message by KIND (upsert-in-place or DELETE). */
export async function toggleReactionWithClient(
  client: SupabaseClient,
  messageId: string,
  profileId: string,
  kind: ReactionKind,
): Promise<boolean> {
  // Check if the reaction exists (one row per person per message).
  const { data: existing } = await client
    .from('message_reactions')
    .select('kind')
    .eq('message_id', messageId)
    .eq('profile_id', profileId)
    .maybeSingle()
  if (existing !== null && existing !== undefined) {
    // Same kind → remove it (tapping your current reaction clears it).
    if ((existing as { kind?: string }).kind === kind) {
      const { error } = await client
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('profile_id', profileId)
      if (error) throw error
      return false
    }
    // Different kind → replace in place (UPDATE, not INSERT: the count must
    // not increment when you change your reaction from 👍 to ❤️).
    const { error } = await client
      .from('message_reactions')
      .update({ kind })
      .eq('message_id', messageId)
      .eq('profile_id', profileId)
    if (error) throw error
    return true
  }
  // No row yet → add it.
  const { error } = await client
    .from('message_reactions')
    .insert({ message_id: messageId, profile_id: profileId, kind })
  if (error) throw error
  return true
}

/** The default-client wrapper. */
export async function toggleReaction(messageId: string, kind: ReactionKind): Promise<boolean> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (user === null) throw new Error('No authenticated user — cannot react.')
  return toggleReactionWithClient(supabase, messageId, user.id, kind)
}

/** Remove the viewer's reaction on a message (the picker's "tap your current kind" case). */
export async function toggleReactionRemove(messageId: string): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (user === null) throw new Error('No authenticated user — cannot react.')
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('profile_id', user.id)
  if (error) throw error
}

/** Count reactions on a message (for the counter display). */
export async function countReactionsWithClient(
  client: SupabaseClient,
  messageId: string,
): Promise<number> {
  const { count, error } = await client
    .from('message_reactions')
    .select('*', { count: 'exact', head: true })
    .eq('message_id', messageId)
  if (error) throw error
  return count ?? 0
}

/** The default-client wrapper. */
export async function countReactions(messageId: string): Promise<number> {
  return countReactionsWithClient(supabase, messageId)
}

/**
 * The reaction state for one message, as the thread view holds it. `count` is
 * the number of participants who reacted; `mine` is whether the viewer is one
 * of them; `myKind` is the viewer's own kind (null when they have not reacted).
 * The three travel together because the UI needs all three (the filled-vs-
 * outline button reads `mine`, the "❤️ 3" pill reads `count` + `myKind`).
 */
export interface ReactionState {
  count: number
  mine: boolean
  myKind: ReactionKind | null
}

/**
 * Initial reaction state for a list of messages (V15 ticket 08) — ONE request
 * for the whole thread instead of N count queries.
 *
 * The wire reads every reaction row the caller is allowed to see for these
 * messages (the 0043 SELECT policy already scopes that to conversation
 * participants) and groups them client-side. `viewerId` is what separates
 * "3 people reacted" from "3 people reacted, one of them is you" — the row set
 * carries profile_id, so `mine` costs no extra request.
 *
 * The `in` filter is chunked: PostgREST puts the id list in the query string,
 * and a very long thread would otherwise build a URL past the server's limit.
 * The chunk size is a bounded constant, not a tuning knob.
 */
export const REACTION_ID_CHUNK = 100

export async function reactionStatesForMessagesWithClient(
  client: SupabaseClient,
  messageIds: readonly string[],
  viewerId: string,
): Promise<Record<string, ReactionState>> {
  const states: Record<string, ReactionState> = {}
  for (const id of messageIds) states[id] = { count: 0, mine: false, myKind: null }
  if (messageIds.length === 0) return states
  for (let i = 0; i < messageIds.length; i += REACTION_ID_CHUNK) {
    const chunk = messageIds.slice(i, i + REACTION_ID_CHUNK)
    const { data, error } = await client
      .from('message_reactions')
      .select('message_id, profile_id, kind')
      .in('message_id', chunk)
    if (error) throw error
    for (const row of (data ?? []) as Array<{ message_id: string; profile_id: string; kind?: string }>) {
      const prev = states[row.message_id] ?? { count: 0, mine: false, myKind: null }
      const isMine = row.profile_id === viewerId
      // The viewer's own kind is the one they currently have (one row per
      // person per message, so at most one row matches the viewer).
      const myKind = isMine ? ((row.kind as ReactionKind | undefined) ?? 'like') : prev.myKind
      states[row.message_id] = {
        count: prev.count + 1,
        mine: prev.mine || isMine,
        myKind,
      }
    }
  }
  return states
}

/** The default-client wrapper. */
export async function reactionStatesForMessages(
  messageIds: readonly string[],
  viewerId: string,
): Promise<Record<string, ReactionState>> {
  return reactionStatesForMessagesWithClient(supabase, messageIds, viewerId)
}

/**
 * Reconcile a realtime INSERT against the optimistic row the composer already
 * appended (V15 send fix) — a PURE function, unit-testable without a wire.
 *
 * WHY IT EXISTS: the inbox's handleSend appends a placeholder row with a
 * `pending-<timestamp>` id so the bubble shows on the same frame as the tap.
 * The server then echoes the SAME message back through the realtime channel
 * carrying its real uuid — which an id check alone can never match. Without
 * this the thread rendered the message TWICE (the optimistic bubble plus the
 * echo), which the dm e2e caught as a strict-mode violation.
 *
 * Matching is on the placeholder marker plus sender + body: the optimistic
 * row is uniquely identified by the `pending-` prefix and the body it was
 * created with. Returns the messages array with the placeholder REPLACED by
 * the real row, or null when there is nothing to reconcile.
 *
 * AMBIGUOUS NULL — callers MUST NOT append on a null result. A null means
 * EITHER "already present, do not append" OR "nothing to reconcile, append";
 * this function alone cannot tell them apart. The realtime handler stores with
 * `mergeIncomingMessage`, which disambiguates both cases (and is what the V27
 * duplicate-bubble fix added).
 */
export function reconcileOptimisticMessage(
  messages: MessageRow[],
  incoming: MessageRow,
): MessageRow[] | null {
  // Already present by real id — a duplicate delivery, nothing to do.
  if (messages.some((m) => m.id === incoming.id)) return null
  const index = messages.findIndex(
    (m) =>
      m.id.startsWith('pending-') &&
      m.sender_id === incoming.sender_id &&
      m.body === incoming.body,
  )
  if (index === -1) return null
  const next = messages.slice()
  next[index] = incoming
  return next
}

/**
 * Merge a realtime INSERT into the open thread's message list — the PURE seam
 * the realtime handler stores with. Returns the array to store, and the SAME
 * array reference when the incoming row changes nothing (so the caller can
 * skip the render).
 *
 * WHY IT EXISTS (V27 Inbox duplicate-render defect). `reconcileOptimisticMessage`
 * returns `null` for TWO different situations — "the row is already present, do
 * not append" and "nothing to reconcile, the caller should append" — and the
 * realtime handler treated BOTH as append. So when the initial thread read had
 * already fetched a row and the `postgres_changes` INSERT for that same row
 * then arrived (the subscription is registered before the write commits, so the
 * echo is delivered even though the read already saw it), the thread stored the
 * message twice and rendered TWO `other-message` bubbles. The reactions e2e
 * caught it as a Playwright strict-mode violation.
 *
 * THE RULE, in order:
 *   1. the id is ALREADY present → return the array UNCHANGED (a duplicate
 *      delivery, whatever its source: the initial read, a channel resubscribe,
 *      or a double `postgres_changes` echo);
 *   2. a `pending-` placeholder matches this row's sender + body → REPLACE it
 *      in place (our own optimistic send, reconciled to the real id);
 *   3. otherwise → APPEND.
 *
 * Pure: no mutation of the input array, no I/O, no clock. Callers that append
 * MUST go through this function, never through the raw `reconcile` result.
 */
export function mergeIncomingMessage(
  messages: MessageRow[],
  incoming: MessageRow,
): MessageRow[] {
  if (messages.some((m) => m.id === incoming.id)) return messages
  const reconciled = reconcileOptimisticMessage(messages, incoming)
  if (reconciled !== null) return reconciled
  return [...messages, incoming]
}

/**
 * The optimistic SET (V21 t03, generalising V15's toggle) — a PURE function, so
 * the count math is unit-testable without a wire.
 *
 * One reaction per person per message: `kind` is a mutable attribute, never
 * part of the key. So setting a kind either ADDS the viewer's reaction (count +
 * 1), REPLACES it in place when they already have a DIFFERENT kind (count
 * unchanged — changing 👍 to ❤️ must not bump the counter), or REMOVES it when
 * `kind` is null (count - 1). Tapping your CURRENT kind is the remove case: the
 * caller passes `null` for the kind that matches `myKind`.
 *
 *   - no reaction → set kind:      count + 1, mine true, myKind = kind
 *   - different kind → set kind:   count UNCHANGED, mine true, myKind = kind
 *   - any state → remove (null):   count - 1 (floored at 0), mine false, myKind null
 *
 * The decrement is floored at 0: a stale `count` (e.g. a realtime event that
 * already removed someone else's reaction) must never render "-1". The floor is
 * the one place this helper is opinionated, and it is deliberate — a negative
 * counter is a visible lie, a clamped one is merely brief.
 *
 * Unknown messages start from `{ count: 0, mine: false, myKind: null }`, so the
 * first tap on a message whose count never loaded still increments honestly from
 * zero.
 */
export function applyReactionSet(
  states: Readonly<Record<string, ReactionState>>,
  messageId: string,
  kind: ReactionKind | null,
): Record<string, ReactionState> {
  const current = states[messageId] ?? { count: 0, mine: false, myKind: null }
  if (kind === null) {
    // Remove: the viewer's reaction goes away (or was already gone — the floor
    // keeps a stale count honest).
    return {
      ...states,
      [messageId]: { count: Math.max(0, current.count - 1), mine: false, myKind: null },
    }
  }
  if (current.mine && current.myKind === kind) {
    // Already exactly this kind: a no-op (the caller would have passed null to
    // remove, so reaching here means the state already reflects the tap).
    return { ...states, [messageId]: { ...current } }
  }
  if (current.mine) {
    // Replacing a different kind in place: the count does NOT move.
    return { ...states, [messageId]: { count: current.count, mine: true, myKind: kind } }
  }
  // New reaction: the count moves up by one.
  return { ...states, [messageId]: { count: current.count + 1, mine: true, myKind: kind } }
}

/**
 * Backward-compatible alias for the pre-V21 toggle shape (a boolean flip of a
 * single "like" reaction). Kept so existing tests and any straggler call site
 * keep passing; new code calls {@link applyReactionSet}.
 */
export function applyReactionToggle(
  states: Readonly<Record<string, ReactionState>>,
  messageId: string,
  mine: boolean,
): Record<string, ReactionState> {
  if (mine) return applyReactionSet(states, messageId, 'like')
  return applyReactionSet(states, messageId, null)
}

/**
 * The class names the react button wears, decided PURELY (the component just
 * applies them) — the `planPing` split from `src/lib/trust.ts`: a pure
 * decision in `lib/`, execution in the caller.
 *
 * WHY IT EXISTS (V16 ticket 02): a colour-emoji glyph paints its own native
 * yellow and IGNORES the CSS `color` property, so the old `text-slate-500` on
 * the rest state was a dead style and the 👍 stayed fully saturated — the one
 * saturated thing in a row of neutral slate controls, which the founder read
 * as "already selected" (his screenshot carried `aria-pressed="false"`, so the
 * fill was never the problem). The glyph is an inline SVG now, which honours
 * `currentColor`; these strings are the seam a test can assert so the states
 * cannot drift back into looking alike.
 *
 * The resting button stays neutral in BOTH axes — fill AND text colour:
 * `bg-white text-slate-500` with a slate-300 hairline, no saturated value
 * anywhere. The pressed state is the indigo fill that already shipped and is
 * correct. Kept here rather than in the page because "what the rest state is
 * allowed to look like" is the rule under test, not a layout choice.
 */
export function reactionButtonClasses(mine: boolean): string {
  // ⚠️ THIS IS THE DRAWN PILL — 28px tall. The TAP TARGET is its parent button,
  // sized by `reactionHitAreaClasses()` below. The two numbers are deliberately
  // different: measured 2026-10-05 this pill rendered 28px, under the 44px floor
  // `DESIGN.md` sets and `ocr`'s tap-target rule enforces, and growing the pill
  // itself would turn every reaction into a chunky capsule under each bubble.
  // So the BUTTON is 44px and the drawing inside it stays 28px — which also
  // keeps the floor measurable, unlike a pseudo-element hit area, which no
  // `getBoundingClientRect` lane in this repo can see.
  const base =
    'flex h-7 items-center gap-1 rounded-full border px-2 text-xs transition-colors motion-reduce:transition-none '
  return mine
    ? `${base} border-indigo-600 bg-indigo-600 text-white`
    : `${base} border-slate-300 bg-white text-slate-500 hover:border-slate-400`
}

/**
 * The reaction button's own box — the 44px floor, without a drawn edge and
 * WITHOUT MOVING ANYTHING.
 *
 * It pairs with `reactionButtonClasses()`: the button is 44px tall and centres
 * the 28px pill it contains, so a finger gets the floor and the eye gets the
 * quiet row.
 *
 * ⚠️ `-my-2` IS LOAD-BEARING, and the spec that caught it is
 * `e2e/inbox-thread-geometry.e2e.ts`. A plain `h-11` makes the button 44px TALL
 * IN LAYOUT, which adds 16px to every message row — and at 844×390 the thread's
 * scroll region is only ~103px tall, so the concrete consequence was measured
 * immediately: "the newest message, in the thread scroll region at 844×390 must
 * be fully inside" failed, with the bubble 9px above the region's top edge. The
 * negative margin cancels the extra height (44 − 8 − 8 = 28px of layout, the
 * pill's own height), so the row is IDENTICAL to before while the hit area is
 * 44px — the target grows, the layout does not.
 */
export function reactionHitAreaClasses(): string {
  return 'flex h-11 -my-2 items-center'
}

/**
 * The text for the count pill inside the button, or `null` when there is
 * nothing to show. Hidden at 0 so a quiet thread is not littered with "👍 0" —
 * the button always renders (there must be something to tap); only the pill is
 * conditional. Pure, so the "0 renders nothing" rule is assertable without a
 * DOM.
 */
export function reactionCountLabel(count: number): string | null {
  return count > 0 ? String(count) : null
}

/* ===========================================================================
 * V19 t04 — LINKED PARENT ACCOUNTS (migration 0047)
 * ===========================================================================
 *
 * The handshake: `requestAccountLink(handle)` sends, `respondToAccountLink`
 * answers, `unlinkAccounts` ends it. Every read is scoped by RLS to the two
 * parties — a third account receives zero rows, which is asserted live against
 * the real database rather than assumed here.
 *
 * WHY THE WRITES DO NOT USE `.select().single()`: the 2025-09-09 42501 lesson.
 * `account_links` has a SELECT policy, so RETURNING would work here — but the
 * house discipline after that incident is that a write returns no row unless
 * the caller genuinely needs it, so a future policy tightening cannot turn a
 * successful write into an opaque 403. The caller re-reads instead, which is
 * also what makes `requestAccountLink` able to report "already invited".
 */

/** The columns every link read shares. Handles are resolved separately. */
const ACCOUNT_LINK_COLUMNS = 'id, requester_id, addressee_id, status, created_at, responded_at'

/**
 * Every link row this account is part of — and, by RLS, ONLY those.
 *
 * Returns an empty array (never throws) when there is no session: a signed-out
 * visitor has no links by definition, and the profile renders the "link a
 * parent" form rather than an error.
 */
export async function listMyAccountLinksWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<AccountLink[]> {
  const { data, error } = await client
    .from('account_links')
    .select(ACCOUNT_LINK_COLUMNS)
    .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`)
  if (error) throw error
  return (data as unknown as AccountLink[]) ?? []
}

export async function listMyAccountLinks(): Promise<AccountLink[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return []
  return listMyAccountLinksWithClient(supabase, user.id)
}

/**
 * Resolve a display_name (handle) to the profile that owns it, or null.
 *
 * Case-insensitive, matching `normalizeHandle` on the client: a parent typing
 * `@Nicole` must find `nicole`. `ilike` with no wildcards is an exact
 * case-insensitive match in PostgREST.
 *
 * Reads only `id` and `display_name` — the minimum needed to address an
 * invitation. The full profile is not this function's business, and fetching it
 * here would put another account's data in the caller's hands for no reason.
 */
export async function findProfileIdByHandleWithClient(
  client: SupabaseClient,
  handle: string,
): Promise<{ id: string; display_name: string } | null> {
  /**
   * ESCAPE THE ILIKE PATTERN CHARACTERS. `ocr` (low) caught this and it is a
   * real correctness bug, not a style note: `%` and `_` inside a display name
   * are WILDCARDS to ILIKE, so a parent whose handle contains either would
   * match other people. Worse, `profiles_display_name_key` (migration 0004) is
   * CASE-SENSITIVE, so `nicole` and `Nicole` can coexist — and a case-
   * insensitive ILIKE then matches BOTH rows and `.maybeSingle()` throws a raw
   * multi-row error instead of the `LinkTargetUnknownError` this section
   * promises.
   *
   * Escaping `\`, `%` and `_` makes the comparison an exact case-insensitive
   * match, which is what "find the parent with this handle" means.
   */
  const pattern = handle.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  const { data, error } = await client
    .from('profiles')
    .select('id, display_name')
    .ilike('display_name', pattern)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as { id: string; display_name: string } | null) ?? null
}

export async function findProfileIdByHandle(
  handle: string,
): Promise<{ id: string; display_name: string } | null> {
  return findProfileIdByHandleWithClient(supabase, handle)
}

/**
 * Send an invitation to another parent, by handle.
 *
 * Throws `LinkTargetUnknownError` when the handle matches nobody, so the caller
 * can show the "check the spelling" message rather than a generic failure —
 * each rejection being its own message is the point of `links.ts`.
 *
 * A duplicate invite is NOT an error from the caller's point of view: the
 * outcome the parent wanted (an invitation exists) is already true. The unique
 * index answers 409, and this treats that as success rather than reporting a
 * failure for a state the user was trying to reach anyway.
 */
export class LinkTargetUnknownError extends Error {
  constructor(handle: string) {
    super(`No parent has the handle "${handle}".`)
    this.name = 'LinkTargetUnknownError'
  }
}

export async function requestAccountLink(handle: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) throw new Error('Sign in to link a parent.')
  const target = await findProfileIdByHandle(handle)
  if (target === null) throw new LinkTargetUnknownError(handle)
  const { error } = await supabase
    .from('account_links')
    .insert({ requester_id: user.id, addressee_id: target.id, status: 'pending' })
  if (error) {
    // 23505 = the partial unique index on (requester, addressee) where pending.
    // The invitation the parent wanted already exists, so this is not a failure.
    if (error.code === '23505') return
    throw error
  }
}

/**
 * Answer a pending invitation: accept or decline. Only the ADDRESSEE may do
 * this — the RLS UPDATE policy enforces it, so a requester attempting it
 * changes zero rows rather than succeeding silently.
 */
export async function respondToAccountLink(
  linkId: string,
  response: 'accepted' | 'declined',
): Promise<void> {
  const { error } = await supabase
    .from('account_links')
    .update({ status: response, responded_at: new Date().toISOString() })
    .eq('id', linkId)
  if (error) throw error
}

/**
 * Unlink: delete the row outright.
 *
 * A delete rather than a status change, so nothing half-there is left for a
 * later reader to mistake for a live relationship. RLS allows it for either
 * party, and for a requester withdrawing their own still-pending invitation.
 */
export async function unlinkAccounts(linkId: string): Promise<void> {
  const { error } = await supabase.from('account_links').delete().eq('id', linkId)
  if (error) throw error
}

/**
 * The other party's profile, for rendering a linked partner: their handle and
 * their public avatar. Deliberately narrow — a link shows WHO the partner is,
 * not their whole profile, which they already control the visibility of.
 *
 * V27: the partner's DESCRIPTION lives on her own parent card, not on this
 * profile row; `getLinkedPartnerForProfileWithClient` reads that card and returns
 * it as `about`. This read is unchanged from V24 11A — it is not the place for
 * `bio`.
 *
 * Takes the client so it is injectable and testable like every other seam in
 * this section. `ocr` flagged the first version for hard-coding `supabase`,
 * which broke that house pattern and made it the one function here a unit test
 * could not exercise.
 */
export async function getProfileSummaryByIdWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<{ id: string; display_name: string; avatar_url: string | null } | null> {
  const { data, error } = await client
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('id', profileId)
    .maybeSingle()
  if (error) throw error
  return (
    (data as unknown as { id: string; display_name: string; avatar_url: string | null } | null) ??
    null
  )
}

/**
 * V24 slice 11A: THE ACCEPTED PARTNER OF THE PROFILE BEING READ, if the caller's
 * own RLS lets them see one.
 *
 * `listMyAccountLinksWithClient` is anchored on a profile id and asks for the
 * rows involving it; `account_links_select_parties` then filters those rows to
 * the ones the CALLER is a party to. The two together are exactly the question
 * the read surface asks — "does the family I am looking at have an accepted
 * partner I am allowed to know about?":
 *
 *   - the owner's own profile → their accepted link → the partner;
 *   - a partner's view of that profile → the same row → the same partner;
 *   - a third account → ZERO rows → null, and the profile renders plain names.
 *
 * That last line is the whole privacy posture of this seam, and it is the
 * DATABASE's answer, not this function's: there is no widening here, no
 * service-role client, and no second query that could dodge the policy. The
 * handle comes from `getProfileSummaryByIdWithClient`, a narrow read of a
 * profile the caller can already open by that same handle.
 *
 * Never throws on the caller's side of a missing row: a profile with no readable
 * link returns null, which the read surface renders as plain text.
 *
 * V24 slice 11B (finding N2): the work lives in the `*WithClient` variant below,
 * so this seam is unit-testable like every other function in this section. It
 * was the one function here that hard-coded `supabase` — the exact pattern this
 * file fixed a few lines above for `getProfileSummaryByIdWithClient`.
 *
 * V24 slice 11B (finding N3): the returned row carried the HANDLE alone. The
 * counterparty's `profileId` rode along and nothing ever read it, so it was
 * removed as dead data.
 *
 * V27 (the founder's model): the returned row carries the partner's public
 * `avatarUrl` and her own parent card's `about` as well, because the linked row
 * renders the same "picture · name · description" shape as the owner's row and
 * the description must be the PARTNER's words, authored on her own account —
 * never text the owner typed for her. Both are values any signed-in parent can
 * already see on that partner's profile page, so this is not a widening of WHO
 * may see them; and the `parent_cards` read is added only after the accepted
 * link has already answered "this viewer is a party".
 *
 * Returns `about: null` when the partner has no self-card (or none matching her
 * display name): a linked row with no description renders no paragraph.
 */
export async function getLinkedPartnerForProfile(
  profileId: string,
): Promise<{ handle: string; avatarUrl: string | null; about: string | null } | null> {
  return getLinkedPartnerForProfileWithClient(supabase, profileId)
}

/**
 * The injectable half of the seam above: same question, caller's own client.
 *
 * The client is a PARAMETER (the build law), which is what lets its sibling test
 * drive it with a mock and assert the flags it depends on — zero rows, pending
 * only, an accepted row in either direction — without a database.
 */
export async function getLinkedPartnerForProfileWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<{ handle: string; avatarUrl: string | null; about: string | null } | null> {
  const links = await listMyAccountLinksWithClient(client, profileId)
  const counterpartyId = acceptedCounterpartyForProfile(links, profileId)
  if (counterpartyId === null) return null
  const summary = await getProfileSummaryByIdWithClient(client, counterpartyId)
  if (summary === null) return null
  // V27: the description is the partner's OWN self-card `about` (her account's
  // "About me"), not the viewed family's text and not her account blurb.
  const cards = await listParentCardsWithClient(client, counterpartyId)
  const selfCard =
    cards.find((card) => normalizeHandle(card.name) === normalizeHandle(summary.display_name)) ??
    null
  return {
    handle: summary.display_name,
    avatarUrl: summary.avatar_url,
    about: trimToNull(selfCard?.about ?? null),
  }
}

/** Trim a stored string, or null when absent/blank (the `parentCardAboutText` rule). */
function trimToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * The account's link rows, EACH CARRYING THE OTHER PARENT'S HANDLE.
 *
 * `ocr` (medium) caught that the first version left this out entirely: the link
 * section renders `@${view.otherHandle}`, but nothing ever populated a handle,
 * so every state fell back to the neutral placeholder ("your partner", "them")
 * and the four `@…` branches were unreachable. A parent could link an account
 * and never see whose it was — the handshake worked, the confirmation did not.
 *
 * One BATCHED read of the counterparty ids (never one query per row — the same
 * discipline the card hearts follow at 239 rows), keyed into the rows so
 * `linkView` receives what it needs. A counterparty that cannot be read (an RLS
 * edge, or a deleted profile) yields an absent handle and the caller's neutral
 * fallback — the `host_display_name` null-fidelity discipline.
 */
export async function listMyAccountLinksWithHandles(): Promise<LinkRowForView[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return []
  const links = await listMyAccountLinksWithClient(supabase, user.id)
  const otherIds = [
    ...new Set(
      links.map((link) => (link.requester_id === user.id ? link.addressee_id : link.requester_id)),
    ),
  ]
  const handles = new Map<string, string>()
  if (otherIds.length > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', otherIds)
    if (error) throw error
    for (const row of (data as unknown as Array<{ id: string; display_name: string }>) ?? []) {
      handles.set(row.id, row.display_name)
    }
  }
  return links.map((link) => ({
    ...link,
    // The viewer's OWN handle is deliberately null: only the counterparty's
    // matters here, and leaving ours empty makes it impossible to accidentally
    // render our own name as the linked partner.
    requester_handle:
      link.requester_id === user.id ? null : (handles.get(link.requester_id) ?? null),
    addressee_handle:
      link.addressee_id === user.id ? null : (handles.get(link.addressee_id) ?? null),
  }))
}

/* ===========================================================================
 * V19 t05 — PARENT CARDS (migration 0047)
 * ===========================================================================
 *
 * Up to two parent cards per account, each with a name, a private-bucket photo,
 * and some words. The DATABASE enforces the cap (CHECK position 1..2 plus a
 * unique index on (profile_id, position)), so these writers do not need to race
 * each other politely — a third card is refused however it is attempted.
 */

/** A card's columns, shared by every read. */
const PARENT_CARD_COLUMNS = 'id, profile_id, name, photo_url, about, position, created_at'

/** Every card for one account, in render order. Empty when there are none. */
export async function listParentCardsWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<ParentCard[]> {
  const { data, error } = await client
    .from('parent_cards')
    .select(PARENT_CARD_COLUMNS)
    .eq('profile_id', profileId)
    .order('position', { ascending: true })
  if (error) throw error
  return (data as unknown as ParentCard[]) ?? []
}

export async function listParentCards(profileId: string): Promise<ParentCard[]> {
  return listParentCardsWithClient(supabase, profileId)
}

/**
 * Create or update the card in one SLOT.
 *
 * Upsert on `(profile_id, position)` rather than insert-or-update decided in
 * the client: the unique index makes the conflict unambiguous, so one statement
 * covers both the first write and every later edit, and two rapid saves cannot
 * race into a duplicate.
 */
export async function saveParentCard(input: {
  profileId: string
  position: number
  name: string
  about: string | null
}): Promise<void> {
  const { error } = await supabase.from('parent_cards').upsert(
    {
      profile_id: input.profileId,
      position: input.position,
      name: input.name,
      about: input.about,
    },
    { onConflict: 'profile_id,position' },
  )
  if (error) throw error
}

/** Set (or clear) one card's photo path. Separate from `saveParentCard` so a
 * photo upload never rewrites the text and vice versa. */
export async function setParentCardPhoto(
  profileId: string,
  position: number,
  photoPath: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('parent_cards')
    .update({ photo_url: photoPath })
    .eq('profile_id', profileId)
    .eq('position', position)
  if (error) throw error
}

/** Remove a card from a slot entirely. */
export async function deleteParentCard(profileId: string, position: number): Promise<void> {
  const { error } = await supabase
    .from('parent_cards')
    .delete()
    .eq('profile_id', profileId)
    .eq('position', position)
  if (error) throw error
}

/* ===========================================================================
 * V21 t07 — INVITE A PARENT BY NAME (name-prefix autocomplete)
 * ===========================================================================
 *
 * The founder's ask: parents do not know each other's @handles, they know
 * names — "as they're typing in the name it should populate whatever users
 * are in the database so it gets close and they can select one." So the
 * Linked-parent section on /profile gains a NAME search beside the existing
 * @handle field; selecting a row starts the EXISTING invite flow
 * (`requestAccountLink`), never a second write path.
 *
 * PRIVACY POSTURE (pinned rails, documented here because this is a new
 * enumeration surface):
 *   - SIGNED-IN ONLY. The read rides `profiles_select_authenticated`
 *     (migration 0001: SELECT to `authenticated`, using (true)) — profiles are
 *     visible to signed-in parents by design, so a bounded client-side query
 *     widens nothing. There is NO anon policy on `profiles` (0015 states it
 *     explicitly), so a signed-out caller reads zero rows: the RLS posture
 *     already refuses anon, no new policy is needed and none was added.
 *   - PREFIX MATCH, not substring. "As they're typing the name" means the
 *     typed text is the START of the name; `ilike 'prefix%'` narrows exposure
 *     versus the inbox DM search's `%term%` (searchProfilesWithClient above).
 *   - CAPPED at 8 results, enforced CLIENT-SIDE (the `.limit()` below) even
 *     when the caller asks for more: the cap is a product rail, not a hint.
 *   - RETURNED SHAPE IS `{ display_name, handle }` ONLY. No id, no email, no
 *     zip, no bio. `display_name` here IS the composed real name ("Sam
 *     Rivera", V20 signup composes first + last into the handle column), so
 *     one field carries both the name and the handle the invite flow needs.
 *     Nothing else crosses the wire.
 */

/** One autocomplete row: the parent's name (their display_name) + handle. */
export interface ParentNameMatch {
  /** The parent's display_name — since V20 this is their real name, composed. */
  display_name: string
  /** The same value as the public handle the invite flow addresses. */
  handle: string
}

/** The hard cap on autocomplete results (the pinned privacy rail). */
export const PARENT_NAME_SEARCH_MAX_RESULTS = 8

/** Queries shorter than this never reach the database. */
export const PARENT_NAME_SEARCH_MIN_QUERY_LENGTH = 2

/** Escape ILIKE pattern characters so a typed `%` or `_` is literal. */
function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * Decide whether a name-search query may hit the database, and what its
 * effective length cap is. Pure, so the rails are unit-testable without a
 * socket: short or blank queries return null (NO request fires), valid ones
 * return the capped limit.
 */
export function planParentNameSearch(
  query: string,
  requestedLimit: number,
): { prefix: string; limit: number } | null {
  const trimmed = query.trim()
  if (trimmed.length < PARENT_NAME_SEARCH_MIN_QUERY_LENGTH) return null
  // Cap the caller's requested limit at the pinned rail: asking for 50 still
  // returns at most 8. A non-positive/nonsense requested limit falls back to
  // the cap rather than querying with no limit at all.
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : Infinity
  return { prefix: trimmed, limit: Math.min(limit, PARENT_NAME_SEARCH_MAX_RESULTS) }
}

/**
 * Search parents by name prefix, against an injected client (mockable in unit
 * tests). Returns AT MOST `PARENT_NAME_SEARCH_MAX_RESULTS` rows, each carrying
 * ONLY `display_name` + `handle`.
 *
 * A query under two characters (or empty/whitespace-only) returns `[]` WITHOUT
 * issuing any request — the rails live in `planParentNameSearch`, asserted in
 * the sibling test.
 */
export async function searchProfilesByNameWithClient(
  client: SupabaseClient,
  query: string,
  limit: number = PARENT_NAME_SEARCH_MAX_RESULTS,
): Promise<ParentNameMatch[]> {
  const plan = planParentNameSearch(query, limit)
  if (plan === null) return []
  const { data, error } = await client
    .from('profiles')
    .select('display_name')
    .ilike('display_name', `${escapeIlikePattern(plan.prefix)}%`)
    .order('display_name', { ascending: true })
    .limit(plan.limit)
  if (error) throw error
  return ((data ?? []) as unknown as Array<{ display_name: string }>).map((row) => ({
    display_name: row.display_name,
    handle: row.display_name,
  }))
}

/** The default-client wrapper (the /profile Linked-parent name search). */
export async function searchProfilesByName(
  query: string,
  limit: number = PARENT_NAME_SEARCH_MAX_RESULTS,
): Promise<ParentNameMatch[]> {
  return searchProfilesByNameWithClient(supabase, query, limit)
}

// ---------------------------------------------------------------------------
// V23 slice 5: PLACE COMMENTS (migration 0050).
//
// A place comment is what a parent says about a PARK, as opposed to `comments`
// (0013), which is playdate-scoped — see 0050's header for why those are
// different tables. These are the app's read/write paths on top of it; the RLS
// policies in 0050 are the enforcement (any signed-in parent reads the visible
// wall, writes only as themselves, moderators hide). Pre-0050-apply every call
// here 404s (PGRST205, missing table) and the caller catches it: the details
// page shows an honest "not available yet" line rather than a crash — the house
// DB-not-applied discipline.
// ---------------------------------------------------------------------------

/** One row of `public.place_comments`, as the details page renders it. */
export interface PlaceCommentRow {
  id: string
  place_id: string
  author_profile_id: string
  /** The author's display name, embedded for the wall's attribution line. */
  author_display_name: string
  body: string
  created_at: string
}

/**
 * The visible wall for one place, NEWEST FIRST (the order `sortPlaceComments`
 * pins — a park's wall is a bulletin read from its top, not a conversation read
 * from its beginning).
 *
 * The `hidden_at is null` filter is enforced by 0050's SELECT policy; it is
 * repeated here only so the intent is legible at the call site, NOT as the
 * security boundary — a client-side filter is never the boundary. The author
 * name comes from the embedded FK join (the messages pattern), so the wall needs
 * ONE request rather than one per comment.
 */
export async function listPlaceCommentsWithClient(
  client: SupabaseClient,
  placeId: string,
): Promise<PlaceCommentRow[]> {
  const { data, error } = await client
    .from('place_comments')
    .select(
      'id, place_id, author_profile_id, body, created_at, ' +
        'author:profiles!place_comments_author_profile_id_fkey ( display_name )',
    )
    .eq('place_id', placeId)
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as Array<{
    id: string
    place_id: string
    author_profile_id: string
    body: string
    created_at: string
    author: { display_name: string } | null
  }>).map((row) => ({
    id: row.id,
    place_id: row.place_id,
    author_profile_id: row.author_profile_id,
    author_display_name: row.author?.display_name ?? '',
    body: row.body,
    created_at: row.created_at,
  }))
}

/** The default-client wrapper (the details page's wall read). */
export async function listPlaceComments(placeId: string): Promise<PlaceCommentRow[]> {
  return listPlaceCommentsWithClient(supabase, placeId)
}

/**
 * Post one comment on a place as the signed-in user.
 *
 * The body is TRIMMED before the insert (the DB CHECK measures the trimmed
 * length, so sending untrimmed padding would make the client's own count
 * disagree with the wall). `author_profile_id` is set from the session rather
 * than accepted from a caller — 0050's INSERT policy requires
 * `author_profile_id = auth.uid()`, so a caller-supplied id could only ever be
 * rejected.
 */
export async function createPlaceCommentWithClient(
  client: SupabaseClient,
  userId: string,
  placeId: string,
  body: string,
): Promise<PlaceCommentRow> {
  const { data, error } = await client
    .from('place_comments')
    .insert({
      place_id: placeId,
      author_profile_id: userId,
      body: body.trim(),
    })
    .select(
      'id, place_id, author_profile_id, body, created_at, ' +
        'author:profiles!place_comments_author_profile_id_fkey ( display_name )',
    )
    .single()
  if (error) throw error
  const row = data as unknown as {
    id: string
    place_id: string
    author_profile_id: string
    body: string
    created_at: string
    author: { display_name: string } | null
  }
  return {
    id: row.id,
    place_id: row.place_id,
    author_profile_id: row.author_profile_id,
    author_display_name: row.author?.display_name ?? '',
    body: row.body,
    created_at: row.created_at,
  }
}

/** The default-client wrapper (the details page's composer). */
export async function createPlaceComment(
  placeId: string,
  body: string,
): Promise<PlaceCommentRow> {
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user) throw new Error('No authenticated user — cannot post a comment.')
  return createPlaceCommentWithClient(supabase, user.id, placeId, body)
}

// ---------------------------------------------------------------------------
// V24 ticket 06: REVIEWS (migration 0052).
//
// A review is ONE row per (place, parent) — the composite primary key makes a
// second INSERT fail in the database. So the form LOADS the existing review
// (if any) into the control and UPDATES on save rather than blind-INSERTing.
// The write shape chosen here is an UPSERT with onConflict on the composite PK
// (`place_id, author_profile_id`), mirroring the saveParentCard pattern: one
// statement covers both the first write and every later edit, and two rapid
// saves cannot race into a duplicate. The RLS policies in 0052 are the
// enforcement (writes only as yourself); pre-0052-apply every call here 404s
// and the caller catches it, the house DB-not-applied discipline.
// ---------------------------------------------------------------------------

/** One row of `public.reviews`, as the form loads/saves it. */
export interface ReviewRow {
  place_id: string
  author_profile_id: string
  score: number
  /** Optional comment; null means a stars-only review. */
  body: string | null
  created_at: string
  updated_at: string
}

/**
 * Load the signed-in parent's own review for one place (null when they have
 * not reviewed it yet). The SELECT policy (0052 pin f) lets any signed-in
 * parent read every review, so this reads ALL rows for the place and filters
 * to the caller's own — the same "read then narrow" posture the wall uses.
 *
 * Returns null (not []) when there is no row: the form keys off a single
 * existing review, and [] would make the caller write `rows[0] ?? null`.
 */
export async function getMyReviewWithClient(
  client: SupabaseClient,
  profileId: string,
  placeId: string,
): Promise<ReviewRow | null> {
  const { data, error } = await client
    .from('reviews')
    .select('place_id, author_profile_id, score, body, created_at, updated_at')
    .eq('place_id', placeId)
    .eq('author_profile_id', profileId)
    .limit(1)
  if (error) throw error
  const rows = (data ?? []) as unknown as Array<{
    place_id: string
    author_profile_id: string
    score: number
    body: string | null
    created_at: string
    updated_at: string
  }>
  if (rows.length === 0) return null
  const row = rows[0]
  return {
    place_id: row.place_id,
    author_profile_id: row.author_profile_id,
    score: row.score,
    body: row.body,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** The default-client wrapper (resolves the auth user, then delegates). */
export async function getMyReview(placeId: string): Promise<ReviewRow | null> {
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user) throw new Error('No authenticated user — cannot load a review.')
  return getMyReviewWithClient(supabase, user.id, placeId)
}

/**
 * Create or replace the signed-in parent's review for one place.
 *
 * Upsert on the composite PK (the saveParentCard pattern): the unique key
 * makes the conflict unambiguous, so one statement covers the first write AND
 * every later edit. A blank body is stored as NULL (a stars-only review is
 * legal — 0052 pin c), matching the client-side trim-then-measure discipline
 * the validators use. `updated_at` is stamped client-side because 0052 ships
 * no trigger (pin g records the lesson; a trigger is its own migration).
 */
export async function saveReviewWithClient(
  client: SupabaseClient,
  profileId: string,
  placeId: string,
  score: number,
  body: string | null,
): Promise<void> {
  const trimmed = body === null ? null : body.trim()
  const { error } = await client
    .from('reviews')
    .upsert(
      {
        place_id: placeId,
        author_profile_id: profileId,
        score,
        body: trimmed === '' || trimmed === null ? null : trimmed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'place_id,author_profile_id' },
    )
  if (error) throw error
}

/** The default-client wrapper (resolves the auth user, then delegates). */
export async function saveReview(
  placeId: string,
  score: number,
  body: string | null,
): Promise<void> {
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user) throw new Error('No authenticated user — cannot save a review.')
  return saveReviewWithClient(supabase, user.id, placeId, score, body)
}

// ---------------------------------------------------------------------------
// V24 ticket 06: THE AGGREGATE RATING READ (the details page's rating line).
//
// The aggregate is computed IN THE DATABASE by 0052's `review_summary(uuid)`
// SECURITY DEFINER function — count(*) plus round(avg(score)::numeric, 1),
// NULL when unrated. It is granted to `authenticated` only, so this read runs
// from inside the ProtectedShell like every other call on the page. The
// client NEVER fetches all review rows and averages them in the browser: one
// RPC returns the final numbers, and the display formatting lives in
// reviews.reviewRatingLine (a pure rule with its sibling test).
// ---------------------------------------------------------------------------

/** What the `review_summary` RPC returns for one place. */
export interface ReviewSummaryRow {
  /** How many parents have reviewed this place. */
  review_count: number
  /**
   * The average rounded to one decimal, or null when there are no reviews
   * (the honest zero case — never a 0.0 that would read as "terrible").
   * Postgres numeric arrives as a string over the wire; Number() recovers it.
   */
  display_average: number | null
}

/**
 * One place's aggregate rating, against an injected client (the house
 * pattern — mockable). A failed RPC THROWS: the caller swallows it into
 * "no rating line" rather than rendering a 0.0 or an error card (a failed
 * read must never read as "this place is bad").
 *
 * ⚠️ THE ROW ARRIVES IN AN ARRAY, AND READING IT OFF `data` IS A FIX, NOT A
 * STYLE CHOICE (reviews-inline slice, 2026-10-06). `review_summary` is declared
 * `returns table (review_count int, display_average numeric)` — a SET-returning
 * function — and PostgREST answers one of those with an array of rows even when
 * there is exactly one:
 *
 *     POST /rest/v1/rpc/review_summary {"p_place_id": "…"} →
 *     [{"review_count":1,"display_average":5}]
 *
 * This function used to read `data.review_count` / `data.display_average`
 * directly, so both were `undefined`, `?? 0` turned the count into a
 * convincing zero and the average stayed null — the HONEST-LOOKING ZERO CASE.
 * Every rating line in the app therefore said "Be the first to rate …" for a
 * place with reviews: measured on the place page's new inline block, and the
 * same defect was live on `/place/:id/details` and the browse directory's
 * cards, invisible because almost no seeded place carries a review and no spec
 * ever asserted a rated line. The array form is what this call actually
 * receives; the object form is accepted too so a future PostgREST that unwraps
 * a single row cannot silently break it again.
 */
export async function getReviewSummaryWithClient(
  client: SupabaseClient,
  placeId: string,
): Promise<ReviewSummaryRow> {
  const { data, error } = await client.rpc('review_summary', { p_place_id: placeId })
  if (error) throw error
  const row = ((Array.isArray(data) ? data[0] : data) ?? {}) as unknown as {
    review_count?: number | string | null
    display_average?: number | string | null
  }
  const count = typeof row.review_count === 'number' ? row.review_count : Number(row.review_count ?? 0)
  // The RPC's numeric-as-string ("4.3") or null; Number(null) is 0, so guard
  // the null explicitly — a null average is the unrated signal, not a 0.
  const average =
    row.display_average === null || row.display_average === undefined
      ? null
      : Number(row.display_average)
  return { review_count: count, display_average: average }
}

/** The default-client wrapper (the details page's rating line read). */
export async function getReviewSummary(placeId: string): Promise<ReviewSummaryRow> {
  return getReviewSummaryWithClient(supabase, placeId)
}

// ---------------------------------------------------------------------------
// The reviews-inline slice: THE PLACE PAGE'S OWN REVIEW READ.
//
// The founder's ask on /place/:id — *"wouldn't you see what parents say about
// this place and they're rating right here?"* — needs the ROWS, not only the
// aggregate: the inline block shows a few bodies with their author. This is the
// same read the review wall is built on, against an injected client (the house
// pattern — mockable), ordered exactly as the browse directory's highlight read
// orders (`created_at` descending), so the inline projection and the wall cannot
// disagree about which review came first.
//
// 0052's SELECT policy lets any signed-in parent read every review for a place,
// so this runs from inside the ProtectedShell like every other call here. The
// author's name arrives through the FK-embedded `profiles` row — the same
// PostgREST embed `listPlaceReviewHighlightsWithClient` uses, so there is no
// second join shape to drift.
// ---------------------------------------------------------------------------

/**
 * Every review for one place, newest first, with the author's display name.
 *
 * A failed read THROWS: the caller swallows it into "no inline block rows"
 * rather than rendering the empty state, because a failed read is not the
 * claim "nobody has reviewed this place" (the house no-false-zero rule).
 */
export async function listPlaceReviewsWithClient(
  client: SupabaseClient,
  placeId: string,
): Promise<ReviewWithAuthor[]> {
  const { data, error } = await client
    .from('reviews')
    .select(
      'place_id, author_profile_id, score, body, created_at, ' +
        'author:profiles!reviews_author_profile_id_fkey ( display_name )',
    )
    .eq('place_id', placeId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const rows = (data ?? []) as unknown as Array<{
    place_id: string
    author_profile_id: string
    score: number
    body: string | null
    created_at: string
    author: { display_name: string } | null
  }>
  return rows.map((row) => ({
    placeId: row.place_id,
    authorProfileId: row.author_profile_id,
    score: row.score,
    body: row.body,
    createdAt: row.created_at,
    authorDisplayName: row.author?.display_name ?? '',
  }))
}

/** The default-client wrapper (the place page's inline review block). */
export async function listPlaceReviews(placeId: string): Promise<ReviewWithAuthor[]> {
  return listPlaceReviewsWithClient(supabase, placeId)
}

// ---------------------------------------------------------------------------
// V24 slice: THE BULK RATING READ (the browse directory's "Top rated" sort +
// the per-card rating line).
//
// The directory lists a few hundred places; one RPC PER CARD would be the
// expensive way to be wrong (the same rule that made upcomingCountsByPlace
// ONE read of the whole upcoming set rather than a count per place). The
// `review_summary` RPC is per-place (0052), so this helper loops it for every
// id in ONE logical read step — the caller hydrates a Map and passes it into
// the pure seams (browsePlaces / planDirectoryList), exactly like the
// `upcoming` counts. A FAILED read THROWS: the caller swallows it into
// "no ratings at all" (every card shows nothing, never a 0.0).
// ---------------------------------------------------------------------------

/**
 * Aggregate ratings for EVERY place in `placeIds`, against an injected client
 * (the house pattern — mockable). Returns a Map keyed by place id; ids whose
 * individual RPC failed are ABSENT from the map (the caller treats absence as
 * "unknown", rendering nothing — never a 0.0). An empty input yields an empty
 * map without touching the wire.
 */
export async function getReviewSummariesWithClient(
  client: SupabaseClient,
  placeIds: readonly string[],
): Promise<Map<string, ReviewSummaryRow>> {
  const summaries = new Map<string, ReviewSummaryRow>()
  if (placeIds.length === 0) return summaries
  await Promise.all(
    placeIds.map(async (placeId) => {
      try {
        summaries.set(placeId, await getReviewSummaryWithClient(client, placeId))
      } catch {
        // One place's failed RPC must not sink the whole list: absent from the
        // map = unknown, rendered as nothing (never a 0.0).
      }
    }),
  )
  return summaries
}

/** The default-client wrapper (the browse directory's bulk rating read). */
export async function getReviewSummaries(
  placeIds: readonly string[],
): Promise<Map<string, ReviewSummaryRow>> {
  return getReviewSummariesWithClient(supabase, placeIds)
}

// ---------------------------------------------------------------------------
// V27: BLOCKED-FAMILIES MANAGEMENT + ACCOUNT LIFECYCLE.
//
// The `blocks` table (0006) has always held the caller's own rows, and the
// feed/profile paths already honor them; what was missing was a place to SEE and
// undo a block without finding the family's profile again. The two reads below
// are the caller's own rows (owner RLS), named through one batched profiles
// read — the same shape as listMyFollowing.
//
// Account lifecycle is the parent-facing half of leaving: export the rows the
// account owns, and delete the account through one SECURITY DEFINER RPC
// (0056) so the auth row and its cascades go together. Neither path is called
// on mount — a settings visit must never trigger a destructive or expensive
// read.
// ---------------------------------------------------------------------------

/** One family this parent has blocked, as the /settings list renders it. */
export interface BlockedFamily {
  profileId: string
  /** display_name, or null when the profile row is gone (keep the row so the
   *  unblock control still exists rather than silently dropping it). */
  displayName: string | null
  avatarUrl: string | null
}

/**
 * The caller's own blocks, named. Owner-only RLS means this returns only rows
 * where the caller is the blocker; the profiles read is the same authenticated
 * read every @handle surface uses.
 */
export async function listMyBlocksWithClient(
  client: SupabaseClient,
  profileId: string,
): Promise<BlockedFamily[]> {
  const { data, error } = await client
    .from('blocks')
    .select('blocked_profile_id')
    .eq('blocker_profile_id', profileId)
  if (error) throw error

  const ids = [...new Set((data ?? []).map((row) => row.blocked_profile_id as string))]
  if (ids.length === 0) return []

  const byId = new Map<string, { displayName: string | null; avatarUrl: string | null }>()
  const { data: profiles, error: profileError } = await client
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', ids)
  if (profileError) throw profileError
  for (const row of (profiles ?? []) as unknown as Array<{
    id: string
    display_name: string | null
    avatar_url: string | null
  }>) {
    byId.set(row.id, { displayName: row.display_name ?? null, avatarUrl: row.avatar_url ?? null })
  }

  return ids.map((id) => ({
    profileId: id,
    displayName: byId.get(id)?.displayName ?? null,
    avatarUrl: byId.get(id)?.avatarUrl ?? null,
  }))
}

/** The default-client wrapper (/settings' blocked-families list). */
export async function listMyBlocks(): Promise<BlockedFamily[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) return []
  return listMyBlocksWithClient(supabase, user.id)
}

/** Remove one block row (the pair, so the caller's own row only). */
export async function unblockProfileWithClient(
  client: SupabaseClient,
  blockerProfileId: string,
  blockedProfileId: string,
): Promise<void> {
  const { error } = await client
    .from('blocks')
    .delete()
    .eq('blocker_profile_id', blockerProfileId)
    .eq('blocked_profile_id', blockedProfileId)
  if (error) throw error
}

/** The default-client wrapper. */
export async function unblockProfile(blockedProfileId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) throw new Error('No authenticated user — cannot unblock a profile.')
  return unblockProfileWithClient(supabase, user.id, blockedProfileId)
}

/** The account's own rows, in one downloadable object. Deliberately flat and
 *  readable: a parent's data, not our schema dump. */
export interface AccountExport {
  exported_at: string
  profile: unknown
  kids: unknown[]
  hosted_playdates: unknown[]
  going: unknown[]
  follows: unknown[]
  blocks: unknown[]
  comments: unknown[]
  reviews: unknown[]
}

/**
 * Read every row the account owns, table by table, against an injected client.
 * A failed read THROWS (a partial export silently missing a table would be a
 * lie about "your data"); `exported_at` is a parameter so the test lane can pin
 * the timestamp instead of racing the clock.
 */
export async function exportMyDataWithClient(
  client: SupabaseClient,
  profileId: string,
  exportedAt: string,
): Promise<AccountExport> {
  const kids = await client.from('kids').select('*').eq('profile_id', profileId)
  if (kids.error) throw kids.error
  const playdates = await client.from('playdates').select('*').eq('host_profile_id', profileId)
  if (playdates.error) throw playdates.error
  const going = await client.from('going_pings').select('*').eq('profile_id', profileId)
  if (going.error) throw going.error
  const follows = await client.from('follows').select('*').eq('follower_profile_id', profileId)
  if (follows.error) throw follows.error
  const blocks = await client.from('blocks').select('*').eq('blocker_profile_id', profileId)
  if (blocks.error) throw blocks.error
  const comments = await client.from('comments').select('*').eq('author_profile_id', profileId)
  if (comments.error) throw comments.error
  const reviews = await client.from('reviews').select('*').eq('author_profile_id', profileId)
  if (reviews.error) throw reviews.error
  const profile = await client.from('profiles').select('*').eq('id', profileId).maybeSingle()
  if (profile.error) throw profile.error

  return {
    exported_at: exportedAt,
    profile: profile.data ?? null,
    kids: (kids.data ?? []) as unknown[],
    hosted_playdates: (playdates.data ?? []) as unknown[],
    going: (going.data ?? []) as unknown[],
    follows: (follows.data ?? []) as unknown[],
    blocks: (blocks.data ?? []) as unknown[],
    comments: (comments.data ?? []) as unknown[],
    reviews: (reviews.data ?? []) as unknown[],
  }
}

/** The default-client wrapper. */
export async function exportMyData(): Promise<AccountExport> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user === null) throw new Error('No authenticated user — cannot export data.')
  return exportMyDataWithClient(supabase, user.id, new Date().toISOString())
}

/**
 * Delete the signed-in account. One RPC (migration 0056) deletes the
 * `auth.users` row; every table that references `profiles` cascades from there,
 * so the account leaves no orphaned rows. The migration is additive and the app
 * renders an honest failure sentence until it is applied.
 */
export async function deleteMyAccountWithClient(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('delete_my_account')
  if (error) throw error
}

/** The default-client wrapper. */
export async function deleteMyAccount(): Promise<void> {
  return deleteMyAccountWithClient(supabase)
}

// V27 — THE BROWSE CARD'S SOCIAL PROOF (the founder's top priority for the
// places page: "do other parents rave about it? … good things in the
// comments").
//
// Two BULK reads for the whole directory, never one per card — the same rule
// that made `getReviewSummaries` loop the per-place RPC in one logical step.
// Both are best-effort at the call site: a failure yields an empty map, so a
// card shows no quote / no activity line rather than an error.
// ---------------------------------------------------------------------------

/**
 * The newest review WITH A BODY for each of `placeIds`, against an injected
 * client (the house pattern — mockable). One read of every review that has text
 * for the whole set, ordered newest-first; the first row per place wins.
 *
 * A stars-only review (body null/empty) is deliberately NOT a highlight: a card
 * has no room for "no comment", and the rating line already carries the score.
 * Ids with no textual review are simply ABSENT from the map.
 */
export async function listPlaceReviewHighlightsWithClient(
  client: SupabaseClient,
  placeIds: readonly string[],
): Promise<Map<string, PlaceReviewHighlight>> {
  const highlights = new Map<string, PlaceReviewHighlight>()
  if (placeIds.length === 0) return highlights
  const { data, error } = await client
    .from('reviews')
    .select(
      'place_id, score, body, created_at, ' +
        'author:profiles!reviews_author_profile_id_fkey ( display_name )',
    )
    .in('place_id', [...placeIds])
    .not('body', 'is', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  const rows = (data ?? []) as unknown as Array<{
    place_id: string
    score: number
    body: string | null
    created_at: string
    author: { display_name: string } | null
  }>
  for (const row of rows) {
    if (highlights.has(row.place_id)) continue // newest-first: first wins
    const body = (row.body ?? '').trim()
    if (body === '') continue
    highlights.set(row.place_id, {
      score: row.score,
      body,
      authorDisplayName: row.author?.display_name ?? '',
      createdAt: row.created_at,
    })
  }
  return highlights
}

/** The default-client wrapper (the browse directory's review-quote read). */
export async function listPlaceReviewHighlights(
  placeIds: readonly string[],
): Promise<Map<string, PlaceReviewHighlight>> {
  return listPlaceReviewHighlightsWithClient(supabase, placeIds)
}

/**
 * Past-drop-in activity per place, against an injected client. Reads the whole
 * (small) `playdates` set with a place and aggregates it through the pure
 * `dropInProofsFromRows` — so "hosted" means what `placeSocial.ts` says it
 * means, not what a hand-rolled query says. A cancelled or not-yet-ended
 * drop-in never counts.
 */
export async function listPlaceDropInProofsWithClient(
  client: SupabaseClient,
  nowIso: string,
): Promise<Map<string, PlaceDropInProof>> {
  const { data, error } = await client
    .from('playdates')
    .select('place_id, ends_at, status')
    .not('place_id', 'is', null)
  if (error) throw error
  return dropInProofsFromRows((data ?? []) as unknown as PlaceDropInRow[], nowIso)
}

/** The default-client wrapper (the browse directory's activity read). */
export async function listPlaceDropInProofs(nowIso: string): Promise<Map<string, PlaceDropInProof>> {
  return listPlaceDropInProofsWithClient(supabase, nowIso)
}
