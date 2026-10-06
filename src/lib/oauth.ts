/**
 * Social sign-in seams (V4 slice 4) — pure, so they are unit-testable without
 * a browser or a network, the same discipline as lib/auth.ts and
 * lib/onboarding.ts. The provider round-trip itself is Supabase's job
 * (signInWithOAuthProvider in db.ts); everything the APP decides lives here.
 *
 * These buttons do nothing until the providers are enabled in the Supabase
 * project (Google Cloud + Meta credentials, then the dashboard toggle) — see
 * docs/social-login-setup.md. Until then Supabase answers "Unsupported
 * provider: provider is not enabled", which oauthErrorMessage turns into a
 * human sentence instead of a raw string in the form.
 */
export type OAuthProvider = 'google' | 'facebook'

export interface OAuthProviderOption {
  id: OAuthProvider
  label: string
}

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: 'Google',
  facebook: 'Facebook',
}

const KNOWN_PROVIDERS: readonly OAuthProvider[] = ['google', 'facebook']

/**
 * Which providers this deployment actually offers (D3, decided 2026-09-11:
 * ship Google, keep Facebook built but switched off). Driven by
 * `VITE_OAUTH_PROVIDERS` so turning Facebook on later is a config change, not
 * a code change — and so a button is never rendered for a provider the
 * Supabase project does not have enabled.
 *
 * Unknown names are dropped rather than rendered; an empty or unset value
 * falls back to Google, because a login screen with no way in is worse than a
 * default.
 */
export function resolveOAuthProviders(raw: string | undefined): OAuthProviderOption[] {
  const known: readonly string[] = KNOWN_PROVIDERS
  const requested = (raw ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name): name is OAuthProvider => known.includes(name))
  const chosen: OAuthProvider[] = requested.length > 0 ? [...new Set(requested)] : ['google']
  return chosen.map((id) => ({ id, label: `Continue with ${PROVIDER_LABELS[id]}` }))
}

/** The bare provider name, for messages ("Google sign-in isn't switched on"). */
export function providerLabel(provider: OAuthProvider): string {
  return PROVIDER_LABELS[provider]
}

/**
 * Where the provider sends the browser back to. Origin-based rather than a
 * hardcoded host, so localhost, the LAN dev server, and a future deployment
 * all work; the Supabase redirect allowlist is the server-side half of the
 * same rule. Trailing slashes are collapsed so the two can never disagree
 * over "http://host" vs "http://host/".
 *
 * The SPA needs no return path in the URL: the signed-out "I'm coming" intent
 * already lives in sessionStorage (lib/trust.ts), and the shell applies it
 * once the gate settles — so an OAuth sign-in returns to the same place an
 * email sign-in does.
 */
