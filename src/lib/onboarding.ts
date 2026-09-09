import { LOGIN_PATH, resolveAuthRedirect } from './auth'

/**
 * Pure, unit-testable onboarding-gating logic (slice 2; V2 slice 3).
 *
 * A signed-in user without a home zip must finish onboarding (set home
 * zip + radius) before any protected route renders (V2 slice 3: the gate
 * moved from "0 memberships" to "home_zip unset" — neighborhoods are
 * display labels only, discovery is radius-based). Decisions live here so
 * they can be tested without React/browser (see onboarding.test.ts).
 */

/** Pinned route path for the post-signup location (zip + radius) step. */
export const ONBOARDING_PATH = '/onboarding'

/** Home (today's feed) — where a completed onboarding sends the user. */
export const HOME_PATH = '/'

/** A signed-in user needs onboarding exactly when their home zip is unset. */
export function needsOnboarding(homeZipSet: boolean): boolean {
  return !homeZipSet
}

/**
 * Where a protected route should send a user. Always returns a string —
 * the intended path itself when the route may render as-is.
 *
 * - signed out → /login (delegates to resolveAuthRedirect; not duplicated)
 * - signed in + home zip unset → /onboarding
 * - signed in + home zip set → intendedPath
 */
export function resolveProtectedRedirect(
  signedIn: boolean,
  homeZipSet: boolean,
  intendedPath: string,
): string {
  const authRedirect = resolveAuthRedirect(intendedPath, signedIn)
  if (authRedirect !== null) return authRedirect
  if (needsOnboarding(homeZipSet)) return ONBOARDING_PATH
  return intendedPath
}

/**
 * Where the /onboarding route itself should send a user, or null when
 * onboarding may render as-is.
 *
 * - signed out → /login
 * - signed in + home zip set → / (onboarding already done)
 * - signed in + home zip unset → null (show the location step)
 */
export function resolveOnboardingRedirect(
  signedIn: boolean,
  homeZipSet: boolean,
): string | null {
  if (!signedIn) return LOGIN_PATH
  if (!needsOnboarding(homeZipSet)) return HOME_PATH
  return null
}

/** The app-shell's onboarding-gate decision (ticket 06: wait for the loads). */
export type OnboardingGateDecision = 'suspended' | 'loading' | 'onboard' | 'pass'

/** The session-layer state the onboarding gate decides from (useSession's shape). */
export interface OnboardingGateState {
  /** The persisted session read is in flight (useSession's `loading`). */
  sessionLoading: boolean
  /**
   * The signed-in user's profile fetch is in flight
   * (useSession's `profileLoading`).
   */
  profileLoading: boolean
  /** A session is present. */
  signedIn: boolean
  /**
   * The settled home-zip state (V2 slice 3: only meaningful once the
   * profile load has settled). True when profiles.home_zip is set.
   */
  homeZipSet: boolean
  /** The signed-in user's profile is banned (the shell's suspended screen). */
  suspended: boolean
}

/**
 * The app-shell's onboarding-gate decision (ticket 06: cold-load race fix;
 * V2 slice 3: the gate keys on the home zip, not memberships).
 *
 * On a full page load, the persisted session (localStorage) is ready long
 * before the profile fetch lands, so the gate must render the shell's
 * loading state while any load is in flight and only redirect to
 * /onboarding once the load has settled AND the user's home zip is unset —
 * otherwise a signed-in, zipped user cold-loading /profile bounces through
 * /onboarding → / and loses the requested route.
 *
 * - suspended (banned profile) → the suspended screen (no app access;
 *   wins even while a load is in flight)
 * - any load in flight → the loading state (never redirect mid-load)
 * - settled + signed out → pass (the signed-out gate sends /login)
 * - settled + signed in + home zip unset → /onboarding
 * - settled + signed in + home zip set → pass
 */
export function resolveOnboardingGate(state: OnboardingGateState): OnboardingGateDecision {
  if (state.suspended) return 'suspended'
  if (state.sessionLoading || (state.signedIn && state.profileLoading)) return 'loading'
  if (!state.signedIn) return 'pass'
  if (needsOnboarding(state.homeZipSet)) return 'onboard'
  return 'pass'
}