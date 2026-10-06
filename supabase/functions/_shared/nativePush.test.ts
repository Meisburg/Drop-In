/**
 * The pure half of native push, pinned: the FCM request shape, the DATA-map
 * rules FCM enforces, the dead-token/retry classification, and the credential
 * reader.
 *
 * WHY THIS FILE EXISTS AND WHY IT HAS NO FAKES. `_shared/nativePush.ts` is pure
 * — no `fetch`, no `Deno`, no clock, no library — so there is nothing here to
 * stand in for. The counting fakes the slice calls for live in the two tests
 * that DO have a real dependency to count:
 *
 *   supabase/functions/_shared/fcmDeno_test.ts   a fake token endpoint and a
 *                                                fake FCM endpoint (the adapter)
 *   src/lib/nativePushToken.test.ts              a fake plugin that records the
 *                                                permission/registration order
 *
 * What this file pins is the part that deletes devices when it is wrong. The
 * classification table is asserted BRANCH BY BRANCH, because "getting this
 * backwards deletes live devices or retries dead ones forever" is the failure
 * this slice exists to avoid: a retryable provider 5xx must NOT prune, a dead
 * token MUST, and a sender-credential fault must NOT (a project mistake would
 * otherwise wipe every live device on the next drain).
 */
import { describe, expect, it } from 'vitest'
import {
  buildFcmMessage,
  buildNativePushData,
  buildNativePushRequest,
  classifyNativePushFailure,
  fcmConfigFrom,
  nativePushCredentialFailure,
  nativePushFailure,
  nativePushOutcome,
  type NativePushFailure,
} from './nativePush.ts'

const ROW = {
  token: 'fcm-registration-token-abc',
  platform: 'android' as const,
  title: 'Starting soon: "Park day"',
  body: 'Starts within the hour · 2 families are going',
  url: '/playdate/pd-1',
  kind: 'starting_soon' as const,
  profileId: 'prof-1',
  playdateId: 'pd-1',
}

describe('buildNativePushRequest — the copy is carried, never re-derived', () => {
  it('maps the log row onto the provider request verbatim', () => {
    const request = buildNativePushRequest(ROW)
    expect(request.token).toBe(ROW.token)
    expect(request.platform).toBe('android')
    // Char-for-char: the ONE copy module (`pushCopy.ts`) built these strings,
    // and this module must not paraphrase, re-case or re-word them.
    expect(request.title).toBe(ROW.title)
    expect(request.body).toBe(ROW.body)
  })

  it('carries the url, the kind and the dedupe tag in data', () => {
    const request = buildNativePushRequest(ROW)
    expect(request.data).toEqual({
      url: '/playdate/pd-1',
      kind: 'starting_soon',
      tag: 'prof-1:starting_soon:pd-1',
    })
  })

  it('uses the SAME dedupe key as the web payload (0032’s unique key)', () => {
    // 'none' for a null playdate id, exactly like `notificationDedupeKey`.
    expect(
      buildNativePushData({ url: '/x', kind: 'new_message', profileId: 'p', playdateId: null }),
    ).toEqual({
      url: '/x',
      kind: 'new_message',
      tag: 'p:new_message:none',
    })
  })

  it('every value is a string (FCM requires string→string)', () => {
    for (const value of Object.values(buildNativePushData(ROW))) {
      expect(typeof value).toBe('string')
    }
  })

  it('every key is legal for FCM', () => {
    // FCM rejects keys starting `google.`/`gcm.notification.` and the reserved
    // words below. Asserted rather than trusted: a key added here casually is
    // how every send starts failing with an opaque 400.
    const reserved = ['from', 'message_type', 'google', 'gcm.notification']
    for (const key of Object.keys(buildNativePushData(ROW))) {
      expect(reserved.some((word) => key === word || key.startsWith(word))).toBe(false)
    }
  })
})

describe('buildFcmMessage — the HTTP v1 body', () => {
  it('wraps the request in `message` with token, notification and data', () => {
    const body = buildFcmMessage(buildNativePushRequest(ROW))
    expect(body).toEqual({
      message: {
        token: ROW.token,
        notification: { title: ROW.title, body: ROW.body },
        data: { url: '/playdate/pd-1', kind: 'starting_soon', tag: 'prof-1:starting_soon:pd-1' },
        android: { priority: 'high' },
      },
    })
  })

  it('adds the android block for android only', () => {
    expect(buildFcmMessage(buildNativePushRequest(ROW)).message.android).toEqual({ priority: 'high' })
    expect(buildFcmMessage(buildNativePushRequest({ ...ROW, platform: 'ios' })).message.android).toBe(
      undefined,
    )
  })
})

