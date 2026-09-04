import { LOGIN_PATH, resolveAuthRedirect } from './auth'

/**
 * Pure, unit-testable onboarding-gating logic (slice 2).
 *
 * A signed-in user with 0 neighborhood memberships must finish onboarding
 * (pick ≥1 neighborhood) before any protected route renders. Decisions live
 * here so they can be tested without React/browser (see onboarding.test.ts).
 */

/** Pinned route path for the post-signup neighborhood picker. */
export const ONBOARDING_PATH = '/onboarding'

/** Home (today's feed) — where a completed onboarding sends the user. */
export const HOME_PATH = '/'

/** A signed-in user needs onboarding exactly when they have 0 memberships. */
export function needsOnboarding(hasMemberships: boolean): boolean {
  return !hasMemberships
}

/**
 * Where a protected route should send a user. Always returns a string —
 * the intended path itself when the route may render as-is.
 *
 * - signed out → /login (delegates to resolveAuthRedirect; not duplicated)
 * - signed in + 0 memberships → /onboarding
 * - signed in + ≥1 memberships → intendedPath
 */
export function resolveProtectedRedirect(
  signedIn: boolean,
  hasMemberships: boolean,
  intendedPath: string,
): string {
  const authRedirect = resolveAuthRedirect(intendedPath, signedIn)
  if (authRedirect !== null) return authRedirect
  if (needsOnboarding(hasMemberships)) return ONBOARDING_PATH
  return intendedPath
}

/**
 * Where the /onboarding route itself should send a user, or null when
 * onboarding may render as-is.
 *
 * - signed out → /login
 * - signed in + ≥1 memberships → / (onboarding already done)
 * - signed in + 0 memberships → null (show the neighborhood picker)
 */
export function resolveOnboardingRedirect(
  signedIn: boolean,
  hasMemberships: boolean,
): string | null {
  if (!signedIn) return LOGIN_PATH
  if (!needsOnboarding(hasMemberships)) return HOME_PATH
  return null
}