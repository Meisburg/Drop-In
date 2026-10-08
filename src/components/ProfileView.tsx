import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { DropInCard, HostAvatar } from './DropInCard'
import { PhotoButton, FamilyPhotoBlock } from './ImageLightbox'
import { ReportDialog } from './ReportDialog'
import { useSessionContext } from './SessionProvider'
import { useFamilyPhotoUrl } from './useFamilyPhotoUrl'
import { galleryPhotosFrom } from '../lib/photoGallery'
import { useKidPhotoUrls } from './useKidPhotoUrls'
import {
  countPostsByHost,
  getBlockState,
  getFollowState,
  getLinkedPartnerForProfile,
  HOST_POSTS_LIMIT,
  kidAgesByPostForPosts,
  listParentCards,
  listPingsForPosts,
  listPostsByHost,
  toggleBlock,
  toggleFollowProfile,
  type PingForPost,
} from '../lib/db'
import {
  cardAgeRangeLabel,
  goingPingsByPost,
  instantDayLabel,
  kidHeading,
  partitionPostsByTime,
  pastPostStatusLabel,
} from '../lib/feed'
import { PAST_FIRST_PAGE, nextPastVisible, planPastArchive } from '../lib/profileArchive'
import { linkedNameTargetForViewer } from '../lib/links'
import { interestBubbles } from '../lib/interestBubbles'
import { parentNameRows } from '../lib/parentCards'
import { profileBlurbOrder } from '../lib/photoStorage'
import type { ParentCard, PlaydateWithNeighborhood, ProfileWithKids } from '../lib/types'
import type { ProfileSectionKey } from '../lib/profileSections'

/**
 * V21 t08: THE READ VIEW'S SECTION ORDER, declared as data for the anti-drift
 * test (src/lib/profileSections.test.ts). It mirrors the JSX below exactly:
 * identity block → kids card → about/interests/family-photo card → hosted
 * drop-ins lists. Reorder any of those cards and this list must move with it,
 * or the pinned-order assertion in the test fails. The visitor-only action row
 * (Follow/Message/Block/Report) is an action row, not a content section, so it
 * does not appear here.
 */
export const PROFILE_VIEW_SECTIONS: readonly ProfileSectionKey[] = [
  'user',
  // V32-6 (A6a): the declaration was a LIE. This component's JSX has rendered
  // the identity block, then "About the parents", then "About the kids" since
  // 473d35b moved the parent rows above the kids section — but the declared
  // order here still said kids-first, and `profileSections.test.ts` asserted the
  // declaration against the constant rather than against the DOM, so the two
  // could disagree indefinitely. The brief for V32-6 allows this file to change
  // only when a declared order here is a lie; this is that case. The JSX itself
  // is untouched.
  'parents',
  'kids',
  'dropins',
]

/**
 * THE PUBLIC FACE OF A PROFILE — the one render of "what other families see".
 *
 * V20 t01: this component IS the extraction of what used to be UserPage's
 * whole body. The founder's ask was that tapping the Profile tab show the same
 * view you get from tapping a `@handle` link anywhere in the app, so the two
 * surfaces are now one implementation rather than two that agree by hand.
 *
 * Two callers, one render:
 *  - `/u/:handle` (UserPage) — fetches by handle, then hands the settled
 *    ProfileWithKids here. Always READ-ONLY: the Edit control is the owner's,
 *    and a visitor has no edit affordance at all.
 *  - `/profile` (ProfilePage) — the owner's own view. Identical render, plus
 *    an "Edit profile" button that swaps this component for the editor.
 *
 * WHAT THE COMPONENT DECIDES, and what it is TOLD:
 *  - `isOwnProfile` is computed HERE from the session (one rule, so the two
 *    surfaces cannot disagree about who the owner is).
 *  - The OPTIONAL BLOCK ORDER is the pure `profileBlurbOrder` seam's (V16 t05
 *    re-pinned it: kids → about → family photo; V23 s16 extended the seam to
 *    name every block both surfaces show). The JSX below lays the three
 *    optional blocks out in exactly the sequence that function emits them.
 *
 * PRIVACY NOTE (carried from UserPage, widened by V25 t14): the kids block
 * renders when the DATABASE returned kid rows to this viewer — `profile.kids`
 * is the 0040-filtered embed, so it is the family's own list, the kids attached
 * to a drop-in the viewer hosts or pinged, or any of them for a moderator, and
 * an empty array for anyone else. The kid-photo mint is handed the PROFILE's id
 * whenever there is a session (and `null` when there is none), because
 * `kidPhotoVisibility` answers `'owner'`, `'authenticated'` or `'denied'` and
 * migration 0054 lets any signed-in parent read the kid class. The visitor path
 * for a viewer 0040 returns no rows to is still what it was: nothing renders,
 * because there is nothing to render.
 *
 * `header` is the one slot the owner's surface adds: ProfilePage passes its
 * Edit/read toggle so the control sits at the very top of the page, above the
 * identity card, exactly where the founder asked for it.
 */
