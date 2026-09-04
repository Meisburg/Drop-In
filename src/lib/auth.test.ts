import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasActiveSession, LOGIN_PATH, resolveAuthRedirect } from './auth'

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
  it('redirects to /login when signed out', () => {
    expect(resolveAuthRedirect('/', false)).toBe(LOGIN_PATH)
    expect(resolveAuthRedirect('/browse', false)).toBe(LOGIN_PATH)
    expect(resolveAuthRedirect('/playdate/abc', false)).toBe(LOGIN_PATH)
  })

  it('allows the route when signed in', () => {
    expect(resolveAuthRedirect('/', true)).toBeNull()
    expect(resolveAuthRedirect('/browse', true)).toBeNull()
    expect(resolveAuthRedirect('/mod', true)).toBeNull()
  })

  it('lets signed-in users off /login (bounce to /)', () => {
    expect(resolveAuthRedirect('/login', true)).toBe('/')
  })

  it('lets signed-out users stay on /login', () => {
    expect(resolveAuthRedirect('/login', false)).toBeNull()
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