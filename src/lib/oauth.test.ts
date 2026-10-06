import { describe, expect, it } from 'vitest'
// Slice 2c fix round 1 — the scheme's OTHER two homes, read as SOURCE.
//
// `?raw` is the repo's own pattern for this (see avatarUrl.test.ts): a
// `node:fs` read would be a build error, because tsconfig.app.json's types are
// ["vite/client"], not node.
//
// The comment stripper below matters as much as the imports: these files are
// heavily commented, and the manifest comment NAMES `app.dropin.playdate`, so a
// naive substring match would pass on the prose alone — an instrument that its
// own documentation satisfies is not an instrument.
import androidManifestSource from '../../android/app/src/main/AndroidManifest.xml?raw'
import capacitorConfigSource from '../../capacitor.config.ts?raw'
import {
  NATIVE_OAUTH_SCHEME,
  nativeOAuthRedirectTo,
  oauthErrorMessage,
  oauthRedirectTo,
  oauthReturnErrorMessage,
  parseOAuthReturn,
  probeOAuthProvider,
  providerLabel,
  resolveOAuthProviders,
  suggestedHandle,
  splitSuggestedName,
} from './oauth'

/**
 * A return URL on OUR scheme, built from the constant rather than re-typed.
 * `NATIVE_OAUTH_SCHEME` is the scheme's ONE home in `src/`; a fixture that
 * restated the literal would be a second one, which is the drift class the
 * last describe in this file exists to catch.
 */
const returnUrl = (tail: string): string => `${NATIVE_OAUTH_SCHEME}://${tail}`

describe('oauthRedirectTo', () => {
  it('keeps a bare origin and adds the trailing slash', () => {
    expect(oauthRedirectTo('http://localhost:5173')).toBe('http://localhost:5173/')
  })

  it('collapses trailing slashes so the allowlist cannot disagree', () => {
    expect(oauthRedirectTo('https://dropin.example/')).toBe('https://dropin.example/')
    expect(oauthRedirectTo('https://dropin.example///')).toBe('https://dropin.example/')
  })

  it('preserves a port and a subpath', () => {
    expect(oauthRedirectTo('http://192.168.1.61:5173')).toBe('http://192.168.1.61:5173/')
    expect(oauthRedirectTo('https://example.com/app')).toBe('https://example.com/app/')
  })
})

describe('oauthErrorMessage', () => {
  it('explains the not-enabled case (the expected answer before setup)', () => {
    const message = oauthErrorMessage('google', 'Unsupported provider: provider is not enabled')
    expect(message).toContain('Google')
    expect(message).toContain('email and password')
  })

  it('names the provider that failed', () => {
    expect(oauthErrorMessage('facebook', 'provider is not enabled')).toContain('Facebook')
  })

  it('reads a cancellation as a cancellation', () => {
    expect(oauthErrorMessage('google', 'access_denied')).toBe('Sign-in was cancelled.')
  })

  it('passes an unknown failure through untouched', () => {
    expect(oauthErrorMessage('google', 'network timeout')).toBe('network timeout')
  })
})

/**
 * Slice 2c — the native return. The redirect target is a custom URL scheme, and
 * the shape of what comes back is decided by the auth FLOW TYPE (implicit:
 * tokens in the fragment), not by preference — so both are pinned here rather
 * than discovered on a phone.
 */
describe('the native redirect target (slice 2c)', () => {
  it('is the appId, named once — the string the manifest also registers', () => {
    // ⚠️ THESE TWO LITERALS ARE DELIBERATE, AND MUST STAY LITERALS. This test
    // pins the constant's VALUE — a rename should be a deliberate, failing act.
    // Deriving either side from `NATIVE_OAUTH_SCHEME` / `nativeOAuthRedirectTo()`
    // would make it a tautology, which is precisely the leg fix round 2 deleted
    // from the drift block below.
    expect(NATIVE_OAUTH_SCHEME).toBe('app.dropin.playdate')
    expect(nativeOAuthRedirectTo()).toBe('app.dropin.playdate://')
  })

  it('is not an https origin, and leaves the web target alone', () => {
    expect(nativeOAuthRedirectTo()).not.toContain('https:')
    // The web half must stay byte-for-byte (the regression lane for this slice).
    expect(oauthRedirectTo('https://dropin.example')).toBe('https://dropin.example/')
    expect(oauthRedirectTo('http://localhost:5173///')).toBe('http://localhost:5173/')
  })
})

