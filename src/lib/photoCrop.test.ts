import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  centerDeltaForDrag,
  clampCropState,
  cropRectFor,
  drawTransformFor,
  initialCropState,
  isDrawableRect,
  visibleSideFor,
  zoomToPoint,
  type CropRect,
  type CropState,
  type ImageSize,
} from './photoCrop'

/** A portrait phone photo, the case the bug was reported against. */
const PORTRAIT: ImageSize = { width: 400, height: 800 }
const LANDSCAPE: ImageSize = { width: 800, height: 400 }
const SQUARE: ImageSize = { width: 500, height: 500 }

/** The image pixel currently underneath a given window pixel. */
function sourcePointAt(rect: CropRect, windowSize: number, windowPx: number): number {
  return rect.sx + windowPx * (rect.sw / windowSize)
}

describe('initialCropState', () => {
  it('starts centred', () => {
    expect(initialCropState(PORTRAIT)).toEqual({ zoom: DEFAULT_ZOOM, centerX: 200, centerY: 400 })
  })

  it('starts at the widest crop', () => {
    expect(DEFAULT_ZOOM).toBe(MIN_ZOOM)
    expect(initialCropState(LANDSCAPE).zoom).toBe(MIN_ZOOM)
  })
})

describe('cropRectFor at the default zoom — must equal the old silent center-crop', () => {
  // This is the whole reason the feature can default to "do nothing": a user who
  // ignores the crop step has to get exactly what the app used to give them.
  it('takes the largest centred square of a portrait photo', () => {
    expect(cropRectFor(PORTRAIT, initialCropState(PORTRAIT))).toEqual({
      sx: 0,
      sy: 200,
      sw: 400,
      sh: 400,
    })
  })

  it('takes the largest centred square of a landscape photo', () => {
    expect(cropRectFor(LANDSCAPE, initialCropState(LANDSCAPE))).toEqual({
      sx: 200,
      sy: 0,
      sw: 400,
      sh: 400,
    })
  })

  it('is a no-op on an already-square photo', () => {
    expect(cropRectFor(SQUARE, initialCropState(SQUARE))).toEqual({
      sx: 0,
      sy: 0,
      sw: 500,
      sh: 500,
    })
  })
})

describe('visibleSideFor', () => {
  it('is the shortest side at zoom 1', () => {
    expect(visibleSideFor(PORTRAIT, 1)).toBe(400)
    expect(visibleSideFor(LANDSCAPE, 1)).toBe(400)
  })

  it('halves at zoom 2', () => {
    expect(visibleSideFor(PORTRAIT, 2)).toBe(200)
  })

  it('never leaves the legal zoom range, whatever it is handed', () => {
    expect(visibleSideFor(PORTRAIT, 0.1)).toBe(400)
    expect(visibleSideFor(PORTRAIT, 99)).toBe(400 / MAX_ZOOM)
    expect(visibleSideFor(PORTRAIT, Number.NaN)).toBe(400)
  })
})

describe('clampCropState', () => {
  it('pulls the zoom into range', () => {
    expect(clampCropState(PORTRAIT, { zoom: 0.2, centerX: 200, centerY: 400 }).zoom).toBe(MIN_ZOOM)
    expect(clampCropState(PORTRAIT, { zoom: 50, centerX: 200, centerY: 400 }).zoom).toBe(MAX_ZOOM)
  })

  it('pins the centre when the image only just covers the window', () => {
    // At zoom 1 a portrait shows the FULL width, so horizontal panning must be
    // impossible rather than merely discouraged.
    const left = clampCropState(PORTRAIT, { zoom: 1, centerX: -900, centerY: 400 })
    const right = clampCropState(PORTRAIT, { zoom: 1, centerX: 900, centerY: 400 })
    expect(left.centerX).toBe(200)
    expect(right.centerX).toBe(200)
  })

  it('allows panning up to the edge and no further', () => {
    const top = clampCropState(PORTRAIT, { zoom: 1, centerX: 200, centerY: -50 })
    const bottom = clampCropState(PORTRAIT, { zoom: 1, centerX: 200, centerY: 5000 })
    expect(top.centerY).toBe(200)
    expect(bottom.centerY).toBe(600)
  })

  it('lets a zoomed-in crop pan further than a zoomed-out one', () => {
    const range = (zoom: number) => {
      const low = clampCropState(PORTRAIT, { zoom, centerX: 200, centerY: -1e6 })
      const high = clampCropState(PORTRAIT, { zoom, centerX: 200, centerY: 1e6 })
      return high.centerY - low.centerY
    }
    expect(range(1)).toBe(400)
    expect(range(2)).toBe(600)
    expect(range(MAX_ZOOM)).toBeGreaterThan(range(2))
  })
})

