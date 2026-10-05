/**
 * The email twin (the iOS notification hole, slice 1) — the pure payload
 * builder, exercised through the app's re-export seam `src/lib/email.ts`
 * exactly the way `push.test.ts` exercises `pushCopy.ts` through `push.ts`.
 *
 * The four pinned acceptance criteria of the slice are the reason this file is
 * not a formality:
 *
 *  1. all SEVEN kinds flow through the builder and produce all four payload
 *     fields — the outbox already holds the copy, email wraps it, it does not
 *     invent new copy.
 *  1b. DRIFT GUARD: `EMAIL_KINDS` and `NOTIFICATION_KINDS` are hand-maintained
 *     twins of the same CHECK constraint, and this file asserts they are
 *     identical. This is not decoration: `EMAIL_KINDS` silently sat at four
 *     kinds after migration 0041 added `ended`, and the only thing that can
 *     catch that class of bug is an assertion that reads both lists.
 *  2. HTML INJECTION: a post title (and a body, and a url) is user input.
 *     Unescaped it lands in somebody's inbox as markup, so it must appear
 *     escaped in `html` and VERBATIM in `text`.
 *  3. the empty/NULL/whitespace title fallback (`your drop-in`) — the SAME
 *     fallback `public.notification_payload` uses in migration 0032, so the
 *     email and the push cannot disagree about what an untitled post is called.
 *  4. the THREE-branch text rule: a NULL or blank body yields JUST the absolute
 *     link, with no leading blank line. `row.body + '\n\n' + absolute` renders
 *     the literal string `null` into the inbox — that regression is pinned shut
 *     here (and an empty-string body behaves identically).
 *
 * Every expectation that depends on the environment passes it EXPLICITLY as the
 * second argument, so this file can neither pass nor fail on a developer's
 * `.env`. The only two functions that read a global are the browser seam's
 * `clientBaseUrl`/`clientEmailEnv`, and those are exercised against a stubbed
 * `window` with `import.meta.env` consulted rather than assumed away.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EMAIL_KINDS,
  FALLBACK_BASE_URL,
  TITLE_FALLBACK,
  buildEmailPayload,
  clientBaseUrl,
  clientEmailEnv,
  emailSubject,
  emailUrl,
  escapeHtml,
  isEmailKind,
  type EmailEnv,
  type EmailRow,
} from './email'
import { NOTIFICATION_KINDS } from '../../supabase/functions/_shared/pushCopy.ts'

const BASE = 'https://drop-in.example'
const PATH = '/playdate/pd-1'
const ABSOLUTE = `${BASE}${PATH}`

const env: EmailEnv = { baseUrl: BASE, replyTo: 'hello@drop-in.example' }

/** One outbox row, shaped like a `notification_log` select. */
function row(overrides: Partial<EmailRow> = {}): EmailRow {
  return {
    title: 'Green Lake',
    body: 'to "Green Lake"',
    url: PATH,
    kind: 'ping_received',
    profile_id: 'profile-1',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 1. The eight kinds, and the drift guard that keeps them in step.
// ---------------------------------------------------------------------------

describe('buildEmailPayload — the eight kinds', () => {
  it('pins the eight kind names (the app-side twin of 0060\'s eight-kind CHECK constraint)', () => {
    expect([...EMAIL_KINDS]).toEqual([
      'ping_received',
      'starting_soon',
      'cancelled',
      'new_comment',
      'ended',
      'review_due',
      'new_message',
      'followed_new_dropin',
    ])
  })

  it('DRIFT GUARD: EMAIL_KINDS and NOTIFICATION_KINDS are the same list, in the same order', () => {
    // Two hand-maintained lists describing ONE database constraint is exactly
    // how `ended` went missing from emailCopy.ts for a whole migration. If this
    // fails, the two files disagree about which notification kinds exist — fix
    // the shorter list, do not relax this assertion.
    expect([...EMAIL_KINDS]).toEqual([...NOTIFICATION_KINDS])
  })

  it('returns non-empty subject/html/text/listUnsubscribe for all eight kinds', () => {
    for (const kind of EMAIL_KINDS) {
      const payload = buildEmailPayload(row({ kind }), env)

      expect(Object.keys(payload).sort()).toEqual(['html', 'listUnsubscribe', 'subject', 'text'])
      expect(payload.subject).toBe('Drop In: Green Lake')
      for (const part of [payload.subject, payload.html, payload.text, payload.listUnsubscribe]) {
        expect(typeof part).toBe('string')
        expect(part.length).toBeGreaterThan(0)
      }
      for (const part of [payload.subject, payload.html, payload.text]) {
        expect(part).not.toContain('null')
        expect(part).not.toContain('undefined')
      }
    }
  })

  it('renders a table-free html document with a clickable link', () => {
    const payload = buildEmailPayload(row(), env)

    expect(payload.html.toLowerCase()).toContain('<!doctype html>')
    // No tables: the client is a modern inbox, not a 2003 renderer.
    expect(payload.html.toLowerCase()).not.toContain('<table')
    expect(payload.html).toContain(`<a href="${ABSOLUTE}">${ABSOLUTE}</a>`)
  })
})

// ---------------------------------------------------------------------------
// 2, 3, 4. The text part — the three-branch rule (the regression pin).
// ---------------------------------------------------------------------------

describe('buildEmailPayload — the text part', () => {
  it('is <body> + a single newline + the absolute url when a body is present', () => {
    const payload = buildEmailPayload(row({ body: 'to "Green Lake"' }), env)

    expect(payload.text).toBe(`to "Green Lake"\n${ABSOLUTE}`)
    // Exactly ONE newline between the two parts (the old code emitted two).
    expect(payload.text).not.toContain('\n\n')
  })

  it('emits the body verbatim, not trimmed (the row already holds the copy)', () => {
    expect(buildEmailPayload(row({ body: '  indented copy  ' }), env).text).toBe(
      `  indented copy  \n${ABSOLUTE}`,
    )
  })

  it('a NULL body yields JUST the absolute url — no literal "null", no leading newline', () => {
    const payload = buildEmailPayload(row({ body: null }), env)

    expect(payload.text).toBe(ABSOLUTE)
    expect(payload.text.startsWith('\n')).toBe(false)
    expect(payload.text).not.toContain('null')
    expect(payload.html).not.toContain('null')
  })

  it('an empty-string body behaves exactly like NULL', () => {
    const empty = buildEmailPayload(row({ body: '' }), env)
    const nil = buildEmailPayload(row({ body: null }), env)

    expect(empty.text).toBe(nil.text)
    expect(empty.text).toBe(ABSOLUTE)
    expect(empty.html).toBe(nil.html)
  })

  it('a whitespace-only body also yields just the link, with no blank copy line', () => {
    expect(buildEmailPayload(row({ body: '   \n\t ' }), env).text).toBe(ABSOLUTE)
  })
})

// ---------------------------------------------------------------------------
// 5, 6, 7, 8. HTML injection — escape the title, the body AND the url.
// ---------------------------------------------------------------------------

describe('buildEmailPayload — HTML injection', () => {
  it('escapes a script tag in the TITLE in html and keeps it verbatim in text', () => {
    const title = '<script>alert(1)</script>'
    // The body quotes the title, exactly as the producers' copy does — so the
    // title also reaches the text part, where it must stay verbatim.
    const payload = buildEmailPayload(row({ title, body: `to "${title}"` }), env)

    expect(payload.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(payload.html).not.toContain('<script>')
    // A plain-text part is not markup, so it must NOT be escaped there.
    expect(payload.text).toContain(title)
    // The subject is a header, not markup — verbatim is correct.
    expect(payload.subject).toBe(`Drop In: ${title}`)
  })

  it('escapes markup in the BODY in html and keeps it verbatim in text', () => {
    const body = 'meet at <b>hi</b> park & ride'
    const payload = buildEmailPayload(row({ body }), env)

    expect(payload.html).toContain('meet at &lt;b&gt;hi&lt;/b&gt; park &amp; ride')
    expect(payload.html).not.toContain('<b>hi</b>')
    expect(payload.text).toContain(body)
    expect(payload.text).not.toContain('&lt;b&gt;')
  })

  it('escapes the url too — the href is markup even though the path is ours', () => {
    const url = '/playdate/pd-1?a=1&b=<script>'
    const payload = buildEmailPayload(row({ url }), env)

    expect(payload.html).toContain(
      `href="${BASE}/playdate/pd-1?a=1&amp;b=&lt;script&gt;"`,
    )
    expect(payload.html).not.toContain('<script>')
    // text is not markup: the raw url survives there.
    expect(payload.text).toContain(`${BASE}${url}`)
  })

  it('escapeHtml escapes all five characters, and escapes & FIRST', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
    // `&` is replaced first, or the later replacements' ampersands would be
    // escaped a second time. This is the assertion that pins the order.
    expect(escapeHtml('&<')).toBe('&amp;&lt;')
    expect(escapeHtml('&<')).not.toBe('&amp;amp;&lt;')
    // An already-escaped ampersand gains exactly one `amp;`, never two.
    expect(escapeHtml('&amp;')).toBe('&amp;amp;')
    expect(escapeHtml('Green Lake')).toBe('Green Lake')
  })
})

// ---------------------------------------------------------------------------
// 9, 10. The untitled/whitespace title fallback (0032 parity) and trimming.
// ---------------------------------------------------------------------------

describe('buildEmailPayload — the untitled title fallback (0032 parity)', () => {
  it('renders the pinned fallback for an empty AND a whitespace-only title', () => {
    for (const title of ['', '   ', '\t\n', '  \t ']) {
      const payload = buildEmailPayload(row({ title }), env)

      expect(payload.subject).toBe(`Drop In: ${TITLE_FALLBACK}`)
      expect(payload.html).toContain(`Drop In: ${TITLE_FALLBACK}`)
      // Never `Drop In: ` floating with nothing after it.
      expect(payload.subject).not.toBe('Drop In: ')
    }
  })

  it('trims the title before it becomes the subject (0032 btrim parity)', () => {
    expect(emailSubject('  Green Lake  ')).toBe('Drop In: Green Lake')
    expect(buildEmailPayload(row({ title: '  Green Lake  ' }), env).subject).toBe(
      'Drop In: Green Lake',
    )
  })
})

// ---------------------------------------------------------------------------
// 11, 12, 13. The absolute url — never relative, never doubled, never empty.
// ---------------------------------------------------------------------------

describe('buildEmailPayload — the absolute url', () => {
  it('emits the absolute url in html and text, never the bare relative path', () => {
    const payload = buildEmailPayload(row(), env)

    expect(payload.text).toBe(`to "Green Lake"\n${ABSOLUTE}`)
    expect(payload.text.split('\n')).toContain(ABSOLUTE)
    expect(payload.text.split('\n')).not.toContain(PATH)
    expect(payload.html).toContain(`href="${ABSOLUTE}"`)
    expect(payload.html).not.toContain(`href="${PATH}"`)
  })

  it('falls back to FALLBACK_BASE_URL for an empty, whitespace or undefined base', () => {
    const bases: Array<string | null | undefined> = ['', '   ', undefined, null]
    for (const baseUrl of bases) {
      expect(emailUrl(PATH, baseUrl)).toBe(`${FALLBACK_BASE_URL}${PATH}`)
      // Never a bare relative path — a relative link in an inbox is a dead link.
      expect(emailUrl(PATH, baseUrl)).not.toBe(PATH)
    }

    for (const baseUrl of ['', '   ']) {
      const payload = buildEmailPayload(row(), { baseUrl, replyTo: '' })
      expect(payload.text).toBe(`to "Green Lake"\n${FALLBACK_BASE_URL}${PATH}`)
      expect(payload.html).toContain(`href="${FALLBACK_BASE_URL}${PATH}"`)
      expect(payload.html).not.toContain(`href="${PATH}"`)
    }
  })

  it('never doubles the slash when the base arrives with trailing slashes', () => {
    expect(emailUrl(PATH, `${BASE}/`)).toBe(ABSOLUTE)
    expect(emailUrl(PATH, `${BASE}///`)).toBe(ABSOLUTE)
    // A trim around the base is part of the same normalisation.
    expect(emailUrl(PATH, `  ${BASE}/  `)).toBe(ABSOLUTE)

    const payload = buildEmailPayload(row(), { baseUrl: `${BASE}//`, replyTo: '' })
    expect(payload.text).toBe(`to "Green Lake"\n${ABSOLUTE}`)
    expect(payload.html).not.toContain(`${BASE}//${PATH}`)
  })
})

// ---------------------------------------------------------------------------
// 14, 15. The List-Unsubscribe value (the CAN-SPAM opt-out).
// ---------------------------------------------------------------------------

describe('listUnsubscribe — the opt-out value slice 3 sends as a header', () => {
  it('builds a mailto from the reply-to address when one is configured', () => {
    expect(buildEmailPayload(row(), env).listUnsubscribe).toBe(
      'mailto:hello@drop-in.example?subject=unsubscribe',
    )
    // The address is trimmed on its way into the header.
    expect(
      buildEmailPayload(row(), { baseUrl: BASE, replyTo: '  hello@drop-in.example  ' })
        .listUnsubscribe,
    ).toBe('mailto:hello@drop-in.example?subject=unsubscribe')
  })

  it('falls back to <base>/settings when there is no reply-to, and to the pinned origin when the base is empty too', () => {
    // Deliberately NOT an invented `unsubscribe@<origin>`: a dead mailbox is
    // worse than no mailto at all, and /settings is where the toggle lives.
    expect(buildEmailPayload(row(), { baseUrl: BASE, replyTo: '' }).listUnsubscribe).toBe(
      `${BASE}/settings`,
    )
    expect(buildEmailPayload(row(), { baseUrl: BASE, replyTo: '   ' }).listUnsubscribe).toBe(
      `${BASE}/settings`,
    )
    expect(buildEmailPayload(row(), { baseUrl: '', replyTo: '' }).listUnsubscribe).toBe(
      `${FALLBACK_BASE_URL}/settings`,
    )
    expect(buildEmailPayload(row(), { baseUrl: '   ', replyTo: '  ' }).listUnsubscribe).toBe(
      `${FALLBACK_BASE_URL}/settings`,
    )
  })
})

// ---------------------------------------------------------------------------
// 16. The kind guard.
// ---------------------------------------------------------------------------

describe('isEmailKind', () => {
  it('accepts the eight kinds and rejects anything else', () => {
    for (const kind of EMAIL_KINDS) expect(isEmailKind(kind)).toBe(true)
    // `ended` is a real kind (migration 0041) — it was the missing one.
    expect(isEmailKind('ended')).toBe(true)
    // `review_due` is a real kind (migration 0055) — the one this file's list
    // sat without until the drift guard above demanded it.
    expect(isEmailKind('review_due')).toBe(true)
    // `new_message` (migration 0056).
    expect(isEmailKind('new_message')).toBe(true)
    // `followed_new_dropin` is the newest — and the one that proved why this
    // list matters: its producer was live for days while BOTH this list and
    // NOTIFICATION_KINDS still named seven kinds, so the database had a kind
    // neither runtime recognised.
    expect(isEmailKind('followed_new_dropin')).toBe(true)
    expect(isEmailKind('unknown_kind')).toBe(false)
    expect(isEmailKind('')).toBe(false)
    expect(isEmailKind(null)).toBe(false)
    expect(isEmailKind(undefined)).toBe(false)
    expect(isEmailKind('PING_RECEIVED')).toBe(false)
    expect(isEmailKind(42)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The browser seam itself (src/lib/email.ts): a stubbed `window` keeps these
// deterministic whether or not the developer's `.env` sets the public base.
// ---------------------------------------------------------------------------

describe('the browser seam', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clientBaseUrl prefers VITE_PUBLIC_BASE_URL and otherwise uses the live origin', () => {
    vi.stubGlobal('window', { location: { origin: 'https://stub.example' } })

    // ⚠️ AN EMPTY VALUE IS NOT A CONFIGURED ONE, and this expectation changed
    // with the rule (lib/publicUrl.ts). It used to be `configured ?? origin`,
    // which KEPT the '' — `.env` ships `VITE_PUBLIC_BASE_URL=` — and handed an
    // empty base downstream, where a second fallback caught it. The rule now
    // treats a blank value as absent, so the live origin wins, which is what the
    // docblock above always claimed ("the live origin is correct by
    // construction").
    const configured = import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined
    const expected =
      configured !== undefined && configured.trim() !== ''
        ? configured.trim().replace(/\/+$/, '')
        : 'https://stub.example'
    expect(clientBaseUrl()).toBe(expected)
  })

  it('a NATIVE SHELL never builds a localhost link', () => {
    // Native plan slice 1's hazard, pinned at the seam that feeds every email
    // link. The shell rule itself is pinned purely in publicUrl.test.ts; what
    // this adds is that the INTEGRATION cannot leak the shell's own origin.
    vi.stubGlobal('window', { location: { origin: 'https://localhost' } })

    const configured = import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined
    if (configured !== undefined && configured.trim() !== '') {
      // A configured deployment wins in the shell too — that is the point of it.
      expect(clientBaseUrl()).toBe(configured.trim().replace(/\/+$/, ''))
    } else {
      expect(clientBaseUrl()).toBe(FALLBACK_BASE_URL)
      expect(clientBaseUrl()).not.toContain('localhost')
    }
  })

  it('clientEmailEnv carries the client base with no reply-to, exercising /settings', () => {
    vi.stubGlobal('window', { location: { origin: 'https://stub.example' } })

    const clientEnv = clientEmailEnv()
    expect(clientEnv.replyTo).toBe('')
    expect(clientEnv.baseUrl).toBe(clientBaseUrl())
    expect(buildEmailPayload(row(), clientEnv).listUnsubscribe.endsWith('/settings')).toBe(true)
  })
})
