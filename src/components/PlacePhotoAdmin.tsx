import { useState } from 'react'
import { prepareSquarePhotoFile, setPlacePhoto, uploadPlacePhoto } from '../lib/db'
import {
  PLACE_PHOTO_SIZE_PX,
  clearPlacePhotoPatch,
  fetchPlacePhotoFile,
  placePhotoPatch,
  validatePhotoUrl,
  validatePlacePhotoCropFile,
} from '../lib/placePhotoAdmin'
import { useCropStep } from './useCropStep'
import type { Place } from '../lib/types'

/**
 * V28 r4 — the moderator's place-photo editor.
 *
 * THE FOUNDER'S ASK: *"i want to be able to swap them out myself as the admin …
 * am i able to just click on one as the admin and swap them out with a different
 * one i find online?"* Yes — and this is the whole of it, scoped to ONE place at
 * a time rather than a bulk gallery, because the failure that prompted it is
 * "I looked at this place and the picture is wrong".
 *
 * TWO WAYS IN, because they are genuinely different situations and the founder
 * asked for both: PASTE a link for an image found online, or UPLOAD a file
 * (their own photo of the park, or one saved from elsewhere) — and framing is
 * the rest of the ask (2026-10-05): *"be able to like pan it or crop it to make
 * it look right for our app."* The pasted image is previewed inline, because the
 * moderator has to see it to judge whether it needs framing.
 *
 * URL MODE HAS TWO EXITS, and which one the moderator takes decides who hosts
 * the bytes:
 *   - **Save** keeps the plain remote URL. Nothing is fetched, nothing is
 *     uploaded, no object is created — a link the browser cannot even load still
 *     saves fine.
 *   - **Crop or adjust** copies the image into our own `place-photos` bucket:
 *     the only way to frame it (a cross-origin image taints the canvas), and the
 *     only time we pay to host it.
 * UPLOAD MODE ALWAYS STORES OUR COPY, necessarily: a chosen file has no remote
 * home. The founder's ruling, 2026-10-05: *"we should prefer hosting using
 * whoever has already got the image hosted on their link if possible, but then
 * you have the option to — if you need to crop or pan the image — then it gets
 * copied to our database, because otherwise we're going to be paying to serve up
 * every image for everyone."*
 *
 * ⚠️ PROVENANCE IS NO LONGER ASKED FOR — A RECORDED REVERSAL (2026-10-05). This
 * editor used to require *Who took it*, *Licence* and *Where it came from*, and
 * the paragraph this replaces is the record of what was reversed rather than
 * deleted: the three fields existed because CC BY / CC BY-SA REQUIRE
 * attribution, and a replacement that blanked them would attribute the NEW
 * picture to the OLD photographer. The founder was shown that trade and ruled:
 * *"we don't need to put who took it, license, or where it came from."* So the
 * fields are gone. Existing rows KEEP whatever is already stored and
 * `photo_attribution` keeps rendering; a photo replaced here clears the four
 * provenance columns WITH the picture (`placePhotoPatch` writes all five
 * together), so a new picture never wears the old credit.
 *
 * ⚠️ IT COPIES AN IMAGE ONLY WHEN THE MODERATOR FRAMES IT — A RECORDED REVERSAL
 * (2026-10-05). The rule was "does not download anything", and the reason is
 * kept, not argued away: re-hosting a third party's image may breach that host's
 * terms (Google's especially), and a CC licence expects the attribution we no
 * longer ask for. The founder was shown the trade and ruled twice — the second
 * time on cost, and the cost half is exactly what makes the copy conditional.
 * `fetchPlacePhotoFile` (in `lib/placePhotoAdmin.ts`) is the app's only fetch
 * whose response is STORED, it is reached only from **Crop or adjust**, and a
 * host that refuses is reported with the way out ("save it to your device and
 * use Upload a file") rather than worked around: there is no server-side fetch.
 *
 * The accepted risks — re-hosting terms, and a hotlinked image that can rot or be
 * blocked later — are recorded in
 * `docs/adr/0003-place-photos-are-copied-and-cropped.md`.
 *
 * The decisions live in `lib/placePhotoAdmin.ts` (pure, tested): URL safety,
 * file type and size, the object path, the patch shape, and the copy. The
 * framing decisions live in `lib/photoCrop.ts`.
 */
