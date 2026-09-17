import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link } from 'react-router'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { NAV_ICONS } from '../components/icons'
import { NotificationsSection } from '../components/NotificationsSection'
import { SectionHeader } from '../components/SectionHeader'
import { useSessionContext } from '../components/SessionProvider'
import { useCropStep } from '../components/useCropStep'
import { useFamilyPhotoUrl } from '../components/useFamilyPhotoUrl'
import { useUnsavedChangesGuard } from '../components/useUnsavedChangesGuard'
import {
  addKid,
  BIO_MAX_LENGTH,
  HandleTakenError,
  INTERESTS_MAX_LENGTH,
  LIKES_MAX_LENGTH,
  listKids,
  listMemberships,
  listMyFollowing,
  MAX_KIDS_PER_PROFILE,
  missingProfileItems,
  removeKid,
  unfollowById,
  updateBio,
  updateDisplayName,
  updateHomeZipRadius,
  updateInterests,
  updateKid,
  uploadAvatar,
  uploadFamilyPhoto,
  validateBio,
  validateFamilyPhotoFile,
  validateKid,
  validateKidLikes,
  validateInterests,
  type MyFollowing,
} from '../lib/db'
import { profileBlurbOrder } from '../lib/photoStorage'
import {
  DEFAULT_RADIUS_MILES,
  RADIUS_MILES_OPTIONS,
} from '../lib/feed'
import {
  planProfileSave,
  seedKidDrafts,
  seedProfileFormValues,
  toKidFormValues,
  toKidRowValues,
  type KidFormValues,
  type ProfileFormValues,
  type ProfileSection,
} from '../lib/profileSave'
import type { Kid, MembershipWithNeighborhood } from '../lib/types'
// V8 ticket 09: the Following list's family rows reuse the card's 40px avatar
// (the HostAvatar shape) rather than growing a second one.
import { HostAvatar } from '../components/DropInCard'

/**
 * /settings — the signed-in family's EDITING page.
 *
 * V11 ticket 06 split the old monolithic /profile in two. /settings is the
 * place a parent changes anything about their family; the read-only /profile
 * (ProfilePage) is the place a parent (or a follower) looks at them — avatar,
 * display name, bio, kids by name + age, and the owner's own posts. /settings
 * owns every control, /profile owns none: the one "Edit profile" button on
 * /profile routes here.
 *
 * What /settings owns (V11 ticket 06):
 * - profile: display name + the persistent public handle (inline "handle taken"
 *   on a unique violation — 0004's constraint, surfaced as HandleTakenError),
 *   "About our family" (the <= 500-char bio), the avatar (cropped, resized to
 *   512px, > 5 MB rejected before upload, stored at avatars/<uid>/avatar), and
 *   the optional family photo (same crop/validate/encode pipeline, stored in
 *   the PRIVATE kid-photos bucket, read back through a batched, best-effort
 *   signed URL that is never persisted).
 * - location: home zip + radius (the comfort/comfort-neighborhood controls).
 * - kids: structured rows (first name + age ONLY — the privacy pin), max 5
 *   app-enforced, editable in place (name, age, and the "likes" line are fields
 *   on the row itself, saved by the same submit). Remove asks first and names
 *   what it costs; the 5-kid cap says so on screen instead of silently
 *   disabling the inputs. A kid row has NO photo control — a sentence says so
 *   where it used to be.
 * - notifications: the NotificationsSection (push opt-in / status / dismiss).
 * - following: the families and places this parent has bookmarked, with an
 *   Unfollow button on every row (the owner-only 0033 SELECT policy makes this
 *   the only place a follow graph is read in full; no follower counts anywhere).
 * - neighborhoods: the memberships the profile already has, as display-only
 *   labels (memberships stopped filtering anything when discovery moved to home
 *   zip + radius; there is no membership write path here).
 *
 * V8 ticket 10: **one "Save profile" submit** for the whole form (display
 * name, location, bio, interests, and every kid row) instead of the six Save
 * buttons that used to live here. The submit is the pure planProfileSave
 * (lib/profileSave.ts, unit-tested): it writes ONLY the sections that actually
 * changed, a no-op save issues no write at all, and each section is written
 * independently — so a failed bio write never discards the name a parent also
 * fixed, and the section that failed keeps its pending text on screen. The
 * per-section inline errors are unchanged in spirit (the same validators, the
 * same messages); each one is now reported by the section that owns it.
 *
 * UNSAVED TYPING IS GUARDED (the seed-once discipline used to drop it in
 * silence): while anything is dirty, an in-app link asks before leaving
 * (useUnsavedChangesGuard) and a refresh/tab close gets the browser's own
 * prompt. Saves refresh the shared session state so the app-shell header picks
 * up the changes.
 *
 * A persistent nudge banner shows the still-missing items (photo + bio + kids)
 * until all three are present (the missing-items decision is the pure
 * missingProfileItems); it is kept here, on the editing page, as an aid.
 *
 * The "Your posts" list (the owner's own drop-ins, newest first, each with a
 * Duplicate action) and its Upcoming/Past split (V8 ticket 04; the pure
 * feed.partitionPostsByTime) moved to the read-only /profile in V11 ticket 06,
 * so this page no longer imports the own-posts query. The V9 ticket 04 archive
 * rules (past rows are links, muted with the archive's opacity-60, no
 * "I'm going" toggle) now live on /profile.
 */
