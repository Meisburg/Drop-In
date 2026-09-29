import { describe, expect, it } from 'vitest'
import {
  consumeSignupZipUnresolved,
  HOME_PATH,
  markSignupZipUnresolved,
  needsOnboarding,
  resolveOnboardingGate,
  resolveOnboardingRedirect,
  resolveProtectedRedirect,
  SIGNUP_ZIP_FALLBACK_KEY,
  type FlagStorage,
  type OnboardingGateState,
} from './onboarding'

/**
 * Onboarding-gate tests. V28 slice 2b: the gate no longer keys on the home
 * zip — the location requirement moved off the gate and onto the write
 * paths (hasHomeZip, lib/homeZip.ts). What survives here: the signed-out
 * /login leg, the cold-load 'loading' race, the suspended screen, and the
 * /onboarding route's own redirect (which still keys on the zip).
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
// ---------------------------------------------------------------------------
// The signup→onboarding handoff (first-use audit, ticket 02).
//
// The audit's finding was a silent transition: the address did not resolve, so
// the parent met a ZIP screen with no explanation. These tests pin the two
// things that make the fix trustworthy — it fires only for the failure case,
// and it fires only ONCE.
// ---------------------------------------------------------------------------

/** A minimal in-memory storage, plus one that throws on every access. */
function fakeStorage(seed: Record<string, string> = {}): FlagStorage & {
  dump: () => Record<string, string>
} {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  }
}

const throwingStorage: FlagStorage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('SecurityError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

describe('the signup ZIP fallback flag', () => {
  it('reports the unresolved address exactly once', () => {
    const storage = fakeStorage()
    markSignupZipUnresolved(storage)
    expect(consumeSignupZipUnresolved(storage)).toBe(true)
    // The second read is a DIFFERENT visit: a stale cause must not be invented.
    expect(consumeSignupZipUnresolved(storage)).toBe(false)
    expect(storage.dump()[SIGNUP_ZIP_FALLBACK_KEY]).toBeUndefined()
  })

  it('says nothing when the signup address DID resolve', () => {
    // The happy path writes nothing at all, which is what makes the note mean
    // something when it does appear.
    expect(consumeSignupZipUnresolved(fakeStorage())).toBe(false)
  })

  it('never throws into a signup or a render when storage is hostile', () => {
    expect(() => markSignupZipUnresolved(throwingStorage)).not.toThrow()
    expect(consumeSignupZipUnresolved(throwingStorage)).toBe(false)
    expect(() => markSignupZipUnresolved(null)).not.toThrow()
    expect(consumeSignupZipUnresolved(null)).toBe(false)
  })
})
