import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { NAV_ICONS } from '../components/icons'
import { NotificationsSection } from '../components/NotificationsSection'
import { SectionHeader } from '../components/SectionHeader'
import { useSessionContext } from '../components/SessionProvider'
import {
  HandleTakenError,
  INTERESTS_MAX_LENGTH,
  listKids,
  listMemberships,
  listMyFollowing,
  missingProfileItems,
  unfollowById,
  updateBio,
  updateDisplayName,
  updateHomeZipRadius,
  updateInterests,
  validateBio,
  validateInterests,
  type MyFollowing,
} from '../lib/db'
import {
  DEFAULT_RADIUS_MILES,
  RADIUS_MILES_OPTIONS,
} from '../lib/feed'
import {
  planProfileSave,
  seedProfileFormValues,
  type ProfileFormValues,
  type ProfileSection,
} from '../lib/profileSave'
import { autosaveEmptyPass } from '../lib/autosave'
import type { Kid, MembershipWithNeighborhood } from '../lib/types'
// V8 ticket 09: the Following list's family rows reuse the card's 40px avatar
// (the HostAvatar shape) rather than growing a second one.
import { HostAvatar } from '../components/DropInCard'

/**
 * V12 t01: the autosave debounce — well past the ticket's 300ms floor, so a
 * burst of keystrokes is ONE write. The same constant re-arms the follow-up
 * pass a coalesced edit triggers (via the autosaveTick bump below).
 */
const AUTOSAVE_DEBOUNCE_MS = 400

/**
 * /settings — the signed-in family's EDITING page, the narrow half of the
 * profile/settings split (V13 ticket 01).
 *
 * V11 ticket 06 split the old monolithic /profile in two; V13 ticket 01 split
 * the two halves again. /settings keeps the family's IDENTITY + PREFERENCE
 * controls:
 * - profile: the display name — the persistent public handle (inline "handle
 *   taken" on a unique violation: 0004's constraint, surfaced as
 *   HandleTakenError). The avatar card, the optional family photo, the
 *   "About our family" bio and the kids section all MOVED to the now-editable
 *   /profile (ProfilePage) in V13 ticket 01; /settings owns none of them any
 *   more.
 * - location: home zip + radius (the comfort/comfort-neighborhood controls).
 * - interests: the app's ONLY interests editor — /profile displays the line,
 *   /settings edits it, so it stays here even after the split.
 * - notifications: the NotificationsSection (push opt-in / status / dismiss).
 * - following: the families and places this parent has bookmarked, with an
 *   Unfollow button on every row (the owner-only 0033 SELECT policy makes this
 *   the only place a follow graph is read in full; no follower counts anywhere).
 * - neighborhoods: the memberships the profile already has, as display-only
 *   labels (memberships stopped filtering anything when discovery moved to home
 *   zip + radius; there is no membership write path here).
 *
 * The persistent nudge banner (the still-missing items — photo + bio + kids,
 * decided by the pure missingProfileItems) STAYS on this page as an aid even
 * though the items it names now live on /profile. Its kids count is a
 * best-effort count-only read (listKids): the rows themselves are the editor's
 * concern, not this page's, so a failed read is left silent and the banner
 * simply cannot count (an unknown count reads as "maybe missing").
 *
 * V12 t01: the form AUTOSAVES — there is no save control anywhere on the
 * page (the one "save profile" button V8 ticket 10 shipped is gone). Every
 * keystroke — display name, home zip, radius, and interests — re-arms the
 * AUTOSAVE_DEBOUNCE_MS debounce; when it settles, the pure planProfileSave
 * (lib/profileSave.ts, unit-tested) decides what actually changed and writes
 * ONLY those sections, each write awaited on its own — a failed name write
 * never discards the location a parent also fixed, and the section that
 * failed keeps its pending text + its inline error on screen (the failed
 * section is not retried on its own; a re-edit re-triggers the pass). The
 * bio + kid rows no longer flow through this page's machine at all: their
 * autosave lives on /profile (the same seam, re-homed). The line that used to
 * hold the button is now the autosave indicator: "Changes save as you go." at
 * rest, "Saving…" while a pass is in flight, "Saved." when it lands, and the
 * failure sentence when a section kept its text — with the section that
 * failed carrying its own inline message.
 *
 * TYPING IS NEVER LOST AND NOTHING ASKS ABOUT IT: the debounced machine is
 * fire-and-forget, so the unsaved-changes guard (the in-app link while
 * anything was dirty, plus the refresh/close browser prompt) is gone —
 * leaving the page mid-save lets the in-flight write land on its own, and no
 * dialog stands between a parent and an in-app link. Saves that land refresh
 * the shared session state so the app-shell header picks up the changes.
 */
