/**
 * THE PROOF THAT `_shared/smtpDeno.ts` ACTUALLY SENDS EMAIL.
 *
 * WHY THIS FILE EXISTS. `smtpDeno.ts` is the file that will carry every
 * production notice, and until this test it had NEVER BEEN EXECUTED by
 * anything: it imports `npm:nodemailer@6`, so vitest (plain Node) cannot load
 * it, and the Deno lane (`scripts/deno-check-functions.sh`) only TYPE-checks
 * it. Its pure helpers were extracted and unit-tested long ago
 * (`src/lib/smtp.test.ts` pins `smtpStatusFromResponse`, `smtpErrorCode`,
 * `classifySmtpFailure`), so what remained unproven was exactly the wiring
 * around them: `createTransport`, `sendMail`, the field mapping from
 * `SmtpMessage` onto nodemailer's message object, the error path that carries
 * `responseCode` into the classifier, and `close()`. A bug in any of those
 * surfaces only when the founder supplies the real credential.
 *
 * HOW IT PROVES IT. Deno's own test runner CAN import `npm:` specifiers, so
 * this test runs the REAL adapter against a REAL socket: a minimal SMTP server
 * built here out of raw `Deno.listen` on 127.0.0.1 with port 0 (the OS picks a
 * free port — never a fixed one, which is how such tests go flaky). No external
 * network, no real credentials, no SMTP-server dependency. In-process does not
 * mean faked: nodemailer opens a TCP connection, speaks EHLO/AUTH LOGIN/MAIL
 * FROM/RCPT TO/DATA/QUIT, and the bytes it transmits are captured here and
 * asserted, which is the only evidence that the field mapping is wired.
 *
 * WHAT THE FAKE SPEAKS — just enough of RFC 5321 for nodemailer, and no more:
 *   220 greeting, 250-multiline EHLO advertising `AUTH LOGIN PLAIN` (LOGIN
 *   first, because nodemailer picks `_supportedAuth[0]`), the two-step LOGIN
 *   challenge (`334 VXNlcm5hbWU6` / `334 UGFzc3dvcmQ6`) and the one-shot PLAIN
 *   form, 250 for MAIL FROM, a CONFIGURABLE RCPT TO reply (this is what lets the
 *   permanent/transient cases be driven from the server side), 354 + dot-
 *   terminated DATA with a configurable completion reply, 221 on QUIT.
 *
 * THIS FILE IS TEST-ONLY AND LIVE-NETWORK-FREE. It is picked up by
 * `scripts/deno-test-functions.sh` in the staged temp copy of
 * `supabase/functions/`, so it never joins the vitest lane (that lane can never
 * import `npm:` anyway) and never lands in a deployed Edge Function bundle.
 *
 * ONE SEAM IS SPYED, AND ONLY ONE. `close()` has no wire-level witness (a
 * non-pooled nodemailer transport closes its own socket after each send, and
 * `sendEmailViaSmtp` deliberately swallows a close failure), so the last test
 * wraps the real `nodemailer.createTransport` — the same cached module instance
 * the adapter imports — to record the transport options, the `sendMail` argument
 * and the `close()` call. The wrapper delegates straight through, so everything
 * below the seam is still real nodemailer, on a real socket.
 */

