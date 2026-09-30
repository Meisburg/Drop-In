import { describe, expect, it } from 'vitest'
import { hasAvatarUrl } from './avatarUrl'

/**
 * V28 slice 4b: the presence predicate is defined ONCE here and used at
 * every "does the profile have an avatar" site (the first run's hasPhoto
 * fact ran it, until V28 r2 slice 1b deleted the photo card and the
 * fact with it), so no class of drift can recur. The table below pins
 * the exact existing semantics
 * (`avatar_url !== undefined && !== null && !== ''`).
 */
describe('hasAvatarUrl (the one avatar presence predicate)', () => {
  it('treats null and undefined as unset', () => {
    expect(hasAvatarUrl(null)).toBe(false)
    expect(hasAvatarUrl(undefined)).toBe(false)
  })

  it('treats the EMPTY STRING as unset — the clause the ProfilePage site dropped', () => {
    // The nudge's inline check counted '' as NO avatar; the predicate keeps
    // that (a `== null` check would treat '' as set and render a dead
    // <img src=""> downstream).
    expect(hasAvatarUrl('')).toBe(false)
  })

  it('treats a real avatar URL as set', () => {
    expect(hasAvatarUrl('https://storage.example.com/avatars/uid/avatar?v=1')).toBe(true)
  })
})