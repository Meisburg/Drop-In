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
 *   - PlaceDirectory (/browse and /new's sheet): the geocoded center + radius
 *     drive the map overlay and the filtered list;
 *   - FeedPage: the feed's ONE location control ("Drop-ins near you") opens it,
 *     where the viewer sets their home zip (address) and radius.
 *
 * ⚠️ V28 r3-4 — TWO BUTTONS, AND APPLY DOES BOTH. The dialog used to offer three
 * (Cancel / "See places" / "Apply radius"), which split one intent across two
 * controls a parent had to press in the right order; the human's phone walk
 * reported it as "appears to do nothing". It is now **Cancel** and **Apply**,
 * where Apply geocodes any typed address, runs the caller's write, and closes —
 * in that order, and it closes only when both halves succeeded. A rejected write,
 * or a lookup that found nothing, leaves the dialog OPEN with its error showing.
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
  onRadiusChange,
  onApplyRadius,
  addressPlaceholder = 'e.g. Green Lake Park, Seattle',
}: {
  /** Render the modal at all (the caller owns the open state). */
  open: boolean
  /** Close (backdrop tap, Escape, ✕, Cancel all call this). */
  onClose: () => void
  /** The current radius the slider shows (the caller's saved value). */
  radiusMiles: number
  /**
   * The address field's placeholder. Defaults to the original example; /browse's
   * search sheet passes "Neighborhood, city, or zip" (the founder's wording for
   * the location row that opens this dialog).
   */
  addressPlaceholder?: string
  /**
   * LIVE radius as the slider moves, before "Apply radius" — the Places
   * directory redraws its map circle and refilters on every tick through this.
   * Deliberately SEPARATE from `onApplyRadius`: that prop is the caller's WRITE
   * (the feed saves the radius to the DB), so a drag must not fire a write per
   * tick. Callers that only persist pass `onApplyRadius` and omit this.
   */
  onRadiusChange?: (miles: number) => void
  /** The caller's saved home zip (null = none yet). Shown as supporting copy. */
  homeZip: string | null
  /** Geocode an address → coords, or null when it cannot be found. */
  onGeocode: (address: string) => Promise<{ lat: number; lng: number } | null>
  /**
   * The caller's WRITE, run by the ONE Apply button (V28 r3-4) — after any
   * typed address has been geocoded and before the dialog closes.
   *
   * It must RE-THROW on failure: this component owns the error surface
   * (`location-radius-error`) and does not close over a rejected write.
   */
  onApplyRadius: (miles: number) => Promise<void> | void
}) {
  const [address, setAddress] = useState('')
  /**
   * The slider's in-session draft. `null` means the parent has not touched it
   * yet, so the slider MIRRORS the caller's saved value — including a write
   * that lands while the modal is open. Once they move it, the draft wins, so
   * a landing write cannot silently undo their choice (see the effect below).
   */
  const [draftRadius, setDraftRadius] = useState<number | null>(null)
  const radius = draftRadius ?? radiusMiles
  const [geocodeError, setGeocodeError] = useState<string | null>(null)
  /** V23 slice 1 review: a REJECTED `onApplyRadius` must say so — see the catch. */
  const [radiusError, setRadiusError] = useState<string | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [applying, setApplying] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  // The slider mirrors the caller's SAVED value on every open, and for as long
  // as the parent has not moved it here. The old shape kept a local copy synced
  // by `useEffect(..., [radiusMiles])`, which had a race the full-suite e2e
  // sweep caught (`e2e/feed-empty-state.e2e.ts`, "the home-ZIP control saves,
  // keeps the radius, and never shows a false error"): the first apply's
  // `refresh()` landed WHILE the parent was dragging to the second value, the
  // effect reset the slider to the value just saved, and the second "Apply
  // radius" then wrote an equal value — a silent no-op. A write landing
  // mid-edit is exactly the case where the parent's own input must win.
  // Clearing the draft on open keeps the saved value authoritative again for
  // the NEXT open, which is the part that mirroring was there to protect.
  useEffect(() => {
    if (open) setDraftRadius(null)
  }, [open])

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

  /**
   * Resolve the typed address. Returns whether a centre landed, so the caller
   * can decide without reading React state that has not committed yet.
   *
   * ⚠️ The RETURN VALUE is what makes `handleApply` correct: `setGeocodeError`
   * is asynchronous, so reading `geocodeError` immediately after this resolves
   * would read the PREVIOUS render's value and could close the dialog over a
   * failed lookup. A returned boolean cannot go stale.
   */
  async function handleGeocode(): Promise<boolean> {
    if (geocoding || address.trim() === '') return false
    setGeocoding(true)
    setGeocodeError(null)
    const result = await onGeocode(address)
    if (result === null) {
      setGeocodeError('Could not find that address. Try a more specific one.')
    }
    setGeocoding(false)
    return result !== null
  }

  /**
   * V28 r3-4 — THE ONE EXPLICIT ACTION: apply, then close.
   *
   * The human's phone walk: set-location "appears to do nothing"; they want
   * exactly TWO buttons, **Cancel** and **Apply**, where Apply closes the menu
   * *and* updates the page. The old shape had THREE buttons — Cancel, "See
   * places" (geocode only) and "Apply radius" (write only) — and a parent had to
   * press two of them, in the right order, to get what one word promised.
   *
   * ⚠️ ORDER IS LOAD-BEARING, and it is why this is one function rather than two
   * buttons calling two handlers:
   *
   *   1. GEOCODE the typed address (if any) — so the caller's center is set;
   *   2. APPLY the radius through `onApplyRadius` — the caller's write;
   *   3. CLOSE last.
   *
   * `onClose` is called LAST because the Places caller's `closeLocationModal`
   * CLEARS `geocodeCenter` (`PlaceDirectory.tsx:624-627`). Closing first would
   * wipe the center the geocode had just produced, which is exactly the
   * "Apply does nothing" symptom being fixed.
   *
   * A FAILED write does NOT close: the caller re-throws so this component owns
   * the error surface (V23 slice 1's re-throw), and closing over it would
   * discard the message — the silent-failure class this repo keeps recording.
   * A failed GEOCODE does not close either: the parent stays to correct the
   * address, which is the whole point of showing them the error.
   */
  async function handleApply() {
    if (applying || geocoding) return
    setApplying(true)
    setRadiusError(null)
    try {
      // 1. The address, when one was typed. A failure leaves the dialog open.
      if (address.trim() !== '') {
        const resolved = await handleGeocode()
        if (!resolved) return
      }
      // 2. The caller's write. It re-throws on failure, caught below.
      await onApplyRadius(radius)
    } catch {
      /* V23 slice 1 REVIEW — A REJECTION WAS SILENTLY SWALLOWED HERE.
       *
       * The original had a bare `finally` and no `catch`: the caller's write
       * could reject and this dialog would close over it with nothing shown.
       * The feed's own `handleLocationApplyRadius` also swallows its error (it
       * renders no line), so the two together produced a parent pressing the
       * apply control, watching the dialog vanish, and no indication the radius
       * never saved — a failed write wearing a successful one's clothes, which
       * is the defect class this repo keeps recording.
       *
       * The app's rule everywhere else is to SAY SO: `RadiusEmptyState` shows
       * `radiusSaveErrorMessage`, the feed's zip row renders its own error line,
       * and the permanent radius select this modal replaced showed one too.
       *
       * The copy is generic on purpose — the specific sentence ("We don't cover
       * that zip yet…") belongs to the caller's validator, which this component
       * does not own. Saying something true beats inventing a diagnosis. */
      setRadiusError('That did not save. Try again.')
      return
    } finally {
      setApplying(false)
    }
    // 3. Only on success, and only after both halves landed.
    onClose()
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
            placeholder={addressPlaceholder}
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
            onChange={(e) => {
              const next = Number(e.target.value)
              setDraftRadius(next)
              onRadiusChange?.(next)
            }}
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

        {/* V28 r3-4 — TWO buttons, exactly: Cancel and Apply.
            The human's phone walk: setting the location and pressing "See
            places" / "Apply radius" "appears to do nothing", and they want one
            control that closes the menu AND updates the page. The old three
            (Cancel / See places / Apply radius) split one intent across two
            buttons a parent had to press in the right order. */}
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
            data-testid="location-apply-btn"
            disabled={applying || geocoding}
            onClick={() => {
              void handleApply()
            }}
            className="flex-1 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors motion-reduce:transition-none hover:bg-indigo-700 disabled:opacity-50"
          >
            {applying ? 'Saving…' : geocoding ? 'Finding…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
