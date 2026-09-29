import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useSessionContext } from '../components/SessionProvider'
import { FirstRunCard } from '../components/FirstRunCard'
import { useCropStep } from '../components/useCropStep'
import { composeDisplayName, displayNameFieldError } from '../lib/account'
import { progressLabel } from '../lib/firstRun'
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
import {
  DEFAULT_RADIUS_MILES,
  milesWord,
  radiusSaveErrorMessage,
  RADIUS_MILES_OPTIONS,
  validateHomeZip,
} from '../lib/feed'
import { splitSuggestedName, suggestedHandle } from '../lib/oauth'
import { consumeSignupZipUnresolved, resolveOnboardingRedirect } from '../lib/onboarding'
import { errorId, fieldA11y } from '../lib/a11y'

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
 * The location step is REQUIRED to finish the first run — it is the run's
 * last card and its home_zip is the requirement that ends it — but it is
 * NO LONGER A GATE on the app: since V28 slice 2b a signed-in user
 * without a home zip is not bounced to this page (the shell's gate stopped
 * keying on home_zip; the requirement lives at the write paths, see
 * docs/adr/0001-home-zip-stops-being-a-gate.md). Visiting /onboarding is
 * voluntary; finishing the run is not. One Continue
 * button saves the location (always) + the V2 ticket-02 optional
 * completion items (photo/bio/kids — only what was entered) and lands on
 * the feed.
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  const { session, loading, profile, homeZipSet, refresh } = useSessionContext()

  // V4 slice 4 — the handle step (social sign-in only).
  //
  // V20 t06: TWO FIELDS, not one "Display name" box, matching /login's signup
  // form exactly (the same `composeDisplayName` / `displayNameFieldError`
  // seams). A social user's provider may hand us a full name, so the two halves
  // are SPLIT for the fields rather than dropped into one — see
  // `splitSuggestedName`.
  const suggested = suggestedHandle(
    session?.user.user_metadata ?? null,
    session?.user.email ?? null,
  )
  const suggestedParts = splitSuggestedName(suggested)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  // V28 slice 3b: ONE flag per field, not a shared one. With a shared flag,
  // typing in the LAST name field switched the FIRST field over to its empty
  // state and the prefill vanished from under the user (and, for a signup
  // whose prefill equals the email's local part, a "fill with the same value"
  // never registers a change at all — the required first-name field then
  // blocks the submit with "Please fill out this field" on a value the user
  // never saw disappear). Each field keeps ITS HALF of the suggestion until
  // the user edits that field; what is shown is what `handleCreateProfile`
  // composes, so validation, the error surface, and the write agree.
  const [firstNameTouched, setFirstNameTouched] = useState(false)
  const [lastNameTouched, setLastNameTouched] = useState(false)
  const [handleError, setHandleError] = useState<string | null>(null)
  const [handleBusy, setHandleBusy] = useState(false)
  // The provider's name is a SUGGESTION, not a value: it stays until the user
  // types, and the profiles_display_name_key constraint is what decides
  // whether a handle is actually available.
  const firstNameValue = firstNameTouched ? firstName : suggestedParts.first
  const lastNameValue = lastNameTouched ? lastName : suggestedParts.last

  const [knownZips, setKnownZips] = useState<ReadonlySet<string> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [homeZip, setHomeZip] = useState('')
  const [zipError, setZipError] = useState<string | null>(null)
  const [radiusMiles, setRadiusMiles] = useState<number>(DEFAULT_RADIUS_MILES)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * Whether the signup address failed to resolve to a ZIP (first-use audit,
   * ticket 02). Read lazily ONCE, in the initializer, because the read is
   * destructive (one-shot): doing it in the render body would consume the flag
   * on a throwaway render and then show nothing.
   */
  const [signupZipUnresolved] = useState(() =>
    consumeSignupZipUnresolved(typeof window === 'undefined' ? null : window.sessionStorage),
  )

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
      <div className="flex min-h-64 items-center justify-center text-base text-slate-600">
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
      // Refresh the shared session state before leaving: homeZipSet is what
      // this page's own guard (and every other route's) re-checks, and the
      // feed reads the profile from the same state. Since V28 slice 2b the
      // shell's onboarding gate no longer keys on the home zip, and the
      // header shows no zip at all — this keeps the shared state, not the
      // chrome, current.
      await refresh()
      navigate('/', { replace: true })
    } catch (err) {
      // V16 t09 review: this write goes through updateHomeZipRadius too, and
      // this picker renders RADIUS_MILES_OPTIONS (so it offers 1 mile). Its
      // catch used to inline `err.message`, which renders the raw PostgREST
      // CHECK text while migration 0045 is unapplied -- the same defect t09
      // fixed on the three Feed/Browse surfaces. Routing it through the shared
      // mapper makes all FOUR call sites say the same thing in English.
      setError(radiusSaveErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Create the profiles row for a first-run parent. Since V28 slice 3b EVERY
   * new account lands here with a session and no row (email signup no longer
   * creates it on /login, and social sign-in never did), and every write on
   * this page (and everywhere else) assumes the row exists.
   * refresh() re-reads the profile, so the location step below renders next.
   */
  async function handleCreateProfile(e: FormEvent) {
    e.preventDefault()
    const nameProblem = displayNameFieldError(firstNameValue, lastNameValue)
    if (nameProblem !== null) {
      setHandleError(nameProblem)
      return
    }
    const name = composeDisplayName(firstNameValue, lastNameValue)
    setHandleBusy(true)
    setHandleError(null)
    try {
      await createProfile(name)
      await refresh()
    } catch (err) {
      setHandleError(
        err instanceof HandleTakenError
          ? `“${name}” is already taken — try adding a middle name or initial.`
          : err instanceof Error
            ? err.message
            : 'Could not save your name. Try again.',
      )
    } finally {
      setHandleBusy(false)
    }
  }

  // V4 slice 4: no profiles row yet (a first-time social sign-in) → the handle
  // step comes FIRST; the location step below can only write to an existing row.
  // V28 slice 3a: this branch is the first run's "name" card ("2 of 5" via
  // progressLabel) rendered in FirstRunCard — the chrome (progress label,
  // masthead, primary action) now lives in the card. The form itself is
  // generalized, not rewritten: the same displayNameFieldError /
  // composeDisplayName / createProfile / HandleTakenError seams and the same
  // role="alert" + fieldA11y/errorId error surface behave exactly as before;
  // the primary control submits it through the HTML `form` attribute
  // (the button renders in the chrome, outside the form element).
  if (profile === null) {
    return (
      <FirstRunCard
        progressLabel={progressLabel('name')}
        title="What’s your name?"
        body="This is how other parents find you in their inbox. It isn’t your email, and you can change it later in your settings."
        primaryLabel={handleBusy ? 'Please wait…' : 'Continue'}
        primaryForm="name"
        primaryDisabled={handleBusy}
        testId="first-run-name-card"
      >
        <form
          id="name"
          className="flex flex-col gap-3"
          onSubmit={(e) => void handleCreateProfile(e)}
        >
          <div className="flex gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              <span className="text-slate-700">First name</span>
              <input
                className={
                  'w-full rounded-xl border px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
                  (handleError !== null ? 'border-red-400' : 'border-slate-300')
                }
                value={firstNameValue}
                onChange={(e) => {
                  setFirstName(e.target.value)
                  setFirstNameTouched(true)
                  setHandleError(null)
                }}
                placeholder="Sam"
                required
                maxLength={40}
                autoComplete="given-name"
                {...fieldA11y('name', handleError)}
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              <span className="text-slate-700">Last name</span>
              <input
                className={
                  'w-full rounded-xl border px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
                  (handleError !== null ? 'border-red-400' : 'border-slate-300')
                }
                value={lastNameValue}
                onChange={(e) => {
                  setLastName(e.target.value)
                  setLastNameTouched(true)
                  setHandleError(null)
                }}
                placeholder="Rivera"
                maxLength={40}
                autoComplete="family-name"
                {...fieldA11y('name', handleError)}
              />
            </label>
          </div>
          {handleError ? <p role="alert" id={errorId('name')} className="text-sm text-red-600">{handleError}</p> : null}
        </form>
      </FirstRunCard>
    )
  }

  if (loadError !== null) {
    return (
      <div className="flex flex-col items-start gap-1 pt-0.5">
        <h1 className="font-display text-xl font-semibold text-slate-900">Set your location</h1>
        <p className="text-sm text-red-600">{loadError}</p>
      </div>
    )
  }

  const kidsAtCap = kidRows.length >= MAX_KIDS_PER_PROFILE

  return (
    <div className="flex flex-col gap-4">
      {/* Frontend-design pass: the location masthead is a printed notice
          heading (display-face h1, quiet tagline), and the zip + radius
          fields stand on the page without their card kit. */}
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-semibold text-slate-900">Set your location</h1>
        <p className="text-sm text-slate-600">
          You’ll see drop-ins near your home zip, within your radius. You can change both
          anytime in your settings.
        </p>
      </header>

      {/* FIRST-USE AUDIT (ticket 02): the parent JUST gave an address and was
          told it would set their location. If the lookup could not match it,
          this screen otherwise reads as "enter your location again" for no
          stated reason. The flag is one-shot (consumed on read), so this note
          belongs to THIS signup and never to a later visit. The copy keeps the
          existing privacy promise and uses no implementation words. */}
      {signupZipUnresolved ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          data-testid="signup-zip-fallback-note"
          role="status"
        >
          <p className="font-medium">Your account is ready — one thing left.</p>
          <p className="mt-1">
            We couldn’t match the address you entered to a ZIP code, so we need your ZIP to
            show drop-ins near you. Your address is still private and never shown to other
            parents.
          </p>
        </div>
      ) : null}

      {knownZips === null ? (
        <p className="py-2 text-sm text-slate-600">
          Loading the zip list…
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Home zip</span>
            <input
              className={
                'w-full rounded-xl border px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
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
              {...fieldA11y('zip', zipError)}
            />
          </label>
          {zipError !== null ? <p role="alert" id={errorId('zip')} className="text-sm text-red-600">{zipError}</p> : null}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Radius</span>
            <select
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
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
          /settings nudge banner keeps prompting until all three are there.
          Frontend-design pass: this block loses its card chrome and reads as
          a titled section of the same notice. */}
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-slate-900">
          Tell parents about your family <span className="font-normal text-slate-500">(optional)</span>
        </h2>

        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Photo</span>
            <label className="inline-flex min-h-11 cursor-pointer items-center self-start rounded-xl border border-slate-300 bg-white px-3 text-base font-medium text-slate-700">
              {photoUploading ? 'Uploading…' : photoAdded ? 'Photo added' : 'Add a photo'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={photoUploading}
                onChange={(e) => void handlePhotoChange(e)}
                {...fieldA11y('photo', photoError)}
              />
            </label>
            {photoError !== null ? <p role="alert" id={errorId('photo')} className="text-sm text-red-600">{photoError}</p> : null}
            {photoCrop.dialog}
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Bio</span>
            <textarea
              className={
                'w-full rounded-xl border px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
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
              {...fieldA11y('bio', bioError)}
            />
            {bioError !== null ? <span role="alert" id={errorId('bio')} className="text-sm text-red-600">{bioError}</span> : null}
          </label>

          <div className="flex flex-col gap-2 text-sm">
            <span className="text-slate-700">Kids (first name + age only)</span>
            {kidRows.length === 0 ? (
              <button
                type="button"
                onClick={() => addKidRow()}
                className="self-start inline-flex min-h-11 items-center rounded-md bg-slate-100 px-3 text-sm font-medium text-slate-600 transition-colors motion-reduce:transition-none hover:bg-slate-200"
              >
                Add a kid
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                {kidRows.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
                      value={row.name}
                      onChange={(e) => updateKidRow(index, { name: e.target.value })}
                      placeholder="First name"
                      maxLength={30}
                      {...fieldA11y('kids', kidsError)}
                    />
                    <input
                      type="number"
                      min={0}
                      max={17}
                      className="w-20 shrink-0 rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
                      value={row.age}
                      onChange={(e) => updateKidRow(index, { age: e.target.value })}
                      placeholder="Age"
                      {...fieldA11y('kids', kidsError)}
                    />
                    <button
                      type="button"
                      onClick={() => removeKidRow(index)}
                      className="inline-flex min-h-11 shrink-0 items-center rounded-md bg-slate-100 px-3 text-sm font-medium text-slate-600 transition-colors motion-reduce:transition-none hover:bg-slate-200"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {kidsAtCap ? null : (
                  <button
                    type="button"
                    onClick={() => addKidRow()}
                    className="self-start inline-flex min-h-11 items-center rounded-md bg-slate-100 px-3 text-sm font-medium text-slate-600 transition-colors motion-reduce:transition-none hover:bg-slate-200"
                  >
                    Add another kid
                  </button>
                )}
              </div>
            )}
            {kidsError !== null ? <p role="alert" id={errorId('kids')} className="text-sm text-red-600">{kidsError}</p> : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={saving || knownZips === null || homeZip.trim() === ''}
          onClick={() => void handleContinue()}
          className="min-h-11 rounded-xl bg-indigo-600 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
          {...fieldA11y('submit', error)}
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
        {error ? <p role="alert" id={errorId('submit')} className="text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  )
}