export function SettingsPage() {
  const { session, loading, profile, refresh } = useSessionContext()
  const userId = session?.user?.id ?? null

  // V8 ticket 10: the whole form's values (one object, so "is anything dirty?"
  // is one comparison) + the last-saved baseline they are compared against.
  // The baseline advances per SECTION, only when that section's write landed.
  const [draft, setDraft] = useState<ProfileFormValues | null>(null)
  const [baseline, setBaseline] = useState<ProfileFormValues | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveNote, setSaveNote] = useState<{ ok: boolean; message: string } | null>(null)
  const [writeErrors, setWriteErrors] = useState<Partial<Record<ProfileSection, string>>>({})

  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [photoSaved, setPhotoSaved] = useState(false)

  // V9 ticket 11 (folded ticket 08): the family photo — the OPTIONAL photo the
  // parent adds instead of photos of each kid. Its own busy/error/saved triple,
  // exactly like the avatar's above, because it is a second independent upload
  // on the same page and one's failure must not read as the other's.
  const [familyPhotoBusy, setFamilyPhotoBusy] = useState(false)
  const [familyPhotoError, setFamilyPhotoError] = useState<string | null>(null)
  const [familyPhotoSaved, setFamilyPhotoSaved] = useState(false)

  const [kids, setKids] = useState<Kid[] | null>(null)
  const [kidsError, setKidsError] = useState<string | null>(null)
  const [kidsBusyId, setKidsBusyId] = useState<string | null>(null)
  const [newKidName, setNewKidName] = useState('')
  const [newKidAge, setNewKidAge] = useState('')
  /** The kid row a Remove is armed against (the confirm dialog names it). */
  const [removingKidId, setRemovingKidId] = useState<string | null>(null)

  // V3 slice 6 (ticket 09, migration 0022): the per-kid "likes" editor, now
  // part of the one submit (V8 ticket 10) together with the row's name + age.
  // kidDrafts seeds from the fresh rows (seedKidDrafts — an in-flight local
  // value wins over a re-list, the seed-once discipline, per kid).
  //
  // V9 ticket 11 removed the per-row kidPhoto* state that used to live here
  // (busy/saved/error + the row the crop dialog was framing for): the row's
  // photo control is gone, so there is no per-row upload to track and no
  // re-list to run after one. The rows arrive once per load and once per add.
  const [kidDrafts, setKidDrafts] = useState<Record<string, KidFormValues>>({})
  const [kidWriteErrors, setKidWriteErrors] = useState<Record<string, string>>({})
  const [kidSavedId, setKidSavedId] = useState<string | null>(null)

  // V3 slice 6 (ticket 09): the profile interests field (<= INTERESTS_MAX_LENGTH,
  // trim; the db layer validates too — the updateBio defense-in-depth
  // pattern). Seeded from the profile once it loads; user typing wins
  // after. Pre-0022-apply the field is absent from the row (undefined →
  // '') and the save 42703s (the designed error line, the DB-not-applied
  // discipline).
  const [memberships, setMemberships] = useState<MembershipWithNeighborhood[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // V8 ticket 09 (migration 0033): the Following list — the families and
  // places this parent bookmarked (null = still loading). A failed read
  // (pre-0033-apply: PGRST205) renders its own sentence and nothing else the
  // page does changes. `unfollowBusyId` is one row's in-flight unfollow.
  const [following, setFollowing] = useState<MyFollowing | null>(null)
  const [followingError, setFollowingError] = useState<string | null>(null)
  const [unfollowBusyId, setUnfollowBusyId] = useState<string | null>(null)

  /**
   * THE TWO CROP STEPS (photo-crop ticket 03) — the parent's own avatar, and
   * (V9 ticket 11) the family photo. Two instances rather than one, because
   * their confirm handlers do different things (the avatar refreshes the session
   * so the header and the nudge banner update; the family photo refreshes it so
   * the card's minted signed URL follows the new path); only one dialog can be
   * open at a time anyway.
   *
   * Between tickets 09 and 11 there was a THIRD step here, for a kid's row
   * photo. It is gone with the control it served: no kid photo is uploaded,
   * stored or rendered by the app any more.
   *
   * Declared with the other hooks and above every early return — the V6 regression
   * that blanked the detail page was exactly this mistake.
   */
  const avatarCrop = useCropStep(async (source, rect) => {
    if (userId === null) return
    setPhotoBusy(true)
    setPhotoError(null)
    setPhotoSaved(false)
    try {
      await uploadAvatar(userId, source, rect)
      await refresh()
      setPhotoSaved(true)
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not upload your photo. Try again.')
    } finally {
      setPhotoBusy(false)
    }
  })

  const familyPhotoCrop = useCropStep(async (source, rect) => {
    if (userId === null) return
    setFamilyPhotoBusy(true)
    setFamilyPhotoError(null)
    setFamilyPhotoSaved(false)
    try {
      await uploadFamilyPhoto(userId, source, rect)
      // refresh() re-reads the profile row, so the card's stored path (and the
      // signed URL minted from it) follows the upload. No re-list of anything
      // else: this photo belongs to no kid row.
      await refresh()
      setFamilyPhotoSaved(true)
    } catch (err) {
      setFamilyPhotoError(
        err instanceof Error ? err.message : 'Could not upload your family photo. Try again.',
      )
    } finally {
      setFamilyPhotoBusy(false)
    }
  }, validateFamilyPhotoFile)

  // Seed the whole form ONCE the profile loads; user typing wins after (the
  // seed-once guard is what keeps a refresh() from erasing an edit — and the
  // guard above is what keeps a navigation from erasing it silently).
  useEffect(() => {
    if (draft !== null || profile === null) return
    const seeded = seedProfileFormValues(profile, DEFAULT_RADIUS_MILES)
    setDraft(seeded)
    setBaseline(seeded)
  }, [draft, profile])

  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    setLoadError(null)
    // V2 slice 3: memberships are display labels only (they left the
    // filter path) — the card renders what the user already follows. Nothing
    // on this page changes them (see the module's doc fix).
    listMemberships(userId)
      .then((userMemberships) => {
        if (cancelled) return
        setMemberships(userMemberships)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Could not load your profile data.')
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // The owner's own kids (V2 ticket 02). A failed load (0011 not applied
  // yet) renders a designed error, never a crash — same discipline as the
  // rest of the page.
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

  // V8 ticket 09: the Following list (the caller's OWN follows — owner-only
  // RLS — named through one batched profiles read and one batched places
  // read). A failed load renders its own sentence in the section below;
  // nothing else on the page depends on it.
  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    setFollowing(null)
    setFollowingError(null)
    listMyFollowing()
      .then((rows) => {
        if (!cancelled) setFollowing(rows)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setFollowingError(
          err instanceof Error ? err.message : 'Could not load your following list.',
        )
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  /**
   * V8 ticket 09: unfollow one row (the DELETE scoped to the caller's own
   * row). On success the row is removed from LOCAL state — the list is the
   * caller's own data, already in hand, so a full re-read would be a second
   * round trip for a fact we just changed. A failure reports in the section
   * and leaves the row standing (never a lie about the state).
   */
  async function handleUnfollow(followId: string) {
    if (unfollowBusyId !== null) return
    setUnfollowBusyId(followId)
    setFollowingError(null)
    try {
      await unfollowById(followId)
      setFollowing((prev) =>
        prev === null
          ? prev
          : {
              families: prev.families.filter((row) => row.followId !== followId),
              places: prev.places.filter((row) => row.followId !== followId),
            },
      )
    } catch (err) {
      setFollowingError(err instanceof Error ? err.message : 'Could not unfollow. Try again.')
    } finally {
      setUnfollowBusyId(null)
    }
  }

  const kidRows = (kids ?? []).map(toKidRowValues)

  /**
   * THE SUBMIT'S DECISION, computed at render (the pure planProfileSave — the
   * same plan drives the disabled state, the "unsaved changes" line and the
   * dirty guard, so the button can never disagree with what the guard warns
   * about).
   *
   * The validators are db.ts's own, so the inline message and the reason the
   * write is skipped are one string, not two copies.
   */
  const savePlan =
    draft === null || baseline === null
      ? null
      : planProfileSave({
          baseline,
          draft,
          kidRows,
          kidDrafts,
          validators: {
            name: (value) => (value.trim() === '' ? 'Your display name can’t be empty.' : null),
            bio: validateBio,
            interests: validateInterests,
            kid: (kid) => validateKid(kid.firstName, kid.age) ?? validateKidLikes(kid.likes),
          },
        })

  const dirty = savePlan !== null && !savePlan.empty
  const unsavedGuard = useUnsavedChangesGuard(dirty)

  /**
   * V9 ticket 11: the family photo's READ path and the optional-block decision.
   *
   * Both are called HERE, above the `loading` early return, for the reason the
   * crop steps' own comment records: a hook after an early return is the V6
   * regression that blanked the detail page.
   *
   * `blurb` is the pure decision for which optional profile blocks exist; the
   * card below uses its `familyPhoto` member to know whether to offer "Add a
   * photo" or "Change photo", and `/u/:handle` uses the same seam for the same
   * three blocks. The signed URL itself comes from the hook (batched,
   * best-effort, never persisted) and is null while it is in flight, when there
   * is no photo, or when the mint failed — in all three cases the card shows no
   * image and no error.
   */
  const blurb = profileBlurbOrder(profile, kids !== null && kids.length > 0)
  const familyPhotoUrl = useFamilyPhotoUrl(profile?.family_photo_url)
  const hasFamilyPhoto = blurb.includes('familyPhoto')

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  const memberNames = (memberships ?? []).map((m) => m.neighborhood.name)

  // The nudge banner (V2 ticket 02): persistent until photo + bio + kids
  // are all present (the pure missingProfileItems decides; the kids count
  // is null while the kids load is in flight / failed — best-effort).
  const missing = missingProfileItems(profile, kids === null ? null : kids.length)

  /** One text section's edit: the draft changes and its write error clears. */
  function editDraft(patch: Partial<ProfileFormValues>, section?: ProfileSection) {
    setDraft((prev) => (prev === null ? prev : { ...prev, ...patch }))
    setSaveNote(null)
    if (section !== undefined) {
      setWriteErrors((prev) => (prev[section] === undefined ? prev : { ...prev, [section]: undefined }))
    }
  }

  /** One kid row's edit: the draft changes and that row's write error clears. */
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
    setKidSavedId(null)
    setKidsError(null)
    setKidWriteErrors((prev) => {
      if (prev[kidId] === undefined) return prev
      const next = { ...prev }
      delete next[kidId]
      return next
    })
  }

  /**
   * THE ONE SUBMIT (V8 ticket 10).
   *
   * The plan decides what may be written: every changed + valid section and
   * kid row. Each write is awaited on its OWN, so
   *  - a failure is reported by the section that failed (its inline error
   *    line, its own message) and
   *  - a failure never costs the other sections their edits: the baseline
   *    advances only for the sections whose write landed, so everything that
   *    did not save is still on screen, still dirty, and still guarded.
   *
   * The blocked (invalid) sections are simply not attempted — their inline
   * error is already visible (see savePlan above).
   */
  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault()
    if (userId === null || draft === null || baseline === null || savePlan === null) return
    if (saving) return
    if (savePlan.empty) return // a no-op save issues no write at all
    setSaving(true)
    setSaveNote(null)
    setWriteErrors({})
    setKidWriteErrors({})
    setKidSavedId(null)

    const writers: Record<ProfileSection, () => Promise<void>> = {
      name: () => updateDisplayName(userId, draft.name.trim()),
      location: () => updateHomeZipRadius(userId, draft.homeZip.trim(), draft.radiusMiles),
      bio: () => updateBio(userId, draft.bio),
      interests: () => updateInterests(userId, draft.interests),
    }
    const savedValues: Partial<ProfileFormValues> = {}
    let failures = 0

    for (const section of savePlan.sections) {
      try {
        await writers[section]()
        // The write landed: advance THIS section's baseline only. The writers
        // trim, so the baseline is the trimmed value (the draft keeps showing
        // what was typed — the comparison is trimmed, so it is not dirty).
        if (section === 'location') {
          savedValues.homeZip = draft.homeZip.trim()
          savedValues.radiusMiles = draft.radiusMiles
        } else if (section === 'name') {
          savedValues.name = draft.name.trim()
        } else if (section === 'bio') {
          savedValues.bio = draft.bio.trim()
        } else {
          savedValues.interests = draft.interests.trim()
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

    for (const kid of savePlan.kids) {
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
        setKidSavedId(kid.id)
      } catch (err) {
        failures += 1
        const message =
          err instanceof Error ? err.message : 'Could not save that kid. Try again.'
        setKidWriteErrors((prev) => ({ ...prev, [kid.id]: message }))
      }
    }

    // Advance the baseline only where a write landed (a failed section keeps
    // its pending text, and stays dirty, on purpose).
    if (Object.keys(savedValues).length > 0) {
      setBaseline((prev) => (prev === null ? prev : { ...prev, ...savedValues }))
      // The shared session state (the header, the onboarding gate, the feed)
      // picks up a changed display name / location.
      await refresh().catch(() => undefined)
    }
    setSaveNote({
      ok: failures === 0,
      message:
        failures === 0
          ? 'Profile saved.'
          : 'Some changes couldn’t be saved. Your edits are still here — see the message on the section that failed.',
    })
    setSaving(false)
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

  // V2 ticket 02: the avatar upload — the ≤5MB gate and the decode run inside the
  // crop step (photo-crop ticket 03), the user frames the photo, and the encoder
  // produces the square; then the session state refreshes so the header + the nudge
  // banner see the new URL.
  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = '' // allow re-picking the same file
    if (userId === null || file === null || photoBusy) return
    setPhotoError(null)
    setPhotoSaved(false)
    const error = await avatarCrop.beginCrop(file)
    if (error !== null) setPhotoError(error)
  }

  /**
   * V9 ticket 11 (folded ticket 08): the family photo upload — the SAME crop
   * step the avatar uses, with the gate passed explicitly
   * (`validateFamilyPhotoFile`, which delegates to the avatar rules), so a
   * non-image or a file over 5 MB is refused before the decode and before the
   * dialog opens. The parent frames it; the encoder produces the 512px square;
   * the object lands at `<uid>/family/photo.jpg` in the PRIVATE bucket and
   * `profiles.family_photo_url` stores the PATH (never a URL — T6).
   *
   * A failure reports in this card's own line, never as a crash and never mixed
   * into the avatar's messages beside it.
   */
  async function handleFamilyPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = '' // allow re-picking the same file
    if (userId === null || file === null || familyPhotoBusy) return
    setFamilyPhotoError(null)
    setFamilyPhotoSaved(false)
    const error = await familyPhotoCrop.beginCrop(file)
    if (error !== null) setFamilyPhotoError(error)
  }

  const missingLabels: Record<'photo' | 'bio' | 'kids', string> = {
    photo: 'a photo',
    bio: 'a bit about your family',
    kids: 'your kids',
  }
  const kidsAtCap = kids !== null && kids.length >= MAX_KIDS_PER_PROFILE
  const removingKid = (kids ?? []).find((kid) => kid.id === removingKidId) ?? null
  /**
   * V9 ticket 05 (review cycle 1, F1): the Remove dialog NAMES the kid, and a
   * first name is optional now — so it must never interpolate a raw
   * `kid.first_name`. Both failure spellings are reachable: `null` (post-0037,
   * the row the Add button just wrote) renders "Remove null?" / "null comes off
   * your family profile…", and a cleared in-page draft (`''`) renders
   * "Remove ?".
   *
   * The TYPE change (`Kid.first_name: string | null`) cannot find this on its
   * own: a template literal accepts `string | null` and compiles clean, so the
   * compiler walked the method calls and assignments, not the interpolations.
   * A grep over `src/` found this one and the two photo alts (fixed above); the
   * migration header's note is corrected to say exactly that.
   */
  const removingKidName = (removingKid?.first_name ?? '').trim()
  const removingKidSubject = removingKidName === '' ? 'This kid' : removingKidName
  const nameBlocked =
    savePlan?.blockedSections.find((item) => item.section === 'name')?.error ?? null
  const liveNameError = writeErrors.name ?? nameBlocked
  const liveBioError = validateBio(draft?.bio ?? '')
  const liveInterestsError = validateInterests(draft?.interests ?? '')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionHeader icon={NAV_ICONS.gear} title="Settings" tagline="Profile, location, and notifications" />
        <p className="mt-1 text-sm text-slate-600">
          Your display name is your persistent public handle — it shows on everything you
          post.
        </p>
      </div>

      {missing.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Finish your profile</p>
          <p className="mt-1">
            Still to add: {missing.map((item) => missingLabels[item]).join(', ')}. Parents
            like knowing who they’re meeting.
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Photo</h2>
        <p className="mt-1 text-sm text-slate-600">
          Your photo shows on your posts and profile. Under 5 MB — it’s resized to a 512px
          square for you.
        </p>
        <div className="mt-3 flex items-center gap-3">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="Your avatar"
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-500"
            >
              {((draft?.name ?? profile?.display_name ?? '?').charAt(0) || '?').toUpperCase()}
            </span>
          )}
          <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
            {photoBusy ? 'Uploading…' : profile?.avatar_url ? 'Change photo' : 'Add a photo'}
            {/* data-testid (V9 ticket 11): this page now has TWO file inputs (this
                one and the family photo's below), so `input[type="file"]` no longer
                identifies a control here. Specs target the testid. */}
            <input
              data-testid="avatar-photo-input"
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={photoBusy}
              onChange={(e) => void handlePhotoChange(e)}
            />
          </label>
        </div>
        {photoError !== null ? <p className="mt-3 text-sm text-red-600">{photoError}</p> : null}
        {photoSaved ? <p className="mt-3 text-sm text-emerald-700">Photo updated.</p> : null}
        {avatarCrop.dialog}
      </div>

      {/* V9 ticket 11 (folded ticket 08): "A photo of your family" — the
          optional family photo that REPLACES the kid-photo control ticket 08
          reversed. It sits directly under the avatar's card because they are the
          same kind of thing (one picture, cropped by the parent, ≤5MB) and
          because the ticket pins the profile's block order: family photo →
          "About our family" → the kids list, all three optional.

          WHAT IS DELIBERATELY NOT HERE: a placeholder box, a "no photo yet"
          sentence, or a disabled control. Every one of the three blocks is
          optional and the page must look finished with none of them, so an
          unset family photo is simply a heading, a sentence and the button.

          The image renders only when a signed URL was minted (the hook above);
          when the stored path exists but the mint failed, the button says
          "Change photo" and no image appears — no error state, because a parent
          can do nothing about a storage failure and nothing is actually broken
          about their profile. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">A photo of your family</h2>
        <p className="mt-1 text-sm text-slate-600">
          Optional. One photo of your family — you, and whoever else you bring. It shows on
          your profile, to signed-in families. Under 5 MB — it’s resized to a 512px square
          for you.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {familyPhotoUrl !== null ? (
            <img
              data-testid="family-photo"
              src={familyPhotoUrl}
              alt="Your family photo"
              className="h-20 w-20 shrink-0 rounded-xl object-cover"
            />
          ) : null}
          <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
            {familyPhotoBusy
              ? 'Uploading…'
              : hasFamilyPhoto
                ? 'Change photo'
                : 'Add a family photo'}
            <input
              data-testid="family-photo-input"
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={familyPhotoBusy}
              onChange={(e) => void handleFamilyPhotoChange(e)}
            />
          </label>
        </div>
        {familyPhotoError !== null ? (
          <p className="mt-3 text-sm text-red-600">{familyPhotoError}</p>
        ) : null}
        {familyPhotoSaved ? (
          <p className="mt-3 text-sm text-emerald-700">Family photo updated.</p>
        ) : null}
        {familyPhotoCrop.dialog}
      </div>

      {/* V8 ticket 10: ONE form, ONE save. Everything a parent edits — the
          handle, the location, the bio, the interests and every kid row —
          lives inside it, and the single "Save profile" button at the end
          writes exactly the parts that changed. */}
      <form className="flex flex-col gap-4" onSubmit={handleSaveProfile}>
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Display name</span>
            <input
              className={
                'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                (liveNameError !== null ? 'border-red-400' : 'border-slate-300')
              }
              value={draft?.name ?? ''}
              onChange={(e) => editDraft({ name: e.target.value }, 'name')}
              placeholder="e.g. Sam at Green Lake"
              maxLength={40}
              autoComplete="nickname"
              disabled={saving || draft === null}
            />
          </label>
          {liveNameError !== null ? (
            <p className="text-sm text-red-600">{liveNameError}</p>
          ) : null}
        </div>

        {/* V2 slice 3: the location card — the discovery center (home zip +
            radius). The zip must be in the seeded gazetteer (the pure
            validator runs inside updateHomeZipRadius); the radius is one of
            the pinned options (2/5/10/20/35). */}
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Location</h2>
          <p className="text-sm text-slate-600">
            You see drop-ins within this radius of your home zip.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Home zip</span>
            <input
              className={
                'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                (writeErrors.location !== undefined ? 'border-red-400' : 'border-slate-300')
              }
              value={draft?.homeZip ?? ''}
              onChange={(e) => editDraft({ homeZip: e.target.value }, 'location')}
              placeholder="e.g. 98107"
              inputMode="numeric"
              maxLength={5}
              disabled={saving || draft === null}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Radius</span>
            <select
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              value={draft?.radiusMiles ?? DEFAULT_RADIUS_MILES}
              onChange={(e) => editDraft({ radiusMiles: Number(e.target.value) }, 'location')}
              disabled={saving || draft === null}
            >
              {RADIUS_MILES_OPTIONS.map((miles) => (
                <option key={miles} value={miles}>
                  {miles} miles
                </option>
              ))}
            </select>
          </label>
          {writeErrors.location !== undefined ? (
            <p className="text-sm text-red-600">{writeErrors.location}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {/* V9 ticket 11 (folded ticket 08): the bio field is REFRAMED as
              "About our family" — label and placeholder only. No new column, no
              schema change: `profiles.bio` (0011, ≤500 chars, the DB CHECK as
              the backstop) is the same field the /u/:handle paragraph reads.
              The label is a real sentence a parent can answer ("who are you
              people?") instead of the one-word "About", which is what the human
              asked for: a little place to describe your family, optional. */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">About our family</span>
            <textarea
              className={
                'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                (liveBioError !== null || writeErrors.bio !== undefined
                  ? 'border-red-400'
                  : 'border-slate-300')
              }
              value={draft?.bio ?? ''}
              onChange={(e) => editDraft({ bio: e.target.value }, 'bio')}
              placeholder="Who’s in your family, and what are you into? (optional)"
              maxLength={BIO_MAX_LENGTH}
              rows={3}
              disabled={saving || draft === null}
            />
          </label>
          <span className="text-xs text-slate-500">
            {(draft?.bio ?? '').length}/{BIO_MAX_LENGTH}
          </span>
          {liveBioError !== null ? (
            <p className="text-sm text-red-600">{liveBioError}</p>
          ) : null}
          {writeErrors.bio !== undefined ? (
            <p className="text-sm text-red-600">{writeErrors.bio}</p>
          ) : null}
        </div>

        {/* V3 slice 6 (ticket 09): the interests field (the conversation
            starter — the /u/:handle line under the bio). <= INTERESTS_MAX_LENGTH
            after trim; the inline error when over (the /new address
            pattern — the pure validator is the single source of the
            message) + the db layer's validator (defense in depth).
            Pre-0022-apply the save 42703s (the column is missing live) —
            the designed error line, the DB-not-applied discipline. */}
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="flex flex-col gap-1 text-sm">
            <span className="flex items-center justify-between text-slate-700">
              <span>Interests</span>
              <span
                className={
                  'text-xs ' +
                  (liveInterestsError !== null ? 'text-red-600' : 'text-slate-500')
                }
              >
                {(draft?.interests ?? '').length}/{INTERESTS_MAX_LENGTH}
              </span>
            </span>
            <textarea
              className={
                'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                (liveInterestsError !== null || writeErrors.interests !== undefined
                  ? 'border-red-400'
                  : 'border-slate-300')
              }
              value={draft?.interests ?? ''}
              onChange={(e) => editDraft({ interests: e.target.value }, 'interests')}
              placeholder="What your family is into (optional)"
              rows={2}
              disabled={saving || draft === null}
            />
          </label>
          <span className="text-xs text-slate-500">
            Shown with “About our family” on your profile.
          </span>
          {liveInterestsError !== null ? (
            <p className="text-sm text-red-600">{liveInterestsError}</p>
          ) : null}
          {writeErrors.interests !== undefined ? (
            <p className="text-sm text-red-600">{writeErrors.interests}</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Kids</h2>
          <p className="mt-1 text-sm text-slate-600">
            First name, age, and a “likes” line (up to {MAX_KIDS_PER_PROFILE}).
            Edit a row and save the whole profile — nothing here saves on its own.
          </p>
          {/* V9 ticket 05 shipped the privacy promise in the UI; V9 ticket 10
              (migration 0040) makes it TRUE, so the sentence is re-pinned to
              the stronger reality instead of the weaker one.
              WHAT THIS COPY PROMISES NOW, and why it is worded this way: the
              gate lives in the database — `kids_select_own_host_pinger_mod` —
              and it is exactly four viewers: this family, the host of a
              drop-in the kid is listed as coming to, the families who said
              they're going to that drop-in (0026's gate), and moderators.
              Nothing else: not a signed-in stranger (that was TRUE before
              ticket 10 and is FALSE now — a stranger could read every
              family's kids rows over REST), not a signed-out visitor, not
              this family's public profile page (which shows the kids section
              to its owner alone), and not a card (the cards carry the age
              range, never a name — ticket 05's absolute rule, unchanged).
              The sentence names the moderators because their access is real
              and omitting it would over-promise; it says nothing about
              initials or counts because no such substitute exists anywhere.
              IT CLAIMS NOTHING ABOUT THE PHOTO — DELIBERATELY (review cycle 1,
              F1). An earlier draft of this sentence said "A name and a kid
              photo are visible only to …", and that was FALSE: kid photos live
              in the `avatars` bucket, which is a PUBLIC bucket (0011 sets
              `storage.buckets.public = true` and adds `avatars_public_read` for
              `{public}`), the object path is `<uid>/kids/<kidId>`, and
              `kids.avatar_url` stores the resulting public URL permanently —
              deleting the kid row does not delete the object, so every URL ever
              handed out stays fetchable signed out. Narrowing `kids` (ticket
              10's gate) does not touch any of that.
              THE STORAGE HALF IS FIXED NOW, AND THIS SENTENCE STILL DOES NOT
              MENTION IT (V9 ticket 11, which closed that exposure: the photos
              moved to the private `kid-photos` bucket, owner-only, and 0038 +
              scripts/migrate-kid-photos.mjs are what did it). The sentence stays
              a statement about the NAME gate, for two reasons: it is the promise
              this field's own policy can be held to, and photo claims on a
              surface whose data comes from `kids` would make copy depend on a
              storage state the client cannot read. The photo's fate is stated
              once, in its own sentence below, in words that are true whether or
              not the migration has been applied. (A kid photo still never renders
              on a card or an event line, and now it renders nowhere at all: the
              kid-photo pin, and then some.) */}
          <p className="mt-1 text-sm text-slate-600">
            A first name is optional — skip it and your kid still shows up by age
            (the cards say “ages 3–6”, never a name). A name is visible only to
            your family, the host of a drop-in where you listed them, the
            families who said they’re going, and our moderators.
          </p>
          {/* V9 ticket 11's ONE THING THE PARENT MUST BE TOLD (T11): the kid
              photo control that used to sit on every row is GONE, and removing
              it in silence would leave a parent who uploaded one unable to tell
              whether they had broken something. So the row-level control's
              absence is explained where the control used to be.

              WHY THE SENTENCE STOPS WHERE IT DOES. It claims only what the APP
              does — it collects no kid photo, and it displays none — which is
              true before AND after migration 0038 and needs no migration to have
              been applied. It deliberately does NOT say "the photo is private
              now" or "nobody can see the old one": the storage closure is 0038's
              job plus the coordinator's move of the existing objects, and copy
              that promised privacy the storage layer might not yet deliver is
              exactly the mistake ticket 10's review caught.

              "NOTHING WAS DELETED" WAS REMOVED (review cycle 1, F9) and it was
              the one word here that could become false: the IMAGES are kept —
              the human's "keep the files" intent — but the PUBLIC OBJECT holding
              each one IS deleted once its private copy verifies, so an absolute
              "nothing was deleted" would be a lie in exactly the state the
              coordinator is about to create. The replacement says what a parent
              can act on and stays true in both states: the picture is kept, and
              the public copy is on its way out. 0038's own phrasing — "the FILES
              survive but their old public URLs cannot" — is the same fact in the
              migration's words. */}
          <p data-testid="kids-photo-notice" className="mt-2 text-sm text-slate-600">
            A kid’s row is a first name (optional), an age and a likes line — there’s no
            photo on a kid any more, and no kid photo is shown anywhere on Drop In. If you
            added one before, it isn’t shown either: the public copy is being taken down, and
            the picture itself is kept with your family. For a photo on your profile, add
            “A photo of your family” above.
          </p>

          {kids === null ? (
            <p className="mt-3 text-sm text-slate-600">Loading…</p>
          ) : kids.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No kids yet — add one below.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {kids.map((kid) => {
                // V3 slice 6 (ticket 09, migration 0022) put a 40px photo on this
                // row — the kid's `avatar_url` or an initial-fallback circle.
                // V9 TICKET 11 REMOVED IT, and the initial circle went with the
                // photo: the row is first name + age + likes, exactly (the
                // ticket's AC), and an initial standing in for a photo would be
                // the "partial substitute" V9 ticket 10's own record rejects.
                // NOTHING HERE MAY READ `kid.avatar_url` — no code path reaches a
                // kid's avatar_url for display, and after migration 0038 the
                // stored value is a private-bucket object PATH, not a URL.
                //
                // V8 ticket 10: the row is EDITABLE IN PLACE — first name, age
                // and "likes" are fields on the row, saved by the one submit
                // (savePlan.kids). The name + age inputs carry aria-labels and
                // testids rather than placeholders, because the "Add kid" form
                // below owns the 'First name' / 'Age' placeholders and two
                // elements answering to the same placeholder is how a spec (and
                // a screen reader) starts guessing.
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
                return (
                  <li
                    key={kid.id}
                    data-testid="kid-row"
                    className="flex flex-wrap items-center gap-2 rounded-xl px-2 py-1.5"
                  >
                    <input
                      data-testid="kid-name"
                      aria-label="Kid first name"
                      className={
                        'w-28 min-w-0 shrink-0 rounded-xl border px-2 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                        (rowError !== null ? 'border-red-400' : 'border-slate-300')
                      }
                      value={values.firstName}
                      onChange={(e) => editKidDraft(kid.id, { firstName: e.target.value })}
                      maxLength={30}
                      disabled={saving || kidsBusyId !== null}
                    />
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
                      disabled={saving || kidsBusyId !== null}
                    />
                    <div className="flex min-w-0 flex-1 basis-40 items-center gap-1.5">
                      <input
                        data-testid="kid-likes"
                        aria-label="Kid likes"
                        className={
                          'min-w-0 flex-1 rounded-xl border px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                          (rowError !== null ? 'border-red-400' : 'border-slate-300')
                        }
                        value={values.likes}
                        onChange={(e) => editKidDraft(kid.id, { likes: e.target.value })}
                        placeholder="Likes… (optional)"
                        disabled={saving || kidsBusyId !== null}
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
                    </div>
                    <button
                      type="button"
                      data-testid="kid-remove"
                      onClick={() => setRemovingKidId(kid.id)}
                      disabled={kidsBusyId !== null || saving}
                      className={
                        'shrink-0 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 ' +
                        (kidsBusyId === kid.id ? 'opacity-50' : '')
                      }
                    >
                      {kidsBusyId === kid.id ? 'Removing…' : 'Remove'}
                    </button>
                    {kidSavedId === kid.id ? (
                      <span className="text-xs text-emerald-700">Saved.</span>
                    ) : null}
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
              disabled={kidsAtCap || kidsBusyId !== null || saving}
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
              disabled={kidsAtCap || kidsBusyId !== null || saving}
            />
            <button
              type="button"
              onClick={() => void handleAddKid()}
              disabled={kidsAtCap || kidsBusyId !== null || saving}
              className="shrink-0 rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {kidsBusyId === 'add' ? 'Adding…' : 'Add kid'}
            </button>
          </div>
          {/* V8 ticket 10: the cap says so. The inputs used to just go dead at
              five kids with no word about why — a disabled field with no
              explanation reads as a broken app, not as a limit. */}
          {kidsAtCap ? (
            <p data-testid="kids-cap" className="mt-2 text-sm text-slate-600">
              That’s {MAX_KIDS_PER_PROFILE} kids — the most a profile can list. Remove one to
              add another.
            </p>
          ) : null}
          {kidsError !== null ? <p className="mt-2 text-sm text-red-600">{kidsError}</p> : null}
        </div>

        {/* THE ONE SUBMIT (V8 ticket 10). Disabled while nothing has changed —
            a save button that would issue no write should say so instead of
            flashing "Profile saved." over an unchanged form. */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <button
            type="submit"
            disabled={saving || savePlan === null || savePlan.empty}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save profile'}
          </button>
          {dirty ? (
            <span className="text-sm text-slate-600">
              You have unsaved changes — this saves every section above at once.
            </span>
          ) : (
            <span className="text-sm text-slate-500">
              Nothing to save yet — change something above.
            </span>
          )}
          {saveNote !== null ? (
            <p
              data-testid="profile-save-note"
              className={'w-full text-sm ' + (saveNote.ok ? 'text-emerald-700' : 'text-red-600')}
            >
              {saveNote.message}
            </p>
          ) : null}
        </div>
      </form>

      {/* V8 ticket 08: the notification surface — opt-in/off, per-kind mutes,
          the install affordance and the recent-alerts fallback. It loads its
          own data and CONTAINS its own failures (pre-apply it renders one
          sentence about the missing tables), so nothing above it changes when
          the push migrations are not installed yet. */}
      <NotificationsSection />

      {/* V8 ticket 09 (migration 0033): the Following list — the families and
          places this parent bookmarked. Counts only (there is no follower list
          anywhere); the rows are the caller's OWN follows, which is the only
          way the owner-only 0033 policy ever returns rows. A failed read
          (pre-apply: PGRST205) is its own sentence — the rest of the page is
          untouched. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Following</h2>
        <p className="mt-1 text-sm text-slate-600">
          Families and places you’ve bookmarked — you’ll see when they’re going to something.
        </p>

        {followingError !== null ? (
          <p data-testid="following-error" className="mt-3 text-sm text-slate-600">
            Couldn’t load your following list ({followingError}).
          </p>
        ) : following === null ? (
          <p className="mt-3 text-sm text-slate-600">Loading…</p>
        ) : following.families.length === 0 && following.places.length === 0 ? (
          <p data-testid="following-empty" className="mt-3 text-sm text-slate-600">
            No families or places yet. Follow a family on their profile, or a place on its page.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {following.families.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-slate-700">Families</h3>
                <ul className="flex flex-col gap-2">
                  {following.families.map((row) => (
                    <li key={row.followId} className="flex flex-wrap items-center gap-2">
                      <HostAvatar
                        host={{
                          id: row.profileId,
                          display_name: row.handle ?? '?',
                          avatar_url: row.avatarUrl,
                        }}
                      />
                      {row.handle !== null ? (
                        <Link
                          to={`/u/${encodeURIComponent(row.handle)}`}
                          className="text-sm font-medium text-indigo-600"
                        >
                          @{row.handle}
                        </Link>
                      ) : (
                        <span className="text-sm text-slate-600">A family who left Drop In</span>
                      )}
                      <button
                        type="button"
                        data-testid="unfollow-family"
                        disabled={unfollowBusyId === row.followId}
                        onClick={() => void handleUnfollow(row.followId)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                      >
                        {unfollowBusyId === row.followId ? 'Updating…' : 'Unfollow'}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {following.places.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-slate-700">Places</h3>
                <ul className="flex flex-col gap-2">
                  {following.places.map((row) => (
                    <li key={row.followId} className="flex flex-wrap items-center gap-2">
                      {row.name !== null ? (
                        <Link
                          to={`/place/${encodeURIComponent(row.placeId)}`}
                          className="text-sm font-medium text-indigo-600"
                        >
                          {row.name}
                        </Link>
                      ) : (
                        <span className="text-sm text-slate-600">A place that left the directory</span>
                      )}
                      <button
                        type="button"
                        data-testid="unfollow-place"
                        disabled={unfollowBusyId === row.followId}
                        onClick={() => void handleUnfollow(row.followId)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                      >
                        {unfollowBusyId === row.followId ? 'Updating…' : 'Unfollow'}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Neighborhoods</h2>
        <p className="mt-1 text-sm text-slate-600">
          Display only — discovery is by your home zip + radius (V2 slice 3).
        </p>

        {loadError !== null ? (
          <p className="mt-3 text-sm text-red-600">{loadError}</p>
        ) : memberships === null ? (
          <p className="mt-3 text-sm text-slate-600">Loading…</p>
        ) : memberNames.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No neighborhoods yet.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {memberNames.map((name) => (
              <span
                key={name}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700"
              >
                {name}
              </span>
            ))}
          </div>
        )}
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

      {/* V8 ticket 10: the unsaved-changes guard (an in-app link while anything
          above is dirty). */}
      {unsavedGuard.dialog}
    </div>
  )
}