export function SettingsPage() {
  const { session, loading, profile, refresh } = useSessionContext()
  const userId = session?.user?.id ?? null

  // V8 ticket 10: the whole form's values (one object, so "is anything dirty?"
  // is one comparison) + the last-saved baseline they are compared against.
  // The baseline advances per SECTION, only when that section's write landed.
  const [draft, setDraft] = useState<ProfileFormValues | null>(null)
  const [baseline, setBaseline] = useState<ProfileFormValues | null>(null)
  /**
   * V12 t01: the autosave indicator's state (replaces the `saving` boolean +
   * the save-note pair). 'idle' is the at-rest "Changes save as you go."
   * line; a pass moves 'saving' → 'saved' (every write it attempted landed)
   * or 'error' (at least one section kept its pending text + its inline
   * error).
   */
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  /**
   * V12 t01: bumped when an edit lands while a pass is in flight — the
   * completion handler cannot re-arm the debounce timer itself (that would
   * be a self-referential timer inside the pass it completes), so it bumps
   * this state and the scheduling effect below re-arms the timer for the
   * follow-up pass. The indicator stays "Saving…" across the seam.
   */
  const [autosaveTick, setAutosaveTick] = useState(0)
  const [writeErrors, setWriteErrors] = useState<Partial<Record<ProfileSection, string>>>({})

  // V13 ticket 01: the kids load is COUNT-ONLY (the nudge banner's
  // missingProfileItems call) — the editor's rows, drafts, busy flags and
  // confirm dialog all live on /profile now. `kids` holds the rows the count
  // read returned; null while that read is in flight or failed (the banner
  // treats an unknown count as "maybe missing" — best-effort, on purpose).
  const [kids, setKids] = useState<Kid[] | null>(null)

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

  // Seed the whole form ONCE the profile loads; user typing wins after (the
  // seed-once guard is what keeps a refresh() from erasing an edit; V12 t01
  // dropped the unsaved-changes guard, so leaving mid-edit just lets the
  // debounced autosave finish its write).
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

  // V13 ticket 01: the kids read is COUNT-ONLY — the nudge banner's
  // missingProfileItems call needs `kids.length`, and nothing else on this
  // page does (the kid editor's rows + drafts live on /profile now). A
  // failed read (0011 not applied yet) is left SILENT on purpose: the
  // banner's count is best-effort — `kids` stays null, the banner treats an
  // unknown count as "maybe missing" — and there is no kids section on this
  // page any more that a designed error sentence would belong to.
  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    setKids(null)
    listKids(userId)
      .then((rows) => {
        if (cancelled) return
        setKids(rows)
      })
      .catch(() => {
        // Silent by design (the count-only note above): the banner simply
        // cannot count when its read fails, and that is the whole read's job.
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

  /**
   * THE AUTOSAVE'S DECISION, computed at render (the pure planProfileSave —
   * the render-time plan feeds ONLY the name field's inline "blocked" state
   * below, so the input can show a validation error before the debounced
   * write is even attempted; the write itself re-plans from the same inputs
   * at write time, for the sections it actually attempts).
   *
   * V13 ticket 01: the plan now runs over ZERO kid rows + drafts (they live
   * on /profile's own autosave machine) — `planProfileSave` takes them as
   * required inputs, so the empty literals are the honest values here. The
   * `kid` validator is omitted for the same reason: there is no kid row on
   * this page to validate, and the field is optional in the validators map.
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
          kidRows: [],
          kidDrafts: {},
          validators: {
            name: (value) => (value.trim() === '' ? 'Your display name can’t be empty.' : null),
            bio: validateBio,
            interests: validateInterests,
          },
        })

  /**
   * V12 t01: THE AUTOSAVE MACHINE. One debounce timer (AUTOSAVE_DEBOUNCE_MS —
   * well past the ticket's 300ms floor, so a burst of keystrokes is one
   * write), one in-flight pass, and a `pending` flag: an edit that lands
   * while a pass is running is coalesced (the pass reads the same
   * draft/baseline the edit just changed), and the completion bumps
   * autosaveTick so the scheduling effect below re-arms the timer for the
   * follow-up pass. The timer + the flags live in one ref object so the pass
   * can read and mutate them without re-creating the callbacks.
   *
   * `autosaveInputs` is the same trick for the rest: runAutosave keeps a
   * STABLE identity (useCallback with no deps — the scheduling effect must
   * not re-arm just because a render happened), so it reads the current
   * values through a ref that a no-deps effect refreshes after every render.
   *
   * V13 ticket 01: the ref no longer carries kid rows + drafts — the kid
   * editor's autosave machine is /profile's own, and this pass writes only the
   * profile sections.
   */
  const autosaveMachine = useRef({
    running: false,
    pending: false,
    timer: null as ReturnType<typeof setTimeout> | null,
  })
  const autosaveInputs = useRef({
    draft: null as ProfileFormValues | null,
    baseline: null as ProfileFormValues | null,
    userId: null as string | null,
    refresh: null as (() => Promise<void>) | null,
  })
  useEffect(() => {
    autosaveInputs.current = { draft, baseline, userId, refresh }
  })

  /**
   * V12 t01: THE AUTOSAVE PASS (replaces the old one-submit handler). The
   * plan decides what may be written: every changed + valid section. Each
   * write is awaited on its own, so
   *  - a failure is reported by the section that failed (its inline error
   *    line, its own message) and
   *  - a failure never costs the other sections their edits: the baseline
   *    advances only for the sections whose write landed, so everything that
   *    did not save is still on screen — and it is NOT retried on its own:
   *    the pass ends, the indicator says so, and a re-edit re-triggers.
   *
   * The blocked (invalid) sections are simply not attempted — their inline
   * error is already visible (see savePlan above).
   *
   * V13 ticket 01: no kid rows in the pass any more (they plan + write on
   * /profile's machine) — and no kid write-error map to clear, with them.
   */
  const runAutosave = useCallback(async () => {
    const machine = autosaveMachine.current
    if (machine.running) {
      // Coalesced: the in-flight pass reads the same inputs this edit just
      // changed; the completion re-arms a follow-up pass for it.
      machine.pending = true
      return
    }

    const { draft, baseline, userId, refresh } = autosaveInputs.current
    if (draft === null || baseline === null || userId === null) return

    const plan = planProfileSave({
      baseline,
      draft,
      // V13 ticket 01: this page owns no kid rows + drafts (see savePlan
      // above) — the empty literals keep the pure planner's contract.
      kidRows: [],
      kidDrafts: {},
      validators: {
        name: (value) => (value.trim() === '' ? 'Your display name can’t be empty.' : null),
        bio: validateBio,
        interests: validateInterests,
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
      name: () => updateDisplayName(userId, draft.name.trim()),
      location: () => updateHomeZipRadius(userId, draft.homeZip.trim(), draft.radiusMiles),
      // The bio writer is a TYPE requirement of the Record (every section
      // needs a writer), not a live path: V13 ticket 01 moved the bio input
      // to /profile, so this page's draft bio can never change from its
      // baseline and the planner never schedules this section. It stays so
      // the machine's contract is complete rather than patched.
      bio: () => updateBio(userId, draft.bio),
      interests: () => updateInterests(userId, draft.interests),
    }
    const savedValues: Partial<ProfileFormValues> = {}
    let failures = 0

    for (const section of plan.sections) {
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

    // Advance the baseline only where a write landed (a failed section keeps
    // its pending text, on purpose).
    if (Object.keys(savedValues).length > 0) {
      setBaseline((prev) => (prev === null ? prev : { ...prev, ...savedValues }))
      // The shared session state (the header, the onboarding gate, the feed)
      // picks up a changed display name / location.
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
   * name, home zip, radius, interests (the V13 ticket 01 split removed the kid
   * rows from this page's machine, so the effect's key set shrank to the four
   * section fields) — and the timer re-arms to the end of the burst, then
   * the pass runs. A pass that lands advances `baseline` (re-keying this
   * effect), which re-arms a timer that fires into an empty plan (no write;
   * the settle only turns a leftover "Saving…" into "Saved."), so the
   * "Saved." line persists instead of flickering back to idle.
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
  }, [draft, baseline, userId, autosaveTick, runAutosave])

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
  // V13 ticket 01 keeps the banner HERE even though the items it names now
  // live on /profile: this page still owns the display name + location, and
  // the count read above is its only touch of the kid data.
  const missing = missingProfileItems(profile, kids === null ? null : kids.length)

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

  const missingLabels: Record<'photo' | 'bio' | 'kids', string> = {
    photo: 'a photo',
    bio: 'a bit about your family',
    kids: 'your kids',
  }
  const nameBlocked =
    savePlan?.blockedSections.find((item) => item.section === 'name')?.error ?? null
  const liveNameError = writeErrors.name ?? nameBlocked
  const liveInterestsError = validateInterests(draft?.interests ?? '')

  /**
   * V13 ticket 01: the page's own tagline follows its narrowed scope — it
   * owns the display name + location + notifications, and /profile (now
   * editable) owns the photos, the bio and the kids.
   */
  const tagline = 'Your display name, location, and notifications'

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionHeader icon={NAV_ICONS.gear} title="Settings" tagline={tagline} />
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
            like knowing who they’re meeting.{' '}
            <Link to="/profile" className="font-medium underline underline-offset-2">
              Add them on your profile page
            </Link>
            .
          </p>
        </div>
      ) : null}

      {/* V13 ticket 01: the two photo cards (the parent's avatar + the family
          photo) moved to the now-editable /profile (ProfilePage) — its family
          photo card is always present (add or change), and its avatar card
          displays the photo the shell header already uses. This page keeps no
          photo control: the nudge banner above still names a missing photo
          (the items it lists now live on /profile). */}

      {/* V12 t01: ONE form, NO save control. Everything a parent edits on this
          page — the display name, the location, and the interests — autosaves
          (the debounced machine above); the form element stays for the
          inputs' semantics, with the implicit submit swallowed so a stray
          Enter cannot reload the page. (The bio and the kid rows no longer
          edit here — /profile's machine owns them since V13 ticket 01.) */}
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
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
              disabled={draft === null}
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
              disabled={draft === null}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Radius</span>
            <select
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              value={draft?.radiusMiles ?? DEFAULT_RADIUS_MILES}
              onChange={(e) => editDraft({ radiusMiles: Number(e.target.value) }, 'location')}
              disabled={draft === null}
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

        {/* V13 ticket 01: the "About our family" bio field moved to the
            now-editable /profile (ProfilePage) — this page's machine still
            carries the bio WRITER (the Record's type contract), but there is
            no bio input left to feed it. */}

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
              disabled={draft === null}
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

        {/* V13 ticket 01: the Kids section — the rows (name + age + likes), the add
            form, the five-kid cap, and the privacy + photo notices — moved to
            the now-editable /profile (ProfilePage), whose rows autosave on the
            same V12 t01 seam. This page keeps a COUNT-ONLY kids read (for the
            nudge banner above) and nothing else of the kid data. */}

        {/* V12 t01: THE AUTOSAVE INDICATOR — the line that used to hold the save
            button + the "unsaved changes" sentence + the result note, in one
            always-on line where the button used to be. "Saved." is the
            terminal state of a pass that wrote at least one section (V13
            ticket 01: this page's pass writes the profile sections only — the
            kid rows write on /profile's own machine); a failed pass names
            itself here, and the section that failed carries its own inline
            error beside its field. */}
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

      {/* V13 ticket 01: the Remove-kid confirmation used to live here (V8
          ticket 10 — it named the kid and what the delete costs, their
          "kids coming" rows cascading away per 0022 + 0026). It moved to
          /profile with the kid rows it confirms: the dialog, the handler and
          the state behind it are all ProfilePage's now. */}
    </div>
  )
}
