import { describe, expect, it } from 'vitest'
// The render site's own SOURCE, the way firstRun.test.ts reads its module's
// (`?raw`, which vite/client types): a `node:fs` read would be a build error —
// tsconfig.app.json's types are ["vite/client"], not node.
import profilePageSource from '../pages/ProfilePage.tsx?raw'
import { hasAvatarUrl } from './avatarUrl'

/**
 * V28 slice 4b: the presence predicate is defined ONCE here and used at
 * every "does the profile have an avatar" site, so no class of drift can
 * recur. The call-site history, re-measured at 8d1170d (V28 r2 slice 8a):
 * the first run's hasPhoto fact used to run the check, until r2 slice 1b
 * deleted the photo card and the fact with it; lib/places.ts's local
 * `hasPhoto` reads a DIFFERENT column (`photo_url`); and ProfilePage's
 * identity card — the one site left — now CALLS this predicate instead of
 * restating it (slice 8a). Two instruments hold that, at two granularities:
 * e2e/avatar.e2e.ts's '' leg pins what the render site DOES with an
 * empty-string avatar, and the source-level legs at the bottom of this file
 * pin that the site CALLS this function rather than restating its one-liner.
 * The table below pins the semantics
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

/**
 * ⚠️ THE CALL IS PINNED HERE, AND IT HAS TO BE A SOURCE-LEVEL PIN (V28 r2 slice
 * 8a fix round 1). The behaviour legs above prove what the PREDICATE decides;
 * `e2e/avatar.e2e.ts`'s '' leg proves what the RENDER SITE does with an
 * empty-string avatar. Neither can distinguish "the page calls this function"
 * from "the page restates the same one-liner faithfully" — a restatement WITH
 * the empty-string clause passes every behavioural test in the suite. This
 * module's whole value is being the ONE definition, so the call itself is the
 * claim, and these legs are what checks it: the render site names the predicate,
 * and the file holds no comparison against the column at all.
 *
 * Its ceiling, stated rather than implied: this reads source TEXT, so it cannot
 * see semantics. A call through an alias still passes (it IS a call), and a
 * restatement spelled without any comparison operator could escape leg 2 — but
 * that is a deliberate act, and leg 1 would still have to be deleted for the page
 * to stop calling this predicate.
 *
 * BOTH LEGS WERE MUTATION-RUN (fix round 1): restoring the pre-slice inline check
 * fails leg 1, and restoring a FAITHFUL restatement — the same test with the
 * empty-string clause put back — fails leg 2. Before this round, that faithful
 * restatement passed everything the suite had.
 */
describe('the render site CALLS this predicate (V28 r2 slice 8a fix round 1)', () => {
  it('the identity card calls hasAvatarUrl', () => {
    expect(profilePageSource, 'ProfilePage.tsx must CALL hasAvatarUrl for its avatar branch').toMatch(
      /hasAvatarUrl\(/,
    )
  })

  it('and never compares the column inline — the restatement this module exists to stop', () => {
    expect(
      profilePageSource,
      'ProfilePage.tsx must not restate the avatar-presence test inline',
    ).not.toMatch(/avatar_url\s*(===|!==|==|!=)/)
  })
})
