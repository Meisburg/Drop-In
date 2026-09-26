/**
 * The SMTP transport's spec.
 *
 * NO socket and NO library: every test builds its own COUNTING FAKE, hands it to
 * `sendEmailViaSmtp` through `SmtpDeps`, and asserts on what the fake was asked
 * to do. The fake doubles as the "was a connection opened at all?" probe for the
 * pre-flight (misconfiguration) cases — a short-circuit that still dialled would
 * be a bug the result shape alone cannot reveal — and as the `close()` counter,
 * because a leaked connection per row would exhaust the server inside one drain.
 *
 * THE TESTS THAT MATTER MOST ARE THE CLASSIFICATION ONES, because SMTP is the
 * OPPOSITE of the Resend/HTTP rule this repo already documents: 4xx is
 * TRANSIENT (retry) and 5xx is PERMANENT (retire). A 550 is an ADDRESS
 * REJECTION: retrying it forever would spin the identical bytes against the
 * oldest-first outbox and burn the send budget ahead of notices that could
 * actually be delivered. Every code the brief names is pinned individually
 * (421/450/451/452 retryable, 550/551/553/554/535 NOT), not sampled, so a
 * well-meaning "simplify to `code >= 500`" refactor fails loudly on the code
 * that matters.
 */
import { describe, expect, it } from 'vitest'

import {
  SMTP_DEFAULT_HOST,
  SMTP_DEFAULT_PORT,
  classifySmtpFailure,
  sendEmailViaSmtp,
  smtpConfigFrom,
  smtpErrorCode,
  smtpStatusFromResponse,
  type EmailMessage,
  type SmtpClientLike,
  type SmtpConfig,
  type SmtpDeps,
  type SmtpMessage,
} from './smtp'

const CONFIG: SmtpConfig = {
  host: SMTP_DEFAULT_HOST,
  port: SMTP_DEFAULT_PORT,
  secure: true,
  user: 'jonmeisburg@gmail.com',
  pass: 'abcd efgh ijkl mnop',
  from: 'Drop In <jonmeisburg@gmail.com>',
}

const MESSAGE: EmailMessage = {
  to: 'parent@example.test',
  subject: 'Drop In: Saturday at the park',
  html: '<p>Saturday at the park</p>',
  text: 'Saturday at the park',
}

interface FakeOptions {
  /** The status the fake client reports. Omit it to exercise the 250 default. */
  status?: number
  /** When set, `connect()` rejects with this instead of returning a client. */
  connectError?: unknown
  /** When set, `send()` rejects with this. */
  sendError?: unknown
  /** When set, `close()` throws this. */
  closeError?: unknown
}

interface RecordingSmtp {
  deps: SmtpDeps
  /** Every config `connect()` was handed — the "was anything dialled?" probe. */
  connects: SmtpConfig[]
  /** Every message `send()` was handed. */
  sent: SmtpMessage[]
  /** How many times `close()` ran. */
  closeCount(): number
}

/** Build a counting fake transport: no socket, no globals, per-test state. */
function recordingSmtp(options: FakeOptions = {}): RecordingSmtp {
  const connects: SmtpConfig[] = []
  const sent: SmtpMessage[] = []
  let closes = 0

  const deps: SmtpDeps = {
    async connect(config) {
      connects.push(config)
      if (options.connectError !== undefined) throw options.connectError

      const client: SmtpClientLike = {
        async send(message) {
          sent.push(message)
          if (options.sendError !== undefined) throw options.sendError
          // A missing `status` (undefined at runtime) is what exercises the
          // pure module's 250 default; the cast is only to satisfy the type.
          return { status: options.status as number }
        },
        close() {
          closes += 1
          if (options.closeError !== undefined) throw options.closeError
        },
      }
      return client
    },
  }

  return { deps, connects, sent, closeCount: () => closes }
}

/** A nodemailer-shaped SMTP rejection: the reply code rides on `responseCode`. */
function smtpRejection(code: number): Error {
  return Object.assign(new Error(`Mail command failed: ${code} rejected by the server`), {
    responseCode: code,
  })
}

