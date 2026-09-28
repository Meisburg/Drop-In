import { describe, expect, it } from 'vitest'
import { isHumanMessage, rawErrorMessage, settingsErrorMessage } from './settingsError'

describe('rawErrorMessage', () => {
  it('prefers an Error message', () => {
    expect(rawErrorMessage(new Error('boom'))).toBe('boom')
  })

  it('falls back through message, details, code on a plain object', () => {
    expect(rawErrorMessage({ message: 'm', details: 'd', code: 'c' })).toBe('m')
    expect(rawErrorMessage({ details: 'd', code: 'c' })).toBe('d')
    expect(rawErrorMessage({ code: 'PGRST205' })).toBe('PGRST205')
  })

  it('reads a bare string and trims it', () => {
    expect(rawErrorMessage('  nope  ')).toBe('nope')
  })

  it('returns null for empty or unknown values', () => {
    expect(rawErrorMessage(new Error(''))).toBeNull()
    expect(rawErrorMessage(null)).toBeNull()
    expect(rawErrorMessage(undefined)).toBeNull()
    expect(rawErrorMessage(42)).toBeNull()
    expect(rawErrorMessage({})).toBeNull()
  })
})

describe('isHumanMessage', () => {
  it('accepts an ordinary sentence', () => {
    expect(isHumanMessage('Choose a ZIP within Seattle.')).toBe(true)
  })

  it('rejects driver and database noise', () => {
    expect(isHumanMessage('PGRST205')).toBe(false)
    expect(isHumanMessage('relation "blocks" does not exist')).toBe(false)
    expect(isHumanMessage('duplicate key value violates unique constraint')).toBe(false)
    expect(isHumanMessage('permission denied for table profiles')).toBe(false)
    expect(isHumanMessage('new row violates row-level security policy')).toBe(false)
    expect(isHumanMessage('TypeError: failed to fetch')).toBe(false)
    expect(isHumanMessage('MISSING_TABLE')).toBe(false)
  })

  it('rejects null and empty', () => {
    expect(isHumanMessage(null)).toBe(false)
    expect(isHumanMessage('   ')).toBe(false)
  })
})

describe('settingsErrorMessage', () => {
  const FALLBACK = "Couldn't load your settings."

  it('returns the fallback for a developer message', () => {
    expect(settingsErrorMessage(new Error('PGRST205'), FALLBACK)).toBe(FALLBACK)
    expect(
      settingsErrorMessage({ message: 'relation "blocks" does not exist' }, FALLBACK),
    ).toBe(FALLBACK)
  })

  it('returns the fallback for a non-error', () => {
    expect(settingsErrorMessage(null, FALLBACK)).toBe(FALLBACK)
    expect(settingsErrorMessage({}, FALLBACK)).toBe(FALLBACK)
  })

  it('passes a genuinely human message through', () => {
    expect(settingsErrorMessage(new Error('That ZIP is not in Seattle.'), FALLBACK)).toBe(
      'That ZIP is not in Seattle.',
    )
  })
})
