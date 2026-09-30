/**
 * The EMAIL COPY RULES — pure, no browser, no Deno, no database. Two runtimes
 * import this one file:
 *
 *   supabase/functions/send-push/index.ts   the ONE sender, one drain, two
 *                                           transports: the existing push path
 *                                           plus an email fallback branch for
 *                                           parents with no registered device
 *   src/lib/email.ts                        the app's re-export seam, which is
 *                                           what the vitest spec imports
 *
 * It lives under `supabase/functions/_shared/` rather than in `src/lib/`
 * because that is the layout the Supabase CLI bundles for a deployed function
 * (a relative import that escapes `supabase/` is not something the deploy step
 * promises), and the app can import INTO it with no cost at all. Same pairing
 * as `src/lib/push.ts` ↔ `pushCopy.ts`.
 *
 * The environment is INJECTED as one `EmailEnv` object, never read from a
 * global: no `import.meta.env`, no `Deno.env`, no `window`. That is the repo's
 * build law (see `buildShareUrl` in src/lib/trust.ts) and it is also what makes
 * the spec deterministic — every expectation passes its env explicitly, so the
 * file can neither pass nor fail on a developer's `.env`. Because it runs in
 * Deno, the unset-base fallback must be a constant (`FALLBACK_BASE_URL`), while
 * the browser twin supplies its own base via `clientBaseUrl()`.
 *
 * The server-side twin of the SUBJECT rule is the SQL function
 * `public.notification_payload` (migration 0032), whose
 * `coalesce(nullif(btrim(title), ''), 'your drop-in')` is the same fallback this
 * file implements. Keep the two in step.
 */

/**
 * The seven kinds — the app-side twin of the `notification_log` CHECK
 * constraint, which migration 0041 widened from four to five when the `ended`
 * kind joined the set, migration 0055 widened from five to six when
 * `review_due` joined it, and migration 0056 widened from six to seven when
 * `new_message` joined it. Same order as `NOTIFICATION_KINDS` in pushCopy.ts,
 * and `src/lib/email.test.ts` asserts the two lists are equal so they cannot
 * silently diverge the way this one did (it was stuck at 0041's four).
 */
export const EMAIL_KINDS = [
  'ping_received',
  'starting_soon',
  'cancelled',
  'new_comment',
  'ended',
  'review_due',
  'new_message',
  'followed_new_dropin',
] as const

export type EmailKind = (typeof EMAIL_KINDS)[number]

/** Narrow an untrusted string (a queue row) to a kind. */
export function isEmailKind(value: unknown): value is EmailKind {
  return typeof value === 'string' && (EMAIL_KINDS as readonly string[]).includes(value)
}

/** The untitled-post name — char-for-char the SQL fallback in 0032. */
export const TITLE_FALLBACK = 'your drop-in'

/**
 * The base used when none is configured. This module runs in Deno, where there
 * is no `window`, so there is no origin to discover: the deployment URL is a
 * constant rather than an invention at the call site.
 */
export const FALLBACK_BASE_URL = 'https://drop-in-mu.vercel.app'

export interface EmailEnv {
  /** The deployment origin links are built against; '' means "use the fallback". */
  baseUrl: string
  /** The human mailbox replies go to; blank means "no reply-to configured". */
  replyTo: string
}

export interface EmailRow {
  /** The post's title — null/empty/whitespace falls back rather than rendering `null`. */
  title: string | null
  /** The copy the push would have shown; null/empty is legal for some kinds. */
  body: string | null
  /** RELATIVE, e.g. '/playdate/<uuid>'. */
  url: string
  kind: string
  profile_id: string
}

export interface EmailPayload {
  subject: string
  html: string
  text: string
  /** The value slice 3 sends as the `List-Unsubscribe` header. */
  listUnsubscribe: string
}

/**
 * Escape the five HTML-significant characters. The title, the body and the url
 * are all user-authored input, so an unescaped one is HTML injection straight
 * into somebody's inbox. `&` is replaced FIRST, or the ampersands introduced by
 * the later replacements would themselves be escaped a second time.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * The deployment base, normalised once: trimmed, and stripped of any trailing
 * slash so `https://x.test/` + '/playdate/1' can never become a double slash.
 * A blank (or absent) base resolves to the pinned fallback rather than to a
 * relative link, because a relative link in an inbox is a dead link.
 */
function resolvedBase(baseUrl: string | null | undefined): string {
  const trimmed = (baseUrl ?? '').trim()
  return trimmed === '' ? FALLBACK_BASE_URL : trimmed.replace(/\/+$/, '')
}

/** `Drop In: <title>`, or the honest fallback — never `Drop In: ` and never
 * `Drop In: null` (0032's `btrim` + `coalesce` parity). */
export function emailSubject(title: string | null): string {
  const trimmed = (title ?? '').trim()
  return 'Drop In: ' + (trimmed === '' ? TITLE_FALLBACK : trimmed)
}

/** The absolute link route: the base plus the row's relative path. */
export function emailUrl(url: string, baseUrl: string | null | undefined): string {
  return resolvedBase(baseUrl) + url
}

/**
 * The `List-Unsubscribe` value. A configured reply-to becomes a mailto; with
 * none, the fallback is the REAL opt-out — `/settings`, where the notifications
 * toggle lives (`src/App.tsx` route + `SettingsPage`'s `NotificationsSection`).
 * Deliberately NOT an invented `unsubscribe@<origin>` mailbox: a dead address is
 * worse than no mailto at all, and one-click unsubscribe that silently bounces
 * is a CAN-SPAM problem rather than a feature.
 */
function listUnsubscribe(base: string, replyTo: string): string {
  const trimmed = (replyTo ?? '').trim()
  return trimmed === '' ? `${base}/settings` : `mailto:${trimmed}?subject=unsubscribe`
}

/** A minimal HTML document. No tables: the client is a modern inbox, and a
 * table layout only exists to paper over 2003-era renderers. */
function htmlDocument(subject: string, body: string, absolute: string): string {
  const safeUrl = escapeHtml(absolute)
  return (
    '<!doctype html>' +
    '<html><body>' +
    `<h1>${escapeHtml(subject)}</h1>` +
    (body === '' ? '' : `<p>${escapeHtml(body)}</p>`) +
    `<p><a href="${safeUrl}">${safeUrl}</a></p>` +
    '</body></html>'
  )
}

/**
 * The subject/html/text/listUnsubscribe for one outbox row.
 *
 * The text part has THREE branches, not two: a NULL or empty body yields just
 * the link, with no leading blank line. The old `row.body + '\n\n' + url`
 * rendered the literal string `null` into somebody's inbox.
 */
export function buildEmailPayload(row: EmailRow, env: EmailEnv): EmailPayload {
  const base = resolvedBase(env.baseUrl)
  const absolute = base + row.url
  const subject = emailSubject(row.title)
  // Blankness is decided on the TRIMMED body — a whitespace-only body is the
  // same as none — but the body that is EMITTED is the row's copy VERBATIM.
  // Trimming it here would silently rewrite what the producer wrote (and
  // `row.body + '\n\n' + absolute` on a NULL body is the literal-string `null`
  // bug this three-branch rule exists to prevent).
  const rawBody = row.body ?? ''
  const hasBody = rawBody.trim() !== ''

  return {
    subject,
    html: htmlDocument(subject, hasBody ? rawBody : '', absolute),
    text: hasBody ? `${rawBody}\n${absolute}` : absolute,
    listUnsubscribe: listUnsubscribe(base, env.replyTo),
  }
}
