/**
 * The email fallback decision — the pure rules in
 * supabase/functions/_shared/emailFallback.ts, imported through the app seam.
 *
 * The one rule that is NOT a formality is `optout === undefined`: it must SEND.
 * `profiles.email_optout` is an OPT-OUT column, so an unreadable value (a
 * pre-0053 project, or one failed read) must never be read as "this parent
 * asked us to stop" — that would be a silent unsubscribe for everybody at once,
 * on the exact deployment this slice exists to keep delivering to. Test 5 names
 * that reasoning so a well-meaning "simplify to Boolean(facts.optout)" refactor
 * fails loudly.
 *
 * The decision ORDER is asserted too (tests 6–7), because each neighbouring pair
 * has a real case: "not configured" beats everything, and a missing address beats
 * the opt-out flag.
 */
import { describe, expect, it } from 'vitest'
import {
  classifySendResult,
  decideEmailFallback,
  type EmailFallbackFacts,
} from './emailFallback'

/** Every fact spelled out, so no test depends on a default that could drift. */
function facts(overrides: Partial<EmailFallbackFacts> = {}): EmailFallbackFacts {
  return { emailEnabled: true, optout: false, email: 'parent@example.test', ...overrides }
}

describe('decideEmailFallback', () => {
  it('rule (a): emailEnabled false -> skip-unconfigured (there is no transport to call)', () => {
    expect(decideEmailFallback(facts({ emailEnabled: false })).action).toBe('skip-unconfigured')
    // …and it says so even when a perfectly good address is on file: without a
    // configured sender the address is unusable, and the honest reason is the
    // deployment, not the parent.
    expect(
      decideEmailFallback(facts({ emailEnabled: false, email: 'parent@example.test' })).action,
    ).toBe('skip-unconfigured')
  })

  it('rule (b): a null, undefined, empty or whitespace-only address each -> skip-no-address', () => {
    for (const email of [null, undefined, '', '   ', '\t\n'] as const) {
      expect(decideEmailFallback(facts({ email })).action, `email=${JSON.stringify(email)}`).toBe(
        'skip-no-address',
      )
    }
  })

  it('rule (c): optout true -> skip-optout — only an explicit true stops delivery', () => {
    expect(decideEmailFallback(facts({ optout: true })).action).toBe('skip-optout')
  })

  it('rule (d): optout false -> send-email — the column default means email is allowed', () => {
    expect(decideEmailFallback(facts({ optout: false })).action).toBe('send-email')
  })

  it('rule (d), the load-bearing case: optout UNDEFINED -> send-email, because an unreadable opt-out column is NOT consent to unsubscribe a parent', () => {
    // `undefined` is not a value the database can produce (the column is NOT
    // NULL); it only ever means "the read did not come back" — a pre-0053
    // project (42703) or a failed read. Reading that as an opt-out would silently
    // unsubscribe every parent at once. An opt-out column means "stop only on an
    // explicit true", so unknown falls through to SEND.
    expect(decideEmailFallback(facts({ optout: undefined })).action).toBe('send-email')
    // The danger pinned directly: an unknown read is never the opt-out state.
    expect(decideEmailFallback(facts({ optout: undefined })).action).not.toBe('skip-optout')
  })

  it('precedence: !emailEnabled beats everything — a valid address AND optout false still skips', () => {
    expect(
      decideEmailFallback({
        emailEnabled: false,
        optout: false,
        email: 'parent@example.test',
      }).action,
    ).toBe('skip-unconfigured')
    // …and it beats the opt-out flag too, which is a stronger statement: the
    // configuration is reported, not the preference.
    expect(
      decideEmailFallback({ emailEnabled: false, optout: true, email: 'parent@example.test' })
        .action,
    ).toBe('skip-unconfigured')
  })

  it('precedence: a missing address beats optout true — there is nowhere to send regardless', () => {
    expect(decideEmailFallback({ emailEnabled: true, optout: true, email: null }).action).toBe(
      'skip-no-address',
    )
    expect(decideEmailFallback({ emailEnabled: true, optout: true, email: '  ' }).action).toBe(
      'skip-no-address',
    )
  })

  it('every decision carries a non-empty reason string — it is what the queue row records', () => {
    const cases: EmailFallbackFacts[] = [
      facts({ emailEnabled: false }),
      facts({ email: null }),
      facts({ email: undefined }),
      facts({ email: '' }),
      facts({ email: '   ' }),
      facts({ optout: true }),
      facts({ optout: false }),
      facts({ optout: undefined }),
    ]
    for (const f of cases) {
      const decision = decideEmailFallback(f)
      expect(typeof decision.reason, JSON.stringify(f)).toBe('string')
      expect(decision.reason.trim().length, JSON.stringify(f)).toBeGreaterThan(0)
    }
  })

  it('is a pure function: it never mutates the facts it is given', () => {
    const input = facts({ optout: undefined })
    decideEmailFallback(input)
    expect(input).toEqual({ emailEnabled: true, optout: undefined, email: 'parent@example.test' })
  })
})

describe('classifySendResult', () => {
  it('ok true -> sent (the row is stamped and counted)', () => {
    expect(classifySendResult({ ok: true })).toBe('sent')
  })

  it('not ok with retryable true -> retry (leave sent_at null so the next tick retries)', () => {
    expect(classifySendResult({ ok: false, retryable: true })).toBe('retry')
  })

  it('not ok with retryable false -> terminal (stamp it: the same request fails forever)', () => {
    expect(classifySendResult({ ok: false, retryable: false })).toBe('terminal')
  })

  it('not ok with retryable absent -> terminal, the conservative reading (never orphan a row)', () => {
    expect(classifySendResult({ ok: false })).toBe('terminal')
  })

  it('ok true wins even if a stale retryable flag is set', () => {
    expect(classifySendResult({ ok: true, retryable: false })).toBe('sent')
  })
})
