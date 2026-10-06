/**
 * The FCM HTTP v1 adapter — DENO-SIDE, and the ONLY place in the repository
 * where the OAuth2 detail, the crypto import and an HTTP call to Google appear.
 *
 * WHY THIS IS A SEPARATE FILE FROM `_shared/nativePush.ts`, AND WHY THAT SPLIT
 * IS LOAD-BEARING: the pure module holds the request shape and the
 * dead-token/retry verdict, so vitest can pin them under plain Node. This file
 * holds what cannot be pure — signing a JWT, minting an access token, POSTing
 * to FCM — and is proven by `fcmDeno_test.ts`, which runs THE REAL ADAPTER
 * (JWT signing included) against fake token and message endpoints. The lesson
 * from the SMTP slice is the reason this file exists at all: a type-checked
 * adapter is NOT a tested adapter, and the credential that makes this file run
 * for real is the founder's, which the test deliberately does not need.
 *
 * WHAT IS REAL IN THE TEST AND WHAT IS FAKED. The RSA key is generated in the
 * test, the JWT is signed by the real `crypto.subtle` path and then VERIFIED
 * there with the matching public key; the network is the fake (`FetchLike`),
 * because the point is our request bytes, not Google's availability. No live
 * socket, no credentials, no real Google call.
 *
 * THE TOKEN IS CACHED UNTIL NEAR EXPIRY. An FCM drain can send hundreds of
 * messages per invocation, and minting a token per message would be hundreds of
 * RSA signatures and hundreds of round trips. The cache is closure state on the
 * transport, which `send-push/index.ts` creates ONCE at module scope, so a warm
 * isolate reuses it and a cold isolate mints once. The window is bounded on the
 * SAFE side (see `TOKEN_REFRESH_MARGIN_MS`), so a token is never used past its
 * own expiry.
 *
 * NOTHING HERE LOGS, AND NOTHING HERE ECHOES, THE SERVICE-ACCOUNT KEY. The only
 * strings that ever leave this module are the provider's own statuses/messages
 * (`nativePushFailure`), which cannot contain the key: a rejected key produces
 * `invalid_grant` and the key material is never in the request body Google
 * answers about.
 */
import {
  buildFcmMessage,
  nativePushCredentialFailure,
  nativePushFailure,
  type FcmServiceAccount,
  type FetchLike,
  type NativePushRequest,
  type NativePushResult,
} from './nativePush.ts'

/** Google's OAuth2 token endpoint (the JWT-bearer grant). */
export const FCM_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

/** The one scope FCM HTTP v1 needs (Google's own discovery document). */
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'

/** The v1 send base; the project id and `messages:send` complete the URL. */
export const FCM_SEND_BASE = 'https://fcm.googleapis.com/v1/projects'

/** RFC 7523: the assertion grant the service-account JWT is presented with. */
export const FCM_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer'

/**
 * How long before the token's own expiry it is treated as stale. 60s absorbs
 * clock skew and a slow request without ever presenting an expired token.
 */
export const TOKEN_REFRESH_MARGIN_MS = 60_000

/** The assertion's lifetime. Google accepts up to an hour. */
const ASSERTION_LIFETIME_SECONDS = 3600

export interface FcmDeps {
  /** Real `fetch` in production; a fake in the test. */
  fetch: FetchLike
  /** Injectable clock (ms since epoch) so the cache window is testable. */
  now?: () => number
}

export interface FcmTransport {
  /** Send one message. Resolves on EVERY path — it never throws. */
  send(request: NativePushRequest): Promise<NativePushResult>
}

// ─────────────────────────────────────────────────────────────────────────────
// base64url + PEM, the only two encoding details.
// ─────────────────────────────────────────────────────────────────────────────

const encoder = new TextEncoder()

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlFromJson(value: unknown): string {
  return base64UrlFromBytes(encoder.encode(JSON.stringify(value)))
}

