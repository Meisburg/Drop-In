import { useState } from 'react'
import { prepareCroppedPhotoFile, setPlacePhoto, uploadPlacePhoto } from '../lib/db'
import {
  PLACE_PHOTO_SIZE,
  clearPlacePhotoPatch,
  fetchPlacePhotoFile,
  linkFallbackNotice,
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
 * (their own photo of the park, or one saved from elsewhere). The pasted image
 * is previewed inline, because the moderator has to see it to judge whether it
 * needs framing.
 *
 * ONE FLOW, AND NO SEPARATE FRAMING DECISION (place-photo-crop slice 4,
 * 2026-10-05). The founder used slices 1–3 and ruled: *"I don't think we need a
 * crop or adjust button anymore here. Basically, just when you click upload a
 * file, it should just automatically give you the option to crop or adjust and
 * then … when you're finished, this fix up place photo modal should disappear
 * and the photo will just be populated on the place now."* So the crop step IS
 * the step for both ways in, and a photo is saved UNFRAMED only when it cannot
 * be copied at all:
 *   - **Upload a file** — picking the file opens the crop dialog (slice 1's
 *     behaviour, unchanged); the dialog's confirm is the save.
 *   - **Paste a link** — the one primary button (`photo-save-btn`) FETCHES the
 *     image and opens that same dialog. Confirming copies it into our own
 *     `place-photos` bucket, which is the only way to frame it (a cross-origin
 *     image taints the canvas and cannot be encoded).
 *   - **A HOST THAT REFUSES THE FETCH STILL SAVES THE LINK.** The founder's cost
 *     ruling of the same day survives the one-flow change: *"we should prefer
 *     hosting using whoever has already got the image hosted on their link if
 *     possible."* A refused image cannot be framed, so the remote URL is stored
 *     as `photo_url` — the moderator is left with a photo rather than with
 *     nothing — and the refusal's own sentence travels out through `onSaved`,
 *     because this component is unmounted by then.
 * The one button is labelled "Save photo" and that is what it does on both
 * paths; what it does NOT do is save the un-framed original behind the
 * moderator's back, and cancelling the crop dialog leaves nothing written (the
 * same contract as cancelling an upload).
 *
 * FINISHING CLOSES THE EDITOR (slice 4, change 2). A save calls `onSaved` and
 * the host unmounts this component; nothing here renders a "Photo updated."
 * line any more, because the photo appearing on the card or the hero IS the
 * confirmation, and the host's own re-read is what puts it there.
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
 * ⚠️ IT COPIES A PASTED IMAGE, AND IT ALWAYS STORES SOMETHING — A RECORDED
 * REVERSAL (2026-10-05). The rule was "does not download anything", and the
 * reason is kept, not argued away: re-hosting a third party's image may breach
 * that host's terms (Google's especially), and a CC licence expects the
 * attribution we no longer ask for. The founder was shown the trade and ruled
 * twice — the second time on cost, which is exactly what makes the COPY the
 * price of framing a link and the LINK what a refused fetch keeps. That second
 * half is slice 4's: the refusal used to block the crop and save nothing, and
 * now it stores the link on the same tap, so a host we cannot copy from never
 * leaves the moderator with nothing.
 * `fetchPlacePhotoFile` (in `lib/placePhotoAdmin.ts`) is the app's only fetch
 * whose response is STORED, it is reached only from URL mode's one primary
 * action, and a host that refuses is reported with the way out ("save it to your
 * device and use Upload a file") rather than worked around: there is no
 * server-side fetch.
 *
 * The accepted risks — re-hosting terms, and a hotlinked image that can rot or be
 * blocked later — are recorded in
 * `docs/adr/0003-place-photos-are-copied-and-cropped.md`.
 *
 * The decisions live in `lib/placePhotoAdmin.ts` (pure, tested): URL safety,
 * file type and size, the object path, the patch shape, and the copy. The
 * framing decisions live in `lib/photoCrop.ts`.
 */
export function PlacePhotoAdmin({
  place,
  onSaved,
}: {
  place: Place
  /**
   * The photo is written and this editor is FINISHED — the host closes it (or,
   * on /mod, refreshes the row it is embedded in) and re-reads, so the card or
   * the hero shows what was just saved.
   *
   * `notice` is at most one sentence for the moderator to read AFTER this
   * component is gone, and it is set only by the link fallback: the fetch was
   * refused, the remote URL was stored instead, and the moderator has to be told
   * why the picture they just saved cannot be framed. Everywhere else it is
   * undefined, because the photo appearing is the whole confirmation.
   */
  onSaved: (notice?: string) => void
}) {
  const [mode, setMode] = useState<'url' | 'upload'>('url')
  const [urlValue, setUrlValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * THE ONE SAVE PATH for a framed photo. Both ways in end here: the crop
   * dialog hands back the decoded bitmap and the frame the moderator chose,
   * this encodes it at `PLACE_PHOTO_SIZE` — a 1400×700 JPEG, the same 2:1
   * rectangle the hero renders — uploads it to `place-photos`, and points the
   * row at OUR url with the provenance columns cleared in the same patch.
   *
   * `shape: 'frame'` and `PLACE_PHOTO_SIZE` are passed to the crop step: a place
   * photo is a rectangle, so no circle is drawn, and the window the moderator
   * frames in is the shape the place page shows (slice 3). The SAME constant is
   * the encoder's output size, so there is one rectangle in the app rather than
   * a window and a stored size that can drift apart.
   *
   * `onSaved` is called with NO notice: a framed photo is the outcome the
   * moderator asked for, and the host closing the editor is the confirmation.
   */
  const crop = useCropStep(
    async (source, rect) => {
      setError(null)
      try {
        const blob = await prepareCroppedPhotoFile(source, rect, PLACE_PHOTO_SIZE)
        const file = new File([blob], 'place-photo.jpg', { type: 'image/jpeg' })
        const photoUrl = await uploadPlacePhoto(place.id, file, Date.now())
        await setPlacePhoto(
          place.id,
          placePhotoPatch({ photoUrl, sourceUrl: null, license: null, author: null }),
        )
        onSaved()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save that photo.')
      }
    },
    validatePlacePhotoCropFile,
    'frame',
    PLACE_PHOTO_SIZE,
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
    const message = await crop.beginCrop(file)
    if (message !== null) setError(message)
  }

  /**
   * URL MODE'S ONE PRIMARY ACTION (slice 4), and the ONLY caller of
   * `fetchPlacePhotoFile`.
   *
   * THE ORDER IS THE WHOLE DESIGN: copy first, and fall back to the link only
   * when the copy is impossible.
   *   - the fetch succeeds → the decoded file goes through the SAME gate, dialog,
   *     encoder, upload and patch as a chosen file (slice 1's one save path), so
   *     a framed link and a framed upload cannot drift apart;
   *   - the fetch is refused (CORS, a non-image, an error response, an oversize
   *     body) → the image cannot be framed — a cross-origin image taints the
   *     canvas — so the REMOTE url is stored as `photo_url` on this same tap.
   *     That is the founder's cost ruling (2026-10-05) surviving the one-flow
   *     change, and it is why a refused fetch leaves the moderator with a photo
   *     rather than with nothing. The refusal's own sentence rides out through
   *     `onSaved`, because this component is unmounted by then.
   *
   * NOTHING IS STORED TWICE: exactly one of the two branches writes, and the
   * link branch writes the same five columns through the same `placePhotoPatch`
   * the old Save used.
   */
  async function handleUrlPrimary() {
    if (busy) return
    setError(null)
    const checked = validatePhotoUrl(urlValue)
    if ('error' in checked) {
      setError(checked.error)
      return
    }
    setBusy(true)
    try {
      const fetched = await fetchPlacePhotoFile(checked.url)
      if (!fetched.ok) {
        await setPlacePhoto(
          place.id,
          placePhotoPatch({ photoUrl: checked.url, sourceUrl: null, license: null, author: null }),
        )
        setUrlValue('')
        onSaved(linkFallbackNotice(fetched.error))
        return
      }
      const message = await crop.beginCrop(fetched.file)
      if (message !== null) setError(message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that photo.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Clear a photo entirely. Offered because "this picture is wrong" sometimes has
   * no replacement yet, and the directory's per-kind illustration is a better
   * answer than a confidently wrong photograph. The patch clears all five columns
   * together (`clearPlacePhotoPatch`) — provenance must not outlive its image.
   *
   * It finishes the editor exactly like a save does, because it changes the same
   * row and the illustration appearing is the confirmation.
   */
  async function handleClear() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await setPlacePhoto(place.id, clearPlacePhotoPatch())
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
          URL mode's one primary action opens it on the fetched image. It renders
          nothing until there is a decoded bitmap to frame. */}
      {crop.dialog}

      {error !== null ? (
        <p role="alert" data-testid="photo-admin-error" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {/* URL mode's ONE control (slice 4). It fetches the pasted image and opens
          the crop step; a host that refuses has its link stored instead by
          `handleUrlPrimary`, and the sentence explaining that comes from the host
          because this component is gone by then. Upload mode has no button at all
          — its file input opens the crop step directly, and the dialog's confirm
          IS its save. Remove photo sits in its own row below, so a 320px phone
          never has to fit two controls on one line. */}
      {mode === 'url' ? (
        <button
          type="button"
          data-testid="photo-save-btn"
          disabled={busy}
          onClick={() => void handleUrlPrimary()}
          className="min-h-11 w-full rounded-xl bg-indigo-600 px-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save photo'}
        </button>
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
