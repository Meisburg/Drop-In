import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasActiveSession, isPublicDetailPath, isPublicPlacePath, LOGIN_PATH, resolveAuthRedirect } from './auth'

/** Minimal supabase-client mock: only auth.getSession is exercised. */
function mockSupabaseClient(withSession: boolean): SupabaseClient {
  return {
    auth: {
      getSession: async () => ({
        data: { session: withSession ? { access_token: 'fake-token' } : null },
        error: null,
      }),
    },
  } as unknown as SupabaseClient
}

describe('resolveAuthRedirect (auth-redirect logic)', () => {
  it('redirects to /login when signed out (everything but the public pages)', () => {
    expect(resolveAuthRedirect('/', false)).toBe(LOGIN_PATH)
    expect(resolveAuthRedirect('/browse', false)).toBe(LOGIN_PATH)
    expect(resolveAuthRedirect('/u/jamie', false)).toBe(LOGIN_PATH)
  })

  it('lets signed-out visitors open ONE drop-in\'s public surface (V2 slice 5)', () => {
    // The distribution layer (ticket 05): /playdate/:id is the only public
    // app route — the post's content, nothing more.
    expect(resolveAuthRedirect('/playdate/abc', false)).toBeNull()
    expect(resolveAuthRedirect('/playdate/abc/', false)).toBeNull()
    // Not a detail path — the auth wall holds.
    expect(resolveAuthRedirect('/playdate/', false)).toBe(LOGIN_PATH)
    expect(resolveAuthRedirect('/playdate/a/b', false)).toBe(LOGIN_PATH)
    expect(resolveAuthRedirect('/playdate', false)).toBe(LOGIN_PATH)
  })

  it('allows the route when signed in', () => {
    expect(resolveAuthRedirect('/', true)).toBeNull()
    expect(resolveAuthRedirect('/browse', true)).toBeNull()
    expect(resolveAuthRedirect('/mod', true)).toBeNull()
    expect(resolveAuthRedirect('/playdate/abc', true)).toBeNull()
  })

  it('lets signed-in users off /login (bounce to /)', () => {
    expect(resolveAuthRedirect('/login', true)).toBe('/')
  })

  it('lets signed-out users stay on /login', () => {
    expect(resolveAuthRedirect('/login', false)).toBeNull()
  })
})

describe('isPublicDetailPath (the signed-out public route, V2 slice 5)', () => {
  it('matches exactly /playdate/<id>', () => {
    expect(isPublicDetailPath('/playdate/abc-123')).toBe(true)
    expect(isPublicDetailPath('/playdate/abc-123/')).toBe(true)
  })

  it('rejects non-detail paths (the auth wall holds everywhere else)', () => {
    expect(isPublicDetailPath('/playdate')).toBe(false)
    expect(isPublicDetailPath('/playdate/')).toBe(false)
    expect(isPublicDetailPath('/playdate/a/b')).toBe(false)
    expect(isPublicDetailPath('/')).toBe(false)
    expect(isPublicDetailPath('/u/jamie')).toBe(false)
  })
})

describe('isPublicPlacePath (the signed-out place page, V8 ticket 07)', () => {
  it('matches exactly /place/<id>', () => {
    expect(isPublicPlacePath('/place/abc-123')).toBe(true)
    expect(isPublicPlacePath('/place/abc-123/')).toBe(true)
  })

  it('rejects non-place paths (the auth wall holds everywhere else)', () => {
    expect(isPublicPlacePath('/place')).toBe(false)
    expect(isPublicPlacePath('/place/')).toBe(false)
    expect(isPublicPlacePath('/place/a/b')).toBe(false)
    expect(isPublicPlacePath('/places')).toBe(false)
    expect(isPublicPlacePath('/browse')).toBe(false)
  })

  it('lets a signed-out visitor open a place page (the anon places SELECT, 0029)', () => {
    expect(resolveAuthRedirect('/place/abc-123', false)).toBeNull()
    // …and the wall still holds on everything that is not a public page.
    expect(resolveAuthRedirect('/place/a/b', false)).toBe(LOGIN_PATH)
    expect(resolveAuthRedirect('/new', false)).toBe(LOGIN_PATH)
  })
})

describe('hasActiveSession (mocked supabase client)', () => {
  it('is false when the mocked client has no session (signed out)', async () => {
    const client = mockSupabaseClient(false)
    expect(await hasActiveSession(client)).toBe(false)
  })

  it('is true when the mocked client has a session (signed in)', async () => {
    const client = mockSupabaseClient(true)
    expect(await hasActiveSession(client)).toBe(true)
  })
})