/**
 * A PKCS#8 PEM (Google's `private_key`) as the DER bytes `crypto.subtle` wants.
 * The header/footer and all whitespace go; anything else is left to the
 * importer, which rejects a bad key — and that rejection is caught by `send`
 * and reported as a sender fault rather than thrown into the drain.
 *
 * The explicit `Uint8Array<ArrayBuffer>` return type is load-bearing under
 * Deno 2.9's lib types: a plain `Uint8Array` is `Uint8Array<ArrayBufferLike>`,
 * which `crypto.subtle.importKey` refuses because `ArrayBufferLike` includes
 * `SharedArrayBuffer`.
 */
function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, '')
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/**
 * The signed assertion: `base64url(header).base64url(claims)` signed RS256 with
 * the service account's private key. The SIGNATURE is what the fake-endpoint
 * test verifies with the matching public key, which is the only reason to trust
 * the rest of this file.
 */
async function signAssertion(account: FcmServiceAccount, issuedAtSeconds: number): Promise<string> {
  const header = base64UrlFromJson({ alg: 'RS256', typ: 'JWT' })
  const claims = base64UrlFromJson({
    iss: account.clientEmail,
    scope: FCM_SCOPE,
    aud: FCM_TOKEN_ENDPOINT,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + ASSERTION_LIFETIME_SECONDS,
  })
  const signingInput = `${header}.${claims}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(account.privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(signingInput),
  )
  return `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Response parsing.
// ─────────────────────────────────────────────────────────────────────────────

interface ProviderError {
  errorCode: string | null
  message: string | null
}

/**
 * FCM's error body:
 *   { "error": { "code": 404, "message": "…", "status": "NOT_FOUND",
 *                "details": [ { "@type": "…FcmError", "errorCode": "UNREGISTERED" } ] } }
 *
 * `details[].errorCode` is the specific fact (`UNREGISTERED`), so it wins; then
 * `error.status` (the gRPC name, e.g. `NOT_FOUND`, `UNAVAILABLE`); then nothing,
 * which the classifier reads from the HTTP status. The OAuth2 endpoint uses a
 * flatter body (`{"error": "invalid_grant", "error_description": "…"}`), handled
 * here too — one parser, both endpoints.
 */
function parseProviderError(text: string): ProviderError {
  const trimmed = text.trim()
  if (trimmed === '') return { errorCode: null, message: null }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    // A non-JSON body (an HTML error page from a proxy, say): keep it as the
    // message — capped, because it is headed for a database column — and let
    // the HTTP status decide the verdict.
    return { errorCode: null, message: trimmed.slice(0, 300) }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { errorCode: null, message: trimmed.slice(0, 300) }
  }

  const body = parsed as Record<string, unknown>
  const error = body.error

  // The OAuth2 shape: `error` is a STRING code and `error_description` is prose.
  if (typeof error === 'string') {
    const description = typeof body.error_description === 'string' ? body.error_description.trim() : ''
    return {
      errorCode: error.trim() === '' ? null : error.trim(),
      message: description === '' ? error.trim() : description,
    }
  }

  if (typeof error !== 'object' || error === null) {
    return { errorCode: null, message: null }
  }

  const failure = error as Record<string, unknown>
  const message = typeof failure.message === 'string' && failure.message.trim() !== ''
    ? failure.message.trim()
    : null

  if (Array.isArray(failure.details)) {
    for (const detail of failure.details) {
      if (typeof detail !== 'object' || detail === null) continue
      const code = (detail as Record<string, unknown>).errorCode
      if (typeof code === 'string' && code.trim() !== '') {
        return { errorCode: code.trim(), message }
      }
    }
  }

  const status = typeof failure.status === 'string' && failure.status.trim() !== ''
    ? failure.status.trim()
    : null
  return { errorCode: status, message }
}

/** Read a response body without letting a broken stream become a thrown error. */
async function readText(response: { text(): Promise<string> }): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

