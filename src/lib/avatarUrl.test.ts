import { describe, expect, it } from 'vitest'
import { hasAvatarUrl } from './avatarUrl'

/**
 * V28 slice 4b: the presence predicate is defined ONCE here and used at
 * every "does the profile have an avatar" site, so no class of drift can
 * recur. The call-site history, re-measured at 8d1170d (V28 r2 slice 8a):
 * the first run's hasPhoto fact used to run the check, until r2 slice 1b
 * deleted the photo card and the fact with it; lib/places.ts's local
 * `hasPhoto` reads a DIFFERENT column (`photo_url`); and ProfilePage's
 * identity card — the one site left — now CALLS this predicate instead of
 * restating it (slice 8a), which is what e2e/avatar.e2e.ts's '' leg pins in
 * the browser. The table below pins the semantics
 * (`avatar_url !== undefined && !== null && !== ''`).
 */
describe('hasAvatarUrl (the one avatar presence predicate)', () => {
  it('treats null and undefined as unset', () => {
    expect(hasAvatarUrl(null)).toBe(false)
    expect(hasAvatarUrl(undefined)).toBe(false)
  })

  it('treats the EMPTY STRING as unset — the clause ProfilePage dropped until slice 8a wired it', () => {
    // The nudge's inline check counted '' as NO avatar; the predicate keeps
    // that (a `== null` check would treat '' as set and render a dead
    // <img src=""> downstream — which is exactly what ProfilePage did while it
    // restated the check inline, and what avatar.e2e.ts's '' leg fails on).
    expect(hasAvatarUrl('')).toBe(false)
  })

  it('treats a real avatar URL as set', () => {
    expect(hasAvatarUrl('https://storage.example.com/avatars/uid/avatar?v=1')).toBe(true)
  })
})