describe('parseOAuthReturn (slice 2c: implicit flow, tokens in the FRAGMENT)', () => {
  // The exact tail GoTrue appends for an implicit-flow success.
  const fragment =
    'access_token=at-123&expires_in=3600&refresh_token=rt-456&token_type=bearer&type=recovery'

  it('reads the tokens out of the fragment', () => {
    expect(parseOAuthReturn(returnUrl(`#${fragment}`))).toEqual({
      status: 'session',
      accessToken: 'at-123',
      refreshToken: 'rt-456',
    })
  })

  it('reads a cancellation out of the query, where the server puts errors', () => {
    expect(
      parseOAuthReturn(returnUrl('?error=access_denied&error_description=User+denied+access')),
    ).toEqual({ status: 'error', message: 'User denied access' })
  })

  it('falls back to the error code when no description came with it', () => {
    expect(parseOAuthReturn(returnUrl('?error=server_error'))).toEqual({
      status: 'error',
      message: 'server_error',
    })
  })

  it('lets a URL carrying both report the failure, not a half sign-in', () => {
    expect(
      parseOAuthReturn(returnUrl(`?error=access_denied#${fragment}`)),
    ).toEqual({ status: 'error', message: 'access_denied' })
  })

  it('refuses a half session rather than calling a partial return a sign-in', () => {
    expect(parseOAuthReturn(returnUrl('#access_token=at-123'))).toEqual({
      status: 'none',
    })
    expect(parseOAuthReturn(returnUrl('#refresh_token=rt-456'))).toEqual({
      status: 'none',
    })
    expect(parseOAuthReturn(returnUrl('#access_token=&refresh_token='))).toEqual({
      status: 'none',
    })
  })

  it('is a no-op for anything else — including a PKCE ?code, which this client cannot produce', () => {
    // PKCE would arrive as `?code=…` and needs exchangeCodeForSession. It is
    // NOT handled, because `flowType` is 'implicit' (see parseOAuthReturn's
    // docblock); this pin is what makes that a known shape instead of a silent
    // surprise, and the caller warns rather than swallowing it.
    expect(parseOAuthReturn(returnUrl('?code=abc'))).toEqual({ status: 'none' })
    expect(parseOAuthReturn('https://dropin.example/?code=abc')).toEqual({ status: 'none' })
    expect(parseOAuthReturn(returnUrl(''))).toEqual({ status: 'none' })
    expect(parseOAuthReturn('')).toEqual({ status: 'none' })
  })
})

/**
 * Slice 2c fix round 1 — AN EMPTY `error_description` MUST NOT RENDER NOTHING.
 *
 * These pin the COMPOSED sentence, not the intermediate value: /login renders
 * `{error ? <p>…</p> : null}`, so the only thing standing between a failed round
 * trip and a blank screen is this function returning a non-empty string. A test
 * asserting the parse result alone would have passed with the `??` this fix
 * replaces.
 */