describe('the rect is always a legal square inside the image', () => {
  // A cheap deterministic fuzz: the point is that NO state a gesture layer can
  // produce yields a gap inside the circle or a read outside the bitmap.
  function fuzzStates(count: number): CropState[] {
    let seed = 12345
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    return Array.from({ length: count }, () => ({
      zoom: next() * 8, // deliberately past MAX_ZOOM
      centerX: (next() - 0.5) * 4000,
      centerY: (next() - 0.5) * 4000,
    }))
  }

  for (const [name, image] of [
    ['portrait', PORTRAIT],
    ['landscape', LANDSCAPE],
    ['square', SQUARE],
  ] as const) {
    it(`holds for ${name}, over 300 arbitrary states`, () => {
      for (const state of fuzzStates(300)) {
        const rect = cropRectFor(image, state)
        expect(rect.sw).toBe(rect.sh)
        expect(rect.sw).toBeGreaterThan(0)
        expect(rect.sx).toBeGreaterThanOrEqual(0)
        expect(rect.sy).toBeGreaterThanOrEqual(0)
        // A float epsilon, not slack: the ORIGIN is clamped by construction, but
        // `sx + sw` can still round one ulp past the edge (800.0000000000001),
        // and that is arithmetic rather than a logic error.
        expect(rect.sx + rect.sw).toBeLessThanOrEqual(image.width + 1e-9)
        expect(rect.sy + rect.sh).toBeLessThanOrEqual(image.height + 1e-9)
      }
    })
  }
})

describe('drawTransformFor — the preview cannot disagree with the encoder', () => {
  const windowSize = 300

  for (const [name, image] of [
    ['portrait', PORTRAIT],
    ['landscape', LANDSCAPE],
    ['square', SQUARE],
  ] as const) {
    it(`maps the crop rect exactly onto the window and covers it (${name})`, () => {
      for (const state of [
        initialCropState(image),
        { zoom: 2, centerX: image.width / 2, centerY: image.height / 2 },
        { zoom: MAX_ZOOM, centerX: image.width, centerY: image.height },
        { zoom: 1, centerX: 0, centerY: 0 },
      ]) {
        const rect = cropRectFor(image, state)
        const t = drawTransformFor(image, state, windowSize)
        // the rect's top-left lands on the window's top-left...
        expect(-t.offsetX / t.scale).toBeCloseTo(rect.sx, 6)
        expect(-t.offsetY / t.scale).toBeCloseTo(rect.sy, 6)
        // ...and its side spans the window exactly...
        expect(t.scale * rect.sw).toBeCloseTo(windowSize, 6)
        expect(t.scale * rect.sh).toBeCloseTo(windowSize, 6)
        // ...the drawn SIZE travels in the transform rather than being re-derived by
        // the caller (the preview must not recompute the rectangle the encoder was
        // given)...
        expect(t.drawWidth).toBeCloseTo(image.width * t.scale, 6)
        expect(t.drawHeight).toBeCloseTo(image.height * t.scale, 6)
        // ...which means the whole image still covers the window (no gaps).
        expect(t.offsetX).toBeLessThanOrEqual(0)
        expect(t.offsetY).toBeLessThanOrEqual(0)
        expect(t.offsetX + t.drawWidth).toBeGreaterThanOrEqual(windowSize - 1e-6)
        expect(t.offsetY + t.drawHeight).toBeGreaterThanOrEqual(windowSize - 1e-6)
      }
    })
  }

  it('uses a square window, so a square crop cannot letterbox', () => {
    const t = drawTransformFor(PORTRAIT, initialCropState(PORTRAIT), 400)
    expect(t.scale).toBe(1)
    expect(t.offsetX).toBe(0)
    expect(t.offsetY).toBe(-200)
  })
})

