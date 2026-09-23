import { describe, expect, it } from 'vitest'
import {
  addressFieldError,
  composeDisplayName,
  DISPLAY_NAME_MAX_LENGTH,
  displayNameFieldError,
} from './account'

/**
 * V20 t06 — the signup form's two name fields and its address.
 *
 * The rule being pinned: the public handle is COMPOSED from first + last name,
 * and the composition is the only thing both surfaces have to agree on. The
 * handle's availability is never decided here (the DB owns that via
 * `profiles_display_name_key`), so nothing in this file asserts about it.
 */

describe('composeDisplayName (first + last name -> the public handle)', () => {
  it('joins the two names with a single space', () => {
    expect(composeDisplayName('Sam', 'Rivera')).toBe('Sam Rivera')
  })

  it('trims each half', () => {
    expect(composeDisplayName('  Sam  ', '  Rivera  ')).toBe('Sam Rivera')
  })

  it('collapses internal whitespace runs', () => {
    expect(composeDisplayName('Mary  Jo', 'van   der Berg')).toBe('Mary Jo van der Berg')
  })

  it('accepts a first name alone (the last name is optional, not required)', () => {
    expect(composeDisplayName('Sam', '')).toBe('Sam')
  })

  it('accepts a last name alone', () => {
    expect(composeDisplayName('', 'Rivera')).toBe('Rivera')
  })

  it('is empty when both are empty or whitespace', () => {
    expect(composeDisplayName('', '')).toBe('')
    expect(composeDisplayName('   ', '\t')).toBe('')
  })

  it('caps the COMPOSED handle at the column\'s 40 characters', () => {
    const first = 'A'.repeat(30)
    const last = 'B'.repeat(30)
    const composed = composeDisplayName(first, last)
    expect(composed).toHaveLength(DISPLAY_NAME_MAX_LENGTH)
    // The cut keeps the first name whole, which is the readable failure: the
    // parent's own name survives and the surname is what gets clipped.
    expect(composed.startsWith(first)).toBe(true)
  })

  it('does not invent anything — no initial, no @ prefix, no separator', () => {
    expect(composeDisplayName('Sam', 'Rivera')).not.toContain('@')
    expect(composeDisplayName('Sam', '')).toBe('Sam')
  })
})

describe('displayNameFieldError', () => {
  it('is null when at least one name is given', () => {
    expect(displayNameFieldError('Sam', 'Rivera')).toBeNull()
    expect(displayNameFieldError('Sam', '')).toBeNull()
    expect(displayNameFieldError('', 'Rivera')).toBeNull()
  })

  it('asks for a name when both fields are empty', () => {
    expect(displayNameFieldError('', '')).toMatch(/name/i)
    expect(displayNameFieldError('  ', ' ')).toMatch(/name/i)
  })
})

describe('addressFieldError', () => {
  it('is null for a non-empty address', () => {
    expect(addressFieldError('7200 4th Ave NE, Seattle, WA 98115')).toBeNull()
  })

  it('requires the address (it is what sets the home zip automatically)', () => {
    expect(addressFieldError('')).toMatch(/address/i)
    expect(addressFieldError('   ')).toMatch(/address/i)
  })

  it('does NOT judge whether the address resolves — that is the geocoder\'s answer, not a pure one', () => {
    // "asdfasdf" would fail a geocode, but nothing here may claim to know that;
    // the page asks Nominatim AFTER the account exists and routes a failure to
    // /onboarding's zip step with its own message.
    expect(addressFieldError('asdfasdf')).toBeNull()
  })
})