describe('the failure sentence can never be empty (slice 2c fix round 1)', () => {
  /** The sentence a parent would actually read for this return URL. */
  function sentenceFor(returnUrl: string): string {
    const parsed = parseOAuthReturn(returnUrl)
    return parsed.status === 'error' ? oauthReturnErrorMessage(parsed.message) : ''
  }

  it('falls through a PRESENT-BUT-EMPTY error_description to the code', () => {
    // `?error_description=` is the shape that defeated `??`: the key EXISTS and
    // is '', and `'' ?? error` is ''. Measured, not hypothesised.
    expect(
      parseOAuthReturn(returnUrl('?error=access_denied&error_description=')),
    ).toEqual({ status: 'error', message: 'access_denied' })
    expect(sentenceFor(returnUrl('?error=access_denied&error_description='))).toBe(
      'Sign-in was cancelled.',
    )
  })

  it('treats a WHITESPACE-ONLY description as absent, so the specific sentence survives', () => {
    // Fix round 2: `||` alone called `' '` present, so this shape lost
    // "Sign-in was cancelled." and got the generic fallback instead — a worse
    // sentence, and a false one. `?.trim() ||` is what makes it fall through.
    expect(parseOAuthReturn(returnUrl('?error=access_denied&error_description=%20'))).toEqual({
      status: 'error',
      message: 'access_denied',
    })
    expect(sentenceFor(returnUrl('?error=access_denied&error_description=%20'))).toBe(
      'Sign-in was cancelled.',
    )
    expect(sentenceFor(returnUrl('?error=access_denied&error_description=+++'))).toBe(
      'Sign-in was cancelled.',
    )
    // A description with real content wins over the code, trimmed.
    expect(parseOAuthReturn(returnUrl('?error=x&error_description=+User+denied+'))).toEqual({
      status: 'error',
      message: 'User denied',
    })
  })

  it('says a sentence for a bare error with no code and no description at all', () => {
    expect(sentenceFor(returnUrl('?error='))).toBe('Could not finish sign-in. Try again.')
    expect(sentenceFor(returnUrl('#error='))).toBe('Could not finish sign-in. Try again.')
    expect(sentenceFor(returnUrl('?error=&error_description='))).toBe(
      'Could not finish sign-in. Try again.',
    )
    // A whitespace-only CODE is absent too, and reaches the same fallback.
    expect(sentenceFor(returnUrl('?error=%20'))).toBe('Could not finish sign-in. Try again.')
  })

  it('renders a sentence for EVERY error shape, which is the property that matters', () => {
    for (const url of [
      returnUrl('?error=access_denied'),
      returnUrl('?error=access_denied&error_description='),
      returnUrl('?error=access_denied&error_description=%20'),
      returnUrl('?error=access_denied&error_description=User+denied'),
      returnUrl('?error='),
      returnUrl('#error='),
      returnUrl('#error=&error_description='),
      returnUrl('?error=%20'),
    ]) {
      expect(sentenceFor(url).trim(), `${url} must produce a sentence`).not.toBe('')
    }
  })
})

describe('oauthReturnErrorMessage (slice 2c: failures said as sentences)', () => {
  it('turns a provider cancellation into the sentence the email path shows', () => {
    expect(oauthReturnErrorMessage('access_denied')).toBe('Sign-in was cancelled.')
  })

  it('is the SAME mapping oauthErrorMessage uses for its non-provider arm', () => {
    expect(oauthErrorMessage('google', 'access_denied')).toBe(
      oauthReturnErrorMessage('access_denied'),
    )
    expect(oauthErrorMessage('facebook', 'network timeout')).toBe(
      oauthReturnErrorMessage('network timeout'),
    )
  })

  it('passes an unknown failure through untouched', () => {
    expect(oauthReturnErrorMessage('network timeout')).toBe('network timeout')
  })

  it('never returns an empty sentence — the blank-screen guarantee, at its root', () => {
    // The root-cause half of the fix: whatever entry point composes the message
    // (the parser, a provider error, a `setSession` failure with no message),
    // an empty one leaves here as a sentence.
    expect(oauthReturnErrorMessage('')).toBe('Could not finish sign-in. Try again.')
    expect(oauthReturnErrorMessage('   ')).toBe('Could not finish sign-in. Try again.')
    expect(oauthErrorMessage('google', '')).toBe('Could not finish sign-in. Try again.')
  })
})

/**
 * Slice 2c, fix round 2 — THE SCHEME LIVES IN EXACTLY ONE PLACE IN `src/`, AND
 * EVERY OTHER STATEMENT OF IT IS CHECKED AGAINST THAT ONE.
 *
 * The three statements of the value that no compiler connects:
 *
 *   1. `NATIVE_OAUTH_SCHEME` (the single home — every other use derives from it);
 *   2. `AndroidManifest.xml`'s `<data android:scheme>`, which is what the OS
 *      matches to hand the URL back at all;
 *   3. `capacitor.config.ts`'s `appId`, the package the scheme is built from —
 *      a value its own comment says is free to change until the first Play
 *      upload.
 *
 * Drift between any two of them means the OAuth return SILENTLY never fires, and
 * nothing in src/ or scripts/guards/ compared them. The fourth statement — the
 * `redirectTo` the shell branch actually hands Supabase — is pinned in
 * db-native-oauth.test.ts, which asserts it equals `nativeOAuthRedirectTo()`
 * rather than re-typing the string.
 *
 * ⚠️ THE TAUTOLOGICAL THIRD LEG IS GONE (fix round 2). It asserted
 * `nativeOAuthRedirectTo()` starts with `${NATIVE_OAUTH_SCHEME}://` — which is
 * literally that function's body, so no mutation could ever make it red. A leg
 * that cannot fail is a leg that reports green forever; the reviewer proved it
 * by drifting both the manifest and the constant with this test still passing.
 *
 * WHY A VITEST TEST AND NOT A `scripts/guards/` ENTRY: this repo's guard
 * discipline (docs/agents/borrowed-guards.md) requires a written rule in the
 * build law PLUS a `.check.mjs` seeded proof that the guard can fire, and a
 * second copy of the manifest fixture to drive it — disproportionate for two
 * string equalities that a three-line read of the real files settles. This runs
 * inside `npm run verify` with the rest of the unit lane, and its own red-green
 * proof (change either file, watch this go red) is the same evidence standard.
 */
