/**
 * The NATIVE PUSH transport's PURE HALF — the FCM HTTP v1 request builder, the
 * service-account config reader, and the dead-token/retry classification. The
 * twin of `_shared/smtp.ts`: same split, same reason.
 *
 * WHY THIS FILE IS PURE. `_shared/fcmDeno.ts` is the ONLY place an HTTP call,
 * an OAuth2 token mint or a crypto import appears. Everything decidable lives
 * here, so `nativePush.test.ts` runs it under plain Node through vitest with
 * counting fakes and no socket — the lesson `smtp.test.ts` established. An
 * `npm:` specifier, a `Deno` global or any import with a socket in this module's
 * graph would break that runner, so there is none. This module imports exactly
 * one thing: the copy module below.
 *
 * THE COPY IS REUSED, NOT REDECLARED. `buildNotificationPayload` in
 * `./pushCopy.ts` remains the ONE module that decides a notification's words
 * (the drift a second copy module caused is what V28 exists to remember). This
 * file never writes a sentence: it maps the ALREADY-BUILT `notification_log`
 * columns (title/body/url, which the producers wrote from
 * `buildNotificationPayload`) onto the provider's payload shape, and takes the
 * notification's collapse identity from `notificationDedupeKey` — the same key
 * migration 0032's unique constraint enforces and the web payload already uses
 * as its `tag`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CLASSIFICATION IS THE PART THAT MUST NOT BE GOT BACKWARDS.
 *
 *   TERMINAL, DEAD TOKEN (`deadToken: true`) — the token will NEVER work again,
 *   so the sender DELETES the `device_tokens` row, exactly as a 410 prunes a
 *   `push_subscriptions` row today. EVERY branch here needs TOKEN-SPECIFIC
 *   evidence, because the sender acts on this flag by deleting:
 *     - HTTP 410 Gone (unambiguous: the registration is gone for good);
 *     - errorCode `UNREGISTERED` (the app was uninstalled, or the token
 *       rotated) — FCM reports it with HTTP 404;
 *     - errorCode `INVALID_ARGUMENT` / HTTP 400 whose message names the
 *       REGISTRATION token (a malformed token is dead forever). The message is
 *       read because FCM returns the SAME 400 for a bad PAYLOAD, and deleting a
 *       live device because our own JSON was wrong is the expensive direction.
 *
 *   TERMINAL, LIVE DEVICE (`deadToken: false`, `retryable: false`) — the
 *   request will fail identically until a human changes something, but the
 *   DEVICE is not the problem, so the row is NOT deleted:
 *     - a 404 with NO token-specific code. A wrong `project_id` in
 *       `FCM_SERVICE_ACCOUNT_JSON`, or any proxy in front of Google, answers
 *       404 too — and pruning on the bare status would delete EVERY live
 *       device on one misconfiguration. (`error.status: "NOT_FOUND"` does not
 *       count as token evidence; it is only the gRPC name of that 404.)
 *     - `UNAUTHENTICATED` / `PERMISSION_DENIED` / `SENDER_ID_MISMATCH` /
 *       `THIRD_PARTY_AUTH_ERROR` (a sender credential or project fault), and
 *       HTTP 401/403.
 *
 *   RETRYABLE (`retryable: true`) — time, or the provider's load, is the
 *   variable: HTTP 5xx, 429, `RESOURCE_EXHAUSTED`/`QUOTA_EXCEEDED`,
 *   `UNAVAILABLE`, `INTERNAL`, `UNKNOWN`, `DEADLINE_EXCEEDED`, and a null status
 *   (no response at all: a network failure or a timeout).
 *
 * Getting THAT backwards deletes live devices or retries dead ones forever, so
 * every branch is explicit below and every one is pinned by a test.
 */

import { notificationDedupeKey, type NotificationKind } from './pushCopy.ts'

/** The two platforms the `device_tokens.platform` CHECK allows (migration 0065). */
export type NativePushPlatform = 'ios' | 'android'

/** The narrow `fetch` slice both runtimes can supply and a test can fake. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ status: number; text(): Promise<string> }>

// ─────────────────────────────────────────────────────────────────────────────
// The request, and the FCM body built from it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ONE native send, provider-agnostic: who to reach, and what to say. The
 * provider adapters turn this into their own body (`buildFcmMessage` below is
 * the FCM one); an APNs adapter would take the same struct, which is why the
 * platform rides along even though only the FCM branch exists today (slice 2a
 * is deferred and writes nothing).
 */
