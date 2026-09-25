import { useCallback, useEffect, useRef, useState } from 'react'
import { NAV_ICONS } from '../components/icons'
import { SectionHeader } from '../components/SectionHeader'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useSessionContext } from '../components/SessionProvider'
import { useFamilyPhotoUrl } from '../components/useFamilyPhotoUrl'
import { useKidPhotoUrls } from '../components/useKidPhotoUrls'
import { useCropStep } from '../components/useCropStep'
import { ProfileView } from '../components/ProfileView'
import {
  addKid,
  BIO_MAX_LENGTH,
  clearAvatar,
  HandleTakenError,
  listKids,
  deleteParentCard,
  listMyAccountLinksWithHandles,
  listParentCards,
  LinkTargetUnknownError,
  requestAccountLink,
  respondToAccountLink,
  saveParentCard,
  searchProfilesByName,
  unlinkAccounts,
  LIKES_MAX_LENGTH,
  MAX_KIDS_PER_PROFILE,
  removeKid,
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
  linkView,
  normalizeHandle,
  validateLinkRequest,
} from '../lib/links'
import { nextParentPosition, parentCardList, PARENT_CARDS_BLURB } from '../lib/parentCards'
import type { AccountLink, Kid, ParentCard, ProfileWithKids } from '../lib/types'
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
import type { ProfileSectionKey } from '../lib/profileSections'

/**
 * V21 t08: THE EDIT SURFACE'S SECTION ORDER, declared as data for the
 * anti-drift test (src/lib/profileSections.test.ts). It mirrors the JSX below
 * exactly: identity card → kids editor → the parents group (bio card + family
 * photo card + parent cards + linked parent — V23 s16 moved the family photo
 * into this group, matching the read view's sequence). The edit surface
 * intentionally has NO drop-ins section (V16 t04 removed the "Hosted
 * drop-ins" card from /profile; posts are managed from /new), so 'dropins' is
 * omitted. Reorder any of those cards and this list must move with it, or the
 * pinned-order assertion in the test fails.
 */
export const PROFILE_EDIT_SECTIONS: readonly ProfileSectionKey[] = [
  'user',
  'kids',
  'parents',
]

/**
 * V12 t01: the autosave debounce — well past the ticket's 300ms floor, so a
 * burst of keystrokes is ONE write. The same constant re-arms the follow-up
 * pass a coalesced edit triggers (via the autosaveTick bump below).
 */
const AUTOSAVE_DEBOUNCE_MS = 400

