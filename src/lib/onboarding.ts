import { LOGIN_PATH, resolveAuthRedirect } from './auth'

/**
 * Pure, unit-testable onboarding-gating logic (slice 2; V2 slice 3; V28
 * slice 2b). Decisions live here so they can be tested without
 * React/browser (see onboarding.test.ts).
 *
 * V28 slice 2b: the home-zip requirement no longer lives at an app-wide
 * wall. It lives at the write paths (the guarded ping/post/zip writes,
 * keyed on hasHomeZip in lib/homeZip.ts) — see
 * docs/adr/0001-home-zip-stops-being-a-gate.md.
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
 *   — EXCEPT the public detail route (V2 slice 5), which resolveAuthRedirect
 *   already allows signed-out
 * - signed in → intendedPath. There is NO location bounce (V28 slice 2b):
 *   the home-zip requirement moved off this app-wide wall and onto the
 *   write paths — see docs/adr/0001-home-zip-stops-being-a-gate.md. The
 *   homeZipSet parameter is kept (underscored, unused) so callers keep a
 *   stable shape; the decision no longer reads it.
 */
export function resolveProtectedRedirect(
  signedIn: boolean,
  _homeZipSet: boolean,
  intendedPath: string,
): string {
  const authRedirect = resolveAuthRedirect(intendedPath, signedIn)
  if (authRedirect !== null) return authRedirect
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
export type OnboardingGateDecision = 'suspended' | 'loading' | 'pass'

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
 * V28 slice 2b: no '/onboard' decision — the location requirement moved
 * off the gate and onto the write paths, so a settled signed-in parent
 * passes whether or not their home zip is set). 'loading' is still
 * load-bearing: it is what stops routes RENDERING before the session and
 * profile have settled (a stale homeZipSet must never change a routing
 * decision mid-load).
 *
 * On a full page load, the persisted session (localStorage) is ready long
 * before the profile fetch lands, so the gate must render the shell's
 * loading state while any load is in flight — otherwise a cold load
 * paints the app shell mid-fetch.
 *
 * - suspended (banned profile) → the suspended screen (no app access;
 *   wins even while a load is in flight)
 * - any load in flight → the loading state (never render routes mid-load)
 * - settled + signed out → pass (the signed-out gate sends /login)
 * - settled + signed in → pass, with or without a home zip
 */
export function resolveOnboardingGate(state: OnboardingGateState): OnboardingGateDecision {
  if (state.suspended) return 'suspended'
  if (state.sessionLoading || (state.signedIn && state.profileLoading)) return 'loading'
  if (!state.signedIn) return 'pass'
  return 'pass'
}

// ---------------------------------------------------------------------------
// The signup→onboarding handoff (first-use audit, ticket 02)
//
// The audit found the ZIP step asking for a location the parent believed they
// had already given. The address IS the location input (`LoginPage` geocodes it
// and writes `home_zip`); the ZIP step exists for the case where that lookup
// did not resolve. Nothing told the parent which case they were in, so the
// screen read as "enter your location again".
//
// This keeps the ZIP step and makes the FALLBACK legible: when the signup
// lookup fails, that fact is carried across one route change — and only that
// far. It is deliberately ONE-SHOT and cleared on read, because a note about a
// signup from days ago is worse than no note: it invents a cause for a screen
// the parent may be on for an entirely different reason (a cleared home zip,
// say).
//
// It says nothing about implementation. No "geocode", no "home_zip" — the
// parent typed an address and it could not be matched, which is the whole truth
// they need (the ticket's own acceptance criterion).
// ---------------------------------------------------------------------------

/** sessionStorage key: the signup address could not be matched to a ZIP. */
export const SIGNUP_ZIP_FALLBACK_KEY = 'dropin.signup.zip-unresolved'

/** The smallest storage surface this needs (sessionStorage in the app). */
export interface FlagStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Record that the signup lookup failed, so the ZIP step can explain itself. */
export function markSignupZipUnresolved(storage: FlagStorage | null): void {
  if (storage === null) return
  try {
    storage.setItem(SIGNUP_ZIP_FALLBACK_KEY, '1')
  } catch {
    // Storage that refuses writes only costs the explanatory note; the ZIP step
    // still works and still validates. Never throw into a signup.
  }
}

/**
 * Read AND clear the flag. One shot by construction: the first render of the
 * ZIP step consumes it, so a later visit is not told a stale story.
 */
export function consumeSignupZipUnresolved(storage: FlagStorage | null): boolean {
  if (storage === null) return false
  try {
    const present = storage.getItem(SIGNUP_ZIP_FALLBACK_KEY) !== null
    if (present) storage.removeItem(SIGNUP_ZIP_FALLBACK_KEY)
    return present
  } catch {
    return false
  }
}
