import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from './types'

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
}

/**
 * Reactive session state, driven by supabase.auth.onAuthStateChange.
 * Use `loading` to avoid redirecting signed-in users before their
 * persisted session is restored.
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ session: null, loading: true })

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setState({ session: data.session, loading: false })
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setState({ session, loading: false })
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return state
}

export async function signOutUser(): Promise<void> {
  await supabase.auth.signOut()
}

/**
 * Insert the caller's profiles row (id = auth user id).
 * Idempotent: if the row already exists, returns it.
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

  // 23505 = unique_violation (profile already exists) → fetch the existing row.
  if (error && error.code !== '23505') throw error
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
  return data as Profile | null
}