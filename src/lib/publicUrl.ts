/**
 * WHAT IS OUR PUBLIC ADDRESS? — the one place that answers it.
 *
 * THE DEFECT THIS CLOSES (native plan slice 1). Inside the Capacitor shell the
 * web layer is served from `https://localhost` — that is a real origin to the
 * WebView and a meaningless one to everybody else. Four call sites handed that
 * origin to Supabase or to a link builder, and in the shell each of them broke
 * in the same way:
 *
 *   1. Google OAuth `redirectTo` — the provider is told to return to
 *      `https://localhost`, which no browser can reach.
 *   2. The password-reset email — the link lands in someone's inbox and points
 *      at a host that exists only inside their own phone.
 *   3. Share links — `https://localhost/playdate/<id>` is useless to the friend
 *      it is sent to.
 *   4. The email transport's base URL — the same class, from the server side.
 *
 * Two of the four already consulted `VITE_PUBLIC_BASE_URL` first; the other two
 * did not, and none of them agreed on what to do when it was absent. So the rule
 * lives here, once, and the call sites ask a question instead of re-deciding it.
 *
 * THE RULE, in order:
 *   - the configured `VITE_PUBLIC_BASE_URL` wins, always (that is the deployment
 *     telling us where it lives);
 *   - otherwise a browser tab answers with its own origin, which is correct;
 *   - otherwise — the shell, with nothing configured — the app's canonical home
 *     on the public web. **A native build must never emit a localhost link**, and
 *     this fallback is what makes that true even when a build forgets the
 *     variable.
 *
 * ⚠️ WHAT THIS DOES *NOT* FIX, recorded rather than implied: OAuth inside the
 * shell still needs the DEEP-LINK return (plan slice 3) before it can work — a
 * session that finishes in the phone's browser does not come back to the app on
 * its own. This module stops the shell from emitting a broken ADDRESS; it does
 * not build the return path.
 */

import { FALLBACK_BASE_URL } from '../../supabase/functions/_shared/emailCopy.ts'

/** Capacitor's default `androidScheme`/iOS scheme: the shell's own origin. */
export const NATIVE_SHELL_ORIGIN = 'https://localhost'

/**
 * The app's canonical public home, used ONLY when a native build has no
 * `VITE_PUBLIC_BASE_URL` — see the module header.
 *
 * IT IS NOT A NEW LITERAL: it is the email layer's own `FALLBACK_BASE_URL`
 * (`supabase/functions/_shared/emailCopy.ts:67`), reused so the address a native
 * build falls back to and the address an email with an empty base falls back to
 * cannot drift into two different URLs. A shell that cannot name its own web
 * address must not invent one.
 */
export const NATIVE_PUBLIC_FALLBACK = FALLBACK_BASE_URL

/** Trim and strip trailing slashes, so `…/` and `…` cannot build `…//path`. */
export function normalizeBaseUrl(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/\/+$/, '')
}

/** Is this origin the native shell's own, i.e. `https://localhost`? */
export function isNativeShellOrigin(origin: string | null | undefined): boolean {
  const base = normalizeBaseUrl(origin)
  if (base === '') return false
  return base === NATIVE_SHELL_ORIGIN || base.startsWith(`${NATIVE_SHELL_ORIGIN}:`)
}

/**
 * The origin every OUTBOUND link must use. Pure, so the three branches and the
 * shell fallback are pinned without a browser.
 */
export function resolvePublicOrigin(input: {
  configured: string | null | undefined
  origin: string | null | undefined
}): string {
  const configured = normalizeBaseUrl(input.configured)
  if (configured !== '') return configured
  const origin = normalizeBaseUrl(input.origin)
  if (isNativeShellOrigin(origin)) return NATIVE_PUBLIC_FALLBACK
  return origin
}

/**
 * The runtime edge: the ONLY place that reads the environment and `window`.
 * Everything above is pure and injected; this is the three lines that supply
 * the real values, so the four call sites neither touch `window` nor re-decide
 * the rule.
 */
export function currentPublicOrigin(): string {
  const configured = import.meta.env?.VITE_PUBLIC_BASE_URL as string | undefined
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const resolved = resolvePublicOrigin({ configured, origin })

  // A NATIVE BUILD WITHOUT ITS PUBLIC URL IS A BUILD DEFECT, and it must not be
  // a silent one. The fallback keeps the links working, so nothing looks broken —
  // but OAuth's return path and (later) deep links are wrong in a way nobody sees
  // until a parent cannot sign in. One line, where a developer will read it.
  if (isNativeShellOrigin(origin) && normalizeBaseUrl(configured) === '') {
    console.warn(
      `[publicUrl] native shell has no VITE_PUBLIC_BASE_URL — falling back to ${NATIVE_PUBLIC_FALLBACK}. ` +
        "Set it in the build: the shell's own origin (https://localhost) is unreachable from an email or a share link.",
    )
  }
  return resolved
}
