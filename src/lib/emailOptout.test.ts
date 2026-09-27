/**
 * The /settings email opt-out control — the pure decisions in
 * src/lib/emailOptout.ts (migration 0053).
 *
 * The one rule that is NOT a formality is (c), the undefined / failed-read
 * case: `profiles.email_optout` is an OPT-OUT column, so rendering a read that
 * did not come back as "email is off" would silently unsubscribe a parent who
 * never asked for it. It is asserted here explicitly — and by name — so a
 * well-meaning "simplify to Boolean(facts.optout)" refactor fails loudly.
 */
import { describe, expect, it } from 'vitest'
import {
  EMAIL_OPTOUT_LOADING_NOTE,
  EMAIL_OPTOUT_UNKNOWN_NOTE,
  decideEmailOptoutControl,
} from './emailOptout'

describe('decideEmailOptoutControl', () => {
  it('rule (a): optout === true renders checked FALSE — the parent asked us to stop', () => {
    expect(decideEmailOptoutControl({ optout: true, saving: false })).toEqual({
      checked: false,
      disabled: false,
      note: '',
    })
  })

  it('rule (b): optout === false renders checked TRUE — email is allowed (the default)', () => {
    expect(decideEmailOptoutControl({ optout: false, saving: false })).toEqual({
      checked: true,
      disabled: false,
      note: '',
    })
  })

  it('rule (c) — the FAILED READ / pre-0053 project: undefined renders the DEFAULT (checked) and says so', () => {
    // The load-bearing test in this file. `undefined` means the column read did
    // not come back (pre-0053 project: 42703; or a failed read), and it must
    // NEVER render as "email is off" — that is a silent unsubscribe.
    const control = decideEmailOptoutControl({ optout: undefined, saving: false })
    expect(control.checked).toBe(true)
    expect(control.note).toBe(EMAIL_OPTOUT_UNKNOWN_NOTE)
    expect(control.note).toContain('email is on')
    expect(control.note).toContain('default')
  })

  it('rule (c), the danger pinned directly: an unknown read is never the opt-out state', () => {
    expect(decideEmailOptoutControl({ optout: undefined, saving: false }).checked).not.toBe(false)
    // …while a failed read combined with a write in flight stays on too, and
    // only a stored `true` ever turns the control off.
    expect(decideEmailOptoutControl({ optout: undefined, saving: true }).checked).not.toBe(false)
    expect(decideEmailOptoutControl({ optout: true, saving: false }).checked).toBe(false)
  })

  it('rule (d): saving === true disables the control, whatever the value', () => {
    for (const optout of [true, false, undefined]) {
      const control = decideEmailOptoutControl({ optout, saving: true })
      expect(control.disabled).toBe(true)
    }
  })

  it('rule (d) keeps the value visible while saving, so the control does not appear to flip', () => {
    expect(decideEmailOptoutControl({ optout: true, saving: true })).toEqual({
      checked: false,
      disabled: true,
      note: '',
    })
    expect(decideEmailOptoutControl({ optout: false, saving: true }).checked).toBe(true)
  })

  it('only says something when there is something to say — a known value has an empty note', () => {
    expect(decideEmailOptoutControl({ optout: true, saving: false }).note).toBe('')
    expect(decideEmailOptoutControl({ optout: false, saving: false }).note).toBe('')
    expect(decideEmailOptoutControl({ optout: true, saving: true }).note).toBe('')
  })

  it('loading is not the failed-read note: the first read is simply not done yet', () => {
    const control = decideEmailOptoutControl({ optout: undefined, saving: false, loading: true })
    expect(control).toEqual({ checked: true, disabled: true, note: EMAIL_OPTOUT_LOADING_NOTE })
    expect(control.note).not.toBe(EMAIL_OPTOUT_UNKNOWN_NOTE)
  })

  it('is a pure function: it never mutates the facts it is given', () => {
    const facts = { optout: true, saving: false }
    decideEmailOptoutControl(facts)
    expect(facts).toEqual({ optout: true, saving: false })
  })
})
