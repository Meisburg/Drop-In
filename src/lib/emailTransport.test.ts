/**
 * The transport gate's spec — the pure rules in
 * `supabase/functions/_shared/emailTransport.ts`, imported through the app seam.
 *
 * Two things are load-bearing here, and both are asserted rather than assumed:
 *
 *  1. PRECEDENCE. SMTP wins when both transports are complete. That is the
 *     founder's instruction: Gmail already carries Drop In's auth email and is
 *     proven live, while Resend still needs a sending domain it does not have.
 *     Swapping the gate to "Resend first" would silently move every notice onto
 *     a transport that cannot deliver.
 *  2. THE DISABLED REASON NAMES WHAT IS MISSING. That string is appended to the
 *     `notification_log` row and is the ONLY record of why a parent was never
 *     emailed, so a generic "email is not configured" is a bug, not a wording
 *     choice. The all-blank case is pinned to the exact sentence a human reads.
 */
import { describe, expect, it } from 'vitest'

import { chooseTransport, type TransportEnv } from './emailTransport'

/** Every knob explicitly blank, so no test depends on an unstated default. */
function env(overrides: Partial<TransportEnv> = {}): TransportEnv {
  return { smtpPass: '', smtpUser: '', resendApiKey: '', emailFrom: '', ...overrides }
}

const SMTP_ENV: TransportEnv = {
  smtpUser: 'jonmeisburg@gmail.com',
  smtpPass: 'abcd efgh ijkl mnop',
  emailFrom: 'Drop In <jonmeisburg@gmail.com>',
}

const RESEND_ENV: TransportEnv = {
  resendApiKey: 're_test_key_123',
  emailFrom: 'Drop In <hello@dropin.test>',
}

describe('chooseTransport — SMTP is the primary transport', () => {
  it('rule 1: smtpPass + smtpUser + emailFrom -> smtp', () => {
    const choice = chooseTransport(SMTP_ENV)
    expect(choice.kind).toBe('smtp')
    expect(choice.reason).toContain('smtp.gmail.com')
  })

  it('rule 4 (precedence): SMTP wins when BOTH transports are configured', () => {
    const choice = chooseTransport({ ...SMTP_ENV, ...RESEND_ENV })
    expect(choice.kind).toBe('smtp')
    expect(choice.kind).not.toBe('resend')
    expect(choice.reason).toContain('smtp.gmail.com')
  })

  it('rule 1 is strict: a complete Resend plus a partial SMTP falls to resend, not smtp', () => {
    const choice = chooseTransport({ ...RESEND_ENV, smtpUser: 'jonmeisburg@gmail.com' })
    expect(choice.kind).toBe('resend')
  })
})

describe('chooseTransport — Resend remains available', () => {
  it('rule 2: resendApiKey + emailFrom -> resend', () => {
    const choice = chooseTransport(RESEND_ENV)
    expect(choice.kind).toBe('resend')
    expect(choice.reason.toLowerCase()).toContain('resend')
  })

  it('rule 2: an api key without a From address is NOT enough', () => {
    const choice = chooseTransport(env({ resendApiKey: 're_test_key_123' }))
    expect(choice.kind).toBe('disabled')
  })
})

describe('chooseTransport — disabled, and honest about why', () => {
  it('rule 3: everything blank names all three SMTP variables', () => {
    const choice = chooseTransport(env())
    expect(choice.kind).toBe('disabled')
    // The exact sentence a human reads in notification_log — the reason this
    // module exists rather than three lines of `if` in the function.
    expect(choice.reason).toBe(
      'no email transport configured (missing SMTP_PASS, SMTP_USER, EMAIL_FROM)',
    )
  })

  it('an entirely unset env (no keys at all) is disabled, not a crash', () => {
    const choice = chooseTransport({})
    expect(choice.kind).toBe('disabled')
    expect(choice.reason).toBe(
      'no email transport configured (missing SMTP_PASS, SMTP_USER, EMAIL_FROM)',
    )
  })

  it('names ONLY the missing variable in a partial configuration', () => {
    const missingUser = chooseTransport(env({ ...SMTP_ENV, smtpUser: '' }))
    expect(missingUser.kind).toBe('disabled')
    expect(missingUser.reason).toContain('SMTP_USER')
    expect(missingUser.reason).not.toContain('SMTP_PASS')
    expect(missingUser.reason).not.toContain('EMAIL_FROM')

    const missingPass = chooseTransport(env({ ...SMTP_ENV, smtpPass: '' }))
    expect(missingPass.kind).toBe('disabled')
    expect(missingPass.reason).toContain('SMTP_PASS')
    expect(missingPass.reason).not.toContain('SMTP_USER')
    expect(missingPass.reason).not.toContain('EMAIL_FROM')

    const missingFrom = chooseTransport(env({ ...SMTP_ENV, emailFrom: '' }))
    expect(missingFrom.kind).toBe('disabled')
    expect(missingFrom.reason).toContain('EMAIL_FROM')
    expect(missingFrom.reason).not.toContain('SMTP_USER')
    expect(missingFrom.reason).not.toContain('SMTP_PASS')
  })

  it('names both missing SMTP variables when only one is set', () => {
    const choice = chooseTransport(env({ smtpUser: 'jonmeisburg@gmail.com' }))
    expect(choice.kind).toBe('disabled')
    expect(choice.reason).toContain('SMTP_PASS')
    expect(choice.reason).toContain('EMAIL_FROM')
    expect(choice.reason).not.toContain('SMTP_USER')
  })

  it('every branch carries a non-empty reason', () => {
    for (const candidate of [SMTP_ENV, RESEND_ENV, env(), {}]) {
      expect(chooseTransport(candidate).reason.trim()).not.toBe('')
    }
  })
})

describe('chooseTransport — blankness is decided on the trimmed value', () => {
  it('whitespace-only SMTP_PASS does not open the gate', () => {
    const choice = chooseTransport(env({ ...SMTP_ENV, smtpPass: '   \n\t ' }))
    expect(choice.kind).toBe('disabled')
    expect(choice.reason).toContain('SMTP_PASS')
  })

  it('whitespace-only SMTP_USER does not open the gate', () => {
    const choice = chooseTransport(env({ ...SMTP_ENV, smtpUser: '   ' }))
    expect(choice.kind).toBe('disabled')
    expect(choice.reason).toContain('SMTP_USER')
  })

  it('whitespace-only EMAIL_FROM does not open the gate', () => {
    const choice = chooseTransport(env({ ...SMTP_ENV, emailFrom: '  ' }))
    expect(choice.kind).toBe('disabled')
    expect(choice.reason).toContain('EMAIL_FROM')
  })

  it('whitespace-only RESEND_API_KEY does not open the gate', () => {
    const choice = chooseTransport(env({ resendApiKey: '   ' }))
    expect(choice.kind).toBe('disabled')
  })

  it('padded values still open the gate', () => {
    const choice = chooseTransport(
      env({
        smtpUser: '  jonmeisburg@gmail.com  ',
        smtpPass: '\t abcd efgh \n',
        emailFrom: ' Drop In <jonmeisburg@gmail.com> ',
      }),
    )
    expect(choice.kind).toBe('smtp')
  })
})
