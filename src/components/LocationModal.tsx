import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from './FocusTrap'
import { milesWord } from '../lib/feed'
import { MODAL_OVER_LEAFLET_Z_CLASS } from '../lib/stacking'

/**
 * The shared "Set location" modal (V23 slice 1) — the address + radius control
 * that used to live inline in `PlaceDirectory` (the Places page lightbox), now
 * extracted so the FEED can open the same surface instead of rendering its own
 * permanent radius select + zip form.
 *
 * One implementation, two callers:
 *   - PlaceDirectory (/browse and /new's sheet): unchanged behavior — the
 *     geocoded center + radius drive the map overlay and the filtered list;
 *   - FeedPage: the feed's ONE location control ("Drop-ins near you") opens it,
 *     where the viewer sets their home zip (address) and radius.
 *
 * What this extraction adds over the old inline version (pinned by the brief):
 *   - focus is TRAPPED while open (`useFocusTrap`, the same seam ConfirmDialog
 *     uses) and returns to the opener on close;
 *   - Escape closes (backdrop tap already did);
 *   - the pinned prop set below — no other props.
 *
 * THE SLIDER RANGE IS 1–30, deliberately NOT the feed's 1–35 bounds: the
 * Places spec (`e2e/places.e2e.ts`) pins the slider's range as 1–30 ("THE
 * SLIDER'S RANGE IS 1–30"), and this component must not change PlaceDirectory's
 * behavior. The feed's radius ladder still reaches 35 through its own choices
 * (the "See everything in Seattle" option); the slider is a coarse dial, not
 * the ceiling. Documented decision, not an oversight.
 */
export function LocationModal({
  open,
  onClose,
  radiusMiles,
  homeZip,
  onGeocode,
  onApplyRadius,
}: {
  /** Render the modal at all (the caller owns the open state). */
  open: boolean
  /** Close (backdrop tap, Escape, ✕, Cancel all call this). */
  onClose: () => void
  /** The current radius the slider shows (the caller's saved value). */
  radiusMiles: number
  /** The caller's saved home zip (null = none yet). Shown as supporting copy. */
  homeZip: string | null
  /** Geocode an address → coords, or null when it cannot be found. */
  onGeocode: (address: string) => Promise<{ lat: number; lng: number } | null>
  /** Apply a new radius (the caller writes it through its own path). */
  onApplyRadius: (miles: number) => Promise<void> | void
}) {
  const [address, setAddress] = useState('')
  const [radius, setRadius] = useState(radiusMiles)
  const [geocodeError, setGeocodeError] = useState<string | null>(null)
  /** V23 slice 1 review: a REJECTED `onApplyRadius` must say so — see the catch. */
  const [radiusError, setRadiusError] = useState<string | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [applying, setApplying] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Keep the slider honest when the caller's radius changes underneath an open
  // modal (a write landing mid-open): the slider mirrors the SAVED value, not a
  // stale snapshot taken at open time. The caller's state is the source of truth;
  // this effect syncs the local copy so the slider never shows a stale number.
  useEffect(() => {
    setRadius(radiusMiles)
  }, [radiusMiles])

  // Trap Tab inside the dialog; restore focus to the opener on close.
  useFocusTrap(dialogRef, open)

  // Escape closes (same as a backdrop tap), unless a write is in flight.
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !geocoding && !applying) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, geocoding, applying])

  async function handleGeocode() {
    if (geocoding || address.trim() === '') return
    setGeocoding(true)
    setGeocodeError(null)
    const result = await onGeocode(address)
    if (result === null) {
      setGeocodeError('Could not find that address. Try a more specific one.')
    }
    setGeocoding(false)
  }

  async function handleApplyRadius() {
    if (applying || geocoding) return
    setApplying(true)
    setRadiusError(null)
    try {
      await onApplyRadius(radius)
    } catch {
      /* V23 slice 1 REVIEW — A REJECTION WAS SILENTLY SWALLOWED HERE.
       *
       * The original had a bare `finally` and no `catch`: the caller's write
       * could reject and this dialog would close over it with nothing shown.
       * The feed's own `handleLocationApplyRadius` also swallows its error (it
       * renders no line), so the two together produced a parent pressing "See
       * places", watching the dialog vanish, and no indication the radius never
       * saved — a failed write wearing a successful one's clothes, which is the
       * defect class this repo keeps recording.
       *
       * The app's rule everywhere else is to SAY SO: `RadiusEmptyState` shows
       * `radiusSaveErrorMessage`, the feed's zip row renders its own error line,
       * and the permanent radius select this modal replaced showed one too.
       *
       * The copy is generic on purpose — the specific sentence ("We don't cover
       * that zip yet…") belongs to the caller's validator, which this component
       * does not own. Saying something true beats inventing a diagnosis. */
      setRadiusError('That did not save. Try again.')
    } finally {
      setApplying(false)
    }
  }

  if (!open) return null

  return (
    <div
      data-testid="location-modal"
      className={`fixed inset-0 ${MODAL_OVER_LEAFLET_Z_CLASS} flex items-end justify-center bg-black/40 sm:items-center`}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !geocoding && !applying) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Set location"
        className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Set location</h3>
          <button
            type="button"
            data-testid="location-modal-close"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <label className="mb-3 flex flex-col gap-1 text-sm">
          <span className="text-slate-700">Address</span>
          <input
            type="text"
            data-testid="location-address-input"
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
            placeholder="e.g. Green Lake Park, Seattle"
            autoComplete="off"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>

        <label className="mb-4 flex flex-col gap-1 text-sm">
          <span className="text-slate-700">
            Radius: {radius} {milesWord(radius)}
          </span>
          <input
            type="range"
            data-testid="location-radius-slider"
            min={1}
            max={30}
            step={1}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-full accent-indigo-600"
          />
        </label>

        {homeZip !== null ? (
          <p className="mb-3 text-xs text-slate-500">Home zip: {homeZip}</p>
        ) : null}

        {geocodeError !== null ? (
          <p data-testid="location-geocode-error" className="mb-3 text-xs text-red-600">
            {geocodeError}
          </p>
        ) : null}

        {/* V23 slice 1 review: the radius write's own failure, kept as a
            SEPARATE line from the geocode error so the two can never be
            confused — one is about the address, the other about the save.
            `role="alert"` because the parent's attention is on the button they
            just pressed, not on this region (the V22 a11y discipline). */}
        {radiusError !== null ? (
          <p
            role="alert"
            data-testid="location-radius-error"
            className="mb-3 text-xs text-red-600"
          >
            {radiusError}
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            data-testid="location-cancel-btn"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors motion-reduce:transition-none hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="location-see-places-btn"
            disabled={geocoding || address.trim() === ''}
            onClick={() => {
              void handleGeocode()
            }}
            className="flex-1 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors motion-reduce:transition-none hover:bg-indigo-700 disabled:opacity-50"
          >
            {geocoding ? 'Finding…' : 'See places'}
          </button>
          <button
            type="button"
            data-testid="location-apply-radius-btn"
            disabled={applying || geocoding}
            onClick={() => {
              void handleApplyRadius()
            }}
            className="flex-1 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors motion-reduce:transition-none hover:bg-indigo-700 disabled:opacity-50"
          >
            {applying ? 'Saving…' : 'Apply radius'}
          </button>
        </div>
      </div>
    </div>
  )
}