describe('the native scheme cannot drift (slice 2c)', () => {
  /** The manifest with its comments removed — prose must not satisfy a pin. */
  const manifest = androidManifestSource.replace(/<!--[\s\S]*?-->/g, '')
  /**
   * The config with ITS comments removed, for the same reason (fix round 2):
   * this file's docblock NAMES `app.dropin.playdate`, so a raw read is an
   * instrument its own prose could satisfy — the exact failure the manifest leg
   * already guards against. Block comments first, then whole-line `//` comments;
   * a trailing `//` inside a string is deliberately left alone.
   */
  const config = capacitorConfigSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('matches the ACTION_VIEW/BROWSABLE intent filter the OS actually routes on', () => {
    const oauthFilter = [...manifest.matchAll(/<intent-filter>([\s\S]*?)<\/intent-filter>/g)]
      .map((match) => match[1])
      .find((body) => /<action\s+android:name="android\.intent\.action\.VIEW"\s*\/>/.test(body))

    expect(oauthFilter, 'no ACTION_VIEW intent filter in AndroidManifest.xml').toBeDefined()
    // BROWSABLE is what lets a browser redirect target it at all; without it the
    // filter matches nothing we need.
    expect(oauthFilter).toMatch(/android\.intent\.category\.BROWSABLE/)

    expect(oauthFilter?.match(/<data\s+android:scheme="([^"]+)"\s*\/>/)?.[1]).toBe(
      NATIVE_OAUTH_SCHEME,
    )
  })

  it("matches capacitor.config.ts's appId, the package the scheme is built from", () => {
    expect(config.match(/appId:\s*'([^']+)'/)?.[1]).toBe(NATIVE_OAUTH_SCHEME)
  })
})

describe('suggestedHandle', () => {
  it('prefers the provider full name', () => {
    expect(suggestedHandle({ full_name: 'Jon Meisburg', name: 'Jon' }, 'jon@x.com')).toBe(
      'Jon Meisburg',
    )
  })

  it('falls back through name, user_name, then the email local part', () => {
    expect(suggestedHandle({ name: 'Nicole' }, 'nicole@x.com')).toBe('Nicole')
    expect(suggestedHandle({ user_name: 'nic' }, 'nicole@x.com')).toBe('nic')
    expect(suggestedHandle({}, 'nicole@x.com')).toBe('nicole')
  })

  it('trims and caps at the 40-char display-name limit', () => {
    expect(suggestedHandle({ full_name: '  Jon  ' }, null)).toBe('Jon')
    expect(suggestedHandle({ full_name: 'x'.repeat(80) }, null)).toHaveLength(40)
  })

  it('returns empty when there is nothing to suggest', () => {
    expect(suggestedHandle(null, null)).toBe('')
    expect(suggestedHandle({ full_name: '   ' }, undefined)).toBe('')
  })
})

