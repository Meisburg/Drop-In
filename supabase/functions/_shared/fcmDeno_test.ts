/**
 * THE PROOF THAT `_shared/fcmDeno.ts` ACTUALLY MINTS A TOKEN AND SENDS A PUSH.
 *
 * WHY THIS FILE EXISTS. `fcmDeno.ts` is the file that will carry every native
 * notification, and without this test it would be a type-checked file that had
 * never run — the exact gap the SMTP slice closed with `smtpDeno_test.ts` ("a
 * type-checked adapter is NOT a tested adapter"). Everything that can be pure
 * was extracted into `nativePush.ts` and is pinned by its own vitest spec; what
 * remains HERE is the wiring: PEM → DER, the RS256 assertion, the token mint
 * and its cache, the send POST, and the error path into the classifier.
 *
 * WHAT IS REAL AND WHAT IS FAKED. The RSA KEY IS GENERATED HERE, the assertion
 * is signed by the REAL `crypto.subtle` path, and the signature is then
 * VERIFIED with the matching public key — so a broken signing path fails this
 * test rather than silently shipping. The network is a fake `FetchLike` that
 * records every call (URL, method, headers, body) and replies from a script:
 * no live socket, NO CREDENTIALS, and no real Google call. The founder's
 * service-account JSON is deliberately not needed.
 *
 * This file is test-only. `scripts/deno-test-functions.sh` runs it (in the
 * staged temp copy of `supabase/functions/`, alongside the SMTP test), so it
 * never joins the vitest lane and never lands in a deployed function bundle.
 */

