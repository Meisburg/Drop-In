import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import type {
  MembershipWithNeighborhood,
  Neighborhood,
  Profile,
} from './types'

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