describe('sendEmailViaSmtp — success', () => {
  it('resolves { ok: true, status: 250 } and sends exactly once when the client reports no status', async () => {
    const transport = recordingSmtp()

    const result = await sendEmailViaSmtp(transport.deps, MESSAGE, CONFIG)

    expect(result).toEqual({ ok: true, status: 250 })
    expect(transport.sent).toHaveLength(1)
  })

  it('carries the client’s own reply code rather than the default', async () => {
    const transport = recordingSmtp({ status: 251 })

    const result = await sendEmailViaSmtp(transport.deps, MESSAGE, CONFIG)

    expect(result).toEqual({ ok: true, status: 251 })
  })

  it('hands the client the message fields from the EmailMessage', async () => {
    const transport = recordingSmtp()

    await sendEmailViaSmtp(transport.deps, MESSAGE, CONFIG)

    expect(transport.sent).toHaveLength(1)
    const [message] = transport.sent
    expect(message.to).toBe('parent@example.test')
    expect(message.subject).toBe('Drop In: Saturday at the park')
    expect(message.html).toBe('<p>Saturday at the park</p>')
    expect(message.text).toBe('Saturday at the park')
  })

  it('takes from from the SmtpConfig, and the optional replyTo when non-blank', async () => {
    const withReplyTo = recordingSmtp()
    await sendEmailViaSmtp(withReplyTo.deps, MESSAGE, { ...CONFIG, replyTo: 'hey@dropin.test' })
    expect(withReplyTo.sent[0].from).toBe('Drop In <jonmeisburg@gmail.com>')
    expect(withReplyTo.sent[0].replyTo).toBe('hey@dropin.test')

    const empty = recordingSmtp()
    await sendEmailViaSmtp(empty.deps, MESSAGE, { ...CONFIG, replyTo: '' })
    expect('replyTo' in empty.sent[0]).toBe(false)

    const whitespace = recordingSmtp()
    await sendEmailViaSmtp(whitespace.deps, MESSAGE, { ...CONFIG, replyTo: '   ' })
    expect('replyTo' in whitespace.sent[0]).toBe(false)

    const absent = recordingSmtp()
    await sendEmailViaSmtp(absent.deps, MESSAGE, CONFIG)
    expect('replyTo' in absent.sent[0]).toBe(false)
  })

  it('hands connect the config, with the credential values trimmed', async () => {
    const transport = recordingSmtp()

    await sendEmailViaSmtp(transport.deps, MESSAGE, {
      ...CONFIG,
      user: '  jonmeisburg@gmail.com  ',
      pass: '\t abcd efgh \n',
    })

    expect(transport.connects).toHaveLength(1)
    const [config] = transport.connects
    expect(config.host).toBe(SMTP_DEFAULT_HOST)
    expect(config.port).toBe(SMTP_DEFAULT_PORT)
    expect(config.user).toBe('jonmeisburg@gmail.com')
    expect(config.pass).toBe('abcd efgh')
    expect(config.from).toBe('Drop In <jonmeisburg@gmail.com>')
  })
})

