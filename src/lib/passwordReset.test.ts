import { describe, expect, it } from 'vitest'
import {
  MIN_PASSWORD_LENGTH,
  RESET_PATH,
  RESET_REQUEST_NOTICE,
  resetRedirectTo,
  resetRequestErrorMessage,
  validateNewPassword,
} from './passwordReset'

describe('resetRedirectTo', () => {
  it('points at the reset screen on the calling origin', () => {
    expect(resetRedirectTo('http://localhost:5173')).toBe('http://localhost:5173/reset-password')
  })

  it('collapses trailing slashes so it cannot disagree with the allowlist', () => {
    expect(resetRedirectTo('https://dropin.example/')).toBe('https://dropin.example/reset-password')
    expect(resetRedirectTo('https://dropin.example///')).toBe(
      'https://dropin.example/reset-password',
    )
  })

  it('keeps a port', () => {
    expect(resetRedirectTo('http://192.168.1.61:5173')).toBe(
      'http://192.168.1.61:5173/reset-password',
    )
  })

  it('agrees with the exported path', () => {
    expect(resetRedirectTo('https://x.test').endsWith(RESET_PATH)).toBe(true)
  })
})

describe('validateNewPassword', () => {
  it('accepts a matching password at the minimum length', () => {
    expect(validateNewPassword('123456', '123456')).toEqual({})
  })

  it('rejects a short password', () => {
    const errors = validateNewPassword('12345', '12345')
    expect(errors.password).toContain(String(MIN_PASSWORD_LENGTH))
  })

  it('rejects a mismatch', () => {
    expect(validateNewPassword('123456', '123457').confirm).toBeDefined()
  })

  it('reports both problems at once', () => {
    const errors = validateNewPassword('abc', 'xyz')
    expect(errors.password).toBeDefined()
    expect(errors.confirm).toBeDefined()
  })
})

describe('resetRequestErrorMessage', () => {
  it('explains the rate limit (2/hour on the built-in mailer)', () => {
    expect(
      resetRequestErrorMessage('Email rate limit exceeded'),
    ).toContain('Too many reset emails')
  })

  it('explains a malformed address', () => {
    expect(resetRequestErrorMessage('Unable to validate email address: invalid format')).toContain(
      'doesn’t look like an email',
    )
  })

  it('passes anything else through', () => {
    expect(resetRequestErrorMessage('network down')).toBe('network down')
  })
})

describe('RESET_REQUEST_NOTICE', () => {
  it('never confirms whether the account exists', () => {
    expect(RESET_REQUEST_NOTICE.toLowerCase()).toContain('if that email has an account')
    expect(RESET_REQUEST_NOTICE.toLowerCase()).not.toContain('we sent')
  })
})
