import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { NotificationsSection } from '../components/NotificationsSection'
import { useSessionContext } from '../components/SessionProvider'
import { useCropStep } from '../components/useCropStep'
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
  supabase,
  unfollowById,
  updateBio,
  updateDisplayName,
  updateHomeZipRadius,
  updateInterests,
  updateKid,
  uploadAvatar,
  uploadKidPhoto,
  validateBio,
  validateKid,
  validateKidLikes,
  validateInterests,
  type MyFollowing,
} from '../lib/db'
import {
  DEFAULT_RADIUS_MILES,
  partitionPostsByTime,
  RADIUS_MILES_OPTIONS,
  queryMyPlaydatesWithClient,
  toDuplicatePrefill,
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
import type { Kid, MembershipWithNeighborhood, Playdate } from '../lib/types'
// V8 ticket 09: the Following list's family rows reuse the card's 40px avatar
// (the HostAvatar shape) rather than growing a second one.
import { HostAvatar } from '../components/DropInCard'

/**
 * /profile — the signed-in family's own page.
 *
 * V8 ticket 10: **one "Save profile" submit** for the whole form (display
 * name, location, bio, interests, and every kid row) instead of the six Save
 * buttons that used to live here. The submit is the pure planProfileSave
 * (lib/profileSave.ts, unit-tested): it writes ONLY the sections that actually
 * changed, a no-op save issues no write at all, and each section is written
 * independently — so a failed bio write never discards the name a parent also
 * fixed, and the section that failed keeps its pending text on screen.
 *
 * The per-section inline errors are unchanged in spirit (the same validators,
 * the same messages); each one is now reported by the section that owns it.
 *
 * UNSAVED TYPING IS GUARDED (the seed-once discipline used to drop it in
 * silence): while anything is dirty, an in-app link asks before leaving
 * (useUnsavedChangesGuard) and a refresh/tab close gets the browser's own
 * prompt.
 *
 * The display_name handle is the persistent public handle (inline "handle
 * taken" error on a unique violation — 0004's constraint, surfaced as
 * HandleTakenError). Saves refresh the shared session state so the app-shell
 * header picks up the changes.
 *
 * NEIGHBORHOODS ARE DISPLAY-ONLY (the doc fix, V8 ticket 10). This comment
 * used to claim the card supports add/remove; it never did after V2 slice 3.
 * The card lists the memberships the profile already has as labels and nothing
 * else — memberships stopped filtering anything when discovery moved to home
 * zip + radius (the render says so in its own sentence). There is no
 * membership write path on this page and no add/remove control to find.
 *
 * V2 slice 1: the "Your posts" list — the viewer's own drop-ins, newest
 * first — each with a Duplicate action. Duplicate navigates to /new with
 * router-state prefill of everything except the date/time (always
 * re-entered). The own-posts query is the injected-client
 * queryMyPlaydatesWithClient (feed.ts, unit-tested) run against the shared
 * db.ts client — db.ts itself gains no new surface (slice constraint).
 *
 * V8 ticket 04: that list gains the same Upcoming/Past split /u/:handle got
 * (the pure feed.partitionPostsByTime — upcoming, the soonest first; past, the
 * most recent first), so a host can see their own history instead of only the
 * newest-first pile. The Duplicate action stays on EVERY row, past posts
 * included — re-posting last week's meetup as next week's is exactly what that
 * button is for (and where ticket 09's "Same time next week" lives). The
 * read path is unchanged (queryMyPlaydatesWithClient): this is the owner's own
 * page, so the split is a render decision and nothing else.
 *
 * V9 ticket 04 (the archive rules, pinned by that ticket's AC): /profile's Past
 * list IS the archive the feed links to ("See past drop-ins"), so a past row
 * had to stop being a dead end. Two gaps were real, both fixed HERE and nowhere
 * else:
 * - A row was not a LINK at all — the title was plain text, so a host could not
 *   open their own past drop-in from /profile, which is the only route to V8/09's
 *   "Same time next week" affordance (it lives on /playdate/:id). The title is
 *   now the row's link (both sections; an upcoming own post was equally
 *   un-openable).
 * - Nobody was MUTED: Past and Upcoming rows looked identical, so the archive
 *   read as "more upcoming". Past rows now carry the same mute the archive cards
 *   do (DropInCard's `opacity-60` — one signal, one meaning), applied to the
 *   row's TEXT and not to the Duplicate button: that button is a live action
 *   (V8/04 pins it on every row), and dimming a working control to the level of
 *   dead content is the "disabled-looking button" smell this codebase avoids.
 * There is no "I'm going" toggle on these rows and never was — it is the feed
 * card's control (UserPage passes none to its archive cards either), and the
 * AC pins its ABSENCE.
 *
 * V2 slice 2 (ticket 02): the comfort layer on the owner side —
 * - avatar: a photo upload (cropped by the user, resized to 512px, > 5 MB rejected
 *   before upload, stored at avatars/<uid>/avatar) with a live preview
 * - bio: a <= 500-char textarea (app cap + the 0011 DB backstop)
 * - kids: structured rows (first name + age ONLY — the privacy pin), max 5
 *   app-enforced, and (V8 ticket 10) editable IN PLACE — the name, the age and
 *   the "likes" line are fields on the row itself, saved by the same submit,
 *   instead of Remove + re-add (which threw away the row's photo, its likes
 *   and its identity in every "who's coming" selection). Remove asks first and
 *   names what it costs. The 5-kid cap says so on screen instead of silently
 *   disabling the inputs.
 * - a persistent nudge banner until photo + bio + kids are all present
 *   (the missing-items decision is the pure missingProfileItems)
 *
 * V8 ticket 09 (migration 0033): /profile gains the **Following** section —
 * the families and places this parent has bookmarked, with an Unfollow button
 * on every row. The rows come from db.listMyFollowing (the caller's OWN
 * follows: the 0033 SELECT policy is owner-only, so this is the only place a
 * follow graph is ever read in full, and it is read by its owner) plus one
 * batched profiles read and one batched places read for the handles/names.
 * There is deliberately NO follower count here (of you or of anyone) and no
 * list of WHO follows whom — counts only, and even those for places, never for
 * a person (a follow is a bookmark, not a score).
 */
export function ProfilePage() {
  const navigate = useNavigate()
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
  // value wins over a re-list, the seed-once discipline, per kid); kidPhoto* is
  // the row's own upload path (uploadKidPhoto — the crop step + 512px/≤5MB
  // avatars-bucket round-trip), whose handleRefreshKids re-list lands the new
  // avatar_url on the rows' 40px circles.
  const [kidDrafts, setKidDrafts] = useState<Record<string, KidFormValues>>({})
  const [kidWriteErrors, setKidWriteErrors] = useState<Record<string, string>>({})
  const [kidSavedId, setKidSavedId] = useState<string | null>(null)
  const [kidPhotoBusyId, setKidPhotoBusyId] = useState<string | null>(null)
  const [kidPhotoSavedId, setKidPhotoSavedId] = useState<string | null>(null)
  const [kidPhotoError, setKidPhotoError] = useState<string | null>(null)
  // Which kid row the crop step is currently framing a photo for. The kid-photo
  // crop's confirm handler reads it, so the same hook serves every row.
  const [kidPhotoFor, setKidPhotoFor] = useState<string | null>(null)

  // V3 slice 6 (ticket 09): the profile interests field (<= INTERESTS_MAX_LENGTH,
  // trim; the db layer validates too — the updateBio defense-in-depth
  // pattern). Seeded from the profile once it loads; user typing wins
  // after. Pre-0022-apply the field is absent from the row (undefined →
  // '') and the save 42703s (the designed error line, the DB-not-applied
  // discipline).
  const [memberships, setMemberships] = useState<MembershipWithNeighborhood[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [myPosts, setMyPosts] = useState<Playdate[] | null>(null)
  const [postsError, setPostsError] = useState<string | null>(null)

  // V8 ticket 09 (migration 0033): the Following list — the families and
  // places this parent bookmarked (null = still loading). A failed read
  // (pre-0033-apply: PGRST205) renders its own sentence and nothing else the
  // page does changes. `unfollowBusyId` is one row's in-flight unfollow.
  const [following, setFollowing] = useState<MyFollowing | null>(null)
  const [followingError, setFollowingError] = useState<string | null>(null)
  const [unfollowBusyId, setUnfollowBusyId] = useState<string | null>(null)

  /**
   * V3 slice 6 (ticket 09): re-list the kids after a kid photo upload
   * (the fresh rows carry the new avatar_url — the rows' 40px circles
   * update). A failed re-list surfaces the page's kids error line (the
   * designed state); the row's own "Photo updated." confirmation already
   * landed.
   *
   * Declared HERE, above the crop step that calls it, rather than down with the
   * other kid handlers: a function declaration is hoisted so it would still run
   * from below, but referencing it before its declaration reads as accessing a
   * value mid-initialization (which React Compiler flags, correctly).
   *
   * V8 ticket 10: the re-list seeds the ROW values and keeps every in-flight
   * draft (seedKidDrafts), so a photo upload can no longer drop a half-typed
   * name in the row beside it.
   */
  async function handleRefreshKids() {
    if (userId === null) return
    try {
      const rows = await listKids(userId)
      setKids(rows)
      setKidDrafts((prev) => seedKidDrafts(rows.map(toKidRowValues), prev))
    } catch (err) {
      setKidsError(err instanceof Error ? err.message : 'Could not load your kids.')
    }
  }

  /**
   * THE TWO CROP STEPS (photo-crop ticket 03) — the parent's own avatar, and a
   * kid's photo. Two instances rather than one, because their confirm handlers do
   * different things (the avatar refreshes the session so the header and the nudge
   * banner update; a kid photo re-lists the rows); only one dialog can be open at
   * a time anyway.
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

  const kidPhotoCrop = useCropStep(async (source, rect) => {
    if (userId === null || kidPhotoFor === null) return
    setKidPhotoBusyId(kidPhotoFor)
    setKidPhotoError(null)
    setKidPhotoSavedId(null)
    try {
      await uploadKidPhoto(userId, kidPhotoFor, source, rect)
      setKidPhotoSavedId(kidPhotoFor)
      await handleRefreshKids()
    } catch (err) {
      setKidPhotoError(
        err instanceof Error ? err.message : 'Could not upload that photo. Try again.',
      )
    } finally {
      setKidPhotoBusyId(null)
    }
  })

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

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  const memberNames = (memberships ?? []).map((m) => m.neighborhood.name)

  // V8 ticket 04: the "Your posts" split — the same pure seam /u/:handle uses
  // (upcoming ascending, past descending; upcoming is the complement of
  // isEnded). nowIso is read once per render (the BrowsePage pattern).
  const nowIso = new Date().toISOString()
  const { upcoming: upcomingPosts, past: pastPosts } = partitionPostsByTime(
    myPosts ?? [],
    nowIso,
  )

  /**
   * One "Your posts" row (V8 ticket 04 — it renders in BOTH sections, so it is
   * built once here): the title (V9 ticket 04: a LINK to the drop-in, the way
   * the archive reaches V8/09's "Same time next week"), when + place, and the
   * Duplicate action, which stays on every row, past posts included.
   *
   * `muted` is the archive's own signal (the DropInCard `opacity-60`): a Past
   * row is history, an Upcoming row is a plan, and before this ticket the two
   * were indistinguishable. It mutes the row's TEXT only — Duplicate stays at
   * full strength because it works (see the page header's V9 note).
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
        </p>
      </div>
      <button
        type="button"
        onClick={() => navigate('/new', { state: { duplicate: toDuplicatePrefill(post) } })}
        className="shrink-0 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200"
      >
        Duplicate
      </button>
    </li>
  )

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

  /**
   * V3 slice 6 (ticket 09, migration 0022): the row's kid photo upload — the
   * ≤5MB gate and the decode run inside the crop step (photo-crop ticket 03), the
   * user frames the photo, and the encoder produces the square; stored in the
   * 'avatars' bucket at <uid>/kids/<kidId>, then kids.avatar_url points at the
   * public URL. The handleRefreshKids re-list lands the fresh avatar_url (the
   * row's 40px circle updates); the row's own "Photo updated." confirmation
   * already landed. A failed upload (the bucket write policy, a rejected file)
   * surfaces the page's kids photo error line; nothing is saved.
   */
  async function handleKidPhotoChange(kidId: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = '' // allow re-picking the same file
    if (userId === null || file === null || kidPhotoBusyId !== null) return
    setKidPhotoError(null)
    setKidPhotoSavedId(null)
    // Which row this crop is for, BEFORE the dialog opens — the confirm handler
    // reads it back.
    setKidPhotoFor(kidId)
    const error = await kidPhotoCrop.beginCrop(file)
    if (error !== null) setKidPhotoError(error)
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

  const missingLabels: Record<'photo' | 'bio' | 'kids', string> = {
    photo: 'a photo',
    bio: 'a bio',
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
        {avatarCrop.dialog}
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
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">About</span>
            <textarea
              className={
                'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                (liveBioError !== null || writeErrors.bio !== undefined
                  ? 'border-red-400'
                  : 'border-slate-300')
              }
              value={draft?.bio ?? ''}
              onChange={(e) => editDraft({ bio: e.target.value }, 'bio')}
              placeholder="A few words about your family (optional)"
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
            Shown under your bio on your profile.
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
            First name, age, an optional photo, and a “likes” line (up to {MAX_KIDS_PER_PROFILE}).
            Edit a row and save the whole profile — nothing here saves on its own.
          </p>
          {/* V9 ticket 05: the privacy promise, in the UI — "the kids editor
              makes clear that first names are optional ... and the copy says
              the name is only shown to families who are going".
              WHAT THIS COPY ACTUALLY PROMISES, and why it is worded this way
              (a deviation from the ticket's exact sentence, reported with
              evidence): names are NOT currently limited to families who are
              going. Two standing policies make them visible to any signed-in
              parent — 0011's `kids_select_authenticated` (USING (true): the
              /u/:handle kid list) and 0022's `playdate_kids_select_authenticated`
              (USING (true): the detail page's "Kids coming" line, which is what
              renders those names). The 0026 gate limits only the OTHER
              families' kids (`get_kids_going`). So the honest sentence is the
              one below: no name ever reaches a nearby CARD (that part is
              absolute — the card carries a range), and on the surfaces that do
              show it, it is signed-in families only. Promising "only families
              who are going" would be a false promise the schema contradicts;
              tightening the gate to make that sentence true is its own ticket,
              not this one (this ticket explicitly changes no gate). */}
          <p className="mt-1 text-sm text-slate-600">
            A first name is optional — skip it and your kid still shows up by age
            (the cards say “ages 3–6”, never a name). A name appears only on your
            profile and on a drop-in’s page, and only to signed-in families.
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
                // this kids list — never on cards or event lines.
                //
                // V8 ticket 10: the row is EDITABLE IN PLACE — first name, age
                // and "likes" are fields on the row, saved by the one submit
                // (savePlan.kids). The name + age inputs carry aria-labels and
                // testids rather than placeholders, because the "Add kid" form
                // below owns the 'First name' / 'Age' placeholders and two
                // elements answering to the same placeholder is how a spec (and
                // a screen reader) starts guessing.
                // V9 ticket 05: a first name is optional, so `kid.first_name`
                // can be NULL. One local, normalised name feeds the photo alt,
                // the initial circle and the aria labels below — never a
                // `null.charAt` crash, never "'s photo" and never "null".
                const kidName = (kid.first_name ?? '').trim()
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
                    {kid.avatar_url ? (
                      <img
                        src={kid.avatar_url}
                        alt={kidName === '' ? 'Your kid’s photo' : `${kidName}’s photo`}
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-500"
                      >
                        {(kidName.charAt(0) || '?').toUpperCase()}
                      </span>
                    )}
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
                    {kidPhotoSavedId === kid.id ? (
                      <p className="w-full text-xs text-emerald-700">Photo updated.</p>
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
          {kidPhotoError !== null ? (
            <p className="mt-2 text-sm text-red-600">{kidPhotoError}</p>
          ) : null}
          {kidsError !== null ? <p className="mt-2 text-sm text-red-600">{kidsError}</p> : null}
          {kidPhotoCrop.dialog}
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
          <div className="mt-3 flex flex-col gap-3">
            {/* V8 ticket 04: the same split (and the same empty-state copy) as
                /u/:handle — nothing ahead of you but history below reads
                honestly, and every past row keeps its Duplicate. */}
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
                {/* V9 ticket 04: the archive — muted rows (renderPostRow's
                    `muted`), the same signal the archive cards carry. */}
                <h3 className="text-sm font-semibold text-slate-700">Past</h3>
                <ul className="flex flex-col gap-1">
                  {pastPosts.map((post) => renderPostRow(post, true))}
                </ul>
              </section>
            ) : null}
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

/** Local "Sep 12 · 3 PM" for an own-post row. */
function formatPostWhen(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric' })}`
}
