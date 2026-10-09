/**
 * V27 slice 2 — the pure rule behind /new's vibe chips.
 *
 * The chips' UI was removed in the remove-buttons slice (the founder's
 * minimalism pass: "I don't like these buttons here… remove it."), so this
 * module has no live caller. The rule stays pinned here, string by string,
 * because `applyVibeChip` is a pure seam: a future surface re-adding the chips
 * inherits this behavior rather than re-deciding it.
 */
import { describe, expect, it } from 'vitest'
import { VIBE_CHIPS, applyVibeChip } from './vibeChips'

describe('VIBE_CHIPS', () => {
  it('is the four starters, in order, with exact labels and sentences', () => {
    expect(VIBE_CHIPS).toEqual([
      { id: 'playground', label: 'Playground hang', text: 'Playground hang — all ages welcome' },
      { id: 'stroller', label: 'Stroller walk', text: 'Stroller walk — easy pace' },
      { id: 'pickup', label: 'Pickup game', text: 'Pickup game — all levels' },
      { id: 'snacks', label: 'Snacks welcome', text: 'Bring a snack to share' },
    ])
  })
})

describe('applyVibeChip', () => {
  const [playground, stroller] = VIBE_CHIPS

  it('an empty field becomes the chip sentence', () => {
    expect(applyVibeChip('', playground)).toBe(playground.text)
  })

  it('a whitespace-only field is empty too — the chip sentence, no stray newlines', () => {
    expect(applyVibeChip('   \n  ', playground)).toBe(playground.text)
  })

  it('tapping the same chip twice is a no-op (idempotent, no duplication)', () => {
    const once = applyVibeChip('', playground)
    expect(applyVibeChip(once, playground)).toBe(once)
    // Even when it is not the whole field, "already contains it" wins.
    const custom = `Bring water!\n${playground.text}`
    expect(applyVibeChip(custom, playground)).toBe(custom)
  })

  it('a second, different chip appends on a new line', () => {
    const once = applyVibeChip('', playground)
    expect(applyVibeChip(once, stroller)).toBe(`${playground.text}\n${stroller.text}`)
  })

  it("a parent's own text is kept: a chip appends under it on a new line", () => {
    expect(applyVibeChip('Meet by the swings', playground)).toBe(
      `Meet by the swings\n${playground.text}`,
    )
  })

  it('trailing whitespace on the parent text is trimmed before the newline is added', () => {
    expect(applyVibeChip('Meet by the swings   \n', playground)).toBe(
      `Meet by the swings\n${playground.text}`,
    )
  })
})
