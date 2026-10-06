/**
 * The marker session's expiry decision (2026-10-05).
 *
 * THE DEFECT THIS SERVES, measured: Supabase access tokens live 3600 s
 * (`exp - iat`), and `e2e/.auth/marker-state.json` (gitignored, machine-local)
 * holds exactly one of them. `e2e/auth.setup.ts` is the only thing that mints a
 * fresh one, and the `chromium` project only REUSES the file — so any run that
 * does not include the `setup` project drives the app with whatever the last
 * full run left behind, and from ~1 hour after that run the session is dead.
 * The trigger is `--no-deps` (or a second Playwright config that pins chromium's
 * storageState and drops the setup project), NOT the plain file filter the filed
 * spec blames — see the corrected measurement in `e2e/fixtures.ts`'s guard, and
 * `.scratch/e2e-marker-token/spec.md` for the original.
 *
 * WHY IT COSTS MORE THAN ONE RED SPEC: the failure signature is
 * indistinguishable from a flake or a genuine regression. Measured 2026-10-05:
 * a run whose token had expired 11 minutes earlier produced 11 red specs across
 * four files, all `HTTP 401 {"code":"PGRST303","message":"JWT expired"}`, and
 * they read as product regressions — close enough that a builder nearly
 * "fixed" `src/`. The rule below is what lets the harness say the true cause
 * out loud instead.
 *
 * PURE, AND THAT IS THE POINT (docs/agents/code-structure.md): this module
 * decides; `e2e/fixtures.ts` reads the file, reports the failure and executes.
 * Nothing here touches the filesystem, the clock or a JWT library — `now` is a
 * parameter and the storageState is a plain parsed object, so the decision is
 * pinned by a table in `markerToken.test.ts` with no browser and no disk.
 *
 * WHY THE JWT `exp` AND NOT THE BLOB'S `expires_at`: supabase-js persists both,
 * and `expires_at` is a copy of a number the token carries itself. The token is
 * what the server checks, so the token's own claim is the authority; a blob that
 * disagrees with its token must not be able to certify the session.
 *
 * THE FAIL-CLOSED DIRECTION IS DELIBERATE: an absent file, a token that is not a
 * decodable JWT, and a JWT with no numeric `exp` all report EXPIRED. Each one is
 * a session whose freshness cannot be proven, and an unprovable session that is
 * allowed through is exactly the silent-rot this module exists to end. The
 * verdict carries a `reason` so the caller's message can say WHICH of them it
 * was rather than guessing.
 *
 * `findStoredMarkerSession` is not only a helper for the decision: it is the ONE
 * copy of the session-blob parse. `e2e/fixtures.ts`'s `readMarkerSession` (127
 * call sites across 52 specs) used to carry its own copy of this walk, and a
 * second copy is what would drift the day supabase-js changes the blob shape
 * again — which it has already done once (raw session → `currentSession` /
 * `allSessions` / `sessions` wrapper), which is why all four shapes are accepted
 * here.
 */

/** One Supabase session found in a Playwright storageState blob (no secrets). */
export interface StoredMarkerSession {
  accessToken: string
  userId: string
}

/** The session shapes supabase-js has persisted in this repo's lifetime. */
interface SessionBlob {
  access_token?: unknown
  user?: { id?: unknown }
  currentSession?: SessionBlob
  allSessions?: SessionBlob[]
  sessions?: SessionBlob[]
}

/** A JWT segment is unpadded base64url and nothing else (see decodeBase64Url). */
const JWT_SEGMENT = /^[A-Za-z0-9_-]+$/

function sessionFromBlob(blob: SessionBlob | null | undefined): StoredMarkerSession | null {
  const candidate =
    (typeof blob?.access_token === 'string' ? blob : undefined) ??
    blob?.currentSession ??
    blob?.allSessions?.[0] ??
    blob?.sessions?.[0]
  if (
    candidate === null ||
    candidate === undefined ||
    typeof candidate.access_token !== 'string' ||
    typeof candidate.user?.id !== 'string'
  ) {
    return null
  }
  return { accessToken: candidate.access_token, userId: candidate.user.id }
}

