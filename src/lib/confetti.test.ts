/**
 * v33-13 — the RSVP confirmation's confetti geometry. The assertions are named
 * for what they protect (deterministic, bounded, no layout escape), not for the
 * mechanism: a change to the PRNG is fine so long as these hold.
 */
import { describe, expect, it } from 'vitest'
import { MAX_TOTAL_MS, confettiPieces } from './confetti'

const SEED = 'post-abc123'
const COUNT = 14

describe('confettiPieces (the burst\'s geometry)', () => {
  it('is deterministic for a fixed seed', () => {
    expect(confettiPieces(COUNT, SEED)).toEqual(confettiPieces(COUNT, SEED))
  })

  it('returns exactly `count` pieces', () => {
    expect(confettiPieces(COUNT, SEED)).toHaveLength(COUNT)
    expect(confettiPieces(0, SEED)).toHaveLength(0)
  })

  it('keeps every piece inside the dialog (no layout escape)', () => {
    for (const piece of confettiPieces(COUNT, SEED)) {
      expect(piece.leftPct).toBeGreaterThanOrEqual(0)
      expect(piece.leftPct).toBeLessThanOrEqual(100)
    }
  })

  it('gives every piece a positive fall and stagger', () => {
    for (const piece of confettiPieces(COUNT, SEED)) {
      expect(piece.durationSec).toBeGreaterThan(0)
      expect(piece.delaySec).toBeGreaterThanOrEqual(0)
      expect(piece.colorIndex).toBeGreaterThanOrEqual(0)
      expect(piece.colorIndex).toBeLessThan(4)
    }
  })

  it('settles within the bounded total duration', () => {
    const pieces = confettiPieces(COUNT, SEED)
    expect(pieces.length).toBeGreaterThan(0)
    for (const piece of pieces) {
      expect((piece.delaySec + piece.durationSec) * 1000).toBeLessThanOrEqual(MAX_TOTAL_MS)
    }
  })
})
