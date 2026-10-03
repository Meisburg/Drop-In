import { useState } from 'react'
import { setPlacePhoto, uploadPlacePhoto } from '../lib/db'
import {
  clearPlacePhotoPatch,
  placePhotoPatch,
  validatePhotoFile,
  validatePhotoUrl,
} from '../lib/placePhotoAdmin'
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
 * (their own photo of the park, or one saved from elsewhere).
 *
 * ⚠️ PROVENANCE IS REQUIRED, NOT OPTIONAL, and the form asks for it in plain
 * words. Every existing photo carries a licence and an author (migration 0046
 * added the four columns precisely because CC BY / CC BY-SA REQUIRE
 * attribution), and the credit line is already rendered under the image. A
 * replacement that blanked those fields would attribute the NEW picture to the
 * OLD photographer — worse than no metadata, because it is confidently wrong.
 *
 * ⚠️ THIS COMPONENT DOES NOT DOWNLOAD ANYTHING. It stores a URL the moderator
 * supplied, or a file the moderator chose. It never fetches a third-party image
 * on its own behalf: Google's terms forbid re-hosting their content, and the
 * licensing question — "may I use this picture?" — is one only a human can
 * answer. That is why the form asks instead of guessing.
 *
 * The decisions live in `lib/placePhotoAdmin.ts` (pure, tested): URL safety,
 * file type and size, the object path, and the patch shape.
 */
export function PlacePhotoAdmin({ place, onSaved }: { place: Place; onSaved: () => void }) {
  const [mode, setMode] = useState<'url' | 'upload'>('url')
  const [urlValue, setUrlValue] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [license, setLicense] = useState('')
  const [author, setAuthor] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  /**
   * The generation for an uploaded object: `Date.now()` so a second replacement
   * is a NEW path and therefore a NEW url — the browser cannot serve the old
   * bytes from cache (the V28 r2 R1 lesson, restated in `placePhotoObjectPath`).
   */
  async function handleSave() {
    if (busy) return
    setError(null)
    setDone(false)

    let photoUrl: string
    if (mode === 'url') {
      const checked = validatePhotoUrl(urlValue)
      if ('error' in checked) {
        setError(checked.error)
        return
      }
      photoUrl = checked.url
    } else {
      if (file === null) {
        setError('Choose an image file first.')
        return
      }
      const checked = validatePhotoFile(file)
      if (!checked.ok) {
        setError(checked.error)
        return
      }
      setBusy(true)
      try {
        photoUrl = await uploadPlacePhoto(place.id, file, Date.now())
      } catch (err) {
        setBusy(false)
        setError(err instanceof Error ? err.message : 'Could not upload that image.')
        return
      }
    }

    setBusy(true)
    try {
      await setPlacePhoto(
        place.id,
        placePhotoPatch({
          photoUrl,
          sourceUrl: sourceUrl === '' ? null : sourceUrl,
          license: license === '' ? null : license,
          author: author === '' ? null : author,
        }),
      )
      setDone(true)
      setUrlValue('')
      setFile(null)
      onSaved()
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
        </label>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">Image file (JPEG, PNG, or WebP)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            data-testid="photo-file-input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </label>
      )}

      {/* The provenance fields. Asked in plain language rather than labelled
          "license metadata", because the person filling them in is deciding a
          legal question and should understand that is what they are doing. */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-700">Who took it (optional)</span>
        <input
          type="text"
          data-testid="photo-author-input"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="e.g. Joe Mabel"
          className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-700">Licence (optional)</span>
        <input
          type="text"
          data-testid="photo-license-input"
          value={license}
          onChange={(e) => setLicense(e.target.value)}
          placeholder="e.g. CC BY-SA 4.0"
          className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-700">Where it came from (optional)</span>
        <input
          type="url"
          data-testid="photo-source-input"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://commons.wikimedia.org/wiki/File:…"
          className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
        />
      </label>

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

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="photo-save-btn"
          disabled={busy}
          onClick={() => void handleSave()}
          className="min-h-11 flex-1 rounded-xl bg-indigo-600 px-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save photo'}
        </button>
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
