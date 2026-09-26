/**
 * The RESEND TRANSPORT — one thin wrapper around the Resend HTTP API, with
 * every side effect injected.
 *
 * Two runtimes import this one file:
 *
 *   supabase/functions/send-email/index.ts   the deployed sender (a later
 *                                            slice), which passes the real
 *                                            global `fetch`
 *   src/lib/resend.ts                        the app's re-export seam, which is
 *                                            what the vitest spec imports
 *
 * It lives under `supabase/functions/_shared/` for the same reason
 * `emailCopy.ts` does: that is the layout the Supabase CLI bundles for a
 * deployed function (a relative import that escapes `supabase/` is not
 * something the deploy step promises), and the app can import INTO it at no
 * cost. Same pairing as `src/lib/push.ts` ↔ `pushCopy.ts`.
 *
 * The module is PURE-ISH, not pure: it really does network I/O. What keeps it
 * testable is that it OWNS no transport — `fetch` arrives in `ResendDeps`, so
 * the spec hands it a fake that records calls and returns canned responses and
 * the suite never touches the wire. Nothing here reads a global, `Deno.env`, or
 * `import.meta.env`; the API key, the From address and the reply-to are all
 * INJECTED as `ResendConfig`.
 *
 * THE LOAD-BEARING RULE IS `retryable`. A later slice uses it to decide whether
 * a queue row is retried or retired, so getting it wrong strands notifications
 * (false negatives) or spins forever on a row that can never send (false
 * positives). The classification is deliberate:
 *
 *   - 429 and 5xx are TRANSIENT. A rate limit is a "come back later" and a 5xx
 *     is the provider failing at its end; the identical request can succeed on
 *     a later drain, so retrying is exactly right.
 *   - every other 4xx is TERMINAL. A 400/422 means the payload is malformed and
 *     a 4xx address rejection means the mailbox does not exist — resending the
 *     same bytes will produce the same answer forever. Retrying these would
 *     burn the queue on an unsendable row, so they are retired (retryable:
 *     false).
 *   - a fetch REJECTION is a network/DNS/TLS failure that happened before any
 *     HTTP status existed: nothing was rejected by the API, so it is retryable.
 *
 * And it MUST NEVER THROW. A rejection escaping this function would crash the
 * whole drain run and strand every row behind the one that failed — so every
 * failure path, including a broken `fetch` or an unreadable error body, resolves
 * to a `SendResult` instead.
 */

/** The one endpoint. Exported so the spec asserts the URL rather than a literal. */
export const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export interface ResendConfig {
  /** The Resend API key. Blank/whitespace is a terminal misconfiguration. */
  apiKey: string
  /** The From header, e.g. `Drop In <hello@dropin.test>`. Blank is terminal too. */
  from: string
  /** Optional human mailbox; blank means "send no reply_to". */
  replyTo?: string
}

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
  /** The value for the `List-Unsubscribe` header; blank means "send none". */
  listUnsubscribe?: string
}

export type SendResult =
  | { ok: true; status: number }
  | { ok: false; status: number | null; error: string; retryable: boolean }

/** The injected transport. Tests supply a fake; the sender supplies `fetch`. */
export interface ResendDeps {
  fetch: typeof fetch
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
 * The API's own error text when there is one, else ''. Reading the body is
 * itself a failure point (an aborted stream, a body already consumed), so it is
 * fenced: an unreadable body degrades to the status-based message rather than
 * throwing out of a function whose whole contract is "never throws".
 */
async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text()
    return typeof text === 'string' ? text.trim() : ''
  } catch {
    return ''
  }
}

/**
 * POST one message. Resolves to a `SendResult` on EVERY path — there is no
 * reject case, by design (see the header comment).
 */
export async function sendEmail(
  deps: ResendDeps,
  msg: EmailMessage,
  config: ResendConfig,
): Promise<SendResult> {
  // Pre-flight: a missing credential or From address is a misconfiguration, not
  // a transient fault. It is settled BEFORE any network call so a broken
  // deployment cannot hammer Resend with requests that were never going to be
  // accepted, and it is TERMINAL because retrying changes nothing.
  const apiKey = (config.apiKey ?? '').trim()
  if (apiKey === '') {
    return {
      ok: false,
      status: null,
      error: 'Resend is not configured: config.apiKey is missing or blank',
      retryable: false,
    }
  }

  const from = (config.from ?? '').trim()
  if (from === '') {
    return {
      ok: false,
      status: null,
      error: 'Resend is not configured: config.from is missing or blank',
      retryable: false,
    }
  }

  const payload: Record<string, unknown> = {
    from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  }

  // Blankness is decided on the TRIMMED value; the value that is emitted is
  // trimmed too, so a stray newline cannot become part of a header.
  const replyTo = (config.replyTo ?? '').trim()
  if (replyTo !== '') payload.reply_to = replyTo

  const listUnsubscribe = (msg.listUnsubscribe ?? '').trim()
  if (listUnsubscribe !== '') {
    payload.headers = { 'List-Unsubscribe': listUnsubscribe }
  }

  let response: Response
  try {
    response = await deps.fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    // Reached the network and got nothing back: DNS, TLS, timeout, connection
    // reset. No HTTP status exists, so this is transient (retryable) rather
    // than a verdict on the message.
    const detail = describeError(err)
    return {
      ok: false,
      status: null,
      error: detail === '' ? 'Resend request failed before a response was received' : detail,
      retryable: true,
    }
  }

  const status = typeof response?.status === 'number' ? response.status : null

  // Any 2xx is acceptance; Resend answers 200 (and 201 on some paths).
  if (status !== null && status >= 200 && status < 300) {
    return { ok: true, status }
  }

  // Prefer the API's OWN words — "domain is not verified" beats "status 422" for
  // whoever reads the queue row later — and fall back to a status-based message
  // only when the body is empty or unreadable.
  const body = await readErrorBody(response)
  const error =
    body !== ''
      ? body
      : status === null
        ? 'Resend request failed with no HTTP status'
        : `Resend request failed with status ${status}`

  // Retry only the transient classes (see the header comment): a rate limit or
  // a provider-side 5xx. Everything else — every other 4xx, and any unexpected
  // class — is retired rather than retried.
  const retryable = status === 429 || (status !== null && status >= 500)

  return { ok: false, status, error, retryable }
}
