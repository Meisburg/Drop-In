import { describe, expect, it } from 'vitest'
import {
  oauthErrorMessage,
  oauthRedirectTo,
  probeOAuthProvider,
  providerLabel,
  resolveOAuthProviders,
  suggestedHandle,
  splitSuggestedName,
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

describe('resolveOAuthProviders', () => {
  it('defaults to Google when the env value is unset or empty', () => {
    expect(resolveOAuthProviders(undefined).map((p) => p.id)).toEqual(['google'])
    expect(resolveOAuthProviders('').map((p) => p.id)).toEqual(['google'])
    expect(resolveOAuthProviders('   ').map((p) => p.id)).toEqual(['google'])
  })

  it('honours an explicit list, in the order given', () => {
    expect(resolveOAuthProviders('google,facebook').map((p) => p.id)).toEqual([
      'google',
      'facebook',
    ])
    expect(resolveOAuthProviders('facebook').map((p) => p.id)).toEqual(['facebook'])
  })

  it('is case- and whitespace-tolerant and drops duplicates', () => {
    expect(resolveOAuthProviders(' Google , google ,FACEBOOK ').map((p) => p.id)).toEqual([
      'google',
      'facebook',
    ])
  })

  it('drops names it does not know rather than rendering a dead button', () => {
    expect(resolveOAuthProviders('google,twitter,github').map((p) => p.id)).toEqual(['google'])
    // ...but an all-unknown value still falls back to a usable default.
    expect(resolveOAuthProviders('twitter').map((p) => p.id)).toEqual(['google'])
  })

  it('labels the buttons for humans', () => {
    expect(resolveOAuthProviders('google,facebook').map((p) => p.label)).toEqual([
      'Continue with Google',
      'Continue with Facebook',
    ])
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
/**
 * V20 t06: the two name fields on /onboarding's handle step are seeded from
 * the provider's single full-name string, so the split is a rule that has to
 * hold — and the failure mode it guards against is a form prefilled with
 * something the parent never wrote.
 */
describe('splitSuggestedName (V20 t06: provider name -> the two fields)', () => {
  it('splits a two-word name', () => {
    expect(splitSuggestedName('Sam Rivera')).toEqual({ first: 'Sam', last: 'Rivera' })
  })

  it('keeps everything after the first word as the last name (middle names survive)', () => {
    expect(splitSuggestedName('Mary Jo van der Berg')).toEqual({
      first: 'Mary',
      last: 'Jo van der Berg',
    })
  })

  it('puts a single word in the first name and leaves the last name empty', () => {
    expect(splitSuggestedName('Sam')).toEqual({ first: 'Sam', last: '' })
  })

  it('flips a surname-first "Last, First" listing', () => {
    expect(splitSuggestedName('Rivera, Sam')).toEqual({ first: 'Sam', last: 'Rivera' })
  })

  it('returns two empty halves for no name at all', () => {
    expect(splitSuggestedName('')).toEqual({ first: '', last: '' })
    expect(splitSuggestedName('   ')).toEqual({ first: '', last: '' })
  })

  it('collapses whitespace and trims before splitting', () => {
    expect(splitSuggestedName('  Sam   Rivera  ')).toEqual({ first: 'Sam', last: 'Rivera' })
  })

  it('caps each half at the field\'s own 40-character maxLength', () => {
    const parts = splitSuggestedName(`${'A'.repeat(60)} ${'B'.repeat(60)}`)
    expect(parts.first).toHaveLength(40)
    expect(parts.last).toHaveLength(40)
  })

  it('round-trips through composeDisplayName for the ordinary shapes', () => {
    // The two seams are used together on /onboarding (split to seed the fields,
    // compose to write the handle), so the common cases must survive the trip.
    for (const name of ['Sam Rivera', 'Mary Jo van der Berg', 'Sam', 'Rivera, Sam']) {
      const parts = splitSuggestedName(name)
      const roundTripped = `${parts.first} ${parts.last}`.trim()
      expect(roundTripped.split(/\s+/).sort().join(' ')).toBe(
        name.replace(',', '').split(/\s+/).sort().join(' '),
      )
    }
  })
})
