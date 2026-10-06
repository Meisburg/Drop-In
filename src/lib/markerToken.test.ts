/**
 * The marker session expiry decision, pinned as a table (2026-10-05).
 *
 * WHAT IS PINNED, and why each row is here rather than in a comment:
 *
 * 1. THE DECISION TABLE — absent storage, a malformed token, a JWT with no
 *    `exp`, a past `exp`, a future `exp`, and the `exp === now` boundary. Every
 *    row asserts `expired` AND the `reason`, because the harness's failure
 *    message keys off the reason; a verdict that is right for the wrong cause
 *    still sends the reader to the wrong place.
 * 2. THE FOUR BLOB SHAPES — the raw session, `currentSession`, `allSessions[0]`
 *    and `sessions[0]`. `e2e/fixtures.ts`'s `readMarkerSession` (127 call sites)
 *    now takes its session walk from this module, so a shape that stops being
 *    accepted here is a shape that silently stops working there.
 * 3. FAIL CLOSED — every unprovable session reports expired. The negative
 *    direction of this rule is the defect the module exists to fix, so it is
 *    asserted, not assumed.
 */

import { describe, expect, it } from 'vitest'
import {
  diagnoseMarkerToken,
  findStoredMarkerSession,
  isMarkerTokenExpired,
  type MarkerTokenReason,
} from './markerToken'

/** One fixed clock for every row: 2027-01-15T08:00:00.000Z. */
const NOW = 1_800_000_000_000
const NOW_SECONDS = NOW / 1000

