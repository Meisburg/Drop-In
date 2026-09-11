import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useSessionContext } from '../components/SessionProvider'
import {
  addKid,
  BIO_MAX_LENGTH,
  HandleTakenError,
  INTERESTS_MAX_LENGTH,
  LIKES_MAX_LENGTH,
  listKids,
  listMemberships,
  MAX_KIDS_PER_PROFILE,
  missingProfileItems,
  removeKid,
  supabase,
  updateBio,
  updateDisplayName,
  updateHomeZipRadius,
  updateInterests,
  updateKid,
  uploadAvatar,
  uploadKidPhoto,
  validateKid,
  validateKidLikes,
  validateInterests,
} from '../lib/db'
import {
  DEFAULT_RADIUS_MILES,
  RADIUS_MILES_OPTIONS,
  queryMyPlaydatesWithClient,
  toDuplicatePrefill,
} from '../lib/feed'
import type {
  Kid,
  MembershipWithNeighborhood,
  Playdate,
} from '../lib/types'

/**
 * /profile — the signed-in family's own page (slice 2): edit the
 * display_name handle (inline "handle taken" error on a unique violation)
 * and manage neighborhood memberships (all neighborhoods listed, current
 * ones marked, add/remove). Saves refresh the shared session state so the
 * app-shell header picks up the changes.
 *
 * V2 slice 1: the "Your posts" list — the viewer's own drop-ins, newest
 * first — each with a Duplicate action. Duplicate navigates to /new with
 * router-state prefill of everything except the date/time (always
 * re-entered). The own-posts query is the injected-client
 * queryMyPlaydatesWithClient (feed.ts, unit-tested) run against the shared
 * db.ts client — db.ts itself gains no new surface (slice constraint).
 *
 * V2 slice 2 (ticket 02): the comfort layer on the owner side —
 * - avatar: a photo upload (client-resized to 256px, > 5 MB rejected
 *   before upload, stored at avatars/<uid>/avatar) with a live preview
 * - bio: a <= 500-char textarea (app cap + the 0011 DB backstop)
 * - kids: structured rows (first name + age ONLY — the privacy pin), max 5
 *   app-enforced
 * - a persistent nudge banner until photo + bio + kids are all present
 *   (the missing-items decision is the pure missingProfileItems)
 */
