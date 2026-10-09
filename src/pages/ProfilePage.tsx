import { useCallback, useEffect, useRef, useState } from 'react'
import { NAV_ICONS } from '../components/icons'
import { SectionHeader } from '../components/SectionHeader'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useSessionContext } from '../components/SessionProvider'
import { useFamilyPhotoUrl } from '../components/useFamilyPhotoUrl'
import { useKidPhotoUrls } from '../components/useKidPhotoUrls'
import { useCropStep } from '../components/useCropStep'
import { FamilyPhotoBlock } from '../components/ImageLightbox'
import { ProfileView } from '../components/ProfileView'
import { hasAvatarUrl } from '../lib/avatarUrl'
import { DEFAULT_RADIUS_MILES } from '../lib/feed'
import { galleryPhotosFrom } from '../lib/photoGallery'
import {
  addKid,
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
  INTERESTS_MAX_LENGTH,
  MAX_KIDS_PER_PROFILE,
  removeKid,
  updateDisplayName,
  updateInterests,
  updateKid,
  uploadAvatar,
  uploadFamilyPhoto,
  uploadKidPhoto,
  validateAvatarFile,
  validateFamilyPhotoFile,
  validateInterests,
  validateKid,
  validateKidLikes,
} from '../lib/db'
import {
  linkView,
  normalizeHandle,
  parentCardLinkOwnerIndex,
  parentCardLinkState,
  validateLinkRequest,
  type LinkView,
  type ParentCardLinkState,
} from '../lib/links'
import {
  parentCardList,
  parentCardSaveLabel,
  nextParentPosition,
  PARENT_CARDS_BLURB,
} from '../lib/parentCards'
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
 * photo card + parent cards — V23 s16 moved the family photo into this group,
 * matching the read view's sequence; V24 11B moved the account-link control
 * INSIDE each parent card and removed the standalone section it used to sit in).
 * The edit surface
 * intentionally has NO drop-ins section (V16 t04 removed the "Hosted
 * drop-ins" card from /profile; posts are managed from /new), so 'dropins' is
 * omitted. Reorder any of those cards and this list must move with it, or the
 * pinned-order assertion in the test fails.
 */
export const PROFILE_EDIT_SECTIONS: readonly ProfileSectionKey[] = [
  'user',
  // V32-6 (A6a, ruling Q2): parents BEFORE kids, matching the read view and the
  // editor's own hand-written JSX below. This list is asserted against the
  // rendered DOM by scripts/profile-order-check.mjs, so it cannot drift.
  'parents',
  'kids',
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
 *    and "The parents" (the owner’s card, plus a linked partner’s read-only
 *    card). Nothing about that machinery changed in the move — the same
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
 *    likes textarea, an optional per-kid photo (a signed-URL render via
 *    useKidPhotoUrls — the EDITOR is the owner's own surface, so the render it
 *    drives here is the owner's; V25 t14 widened who may mint, not who edits),
 *    and Remove; plus the add-a-kid row and the five-kid cap)
 *  - "Family photos" (always-present card: the signed-URL image when
 *    set, plus the Add/Change control either way). V23 s16 placed it HERE,
 *    inside the parents region (it used to sit 2nd, before the kids). This is
 *    NOT the read view's position for the photo — that surface's photo is the
 *    closer of its optional blocks — and this DOM order is hand-written JSX,
 *    not the `profileBlurbOrder` seam's; see the corrected note above the kids
 *    card below. The heading is "Family photos" on BOTH surfaces (V24: the
 *    founder asked for a dedicated section heading; the read view gained its
 *    own h2 in the same change so the order lane sees the same heading on each
 *    side).
 *
 * V16 t04 REMOVED the "Hosted drop-ins" card (and with it this page's own-posts
 * load — see the removal note at its old position). Duplicating a past post
 * lives on /new's "Duplicate a previous drop-in" control and on a drop-in's host panel.
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
    // V32 v32-3: the fallback is the CONSTANT, not a second `5` literal. A
    // literal here was a second source of truth for the product default and
    // would have silently disagreed with `DEFAULT_RADIUS_MILES` the moment the
    // default moved.
    const seeded = seedProfileFormValues(profile, DEFAULT_RADIUS_MILES)
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
  // V24 slice 02: the parent card's save-state machine — unified on the same
  // 'idle' | 'saving' | 'saved' | 'error' shape the profile autosave runs
  // (lib/autosave.ts AutosaveStatus). The button's own label walks Save →
  // Saving… → Saved via the pure seam below; a short dwell carries `saved` back
  // to `idle` so the next edit starts from "Save" again.
  const [parentCardStatus, setParentCardStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const parentCardDwellRef = useRef<number | null>(null)
  /**
   * add-parent-flow (annotation mv0d7dwh): whether the explicit
   * "+ Add another parent" affordance has opened a blank second card. The blank
   * card itself is DERIVED (see `blankSlot` below) from this flag plus the
   * current free slot, so it can never outlive a filled slot — save the card
   * and the slot fills and the blank drops out on reload.
   */
  const [addAnotherParentOpen, setAddAnotherParentOpen] = useState(false)

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

  /**
   * V24 slice 11B: WHICH PARENT CARD CURRENTLY SHOWS THE INVITE FORM.
   *
   * The linking action moved out of its own "Linked parent" section and into
   * each parent card, but only ONE card may render the form at a time: two
   * copies would duplicate every `link-*` testid and every keystroke (the name
   * query is one page-level debounced search). Every card with no link still
   * OFFERS the action ("Link an account"); tapping one moves the form to that
   * card. `null` means "nobody has chosen" and the first card carries it, so the
   * form is never hidden behind a tap that used to be unnecessary.
   *
   * THE NOT-YET-SAVED SLOT CARRIES IT TOO, deliberately, and this is the one
   * place the control renders without a person behind it:
   *   - it is not a regression — the removed "Linked parent" section offered the
   *     same handshake to a family with no cards at all, and deleting that
   *     capability was not part of this ticket;
   *   - a fresh account has NO saved cards, and the accepted V21 t07 spec drives
   *     this very form in the empty slot (it types a name, picks a match and
   *     expects the invite to send). Gating the control on "some card is saved"
   *     would break that accepted flow and strand a family that has not filled a
   *     card yet;
   *   - the honest cost is the N5 residual: a link started here has no card name
   *     to match, so the READ surface shows the relationship as plain names until
   *     a card is saved under that handle. Same association, same limitation.
   */
  const [linkOpenSlot, setLinkOpenSlot] = useState<number | null>(null)

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
  // /new (the "Duplicate a previous drop-in" control), which does its own load.

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
  async function handleSaveParentCard(
    position: number,
    name: string,
    about: string,
    interests: string,
    closeBlank = false,
  ) {
    if (userId === null) return
    if (name.trim() === '') {
      setParentCardError('A parent needs a name.')
      setParentCardStatus('error')
      return
    }
    // V24 slice 02: walk the save-state machine — clear any previous dwell so a
    // re-save does not flicker back to "Saved" mid-flight.
    if (parentCardDwellRef.current !== null) {
      window.clearTimeout(parentCardDwellRef.current)
      parentCardDwellRef.current = null
    }
    setParentCardBusy(true)
    setParentCardError(null)
    setParentCardStatus('saving')
    try {
      await saveParentCard({
        profileId: userId,
        position,
        name: name.trim(),
        about: about.trim() === '' ? null : about.trim(),
        // V32 v32-8 (A6b): the DRAFT value, always. An explicit null clears;
        // `undefined` would preserve, and passing it here would make "the parent
        // emptied the field" indistinguishable from "this save has nothing to
        // say about interests" — see saveParentCard's own note.
        interests: interests.trim() === '' ? null : interests.trim(),
      })
      // add-parent-flow (annotation mv0d7dwh): when this save came from the
      // explicit "+ Add another parent" blank card, the slot it filled is now
      // occupied, so close the blank affordance — the saved card (editable, per
      // Interpretation A) takes its place from the reload below.
      if (closeBlank) setAddAnotherParentOpen(false)
      await reloadParentCards()
      setParentCardStatus('saved')
      // The short dwell: "Saved" is visible for a beat, then the button returns
      // to its idle verb ("Save" / "Add parent") so the next edit starts clean.
      parentCardDwellRef.current = window.setTimeout(() => {
        setParentCardStatus('idle')
        parentCardDwellRef.current = null
      }, 1500)
    } catch {
      setParentCardError('Could not save that parent. Try again.')
      setParentCardStatus('error')
    } finally {
      setParentCardBusy(false)
    }
  }

  async function handleRemoveParentCard(position: number) {
    if (userId === null) return
    if (parentCardDwellRef.current !== null) {
      window.clearTimeout(parentCardDwellRef.current)
      parentCardDwellRef.current = null
    }
    setParentCardBusy(true)
    setParentCardError(null)
    setParentCardStatus('saving')
    try {
      await deleteParentCard(userId, position)
      await reloadParentCards()
      setParentCardStatus('saved')
      parentCardDwellRef.current = window.setTimeout(() => {
        setParentCardStatus('idle')
        parentCardDwellRef.current = null
      }, 1500)
    } catch {
      setParentCardError('Could not remove that parent. Try again.')
      setParentCardStatus('error')
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
   * useKidPhotoUrls render) picks up the new object. The busy flag is shared
   * (one kid at a time) so two rows' controls never race.
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
  // This editor's kid photos' signed URLs (V12 t04) — batched + best-effort.
  // The profile id passed here is the EDITOR's own (the owner), which is the
  // surface that writes them; V25 t14 widened who may READ the class, not who
  // may upload. Called above the early return for the same reason as the
  // family-photo hook.
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
        kid: (kid) => validateKid(kid.firstName, kid.age) ?? validateKidLikes(kid.likes),
        // V32-2: the cap is the lib seam's decision, injected here — the page
        // never inlines the number or the length check.
        interests: (value) => validateInterests(value),
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
      // V32-2 (A6c) made the INTERESTS writer live again (the input beside the
      // display name); the remove-buttons pass removed that input — the founder
      // ruled it redundant with the per-parent interests cards below — so the
      // entry now stands where LOCATION's does: a TYPE requirement of the
      // Record, not a live path (the planner cannot schedule a section nothing
      // edits), kept so the machine's contract is complete rather than patched.
      // The cap lives in lib (`validateInterests` + `INTERESTS_MAX_LENGTH`).
      // The LOCATION writer remains a TYPE requirement of the Record, not a live
      // path: this page owns no location input (zip is set during onboarding,
      // radius in the browse modal), so the planner never schedules it here. It
      // stays so the machine's contract is complete rather than patched.
      name: () => updateDisplayName(userId, draft.name.trim()),
      location: () => Promise.resolve(),
      interests: () => updateInterests(userId, draft.interests.trim()),
    }
    const savedValues: Partial<ProfileFormValues> = {}
    let failures = 0

    for (const section of plan.sections) {
      try {
        await writers[section]()
        // The write landed: advance THIS section's baseline only. The writers
        // trim, so the baseline is the trimmed value (the draft keeps showing
        // what was typed — the comparison is trimmed, so it is not dirty).
        //
        // ⚠️ EVERY live writer must advance its own baseline here. A section
        // whose write lands but whose baseline does NOT advance stays dirty
        // forever, so the autosave re-arms and re-fires the same write on a
        // loop. `interests` joined the live set in V32-2, so it joins this
        // branch — the omission is invisible in a unit test of the planner and
        // only shows up as a write storm in the browser.
        if (section === 'name') {
          savedValues.name = draft.name.trim()
        }
        if (section === 'interests') {
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
   * V27: the render-time save plan that fed the bio field's inline "blocked"
   * state is GONE with the field. The display name's own error still renders
   * from `writeErrors.name` (and the planner's `name` validator runs at write
   * time inside `runAutosave`), so nothing on screen loses a validation message.
   */

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

  /**
   * Parent cards: up to TWO per profile (D0: `MAX_PARENT_CARDS = 2`), so the
   * model is NOT "a profile is one parent" — that was the V27 status quo, now
   * superseded by the add-parent-flow work (annotation mv0d7dwh, Interpretation
   * A, 2026-10-09).
   *
   * `parentCardEditors` is the rendered list, in position order:
   *   - the owner's OWN card (or a blank slot-1 card to create it), editable;
   *   - a linked partner's card, READ-ONLY — she is an account you LINK and her
   *     words live on her own profile;
   *   - any other free-text card, EDITABLE (Interpretation A): the reloaded
   *     second parent is a real, writable row exactly like the first, not a
   *     frozen one.
   *
   * The owner's card is the one whose name IS this account's display name,
   * falling back to the first card. A card matching the accepted partner's
   * handle is that partner and renders read-only.
   *
   * A blank second card is reachable only through the explicit "+ Add another
   * parent" affordance (rendered below the cards, hidden at the cap because
   * `nextParentPosition` returns null). It is NOT synthesized by
   * `parentCardList`, which returns only NAMED cards — so with one parent there
   * is simply no second card until that button opens the blank slot.
   *
   * `linkState` is null while the link rows are still loading, and the card
   * renders no control at all in that beat: rendering the invite form first and
   * swapping it for "Linked to @partner" a moment later would offer an action
   * the parent may not need.
   */
  const parentCardsList = parentCardList(parentCards)
  const linkState: LinkView | null =
    accountLinks === null ? null : linkView(accountLinks, userId ?? '')
  const ownerCard =
    parentCardsList.find(
      (card) => normalizeHandle(card.name) === normalizeHandle(profile?.display_name ?? ''),
    ) ??
    parentCardsList[0] ??
    null
  const linkedHandle =
    linkState === null || linkState.kind === 'none' ? '' : linkState.otherHandle
  const linkedCard =
    linkedHandle === '' || ownerCard === null
      ? null
      : parentCardsList.find(
          (card) =>
            card !== ownerCard && normalizeHandle(card.name) === normalizeHandle(linkedHandle),
        ) ?? null
  const otherCards = parentCardsList.filter((card) => card !== ownerCard && card !== linkedCard)
  const parentCardEditors: Array<{ card: ParentCard | null; slot: number; readOnly: boolean }> = [
    { card: ownerCard, slot: ownerCard?.position ?? 1, readOnly: false },
    ...(linkedCard === null
      ? []
      : [{ card: linkedCard, slot: linkedCard.position, readOnly: true }]),
    // add-parent-flow (annotation mv0d7dwh, Interpretation A): a second
    // FREE-TEXT parent is the parent's own card, not someone else's row, so it
    // is editable after a reload exactly like the first — name, about, interests,
    // Save and Remove. The ONLY read-only card remains the linked partner's
    // published row (above). V27's "nothing here offers a free-text second
    // parent" is the status quo this change supersedes, not a prohibition.
    ...otherCards.map((card) => ({ card, slot: card.position, readOnly: false })),
  ]
  const firstEditorSlot = parentCardEditors[0]?.slot ?? 1
  /**
   * add-parent-flow (annotation mv0d7dwh): the "+ Add another parent" affordance
   * appends a blank FREE-TEXT card into the next free slot — the exact seam
   * `nextParentPosition` was built for ("let the page hide the add-another
   * control at the cap"). `null` at the cap (or with no saved card), so the
   * button and the blank card both disappear when there is no room.
   */
  const freeSlot = nextParentPosition(parentCardsList)
  /**
   * add-parent-flow (annotation mv0d7dwh): the "+ Add another parent" affordance
   * shows only when a slot is actually free, no card holds it, the owner card
   * exists, and the blank card is not already on screen. At the 2-parent cap
   * `nextParentPosition` returns null and the control disappears (D0).
   */
  const addAnotherParentAvailable =
    ownerCard !== null &&
    freeSlot !== null &&
    !parentCardsList.some((card) => card.position === freeSlot)
  const showAddAnotherParent = addAnotherParentAvailable && !addAnotherParentOpen
  const blankParentCard =
    addAnotherParentOpen && addAnotherParentAvailable
      ? {
          card: null,
          slot: freeSlot,
          readOnly: false,
        }
      : null
  /**
   * V24 batch-end cleanup (ocr 11B): `linkOpenSlot` is RE-VALIDATED against the
   * CURRENT editor list on every render. A parent can open the invite form on
   * the empty "add a parent" slot and then remove the saved card; the list
   * shrinks while the stored slot still names the vanished editor, every card
   * then rendered "Link an account", and the form the parent was filling
   * disappeared without their action.
   *
   * The choice: MOVE the form to the first editor rather than close it. The
   * typed name/@handle survive in page state and this control's design is "one
   * form, always open on some card", so a move loses nothing and cannot leave
   * the account-link surface with no way in. (The stored slot is left alone; it
   * is a preference, and this derived value is the validity-checked one.)
   */
  const openSlotExists = parentCardEditors.some((entry) => entry.slot === linkOpenSlot)
  const activeLinkSlot = linkOpenSlot !== null && openSlotExists ? linkOpenSlot : firstEditorSlot
  /**
   * WHICH CARD CARRIES THE ACCOUNT-LEVEL STATE — decided over the WHOLE list
   * (`parentCardLinkOwnerIndex`), never per card: a per-card "match, else the
   * first card" rule printed one relationship on two cards as soon as the first
   * card did not match and a later one did. Exactly one index wins, so exactly
   * one card renders "Linked to @x" / the pending pair / Accept-Decline.
   */
  const linkOwnerIndex = parentCardLinkOwnerIndex(
    parentCardEditors.map((entry) => entry.card?.name ?? ''),
    linkState === null || linkState.kind === 'none' ? '' : linkState.otherHandle,
  )

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
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="edit-profile"
                onClick={() => setEditing(true)}
                className="min-h-11 self-start rounded-full bg-indigo-600 px-4 text-sm font-medium text-white"
              >
                Edit profile
              </button>
            </div>
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
          {/* V28 r2 slice 8a: THE PREDICATE, not an inline check. This branch
              used to test the column for null and undefined right here — the
              empty-string clause missing — which is the second of the three
              drifted forms lib/avatarUrl.ts exists to stop: a row holding `''`
              rendered an `<img src="">` instead of the "Add a photo" label
              below. `lib/avatarUrl.test.ts` pins that this CALL happens and that
              no comparison on the column comes back, because neither a unit leg
              nor the browser leg can tell a call from a faithful restatement. */}
          {profile !== null && hasAvatarUrl(profile.avatar_url) ? (
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

      {/* V23 s16: THE FAMILY PHOTO USED TO SIT HERE, as the 2nd card before the
          kids. It moved DOWN into the parents region (the "Family photos" card
          below, ahead of "The parents"); the card itself is unchanged (still
          always present: Add/Change stays reachable and obvious) and only its
          position moved.

          THE CLAIM THAT USED TO STAND HERE WAS FALSE IN BOTH HALVES (corrected
          with the order-lane fix, 21aa302), and the record stays with the
          correction: it said the move put the editor "into the parents region,
          AFTER the bio card" so that "the editor's on-screen sequence matches
          the read view's", "the single-sourced block order" being the pure
          `profileBlurbOrder` seam (src/lib/photoStorage.ts). Neither half holds,
          and both were checked at the source:

            - This page NEVER IMPORTS `profileBlurbOrder`. The edit surface's
              DOM order is the hand-written JSX here, and that is exactly why
              the two surfaces can drift.
            - The MEASURED edit DOM is now user → parents → kids → familyPhoto
              ("Your photo & name", "The parents", "About the kids", "Family
              photos" — scripts/profile-order-check.mjs), matching the read
              view, which opens with "About the parents" and closes its OPTIONAL
              blocks with the photo. V32-6 (A6a, ruling Q2) is what aligned the
              two; before it the editor read kids → familyPhoto → parents.
            - The seam's array is consumed as MEMBERSHIP, not order
              (`blurb.includes(...)`, src/components/ProfileView.tsx:513-514),
              and its 'edit' branch has NO production caller, so reordering the
              constant changes no rendered heading.

          The order lane is what polices this DOM, because it measures the DOM
          rather than the constant. Do not restate the old claim: making the
          editor seam-driven is a change to the app, not to this comment. */}

      {/* V19 t05 created this as "up to two parents, each with a name, a photo
          and a few words about themselves". V27 (the founder's model) narrows it
          to ONE parent: the account's own. You edit your card; your partner is
          an account you LINK, and her info comes from her own profile. The card
          carrying the accepted partner's handle renders READ-ONLY (name and
          words are hers, not yours), and no empty "add a parent" slot is offered
          — you cannot type a second person into your profile.
          V32-6 (A6a): these sit BEFORE the kids card now (user → parents →
          kids), matching the read view, which opens with this section. V21 t08
          had them AFTER the kids (user → kids → parents); the founder's Q2
          ruling reversed that.
          V24 slice 11B: EACH CARD CARRIES ITS OWN ACCOUNT-LINK CONTROL (the
          founder's annotation 9 — "an option to click on something to link an
          account to that person's name"). The standalone "Linked parent"
          section stays retired; the action lives with the person. */}
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-slate-900">The parents</h2>
        <p className="mt-1 text-sm text-slate-600">{PARENT_CARDS_BLURB}</p>

        {parentCards === null ? (
          <p className="mt-3 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {parentCardEditors.map((entry, index) => (
              <ParentCardEditor
                key={entry.card?.id ?? `new-${entry.slot}`}
                card={entry.card}
                position={entry.slot}
                readOnly={entry.readOnly}
                busy={parentCardBusy}
                status={parentCardStatus}
                error={parentCardError}
                onSave={handleSaveParentCard}
                onRemove={handleRemoveParentCard}
                link={
                  linkState === null
                    ? null
                    : {
                        state: parentCardLinkState(linkState, index, linkOwnerIndex),
                        open: entry.slot === activeLinkSlot,
                        onOpen: () => setLinkOpenSlot(entry.slot),
                        view: linkState,
                        busy: linkBusy,
                        error: linkError,
                        nameQuery: linkNameQuery,
                        onNameQueryChange: setLinkNameQuery,
                        nameMatches: linkNameMatches,
                        nameSearching: linkNameSearching,
                        onSelectMatch: (match) => void handleSelectNameMatch(match),
                        handleInput: linkHandleInput,
                        onHandleInputChange: setLinkHandleInput,
                        onRequestLink: () => void handleRequestLink(),
                        onUnlink: (linkId) => void handleUnlink(linkId),
                        onRespond: (linkId, response) =>
                          void handleRespondToLink(linkId, response),
                      }
                }
              />
            ))}
            {blankParentCard !== null ? (
              <ParentCardEditor
                key={`new-${blankParentCard.slot}`}
                card={blankParentCard.card}
                position={blankParentCard.slot}
                readOnly={blankParentCard.readOnly}
                autoFocusName
                busy={parentCardBusy}
                status={parentCardStatus}
                error={parentCardError}
                onSave={(slot, name, about, interests) =>
                  handleSaveParentCard(slot, name, about, interests, true)
                }
                onRemove={null}
                link={null}
              />
            ) : null}
          </div>
        )}

        {showAddAnotherParent ? (
          <button
            type="button"
            data-testid="add-another-parent"
            onClick={() => setAddAnotherParentOpen(true)}
            className="mt-3 min-h-11 rounded-full border border-indigo-300 px-4 text-sm font-medium text-indigo-700"
          >
            + Add another parent
          </button>
        ) : null}

        {parentCardError !== null ? (
          <p className="mt-2 text-sm text-red-600">{parentCardError}</p>
        ) : null}
      </div>

      {/* V24 slice 11B: THE "Linked parent" SECTION THAT STOOD HERE IS GONE —
          heading, blurb ("If your partner has their own account, link them so
          you both show on this profile.") and every state it rendered. The
          account-link handshake now lives INSIDE each parent card above, where
          the founder asked for it ("an option to click on something to link an
          account to that person's name"), so there is exactly one entry point
          to the action and it sits with the person it concerns. The MECHANISM
          is unchanged: `linkView` still owns which state to render,
          `linkView`'s helpers and the 0047 tables are still the only handshake,
          and an accepted link still renders the partner's NAME as a link on the
          read surface. */}

      {/* V21 t08: THE KIDS CARD MOVED HERE — before the parents group — so the
          edit surface's section order matches the read view's pinned sequence
          (user → parents → kids → drop-ins; the edit surface omits drop-ins).
          V32-6 (A6a, ruling Q2) moved it here — after the parents group and
          BEFORE the family photo, which is now the editor's last block. The
          card's contents are unchanged; only its position moved. */}
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
                          onUpload={(k, source, rect) => handleKidPhotoUpload(k, source, rect)}
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

      {/* V27 (the founder's model): THE "About the parents" BIO CARD THAT STOOD
          HERE IS GONE. It was the account-level text ("Tell other families about
          yourselves"), and it duplicated the parent card's own "About me" — the
          one place a parent writes about themself. The owner's description now
          lives on their card under "The parents" below, and the linked partner's
          lives on HER card on her own account; nothing here asks the owner to
          write anything about anyone else. `profiles.bio` remains in the save
          machine as legacy data (the read surface still falls back to it for the
          owner's row), but the editor no longer renders or edits it. */}


      {/* "Family photos" — V23 s16 MOVED IT HERE, inside the parents region,
          ahead of "The parents" (it used to sit as the 2nd card, before the
          kids, and LAST of all). V32-6 (A6a, ruling Q2) moved it to the end:
          the measured edit DOM is user → parents → kids → familyPhoto, which
          IS the read view's sequence, where the photo also closes the optional
          blocks. This DOM is hand-written JSX, not the `profileBlurbOrder`
          seam's — see the corrected note above the kids card. The card is unchanged: always present (add OR change),
          the signed URL arrives from the hook above, and without one there is
          simply no image yet, but the control is always there.
          V24: the heading is now "Family photos" on BOTH surfaces (the founder
          asked for a dedicated section heading); the read view gained its own
          h2 in the same change, so the order lane sees the same heading on each
          side. */}
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-slate-900">Family photos</h2>
        <p className="mt-1 text-sm text-slate-600">
          Optional. One photo of your family — it shows here, to signed-in families.
        </p>
        {familyPhotoUrl !== null ? (
          // V24 slice 02: lightbox parity — the family photo now enlarges through
          // the shared PhotoButton (the same component /u/:handle's read view
          // uses), so tapping it opens full-screen rather than doing nothing.
          // The upload/crop flow is a SEPARATE control below; this button never
          // triggers it and never navigates (PhotoButton preventDefaults).
          //
          // V25 t10: the height cap `max-h-72` is GONE here too. The editor
          // shows the SAME photo the read view shows, so the letterbox the
          // founder circled must not survive on one surface and not the other —
          // and the width proof below is measured on the read view, which is the
          // surface the annotation was about. The block is the shared
          // `FamilyPhotoBlock` (one full-width photo, or the tiled grid when a
          // second photo source exists — see src/lib/photoGallery.ts for why it
          // cannot today, and why this ships no migration).
          <FamilyPhotoBlock
            photos={galleryPhotosFrom(familyPhotoUrl, 'Your family photo')}
            label="Your family photo"
            loading="lazy"
            decoding="async"
            roundedClassName="rounded-xl"
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

      {/* V21 t08: the "About the kids" card sits BEFORE the parents group (bio +
          parent cards + linked parent) — this is now TRUE in the JSX, not just
          in a comment. It used to live here (last, after Linked parent); that
          was the drift between the edit surface and the read view's pinned order
          (user → parents → kids). The move lives above, beside the card itself;
          scripts/profile-order-check.mjs asserts the rendered DOM order so it
          cannot silently drift back. */}

      {/* V16 t04: the "Hosted drop-ins" card is REMOVED from /profile (the
          founder's ask). It was the ONLY consumer of this page's own-posts
          load, so the load went with it: the `myPosts`/`postsError` state, the
          queryMyPlaydatesWithClient effect, `renderPostRow`, the Upcoming/Past
          split and the `duplicate-previous` button are all gone — no orphaned
          request, no dead state.

          DUPLICATING A PAST POST IS STILL REACHABLE, checked before deleting:
          /new owns the duplicate picker (NewPlaydatePage, the quiet
          "Duplicate a previous drop-in" disclosure → the `post-again` list), and the
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
 * V24 slice 11B: everything ONE parent card's link control needs, built once per
 * render by the page. `state` is the page's pure `parentCardLinkState` call —
 * the control renders the case, it does not decide it (the build law).
 */
interface ParentCardLinkProps {
  /** This card's slot (its position, 1 or 2) — carried for the testids. */
  slot: number
  /** The SAVED card's name: the value the account-level states match on. */
  name: string
  /** What this card carries (the pure rule's answer). */
  state: ParentCardLinkState
  /** True when this is the card showing the invite FORM (one at a time). */
  open: boolean
  /** Move the invite form to this card. */
  onOpen: () => void
  /** The viewer's own link state — which controls the account-level cases render. */
  view: LinkView
  busy: boolean
  /** The last link error, shown beside the control that failed. */
  error: string | null
  nameQuery: string
  onNameQueryChange: (value: string) => void
  nameMatches: Array<{ display_name: string; handle: string }>
  nameSearching: boolean
  onSelectMatch: (match: { display_name: string; handle: string }) => void
  handleInput: string
  onHandleInputChange: (value: string) => void
  onRequestLink: () => void
  onUnlink: (linkId: string) => void
  onRespond: (linkId: string, response: 'accepted' | 'declined') => void
}

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
  readOnly = false,
  busy,
  status,
  error,
  onSave,
  onRemove,
  link,
  autoFocusName = false,
}: {
  card: ParentCard | null
  position?: number
  /**
   * V27: this card is SOMEONE ELSE's — the linked partner's, or a legacy second
   * parent's. Her name and words are hers (authored on her own profile), so the
   * fields render as text: no name/about inputs, no Save, no Remove. The card
   * still carries her link control, so Unlink stays reachable.
   */
  readOnly?: boolean
  busy: boolean
  /** V24 slice 02: the save-state machine ('idle' | 'saving' | 'saved' | 'error'). */
  status: 'idle' | 'saving' | 'saved' | 'error'
  /** The error message to surface beside the button (the label seam renders it). */
  error: string | null
  onSave: (position: number, name: string, about: string, interests: string) => void | Promise<void>
  onRemove: ((position: number) => void | Promise<void>) | null
  /** V24 slice 11B: this card's account-link control, or null while the link
      rows are still loading (no control renders in that beat). The editor
      supplies the card's own slot and name, so the page does not repeat them. */
  link: Omit<ParentCardLinkProps, 'slot' | 'name'> | null
  /** add-parent-flow (annotation mv0d7dwh): focus the Name field on mount —
      the "+ Add another parent" affordance drops the parent straight into
      typing their partner's name. */
  autoFocusName?: boolean
}) {
  const slot = card?.position ?? position ?? 1
  const [name, setName] = useState(card?.name ?? '')
  const [about, setAbout] = useState(card?.about ?? '')
  // V32 v32-8 (A6b): the per-parent interests draft.
  const [interests, setInterests] = useState(card?.interests ?? '')
  const seedRef = useRef<string>(card?.id ?? `new-${slot}`)
  const seed = card?.id ?? `new-${slot}`
  if (seedRef.current !== seed) {
    // Re-seed only when this editor is now showing a DIFFERENT card (a save
    // moved the empty form to a new key, or the list reloaded).
    seedRef.current = seed
    setName(card?.name ?? '')
    setAbout(card?.about ?? '')
  }

  if (readOnly) {
    return (
      <div
        data-testid={`parent-card-${slot}`}
        className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
      >
        <p data-testid={`parent-name-${slot}`} className="text-base font-semibold text-slate-900">
          {card?.name ?? ''}
        </p>
        {card?.about !== null && card?.about !== undefined && card.about.trim() !== '' ? (
          <p data-testid={`parent-about-${slot}`} className="text-sm text-slate-700">
            {card.about}
          </p>
        ) : null}
        {/* V27: the partner's words live on HER profile; this card shows only
            what she has published and the link control that ends the link. */}
        {link === null ? null : (
          <ParentCardLink slot={slot} name={card?.name ?? ''} {...link} />
        )}
      </div>
    )
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
          autoFocus={autoFocusName}
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
      {/* V32 v32-8 (A6b): what this parent is INTO, for other signed-in parents
          to read. Mirrors the two inputs above exactly — same classes, a visible
          label, `text-base` (the >=16px input rule), and the cap taken from the
          CONSTANT rather than inlined. The `.tsx` performs no length check: the
          lib seam is the rule. */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-700">Interests</span>
        <input
          type="text"
          data-testid={`parent-card-interests-${slot}`}
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
          maxLength={INTERESTS_MAX_LENGTH}
          placeholder="e.g. Trail running, board games, baking (optional)"
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
          disabled={busy}
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          data-testid={`parent-save-${slot}`}
          disabled={busy}
          onClick={() => void onSave(slot, name, about, interests)}
          className="min-h-11 rounded-full bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {parentCardSaveLabel(status, card === null, error, slot)}
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
      {/* V24 slice 11B: THE LINK ACTION LIVES WITH THE PERSON. This used to be
          the standalone "Linked parent" section below the cards; it renders
          inside the card whose name it concerns (the pure
          `parentCardLinkState` decided which, at the page). */}
      {link === null ? null : (
        <ParentCardLink slot={slot} name={card?.name ?? ''} {...link} />
      )}
    </div>
  )
}

/**
 * V24 slice 11B: ONE PARENT CARD'S ACCOUNT-LINK CONTROL (the founder's
 * annotation 9 — "an option to click on something to link an account to that
 * person's name").
 *
 * WHAT IT RENDERS is the pure `parentCardLinkState`'s decision, computed by the
 * page and handed in as `state`:
 *   - `invite`  — no link exists. The card whose slot the page marks `open`
 *                 shows the invite form (name search + @handle + send); every
 *                 other card shows a "Link an account" control that moves the
 *                 form to itself. Only ONE form exists at a time, because the
 *                 name query is one shared, debounced search and two copies
 *                 would duplicate every `link-*` testid.
 *   - the four account-level states render the SAME copy and controls the
 *                 removed section rendered ("Linked to @x" + Unlink, "Invite
 *                 sent to @x" + Withdraw, Accept/Decline, the declined notice +
 *                 Dismiss) — the mechanism is unchanged, only its home moved.
 *   - `hidden`  — the account-level state belongs to another card; renders
 *                 nothing, so a single relationship is never printed twice.
 *
 * The control is also the anchor the browser spec walks: it must resolve to a
 * `[data-testid="parent-card-<slot>"]` ancestor and sit under the "The parents"
 * heading, which is what "the action lives with the person" means in the DOM.
 */
function ParentCardLink({
  slot,
  name,
  state,
  open,
  onOpen,
  view,
  busy,
  error,
  nameQuery,
  onNameQueryChange,
  nameMatches,
  nameSearching,
  onSelectMatch,
  handleInput,
  onHandleInputChange,
  onRequestLink,
  onUnlink,
  onRespond,
}: ParentCardLinkProps) {
  if (state === 'hidden') return null

  if (state === 'invite' && !open) {
    return (
      <button
        type="button"
        data-testid={`link-parent-open-${slot}`}
        disabled={busy}
        onClick={onOpen}
        aria-label={name === '' ? 'Link an account' : `Link an account to ${name}`}
        className="mt-1 min-h-11 self-start rounded-full border border-slate-300 px-4 text-sm font-medium text-indigo-700 transition-colors motion-reduce:transition-none hover:bg-slate-50 disabled:opacity-60"
      >
        Link an account
      </button>
    )
  }

  /**
   * The FOUR ACCOUNT-LEVEL STATES, one flat `switch` branch each.
   *
   * This was a four-level nested ternary chain, with a second ternary nested in
   * the `declined` branch's template literal — the shape the repo's review rules
   * flag, and the shape the removed standalone "Linked parent" section rendered
   * with a `switch`. Splitting it into a local function keeps each state's copy
   * and controls on one readable branch; the rendered output is unchanged (same
   * testids, same copy, same controls).
   */
  function accountStateView() {
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
              disabled={busy}
              onClick={() => onUnlink(view.linkId)}
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
              disabled={busy}
              onClick={() => onUnlink(view.linkId)}
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
                disabled={busy}
                onClick={() => onRespond(view.linkId, 'accepted')}
                className="min-h-11 rounded-full bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                Accept
              </button>
              <button
                type="button"
                data-testid="decline-invite"
                disabled={busy}
                onClick={() => onRespond(view.linkId, 'declined')}
                className="min-h-11 rounded-full border border-slate-300 px-4 text-sm text-slate-600 disabled:opacity-60"
              >
                Decline
              </button>
            </div>
          </div>
        )
      case 'declined': {
        // The only direction-dependent copy: compute the handle label and the
        // sentence as two plain values, so no ternary sits inside the template
        // literal (that nesting was the second half of the chain above).
        const whose = view.otherHandle === '' ? 'that parent' : `@${view.otherHandle}`
        const message = view.outgoing
          ? `Your invitation to ${whose} was declined.`
          : 'That invitation was declined.'
        return (
          <div className="flex items-center justify-between gap-3">
            <p data-testid="link-declined" className="text-sm text-slate-600">
              {message}
            </p>
            <button
              type="button"
              data-testid="clear-declined"
              disabled={busy}
              onClick={() => onUnlink(view.linkId)}
              className="min-h-11 rounded-full border border-slate-300 px-4 text-sm text-slate-600 disabled:opacity-60"
            >
              Dismiss
            </button>
          </div>
        )
      }
      case 'none':
        return null
    }
  }

  return (
    <div
      data-testid={`parent-card-link-${slot}`}
      className="mt-1 flex flex-col gap-2 border-t border-slate-200 pt-3"
    >
      {state === 'invite' ? (
        <div className="flex flex-col gap-2">
          {/* V21 t07: the NAME search — primary entry point. Type a name, pick a
              parent; selecting fills the handle field below and sends through
              the existing invite flow. The testids are unchanged by the move
              into the card, so the spec that drives this flow still drives it. */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Their name</span>
            <input
              data-testid="link-name-input"
              type="text"
              value={nameQuery}
              onChange={(e) => onNameQueryChange(e.target.value)}
              placeholder="e.g. Sam Rivera"
              autoComplete="off"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
              disabled={busy}
            />
          </label>
          {nameMatches.length > 0 ? (
            <ul
              data-testid="link-name-matches"
              className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white"
            >
              {nameMatches.map((match) => (
                <li key={match.handle}>
                  <button
                    type="button"
                    data-testid="link-name-match"
                    onClick={() => onSelectMatch(match)}
                    disabled={busy}
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
          ) : nameSearching ? (
            <p className="text-sm text-slate-500">Searching…</p>
          ) : null}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Or their @handle</span>
            <input
              data-testid="link-handle-input"
              type="text"
              value={handleInput}
              onChange={(e) => onHandleInputChange(e.target.value)}
              placeholder="e.g. nicole"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
              disabled={busy}
            />
          </label>
          <button
            type="button"
            data-testid="send-link-invite"
            disabled={busy}
            onClick={onRequestLink}
            className="min-h-11 self-start rounded-full bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            Send invitation
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">{accountStateView()}</div>
      )}
      {error !== null ? (
        <p data-testid="link-error" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
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
  /** `Promise<void>` on purpose (V28 r2 fix round 1, F6): the caller is the
      crop step's `onConfirm`, whose `finally` closes the bitmap the moment
      this resolves — the upload must finish BEFORE that close. A `void`
      return type is what let the fire-and-forget call stay invisible to
      the type system (handing the encoder a closed 0×0 bitmap). */
  onUpload: (kidId: string, source: ImageBitmap, rect: CropRect) => Promise<void>
  onRemove: () => void
  /** Called when the photo image fails to load (the parent hides the control). */
  onError?: () => void
}) {
  const crop = useCropStep(async (source, rect) => {
    // AWAITED, not fire-and-forget (V28 r2 fix round 1, F6): the hook's
    // `finally` closes the bitmap the moment this returns, and the upload
    // must finish BEFORE that close — the OnboardingPage bug that this
    // await is the guard against.
    await onUpload(kidId, source, rect)
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

