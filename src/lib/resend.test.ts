/**
 * The Resend transport's spec.
 *
 * NO real network and NO global `fetch`: each test builds its own fake, hands it
 * to `sendEmail` through `ResendDeps`, and asserts on what the fake was asked to
 * do. The fake also serves as the "was fetch called at all?" probe for the
 * pre-flight (misconfiguration) cases — a short-circuit that still made a
 * request would be a bug the result shape alone cannot reveal.
 */
import { describe, expect, it } from 'vitest'

import {
  RESEND_ENDPOINT,
  sendEmail,
  type EmailMessage,
  type ResendConfig,
  type ResendDeps,
} from './resend'

const CONFIG: ResendConfig = {
  apiKey: 're_test_key_123',
  from: 'Drop In <hello@dropin.test>',
}

const MESSAGE: EmailMessage = {
  to: 'parent@example.test',
  subject: 'Drop In: Saturday at the park',
  html: '<p>Saturday at the park</p>',
  text: 'Saturday at the park',
}

interface RecordedCall {
  url: string
  init: RequestInit
}

interface RecordingFetch {
  deps: ResendDeps
  calls: RecordedCall[]
}

/** A minimal `Response` stand-in — no globals, and `text()` is what the module reads. */
function fakeResponse(status: number, body = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response
}

/** A response whose body cannot be read — the "unreadable body" failure mode. */
function unreadableResponse(status: number): Response {
  return {
    ok: false,
    status,
    text: async () => {
      throw new Error('stream already consumed')
    },
  } as unknown as Response
}

/** Build a fake transport that records every call and answers from `respond`. */
function recordingFetch(respond: (call: RecordedCall) => Promise<Response>): RecordingFetch {
  const calls: RecordedCall[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const call: RecordedCall = { url: String(input), init: init ?? {} }
    calls.push(call)
    return respond(call)
  }) as typeof fetch
  return { deps: { fetch: fetchImpl }, calls }
}

/** A fake that always answers with one status/body. */
function respondingWith(status: number, body = ''): RecordingFetch {
  return recordingFetch(async () => fakeResponse(status, body))
}

function bodyOf(call: RecordedCall): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>
}

function headersOf(call: RecordedCall): Record<string, string> {
  return (call.init.headers ?? {}) as Record<string, string>
}

describe('sendEmail — success', () => {
  it('resolves ok on 200', async () => {
    const transport = respondingWith(200, '{"id":"abc"}')

    const result = await sendEmail(transport.deps, MESSAGE, CONFIG)

    expect(result).toEqual({ ok: true, status: 200 })
  })

  it('resolves ok on 201', async () => {
    const transport = respondingWith(201)

    const result = await sendEmail(transport.deps, MESSAGE, CONFIG)

    expect(result).toEqual({ ok: true, status: 201 })
  })
})

