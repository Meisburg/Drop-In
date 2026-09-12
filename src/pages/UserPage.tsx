import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { DropInCard, HostAvatar } from '../components/DropInCard'
import { PhotoButton } from '../components/ImageLightbox'
import { ReportDialog } from '../components/ReportDialog'
import { useSessionContext } from '../components/SessionProvider'
import {
  countPostsByHost,
  getBlockState,
  getProfileByHandle,
  listPostsByHost,
  toggleBlock,
} from '../lib/db'
import { partitionPostsByTime } from '../lib/feed'
import type { PlaydateWithNeighborhood, ProfileWithKids } from '../lib/types'

type UserPageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'not-found' }
  | { status: 'ready'; profile: ProfileWithKids }

/**
 * /u/:handle — a profile's public face (slice 2) + the trust controls
 * (slice 4): a block/unblock toggle and a report entry, both hidden on your
 * own profile page. Blocking hides the person's posts from your feed and
 * detail views (the DB-level filter from slice 3); reporting files a
 * moderator-only report (migration 0008).
 *
 * V3 slice 9 (ticket 04): the "Hosted N drop-ins" credibility line under
 * "Here since" (db.countPostsByHost: the all-time hosted count — computed
 * behavioral history per the 2026-09-09 design verdict: NO two-sided
 * reviews, NO vouching). The shared header render (the self view AND
 * /u/:handle); hidden when N = 0 or unsettled (a failed load degrades to
 * hidden — zero-pressure soul, never a crash).
 *
 * V8 ticket 04: the Posts block is REAL. The hardcoded "No posts yet." (a
 * lie on every profile that ever hosted something — the worst first
 * impression on the one surface a parent visits to decide whether to show
 * up) is gone. The host's own posts render as two sections — Upcoming
 * (starts_at ascending) and Past (descending) — through the same DropInCard
 * the feed uses, so past cards come out muted via the existing isEnded
 * styling. The split + both orders are the pure
 * feed.partitionPostsByTime; the rows come from db.listPostsByHost (hidden
 * posts excluded, the viewer's blocks honored, each section capped at
 * HOST_POSTS_LIMIT with a plain "+N older" count). pingToggle and
 * goingPings are deliberately NOT passed: there is no optimistic write path
 * outside the feed, and no per-page ping query belongs on this page.
 * The "Hosted N drop-ins" line above is untouched by that change.
 */
