import { describe, expect, it } from 'vitest'
import {
  OAUTH_PROVIDERS,
  oauthErrorMessage,
  oauthRedirectTo,
  probeOAuthProvider,
  providerLabel,
  suggestedHandle,
} from './oauth'

describe('oauthRedirectTo', () => {
  it('keeps a bare origin and adds the trailing slash', () => {
    expect(oauthRedirectTo('http://localhost:5173')).toBe('http://localhost:5173/')
  })

  it('collapses trailing slashes so the allowlist cannot disagree', () => {
    expect(oauthRedirectTo('https://dropin.example/')).toBe('https://dropin.example/')
    expect(oauthRedirectTo('https://dropin.example///')).toBe('https://dropin.example/')
  })

  it('preserves a port and a subpath', () => {
    expect(oauthRedirectTo('http://192.168.1.61:5173')).toBe('http://192.168.1.61:5173/')
    expect(oauthRedirectTo('https://example.com/app')).toBe('https://example.com/app/')
  })
})

describe('oauthErrorMessage', () => {
  it('explains the not-enabled case (the expected answer before setup)', () => {
    const message = oauthErrorMessage('google', 'Unsupported provider: provider is not enabled')
    expect(message).toContain('Google')
    expect(message).toContain('email and password')
  })

  it('names the provider that failed', () => {
    expect(oauthErrorMessage('facebook', 'provider is not enabled')).toContain('Facebook')
  })

  it('reads a cancellation as a cancellation', () => {
    expect(oauthErrorMessage('google', 'access_denied')).toBe('Sign-in was cancelled.')
  })

  it('passes an unknown failure through untouched', () => {
    expect(oauthErrorMessage('google', 'network timeout')).toBe('network timeout')
  })
})

describe('suggestedHandle', () => {
  it('prefers the provider full name', () => {
    expect(suggestedHandle({ full_name: 'Jon Meisburg', name: 'Jon' }, 'jon@x.com')).toBe(
      'Jon Meisburg',
    )
  })

  it('falls back through name, user_name, then the email local part', () => {
    expect(suggestedHandle({ name: 'Nicole' }, 'nicole@x.com')).toBe('Nicole')
    expect(suggestedHandle({ user_name: 'nic' }, 'nicole@x.com')).toBe('nic')
    expect(suggestedHandle({}, 'nicole@x.com')).toBe('nicole')
  })

  it('trims and caps at the 40-char display-name limit', () => {
    expect(suggestedHandle({ full_name: '  Jon  ' }, null)).toBe('Jon')
    expect(suggestedHandle({ full_name: 'x'.repeat(80) }, null)).toHaveLength(40)
  })

  it('returns empty when there is nothing to suggest', () => {
    expect(suggestedHandle(null, null)).toBe('')
    expect(suggestedHandle({ full_name: '   ' }, undefined)).toBe('')
  })
})

describe('provider list', () => {
  it('offers Google first, then Facebook, with human labels', () => {
    expect(OAUTH_PROVIDERS.map((p) => p.id)).toEqual(['google', 'facebook'])
    expect(OAUTH_PROVIDERS[0]?.label).toBe('Continue with Google')
  })

  it('labels providers for messages', () => {
    expect(providerLabel('facebook')).toBe('Facebook')
  })
})
describe('probeOAuthProvider', () => {
  const url = 'https://project.supabase.co/auth/v1/authorize?provider=google'

  it('passes an opaque redirect through (the provider will answer)', async () => {
    const fetchImpl = (async () => ({ type: 'opaqueredirect', ok: false, status: 0 })) as unknown as typeof fetch
    expect(await probeOAuthProvider(url, fetchImpl)).toBeNull()
  })

  it('reports the message a not-enabled provider answers with', async () => {
    const fetchImpl = (async () => ({
      type: 'basic',
      ok: false,
      status: 400,
      json: async () => ({ msg: 'Unsupported provider: provider is not enabled' }),
    })) as unknown as typeof fetch
    expect(await probeOAuthProvider(url, fetchImpl)).toBe(
      'Unsupported provider: provider is not enabled',
    )
  })

  it('falls back to the status when the body is not JSON', async () => {
    const fetchImpl = (async () => ({
      type: 'basic',
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('not json')
      },
    })) as unknown as typeof fetch
    expect(await probeOAuthProvider(url, fetchImpl)).toBe('Sign-in failed (HTTP 503).')
  })

  it('never blocks a sign-in because the probe itself failed (CORS/offline)', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await probeOAuthProvider(url, fetchImpl)).toBeNull()
  })

  it('treats a 200 as fine', async () => {
    const fetchImpl = (async () => ({ type: 'basic', ok: true, status: 200 })) as unknown as typeof fetch
    expect(await probeOAuthProvider(url, fetchImpl)).toBeNull()
  })
})
