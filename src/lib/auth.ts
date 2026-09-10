import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Pure, unit-testable auth-redirect logic.
 *
 * Keeps the "who may see what" decision free of React/browser so it can be
 * tested with a mocked supabase client (see auth.test.ts).
 */

export const LOGIN_PATH = '/login'

/**
 * A signed-out visitor may view ONE drop-in's public surface (V2 slice 5,
 * ticket 05): /playdate/:id is the only public app route (the post's
 * content, nothing more — the /u/:handle and comments routes stay
 * auth-walled, the profiles table has no anon policy).
 */
export function isPublicDetailPath(pathname: string): boolean {
  return /^\/playdate\/[^/]+\/?$/.test(pathname)
}

/**
 * Decide where the given pathname should send a user, or null if the route
 * may render as-is.
 *
 * - signed in: allow everything, except bounce signed-in users off /login to /
 * - signed out: allow the public auth page + one drop-in's public surface
 *   (V2 slice 5), everything else → /login
 */
export function resolveAuthRedirect(pathname: string, signedIn: boolean): string | null {
  if (signedIn) {
    return pathname === LOGIN_PATH ? '/' : null
  }
  if (pathname === LOGIN_PATH) return null
  if (isPublicDetailPath(pathname)) return null
  return LOGIN_PATH
}

/**
 * Whether the given supabase client currently holds an active session.
 * Takes the client as a parameter so tests can pass a mock.
 */
export async function hasActiveSession(client: SupabaseClient): Promise<boolean> {
  const { data } = await client.auth.getSession()
  return data.session !== null
}