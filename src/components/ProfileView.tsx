import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { DropInCard, HostAvatar } from './DropInCard'
import { PhotoButton } from './ImageLightbox'
import { ReportDialog } from './ReportDialog'
import { useSessionContext } from './SessionProvider'
import { useFamilyPhotoUrl } from './useFamilyPhotoUrl'
import { useKidPhotoUrls } from './useKidPhotoUrls'
import {
  countPostsByHost,
  getBlockState,
  getFollowState,
  kidAgesByPostForPosts,
  listPostsByHost,
  toggleBlock,
  toggleFollowProfile,
} from '../lib/db'
import { cardAgeRangeLabel, kidLabel, partitionPostsByTime } from '../lib/feed'
import { profileBlurbOrder } from '../lib/photoStorage'
import type { PlaydateWithNeighborhood, ProfileWithKids } from '../lib/types'
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
  'kids',
  'parents',
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
 *  - The OPTIONAL BLOCK ORDER is the pure `profileBlurbOrder` seam's
 *    (V16 t05 re-pinned it: kids → about → family photo). The JSX below lays
 *    the three blocks out in exactly the sequence that function emits them.
 *
 * PRIVACY NOTE (carried from UserPage, unchanged by the extraction): the whole
 * kids block sits behind `isOwnProfile`, and the kid-photo mint is handed
 * `null` as the owner for every other viewer. `kidPhotoVisibility` answers
 * `'owner'` or `'denied'`, nothing else. The visitor path here is
 * byte-for-byte what the standalone page rendered.
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
  const { session } = useSessionContext()
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
  // V8 ticket 04: the host's real posts (null = still loading) + the
  // truncated past rows behind the cap ("+N older"). A failed load surfaces
  // the designed error line, never a crash.
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
  const [olderCount, setOlderCount] = useState(0)
  const [postsError, setPostsError] = useState<string | null>(null)
  // V21 t06: whether the "Hosted N drop-ins" line has been tapped to reveal
  // the past events list below. Starts false (collapsed); tapping the line
  // sets it true and scrolls the user to the Past section. The control is
  // only rendered when hostedCount > 0, so a parent with zero hosted
  // drop-ins never sees an empty expandable list.
  const [pastRevealed, setPastRevealed] = useState(false)
  // V21 t06: ref to the Past section so tapping "Hosted N drop-ins" can
  // scroll the user there. TAP (not hover) — this is a phone app; the
  // founder's "hover over and see the past events" becomes a tap that
  // reveals + scrolls to the bounded past list (most recent first).
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

  // V16 t05 (founder decision Q3): THE OWNER'S OWN KID PHOTOS. The kids block
  // below already renders in the SELF VIEW only, and this hook is the app's one
  // kid-photo mint path (`signedKidPhotoUrls` → the PRIVATE `kid-photos`
  // bucket). It is called with `null` as the owner for every viewer who is not
  // the owner, which is what keeps this page's visitor path exactly as
  // photo-free as it was: the hook's own contract is "no owner id, no mint",
  // and `kidPhotoVisibility` (the rule the storage policies implement) allows
  // `'owner'` and nothing else. So the gate here is NOT a new privacy rule —
  // it is the same `isOwnProfile` the kids block has always used, wired to the
  // existing mint.
  const kidPhotoUrls = useKidPhotoUrls(isOwnProfile ? profileId : null, profile.kids)

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
  // The pinned optional-block order (V16 t05 re-pinned it): the kids list →
  // "About the parents" → the family photo. The pure `profileBlurbOrder`
  // decides which of the three exist AND their order; all three are optional
  // and independent, and `[]` for a family with none of them. `kidsVisible` is
  // this page's own rule — the self view only — not something the pure seam
  // could know.
  //
  // NOTE the JSX below does consume this seam in order: the kids card is
  // emitted first, then the about-the-parents card, then the family photo —
  // the same three blocks the function names, laid out in the same sequence.
  const blurb = profileBlurbOrder(profile, isOwnProfile && profile.kids.length > 0)
  const showsAbout = blurb.includes('about')
  const showsKids = blurb.includes('kids')
  // V20 t01: hoisted out of the JSX because the wrapper card's own existence is
  // the union of its three contents (see the card's gate below).
  const showsInterests = profile.interests != null && profile.interests.trim() !== ''
  // V8 ticket 04: nowIso is read ONCE per render (the BrowsePage pattern) and
  // drives BOTH the Upcoming/Past split and each card's ended/muted styling,
  // so a card can never sit in a section its own styling contradicts.
  const nowIso = new Date().toISOString()
  const { upcoming, past } = partitionPostsByTime(posts ?? [], nowIso)

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
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <HostAvatar host={profile} size="lg" expandable />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">@{profile.display_name}</h2>
            <p className="mt-1 text-sm text-slate-600">Here since {joined}.</p>
            {/* V3 slice 9 (ticket 04): the "Hosted N drop-ins" line — hidden
                when 0 or unsettled; singular "Hosted 1 drop-in" when N = 1.
                V21 t06: now TAPABLE — tapping reveals + scrolls to the Past
                section below (the bounded list of past events, most recent
                first). This is a phone app, so the founder's "hover over and
                see the past events" becomes a tap. The control only appears
                when hostedCount > 0, so a parent with zero hosted drop-ins
                never sees an empty expandable list. min-h-11 = 44px floor. */}
              {hostedCount !== null && hostedCount > 0 ? (
                <button
                  type="button"
                  data-testid="hosted-dropins-toggle"
                  onClick={() => {
                    setPastRevealed(true)
                    // Scroll to the Past section after state settles.
                    requestAnimationFrame(() => {
                      pastSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    })
                  }}
                  className="flex min-h-11 flex-col text-left text-sm text-indigo-700 underline decoration-dotted underline-offset-2 hover:text-indigo-800"
                >
                  {/* The COUNT is its own text node, unpolluted by any hint.
                      Two existing specs (host-retention, profile-posts) match
                      this line EXACTLY (`'Hosted 1 drop-in'` and
                      `/^Hosted \d+ drop-ins?$/`), and folding the "tap" hint
                      into the same text node silently broke both — a real
                      regression caught by the full e2e suite, not by the unit
                      gate. The hint is a sibling span instead, so the label
                      stays matchable and the affordance stays visible. */}
                  <span>
                    Hosted {hostedCount} {hostedCount === 1 ? 'drop-in' : 'drop-ins'}
                  </span>
                  {pastRevealed ? null : (
                    <span className="text-xs font-normal no-underline">
                      tap to see past events
                    </span>
                  )}
                </button>
              ) : null}
          </div>
        </div>
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

          V16 t05 (founder decision Q3) RESTORES THE PHOTO — but only here, and
          only for the owner. The rule that makes that safe is unchanged:
          `kidPhotoVisibility` (`photoStorage.ts`) answers `'owner'` for the
          owner and `'denied'` for everyone else, and the mint call above is
          handed `null` as the owner for every other viewer, so a visitor's
          page never mints and never renders a kid photo. The visitor path is
          byte-for-byte what it was: this whole block is behind `showsKids`,
          which is `isOwnProfile && kids.length > 0`.

          V9 ticket 10 (the accepted cost, CONFIRMED by the human 2026-09-13
          and recorded in .scratch/v9/issues/10-kid-names-privacy-gate.md):
          this section renders ONLY in the self view, and V9 ticket 11 moved
          that rule into the `showsKids` decision above (the pure
          `profileBlurbOrder`, told `isOwnProfile && kids.length > 0`) — one
          place decides whether this block exists, and the ticket's block order
          lives in the same seam. V2 shipped it to every
          signed-in visitor deliberately ("the public-profile-surface class"
          0022's own header names), and migration 0040 ends that: a kid's first
          name and photo are visible to the kid's own family, the host of a
          drop-in the kid is attached to, a family who pinged that drop-in, and
          moderators — nobody else. RLS already returns no kid rows to anyone
          else (the embed is filtered row by row), so the honest render for
          those viewers is NO section at all: a "No kids listed." line would be a
          false statement about the family, and an initials circle, a count or
          a blur would be a partial substitute the ticket explicitly rejects.
          The AGES signal that DOES remain on this page is the one ticket 05
          put on its post cards ("ages 3–6" — never a name), which is the same
          honest replacement the detail page's line uses.

          Why the gate is `isOwnProfile` and not `profile.kids.length > 0`: the
          policy is per KID, so a viewer who pinged ONE of this family's
          drop-ins (or hosted one) would receive a PARTIAL list — the kids
          attached to that drop-in only. A partial list of children is worse
          than no list: it reads as the whole family.

          AND THIS IS UX, NOT THE CONTROL (review cycle 1, F5 — do not read a
          guarantee into it): the RLS policy is the boundary. A host/pinger
          viewer still RECEIVES the rows they may see — the embed is filtered
          row by row by the database, and whatever survives that filter sits in
          `profile.kids` in React state whether or not this JSX renders it. What
          the client gate buys is that a partial list is never SHOWN as if it
          were the whole family. Nothing here is a privacy control; the
          database is.

          THE KIDS BLOCK IS OPTIONAL (V9 ticket 11), so there is no empty-state
          branch inside it any more: a family with no kids gets NO card (the
          "looks finished with none of them" AC) — which is also why the old
          "No kids listed." line is gone. /profile's editor is where a parent
          adds kids, and that editor is always there. */}
      {showsKids ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">About the kids</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {profile.kids.map((kid) => {
              const likes = kid.likes?.trim() ?? ''
              const kidPhoto = kidPhotoUrls[kid.id]
              return (
                <li key={kid.id} data-testid="kid-row" className="flex flex-wrap items-center gap-2">
                  {/* V16 t05: the kid's photo, when this page minted one.
                      `kidPhoto === undefined` is the EVERY-viewer-but-the-owner
                      case (the hook returns `{}`) AND the owner's
                      no-photo-yet case — both render exactly the old
                      name · age · likes row, so the fallback is the previous
                      design rather than a new placeholder. */}
                  {kidPhoto !== undefined ? (
                    <img
                      data-testid="kid-photo"
                      src={kidPhoto}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    {/* V15 ticket 06 (A17/A18): one unambiguous inline line —
                        "Sam · Age 6 · Likes: soccer". The likes label is always
                        present when the field has content; name/age fall back
                        to kidLabel's age-only / name-only forms. */}
                    <p className="text-sm text-slate-800">
                      {kidLabel(kid.first_name, kid.age)}
                      {likes !== '' ? ` · Likes: ${likes}` : null}
                    </p>
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
          identity block at the top and nothing else"). The three children are
          independently gated; this gate is the union of them, computed from the
          same values they use so the card and its contents can never disagree.
          `showsInterests` is hoisted above rather than inlined below because the
          card's own existence now depends on it. */}
      {showsAbout || showsInterests || familyPhotoUrl !== null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {/* V13 ticket 01: the identity row (avatar + @handle + "Here since" +
              "Hosted N drop-ins") is the page's identity block at the top (V15
              ticket 06, A20). This card carries the "About the parents" block
              (the bio + interests, under a real heading) and, after it, the
              family photo.

              V9 ticket 11 (folded ticket 08) pinned these optional blocks; V16
              t05 RE-PINNED THE ORDER to kids → about → photo (the kids card now
              sits above this one, and the family photo is the page's closer).
              Every one of them is optional: a family with none of them gets the
              identity block at the top and nothing else, no placeholder
              anywhere — which is what the wrapper's own gate above enforces. */}
          {showsAbout ? (
          <div className="mt-3 first:mt-0">
            <h2 className="text-base font-semibold text-slate-900">About the parents</h2>
            {/* V16 t05: the parent photo (the founder's item 3 — the one part of
                "photo + description + Message" that was genuinely missing; the
                Message button is the visitor-only action row below).
                `profile.avatar_url` is the PUBLIC parent avatar — a plain URL
                in the public `avatars` bucket (0011), the same value every
                drop-in card renders — so this is not a signed-URL mint and
                needs no hook; a family with no avatar simply gets no image. */}
            <div className="mt-2 flex items-start gap-3">
              {profile.avatar_url != null && profile.avatar_url !== '' ? (
                <PhotoButton
                  src={profile.avatar_url}
                  alt={`@${profile.display_name}’s photo`}
                  className="block shrink-0 overflow-hidden rounded-full"
                >
                  <img
                    data-testid="parent-photo"
                    src={profile.avatar_url}
                    alt={`@${profile.display_name}’s photo`}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                </PhotoButton>
              ) : null}
              <p className="min-w-0 whitespace-pre-line text-sm text-slate-700">{profile.bio}</p>
            </div>
          </div>
        ) : null}
        {/* V3 slice 6 (ticket 09, migration 0022): the family's interests line —
            hidden when empty/absent, and pre-0022-apply the column is undefined
            (the null-safe render, the pre-0016 discipline).
            V9 ticket 11 groups it with the family description rather than leaving
            it up in the header: /profile's editor copy pins it there ("Shown with
            “About our family”"), and the ticket pins the three optional blocks
            ahead of it. It is deliberately OUTSIDE the `showsAbout` gate — a
            family that wrote interests and no description still shows its
            interests (which is what this page has always done). */}
        {showsInterests ? (
          <p className="mt-2 text-sm text-slate-600">
            Interests: {profile.interests}
          </p>
        ) : null}
        {/* V16 t05: THE FAMILY PHOTO IS THE CLOSER (it used to lead this card).
            "A PHOTO OF YOUR FAMILY" IS NOT PUBLIC — it is in the private bucket
            and only a signed-in family can mint for it (T4: the photo usually
            depicts the children). The signed URL arrives from the hook above;
            without one there is simply no image. */}
        {familyPhotoUrl !== null ? (
          <div className="mt-3 first:mt-0">
            <PhotoButton
              src={familyPhotoUrl}
              alt={`@${profile.display_name}’s family photo`}
              className="block max-w-full overflow-hidden rounded-xl"
            >
              <img
                data-testid="family-photo"
                src={familyPhotoUrl}
                alt={`@${profile.display_name}’s family photo`}
                className="max-h-72 w-full object-cover"
              />
            </PhotoButton>
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
                'rounded-xl border px-3 py-2 text-sm font-medium disabled:opacity-50 ' +
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
              data-testid="message-profile"
              onClick={() => navigate(`/inbox?dm=${profileId}`)}
              className="rounded-xl border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700"
            >
              Message
            </button>
            <button
              type="button"
              aria-pressed={blocked}
              disabled={blockingBusy}
              onClick={() => void handleToggleBlock()}
              className={
                'rounded-xl border px-3 py-2 text-sm font-medium disabled:opacity-50 ' +
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
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600"
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
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-slate-600">No posts yet.</p>
          </div>
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
                    />
                  ))}
                </div>
              </section>
            )}
            {past.length > 0 ? (
              <div ref={pastSectionRef}>
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-slate-700">Past</h3>
                  <div className="flex flex-col gap-3">
                    {past.map((post) => (
                      <DropInCard
                        key={post.id}
                        playdate={post}
                        nowIso={nowIso}
                        ageRangeLabel={buildCardAgeRangeLabel(post)}
                      />
                    ))}
                  </div>
                  {/* The cap's honest tail (never pagination at this volume):
                      a plain count of the past rows the 50-row fetch left out. */}
                  {olderCount > 0 ? (
                    <p className="text-xs text-slate-500">+{olderCount} older</p>
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
