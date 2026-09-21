import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useSessionContext } from '../components/SessionProvider'
import { useCropStep } from '../components/useCropStep'
import {
  addKid,
  BIO_MAX_LENGTH,
  createProfile,
  HandleTakenError,
  loadZipCodes,
  MAX_KIDS_PER_PROFILE,
  updateBio,
  updateHomeZipRadius,
  uploadAvatar,
  validateKid,
} from '../lib/db'
import { DEFAULT_RADIUS_MILES, milesWord, RADIUS_MILES_OPTIONS, validateHomeZip } from '../lib/feed'
import { suggestedHandle } from '../lib/oauth'
import { resolveOnboardingRedirect } from '../lib/onboarding'

/**
 * /onboarding — post-signup onboarding (slice 2; V2 slice 3).
 *
 * V2 slice 3 (ticket 03): the neighborhood multi-select is GONE — the
 * location step is a home zip (validated against the seeded zip_codes
 * gazetteer; unknown zips show an inline error) + a radius picker (pinned
 * options 1/2/5/10/20/35, default 5). Neighborhoods are display labels only;
 * discovery is radius-based. Memberships stay in the schema but stop being
 * created here.
 *
 * The step is REQUIRED: a signed-in user without a home zip is gated to
 * this page (the shell's onboarding gate keys on home_zip). One Continue
 * button saves the location (always) + the V2 ticket-02 optional
 * completion items (photo/bio/kids — only what was entered) and lands on
 * the feed.
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  const { session, loading, profile, homeZipSet, refresh } = useSessionContext()

  // V4 slice 4 — the handle step (social sign-in only).
  const suggested = suggestedHandle(
    session?.user.user_metadata ?? null,
    session?.user.email ?? null,
  )
  const [handle, setHandle] = useState('')
  const [handleTouched, setHandleTouched] = useState(false)
  const [handleError, setHandleError] = useState<string | null>(null)
  const [handleBusy, setHandleBusy] = useState(false)
  // The provider's name is a SUGGESTION, not a value: it stays until the user
  // types, and the profiles_display_name_key constraint is what decides
  // whether a handle is actually available.
  const handleValue = handleTouched ? handle : suggested

  const [knownZips, setKnownZips] = useState<ReadonlySet<string> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [homeZip, setHomeZip] = useState('')
  const [zipError, setZipError] = useState<string | null>(null)
  const [radiusMiles, setRadiusMiles] = useState<number>(DEFAULT_RADIUS_MILES)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The optional completion items (V2 ticket 02).
  //
  // photoAdded is a boolean, not the File: since the crop step (photo-crop ticket
  // 03) the File is decoded on pick and never needed again — the bitmap is what
  // both the preview and the encoder use — so keeping a reference to it would
  // only be a way to hold a 12MP original in memory for no reason.
  const [photoAdded, setPhotoAdded] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [bio, setBio] = useState('')
  const [bioError, setBioError] = useState<string | null>(null)
  const [kidRows, setKidRows] = useState<Array<{ name: string; age: string }>>([])
  const [kidsError, setKidsError] = useState<string | null>(null)

  /**
   * The crop step (photo-crop ticket 03). Declared HERE, with the other hooks and
   * above every early return — the V6 regression that blanked the detail page was
   * exactly this: hooks landing below a conditional return, which React reports as
   * "rendered more hooks than during the previous render".
   */
  const photoCrop = useCropStep(async (source, rect) => {
    if (session === null) return
    setPhotoUploading(true)
    setPhotoError(null)
    try {
      await uploadAvatar(session.user.id, source, rect)
      setPhotoAdded(true)
    } catch (err) {
      setPhotoAdded(false)
      setPhotoError(
        err instanceof Error ? err.message : 'Could not upload the photo. You can add it later.',
      )
    } finally {
      setPhotoUploading(false)
    }
  })

  // The seeded gazetteer (zip_codes, migration 0012): the zip input is
  // validated against it — an unknown zip shows an inline error instead of
  // saving. A failed load (0012 not applied yet) renders the designed
  // error state, never a crash (house discipline).
  useEffect(() => {
    let cancelled = false
    loadZipCodes()
      .then((coords) => {
        if (!cancelled) setKnownZips(new Set(coords.keys()))
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load the zip list.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  // Self-contained guard: users who already have a home zip (or are signed
  // out) are bounced — the shell applies the same gate one level up.
  const redirect = resolveOnboardingRedirect(session !== null, homeZipSet)
  if (redirect !== null) return <Navigate to={redirect} replace />

  // The avatar upload (V2 ticket 02; the crop step added by photo-crop ticket 03):
  // validated and decoded inside the crop step, framed by the user, then encoded
  // client-side and stored at avatars/<uid>/avatar. A failed upload (0011 not
  // applied yet) surfaces the error but never traps onboarding — the items are
  // optional, and the /settings nudge banner keeps the prompt alive.
  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = '' // allow re-picking the same file
    if (file === null || session === null) return
    setPhotoError(null)
    // The ≤5MB / image-only gate runs inside beginCrop, before the decode and
    // before the dialog — a rejected file costs nothing.
    const error = await photoCrop.beginCrop(file)
    if (error !== null) {
      setPhotoAdded(false)
      setPhotoError(error)
    }
  }

  function addKidRow() {
    setKidsError(null)
    setKidRows((rows) => [...rows, { name: '', age: '' }])
  }

  function updateKidRow(index: number, patch: { name?: string; age?: string }) {
    setKidsError(null)
    setKidRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function removeKidRow(index: number) {
    setKidsError(null)
    setKidRows((rows) => rows.filter((_, i) => i !== index))
  }

  /** A filled-in kid row must validate (pure); blank rows are skipped. */
  function invalidKidRows(): Array<{ index: number; message: string }> {
    const bad: Array<{ index: number; message: string }> = []
    kidRows.forEach((row, index) => {
      if (row.name.trim() === '' && row.age.trim() === '') return
      const age = row.age.trim() === '' ? NaN : Number(row.age)
      const kidError = validateKid(row.name, age)
      if (kidError !== null) bad.push({ index, message: kidError })
    })
    return bad
  }

  async function handleContinue() {
    if (session === null || saving || knownZips === null) return
    const badKidRows = invalidKidRows()
    if (badKidRows.length > 0) {
      setKidsError(badKidRows.map((bad) => bad.message).join(' '))
      return
    }
    // The location step is the onboarding requirement (V2 slice 3): the
    // zip must be a 5-digit code in the seeded gazetteer; the radius is
    // always one of the pinned options (the select can't produce another).
    const locationError = validateHomeZip(homeZip, knownZips)
    if (locationError !== null) {
      setZipError(locationError)
      return
    }
    setSaving(true)
    setError(null)
    setBioError(null)
    setKidsError(null)
    try {
      await updateHomeZipRadius(session.user.id, homeZip.trim(), radiusMiles)
      // The optional items (V2 ticket 02): only what was actually entered.
      // A failure here never traps onboarding (the items are optional —
      // the /settings nudge banner keeps the prompt) — but it is surfaced.
      if (bio.trim() !== '') {
        try {
          await updateBio(session.user.id, bio)
        } catch (err) {
          setBioError(
            err instanceof Error
              ? `${err.message} You can add it later in your settings.`
              : 'Could not save your bio. You can add it later in your settings.',
          )
        }
      }
      const filledKidRows = kidRows.filter((row) => row.name.trim() !== '' || row.age.trim() !== '')
      for (const row of filledKidRows) {
        const age = Number(row.age)
        try {
          await addKid(session.user.id, row.name, age)
        } catch (err) {
          setKidsError(
            err instanceof Error
              ? `${err.message} You can add your kids later in your settings.`
              : 'Could not add your kids. You can add them later in your settings.',
          )
          break
        }
      }
      // Refresh the shared session state before leaving so the shell's
      // onboarding gate (and header) see the new home zip.
      await refresh()
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save your location. Try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  /**
   * Create the profiles row for a first-time social user. The email path does
   * this on /login; an OAuth user comes back with a session and no row, and
   * every write on this page (and everywhere else) assumes the row exists.
   * refresh() re-reads the profile, so the location step below renders next.
   */
  async function handleCreateProfile(e: FormEvent) {
    e.preventDefault()
    const name = handleValue.trim()
    if (name.length === 0) {
      setHandleError('Please enter a display name.')
      return
    }
    setHandleBusy(true)
    setHandleError(null)
    try {
      await createProfile(name)
      await refresh()
    } catch (err) {
      setHandleError(
        err instanceof HandleTakenError
          ? `“${name}” is already taken — pick a different display name.`
          : err instanceof Error
            ? err.message
            : 'Could not save your display name. Try again.',
      )
    } finally {
      setHandleBusy(false)
    }
  }

  // V4 slice 4: no profiles row yet (a first-time social sign-in) → the handle
  // step comes FIRST; the location step below can only write to an existing row.
  if (profile === null) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Pick your display name</h1>
          <p className="mt-1 text-sm text-slate-600">
            This is your handle — how other parents see you. It isn’t your email, and you can
            change it later in your settings.
          </p>
        </div>
        <form
          className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          onSubmit={(e) => void handleCreateProfile(e)}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Display name</span>
            <input
              className={
                'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                (handleError !== null ? 'border-red-400' : 'border-slate-300')
              }
              value={handleValue}
              onChange={(e) => {
                setHandle(e.target.value)
                setHandleTouched(true)
                setHandleError(null)
              }}
              placeholder="e.g. Sam at Green Lake"
              required
              maxLength={40}
              autoComplete="nickname"
            />
          </label>
          {handleError ? <p className="text-sm text-red-600">{handleError}</p> : null}
          <button
            type="submit"
            disabled={handleBusy}
            className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {handleBusy ? 'Please wait…' : 'Continue'}
          </button>
        </form>
      </div>
    )
  }

  if (loadError !== null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Set your location</h1>
        <p className="text-sm text-red-600">{loadError}</p>
      </div>
    )
  }

  const kidsAtCap = kidRows.length >= MAX_KIDS_PER_PROFILE

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Set your location</h1>
        <p className="mt-1 text-sm text-slate-600">
          You’ll see drop-ins near your home zip, within your radius. You can change both
          anytime in your settings.
        </p>
      </div>

      {knownZips === null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
          Loading the zip list…
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Home zip</span>
            <input
              className={
                'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                (zipError !== null ? 'border-red-400' : 'border-slate-300')
              }
              value={homeZip}
              onChange={(e) => {
                setHomeZip(e.target.value)
                setZipError(null)
              }}
              placeholder="e.g. 98107"
              inputMode="numeric"
              maxLength={5}
            />
          </label>
          {zipError !== null ? <p className="text-sm text-red-600">{zipError}</p> : null}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Radius</span>
            <select
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              value={radiusMiles}
              onChange={(e) => setRadiusMiles(Number(e.target.value))}
            >
              {RADIUS_MILES_OPTIONS.map((miles) => (
                <option key={miles} value={miles}>
                  {miles} {milesWord(miles)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* V2 ticket 02: the optional completion step — photo + bio + kids
          (first name + age only, the privacy pin). Skipping is fine: the
          /settings nudge banner keeps prompting until all three are there. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          Tell parents about your family <span className="font-normal text-slate-500">(optional)</span>
        </h2>

        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Photo</span>
            <label className="cursor-pointer self-start rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              {photoUploading ? 'Uploading…' : photoAdded ? 'Photo added' : 'Add a photo'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={photoUploading}
                onChange={(e) => void handlePhotoChange(e)}
              />
            </label>
            {photoError !== null ? <p className="text-sm text-red-600">{photoError}</p> : null}
            {photoCrop.dialog}
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Bio</span>
            <textarea
              className={
                'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                (bioError !== null ? 'border-red-400' : 'border-slate-300')
              }
              value={bio}
              onChange={(e) => {
                setBio(e.target.value)
                setBioError(null)
              }}
              placeholder="A few words about your family (optional)"
              maxLength={BIO_MAX_LENGTH}
              rows={2}
            />
            {bioError !== null ? <span className="text-sm text-red-600">{bioError}</span> : null}
          </label>

          <div className="flex flex-col gap-2 text-sm">
            <span className="text-slate-700">Kids (first name + age only)</span>
            {kidRows.length === 0 ? (
              <button
                type="button"
                onClick={() => addKidRow()}
                className="self-start rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200"
              >
                Add a kid
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                {kidRows.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                      value={row.name}
                      onChange={(e) => updateKidRow(index, { name: e.target.value })}
                      placeholder="First name"
                      maxLength={30}
                    />
                    <input
                      type="number"
                      min={0}
                      max={17}
                      className="w-20 shrink-0 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                      value={row.age}
                      onChange={(e) => updateKidRow(index, { age: e.target.value })}
                      placeholder="Age"
                    />
                    <button
                      type="button"
                      onClick={() => removeKidRow(index)}
                      className="shrink-0 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {kidsAtCap ? null : (
                  <button
                    type="button"
                    onClick={() => addKidRow()}
                    className="self-start rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200"
                  >
                    Add another kid
                  </button>
                )}
              </div>
            )}
            {kidsError !== null ? <p className="text-sm text-red-600">{kidsError}</p> : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={saving || knownZips === null || homeZip.trim() === ''}
          onClick={() => void handleContinue()}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  )
}