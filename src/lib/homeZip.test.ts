import { describe, expect, it } from 'vitest'
import { hasHomeZip } from './homeZip'

/**
 * V28 slice 2a fix 1/5: the presence predicate is defined ONCE here and
 * used at every home-zip presence-test site (the gate derivation in db.ts,
 * the ping/host guards, and the display-only map-pin checks), so no class
 * of drift can recur. The table below pins the gate's exact existing
 * semantics (`zip != null && zip !== ''`).
 */
describe('hasHomeZip (the one home-zip presence predicate)', () => {
  it('treats null and undefined as unset', () => {
    expect(hasHomeZip(null)).toBe(false)
    expect(hasHomeZip(undefined)).toBe(false)
  })

  it('treats the EMPTY STRING as unset — the case that motivated this module', () => {
    // A `== null` check (the drift this module kills) treats '' as SET; the
    // gate's derivation never has, and the guard must not be looser than the
    // wall it replaces.
    expect(hasHomeZip('')).toBe(false)
  })

  it('treats a real zip as set', () => {
    expect(hasHomeZip('98101')).toBe(true)
  })
})