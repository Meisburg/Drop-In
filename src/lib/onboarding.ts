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

/** The app-shell's onboarding-gate decision (ticket 06: wait for the loads). */
export type OnboardingGateDecision = 'suspended' | 'loading' | 'onboard' | 'pass'

/** The session-layer state the onboarding gate decides from (useSession's shape). */
export interface OnboardingGateState {
  /** The persisted session read is in flight (useSession's `loading`). */
  sessionLoading: boolean
  /**
   * The signed-in user's profile + membership fetch is in flight
   * (useSession's `profileLoading`).
   */
  profileLoading: boolean
  /** A session is present. */
  signedIn: boolean
  /** The settled membership count (only meaningful once the load has settled). */
  hasMemberships: boolean
  /** The signed-in user's profile is banned (the shell's suspended screen). */
  suspended: boolean
}

/**
 * The app-shell's onboarding-gate decision (ticket 06: cold-load race fix).
 *
 * On a full page load, the persisted session (localStorage) is ready long
 * before the profile + membership fetch lands, so the gate must render the
 * shell's loading state while any load is in flight and only redirect to
 * /onboarding once the load has settled AND the user has no memberships —
 * otherwise a signed-in member cold-loading /profile bounces through
 * /onboarding → / and loses the requested route.
 *
 * - suspended (banned profile) → the suspended screen (no app access;
 *   wins even while a load is in flight)
 * - any load in flight → the loading state (never redirect mid-load)
 * - settled + signed out → pass (the signed-out gate sends /login)
 * - settled + signed in + 0 memberships → /onboarding
 * - settled + signed in + ≥1 memberships → pass
 */
export function resolveOnboardingGate(state: OnboardingGateState): OnboardingGateDecision {
  if (state.suspended) return 'suspended'
  if (state.sessionLoading || (state.signedIn && state.profileLoading)) return 'loading'
  if (!state.signedIn) return 'pass'
  if (needsOnboarding(state.hasMemberships)) return 'onboard'
  return 'pass'
}