import {
  assert,
  assertEquals,
  assertFalse,
  assertStrictEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

import {
  createFcmTransport,
  FCM_GRANT_TYPE,
  FCM_SCOPE,
  FCM_SEND_BASE,
  FCM_TOKEN_ENDPOINT,
} from './fcmDeno.ts'
import {
  buildNativePushRequest,
  fcmConfigFrom,
  nativePushOutcome,
  type FcmServiceAccount,
  type FetchLike,
  type NativePushRequest,
} from './nativePush.ts'

const encoder = new TextEncoder()

// ─────────────────────────────────────────────────────────────────────────────
// The account: a REAL RSA key pair, generated here.
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT_ID = 'project-1ab24a5b-7d94-4c8d-bbc'
const CLIENT_EMAIL = `firebase-adminsdk-abc@${PROJECT_ID}.iam.gserviceaccount.com`

interface TestAccount {
  account: FcmServiceAccount
  publicKey: CryptoKey
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** `Uint8Array<ArrayBuffer>` (not `ArrayBufferLike`) so `crypto.subtle` accepts it. */
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** A real PKCS#8 PEM, in the shape Google's `private_key` field actually has. */
async function makeAccount(): Promise<TestAccount> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  const body = toBase64(der).replace(/(.{64})/g, '$1\n')
  return {
    account: {
      projectId: PROJECT_ID,
      clientEmail: CLIENT_EMAIL,
      privateKey: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`,
    },
    publicKey: pair.publicKey,
  }
}

/** Verify a JWT's RS256 signature with the public half — the real proof. */
async function verifyAssertion(assertion: string, publicKey: CryptoKey): Promise<boolean> {
  const [header, claims, signature] = assertion.split('.')
  if (!header || !claims || !signature) return false
  return await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    fromBase64Url(signature),
    encoder.encode(`${header}.${claims}`),
  )
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(fromBase64Url(segment))) as Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────────────────
// The fake network: a counting, recording fetch.
// ─────────────────────────────────────────────────────────────────────────────

interface FakeCall {
  url: string
  method: string
  headers: Record<string, string>
  body: string
}

interface FakeReply {
  status: number
  body: string
}

interface FakeNetwork {
  fetch: FetchLike
  calls: FakeCall[]
}

type Responder = (call: FakeCall, index: number) => FakeReply

function fakeNetwork(responder: Responder): FakeNetwork {
  const calls: FakeCall[] = []
  const fetch: FetchLike = async (url, init) => {
    const call: FakeCall = { url, method: init.method, headers: init.headers, body: init.body }
    calls.push(call)
    const reply = responder(call, calls.length - 1)
    return { status: reply.status, text: async () => reply.body }
  }
  return { fetch, calls }
}

function tokenReply(accessToken: string, expiresIn = 3600): FakeReply {
  return { status: 200, body: JSON.stringify({ access_token: accessToken, expires_in: expiresIn }) }
}

function fcmRequest(overrides: Partial<NativePushRequest> = {}): NativePushRequest {
  return {
    ...buildNativePushRequest({
      token: 'device-token-1',
      platform: 'android',
      title: 'Starting soon: "Park day"',
      body: 'Starts within the hour · 2 families are going',
      url: '/playdate/pd-1',
      kind: 'starting_soon',
      profileId: 'prof-1',
      playdateId: 'pd-1',
    }),
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The tests.
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('the real adapter signs an assertion, mints a token and sends the FCM body', async () => {
  const { account, publicKey } = await makeAccount()
  const network = fakeNetwork((_call, index) =>
    index === 0 ? tokenReply('access-token-1') : { status: 200, body: '{"name":"projects/x/messages/1"}' },
  )
  const transport = createFcmTransport({ fetch: network.fetch }, account)

  const result = await transport.send(fcmRequest())

  assertEquals(result.ok, true)
  if (!result.ok) throw new Error('unreachable')
  assertEquals(result.status, 200)
  assertEquals(network.calls.length, 2)

  // 1. The token call: the assertion grant, and a JWT that VERIFIES.
  const tokenCall = network.calls[0]
  assertEquals(tokenCall.url, FCM_TOKEN_ENDPOINT)
  assertEquals(tokenCall.method, 'POST')
  assertEquals(tokenCall.headers['content-type'], 'application/x-www-form-urlencoded')

  const params = new URLSearchParams(tokenCall.body)
  assertEquals(params.get('grant_type'), FCM_GRANT_TYPE)
  const assertion = params.get('assertion') ?? ''
  assert(assertion.split('.').length === 3, 'the assertion must be a three-part JWT')
  assert(await verifyAssertion(assertion, publicKey), 'the RS256 signature must verify with the public key')

  const [header, claims] = assertion.split('.')
  assertEquals(decodeSegment(header), { alg: 'RS256', typ: 'JWT' })
  const decoded = decodeSegment(claims)
  assertEquals(decoded.iss, CLIENT_EMAIL)
  assertEquals(decoded.scope, FCM_SCOPE)
  assertEquals(decoded.aud, FCM_TOKEN_ENDPOINT)
  assertEquals(typeof decoded.iat, 'number')
  assertEquals(typeof decoded.exp, 'number')
  assert((decoded.exp as number) > (decoded.iat as number), 'the assertion must not be born expired')

  // 2. The send call: the bearer token, the URL, and the whole FCM body.
  const sendCall = network.calls[1]
  assertEquals(sendCall.url, `${FCM_SEND_BASE}/${PROJECT_ID}/messages:send`)
  assertEquals(sendCall.method, 'POST')
  assertEquals(sendCall.headers.authorization, 'Bearer access-token-1')
  assertEquals(sendCall.headers['content-type'], 'application/json')

  assertEquals(JSON.parse(sendCall.body), {
    message: {
      token: 'device-token-1',
      notification: { title: 'Starting soon: "Park day"', body: 'Starts within the hour · 2 families are going' },
      data: { url: '/playdate/pd-1', kind: 'starting_soon', tag: 'prof-1:starting_soon:pd-1' },
      android: { priority: 'high' },
    },
  })

  // 3. The secret is nowhere on the wire except inside the signed assertion —
  //    the private key itself must never be sent, logged or echoed.
  assertFalse(sendCall.body.includes('PRIVATE KEY'))
  assertFalse(JSON.stringify(sendCall.headers).includes('PRIVATE KEY'))
})

Deno.test('the access token is cached until near its expiry', async () => {
  const { account } = await makeAccount()
  let clock = 1_000_000
  let mints = 0
  const network = fakeNetwork((call) => {
    if (call.url === FCM_TOKEN_ENDPOINT) {
      mints += 1
      return tokenReply(`access-${mints}`)
    }
    return { status: 200, body: '{}' }
  })
  const transport = createFcmTransport({ fetch: network.fetch, now: () => clock }, account)

  await transport.send(fcmRequest())
  await transport.send(fcmRequest({ token: 'device-token-2' }))
  assertEquals(network.calls.length, 3, 'two sends must mint the token once')
  assertEquals(network.calls[2].headers.authorization, 'Bearer access-1')

  // Still inside the hour: no new mint.
  clock += 60 * 60 * 1000 - 120_000
  await transport.send(fcmRequest())
  assertEquals(network.calls.length, 4, 'a cached token must not be re-minted early')

  // Past `expires_in` minus the margin: mint again, and use the NEW token.
  clock += 5 * 60 * 1000
  await transport.send(fcmRequest())
  assertEquals(network.calls.length, 6, 'an expired token must be re-minted')
  assertEquals(network.calls[5].headers.authorization, 'Bearer access-2')
})

Deno.test('a token whose whole life is inside the refresh margin is re-minted, never reused', async () => {
  const { account } = await makeAccount()
  let clock = 0
  let mints = 0
  const network = fakeNetwork((call) => {
    if (call.url === FCM_TOKEN_ENDPOINT) {
      mints += 1
      return tokenReply(`access-${mints}`, 60)
    }
    return { status: 200, body: '{}' }
  })
  const transport = createFcmTransport({ fetch: network.fetch, now: () => clock }, account)

  await transport.send(fcmRequest())
  assertEquals(network.calls.length, 2)
  // usableUntil was clamped to `now` (60s life − 60s margin), so the next send
  // must mint again rather than present a token that may already be dead.
  clock += 1
  await transport.send(fcmRequest())
  assertEquals(network.calls.length, 4)
})

Deno.test('a dead token (404 / UNREGISTERED) is terminal, dead, and PRUNED', async () => {
  const { account } = await makeAccount()
  const network = fakeNetwork((_call, index) =>
    index === 0
      ? tokenReply('access-token-1')
      : {
          status: 404,
          body: JSON.stringify({
            error: {
              code: 404,
              message: 'Requested entity was not found.',
              status: 'NOT_FOUND',
              details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }],
            },
          }),
        },
  )
  const transport = createFcmTransport({ fetch: network.fetch }, account)

  const result = await transport.send(fcmRequest())

  assertEquals(result.ok, false)
  if (result.ok) throw new Error('unreachable')
  assertEquals(result.deadToken, true)
  assertEquals(result.retryable, false)
  assertStringIncludes(result.error, 'Requested entity was not found')
  // The one line the drain actually acts on.
  assertStrictEquals(nativePushOutcome(result), 'prune')
})

Deno.test('a 503 UNAVAILABLE is retryable and NEVER prunes the device', async () => {
  const { account } = await makeAccount()
  const network = fakeNetwork((_call, index) =>
    index === 0
      ? tokenReply('access-token-1')
      : {
          status: 503,
          body: JSON.stringify({
            error: { code: 503, message: 'The service is currently unavailable.', status: 'UNAVAILABLE' },
          }),
        },
  )
  const transport = createFcmTransport({ fetch: network.fetch }, account)

  const result = await transport.send(fcmRequest())

  if (result.ok) throw new Error('unreachable')
  assertEquals(result.retryable, true)
  assertEquals(result.deadToken, false)
  assertEquals(result.status, 503)
  assertEquals(result.errorCode, 'UNAVAILABLE')
  assertStringIncludes(result.error, 'currently unavailable')
  assertStrictEquals(nativePushOutcome(result), 'failed')
})

Deno.test('a network failure resolves as retryable with no status — never a prune', async () => {
  const { account } = await makeAccount()
  const fetch: FetchLike = () => Promise.reject(new TypeError('connection refused'))
  const transport = createFcmTransport({ fetch }, account)

  const result = await transport.send(fcmRequest())

  if (result.ok) throw new Error('unreachable')
  assertEquals(result.status, null)
  assertEquals(result.retryable, true)
  assertEquals(result.deadToken, false)
  assertStringIncludes(result.error, 'connection refused')
  assertStrictEquals(nativePushOutcome(result), 'failed')
})

Deno.test('a rejected service-account key is a SENDER fault: kept, not pruned', async () => {
  const { account } = await makeAccount()
  // The description deliberately says "token": a 400 that mentions a token is
  // exactly the shape that must NOT be read as a dead device when the failure
  // is really the sender's own credential.
  const network = fakeNetwork(() => ({
    status: 400,
    body: JSON.stringify({
      error: 'invalid_grant',
      error_description: 'Invalid JWT Signature for this token request.',
    }),
  }))
  const transport = createFcmTransport({ fetch: network.fetch }, account)

  const result = await transport.send(fcmRequest())

  if (result.ok) throw new Error('unreachable')
  assertEquals(result.deadToken, false, 'a credential fault must never delete a live device')
  assertEquals(result.retryable, false)
  assertEquals(result.errorCode, 'invalid_grant')
  assertStringIncludes(result.error, 'Invalid JWT Signature')
  assertEquals(network.calls.length, 1, 'no message may be sent when the token was never minted')
  assertStrictEquals(nativePushOutcome(result), 'failed')
})

Deno.test('a token endpoint 5xx is retryable and no message is sent', async () => {
  const { account } = await makeAccount()
  const network = fakeNetwork(() => ({ status: 500, body: 'Internal error' }))
  const transport = createFcmTransport({ fetch: network.fetch }, account)

  const result = await transport.send(fcmRequest())

  if (result.ok) throw new Error('unreachable')
  assertEquals(result.retryable, true)
  assertEquals(result.deadToken, false)
  assertEquals(network.calls.length, 1)
})

Deno.test('an unusable private key never reaches the network and never throws', async () => {
  const account: FcmServiceAccount = {
    projectId: PROJECT_ID,
    clientEmail: CLIENT_EMAIL,
    privateKey: 'not a pem at all',
  }
  const network = fakeNetwork(() => ({ status: 200, body: '{}' }))
  const transport = createFcmTransport({ fetch: network.fetch }, account)

  const result = await transport.send(fcmRequest())

  if (result.ok) throw new Error('unreachable')
  assertEquals(result.status, null)
  assertEquals(result.retryable, true, 'nothing was rejected by the provider')
  assertEquals(result.deadToken, false)
  assertEquals(network.calls.length, 0, 'a key that cannot be imported must not dial out')
})

Deno.test('the platform decides the android block, and each device carries its own token', async () => {
  const { account } = await makeAccount()
  const bodies: Array<Record<string, unknown>> = []
  const network = fakeNetwork((call) => {
    if (call.url === FCM_TOKEN_ENDPOINT) return tokenReply('access-token-1')
    bodies.push(JSON.parse(call.body) as Record<string, unknown>)
    return { status: 200, body: '{}' }
  })
  const transport = createFcmTransport({ fetch: network.fetch }, account)

  await transport.send(fcmRequest({ token: 'android-token' }))
  await transport.send(fcmRequest({ token: 'ios-token', platform: 'ios' }))

  assertEquals((bodies[0].message as { token: string }).token, 'android-token')
  assertEquals((bodies[0].message as { android?: unknown }).android, { priority: 'high' })
  assertEquals((bodies[1].message as { token: string }).token, 'ios-token')
  assertEquals((bodies[1].message as { android?: unknown }).android, undefined)
})

Deno.test('an unconfigured deployment is reported, not thrown — no transport is ever built', () => {
  const choice = fcmConfigFrom({})
  assertEquals(choice.kind, 'disabled')
  if (choice.kind !== 'disabled') throw new Error('unreachable')
  assertStringIncludes(choice.reason, 'FCM_SERVICE_ACCOUNT_JSON')
})
