import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  centerDeltaForDrag,
  clampCropState,
  cropRectFor,
  drawTransformFor,
  initialCropState,
  zoomToPoint,
  type CropRect,
  type CropState,
  type ImageSize,
} from '../lib/photoCrop'

/**
 * The crop step (photo-crop ticket 02).
 *
 * Why this exists: every uploaded photo used to be center-cropped by
 * `prepareAvatarFile` with no say from the user, so a portrait photo of a kid
 * came back as a circle of shoulder (see `.scratch/photo-crop/spec.md`). This is
 * the replacement: the user pans and zooms, and what gets saved is the frame
 * they chose.
 *
 * THE PREVIEW IS DRAWN FROM THE SAME FUNCTION THE ENCODER USES. The square is a
 * <canvas> painted with `drawTransformFor`, and confirming returns `cropRectFor`
 * for the same state — both from `src/lib/photoCrop.ts`. That is deliberate: the
 * most likely way to ship this feature broken is to compute the on-screen frame
 * and the saved frame differently, and painting the preview with the encoder's
 * own math makes that disagreement impossible rather than merely unlikely. It is
 * a canvas rather than an <img> with object-fit for exactly that reason.
 *
 * The circular mask is not decoration. Avatars render as circles, so the visible
 * window is the circle INSCRIBED in this square; without showing it, someone
 * could frame a face out to the square's edges and still lose the top of a head
 * in the feed.
 */
