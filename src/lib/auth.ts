import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Pure, unit-testable auth-redirect logic.
 *
 * Keeps the "who may see what" decision free of React/browser so it can be
 * tested with a mocked supabase client (see auth.test.ts).
 */

export const LOGIN_PATH = '/login'

/**
 * Decide where the given pathname should send a user, or null if the route
 * may render as-is.
 *
 * - signed in: allow everything, except bounce signed-in users off /login to /
 * - signed out: allow only the public auth page, everything else → /login
 */
export function resolveAuthRedirect(pathname: string, signedIn: boolean): string | null {
  if (signedIn) {
    return pathname === LOGIN_PATH ? '/' : null
  }
  return pathname === LOGIN_PATH ? null : LOGIN_PATH
}

/**
 * Whether the given supabase client currently holds an active session.
 * Takes the client as a parameter so tests can pass a mock.
 */
export async function hasActiveSession(client: SupabaseClient): Promise<boolean> {
  const { data } = await client.auth.getSession()
  return data.session !== null
}