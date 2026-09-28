import { describe, expect, it } from 'vitest'
import {
  authorInitialLine,
  dropInProofLine,
  dropInProofsFromRows,
  relativePastLabel,
  reviewQuoteLine,
} from './placeSocial'

describe('authorInitialLine', () => {
  it('reduces to first name + last initial, and never invents either', () => {
    expect(authorInitialLine('Sam Rivera')).toBe('Sam R.')
    expect(authorInitialLine('Mary Jo van der Berg')).toBe('Mary B.')
    expect(authorInitialLine('Sam')).toBe('Sam')
    expect(authorInitialLine('   ')).toBe('A parent')
  })
})

describe('reviewQuoteLine', () => {
  it('quotes a body with the reduced author, and returns null for a blank body', () => {
    const line = reviewQuoteLine({
      score: 5,
      body: 'Best splash pad for toddlers — shaded benches.',
      authorDisplayName: 'Sam Rivera',
      createdAt: '2026-09-01T00:00:00Z',
    })
    expect(line).toBe('“Best splash pad for toddlers — shaded benches.” — Sam R.')
    expect(
      reviewQuoteLine({ score: 4, body: '   ', authorDisplayName: 'Sam', createdAt: '' }),
    ).toBeNull()
  })

  it('truncates on a word boundary with an ellipsis', () => {
    const body =
      'A wonderful shaded playground with a big sand pit and benches for the grown ups to sit on while the kids run around'
    const line = reviewQuoteLine({ score: 5, body, authorDisplayName: 'Alex Kim', createdAt: '' }, 40)
    expect(line).not.toBeNull()
    expect(line!.endsWith('” — Alex K.')).toBe(true)
    expect(line).toContain('…')
    // No mid-word cut: the character before the ellipsis is not a letter that
    // continues past the limit (the slice ends on a space boundary).
    expect(line!.slice(0, line!.indexOf('…')).trimEnd().endsWith(' ')).toBe(false)
  })
})

describe('dropInProofsFromRows', () => {
  const now = '2026-09-27T12:00:00Z'
  it('counts only past, non-cancelled drop-ins, per place', () => {
    const proofs = dropInProofsFromRows(
      [
        { place_id: 'a', ends_at: '2026-09-20T10:00:00Z', status: 'on' },
        { place_id: 'a', ends_at: '2026-09-25T10:00:00Z', status: 'on' },
        { place_id: 'a', ends_at: '2026-10-05T10:00:00Z', status: 'on' }, // future
        { place_id: 'a', ends_at: '2026-09-01T10:00:00Z', status: 'cancelled' },
        { place_id: 'b', ends_at: '2026-09-26T10:00:00Z', status: 'ended' },
        { place_id: null, ends_at: '2026-09-20T10:00:00Z', status: 'on' },
      ],
      now,
    )
    expect(proofs.get('a')).toEqual({ hostedCount: 2, lastEndedAt: '2026-09-25T10:00:00Z' })
    expect(proofs.get('b')).toEqual({ hostedCount: 1, lastEndedAt: '2026-09-26T10:00:00Z' })
    expect(proofs.size).toBe(2)
  })

  it('returns an empty map for an unreadable now', () => {
    expect(dropInProofsFromRows([{ place_id: 'a', ends_at: now, status: 'on' }], 'nope').size).toBe(0)
  })
})

describe('relativePastLabel', () => {
  const now = '2026-09-27T12:00:00Z'
  it('labels minutes, hours, days and months in the past', () => {
    expect(relativePastLabel('2026-09-27T11:59:40Z', now)).toBe('just now')
    expect(relativePastLabel('2026-09-27T11:30:00Z', now)).toBe('30 min ago')
    expect(relativePastLabel('2026-09-27T09:00:00Z', now)).toBe('3 hours ago')
    expect(relativePastLabel('2026-09-25T12:00:00Z', now)).toBe('2 days ago')
    expect(relativePastLabel('2026-07-27T12:00:00Z', now)).toBe('2 months ago')
    expect(relativePastLabel('nope', now)).toBeNull()
  })
})

describe('dropInProofLine', () => {
  const now = '2026-09-27T12:00:00Z'
  it('is null with no activity, and pluralizes honestly', () => {
    expect(dropInProofLine(null, now)).toBeNull()
    expect(dropInProofLine({ hostedCount: 0, lastEndedAt: null }, now)).toBeNull()
    expect(dropInProofLine({ hostedCount: 1, lastEndedAt: null }, now)).toBe('1 drop-in hosted here')
    expect(dropInProofLine({ hostedCount: 12, lastEndedAt: null }, now)).toBe('12 drop-ins hosted here')
  })

  it('appends the last-one tail only when the date is readable', () => {
    expect(
      dropInProofLine({ hostedCount: 3, lastEndedAt: '2026-09-25T12:00:00Z' }, now),
    ).toBe('3 drop-ins hosted here · last one 2 days ago')
    expect(
      dropInProofLine({ hostedCount: 3, lastEndedAt: 'garbage' }, now),
    ).toBe('3 drop-ins hosted here')
  })
})
