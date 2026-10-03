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
 * 8a fix rounds 1-2). The behaviour legs above prove what the PREDICATE decides;
 * `e2e/avatar.e2e.ts`'s '' leg proves what the RENDER SITE does with an
 * empty-string avatar. Neither can distinguish "the page calls this function"
 * from "the page restates the same one-liner faithfully" — a restatement WITH
 * the empty-string clause passes every behavioural test in the suite. This
 * module's whole value is being the ONE definition, so the call itself is the
 * claim, and these legs are what checks it — over CODE, never over prose.
 *
 * ⚠️ WHY BOTH LEGS READ A COMMENT-FREE VIEW, AND WHY THE EMPTY CASE IS A FINDING
 * (fix round 2 — the round-1 legs had both holes, inside the very test that
 * exists to catch a missing call):
 *
 *   - A COMMENT MUST NOT SATISFY THE CALL LEG. Round 1 matched the raw text, so a
 *     comment mentioning `hasAvatarUrl(` passed it with no call in the file; the
 *     mutation that proves the new legs reject that is in the report.
 *   - A NEGATIVE LEG MUST NOT PASS BY MEASURING NOTHING. A bare `not.toMatch` is
 *     vacuously TRUE on an empty string, so an empty or broken `?raw` read would
 *     have made "the page does not restate the check" green with nothing read —
 *     D-030, one level down from the defect these legs exist for. Each leg
 *     asserts BOTH sets are non-empty: the raw read and the comment-free view
 *     (two sets, because D-030's own lesson is that an invariant at one
 *     granularity is a claim at every other).
 *   - BLANKING ALSO REMOVES A FALSE POSITIVE leg 2 used to have: a comment that
 *     merely *quotes* the comparison is prose, not a restatement, and round 1's
 *     raw-text scan forced one such comment to be reworded.
 *
 * CEILING, stated rather than implied — this reads source TEXT, so it cannot see
 * semantics, and `codeOnly` is a scanner, not a parser. Three named limits, each
 * MEASURED (fix round 3; the round-2 ceiling got the second one backwards):
 *
 *   1. A REGEX LITERAL IS NOT TRACKED. A regex containing `//` makes the scanner
 *      over-blank the rest of its line, so a real call after one on the same line
 *      is invisible — a false FAIL. Measured over the real file: `@babel/parser`
 *      reports zero RegExpLiterals in `src/pages/ProfilePage.tsx`.
 *   2. AN ALIASED CALLEE FAILS LEG 1 — it does not pass it. Measured with leg 1's
 *      own regex: `import { hasAvatarUrl as pred } …; pred(x)` -> false;
 *      `const p = hasAvatarUrl; p(x)` -> false. So this is a FALSE FAIL (the test
 *      goes red on a refactor that still calls the predicate), and that is the
 *      honest reading: fix the regex here, do NOT delete the leg. What DOES pass is
 *      a call whose ARGUMENT is spelled differently — `hasAvatarUrl(a)`,
 *      `hasAvatarUrl(x ?? '')` -> true — because the leg matches the callee's name,
 *      not the argument list. (The round-2 ceiling said an aliased call passes: it
 *      said the opposite of what the mechanism does.)
 *   3. TWO FALSE-PASS VECTORS ARE REACHABLE IN PRINCIPLE, measured ABSENT here:
 *      (a) a lone apostrophe in JSX TEXT desynchronises the scanner into its
 *      single-quote state and it stops blanking comments for the rest of the file;
 *      (b) string or template TEXT containing `hasAvatarUrl(` satisfies leg 1 with
 *      no call. Absent, measured against `@babel/parser` over the real file: of
 *      its 33,798 comment characters the scanner blanks 33,798, leaks 0 and
 *      over-blanks 0 (so there is no desync), the file holds exactly ONE
 *      `hasAvatarUrl(` and it is the real call at `ProfilePage.tsx:1227`, and the
 *      file has no JSX-text apostrophe. A future edit that adds either vector
 *      would change what the leg measures WITHOUT failing it — the residual risk
 *      this paragraph exists to name.
 *
 * It is deliberately NOT a copy of firstRun.test.ts's `stripComments`: that one
 * returns a joined token stream for a purity scan and preserves string literals
 * character for character; this one BLANKS comment spans so a pattern can be
 * matched against code. The one-copy rule's trigger is the same expression in
 * two files — if a third site needs a comment-free read, that is when these two
 * become one module, and this paragraph is where the trigger is recorded.
 *
 * MUTATION-RUN, all in the report's fix-round sections: a FAITHFUL restatement
 * removes the call (both legs red, round 1); a COMMENT-ONLY mention of the call
 * does not rescue it (both legs red, round 2); an EMPTY `?raw` read is a finding
 * rather than a green negative (both legs red, round 2).
 */
describe('the render site CALLS this predicate (V28 r2 slice 8a fix rounds 1-2)', () => {
  /**
   * The page's source with every comment span BLANKED (replaced by spaces, line
   * structure kept): line remarks and block comments alike, so a match can only
   * be code. String and template literals are tracked — a `//` inside a string is
   * not a comment — which is also why a quote character inside a comment cannot
   * desynchronise the scan.
   */
  function codeOnly(source: string): string {
    let out = ''
    let state: 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tick' = 'code'
    for (let i = 0; i < source.length; i++) {
      const ch = source[i]
      const next = source[i + 1] ?? ''
      if (state === 'line') {
        if (ch === '\n') { state = 'code'; out += ch } else out += ' '
        continue
      }
      if (state === 'block') {
        if (ch === '*' && next === '/') { state = 'code'; out += '  '; i += 1 } else out += ch === '\n' ? ch : ' '
        continue
      }
      if (state === 'sq' || state === 'dq' || state === 'tick') {
        const closer = state === 'sq' ? "'" : state === 'dq' ? '"' : '`'
        out += ch
        if (ch === '\\') { out += next; i += 1 }
        else if (ch === closer) state = 'code'
        continue
      }
      if (ch === '/' && next === '/') { state = 'line'; out += '  '; i += 1; continue }
      if (ch === '/' && next === '*') { state = 'block'; out += '  '; i += 1; continue }
      if (ch === "'") state = 'sq'
      else if (ch === '"') state = 'dq'
      else if (ch === '`') state = 'tick'
      out += ch
    }
    return out
  }

  const code = codeOnly(profilePageSource)
  /** The comment-free view's non-whitespace length: the second set to keep watching. */
  const codeLength = code.replace(/\s+/g, '').length

  it('the identity card calls hasAvatarUrl', () => {
    expect(
      profilePageSource.length,
      'the ?raw read of ProfilePage.tsx is EMPTY — this leg would measure nothing',
    ).toBeGreaterThan(0)
    expect(
      codeLength,
      'the comment-free view is EMPTY — this leg would measure nothing',
    ).toBeGreaterThan(0)
    expect(
      code,
      'ProfilePage.tsx must CALL hasAvatarUrl for its avatar branch (a mention in a comment is not a call)',
    ).toMatch(/hasAvatarUrl\(/)
  })

  it('and never compares the column inline — the restatement this module exists to stop', () => {
    expect(
      profilePageSource.length,
      'the ?raw read of ProfilePage.tsx is EMPTY — a negative assertion over nothing is vacuously true',
    ).toBeGreaterThan(0)
    expect(
      codeLength,
      'the comment-free view is EMPTY — a negative assertion over nothing is vacuously true',
    ).toBeGreaterThan(0)
    expect(
      code,
      'ProfilePage.tsx must not restate the avatar-presence test inline',
    ).not.toMatch(/avatar_url\s*(===|!==|==|!=)/)
  })
})