/** Narrow-from-unknown so a thrown non-Error still yields readable text. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message.trim()
  if (typeof error === 'string') return error.trim()
  try {
    return String(error).trim()
  } catch {
    return ''
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The transport.
// ─────────────────────────────────────────────────────────────────────────────

interface MintFailure {
  ok: false
  status: number | null
  errorCode: string | null
  reason: string
}

/**
 * Build the FCM transport for one service account. `deps` carries the network
 * and the clock, so the test can drive both and count the token mints.
 *
 * THE CALLER OWNS THE LIFETIME: create it ONCE (module scope in
 * `send-push/index.ts`) so the access-token cache survives the whole
 * invocation. Creating one per message would still be correct, and pointless.
 */
export function createFcmTransport(deps: FcmDeps, account: FcmServiceAccount): FcmTransport {
  const now = deps.now ?? (() => Date.now())
  /** The cached access token, with the instant it stops being usable. */
  let cached: { token: string; usableUntil: number } | null = null

  async function accessToken(): Promise<{ ok: true; token: string } | MintFailure> {
    const nowMs = now()
    if (cached !== null && nowMs < cached.usableUntil) {
      return { ok: true, token: cached.token }
    }

    const assertion = await signAssertion(account, Math.floor(nowMs / 1000))

    const response = await deps.fetch(FCM_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent(FCM_GRANT_TYPE)}&assertion=${encodeURIComponent(assertion)}`,
    })

    const text = await readText(response)
    if (response.status < 200 || response.status >= 300) {
      const parsed = parseProviderError(text)
      return {
        ok: false,
        status: response.status,
        errorCode: parsed.errorCode,
        reason:
          parsed.message ??
          `the OAuth2 token endpoint answered ${response.status} — the service-account key was rejected`,
      }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return {
        ok: false,
        status: response.status,
        errorCode: null,
        reason: 'the OAuth2 token endpoint returned a non-JSON body',
      }
    }

    const body = (parsed ?? {}) as Record<string, unknown>
    const token = typeof body.access_token === 'string' ? body.access_token.trim() : ''
    if (token === '') {
      return {
        ok: false,
        status: response.status,
        errorCode: null,
        reason: 'the OAuth2 token endpoint returned no access_token — the service-account key was rejected',
      }
    }

    const expiresIn = typeof body.expires_in === 'number' && Number.isFinite(body.expires_in)
      ? body.expires_in
      : 3600
    cached = {
      token,
      // Never past the token's own expiry, and never re-used inside the last
      // minute of it. A nonsensically short `expires_in` still leaves the
      // margin clamped to a positive window.
      usableUntil: nowMs + Math.max(0, expiresIn * 1000 - TOKEN_REFRESH_MARGIN_MS),
    }

    return { ok: true, token }
  }

  return {
    async send(request: NativePushRequest): Promise<NativePushResult> {
      try {
        const minted = await accessToken()
        if (!minted.ok) {
          // A rejected key or an unreachable token endpoint. `nativePushCredentialFailure`
          // is the whole point: this can NEVER be a dead-token verdict, so no
          // matter what the credential endpoint's prose says, the device row is
          // kept. (Classified for retry otherwise: a 5xx/timeout retries, a
          // 400/401/403 is a permanent sender fault.)
          return nativePushCredentialFailure({
            status: minted.status,
            errorCode: minted.errorCode,
            message: minted.reason,
          })
        }

        const response = await deps.fetch(
          `${FCM_SEND_BASE}/${encodeURIComponent(account.projectId)}/messages:send`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${minted.token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify(buildFcmMessage(request)),
          },
        )

        if (response.status >= 200 && response.status < 300) {
          return { ok: true, status: response.status }
        }

        const text = await readText(response)
        const parsed = parseProviderError(text)
        return nativePushFailure({
          status: response.status,
          errorCode: parsed.errorCode,
          message: parsed.message,
        })
      } catch (error) {
        // A rejected key import, a TLS failure, a DNS failure, an aborted
        // request. Nothing was rejected by the provider, so the pure classifier
        // reads this as transient — and, crucially, the device is not pruned.
        return nativePushFailure({
          status: null,
          errorCode: null,
          message: describeError(error),
        })
      }
    },
  }
}