describe('centerDeltaForDrag', () => {
  it('moves the window opposite the finger', () => {
    // Dragging the photo right reveals what is to its left.
    const delta = centerDeltaForDrag(PORTRAIT, initialCropState(PORTRAIT), 300, 30, 0)
    expect(delta.dx).toBeCloseTo(-40, 6) // 30 window px * (400 / 300) source px
    expect(delta.dy).toBeCloseTo(0, 6)
  })

  it('moves the window up when the finger drags down', () => {
    const delta = centerDeltaForDrag(PORTRAIT, initialCropState(PORTRAIT), 300, 0, 30)
    expect(delta.dy).toBeCloseTo(-40, 6)
  })

  it('scales with the zoom, because the window shows fewer source pixels', () => {
    const at1 = centerDeltaForDrag(PORTRAIT, { zoom: 1, centerX: 200, centerY: 400 }, 300, 30, 0)
    const at2 = centerDeltaForDrag(PORTRAIT, { zoom: 2, centerX: 200, centerY: 400 }, 300, 30, 0)
    expect(Math.abs(at2.dy)).toBeLessThan(Math.abs(at1.dy) + 1e-9)
    expect(at2.dx).toBeCloseTo(-20, 6) // half the visible width, half the travel
  })

  it('is inert for a degenerate window or image rather than returning NaN', () => {
    expect(centerDeltaForDrag(PORTRAIT, initialCropState(PORTRAIT), 0, 30, 30)).toEqual({
      dx: 0,
      dy: 0,
    })
    expect(centerDeltaForDrag({ width: 0, height: 0 }, initialCropState(PORTRAIT), 300, 30, 30)).toEqual(
      { dx: 0, dy: 0 },
    )
  })
})

describe('zoomToPoint', () => {
  const windowSize = 300

  it('holds the image point under the fingers still', () => {
    const state = initialCropState(PORTRAIT)
    const before = cropRectFor(PORTRAIT, state)
    for (const focal of [0, 75, 150, 300]) {
      const zoomed = zoomToPoint(PORTRAIT, state, 2, focal, focal, windowSize)
      const after = cropRectFor(PORTRAIT, zoomed)
      expect(sourcePointAt(after, windowSize, focal)).toBeCloseTo(
        sourcePointAt(before, windowSize, focal),
        6,
      )
    }
  })

  it('keeps the centre put when the pinch is centred', () => {
    const zoomed = zoomToPoint(PORTRAIT, initialCropState(PORTRAIT), 2, 150, 150, windowSize)
    expect(zoomed.centerX).toBeCloseTo(200, 6)
    expect(zoomed.centerY).toBeCloseTo(400, 6)
    expect(cropRectFor(PORTRAIT, zoomed)).toEqual({ sx: 100, sy: 300, sw: 200, sh: 200 })
  })

  it('stays inside the image when pinching outwards at a corner', () => {
    // The clamp has to win over the focal-point maths, or the circle shows a gap.
    const zoomed = zoomToPoint(PORTRAIT, initialCropState(PORTRAIT), 2, 0, 0, windowSize)
    const rect = cropRectFor(PORTRAIT, zoomed)
    expect(rect.sx).toBeGreaterThanOrEqual(0)
    expect(rect.sy).toBeGreaterThanOrEqual(0)
    expect(rect.sx + rect.sw).toBeLessThanOrEqual(PORTRAIT.width + 1e-9)
    expect(rect.sy + rect.sh).toBeLessThanOrEqual(PORTRAIT.height + 1e-9)
  })

  it('clamps the zoom it is asked for', () => {
    expect(zoomToPoint(PORTRAIT, initialCropState(PORTRAIT), 99, 150, 150, windowSize).zoom).toBe(
      MAX_ZOOM,
    )
    expect(zoomToPoint(PORTRAIT, initialCropState(PORTRAIT), -4, 150, 150, windowSize).zoom).toBe(
      MIN_ZOOM,
    )
  })

  it('is inert for a degenerate window', () => {
    const zoomed = zoomToPoint(PORTRAIT, initialCropState(PORTRAIT), 2, 150, 150, 0)
    expect(zoomed.zoom).toBe(2)
    expect(zoomed.centerX).toBe(200)
    expect(zoomed.centerY).toBe(400)
  })
})

