# 01 — The crop geometry seam (pure, tested)

**Status:** done (2026-09-11) — see Comments. The triage vocabulary has no
"done" role, and leaving a finished, verified ticket on `needs-triage` would
mislead the next reader; the recorded state is `task-state.md` (V7.1).
**Depends on:** nothing
**Spec:** `../spec.md`

## Deliverable

A pure module — `src/lib/photoCrop.ts` — that owns ALL the arithmetic of framing,
with no DOM and no React, plus its unit tests.

```ts
/** The source rectangle to draw, in image pixels. */
export interface CropRect { sx: number; sy: number; sw: number; sh: number }

/** How the user has moved the photo inside the crop window. */
export interface CropState { zoom: number; offsetX: number; offsetY: number }

export const MIN_ZOOM = 1

/** Clamp so the image always covers the window: no gaps, no over-panning. */
export function clampCropState(image: { width: number; height: number }, state: CropState): CropState

/** The single source of truth for "what pixels are kept". */
export function cropRectFor(image: { width: number; height: number }, state: CropState): CropRect

/** The inverse, for the gesture layer: a finger delta in window px -> an offset delta. */
export function offsetDeltaFor(image: { width: number; height: number }, state: CropState, dx: number, dy: number): { dx: number; dy: number }
```

## Why this is its own ticket

This is where the feature actually breaks. Three failure modes, all arithmetic:

1. panning past the edge leaves a blank strip in the circle;
2. zooming below "fills the window" does the same;
3. the preview and the final encode compute the rectangle differently, so the user
   frames one thing and saves another.

All three are cheap to test as pure functions and expensive to debug through a
touch interface.

## Acceptance criteria

- `MIN_ZOOM` is the zoom at which the image exactly covers the crop square; zoom
  below it is impossible.
- `clampCropState` never lets any edge of the drawn image come inside the window.
- `cropRectFor` returns a rectangle fully inside the source image, and a SQUARE
  one for a square window, for any legal state.
- A portrait, a landscape and a square source are each covered by tests.
- No imports from React or the DOM in `src/lib/photoCrop.ts`.

## Verification

`npm run test` — new cases in `src/lib/photoCrop.test.ts`, plus the existing 295.

## Comments

**2026-09-11 — done.** `src/lib/photoCrop.ts` + `src/lib/photoCrop.test.ts` (30 tests;
325 total pass).

The model changed slightly from the sketch above, and for the better: state is the
crop window's **centre in source-image pixels** plus a zoom, not a corner offset.
That makes the state independent of how large the window is drawn (the same state
means the same thing on a 320px phone and an iPad), and it makes the zoom-1 crop
EXACTLY the square the old silent center-crop produced — which is what lets the
crop step default to "touch nothing and get what you used to get".

Two things the tests found and the module now handles:
1. `-0` leaked out of `-rect.sx * scale` when the origin was 0. Arithmetically
   harmless, but `Object.is(-0, 0)` is false, so it breaks equality checks.
2. Centre-clamping alone still let `sx + sw` round one ulp past the image edge
   (`800.0000000000001`). The ORIGIN is now clamped as well, which bounds it by
   construction; the test asserts the last ulp as a documented float epsilon
   rather than pretending exact arithmetic.