import {
  assert,
  assertEquals,
  assertExists,
  assertFalse,
  assertStrictEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'

import type { EmailMessage, SendResult } from './resend.ts'
import { sendEmailViaSmtp, type SmtpConfig } from './smtp.ts'
// The adapter UNDER TEST — the real `npm:nodemailer@6` wiring, not a stand-in.
import { smtpDeps } from './smtpDeno.ts'
// The SAME cached module instance the adapter imports, so patching
// `createTransport` below is visible to `smtpDeno.ts` (see `spyOnTransport`).
import nodemailer from 'npm:nodemailer@6'

// ─────────────────────────────────────────────────────────────────────────────
// Assertion helpers: `SendResult` is a discriminated union, so narrowing it by
// hand beats casting, and the failure message carries the REAL reason.
// ─────────────────────────────────────────────────────────────────────────────

type OkResult = Extract<SendResult, { ok: true }>
type FailedResult = Extract<SendResult, { ok: false }>

/** Fails with the adapter's own words when the send did not succeed. */
function assertOk(result: SendResult): OkResult {
  if (!result.ok) {
    throw new Error(
      `expected ok:true, got ok:false (status=${String(result.status)}, ` +
        `retryable=${String(result.retryable)}, error=${result.error})`,
    )
  }
  return result
}

/** Fails when the send unexpectedly succeeded, or when it threw instead. */
function assertFailed(result: SendResult): FailedResult {
  if (result.ok) {
    throw new Error(`expected ok:false, got ok:true (status=${String(result.status)})`)
  }
  return result
}

/**
 * Bound every await. A wiring bug that leaves the transport hanging would
 * otherwise sit inside nodemailer's 2-minute connection / 10-minute socket
 * timeout, and a test that hangs is worse evidence than one that fails with a
 * sentence.
 */
async function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  // `ReturnType` rather than `number`: with nodemailer's Node types in the graph
  // `setTimeout` resolves to Node's overload, which returns `Timeout`.
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} did not settle within ${ms}ms — the SMTP wiring is hanging`)),
          ms,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The fake SMTP server.
// ─────────────────────────────────────────────────────────────────────────────

const CRLF = '\r\n'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** One finished connection, as the server saw it. */
interface FakeSmtpSession {
  /** The raw DATA payload, dot-unstuffed; `''` when no message was accepted. */
  data: string
  /** Credentials decoded off the wire, or null when the client never authenticated. */
  auth: { user: string; pass: string } | null
}

interface FakeSmtpOptions {
  /** The RCPT TO reply code. 550 is the address rejection; 451 is transient. */
  rcptCode?: number
  /** The full RCPT TO reply line; wins over `rcptCode` when given. */
  rcptReply?: string
  /** The end-of-DATA reply line. */
  dataReply?: string
}

interface FakeSmtpServer {
  /** The port the OS assigned on 127.0.0.1 — read back, never assumed. */
  readonly port: number
  /** Finished connections, in arrival order. */
  readonly sessions: FakeSmtpSession[]
  /** The exact end-of-DATA reply line this server sends, for assertions. */
  readonly dataReply: string
  /** The exact RCPT TO reply line this server sends. */
  readonly rcptReply: string
  /** Resolves once `count` connections have finished; throws if one errored. */
  waitForSessions(count: number): Promise<void>
  /** Close the listener and every live connection. Never throws. */
  close(): Promise<void>
}

/** The per-code RCPT TO lines a real server would send. */
const RCPT_REPLIES: Record<number, string> = {
  250: '250 OK',
  451: '451 4.3.0 Temporary system failure. Please try again later.',
  550: '550 5.1.1 The email account that you tried to reach does not exist',
}

/**
 * A buffered line reader over one TCP connection. A shared reader matters:
 * commands and the DATA payload arrive on the same stream, and a client may
 * hand back several lines in one read.
 */
function lineReader(conn: Deno.Conn): () => Promise<string | null> {
  const buf = new Uint8Array(16 * 1024)
  let pending = ''

  return async function readLine(): Promise<string | null> {
    while (true) {
      const newline = pending.indexOf('\n')
      if (newline !== -1) {
        const line = pending.slice(0, newline).replace(/\r$/, '')
        pending = pending.slice(newline + 1)
        return line
      }
      const read = await conn.read(buf)
      if (read === null) {
        // EOF. A client that hangs up mid-line is teardown, not data.
        if (pending === '') return null
        const rest = pending.replace(/\r$/, '')
        pending = ''
        return rest
      }
      pending += decoder.decode(buf.subarray(0, read))
    }
  }
}

/** base64 → text, tolerating a malformed blob (the assertion then fails loudly). */
function decodeBase64(blob: string): string {
  try {
    return atob(blob)
  } catch {
    return ''
  }
}

/**
 * Start the fake server: bind 127.0.0.1:0, read the assigned port back, and
 * accept connections until `close()`. Each connection is handled on its own
 * promise so a test never has to know when the client dials.
 */
async function startFakeSmtp(options: FakeSmtpOptions = {}): Promise<FakeSmtpServer> {
  const rcptReply = options.rcptReply ?? RCPT_REPLIES[options.rcptCode ?? 250] ?? '250 OK'
  const dataReply = options.dataReply ?? '250 2.0.0 OK: queued as ABC123'

  const listener = Deno.listen({ hostname: '127.0.0.1', port: 0 })
  const { port } = listener.addr as Deno.NetAddr

  const sessions: FakeSmtpSession[] = []
  const live = new Set<Deno.Conn>()
  const failures: unknown[] = []
  const waiters: Array<{ count: number; resolve: () => void }> = []
  let closed = false

  function notifyWaiters(): void {
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (sessions.length >= waiters[i].count) {
        waiters[i].resolve()
        waiters.splice(i, 1)
      }
    }
  }

  async function handleSession(conn: Deno.Conn): Promise<void> {
    const readLine = lineReader(conn)
    const send = (line: string) => conn.write(encoder.encode(line + CRLF))

    let auth: { user: string; pass: string } | null = null
    let data: string | null = null
    let inData = false
    const dataLines: string[] = []

    await send('220 test.local ESMTP')

    try {
      while (true) {
        const line = await readLine()
        if (line === null) break

        if (inData) {
          if (line === '.') {
            inData = false
            data = dataLines.join(CRLF)
            await send(dataReply)
            continue
          }
          // RFC 5321 §4.5.2 transparency: the client doubles a leading dot.
          dataLines.push(line.startsWith('..') ? line.slice(1) : line)
          continue
        }

        const upper = line.toUpperCase()

        if (upper.startsWith('EHLO')) {
          // LOGIN is advertised FIRST on purpose: nodemailer selects
          // `_supportedAuth[0]`, so this is the mechanism the adapter exercises.
          await send('250-test.local')
          await send('250-AUTH LOGIN PLAIN')
          await send('250 OK')
        } else if (upper.startsWith('HELO')) {
          await send('250 test.local')
        } else if (upper.startsWith('AUTH LOGIN')) {
          // `AUTH LOGIN` (two-step) or `AUTH LOGIN <base64 user>` (one-step).
          const initial = line.trim().split(/\s+/)[2]
          let user: string | null = null
          if (initial === undefined) {
            await send('334 VXNlcm5hbWU6')
            const userLine = await readLine()
            if (userLine === null) break
            user = decodeBase64(userLine.trim())
          } else {
            user = decodeBase64(initial)
          }
          await send('334 UGFzc3dvcmQ6')
          const passLine = await readLine()
          if (passLine === null) break
          auth = { user: user ?? '', pass: decodeBase64(passLine.trim()) }
          await send('235 2.7.0 Accepted')
        } else if (upper.startsWith('AUTH PLAIN')) {
          // `AUTH PLAIN <base64>` is what nodemailer sends; the bare form is
          // handled too because the server must not depend on the client's shape.
          const initial = line.trim().split(/\s+/)[2]
          let blob = initial
          if (blob === undefined) {
            await send('334 ')
            const blobLine = await readLine()
            if (blobLine === null) break
            blob = blobLine.trim()
          }
          const parts = decodeBase64(blob).split('\u0000')
          auth = { user: parts[1] ?? '', pass: parts[2] ?? '' }
          await send('235 2.7.0 Accepted')
        } else if (upper.startsWith('MAIL FROM')) {
          await send('250 OK')
        } else if (upper.startsWith('RCPT TO')) {
          await send(rcptReply)
        } else if (upper.startsWith('DATA')) {
          inData = true
          await send('354 End data with <CR><LF>.<CR><LF>')
        } else if (upper.startsWith('QUIT')) {
          await send('221 Bye')
          break
        } else {
          // RSET, NOOP, and anything else the client tries: accept it.
          await send('250 OK')
        }
      }
    } catch (err) {
      // A client that drops mid-command is ordinary teardown, not a protocol bug.
      if (
        !(err instanceof Deno.errors.BadResource) &&
        !(err instanceof Deno.errors.BrokenPipe) &&
        !(err instanceof Deno.errors.Interrupted) &&
        !(err instanceof Deno.errors.ConnectionReset)
      ) {
        throw err
      }
    } finally {
      sessions.push({ data: data ?? '', auth })
      try {
        conn.close()
      } catch {
        // Already gone.
      }
      notifyWaiters()
    }
  }

  async function acceptLoop(): Promise<void> {
    while (!closed) {
      let conn: Deno.Conn
      try {
        conn = await listener.accept()
      } catch {
        break // the listener was closed
      }
      live.add(conn)
      void handleSession(conn)
        .catch((err: unknown) => {
          failures.push(err)
        })
        .finally(() => {
          live.delete(conn)
        })
    }
  }

  void acceptLoop()

  return {
    port,
    sessions,
    dataReply,
    rcptReply,
    async waitForSessions(count: number): Promise<void> {
      if (sessions.length < count) {
        await withDeadline(
          new Promise<void>(resolve => {
            waiters.push({ count, resolve })
          }),
          5_000,
          `the fake SMTP server waiting for ${count} finished connection(s)`,
        )
      }
      if (failures.length > 0) {
        throw new Error(`the fake SMTP server failed: ${String(failures[0])}`)
      }
    },
    async close(): Promise<void> {
      closed = true
      try {
        listener.close()
      } catch {
        // Already closed.
      }
      for (const conn of live) {
        try {
          conn.close()
        } catch {
          // Already gone.
        }
      }
      live.clear()
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The transport spy — the only way to SEE `createTransport`, `sendMail(options)`
// and `close()` without touching `smtpDeno.ts`.
// ─────────────────────────────────────────────────────────────────────────────

interface SpiedTransport {
  sendMail(message: Record<string, unknown>): Promise<{ response?: unknown }>
  close(): void
}

interface SpiedMailer {
  createTransport(options: unknown): SpiedTransport
}

interface TransportSpy {
  /** Every options object the adapter handed `createTransport`. */
  readonly transportOptions: unknown[]
  /** Every message object the adapter handed `sendMail`. */
  readonly sendMailOptions: Array<Record<string, unknown>>
  /** How many times the adapter called `close()`. */
  readonly closeCalls: number
  /** Put the real `createTransport` back. */
  restore(): void
}

/**
 * Wrap the real `nodemailer.createTransport`. Deno returns the SAME cached
 * module instance to this file and to `smtpDeno.ts`, and the adapter reads
 * `mailer.createTransport` at call time, so the wrapper is what the adapter
 * calls. The wrapper delegates to the real implementation and only records, so
 * everything below the seam is still real nodemailer over a real socket.
 */
function spyOnTransport(): TransportSpy {
  const mailer = nodemailer as unknown as SpiedMailer
  const real = mailer.createTransport
  const transportOptions: unknown[] = []
  const sendMailOptions: Array<Record<string, unknown>> = []
  let closeCalls = 0

  mailer.createTransport = (options: unknown): SpiedTransport => {
    transportOptions.push(options)
    const transport = real.call(mailer, options)
    const realSendMail = transport.sendMail.bind(transport)
    const realClose = transport.close.bind(transport)

    transport.sendMail = (message: Record<string, unknown>) => {
      sendMailOptions.push(message)
      return realSendMail(message)
    }
    transport.close = () => {
      // Count only a close that COMPLETED: `sendEmailViaSmtp` swallows a close
      // failure by design, so a throwing `close()` is otherwise invisible.
      realClose()
      closeCalls += 1
    }

    return transport
  }

  return {
    transportOptions,
    sendMailOptions,
    get closeCalls(): number {
      return closeCalls
    },
    restore(): void {
      mailer.createTransport = real
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The tests.
// ─────────────────────────────────────────────────────────────────────────────

/** A distinctive message: every field is asserted off the wire below. */
function testMessage(): EmailMessage {
  return {
    to: 'parent@example.test',
    subject: 'Playdate wiring proof',
    html: '<p>See you at ten by the big slide.</p>',
    text: 'See you at ten by the big slide.',
  }
}

function testConfig(port: number): SmtpConfig {
  return {
    host: '127.0.0.1',
    port,
    secure: false,
    user: 'u',
    pass: 'p',
    from: 'drop@test.local',
  }
}

// 1. THE HAPPY PATH — the wiring proof. nodemailer connects to a real socket,
//    authenticates, and the bytes that arrive are the bytes the adapter mapped.
Deno.test('happy path: the real adapter delivers through a real SMTP conversation', async () => {
  const server = await startFakeSmtp()
  try {
    const config = testConfig(server.port)

    // `connect()` itself: builds the transport and hands back a client. No
    // socket is opened until `send()`, so this client is closed unused.
    const client = await smtpDeps.connect(config)
    assertStrictEquals(typeof client.send, 'function')
    assertStrictEquals(typeof client.close, 'function')
    client.close?.()

    const msg = testMessage()
    const result = await withDeadline(sendEmailViaSmtp(smtpDeps, msg, config), 15_000, 'the happy-path send')

    // `ok: true` AND the status the server actually replied with.
    assertEquals(result.ok, true)
    assertEquals(assertOk(result).status, 250)

    await server.waitForSessions(1)
    const session = server.sessions[0]
    assertExists(session, 'the fake server recorded no session — nothing connected')

    // THE WIRING PROOF: the message the server received carries the fields the
    // adapter was handed. A missed mapping (a dropped `to`, a renamed `subject`,
    // a body sent as the wrong part) fails here and nowhere else.
    assert(
      session.data !== '',
      'the fake server accepted a connection but received no DATA payload',
    )
    assertStringIncludes(session.data, msg.subject)
    assertStringIncludes(session.data, msg.text)
    assertStringIncludes(session.data, msg.to)
    // And the credentials from the config — not blanks, not swapped.
    assertEquals(session.auth, { user: 'u', pass: 'p' })
  } finally {
    await server.close()
  }
})

// 2. ADDRESS REJECTION — the case the whole retry design turns on. A 550 to
//    RCPT TO must resolve (never throw) as a PERMANENT failure so the drain
//    retires the row instead of burning the send budget on it forever.
Deno.test('address rejection: 550 to RCPT TO resolves as permanent, not retryable', async () => {
  const server = await startFakeSmtp({ rcptCode: 550 })
  try {
    const result = await withDeadline(
      sendEmailViaSmtp(smtpDeps, testMessage(), testConfig(server.port)),
      15_000,
      'the 550 rejection',
    )

    const failed = assertFailed(result)
    assertFalse(failed.retryable, 'a 550 address rejection MUST NOT be retryable')
    // The code comes off nodemailer's `responseCode`; the test records which
    // shape it is rather than forcing it to a value the client is free to pick.
    const status = failed.status
    assert(
      status === 550 || status === null,
      `expected status 550 (nodemailer responseCode) or null, got ${String(status)}`,
    )
    console.log(`    [evidence] 550 RCPT TO -> status=${String(status)} retryable=${String(failed.retryable)}`)
    // The server's own words survive into `error` — that text is the only
    // record a human gets when the row is retired.
    assertStringIncludes(failed.error, '550')

    await server.waitForSessions(1)
    // Nothing was accepted, so no DATA payload was ever transmitted.
    assertStrictEquals(server.sessions[0].data, '')
  } finally {
    await server.close()
  }
})

// 3. TRANSIENT FAILURE — a 4xx to RCPT TO is the opposite verdict: come back
//    later. (SMTP inverts the HTTP convention; this is that inversion, live.)
Deno.test('transient failure: 451 to RCPT TO resolves as retryable', async () => {
  const server = await startFakeSmtp({ rcptCode: 451 })
  try {
    const result = await withDeadline(
      sendEmailViaSmtp(smtpDeps, testMessage(), testConfig(server.port)),
      15_000,
      'the 451 rejection',
    )

    const failed = assertFailed(result)
    assert(failed.retryable, 'a 451 transient failure MUST be retryable')
    assertEquals(failed.status, 451)

    await server.waitForSessions(1)
    assertStrictEquals(server.sessions[0].data, '')
  } finally {
    await server.close()
  }
})

// 4. CONNECTION FAILURE — no SMTP reply at all. Nothing was rejected, so this
//    must be retryable, and it must resolve rather than throw: one escaping
//    rejection would abort the whole drain.
Deno.test('connection failure: a refused port resolves as retryable with no status', async () => {
  // Bind a listener to have the OS pick a port, note it, then release it: the
  // port is very likely still closed, and nothing else can be listening on it.
  const probe = Deno.listen({ hostname: '127.0.0.1', port: 0 })
  const { port } = probe.addr as Deno.NetAddr
  probe.close()

  const result = await withDeadline(
    sendEmailViaSmtp(smtpDeps, testMessage(), testConfig(port)),
    15_000,
    'the refused connection',
  )

  const failed = assertFailed(result)
  assertStrictEquals(failed.status, null, 'a refused connection carries no SMTP reply code')
  assert(failed.retryable, 'a connection failure MUST be retryable — nothing was rejected')
  assert(failed.error.length > 0, 'the failure must record a reason')
})

// 5. REPLY-CODE PARSING — the status must come off the server's own reply line
//    through `smtpStatusFromResponse`, not from `sendEmailViaSmtp`'s 250
//    fallback. 250 alone cannot tell those apart, so this asserts BOTH: the
//    happy path's reply really was the 250 line, and a server whose completion
//    reply is a DIFFERENT 2xx (251) yields 251 — a value the fallback can never
//    produce.
Deno.test('reply-code parsing: the status is read off the server reply, not defaulted', async () => {
  const server = await startFakeSmtp()
  try {
    assertStrictEquals(server.dataReply, '250 2.0.0 OK: queued as ABC123')
    const result = await withDeadline(
      sendEmailViaSmtp(smtpDeps, testMessage(), testConfig(server.port)),
      15_000,
      'the happy-path send',
    )
    await server.waitForSessions(1)
    assertEquals(assertOk(result).status, 250)
    assertStrictEquals(server.sessions[0].data === '', false, 'no message reached the server')
  } finally {
    await server.close()
  }

  // The distinguishing half: a 2xx completion reply that is NOT the 250 default.
  const odd = await startFakeSmtp({ dataReply: '251 2.1.5 OK: queued as ABC123' })
  try {
    const result = await withDeadline(
      sendEmailViaSmtp(smtpDeps, testMessage(), testConfig(odd.port)),
      15_000,
      'the 251-completion send',
    )
    assertEquals(assertOk(result).status, 251)
    await odd.waitForSessions(1)
  } finally {
    await odd.close()
  }
})

// 6. THE TRANSPORT CALL ITSELF — `createTransport`, `sendMail`, `close()`.
//    A non-pooled nodemailer transport tears the socket down itself right after
//    each send, and `sendEmailViaSmtp` deliberately SWALLOWS a close failure, so
//    `close()` has no wire-level witness. This test wraps the real
//    `createTransport` (the same cached module instance the adapter imported, so
//    the adapter calls the wrapper) and records the three things the adapter
//    hands nodemailer: the transport options, the mail options, and the close.
Deno.test('transport wiring: createTransport options, the mail mapping, and close()', async () => {
  const server = await startFakeSmtp()
  const spy = spyOnTransport()
  try {
    const config: SmtpConfig = {
      ...testConfig(server.port),
      replyTo: 'reply@test.local',
    }
    const msg: EmailMessage = {
      ...testMessage(),
      listUnsubscribe: '<mailto:unsubscribe@test.local>',
    }

    const result = await withDeadline(
      sendEmailViaSmtp(smtpDeps, msg, config),
      15_000,
      'the observed-transport send',
    )
    assertEquals(assertOk(result).status, 250)

    // (a) `createTransport` — host/port/secure/auth exactly as the config says.
    assertEquals(spy.transportOptions, [
      {
        host: '127.0.0.1',
        port: server.port,
        secure: false,
        auth: { user: 'u', pass: 'p' },
      },
    ])

    // (b) `sendMail` — the field mapping, including the two optional fields the
    //     adapter only forwards when they are non-blank.
    assertEquals(spy.sendMailOptions.length, 1)
    const options = spy.sendMailOptions[0]
    assertEquals(options.from, 'drop@test.local')
    assertEquals(options.to, msg.to)
    assertEquals(options.subject, msg.subject)
    assertEquals(options.html, msg.html)
    assertEquals(options.text, msg.text)
    assertEquals(options.replyTo, 'reply@test.local')
    assertEquals(options.headers, { 'List-Unsubscribe': '<mailto:unsubscribe@test.local>' })

    // (c) `close()` — reached, exactly once, and without throwing.
    assertEquals(spy.closeCalls, 1)

    // ...and the same optional fields are visible in what actually went on the
    // wire, so (b) is not the only witness of the header mapping.
    await server.waitForSessions(1)
    const session = server.sessions[0]
    assertStringIncludes(session.data, 'List-Unsubscribe')
    assertStringIncludes(session.data, 'reply@test.local')
  } finally {
    spy.restore()
    await server.close()
  }
})