export function ProfilePage() {
  const navigate = useNavigate()
  const { session, loading, profile, refresh } = useSessionContext()
  const userId = session?.user?.id ?? null

  const [name, setName] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSaved, setNameSaved] = useState(false)
  const [savingName, setSavingName] = useState(false)

  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [photoSaved, setPhotoSaved] = useState(false)

  const [bio, setBio] = useState<string | null>(null)
  const [bioError, setBioError] = useState<string | null>(null)
  const [bioSaved, setBioSaved] = useState(false)
  const [savingBio, setSavingBio] = useState(false)

  const [kids, setKids] = useState<Kid[] | null>(null)
  const [kidsError, setKidsError] = useState<string | null>(null)
  const [kidsBusyId, setKidsBusyId] = useState<string | null>(null)
  const [newKidName, setNewKidName] = useState('')
  const [newKidAge, setNewKidAge] = useState('')

  // V3 slice 6 (ticket 09, migration 0022): the per-kid photo + "likes"
  // editor state. kidLikes seeds from the fresh rows (seedKidLikes — an
  // in-flight local value wins over a re-list, the seed-once discipline,
  // per kid); kidPhoto* is the row's own upload path (uploadKidPhoto —
  // the 256px/≤5MB avatars-bucket round-trip), whose handleRefreshKids
  // re-list lands the new avatar_url on the rows' 40px circles.
  const [kidLikes, setKidLikes] = useState<Record<string, string>>({})
  const [kidLikesBusyId, setKidLikesBusyId] = useState<string | null>(null)
  const [kidLikesSavedId, setKidLikesSavedId] = useState<string | null>(null)
  const [kidPhotoBusyId, setKidPhotoBusyId] = useState<string | null>(null)
  const [kidPhotoSavedId, setKidPhotoSavedId] = useState<string | null>(null)
  const [kidPhotoError, setKidPhotoError] = useState<string | null>(null)

  // V3 slice 6 (ticket 09): the profile interests field (<= INTERESTS_MAX_LENGTH,
  // trim; the db layer validates too — the updateBio defense-in-depth
  // pattern). Seeded from the profile once it loads; user typing wins
  // after. Pre-0022-apply the field is absent from the row (undefined →
  // '') and the save 42703s (the designed error line, the DB-not-applied
  // discipline).
  const [interests, setInterests] = useState<string | null>(null)
  const [interestsError, setInterestsError] = useState<string | null>(null)
  const [interestsSaved, setInterestsSaved] = useState(false)
  const [savingInterests, setSavingInterests] = useState(false)

  const [memberships, setMemberships] = useState<MembershipWithNeighborhood[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // V2 slice 3: the location card (home zip + radius — the discovery
  // center). Seeded from the profile once it loads; user typing wins after.
  const [homeZip, setHomeZip] = useState<string | null>(null)
  const [radiusMiles, setRadiusMiles] = useState<number | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [locationSaved, setLocationSaved] = useState(false)
  const [savingLocation, setSavingLocation] = useState(false)

  const [myPosts, setMyPosts] = useState<Playdate[] | null>(null)
  const [postsError, setPostsError] = useState<string | null>(null)

  // Seed the handle + bio + location fields once the profile loads; user
  // typing wins after.
  useEffect(() => {
    if (name === null && profile !== null) setName(profile.display_name)
  }, [name, profile])
  useEffect(() => {
    if (bio === null && profile !== null) setBio(profile.bio ?? '')
  }, [bio, profile])
  // V3 slice 6 (ticket 09): seed the interests field (pre-0022-apply the
  // row lacks the column — undefined seeds '').
  useEffect(() => {
    if (interests === null && profile !== null) setInterests(profile.interests ?? '')
  }, [interests, profile])
  useEffect(() => {
    if (homeZip === null && profile !== null) setHomeZip(profile.home_zip ?? '')
  }, [homeZip, profile])
  useEffect(() => {
    if (radiusMiles === null && profile !== null) {
      setRadiusMiles(profile.radius_miles ?? DEFAULT_RADIUS_MILES)
    }
  }, [radiusMiles, profile])

  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    setLoadError(null)
    // V2 slice 3: memberships are display labels only (they left the
    // filter path) — the card renders what the user already follows.
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
        if (!cancelled) {
          setKids(rows)
          setKidLikes(seedKidLikes(rows))
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setKidsError(err instanceof Error ? err.message : 'Could not load your kids.')
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // The "Your posts" list (V2 slice 1): the viewer's own drop-ins, newest
  // first. A failed load (e.g. the playdates table not applied yet) renders
  // a designed error, never a crash — same discipline as the rest of the
  // page.
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

  async function handleSaveName(e: FormEvent) {
    e.preventDefault()
    const trimmed = (name ?? '').trim()
    if (userId === null || trimmed === '' || savingName) return
    setSavingName(true)
    setNameError(null)
    setNameSaved(false)
    try {
      await updateDisplayName(userId, trimmed)
      await refresh()
      setNameSaved(true)
    } catch (err) {
      if (err instanceof HandleTakenError) {
        setNameError(`“${trimmed}” is already taken — pick a different display name.`)
      } else {
        setNameError(err instanceof Error ? err.message : 'Could not save your display name.')
      }
    } finally {
      setSavingName(false)
    }
  }

  // V2 ticket 02: the avatar upload — the pure validateAvatarFile (run
  // inside uploadAvatar) rejects a > 5 MB file BEFORE any upload; the
  // client-side 256px resize happens in the browser, then the session
  // state refreshes so the header + the nudge banner see the new URL.
  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = '' // allow re-picking the same file
    if (userId === null || file === null || photoBusy) return
    setPhotoBusy(true)
    setPhotoError(null)
    setPhotoSaved(false)
    try {
      await uploadAvatar(userId, file)
      await refresh()
      setPhotoSaved(true)
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not upload your photo. Try again.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleSaveBio(e: FormEvent) {
    e.preventDefault()
    if (userId === null || savingBio) return
    setSavingBio(true)
    setBioError(null)
    setBioSaved(false)
    try {
      await updateBio(userId, bio ?? '')
      await refresh()
      setBioSaved(true)
    } catch (err) {
      setBioError(err instanceof Error ? err.message : 'Could not save your bio.')
    } finally {
      setSavingBio(false)
    }
  }

  /**
   * V3 slice 6 (ticket 09): save the interests field — <= INTERESTS_MAX_LENGTH
   * after trim (the pure validator runs at render for the inline error and
   * again inside updateInterests — defense in depth). A failed write
   * (pre-0022-apply the column 42703s; a transient error) surfaces the
   * designed error line; nothing is saved.
   */
  async function handleSaveInterests(e: FormEvent) {
    e.preventDefault()
    if (userId === null || savingInterests) return
    if (validateInterests(interests ?? '') !== null) {
      // The inline cap error is already visible; nothing is saved.
      return
    }
    setSavingInterests(true)
    setInterestsError(null)
    setInterestsSaved(false)
    try {
      await updateInterests(userId, interests ?? '')
      await refresh()
      setInterestsSaved(true)
    } catch (err) {
      setInterestsError(err instanceof Error ? err.message : 'Could not save your interests.')
    } finally {
      setSavingInterests(false)
    }
  }

  /**
   * V3 slice 6 (ticket 09): re-list the kids after a kid photo upload
   * (the fresh rows carry the new avatar_url — the rows' 40px circles
   * update). A failed re-list surfaces the page's kids error line (the
   * designed state); the row's own "Photo updated." confirmation already
   * landed.
   */
  async function handleRefreshKids() {
    if (userId === null) return
    try {
      const rows = await listKids(userId)
      setKids(rows)
      setKidLikes((prev) => seedKidLikes(rows, prev))
    } catch (err) {
      setKidsError(err instanceof Error ? err.message : 'Could not load your kids.')
    }
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
      setKidLikes((prev) => seedKidLikes(rows, prev))
      setNewKidName('')
      setNewKidAge('')
    } catch (err) {
      setKidsError(err instanceof Error ? err.message : 'Could not add your kid. Try again.')
    } finally {
      setKidsBusyId(null)
    }
  }

  async function handleRemoveKid(kidId: string) {
    if (userId === null || kidsBusyId !== null) return
    setKidsBusyId(kidId)
    setKidsError(null)
    try {
      await removeKid(userId, kidId)
      const rows = await listKids(userId)
      setKids(rows)
      setKidLikes((prev) => seedKidLikes(rows, prev))
    } catch (err) {
      setKidsError(err instanceof Error ? err.message : 'Could not remove that kid. Try again.')
    } finally {
      setKidsBusyId(null)
    }
  }

  /**
   * V3 slice 6 (ticket 09, migration 0022): save one kid's "likes"
   * (conversation starter, <= LIKES_MAX_LENGTH after trim). The pure
   * validator runs at render for the inline cap error and again inside
   * updateKid (the updateBio defense-in-depth pattern); the trimmed value
   * lands in the local state so the input shows the saved form. A failed
   * write (pre-0022-apply the column 42703s — the designed error line,
   * the DB-not-applied discipline) surfaces the page's kids error line;
   * nothing is saved.
   */
  async function handleSaveKidLikes(kidId: string) {
    const likes = (kidLikes[kidId] ?? '').trim()
    if (userId === null || kidLikesBusyId !== null) return
    if (validateKidLikes(likes) !== null) {
      // The inline cap error is already visible; nothing is saved.
      return
    }
    setKidLikesBusyId(kidId)
    setKidLikesSavedId(null)
    try {
      await updateKid(kidId, { likes })
      setKidLikes((prev) => ({ ...prev, [kidId]: likes }))
      setKidLikesSavedId(kidId)
    } catch (err) {
      setKidsError(err instanceof Error ? err.message : "Could not save that kid's likes. Try again.")
    } finally {
      setKidLikesBusyId(null)
    }
  }

  /**
   * V3 slice 6 (ticket 09, migration 0022): the row's kid photo upload —
   * the avatar machinery (validateAvatarFile's 256px/≤5MB check runs
   * inside uploadKidPhoto, the client-side 256px resize in the browser),
   * stored in the 'avatars' bucket at <uid>/kids/<kidId>, then
   * kids.avatar_url points at the public URL. The handleRefreshKids
   * re-list lands the fresh avatar_url (the row's 40px circle updates);
   * the row's own "Photo updated." confirmation already landed. A failed
   * upload (the bucket write policy, a rejected file) surfaces the page's
   * kids photo error line; nothing is saved.
   */
  async function handleKidPhotoChange(kidId: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = '' // allow re-picking the same file
    if (userId === null || file === null || kidPhotoBusyId !== null) return
    setKidPhotoBusyId(kidId)
    setKidPhotoError(null)
    setKidPhotoSavedId(null)
    try {
      await uploadKidPhoto(userId, kidId, file)
      setKidPhotoSavedId(kidId)
      await handleRefreshKids()
    } catch (err) {
      setKidPhotoError(err instanceof Error ? err.message : 'Could not upload that photo. Try again.')
    } finally {
      setKidPhotoBusyId(null)
    }
  }

  /**
   * V2 slice 3: save the location (home zip + radius). The pure validators
   * (zip in the gazetteer, radius 2–35) run inside updateHomeZipRadius
   * before any write; a failure surfaces inline. The session refresh lets
   * the onboarding gate + feed see the new location.
   */
  async function handleSaveLocation(e: FormEvent) {
    e.preventDefault()
    const zip = (homeZip ?? '').trim()
    const radius = radiusMiles ?? DEFAULT_RADIUS_MILES
    if (userId === null || zip === '' || savingLocation) return
    setSavingLocation(true)
    setLocationError(null)
    setLocationSaved(false)
    try {
      await updateHomeZipRadius(userId, zip, radius)
      await refresh()
      setLocationSaved(true)
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : 'Could not save your location.')
    } finally {
      setSavingLocation(false)
    }
  }

  const missingLabels: Record<'photo' | 'bio' | 'kids', string> = {
    photo: 'a photo',
    bio: 'a bio',
    kids: 'your kids',
  }
  const kidsAtCap = kids !== null && kids.length >= MAX_KIDS_PER_PROFILE

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Your family</h1>
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
            trust families with a photo, a bio, and their kids listed.
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Photo</h2>
        <p className="mt-1 text-sm text-slate-600">
          Your photo shows on your posts and profile. Under 5 MB — it’s resized to a 256px
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
              {((name ?? profile?.display_name ?? '?').charAt(0) || '?').toUpperCase()}
            </span>
          )}
          <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
            {photoBusy ? 'Uploading…' : profile?.avatar_url ? 'Change photo' : 'Add a photo'}
            <input
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
      </div>

      <form
        className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        onSubmit={handleSaveName}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">Display name</span>
          <input
            className={
              'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
              (nameError !== null ? 'border-red-400' : 'border-slate-300')
            }
            value={name ?? ''}
            onChange={(e) => {
              setName(e.target.value)
              setNameError(null)
              setNameSaved(false)
            }}
            placeholder="e.g. Sam at Green Lake"
            maxLength={40}
            autoComplete="nickname"
            disabled={savingName}
          />
        </label>
        {nameError ? <p className="text-sm text-red-600">{nameError}</p> : null}
        {nameSaved ? <p className="text-sm text-emerald-700">Saved.</p> : null}
        <button
          type="submit"
          disabled={savingName || (name ?? '').trim() === ''}
          className="self-start rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {savingName ? 'Saving…' : 'Save'}
        </button>
      </form>

      {/* V2 slice 3: the location card — the discovery center (home zip +
          radius). The zip must be in the seeded gazetteer (the pure
          validator runs inside updateHomeZipRadius); the radius is one of
          the pinned options (2/5/10/20/35). */}
      <form
        className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        onSubmit={handleSaveLocation}
      >
        <h2 className="text-base font-semibold text-slate-900">Location</h2>
        <p className="text-sm text-slate-600">
          You see drop-ins within this radius of your home zip.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">Home zip</span>
          <input
            className={
              'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
              (locationError !== null ? 'border-red-400' : 'border-slate-300')
            }
            value={homeZip ?? ''}
            onChange={(e) => {
              setHomeZip(e.target.value)
              setLocationError(null)
              setLocationSaved(false)
            }}
            placeholder="e.g. 98107"
            inputMode="numeric"
            maxLength={5}
            disabled={savingLocation}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">Radius</span>
          <select
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            value={radiusMiles ?? DEFAULT_RADIUS_MILES}
            onChange={(e) => {
              setRadiusMiles(Number(e.target.value))
              setLocationError(null)
              setLocationSaved(false)
            }}
            disabled={savingLocation}
          >
            {RADIUS_MILES_OPTIONS.map((miles) => (
              <option key={miles} value={miles}>
                {miles} miles
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={savingLocation || (homeZip ?? '').trim() === ''}
          className="self-start rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {savingLocation ? 'Saving…' : 'Save location'}
        </button>
        {locationError ? <p className="text-sm text-red-600">{locationError}</p> : null}
        {locationSaved ? <p className="text-sm text-emerald-700">Location saved.</p> : null}
      </form>

      <form
        className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        onSubmit={handleSaveBio}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">About</span>
          <textarea
            className={
              'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
              (bioError !== null ? 'border-red-400' : 'border-slate-300')
            }
            value={bio ?? ''}
            onChange={(e) => {
              setBio(e.target.value)
              setBioError(null)
              setBioSaved(false)
            }}
            placeholder="A few words about your family (optional)"
            maxLength={BIO_MAX_LENGTH}
            rows={3}
            disabled={savingBio}
          />
        </label>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">{(bio ?? '').length}/{BIO_MAX_LENGTH}</span>
          <button
            type="submit"
            disabled={savingBio}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {savingBio ? 'Saving…' : 'Save bio'}
          </button>
        </div>
        {bioError ? <p className="text-sm text-red-600">{bioError}</p> : null}
        {bioSaved ? <p className="text-sm text-emerald-700">Bio saved.</p> : null}
      </form>

      {/* V3 slice 6 (ticket 09): the interests field (the conversation
          starter — the /u/:handle line under the bio). <= INTERESTS_MAX_LENGTH
          after trim; the inline error when over (the /new address
          pattern — the pure validator is the single source of the
          message) + the db layer's validator (defense in depth).
          Pre-0022-apply the save 42703s (the column is missing live) —
          the designed error line, the DB-not-applied discipline. */}
      <form
        className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        onSubmit={handleSaveInterests}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center justify-between text-slate-700">
            <span>Interests</span>
            <span
              className={
                'text-xs ' +
                (validateInterests(interests ?? '') !== null ? 'text-red-600' : 'text-slate-500')
              }
            >
              {(interests ?? '').length}/{INTERESTS_MAX_LENGTH}
            </span>
          </span>
          <textarea
            className={
              'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
              (validateInterests(interests ?? '') !== null || interestsError !== null
                ? 'border-red-400'
                : 'border-slate-300')
            }
            value={interests ?? ''}
            onChange={(e) => {
              setInterests(e.target.value)
              setInterestsError(null)
              setInterestsSaved(false)
            }}
            placeholder="What your family is into (optional)"
            rows={2}
            disabled={savingInterests}
          />
        </label>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            Shown under your bio on your profile.
          </span>
          <button
            type="submit"
            disabled={savingInterests || validateInterests(interests ?? '') !== null}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {savingInterests ? 'Saving…' : 'Save interests'}
          </button>
        </div>
        {validateInterests(interests ?? '') !== null ? (
          <p className="text-sm text-red-600">{validateInterests(interests ?? '')}</p>
        ) : null}
        {interestsError !== null ? (
          <p className="text-sm text-red-600">{interestsError}</p>
        ) : null}
        {interestsSaved ? (
          <p className="text-sm text-emerald-700">Interests saved.</p>
        ) : null}
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Kids</h2>
        <p className="mt-1 text-sm text-slate-600">
          First name, age, an optional photo, and a “likes” line (up to {MAX_KIDS_PER_PROFILE}).
        </p>

        {kids === null ? (
          <p className="mt-3 text-sm text-slate-600">Loading…</p>
        ) : kids.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No kids yet — add one below.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {kids.map((kid) => {
              // V3 slice 6 (ticket 09, migration 0022): the row's 40px kid
              // photo (the kid's avatar_url — the uploadKidPhoto public
              // URL — or the initial-fallback circle, the profile
              // avatar's pattern). The kid-photo pin: it renders ONLY in
              // this kids list — never on cards or event lines. The row
              // wraps like the /new duration chips (the likes cluster
              // takes the spare row at 375px); the "likes" input is
              // <= LIKES_MAX_LENGTH (the pure validator's inline cap
              // error, trim on save — the interests field's pattern).
              const likesValue = kidLikes[kid.id] ?? ''
              const likesCapError = validateKidLikes(likesValue)
              return (
                <li
                  key={kid.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl px-2 py-1.5"
                >
                  {kid.avatar_url ? (
                    <img
                      src={kid.avatar_url}
                      alt={`${kid.first_name}'s photo`}
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-500"
                    >
                      {(kid.first_name.charAt(0) || '?').toUpperCase()}
                    </span>
                  )}
                  <span className="shrink-0 text-sm text-slate-800">
                    {kid.first_name} · {kid.age}
                  </span>
                  <label
                    className={
                      'shrink-0 cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 ' +
                      (kidPhotoBusyId === kid.id ? 'opacity-50' : '')
                    }
                  >
                    {kidPhotoBusyId === kid.id
                      ? 'Uploading…'
                      : kid.avatar_url
                        ? 'Change photo'
                        : 'Add photo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={kidPhotoBusyId !== null}
                      onChange={(e) => void handleKidPhotoChange(kid.id, e)}
                    />
                  </label>
                  <div className="flex min-w-0 flex-1 basis-40 items-center gap-1.5">
                    <input
                      className={
                        'min-w-0 flex-1 rounded-xl border px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                        (likesCapError !== null ? 'border-red-400' : 'border-slate-300')
                      }
                      value={likesValue}
                      onChange={(e) => {
                        setKidLikes((prev) => ({ ...prev, [kid.id]: e.target.value }))
                        setKidLikesSavedId(null)
                      }}
                      placeholder="Likes… (optional)"
                      disabled={kidLikesBusyId === kid.id}
                    />
                    {likesValue !== '' ? (
                      <span
                        className={
                          'shrink-0 text-xs ' +
                          (likesCapError !== null ? 'text-red-600' : 'text-slate-500')
                        }
                      >
                        {likesValue.length}/{LIKES_MAX_LENGTH}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleSaveKidLikes(kid.id)}
                      disabled={kidLikesBusyId !== null || likesCapError !== null}
                      className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {kidLikesBusyId === kid.id ? 'Saving…' : 'Save'}
                    </button>
                    {kidLikesSavedId === kid.id ? (
                      <span className="shrink-0 text-xs text-emerald-700">Saved.</span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRemoveKid(kid.id)}
                    disabled={kidsBusyId !== null}
                    className={
                      'shrink-0 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 ' +
                      (kidsBusyId === kid.id ? 'opacity-50' : '')
                    }
                  >
                    {kidsBusyId === kid.id ? 'Removing…' : 'Remove'}
                  </button>
                  {kidPhotoSavedId === kid.id ? (
                    <p className="w-full text-xs text-emerald-700">Photo updated.</p>
                  ) : null}
                  {likesCapError !== null ? (
                    <p className="w-full text-sm text-red-600">{likesCapError}</p>
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
        {kidPhotoError !== null ? (
          <p className="mt-2 text-sm text-red-600">{kidPhotoError}</p>
        ) : null}
        {kidsError !== null ? <p className="mt-2 text-sm text-red-600">{kidsError}</p> : null}
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

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Your posts</h2>
        <p className="mt-1 text-sm text-slate-600">
          Duplicate one to re-post it — you always pick a new date and time.
        </p>

        {postsError !== null ? (
          <p className="mt-3 text-sm text-red-600">{postsError}</p>
        ) : myPosts === null ? (
          <p className="mt-3 text-sm text-slate-600">Loading…</p>
        ) : myPosts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No posts yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1">
            {myPosts.map((post) => (
              <li
                key={post.id}
                className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-800">{post.title}</p>
                  <p className="text-xs text-slate-500">
                    {formatPostWhen(post.starts_at)} · {post.place}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    navigate('/new', { state: { duplicate: toDuplicatePrefill(post) } })
                  }
                  className="shrink-0 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200"
                >
                  Duplicate
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Local "Sep 12 · 3 PM" for an own-post row. */
function formatPostWhen(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric' })}`
}

/**
 * Seed the per-kid "likes" inputs from the fresh rows (V3 slice 6, ticket
 * 09, migration 0022): an in-flight local value (existing) wins over the
 * row's saved likes (a re-list must not clobber unsaved typing, the
 * seed-once discipline, per kid); an absent value (pre-0022-apply the
 * column is undefined, or a cleared field) seeds '' (the null-safe
 * render, the pre-0016 discipline).
 */
function seedKidLikes(
  rows: Kid[],
  existing?: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const row of rows) {
    next[row.id] = existing?.[row.id] ?? row.likes ?? ''
  }
  return next
}