export function oauthRedirectTo(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/`
}

/**
 * The shell's own URL scheme (slice 2c). `capacitor.config.ts`'s `appId`,
 * named once: the same string `AndroidManifest.xml` registers as an intent
 * filter and the one the Supabase project's redirect allowlist must carry.
 */
export const NATIVE_OAUTH_SCHEME = 'app.dropin.playdate'

/**
 * Where the provider returns to INSIDE THE SHELL — the custom scheme, NOT an
 * https origin.
 *
 * `oauthRedirectTo`'s origin is unreachable from the phone's own browser: in
 * the shell that origin is `https://localhost`, which exists only inside the
 * WebView (see `lib/publicUrl.ts`). The scheme is what the operating system can
 * hand back to the app, and that hand-back IS the return this slice adds.
 *
 * No path, and therefore no host either: the session rides in the URL's
 * fragment (see `parseOAuthReturn`), so nothing here needs to address a route —
 * and the string the app emits stays identical to the allowlist entry.
 *
 * ⚠️ This is deliberately NOT slice 3's https App Links: those need
 * `assetlinks.json` served from production and exist to open SHARED links. Do
 * not merge the two.
 */
export function nativeOAuthRedirectTo(): string {
  return `${NATIVE_OAUTH_SCHEME}://`
}

/**
 * What a provider round trip handed back to the shell.
 *
 * ⚠️ THE SHAPE IS THE FLOW TYPE, NOT A GUESS. `createClient(url, anonKey)`
 * (db.ts) passes no `flowType`, so supabase-js's default applies — and in
 * @supabase/supabase-js 2.115.0 that default IS `'implicit'`
 * (`@supabase/auth-js/dist/main/GoTrueClient.js:24`, bundled into
 * `@supabase/supabase-js/dist/index.mjs:40`). An implicit return arrives with
 * the tokens in the URL **fragment** (`#access_token=…`), which is the
 * `session` arm below.
 *
 * A `?code=` (PKCE) return is deliberately NOT handled: it cannot happen while
 * the flow above is in force, and a handler written for a flow nobody turned on
 * is exactly the guess this type exists to avoid. If `flowType: 'pkce'` is ever
 * set, the `none` arm below is what starts firing — and this is the one place
 * that changes (exchangeCodeForSession).
 */
export type OAuthReturn =
  | { status: 'session'; accessToken: string; refreshToken: string }
  | { status: 'error'; message: string }
  | { status: 'none' }

/**
 * Read a return URL.
 *
 * Deep-link URLs are opaque-ish (`app.dropin.playdate://#…`), and WHATWG `URL`
 * parses a non-special scheme and its empty authority as an edge case, so the
 * query and the fragment are read with `URLSearchParams` rather than by asking
 * `URL` to make sense of the whole string. Success is in the fragment and a
 * failure comes back in the query, which is why both are read and the fragment
 * wins a key they share.
 *
 * An `error` beats tokens: a URL carrying both is a failed round trip, and
 * "Sign-in was cancelled." is the answer the parent needs.
 */
export function parseOAuthReturn(returnUrl: string): OAuthReturn {
  const hashAt = returnUrl.indexOf('#')
  const fragment = hashAt === -1 ? '' : returnUrl.slice(hashAt + 1)
  const beforeHash = hashAt === -1 ? returnUrl : returnUrl.slice(0, hashAt)
  const queryAt = beforeHash.indexOf('?')
  const query = queryAt === -1 ? '' : beforeHash.slice(queryAt + 1)

  const params = new URLSearchParams(fragment)
  for (const [key, value] of new URLSearchParams(query)) {
    if (!params.has(key)) params.set(key, value)
  }

  const error = params.get('error')
  if (error !== null) {
    // `||`, NOT `??` — and `.trim()`, because `||` alone treats a
    // WHITESPACE-ONLY description as present. Both shapes are measured: with
    // `??`, `?error=access_denied&error_description=` yields `''` and the parent
    // reads nothing at all; with a bare `||`,
    // `?error=access_denied&error_description=%20` yields `' '` and the parent
    // reads the generic fallback INSTEAD of "Sign-in was cancelled." — a worse
    // sentence, and a false one. A blank description falls back to the code, and
    // a blank code falls through to `oauthReturnErrorMessage`'s own sentence.
    return { status: 'error', message: params.get('error_description')?.trim() || error }
  }

  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (accessToken && refreshToken) {
    return { status: 'session', accessToken, refreshToken }
  }

  return { status: 'none' }
}

/**
 * A provider failure, said like a person would say it. The "not enabled" case
 * is the EXPECTED answer until the console setup is done, so it must never
 * read as a bug — and it must never be a silent no-op.
 */
export function oauthErrorMessage(provider: OAuthProvider, message: string): string {
  if (/not enabled|unsupported provider/i.test(message)) {
    return `${providerLabel(provider)} sign-in isn’t switched on yet — use your email and password for now.`
  }
  return oauthReturnErrorMessage(message)
}

/**
 * The same sentence, for a failure that came back ALONG THE RETURN PATH, where
 * the URL names no provider. Exactly one arm of `oauthErrorMessage` can apply
 * there: "not enabled" is impossible by construction, because a provider that
 * is switched off answers the authorize endpoint with a 400 instead of a
 * redirect (`probeOAuthProvider`), so the browser is never sent to it and
 * nothing can come back. The mapping itself lives once, here, so the two
 * entries cannot drift.
 *
 * ⚠️ THIS FUNCTION NEVER RETURNS AN EMPTY SENTENCE — and the claim is stated no
 * wider than that, because the code does not hold wider. /login renders
 * `{error ? <p>…</p> : null}`, so an empty message is a failure the parent is
 * never told about, and four measured shapes reach here with one: a
 * present-but-empty `error_description`, a whitespace-only one, a bare
 * `?error=` with no code at all, and a `setSession` failure whose own `message`
 * is empty. The fallback lives here, where the RETURN PATH's messages are
 * composed, rather than at each of those call sites.
 *
 * ⚠️ IT DOES NOT COVER THE EMAIL/PASSWORD PATH, and saying so is the point of
 * this paragraph. `LoginPage.handleSubmit` composes its own message
 * (`err instanceof Error ? err.message : …`) and guards the same render with
 * `{error ? … : null}`, so an `Error` with an empty message raised there still
 * renders NOTHING. That is pre-existing, is not this slice's to change, and is
 * NOT fixed by this function: the two entry points share a render site, not a
 * mapping.
 */
export function oauthReturnErrorMessage(message: string): string {
  if (/cancel|closed|denied|access_denied/i.test(message)) {
    return 'Sign-in was cancelled.'
  }
  return message.trim() === '' ? 'Could not finish sign-in. Try again.' : message
}

/**
 * Ask the authorize endpoint whether it will ACTUALLY redirect, before the
 * browser is sent there.
 *
 * Found by clicking the button against the live project: a provider that is
 * not enabled answers `400 {"msg":"Unsupported provider: provider is not
 * enabled"}` instead of a 302, so `signInWithOAuth` navigated the user onto
 * Supabase's raw JSON error page. That is precisely the silent-failure
 * experience this slice forbids, so the URL is probed first.
 *
 * Returns a message when the provider is known to be unavailable, or null
 * when it is fine — or when the answer is unreadable. An opaque redirect
 * (the good case, cross-origin) and a CORS refusal both mean "assume it
 * works": a probe must never be the reason a working sign-in is blocked.
 * `fetchImpl` is injected so the three outcomes are unit-testable.
 */
export async function probeOAuthProvider(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(url, { redirect: 'manual', mode: 'cors' })
    if (response.type === 'opaqueredirect' || response.ok) return null
    const body = (await response.json().catch(() => null)) as { msg?: string } | null
    return body?.msg ?? `Sign-in failed (HTTP ${response.status}).`
  } catch {
    return null
  }
}

