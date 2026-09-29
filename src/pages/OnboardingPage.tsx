import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useSessionContext } from '../components/SessionProvider'
import { FirstRunCard } from '../components/FirstRunCard'
import { useCropStep } from '../components/useCropStep'
import { addressFieldError, composeDisplayName, displayNameFieldError } from '../lib/account'
import { progressLabel } from '../lib/firstRun'
import { FIRST_RUN_COPY } from '../lib/firstRunCopy'
import {
  addKid,
  createProfile,
  HandleTakenError,
  listKids,
  loadZipCodes,
  MAX_KIDS_PER_PROFILE,
  updateHomeZipRadius,
  uploadAvatar,
  validateKid,
} from '../lib/db'
import { hasAvatarUrl } from '../lib/avatarUrl'
import {
  DEFAULT_RADIUS_MILES,
  milesWord,
  radiusSaveErrorMessage,
  RADIUS_MILES_OPTIONS,
  validateHomeZip,
} from '../lib/feed'
import { splitSuggestedName, suggestedHandle } from '../lib/oauth'
import { ADDRESS_LOOKUP_TIMEOUT_MS, zipFromAddressQueryBounded } from '../lib/geocode'
import { resolveOnboardingRedirect } from '../lib/onboarding'
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
 * voluntary; finishing the run is not. V28 slices 4a/4b: the kids card
 * (3 of 5) writes the kid rows and the photo card (4 of 5) uploads the
 * avatar, each before this page's final view — the location view's one
 * Continue button saves the location (always) and lands on the feed.
 * V28 slice 5: that final view IS the area card (5 of 5, the run's last
 * card) — address-first, ZIP as the fallback it reveals (decision 9): the
 * address is the entry (its bounded lookup, lib/geocode's
 * `zipFromAddressQueryBounded` — the pending-state rule's escape for a
 * required card with no Skip — resolves it to the home zip without the
 * parent typing a ZIP), an unresolvable address (or a timeout that settled
 * to "absent") reveals the ZIP field + the in-card notice, and a typed ZIP
 * always wins. The card's one primary button ("Finish") saves the location
 * and lands on the feed.
 * V28 slice 4c (defect #22): both card gates are fact-aware — a parent who
 * re-enters resumes at the card they LEFT, never a restart: the kids gate
 * closes when the profile already has kids (the page's own lazy listKids
 * read, the same seam as the shell's nudge) and the photo gate closes when
 * the profile has an avatar (lib/avatarUrl's hasAvatarUrl). The session
 * flags (kidsCardDone / photoCardDone) keep a Skip advancing within a run.
 * The optional items that were once collected HERE (V2 ticket 02:
 * photo/bio/kids) are gone from this view: kids and photo moved onto
 * their cards, and the bio left the first run entirely (V28 decision 15 —
 * it stays on /settings and the V27 parent-card editor, never a column).
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  const { session, loading, profile, homeZipSet, refresh } = useSessionContext()

  // V4 slice 4 — the handle step.
  //
  // V20 t06: TWO FIELDS, not one "Display name" box, matching /login's signup
  // form exactly (the same `composeDisplayName` / `displayNameFieldError`
  // seams). A social user's provider may hand us a full name, so the two halves
  // are SPLIT for the fields rather than dropped into one — see
  // `splitSuggestedName`.
  //
  // V28 slice 3c (regression fix): this step is reached by EVERY new account
  // now (email signups since 3b, social sign-ins always), so the email's local
  // part must not seed it — "nicole@x.com" is not a name, and prefilling
  // "nicole" as a first name other parents will see is exactly the bug. So the
  // email fallback is not passed HERE: splitSuggestedName's rule 1 keeps both
  // fields blank when the suggestion is empty, and social sign-ins still
  // prefill from the provider's name metadata (the earlier candidates).
  // `suggestedHandle` itself keeps its email fallback — its tests pin it
  // (this step was its only production call site, and it now passes null);
  // the call site changes, not the helper.
  const suggested = suggestedHandle(session?.user.user_metadata ?? null, null)
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
  // V28 slice 5 — the area card's fields: the address (the card's primary
  // entry, decision 9) and the fallback's revealed state. The signup
  // address's one-shot flag (first-use audit, ticket 02) is gone — its
  // producer left /login in slice 3b and the note is now the card's own
  // in-card notice, triggered by the card's bounded lookup, not a
  // cross-screen flag.
  const [areaAddress, setAreaAddress] = useState('')
  const [areaAddressError, setAreaAddressError] = useState<string | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [zipFallbackShown, setZipFallbackShown] = useState(false)

  // The optional completion items (V2 ticket 02).
  //
  // photoAdded is a boolean, not the File: since the crop step (photo-crop ticket
  // 03) the File is decoded on pick and never needed again — the bitmap is what
  // both the preview and the encoder use — so keeping a reference to it would
  // only be a way to hold a 12MP original in memory for no reason.
  const [photoAdded, setPhotoAdded] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [kidRows, setKidRows] = useState<Array<{ name: string; age: string }>>([])
  const [kidsError, setKidsError] = useState<string | null>(null)
  // V28 slice 4a: the kids card (3 of 5) is its OWN step, between the name
  // card and the location page — the kid rows moved off this page into the
  // card. `kidsCardDone` is set by the card's Continue (after the write) or
  // its Skip (without writing anything). The card's primary control is the
  // one that writes, so it gets its own busy flag distinct from `saving`.
  const [kidsCardDone, setKidsCardDone] = useState(false)
  const [kidsSaving, setKidsSaving] = useState(false)
  // V28 slice 4c: the kids FACT (plan defect #22) — the card sequence must
  // resume from what the profile already has, not from flags that reset on
  // every mount. The page held only local `kidRows` and never read the kids
  // table, so the fact needs its own lazy read: the same seam the shell's
  // resume nudge uses (src/App.tsx — one best-effort listKids read,
  // cancelled on unmount). `null` = the read has not settled, and the kids
  // card must NOT render in that gap — a returning parent with kids would be
  // offered the card (and could re-answer it, calling addKid again)
  // before the fact lands: defect #22's exact write path. Both clauses on
  // the gate are required: the FACT handles the re-entry (a parent who
  // already has kids skips straight past the card); the SESSION flag
  // advances the run (a Skip must move on even though the fact still says
  // "offer again" — firstRun's documented rule for a skipped optional card,
  // so `!hasKids` alone would re-render the card after its own Skip,
  // forever).
  const [hasKids, setHasKids] = useState<boolean | null>(null)
  const [kidsFactError, setKidsFactError] = useState<string | null>(null)

  // V28 slice 4c: the lazy kids read (the shell's nudge uses the same seam,
  // src/App.tsx). It fires once the profile exists — before that the name
  // card owns the screen — and stands down when the session flag has
  // advanced past the card. Best-effort, like the nudge's read: a failed
  // read must never claim the fact, but the card stays skippable, so the
  // failure is a designed error line on the card (Skip advances past it),
  // never a wall.
  useEffect(() => {
    if (session === null || profile === null || kidsCardDone) return
    let cancelled = false
    listKids(session.user.id)
      .then((kids) => {
        if (!cancelled) setHasKids(kids.length > 0)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setHasKids(false)
        setKidsFactError(
          err instanceof Error
            ? `${err.message} You can add your kids later in your settings.`
            : 'Could not check your kids. You can add them later in your settings.',
        )
      })
    return () => {
      cancelled = true
    }
  }, [session, profile, kidsCardDone])
  // V28 slice 4b: the photo card (4 of 5) sits between the kids card and
  // the location view. The upload itself runs in the crop step's confirm
  // (uploadAvatar — see `photoCrop` above), not on Continue: by the time
  // the parent reaches the card's primary control the photo is either
  // uploaded or not, so Continue and Skip both only advance. `photoCardDone`
  // is set by the card's Continue or its Skip (skippable — lib/firstRun's
  // isSkippable('photo'); a skipped photo is kept alive by the /settings
  // nudge banner).
  const [photoCardDone, setPhotoCardDone] = useState(false)

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

  /**
   * V28 slice 4a: the kids card's Continue. Validates the rows with the same
   * pure seam the page always used (`invalidKidRows` → `validateKid`,
   * blank rows skipped), writes ONLY the filled rows through `addKid`
   * (which enforces the `MAX_KIDS_PER_PROFILE` cap itself — the card's
   * "Add another kid" button hides at the cap, this is the defense in
   * depth), and advances the card only after the write succeeds. A write
   * failure is surfaced in the card (`kidsError`, role="alert") and never
   * traps the run: the parent retries Continue, or Skip advances without
   * writing anything (the items are optional — the /settings nudge banner
   * keeps the prompt alive).
   */
  async function handleKidsContinue() {
    if (session === null || kidsSaving) return
    const badKidRows = invalidKidRows()
    if (badKidRows.length > 0) {
      setKidsError(badKidRows.map((bad) => bad.message).join(' '))
      return
    }
    const filledKidRows = kidRows.filter(
      (row) => row.name.trim() !== '' || row.age.trim() !== '',
    )
    if (filledKidRows.length === 0) {
      // Nothing to write — advancing is exactly what Skip does.
      setKidsCardDone(true)
      return
    }
    setKidsSaving(true)
    setKidsError(null)
    let failed = false
    for (const row of filledKidRows) {
      try {
        await addKid(session.user.id, row.name, Number(row.age))
      } catch (err) {
        setKidsError(
          err instanceof Error
            ? `${err.message} You can add your kids later in your settings.`
            : 'Could not add your kids. You can add them later in your settings.',
        )
        failed = true
        break
      }
    }
    setKidsSaving(false)
    // A failed write stays on the card with its error shown (see above);
    // a clean write — or nothing to write — advances to the next view.
    if (!failed) setKidsCardDone(true)
  }

  // V28 slice 5: the area card's (5 of 5) primary action — decision 9,
  // address-first, ZIP as fallback. A TYPED ZIP always wins and needs no
  // lookup: it is validated against the gazetteer (the same
  // `validateHomeZip` gate the card has always had) and written. An ADDRESS
  // runs the BOUNDED lookup — the pending-state rule's escape for this
  // required, non-skippable card: a Nominatim answer that does not settle in
  // time settles to "absent" instead of stalling the run. A resolved zip in
  // the gazetteer is written WITHOUT the parent typing a ZIP; an
  // unresolvable address (or the timeout) reveals the ZIP field + the
  // in-card notice — never blocks, never loses the address (it stays in
  // `areaAddress`).
  async function handleAreaFinish() {
    if (session === null || saving || geocoding || knownZips === null) return
    const typedZip = homeZip.trim()
    if (typedZip !== '') {
      const zipProblem = validateHomeZip(homeZip, knownZips)
      if (zipProblem !== null) {
        setZipError(zipProblem)
        return
      }
      await saveLocation(typedZip)
      return
    }
    // No typed zip: the address is the entry. Only emptiness is judged here —
    // whether it RESOLVES is the geocoder's answer (lib/account's
    // addressFieldError seam, reused, not re-declared).
    const addressProblem = addressFieldError(areaAddress)
    if (addressProblem !== null) {
      setAreaAddressError(addressProblem)
      return
    }
    setAreaAddressError(null)
    setGeocoding(true)
    const resolvedZip = await zipFromAddressQueryBounded(areaAddress, ADDRESS_LOOKUP_TIMEOUT_MS)
    setGeocoding(false)
    if (resolvedZip !== null && validateHomeZip(resolvedZip, knownZips) === null) {
      await saveLocation(resolvedZip)
      return
    }
    // Unresolvable (or the bounded timeout settled to "absent"): the card
    // reveals the ZIP fallback — the notice is the existing one, now
    // re-triggered in-card; the typed address survives in state.
    setZipFallbackShown(true)
  }

  // The location write (V2 ticket 02's radius picker, unchanged in kind):
  // the zip + the radius the card chose, then the feed. Both the typed-zip and
  // the address-resolved legs land here.
  async function saveLocation(zip: string) {
    if (session === null) return
    setSaving(true)
    setError(null)
    try {
      await updateHomeZipRadius(session.user.id, zip, radiusMiles)
      // V28 slices 4a/4b: the optional items no longer write from this
      // handler — the kids card wrote its rows before this card (the photo
      // card's upload ran in its crop step; the bio left the first run
      // entirely). Only the location write remains here.
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
      // the card's picker renders RADIUS_MILES_OPTIONS (so it offers 1 mile).
      // Its catch used to inline `err.message`, which renders the raw
      // PostgREST CHECK text while migration 0045 is unapplied -- the same
      // defect t09 fixed on the three Feed/Browse surfaces. Routing it through
      // the shared mapper makes all FOUR call sites say the same thing in
      // English. The zip the card held (typed or resolved) is not re-derived
      // here — a failed save stays on the card with its error, and the parent
      // retries with what they still see.
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
  // V28 slice 4a: the card's words come from FIRST_RUN_COPY.name, not
  // hard-coded props — the module is the single source of truth (defect
  // #20's fix). This card used to hard-code "What's your name?" while the
  // module said "What should we call you?"; the MODULE's wording wins (it
  // is the tested artifact pinned by firstRunCopy.test.ts), and the
  // hard-coded title/body are gone. Only the busy-state label stays inline:
  // it is a state, not card copy.
  if (profile === null) {
    return (
      <FirstRunCard
        progressLabel={progressLabel('name')}
        title={FIRST_RUN_COPY.name.title}
        body={FIRST_RUN_COPY.name.body}
        primaryLabel={handleBusy ? 'Saving…' : FIRST_RUN_COPY.name.primaryLabel}
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
  // V28 slice 4a: the kids card ("3 of 5") — the first run's card 3, BETWEEN
  // the name card and the location view below. This is a REORDER, not a
  // verbatim lift: the page used to render the photo block before the kids
  // block, and the chosen card order is kids then photo — so the kid rows
  // moved UP into this card (the photo block stays where it is for slice 4b,
  // which turns it into card 4). The words are data from FIRST_RUN_COPY.kids,
  // never hard-coded (the name card above reads its entry the same way).
  // Skip advances without writing anything; Continue writes the filled rows
  // (handleKidsContinue) and only then advances. The kids section below in
  // the family block is gone — this card is the only kids surface on the
  // page, and `kidsAtCap` / the row UI live here now.
  //
  // V28 slice 4c: the gate is FACT-AWARE (plan defect #22) — while the lazy
  // read is in flight the card must not render: a returning parent with kids
  // would be offered the card (and its addKid writes) in the gap, which is
  // the defect's exact write path. A settled `hasKids === true` closes the
  // gate instead — the parent already has kids, so resume at the card they
  // LEFT (the photo card or the location view), never a restart. The flag
  // keeps advancing a Skip within the session (see `hasKids` above).
  const kidsFactPending = !kidsCardDone && hasKids === null
  if (kidsFactPending) {
    return (
      <div className="flex min-h-64 items-center justify-center text-base text-slate-600">
        Checking your kids…
      </div>
    )
  }
  if (!kidsCardDone && !hasKids) {
    const kidsCopy = FIRST_RUN_COPY.kids
    return (
      <FirstRunCard
        progressLabel={progressLabel('kids')}
        title={kidsCopy.title}
        body={kidsCopy.body}
        primaryLabel={kidsSaving ? 'Saving…' : kidsCopy.primaryLabel}
        primaryDisabled={kidsSaving}
        onPrimary={() => void handleKidsContinue()}
        onSkip={() => {
          // Skippable (lib/firstRun's isSkippable('kids')): advance and
          // write nothing — the /settings nudge banner keeps the prompt.
          setKidsCardDone(true)
        }}
        testId="first-run-kids-card"
      >
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
          {kidsFactError !== null ? <p role="alert" className="text-sm text-red-600">{kidsFactError}</p> : null}
          {kidsError !== null ? <p role="alert" id={errorId('kids')} className="text-sm text-red-600">{kidsError}</p> : null}
        </div>
      </FirstRunCard>
    )
  }

  // V28 slice 4b: the photo card ("4 of 5") — the first run's card 4,
  // between the kids card and the location view. The picker and the crop
  // step are the existing avatar pipeline lifted into the card chrome
  // (`photoCrop` above, reused as-is — it validates size and type before
  // decoding): a rejected file shows its existing error (a gate hit in
  // beginCrop, or a failed upload) and never traps the card — Continue
  // stays live and so does Skip. The upload runs on the crop step's
  // confirm, not on Continue; by the time the parent reaches the card's
  // controls the photo is either uploaded or not, so Continue and Skip
  // both only advance (a failed upload leaves `photoError` shown and
  // `photoAdded` false, and the /settings nudge banner keeps the prompt).
  // The words are data from FIRST_RUN_COPY.photo, never hard-coded (the
  // name and kids cards read their entries the same way). The busy-state
  // label ("Saving…" while the confirmed upload is in flight) is one of
  // the two transient strings the sibling cards share, not card copy.
  // V28 slice 4c: the gate is fact-aware too — a parent re-entering with an
  // avatar already on the profile skips straight past the card (the fact
  // handles the re-entry); the session flag still advances a Skip within
  // the run (a skipped photo is re-offered by firstRun's documented rule,
  // so both clauses are required).
  if (!photoCardDone && !hasAvatarUrl(profile.avatar_url)) {
    const photoCopy = FIRST_RUN_COPY.photo
    return (
      <FirstRunCard
        progressLabel={progressLabel('photo')}
        title={photoCopy.title}
        body={photoCopy.body}
        primaryLabel={photoUploading ? 'Saving…' : photoCopy.primaryLabel}
        primaryDisabled={photoUploading}
        onPrimary={() => {
          // The photo write already ran in the crop step — Continue just
          // advances to the location view (skippable, lib/firstRun's
          // isSkippable('photo')).
          setPhotoCardDone(true)
        }}
        onSkip={() => {
          // Skippable: advance without writing anything — the /settings
          // nudge banner keeps the prompt.
          setPhotoCardDone(true)
        }}
        testId="first-run-photo-card"
      >
        <div className="flex flex-col gap-1 text-sm">
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
      </FirstRunCard>
    )
  }

  // V28 slice 5: the AREA card ("5 of 5") — the first run's last card,
  // address-first (decision 9). The address is the entry: its bounded lookup
  // (handleAreaFinish) resolves it to the home zip WITHOUT the parent typing
  // a ZIP, or reveals the fallback below. The fallback — the ZIP field plus
  // the notice — is the existing first-use-audit note, now the card's own
  // in-card trigger (its bounded lookup settled to "absent": an unmatchable
  // address, or a timeout that never settled — the pending-state rule's
  // escape). The notice never blocks (a typed ZIP finishes the card) and
  // never loses the address (it stays in the field above). A typed ZIP
  // always wins, validated by the same validateHomeZip gate. The words are
  // data from FIRST_RUN_COPY.area (the sibling cards read theirs the same
  // way); the busy labels are transient state strings, not card copy.
  const areaCopy = FIRST_RUN_COPY.area
  return (
    <FirstRunCard
      progressLabel={progressLabel('area')}
      title={areaCopy.title}
      body={areaCopy.body}
      primaryLabel={geocoding ? 'Checking your address…' : saving ? 'Saving…' : areaCopy.primaryLabel}
      primaryDisabled={saving || geocoding || knownZips === null}
      onPrimary={() => void handleAreaFinish()}
      testId="first-run-area-card"
    >
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-slate-700">Home address</span>
          <input
            className={
              'w-full rounded-xl border px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
              (areaAddressError !== null ? 'border-red-400' : 'border-slate-300')
            }
            value={areaAddress}
            onChange={(e) => {
              setAreaAddress(e.target.value)
              setAreaAddressError(null)
            }}
            placeholder="e.g. 1200 1st Ave S, Seattle"
            autoComplete="street-address"
            {...fieldA11y('area-address', areaAddressError)}
          />
        </label>
        {areaAddressError !== null ? (
          <p role="alert" id={errorId('area-address')} className="text-red-600">{areaAddressError}</p>
        ) : null}

        {zipFallbackShown ? (
          <>
            {/* FIRST-USE AUDIT (ticket 02), now in-card (V28 slice 5): the
                parent's address did not match a ZIP, so the card asks for the
                ZIP by hand instead of reading as "enter your location again"
                for no stated reason. The copy keeps the existing privacy
                promise and uses no implementation words. */}
            <div
              className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800"
              data-testid="area-zip-fallback-note"
              role="status"
            >
              <p className="font-medium">Your account is ready — one thing left.</p>
              <p className="mt-1">
                We couldn’t match the address you entered to a ZIP code, so we need your ZIP to
                show drop-ins near you. Your address is still private and never shown to other
                parents.
              </p>
            </div>
            <label className="flex flex-col gap-1">
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
            {zipError !== null ? (
              <p role="alert" id={errorId('zip')} className="text-red-600">{zipError}</p>
            ) : null}
          </>
        ) : null}

        {knownZips === null ? (
          <p className="text-slate-600">
            Loading the zip list…
          </p>
        ) : null}

        <label className="flex flex-col gap-1">
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

        {error !== null ? (
          <p role="alert" id={errorId('submit')} className="text-red-600">{error}</p>
        ) : null}
      </div>
    </FirstRunCard>
  )
}