describe('isDrawableRect — the encoder refuses a frame it cannot draw', () => {
  // `prepareSquarePhotoFile` draws whatever rect it is handed, and a zero or non-finite
  // source rect makes drawImage produce a blank square with NO error — a silently
  // grey avatar. Unreachable from the app today, which is exactly why it is pinned
  // here rather than left to the assumption that it stays unreachable.
  it('accepts a rect produced by cropRectFor', () => {
    for (const image of [PORTRAIT, LANDSCAPE, SQUARE]) {
      const rect = cropRectFor(image, { zoom: 2, centerX: image.width / 2, centerY: image.height / 2 })
      expect(isDrawableRect(rect, image)).toBe(true)
    }
  })

  it('rejects a zero-area rect', () => {
    expect(isDrawableRect({ sx: 0, sy: 0, sw: 0, sh: 0 })).toBe(false)
    expect(isDrawableRect({ sx: 0, sy: 0, sw: 100, sh: 0 })).toBe(false)
    expect(isDrawableRect({ sx: 0, sy: 0, sw: -5, sh: 100 })).toBe(false)
  })

  it('rejects non-finite values', () => {
    expect(isDrawableRect({ sx: Number.NaN, sy: 0, sw: 100, sh: 100 })).toBe(false)
    expect(isDrawableRect({ sx: 0, sy: 0, sw: Number.POSITIVE_INFINITY, sh: 100 })).toBe(false)
  })

  it('rejects a negative origin', () => {
    expect(isDrawableRect({ sx: -1, sy: 0, sw: 100, sh: 100 })).toBe(false)
  })

  it('rejects a rect that reaches outside the image, when given one', () => {
    const image: ImageSize = { width: 300, height: 400 }
    expect(isDrawableRect({ sx: 0, sy: 0, sw: 300, sh: 300 }, image)).toBe(true)
    expect(isDrawableRect({ sx: 50, sy: 150, sw: 300, sh: 300 }, image)).toBe(false)
    expect(isDrawableRect({ sx: 50, sy: 0, sw: 300, sh: 300 }, image)).toBe(false)
  })

  it('cannot catch an out-of-bounds rect when denied the image size', () => {
    // Documenting the limit rather than pretending: without the source size there is
    // nothing to compare against, so only finiteness and sign are checked.
    expect(isDrawableRect({ sx: 5000, sy: 0, sw: 100, sh: 100 })).toBe(true)
  })
})

