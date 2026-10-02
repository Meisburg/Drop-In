import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useSessionContext } from '../components/SessionProvider'
import { HowItWorksCard } from '../components/HowItWorksCard'
import { FirstRunCard } from '../components/FirstRunCard'
import { useCropStep } from '../components/useCropStep'
import { useKidPhotoUrls } from '../components/useKidPhotoUrls'
import { addressFieldError, composeDisplayName, displayNameFieldError } from '../lib/account'
import { progressLabel, nextUnfinishedCard } from '../lib/firstRun'
import { FIRST_RUN_COPY } from '../lib/firstRunCopy'
import {
  addKid,
  createProfile,
  HandleTakenError,
  kidAgeFromInput,
  listKids,
  loadZipCodes,
  MAX_KIDS_PER_PROFILE,
  removeKid,
  updateHomeZipRadius,
  uploadAvatar,
  uploadKidPhoto,
  validateKid,
} from '../lib/db'
import type { CropRect } from '../lib/photoCrop'
import type { Kid } from '../lib/types'
import {
  DEFAULT_RADIUS_MILES,
  milesWord,
  radiusSaveErrorMessage,
  RADIUS_MILES_OPTIONS,
  validateHomeZip,
} from '../lib/feed'
import type { ZipCoords } from '../lib/feed'
import { splitSuggestedName, suggestedHandle } from '../lib/oauth'
import { ADDRESS_LOOKUP_TIMEOUT_MS, locationFromAddressQueryBounded, type AddressGeocodeResult } from '../lib/geocode'
import { PlacesMap } from '../components/PlaceMapLazy'
import { shouldRenderPlacesMap } from '../lib/mapStrip'
import { PHOTO_UPLOAD_TIMEOUT_MS, photoUploadBlocksContinue } from '../lib/photoUpload'
import { newKidRowKey } from '../lib/kidRowKey'
import { resolveOnboardingRedirect } from '../lib/onboarding'
import { errorId, fieldA11y } from '../lib/a11y'

/**
 * V28 slice 4 — the area card's early-resolution debounce: the address input's
 * BLUR schedules the single lookup after this window, so a blur burst (tap
 * the address, tap the radius picker, tap away) issues at most one request.
 * Interaction timing, so it may live in the page (the build law: the page
 * owns how it renders; the geocode seam itself stays in lib).
 */
const AREA_ADDRESS_LOOKUP_DEBOUNCE_MS = 500

/**
 * The name card's photo-picker label (V28 r2 slice 2) — an if/else chain,
 * not a nested ternary (the project rule, `.opencodereview/rule.json`: "Nested
 * ternary expressions are not allowed"). Presentation only, so it may live in
 * the page (the build law: pages may branch on how to RENDER).
 */
function photoPickerLabel(uploading: boolean, photoAdded: boolean): string {
  if (uploading) return 'Uploading…'
  if (photoAdded) return 'Photo added'
  return 'Add a photo'
}

/**
 * One kids-card row's photo control (V28 r2 slice 3) — a small component
 * rather than a hook-in-a-loop, because `useCropStep` cannot be called inside
 * the `kidRows.map` callback (hooks must run at a component's top level — the
 * same reason ProfilePage's `KidPhotoControl` exists, which this reuses the
 * shape of, not the component: that one requires a persisted `kidId`, which
 * a row this card is still building cannot satisfy). The page owns the
 * shared lock (one row's crop step at a time — `onLockChange`) and the write
 * (`onConfirm`); this component owns only this row's crop step.
 *
 * Kid photos are PRIVATE (the `kid-photos` bucket): `photoUrl` is the SIGNED
 * URL the page mints through `useKidPhotoUrls` — never the raw
 * `kids.avatar_url` column (a post-0038 object path, not a URL).
 */