describe('classifyNativePushFailure — a dead token is TERMINAL and is pruned', () => {
  const dead: Array<[string, NativePushFailure]> = [
    ['HTTP 404', { status: 404, message: 'Requested entity was not found.' }],
    ['HTTP 410', { status: 410, message: 'Gone' }],
    ['UNREGISTERED', { status: 400, errorCode: 'UNREGISTERED', message: 'Requested entity was not found.' }],
    [
      'INVALID_ARGUMENT naming the token',
      { status: 400, errorCode: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' },
    ],
    [
      'HTTP 400 naming the token without a code',
      { status: 400, message: 'Invalid registration token' },
    ],
  ]

  it.each(dead)('%s → retryable false, deadToken true', (_label, failure) => {
    const verdict = classifyNativePushFailure(failure)
    expect(verdict.retryable).toBe(false)
    expect(verdict.deadToken).toBe(true)
    expect(verdict.reason.length).toBeGreaterThan(0)
    expect(nativePushOutcome(nativePushFailure(failure))).toBe('prune')
  })
})

describe('classifyNativePushFailure — a transient provider fault is RETRYABLE and never prunes', () => {
  const transient: Array<[string, NativePushFailure]> = [
    ['HTTP 500', { status: 500, message: 'Internal error' }],
    ['HTTP 503', { status: 503, errorCode: 'UNAVAILABLE', message: 'The service is unavailable' }],
    ['HTTP 429', { status: 429, errorCode: 'QUOTA_EXCEEDED', message: 'Quota exceeded' }],
    ['RESOURCE_EXHAUSTED', { status: 429, errorCode: 'RESOURCE_EXHAUSTED', message: 'Quota' }],
    ['INTERNAL', { status: 500, errorCode: 'INTERNAL', message: 'Internal' }],
    ['UNKNOWN', { status: 500, errorCode: 'UNKNOWN', message: 'Unknown' }],
    ['a timeout / network failure (no status)', { status: null, message: 'fetch failed' }],
  ]

  it.each(transient)('%s → retryable true, deadToken false', (_label, failure) => {
    const verdict = classifyNativePushFailure(failure)
    expect(verdict.retryable).toBe(true)
    expect(verdict.deadToken).toBe(false)
    expect(verdict.reason.length).toBeGreaterThan(0)
    expect(nativePushOutcome(nativePushFailure(failure))).toBe('failed')
  })
})

describe('classifyNativePushFailure — permanent, but the DEVICE is not the problem', () => {
  const keepTheDevice: Array<[string, NativePushFailure]> = [
    ['HTTP 401', { status: 401, message: 'Request had invalid authentication credentials' }],
    ['HTTP 403', { status: 403, errorCode: 'PERMISSION_DENIED', message: 'Permission denied' }],
    ['UNAUTHENTICATED', { status: 401, errorCode: 'UNAUTHENTICATED', message: 'Auth' }],
    ['SENDER_ID_MISMATCH', { status: 403, errorCode: 'SENDER_ID_MISMATCH', message: 'Sender ID mismatch' }],
    [
      'INVALID_ARGUMENT about the PAYLOAD, not the token',
      { status: 400, errorCode: 'INVALID_ARGUMENT', message: 'Invalid JSON payload received. Unknown name "foo"' },
    ],
    ['some other 4xx', { status: 418, message: 'teapot' }],
  ]

  it.each(keepTheDevice)('%s → terminal, deadToken false, the row is KEPT', (_label, failure) => {
    const verdict = classifyNativePushFailure(failure)
    expect(verdict.deadToken).toBe(false)
    expect(verdict.reason.length).toBeGreaterThan(0)
    // Sent to the sender's `failed` counter, never to the prune.
    expect(nativePushOutcome(nativePushFailure(failure))).toBe('failed')
  })

  it('says out loud that a sender fault must not delete the device', () => {
    const verdict = classifyNativePushFailure({
      status: 403,
      errorCode: 'SENDER_ID_MISMATCH',
      message: 'Sender ID mismatch',
    })
    expect(verdict.reason).toContain('KEPT')
  })
})

describe('nativePushCredentialFailure — the sender’s own fault never condemns a device', () => {
  it('does not prune, and does not claim a prune, even when the prose names a token', () => {
    // The trap: a 400 whose description happens to mention a token satisfies
    // the dead-token rule for a MESSAGE send. A credential failure must not.
    const shape = {
      status: 400,
      errorCode: 'invalid_grant',
      message: 'Invalid JWT Signature for this token request.',
    }
    expect(classifyNativePushFailure(shape).deadToken).toBe(true)

    const result = nativePushCredentialFailure({ ...shape, message: '' })
    if (result.ok) throw new Error('unreachable')
    expect(result.deadToken).toBe(false)
    expect(nativePushOutcome(result)).toBe('failed')
    // The recorded reason must not tell a human the device was deleted.
    expect(result.error).not.toContain('pruned')
  })

  it('still classifies a 5xx credential failure as retryable', () => {
    const result = nativePushCredentialFailure({ status: 503, message: 'The service is unavailable' })
    if (result.ok) throw new Error('unreachable')
    expect(result.retryable).toBe(true)
    expect(result.deadToken).toBe(false)
  })
})

describe('classifyNativePushFailure — shape and honesty', () => {
  it('treats a verdict-less answer as transient (nothing was rejected)', () => {
    const verdict = classifyNativePushFailure({ status: 200 })
    expect(verdict.retryable).toBe(true)
    expect(verdict.deadToken).toBe(false)
  })

  it('always produces a non-empty reason', () => {
    const shapes: NativePushFailure[] = [
      { status: null },
      { status: null, errorCode: null, message: null },
      { status: 0 },
      { status: 204 },
      { status: 400, errorCode: '   ' },
      { status: Number.NaN, errorCode: 'unregistered' },
    ]
    for (const shape of shapes) {
      expect(classifyNativePushFailure(shape).reason.trim().length).toBeGreaterThan(0)
    }
  })

  it('accepts a lower-case errorCode (the provider’s case is not a contract)', () => {
    expect(classifyNativePushFailure({ status: 400, errorCode: 'unregistered' }).deadToken).toBe(true)
  })
})

describe('nativePushFailure — the result the sender reads', () => {
  it('prefers the provider’s own words for the recorded error', () => {
    const result = nativePushFailure({
      status: 503,
      errorCode: 'UNAVAILABLE',
      message: 'The service is currently unavailable.',
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toBe('The service is currently unavailable.')
    expect(result.status).toBe(503)
    expect(result.errorCode).toBe('UNAVAILABLE')
  })

  it('never records an empty error, even with no provider message', () => {
    const result = nativePushFailure({ status: 500 })
    if (result.ok) throw new Error('unreachable')
    expect(result.error.trim().length).toBeGreaterThan(0)
    expect(result.errorCode).toBeNull()
  })

  it('maps a success to `sent`', () => {
    expect(nativePushOutcome({ ok: true, status: 200 })).toBe('sent')
  })
})

describe('fcmConfigFrom — the credential, or an honest disabled reason', () => {
  const key = {
    type: 'service_account',
    project_id: 'project-1ab24a5b-7d94-4c8d-bbc',
    private_key_id: 'abc',
    private_key: '-----BEGIN PRIVATE KEY-----\nSUPERSECRETKEYMATERIAL\n-----END PRIVATE KEY-----\n',
    client_email: 'firebase-adminsdk-abc@project-1ab24a5b-7d94-4c8d-bbc.iam.gserviceaccount.com',
  }

  it('is disabled, naming the secret, when the secret is absent or blank', () => {
    for (const env of [{}, { FCM_SERVICE_ACCOUNT_JSON: '' }, { FCM_SERVICE_ACCOUNT_JSON: '   ' }]) {
      const choice = fcmConfigFrom(env)
      expect(choice.kind).toBe('disabled')
      if (choice.kind !== 'disabled') throw new Error('unreachable')
      expect(choice.reason).toContain('FCM_SERVICE_ACCOUNT_JSON')
    }
  })

  it('reads the three fields it needs', () => {
    const choice = fcmConfigFrom({ FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(key) })
    expect(choice.kind).toBe('fcm')
    if (choice.kind !== 'fcm') throw new Error('unreachable')
    expect(choice.config).toEqual({
      projectId: key.project_id,
      clientEmail: key.client_email,
      // Trimmed: the PEM's surrounding newlines are irrelevant to the key, and
      // a stray newline out of a pasted secret must not reach the signer.
      privateKey: key.private_key.trim(),
    })
  })

  it('trims stray whitespace out of a pasted secret', () => {
    const padded = {
      project_id: ` ${key.project_id} `,
      client_email: `\n${key.client_email} `,
      private_key: `\n${key.private_key}\t`,
    }
    const choice = fcmConfigFrom({ FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(padded) })
    if (choice.kind !== 'fcm') throw new Error('unreachable')
    expect(choice.config.projectId).toBe(key.project_id)
    expect(choice.config.privateKey).toBe(key.private_key.trim())
  })

  it('reports malformed JSON without echoing the value', () => {
    const choice = fcmConfigFrom({ FCM_SERVICE_ACCOUNT_JSON: '{not json SUPERSECRETKEYMATERIAL' })
    if (choice.kind !== 'disabled') throw new Error('unreachable')
    expect(choice.reason).toContain('not valid JSON')
    expect(choice.reason).not.toContain('SUPERSECRETKEYMATERIAL')
  })

  it('names the missing fields, and never the key material', () => {
    const choice = fcmConfigFrom({ FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({ private_key: key.private_key }) })
    if (choice.kind !== 'disabled') throw new Error('unreachable')
    expect(choice.reason).toContain('project_id')
    expect(choice.reason).toContain('client_email')
    expect(choice.reason).not.toContain('SUPERSECRETKEYMATERIAL')
  })

  it('refuses a JSON value that is not an object', () => {
    const choice = fcmConfigFrom({ FCM_SERVICE_ACCOUNT_JSON: '"just a string"' })
    expect(choice.kind).toBe('disabled')
  })
})
