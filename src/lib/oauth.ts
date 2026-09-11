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

/** The providers offered on /login, in display order. */
export const OAUTH_PROVIDERS: readonly OAuthProviderOption[] = [
  { id: 'google', label: `Continue with ${PROVIDER_LABELS.google}` },
  { id: 'facebook', label: `Continue with ${PROVIDER_LABELS.facebook}` },
]

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
 * A provider failure, said like a person would say it. The "not enabled" case
 * is the EXPECTED answer until the console setup is done, so it must never
 * read as a bug — and it must never be a silent no-op.
 */
export function oauthErrorMessage(provider: OAuthProvider, message: string): string {
  if (/not enabled|unsupported provider/i.test(message)) {
    return `${providerLabel(provider)} sign-in isn’t switched on yet — use your email and password for now.`
  }
  if (/cancel|closed|denied|access_denied/i.test(message)) {
    return 'Sign-in was cancelled.'
  }
  return message
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