export interface NativePushRequest {
  /** The per-install registration token (`Token.value` from the plugin). */
  token: string
  platform: NativePushPlatform
  title: string
  body: string
  /** String→string, per the FCM REST reference. See `buildNativePushRequest`. */
  data: Record<string, string>
}

export interface NativePushRequestInput {
  token: string
  platform: NativePushPlatform
  /** The `notification_log` row's columns — already built by the ONE copy module. */
  title: string
  body: string
  url: string
  kind: NotificationKind
  profileId: string
  playdateId: string | null
}

/**
 * The `data` map. THREE KEYS, ALL OURS, and that is the point: FCM requires
 * string→string and rejects keys starting `google.`/`gcm.notification.` or
 * reserved words (`from`, `message_type`), so the map is built from literals
 * that cannot be any of those — `nativePush.test.ts` asserts that rather than
 * trusting the reader to check, because a future key added casually here is
 * exactly how an entire send starts failing with an opaque 400.
 *
 *  * `url` — the in-app route the tap opens (the web payload's own key).
 *  * `kind` — the notification kind, so the client can decide how to treat it.
 *  * `tag` — the dedupe key, the same collapse identity the web path sends: the
 *    OS replaces a repeat instead of stacking a second alert.
 */
export function buildNativePushData(input: {
  url: string
  kind: NotificationKind
  profileId: string
  playdateId: string | null
}): Record<string, string> {
  return {
    url: input.url,
    kind: input.kind,
    tag: notificationDedupeKey({
      profileId: input.profileId,
      kind: input.kind,
      playdateId: input.playdateId,
    }),
  }
}

/** One send, with its data map already built. */
export function buildNativePushRequest(input: NativePushRequestInput): NativePushRequest {
  return {
    token: input.token,
    platform: input.platform,
    title: input.title,
    body: input.body,
    data: buildNativePushData(input),
  }
}

/** The FCM HTTP v1 body: `{ message: { token, notification, data, android } }`. */
export interface FcmMessage {
  message: {
    token: string
    notification: { title: string; body: string }
    data: Record<string, string>
    /**
     * Android-only, and only ever the one key. `priority: 'high'` is what makes
     * FCM deliver promptly instead of batching a "normal" message for a device
     * that is dozing — the difference between "Starting soon" arriving in time
     * and arriving after the drop-in started. The channel/icon live in the app
     * manifest (`default_notification_channel_id`), not here, because the client
     * owns them.
     */
    android?: { priority: 'high' }
  }
}

export function buildFcmMessage(request: NativePushRequest): FcmMessage {
  const message: FcmMessage['message'] = {
    token: request.token,
    notification: { title: request.title, body: request.body },
    data: request.data,
  }
  // An `apns` block would join this switch when slice 2a lands; the shape does
  // not have to change for it (the platform is already on the request).
  if (request.platform === 'android') message.android = { priority: 'high' }
  return { message }
}

// ─────────────────────────────────────────────────────────────────────────────
// The classification.
// ─────────────────────────────────────────────────────────────────────────────

/** What the adapter observed. `status: null` means no response arrived at all. */
export interface NativePushFailure {
  status: number | null
  /** FCM's `error.details[].errorCode`, e.g. `UNREGISTERED`. */
  errorCode?: string | null
  /** The provider's own message; read only to tell a token complaint apart. */
  message?: string | null
  /**
   * Whether this failure is ABOUT the device token. `true` (the default) for a
   * message send; `false` for a failure of the sender's own credential, where
   * the device is not the subject and no prose can condemn it.
   */
  aboutTheDeviceToken?: boolean
}

export interface NativePushVerdict {
  /** True when coming back later can change the outcome. */
  retryable: boolean
  /** True when the TOKEN is dead: the caller prunes the `device_tokens` row. */
  deadToken: boolean
  /** Never empty — it is what a human reads in `notification_log.error`. */
  reason: string
}

