/**
 * The SMTP TRANSPORT — the app's PRIMARY email path, and the twin of
 * `_shared/resend.ts` down to the `SendResult` it resolves.
 *
 * WHY THIS FILE EXISTS AT ALL. The Resend HTTP path needed a sending domain the
 * deployment does not have (Resend's shared `onboarding@resend.dev` sender only
 * delivers to the account owner), so it could never deliver to a parent. The
 * Gmail account ALREADY carried Drop In's auth email and is proven live, so SMTP
 * becomes the primary transport: `SMTP_USER` + `SMTP_PASS` + `EMAIL_FROM`.
 * Resend stays available (`_shared/resend.ts` is untouched, still tested) for
 * when a domain exists.
 *
 * PURE, ON PURPOSE. This file imports NOTHING but the shared TYPES from
 * `./resend.ts` — no library, no `npm:` specifier, no `Deno`, no `fetch`, no
 * `Deno.env`, no `import.meta.env`. That is load-bearing, not taste: the spec
 * `src/lib/smtp.test.ts` runs under plain Node through vitest via the app seam
 * `src/lib/smtp.ts`, and an `npm:` or `https://` specifier anywhere in this
 * module's import graph would break that runner. The REAL client — the only
 * place a mail library appears — is `_shared/smtpDeno.ts`, which only
 * `send-push/index.ts` imports and vitest never loads. Swapping the library is
 * therefore a one-file change behind the `SmtpDeps` seam below.
 *
 * THE MESSAGE SHAPE IS REUSED, NOT REDECLARED. `EmailMessage` and `SendResult`
 * are `_shared/resend.ts`'s, imported here and re-exported so a caller has ONE
 * source of truth: `classifySendResult` in `_shared/emailFallback.ts` consumes
 * this exact `SendResult`, which is what lets the drain treat an email the same
 * way whichever transport produced it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RETRY CLASSIFICATION IS THE MOST IMPORTANT PART OF THIS FILE, AND SMTP IS
 * THE OPPOSITE OF HTTP.
 *
 *   Resend/HTTP: 429 and 5xx are TRANSIENT (retry); every other 4xx is TERMINAL.
 *   SMTP:        4xx is TRANSIENT (retry); every 5xx is PERMANENT (retire).
 *
 * That inversion is the standard (RFC 5321 §4.2.1): a 4xx reply is a TRANSIENT
 * NEGATIVE COMPLETION — the server understood the request and could not take it
 * RIGHT NOW — while a 5xx reply is a PERMANENT NEGATIVE COMPLETION — the server
 * understood the request and refuses it FOREVER. So:
 *
 *   - `421` service not available, `450` mailbox busy, `451` local error,
 *     `452` out of storage → retryable TRUE. A later drain can succeed.
 *   - `550` mailbox unavailable / address REJECTED, `551` user not local,
 *     `553` bad mailbox name, `554` transaction failed, `535` auth failed →
 *     retryable FALSE. An ADDRESS REJECTION MUST NOT BE RETRIED: the identical
 *     bytes produce the identical 550 forever, and because the outbox drains
 *     OLDEST FIRST, retrying it burns the per-invocation send budget (and the
 *     Gmail rate limit) ahead of every notice queued behind it — starving the
 *     parents who could actually be reached. `emailFallback.ts` retires exactly
 *     the non-retryable rows, so this flag is the difference between "retired
 *     with an honest reason" and "spins forever".
 *   - a code of `null` (no SMTP reply at all: connection refused, DNS, a TLS
 *     handshake that never completed, a socket timeout) → retryable TRUE.
 *     Nothing was rejected, so coming back later is right.
 *
 * AND IT MUST NEVER THROW, for the same reason the Resend wrapper must not: one
 * rejection escaping into `drain()` would abort the whole run and strand every
 * notification behind the row that failed. Every failure path — a bad
 * configuration, a `connect()` that rejects, a `send()` that rejects, an
 * unreadable status — resolves to a `SendResult`.
 */

import type { EmailMessage, SendResult } from './resend.ts'

// The re-export that makes this module's surface complete on its own: a caller
// (and the app seam `src/lib/smtp.ts`) can take the message and result types
// from the transport it is calling, and `SendResult` is still the ONE type
// `emailFallback.ts` classifies.
export type { EmailMessage, SendResult } from './resend.ts'

/** Gmail's submission host — the deployment's proven-live SMTP account. */
export const SMTP_DEFAULT_HOST = 'smtp.gmail.com'

/**
 * 465 is IMPLICIT TLS (SMTPS) and is what the verified account exposes
 * (`smtp_port=465`). 587 with STARTTLS is the other Gmail option and works too —
 * `smtpConfigFrom` takes `SMTP_PORT` — but the default is the port that is
 * proven here, not a guess.
 */
export const SMTP_DEFAULT_PORT = 465

