import { describe, expect, it } from 'vitest'
import {
  HOME_PATH,
  resolveOnboardingGate,
  resolveOnboardingRedirect,
  resolveProtectedRedirect,
  type OnboardingGateState,
} from './onboarding'

/**
 * Onboarding-gate tests. V28 slice 2b: the gate no longer keys on the home
 * zip — the location requirement moved off the gate and onto the write
 * paths (hasHomeZip, lib/homeZip.ts). What survives here: the signed-out
 * /login leg, the cold-load 'loading' race, the suspended screen, and the
 * /onboarding route's own redirect (V28 slice 6, defect #19: re-keyed —
 * signed out → /login, signed in → render, finished runs end on the
 * page's own finish card, never a feed bounce).
 */

// V28 r2 slice 8a: `needsOnboarding(homeZipSet)` (`!homeZipSet`) was DELETED —
// the two tests below were its only callers, measured at 8d1170d. It was the
// last fragment of the app-wide home-zip gate slice 2b removed (the
// requirement lives on the write paths now — docs/adr/0001-home-zip-stops-
// being-a-gate.md), so a one-line predicate nothing called was a claim about a
// gate the app no longer has.

describe('resolveProtectedRedirect (protected routes)', () => {
  it('sends signed-out users to /login', () => {
    expect(resolveProtectedRedirect(false, '/')).toBe('/login')
    expect(resolveProtectedRedirect(false, '/browse')).toBe('/login')
    expect(resolveProtectedRedirect(false, '/u/jamie')).toBe('/login')
  })

  it('lets signed-out visitors keep a public detail route (V2 slice 5 — no /login detour)', () => {
    // The public detail page is the route's point: resolveAuthRedirect
    // allows it signed-out, and the function above it never sends a
    // signed-out visitor anywhere but /login (no location rule exists
    // that could detour them at all).
    expect(resolveProtectedRedirect(false, '/playdate/abc')).toBe('/playdate/abc')
  })

  it('lets signed-in users keep the intended route (V28 slice 2b — the location requirement lives at the writes, not a wall)', () => {
    expect(resolveProtectedRedirect(true, '/')).toBe(HOME_PATH)
    expect(resolveProtectedRedirect(true, '/browse')).toBe('/browse')
    expect(resolveProtectedRedirect(true, '/profile')).toBe('/profile')
    expect(resolveProtectedRedirect(true, '/u/jamie')).toBe('/u/jamie')
  })

  it("does not bounce a no-zip parent out of an \"I'm coming\" return target", () => {
    expect(resolveProtectedRedirect(true, '/playdate/abc123')).toBe('/playdate/abc123')
  })
})

describe('resolveOnboardingRedirect (the /onboarding route)', () => {
  it('sends a signed-out visitor to /login', () => {
    expect(resolveOnboardingRedirect(false)).toBe('/login')
  })

  it('renders a signed-in user, zip set or not — the finished run shows its own finish card, never a feed bounce (V28 slice 6, defect #19)', () => {
    // The old `(signed in + zip set) → HOME_PATH` leg is GONE: it bounced a
    // finished parent off the area card's save (the zip write creates
    // exactly the state that triggered the bounce) and re-bounced any
    // re-visit to /onboarding out of the run's own ending.
    expect(resolveOnboardingRedirect(true)).toBeNull()
  })
})

/** A settled gate state; override only what a case exercises. */
function gateState(over: Partial<OnboardingGateState> = {}): OnboardingGateState {
  return {
    sessionLoading: false,
    profileLoading: false,
    signedIn: true,
    suspended: false,
    ...over,
  }
}

describe('resolveOnboardingGate (the shell gate, ticket 06 cold-load race)', () => {
  it('renders the loading state while the session read is in flight', () => {
    expect(resolveOnboardingGate(gateState({ sessionLoading: true }))).toBe('loading')
  })

  it('renders the loading state while a signed-in user\'s profile fetch is in flight (the race)', () => {
    // profileLoading makes the gate render 'loading' instead of a route —
    // that is the cold-load race this gate fixes (a stale session/profile
    // read must never decide routing mid-load).
    expect(resolveOnboardingGate(gateState({ profileLoading: true }))).toBe('loading')
  })

  it('passes a settled signed-in user (V28 slice 2b — the gate no longer keys on the home zip)', () => {
    expect(resolveOnboardingGate(gateState({}))).toBe('pass')
  })

  it('passes a settled signed-out user (the signed-out gate sends /login)', () => {
    expect(resolveOnboardingGate(gateState({ signedIn: false }))).toBe('pass')
  })

  it('renders the suspended screen for a banned session (no app access)', () => {
    expect(resolveOnboardingGate(gateState({ suspended: true }))).toBe('suspended')
  })

  it('keeps the suspended screen even while a load is in flight', () => {
    expect(
      resolveOnboardingGate(gateState({ suspended: true, sessionLoading: true })),
    ).toBe('suspended')
  })
})
// V28 slice 5 retires the signup→onboarding ZIP fallback flag (the section
// these tests used to pin): the signup form's address left /login in slice
// 3b, so `SIGNUP_ZIP_FALLBACK_KEY` / `markSignupZipUnresolved` /
// `consumeSignupZipUnresolved` were dead code — no producer, no consumer.
// The fallback's coverage now lives in the AREA CARD: its in-card notice is
// exercised by e2e/signup-zip-fallback.e2e.ts (a resolvable address writes
// the home zip with no typed ZIP; an unresolvable one reveals the ZIP field
// and the notice), and the card-gating lookup's timeout behavior is pinned
// in geocode.test.ts (`locationFromAddressQueryBounded`'s legs).