/**
 * Walk a parsed storageState object for a Supabase session, or null when it
 * holds none. Accepts every shape `sessionFromBlob` knows and skips any
 * localStorage entry that is not an `auth` blob or does not parse — the same
 * tolerance as the in-browser twin (`readSessionFromBrowserPage`), so a Node
 * caller and a page caller cannot disagree about whether a session exists.
 */
export function findStoredMarkerSession(state: unknown): StoredMarkerSession | null {
  if (state === null || typeof state !== 'object') return null
  const origins = (state as { origins?: unknown }).origins
  if (!Array.isArray(origins)) return null
  for (const origin of origins) {
    if (origin === null || typeof origin !== 'object') continue
    const items = (origin as { localStorage?: unknown }).localStorage
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (item === null || typeof item !== 'object') continue
      const { name, value } = item as { name?: unknown; value?: unknown }
      if (typeof name !== 'string' || !name.includes('auth')) continue
      if (typeof value !== 'string') continue
      let blob: SessionBlob | null
      try {
        blob = JSON.parse(value) as SessionBlob
      } catch {
        continue
      }
      const session = sessionFromBlob(blob)
      if (session !== null) return session
    }
  }
  return null
}

/**
 * base64url → UTF-8 text, or null when the segment is not decodable.
 *
 * The alphabet is checked by hand BEFORE `atob` because `atob` does not fail
 * loudly on junk: it strips whitespace and ignores characters outside the
 * alphabet, so `atob('not a jwt')` returns bytes rather than throwing (measured,
 * node 26). A guard whose whole job is to be loud cannot inherit that.
 */
function decodeBase64Url(segment: string): string | null {
  if (!JWT_SEGMENT.test(segment)) return null
  try {
    const binary = atob(segment.replace(/-/g, '+').replace(/_/g, '/'))
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
}

/** The three ways a token can fail to yield an expiry — kept apart for the message. */
type TokenExpiry =
  | { kind: 'ok'; expMs: number }
  | { kind: 'malformed-token' }
  | { kind: 'no-exp' }

function readTokenExpiry(token: string): TokenExpiry {
  const segments = token.split('.')
  if (segments.length !== 3) return { kind: 'malformed-token' }
  const json = decodeBase64Url(segments[1])
  if (json === null) return { kind: 'malformed-token' }
  let payload: unknown
  try {
    payload = JSON.parse(json)
  } catch {
    return { kind: 'malformed-token' }
  }
  if (payload === null || typeof payload !== 'object') return { kind: 'malformed-token' }
  const exp = (payload as { exp?: unknown }).exp
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return { kind: 'no-exp' }
  return { kind: 'ok', expMs: exp * 1000 }
}

/** Why the verdict came out the way it did — the caller's message keys off this. */
export type MarkerTokenReason = 'fresh' | 'expired' | 'no-exp' | 'malformed-token' | 'absent'

export interface MarkerTokenDiagnosis {
  /** True when the stored session must not be trusted (fail closed). */
  expired: boolean
  reason: MarkerTokenReason
  /** The token's `exp` in epoch ms, or null when there is no readable one. */
  expMs: number | null
}

/**
 * The rule, once: is the marker session in `state` usable at `now` (epoch ms)?
 *
 * Expiry is inclusive — a token whose `exp` equals `now` is expired, because
 * the server will reject it at that instant and a run that starts exactly then
 * is the case being guarded.
 */
export function diagnoseMarkerToken(state: unknown, now: number): MarkerTokenDiagnosis {
  const session = findStoredMarkerSession(state)
  if (session === null) return { expired: true, reason: 'absent', expMs: null }
  const expiry = readTokenExpiry(session.accessToken)
  if (expiry.kind !== 'ok') return { expired: true, reason: expiry.kind, expMs: null }
  if (expiry.expMs <= now) return { expired: true, reason: 'expired', expMs: expiry.expMs }
  return { expired: false, reason: 'fresh', expMs: expiry.expMs }
}

/** The boolean seam the harness asks its one question through. */
export function isMarkerTokenExpired(state: unknown, now: number): boolean {
  return diagnoseMarkerToken(state, now).expired
}
