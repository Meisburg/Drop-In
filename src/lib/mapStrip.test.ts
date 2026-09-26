import { describe, expect, it } from 'vitest'
import {
  clampCardIndex,
  MAP_STRIP_CARD_LIMIT,
  nearestCardIndex,
  nextCardIndex,
  PLACE_MARKER_FOCUSED_STYLE,
  PLACE_MARKER_STYLE,
  scrollBehaviorFor,
  shouldRenderPlacesMap,
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
  /** A row is placeable when its `placeable` flag says so. */
  const row = (id: string, placeable: boolean) => ({ id, placeable })
  const isPlaceable = (r: { placeable: boolean }) => r.placeable

  it('caps the strip at the documented limit while leaving every other row to the list', () => {
    const rows = Array.from({ length: MAP_STRIP_CARD_LIMIT + 5 }, (_, i) => row(`p${i}`, true))
    const { cards, rest } = splitStripRows(rows, isPlaceable)
    expect(cards).toHaveLength(MAP_STRIP_CARD_LIMIT)
    expect(rest).toHaveLength(5)
    // The property the map depends on: NOTHING is dropped by the cap.
    expect([...cards, ...rest]).toEqual(rows)
  })

  it('leaves an under-cap set whole, with nothing in the rest list', () => {
    // The map view for any ordinary filtered set: every row is on the map, so
    // the linear list is empty and a screen reader hears each name ONCE.
    const rows = [row('a', true), row('b', true), row('c', true)]
    expect(splitStripRows(rows, isPlaceable)).toEqual({ cards: rows, rest: [] })
  })

  it('partitions an INTERLEAVED set on placeability, not on position', () => {
    // The shape the caller actually hands over: KIND-GROUPED rows, where the
    // placeable and unplaceable ones alternate. A rule that assumed the
    // placeable rows came first would put an unplaceable row in the strip here —
    // and, in the version this replaced, would feed the MAP a truncated slice.
    const rows = [
      row('unknown-1', false),
      row('near', true),
      row('unknown-2', false),
      row('far', true),
    ]
    const { cards, rest } = splitStripRows(rows, isPlaceable)
    expect(cards).toEqual([row('near', true), row('far', true)])
    expect(rest).toEqual([row('unknown-1', false), row('unknown-2', false)])
  })

  it('keeps the caller\'s order inside each part', () => {
    const rows = [row('b', true), row('a', true), row('z', false)]
    expect(splitStripRows(rows, isPlaceable).cards).toEqual([row('b', true), row('a', true)])
    expect(splitStripRows(rows, isPlaceable).rest).toEqual([row('z', false)])
  })

  it('caps the placeable part when the placeable count itself exceeds the limit', () => {
    // The interaction the reviewer noted had no test: `placeableCount > limit`.
    // 45 placeable rows and 3 unplaceable ones: 40 cards, and the rest is the 5
    // placeable overflow plus the 3 unplaceable rows — in that order.
    const placeable = Array.from({ length: MAP_STRIP_CARD_LIMIT + 5 }, (_, i) => row(`p${i}`, true))
    const unknown = Array.from({ length: 3 }, (_, i) => row(`u${i}`, false))
    const { cards, rest } = splitStripRows([...placeable, ...unknown], isPlaceable)
    expect(cards).toHaveLength(MAP_STRIP_CARD_LIMIT)
    expect(rest).toEqual([...placeable.slice(MAP_STRIP_CARD_LIMIT), ...unknown])
  })

  it('puts every row in exactly one part, for a mixed set over the cap', () => {
    // 47 placeable and 13 unplaceable, interleaved on a non-divisor stride so the
    // grouping cannot accidentally line up with the cap.
    const rows = Array.from({ length: MAP_STRIP_CARD_LIMIT + 28 }, (_, i) =>
      row(`r${i}`, i % 3 !== 0),
    )
    const placeableRows = rows.filter((r) => r.placeable)
    expect(placeableRows.length, 'this case must actually exceed the cap').toBeGreaterThan(
      MAP_STRIP_CARD_LIMIT,
    )
    const { cards, rest } = splitStripRows(rows, isPlaceable)
    // Sizes add up: no row lost, none counted twice.
    expect(cards.length + rest.length).toBe(rows.length)
    expect(new Set([...cards, ...rest].map((r) => r.id)).size).toBe(rows.length)
    // The strip is filled with PLACEABLE rows up to the cap, and no further.
    expect(cards).toHaveLength(MAP_STRIP_CARD_LIMIT)
    expect(cards.every((r) => r.placeable)).toBe(true)
    // Everything the strip did not take is in `rest`, placeable or not.
    expect(new Set([...cards, ...rest].map((r) => r.id))).toEqual(new Set(rows.map((r) => r.id)))
    expect(rest.filter((r) => r.placeable)).toHaveLength(
      placeableRows.length - MAP_STRIP_CARD_LIMIT,
    )
  })

  it('survives an empty set', () => {
    expect(splitStripRows([], isPlaceable)).toEqual({ cards: [], rest: [] })
  })

  it('handles a set with no placeable rows at all', () => {
    const rows = [row('u1', false), row('u2', false)]
    expect(splitStripRows(rows, isPlaceable)).toEqual({ cards: [], rest: rows })
  })
})