describe('resolveOAuthProviders', () => {
  it('defaults to Google when the env value is unset or empty', () => {
    expect(resolveOAuthProviders(undefined).map((p) => p.id)).toEqual(['google'])
    expect(resolveOAuthProviders('').map((p) => p.id)).toEqual(['google'])
    expect(resolveOAuthProviders('   ').map((p) => p.id)).toEqual(['google'])
  })

  it('honours an explicit list, in the order given', () => {
    expect(resolveOAuthProviders('google,facebook').map((p) => p.id)).toEqual([
      'google',
      'facebook',
    ])
    expect(resolveOAuthProviders('facebook').map((p) => p.id)).toEqual(['facebook'])
  })

  it('is case- and whitespace-tolerant and drops duplicates', () => {
    expect(resolveOAuthProviders(' Google , google ,FACEBOOK ').map((p) => p.id)).toEqual([
      'google',
      'facebook',
    ])
  })

  it('drops names it does not know rather than rendering a dead button', () => {
    expect(resolveOAuthProviders('google,twitter,github').map((p) => p.id)).toEqual(['google'])
    // ...but an all-unknown value still falls back to a usable default.
    expect(resolveOAuthProviders('twitter').map((p) => p.id)).toEqual(['google'])
  })

  it('labels the buttons for humans', () => {
    expect(resolveOAuthProviders('google,facebook').map((p) => p.label)).toEqual([
      'Continue with Google',
      'Continue with Facebook',
    ])
    expect(providerLabel('facebook')).toBe('Facebook')
  })
})
describe('probeOAuthProvider', () => {
  const url = 'https://project.supabase.co/auth/v1/authorize?provider=google'

  it('passes an opaque redirect through (the provider will answer)', async () => {
    const fetchImpl = (async () => ({ type: 'opaqueredirect', ok: false, status: 0 })) as unknown as typeof fetch
    expect(await probeOAuthProvider(url, fetchImpl)).toBeNull()
  })

  it('reports the message a not-enabled provider answers with', async () => {
    const fetchImpl = (async () => ({
      type: 'basic',
      ok: false,
      status: 400,
      json: async () => ({ msg: 'Unsupported provider: provider is not enabled' }),
    })) as unknown as typeof fetch
    expect(await probeOAuthProvider(url, fetchImpl)).toBe(
      'Unsupported provider: provider is not enabled',
    )
  })

  it('falls back to the status when the body is not JSON', async () => {
    const fetchImpl = (async () => ({
      type: 'basic',
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('not json')
      },
    })) as unknown as typeof fetch
    expect(await probeOAuthProvider(url, fetchImpl)).toBe('Sign-in failed (HTTP 503).')
  })

  it('never blocks a sign-in because the probe itself failed (CORS/offline)', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await probeOAuthProvider(url, fetchImpl)).toBeNull()
  })

  it('treats a 200 as fine', async () => {
    const fetchImpl = (async () => ({ type: 'basic', ok: true, status: 200 })) as unknown as typeof fetch
    expect(await probeOAuthProvider(url, fetchImpl)).toBeNull()
  })
})
/**
 * V20 t06: the two name fields on /onboarding's handle step are seeded from
 * the provider's single full-name string, so the split is a rule that has to
 * hold — and the failure mode it guards against is a form prefilled with
 * something the parent never wrote.
 */
describe('splitSuggestedName (V20 t06: provider name -> the two fields)', () => {
  it('splits a two-word name', () => {
    expect(splitSuggestedName('Sam Rivera')).toEqual({ first: 'Sam', last: 'Rivera' })
  })

  it('keeps everything after the first word as the last name (middle names survive)', () => {
    expect(splitSuggestedName('Mary Jo van der Berg')).toEqual({
      first: 'Mary',
      last: 'Jo van der Berg',
    })
  })

  it('puts a single word in the first name and leaves the last name empty', () => {
    expect(splitSuggestedName('Sam')).toEqual({ first: 'Sam', last: '' })
  })

  it('flips a surname-first "Last, First" listing', () => {
    expect(splitSuggestedName('Rivera, Sam')).toEqual({ first: 'Sam', last: 'Rivera' })
  })

  it('returns two empty halves for no name at all', () => {
    expect(splitSuggestedName('')).toEqual({ first: '', last: '' })
    expect(splitSuggestedName('   ')).toEqual({ first: '', last: '' })
  })

  it('collapses whitespace and trims before splitting', () => {
    expect(splitSuggestedName('  Sam   Rivera  ')).toEqual({ first: 'Sam', last: 'Rivera' })
  })

  it('caps each half at the field\'s own 40-character maxLength', () => {
    const parts = splitSuggestedName(`${'A'.repeat(60)} ${'B'.repeat(60)}`)
    expect(parts.first).toHaveLength(40)
    expect(parts.last).toHaveLength(40)
  })

  it('round-trips through composeDisplayName for the ordinary shapes', () => {
    // The two seams are used together on /onboarding (split to seed the fields,
    // compose to write the handle), so the common cases must survive the trip.
    for (const name of ['Sam Rivera', 'Mary Jo van der Berg', 'Sam', 'Rivera, Sam']) {
      const parts = splitSuggestedName(name)
      const roundTripped = `${parts.first} ${parts.last}`.trim()
      expect(roundTripped.split(/\s+/).sort().join(' ')).toBe(
        name.replace(',', '').split(/\s+/).sort().join(' '),
      )
    }
  })
})
