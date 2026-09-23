import { describe, expect, it } from 'vitest'
import {
  PLACE_COMMENT_MAX_LENGTH,
  placeCommentCountLabel,
  sortPlaceComments,
  validatePlaceComment,
} from './placeComments'

/**
 * V23 slice 5 — the place comment wall's pure rules.
 *
 * The bound test is the important one: 500 is ALSO enforced by migration 0050's
 * CHECK, and if these two drift the parent gets a raw Postgres error instead of
 * the sentence `validatePlaceComment` returns. So the number is pinned here as
 * well as exercised through the validator.
 */
describe('PLACE_COMMENT_MAX_LENGTH', () => {
  it('is 500 — the same bound migration 0050 enforces in the DB CHECK', () => {
    expect(PLACE_COMMENT_MAX_LENGTH).toBe(500)
  })
})

describe('validatePlaceComment', () => {
  it('accepts an ordinary comment', () => {
    expect(validatePlaceComment('The splash pad is great in summer.')).toBeNull()
  })

  it('accepts exactly the cap (the boundary the DB allows)', () => {
    expect(validatePlaceComment('x'.repeat(PLACE_COMMENT_MAX_LENGTH))).toBeNull()
  })

  it('rejects one character past the cap', () => {
    expect(validatePlaceComment('x'.repeat(PLACE_COMMENT_MAX_LENGTH + 1))).toBe(
      `Keep it to ${PLACE_COMMENT_MAX_LENGTH} characters.`,
    )
  })

  it('measures the TRIMMED length, so padding around a legal body passes', () => {
    const padded = `   ${'x'.repeat(PLACE_COMMENT_MAX_LENGTH)}   `
    expect(validatePlaceComment(padded)).toBeNull()
  })

  it('rejects empty and whitespace-only bodies with the same sentence', () => {
    expect(validatePlaceComment('')).toBe('Write something first — it cannot be empty.')
    expect(validatePlaceComment('   \n\t ')).toBe(
      'Write something first — it cannot be empty.',
    )
  })
})

describe('placeCommentCountLabel', () => {
  it('invites the first word and names the place', () => {
    expect(placeCommentCountLabel(0, 'Green Lake Park')).toBe(
      'Be the first to say something about Green Lake Park.',
    )
  })

  it('counts one parent in the singular', () => {
    expect(placeCommentCountLabel(1, 'Green Lake Park')).toBe(
      '1 parent has said something here.',
    )
  })

  it('counts many in the plural', () => {
    expect(placeCommentCountLabel(4, 'Green Lake Park')).toBe(
      '4 parents have said something here.',
    )
  })

  it('never renders a trailing space when the place has no name', () => {
    expect(placeCommentCountLabel(0, '   ')).toBe('Be the first to say something here.')
    expect(placeCommentCountLabel(0, '   ')).not.toMatch(/\s\.$/)
  })

  it('treats a negative count as empty rather than rendering "-1 parents"', () => {
    expect(placeCommentCountLabel(-3, 'Baker Park')).toBe(
      'Be the first to say something about Baker Park.',
    )
  })
})

describe('sortPlaceComments', () => {
  const a = { id: 'a', created_at: '2026-09-01T10:00:00.000Z' }
  const b = { id: 'b', created_at: '2026-09-03T10:00:00.000Z' }
  const c = { id: 'c', created_at: '2026-09-02T10:00:00.000Z' }

  it('orders newest first', () => {
    expect(sortPlaceComments([a, b, c]).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('does not mutate its input', () => {
    const input = [a, b, c]
    sortPlaceComments(input)
    expect(input.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps the incoming order for identical timestamps (stable)', () => {
    const t = '2026-09-01T10:00:00.000Z'
    const first = { id: 'first', created_at: t }
    const second = { id: 'second', created_at: t }
    expect(sortPlaceComments([first, second]).map((r) => r.id)).toEqual([
      'first',
      'second',
    ])
  })

  it('handles the empty wall', () => {
    expect(sortPlaceComments([])).toEqual([])
  })
})