/**
 * Provider codes that mean "THIS TOKEN will never work again", and nothing
 * else. `NOT_FOUND` is deliberately absent: it is the gRPC name of any 404
 * (including one for a project the sender is not configured for), so treating
 * it as token evidence is what would delete every live device on a wrong
 * `project_id`.
 */
const DEAD_TOKEN_CODES: readonly string[] = ['UNREGISTERED', 'INVALID_REGISTRATION']

/** Provider codes that mean "try again later". */
const RETRYABLE_CODES: readonly string[] = [
  'UNAVAILABLE',
  'INTERNAL',
  'UNKNOWN',
  'DEADLINE_EXCEEDED',
  'ABORTED',
  'RESOURCE_EXHAUSTED',
  'QUOTA_EXCEEDED',
  'TOO_MANY_REQUESTS',
]

/** Provider codes that are a SENDER fault — permanent, but never the device's. */
const SENDER_FAULT_CODES: readonly string[] = [
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'SENDER_ID_MISMATCH',
  'THIRD_PARTY_AUTH_ERROR',
]

/**
 * Whether a provider message is complaining about the REGISTRATION token, as
 * opposed to the payload (or anything else that happens to contain the word
 * "token" — an auth token, an ID token). FCM reports both as
 * `INVALID_ARGUMENT`/400, and only the registration-token case is a reason to
 * delete the row.
 *
 * THE ASYMMETRY IS DELIBERATE: this requires the phrase "registration token",
 * so a genuine bad-token 400 whose prose words it differently is KEPT rather
 * than pruned. That is the safe direction — a kept row costs one failed send
 * per drain; a wrongly deleted row costs the parent every future alert until
 * they reinstall. The rule only ever needs to be *able* to fire, and FCM's own
 * 400 for a malformed token says "registration token" verbatim.
 */
function namesTheToken(message: string): boolean {
  return /registration[\s_-]*token/i.test(message)
}

/**
 * The TERMINAL vs RETRYABLE decision. Total and never throwing: any shape of
 * input yields a verdict with a non-empty reason (see the header for the table).
 */
