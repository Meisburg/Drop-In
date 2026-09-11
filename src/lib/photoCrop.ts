/**
 * Photo framing — the pure half of the crop step (photo-crop ticket 01).
 *
 * The upload pipeline used to decide the crop by itself: `prepareAvatarFile`
 * scaled the photo to cover a square and kept the middle of it, which is why a
 * portrait photo of a kid came back as a circle of shoulder (see
 * `.scratch/photo-crop/spec.md`). This module replaces that silent decision with
 * one the user makes.
 *
 * It is a SEPARATE PURE MODULE for the reason the rest of `src/lib` is: every
 * way this feature can go wrong is arithmetic.
 *
 *   - pan past the edge and a blank strip appears inside the circle;
 *   - zoom below "fills the window" and the same thing happens;
 *   - compute the preview and the saved rectangle differently and the user
 *     frames one thing and saves another.
 *
 * All three are ordinary functions of (image size, zoom, centre), so they are
 * settled by unit tests here instead of being debugged through a touch
 * interface on a phone.
 *
 * THE MODEL. State is the crop window's CENTRE in source-image pixels, plus a
 * zoom — not a pixel offset from a corner:
 *
 *   - it does not depend on how large the window is drawn, so the same state
 *     means the same thing on a 320px phone and on an iPad;
 *   - the visible square is `min(width, height) / zoom`, and at zoom 1 that is
 *     exactly the largest centred square — i.e. precisely what the old silent
 *     center-crop produced. "Accept without touching anything" is therefore a
 *     no-op rather than a surprise, which is the only honest default;
 *   - turning it into a drawable source rectangle is a subtraction.
 *
 * No React and no DOM: this file must stay importable from a test with no setup.
 */

/** Source image dimensions, in pixels. */
export interface ImageSize {
  width: number
  height: number
}

/**
 * Where the crop window sits, in source-image coordinates.
 *
 * `zoom` is relative to "the image covers the window": 1 is the widest crop that
 * still fills it (and matches the old behavior), larger is closer in.
 */
export interface CropState {
  zoom: number
  centerX: number
  centerY: number
}

/** The region of the source image to draw, in source pixels. Always square. */
export interface CropRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

/**
 * How to draw the whole image so that the crop region fills the window, for the
 * on-screen preview. `scale` is window pixels per source pixel; the image's
 * top-left corner lands at (offsetX, offsetY).
 */
export interface DrawTransform {
  scale: number
  offsetX: number
  offsetY: number
}

export const MIN_ZOOM = 1
/**
 * 3x is the ceiling on purpose: past roughly this, a phone photo has been
 * magnified enough that what the user is framing is pixels, and the result in a
 * 24px circle is indistinguishable — it only makes it harder to find the face.
 */
export const MAX_ZOOM = 3
export const DEFAULT_ZOOM = MIN_ZOOM

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

/** A finite fallback, because a NaN that reaches a canvas silently draws nothing. */
function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

/**
 * Normalise `-0` to `0`. Arithmetically identical, but `Object.is(-0, 0)` is
 * false, so it leaks into equality checks and into anything serialised — and it
 * falls out of this module naturally (`-rect.sx * scale` with `sx === 0`).
 */
function positiveZero(value: number): number {
  return value === 0 ? 0 : value
}

/**
 * The starting state: the image's centre at the widest crop. Deliberately equal
 * to what the old automatic center-crop did, so a user who ignores the crop step
 * gets the result they used to get.
 */
export function initialCropState(image: ImageSize): CropState {
  return {
    zoom: DEFAULT_ZOOM,
    centerX: finite(image.width, 0) / 2,
    centerY: finite(image.height, 0) / 2,
  }
}

/** The side, in source pixels, of the square the window shows at this zoom. */
export function visibleSideFor(image: ImageSize, zoom: number): number {
  const shortest = Math.min(finite(image.width, 0), finite(image.height, 0))
  if (shortest <= 0) return 0
  return shortest / clamp(finite(zoom, DEFAULT_ZOOM), MIN_ZOOM, MAX_ZOOM)
}

/**
 * Pull a state back inside the legal range: zoom within [MIN_ZOOM, MAX_ZOOM] and
 * a centre that keeps the visible square wholly inside the image.
 *
 * Total on purpose — it accepts whatever a gesture layer hands it (including NaN
 * from a zero-area touch target) and returns something drawable, so no caller
 * has to defend against it.
 */