describe('sendEmail — retryability', () => {
  it('marks 422 terminal (no retry) and does not throw', async () => {
    const transport = respondingWith(422, '{"message":"invalid to address"}')

    const result = await sendEmail(transport.deps, MESSAGE, CONFIG)

    expect(result).toMatchObject({ ok: false, status: 422, retryable: false })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('invalid to address')
  })

  it('marks 500 retryable', async () => {
    const transport = respondingWith(500, 'upstream exploded')

    const result = await sendEmail(transport.deps, MESSAGE, CONFIG)

    expect(result).toMatchObject({ ok: false, status: 500, retryable: true })
  })

  it('marks 503 retryable', async () => {
    const transport = respondingWith(503)

    const result = await sendEmail(transport.deps, MESSAGE, CONFIG)

    expect(result).toMatchObject({ ok: false, status: 503, retryable: true })
  })

  it('marks 429 retryable', async () => {
    const transport = respondingWith(429, '{"message":"rate limit exceeded"}')

    const result = await sendEmail(transport.deps, MESSAGE, CONFIG)

    expect(result).toMatchObject({ ok: false, status: 429, retryable: true })
  })

  it('marks 400 terminal (no retry)', async () => {
    const transport = respondingWith(400, '{"message":"missing from"}')

    const result = await sendEmail(transport.deps, MESSAGE, CONFIG)

    expect(result).toMatchObject({ ok: false, status: 400, retryable: false })
  })

  it('marks a rejected fetch retryable with status null and does not throw', async () => {
    const transport = recordingFetch(async () => {
      throw new TypeError('fetch failed: network down')
    })

    const result = await sendEmail(transport.deps, MESSAGE, CONFIG)

    expect(result).toMatchObject({ ok: false, status: null, retryable: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('network down')
  })
})

describe('sendEmail — never calls the network when misconfigured', () => {
  it('short-circuits a missing apiKey before any fetch', async () => {
    const transport = respondingWith(200)

    const result = await sendEmail(transport.deps, MESSAGE, { ...CONFIG, apiKey: '' })

    expect(result).toMatchObject({ ok: false, status: null, retryable: false })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.trim()).not.toBe('')
    expect(transport.calls).toHaveLength(0)
  })

  it('short-circuits a whitespace-only apiKey before any fetch', async () => {
    const transport = respondingWith(200)

    const result = await sendEmail(transport.deps, MESSAGE, { ...CONFIG, apiKey: '   \n\t ' })

    expect(result).toMatchObject({ ok: false, status: null, retryable: false })
    expect(transport.calls).toHaveLength(0)
  })

  it('short-circuits a missing from before any fetch', async () => {
    const transport = respondingWith(200)

    const result = await sendEmail(transport.deps, MESSAGE, { ...CONFIG, from: '' })

    expect(result).toMatchObject({ ok: false, status: null, retryable: false })
    expect(transport.calls).toHaveLength(0)
  })

  it('short-circuits a whitespace-only from before any fetch', async () => {
    const transport = respondingWith(201)

    const result = await sendEmail(transport.deps, MESSAGE, { ...CONFIG, from: '  ' })

    expect(result).toMatchObject({ ok: false, status: null, retryable: false })
    expect(transport.calls).toHaveLength(0)
  })
})

describe('sendEmail — the request it builds', () => {
  it('POSTs to the Resend endpoint', async () => {
    const transport = respondingWith(200)

    await sendEmail(transport.deps, MESSAGE, CONFIG)

    expect(transport.calls).toHaveLength(1)
    const [call] = transport.calls
    expect(call.url).toBe(RESEND_ENDPOINT)
    expect(call.init.method).toBe('POST')
  })

  it('sends the bearer Authorization header and a JSON content type', async () => {
    const transport = respondingWith(200)

    await sendEmail(transport.deps, MESSAGE, CONFIG)

    const [call] = transport.calls
    expect(headersOf(call)['Authorization']).toBe('Bearer re_test_key_123')
    expect(headersOf(call)['content-type']).toBe('application/json')
  })

  it('carries from, to, subject, html and text from the message', async () => {
    const transport = respondingWith(200)

    await sendEmail(transport.deps, MESSAGE, CONFIG)

    const body = bodyOf(transport.calls[0])
    expect(body).toEqual({
      from: CONFIG.from,
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      html: MESSAGE.html,
      text: MESSAGE.text,
    })
  })

  it('includes reply_to when configured and omits it when empty or whitespace', async () => {
    const withReplyTo = respondingWith(200)
    await sendEmail(withReplyTo.deps, MESSAGE, { ...CONFIG, replyTo: 'hey@dropin.test' })
    expect(bodyOf(withReplyTo.calls[0]).reply_to).toBe('hey@dropin.test')

    const empty = respondingWith(200)
    await sendEmail(empty.deps, MESSAGE, { ...CONFIG, replyTo: '' })
    expect('reply_to' in bodyOf(empty.calls[0])).toBe(false)

    const whitespace = respondingWith(200)
    await sendEmail(whitespace.deps, MESSAGE, { ...CONFIG, replyTo: '   ' })
    expect('reply_to' in bodyOf(whitespace.calls[0])).toBe(false)

    const absent = respondingWith(200)
    await sendEmail(absent.deps, MESSAGE, CONFIG)
    expect('reply_to' in bodyOf(absent.calls[0])).toBe(false)
  })

  it('sends the List-Unsubscribe header only when the message sets one', async () => {
    const unsubscribeUrl = 'https://dropin.test/settings'

    const withHeader = respondingWith(200)
    await sendEmail(withHeader.deps, { ...MESSAGE, listUnsubscribe: unsubscribeUrl }, CONFIG)
    expect(bodyOf(withHeader.calls[0]).headers).toEqual({ 'List-Unsubscribe': unsubscribeUrl })

    const blank = respondingWith(200)
    await sendEmail(blank.deps, { ...MESSAGE, listUnsubscribe: '   ' }, CONFIG)
    expect('headers' in bodyOf(blank.calls[0])).toBe(false)

    const absent = respondingWith(200)
    await sendEmail(absent.deps, MESSAGE, CONFIG)
    expect('headers' in bodyOf(absent.calls[0])).toBe(false)
  })

  it('still yields a non-empty error when the error body is empty or unreadable', async () => {
    const empty = respondingWith(500, '')
    const emptyResult = await sendEmail(empty.deps, MESSAGE, CONFIG)
    expect(emptyResult.ok).toBe(false)
    if (!emptyResult.ok) {
      expect(emptyResult.error.trim()).not.toBe('')
      expect(emptyResult.error).toContain('500')
    }

    const whitespace = respondingWith(502, '   \n ')
    const whitespaceResult = await sendEmail(whitespace.deps, MESSAGE, CONFIG)
    expect(whitespaceResult.ok).toBe(false)
    if (!whitespaceResult.ok) {
      expect(whitespaceResult.error.trim()).not.toBe('')
      expect(whitespaceResult.error).toContain('502')
    }

    const unreadable = recordingFetch(async () => unreadableResponse(503))
    const unreadableResult = await sendEmail(unreadable.deps, MESSAGE, CONFIG)
    expect(unreadableResult).toMatchObject({ ok: false, status: 503, retryable: true })
    expect(unreadableResult.ok).toBe(false)
    if (!unreadableResult.ok) {
      expect(unreadableResult.error.trim()).not.toBe('')
      expect(unreadableResult.error).toContain('503')
    }
  })

  it('trims the api key out of the Authorization header', async () => {
    const transport = respondingWith(200)

    await sendEmail(transport.deps, MESSAGE, { ...CONFIG, apiKey: '  re_padded_key  ' })

    expect(headersOf(transport.calls[0])).toEqual({
      Authorization: 'Bearer re_padded_key',
      'content-type': 'application/json',
    })
  })
})
