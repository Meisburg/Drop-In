import { describe, expect, it } from 'vitest'
import {
  HOME_PATH,
  needsOnboarding,
  ONBOARDING_PATH,
  resolveOnboardingRedirect,
  resolveProtectedRedirect,
} from './onboarding'

describe('needsOnboarding', () => {
  it('is true when the user has no memberships', () => {
    expect(needsOnboarding(false)).toBe(true)
  })

  it('is false when the user has at least one membership', () => {
    expect(needsOnboarding(true)).toBe(false)
  })
})

describe('resolveProtectedRedirect (protected routes)', () => {
  it('sends signed-out users to /login', () => {
    expect(resolveProtectedRedirect(false, false, '/')).toBe('/login')
    expect(resolveProtectedRedirect(false, true, '/browse')).toBe('/login')
    expect(resolveProtectedRedirect(false, true, '/u/jamie')).toBe('/login')
  })

  it('sends signed-in users with 0 memberships to /onboarding', () => {
    expect(resolveProtectedRedirect(true, false, '/')).toBe(ONBOARDING_PATH)
    expect(resolveProtectedRedirect(true, false, '/browse')).toBe(ONBOARDING_PATH)
    expect(resolveProtectedRedirect(true, false, '/profile')).toBe(ONBOARDING_PATH)
  })

  it('lets signed-in users with memberships keep the intended route', () => {
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

  it('sends signed-in users with memberships back to /', () => {
    expect(resolveOnboardingRedirect(true, true)).toBe(HOME_PATH)
  })

  it('lets signed-in users without memberships stay on /onboarding', () => {
    expect(resolveOnboardingRedirect(true, false)).toBeNull()
  })
})