export function CropPhotoDialog({
  image,
  busy = false,
  onCancel,
  onConfirm,
}: {
  /** Decoded by the caller, which owns its lifetime. */
  image: ImageBitmap
  /** True while the caller is uploading — the controls lock. */
  busy?: boolean
  onCancel: () => void
  /** The chosen frame, in source pixels. */
  onConfirm: (rect: CropRect) => void
}) {
  // Memoised so the effects below can depend on it honestly: it is derived from
  // `image`, which is stable for the dialog's life.
  const imageSize: ImageSize = useMemo(
    () => ({ width: image.width, height: image.height }),
    [image],
  )
  const [state, setState] = useState<CropState>(() => initialCropState(imageSize))
  const [windowSize, setWindowSize] = useState(0)
  const windowRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  // Live gesture bookkeeping, in refs rather than state: it must not trigger
  // renders, and the handlers need the CURRENT value rather than the one
  // captured when a listener was attached.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null)
  const stateRef = useRef(state)
  // Refreshed in an effect rather than during render: the gesture handlers need
  // the zoom as of the EVENT, and writing a ref mid-render is both what React's
  // own lint rules forbid and genuinely wrong under concurrent rendering.
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Focus the primary action, so Enter accepts the default frame and Escape backs
  // out — "touch nothing and keep what you would have got" stays the easy path.
  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Gated on `busy` exactly like the backdrop click below. Without the gate,
      // Escape during an upload hid the dialog while the upload carried on, which
      // reads to the user as "cancelled" when nothing was cancelled.
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onCancel])

  // The geometry is expressed in window pixels, so the window is MEASURED rather
  // than assumed — which is also what makes the state survive a rotation.
  useEffect(() => {
    const element = windowRef.current
    if (element === null) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry !== undefined) setWindowSize(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null || windowSize <= 0) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width = Math.round(windowSize * dpr)
    canvas.height = Math.round(windowSize * dpr)
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    const transform = drawTransformFor(imageSize, state, windowSize)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, windowSize, windowSize)
    ctx.imageSmoothingQuality = 'high'
    // `transform.drawWidth/drawHeight`, not `image.width * transform.scale` computed
    // locally: the point of one transform object is that the preview consumes the
    // same numbers the encoder's rectangle came from, with nothing re-derived here.
    ctx.drawImage(
      image,
      transform.offsetX,
      transform.offsetY,
      transform.drawWidth,
      transform.drawHeight,
    )
  }, [image, imageSize, state, windowSize])

  // Wheel zoom (desktop). Attached by hand with { passive: false } because React
  // registers wheel listeners passively, so preventDefault would be ignored — and
  // without preventDefault the page scrolls out from under the crop.
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    function onWheel(event: WheelEvent) {
      event.preventDefault()
      const rect = canvas!.getBoundingClientRect()
      setState((current) =>
        zoomToPoint(
          imageSize,
          current,
          // Derived INSIDE the updater from `current`, never from stateRef: wheel
          // events arrive faster than React commits, so a base read from a ref that
          // lags by one event drops whole deltas and the zoom feels sticky.
          current.zoom * Math.exp(-event.deltaY * 0.0015),
          event.clientX - rect.left,
          event.clientY - rect.top,
          windowSize,
        ),
      )
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [imageSize, windowSize])

  /**
   * Re-derive the pinch base from whatever pointers are down RIGHT NOW.
   *
   * Called on every add/remove rather than set once when the second finger lands.
   * A base captured for one pair and then measured against a DIFFERENT pair is a
   * zoom jump — that is exactly what a third finger lifting used to cause, because
   * `size < 2` stayed false and the stale base survived. Doing it on every change
   * makes the base always describe the pair actually being measured.
   */
  function syncPointers() {
    const points = [...pointersRef.current.values()]
    pinchRef.current =
      points.length === 2
        ? {
            distance: Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)),
            zoom: stateRef.current.zoom,
          }
        : null
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    syncPointers()
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const previous = pointersRef.current.get(event.pointerId)
    if (previous === undefined) return
    const next = { x: event.clientX, y: event.clientY }
    pointersRef.current.set(event.pointerId, next)

    if (pointersRef.current.size === 1) {
      const delta = centerDeltaForDrag(
        imageSize,
        stateRef.current,
        windowSize,
        next.x - previous.x,
        next.y - previous.y,
      )
      setState((current) =>
        clampCropState(imageSize, {
          ...current,
          centerX: current.centerX + delta.dx,
          centerY: current.centerY + delta.dy,
        }),
      )
      return
    }

    const canvas = canvasRef.current
    if (pointersRef.current.size >= 2 && canvas !== null) {
      // SELF-HEAL. If a pointerup was ever missed (the browser can take a pointer
      // away without a cancel reaching us) the map keeps a dead entry, and a null
      // base here used to mean the gesture layer silently did nothing for the rest
      // of the dialog's life. Re-deriving a base instead means the worst case is a
      // pinch measured from the current finger pair.
      if (pinchRef.current === null) syncPointers()
      const pinch = pinchRef.current
      if (pinch === null) return
      const [a, b] = [...pointersRef.current.values()]
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
      const rect = canvas.getBoundingClientRect()
      setState((current) =>
        zoomToPoint(
          imageSize,
          current,
          pinch.zoom * (distance / pinch.distance),
          (a.x + b.x) / 2 - rect.left,
          (a.y + b.y) / 2 - rect.top,
          windowSize,
        ),
      )
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointersRef.current.delete(event.pointerId)
    syncPointers()
  }

  return createPortal(
    <div
      className="pt-safe pb-safe fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-dialog-title"
        className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg"
      >
        <div>
          <h2 id="crop-dialog-title" className="text-base font-semibold text-slate-900">
            Adjust the photo
          </h2>
          <p className="text-xs text-slate-500">
            Drag to move. Pinch, or use the slider, to zoom. The circle is what other parents
            will see.
          </p>
        </div>

        {/* The crop window is a square, because a square is what gets stored. The
            circle inside it is what an avatar actually shows. */}
        <div
          ref={windowRef}
          className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-900"
        >
          <canvas
            ref={canvasRef}
            // touch-none is load-bearing: without it the browser scrolls the page
            // or zooms the viewport instead of panning the photo.
            className="absolute inset-0 h-full w-full touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            // Capture can be lost without a pointerup (the browser takes the pointer
            // away, a system gesture, a second window). Treating that as a release is
            // what stops a dead entry from wedging the gesture layer.
            onLostPointerCapture={handlePointerUp}
          />
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute inset-0 rounded-full ring-2 ring-white/70"
              style={{ boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.62)' }}
            />
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-700">Zoom</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={state.zoom}
            disabled={busy}
            aria-label="Zoom"
            // h-11 keeps the slider's hit area at the 44px floor the mobile audit
            // enforces; accent-color is all the styling most engines need.
            className="h-11 w-full accent-indigo-600"
            onChange={(event) => {
              const zoom = Number(event.target.value)
              setState((current) =>
                zoomToPoint(imageSize, current, zoom, windowSize / 2, windowSize / 2, windowSize),
              )
            }}
          />
        </label>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={() => onConfirm(cropRectFor(imageSize, stateRef.current))}
            className="flex min-h-11 items-center rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Use this photo'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
