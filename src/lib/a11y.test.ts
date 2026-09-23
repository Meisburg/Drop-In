import { describe, expect, it } from 'vitest'
import { errorId, fieldA11y } from './a11y'

describe('errorId', () => {
  it('returns the stable id for a field', () => {
    expect(errorId('zip')).toBe('err-zip')
  })

  it('returns distinct ids for distinct fields', () => {
    expect(errorId('name')).not.toBe(errorId('reason'))
  })
})

describe('fieldA11y', () => {
  it('marks the control valid with no describedby when there is no message', () => {
    expect(fieldA11y('zip', null)).toEqual({
      'aria-invalid': false,
      'aria-describedby': undefined,
    })
  })

  it('marks the control invalid and points at the error node when there is a message', () => {
    expect(fieldA11y('zip', 'Enter a 5-digit zip.')).toEqual({
      'aria-invalid': true,
      'aria-describedby': 'err-zip',
    })
  })

  it('uses the same id as errorId for the describedby target', () => {
    const props = fieldA11y('reason', 'Tell us what happened.')
    expect(props['aria-describedby']).toBe(errorId('reason'))
  })
})