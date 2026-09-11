/**
 * Password-reset seams (V5 beta readiness) — pure, so the rules are testable
 * without a browser or a network (the lib/auth.ts + lib/oauth.ts discipline).
 *
 * The delivery path is Supabase's: resetPasswordForEmail emails a link, that
 * link returns the browser to RESET_PATH with a recovery token, and
 * supabase-js (detectSessionInUrl, on by default) turns the token into a
 * short-lived session — the page then calls updateUser({ password }).
 *
 * DELIVERY CAVEAT: this project has no smtp_host configured, so auth mail goes
 * out on Supabase's built-in sender, which the live config rate-limits to
 * `rate_limit_email_sent = 2` PER HOUR. A handful of testers will exhaust that
 * immediately. Connect a real sender (Resend/SendGrid/Postmark) before inviting
 * anyone — see docs/beta-checklist.md.
 */

/** Where the emailed link lands: the "choose a new password" screen. */
export const RESET_PATH = '/reset-password'

/** Supabase's default minimum (Auth → Providers → Email → password length). */
export const MIN_PASSWORD_LENGTH = 6

/**
 * Where the emailed link sends the browser back to. Origin-based like the OAuth
 * redirect, so localhost, the LAN address and the deployed URL all work — and
 * whichever origin is live must be in the Supabase redirect allowlist
 * (URI_ALLOW_LIST), or Supabase silently substitutes SITE_URL instead.
 */
export function resetRedirectTo(origin: string): string {
  return `${origin.replace(/\/+$/, '')}${RESET_PATH}`
}

export interface NewPasswordErrors {
  password?: string
  confirm?: string
}

/** Validate the "choose a new password" form (pure; {} means valid). */
export function validateNewPassword(password: string, confirm: string): NewPasswordErrors {
  const errors: NewPasswordErrors = {}
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (confirm !== password) {
    errors.confirm = 'The two passwords don’t match.'
  }
  return errors
}

/**
 * What the requester sees after asking for a link. Deliberately says nothing
 * about whether that address has an account — the endpoint answers identically
 * either way, and this copy must not undo that (no account enumeration).
 */
export const RESET_REQUEST_NOTICE =
  'If that email has an account, a reset link is on its way. Check your inbox (and spam).'

/**
 * A reset failure, said like a person would say it. The rate-limit case is not
 * hypothetical here — the built-in mailer allows 2 auth emails per hour — so it
 * gets a sentence rather than a raw Supabase string.
 */
export function resetRequestErrorMessage(message: string): string {
  if (/rate limit|too many/i.test(message)) {
    return 'Too many reset emails in the last hour — wait a bit, then try again.'
  }
  if (/invalid.*email|unable to validate email/i.test(message)) {
    return 'That doesn’t look like an email address.'
  }
  return message
}