/**
 * /profile — the family's OWN profile: the founder-asked READ view first, with
 * the editor one tap behind it.
 *
 * V20 t01 RESTRUCTURED THIS PAGE, and the shape is the point:
 *
 *  - READ MODE (the default) renders `ProfileView` — the SAME component
 *    `/u/:handle` renders. Tapping the Profile tab now shows exactly what
 *    tapping a `@handle` link shows, because it is the same code, not a second
 *    render kept in step by hand. The only thing this surface adds is the
 *    "Edit profile" button, passed to `ProfileView` as its `header` slot so it
 *    sits at the very top of the page.
 *
 *  - EDIT MODE (behind that button) is everything this page used to render
  *    unconditionally: the identity card, the family photo, "About the kids",
  *    "About the parents" (the bio), "The parents" (parent cards), and "Linked
  *    parent". Nothing about that machinery changed in the move — the same
 *    debounced autosave machine (V12 t01), the same pure planner
 *    (planProfileSave, lib/profileSave.ts) writing only what changed, the same
 *    crop steps writing OBJECT PATHS rather than URLs.
 *
 *  - A MODE, NOT A ROUTE. There is no /profile/edit, so a refresh or a back
 *    gesture lands on the read view instead of deep-linking a half-typed form,
 *    and no URL-entered state can reach the editor without the loaded data it
 *    needs.
 *
 * The editor's blocks, in the pinned order (V16 t04 dropped the last one;
 * V23 s16 moved the family photo into the parents region):
 *  - "Your photo & name" (the identity card: the tap-the-circle photo control
 *    AND the inline display-name field in ONE card — the name editor moved out
 *    of its own identity block in V16 t04, with its save/validation wiring
 *    unchanged)
 *  - "About the kids" (kid rows: first name + age + a full-width multi-line
 *    likes textarea, an optional per-kid photo (owner-only render via
 *    useKidPhotoUrls), and Remove; plus the add-a-kid row and the five-kid cap)
 *  - "About the parents" (the bio, editable textarea; the display name renders
 *    as its OWN text node inside the photo card above, so a spec can match it
 *    exactly while the app-shell header shows the @-prefixed form)
 *  - "A photo of your family" (always-present card: the signed-URL image when
 *    set, plus the Add/Change control either way). V23 s16 placed it HERE, in
 *    the parents region right after the bio, matching the read view's sequence
 *    (it used to sit 2nd, before the kids — the drift this slice kills).
 *
 * V16 t04 REMOVED the "Hosted drop-ins" card (and with it this page's own-posts
 * load — see the removal note at its old position). Duplicating a past post
 * lives on /new's "Duplicate existing" picker and on a drop-in's host panel.
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
  const { session, loading, profile, refresh } = useSessionContext()
  const userId = session?.user?.id ?? null

  /**
   * V20 t01 (the founder's ask): THE PAGE HAS TWO MODES, AND READ IS THE
   * DEFAULT.
   *
   * Tapping the Profile tab must show the SAME view a `@handle` link opens —
   * that is `ProfileView`, the one component both surfaces render. The
   * editing controls this page has always carried are still here, but they sit
   * BEHIND the Edit profile button in the header slot, because a page that
   * opens with nine inputs is not the view other families see.
   *
   * The mode is local state on purpose: it is a viewing preference, not a
   * destination. There is no /profile/edit route, so a refresh or a back
   * gesture lands on the read view rather than deep-linking a half-typed form,
   * and the "edit" mode never needs a guard against being URL-entered without
   * the data the editor needs.
   */
  const [editing, setEditing] = useState(false)

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

  /**
   * V19 t05: the account's PARENT CARDS (up to two).
   *
   * `null` is the in-flight state, an array is settled — the same shape the kids
   * load uses, so the render branches identically. A failed load leaves an empty
   * list rather than an error banner: the cards are enrichment on a page that
   * still works without them, and the profile editor is the surface that should
   * complain if a SAVE fails.
   */
  const [parentCards, setParentCards] = useState<ParentCard[] | null>(null)
  const [parentCardBusy, setParentCardBusy] = useState(false)
  const [parentCardError, setParentCardError] = useState<string | null>(null)

  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    setParentCards(null)
    listParentCards(userId)
      .then((rows) => {
        if (!cancelled) setParentCards(rows)
      })
      .catch(() => {
        if (!cancelled) setParentCards([])
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  /**
   * V19 t04: the account's LINK rows — the invitations and any accepted partner.
   *
   * RLS returns ONLY rows this account is part of, so this is already the
   * viewer's own business and needs no further filtering for privacy. The
   * `linkView` seam turns the rows into the one state the section renders.
   *
   * A failed load leaves an empty list: the linking UI then shows the "link a
   * parent" form, which is a harmless thing to show someone who may already be
   * linked — the write path is what must be correct, and it is guarded by the
   * database.
   */
  const [accountLinks, setAccountLinks] = useState<AccountLink[] | null>(null)
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [linkHandleInput, setLinkHandleInput] = useState('')

  /**
   * V21 t07: the NAME search beside the @handle field. The founder's ask —
   * parents know names, not handles — so typing 2+ characters suggests
   * matching parents (name + handle per row); selecting one starts the SAME
   * invite flow `handleRequestLink` uses (validate → requestAccountLink →
   * re-read), never a second write path.
   *
   * The debounce is the pinned ~250ms: a burst of keystrokes is ONE request,
   * never one per key. The seam itself refuses queries under 2 chars, so the
   * effect only fires on input that can match anything.
   */
  const [linkNameQuery, setLinkNameQuery] = useState('')
  const [linkNameMatches, setLinkNameMatches] = useState<
    Array<{ display_name: string; handle: string }>
  >([])
  const [linkNameSearching, setLinkNameSearching] = useState(false)

  useEffect(() => {
    if (userId === null) return
    if (linkNameQuery.trim().length < 2) {
      setLinkNameMatches([])
      return
    }
    let cancelled = false
    setLinkNameSearching(true)
    const timer = setTimeout(async () => {
      try {
        const matches = await searchProfilesByName(linkNameQuery)
        if (!cancelled) setLinkNameMatches(matches)
      } catch {
        // A failed search leaves the previous list in place; the parent can
        // keep typing or fall back to the @handle field.
        if (!cancelled) setLinkNameMatches([])
      } finally {
        if (!cancelled) setLinkNameSearching(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [linkNameQuery, userId])

  /**
   * V21 t07: selecting a suggested parent. Fills the handle field (so the
   * section's own state stays honest) and sends through the EXISTING invite
   * flow — same validation, same `requestAccountLink`, same re-read. The send
   * uses the CHOSEN handle directly rather than `linkHandleInput` from this
   * render's closure, because the state update above has not landed yet.
   */
  async function handleSelectNameMatch(match: { display_name: string; handle: string }) {
    setLinkNameQuery('')
    setLinkNameMatches([])
    setLinkHandleInput(match.handle)
    const selfHandle = profile?.display_name ?? null
    const invalid = validateLinkRequest(match.handle, selfHandle)
    if (invalid !== null) {
      setLinkError(invalid)
      return
    }
    setLinkBusy(true)
    setLinkError(null)
    try {
      await requestAccountLink(normalizeHandle(match.handle))
      setLinkHandleInput('')
      await reloadLinks()
    } catch (err) {
      setLinkError(
        err instanceof LinkTargetUnknownError
          ? err.message
          : 'Could not send that invitation. Try again.',
      )
    } finally {
      setLinkBusy(false)
    }
  }

  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    setAccountLinks(null)
    // WITH HANDLES: the section renders `@handle`, so resolving the
    // counterparty is what makes it able to say WHO the link is with. `ocr`
    // (medium) caught that the first version read the bare rows and left every
    // `@…` branch unreachable.
    listMyAccountLinksWithHandles()
      .then((rows) => {
        if (!cancelled) setAccountLinks(rows)
      })
      .catch(() => {
        if (!cancelled) setAccountLinks([])
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // V16 t04: the owner's own-posts load used to sit here. It fed only the
  // removed "Hosted drop-ins" card, so it is gone with it — /profile no longer
  // issues the query my-playdates request at all. The duplicate path lives on
  // /new (the "Duplicate existing" picker), which does its own load.

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
  /**
   * V19 t04/t05: the linking + parent-card handlers.
   *
   * All of them follow the same shape: set a busy flag, clear the last error,
   * call the seam, re-read the affected list, and surface a message on failure.
   * The RE-READ rather than a local splice is deliberate — the database is the
   * authority on which rows exist (it enforces the one-partner rule and the
   * two-card cap), so reflecting its answer is more honest than predicting it.
   */
  async function reloadLinks() {
    try {
      setAccountLinks(await listMyAccountLinksWithHandles())
    } catch {
      // Leave the previous list in place; a failed refresh must not blank a
      // link the parent can see.
    }
  }

  async function reloadParentCards() {
    if (userId === null) return
    try {
      setParentCards(await listParentCards(userId))
    } catch {
      // As above: a failed refresh leaves what is already on screen.
    }
  }

  async function handleRequestLink() {
    if (userId === null) return
    const selfHandle = profile?.display_name ?? null
    // Pre-flight in the pure seam, so an empty or self handle answers instantly
    // with its OWN message instead of a round trip ending in a constraint error.
    const invalid = validateLinkRequest(linkHandleInput, selfHandle)
    if (invalid !== null) {
      setLinkError(invalid)
      return
    }
    setLinkBusy(true)
    setLinkError(null)
    try {
      await requestAccountLink(normalizeHandle(linkHandleInput))
      setLinkHandleInput('')
      await reloadLinks()
    } catch (err) {
      setLinkError(
        err instanceof LinkTargetUnknownError
          ? err.message
          : 'Could not send that invitation. Try again.',
      )
    } finally {
      setLinkBusy(false)
    }
  }

  async function handleRespondToLink(linkId: string, response: 'accepted' | 'declined') {
    setLinkBusy(true)
    setLinkError(null)
    try {
      await respondToAccountLink(linkId, response)
      await reloadLinks()
    } catch {
      setLinkError('Could not answer that invitation. Try again.')
    } finally {
      setLinkBusy(false)
    }
  }

  async function handleUnlink(linkId: string) {
    setLinkBusy(true)
    setLinkError(null)
    try {
      await unlinkAccounts(linkId)
      await reloadLinks()
    } catch {
      setLinkError('Could not remove that link. Try again.')
    } finally {
      setLinkBusy(false)
    }
  }

  /**
   * Save one parent card from its own inputs. The caller passes the slot and
   * the values, so the same handler serves both cards.
   */
  async function handleSaveParentCard(position: number, name: string, about: string) {
    if (userId === null) return
    if (name.trim() === '') {
      setParentCardError('A parent needs a name.')
      return
    }
    setParentCardBusy(true)
    setParentCardError(null)
    try {
      await saveParentCard({
        profileId: userId,
        position,
        name: name.trim(),
        about: about.trim() === '' ? null : about.trim(),
      })
      await reloadParentCards()
    } catch {
      setParentCardError('Could not save that parent. Try again.')
    } finally {
      setParentCardBusy(false)
    }
  }

  async function handleRemoveParentCard(position: number) {
    if (userId === null) return
    setParentCardBusy(true)
    setParentCardError(null)
    try {
      await deleteParentCard(userId, position)
      await reloadParentCards()
    } catch {
      setParentCardError('Could not remove that parent. Try again.')
    } finally {
      setParentCardBusy(false)
    }
  }

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
   * V20 t01: THE READ MODE — the SAME view a `@handle` link opens.
   *
   * `profile` from the session is a bare `Profile` (no kid rows); `ProfileView`
   * wants the `ProfileWithKids` shape the /u/:handle fetch returns. The kids
   * this page already loads for its editor are exactly those rows, so the
   * composition is local rather than a second fetch: one page, one kids read.
   *
   * While the kids load is in flight `kids === null`, and the view is told
   * `[]` — the same thing a family with no kids renders, which for the OWNER
   * means the kids card is simply absent for a beat and then appears. That is
   * the honest transient (nothing claims "no kids"), and it costs the visitor
   * path nothing: /u/:handle does its own single fetch and is never partial.
   */
  const ownedProfile: ProfileWithKids | null =
    profile === null ? null : { ...profile, kids: kids ?? [] }

  if (editing === false && ownedProfile !== null) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <SectionHeader
            icon={NAV_ICONS.profile}
            title="Profile"
            tagline="This is what other families see."
          />
        </div>
        {/* The header slot: the ONE control this surface adds to the shared
            view, at the very top of the page — the founder's placement. */}
        <ProfileView
          profile={ownedProfile}
          header={
            <button
              type="button"
              data-testid="edit-profile"
              onClick={() => setEditing(true)}
              className="min-h-11 self-start rounded-full bg-indigo-600 px-4 text-sm font-medium text-white"
            >
              Edit profile
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionHeader
          icon={NAV_ICONS.profile}
          title="Profile"
          tagline="Let families get to know you!"
        />
      </div>

      {/* V20 t01: the way BACK to the read view. Editing is a mode, and a mode
          needs an exit that is not the browser's back button — this sits where
          the Edit profile button was, so the control does not move. */}
      <button
        type="button"
        data-testid="done-editing-profile"
        onClick={() => setEditing(false)}
        className="min-h-11 self-start rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700"
      >
        Done
      </button>

      {/* V16 t04: THE IDENTITY CARD AND THE "Your photo" CARD ARE ONE. The
          separate identity block that used to sit above this card is GONE — the
          name field and the avatar now live in the same card, which is exactly
          what the founder asked for (hover/tap the photo circle to change or
          remove the photo AND change your display name in one place).

          SCOPE, stated so the next reader does not mistake this for a rewrite:
          this is the VISUAL unify. The name input keeps the SAME wiring it had
          in the identity block — the same `draft.name` value, the same
          `editDraft(..., 'name')` edit, the same debounced autosave, the same
          writers['name'] → updateDisplayName path and the same HandleTakenError
          / handle-uniqueness handling (see the writers Record above). Nothing
          about display-name save or validation changed; only its container did.
          Test ids (display-name-input, avatar-photo-trigger, avatar-photo,
          avatar-remove, avatar-photo-input) are unchanged, so the specs that
          drive them keep working. */}
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-slate-900">Your photo &amp; name</h2>
        <p className="mt-1 text-sm text-slate-600">
          Optional photo. It shows on your drop-in cards and your public page.
        </p>
        <div className="mt-3 flex items-start gap-3">
          {/* V15 ticket 06 (A19): TAP THE AVATAR TO CHANGE IT. The circle itself is
              the trigger for the file picker (no text button); a small × on its
              corner removes the photo (hover to reveal on desktop, long-press on
              mobile). No photo yet → a tappable "Add a photo" label (the same
              pattern). The circle also carries the page's identity render
              (HostAvatar's photo shape), so what you tap is what you get. */}
          {profile !== null && profile.avatar_url !== null && profile.avatar_url !== undefined ? (
            <div className="group relative shrink-0">
              <label
                data-testid="avatar-photo-trigger"
                className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-full transition-transform active:scale-95 motion-reduce:transition-none"
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
                  loading="lazy"
                  decoding="async"
                  className="aspect-square h-20 w-20 rounded-full object-cover"
                />
              </label>
              <button
                type="button"
                data-testid="avatar-remove"
                aria-label="Remove photo"
                onClick={() => void handleRemoveAvatar()}
                disabled={avatarRemoving}
                className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-medium text-slate-600 after:absolute after:-inset-2 after:content-[''] shadow-sm transition-colors motion-reduce:transition-none hover:bg-slate-100 disabled:opacity-50 sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ) : (
            <label className="flex shrink-0 cursor-pointer min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base font-medium text-indigo-700 transition-colors motion-reduce:transition-none hover:bg-slate-50">
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
          <div className="min-w-0 flex-1">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-700">Display name</span>
              <input
                data-testid="display-name-input"
                aria-label="Display name"
                className={
                  'w-full rounded-xl border px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
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

      {/* V23 s16: THE FAMILY PHOTO MOVED HERE — into the parents region, AFTER
          the bio card (see the card below "About the parents") — so the
          editor's on-screen sequence matches the read view's (the read view
          folds the family photo into its "About the parents" card as the
          CLOSER; the single-sourced block order is the pure profileBlurbOrder
          seam, src/lib/photoStorage.ts). It used to sit here, as the 2nd card
          before the kids — the drift this slice kills. The card itself is
          unchanged (still always present: Add/Change stays reachable and
          obvious); only its position moved. */}

      {/* V21 t08: THE KIDS CARD MOVED HERE — before the parents group — so the
          edit surface's section order matches the read view's pinned sequence
          (user → kids → parents → drop-ins; the edit surface omits drop-ins).
          It used to sit LAST, after the parents group, which was the drift this
          ticket kills. The card's contents are unchanged; only its position
          moved. */}
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-slate-900">About the kids</h2>
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
                  // V20 t01: the EDITOR's row is `kid-row-editor`. The read
                  // view (ProfileView) also renders one row per kid and keeps
                  // the `kid-row` testid it has always had — the two live on
                  // different routes now, but a spec that opens the editor must
                  // still be able to name the row it means. Sharing one testid
                  // across an editable row and a static text line made
                  // `.first()` ambiguous the moment both surfaces existed (two
                  // specs caught it).
                  return (
                    <li
                      key={kid.id}
                      data-testid="kid-row-editor"
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
                              'w-28 min-w-0 rounded-xl border px-2 py-1.5 text-sm outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
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
                              'w-16 shrink-0 rounded-xl border px-2 py-1.5 text-sm outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
                              (rowError !== null ? 'border-red-400' : 'border-slate-300')
                            }
                            value={values.age}
                            onChange={(e) => editKidDraft(kid.id, { age: e.target.value })}
                            disabled={kidsBusyId !== null}
                          />
                        </label>
                        {/* V16 t04: LIKES IS ITS OWN FULL-WIDTH ROW. It used to
                            share a `basis-40` line with Name + Age, so the
                            text you typed was cut off at a few words. Now it
                            gets a `w-full basis-full` row of its own inside the
                            same wrapping flex container (so Name/Age keep
                            their line and nothing else moves), and it is a
                            real multi-line <textarea> that shows several lines
                            at once — the founder's "you cannot read what you
                            typed". The counter + limit ride below it instead of
                            stealing width from the field. */}
                        <label className="flex w-full min-w-0 basis-full flex-col gap-1 text-sm">
                          <span className="text-slate-600">Likes:</span>
                          <textarea
                            data-testid="kid-likes"
                            aria-label="Kid likes"
                            rows={3}
                            className={
                              'w-full min-w-0 rounded-xl border px-3 py-1.5 text-sm outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
                              (rowError !== null ? 'border-red-400' : 'border-slate-300')
                            }
                            value={values.likes}
                            onChange={(e) => editKidDraft(kid.id, { likes: e.target.value })}
                            placeholder="(optional) — what are they into?"
                            maxLength={LIKES_MAX_LENGTH}
                            disabled={kidsBusyId !== null}
                          />
                          {values.likes !== '' ? (
                            <span
                              className={
                                'text-xs ' +
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
                          'shrink-0 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors motion-reduce:transition-none hover:bg-slate-200 ' +
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
                  'min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
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
                  'w-20 shrink-0 rounded-xl border px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
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

      {/* "About the parents" — the bio (editable, autosaving). The display name
          (the public handle) is NOT here: it renders as its OWN text node at
          the BOTTOM of the page (the identity block), so a spec can match it
          exactly while the app-shell header shows the @-prefixed form. */}
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-slate-900">About the parents</h2>
        <label className="mt-2 flex flex-col gap-1 text-sm">
          <span className="text-slate-700">Tell other families about yourselves</span>
          <textarea
            data-testid="about-family-input"
            className={
              'w-full rounded-xl border px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
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

      {/* "A photo of your family" — V23 s16 MOVED IT HERE, into the parents
          region right after the bio card, so the editor's on-screen sequence
          matches the read view's (the read view folds the family photo into its
          "About the parents" card as the CLOSER). It used to sit as the 2nd
          card, before the kids. The card is unchanged: always present (add OR
          change), the signed URL arrives from the hook above, and without one
          there is simply no image yet, but the control is always there. */}
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-slate-900">A photo of your family</h2>
        <p className="mt-1 text-sm text-slate-600">
          Optional. One photo of your family — it shows here, to signed-in families.
        </p>
        {familyPhotoUrl !== null ? (
          <img
            data-testid="family-photo"
            src={familyPhotoUrl}
            alt="Your family photo"
            loading="lazy"
            decoding="async"
            className="mt-3 max-h-72 w-full rounded-xl object-cover"
          />
        ) : null}
        <label className="mt-3 flex cursor-pointer min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base font-medium text-indigo-700 transition-colors motion-reduce:transition-none hover:bg-slate-50">
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

      {/* V19 t05 (founder's ask): the PARENT CARDS — up to two parents, each
          with a name, a photo and a few words about themselves.
          V21 t08: these now sit AFTER the kids card (the page reads
          user → kids → parents), matching the read view's pinned order. */}
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-slate-900">The parents</h2>
        <p className="mt-1 text-sm text-slate-600">{PARENT_CARDS_BLURB}</p>

        {parentCards === null ? (
          <p className="mt-3 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {parentCardList(parentCards).map((card) => (
              <ParentCardEditor
                key={card.id}
                card={card}
                busy={parentCardBusy}
                onSave={handleSaveParentCard}
                onRemove={handleRemoveParentCard}
              />
            ))}
            {nextParentPosition(parentCards) !== null ? (
              <ParentCardEditor
                key={`new-${nextParentPosition(parentCards)}`}
                card={null}
                position={nextParentPosition(parentCards) ?? 1}
                busy={parentCardBusy}
                onSave={handleSaveParentCard}
                onRemove={null}
              />
            ) : (
              <p className="text-xs text-slate-500">
                Two parents is the limit — remove one to add someone else.
              </p>
            )}
          </div>
        )}

        {parentCardError !== null ? (
          <p className="mt-2 text-sm text-red-600">{parentCardError}</p>
        ) : null}
      </div>

      {/* V19 t04 (founder's ask): LINK the other parent's account.
          The section renders exactly one state — `linkView` owns that decision,
          this renders it. The distinction that matters: an OUTGOING invite says
          "waiting for them" with a withdraw, an INCOMING one shows Accept and
          Decline, because only the addressee can answer (the database refuses
          anyone else, so offering the buttons to the wrong parent would be a
          control that always fails). */}
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-slate-900">Linked parent</h2>
        <p className="mt-1 text-sm text-slate-600">
          If your partner has their own account, link them so you both show on this profile.
        </p>

        {accountLinks === null ? (
          <p className="mt-3 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-3">
            {(() => {
              const view = linkView(accountLinks, userId ?? '')
              switch (view.kind) {
                case 'linked':
                  return (
                    <div className="flex items-center justify-between gap-3">
                      <p data-testid="linked-parent" className="text-sm text-slate-700">
                        Linked to{' '}
                        <span className="font-medium">
                          {view.otherHandle === '' ? 'your partner' : `@${view.otherHandle}`}
                        </span>
                      </p>
                      <button
                        type="button"
                        data-testid="unlink-parent"
                        disabled={linkBusy}
                        onClick={() => void handleUnlink(view.linkId)}
                        className="min-h-11 rounded-full border border-slate-300 px-4 text-sm text-slate-600 disabled:opacity-60"
                      >
                        Unlink
                      </button>
                    </div>
                  )
                case 'outgoing':
                  return (
                    <div className="flex items-center justify-between gap-3">
                      <p data-testid="link-outgoing" className="text-sm text-slate-700">
                        Invite sent to{' '}
                        <span className="font-medium">
                          {view.otherHandle === '' ? 'them' : `@${view.otherHandle}`}
                        </span>{' '}
                        — waiting for them to accept.
                      </p>
                      <button
                        type="button"
                        data-testid="withdraw-invite"
                        disabled={linkBusy}
                        onClick={() => void handleUnlink(view.linkId)}
                        className="min-h-11 rounded-full border border-slate-300 px-4 text-sm text-slate-600 disabled:opacity-60"
                      >
                        Withdraw
                      </button>
                    </div>
                  )
                case 'incoming':
                  return (
                    <div data-testid="link-incoming" className="flex flex-col gap-2">
                      <p className="text-sm text-slate-700">
                        <span className="font-medium">
                          {view.otherHandle === '' ? 'A parent' : `@${view.otherHandle}`}
                        </span>{' '}
                        wants to link accounts with you.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          data-testid="accept-invite"
                          disabled={linkBusy}
                          onClick={() => void handleRespondToLink(view.linkId, 'accepted')}
                          className="min-h-11 rounded-full bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-60"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          data-testid="decline-invite"
                          disabled={linkBusy}
                          onClick={() => void handleRespondToLink(view.linkId, 'declined')}
                          className="min-h-11 rounded-full border border-slate-300 px-4 text-sm text-slate-600 disabled:opacity-60"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  )
                case 'declined':
                  return (
                    <div className="flex items-center justify-between gap-3">
                      <p data-testid="link-declined" className="text-sm text-slate-600">
                        {view.outgoing
                          ? `Your invitation to ${
                              view.otherHandle === '' ? 'that parent' : `@${view.otherHandle}`
                            } was declined.`
                          : 'That invitation was declined.'}
                      </p>
                      <button
                        type="button"
                        data-testid="clear-declined"
                        disabled={linkBusy}
                        onClick={() => void handleUnlink(view.linkId)}
                        className="min-h-11 rounded-full border border-slate-300 px-4 text-sm text-slate-600 disabled:opacity-60"
                      >
                        Dismiss
                      </button>
                    </div>
                  )
                case 'none':
                  return (
                    <div className="flex flex-col gap-2">
                      {/* V21 t07: the NAME search — primary entry point. Type a
                          name, pick a parent; selecting fills the handle field
                          below and sends through the existing invite flow. */}
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-slate-700">Their name</span>
                        <input
                          data-testid="link-name-input"
                          type="text"
                          value={linkNameQuery}
                          onChange={(e) => setLinkNameQuery(e.target.value)}
                          placeholder="e.g. Sam Rivera"
                          autoComplete="off"
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
                          disabled={linkBusy}
                        />
                      </label>
                      {linkNameMatches.length > 0 ? (
                        <ul
                          data-testid="link-name-matches"
                          className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white"
                        >
                          {linkNameMatches.map((match) => (
                            <li key={match.handle}>
                              <button
                                type="button"
                                data-testid="link-name-match"
                                onClick={() => void handleSelectNameMatch(match)}
                                disabled={linkBusy}
                                className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-60"
                              >
                                <span className="min-w-0 truncate font-medium text-slate-900">
                                  {match.display_name}
                                </span>
                                <span className="shrink-0 text-slate-500">@{match.handle}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : linkNameSearching ? (
                        <p className="text-sm text-slate-500">Searching…</p>
                      ) : null}
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-slate-700">Or their @handle</span>
                        <input
                          data-testid="link-handle-input"
                          type="text"
                          value={linkHandleInput}
                          onChange={(e) => setLinkHandleInput(e.target.value)}
                          placeholder="e.g. nicole"
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
                          disabled={linkBusy}
                        />
                      </label>
                      <button
                        type="button"
                        data-testid="send-link-invite"
                        disabled={linkBusy}
                        onClick={() => void handleRequestLink()}
                        className="min-h-11 self-start rounded-full bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-60"
                      >
                        Send invitation
                      </button>
                    </div>
                  )
              }
            })()}
          </div>
        )}

        {linkError !== null ? (
          <p data-testid="link-error" className="mt-2 text-sm text-red-600">
            {linkError}
          </p>
        ) : null}
      </div>

      {/* V21 t08: the "About the kids" card sits BEFORE the parents group (bio +
          parent cards + linked parent) — this is now TRUE in the JSX, not just
          in a comment. It used to live here (last, after Linked parent); that
          was the drift between the edit surface and the read view's pinned order
          (user → kids → parents). The move lives above, beside the card itself;
          scripts/profile-order-check.mjs asserts the rendered DOM order so it
          cannot silently drift back. */}

      {/* V16 t04: the "Hosted drop-ins" card is REMOVED from /profile (the
          founder's ask). It was the ONLY consumer of this page's own-posts
          load, so the load went with it: the `myPosts`/`postsError` state, the
          queryMyPlaydatesWithClient effect, `renderPostRow`, the Upcoming/Past
          split and the `duplicate-previous` button are all gone — no orphaned
          request, no dead state.

          DUPLICATING A PAST POST IS STILL REACHABLE, checked before deleting:
          /new owns the "Duplicate existing" picker (NewPlaydatePage, the
          V15 T05 A10 two-choice header → the `post-again` lightbox), and the
          drop-in detail page's host panel keeps its own Duplicate button. The
          e2e specs that pin both (post-again.e2e.ts, post-location.e2e.ts) are
          the ones that ran before this change and still pass; only
          profile-posts.e2e.ts asserted the removed card and was updated. */}

      {/* V12 t01: THE AUTOSAVE INDICATOR — the line that used to hold the save
          button + the "unsaved changes" sentence + the result note, in one
          always-on line where the button used to be. "Saved." is the terminal
          state of a pass that wrote at least one section + kid row; a failed
          pass names itself here, and the section/row that failed carries its
          own inline error beside its field. */}
      <div className="flex flex-col gap-3">
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
/**
 * V19 t05 — ONE parent card's editor: name, a few words, save, remove.
 *
 * `card === null` means this is the EMPTY slot — the "add a parent" form, which
 * has a position but no row behind it yet and therefore no Remove. Serving both
 * cases from one component keeps the empty state visually identical to the
 * filled one, so a parent sees where the second card will go before filling it.
 *
 * LOCAL DRAFT STATE, seeded once from the card. The card's own row is not
 * written on every keystroke: unlike the bio (which autosaves), a parent card
 * has a SAVE because it can be created and deleted, and a half-typed new card
 * autosaving would insert a row the parent never finished. The draft resets
 * only when the card identity changes, so typing survives a re-render.
 *
 * The PHOTO is deliberately not an upload control here yet: `photo_url` is a
 * private-bucket path (the 0038 pattern) and wiring the crop step for a second
 * surface is its own slice. The card is built to carry the photo — the field
 * renders when a path exists — so the upload slots in behind the same slot.
 */
function ParentCardEditor({
  card,
  position,
  busy,
  onSave,
  onRemove,
}: {
  card: ParentCard | null
  position?: number
  busy: boolean
  onSave: (position: number, name: string, about: string) => void | Promise<void>
  onRemove: ((position: number) => void | Promise<void>) | null
}) {
  const slot = card?.position ?? position ?? 1
  const [name, setName] = useState(card?.name ?? '')
  const [about, setAbout] = useState(card?.about ?? '')
  const seedRef = useRef<string>(card?.id ?? `new-${slot}`)
  const seed = card?.id ?? `new-${slot}`
  if (seedRef.current !== seed) {
    // Re-seed only when this editor is now showing a DIFFERENT card (a save
    // moved the empty form to a new key, or the list reloaded).
    seedRef.current = seed
    setName(card?.name ?? '')
    setAbout(card?.about ?? '')
  }

  return (
    <div
      data-testid={`parent-card-${slot}`}
      className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-700">Name</span>
        <input
          type="text"
          data-testid={`parent-name-${slot}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="e.g. Jon"
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
          disabled={busy}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-700">About me</span>
        <textarea
          data-testid={`parent-about-${slot}`}
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          maxLength={300}
          rows={2}
          placeholder="A line or two about you (optional)"
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
          disabled={busy}
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          data-testid={`parent-save-${slot}`}
          disabled={busy}
          onClick={() => void onSave(slot, name, about)}
          className="min-h-11 rounded-full bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {card === null ? 'Add parent' : 'Save'}
        </button>
        {onRemove !== null && card !== null ? (
          <button
            type="button"
            data-testid={`parent-remove-${slot}`}
            disabled={busy}
            onClick={() => void onRemove(slot)}
            className="min-h-11 rounded-full border border-slate-300 px-4 text-sm text-slate-600 disabled:opacity-60"
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  )
}

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
            className="relative block h-10 w-10 cursor-pointer overflow-hidden rounded-full transition-transform active:scale-95 motion-reduce:transition-none"
          >
            <img
              data-testid="kid-photo"
              src={photoUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="aspect-square h-10 w-10 rounded-full object-cover"
              onError={onError}
            />
          </label>
          <button
            type="button"
            data-testid="kid-photo-remove"
            aria-label="Remove photo"
            onClick={onRemove}
            disabled={busy}
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-medium text-slate-600 after:absolute after:-inset-3 after:content-[''] shadow-sm transition-colors motion-reduce:transition-none hover:bg-slate-100 disabled:opacity-50 sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100"
          >
            ×
          </button>
        </div>
      ) : (
        <label
          className={
            'flex shrink-0 cursor-pointer items-center gap-1 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors motion-reduce:transition-none hover:bg-slate-200 ' +
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

