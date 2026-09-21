import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { NAV_ICONS } from '../components/icons'
import { SectionHeader } from '../components/SectionHeader'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { HostAvatar } from '../components/DropInCard'
import { useSessionContext } from '../components/SessionProvider'
import { useFamilyPhotoUrl } from '../components/useFamilyPhotoUrl'
import { useKidPhotoUrls } from '../components/useKidPhotoUrls'
import { useCropStep } from '../components/useCropStep'
import {
  addKid,
  BIO_MAX_LENGTH,
  clearAvatar,
  HandleTakenError,
  listKids,
  LIKES_MAX_LENGTH,
  MAX_KIDS_PER_PROFILE,
  removeKid,
  supabase,
  updateBio,
  updateDisplayName,
  updateKid,
  uploadAvatar,
  uploadFamilyPhoto,
  uploadKidPhoto,
  validateAvatarFile,
  validateBio,
  validateFamilyPhotoFile,
  validateKid,
  validateKidLikes,
} from '../lib/db'
import {
  partitionPostsByTime,
  playdateKidsKidIds,
  queryMyPlaydatesWithClient,
  toDuplicatePrefill,
} from '../lib/feed'
import type { Kid, Playdate } from '../lib/types'
import {
  planProfileSave,
  seedProfileFormValues,
  seedKidDrafts,
  toKidFormValues,
  toKidRowValues,
  type KidFormValues,
  type ProfileFormValues,
  type ProfileSection,
} from '../lib/profileSave'
import { autosaveEmptyPass } from '../lib/autosave'
import type { CropRect } from '../lib/photoCrop'

/**
 * V12 t01: the autosave debounce — well past the ticket's 300ms floor, so a
 * burst of keystrokes is ONE write. The same constant re-arms the follow-up
 * pass a coalesced edit triggers (via the autosaveTick bump below).
 */
const AUTOSAVE_DEBOUNCE_MS = 400

/**
 * /profile — the family's EDITABLE "what other families see" view (V13 ticket
 * 01 re-homed the editor here; before this ticket it was read-only and every
 * control lived on /settings).
 *
 * The page owns the profile's PUBLIC FACE: the display name (the public handle)
 * at the bottom, the family photo, "About the parents" (the bio), and "About
 * the kids" (each kid's first name + age + likes, with an optional per-kid
 * photo that renders ONLY here — the owner self-view; the visitor /u/:handle
 * surface stays photo-free, the V9 t11 / V12 t04 invariant). Editing happens
 * INLINE on this page — there is no separate edit route and no link to
 * /settings — and everything autosaves (the V12 t01 debounced machine): the
 * bio field, the kid rows, and the add/remove controls all settle through one
 * pure planner (planProfileSave, lib/profileSave.ts) that writes only what
 * changed. The family photo and each kid's photo go through the crop step
 * (useCropStep) and write their OBJECT PATHS (uploadFamilyPhoto /
 * uploadKidPhoto) — never URLs, which expire.
 *
 * The read set, in the pinned block order (family photo → "About the parents"
 * → the kids list, all optional, the page looks finished with none of them):
 *  - "A photo of your family" (always-present card: the signed-URL image when
 *    set, plus the Add/Change control either way)
 *  - "About the parents" (the bio, editable textarea; the display name renders
 *    as its OWN text node at the bottom of the page so a spec can match it
 *    exactly while the app-shell header shows the @-prefixed form)
 *  - "About the kids" (kid rows: first name + age + likes inputs, an optional
 *    per-kid photo (owner-only render via useKidPhotoUrls), and Remove; plus
 *    the add-a-kid row and the five-kid cap)
 *  - "Hosted drop-ins" (the owner's own posts, the same Upcoming/Past split as
 *    /u/:handle; every row keeps its Duplicate action, which navigates to /new)
 *
 * The family photo's signed URL comes from the same batched, best-effort hook
 * /settings used (never persisted; null while in flight or when the mint
 * failed, and the card simply shows no image in that case). The kid photos'
 * URLs come from the same discipline via `useKidPhotoUrls` (V12 t04): absent
 * while in flight or when the mint failed, and the kid row simply shows no
 * image. This is the ONE place a kid photo shows — every other surface stays
 * photo-free.
 */