export function classifyNativePushFailure(failure: NativePushFailure): NativePushVerdict {
  const status =
    typeof failure.status === 'number' && Number.isFinite(failure.status) ? failure.status : null
  const code = (failure.errorCode ?? '').trim().toUpperCase()
  const message = (failure.message ?? '').trim()

  /**
   * THE ABSOLUTE OVERRIDE — the guard the whole dead-token section below hangs
   * on. `false` means the failure is the SENDER's own (the OAuth2 token mint in
   * `fcmDeno.ts`, routed through `nativePushCredentialFailure`), so the DEVICE
   * is not the subject and nothing the endpoint answered can condemn it. Every
   * dead-token branch is gated on this, which is what makes
   * "`deadToken` is ALWAYS false for a credential failure" true for ANY status
   * and ANY code — including 404, 410 and `UNREGISTERED`, which a moved or
   * proxied token endpoint can produce and which an ungated classifier would
   * read as a dead device and delete EVERY live row on one drain.
   */
  const tokenIsTheSubject = failure.aboutTheDeviceToken !== false

  // No response at all: a network failure, a timeout, a dropped connection.
  // Nothing was rejected — come back later. (The SMTP classifier's null-code
  // branch, same reasoning.)
  if (status === null && code === '') {
    return {
      retryable: true,
      deadToken: false,
      reason: `no response from the push provider${
        message === '' ? '' : ` (${message})`
      } — the request never reached a verdict, so this is treated as transient`,
    }
  }

  // 1a. 410 Gone is unambiguous: the registration is gone and will not come
  //     back. This is the ONE status that prunes on its own.
  if (tokenIsTheSubject && status === 410) {
    return {
      retryable: false,
      deadToken: true,
      reason: 'the push provider answered 410: the registration token is gone for good — the device row is pruned',
    }
  }
  // 1b. The provider's own token-specific codes. FCM reports a dead token as
  //     404 + `UNREGISTERED`.
  if (tokenIsTheSubject && DEAD_TOKEN_CODES.includes(code)) {
    return {
      retryable: false,
      deadToken: true,
      reason: `the push provider said ${code}: the registration token is dead — the device row is pruned`,
    }
  }
  // 1c. A 404 with NO token-specific code is a SENDER/PROJECT fault, not a dead
  //     device: a wrong `project_id` in FCM_SERVICE_ACCOUNT_JSON (or anything
  //     proxying Google) answers 404 the same way, and the drain deletes on
  //     `deadToken`, so pruning here would wipe every live device at once.
  if (status === 404) {
    return {
      retryable: false,
      deadToken: false,
      reason: `the push provider answered 404 with no dead-token code${
        code === '' ? '' : ` (${code})`
      } — that is a project/credential fault, not proof the device is gone, so the device row is KEPT`,
    }
  }
  //    A malformed token is also dead, but FCM returns the same 400 for a bad
  //    PAYLOAD. Delete only when the provider's message says the token is the
  //    problem; otherwise the device stays and the sender's request is the bug.
  if (tokenIsTheSubject && (code === 'INVALID_ARGUMENT' || status === 400) && namesTheToken(message)) {
    return {
      retryable: false,
      deadToken: true,
      reason: `the push provider rejected the registration token as invalid${
        code === '' ? ' (HTTP 400)' : ` (${code})`
      } — the device row is pruned`,
    }
  }

  // 2. Retryable: provider load, rate limits, or an unreadable verdict.
  if (status !== null && (status === 429 || status >= 500)) {
    return {
      retryable: true,
      deadToken: false,
      reason: `the push provider answered ${status}${code === '' ? '' : ` (${code})`} — a transient provider failure, so the token is kept and the send may work later`,
    }
  }
  if (RETRYABLE_CODES.includes(code)) {
    return {
      retryable: true,
      deadToken: false,
      reason: `the push provider said ${code} — a transient provider failure — the token is kept and the send may work later`,
    }
  }

  // 3. Permanent, and the SENDER's fault, not the device's. The row is NOT
  //    deleted: a project or credential mistake would otherwise wipe every live
  //    device on the next drain.
  if (SENDER_FAULT_CODES.includes(code) || status === 401 || status === 403) {
    return {
      retryable: false,
      deadToken: false,
      reason: `the push provider reported ${code === '' ? `HTTP ${status}` : code} — a SENDER fault (the project or its credentials), not a dead device — the device row is KEPT; fix the FCM configuration`,
    }
  }

  // 4. Any other 4xx: the request was refused and will be refused again. Stamp
  //    it (the drain's attempt-once rule), keep the device.
  if (status !== null && status >= 400) {
    return {
      retryable: false,
      deadToken: false,
      reason: `the push provider answered ${status}${
        code === '' ? '' : ` (${code})`
      }: the request was refused and would be refused again — the device row is kept`,
    }
  }

  // 5. Anything else (a 2xx/3xx that somehow reached a failure path, or a code
  //    we do not know): nothing was clearly rejected, so this reads like the
  //    no-response case. Same posture as the SMTP classifier's catch-all.
  return {
    retryable: true,
    deadToken: false,
    reason: `the push provider returned no clear failure verdict${
      status === null ? '' : ` (HTTP ${status})`
    }${code === '' ? '' : ` (${code})`} — nothing was clearly rejected, so this is treated as transient`,
  }
}

/** What one native send resolved to. Never throws — like `SendResult`. */
export type NativePushResult =
  | { ok: true; status: number }
  | {
      ok: false
      status: number | null
      errorCode: string | null
      retryable: boolean
      deadToken: boolean
      error: string
    }

/**
 * What the SENDER does with one result — the prune rule, as a pure function so
 * it is unit-tested instead of living as an `if` inside the untestable drain.
 *
 *  * `sent`   — count it and bump the device's `last_seen_at`.
 *  * `prune`  — the token is dead: DELETE the `device_tokens` row (the same
 *               effect a 410, or an `UNREGISTERED` 404, has on a
 *               `push_subscriptions` row).
 *  * `failed` — record the reason; the row is NOT deleted. A retryable failure
 *               must never prune, and a sender-fault failure must never prune
 *               either — that is the whole classification, in one line.
 */
export type NativePushOutcome = 'sent' | 'prune' | 'failed'

export function nativePushOutcome(result: NativePushResult): NativePushOutcome {
  if (result.ok) return 'sent'
  return result.deadToken ? 'prune' : 'failed'
}