export interface SmtpConfig {
  /** The submission host. Blank is a terminal misconfiguration. */
  host: string
  /** The submission port; 465 means implicit TLS. */
  port: number
  /** Implicit TLS. Optional so a caller can leave it to the client. */
  secure?: boolean
  /** The SMTP username (the Gmail address). Blank is terminal. */
  user: string
  /** The app password. Blank is terminal. Never logged. */
  pass: string
  /** The From header, e.g. `Drop In <hello@dropin.test>`. Blank is terminal. */
  from: string
  /** Optional human mailbox; blank means "send no reply-to". */
  replyTo?: string
}

/**
 * Build the `SmtpConfig` from the Edge Function's injected secrets/env — the
 * caller reads `Deno.env`, this function only maps it (`Deno.env` is not
 * available in the pure module, and reading it here would make this file
 * untestable for no gain).
 *
 * Defaults are the VERIFIED account's: `smtp.gmail.com:465`. `SMTP_HOST` and
 * `SMTP_PORT` exist so a future non-Gmail sender needs no code change. A blank
 * or unparseable port falls back to 465 rather than `NaN`, and every value is
 * trimmed so a stray newline from a secret cannot become part of a header.
 */
export function smtpConfigFrom(env: {
  SMTP_USER?: string
  SMTP_PASS?: string
  EMAIL_FROM?: string
  EMAIL_REPLY_TO?: string
  SMTP_HOST?: string
  SMTP_PORT?: string
}): SmtpConfig {
  const host = (env.SMTP_HOST ?? '').trim()
  const rawPort = (env.SMTP_PORT ?? '').trim()
  const parsedPort = rawPort === '' ? SMTP_DEFAULT_PORT : Number.parseInt(rawPort, 10)
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : SMTP_DEFAULT_PORT

  return {
    host: host === '' ? SMTP_DEFAULT_HOST : host,
    port,
    // Implicit TLS only on 465; 587 is STARTTLS and is negotiated by the client.
    secure: port === 465,
    user: (env.SMTP_USER ?? '').trim(),
    pass: (env.SMTP_PASS ?? '').trim(),
    from: (env.EMAIL_FROM ?? '').trim(),
    replyTo: (env.EMAIL_REPLY_TO ?? '').trim(),
  }
}

/**
 * One message as the mail client consumes it. Deliberately NOT `EmailMessage`:
 * the client needs `from` promoted onto the message and headers materialised,
 * which are transport concerns, not queue concerns.
 */
export interface SmtpMessage {
  from: string
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
  headers?: Record<string, string>
}

/** The narrow slice of a mail client the transport needs. */
export interface SmtpClientLike {
  send(message: SmtpMessage): Promise<{ status: number }>
  close?(): void | Promise<void>
}

/** Injected so tests count calls WITHOUT opening a socket. */
export interface SmtpDeps {
  connect(config: SmtpConfig): Promise<SmtpClientLike>
}

/**
 * The SMTP reply code out of nodemailer's `info.response`, which looks like
 * `"250 2.0.0 OK 1727... - gsmtp"`. Anything unreadable falls back to 250: the
 * send already succeeded, and a parse miss is not a delivery verdict.
 */
export function smtpStatusFromResponse(response: unknown): number {
  if (typeof response !== 'string') return 250
  const match = /^\s*(\d{3})\b/.exec(response)
  if (match === null) return 250
  const code = Number.parseInt(match[1], 10)
  return Number.isFinite(code) ? code : 250
}

/** Narrow-from-unknown so a thrown non-Error still yields readable text. */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message.trim()
  if (typeof err === 'string') return err.trim()
  try {
    return String(err).trim()
  } catch {
    return ''
  }
}

/**
 * The SMTP reply code on a thrown error, or null. Three keys are tried, in the
 * order the real client actually populates them:
 *
 *  1. `responseCode` — nodemailer's numeric SMTP reply code (550, 451, …). This
 *     is the one that matters in production, hence first.
 *  2. `status` — the shape other SMTP clients use for the same fact.
 *  3. `code` — nodemailer ALSO uses `code`, but for a STRING transport error
 *     (`'EAUTH'`, `'EENVELOPE'`, `'ECONNECTION'`), which carries no reply code
 *     and must NOT be mistaken for one. Only a numeric value counts.
 *
 * Anything else is `null`: "no reply code exists", which classifies as
 * retryable (see `classifySmtpFailure`).
 */