export function ProfilePage() {
  const navigate = useNavigate()
  const { session, loading, profile, refresh } = useSessionContext()
  const userId = session?.user?.id ?? null

  // The whole-form values (one object, so "is anything dirty?" is one
  // comparison) + the last-saved baseline they are compared against. The
  // baseline advances per SECTION, only when that section's write landed.
  const [draft, setDraft] = useState<ProfileFormValues | null>(null)
  const [baseline, setBaseline] = useState<ProfileFormValues | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [autosaveTick, setAutosaveTick] = useState(0)
  const [writeErrors, setWriteErrors] = useState<Partial<Record<ProfileSection, string>>>({})

  // The owner's own kids (V2 ticket 02). A failed load (0011 not applied yet)
  // renders a designed error, never a crash — same discipline as the rest of
  // the page.
  const [kids, setKids] = useState<Kid[] | null>(null)
  const [kidsError, setKidsError] = useState<string | null>(null)
  // One row's in-flight add/remove (the busy flag the row's Remove button and
  // the add row key on); 'add' is the add row's own sentinel.
  const [kidsBusyId, setKidsBusyId] = useState<string | null>(null)
  // The kid whose Remove confirmation is open (V8 ticket 10's dialog, re-homed
  // here with the rows it confirms).
  const [removingKidId, setRemovingKidId] = useState<string | null>(null)
  // The add-a-kid row's inputs (a fresh insert, NOT a draft — it has no row id
  // yet, so it does not flow through the autosave machine).
  const [newKidName, setNewKidName] = useState('')
  const [newKidAge, setNewKidAge] = useState('')
  // The per-row drafts (name + age-as-string + likes) the autosave machine
  // plans over; seeded once per row from the loaded rows (seed-once discipline).
  const [kidDrafts, setKidDrafts] = useState<Record<string, KidFormValues>>({})
  // The per-row write errors a failed autosave pass left behind (the row keeps
  // its pending text + this message until a re-edit re-triggers the pass).
  const [kidWriteErrors, setKidWriteErrors] = useState<Record<string, string>>({})
  // The kid ids whose photo <img> 404'd (minted but the object was never
  // uploaded, or was deleted). Keyed by kid id because each kid's canonical
  // path is stable, so a re-mint never resurrects a dead image.
  const [kidPhotoErrors, setKidPhotoErrors] = useState<Record<string, boolean>>({})
  // The per-kid photo upload's in-flight flag (one kid at a time; the crop
  // step's own busy flag covers the dialog side). Each row's KidPhotoControl
  // owns its own crop step + this shared busy flag.
  const [kidPhotoBusyId, setKidPhotoBusyId] = useState<string | null>(null)
  // The family photo's last successful upload (drives the "Family photo
  // updated." confirmation line in the card; cleared on a new upload).
  const [familyPhotoUpdated, setFamilyPhotoUpdated] = useState(false)
  // The parent's avatar (V2 ticket 02): the last successful upload + the
  // in-flight flag. The avatar editor moved here from /onboarding in V13
  // ticket 01 — onboarding is only reachable for users without a home zip,
  // so an already-onboarded parent needs this card to add or change it.
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  // V15 ticket 06 (A19): the avatar's in-flight REMOVE flag — the × on the
  // avatar corner clears profiles.avatar_url (clearAvatar); one at a time.
  const [avatarRemoving, setAvatarRemoving] = useState(false)

  const [myPosts, setMyPosts] = useState<Playdate[] | null>(null)
  const [postsError, setPostsError] = useState<string | null>(null)

  // Seed the form ONCE the profile loads; user typing wins after (the
  // seed-once guard is what keeps a refresh() from erasing an edit).
  useEffect(() => {
    if (draft !== null || profile === null) return
    const seeded = seedProfileFormValues(profile, 5)
    setDraft(seeded)
    setBaseline(seeded)
  }, [draft, profile])

  // The owner's own kids (V2 ticket 02). A failed load (0011 not applied yet)
  // renders a designed error, never a crash — same discipline as the rest of
  // the page.
  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    setKids(null)
    setKidsError(null)
    listKids(userId)
      .then((rows) => {
        if (cancelled) return
        setKids(rows)
        setKidDrafts((prev) => seedKidDrafts(rows.map(toKidRowValues), prev))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setKidsError(err instanceof Error ? err.message : 'Could not load your kids.')
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // The "Your posts" list (V2 slice 1): the owner's own drop-ins, newest
  // first. A failed load (e.g. the playdates table not applied yet) renders a
  // designed error, never a crash.
  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    setMyPosts(null)
    setPostsError(null)
    queryMyPlaydatesWithClient(supabase, userId)
      .then((rows) => {
        if (cancelled) return
        setMyPosts(rows as unknown as Playdate[])
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setPostsError(err instanceof Error ? err.message : 'Could not load your posts.')
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // THE TWO CROP STEPS (photo-crop ticket 03, re-homed here): the family photo
  // and the per-kid photo. The family photo's step is declared HERE (one
  // instance, top-level); each kid row's step lives in its own KidPhotoControl
  // component below (a hook cannot be called inside kids.map). Their confirm
  // handlers do different things (the family photo refreshes the session so
  // the card's minted signed URL follows the new path; the kid photo re-lists
  // the kids so the row's avatar_url marker + the signed-URL map pick up the
  // new object); only one dialog can be open at a time anyway. Declared with
  // the other hooks and above every early return — the V6 regression that
  // blanked the detail page was exactly this mistake.
  const familyPhotoCrop = useCropStep(
    async (source, rect) => {
      if (userId === null) return
      try {
        await uploadFamilyPhoto(userId, source, rect)
        setFamilyPhotoUpdated(true)
        // refresh() re-reads the profile row, so the card's stored path (and
        // the signed URL minted from it) follows the upload. No re-list of
        // anything else: this photo belongs to no kid row.
        await refresh().catch(() => undefined)
      } catch (err) {
        setWriteErrors((prev) => ({
          ...prev,
          bio: err instanceof Error ? err.message : 'Could not upload your family photo. Try again.',
        }))
      }
    },
    validateFamilyPhotoFile,
  )

  /**
   * The parent's avatar (V2 ticket 02; V13 ticket 01 moved the editor here):
   * the crop step decodes + frames the bitmap, then uploadAvatar writes the
   * square JPEG to avatars/<uid>/avatar (the owner-scoped write policy from
   * 0011) and points profiles.avatar_url at the public URL. A failed upload
   * surfaces the error but never traps the page — the item is optional, and
   * the /settings nudge banner keeps the prompt alive.
   */
  const avatarCrop = useCropStep(
    async (source, rect) => {
      if (userId === null) return
      setAvatarUploading(true)
      setAvatarError(null)
      try {
        await uploadAvatar(userId, source, rect)
        // refresh() re-reads the profile row, so the identity block's HostAvatar
        // render picks up the new avatar_url.
        await refresh().catch(() => undefined)
      } catch (err) {
        setAvatarError(err instanceof Error ? err.message : 'Could not upload the photo. Try again.')
      } finally {
        setAvatarUploading(false)
      }
    },
    validateAvatarFile,
  )

  /**
   * Remove the parent's avatar (V15 ticket 06, A19): clear profiles.avatar_url
   * (the storage object stays in the bucket — only the column stops pointing at
   * it), then refresh() so the identity block's HostAvatar render + this card's
   * image pick up the null. A failed clear surfaces the error but never traps
   * the page (the item is optional).
   */
  async function handleRemoveAvatar() {
    if (userId === null || avatarRemoving) return
    setAvatarRemoving(true)
    setAvatarError(null)
    try {
      await clearAvatar(userId)
      await refresh().catch(() => undefined)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Could not remove the photo. Try again.')
    } finally {
      setAvatarRemoving(false)
    }
  }

  /**
   * Upload one kid's photo (V13 ticket 01): the crop step (owned by the row's
   * KidPhotoControl) decodes + frames the bitmap, then this writes the object
   * (uploadKidPhoto → the canonical <uid>/kids/<kidId> path + the row's
   * avatar_url marker) and re-lists the kids so the signed-URL map (the
   * owner-only useKidPhotoUrls render) picks up the new object. The busy flag
   * is shared (one kid at a time) so two rows' controls never race.
   */
  async function handleKidPhotoUpload(kidId: string, source: ImageBitmap, rect: CropRect) {
    if (userId === null || kidPhotoBusyId !== null) return
    setKidPhotoBusyId(kidId)
    try {
      await uploadKidPhoto(userId, kidId, source, rect)
      const rows = await listKids(userId)
      setKids(rows)
      setKidDrafts((prev) => seedKidDrafts(rows.map(toKidRowValues), prev))
    } catch (err) {
      setKidsError(err instanceof Error ? err.message : 'Could not upload that kid’s photo. Try again.')
    } finally {
      setKidPhotoBusyId(null)
    }
  }

  /**
   * V15 ticket 06 (A19): remove a kid's photo — the × on the photo's corner.
   * Sets the kid's avatar_url to NULL in the DB (the storage object stays; only
   * the marker is cleared), then re-lists so the signed-URL map drops it. The
   * busy flag is shared with handleKidPhotoUpload (one kid at a time).
   */
  async function handleKidPhotoRemove(kidId: string) {
    if (userId === null || kidPhotoBusyId !== null) return
    setKidPhotoBusyId(kidId)
    try {
      await updateKid(kidId, { avatar_url: null })
      const rows = await listKids(userId)
      setKids(rows)
      setKidDrafts((prev) => seedKidDrafts(rows.map(toKidRowValues), prev))
    } catch (err) {
      setKidsError(err instanceof Error ? err.message : 'Could not remove that kid’s photo. Try again.')
    } finally {
      setKidPhotoBusyId(null)
    }
  }

// The family photo's signed URL — called ABOVE the `loading` early return:
  // a hook after an early return is the V6 regression that blanked the detail
  // page.
  const familyPhotoUrl = useFamilyPhotoUrl(profile?.family_photo_url)
  // The owner's kid photos' signed URLs (V12 t04) — the ONE kid-photo render
  // site, owner-only, batched + best-effort. Called above the early return for
  // the same reason as the family-photo hook.
  const kidPhotoUrls = useKidPhotoUrls(userId, kids)

  /**
   * V12 t01: THE AUTOSAVE MACHINE. One debounce timer (AUTOSAVE_DEBOUNCE_MS —
   * well past the ticket's 300ms floor, so a burst of keystrokes is one
   * write), one in-flight pass, and a `pending` flag: an edit that lands
   * while a pass is running is coalesced (the pass reads the same
   * draft/baseline/kids the edit just changed), and the completion bumps
   * autosaveTick so the scheduling effect below re-arms the timer for the
   * follow-up pass. The timer + the flags live in one ref object so the pass
   * can read and mutate them without re-creating the callbacks.
   *
   * `autosaveInputs` is the same trick for the rest: runAutosave keeps a
   * STABLE identity (useCallback with no deps — the scheduling effect must
   * not re-arm just because a render happened), so it reads the current
   * values through a ref that a no-deps effect refreshes after every render.
   */
  const autosaveMachine = useRef({
    running: false,
    pending: false,
    timer: null as ReturnType<typeof setTimeout> | null,
  })
  const autosaveInputs = useRef({
    draft: null as ProfileFormValues | null,
    baseline: null as ProfileFormValues | null,
    kids: null as Kid[] | null,
    kidDrafts: {} as Record<string, KidFormValues>,
    userId: null as string | null,
    refresh: null as (() => Promise<void>) | null,
  })
  useEffect(() => {
    autosaveInputs.current = { draft, baseline, kids, kidDrafts, userId, refresh }
  })

  /**
   * V12 t01: THE AUTOSAVE PASS. The plan decides what may be written: every
   * changed + valid section AND every changed + valid kid row. Each write is
   * awaited on its own, so
   *  - a failure is reported by the section/row that failed (its inline error
   *    line, its own message) and
   *  - a failure never costs the others their edits: the baselines advance
   *    only where a write landed, so everything that did not save is still on
   *    screen — and it is NOT retried on its own: the pass ends, the indicator
   *    says so, and a re-edit re-triggers.
   *
   * The blocked (invalid) sections/rows are simply not attempted — their
   * inline error is already visible (see savePlan below).
   */
  const runAutosave = useCallback(async () => {
    const machine = autosaveMachine.current
    if (machine.running) {
      // Coalesced: the in-flight pass reads the same inputs this edit just
      // changed; the completion re-arms a follow-up pass for it.
      machine.pending = true
      return
    }

    const { draft, baseline, kids, kidDrafts, userId, refresh } = autosaveInputs.current
    if (draft === null || baseline === null || userId === null) return

    const kidRows = (kids ?? []).map(toKidRowValues)
    const plan = planProfileSave({
      baseline,
      draft,
      kidRows,
      kidDrafts,
      validators: {
        bio: validateBio,
        kid: (kid) => validateKid(kid.firstName, kid.age) ?? validateKidLikes(kid.likes),
      },
    })
    if (plan.empty) {
      // A re-armed pass with nothing to write (a landed save advanced the
      // baseline past the draft, or an in-flight edit was reverted): settle
      // the indicator unconditionally. A coalesced pass leaves it on
      // "Saving…" across the in-flight → follow-up seam (the completion
      // consumes the coalesce flag and re-arms instead of settling), and
      // every other state passes through the rule untouched.
      setSaveStatus((status) => autosaveEmptyPass(machine, status))
      return
    }

    machine.running = true
    setSaveStatus('saving')
    setWriteErrors({})

    const writers: Record<ProfileSection, () => Promise<void>> = {
      // V15 ticket 06 (A20): the display name is now edited INLINE on this page
      // (the identity block at the top) — the writer moved here from /settings.
      // The location/interests writers remain TYPE requirements of the Record
      // (every section needs a writer), not live paths: this page owns no
      // location/interests input (V15 T07 removed them from /settings entirely;
      // zip is set during onboarding, radius in the browse modal, and interests
      // belong to the "About the parents" bio), so the planner never schedules
      // those sections here. They stay so the machine's contract is complete
      // rather than patched.
      name: () => updateDisplayName(userId, draft.name.trim()),
      location: () => Promise.resolve(),
      bio: () => updateBio(userId, draft.bio),
      interests: () => Promise.resolve(),
    }
    const savedValues: Partial<ProfileFormValues> = {}
    let failures = 0

    for (const section of plan.sections) {
      try {
        await writers[section]()
        // The write landed: advance THIS section's baseline only. The writers
        // trim, so the baseline is the trimmed value (the draft keeps showing
        // what was typed — the comparison is trimmed, so it is not dirty).
        if (section === 'bio') {
          savedValues.bio = draft.bio.trim()
        } else if (section === 'name') {
          savedValues.name = draft.name.trim()
        }
      } catch (err) {
        failures += 1
        const message =
          err instanceof HandleTakenError
            ? `“${err.handle}” is already taken — pick a different display name.`
            : err instanceof Error
              ? err.message
              : 'Could not save that section.'
        setWriteErrors((prev) => ({ ...prev, [section]: message }))
      }
    }

    for (const kid of plan.kids) {
      try {
        await updateKid(kid.id, {
          first_name: kid.firstName,
          age: kid.age,
          likes: kid.likes,
        })
        // The row's own baseline advances in place: the saved (trimmed) values
        // become both the new row truth and the new draft, so nothing is left
        // looking dirty after it actually saved.
        setKids((prev) =>
          prev === null
            ? prev
            : prev.map((row) =>
                row.id === kid.id
                  ? { ...row, first_name: kid.firstName, age: kid.age, likes: kid.likes }
                  : row,
              ),
        )
        setKidDrafts((prev) => ({
          ...prev,
          [kid.id]: {
            firstName: kid.firstName,
            age: String(kid.age),
            likes: kid.likes,
          },
        }))
      } catch (err) {
        failures += 1
        const message = err instanceof Error ? err.message : 'Could not save that kid. Try again.'
        setKidWriteErrors((prev) => ({ ...prev, [kid.id]: message }))
      }
    }

    // Advance the baseline only where a write landed (a failed section keeps
    // its pending text, on purpose).
    if (Object.keys(savedValues).length > 0) {
      setBaseline((prev) => (prev === null ? prev : { ...prev, ...savedValues }))
      // The shared session state (the header, the onboarding gate, the feed)
      // picks up a changed bio.
      if (refresh !== null) await refresh().catch(() => undefined)
    }

    machine.running = false
    if (machine.pending) {
      // An edit landed mid-flight: re-arm the timer for the follow-up pass
      // (the indicator keeps showing "Saving…" until that pass settles).
      machine.pending = false
      setAutosaveTick((tick) => tick + 1)
    } else {
      setSaveStatus(failures === 0 ? 'saved' : 'error')
    }
  }, [])

  /**
   * V12 t01: THE DEBOUNCE. Every keystroke changes one of the keyed values —
   * the bio field, the kid rows (keyed on the `kids` STATE, not a derived
   * array, so a derived identity never re-arms on every render), and the
   * kid drafts — and the timer re-arms to the end of the burst, then the
   * pass runs. A pass that lands advances `baseline` (re-keying this effect),
   * which re-arms a timer that fires into an empty plan (no write; the settle
   * only turns a leftover "Saving…" into "Saved."), so the "Saved." line
   * persists instead of flickering back to idle.
   */
  useEffect(() => {
    if (draft === null || baseline === null) return
    const machine = autosaveMachine.current
    if (machine.timer !== null) clearTimeout(machine.timer)
    machine.timer = setTimeout(() => {
      machine.timer = null
      void runAutosave()
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => {
      if (machine.timer !== null) {
        clearTimeout(machine.timer)
        machine.timer = null
      }
    }
  }, [draft, baseline, kids, kidDrafts, userId, autosaveTick, runAutosave])

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  // The "Your posts" split — the same pure seam /u/:handle uses (upcoming
  // ascending, past descending). nowIso is read once per render.
  const nowIso = new Date().toISOString()
  const { upcoming: upcomingPosts, past: pastPosts } = partitionPostsByTime(
    myPosts ?? [],
    nowIso,
  )

  /**
   * THE AUTOSAVE'S DECISION, computed at render (the pure planProfileSave —
   * the render-time plan feeds ONLY the bio field's inline "blocked" state
   * below, so the input can show a validation error before the debounced
   * write is even attempted; the write itself re-plans from the same inputs
   * at write time, for the sections it actually attempts). The kid validator
   * is the db layer's own (validateKid + validateKidLikes), so the inline
   * message and the reason the write is skipped are one string, not two
   * copies.
   */
  const savePlan =
    draft === null || baseline === null
      ? null
      : planProfileSave({
          baseline,
          draft,
          kidRows: (kids ?? []).map(toKidRowValues),
          kidDrafts,
          validators: {
            // V15 ticket 06 (A20): the display name is now edited inline on this
            // page — same validator /settings uses (the empty check; the db
            // layer's own updateDisplayName handles the taken-handle case at
            // write time).
            name: (value) => (value.trim() === '' ? 'Your display name can’t be empty.' : null),
            bio: validateBio,
            kid: (kid) => validateKid(kid.firstName, kid.age) ?? validateKidLikes(kid.likes),
          },
        })

  /**
   * One text section's edit: the draft changes (the debounced autosave picks
   * it up) and the section's pending write error clears.
   */
  function editDraft(patch: Partial<ProfileFormValues>, section?: ProfileSection) {
    setDraft((prev) => (prev === null ? prev : { ...prev, ...patch }))
    if (section !== undefined) {
      setWriteErrors((prev) => (prev[section] === undefined ? prev : { ...prev, [section]: undefined }))
    }
  }

  /**
   * One kid row's edit: the draft changes (the debounced autosave picks it up)
   * and that row's write error clears.
   */
  function editKidDraft(kidId: string, patch: Partial<KidFormValues>) {
    setKidDrafts((prev) => {
      // The draft seeds on load; a row whose seed has not landed yet falls
      // back to the ROW, never to blanks (blanks would wipe the field on the
      // first keystroke).
      const row = (kids ?? []).find((kid) => kid.id === kidId)
      const current = prev[kidId] ?? (row === undefined ? null : toKidFormValues(toKidRowValues(row)))
      if (current === null) return prev
      return { ...prev, [kidId]: { ...current, ...patch } }
    })
    setKidsError(null)
    setKidWriteErrors((prev) => {
      if (prev[kidId] === undefined) return prev
      const next = { ...prev }
      delete next[kidId]
      return next
    })
  }

  async function handleAddKid() {
    // An empty age field must not coerce to 0 (Number('') is 0) — NaN trips
    // the pure validateKid before any insert.
    const age = newKidAge === '' ? NaN : Number(newKidAge)
    const kidError = validateKid(newKidName, age)
    if (userId === null || kidsBusyId !== null) return
    if (kidError !== null) {
      setKidsError(kidError)
      return
    }
    setKidsBusyId('add')
    setKidsError(null)
    try {
      await addKid(userId, newKidName, age)
      const rows = await listKids(userId)
      setKids(rows)
      setKidDrafts((prev) => seedKidDrafts(rows.map(toKidRowValues), prev))
      setNewKidName('')
      setNewKidAge('')
    } catch (err) {
      setKidsError(err instanceof Error ? err.message : 'Could not add your kid. Try again.')
    } finally {
      setKidsBusyId(null)
    }
  }

  /**
   * Remove one kid row — after the confirmation (V8 ticket 10): the dialog
   * names the kid and what the delete actually costs (both cascade: the 0022
   * playdate_kids and the 0026 ping_kids FKs are ON DELETE CASCADE, so the kid
   * also drops off every drop-in they were listed as coming to). The photo
   * OBJECT stays in the bucket, so the copy does not claim it is deleted.
   */
  async function handleRemoveKid(kidId: string) {
    if (userId === null || kidsBusyId !== null) return
    setRemovingKidId(null)
    setKidsBusyId(kidId)
    setKidsError(null)
    try {
      await removeKid(userId, kidId)
      const rows = await listKids(userId)
      setKids(rows)
      setKidDrafts((prev) => seedKidDrafts(rows.map(toKidRowValues), prev))
    } catch (err) {
      setKidsError(err instanceof Error ? err.message : 'Could not remove that kid. Try again.')
    } finally {
      setKidsBusyId(null)
    }
  }

  const removingKid = (kids ?? []).find((kid) => kid.id === removingKidId) ?? null
  const removingKidName = (removingKid?.first_name ?? '').trim()
  const removingKidSubject = removingKidName === '' ? 'This kid' : removingKidName

  const kidsAtCap = (kids ?? []).length >= MAX_KIDS_PER_PROFILE
  const liveBioError = writeErrors.bio ?? savePlan?.blockedSections.find((item) => item.section === 'bio')?.error ?? null

  /**
   * One "Your posts" row (built once, rendered in BOTH sections): the title
   * (a link to the drop-in — the way this archive reaches V8/09's "Same time
   * next week"), when + place, and the Duplicate action, which stays on every
   * row, past posts included. V12 t03 (migration 0041): a host-early-ended
   * post (status 'ended') gets an "Ended" label on the when/place line — the
   * honest-history "ended", distinct from "Cancelled" (the label the detail
   * page + DropInCard chips render).
   *
   * `muted` is the archive's own signal (the DropInCard opacity-60): a Past
   * row is history, an Upcoming row is a plan. It mutes the row's TEXT only —
   * Duplicate stays at full strength because it works.
   */
  const renderPostRow = (post: Playdate, muted: boolean) => (
    <li
      key={post.id}
      className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5"
    >
      <div className={'min-w-0' + (muted ? ' opacity-60' : '')}>
        <Link
          to={`/playdate/${post.id}`}
          className="block truncate text-sm text-slate-800 underline-offset-2 hover:underline"
        >
          {post.title}
        </Link>
        <p className="text-xs text-slate-500">
          {formatPostWhen(post.starts_at)} · {post.place}
          {post.status === 'ended' ? ' · Ended' : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={() =>
          navigate('/new', {
            state: { duplicate: toDuplicatePrefill(post, playdateKidsKidIds(post.playdate_kids)) },
          })
        }
        className="shrink-0 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200"
      >
        Duplicate
      </button>
    </li>
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionHeader
          icon={NAV_ICONS.profile}
          title="Your family"
          tagline="Your profile, kids, and hosted drop-ins"
        />
        <p className="mt-2 text-sm text-slate-600">
          This is what other families see about you. Edits save as you go.
        </p>
      </div>

      {/* V15 ticket 06 (A20): THE IDENTITY BLOCK — moved to the TOP of the page
          (it used to head the page before V13 ticket 01 demoted it; this ticket
          restores that order). The display name is the FIRST thing on /profile:
          an inline-editable input (the same tap-to-edit, autosave-as-you-go
          pattern as every other field here) + the @handle line. The avatar
          renders beside it via HostAvatar (the feed-card shape); its editor
          lives in the "Your photo" card below. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          {profile !== null && profile.avatar_url !== null && profile.avatar_url !== undefined ? (
            <HostAvatar
              host={{
                id: profile.id,
                display_name: profile.display_name,
                avatar_url: profile.avatar_url,
              }}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-700">Display name</span>
              <input
                data-testid="display-name-input"
                aria-label="Display name"
                className={
                  'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                  (writeErrors.name !== undefined ? 'border-red-400' : 'border-slate-300')
                }
                value={draft?.name ?? ''}
                onChange={(e) => editDraft({ name: e.target.value }, 'name')}
                maxLength={30}
                disabled={draft === null}
              />
            </label>
            <p className="mt-1 text-sm text-slate-600">@{draft?.name.trim() || profile?.display_name}</p>
            {writeErrors.name !== undefined ? (
              <p className="mt-1 text-sm text-red-600">{writeErrors.name}</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* "Your photo" — the parent's avatar (V2 ticket 02; V13 ticket 01 moved the
          editor here from /onboarding). Always present: add OR change. The
          HostAvatar render in the identity block above shows the result. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Your photo</h2>
        <p className="mt-1 text-sm text-slate-600">
          Optional. A photo of you — it shows on your drop-in cards and your public page.
        </p>
        {/* V15 ticket 06 (A19): TAP THE AVATAR TO CHANGE IT. The circle itself is
            now the trigger for the file picker (no text button); a small × on
            its corner removes the photo (hover to reveal on desktop, long-press
            on mobile). No photo yet → the whole card's empty state is one
            tappable "Add a photo" label (the same pattern). */}
        {profile !== null && profile.avatar_url !== null && profile.avatar_url !== undefined ? (
          <div className="group relative mt-3 inline-block">
            <label
              data-testid="avatar-photo-trigger"
              className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-full transition-transform active:scale-95"
            >
              <input
                data-testid="avatar-photo-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file !== undefined && file !== null) {
                    void avatarCrop.beginCrop(file)
                  }
                  e.target.value = ''
                }}
              />
              <img
                data-testid="avatar-photo"
                src={profile.avatar_url}
                alt="Your avatar"
                className="h-20 w-20 rounded-full object-cover"
              />
            </label>
            <button
              type="button"
              data-testid="avatar-remove"
              aria-label="Remove photo"
              onClick={() => void handleRemoveAvatar()}
              disabled={avatarRemoving}
              className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-100 disabled:opacity-50 sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100"
            >
              ×
            </button>
          </div>
        ) : (
          <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-slate-50">
            <input
              data-testid="avatar-photo-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file !== undefined && file !== null) {
                  void avatarCrop.beginCrop(file)
                }
                e.target.value = ''
              }}
            />
            Add a photo
          </label>
        )}
        {avatarCrop.dialog}
        {avatarUploading ? (
          <p className="mt-2 text-sm text-slate-600">Uploading…</p>
        ) : null}
        {avatarRemoving ? (
          <p className="mt-2 text-sm text-slate-600">Removing…</p>
        ) : null}
        {avatarError !== null ? (
          <p className="mt-2 text-sm text-red-600">{avatarError}</p>
        ) : null}
      </div>

      {/* "A photo of your family" — always present (add OR change). The signed
          URL arrives from the hook above; without one there is simply no image
          yet, but the control is always there. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">A photo of your family</h2>
        <p className="mt-1 text-sm text-slate-600">
          Optional. One photo of your family — it shows here, to signed-in families.
        </p>
        {familyPhotoUrl !== null ? (
          <img
            data-testid="family-photo"
            src={familyPhotoUrl}
            alt="Your family photo"
            className="mt-3 max-h-72 w-full rounded-xl object-cover"
          />
        ) : null}
        <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-slate-50">
          <input
            data-testid="family-photo-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file !== undefined && file !== null) {
                void familyPhotoCrop.beginCrop(file)
              }
              e.target.value = ''
            }}
          />
          {familyPhotoUrl !== null ? 'Change family photo' : 'Add a family photo'}
        </label>
        {familyPhotoCrop.dialog}
        {familyPhotoUpdated ? (
          <p className="mt-2 text-sm text-emerald-700">Family photo updated.</p>
        ) : null}
      </div>

      {/* "About the parents" — the bio (editable, autosaving). The display name
          (the public handle) is NOT here: it renders as its OWN text node at
          the BOTTOM of the page (the identity block), so a spec can match it
          exactly while the app-shell header shows the @-prefixed form. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">About the parents</h2>
        <label className="mt-2 flex flex-col gap-1 text-sm">
          <span className="text-slate-700">Tell other families about yourselves</span>
          <textarea
            data-testid="about-family-input"
            className={
              'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
              (liveBioError !== null ? 'border-red-400' : 'border-slate-300')
            }
            value={draft?.bio ?? ''}
            onChange={(e) => editDraft({ bio: e.target.value }, 'bio')}
            placeholder="Who’s in your family, and what are you into? (optional)"
            maxLength={BIO_MAX_LENGTH}
            rows={3}
            disabled={draft === null}
          />
        </label>
        <span className="mt-1 block text-xs text-slate-500">
          {(draft?.bio ?? '').length}/{BIO_MAX_LENGTH}
        </span>
        {liveBioError !== null ? (
          <p className="mt-1 text-sm text-red-600">{liveBioError}</p>
        ) : null}
      </div>

      {/* V15 ticket 06 (A17/A18): each kid row now labels its fields inline —
          "Name" / "Age" / "Likes:" prefixes make it unambiguous which input is
          which, matching the /u/:handle render. The photo control (tap-to-change,
          × to remove) sits beside the inputs; Remove stays at the end. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">About the kids</h2>
        <p className="mt-1 text-sm text-slate-600">
          First name, age, and a “likes” line (up to {MAX_KIDS_PER_PROFILE}). A row saves itself
          as you edit it — no button to press anywhere on this page.
        </p>
        {kidsError !== null ? (
          <p className="mt-3 text-sm text-red-600">{kidsError}</p>
        ) : kids === null ? (
          <p className="mt-3 text-sm text-slate-600">Loading…</p>
        ) : (
          <>
            {kids.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No kids yet.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {kids.map((kid) => {
                  const rowValues = toKidRowValues(kid)
                  const values = kidDrafts[kid.id] ?? {
                    firstName: rowValues.firstName,
                    age: String(rowValues.age),
                    likes: rowValues.likes,
                  }
                  const rowAge = values.age.trim() === '' ? NaN : Number(values.age)
                  const rowError =
                    kidWriteErrors[kid.id] ??
                    validateKid(values.firstName, rowAge) ??
                    validateKidLikes(values.likes)
                  const kidPhoto = kidPhotoUrls[kid.id]
                  return (
                    <li
                      key={kid.id}
                      data-testid="kid-row"
                      className="flex flex-wrap items-center gap-2 rounded-xl px-2 py-1.5"
                    >
                      {kidPhoto !== undefined && !kidPhotoErrors[kid.id] ? (
                        <KidPhotoControl
                          kidId={kid.id}
                          photoUrl={kidPhoto}
                          busy={kidPhotoBusyId === kid.id}
                          onUpload={(k, source, rect) => void handleKidPhotoUpload(k, source, rect)}
                          onRemove={() => void handleKidPhotoRemove(kid.id)}
                          onError={() => setKidPhotoErrors((prev) => ({ ...prev, [kid.id]: true }))}
                        />
                      ) : null}
                      {/* V15 ticket 06 (A17/A18): labeled inline inputs — "Name" / "Age" / "Likes:"
          prefixes make each field unambiguous without a separate label line. */}
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1 text-sm">
                          <span className="shrink-0 text-slate-600">Name</span>
                          <input
                            data-testid="kid-name"
                            aria-label="Kid first name"
                            className={
                              'w-28 min-w-0 rounded-xl border px-2 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                              (rowError !== null ? 'border-red-400' : 'border-slate-300')
                            }
                            value={values.firstName}
                            onChange={(e) => editKidDraft(kid.id, { firstName: e.target.value })}
                            maxLength={30}
                            disabled={kidsBusyId !== null}
                          />
                        </label>
                        <label className="flex items-center gap-1 text-sm">
                          <span className="shrink-0 text-slate-600">Age</span>
                          <input
                            data-testid="kid-age"
                            aria-label="Kid age"
                            type="number"
                            min={0}
                            max={17}
                            className={
                              'w-16 shrink-0 rounded-xl border px-2 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                              (rowError !== null ? 'border-red-400' : 'border-slate-300')
                            }
                            value={values.age}
                            onChange={(e) => editKidDraft(kid.id, { age: e.target.value })}
                            disabled={kidsBusyId !== null}
                          />
                        </label>
                        <label className="flex min-w-0 flex-1 basis-40 items-center gap-1 text-sm">
                          <span className="shrink-0 text-slate-600">Likes:</span>
                          <input
                            data-testid="kid-likes"
                            aria-label="Kid likes"
                            className={
                              'min-w-0 flex-1 rounded-xl border px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                              (rowError !== null ? 'border-red-400' : 'border-slate-300')
                            }
                            value={values.likes}
                            onChange={(e) => editKidDraft(kid.id, { likes: e.target.value })}
                            placeholder="(optional)"
                            disabled={kidsBusyId !== null}
                          />
                          {values.likes !== '' ? (
                            <span
                              className={
                                'shrink-0 text-xs ' +
                                (validateKidLikes(values.likes) !== null
                                  ? 'text-red-600'
                                  : 'text-slate-500')
                              }
                            >
                              {values.likes.length}/{LIKES_MAX_LENGTH}
                            </span>
                          ) : null}
                        </label>
                      </div>
                      <button
                        type="button"
                        data-testid="kid-remove"
                        onClick={() => setRemovingKidId(kid.id)}
                        disabled={kidsBusyId !== null}
                        className={
                          'shrink-0 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 ' +
                          (kidsBusyId === kid.id ? 'opacity-50' : '')
                        }
                      >
                        {kidsBusyId === kid.id ? 'Removing…' : 'Remove'}
                      </button>
                      {rowError !== null ? (
                        <p className="w-full text-sm text-red-600">{rowError}</p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="mt-3 flex items-center gap-2">
              <input
                className={
                  'min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                  (kidsError !== null ? 'border-red-400' : 'border-slate-300')
                }
                value={newKidName}
                onChange={(e) => {
                  setNewKidName(e.target.value)
                  setKidsError(null)
                }}
                placeholder="First name"
                maxLength={30}
                disabled={kidsAtCap || kidsBusyId !== null}
              />
              <input
                type="number"
                min={0}
                max={17}
                className={
                  'w-20 shrink-0 rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                  (kidsError !== null ? 'border-red-400' : 'border-slate-300')
                }
                value={newKidAge}
                onChange={(e) => {
                  setNewKidAge(e.target.value)
                  setKidsError(null)
                }}
                placeholder="Age"
                aria-label="Kid age"
                disabled={kidsAtCap || kidsBusyId !== null}
              />
              <button
                type="button"
                onClick={() => void handleAddKid()}
                disabled={kidsAtCap || kidsBusyId !== null}
                className="shrink-0 rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                {kidsBusyId === 'add' ? 'Adding…' : 'Add kid'}
              </button>
            </div>
            {kidsAtCap ? (
              <p data-testid="kids-cap" className="mt-2 text-sm text-slate-600">
                That’s {MAX_KIDS_PER_PROFILE} kids — the most a profile can list. Remove one to
                add another.
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* "Hosted drop-ins" — the owner's own posts (renamed from "Your posts"
          in V13 ticket 01 to match the /u/:handle heading). Same Upcoming/Past
          split; every row keeps its Duplicate action (it navigates to /new,
          which is not an edit of anything on this page). */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Hosted drop-ins</h2>
        <p className="mt-1 text-sm text-slate-600">
          Duplicate one to re-post it — place, kids, and duration come along (V12 t04);
          you only pick a new start time.
        </p>

        {postsError !== null ? (
          <p className="mt-3 text-sm text-red-600">{postsError}</p>
        ) : myPosts === null ? (
          <p className="mt-3 text-sm text-slate-600">Loading…</p>
        ) : myPosts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No posts yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {/* V13 ticket 04: "Duplicate previous drop-in" — the explicit picker
                entry point (A20). Shows the same past-posts list as /new's
                "Post again" picker; selecting a row navigates to /new with the
                duplicate prefill (the same toDuplicatePrefill path as the
                per-row Duplicate buttons). */}
            <button
              type="button"
              data-testid="duplicate-previous"
              onClick={() => {
                const latest = myPosts[0]
                if (latest) {
                  navigate('/new', {
                    state: { duplicate: toDuplicatePrefill(latest, playdateKidsKidIds(latest.playdate_kids)) },
                  })
                }
              }}
              className="min-h-11 w-fit max-w-full rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-left text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
            >
              Duplicate previous drop-in
            </button>
            {upcomingPosts.length === 0 ? (
              <p className="text-sm text-slate-600">
                Nothing coming up — past drop-ins below.
              </p>
            ) : (
              <section className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-slate-700">Upcoming</h3>
                <ul className="flex flex-col gap-1">
                  {upcomingPosts.map((post) => renderPostRow(post, false))}
                </ul>
              </section>
            )}
            {pastPosts.length > 0 ? (
              <section className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-slate-700">Past</h3>
                <ul className="flex flex-col gap-1">
                  {pastPosts.map((post) => renderPostRow(post, true))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </div>

      {/* V12 t01: THE AUTOSAVE INDICATOR — the line that used to hold the save
          button + the "unsaved changes" sentence + the result note, in one
          always-on line where the button used to be. "Saved." is the terminal
          state of a pass that wrote at least one section + kid row; a failed
          pass names itself here, and the section/row that failed carries its
          own inline error beside its field. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p
          data-testid="profile-save-note"
          className={
            'text-sm ' +
            (saveStatus === 'error'
              ? 'text-red-600'
              : saveStatus === 'saving'
                ? 'text-slate-600'
                : saveStatus === 'saved'
                  ? 'text-emerald-700'
                  : 'text-slate-500')
          }
        >
          {saveStatus === 'saving'
            ? 'Saving…'
            : saveStatus === 'saved'
              ? 'Saved.'
              : saveStatus === 'error'
                ? 'Some changes couldn’t be saved. Your edits are still here — see the message on the section that failed.'
                : 'Changes save as you go.'}
        </p>
      </div>

      {/* V8 ticket 10: the Remove confirmation — it names the kid and what the
          delete costs (their "kids coming" rows on every drop-in cascade away
          with them: 0022 + 0026 are ON DELETE CASCADE).
          V9 ticket 05: the subject falls back to the noun "This kid" when there
          is no name to use — a nameless kid's dialog says "Remove this kid?" and
          "This kid comes off your family profile…", never "null" and never a
          dangling "Remove ?". */}
      {removingKid !== null ? (
        <ConfirmDialog
          testId="remove-kid-dialog"
          title={removingKidName === '' ? 'Remove this kid?' : `Remove ${removingKidName}?`}
          body={`${removingKidSubject} comes off your family profile, and off every drop-in you listed them as coming to. This can’t be undone.`}
          confirmLabel="Remove kid"
          busyLabel="Removing…"
          busy={kidsBusyId !== null}
          onConfirm={() => void handleRemoveKid(removingKid.id)}
          onCancel={() => setRemovingKidId(null)}
        />
      ) : null}
    </div>
  )
}

/**
 * One kid row's photo control (V13 ticket 01, reworked in V15 ticket 06 A19):
 * TAP THE PHOTO ITSELF to open that kid's crop step (no text button); a small ×
 * on the photo's corner removes it (hover to reveal on desktop, long-press on
 * mobile). No photo yet → a tappable "Add photo" label. The hidden file input
 * stays for the e2e specs. A small component rather than a hook-in-a-loop
 * because useCropStep cannot be called inside the kids.map callback (hooks must
 * run at the top level of a component). The parent owns the shared busy flag
 * (one kid at a time) + the re-list; this component owns only the per-kid crop
 * step, which on confirm calls the parent's handleKidPhotoUpload with the
 * decoded bitmap + frame.
 */
function KidPhotoControl({
  kidId,
  photoUrl,
  busy,
  onUpload,
  onRemove,
  onError,
}: {
  kidId: string
  /** The signed URL of the kid's current photo (the tap-to-update trigger shows
      it); undefined when the row has no photo yet. */
  photoUrl?: string
  busy: boolean
  onUpload: (kidId: string, source: ImageBitmap, rect: CropRect) => void
  onRemove: () => void
  /** Called when the photo image fails to load (the parent hides the control). */
  onError?: () => void
}) {
  const crop = useCropStep(async (source, rect) => {
    onUpload(kidId, source, rect)
  })
  return (
    <>
      <input
        data-testid={`kid-photo-input-${kidId}`}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file !== undefined && file !== null) {
            void crop.beginCrop(file)
          }
          e.target.value = ''
        }}
      />
      {photoUrl !== undefined ? (
        <div className={'group relative shrink-0' + (busy ? ' opacity-50' : '')}>
          {/* The photo itself is now the trigger — tapping it opens the crop
              step for THIS kid's photo (the same pattern as the parent avatar). */}
          <label
            data-testid="kid-photo-trigger"
            aria-label="Update photo"
            onClick={() => {
              if (busy) return
              // Find the hidden input by its testid and click it (opens the picker).
              const input = document.querySelector<HTMLInputElement>(
                `[data-testid="kid-photo-input-${kidId}"]`,
              )
              input?.click()
            }}
            className="relative block h-10 w-10 cursor-pointer overflow-hidden rounded-full transition-transform active:scale-95"
          >
            <img
              data-testid="kid-photo"
              src={photoUrl}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
              onError={onError}
            />
          </label>
          <button
            type="button"
            data-testid="kid-photo-remove"
            aria-label="Remove photo"
            onClick={onRemove}
            disabled={busy}
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-100 disabled:opacity-50 sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100"
          >
            ×
          </button>
        </div>
      ) : (
        <label
          className={
            'flex shrink-0 cursor-pointer items-center gap-1 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 ' +
            (busy ? 'opacity-50' : '')
          }
        >
          Add photo
        </label>
      )}
      {crop.dialog}
    </>
  )
}

/** Local "Sep 12 · 3 PM" for an own-post row. */
function formatPostWhen(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric' })}`
}