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
 *
 * V28 slice 5 retires the signup→onboarding handoff that used to live in
 * this file (`SIGNUP_ZIP_FALLBACK_KEY` + `markSignupZipUnresolved` /
 * `consumeSignupZipUnresolved`): the signup form's address left /login in
 * slice 3b, so the flag's producer (LoginPage's failed geocode) and its
 * consumer (OnboardingPage's one-shot note) were both dead code, and the
 * fallback note is now the AREA CARD's OWN in-card notice, triggered by the
 * card's bounded address lookup (lib/geocode's `zipFromAddressQueryBounded`)
 * — never a cross-screen flag.
 */

/** Pinned route path for the post-signup location (zip + radius) step. */
export const ONBOARDING_PATH = '/onboarding'

/** Home (today's feed) — where a completed onboarding sends the user. */
export const HOME_PATH = '/'

/**
 * Where a protected route should send a user. Always returns a string —
 * the intended path itself when the route may render as-is.
 *
 * - signed out → /login (delegates to resolveAuthRedirect; not duplicated)
 *   — EXCEPT the public detail route (V2 slice 5), which resolveAuthRedirect
 *   already allows signed-out
 * - signed in → intendedPath. There is NO location bounce (V28 slice 2b):
 *   the home-zip requirement moved off this app-wide wall and onto the
 *   write paths — see docs/adr/0001-home-zip-stops-being-a-gate.md.
 */
export function resolveProtectedRedirect(
  signedIn: boolean,
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
 * - signed out → /login (onboarding is a signed-in flow)
 * - signed in → null: render the run — the first UNANSWERED card, or the
 *   FINISH CARD when the run is complete.
 *
 * V28 slice 6 (plan defect #19): the `(signed in + home zip set) → /
 * (HOME_PATH)` bounce is GONE. It sent a finished parent to the feed the
 * instant the area card's save wrote the zip — before the card that save
 * existed to reveal could render, and it re-bounced any re-visit to
 * /onboarding out of the run's own ending. A finished parent now lands on
 * the finish card (OnboardingPage), whose primary CTA carries them to the
 * feed. The protected ROUTES do not key on the zip any more (V28 slice
 * 2b) — the requirement lives at the WRITE PATHS (hasHomeZip, lib/homeZip
 * .ts), and resolveProtectedRedirect is unchanged; only this route's own
 * bounce is re-keyed.
 */
export function resolveOnboardingRedirect(signedIn: boolean): string | null {
  if (!signedIn) return LOGIN_PATH
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
  /** The signed-in user's profile is banned (the shell's suspended screen). */
  suspended: boolean
}

/**
 * The app-shell's onboarding-gate decision (ticket 06: cold-load race fix;
 * V28 slice 2b: no '/onboard' decision — the location requirement moved
 * off the gate and onto the write paths, so a settled signed-in parent
 * passes). 'loading' is still load-bearing: it is what stops routes
 * RENDERING before the session and profile have settled.
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
 * - settled + signed in → pass (V28 slice 2b: the gate no longer keys on
 *   the home zip — it is not even in its state)
 */
export function resolveOnboardingGate(state: OnboardingGateState): OnboardingGateDecision {
  if (state.suspended) return 'suspended'
  if (state.sessionLoading || (state.signedIn && state.profileLoading)) return 'loading'
  if (!state.signedIn) return 'pass'
  return 'pass'
}