describe('the pin styles — the plain style fully resets the focused one', () => {
  it('sets every property the focused style sets', () => {
    // THE INVARIANT THE NARROWED REPAINT DEPENDS ON. Leaflet's `setStyle` writes
    // only the properties it is given, so a property the FOCUSED style sets and
    // the PLAIN style omits would survive on a pin after it stopped being
    // focused — a stale bigger radius, or a stale darker fill, on the pin the
    // focus just left. Asserting the key sets match is what stops a future
    // "just add a glow to the focused pin" from leaking that glow onto others.
    const plainKeys = Object.keys(PLACE_MARKER_STYLE).sort()
    const focusedKeys = Object.keys(PLACE_MARKER_FOCUSED_STYLE).sort()
    expect(plainKeys).toEqual(focusedKeys)
  })

  it('actually differs on size, colour, stroke and fill, not just on one channel', () => {
    // The distinction must not rest on colour alone (a colour-blind reader, a
    // monochrome screen) — so every channel this app controls is checked.
    expect(PLACE_MARKER_FOCUSED_STYLE.radius).toBeGreaterThan(PLACE_MARKER_STYLE.radius)
    expect(PLACE_MARKER_FOCUSED_STYLE.weight).toBeGreaterThan(PLACE_MARKER_STYLE.weight)
    expect(PLACE_MARKER_FOCUSED_STYLE.fillOpacity).toBeGreaterThan(
      PLACE_MARKER_STYLE.fillOpacity,
    )
    expect(PLACE_MARKER_FOCUSED_STYLE.color).not.toBe(PLACE_MARKER_STYLE.color)
    expect(PLACE_MARKER_FOCUSED_STYLE.fillColor).not.toBe(PLACE_MARKER_STYLE.fillColor)
  })
})

describe('shouldRenderPlacesMap — the dead-map guard', () => {
  const HOME = { lat: 47.66757, lng: -122.37789 }

  it('mounts the map when there are places to plot', () => {
    expect(shouldRenderPlacesMap(1, null)).toBe(true)
    expect(shouldRenderPlacesMap(239, HOME)).toBe(true)
  })

  it('mounts it for a home pin with no places, because the pin IS the content', () => {
    // The one case where an empty map is honest: the viewer's own location with
    // nothing around it. Rendering nothing here would hide their own pin.
    expect(shouldRenderPlacesMap(0, HOME)).toBe(true)
  })

  it('does NOT mount it with neither places nor a home pin', () => {
    // THE DEFECT CASE. If the map were mounted here, `PlacesMap` would null out
    // its own container, the once-per-mount effect's cleanup would never run, and
    // the Leaflet instance would survive attached to a destroyed div — a
    // permanently blank pane after the search is widened again.
    expect(shouldRenderPlacesMap(0, null)).toBe(false)
  })
})