/**
 * The display name to suggest to a first-time OAuth user (they arrive with a
 * session but no profiles row — the handle step on /onboarding collects it).
 * Provider metadata is untrusted free text, so this only ever produces a
 * trimmed, length-capped candidate: uniqueness and validity are still decided
 * by createProfile (the profiles_display_name_key unique constraint).
 */
export function suggestedHandle(
  metadata: Record<string, unknown> | null | undefined,
  email: string | null | undefined,
): string {
  const candidates = [metadata?.full_name, metadata?.name, metadata?.user_name, email?.split('@')[0]]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim().slice(0, 40)
    }
  }
  return ''
}

/**
 * V20 t06 — split a SUGGESTED full name into the two name fields.
 *
 * `/onboarding`'s handle step used to be one "Display name" box seeded with
 * `suggestedHandle`'s answer whole ("Sam Rivera"). V20 t06 turned that step
 * into the same FIRST NAME + LAST NAME pair the signup form now uses, so the
 * suggestion has to be taken apart to seed them — and the provider hands us one
 * string, so the split has to be decided somewhere testable.
 *
 * The rules, in order, each a deliberate choice:
 *
 *  1. **No name at all → both empty.** The fields stay blank rather than
 *     prefilled with the email's local part: "sam.rivera@gmail.com" is not a
 *     name, and splitting it on the dot would put halves in a form the parent
 *     never wrote.
 *  2. **One word → the FIRST name only**, last name empty. The last name field
 *     is optional (the composed handle is valid with either half), and guessing
 *     that "Sam" is a surname would be inventing data.
 *  3. **Two or more words → the first word, and EVERYTHING AFTER IT.** So
 *     "Mary Jo van der Berg" becomes "Mary" + "Jo van der Berg" rather than
 *     losing the middle names.
 *  4. **A comma flips the order**: "Rivera, Sam" is a SURNAME-first listing, so
 *     the part before the comma is the last name. This is the one shape where
 *     taking word 1 as the first name would be reliably wrong.
 *
 * The 40-character cap on each half matches the inputs' own `maxLength` in the
 * two forms; it is applied here so a 60-character provider name cannot arrive
 * as a value the field would reject.
 */
export function splitSuggestedName(suggested: string): { first: string; last: string } {
  const name = suggested.replace(/\s+/g, ' ').trim()
  if (name === '') return { first: '', last: '' }

  const comma = name.indexOf(',')
  if (comma > 0) {
    // "Rivera, Sam" — surname first, so the halves swap.
    return {
      first: name.slice(comma + 1).trim().slice(0, 40),
      last: name.slice(0, comma).trim().slice(0, 40),
    }
  }

  const parts = name.split(' ')
  return {
    first: (parts[0] ?? '').slice(0, 40),
    last: parts.slice(1).join(' ').slice(0, 40),
  }
}
