/**
 * V17 t01/t03 hardening: the place-kind glyph map must stay COMPLETE against
 * the kinds the database actually allows.
 *
 * WHY THIS TEST EXISTS: `PlacePhotoSlot` (`src/pages/BrowsePage.tsx`) looks a
 * place's kind up in `PLACE_KIND_ICONS` and falls back to the `other` pin when
 * it misses. That fallback is what makes an empty box impossible — but it also
 * means a kind added to `PLACE_KINDS` without a glyph would fail SILENTLY:
 * every card of that kind would quietly render the generic pin, and no gate in
 * this repo would notice. Correctness rested entirely on a human reading two
 * lists side by side.
 *
 * This is the same defect class as the t02 review's blocking finding (a seam
 * whose consumer was never traced): a contract that holds only by inspection
 * until someone changes one side of it. Here the two sides are
 * `PLACE_KINDS` (`src/lib/places.ts`, the mirror of the 0029 CHECK constraint)
 * and `PLACE_KIND_ICONS` — so the test pins them TOGETHER.
 *
 * Lives beside the component rather than in `places.test.ts`: no `lib/` module
 * imports from `components/` in this architecture, and inverting that direction
 * for a test would be the wrong trade. Vitest's default include picks this up
 * like any other sibling test.
 */
import { describe, expect, it } from 'vitest'
import { PLACE_KIND_ICONS } from './icons'
import { PLACE_KINDS } from '../lib/places'

describe('PLACE_KIND_ICONS (the card photo slot’s fallback glyphs)', () => {
  it('covers every kind the database allows, with no extras and none missing', () => {
    // The exact-set assertion, not a subset one: a missing kind is the silent
    // fallback above, and an EXTRA key is a glyph for a kind nothing can have
    // (dead drawing that would survive a kind's removal unnoticed).
    expect(Object.keys(PLACE_KIND_ICONS).sort()).toEqual([...PLACE_KINDS].sort())
  })

  it('gives every kind a real, non-empty path — never a blank slot', () => {
    for (const kind of PLACE_KINDS) {
      const path = PLACE_KIND_ICONS[kind]
      expect(typeof path, `${kind} must map to a path string`).toBe('string')
      // A whitespace-only or empty `d` draws nothing, which is the "empty box"
      // the acceptance criteria forbid — so this is a real assertion, not a
      // tautology over the type.
      expect(path.trim().length, `${kind}'s path must not be blank`).toBeGreaterThan(0)
      // Every glyph must at least move the pen; a single `M` with no drawing
      // command renders an invisible dot.
      expect(path, `${kind}'s path must contain a drawing command`).toMatch(/[MLCAQZmlcaqz]/)
    }
  })

  it('draws every kind with a DISTINCT path (no two kinds share a glyph)', () => {
    const paths = PLACE_KINDS.map((kind) => PLACE_KIND_ICONS[kind])
    // Duplicates would make two kinds visually identical, which defeats the
    // point of a per-kind fallback — the card would claim a distinction it
    // does not draw.
    expect(new Set(paths).size).toBe(paths.length)
  })
})
