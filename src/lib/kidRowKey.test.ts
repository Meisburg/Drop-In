/**
 * Unit tests for `newKidRowKey` (the onboarding kids card's row key —
 * V28 r2 fix round 2, R2 + R3). The fast path (secure context) and the
 * fallback (non-secure context, where `crypto.randomUUID` is undefined)
 * must both mint a per-row identity that never collides within a card.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newKidRowKey } from './kidRowKey'

describe('newKidRowKey (the kids card\'s stable row identity)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses crypto.randomUUID in a secure context (the test env has it)', () => {
    expect(typeof crypto.randomUUID).toBe('function')
    // The fast path is a pass-through: the shape is a UUID.
    expect(newKidRowKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  it('back-to-back mints never collide (the key IS the row identity)', () => {
    const keys = new Set(Array.from({ length: 100 }, () => newKidRowKey()))
    expect(keys.size).toBe(100)
  })

  it('falls back to Date.now() + Math.random() when randomUUID is absent (non-secure context, R3)', () => {
    // A phone testing against a plain-HTTP LAN address: `crypto` exists
    // but `randomUUID` does not. The helper must take the fallback path,
    // never throw.
    vi.stubGlobal('crypto', {})
    const key = newKidRowKey()
    expect(key).toMatch(/^r-\d+-[a-z0-9]+$/)
    expect(newKidRowKey(), 'two mints in the same millisecond must still differ').not.toBe(key)
  })

  it('falls back the same way when crypto is absent entirely', () => {
    vi.stubGlobal('crypto', undefined)
    expect(newKidRowKey()).toMatch(/^r-\d+-[a-z0-9]+$/)
  })
})