function base64UrlJson(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A three-segment token whose payload is `payload` (the signature is never read). */
function tokenWithPayload(payload: unknown): string {
  return `${base64UrlJson({ alg: 'HS256', typ: 'JWT' })}.${base64UrlJson(payload)}.c2ln`
}

/** A JWT-shaped token that expires `secondsFromNow` seconds after the fixed clock. */
function tokenExpiringIn(secondsFromNow: number): string {
  return tokenWithPayload({ sub: 'marker', iat: NOW_SECONDS - 3600, exp: NOW_SECONDS + secondsFromNow })
}

/** The storageState shape `e2e/auth.setup.ts` writes, with `blob` under one auth key. */
function stateWith(rawBlob: string, key = 'sb-testproject-auth-token'): unknown {
  return {
    cookies: [],
    origins: [
      {
        origin: 'http://localhost:4173',
        localStorage: [{ name: key, value: rawBlob }],
      },
    ],
  }
}

function stateWithBlob(blob: unknown, key?: string): unknown {
  return stateWith(typeof blob === 'string' ? blob : JSON.stringify(blob), key)
}

/** The raw session blob supabase-js writes today. */
function rawSession(accessToken: string): unknown {
  return { access_token: accessToken, refresh_token: 'refresh', user: { id: 'user-1' } }
}

const SESSION_USER = 'user-1'

/** Rows that must all report EXPIRED, with the reason the message will name. */
const EXPIRED_ROWS: Array<[string, unknown, MarkerTokenReason]> = [
  ['no state at all (file absent → undefined)', undefined, 'absent'],
  ['null state', null, 'absent'],
  ['a non-object state (a JSON string)', 'marker-state.json', 'absent'],
  ['an empty object', {}, 'absent'],
  ['no origins array', { cookies: [] }, 'absent'],
  ['an empty origins array', { origins: [] }, 'absent'],
  ['an origin with no localStorage', { origins: [{ origin: 'http://localhost:4173' }] }, 'absent'],
  [
    'a localStorage entry under a key that is not an auth blob',
    stateWith('{"access_token":"x"}', 'theme'),
    'absent',
  ],
  ['an auth entry whose value is not JSON at all', stateWith('this is not json'), 'absent'],
  ['an auth blob with no access_token', stateWithBlob({ user: { id: SESSION_USER } }), 'absent'],
  ['an auth blob with no user id', stateWithBlob({ access_token: tokenExpiringIn(60) }), 'absent'],
  [
    'a token that is not a JWT (one segment)',
    stateWithBlob(rawSession('not-a-jwt')),
    'malformed-token',
  ],
  [
    'a token with two segments',
    stateWithBlob(rawSession('aaa.bbb')),
    'malformed-token',
  ],
  [
    'a three-segment token whose payload is not JSON',
    stateWithBlob(rawSession('aaa.bm90LWpzb24.c2ln')),
    'malformed-token',
  ],
  [
    'a three-segment token whose payload segment carries base64 junk',
    stateWithBlob(rawSession('aaa.bm90IGpzb24.c2ln')),
    'malformed-token',
  ],
  [
    'a valid JWT whose payload has no exp claim',
    stateWithBlob(rawSession(tokenWithPayload({ sub: SESSION_USER }))),
    'no-exp',
  ],
  [
    'a valid JWT whose exp is a string, not a number',
    stateWithBlob(rawSession(tokenWithPayload({ exp: '1800000000' }))),
    'no-exp',
  ],
  ['an exp in the past (the measured defect)', stateWithBlob(rawSession(tokenExpiringIn(-600))), 'expired'],
  ['an exp exactly now (inclusive boundary)', stateWithBlob(rawSession(tokenExpiringIn(0))), 'expired'],
]

describe('diagnoseMarkerToken — every unprovable or dead session is expired', () => {
  it.each(EXPIRED_ROWS)('%s', (_label, state, reason) => {
    const diagnosis = diagnoseMarkerToken(state, NOW)
    expect(diagnosis).toMatchObject({ expired: true, reason })
    expect(isMarkerTokenExpired(state, NOW)).toBe(true)
  })

  it('reports the exact expiry instant so the message can name it', () => {
    const state = stateWithBlob(rawSession(tokenExpiringIn(-600)))
    expect(diagnoseMarkerToken(state, NOW).expMs).toBe(NOW - 600_000)
  })
})

describe('diagnoseMarkerToken — a live session is fresh', () => {
  it('a token with a future exp is fresh, and carries its exp', () => {
    const state = stateWithBlob(rawSession(tokenExpiringIn(3600)))
    expect(diagnoseMarkerToken(state, NOW)).toEqual({
      expired: false,
      reason: 'fresh',
      expMs: NOW + 3_600_000,
    })
    expect(isMarkerTokenExpired(state, NOW)).toBe(false)
  })

  it('is fresh until exp and expired AT exp (the boundary is inclusive)', () => {
    const state = stateWithBlob(rawSession(tokenExpiringIn(1)))
    const expMs = NOW + 1000
    expect(diagnoseMarkerToken(state, NOW).expMs).toBe(expMs)
    expect(isMarkerTokenExpired(state, expMs - 1)).toBe(false)
    expect(isMarkerTokenExpired(state, expMs)).toBe(true)
  })

  it('a fresh token on a REAL marker-shaped blob with user metadata is fresh', () => {
    const state = stateWithBlob({
      access_token: tokenExpiringIn(3600),
      refresh_token: 'refresh',
      expires_at: NOW_SECONDS + 3600,
      expires_in: 3600,
      token_type: 'bearer',
      user: { id: SESSION_USER, user_metadata: { display_name: 'e2e-1 Marker' } },
    })
    expect(isMarkerTokenExpired(state, NOW)).toBe(false)
  })
})

describe('findStoredMarkerSession — the one copy of the blob walk', () => {
  it('reads the raw session shape', () => {
    const token = tokenExpiringIn(3600)
    expect(findStoredMarkerSession(stateWithBlob(rawSession(token)))).toEqual({
      accessToken: token,
      userId: SESSION_USER,
    })
  })

  it.each([
    ['currentSession', (token: string) => ({ currentSession: { access_token: token, user: { id: SESSION_USER } } })],
    ['allSessions[0]', (token: string) => ({ allSessions: [{ access_token: token, user: { id: SESSION_USER } }] })],
    ['sessions[0]', (token: string) => ({ sessions: [{ access_token: token, user: { id: SESSION_USER } }] })],
  ])('reads the %s wrapper shape', (_shape, build) => {
    const token = tokenExpiringIn(3600)
    const state = stateWithBlob(build(token))
    expect(findStoredMarkerSession(state)).toEqual({ accessToken: token, userId: SESSION_USER })
    expect(isMarkerTokenExpired(state, NOW)).toBe(false)
  })

  it('finds the session on a LATER origin, not just the first', () => {
    const token = tokenExpiringIn(3600)
    const state = {
      origins: [
        { origin: 'http://localhost:4173', localStorage: [{ name: 'theme', value: 'dark' }] },
        { origin: 'http://localhost:4174', localStorage: [{ name: 'sb-other-auth-token', value: JSON.stringify(rawSession(token)) }] },
      ],
    }
    expect(findStoredMarkerSession(state)).toEqual({ accessToken: token, userId: SESSION_USER })
  })

  it('returns null (never throws) for a state that holds no session', () => {
    expect(findStoredMarkerSession(undefined)).toBeNull()
    expect(findStoredMarkerSession(stateWith('{'))).toBeNull()
  })
})