function KidRowPhoto({
  index,
  rowKey,
  photoUrl,
  storedPhoto,
  locked,
  onBeginError,
  onPickStart,
  onConfirm,
  onLockChange,
}: {
  index: number
  /** The row's STABLE identity (fix round 1, F2): every post-`await` write
      attaches to this, never the array index — a row removed above an
      in-flight confirm re-indexes the array, and an index-attached attach
      would land on the wrong row (or none), re-opening the double-write.
      `index` survives only as the DISPLAY position (the testids). */
  rowKey: string
  /** The signed URL of the row's photo; undefined while the row has no photo
      or until its mint settles (the best-effort read degrades to no image, never an error). */
  photoUrl?: string
  /** The persisted row claims a photo (its `avatar_url` is set) even when
      no signed URL is on hand yet — the control then reads "Photo added"
      rather than offering the pick again as if nothing were there. */
  storedPhoto: boolean
  /** Another row holds the crop-step lock — this row's control is gated so
      two rows never race the shared bitmap's release. */
  locked: boolean
  /** A rejected file (the ≤5MB / image-only gate, an unreadable decode):
      SET on the card, never a silent no-op (fix round 1, F4). Only the SET
      half lives here — the CLEAR half is `onPickStart` below (fix round 2,
      R5): without it a rejected file's message outlived a subsequent valid
      pick, and on a persisted row the name/age inputs are disabled, so
      `updateKidRow` could not clear it either. The name card's parity is in
      the clear-before-each-attempt, not the set. */
  onBeginError: (message: string) => void
  /** A pick attempt STARTED (a file was chosen, before `beginCrop`): the
      page clears the card's error, so a rejected file's message never
      survives the next pick — the same clear-before-each-attempt the name
      card's picker does with `photoError` (fix round 2, R5). */
  onPickStart: () => void
  /** `Promise<void>` on purpose (fix round 1, F6): the hook's `finally`
      closes the bitmap the moment this resolves. A `void`-typed prop is
      what let a fire-and-forget call stay invisible to the type system
      (and hand the encoder a closed 0×0 bitmap) — the ProfilePage bug
      that this typing now makes un-typeable. */
  onConfirm: (rowKey: string, source: ImageBitmap, rect: CropRect) => Promise<void>
  onLockChange: (rowKey: string, locked: boolean) => void
}) {
  const crop = useCropStep(async (source, rect) => {
    // AWAITED, not fire-and-forget: the hook's `finally` closes the bitmap
    // the moment this returns, and the upload must finish BEFORE that close
    // (the hook's own contract).
    await onConfirm(rowKey, source, rect)
  })
  const dialogOpen = crop.dialog !== null
  // Report this row's lock state to the page (its shared flag): open dialog
  // OR in-flight confirm — that is the whole window in which the other
  // rows' controls must stand down. The UNMOUNT cleanup releases it (fix
  // round 1, F5): a row that vanishes (removed above, list shrinks) must
  // not strand the lock — a stranded key would leave the card's Continue
  // disabled for the rest of the mount.
  useEffect(() => {
    onLockChange(rowKey, dialogOpen || crop.busy)
    return () => {
      onLockChange(rowKey, false)
    }
  }, [rowKey, dialogOpen, crop.busy, onLockChange])
  return (
    <>
      <label
        data-testid={`kid-row-photo-${index}`}
        className={
          'flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md bg-slate-100 text-sm font-medium text-slate-600 transition-colors motion-reduce:transition-none hover:bg-slate-200 ' +
          (locked || crop.busy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')
        }
      >
        {photoUrl !== undefined ? (
          <img
            data-testid={`kid-row-photo-img-${index}`}
            src={photoUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <span>{storedPhoto ? 'Photo added' : 'Add photo'}</span>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          data-testid={`kid-row-photo-input-${index}`}
          disabled={locked || crop.busy}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file === undefined || file === null) return
            // R5: clear the card's error BEFORE the attempt (the name card's
            // parity) — a stale rejection must not sit next to the photo a
            // subsequent valid pick + confirm adds.
            onPickStart()
            const error = await crop.beginCrop(file)
            if (error !== null) onBeginError(error)
          }}
        />
      </label>
      {crop.dialog}
    </>
  )
}

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
 * (3 of 4) writes the kid rows before this page's final view (V28 r2 slice 1b
 * deleted the photo card — the parent's photo now lives on the name card,
 * V28 r2 slice 2). The location view's one Continue button saves the location (always)
 * and lands on the feed.
 * V28 slice 5: that final view IS the area card (4 of 4, the run's last
 * card) — address-first, ZIP as the fallback it reveals (decision 9): the
 * address is the entry (its bounded lookup, lib/geocode's
 * `locationFromAddressQueryBounded` — the pending-state rule's escape for a
 * required card with no Skip — resolves it to the home zip without the
 * parent typing a ZIP), an unresolvable address (or a timeout that settled
 * to "absent") reveals the ZIP field + the in-card notice, and a typed ZIP
 * always wins. The card's one primary button ("Finish") saves the location
 * and the run lands on its FINISH CARD (V28 slice 6 — see below).
 * V28 slice 4c (defect #22): the card gate is fact-aware — a parent who
 * re-enters resumes at the card they LEFT, never a restart: the kids gate
 * closes when the profile already has kids (the page's own lazy listKids
 * read, the same seam as the shell's nudge); the photo gate is gone with
 * the photo card (V28 r2 slice 1b — the photo now lives on the name card,
 * V28 r2 slice 2). The session flag (kidsCardDone) keeps a Skip advancing within
 * a run.
 * The optional items that were once collected HERE (V2 ticket 02:
 * photo/bio/kids) are gone from this view: kids moved onto its card (the
 * photo now lives on the name card, V28 r2 slice 2), and the bio left the first run entirely
 * (V28 decision 15 —
 * it stays on /settings and the V27 parent-card editor, never a column).
 *
 * V28 slice 6 (plan defect #19) → V28 r2 slice 5: the run's OWN ending. When
 * the required cards are answered (lib/firstRun's `nextUnfinishedCard` returns
 * null — the single source of truth), the page renders the ending card in
 * place: the "How Drop In works" TOUR (lib/firstRunTour's five lines — the
 * four tabs and the Post action — plus the two Profile capabilities), not the
 * places list r1 shipped. There is NO places read on this path any more: the
 * card teaches what each control DOES rather than naming parks this parent may
 * not have, plus the one CTA that carries the parent to the feed. The re-keyed
 * guard (lib/onboarding's resolveOnboardingRedirect)
 * no longer bounces the finished parent off /onboarding to the feed, and
 * the area card's save no longer navigates — this card IS the landing.
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
  // V28 slice 4: the gazetteer's FULL coordinate map — the area card's own map
  // resolves its pin and circle against it. `knownZips` (the same read's key
  // set) stays for the area card's zip validation.
  const [zipCoords, setZipCoords] = useState<ReadonlyMap<string, ZipCoords> | null>(null)
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
  // V28 slice 4 — THE AREA CARD'S EARLY RESOLUTION. The address resolves on
  // blur (debounced) so ONE Nominatim request yields both the ZIP (for
  // saveLocation) and the pin coordinates below — the card's own map shows
  // the pin + the radius circle the parent is choosing, and Finish reuses
  // the same resolution instead of geocoding again. Editing the address
  // invalidates the pin (a map-shaped claim for an address that no longer
  // holds must not linger).
  const [areaCoordinates, setAreaCoordinates] = useState<{ lat: number; lng: number } | null>(null)
  // The bookkeeping that keeps "one request per distinct address" true
  // (see ensureAddressLookup): which address the in-flight or settled
  // promise belongs to, the promise itself, and the pending debounce timer.
  const areaLookupForRef = useRef<string | null>(null)
  const areaLookupPromiseRef = useRef<Promise<AddressGeocodeResult> | null>(null)
  const areaLookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // V28 slice 4 fix 2 — the CURRENT field text, readable from a STALE
  // closure. handleAreaFinish is the handler of the render that owned the
  // Finish tap; after its `await` resumes, the `areaAddress` state binding
  // in that closure is the text as it was at tap time, not the text the
  // field shows now (React state reads are not live across an await). The
  // re-check at the point of use therefore compares against THIS ref, not
  // the closure's binding. One write site keeps it complete: the address
  // input's onChange (the only setAreaAddress caller) writes both.
  const areaAddressRef = useRef('')
  useEffect(() => {
    // Unmount cancels the debounce window: firing it afterwards would only
    // call setState on an unmounted component. (Above the conditional
    // return below — the rules of hooks, not just convention.)
    return () => {
      if (areaLookupTimerRef.current !== null) {
        clearTimeout(areaLookupTimerRef.current)
        areaLookupTimerRef.current = null
      }
    }
  }, [])

  // The optional completion items (V2 ticket 02): the kid rows. (The photo
  // states photoError / photoGateEscaped now live above, with the crop step —
  // V28 r2 slice 2 moved the photo onto the name card; the in-flight state
  // is the crop step's own `busy` flag, fix round 1.)
  // V28 r2 slice 3: `kid` remembers the PERSISTED row (null until the
  // photo's crop-confirm writes it — handleKidPhotoConfirm below). A row
  // with a kid is never re-written by Continue, and its Remove removes the
  // REAL row, not just the local state. Fix round 1 (F2): `key` is the
  // row's STABLE client identity (minted OUTSIDE the state updater, via
  // lib/kidRowKey's newKidRowKey — fix round 2 R2: updaters are pure,
  // StrictMode double-invokes them, and a `crypto.randomUUID()` inside
  // would mint a different key per invocation; R3: the helper carries the
  // non-secure-context fallback, since a phone on a plain-HTTP LAN address
  // has no `crypto.randomUUID`) — every write after an `await` attaches to
  // it, never the array index (a row removed above an in-flight confirm
  // re-indexes the array; index-attached maps then land on the wrong row,
  // or none). `photoGen` is how many times this row's photo has been
  // (re-)uploaded (fix round 2, R1): a re-pick writes the DETERMINISTIC
  // stored ref `kidPhotoStoredRef(uid, kidId)` — same id, same marker,
  // same `avatar_url` STRING — so the id set alone cannot see NEW BYTES
  // at the same path; only the generation moves. It is folded into
  // `persistedKidKey` below, which is what makes a re-pick re-mint and
  // the `<img>` re-fetch.
  const [kidRows, setKidRows] = useState<Array<{
    key: string
    name: string
    age: string
    photoGen: number
    kid: Kid | null
  }>>([])
  const [kidsError, setKidsError] = useState<string | null>(null)
  // V28 slice 4a: the kids card (3 of 4) is its OWN step, between the name
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
  // V28 r2 slice 3: the shared crop-step lock — one row's crop dialog (or
  // in-flight confirm) at a time, so two rows never race the bitmap's
  // release. Keyed on the row's STABLE identity (fix round 1, F2), and
  // released on the holder's unmount (F5), so the lock can never strand
  // on a nonexistent index. Each row's KidRowPhoto reports its own state
  // here; the other rows gate their controls on it.
  const [kidPhotoLockKey, setKidPhotoLockKey] = useState<string | null>(null)
  const handleKidPhotoLockChange = useCallback((rowKey: string, isLocked: boolean) => {
    setKidPhotoLockKey((prev) => {
      if (isLocked) return rowKey
      if (prev === rowKey) return null
      return prev
    })
  }, [])
  // V28 r2 slice 3: the persisted rows (written by the photo's crop-confirm)
  // — the signed-URL read keys on them (kid photos are private: they render
  // through useKidPhotoUrls, never the raw avatar_url column). Fix round 1
  // (F3): key the memo on the rows' PERSISTED FACTS, NOT on `kidRows` — a
  // keystroke in a non-persisted row's inputs yields a fresh `kidRows`
  // array, and `useKidPhotoUrls`'s minting effect is keyed on the passed
  // array's IDENTITY, so a per-keystroke array re-minted the signed URLs
  // every time. Fix round 2 (R1): the key must change when the IMAGE
  // changes, not just when the id set does. `uploadKidPhoto` writes the
  // DETERMINISTIC ref `kidPhotoStoredRef(uid, kidId)`, so a re-pick on a
  // persisted row leaves the id, the photo marker, AND the `avatar_url`
  // string all unchanged — and a hook that consumes only the id set cannot
  // see NEW BYTES at the same path: without a change signal the memo keeps
  // its identity, the hook never re-mints, and the freshly uploaded photo
  // (which OVERWROTE the canonical path) stays invisible for the rest of
  // the mount — the card shows the OLD image while lying about a re-pick
  // that succeeded. The per-row `photoGen` (bumped by
  // handleKidPhotoConfirm's re-pick branch) is that signal: it moves only
  // when new bytes land at the path. Measured (fix round 1): with the memo
  // keyed on `kidRows`, a keystroke in a non-persisted row re-minted and
  // the settled photo's src SWAPPED to the fresh URL on every keystroke
  // (the render never blanked — the new URL is valid for the same object —
  // but the <img> reloaded every time, and every keystroke paid a batched
  // sign round-trip).
  const persistedKidKey = kidRows
    .map((row) =>
      row.kid === null ? '' : `${row.kid.id}:${row.kid.avatar_url ? 1 : 0}:${row.photoGen}`,
    )
    .join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const persistedKids = useMemo(
    () => kidRows.map((row) => row.kid).filter((kid): kid is Kid => kid !== null),
    // The array must keep its identity across keystrokes (F3); the key
    // above is the memo's honest input (see its comment).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persistedKidKey],
  )
  const kidPhotoUrls = useKidPhotoUrls(session?.user.id ?? null, persistedKids)

  // V28 r2 slice 2: the photo card is GONE — the parent's photo now lives on
  // the NAME card, which is also the card that CREATES the profiles row. So
  // the crop step runs BEFORE the row exists: `uploadAvatar`'s storage-object
  // write lands anyway (the owner-scoped policy keys on auth.uid, not the
  // row), but its profiles.avatar_url UPDATE matches zero rows and PostgREST
  // no-ops a 0-row update SILENTLY — that no-op is load-bearing here, and if
  // `uploadAvatar` is ever hardened to throw on a 0-row update, this call
  // site breaks first. The returned public URL is held in `pendingAvatarUrl`
  // and handed to `createProfile`'s insert, which links it to the new row.
  //
  // The upload itself runs on the crop step's CONFIRM — the shape the
  // deleted photo card had. Fix round 1 (the in-flight race the ruling drew
  // the line on): a FAILED upload never blocks Continue (the photo is
  // optional, the profile write stands on its own), but an IN-FLIGHT one
  // does — otherwise a Continue tapped mid-upload creates the row with
  // avatar_url NULL and the late URL is read by nothing (the orphan the
  // ruling exists to prevent). The in-flight state has the crop step's own
  // `busy` flag as its single source of truth (no parallel mirror state —
  // the hook owns its lifetime); `photoGateEscaped` below is the pending-
  // state rule's bounded escape: a HUNG upload must never trap the parent,
  // so after `PHOTO_UPLOAD_TIMEOUT_MS` the card surfaces the photo error
  // and lets Continue proceed without the photo.
  const [photoError, setPhotoError] = useState<string | null>(null)
  // The bounded escape's flag: the in-flight wait has expired, so a still-
  // in-flight (hung) upload no longer blocks Continue. Inert while nothing
  // is in flight — it only reads together with `photoCrop.busy`.
  const [photoGateEscaped, setPhotoGateEscaped] = useState(false)
  // The public URL the confirmed crop returned, held until the name card's
  // Continue creates the row it belongs to. It survives a FAILED Continue
  // (a taken handle) so the retry links the same upload — nothing is
  // re-encoded or re-uploaded.
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string | null>(null)
  const photoCrop = useCropStep(async (source, rect) => {
    if (session === null) return
    setPhotoError(null)
    // Re-arm the gate for this upload: a re-pick blocks again, even after a
    // previous upload's escape fired.
    setPhotoGateEscaped(false)
    let settled = false
    // The bounded escape (the ADDRESS_LOOKUP_TIMEOUT_MS idiom): a storage
    // write that has not settled within the bound flips the flag — the card
    // surfaces the error and unblocks Continue (the run proceeds without
    // the photo; the late-arriving upload then leaves an orphaned object,
    // the documented trade of the escape, strictly better than a wall).
    const escapeTimer = setTimeout(() => {
      if (settled) return
      setPhotoGateEscaped(true)
      setPhotoError('Your photo is still uploading — continue without it for now. You can add it later in settings.')
    }, PHOTO_UPLOAD_TIMEOUT_MS)
    try {
      const url = await uploadAvatar(session.user.id, source, rect)
      settled = true
      setPendingAvatarUrl(url)
      // The upload settled (before or after the escape fired): clear the
      // escape's error if it showed, and the flag — both are inert once the
      // upload is out of flight, but resetting keeps the invariant "the
      // flag only reads true while an in-flight upload is past the bound".
      setPhotoError(null)
      setPhotoGateEscaped(false)
    } catch (err) {
      settled = true
      setPhotoError(
        err instanceof Error ? err.message : 'Could not upload the photo. You can add it later.',
      )
      // A failure is SETTLED, not in flight: the gate never reads it
      // (photoCrop.busy is false by the time this runs), so the escape
      // flag stays inert — a failed upload never blocks Continue.
      setPhotoGateEscaped(false)
    } finally {
      clearTimeout(escapeTimer)
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
        if (cancelled) return
        // V28 slice 6: keep the full map (the finish card's selection ranks
        // against these coordinates), not just the key set.
        setKnownZips(new Set(coords.keys()))
        setZipCoords(coords)
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return
        }
        setLoadError(err instanceof Error ? err.message : 'Could not load the zip list.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // V28 slice 6 (defect #19): the run is OVER when the required cards are
  // answered — lib/firstRun's own null rule is the single source of truth
  // (signed in + named + zip set; the kids fact cannot block it
  // once the zip is set). While it is, the page ends on the FINISH CARD
  // (rendered below), never a feed bounce.
  const runOver =
    session !== null &&
    profile !== null &&
    homeZipSet &&
    nextUnfinishedCard({
      signedIn: true,
      hasName: true,
      hasKids: hasKids === true,
      hasZip: true,
    }) === null

  // V28 r2 slice 5: the ending card needs NO read of its own. The places
  // selection this effect used to run (the directory read, ranked against the
  // gazetteer by distance and published hours) left the run with the list it
  // fed — the tour card teaches what the controls do, which is true whether or
  // not anything is posted near the parent.

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-base text-slate-600">
        Loading…
      </div>
    )
  }

  // Self-contained guard: signed-out visitors are bounced to /login — the
  // shell applies the same gate one level up. (V28 slice 6 re-key: a
  // FINISHED parent is no longer bounced to the feed — the run's own
  // finish card, rendered below, is the ending.)
  const redirect = resolveOnboardingRedirect(session !== null)
  if (redirect !== null) return <Navigate to={redirect} replace />

  // The avatar upload (V2 ticket 02; the crop step added by photo-crop
  // ticket 03) ran in the photo card's crop step (handlePhotoChange →
  // photoCrop.beginCrop → uploadAvatar). V28 r2 slice 1b deleted the card
  // and that handler; the photo now lives on the name card (V28 r2 slice 2).

  function addKidRow() {
    setKidsError(null)
    // R2: minted OUTSIDE the updater (it is pure — see the state's comment);
    // R3: the lib helper (the non-secure-context fallback a bare
    // `crypto.randomUUID()` would throw on a phone at a LAN address).
    const key = newKidRowKey()
    setKidRows((rows) => [...rows, { key, name: '', age: '', photoGen: 0, kid: null }])
  }

  /** Fix round 1 (F2): keyed on the row's stable identity, never the array
      index — a row removed above an in-flight confirm re-indexes the
      array, and an index-attached update would land on the wrong row. */
  function updateKidRow(rowKey: string, patch: { name?: string; age?: string }) {
    setKidsError(null)
    setKidRows((rows) =>
      rows.map((row) => (row.key === rowKey ? { ...row, ...patch } : row)),
    )
  }

  /**
   * Remove a kid row (V28 r2 slice 3 made removal a real thing for
   * photo-confirmed rows). A row the photo's crop-confirm persisted (its
   * `kid` is set) is a REAL DB row: removing it must delete the row
   * (`removeKid`), not just drop the local state — otherwise the parent
   * would "delete" a kid that still exists. The local state drops only
   * AFTER the delete lands, so a failed removal keeps the row and shows an
   * error — never a silent success. A local-only row (never persisted)
   * still just drops state, as before. Fix round 1 (F2): keyed on the row's
   * stable identity; the drop is a functional filter (no captured index).
   */
  async function removeKidRow(rowKey: string) {
    setKidsError(null)
    const row = kidRows.find((r) => r.key === rowKey)
    if (row === undefined) return
    if (row.kid === null) {
      setKidRows((rows) => rows.filter((r) => r.key !== rowKey))
      return
    }
    if (session === null) return
    try {
      await removeKid(session.user.id, row.kid.id)
      setKidRows((rows) => rows.filter((r) => r.key !== rowKey))
    } catch (err) {
      // The real row still exists — keep the local row (do not pretend it
      // is gone) and surface the error.
      setKidsError(
        err instanceof Error
          ? `${err.message} You can manage your kids later in settings.`
          : 'Could not remove your kid. You can manage them later in settings.',
      )
    }
  }

  /**
   * Filled-in kid rows must validate (pure, `src/lib/db.ts`); blank rows
   * are skipped, not written (the pre-slice behavior). Fix round 1 (F1):
   * the blank-age mirror — `Number('')` is 0, and 0 is a LEGAL age
   * (`validateKidAge` passes it), so a blank age maps to NaN: a name-only
   * row is refused, never fabricated into an age-0 kid. Fix round 1 (F2):
   * the key names the failing row (only the message is consumed today).
   */
  function invalidKidRows(): Array<{ key: string; message: string }> {
    const bad: Array<{ key: string; message: string }> = []
    for (const row of kidRows) {
      if (row.name.trim() === '' && row.age.trim() === '') continue
      // R4: the blank-age rule in its one domain home (kidAgeFromInput,
      // next to validateKidAge in lib/db) — blank → NaN, never 0.
      const age = kidAgeFromInput(row.age)
      const kidError = validateKid(row.name, age)
      if (kidError !== null) bad.push({ key: row.key, message: kidError })
    }
    return bad
  }

  /**
   * V28 r2 slice 3: the kid-photo write, run at the crop step's confirm
   * (the shape the ordering decided). `useCropStep` closes the bitmap in
   * its `finally` the moment `onConfirm` resolves — there is no "crop now,
   * upload later" — and `uploadKidPhoto` needs a persisted kid id. So the
   * ROW is written here: validate (the same pure seam Continue uses) →
   * `addKid` (the id is KEPT this time) → `uploadKidPhoto`, in that
   * order, before the bitmap is released. Neither direction orphans
   * anything (acceptance 4): the photo is never attached to a row that
   * does not exist (addKid first), and a row written here is remembered on
   * it (`kid` set) — so Continue never writes it twice, and Remove removes
   * the real row. An upload failure still keeps the row (it exists):
   * Continue skips it, Remove deletes it, and the photo stays optional
   * (the /profile control can add it later). Fix round 1 (F1): the
   * validation mirrors `invalidKidRows` EXACTLY — a fully-blank row is
   * skipped (never written), and a blank age is NaN, never `Number('')`
   * === 0 (0 is a legal age, so a name-only row is refused, not
   * fabricated into an age-0 kid). Fix round 1 (F2): keyed on the row's
   * stable identity — every post-`await` attach below finds the row by
   * `key`, so a row removed above an in-flight confirm cannot re-index the
   * array out from under it.
   */
  async function handleKidPhotoConfirm(rowKey: string, source: ImageBitmap, rect: CropRect) {
    if (session === null) return
    const row = kidRows.find((r) => r.key === rowKey)
    if (row === undefined) return
    if (row.kid !== null) {
      // A re-pick on a row that is ALREADY persisted: the row exists, so
      // this is only the upload (the object is overwritten at its stable
      // canonical path).
      try {
        const storedRef = await uploadKidPhoto(session.user.id, row.kid.id, source, rect)
        setKidRows((rows) =>
          rows.map((r) =>
            r.key === rowKey && r.kid !== null
              ? {
                  ...r,
                  kid: { ...r.kid, avatar_url: storedRef },
                  // R1: the re-pick just overwrote the canonical path with
                  // NEW bytes. `storedRef` is the SAME deterministic string
                  // it already was, so the id set + photo marker would not
                  // have seen this — the generation bump is the move that
                  // carries "the image changed" into `persistedKidKey` and
                  // re-mints (the <img> re-fetches the fresh URL).
                  photoGen: r.photoGen + 1,
                }
              : r,
          ),
        )
      } catch {
        // Honest, card-usable: the row and its existing photo are intact.
        setKidsError('Could not upload your kid’s photo. You can try again later in settings.')
      }
      return
    }
    // 0. Mirror `invalidKidRows` (F1): a fully-blank row is skipped, not
    //    written — same as Continue's blank-row rule.
    if (row.name.trim() === '' && row.age.trim() === '') return
    // 1. The same pure seam the card has always used — with the SAME
    //    blank-age mirror (F1) in its ONE domain home (R4: kidAgeFromInput
    //    next to validateKidAge in lib/db): blank age → NaN, never
    //    `Number('')` === 0.
    const age = kidAgeFromInput(row.age)
    const kidError = validateKid(row.name, age)
    if (kidError !== null) {
      // Not written, not uploaded — the card stays usable with the same
      // message Continue would show.
      setKidsError(kidError)
      return
    }
    // 2. Write the row and KEEP its id (the part the card used to throw
    // away, which made the photo write impossible).
    let kid: Kid
    try {
      kid = await addKid(session.user.id, row.name, age)
    } catch (err) {
      // The cap surfaces here (addKid enforces MAX_KIDS_PER_PROFILE), as
      // an honest card error — never a stuck run. Nothing was written.
      setKidsError(
        err instanceof Error
          ? `${err.message} You can add your kids later in settings.`
          : 'Could not add your kids. You can add them later in settings.',
      )
      return
    }
    // 3. Upload the photo onto THAT row — before the hook's `finally`
    // releases the bitmap.
    try {
      const storedRef = await uploadKidPhoto(session.user.id, kid.id, source, rect)
      setKidRows((rows) =>
        rows.map((r) => (r.key === rowKey ? { ...r, kid: { ...kid, avatar_url: storedRef } } : r)),
      )
    } catch {
      // The upload failed but the row was just written — keep it in local
      // state so Continue never writes it twice and Remove can remove the
      // real row. The photo stays optional.
      setKidRows((rows) => rows.map((r) => (r.key === rowKey ? { ...r, kid } : r)))
      setKidsError('Your kid was added, but their photo could not be uploaded. You can add it later in settings.')
    }
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
   *
   * V28 r2 slice 3: rows the photo's crop-confirm already persisted
   * (`row.kid` set) are NOT written again — writing them would add the same
   * kid twice. A card whose filled rows are all persisted advances having
   * written nothing, which is what advancing means.
   */
  async function handleKidsContinue() {
    if (session === null || kidsSaving) return
    const badKidRows = invalidKidRows()
    if (badKidRows.length > 0) {
      setKidsError(badKidRows.map((bad) => bad.message).join(' '))
      return
    }
    // Only the filled rows WITHOUT a persisted id — those are the only
    // rows that still need a write.
    const pendingKidRows = kidRows.filter(
      (row) =>
        row.kid === null && (row.name.trim() !== '' || row.age.trim() !== ''),
    )
    if (pendingKidRows.length === 0) {
      // Nothing to write — advancing is exactly what Skip does (this also
      // covers a card whose filled rows are all already persisted).
      setKidsCardDone(true)
      return
    }
    setKidsSaving(true)
    setKidsError(null)
    let failed = false
    for (const row of pendingKidRows) {
      try {
        // R4: the SAME helper as the other two sites — pre-R4 this write
        // used a bare `Number(row.age)` (blank → 0, a fabricated age-0 kid)
        // that was safe only because invalidKidRows ran first, and that
        // order of two unrelated statements is what a future edit could
        // delete. The helper makes the rule order-independent.
        await addKid(session.user.id, row.name, kidAgeFromInput(row.age))
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

  // V28 slice 5: the area card's (4 of 4) primary action — decision 9,
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
  //
  // V28 slice 4: the address's RESOLUTION IS THE EARLY ONE — the blur-debounced
  // lookup the card scheduled is awaited HERE, never re-fired: Finish reuses
  // the in-flight or settled promise (exactly one Nominatim request per
  // distinct address), so a blur + Finish on the same address cannot
  // double-fetch, and the card's map (the pin + radius circle) was already
  // showing what this save will write.
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
    // Reuse the early resolution: the promise the blur path scheduled (or a
    // fresh single one, if the address changed since the last lookup). A
    // rejected lookup settles to the null shape here (the seam's
    // real-failure path) — the fallback below is still the escape.
    const addressAtTap = areaAddress
    const resolution = await ensureAddressLookup(addressAtTap)
    // V28 slice 4 fix 2 (F1): RE-CHECK AT THE POINT OF USE. The await above
    // was a lookup for the address the field held when Finish was TAPPED.
    // The edit handler may have moved the field mid-flight: its slot
    // invalidation makes the stale settle settle SUPPRESSED (the display
    // invariant — no pin over the edited text), but a suppressed settle
    // still returns its (unpublished) result value to THIS caller.
    // Consuming it would write the OLD address's zip while the card shows
    // the new text — the save-path face of this slice's invariant:
    // every claim the card makes, what the map shows AND what Finish
    // writes, corresponds to the CURRENT field text, or to nothing. So if
    // the field moved, refuse to consume — no save, and no fallback reveal
    // (the new text owns its own resolution, via its blur lookup or the
    // next Finish tap). The card stays exactly where the parent left it:
    // usable, not a wall. (The chosen shape is re-check, not
    // prevent-interleaving: locking the field for the duration of a
    // Finish-initiated lookup is a new stuck-state surface — this batch
    // has found three walls, and the pending-state rule's escape would
    // need its own six-path audit. The re-check is six lines and leaves
    // the field editable on every path.)
    //
    // The comparison reads the REF, not the closure's `areaAddress`:
    // this handler is the render that owned the tap, and state reads do
    // not go live across the await — comparing the closure's binding
    // against itself would be `A !== A`, a re-check that can never fire
    // (the first draft of this fix had exactly that defect, and the
    // spec leg stayed red for it). The ref is written by the one
    // setAreaAddress site (the onChange below), so it is the current text.
    if (addressAtTap !== areaAddressRef.current) return
    if (resolution.zip !== null && validateHomeZip(resolution.zip, knownZips) === null) {
      await saveLocation(resolution.zip)
      return
    }
    // Unresolvable (or the bounded timeout settled to "absent"): the card
    // reveals the ZIP fallback — the notice is the existing one, now
    // re-triggered in-card; the typed address survives in state.
    setZipFallbackShown(true)
  }

  /**
   * V28 slice 4 — THE AREA CARD'S SINGLE RESOLUTION PER ADDRESS (the early,
   * blur-scheduled geocode the card's map and Finish both consume).
   *
   * ONE DOOR TO THE LOOKUP, which is what makes "exactly one Nominatim
   * request per distinct address" hold:
   *
   *   - the address input's blur handler schedules it debounced
   *     (`scheduleAddressLookup`), so the card shows the pin + radius
   *     circle while the parent still looks at it, not only at Finish;
   *   - `handleAreaFinish` awaits it for the SAME address: an in-flight or
   *     already-settled promise is returned as-is, never a second request
   *     (the acceptance's blur + Finish non-double-fire);
   *   - an EDITED address is a distinct address and gets its own single
   *     request; the older promise's settle is suppressed by the ownership
   *     check (`areaLookupForRef`), so its coordinates — for an address the
   *     card no longer shows — are never published.
   *
   * A settled null zip (an unresolvable address, or the bounded deadline)
   * reveals the ZIP fallback; a resolved zip hides it again (the address
   * WILL finish the card without one typed). Rejection settles to the null
   * shape too — a failed lookup is a failed lookup, not a stall: the card's
   * pending state is bounded by `ADDRESS_LOOKUP_TIMEOUT_MS` and its escape
   * is the fallback, the pending-state rule's first form.
   */
  function ensureAddressLookup(query: string): Promise<AddressGeocodeResult> {
    const trimmed = query.trim()
    const existing = areaLookupPromiseRef.current
    if (existing !== null && areaLookupForRef.current === trimmed) {
      // Already asked for THIS address (in flight or settled): the single
      // request is the one in the slot. A settled promise publishes nothing
      // new, so re-reading it here is the reuse, not a second fetch.
      //
      // F2 (slice 4 fix 2): THAT sentence is true only under a condition it
      // does not state, and the condition lives in the edit handler's
      // comment below (the V28 slice 4 fix 1 block on `onChange`) —
      // SLOT CONSISTENCY: the two lookup refs are only ever mutated TOGETHER
      // (the edit and the empty-query leg null both; a fresh lookup sets
      // both), so the slot can never hold one address's name with another's
      // promise, AND the edit clears the slot, so a settled promise whose
      // published coordinates were nulled cannot linger under a stale owner.
      // Under that condition a settled slot promise has already published
      // (its settle ran with the owner still matching), so reuse is safe
      // and a resolved address never leaves the map hidden (the second
      // fix-1 leg pins it). Read in isolation — "a settled promise
      // publishes nothing new" — the premise is false in context: the
      // promise may have settled SUPPRESSED (owner moved), in which case it
      // published nothing at all. That is the same "premise true in
      // isolation, false in context" class that produced B2; the
      // cross-reference is what keeps this sentence from being read as a
      // general truth.
      return existing
    }
    if (trimmed === '') {
      // No address to resolve: clear the slot (a later, non-empty address
      // must get its own request) and settle to absent immediately.
      areaLookupForRef.current = null
      areaLookupPromiseRef.current = null
      return Promise.resolve({ zip: null, coordinates: null })
    }
    const owned = trimmed
    const promise = locationFromAddressQueryBounded(owned, ADDRESS_LOOKUP_TIMEOUT_MS)
      .then((result) => {
        if (areaLookupForRef.current !== owned) return result
        setAreaCoordinates(result.coordinates)
        setGeocoding(false)
        setZipFallbackShown(result.zip === null)
        return result
      })
      .catch(() => {
        const absent: AddressGeocodeResult = { zip: null, coordinates: null }
        if (areaLookupForRef.current !== owned) return absent
        setAreaCoordinates(null)
        setGeocoding(false)
        setZipFallbackShown(true)
        return absent
      })
    areaLookupForRef.current = trimmed
    areaLookupPromiseRef.current = promise
    // Only a FRESH promise puts the card in its pending state; reusing the
    // slot (above) must never re-enable the disabled button.
    setGeocoding(true)
    return promise
  }

  /**
   * V28 slice 4 — the blur-side of the early resolution: DEBOUNCED, so a
   * blur burst (tap the address, tap the radius picker, tap away) issues at
   * most one request; the focus handler cancels the pending window (the
   * value at the last blur is stale the moment the parent goes back into
   * the field). `ensureAddressLookup` is the no-op when the address was
   * already looked up, so the per-address single request is its invariant,
   * not this handler's.
   */
  function scheduleAddressLookup() {
    const query = areaAddress
    if (areaLookupTimerRef.current !== null) clearTimeout(areaLookupTimerRef.current)
    areaLookupTimerRef.current = setTimeout(() => {
      areaLookupTimerRef.current = null
      void ensureAddressLookup(query)
    }, AREA_ADDRESS_LOOKUP_DEBOUNCE_MS)
  }

  function cancelScheduledAddressLookup() {
    if (areaLookupTimerRef.current !== null) {
      clearTimeout(areaLookupTimerRef.current)
      areaLookupTimerRef.current = null
    }
  }

  // The location write (V2 ticket 02's radius picker, unchanged in kind):
  // the zip + the radius the card chose. V28 slice 6: no navigation here —
  // the save flips homeZipSet, the re-keyed guard renders the run's FINISH
  // CARD in place (the feed bounce this handler used to perform is the one
  // the re-key removed, plan defect #19), and the card's own CTA is the way
  // to the feed. Both the typed-zip and the address-resolved legs land here.
  async function saveLocation(zip: string) {
    if (session === null) return
    setSaving(true)
    setError(null)
    try {
      await updateHomeZipRadius(session.user.id, zip, radiusMiles)
      // V28 slices 4a/4b: the optional items no longer write from this
      // handler — the kids card wrote its rows before this card (the photo
      // left the card sequence in V28 r2 — it now lives on the name card,
      // V28 r2 slice 2; the bio left the first run entirely). Only the location write
      // remains here.
      // Refresh the shared session state before the card swap: homeZipSet
      // is what the page's own finish-card branch (and every other
      // route's) re-checks. Since V28 slice 2b the shell's onboarding gate
      // no longer keys on the home zip, and the header shows no zip at all
      // — this keeps the shared state, not the chrome, current.
      await refresh()
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
   * The name card's photo picker (V28 r2 slice 2 — the deleted photo
   * card's `handlePhotoChange`, re-homed onto the card): the ≤5MB /
   * image-only gate and the decode run inside the crop step (beginCrop),
   * and the upload runs on the dialog's confirm (`photoCrop` above). A
   * rejected file shows its error and the picker stays live for a retry.
   */
  async function handleNameCardPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = '' // allow re-picking the same file
    if (file === null) return
    setPhotoError(null)
    const error = await photoCrop.beginCrop(file)
    if (error !== null) setPhotoError(error)
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
      // The confirmed crop's URL (if the parent picked a photo) links into
      // the row this write creates — see the crop step above for why the
      // upload ran before the row existed. Cleared only on SUCCESS: a
      // failed write keeps the URL so the retry links the same upload. (The
      // escape path — the parent continued WHILE the upload was still in
      // flight, past the bound — reaches here with `pendingAvatarUrl` still
      // null: the row is born without the photo, and the late upload leaves
      // an orphaned object, the escape's documented trade.)
      await createProfile(name, pendingAvatarUrl ?? undefined)
      setPendingAvatarUrl(null)
      await refresh()
    } catch (err) {
      setHandleError(
        err instanceof HandleTakenError
          ? `“${name}” is already taken — try a different first or last name.`
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
  // V28 slice 3a: this branch is the first run's "name" card ("2 of 4" via
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
  // V28 r2 slice 2: the parent's PHOTO JOINS THE CARD (the standalone photo
  // card was deleted in 1b): the picker sits under the two name fields,
  // OUTSIDE the form (the photo is not form data — Continue submits the
  // form alone). Fix round 1 (the in-flight race): an IN-FLIGHT upload gates
  // Continue (so the URL is known before the row is written — lib/photoUpload
  // owns the decision), bounded by PHOTO_UPLOAD_TIMEOUT_MS (the escape:
  // a hung upload must never trap the parent, it surfaces the error and the
  // run proceeds without the photo); a FAILED upload never gates it. A
  // parent who skips the photo walks the hop exactly as before (e2e/fixtures'
  // signUpViewer fills the two name fields and clicks Continue with no photo
  // at all).
  if (profile === null) {
    return (
      <FirstRunCard
        progressLabel={progressLabel('name')}
        title={FIRST_RUN_COPY.name.title}
        body={FIRST_RUN_COPY.name.body}
        primaryLabel={handleBusy ? 'Saving…' : FIRST_RUN_COPY.name.primaryLabel}
        primaryForm="name"
        // Fix round 1: an IN-FLIGHT photo upload gates Continue (the URL must
        // be known before the row is written) — but the gate carries the
        // pending-state rule's bounded escape (photoGateEscaped), so a HUNG
        // upload never traps the parent. A FAILED upload never gates: it is
        // settled, so `photoCrop.busy` is false by the time it matters.
        primaryDisabled={handleBusy || photoUploadBlocksContinue(photoCrop.busy, photoGateEscaped)}
        testId="first-run-name-card"
      >
        <div className="flex flex-col gap-3">
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
          {/* V28 r2 slice 2: the photo block (the deleted card's picker,
              re-homed). "Add a photo" reuses the deleted card's title
              verbatim — a parent already saw it in the playtest; the card
              is not skippable, so there is no Skip control here (the
              photo is simply optional: Continue walks without it). */}
          <div className="flex flex-col gap-1 text-sm">
            <label className="inline-flex min-h-11 cursor-pointer items-center self-start rounded-xl border border-slate-300 bg-white px-3 text-base font-medium text-slate-700">
              {photoPickerLabel(photoCrop.busy, pendingAvatarUrl !== null)}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                data-testid="name-card-photo-input"
                disabled={photoCrop.busy}
                onChange={(e) => void handleNameCardPhotoChange(e)}
                {...fieldA11y('name-photo', photoError)}
              />
            </label>
            {photoError !== null ? <p role="alert" id={errorId('name-photo')} className="text-sm text-red-600">{photoError}</p> : null}
            {photoCrop.dialog}
          </div>
        </div>
      </FirstRunCard>
    )
  }

  // V28 slice 6 (defect #19) → V28 r2 slice 5: the run is OVER → the TOUR CARD
  // is the run's ending, rendered IN PLACE (before the kids-fact gate so a
  // finished parent never sees "Checking your kids…" or gets the kids card
  // re-offered after a completed run). The re-keyed guard above no longer
  // bounces this parent to the feed, so this card is the landing — and it is
  // the bridge: the nav does not render during the run at all (App.tsx's
  // `navRenders`), so this is the first time the parent sees the four tabs and
  // the centre Post action, and its CTA is the crossing. It also renders AHEAD
  // of the loadError check below — and that combination is REACHABLE, not
  // theoretical: `homeZipSet` comes from the DB profile read (`useSession`,
  // db.ts), not from a save in this mount, so a returning parent whose
  // `loadZipCodes()` (the gazetteer) fails is simultaneously `runOver` and
  // `loadError`. The tour still wins it, correctly: it performs no read of its
  // own, and the error line below is the AREA card's error state — showing it
  // here would report a failure on a card this parent is no longer on.
  // (Pre-existing ordering; V28 r2 slice 5 only removed the places read that
  // used to sit on this path.)
  if (runOver) {
    return <HowItWorksCard onGoToFeed={() => navigate('/', { replace: true })} />
  }

  if (loadError !== null) {
    return (
      <div className="flex flex-col items-start gap-1 pt-0.5">
        {/* V28 slice 5 (fix 1): the step is the AREA card now, so the error
            state says the card's own title (the same FIRST_RUN_COPY.area data
            the card below reads) — not the old bare "Set your location"
            masthead the card replaced. */}
        <h1 className="font-display text-xl font-semibold text-slate-900">
          {FIRST_RUN_COPY.area.title}
        </h1>
        <p className="text-sm text-red-600">{loadError}</p>
      </div>
    )
  }

  const kidsAtCap = kidRows.length >= MAX_KIDS_PER_PROFILE
  // V28 slice 4a: the kids card ("3 of 4") — the first run's card 3, BETWEEN
  // the name card and the location view below. This is a REORDER, not a
  // verbatim lift: the page used to render the photo block before the kids
  // block, and the chosen card order was kids then photo — so the kid rows
  // moved UP into this card. (V28 r2 slice 1b deleted the photo card;
  // the photo now lives on the name card, V28 r2 slice 2.) The words are data from
  // FIRST_RUN_COPY.kids,
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
  // LEFT (the area card — the run's last card), never a restart. The flag
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
        // V28 r2 slice 3: Continue is also held while a row's photo confirm is
        // in flight (the lock) — a Continue tapped mid-confirm would write the
        // row a second time (the slice-2 in-flight ruling, applied to the kid
        // photo write: the row lands at confirm, so the card's own write must
        // stand down until it has).
        primaryLabel={kidsSaving ? 'Saving…' : kidsCopy.primaryLabel}
        primaryDisabled={kidsSaving || kidPhotoLockKey !== null}
        onPrimary={() => void handleKidsContinue()}
        onSkip={() => {
          // Skippable (lib/firstRun's isSkippable('kids')): advance and
          // write nothing — the /settings nudge banner keeps the prompt.
          setKidsCardDone(true)
        }}
        // V28 r2 slice 6a: the chrome renders this word verbatim (it has no
        // label of its own), so the module's copy is what the button says —
        // and the e2e specs' getByRole('button', { name: 'Skip' }) targets it.
        skipLabel={kidsCopy.skipLabel}
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
                <div key={row.key} className="flex items-center gap-2">
                  {/* V28 r2 slice 3: the photo control. The photo is
                      OPTIONAL (never blocks Continue) and PRIVATE — it
                      renders through the signed URL (`kidPhotoUrls`,
                      minted by useKidPhotoUrls), never the raw
                      avatar_url column. A persisted row's name/age are
                      frozen (its values were written at the photo's
                      crop-confirm — editing them here could not reach the
                      DB), while Remove removes the real row. */}
                  <KidRowPhoto
                    index={index}
                    rowKey={row.key}
                    photoUrl={row.kid !== null ? kidPhotoUrls[row.kid.id] : undefined}
                    storedPhoto={row.kid !== null && row.kid.avatar_url !== null && row.kid.avatar_url !== ''}
                    locked={kidPhotoLockKey !== null && kidPhotoLockKey !== row.key}
                    onBeginError={setKidsError}
                    onPickStart={() => setKidsError(null)}
                    onConfirm={(k, source, rect) => handleKidPhotoConfirm(k, source, rect)}
                    onLockChange={handleKidPhotoLockChange}
                  />
                  <input
                    className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
                    value={row.name}
                    onChange={(e) => updateKidRow(row.key, { name: e.target.value })}
                    placeholder="First name"
                    maxLength={30}
                    disabled={row.kid !== null}
                    {...fieldA11y('kids', kidsError)}
                  />
                  <input
                    type="number"
                    min={0}
                    max={17}
                    className="w-20 shrink-0 rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
                    value={row.age}
                    onChange={(e) => updateKidRow(row.key, { age: e.target.value })}
                    placeholder="Age"
                    disabled={row.kid !== null}
                    {...fieldA11y('kids', kidsError)}
                  />
                  <button
                    type="button"
                    onClick={() => void removeKidRow(row.key)}
                    disabled={kidPhotoLockKey === row.key}
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

  // V28 r2 slice 1b: the photo card (the first run's fourth card, while it
  // existed) was DELETED here — its gate,
  // state, picker, crop step, and upload all left this page; the parent's
  // photo now lives on the NAME card (V28 r2 slice 2). The area card below is the
  // run's last card again, and the run is account → name → kids → area.

  // V28 slice 5: the AREA card ("4 of 4") — the first run's last card,

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
              // Keep the ref the re-check reads (see handleAreaFinish's
              // F1 block) — the one setAreaAddress site writes both, so
              // the ref can never lag the state.
              areaAddressRef.current = e.target.value
              setAreaAddressError(null)
              // V28 slice 4 fix 1: an edited address invalidates the card's
              // whole resolution — the published pin AND the lookup slot.
              // The map (the pin + radius circle) is a claim about the
              // address as it was, and it hides until the edited address
              // resolves. Clearing the slot is what makes the invariant
              // hold: an in-flight lookup for the OLD address now settles
              // SUPPRESSED (its ownership check `areaLookupForRef !== owned`
              // fails, because the edit moved the owner), so it can never
              // republish a previous address's pin over the current text —
              // the card shows the CURRENT address's resolution, or nothing.
              // (Pre-fix the slot outlived the edit, the stale settle passed
              // its own guard, and republished A's pin over B's field — the
              // two spec legs in signup-zip-fallback pin both faces of this
              // invariant, and they fail pre-fix.)
              setAreaCoordinates(null)
              areaLookupForRef.current = null
              areaLookupPromiseRef.current = null
              // The pending state is the current address's to own, too: the
              // lookup still in flight belongs to the address the field no
              // longer shows, so the card stops reading "Checking your
              // address…" (without this, a suppressed settle can never clear
              // the flag — the card is stuck disabled over the edited text).
              // The edited address's own lookup, if one runs, is a fresh
              // promise and re-enters the pending state itself.
              setGeocoding(false)
              // V28 slice 4 fix 3 (C1): the ZIP-fallback NOTE is this
              // class's THIRD instance — the pin (fix 1), the save (fix 2),
              // and the note. It is a direct claim about the text: "We
              // couldn't match the ADDRESS YOU ENTERED" — so an edit
              // invalidates it exactly as it invalidates the pin. Pre-fix
              // it outlived the edit: revealed for an unresolvable A, it
              // lingered over B's text (indefinitely, if B was never
              // blurred — B's settle never re-derives it) and CO-RENDERED
              // with B's own "Checking your address…" pending window, which
              // also contradicted this block's own "whole resolution" comment.
              // Clearing it is SAFE, and that is the thing a future reader
              // will doubt: the EDITED address's own settle RE-DERIVES the
              // flag — hidden on a resolved zip, re-revealed on failure or
              // rejection (the settle and catch legs of ensureAddressLookup
              // both write it) — and a TYPED ZIP IS UNAFFECTED: it lives in
              // `homeZip`, which handleAreaFinish prefers over the address's
              // resolution REGARDLESS of note visibility, so clearing the
              // note cannot lose anyone's typed zip. The fix-3 pin leg in
              // signup-zip-fallback asserts the hide AND the re-derive.
              setZipFallbackShown(false)
            }}
            onFocus={cancelScheduledAddressLookup}
            onBlur={() => {
              // V28 slice 4: the EARLY resolution — one bounded Nominatim
              // request yields the ZIP and the pin; the card's map shows the
              // pin + the radius circle while the parent still looks at it.
              if (areaAddress.trim() !== '') scheduleAddressLookup()
            }}
            placeholder="e.g. 1200 1st Ave S, Seattle"
            autoComplete="street-address"
            {...fieldA11y('area-address', areaAddressError)}
          />
        </label>
        {areaAddressError !== null ? (
          <p role="alert" id={errorId('area-address')} className="text-red-600">{areaAddressError}</p>
        ) : null}

        {/* V28 slice 4 — THE CARD'S OWN MAP: the resolved pin and the radius
            circle the parent is choosing. Rendered ONLY once the address has
            resolved to coordinates (`shouldRenderPlacesMap` with zero pins —
            the plan's render condition, never a second predicate); before
            that, no map-shaped claim. A radius change redraws the circle
            client-side (PlacesMap's overlay re-key) — no new request. */}
        {shouldRenderPlacesMap(0, areaCoordinates) ? (
          <PlacesMap
            places={[]}
            zipCoords={zipCoords}
            homePin={areaCoordinates}
            radiusCircle={areaCoordinates !== null ? { center: areaCoordinates, radiusMiles } : null}
            placeActions={false}
            className="h-64"
            testId="onboarding-area-map"
          />
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