export function ProfileView({
  profile,
  header,
}: {
  profile: ProfileWithKids
  /** Rendered above the identity card — the owner's Edit/read toggle. */
  header?: React.ReactNode
}) {
  const navigate = useNavigate()
  // `profile` is this page's prop (the family being VIEWED); the session
  // context's own profile is the READER, so it is aliased. The reader's handle
  // is what tells the name-link rule that the link's counterparty is the person
  // looking at the page (V24 11B, finding N4).
  const { session, profile: viewerProfile } = useSessionContext()
  const [blocked, setBlocked] = useState(false)
  const [blockingBusy, setBlockingBusy] = useState(false)
  const [blockError, setBlockError] = useState<string | null>(null)
  // V8 ticket 09: Follow / Unfollow (the 0033 `follows` row). `following`
  // starts false and is corrected by the read below; a failed read (pre-apply)
  // leaves it unpressed, and a failed WRITE reports the designed error line
  // (never a silent lie about the state).
  const [following, setFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [followError, setFollowError] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)
  // V3 slice 9 (ticket 04): the "Hosted N drop-ins" line's count — the
  // all-time hosted count (db.countPostsByHost, NO status/end filters —
  // the 2026-09-09 design verdict's computed behavioral history). null =
  // unsettled (the line is hidden); a failed load degrades to hidden
  // (zero-pressure soul, never a crash).
  const [hostedCount, setHostedCount] = useState<number | null>(null)
  // V8 ticket 04: the host's real posts (null = still loading) + the count of
  // past rows beyond the fetch's cap (HOST_POSTS_LIMIT — raised to 200 by the
  // profile-archive slice, which pages the rows in hand locally). A failed load
  // surfaces the designed error line, never a crash.
  const [posts, setPosts] = useState<PlaydateWithNeighborhood[] | null>(null)
  /**
   * V9 ticket 05: post id -> the ages of the kids that post's host is bringing
   * (the 0022 playdate_kids selection, projected to `kids.age` ONLY). ONE
   * batched read for both lists on this page (Upcoming + Past), never one per
   * card. {} (the initial value) = nothing read yet; a failure or the pre-0022
   * state lands {} too, and every card simply omits its ages line — a decoration
   * is never worth an error state (the zero-pressure soul).
   */
  const [kidAgesByPostId, setKidAgesByPostId] = useState<Record<string, number[]>>({})
  /**
   * V29 v29-2: the going pings for this host's posts — ONE batched read for both
   * lists, never one per card. **null = NOT READ** and that distinction is the
   * whole point: the card may only say "No one's going yet" when this read
   * settled. A failed read stays null (silence) rather than collapsing to {},
   * because {} would be read as "loaded, nobody going" — a claim about a query
   * that never answered.
   */
  const [goingPingsByPostId, setGoingPingsByPostId] = useState<Record<string, PingForPost[]> | null>(
    null,
  )
  const [olderCount, setOlderCount] = useState(0)
  /**
   * The profile-archive slice: HOW MANY past rows the reader has paged to. The
   * INITIAL value is the first page (5) rather than the archive's size, so the
   * first paint of a long history is finite; `planPastArchive` clamps it against
   * the rows in hand, so a shorter profile renders all of its rows with no
   * button (AC 5's "no empty button" for a host with exactly 5). Reset with the
   * posts whenever the profile changes (the effect below), or a longer archive's
   * page count would leak into the next profile's render.
   */
  const [pastVisible, setPastVisible] = useState(PAST_FIRST_PAGE)
  const [postsError, setPostsError] = useState<string | null>(null)
  /**
   * V24 slice 11A: THE FAMILY'S PARENT CARDS — the names the "About the
   * parents" card now renders on the READ surface. `null` = still loading
   * (nothing renders); a failed read or the pre-0047 state lands `[]` and the
   * card simply carries no names — the same zero-pressure degradation the post
   * ages line uses. Read with this component's own client, so RLS is unchanged:
   * `parent_cards_select_authenticated` (migration 0047) already returns any
   * family's cards to any signed-in parent.
   */
  const [parentCards, setParentCards] = useState<ParentCard[] | null>(null)
  /**
   * V24 slice 11A: THE ACCEPTED PARTNER OF *THIS PROFILE*, or null when the
   * caller's RLS lets them read no such link. Deliberately not a prop: this
   * component already loads what it needs (posts, kid ages), and whether a link
   * is visible is a property of the VIEWER's session, which the two call sites
   * do not know.
   */
  const [linkedParent, setLinkedParent] = useState<{
    handle: string
    avatarUrl: string | null
    about: string | null
  } | null>(null)
  // V21 t06: ref to the Past section so tapping "Hosted N drop-ins" can
  // scroll the user there. TAP (not hover) — this is a phone app; the
  // founder's "hover over and see the past events" becomes a tap that
  // scrolls to the bounded past list (most recent first).
  //
  // V25 t09: the old `pastRevealed` boolean is GONE with the "tap to see past
  // events" hint it existed to hide (the founder's annotation 2). It gated
  // nothing but that hint — the Past section below renders whenever there is a
  // past post — so the control's whole job now is the scroll, and a state
  // variable nothing reads is dead code, not a feature.
  const pastSectionRef = useRef<HTMLDivElement>(null)

  const profileId = profile.id
  const isOwnProfile = session !== null && profileId === session.user.id

  // V9 ticket 11: the family photo's signed URL (batched, best-effort, never
  // persisted) — minted from the stored PATH, and null when there is no photo or
  // the mint failed, in which case no image renders and nothing claims an error.
  //
  // Called with the other hooks and ABOVE every early return, for the reason the
  // V6 comment on the detail page records: a hook behind an early return is a
  // conditional hook (the page renders "Loading…" first, so it would change the
  // hook count between renders).
  const familyPhotoUrl = useFamilyPhotoUrl(profile.family_photo_url)

  // V16 t05 (founder decision Q3) added the kid photos; V25 t14 (founder
  // decision, 2026-09-26) WIDENED WHO GETS THEM. This hook is the app's one
  // kid-photo mint path (`signedKidPhotoUrls` → the PRIVATE `kid-photos`
  // bucket). Its first argument is the profile WHOSE KIDS these are, and
  // migration 0054's policy lets any signed-in parent mint for the kid class —
  // so the gate is no longer "you are the owner" but "there is a session"
  // (the `null` branch is the anonymous case, which 0040 would already have
  // stripped of rows; passing null is defence in depth, not the only wall).
  // `profile.kids` is itself the RLS-filtered answer, so the hook is never
  // asked to mint for a child this viewer may not see.
  const kidPhotoUrls = useKidPhotoUrls(session === null ? null : profileId, profile.kids)

  // The initial block state, for other people's profiles only. A failed
  // read (blocks table not applied yet) leaves the toggle unpressed — the
  // blocks table (migration 0006) ships with slice 3, so this is best-effort.
  useEffect(() => {
    if (isOwnProfile) return
    let cancelled = false
    getBlockState(profileId)
      .then((hasBlock) => {
        if (!cancelled) setBlocked(hasBlock)
      })
      .catch(() => {
        // no-op: the toggle simply starts unpressed
      })
    return () => {
      cancelled = true
    }
  }, [profileId, isOwnProfile])

  // V8 ticket 09: the Follow control's initial state. Same discipline as the
  // block read above — and the same pre-apply story: with 0033 unapplied this
  // answers PGRST205, the catch leaves the control unpressed, and the page is
  // otherwise untouched (the button reports the truth when it is pressed).
  useEffect(() => {
    if (isOwnProfile) return
    let cancelled = false
    getFollowState(profileId)
      .then((isFollowing) => {
        if (!cancelled) setFollowing(isFollowing)
      })
      .catch(() => {
        // no-op: the control simply starts unpressed
      })
    return () => {
      cancelled = true
    }
  }, [profileId, isOwnProfile])

  // V3 slice 9 (ticket 04): the "Hosted N drop-ins" line — computed
  // behavioral history (the 2026-09-09 design verdict: no reviews, no
  // vouching): the all-time hosted count (db.countPostsByHost, NO
  // status/end filters), fetched once per settled profile id. A failed
  // load degrades to hidden (zero-pressure soul, never a crash).
  useEffect(() => {
    let cancelled = false
    setHostedCount(null)
    countPostsByHost(profileId)
      .then((count) => {
        if (!cancelled) setHostedCount(count)
      })
      .catch(() => {
        if (!cancelled) setHostedCount(null)
      })
    return () => {
      cancelled = true
    }
  }, [profileId])

  // V8 ticket 04: the host's own posts, once per settled profile id — the two
  // lists below (Upcoming/Past). The split/order is the pure
  // partitionPostsByTime at render; this effect only fetches. A failed load
  // renders the designed error line in the Posts block (never a crash — the
  // house DB-not-applied discipline).
  useEffect(() => {
    let cancelled = false
    setPosts(null)
    setOlderCount(0)
    setPastVisible(PAST_FIRST_PAGE)
    setPostsError(null)
    listPostsByHost(profileId)
      .then((result) => {
        if (cancelled) return
        setPosts(result.posts)
        setOlderCount(result.olderCount)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setPostsError(err instanceof Error ? err.message : 'Could not load posts.')
      })
    return () => {
      cancelled = true
    }
  }, [profileId])

  /**
   * V9 ticket 05: the card's age range is the first line of the card's meta —
   * on EVERY surface that renders a DropInCard, not only the feed (the AC's
   * sentence is about the card), so this page runs the same one label rule over
   * ONE batched read of its own posts. Best-effort: a failed read leaves every
   * card without an ages line, silently.
   */
  useEffect(() => {
    if (posts === null) return
    let cancelled = false
    // No synchronous reset on purpose (it buys nothing: the map is keyed by post
    // id and a stale key for a post that is no longer listed renders nothing, and
    // a React "setState in an effect" warning is a real cost). The empty object is
    // the honest "nothing read yet" default — the same value a failed read lands.
    kidAgesByPostForPosts(posts.map((post) => post.id))
      .then((ages) => {
        if (!cancelled) setKidAgesByPostId(ages)
      })
      .catch(() => {
        if (!cancelled) setKidAgesByPostId({})
      })
    return () => {
      cancelled = true
    }
  }, [posts])

  /**
   * V29 v29-2: the going line's input for this host's posts — one batched read,
   * the same listPingsForPosts the feed card uses, grouped by the pure
   * goingPingsByPost.
   *
   * THE FAILURE PATH IS DELIBERATELY DIFFERENT from the ages read above. An
   * empty map there just hides a decoration; here it would be read by the card as
   * "nobody is going" — an assertion about a query that never answered. So a
   * failed read leaves the state NULL and the card says nothing.
   */
  useEffect(() => {
    if (posts === null) return
    let cancelled = false
    // Reset BEFORE the read (found by `ocr` on the V29 range, 2026-10-04): this
    // view is reused across `profileId` changes, and `posts` here can switch from
    // one host's array to another's. A map describing the PREVIOUS host's posts
    // must never be read as "loaded" for the new one, because `goingPingsLoaded`
    // at the render site is `map !== null` — the stale map would assert "No one's
    // going yet" for pings that were never read. FeedPage sets the precedent.
    setGoingPingsByPostId(null)
    listPingsForPosts(posts.map((post) => post.id))
      .then((rows) => {
        if (!cancelled) setGoingPingsByPostId(goingPingsByPost(rows))
      })
      .catch(() => {
        if (!cancelled) setGoingPingsByPostId(null)
      })
    return () => {
      cancelled = true
    }
  }, [posts])

  /**
   * V24 slice 11A: the family's parent cards, once per settled profile id. The
   * sort/cap/naming rules are the pure `parentNameRows` at render; this effect
   * only fetches. A failed read (the table not applied yet) renders no names and
   * no error line — a decoration is never worth an error state.
   */
  useEffect(() => {
    let cancelled = false
    setParentCards(null)
    listParentCards(profileId)
      .then((rows) => {
        if (!cancelled) setParentCards(rows)
      })
      .catch(() => {
        if (!cancelled) setParentCards([])
      })
    return () => {
      cancelled = true
    }
  }, [profileId])

  /**
   * V24 slice 11A: the accepted link, IF the viewer is allowed to see it.
   *
   * The database is the boundary, not this effect: `account_links` is readable
   * only by its two parties (migration 0047), so a third account opening
   * `/u/:handle` gets zero rows and the names render as plain text. That is the
   * design, not a degradation — the relationship is not a stranger's to see.
   * A failed read is treated exactly like "no link".
   */
  useEffect(() => {
    let cancelled = false
    setLinkedParent(null)
    getLinkedPartnerForProfile(profileId)
      .then((partner) => {
        if (!cancelled) setLinkedParent(partner)
      })
      .catch(() => {
        if (!cancelled) setLinkedParent(null)
      })
    return () => {
      cancelled = true
    }
  }, [profileId])

  /** One card's ages label (the shared precedence seam over this row's columns). */
  function buildCardAgeRangeLabel(post: PlaydateWithNeighborhood) {
    return cardAgeRangeLabel(post, kidAgesByPostId[post.id] ?? [])
  }

  async function handleToggleBlock() {
    if (blockingBusy) return
    setBlockingBusy(true)
    setBlockError(null)
    try {
      setBlocked(await toggleBlock(profileId))
    } catch (err) {
      setBlockError(err instanceof Error ? err.message : 'Could not update the block. Try again.')
    } finally {
      setBlockingBusy(false)
    }
  }

  /**
   * V8 ticket 09: follow / unfollow this family (the owner-only `follows`
   * row). The state comes back from the write (db.toggleFollowProfile
   * returns the new state), and a failure is reported in place — the button
   * never claims a state the database does not have. A second follow of the
   * same family is a no-op by construction (partial unique index + the
   * toggle's own read), so a double tap cannot create two rows.
   */
  async function handleToggleFollow() {
    if (followBusy) return
    setFollowBusy(true)
    setFollowError(null)
    try {
      setFollowing(await toggleFollowProfile(profileId))
    } catch (err) {
      setFollowError(err instanceof Error ? err.message : 'Could not update the follow. Try again.')
    } finally {
      setFollowBusy(false)
    }
  }

  const joined = new Date(profile.created_at).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
  // V24 slice 11A: the rows the "About the parents" card renders — one per
  // parent card, each carrying the name, the handle of an account that name IS
  // (or null), the description and the picture. The rule is pure
  // (`parentNameRows`, src/lib/parentCards.ts): a card alone is never a link,
  // and a name that matches no account renders as plain text. V25 t09 made each
  // entry a whole ROW (photo + about) rather than a bare name; the naming/link
  // rule itself is unchanged.
  //
  // V24 slice 11B (finding N4): the counterparty is suppressed when it is the
  // READER — a partner opening this page is the profile's accepted partner, and
  // linking their own name to their own profile is a control that does nothing
  // for them (`linkedNameTargetForViewer`, src/lib/links.ts).
  const parentRows = parentNameRows(
    parentCards,
    linkedNameTargetForViewer(linkedParent, viewerProfile?.display_name ?? null),
    // V27: the account being viewed supplies the FALLBACK picture, the
    // self-link and the personal description on the one card whose name IS that
    // account (the founder's /profile annotations: "you could link my name to
    // this profile"; a parent row should carry a picture the way a kid row
    // does; and the profile text is that parent's own words, not a family
    // blurb). A card with its own photo/about keeps it, and a near-miss name
    // gets nothing. The `linked` row above carries the counterparty's public
    // avatar and personal bio for the same reason.
    {
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url ?? null,
    },
  )
  // The pinned block order, single-sourced in the pure `profileBlurbOrder`
  // seam (src/lib/photoStorage.ts; V16 t05 re-pinned it, V23 s16 extended it to
  // name EVERY block both surfaces show). This read surface consumes it for
  // MEMBERSHIP: the kids card and this card's contents are each gated on the
  // seam's answer, and the editor-only parent-cards block is omitted. All
  // optional blocks are independent — an empty profile still shows the identity
  // card. `kidsVisible` is this page's own rule — V25 t14 widened it from "the
  // self view only" to "the database returned this viewer kid rows"
  // (`profile.kids.length > 0`), which is the same RLS-filtered answer the pure
  // seam is handed rather than a second gate invented here.
  //
  // THE MASTHEAD (founder's live /profile change, 2026-10-06): `blurb`'s 'about'
  // no longer drives a card of its own here — the parent rows moved UP into the
  // identity block, so the read view's 'about' member is consumed by the
  // masthead's own `parentRows.length > 0` gate rather than by a heading gate.
  // The seam still emits 'about' (it is the shared contract with the edit
  // surface, pinned by its sibling test); this surface just no longer keys a
  // card on it. What remains below is the interests line and the family photo.
  //
  // V27 (the founder's /profile annotation): the read view's parent rows are the
  // PARENT ROWS ALONE — no bio block, because the duplicate account avatar it
  // carried is already drawn in the identity block above. The bio still reaches
  // the screen as the account owner's ROW description when their card carries
  // none (see `parentNameRows`).
  const blurb = profileBlurbOrder(
    profile,
    profile.kids.length > 0,
    'read',
    parentRows.length > 0,
  )
  const showsKids = blurb.includes('kids')
  // V20 t01: hoisted out of the JSX because the wrapper card's own existence is
  // the union of its contents (see the card's gate below).
  const showsInterests = profile.interests != null && profile.interests.trim() !== ''
  // V8 ticket 04: nowIso is read ONCE per render (the BrowsePage pattern) and
  // drives BOTH the Upcoming/Past split and each card's ended/muted styling,
  // so a card can never sit in a section its own styling contradicts.
  const nowIso = new Date().toISOString()
  const { upcoming, past } = partitionPostsByTime(posts ?? [], nowIso)
  /**
   * The profile-archive slice: the Past section's whole render decided purely
   * (`profileArchive.planPastArchive`) — which rows are visible at this page
   * state, the month groups once the archive is long enough to need anchors,
   * the tail button's label (null = no button) and the honest line for rows
   * beyond the fetch's cap. The JSX below only draws what this returns.
   */
  const pastArchive = planPastArchive(past, pastVisible, olderCount, HOST_POSTS_LIMIT)

  return (
    <div className="flex flex-col gap-4">
      {header}

      {/* V15 ticket 06 (A20): THE IDENTITY BLOCK — the TOP of the view. The
          display name + @handle is the FIRST thing on the profile, integrated
          with the avatar. V16 t05: the avatar is sized to THIS page's identity
          heading (`size="lg"` = 80px against the `text-lg` @name) — it was the
          40px `md` default, which read as an afterthought beside a name
          heading. The default is deliberately unchanged: every drop-in card
          and the detail page's host line keep their 40px circle. */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {/* Slice 11 follow-up: this avatar sits ABOVE the fold at the top of a
              profile page, so it is eager. The slice's `eager` default is false
              (correct for list rows), but the /u/:handle identity photo is not a
              list row — lazy-loading it can flash an empty circle on arrival. */}
          <HostAvatar host={profile} size="lg" expandable eager />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">@{profile.display_name}</h2>
            <p className="mt-1 text-sm text-slate-600">Here since {joined}.</p>
            {/* V3 slice 9 (ticket 04): the "Hosted N drop-ins" line — hidden
                when 0 or unsettled; singular "Hosted 1 drop-in" when N = 1.
                V21 t06: now TAPABLE — tapping reveals + scrolls to the Past
                section below. min-h-11 = 44px floor. V25 t09 removed the
                sibling "tap to see past events" hint: the count is the door. */}
            {hostedCount !== null && hostedCount > 0 ? (
              <button
                type="button"
                data-testid="hosted-dropins-toggle"
                onClick={() => {
                  // Scroll to the Past section after state settles.
                  requestAnimationFrame(() => {
                    pastSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  })
                }}
                className="flex min-h-11 flex-col text-left text-sm text-indigo-700 underline decoration-dotted underline-offset-2 hover:text-indigo-800"
              >
                <span>
                  Hosted {hostedCount} {hostedCount === 1 ? 'drop-in' : 'drop-ins'}
                </span>
              </button>
            ) : null}
          </div>
        </div>

        {/* THE PAGE'S ONE ACTION (founder's live annotation, 2026-10-06).
            A parent who opens this page has two questions — WHO are these
            people, and how do I reach them. The identity block answers the
            first; this answers the second, AT THE TOP, where the decision is
            made rather than ~700px down in the Follow/Block/Report row it used
            to live in (that duplicate is deleted — one action, one door).

            The route is the app's OWN (`/inbox?dm=<profileId>`, the call the
            old footer control made), so this opens the conversation the inbox
            already knows how to start — no second mechanism, no local state.

            Never on your own profile: a parent has nobody to message there, and
            `isOwnProfile` is the same session-derived rule the rest of this file
            gates on. Filled `indigo-600` is the ACTION tone (DESIGN.md's "Two
            Tones Rule"); the label carries the handle the way `Follow @handle`
            does, so the button names both the act and its object. */}
        {isOwnProfile ? null : (
          <button
            type="button"
            data-testid="message-profile"
            onClick={() => navigate(`/inbox?dm=${profileId}`)}
            className="inline-flex min-h-11 w-auto items-center justify-center self-start rounded-xl border border-transparent bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:outline-none motion-reduce:transition-none"
          >
            Message
          </button>
        )}

        {/* THE FAMILY MASTHEAD (founder's live /profile change, 2026-10-06).
            The "About the parents" section is absorbed into the identity block,
            because a profile's identity IS its family — the two were one thought
            split across two cards, and the separate card redrew this account's
            avatar to do it (V27's own finding: it "read as a person entry with no
            name"). The parent rows keep the V27 rules unchanged — photo, the name
            (a link when that name IS an account), and the card's own words — and
            now wear the KID ROW's shape (44px face, semibold name, one muted line
            beneath it) so a parent reads the way a child does.

            The row's words are `parent_cards.about` (falling back to the
            account's own bio, V27). There is deliberately NO per-parent "Likes"
            line: `parent_cards` has no such column (migration 0047 —
            name/photo_url/about/position), so faking one would invent data.
            Per-parent interests is a schema decision, not a JSX one.

            The two parents STACK (the list is a `flex flex-col`), one parent per
            full-width row. Note the read-view heading order this
            creates: identity → "About the parents" → "About the kids" → family
            photo. That is a deliberate product order (the family opens the page),
            and it is why `scripts/profile-order-check.mjs` reads 'parents' before
            'kids' on this surface — see the note there. */}
        {parentRows.length > 0 ? (
          <div className="mt-0.5 border-t border-slate-200 pt-3">
            <h2 className="text-base font-semibold text-slate-900">About the parents</h2>
            <ul data-testid="parent-names" className="mt-2 flex flex-col gap-3">
              {parentRows.map((row) => (
                <li
                  key={row.key}
                  data-testid="parent-row"
                  className="flex w-full flex-wrap items-start gap-2"
                >
                  {/* The card's picture — its OWN when it has one the browser
                      can fetch as given (`parentCardPhotoSrc`), otherwise the
                      public account avatar V27 offers the linked/own row. Alt is
                      the parent's NAME, not the account handle. */}
                  {row.photo !== null ? (
                    <PhotoButton
                      src={row.photo}
                      alt={`${row.name}’s photo`}
                      className="block shrink-0 overflow-hidden rounded-full"
                    >
                      <img
                        data-testid="parent-card-photo"
                        src={row.photo}
                        alt={`${row.name}’s photo`}
                        className="h-11 w-11 rounded-full object-cover"
                      />
                    </PhotoButton>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    {row.handle !== null ? (
                      <Link
                        data-testid="parent-name-link"
                        to={`/u/${encodeURIComponent(row.handle)}`}
                        className="inline-flex min-h-11 items-center text-base font-semibold text-indigo-700 underline decoration-dotted underline-offset-2 transition-colors hover:text-indigo-800 motion-reduce:transition-none"
                      >
                        {row.name}
                      </Link>
                    ) : (
                      <span
                        data-testid="parent-name"
                        className="inline-flex min-h-11 items-center text-base font-semibold text-slate-900"
                      >
                        {row.name}
                      </span>
                    )}
                    {row.about !== null ? (
                      <p className="mt-0.5 text-sm text-slate-600 [overflow-wrap:anywhere]">
                        {row.about}
                      </p>
                    ) : null}
                    {/* V32 v32-8 (A6b): what this parent is into, for other
                        signed-in parents — the founder's *"Interest section so
                        that other parents can see what interests they have to
                        see if they would get along"*. The `row.interests` value
                        is the lib seam's decision (`parentCardInterestsText`),
                        so a blank or absent field renders NOTHING rather than an
                        empty `Interests:` label. Rendered under `about` because
                        the words about the person read first and the topics
                        second. */}
                    {row.interests !== null ? (
                      <p
                        data-testid="parent-interests"
                        className="mt-0.5 text-sm text-slate-600 [overflow-wrap:anywhere]"
                      >
                        Interests: {row.interests}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* V16 t05: THE KIDS CARD COMES FIRST — the founder's reorder (kids →
          parents → the family photo). The order is the pure
          `profileBlurbOrder` seam's, re-pinned in this slice; this JSX lays the
          three optional blocks out in exactly the sequence that function emits
          them.

          V2 ticket 02: the kids list (privacy pin: first name + age — no full
          names, no gender, anywhere in the schema or the UI). V3 slice 6
          (ticket 09, migration 0022): the row gained the 40px kid photo
          (the kid's avatar_url) + the "likes" line. V9 ticket 11 REMOVED the
          PHOTO from this row — a row was name · age · likes, exactly — and the
          initial-fallback circle went with it (an initial standing in for a
          photo is the "partial substitute" ticket 10's own record rejects).
          No code path may read a kid's `avatar_url` for display: the photo
          below is minted from the CANONICAL object path
          (`useKidPhotoUrls` → `signedKidPhotoUrls`), never from that column.

          V16 t05 (founder decision Q3) RESTORED THE PHOTO; V25 TICKET 14
          (founder decision, 2026-09-26) WIDENED WHO SEES IT. The founder's
          words: "I don't think the photos should be private. I think it's
          optional if you want to upload photos and if someone chooses to upload
          photos, other people should be able to see them." "People" is scoped
          to signed-in parents, so `kidPhotoVisibility` (`photoStorage.ts`) now
          answers `'owner'` for the family and `'authenticated'` for any other
          signed-in parent (still `'denied'` for an anonymous caller), migration
          0054 drops the owner check from the kid-class storage policy while
          keeping its `[2] = 'kids'` class guard, and the mint call above is
          handed this PROFILE's id whenever there is a session. The block below
          is behind `showsKids`, which is `profile.kids.length > 0` — the
          database's own RLS-filtered answer to "may this viewer see these
          children at all".

          V9 ticket 10's accepted cost is still the boundary for the ROWS
          (confirmed by the human 2026-09-13, recorded in
          .scratch/v9/issues/10-kid-names-privacy-gate.md): a kid's first name
          and photo are visible to the kid's own family, the host of a drop-in
          the kid is attached to, a family who pinged that drop-in, and
          moderators — nobody else. RLS returns no kid rows to anyone else (the
          embed is filtered row by row), so those viewers get NO section at all:
          a "No kids listed." line would be a false statement about the family,
          and an initials circle, a count or a blur would be a partial
          substitute the ticket explicitly rejects. The AGES signal that DOES
          remain on this page is the one ticket 05 put on its post cards
          ("ages 3–6" — never a name), which is the same honest replacement the
          detail page's line uses.

          THE PARTIAL-LIST COST V25 T14 ACCEPTS, stated rather than hidden.
          V16's gate was `isOwnProfile` precisely to avoid showing a host/pinger
          a PARTIAL list — the policy is per KID, so a viewer who pinged one of
          this family's drop-ins receives only the kids attached to it, and a
          partial list of children reads as the whole family. T14 deliberately
          trades that away: the founder asked for other parents to see the
          photos, the rows that carry the photos are exactly the rows 0040
          returns, and the alternative (no render for any non-owner) shows
          nothing at all. So a host/pinger viewer may now see the subset of this
          family's kids that is attached to the shared drop-in, with or without
          photos. Closing the gap properly means either changing 0040 or
          designing a partial-list affordance; both are separate decisions, and
          the ticket's note 7 flags the same asymmetry for the NAME.

          AND THIS IS UX, NOT THE CONTROL (review cycle 1, F5 — do not read a
          guarantee into it): the RLS policy is the boundary. Whatever survives
          that filter sits in `profile.kids` in React state whether or not this
          JSX renders it. Nothing here is a privacy control; the database is.

          THE KIDS BLOCK IS OPTIONAL (V9 ticket 11), so there is no empty-state
          branch inside it any more: a family with no kids gets NO card (the
          "looks finished with none of them" AC) — which is also why the old
          "No kids listed." line is gone. /profile's editor is where a parent
          adds kids, and that editor is always there. */}
      {showsKids ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-slate-900">About the kids</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {profile.kids.map((kid) => {
              const likes = kid.likes?.trim() ?? ''
              const kidPhoto = kidPhotoUrls[kid.id]
              // V25 t09: the heading's two halves, from the one seam that
              // already owns which words a kid row shows (`kidLabel`).
              const heading = kidHeading(kid)
              return (
                <li key={kid.id} data-testid="kid-row" className="flex flex-wrap items-center gap-2">
                  {/* V16 t05: the kid's photo, when this page minted one.
                      `kidPhoto === undefined` is every case where no URL was
                      minted for this row — a kid whose `avatar_url` is unset, a
                      viewer with no session, and a mint the storage policy
                      refused (the hook returns `{}`) — and each renders exactly
                      the old name · age · likes row, so the fallback is the
                      previous design rather than a new placeholder. */}
                  {kidPhoto !== undefined ? (
                    <img
                      data-testid="kid-photo"
                      src={kidPhoto}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    {/* V15 ticket 06 (A17/A18) + V25 t09 (the founder's
                        annotation 3): the row is TYPOGRAPHICALLY STRUCTURED
                        rather than one run-on line. The founder's words —
                        "It just looks like there's just like a name … it
                        should be formatting here" — were about LEGIBILITY, so
                        the name is the row's lead (larger, bold, dark), the age
                        reads as distinct secondary information beside it
                        (smaller, muted), and the likes sit on their own muted
                        line that wraps instead of stretching a `·` sentence
                        past the 320px edge.

                        THE FACTS ARE UNCHANGED, and so is the privacy pin:
                        first name + age only, no full names, no gender. The
                        name and the age are SEPARATE elements so each can be
                        styled, but they are ADJACENT with no separator between
                        them, and `kidHeading`'s split concatenates to exactly
                        `kidLabel`'s string (unit-pinned by a round-trip against
                        the seam). That matters beyond tidiness: two spec
                        assertions read the row as ONE `getByText('Name · Age
                        7')` node (e2e/profiles-v2, e2e/polish), so the DOM text
                        must stay `kidLabel`'s while the two halves wear
                        different type. The likes line is omitted entirely when
                        the field is empty, exactly as the old inline form did
                        with its own `likes !== ''` guard. */}
                    {heading.name !== '' ? (
                      <p className="text-base leading-6">
                        <span className="font-semibold text-slate-900">{heading.name}</span>
                        {heading.age !== null ? (
                          <span className="ml-1 text-sm text-slate-500">
                            {/* THE SEPARATOR LIVES INSIDE THE AGE'S SPAN, and it
                                carries BOTH of its own spaces (` · `). The
                                DOM then reads name-span + " · " + "Age 6",
                                which concatenates to kidLabel's exact
                                "Name · Age 6" — the round-trip is unit-pinned
                                in src/lib/feed.test.ts. The span boundary is
                                invisible to text matching (it does not inject
                                whitespace), so the two exact-text e2e reads
                                still match. */}
                            {' · '}
                            {heading.age}
                          </span>
                        ) : null}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-600">{heading.fallback}</p>
                    )}
                    {likes !== '' ? (
                      <p className="mt-0.5 text-sm text-slate-600 [overflow-wrap:anywhere]">
                        Likes: {likes}
                      </p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {/* V20 t01: THE CARD EXISTS ONLY IF SOMETHING IS IN IT. This wrapper used
          to be unconditional, so a family with no bio, no interests and no
          family photo got an EMPTY BORDERED BOX between its identity card and
          the Hosted drop-ins heading — exactly the placeholder the V16 t05 note
          below says must never render ("a family with none of them gets the
          identity block at the top and nothing else"). The children are
          independently gated; this gate is the union of them, computed from the
          same values they use so the card and its contents can never disagree.
          `showsInterests` is hoisted above rather than inlined below because the
          card's own existence now depends on it.
          THE MASTHEAD CHANGE (founder's live /profile change, 2026-10-06) removed
          the parent rows from this card, so the `showsAbout` term went with
          them: the parents now open the page inside the identity block, and this
          card is the interests line and the family photo. Leaving `showsAbout`
          in the gate would have drawn an empty bordered box for a family whose
          only content is parents. */}
      {showsInterests || familyPhotoUrl !== null ? (
        <div className="flex flex-col gap-3">
          {/* V9 ticket 11 (folded ticket 08) pinned these optional blocks; V16
              t05 RE-PINNED THE ORDER to kids → about → photo (the kids card now
              sits above this one, and the family photo is the page's closer).
              Every one of them is optional: a family with none of them gets the
              identity block at the top and nothing else, no placeholder
              anywhere — which is what the wrapper's own gate above enforces.

              V27 (the founder's /profile annotation): the bio block that used
              to lead this card is GONE from the read surface. It drew the
              account's own avatar again (the identity block above already shows
              it) beside family-level text, so the card read as a person entry
              with no name rather than as the two parents it is about. The bio
              stays editable on the edit surface, where it is the "About the
              parents" textarea.

              THE MASTHEAD (founder's live /profile change, 2026-10-06): the
              parent ROWS left this card too — they now sit under the identity
              block's own "About the parents" heading, each modelled on a kid row
              (face on the left, the name as its heading, the parent's own words
              beneath). What is left here is the account-level interests line and
              the family photo. */}
        {/* V3 slice 6 (ticket 09, migration 0022): the family's interests line —
            hidden when empty/absent, and pre-0022-apply the column is undefined
            (the null-safe render, the pre-0016 discipline).
            V9 ticket 11 groups it with the parents region rather than leaving it
            up in the header — the interests stay ACCOUNT-level (the schema has
            no per-parent interests column, which is also why the parent rows
            carry no per-parent "Likes" line), and the ticket pins the three
            optional blocks ahead of it. It is deliberately OUTSIDE every other
            block's gate — a family that wrote interests and no parent rows still
            shows its interests (which is what this page has always done). */}
        {/* v35-B (`muzjx0we`) — THE INTERESTS ARE EMOJI + TEXT BUBBLES.
            The founder, verbatim, anchored on this block:
            *"under interests, I would like a bubble with a lot of different
            different categories that are represented by text plus a
            corresponding emoji … if they're a book lover, it should say
            'Book Lover 📕' in a pill ui … These categories will just let you
            know what the person likes … if you see them at a drop-in you have
            like something to connect on."*

            The block's GATE (`showsInterests`) and its position are unchanged —
            only the sentence became a row. The split into categories, the emoji
            mapping and the unknown rule are ALL in `lib/interestBubbles` (the
            build law: the component renders, it does not decide). No new read:
            this is `profile.interests`, the same string the line used to print.

            These are LABELS, not controls: `<li>` elements with no button, no
            link, no `aria-pressed` and no press handler, so nothing here looks
            tappable. The wrapper is a plain `<ul>` and the chips WRAP
            (`flex-wrap`) rather than overflow at 390px. */}
        {showsInterests ? (
          <ul
            data-testid="profile-interests"
            className="mt-2 flex flex-wrap gap-2 list-none p-0"
            aria-label="Interests"
          >
            {interestBubbles(profile.interests).map((bubble, index) => (
              <li
                /* Index in the key is deliberate: duplicate categories are kept
                   (the parent typed them), so `text` alone is not unique. The
                   ORDER is the parent's own and never sorted — acceptance (e). */
                key={`${bubble.text}-${index}`}
                data-testid="interest-bubble"
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700"
              >
                {bubble.emoji !== null ? (
                  <span data-testid="interest-bubble-emoji" aria-hidden="true">
                    {bubble.emoji}
                  </span>
                ) : null}
                {/* The text is ALWAYS rendered, emoji or not — an unknown
                    category keeps its words and gets no glyph, never a blank
                    bubble and never a stand-in emoji. */}
                <span>{bubble.text}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {/* V16 t05: THE FAMILY PHOTO IS THE CLOSER (it used to lead this card).
            "A PHOTO OF YOUR FAMILY" IS NOT PUBLIC — it is in the private bucket
            and only a signed-in family can mint for it (T4: the photo usually
            depicts the children). The signed URL arrives from the hook above;
            without one there is simply no image.
            V24: the block carries its OWN "Family photos" heading on BOTH
            surfaces (the founder's annotation 11 — a dedicated section, not an
            anonymous closer of the about card). The heading sits INSIDE this
            card, after the bio/interests content, so the block's POSITION in
            the page order is unchanged: `profileBlurbOrder` still emits
            familyPhoto as the closer of the shared sequence, and the
            cross-surface order guard sees the same block on each side. */}
        {familyPhotoUrl !== null ? (
          <div className="mt-3 first:mt-0">
            <h2 className="text-base font-semibold text-slate-900">Family photos</h2>
            {/* V25 t10 (the founder's annotation): THE PHOTO FILLS THE BLOCK'S
                WIDTH. The height cap `max-h-72` is GONE — it was the letterbox
                the founder circled: a portrait photo lost its bottom and a
                landscape one got bars, so the image never reached the block's
                edges. The photo now takes the full width at the image's own
                aspect ratio (`object-cover` is not needed here: nothing is
                cropped, so nothing can be distorted), and the mount, which
                carries no `max-h`, is what the width is measured against.
                The block is the family-photo GRID when there is more than one
                photo and this single photo otherwise — `photosAreTiled` owns
                that decision (src/lib/photoGallery.ts) rather than this JSX.
                ONE CONSEQUENCE, measured rather than argued: with the cap gone
                a portrait photo is now as tall as its own ratio makes it (e.g. a
                3:4 source is ~430px tall at a 358px phone column). That is the
                asked-for behaviour — the photo's shape decides its box, the
                block no longer crops a portrait's bottom — and the
                `family-photo-grid` mount is what the width is measured against
                in the lane.
                THE WALL, so no future reader mistakes the array for a choice:
                ONE source photo exists (one column, one object path), so the
                array below always has length 1 today and tiling is never
                reached. Rendering several photos needs a schema decision —
                a second column or a photo table — and this slice deliberately
                ships no migration. */}
            <FamilyPhotoBlock
              photos={galleryPhotosFrom(familyPhotoUrl, `@${profile.display_name}’s family photo`)}
              label={`@${profile.display_name}’s family photo`}
              roundedClassName="rounded-xl"
            />
          </div>
        ) : null}
        </div>
      ) : null}

      {isOwnProfile ? null : (
        <div className="flex flex-col gap-2">
          {/* 375px pass (slice 5, parked slice-4 finding): the row wraps
              instead of forcing horizontal scroll with long handles. */}
          <div className="flex flex-wrap items-center gap-2">
            {/* V8 ticket 09: Follow / Unfollow — FIRST in the row (it is the
                action a parent who just met this family wants; Block stays
                where it was, second, and Report third — the same wrap
                discipline so 375px still needs no horizontal scroll). */}
            <button
              type="button"
              data-testid="follow-profile"
              aria-pressed={following}
              disabled={followBusy}
              onClick={() => void handleToggleFollow()}
              className={
                'inline-flex min-h-11 items-center rounded-xl border px-3 py-2.5 text-base font-medium disabled:opacity-50 ' +
                (following
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-indigo-300 bg-white text-indigo-700')
              }
            >
              {followBusy
                ? 'Updating…'
                : following
                  ? `Unfollow @${profile.display_name}`
                  : `Follow @${profile.display_name}`}
            </button>
            <button
              type="button"
              aria-pressed={blocked}
              disabled={blockingBusy}
              onClick={() => void handleToggleBlock()}
              className={
                'inline-flex min-h-11 items-center rounded-xl border px-3 py-2.5 text-base font-medium disabled:opacity-50 ' +
                (blocked
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-slate-300 bg-white text-slate-700')
              }
            >
              {blockingBusy
                ? 'Updating…'
                : blocked
                  ? `Unblock @${profile.display_name}`
                  : `Block @${profile.display_name}`}
            </button>
            <button
              type="button"
              onClick={() => setReporting(true)}
              className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-600"
            >
              Report
            </button>
          </div>
          {followError !== null ? (
            <p data-testid="follow-error" className="text-sm text-red-600">
              {followError}
            </p>
          ) : null}
          {following ? (
            <p className="text-xs text-slate-500">
              On your Following list (/settings) — you’ll see when they’re going to something.
            </p>
          ) : null}
          {blockError !== null ? <p className="text-sm text-red-600">{blockError}</p> : null}
          {blocked ? (
            <p className="text-xs text-slate-500">
              Their drop-ins are hidden from your feed and detail pages.
            </p>
          ) : null}
        </div>
      )}

      {/* V8 ticket 04: the host's REAL posts. Upcoming first (what a visitor
          can still join), then Past (the social proof that this family
          actually shows up — muted cards, via the existing isEnded styling).
          The two empty states are deliberately distinguishable and true:
          nothing at all → "No posts yet."; history but nothing ahead →
          "Nothing coming up — past drop-ins below." (true by construction:
          upcoming is the complement of isEnded, so nothing-upcoming means every
          post has ended). */}
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-slate-900">Hosted drop-ins</h2>
        {postsError !== null ? (
          <p className="text-sm text-red-600">{postsError}</p>
        ) : posts === null ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-slate-500">No posts yet.</p>
        ) : (
          <>
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-600">Nothing coming up — past drop-ins below.</p>
            ) : (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-slate-700">Upcoming</h3>
                <div className="flex flex-col gap-3">
                  {upcoming.map((post) => (
                    <DropInCard
                      key={post.id}
                      playdate={post}
                      nowIso={nowIso}
                      ageRangeLabel={buildCardAgeRangeLabel(post)}
                      goingPings={goingPingsByPostId?.[post.id] ?? []}
                      goingPingsLoaded={goingPingsByPostId !== null}
                    />
                  ))}
                </div>
              </section>
            )}
            {past.length > 0 ? (
              <div ref={pastSectionRef}>
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-slate-700">Past</h3>
                  {/* THE ARCHIVE (profile-archive slice, 2026-10-05). History
                      is a line, not an invitation card: each row is ONE compact
                      link (PastDropInRow below) and the list is BOUNDED — the
                      first paint shows `PAST_FIRST_PAGE` rows and one real
                      button brings the next page, replacing the flat run of up
                      to 50 full cards (~5548px) and the DEAD "+N older"
                      paragraph that promised rows nothing could reach. The
                      month headings (and their counts) appear once the archive
                      is long enough to need anchors; a short archive renders
                      one group with a null label, i.e. no extra chrome at all.
                      Every decision above is `pastArchive`'s
                      (src/lib/profileArchive.ts) — this JSX only draws it. */}
                  {pastArchive.groups.map((group) => (
                    <div key={group.key} className="flex flex-col gap-2">
                      {group.label !== null ? (
                        <h4 className="text-xs text-slate-500">
                          {group.label} · {group.count}
                        </h4>
                      ) : null}
                      <div className="flex flex-col gap-2">
                        {group.rows.map((post) => (
                          <PastDropInRow key={post.id} post={post} />
                        ))}
                      </div>
                    </div>
                  ))}
                  {pastArchive.showMore !== null ? (
                    <button
                      type="button"
                      data-testid="past-show-more"
                      onClick={() =>
                        setPastVisible((visible) => nextPastVisible(visible, past.length))
                      }
                      className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-indigo-600 transition-colors motion-reduce:transition-none hover:border-indigo-300"
                    >
                      {pastArchive.showMore}
                    </button>
                  ) : null}
                  {/* The cap's SECOND number, said honestly: rows beyond
                      HOST_POSTS_LIMIT are reachable by no query, so this line
                      names the limit instead of promising them (the dead end
                      this slice removes was the promise). */}
                  {pastArchive.olderNote !== null ? (
                    <p className="text-xs text-slate-500">{pastArchive.olderNote}</p>
                  ) : null}
                </section>
              </div>
            ) : null}
          </>
        )}
      </div>

      {reporting && !isOwnProfile ? (
        <ReportDialog
          targetLabel={`@${profile.display_name}`}
          profileId={profileId}
          onClose={() => setReporting(false)}
        />
      ) : null}
    </div>
  )
}

/**
 * ONE PAST ROW — history as a line, not an invitation card (profile-archive
 * slice, `.scratch/profile-archive/spec.md` §2.2).
 *
 * The whole row is ONE link to the drop-in, ~56px tall (measured: 56px under
 * the app's own type scale — `--text-sm` 17px over `--text-xs` 14px, so the
 * content is 46px and `py-1`'s 8px puts the box exactly on the `min-h-14`
 * floor), carrying what the archive is for (which drop-in, when, where) and
 * nothing an invitation needs:
 * NO avatar or "@handle" (this is the host's own history, and the profile above
 * already says who they are), NO "No one's going yet" (nobody went — the
 * section is "Past" and the month heading dates it), NO "More info ›" label
 * (the row IS the link) and NO `card-maps-link` (a park visited last month is
 * not a destination to navigate to). DropInCard itself is untouched: the feed
 * and a profile's Upcoming list are still where an actionable card belongs.
 *
 * WHAT MUST SURVIVE (AC 4), because the specs and the e2e helpers select on
 * it: `data-testid="dropin-card"` marks every row, and `card-when` (the bare
 * date — `instantDayLabel`, never "Today") and `card-place` live inside this
 * link. The title keeps its own line so the unique `e2e-<epoch>` title a spec
 * created still identifies ITS row (the live-data discipline: an assertion may
 * only be about the rows the spec made).
 *
 * NO `isEnded` MUTING HERE, on purpose: every row in this section has ended,
 * the heading says "Past", and the month heading dates it — `opacity-60` would
 * mute the whole list uniformly, which is not information.
 *
 * THE STATUS CHIP STAYS, and only for an EXPLICIT status ('ended' / 'cancelled'
 * — the shared `pastPostStatusLabel` seam). It is what explains a row that a
 * plain "Past" heading cannot: a post the host ENDED EARLY sits here with a
 * date that has not arrived yet (V12 t03), and a cancelled one is history only
 * because the host called it off. A row that is past simply because its clock
 * ran out carries no chip — the section already says so.
 */
function PastDropInRow({ post }: { post: PlaydateWithNeighborhood }) {
  const statusLabel = pastPostStatusLabel(post.status)
  return (
    <Link
      to={`/playdate/${post.id}`}
      data-testid="dropin-card"
      className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-1 transition-colors motion-reduce:transition-none hover:border-indigo-300"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{post.title}</p>
        <p className="truncate text-xs text-slate-600">
          <span data-testid="card-when">{instantDayLabel(post.starts_at)}</span>
          <span aria-hidden="true"> · </span>
          <span data-testid="card-place">{post.place}</span>
        </p>
      </div>
      {statusLabel !== null ? (
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {statusLabel}
        </span>
      ) : null}
      <span aria-hidden="true" className="shrink-0 text-lg text-slate-400">
        ›
      </span>
    </Link>
  )
}

/**
 * The settled-profile fetch's three states as one small render, so a caller
 * that wants "fetch by handle, then show ProfileView" does not repeat the
 * loading / error / not-found branches. UserPage is the only caller today.
 */
export function ProfileLoadStates({
  state,
  handle,
}: {
  state: { status: 'loading' } | { status: 'error'; message: string } | { status: 'not-found' }
  handle?: string
}) {
  if (state.status === 'loading') {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-red-600">{state.message}</p>
        <Link to="/" className="flex min-h-11 items-center text-sm text-indigo-600">
          Back to today
        </Link>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">We couldn’t find @{handle ?? '…'}</h1>
      <p className="text-sm text-slate-600">
        The handle may be a typo, or this family may not be on Drop In yet.
      </p>
      <Link to="/" className="flex min-h-11 items-center text-sm text-indigo-600">
        Back to today
      </Link>
    </div>
  )
}
