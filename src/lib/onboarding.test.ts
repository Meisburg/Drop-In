import { describe, expect, it } from 'vitest'
import {
  HOME_PATH,
  needsOnboarding,
  ONBOARDING_PATH,
  resolveOnboardingGate,
  resolveOnboardingRedirect,
  resolveProtectedRedirect,
  type OnboardingGateState,
} from './onboarding'

/**
 * Onboarding-gate tests (V2 slice 3: the gate keys on the home zip, not
 * memberships — neighborhoods are display labels only, discovery is
 * radius-based).
 */

describe('needsOnboarding', () => {
  it('is true when the user has no home zip', () => {
    expect(needsOnboarding(false)).toBe(true)
  })

  it('is false when the user has a home zip', () => {
    expect(needsOnboarding(true)).toBe(false)
  })
})

describe('resolveProtectedRedirect (protected routes)', () => {
  it('sends signed-out users to /login', () => {
    expect(resolveProtectedRedirect(false, false, '/')).toBe('/login')
    expect(resolveProtectedRedirect(false, true, '/browse')).toBe('/login')
    expect(resolveProtectedRedirect(false, true, '/u/jamie')).toBe('/login')
  })

  it('lets signed-out visitors keep a public detail route (V2 slice 5 — no /onboarding detour)', () => {
    // A signed-out visitor has no home zip — the onboarding bounce must NOT
    // fire (it would detour through /onboarding, which bounces to /login —
    // a redirect loop; the public detail page is the route's point).
    expect(resolveProtectedRedirect(false, false, '/playdate/abc')).toBe('/playdate/abc')
  })

  it('sends signed-in users without a home zip to /onboarding', () => {
    expect(resolveProtectedRedirect(true, false, '/')).toBe(ONBOARDING_PATH)
    expect(resolveProtectedRedirect(true, false, '/browse')).toBe(ONBOARDING_PATH)
    expect(resolveProtectedRedirect(true, false, '/profile')).toBe(ONBOARDING_PATH)
  })

  it('lets signed-in users with a home zip keep the intended route', () => {
    expect(resolveProtectedRedirect(true, true, '/')).toBe(HOME_PATH)
    expect(resolveProtectedRedirect(true, true, '/browse')).toBe('/browse')
    expect(resolveProtectedRedirect(true, true, '/u/jamie')).toBe('/u/jamie')
  })
})

describe('resolveOnboardingRedirect (the /onboarding route)', () => {
  it('sends signed-out users to /login', () => {
    expect(resolveOnboardingRedirect(false, false)).toBe('/login')
    expect(resolveOnboardingRedirect(false, true)).toBe('/login')
  })

  it('sends signed-in users with a home zip back to /', () => {
    expect(resolveOnboardingRedirect(true, true)).toBe(HOME_PATH)
  })

  it('lets signed-in users without a home zip stay on /onboarding', () => {
    expect(resolveOnboardingRedirect(true, false)).toBeNull()
  })
})

/** A settled gate state; override only what a case exercises. */
function gateState(over: Partial<OnboardingGateState> = {}): OnboardingGateState {
  return {
    sessionLoading: false,
    profileLoading: false,
    signedIn: true,
    homeZipSet: true,
    suspended: false,
    ...over,
  }
}

describe('resolveOnboardingGate (the shell gate, ticket 06 cold-load race)', () => {
  it('renders the loading state while the session read is in flight', () => {
    expect(resolveOnboardingGate(gateState({ sessionLoading: true }))).toBe('loading')
  })

  it('renders the loading state while a signed-in user\'s profile fetch is in flight (the race)', () => {
    // A stale homeZipSet=false must NOT bounce the user to /onboarding
    // mid-load — that is the cold-load race this gate fixes.
    expect(
      resolveOnboardingGate(gateState({ profileLoading: true, homeZipSet: false })),
    ).toBe('loading')
  })

  it('passes a settled signed-in user with a home zip', () => {
    expect(resolveOnboardingGate(gateState({}))).toBe('pass')
  })

  it('sends a settled signed-in user without a home zip to /onboarding', () => {
    expect(resolveOnboardingGate(gateState({ homeZipSet: false }))).toBe('onboard')
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