/**
 * A failure of the SENDER'S OWN CREDENTIAL — the OAuth2 mint, or the moment the
 * private key would not import. It is classified like any other failure (a 5xx
 * or a timeout is retryable, a 400/401/403 is permanent), with ONE override
 * that this function exists to state: `deadToken` is ALWAYS false.
 *
 * WHY THE OVERRIDE. The device token is not the subject of a credential
 * failure, so nothing the credential endpoint says can condemn a device. Without
 * this, a 400 whose prose happened to mention a token would satisfy the
 * `INVALID_ARGUMENT`/400 rule in `classifyNativePushFailure` and PRUNE A LIVE
 * DEVICE on every drain — the expensive direction of the classification bug.
 * The sender's own mistake must never delete a parent's phone.
 */
export function nativePushCredentialFailure(failure: NativePushFailure): NativePushResult {
  return nativePushFailure({ ...failure, aboutTheDeviceToken: false })
}

/**
 * The classification, wrapped as a result. `error` prefers the provider's own
 * words (they beat a paraphrase), falling back to the verdict's reason so it is
 * NEVER empty — it is the only record of why a parent was not reached.
 */
export function nativePushFailure(failure: NativePushFailure): NativePushResult {
  const verdict = classifyNativePushFailure(failure)
  const detail = (failure.message ?? '').trim()
  return {
    ok: false,
    status: typeof failure.status === 'number' && Number.isFinite(failure.status) ? failure.status : null,
    errorCode: (failure.errorCode ?? '').trim() === '' ? null : (failure.errorCode ?? '').trim(),
    retryable: verdict.retryable,
    deadToken: verdict.deadToken,
    error: detail === '' ? verdict.reason : detail,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The credential.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The three fields of a Google service-account key that the send path uses.
 * The other fields (`type`, `private_key_id`, `client_id`, …) are ignored on
 * purpose: nothing here needs them, and carrying them around widens the surface
 * a log line could leak.
 */
export interface FcmServiceAccount {
  projectId: string
  clientEmail: string
  privateKey: string
}

export type FcmConfigChoice =
  | { kind: 'fcm'; config: FcmServiceAccount; reason: string }
  | { kind: 'disabled'; reason: string }

/**
 * Read `FCM_SERVICE_ACCOUNT_JSON` (the Edge Function SECRET) into a config, or
 * report `disabled` with a reason that NAMES what is missing — the shape
 * `_shared/emailTransport.ts` established. The caller reads `Deno.env`; this
 * function only maps it, which is what makes every branch testable.
 *
 * THE VALUE IS NEVER ECHOED. Not into the reason, not into an error — the
 * reason names the SECRET, never its contents, because that reason is what ends
 * up in `notification_log.error` and in logs.
 */
export function fcmConfigFrom(env: { FCM_SERVICE_ACCOUNT_JSON?: string }): FcmConfigChoice {
  const raw = (env.FCM_SERVICE_ACCOUNT_JSON ?? '').trim()
  if (raw === '') {
    return {
      kind: 'disabled',
      reason: 'no FCM transport configured (missing FCM_SERVICE_ACCOUNT_JSON)',
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      kind: 'disabled',
      reason:
        'FCM_SERVICE_ACCOUNT_JSON is not valid JSON — regenerate the key in the Firebase console (Project settings → Service accounts)',
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      kind: 'disabled',
      reason: 'FCM_SERVICE_ACCOUNT_JSON is not a JSON object — it must be the service-account key file',
    }
  }

  const account = parsed as Record<string, unknown>
  const field = (name: string): string =>
    typeof account[name] === 'string' ? (account[name] as string).trim() : ''

  const projectId = field('project_id')
  const clientEmail = field('client_email')
  const privateKey = field('private_key')

  const missing = [
    projectId === '' ? 'project_id' : null,
    clientEmail === '' ? 'client_email' : null,
    privateKey === '' ? 'private_key' : null,
  ].filter((name): name is string => name !== null)

  if (missing.length > 0) {
    return {
      kind: 'disabled',
      reason: `FCM_SERVICE_ACCOUNT_JSON is missing ${missing.join(', ')} — it is not a usable service-account key`,
    }
  }

  return {
    kind: 'fcm',
    config: { projectId, clientEmail, privateKey },
    reason: 'fcm.googleapis.com',
  }
}