export function PlacePhotoAdmin({ place, onSaved }: { place: Place; onSaved: () => void }) {
  const [mode, setMode] = useState<'url' | 'upload'>('url')
  const [urlValue, setUrlValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  /**
   * THE ONE SAVE PATH for a framed photo. Both ways in end here: the crop
   * dialog hands back the decoded bitmap and the frame the moderator chose,
   * this encodes it at `PLACE_PHOTO_SIZE_PX` as a square JPEG, uploads it to
   * `place-photos`, and points the row at OUR url — with the provenance columns
   * cleared in the same patch.
   *
   * `shape: 'frame'` is passed to the crop step: a place photo is a rectangle,
   * so no circle is drawn (the stored crop is still square — spec §1).
   */
  const crop = useCropStep(
    async (source, rect) => {
      setError(null)
      setDone(false)
      try {
        const blob = await prepareSquarePhotoFile(source, rect, PLACE_PHOTO_SIZE_PX)
        const file = new File([blob], 'place-photo.jpg', { type: 'image/jpeg' })
        const photoUrl = await uploadPlacePhoto(place.id, file, Date.now())
        await setPlacePhoto(
          place.id,
          placePhotoPatch({ photoUrl, sourceUrl: null, license: null, author: null }),
        )
        setDone(true)
        onSaved()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save that photo.')
      }
    },
    validatePlacePhotoCropFile,
    'frame',
  )

  /**
   * Upload mode's only control is the file input: choosing a file OPENS the crop
   * dialog, and the dialog's confirm IS the save. There is deliberately no
   * separate Save tap here — a file that has not been framed has nothing to
   * save, and a second step would only add a way to save the uncropped original
   * by accident.
   *
   * `beginCrop` runs the injected gate (`validatePlacePhotoCropFile`) BEFORE the
   * decode and before the dialog, and returns the message to show, or null.
   */
  async function handlePickFile(file: File) {
    setError(null)
    setDone(false)
    const message = await crop.beginCrop(file)
    if (message !== null) setError(message)
  }

  /**
   * URL mode's SAVE — the link-first exit. It validates the link and stores the
   * REMOTE url as `photo_url`, exactly as this editor always did.
   *
   * NOTHING IS FETCHED, and that is the founder's cost rule (2026-10-05): if the
   * host already serves the image, let it. It is also why a link the browser
   * cannot load still saves fine — we never look at the bytes here. Framing is
   * the other button.
   */
  async function handleUrlSave() {
    if (busy) return
    setError(null)
    setDone(false)
    const checked = validatePhotoUrl(urlValue)
    if ('error' in checked) {
      setError(checked.error)
      return
    }
    setBusy(true)
    try {
      await setPlacePhoto(
        place.id,
        placePhotoPatch({ photoUrl: checked.url, sourceUrl: null, license: null, author: null }),
      )
      setDone(true)
      setUrlValue('')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that photo.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * URL mode's CROP exit — the only path that copies someone else's image into
   * our bucket, and the only caller of `fetchPlacePhotoFile`.
   *
   * A FAILED FETCH BLOCKS ONLY THE CROP. It reports the sentence the fetch
   * produced and stores nothing; Save on the same link is untouched, because it
   * never fetched anything either. The decoded file then goes through the SAME
   * gate, dialog, encoder, upload and patch as a chosen file (slice 1's one
   * save path) — there is no second framing implementation.
   */
  async function handleUrlCrop() {
    if (busy) return
    setError(null)
    setDone(false)
    const checked = validatePhotoUrl(urlValue)
    if ('error' in checked) {
      setError(checked.error)
      return
    }
    setBusy(true)
    try {
      const fetched = await fetchPlacePhotoFile(checked.url)
      if (!fetched.ok) {
        setError(fetched.error)
        return
      }
      const message = await crop.beginCrop(fetched.file)
      if (message !== null) setError(message)
    } finally {
      setBusy(false)
    }
  }

  /**
   * Clear a photo entirely. Offered because "this picture is wrong" sometimes has
   * no replacement yet, and the directory's per-kind illustration is a better
   * answer than a confidently wrong photograph. The patch clears all five columns
   * together (`clearPlacePhotoPatch`) — provenance must not outlive its image.
   */
  async function handleClear() {
    if (busy) return
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      await setPlacePhoto(place.id, clearPlacePhotoPatch())
      setDone(true)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear that photo.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * The inline preview's src, or null when the input is empty or the value is not
   * a link this editor would store. It goes through `validatePhotoUrl` (the same
   * boundary the save path uses) rather than straight into an `<img src>`: a
   * link the app would REFUSE must not be rendered as if it were usable.
   */
  const previewCheck = validatePhotoUrl(urlValue)
  const preview = 'url' in previewCheck ? previewCheck.url : null

  return (
    <div
      data-testid="place-photo-admin"
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
    >
      <div className="flex items-start gap-3">
        {place.photo_url !== null && place.photo_url !== '' ? (
          <img
            src={place.photo_url}
            alt=""
            referrerPolicy="no-referrer"
            className="h-16 w-20 shrink-0 rounded-lg object-cover"
            data-testid="place-photo-current"
          />
        ) : (
          <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-xs text-slate-500">
            No photo
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{place.name}</p>
          <p className="text-xs text-slate-500">{place.kind}</p>
          {place.photo_attribution !== null && place.photo_attribution !== undefined ? (
            <p className="mt-1 truncate text-xs text-slate-500">{place.photo_attribution}</p>
          ) : null}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="photo-mode-url"
          onClick={() => setMode('url')}
          className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-medium ${
            mode === 'url'
              ? 'border-indigo-500 bg-white text-indigo-700'
              : 'border-slate-300 bg-white text-slate-600'
          }`}
        >
          Paste a link
        </button>
        <button
          type="button"
          data-testid="photo-mode-upload"
          onClick={() => setMode('upload')}
          className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-medium ${
            mode === 'upload'
              ? 'border-indigo-500 bg-white text-indigo-700'
              : 'border-slate-300 bg-white text-slate-600'
          }`}
        >
          Upload a file
        </button>
      </div>

      {mode === 'url' ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">Image link</span>
          <input
            type="url"
            data-testid="photo-url-input"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="https://…"
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
          />
          {/* PREVIEW AS YOU TYPE, but only through `validatePhotoUrl` — the
              same security boundary the SAVE path uses, so this never renders a
              `javascript:` or `data:` value into an `<img src>` that the stored
              column would not have accepted either. A preview that fails to load
              stays broken on purpose: the moderator is about to decide whether
              the link works in the app at all. */}
          {preview !== null ? (
            <img
              src={preview}
              alt=""
              referrerPolicy="no-referrer"
              data-testid="photo-url-preview"
              className="mt-1 h-32 w-full rounded-xl border border-slate-200 bg-slate-100 object-cover"
            />
          ) : null}
        </label>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">Image file (JPEG, PNG, or WebP)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            data-testid="photo-file-input"
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null
              // Cleared so picking the SAME file twice opens the dialog twice —
              // an input keeps its value otherwise and a second change never
              // fires (the avatar inputs' convention).
              e.target.value = ''
              if (picked !== null) void handlePickFile(picked)
            }}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </label>
      )}

      {/* The crop step's portal, in both modes: a picked file opens it here, and
          URL mode's "Crop or adjust" opens it on the fetched image. It renders
          nothing until there is a decoded bitmap to frame. */}
      {crop.dialog}

      {error !== null ? (
        <p role="alert" data-testid="photo-admin-error" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" data-testid="photo-admin-done" className="text-sm text-green-700">
          Photo updated.
        </p>
      ) : null}

      {/* URL mode's two exits, side by side: SAVE keeps the link (cheap, works
          even when the browser cannot load it), CROP OR ADJUST copies it into our
          bucket so it can be framed. Upload mode has neither — its file input
          opens the crop step directly, and the dialog's confirm IS its save.
          Remove photo gets its own row rather than sharing one: three controls
          on a 320px phone leave "Crop or adjust" about 86px of text box, which
          wraps a two-word label onto two lines. */}
      {mode === 'url' ? (
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="photo-save-btn"
            disabled={busy}
            onClick={() => void handleUrlSave()}
            className="min-h-11 flex-1 rounded-xl bg-indigo-600 px-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save photo'}
          </button>
          <button
            type="button"
            data-testid="photo-crop-btn"
            disabled={busy}
            onClick={() => void handleUrlCrop()}
            className="min-h-11 flex-1 rounded-xl border border-indigo-500 bg-white px-3 text-sm font-medium text-indigo-700 disabled:opacity-50"
          >
            Crop or adjust
          </button>
        </div>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="photo-clear-btn"
          disabled={busy}
          onClick={() => void handleClear()}
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-600 disabled:opacity-50"
        >
          Remove photo
        </button>
      </div>
    </div>
  )
}
