import { describe, expect, it } from 'vitest'
import {
  clampCardIndex,
  MAP_STRIP_CARD_LIMIT,
  nearestCardIndex,
  nextCardIndex,
  scrollBehaviorFor,
  splitStripRows,
} from './mapStrip'

/**
 * The map view's card-strip seams (V24 slice 10). Everything here is pure: no
 * React, no DOM, no map. Each `it` asserts a RULE (and names the defect it would
 * otherwise let through), not merely that a line executed.
 */

describe('nextCardIndex — the focus step', () => {
  it('steps forward and back inside the strip', () => {
    expect(nextCardIndex(0, 1, 5)).toBe(1)
    expect(nextCardIndex(3, -1, 5)).toBe(2)
  })

  it('CLAMPS at the last card instead of wrapping, because the strip is spatial', () => {
    // The defect this pins: "Next" at the end of the row teleporting the map to
    // the place at the far end of the city, which reads as a lost pin rather
    // than as a step.
    expect(nextCardIndex(4, 1, 5)).toBe(4)
    expect(nextCardIndex(0, -1, 5)).toBe(0)
  })

  it('clamps a delta that would jump past the end, not merely a delta of one', () => {
    // A caller is allowed to ask for a bigger jump (ArrowUp/PageUp style); the
    // answer must still be a legal index.
    expect(nextCardIndex(3, 10, 5)).toBe(4)
    expect(nextCardIndex(1, -10, 5)).toBe(0)
  })

  it('treats a delta of zero as a no-op', () => {
    expect(nextCardIndex(2, 0, 5)).toBe(2)
  })

  it('answers 0 for an empty strip rather than a negative index', () => {
    // The map view never renders an empty strip, but a caller that asks must not
    // get -1: `cards[-1]` is `undefined` in JS and the failure would surface far
    // from here.
    expect(nextCardIndex(0, 1, 0)).toBe(0)
    expect(nextCardIndex(0, -1, 0)).toBe(0)
  })

  it('holds a single-card strip at 0 in both directions', () => {
    expect(nextCardIndex(0, 1, 1)).toBe(0)
    expect(nextCardIndex(0, -1, 1)).toBe(0)
  })

  it('repairs an out-of-range current index instead of propagating it', () => {
    // Defensive: the index can be stale for one render after the filtered rows
    // shrink (a search narrows while the strip is open). The step must land on a
    // real card rather than trusting the stale value.
    expect(nextCardIndex(9, 1, 3)).toBe(2)
    expect(nextCardIndex(-4, 1, 3)).toBe(0)
  })
})

describe('nearestCardIndex — the swipe-to-focus mapping', () => {
  it('picks the card whose center is nearest the strip center', () => {
    expect(nearestCardIndex(100, [40, 140, 240])).toBe(1)
    expect(nearestCardIndex(10, [40, 140, 240])).toBe(0)
    expect(nearestCardIndex(300, [40, 140, 240])).toBe(2)
  })

  it('is the tolerance that makes a mid-scroll position a real answer', () => {
    // The whole point of mapping scroll position through a comparison: between
    // two snap points the answer is still exactly one card, so the map can never
    // show a place that no card is showing.
    expect(nearestCardIndex(119, [40, 140, 240])).toBe(1)
    expect(nearestCardIndex(121, [40, 140, 240])).toBe(1)
    expect(nearestCardIndex(61, [40, 140, 240])).toBe(0)
  })

  it('breaks an exact tie toward the EARLIER card, deterministically', () => {
    // At rest on a two-card strip the container center sits exactly between the
    // two cards. Without a stated rule the focused id could alternate on
    // identical input, which the spec would read as a flapping recentre.
    expect(nearestCardIndex(140, [40, 240])).toBe(0)
    expect(nearestCardIndex(140, [40, 240])).toBe(0)
  })

  it('answers 0 when there are no cards', () => {
    expect(nearestCardIndex(0, [])).toBe(0)
  })

  it('skips a NaN center rather than letting it mask a real card', () => {
    // A center can be NaN when a card's box was never measurable (a display
    // change mid-scroll). NaN loses every `<` comparison, so it must not be
    // allowed to hold `best` at its initial 0 and hide the real card beside it.
    expect(nearestCardIndex(230, [40, 140, Number.NaN, 240])).toBe(3)
    expect(nearestCardIndex(230, [Number.NaN, 40])).toBe(1)
  })
})

describe('scrollBehaviorFor — the reduced-motion interpretation', () => {
  it('scrolls smoothly when the viewer has NOT asked for reduced motion', () => {
    expect(scrollBehaviorFor(false)).toBe('smooth')
  })

  it('jumps instantly when the viewer HAS asked for reduced motion', () => {
    expect(scrollBehaviorFor(true)).toBe('auto')
  })
})

describe('clampCardIndex — a stored index against a shrunken set', () => {
  it('leaves an in-range index alone', () => {
    expect(clampCardIndex(0, 3)).toBe(0)
    expect(clampCardIndex(2, 3)).toBe(2)
  })

  it('pulls an index past the end back onto the last card', () => {
    // The defect this pins: narrowing the search while the map view is open left
    // `focusedIndex` at 5 over a two-card set, so the strip focused NOTHING and
    // the map kept a pin that no card named.
    expect(clampCardIndex(5, 2)).toBe(1)
  })

  it('pulls a negative index back onto the first card', () => {
    expect(clampCardIndex(-3, 4)).toBe(0)
  })

  it('answers 0 for an empty set rather than a negative index', () => {
    expect(clampCardIndex(2, 0)).toBe(0)
  })
})

describe('splitStripRows — the strip and the list partition the rows', () => {
  it('caps the strip at the documented limit', () => {
    const rows = Array.from({ length: MAP_STRIP_CARD_LIMIT + 5 }, (_, i) => i)
    expect(splitStripRows(rows, rows.length).cards).toHaveLength(MAP_STRIP_CARD_LIMIT)
  })

  it('leaves an under-cap set whole, with nothing in the rest list', () => {
    // The map view for any ordinary filtered set: every row is on the map, so
    // the linear list is empty and a screen reader hears each name ONCE.
    const rows = ['a', 'b', 'c']
    expect(splitStripRows(rows, 3)).toEqual({ cards: ['a', 'b', 'c'], rest: [] })
  })

  it('pairs the overflow with the unplaceable rows, losing none of either', () => {
    // Four rows, the last one unplaceable, cap of two (simulated by a tiny
    // placeable count would not exercise the cap, so this asserts the SHAPE the
    // callers depend on instead).
    const rows = ['near', 'far', 'further', 'unknown']
    const split = splitStripRows(rows, 3)
    expect(split.cards).toEqual(['near', 'far', 'further'])
    expect(split.rest).toEqual(['unknown'])
  })

  it('partitions exactly: cards + rest is the input, with no repeats', () => {
    const rows = ['a', 'b', 'c', 'd', 'e']
    const { cards, rest } = splitStripRows(rows, 3)
    expect([...cards, ...rest].sort()).toEqual([...rows].sort())
    expect(new Set([...cards, ...rest]).size).toBe(rows.length)
  })

  it('clamps a placeable count larger than the array instead of losing rows', () => {
    // A caller bug (or a set that shrank between two reads) must not empty the
    // map: every row still lands somewhere.
    const rows = ['a', 'b']
    expect(splitStripRows(rows, 9)).toEqual({ cards: ['a', 'b'], rest: [] })
  })

  it('survives an empty set', () => {
    expect(splitStripRows([], 0)).toEqual({ cards: [], rest: [] })
  })
})