describe('a whole gesture session, on awkward shapes', () => {
  // The unit checks above each hold for a single call. This one drives a LONG
  // sequence of the exact operations the dialog performs — drag, then zoom about a
  // pinch point — and re-asserts the invariants after EVERY step. Drift is the way
  // this feature fails in the hand rather than in a single call: an error that only
  // appears after forty gestures is invisible to any test that does one.
  const SHAPES: Array<[string, ImageSize]> = [
    ['portrait', { width: 400, height: 800 }],
    ['landscape', { width: 800, height: 400 }],
    ['square', { width: 500, height: 500 }],
    ['a panorama', { width: 4000, height: 100 }],
    ['a sliver', { width: 100, height: 4000 }],
    ['tiny (smaller than the window)', { width: 10, height: 10 }],
  ]

  for (const [name, image] of SHAPES) {
    it(`stays legal through 200 gestures on ${name}`, () => {
      const windowSize = 320
      let seed = 987654321
      const next = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648
        return seed / 2147483648
      }
      let state = initialCropState(image)
      for (let step = 0; step < 200; step++) {
        if (next() < 0.5) {
          // a drag, in window pixels, of anything up to a wild fling
          const delta = centerDeltaForDrag(
            image,
            state,
            windowSize,
            (next() - 0.5) * 2000,
            (next() - 0.5) * 2000,
          )
          state = clampCropState(image, {
            ...state,
            centerX: state.centerX + delta.dx,
            centerY: state.centerY + delta.dy,
          })
        } else {
          // a pinch anywhere in the window, including the corners
          state = zoomToPoint(
            image,
            state,
            MIN_ZOOM + next() * (MAX_ZOOM - MIN_ZOOM),
            next() * windowSize,
            next() * windowSize,
            windowSize,
          )
        }

        const rect = cropRectFor(image, state)
        expect(Number.isFinite(rect.sx + rect.sy + rect.sw + rect.sh)).toBe(true)
        expect(rect.sw).toBe(rect.sh)
        expect(rect.sw).toBeGreaterThan(0)
        expect(rect.sx).toBeGreaterThanOrEqual(0)
        expect(rect.sy).toBeGreaterThanOrEqual(0)
        expect(rect.sx + rect.sw).toBeLessThanOrEqual(image.width + 1e-9)
        expect(rect.sy + rect.sh).toBeLessThanOrEqual(image.height + 1e-9)
        expect(state.zoom).toBeGreaterThanOrEqual(MIN_ZOOM)
        expect(state.zoom).toBeLessThanOrEqual(MAX_ZOOM)
      }
    })
  }

  it('never lets a panorama expose a strip of background', () => {
    // The shape most likely to break a cover-clamp: 4000x100 at 1x is a window
    // showing the full height and a 100px-wide slice of it. Any horizontal drift
    // would show empty space inside the circle.
    const image: ImageSize = { width: 4000, height: 100 }
    let state = initialCropState(image)
    for (let step = 0; step < 100; step++) {
      state = clampCropState(image, {
        ...state,
        centerX: state.centerX + (step % 2 === 0 ? 5000 : -5000),
        centerY: state.centerY + (step % 3 === 0 ? 5000 : -5000),
      })
      const rect = cropRectFor(image, state)
      expect(rect.sy).toBe(0) // a 100px window over a 100px image: no vertical travel
      expect(rect.sh).toBe(100)
      expect(rect.sx).toBeGreaterThanOrEqual(0)
      expect(rect.sx + rect.sw).toBeLessThanOrEqual(4000 + 1e-9)
    }
  })
})

describe('totality — nothing a gesture layer can hand us produces NaN', () => {
  const garbage: CropState[] = [
    { zoom: Number.NaN, centerX: Number.NaN, centerY: Number.NaN },
    { zoom: Number.POSITIVE_INFINITY, centerX: Number.NEGATIVE_INFINITY, centerY: 0 },
    { zoom: -1, centerX: -1, centerY: -1 },
    { zoom: 1e9, centerX: 1e9, centerY: 1e9 },
  ]
  const images: ImageSize[] = [
    PORTRAIT,
    { width: 0, height: 0 },
    { width: -5, height: 10 },
    { width: Number.NaN, height: Number.NaN },
  ]

  it('returns finite values for any combination of garbage', () => {
    for (const image of images) {
      for (const state of garbage) {
        const rect = cropRectFor(image, state)
        const t = drawTransformFor(image, state, 300)
        const clamped = clampCropState(image, state)
        for (const value of [
          rect.sx,
          rect.sy,
          rect.sw,
          rect.sh,
          t.scale,
          t.offsetX,
          t.offsetY,
          clamped.zoom,
          clamped.centerX,
          clamped.centerY,
        ]) {
          expect(Number.isFinite(value)).toBe(true)
        }
      }
    }
  })

  it('reports an empty rect for an image with no pixels', () => {
    expect(cropRectFor({ width: 0, height: 0 }, initialCropState(PORTRAIT))).toEqual({
      sx: 0,
      sy: 0,
      sw: 0,
      sh: 0,
    })
  })
})
