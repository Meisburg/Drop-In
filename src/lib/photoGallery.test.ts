import { describe, expect, it } from 'vitest'
import {
  GALLERY_GRID_CLASS,
  GALLERY_GRID_MIN,
  GALLERY_SINGLE_CLASS,
  GALLERY_TILE_CLASS,
  clampGalleryIndex,
  galleryAltAt,
  galleryIndexInKept,
  galleryPhotoAt,
  galleryPhotosAreSteppable,
  galleryPhotosFrom,
  galleryLabelAt,
  galleryPositionLabel,
  galleryStepLabel,
  photosAreTiled,
  stepGalleryIndex,
} from './photoGallery'
import type { GalleryPhoto } from './photoGallery'

/**
 * V25 ticket 10 — the family-photo gallery's rules.
 *
 * WHAT THESE TESTS ARE FOR, and what they cannot do. The ticket asks for a
 * tiled grid, a viewer that steps between photos, and a single photo that fills
 * the phone's width. The database can only ever hand the block ONE family photo
 * (`profiles.family_photo_url` is a single column; the storage class is
 * `<uid>/family/photo.<ext>`), so no test here — and no test in the repo — can
 * drive a real two-photo grid through the browser. That is the schema decision
 * ticket 10 forbids smuggling in, and it is stated in `photoGallery.ts`'s header
 * and in this slice's report.
 *
 * What CAN be pinned deterministically is everything that decides what the block
 * and the viewer paint once they have N photos: the tile/single choice, the
 * clamp, the wrap, the counter, the alt and the disabled state. Those are the
 * functions below, and these tests call them with N = 2 and N = 3 — the counts
 * the UI cannot reach yet but must not get wrong the day it can.
 */

const ONE: GalleryPhoto[] = [{ src: 'https://signed.example/one', alt: '@a’s family photo' }]
const TWO: GalleryPhoto[] = [
  { src: 'https://signed.example/one', alt: '@a’s family photo' },
  { src: 'https://signed.example/two', alt: '@a’s family photo' },
]
const THREE: GalleryPhoto[] = [...TWO, { src: 'https://signed.example/three', alt: '@a’s family photo' }]

describe('the grid/single choice (the founder’s "fill the space" vs "tiled")', () => {
  it('tiles only from TWO photos up', () => {
    // The single photo must NOT be forced into a square tile: the founder asked
    // for it to fill the phone's width first, and a one-tile grid would crop it
    // for no reason while drawing a grid that is not there.
    expect(photosAreTiled(0)).toBe(false)
    expect(photosAreTiled(1)).toBe(false)
    expect(photosAreTiled(2)).toBe(true)
    expect(photosAreTiled(9)).toBe(true)
    expect(GALLERY_GRID_MIN).toBe(2)
  })

  it('the tile box is STABLE and the crop is cover, never a stretch', () => {
    // The AC is "a stable tile size, no layout shift as images load". A square
    // box is stable before the bytes arrive; `object-cover` crops.
    expect(GALLERY_TILE_CLASS).toContain('aspect-square')
    expect(GALLERY_TILE_CLASS).toContain('w-full')
    // The photo is what is cropped, so the box must clip it (`object-cover`
    // lives on the <img> inside this wrapper).
    expect(GALLERY_TILE_CLASS).toContain('overflow-hidden')
    // No height cap anywhere: `max-h-*` is exactly the letterbox the founder
    // circled ("doesn’t look weird" = no bars, no chopped portrait).
    expect(GALLERY_TILE_CLASS).not.toMatch(/max-h/)
    expect(GALLERY_SINGLE_CLASS).not.toMatch(/max-h/)
    expect(GALLERY_GRID_CLASS).not.toMatch(/max-h/)
  })

  it('the grid is two fixed columns so a third photo cannot reflow it', () => {
    expect(GALLERY_GRID_CLASS).toContain('grid-cols-2')
    expect(GALLERY_GRID_CLASS).not.toContain('auto-fit')
  })
})

describe('galleryPhotosFrom — the single-photo contract stays compatible', () => {
  it('turns the historical (src, alt) pair into a one-photo gallery', () => {
    // PhotoButton's existing call sites (host avatars, comment rows, kid rows)
    // hand over exactly this pair. They must keep working unchanged.
    expect(galleryPhotosFrom('https://x/one', 'Sam’s photo')).toEqual([
      { src: 'https://x/one', alt: 'Sam’s photo' },
    ])
  })

  it('an explicit gallery wins over the pair, and drops entries with no src', () => {
    expect(galleryPhotosFrom('https://x/ignored', 'ignored', TWO)).toEqual(TWO)
    expect(galleryPhotosFrom(null, 'x', [{ src: '', alt: 'broken' }, TWO[0]])).toEqual([TWO[0]])
  })

  it('no src and no gallery is an empty list — the caller renders no block', () => {
    expect(galleryPhotosFrom(null, 'x')).toEqual([])
    expect(galleryPhotosFrom(undefined, 'x')).toEqual([])
    expect(galleryPhotosFrom('', 'x')).toEqual([])
    expect(galleryPhotosFrom(null, 'x', [])).toEqual([])
  })
})