describe('sendEmailViaSmtp — never dials when misconfigured', () => {
  // One test per blank field, and a whitespace-only value is as absent as an
  // empty one — `'   '` cannot authenticate anything. Terminal (retryable:
  // false) because retrying a missing secret changes nothing.
  it('short-circuits a missing host before any connect', async () => {
    for (const blank of ['', '   ', '\t\n']) {
      const transport = recordingSmtp()
      const result = await sendEmailViaSmtp(transport.deps, MESSAGE, { ...CONFIG, host: blank })

      expect(result, `host=${JSON.stringify(blank)}`).toMatchObject({
        ok: false,
        status: null,
        retryable: false,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.trim()).not.toBe('')
      expect(transport.connects, `host=${JSON.stringify(blank)}`).toHaveLength(0)
      expect(transport.sent).toHaveLength(0)
      expect(transport.closeCount()).toBe(0)
    }
  })

  it('short-circuits a missing user before any connect', async () => {
    for (const blank of ['', '   ', '\t\n']) {
      const transport = recordingSmtp()
      const result = await sendEmailViaSmtp(transport.deps, MESSAGE, { ...CONFIG, user: blank })

      expect(result, `user=${JSON.stringify(blank)}`).toMatchObject({
        ok: false,
        status: null,
        retryable: false,
      })
      expect(transport.connects, `user=${JSON.stringify(blank)}`).toHaveLength(0)
    }
  })

  it('short-circuits a missing pass before any connect', async () => {
    for (const blank of ['', '   ', '\t\n']) {
      const transport = recordingSmtp()
      const result = await sendEmailViaSmtp(transport.deps, MESSAGE, { ...CONFIG, pass: blank })

      expect(result, `pass=${JSON.stringify(blank)}`).toMatchObject({
        ok: false,
        status: null,
        retryable: false,
      })
      expect(transport.connects, `pass=${JSON.stringify(blank)}`).toHaveLength(0)
    }
  })

  it('short-circuits a missing from before any connect', async () => {
    for (const blank of ['', '   ', '\t\n']) {
      const transport = recordingSmtp()
      const result = await sendEmailViaSmtp(transport.deps, MESSAGE, { ...CONFIG, from: blank })

      expect(result, `from=${JSON.stringify(blank)}`).toMatchObject({
        ok: false,
        status: null,
        retryable: false,
      })
      expect(transport.connects, `from=${JSON.stringify(blank)}`).toHaveLength(0)
    }
  })
})

describe('classifySmtpFailure — 4xx is TRANSIENT (retryable)', () => {
  it('421 service not available is retryable', () => {
    expect(classifySmtpFailure(421).retryable).toBe(true)
    expect(classifySmtpFailure(421).reason).toContain('421')
  })

  it('450 mailbox busy is retryable', () => {
    expect(classifySmtpFailure(450).retryable).toBe(true)
    expect(classifySmtpFailure(450).reason).toContain('450')
  })

  it('451 local error is retryable', () => {
    expect(classifySmtpFailure(451).retryable).toBe(true)
    expect(classifySmtpFailure(451).reason).toContain('451')
  })

  it('452 out of storage is retryable', () => {
    expect(classifySmtpFailure(452).retryable).toBe(true)
    expect(classifySmtpFailure(452).reason).toContain('452')
  })
})

describe('classifySmtpFailure — 5xx is PERMANENT (NOT retryable)', () => {
  it('550 mailbox unavailable (address REJECTED) is NOT retryable', () => {
    // The load-bearing one: the identical bytes get the identical 550 forever,
    // and retrying burns the oldest-first outbox's send budget.
    expect(classifySmtpFailure(550).retryable).toBe(false)
    expect(classifySmtpFailure(550).reason).toContain('550')
  })

  it('551 user not local is NOT retryable', () => {
    expect(classifySmtpFailure(551).retryable).toBe(false)
    expect(classifySmtpFailure(551).reason).toContain('551')
  })

  it('553 mailbox name not allowed (bad address) is NOT retryable', () => {
    expect(classifySmtpFailure(553).retryable).toBe(false)
    expect(classifySmtpFailure(553).reason).toContain('553')
  })

  it('554 transaction failed is NOT retryable', () => {
    expect(classifySmtpFailure(554).retryable).toBe(false)
    expect(classifySmtpFailure(554).reason).toContain('554')
  })

  it('535 authentication failed is NOT retryable', () => {
    expect(classifySmtpFailure(535).retryable).toBe(false)
    expect(classifySmtpFailure(535).reason).toContain('535')
  })
})

describe('classifySmtpFailure — no reply code', () => {
  it('null (connection or TLS failure) is retryable: nothing was rejected', () => {
    const classification = classifySmtpFailure(null)
    expect(classification.retryable).toBe(true)
    expect(classification.reason.trim()).not.toBe('')
  })

  it('every classification carries a non-empty reason', () => {
    for (const code of [null, 421, 450, 451, 452, 535, 550, 551, 553, 554, 299, 600]) {
      expect(classifySmtpFailure(code).reason.trim(), `code=${String(code)}`).not.toBe('')
    }
  })
})

describe('sendEmailViaSmtp — a rejected send never throws', () => {
  it('maps a thrown responseCode 550 to { ok: false, retryable: false }', async () => {
    const transport = recordingSmtp({ sendError: smtpRejection(550) })

    await expect(sendEmailViaSmtp(transport.deps, MESSAGE, CONFIG)).resolves.toMatchObject({
      ok: false,
      status: 550,
      retryable: false,
    })
  })

  it('maps a thrown responseCode 451 to { ok: false, retryable: true }', async () => {
    const transport = recordingSmtp({ sendError: smtpRejection(451) })

    await expect(sendEmailViaSmtp(transport.deps, MESSAGE, CONFIG)).resolves.toMatchObject({
      ok: false,
      status: 451,
      retryable: true,
    })
  })

  it('maps a thrown error with NO code to { ok: false, status: null, retryable: true }', async () => {
    const transport = recordingSmtp({ sendError: new Error('socket hang up') })

    await expect(sendEmailViaSmtp(transport.deps, MESSAGE, CONFIG)).resolves.toMatchObject({
      ok: false,
      status: null,
      retryable: true,
    })
  })

  it('still yields a non-empty error when the thrown error has no message', async () => {
    const transport = recordingSmtp({ sendError: Object.assign(new Error(''), { responseCode: 550 }) })

    const result = await sendEmailViaSmtp(transport.deps, MESSAGE, CONFIG)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.trim()).not.toBe('')
      expect(result.error).toContain('550')
    }
  })

  it('maps a connect() rejection to a retryable result and never throws', async () => {
    const transport = recordingSmtp({ connectError: new Error('connect ECONNREFUSED 127.0.0.1:465') })

    const result = await sendEmailViaSmtp(transport.deps, MESSAGE, CONFIG)

    expect(result).toMatchObject({ ok: false, status: null, retryable: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('ECONNREFUSED')
    expect(transport.sent).toHaveLength(0)
    // Nothing was obtained, so there is nothing to close.
    expect(transport.closeCount()).toBe(0)
  })
})

describe('smtpErrorCode — responseCode, then status, then a numeric code', () => {
  it('prefers responseCode over status and code', () => {
    expect(smtpErrorCode({ responseCode: 550, status: 451, code: 554 })).toBe(550)
  })

  it('falls back to status when responseCode is absent', () => {
    expect(smtpErrorCode({ status: 451, code: 554 })).toBe(451)
  })

  it('falls back to a numeric code when neither responseCode nor status is present', () => {
    expect(smtpErrorCode({ code: 554 })).toBe(554)
  })

  it('reads the code off a real Error instance too', () => {
    expect(smtpErrorCode(smtpRejection(421))).toBe(421)
  })

  it('ignores a non-numeric (nodemailer transport) code and returns null', () => {
    expect(smtpErrorCode({ code: 'EENVELOPE' })).toBeNull()
    expect(smtpErrorCode({ code: 'EAUTH', status: 'nope' })).toBeNull()
  })

  it('returns null for an error-less or code-less value', () => {
    expect(smtpErrorCode(new Error('socket hang up'))).toBeNull()
    expect(smtpErrorCode({})).toBeNull()
    expect(smtpErrorCode(null)).toBeNull()
    expect(smtpErrorCode(undefined)).toBeNull()
    expect(smtpErrorCode('550 rejected')).toBeNull()
  })
})

describe('sendEmailViaSmtp — the client is always closed', () => {
  it('closes the client after a successful send', async () => {
    const transport = recordingSmtp()

    await sendEmailViaSmtp(transport.deps, MESSAGE, CONFIG)

    expect(transport.closeCount()).toBe(1)
  })

  it('closes the client after a failed send', async () => {
    const transport = recordingSmtp({ sendError: smtpRejection(550) })

    await sendEmailViaSmtp(transport.deps, MESSAGE, CONFIG)

    expect(transport.closeCount()).toBe(1)
  })

  it('a close() that THROWS does not change a successful result', async () => {
    const transport = recordingSmtp({ closeError: new Error('connection already torn down') })

    const result = await sendEmailViaSmtp(transport.deps, MESSAGE, CONFIG)

    expect(result).toEqual({ ok: true, status: 250 })
    expect(transport.closeCount()).toBe(1)
  })

  it('a close() that THROWS does not change a failed result', async () => {
    const transport = recordingSmtp({
      sendError: smtpRejection(550),
      closeError: new Error('connection already torn down'),
    })

    const result = await sendEmailViaSmtp(transport.deps, MESSAGE, CONFIG)

    expect(result).toMatchObject({ ok: false, status: 550, retryable: false })
  })
})

describe('sendEmailViaSmtp — headers', () => {
  it('turns a non-blank listUnsubscribe into a List-Unsubscribe header', async () => {
    const unsubscribeUrl = 'https://dropin.test/settings'

    const withHeader = recordingSmtp()
    await sendEmailViaSmtp(withHeader.deps, { ...MESSAGE, listUnsubscribe: unsubscribeUrl }, CONFIG)
    expect(withHeader.sent[0].headers).toEqual({ 'List-Unsubscribe': unsubscribeUrl })

    const blank = recordingSmtp()
    await sendEmailViaSmtp(blank.deps, { ...MESSAGE, listUnsubscribe: '   ' }, CONFIG)
    expect('headers' in blank.sent[0]).toBe(false)

    const absent = recordingSmtp()
    await sendEmailViaSmtp(absent.deps, MESSAGE, CONFIG)
    expect('headers' in absent.sent[0]).toBe(false)
  })
})

/**
 * `smtpStatusFromResponse` — the reply-code parse that nodemailer's
 * `info.response` feeds. It used to live in `_shared/smtpDeno.ts`, where it took
 * the `info` wrapper and could never be imported by vitest (that file imports
 * `npm:nodemailer@6`). It now takes the raw `response` and lives in the pure
 * module, so it is testable — which is why these cases exist at all.
 *
 * THE FALLBACK IS NOT "ASSUME SUCCESS". A parse miss means "no verdict was
 * readable here", and the send already completed; 250 is the SMTP "OK"
 * completion, so an unreadable reply is not by itself evidence of a rejection.
 * Only a readable 4xx/5xx (or the throwing path, classified by
 * `classifySmtpFailure`) is a verdict.
 */
describe('smtpStatusFromResponse — parses the reply code out of info.response', () => {
  it('reads 250 from the real Gmail success line', () => {
    expect(smtpStatusFromResponse('250 2.0.0 OK 1727... - gsmtp')).toBe(250)
  })

  it('reads 550 from an ADDRESS REJECTION reply', () => {
    // The code that decides retire-vs-retry, so it is pinned with its real text.
    expect(smtpStatusFromResponse('550 5.1.1 The email account does not exist')).toBe(550)
  })

  it('reads 451 from a transient system failure reply', () => {
    expect(smtpStatusFromResponse('451 4.3.0 Temporary system failure')).toBe(451)
  })

  it('still parses with leading or trailing whitespace', () => {
    expect(smtpStatusFromResponse('  250 2.0.0 OK 1727... - gsmtp')).toBe(250)
    expect(smtpStatusFromResponse('550 5.1.1 The email account does not exist\n')).toBe(550)
    expect(smtpStatusFromResponse('\t\n451 4.3.0 Temporary system failure  ')).toBe(451)
  })

  it('falls back to 250 when there is no string to read', () => {
    expect(smtpStatusFromResponse(undefined)).toBe(250)
    expect(smtpStatusFromResponse(null)).toBe(250)
    expect(smtpStatusFromResponse(250)).toBe(250)
  })

  it('falls back to 250 for a blank, garbled, or too-short reply', () => {
    expect(smtpStatusFromResponse('')).toBe(250)
    expect(smtpStatusFromResponse('garbage')).toBe(250)
    expect(smtpStatusFromResponse('25')).toBe(250)
  })

  it('does NOT parse a code that is not anchored at the start of the reply', () => {
    expect(smtpStatusFromResponse('reply from 550 server')).toBe(250)
    expect(smtpStatusFromResponse('error: 451 temporary failure')).toBe(250)
  })
})

/**
 * `smtpConfigFrom` — the env-to-config mapping, also moved here from
 * `_shared/smtpDeno.ts` (a Deno-only file vitest cannot import). The defaults are
 * the VERIFIED Gmail account's; `SMTP_HOST`/`SMTP_PORT` exist so a future
 * non-Gmail sender needs no code change.
 */
describe('smtpConfigFrom — maps env to a config, with the verified defaults', () => {
  it('defaults an empty env to smtp.gmail.com:465 with implicit TLS', () => {
    const config = smtpConfigFrom({})

    expect(config.host).toBe('smtp.gmail.com')
    expect(config.port).toBe(465)
    expect(config.secure).toBe(true)
  })

  it('honours SMTP_HOST and SMTP_PORT overrides', () => {
    const config = smtpConfigFrom({ SMTP_HOST: 'smtp.example.test', SMTP_PORT: '2525' })

    expect(config.host).toBe('smtp.example.test')
    expect(config.port).toBe(2525)
    expect(config.secure).toBe(false)
  })

  it('treats 587 as STARTTLS, not implicit TLS', () => {
    expect(smtpConfigFrom({ SMTP_PORT: '587' }).secure).toBe(false)
    expect(smtpConfigFrom({ SMTP_PORT: '465' }).secure).toBe(true)
  })

  it('falls back to 465 for a blank, non-numeric, or non-positive port', () => {
    for (const port of ['', '   ', 'abc', '0', '-1']) {
      const config = smtpConfigFrom({ SMTP_PORT: port })

      expect(config.port, `SMTP_PORT=${JSON.stringify(port)}`).toBe(465)
      expect(config.secure, `SMTP_PORT=${JSON.stringify(port)}`).toBe(true)
    }
  })

  it('trims every value so a stray newline from a secret cannot reach a header', () => {
    const config = smtpConfigFrom({
      SMTP_USER: '  user@gmail.com \n',
      SMTP_PASS: '\t abcd efgh ijkl mnop  ',
      EMAIL_FROM: '  Drop In <user@gmail.com>\n',
      EMAIL_REPLY_TO: ' hey@dropin.test ',
    })

    expect(config.user).toBe('user@gmail.com')
    expect(config.pass).toBe('abcd efgh ijkl mnop')
    expect(config.from).toBe('Drop In <user@gmail.com>')
    expect(config.replyTo).toBe('hey@dropin.test')
  })

  it('falls back to the default host when SMTP_HOST is blank or whitespace', () => {
    expect(smtpConfigFrom({ SMTP_HOST: '' }).host).toBe('smtp.gmail.com')
    expect(smtpConfigFrom({ SMTP_HOST: '   ' }).host).toBe('smtp.gmail.com')
  })
})
