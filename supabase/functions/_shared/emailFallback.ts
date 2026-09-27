/**
 * The EMAIL FALLBACK decision — PURE. No I/O, no globals, no `Deno.env`, no
 * `import.meta.env`.
 *
 * Two runtimes import this one file:
 *
 *   supabase/functions/send-push/index.ts   the ONE sender, one drain, two
 *                                           transports: a queued notification
 *                                           whose recipient has NO registered
 *                                           device falls back to email instead
 *                                           of being stamped away as
 *                                           "no subscription"
 *   src/lib/emailFallback.ts                the app's re-export seam, which is
 *                                           what the vitest spec imports
 *
 * It lives under `supabase/functions/_shared/` for the same reason
 * `emailCopy.ts` and `resend.ts` do: that is the layout the Supabase CLI bundles
 * for a deployed function (a relative import that escapes `supabase/` is not
 * something the deploy step promises), and the app can import INTO it at no
 * cost. Same pairing as `src/lib/push.ts` ↔ `pushCopy.ts`.
 *
 * WHY THIS IS A MODULE AND NOT FIVE LINES OF `if` INSIDE THE DRAIN. The drain
 * cannot be unit-tested — it is a Deno function, reading live Postgres through a
 * service-role client. The one decision that MUST be right (do we deliberately
 * stop delivering to a parent, or do we try?) is therefore extracted here, where
 * vitest pins it, and the Deno function is left with nothing but wiring.
 *
 * THE LOAD-BEARING RULE IS THAT `optout === undefined` SENDS. `profiles.email_optout`
 * is an OPT-OUT column (migration 0053): the parent asked to stop only if it
 * reads `true`. `undefined` never came from the database — it means the read did
 * not come back (a pre-0053 project, where the column is absent and PostgREST
 * answers 42703; or a failed read). Treating an unreadable column as an opt-out
 * would be a SILENT UNSUBSCRIBE performed on every parent at once on a
 * pre-0053 deployment, and this whole slice exists to make sure parents get
 * TOLD. So an unknown read must fall through and SEND. Only an explicit `true`
 * may ever stop delivery. (src/lib/emailOptout.ts makes the same choice for the
 * settings toggle, for the same reason.)
 *
 * THE DECISION ORDER IS PART OF THE CONTRACT. First match wins, and the order is
 * asserted in its own tests because each neighbouring pair has a real case:
 * "not configured" beats everything (there is no transport to call); "no
 * address" beats the opt-out flag (there is nothing to send TO, and the honest
 * reason is the missing address, not the preference).
 */

/** What the drain should do with one queued notification that has no device. */
export type EmailFallbackAction =
  | 'send-email'
  | 'skip-unconfigured'
  | 'skip-no-address'
  | 'skip-optout'

/**
 * Every fact the decision needs — all injected. The caller reads them and hands
 * them over; this module reads nothing.
 */
export interface EmailFallbackFacts {
  /** Whether the deployment is configured to send email at all
   *  (a non-blank `RESEND_API_KEY` AND a non-blank `EMAIL_FROM`). */
  emailEnabled: boolean
  /**
   * `profiles.email_optout` as read, or `undefined` when the read did not come
   * back at all — pre-0053 (the column is absent, so PostgREST answers 42703)
   * or a failed read. NOT the same as `false` (see the header).
   */
  optout: boolean | undefined
  /** The parent's address as read, or null/undefined if there is none / it could
   *  not be read. Blank-after-trim counts as absent. */
  email: string | null | undefined
}

export interface EmailFallbackDecision {
  action: EmailFallbackAction
  /** One honest sentence, never empty: it is appended to the queue row's
   *  `error` column, which is the only record of why a notice was not emailed. */
  reason: string
}

/**
 * The single decision point for the email fallback. Rules, in order:
 *
 *  a. `!emailEnabled`           → skip-unconfigured. Nothing to call: a drain
 *                                 that "tried anyway" would fail terminally on
 *                                 every row and burn the queue.
 *  b. blank/absent `email`      → skip-no-address. Nothing to send TO.
 *  c. `optout === true`         → skip-optout. The parent asked us to stop.
 *  d. otherwise                 → send-email. This INCLUDES `optout === undefined`
 *                                 — the load-bearing case: an unreadable opt-out
 *                                 column is not consent to unsubscribe anybody.
 */
export function decideEmailFallback(f: EmailFallbackFacts): EmailFallbackDecision {
  if (!f.emailEnabled) {
    return {
      action: 'skip-unconfigured',
      reason: 'email is not configured on this deployment',
    }
  }
  // Blankness is decided on the TRIMMED value, so a whitespace-only address is
  // the same as none — `'   '` is not somewhere mail can be delivered.
  if ((f.email ?? '').trim() === '') {
    return {
      action: 'skip-no-address',
      reason: 'the parent has no email address on file',
    }
  }
  if (f.optout === true) {
    return {
      action: 'skip-optout',
      reason: 'the parent opted out of email',
    }
  }
  // Rule (d) reaches here for `optout === false` AND for `optout === undefined`.
  // Only an explicit `true` may stop delivery: an unknown read is not an
  // opt-out, and this is the branch that keeps a pre-0053 project (or one failed
  // read) from silently going dark for everybody at once.
  return {
    action: 'send-email',
    reason: 'email fallback enabled and the parent has an address and no opt-out',
  }
}

/** What one transport attempt means for the queue row it came from. */
export type SendVerdict = 'sent' | 'retry' | 'terminal'

/**
 * Classify a transport result into the three outcomes the drain acts on. It is
 * deliberately narrow (it does not import `SendResult`) so it stays pure and so
 * the drain's retry/stamp rules are testable without a network.
 *
 *   ok                        → sent     (accept it, stamp `sent_at`)
 *   not ok, retryable: true   → retry    (DO NOT stamp: the next tick tries
 *                                         again)
 *   not ok, retryable: false  → terminal (stamp the failure: the same request
 *                                         would fail forever)
 *
 * Anything that is not an explicit `retryable === true` is terminal — the
 * conservative reading, because a row we keep retrying forever starves every
 * notice queued behind it (the drain is oldest-first).
 */
export function classifySendResult(result: { ok: boolean; retryable?: boolean }): SendVerdict {
  if (result.ok) return 'sent'
  return result.retryable === true ? 'retry' : 'terminal'
}
