import { describe, expect, it } from 'vitest'
// The two CALL SITES' own source, the way avatarUrl.test.ts reads its render
// site's (`?raw`, which vite/client types): the rule below is that the shell and
// the page both CALL this predicate instead of restating it.
import appSource from '../App.tsx?raw'
import inboxPageSource from '../pages/InboxPage.tsx?raw'
import {
  KEYBOARD_MIN_INSET_PX,
  inboxThreadOpen,
  keyboardInset,
} from './threadGeometry'

/**
 * Slice A's two decisions, and the reason each is a module:
 *
 *  1. WHICH locations own the viewport height. One predicate, called by the
 *     shell (which gives the route a definite height) and by the page (which
 *     fills it). If the two ever answered differently, the thread would render
 *     into a column with no height — the composer would scroll away again and
 *     the failure would look like a CSS bug rather than a drifted condition.
 *  2. HOW FAR the composer is lifted when the software keyboard covers the
 *     layout viewport (iOS Safari resizes only the VISUAL viewport, which is
 *     why `100dvh` alone leaves the composer behind the keyboard).
 */
describe('inboxThreadOpen — which locations own their own height', () => {
  it('is true when either thread param is present', () => {
    const cases: Array<{
      readonly name: string
      readonly params: { thread: string | null; dm: string | null }
      readonly expected: boolean
    }> = [
      { name: 'no params (the list)', params: { thread: null, dm: null }, expected: false },
      { name: '?thread=<id>', params: { thread: 'p-1', dm: null }, expected: true },
      { name: '?dm=<id>', params: { thread: null, dm: 'u-1' }, expected: true },
      { name: 'both (the page prefers the playdate thread)', params: { thread: 'p-1', dm: 'u-1' }, expected: true },
      // The EMPTY value is written down rather than assumed: `?dm=` parses to
      // '', and the page's own branch (`threadId === null && dmTargetId === null
      // ? list : thread`) takes the thread arm for it. The shell must agree, or
      // that location gets a thread with no height.
      { name: '?dm= (empty, still the thread branch)', params: { thread: null, dm: '' }, expected: true },
      { name: '?thread= (empty, still the thread branch)', params: { thread: '', dm: null }, expected: true },
    ]
    for (const { name, params, expected } of cases) {
      expect(inboxThreadOpen(params), name).toBe(expected)
    }
  })

  it('is CALLED by both readers — neither restates the condition', () => {
    // The failure this leg exists for: the shell keeping its own copy of the
    // condition and the page keeping another. Presence of the call is the
    // provable half; the e2e spec measures the geometry it produces.
    expect(appSource).toContain('inboxThreadOpen(')
    expect(inboxPageSource).toContain('inboxThreadOpen(')
  })
})

describe('keyboardInset — the band the software keyboard covers', () => {
  it('is the shortfall between the layout and visual viewports, minus the offset', () => {
    const cases: Array<{
      readonly name: string
      readonly args: readonly [number, number, number]
      readonly expected: number
    }> = [
      // No keyboard: the two viewports agree.
      { name: 'agreed viewports', args: [844, 844, 0], expected: 0 },
      // A portrait iPhone keyboard (~300px) with the visual viewport flush to
      // the top of the layout viewport.
      { name: '300px keyboard', args: [844, 544, 0], expected: 300 },
      // The visual viewport scrolled down by 40px: the covered band is the
      // shortfall minus that scroll, or the composer would be lifted 40px too far.
      { name: '300px keyboard, visual viewport scrolled 40px', args: [844, 544, 40], expected: 260 },
      // Browser chrome only (below the threshold): never a lift.
      { name: 'chrome-sized shortfall', args: [844, 784, 0], expected: 0 },
      // The threshold is a boundary, not a range: exactly at it is NOT a keyboard.
      { name: 'exactly at the threshold', args: [844, 844 - KEYBOARD_MIN_INSET_PX, 0], expected: 0 },
      { name: 'one pixel past the threshold', args: [844, 844 - KEYBOARD_MIN_INSET_PX - 1, 0], expected: KEYBOARD_MIN_INSET_PX + 1 },
      // A shortfall that is negative (the visual viewport taller than the
      // layout one — a zoomed-out pinch) is never a lift.
      { name: 'visual viewport larger than the layout viewport', args: [400, 900, 0], expected: 0 },
      // Fractional device pixels round to whole CSS pixels.
      { name: 'fractional shortfall', args: [844, 543.6, 0], expected: 300 },
      // A browser without a usable measure degrades to "no keyboard".
      { name: 'NaN inputs', args: [Number.NaN, Number.NaN, Number.NaN], expected: 0 },
    ]
    for (const { name, args, expected } of cases) {
      expect(keyboardInset(...args), name).toBe(expected)
    }
  })
})