describe('clampGalleryIndex', () => {
  it('holds the index inside the gallery', () => {
    expect(clampGalleryIndex(3, 0)).toBe(0)
    expect(clampGalleryIndex(3, 2)).toBe(2)
    expect(clampGalleryIndex(3, 3)).toBe(2)
    expect(clampGalleryIndex(3, 99)).toBe(2)
    expect(clampGalleryIndex(3, -4)).toBe(0)
  })

  it('an empty gallery clamps to 0, never NaN or a crash', () => {
    // A gallery that shrinks under the state (a mint fails, a photo is removed)
    // must not take the page down.
    expect(clampGalleryIndex(0, 2)).toBe(0)
    expect(clampGalleryIndex(0, -1)).toBe(0)
  })

  it('a non-finite index has a defined home rather than leaking NaN into src', () => {
    expect(clampGalleryIndex(3, Number.NaN)).toBe(0)
    expect(clampGalleryIndex(3, Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('stepGalleryIndex — next/previous WRAP', () => {
  it('walks forward and backward inside the gallery', () => {
    expect(stepGalleryIndex(3, 0, 1)).toBe(1)
    expect(stepGalleryIndex(3, 1, 1)).toBe(2)
    expect(stepGalleryIndex(3, 1, -1)).toBe(0)
  })

  it('wraps at both ends, so the arrows never dead-end', () => {
    expect(stepGalleryIndex(3, 2, 1)).toBe(0)
    expect(stepGalleryIndex(3, 0, -1)).toBe(2)
  })

  it('steps from a stale index as if it were clamped (no off-by-one escape)', () => {
    expect(stepGalleryIndex(3, 7, 1)).toBe(0)
    expect(stepGalleryIndex(3, -7, -1)).toBe(2)
  })

  it('a single photo has nowhere to go and stays put', () => {
    expect(stepGalleryIndex(1, 0, 1)).toBe(0)
    expect(stepGalleryIndex(1, 0, -1)).toBe(0)
    expect(stepGalleryIndex(0, 0, 1)).toBe(0)
  })
})

describe('the viewer’s controls and words', () => {
  it('offers stepping only when there is somewhere to step', () => {
    expect(galleryPhotosAreSteppable(0)).toBe(false)
    expect(galleryPhotosAreSteppable(1)).toBe(false)
    expect(galleryPhotosAreSteppable(2)).toBe(true)
  })

  it('counts from one, and never says "1 of 0"', () => {
    expect(galleryPositionLabel(1, 0)).toBe('1 of 1')
    expect(galleryPositionLabel(3, 1)).toBe('2 of 3')
    expect(galleryPositionLabel(3, 99)).toBe('3 of 3')
    expect(galleryPositionLabel(0, 0)).toBe('')
  })

  it('the step buttons’ names carry the position, not just the direction', () => {
    expect(galleryStepLabel('next', 3, 0)).toBe('Next photo, 1 of 3')
    expect(galleryStepLabel('previous', 3, 2)).toBe('Previous photo, 3 of 3')
    // A single photo has no position to add (the control is disabled anyway).
    expect(galleryStepLabel('next', 1, 0)).toBe('Next photo, 1 of 1')
  })

  it('alts are distinguishable, and the FIRST photo keeps the caller’s alt verbatim', () => {
    // The existing single-photo specs and call sites all read the plain alt —
    // numbering it would break them for no reason.
    expect(galleryAltAt(THREE, 0)).toBe('@a’s family photo')
    expect(galleryAltAt(THREE, 1)).toBe('@a’s family photo, photo 2')
    expect(galleryAltAt(THREE, 2)).toBe('@a’s family photo, photo 3')
    expect(galleryAltAt([], 0)).toBe('')
  })

  it('galleryLabelAt is the same numbering from a single label (the block’s props)', () => {
    // The block owns ONE label and every tile derives from it, so the numbering
    // rule cannot drift between the tile, its <img>, and the viewer's dialog.
    expect(galleryLabelAt('@a’s family photo', 3, 0)).toBe('@a’s family photo')
    expect(galleryLabelAt('@a’s family photo', 3, 1)).toBe('@a’s family photo, photo 2')
    expect(galleryLabelAt('@a’s family photo', 3, 99)).toBe('@a’s family photo, photo 3')
    expect(galleryLabelAt('@a’s family photo', 1, 0)).toBe('@a’s family photo')
    expect(galleryLabelAt('@a’s family photo', 0, 0)).toBe('')
  })

  it('galleryPhotoAt is the single door to "what do I paint"', () => {
    expect(galleryPhotoAt(TWO, 1)).toEqual(TWO[1])
    expect(galleryPhotoAt(TWO, 5)).toEqual(TWO[1])
    expect(galleryPhotoAt(TWO, -1)).toEqual(TWO[0])
    expect(galleryPhotoAt([], 0)).toBeNull()
    expect(galleryPhotoAt(ONE, 0)).toEqual(ONE[0])
  })
})

describe('galleryIndexInKept — the tap index lands on the SAME photo after drops', () => {
  /**
   * The reported defect's own fixture: `['', 'a', 'b']`. `galleryPhotosFrom`
   * drops the first entry, so a tap on `'a'` arrives at pre-filter index 1 while
   * `'a'` is the KEPT array's index 0.
   */
  const LEADING_DROP: GalleryPhoto[] = [
    { src: '', alt: 'P0 — no src, dropped by galleryPhotosFrom' },
    { src: 'a', alt: 'P1' },
    { src: 'b', alt: 'P2' },
  ]
  /** The same shape with the drop AFTER the tap: nothing may shift. */
  const TRAILING_DROP: GalleryPhoto[] = [
    { src: 'a', alt: 'P1' },
    { src: '', alt: 'P1b — no src, dropped by galleryPhotosFrom' },
    { src: 'b', alt: 'P2' },
  ]

  it('THE DEFECT, pinned: clamping the PRE-filter index opened the wrong photo', () => {
    // What `openGallery` carried before this fix, verbatim: the caller's index
    // clamped against the FILTERED length, on the fixture above. It answers 'b'
    // for a tap on 'a' — the off-by-N — and it is pinned here so a regression to
    // that expression fails in this suite rather than in a browser.
    const kept = galleryPhotosFrom(null, '', LEADING_DROP)
    expect(galleryPhotoAt(kept, clampGalleryIndex(kept.length, 1))?.src).toBe('b')
  })

  it('a drop BEFORE the tap: pre-filter 1 becomes kept 0 and selects "a"', () => {
    const kept = galleryPhotosFrom(null, '', LEADING_DROP)
    expect(kept.map((photo) => photo.src)).toEqual(['a', 'b'])
    expect(galleryIndexInKept(LEADING_DROP, 1)).toBe(0)
    expect(galleryPhotoAt(kept, galleryIndexInKept(LEADING_DROP, 1))?.src).toBe('a')
  })

  it('a drop AFTER the tap shifts nothing, and a tap past it shifts by exactly one', () => {
    const kept = galleryPhotosFrom(null, '', TRAILING_DROP)
    expect(kept.map((photo) => photo.src)).toEqual(['a', 'b'])
    // The tap before the drop: still 0, still 'a'.
    expect(galleryIndexInKept(TRAILING_DROP, 0)).toBe(0)
    expect(galleryPhotoAt(kept, galleryIndexInKept(TRAILING_DROP, 0))?.src).toBe('a')
    // The tap after the drop: shifted by exactly the one drop before it.
    expect(galleryIndexInKept(TRAILING_DROP, 2)).toBe(1)
    expect(galleryPhotoAt(kept, galleryIndexInKept(TRAILING_DROP, 2))?.src).toBe('b')
  })

  it('an array with no drops is the identity — the reachable arrival is untouched', () => {
    // Today's production arrival is ONE photo with a src (no drop possible), and
    // the multi-photo case with nothing dropped must map through unchanged.
    expect(galleryIndexInKept(ONE, 0)).toBe(0)
    expect(galleryIndexInKept(TWO, 0)).toBe(0)
    expect(galleryIndexInKept(TWO, 1)).toBe(1)
    expect(galleryIndexInKept(THREE, 2)).toBe(2)
  })

  it('a tap on a dropped entry lands on the first KEPT entry at or after it', () => {
    // Total on purpose: PhotoButton paints no button for a src-less photo, so
    // this cannot be tapped today — but the rule must still answer.
    expect(galleryIndexInKept(LEADING_DROP, 0)).toBe(0) // the dropped P0 → 'a'
    expect(galleryIndexInKept(TRAILING_DROP, 1)).toBe(1) // the dropped P1b → 'b'
  })

  it('a tap past the end, a negative index, NaN and an all-dropped array are defined', () => {
    // "First kept at or after" has no answer past the end, so it is the LAST
    // kept entry; everything else is clamped into its own array first.
    expect(galleryIndexInKept(LEADING_DROP, 99)).toBe(1)
    expect(galleryIndexInKept(LEADING_DROP, -5)).toBe(0)
    expect(galleryIndexInKept(LEADING_DROP, Number.NaN)).toBe(0)
    expect(galleryIndexInKept([], 0)).toBe(0)
    expect(galleryIndexInKept([{ src: '', alt: 'nothing to fetch' }], 0)).toBe(0)
  })
})
