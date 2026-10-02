import { describe, expect, it } from 'vitest'
import { FEED_VIEW_DEFAULT, FEED_VIEW_LABELS, feedViewShowsMap, type FeedView } from './feedView'

/**
 * V21 t09 (A9): the feed view toggle's rules. The seam is deliberately tiny —
 * a default, labels, and one branch rule — because the feature is two views.
 * These tests pin the founder's ruling so a future "simplification" cannot
 * quietly flip the default to map or drop a label.
 */
describe('FEED_VIEW_DEFAULT (V21 t09 — list leads)', () => {
  it('is list: the wife\'s ruling, soonest-first reading order', () => {
    expect(FEED_VIEW_DEFAULT).toBe('list')
  })
})

describe('FEED_VIEW_LABELS (the toggle row renders both, exactly these words)', () => {
  it('labels each view with its own name', () => {
    expect(FEED_VIEW_LABELS.list).toBe('List')
    expect(FEED_VIEW_LABELS.map).toBe('Map')
  })

  it('covers exactly the two views — no third state has snuck in', () => {
    expect(Object.keys(FEED_VIEW_LABELS)).toEqual(['list', 'map'])
  })
})

describe('feedViewShowsMap (which view makes the map band primary content)', () => {
  it('hides the map band in list view', () => {
    expect(feedViewShowsMap('list')).toBe(false)
  })

  it('shows the map band in map view', () => {
    expect(feedViewShowsMap('map')).toBe(true)
  })

  it('the default view never shows the map band (first load = list, no map)', () => {
    expect(feedViewShowsMap(FEED_VIEW_DEFAULT)).toBe(false)
  })
})

// Type-level guard: the union is exactly two members. A future third view
// must widen this type AND update every consumer — the compiler enforces it.
const _exhaustive: Record<FeedView, boolean> = { list: true, map: false }
void _exhaustive
