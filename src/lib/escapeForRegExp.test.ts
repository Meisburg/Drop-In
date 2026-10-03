import { describe, expect, it } from 'vitest'
import { escapeForRegExp } from './escapeForRegExp.mjs'

/**
 * The escape's ONE job: a value put into a RegExp must match itself as data and
 * nothing else. Slice 5 single-sourced it, slice 6c collapsed the remaining
 * copies (two e2e specs, two `.mjs` guards) onto `escapeForRegExp.mjs`; the
 * cases below pin the behaviour that all five copies shared before the merge.
 */
describe('escapeForRegExp', () => {
  it('escapes every metacharacter in the class and leaves everything else alone', () => {
    // The whole class, byte for byte: a dropped or added member would change
    // which strings a caller's pin matches.
    expect(escapeForRegExp('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\')
    expect(escapeForRegExp('Playground time, Green Lake')).toBe('Playground time, Green Lake')
    expect(escapeForRegExp('')).toBe('')
  })

  it('round-trips a hostile value: the escaped pattern matches the value as data', () => {
    const hostile = [
      'Green Lake (north lot)',
      'a.b',
      'a*b',
      'a+b',
      'a?b',
      '^start',
      'end$',
      'a{2}b',
      'a(b',
      'a)b',
      'a|b',
      'a[b',
      'a]b',
      'back\\slash',
      '.*+?^${}()|[]\\',
    ]
    for (const value of hostile) {
      expect(new RegExp(escapeForRegExp(value)).test(value)).toBe(true)
    }
  })

  it('stops a metacharacter in the data from over-matching — the reason it exists', () => {
    // `a.b` as a PATTERN matches `axb`; as DATA it must only match `a.b`.
    expect(new RegExp('a.b').test('axb')).toBe(true)
    expect(new RegExp(escapeForRegExp('a.b')).test('axb')).toBe(false)
    expect(new RegExp(escapeForRegExp('a.b')).test('a.b')).toBe(true)
  })
})
