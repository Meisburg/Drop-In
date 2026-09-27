/**
 * The TRANSPORT GATE — which email transport this deployment actually has, as a
 * PURE decision. No I/O, no globals, no `Deno.env`, no `import.meta.env`: the
 * caller reads the environment and hands the values over, so vitest can pin
 * every branch without an environment.
 *
 * Two runtimes import this one file:
 *
 *   supabase/functions/send-push/index.ts   the ONE sender, which reads the
 *                                           secrets once and turns them into
 *                                           the transport it should use
 *   src/lib/emailTransport.ts               the app's re-export seam, which is
 *                                           what the vitest spec imports
 *
 * It lives under `supabase/functions/_shared/` for the same reason
 * `emailFallback.ts` and `resend.ts` do: that is the layout the Supabase CLI
 * bundles for a deployed function (a relative import that escapes `supabase/`
 * is not something the deploy step promises), and the app can import INTO it at
 * no cost.
 *
 * WHY THIS IS A MODULE AND NOT THREE LINES OF `if` IN THE FUNCTION. The drain
 * reads live Postgres through a service-role client and cannot be unit-tested.
 * The one fact that must not be fudged — WHICH transport exists, and, when none
 * does, WHY — is extracted here, where vitest pins it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DISABLED REASON IS THE POINT OF THE WHOLE MODULE. The third state
 * (`disabled`) is not a silent "nothing to do": its `reason` is APPENDED to the
 * `notification_log` stamp, and that row is the ONLY record of why a parent was
 * never emailed. A generic "email is not configured" makes the log a lie by
 * omission — a human debugging "why did nobody get told?" needs to see the NAME
 * of the secret that is missing. So every disabled reason names the missing
 * variables, e.g.
 *
 *   no email transport configured (missing SMTP_PASS, SMTP_USER, EMAIL_FROM)
 *
 * The names are the PREFERRED transport's (SMTP — see the precedence rule
 * below), in a fixed order, and `RESEND_API_KEY` is deliberately not listed:
 * when every SMTP name is missing the example above is exactly what a human
 * needs, and Resend is the optional later fallback rather than the intent. In a
 * partial configuration the list is a subset, so the reason always names what a
 * human must set to make the gate open.
 *
 * PRECEDENCE: SMTP WINS WHEN BOTH ARE CONFIGURED. That is the founder's
 * instruction, not an accident of ordering: Gmail SMTP is proven live and needs
 * no sending domain, Resend is the one that cannot deliver yet. First match
 * wins, and the order is asserted in its own tests because it is load-bearing.
 */

export type TransportKind = 'smtp' | 'resend' | 'disabled'

/**
 * Every fact the decision needs — all injected, all optional because "unset"
 * and "blank" must be treated the same. The caller trims nothing; this module
 * trims, so a whitespace-only secret can never open the gate.
 */
export interface TransportEnv {
  smtpPass?: string
  smtpUser?: string
  resendApiKey?: string
  emailFrom?: string
}

export interface TransportChoice {
  kind: TransportKind
  /** One honest, non-empty sentence. For `disabled` it MUST name what is
   *  missing: it is appended to the queue row and is the only record of why
   *  nothing was delivered. */
  reason: string
}

/**
 * The single decision point. Rules, in order:
 *
 *  1. SMTP when `smtpPass`, `smtpUser` AND `emailFrom` are all non-blank. Gmail
 *     is the primary transport — it already carries Drop In's auth email and is
 *     proven live, so it is the one that can actually deliver today.
 *  2. else Resend when `resendApiKey` and `emailFrom` are non-blank. Kept
 *     working for when a sending domain exists (all three SMTP values would
 *     then be needed to take precedence, so setting just `RESEND_API_KEY`
 *     switches the transport back).
 *  3. else `disabled`, with a reason that NAMES the missing variables.
 */
export function chooseTransport(env: TransportEnv): TransportChoice {
  const smtpUser = (env.smtpUser ?? '').trim()
  const smtpPass = (env.smtpPass ?? '').trim()
  const emailFrom = (env.emailFrom ?? '').trim()
  const resendApiKey = (env.resendApiKey ?? '').trim()

  // Rule 1 — SMTP first, so SMTP beats Resend whenever both are complete.
  if (smtpPass !== '' && smtpUser !== '' && emailFrom !== '') {
    return { kind: 'smtp', reason: 'smtp.gmail.com' }
  }

  // Rule 2 — Resend, still usable, never deleted.
  if (resendApiKey !== '' && emailFrom !== '') {
    return { kind: 'resend', reason: 'api.resend.com' }
  }

  // Rule 3 — disabled, and HONEST about it. The list can never be empty here:
  // an empty list would mean rule 1 matched, so the reason always names at
  // least one missing variable.
  const missing = [
    smtpPass === '' ? 'SMTP_PASS' : null,
    smtpUser === '' ? 'SMTP_USER' : null,
    emailFrom === '' ? 'EMAIL_FROM' : null,
  ].filter((name): name is string => name !== null)

  return {
    kind: 'disabled',
    reason: `no email transport configured (missing ${missing.join(', ')})`,
  }
}