export function UserPage() {
  const { handle } = useParams<{ handle: string }>()
  const { session } = useSessionContext()
  const [state, setState] = useState<UserPageState>({ status: 'loading' })
  const [blocked, setBlocked] = useState(false)
  const [blockingBusy, setBlockingBusy] = useState(false)
  const [blockError, setBlockError] = useState<string | null>(null)
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
  const [olderCount, setOlderCount] = useState(0)
  const [postsError, setPostsError] = useState<string | null>(null)

  useEffect(() => {
    if (handle === undefined || handle === '') {
      setState({ status: 'not-found' })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    getProfileByHandle(handle)
      .then((profile) => {
        if (cancelled) return
        setState(profile === null ? { status: 'not-found' } : { status: 'ready', profile })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Something went wrong.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [handle])

  const profileId = state.status === 'ready' ? state.profile.id : null
  const isOwnProfile = session !== null && profileId !== null && profileId === session.user.id

  // The initial block state, for other people's profiles only. A failed
  // read (blocks table not applied yet) leaves the toggle unpressed — the
  // blocks table (migration 0006) ships with slice 3, so this is best-effort.
  useEffect(() => {
    if (profileId === null || isOwnProfile) return
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

  // V3 slice 9 (ticket 04): the "Hosted N drop-ins" line — computed
  // behavioral history (the 2026-09-09 design verdict: no reviews, no
  // vouching): the all-time hosted count (db.countPostsByHost, NO
  // status/end filters), fetched once per settled profile id. A failed
  // load degrades to hidden (zero-pressure soul, never a crash).
  useEffect(() => {
    if (profileId === null) return
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
    if (profileId === null) return
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

  async function handleToggleBlock() {
    if (profileId === null || blockingBusy) return
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

  if (state.status === 'not-found') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          We couldn’t find @{handle ?? '…'}
        </h1>
        <p className="text-sm text-slate-600">
          The handle may be a typo, or this family may not be on Drop In yet.
        </p>
        <Link to="/" className="flex min-h-11 items-center text-sm text-indigo-600">
          Back to today
        </Link>
      </div>
    )
  }

  const { profile } = state
  const joined = new Date(profile.created_at).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
  // V8 ticket 04: nowIso is read ONCE per render (the BrowsePage pattern) and
  // drives BOTH the Upcoming/Past split and each card's ended/muted styling,
  // so a card can never sit in a section its own styling contradicts.
  const nowIso = new Date().toISOString()
  const { upcoming, past } = partitionPostsByTime(posts ?? [], nowIso)

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <HostAvatar host={profile} expandable />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900">@{profile.display_name}</h1>
            <p className="mt-1 text-sm text-slate-600">Here since {joined}.</p>
            {/* V3 slice 9 (ticket 04): the "Hosted N drop-ins" line — the
                shared header render (self view AND /u/:handle). Hidden
                when 0 or unsettled; singular "Hosted 1 drop-in" when
                N = 1 (the e2e AC pin). */}
            {hostedCount !== null && hostedCount > 0 ? (
              <p className="text-sm text-slate-600">
                Hosted {hostedCount} {hostedCount === 1 ? 'drop-in' : 'drop-ins'}
              </p>
            ) : null}
          </div>
        </div>
        {profile.bio != null && profile.bio.trim() !== '' ? (
          <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{profile.bio}</p>
        ) : null}
        {/* V3 slice 6 (ticket 09, migration 0022): the family's interests
            line (the conversation starter under the bio — hidden when
            empty/absent; pre-0022-apply the column is undefined, the
            null-safe render, the pre-0016 discipline). */}
        {profile.interests != null && profile.interests.trim() !== '' ? (
          <p className="mt-2 text-sm text-slate-600">
            Interests: {profile.interests}
          </p>
        ) : null}
      </div>

      {/* V2 ticket 02: the kids list (privacy pin: first name + age — no full
          names, no gender, anywhere in the schema or the UI). V3 slice 6
          (ticket 09, migration 0022): the row gains the 40px kid photo
          (the kid's avatar_url, the uploadKidPhoto public URL, or the
          initial-fallback circle — the HostAvatar pattern, the kid's
          first name standing in for the display name) + the "likes" line
          (hidden when empty/absent; pre-0022-apply the columns are
          undefined, the null-safe render). The kid-photo pin: it renders
          ONLY in this profile kids list — never on cards or event lines. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Kids</h2>
        {profile.kids.length === 0 ? (
          <p className="mt-1 text-sm text-slate-600">No kids listed.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {profile.kids.map((kid) => {
              const likes = kid.likes?.trim() ?? ''
              return (
                <li key={kid.id} className="flex flex-wrap items-center gap-2">
                  {kid.avatar_url ? (
                    // V6: the kid photo opens full-screen too — 'so I can see
                    // what the parents and the kids look like', which is how
                    // a parent decides whether to show up.
                    <PhotoButton src={kid.avatar_url} alt={`${kid.first_name}’s photo`}>
                      <img
                        src={kid.avatar_url}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                    </PhotoButton>
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-500"
                    >
                      {(kid.first_name.charAt(0) || '?').toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">
                      {kid.first_name} · {kid.age}
                    </p>
                    {likes !== '' ? (
                      <p className="mt-0.5 text-xs text-slate-600">likes {likes}</p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {isOwnProfile ? null : (
        <div className="flex flex-col gap-2">
          {/* 375px pass (slice 5, parked slice-4 finding): the row wraps
              instead of forcing horizontal scroll with long handles. */}
          <div className="flex flex-wrap items-center gap-2">
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
        <h2 className="text-base font-semibold text-slate-900">Posts</h2>
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
                    <DropInCard key={post.id} playdate={post} nowIso={nowIso} />
                  ))}
                </div>
              </section>
            )}
            {past.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-slate-700">Past</h3>
                <div className="flex flex-col gap-3">
                  {past.map((post) => (
                    <DropInCard key={post.id} playdate={post} nowIso={nowIso} />
                  ))}
                </div>
                {/* The cap's honest tail (never pagination at this volume):
                    a plain count of the past rows the 50-row fetch left out. */}
                {olderCount > 0 ? (
                  <p className="text-xs text-slate-500">+{olderCount} older</p>
                ) : null}
              </section>
            ) : null}
          </>
        )}
      </div>

      {reporting && !isOwnProfile ? (
        <ReportDialog
          targetLabel={`@${profile.display_name}`}
          profileId={profile.id}
          onClose={() => setReporting(false)}
        />
      ) : null}
    </div>
  )
}