export function clampCropState(image: ImageSize, state: CropState): CropState {
  const zoom = clamp(finite(state.zoom, DEFAULT_ZOOM), MIN_ZOOM, MAX_ZOOM)
  const side = visibleSideFor(image, zoom)
  const half = side / 2
  const width = finite(image.width, 0)
  const height = finite(image.height, 0)
  return {
    zoom,
    // When the visible square is as wide as the image, low === high and the
    // centre is pinned — which is the correct answer, not a degenerate case.
    centerX: clamp(finite(state.centerX, width / 2), half, Math.max(half, width - half)),
    centerY: clamp(finite(state.centerY, height / 2), half, Math.max(half, height - half)),
  }
}

/**
 * THE source of truth for "which pixels are kept". The encoder uses this and so
 * does the preview; nothing else may compute a crop.
 */
export function cropRectFor(image: ImageSize, state: CropState): CropRect {
  const clamped = clampCropState(image, state)
  const side = visibleSideFor(image, clamped.zoom)
  if (side <= 0) return { sx: 0, sy: 0, sw: 0, sh: 0 }
  const width = finite(image.width, 0)
  const height = finite(image.height, 0)
  // The ORIGIN is clamped as well as the centre. Centre-clamping is equivalent
  // in exact arithmetic, but the subtraction can round a fraction of a pixel
  // past the edge (800.0000000000001), and a source rectangle that reads
  // outside the bitmap is exactly the kind of thing a stricter consumer than a
  // canvas would refuse. Clamping the origin bounds it by construction.
  return {
    sx: clamp(finite(clamped.centerX, 0) - side / 2, 0, Math.max(0, width - side)),
    sy: clamp(finite(clamped.centerY, 0) - side / 2, 0, Math.max(0, height - side)),
    sw: side,
    sh: side,
  }
}

/**
 * The preview's half of the bargain: one transform that draws the crop region
 * into a `windowSize`-px square. Because it is derived FROM `cropRectFor`, the
 * frame the user sees and the pixels that get saved cannot disagree — the
 * failure mode this feature is most likely to ship with.
 */
export function drawTransformFor(
  image: ImageSize,
  state: CropState,
  windowSize: number,
): DrawTransform {
  const rect = cropRectFor(image, state)
  if (rect.sw <= 0 || !(finite(windowSize, 0) > 0)) return { scale: 1, offsetX: 0, offsetY: 0 }
  const scale = windowSize / rect.sw
  return {
    scale,
    offsetX: positiveZero(-rect.sx * scale),
    offsetY: positiveZero(-rect.sy * scale),
  }
}

/**
 * A drag of (dx, dy) window pixels, expressed as the change to apply to the crop
 * centre, in source pixels.
 *
 * The sign is the entire content of this function: dragging the photo to the
 * RIGHT moves the window LEFT over it, so the centre decreases. Getting this
 * backwards is the classic "the photo fights my finger" bug, which is why it is
 * a named, tested function rather than an inline minus sign.
 */
export function centerDeltaForDrag(
  image: ImageSize,
  state: CropState,
  windowSize: number,
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  const rect = cropRectFor(image, state)
  if (rect.sw <= 0 || !(finite(windowSize, 0) > 0)) return { dx: 0, dy: 0 }
  const sourcePxPerWindowPx = rect.sw / windowSize
  return {
    dx: positiveZero(-finite(dx, 0) * sourcePxPerWindowPx),
    dy: positiveZero(-finite(dy, 0) * sourcePxPerWindowPx),
  }
}

/**
 * Zoom while holding one point still — what makes a pinch feel like a pinch
 * rather than a slide. `focalX`/`focalY` are in window pixels (the midpoint
 * between two fingers), and the image point under them is preserved.
 *
 * Clamped like everything else, so pinching out at the edge of the photo pushes
 * the framing back inside it instead of leaving a gap.
 */
export function zoomToPoint(
  image: ImageSize,
  state: CropState,
  zoom: number,
  focalX: number,
  focalY: number,
  windowSize: number,
): CropState {
  const before = cropRectFor(image, state)
  const afterSide = visibleSideFor(image, zoom)
  if (before.sw <= 0 || afterSide <= 0 || !(finite(windowSize, 0) > 0)) {
    return clampCropState(image, { ...state, zoom })
  }
  const sourcePxPerWindowPxBefore = before.sw / windowSize
  const sourcePxPerWindowPxAfter = afterSide / windowSize
  const focalSourceX = before.sx + finite(focalX, 0) * sourcePxPerWindowPxBefore
  const focalSourceY = before.sy + finite(focalY, 0) * sourcePxPerWindowPxBefore
  return clampCropState(image, {
    zoom,
    centerX: focalSourceX - finite(focalX, 0) * sourcePxPerWindowPxAfter + afterSide / 2,
    centerY: focalSourceY - finite(focalY, 0) * sourcePxPerWindowPxAfter + afterSide / 2,
  })
}