export function smtpErrorCode(error: unknown): number | null {
  if (typeof error === 'number') return Number.isFinite(error) ? error : null
  if (error === null || error === undefined || typeof error !== 'object') return null

  const candidate = error as Record<string, unknown>
  for (const key of ['responseCode', 'status', 'code'] as const) {
    const value = candidate[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

/** Per-code phrasing for the transient (4xx) class; the reason is the honest record. */
const SMTP_TRANSIENT_REASONS: Record<number, string> = {
  421: 'the service is not available (the server is closing the connection)',
  450: 'the requested mail action was not taken (the mailbox is busy)',
  451: 'the requested action was aborted (a local error at the receiving server)',
  452: 'the requested action was not taken (insufficient system storage)',
}

/** Per-code phrasing for the permanent (5xx) class; 550 is the address rejection. */
const SMTP_PERMANENT_REASONS: Record<number, string> = {
  535: 'authentication failed — the SMTP credentials are wrong',
  550: 'the mailbox is unavailable — the address was rejected',
  551: 'the user is not local — the address is not accepted here',
  553: 'the mailbox name is not allowed — the address was rejected',
  554: 'the transaction failed — the message was refused',
}

/**
 * The classification (see the header for the full reasoning): 4xx retryable,
 * 5xx NOT retryable, no code retryable. `reason` is never empty — it is what a
 * human reads in `notification_log.error` when a notice was retired.
 */
export function classifySmtpFailure(code: number | null): { retryable: boolean; reason: string } {
  if (code === null) {
    return {
      retryable: true,
      reason:
        'no SMTP reply code — the connection or TLS handshake failed before the server answered, so nothing was rejected',
    }
  }
  if (code >= 400 && code < 500) {
    return {
      retryable: true,
      reason: `SMTP ${code} is a transient (4xx) failure: ${
        SMTP_TRANSIENT_REASONS[code] ?? 'the server asked us to try again later'
      }`,
    }
  }
  if (code >= 500 && code < 600) {
    return {
      retryable: false,
      reason: `SMTP ${code} is a permanent (5xx) failure: ${
        SMTP_PERMANENT_REASONS[code] ?? 'the message was refused and would be refused again'
      }`,
    }
  }
  // A reply code outside both failure classes (1xx/2xx/3xx, or nonsense) on a
  // path that threw. Nothing was clearly rejected, so this reads like the
  // no-code case — come back later — and the reason says so rather than
  // pretending we understood the verdict.
  return {
    retryable: true,
    reason: `SMTP ${code} is not a 4xx/5xx failure reply — nothing was clearly rejected, so this is treated as transient`,
  }
}

/**
 * Send one message over SMTP. Resolves to a `SendResult` on EVERY path — there
 * is no reject case, by design (see the header comment).
 */
export async function sendEmailViaSmtp(
  deps: SmtpDeps,
  msg: EmailMessage,
  config: SmtpConfig,
): Promise<SendResult> {
  // Pre-flight: a missing credential, host, or From address is a
  // misconfiguration, not a transient fault. It is settled BEFORE any socket is
  // opened, so a broken deployment cannot hammer the SMTP server with
  // connections that were never going to be authenticated — and it is TERMINAL,
  // because retrying changes nothing. The caller's test asserts `connect` was
  // never called, which the result shape alone could not reveal.
  const host = (config.host ?? '').trim()
  if (host === '') {
    return {
      ok: false,
      status: null,
      error: 'SMTP is not configured: config.host is missing or blank',
      retryable: false,
    }
  }

  const user = (config.user ?? '').trim()
  if (user === '') {
    return {
      ok: false,
      status: null,
      error: 'SMTP is not configured: config.user is missing or blank',
      retryable: false,
    }
  }

  const pass = (config.pass ?? '').trim()
  if (pass === '') {
    return {
      ok: false,
      status: null,
      error: 'SMTP is not configured: config.pass is missing or blank',
      retryable: false,
    }
  }

  const from = (config.from ?? '').trim()
  if (from === '') {
    return {
      ok: false,
      status: null,
      error: 'SMTP is not configured: config.from is missing or blank',
      retryable: false,
    }
  }

  const message: SmtpMessage = {
    from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  }

  // Blankness is decided on the TRIMMED value; the value emitted is trimmed too,
  // so a stray newline cannot become part of a header.
  const replyTo = (config.replyTo ?? '').trim()
  if (replyTo !== '') message.replyTo = replyTo

  const listUnsubscribe = (msg.listUnsubscribe ?? '').trim()
  if (listUnsubscribe !== '') {
    message.headers = { 'List-Unsubscribe': listUnsubscribe }
  }

  let client: SmtpClientLike | null = null
  try {
    client = await deps.connect({ ...config, host, user, pass, from })

    const response = await client.send(message)

    // The client's own reply code when it has one, else 250 (the SMTP "OK"
    // completion). A missing/odd status here is not worth failing a send that
    // the client accepted.
    const status =
      typeof response?.status === 'number' && Number.isFinite(response.status)
        ? response.status
        : 250

    return { ok: true, status }
  } catch (err) {
    // `connect()` or `send()` rejected. Look for an SMTP reply code first: with
    // one, the classification is a real verdict (4xx transient / 5xx
    // permanent); without one it is a connection/TLS failure, which is
    // retryable.
    const code = smtpErrorCode(err)
    const classification = classifySmtpFailure(code)
    const detail = describeError(err)
    return {
      ok: false,
      status: code,
      // Prefer the client's own words ("550 5.1.1 … no such user" beats
      // "SMTP 550"), and fall back to the classification reason so `error` is
      // NEVER empty — it is the only record of why a notice was retired.
      error: detail === '' ? classification.reason : detail,
      retryable: classification.retryable,
    }
  } finally {
    // Always close what was opened — a leaked connection per row would exhaust
    // the SMTP server's connection limit within a drain. And a close failure
    // must NEVER change the result: by this point the send has already been
    // classified, and a broken teardown is not a verdict on the message.
    if (client !== null) {
      try {
        await client.close?.()
      } catch {
        // Deliberately swallowed: see above.
      }
    }
  }
}
