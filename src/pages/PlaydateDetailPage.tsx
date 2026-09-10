import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { HostAvatar } from '../components/DropInCard'
import { ReportDialog } from '../components/ReportDialog'
import { useSessionContext } from '../components/SessionProvider'
import { LOGIN_PATH } from '../lib/auth'
import {
  addComment,
  deleteComment,
  getBlockState,
  getGoingCount,
  getPlaydateDetail,
  getPublicPlaydateDetail,
  getShareUrl,
  hasPinged,
  hideComment,
  listComments,
  togglePing,
} from '../lib/db'
import { isHiddenPost, toDuplicatePrefill } from '../lib/feed'
import { canModerate } from '../lib/moderation'
import {
  COMMENT_MAX_LENGTH,
  PLAYDATE_PING_INTENT_KEY,
  PLAYDATE_RETURN_KEY,
  planCommentAction,
  validateCommentBody,
} from '../lib/trust'
import type { CommentWithAuthor, PlaydateWithNeighborhood, PublicPlaydateDetail } from '../lib/types'

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'not-found' }
  | { status: 'hidden' }
  | { status: 'blocked'; handle: string }
  | {
      status: 'ready'
      detail: PlaydateWithNeighborhood
      count: number | null
      going: boolean
      /** The comment thread (null = not loaded — 0013 not applied, section hidden). */
      comments: CommentWithAuthor[] | null
    }
  /**
   * V2 slice 5: the signed-out public surface (the get_public_playdate RPC
   * payload — nothing beyond the pinned public fields). Rendered when the
   * page loads without a session.
   */
  | { status: 'public'; detail: PublicPlaydateDetail }

/**
 * /playdate/:id — a drop-in's full details (slice 4): title, place,
 * neighborhood, human-readable start/end times, age hint, details, and the
 * host's handle linking to /u/:handle. The "We're going" ping toggle
 * (counts shown only, never a per-person attendee list) plus a report entry.
 *
 * V2 slice 1: the post's own host sees an explicit "This is your post" panel
 * with the going count and a Duplicate action (navigates to /new with
 * router-state prefill of everything except the date/time — which is always
 * re-entered) — never the ping button. Everyone else sees the unchanged
 * "We're going" toggle + count.
 *
 * The detail fetch is a direct lookup — the feed query's DB-level block
 * filter (slice 3) cannot cover this path — so a blocked host's post is
 * checked after the fetch and renders a hidden state, never the content.
 * The same post-fetch discipline covers the slice-5 moderator hide
 * (hidden_at set → the removed state, never the content).
 *
 * V2 slice 4 (ticket 04): a flat chronological comment thread under the
 * post — any signed-in parent comments (<= 500 chars, empty rejected
 * client-side), the author or the event's host deletes (the pure
 * planCommentAction decides the buttons), moderators get a per-comment
 * Hide (the soft-hide via hidden_at; no /mod comment list in V2 scope —
 * hiding happens here, on the detail page). The comments table (0013)
 * may not be applied yet: a failed thread load hides the section instead
 * of crashing the page (the same discipline as the ping section above).
 *
 * The going_pings table (migration 0007) may not exist in the live project
 * until the orchestrator applies it — a failed count/ping load hides the
 * ping section instead of crashing the page (same discipline as slices 2–3).
 *
 * V2 slice 5 (ticket 05): signed-out visitors open this route and see the
 * public surface ONLY (the get_public_playdate RPC, migration 0015 — post
 * fields + neighborhood label + host handle/avatar + going count; comments
 * stay auth-walled, /u/:handle is not linked, every action surface shows
 * the sign-up prompt). "I'm coming" stores the return target + a ping
 * intent in session storage and hops to /login; the app shell applies the
 * return once the onboarding gate settles, and the ping is an explicit
 * highlighted tap after the return (the zero-pressure soul — no silent
 * auto-ping). The Share button (Web Share API + copy-link fallback) builds
 * its URL from VITE_PUBLIC_BASE_URL, falling back to the window origin
 * before deployment.
 */
export function PlaydateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session, loading: sessionLoading, profile } = useSessionContext()
  const [state, setState] = useState<DetailState>({ status: 'loading' })
  const [reporting, setReporting] = useState(false)
  const [pingBusy, setPingBusy] = useState(false)
  const [pingError, setPingError] = useState<string | null>(null)
  // V2 slice 4: the comment composer (empty rejected client-side; the
  // pure validateCommentBody is the second check in handleAddComment).
  const [commentDraft, setCommentDraft] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  // V2 slice 5: the share button (Web Share API where supported, the
  // copy-link fallback otherwise) + its "Copied" confirmation.
  const [shareBusy, setShareBusy] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  // V2 slice 5 (the zero-pressure soul): true when the visitor returned
  // from the /login hop intending to ping THIS post (the stored ping-intent
  // flag) — the ping button highlights as "Tap to confirm you're coming";
  // the ping itself is always an explicit tap, never a silent auto-ping.
  const [pingIntent, setPingIntent] = useState(false)

  useEffect(() => {
    if (id === undefined || id === '') return
    if (sessionLoading) return
    let cancelled = false
    setState({ status: 'loading' })
    if (session === null) {
      // V2 slice 5: the signed-out public surface — the SECURITY DEFINER
      // RPC (0015). A missing OR hidden post settles not-found (the
      // function returns NULL for both — a hidden post's existence is not
      // confirmed to a signed-out visitor). Pre-0015-apply the RPC errors
      // (the function does not exist yet) — the error state, same
      // DB-not-applied discipline as slices 2–4.
      ;(async () => {
        try {
          const pub = await getPublicPlaydateDetail(id)
          if (cancelled) return
          setState(pub === null ? { status: 'not-found' } : { status: 'public', detail: pub })
        } catch (err) {
          if (cancelled) return
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Could not load this drop-in.',
          })
        }
      })()
    } else {
      ;(async () => {
        try {
          const detail = await getPlaydateDetail(id)
          if (cancelled) return
          if (detail === null) {
            setState({ status: 'not-found' })
            return
          }
          // Slice 5: a moderator-hidden post (hidden_at set) renders the
          // hidden state, never the content — the client-side check is the
          // detail-path equivalent of the feed's DB-level .is('hidden_at',
          // null) filter (same discipline as the slice-4 block check above).
          if (isHiddenPost(detail)) {
            setState({ status: 'hidden' })
            return
          }
          if (await getBlockState(detail.host.id)) {
            setState({ status: 'blocked', handle: detail.host.display_name })
            return
          }
          // The ping + comments tables may not be applied yet (0007 / 0013):
          // a failed load just hides that section, never the post itself.
          const [count, going, comments] = await Promise.all([
            getGoingCount(id).catch(() => null),
            hasPinged(id).catch(() => false),
            listComments(id).catch(() => null),
          ])
          if (cancelled) return
          setState({ status: 'ready', detail, count, going, comments })
        } catch (err) {
          if (cancelled) return
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Could not load this drop-in.',
          })
        }
      })()
    }
    return () => {
      cancelled = true
    }
  }, [id, session, sessionLoading])

  // V2 slice 5: the ping-intent flag (the stored "I'm coming" target from
  // the signed-out view). It highlights the ping button for THIS post only;
  // handlePingToggle clears it (the explicit tap happened).
  useEffect(() => {
    if (id === undefined || id === '') return
    setPingIntent(window.sessionStorage.getItem(PLAYDATE_PING_INTENT_KEY) === id)
  }, [id])

  async function handlePingToggle() {
    if (state.status !== 'ready' || pingBusy) return
    const detail = state.detail
    // V2 slice 5: the explicit tap happened — clear the stored ping intent
    // (the "Tap to confirm" highlight was its whole job).
    window.sessionStorage.removeItem(PLAYDATE_PING_INTENT_KEY)
    setPingIntent(false)
    setPingBusy(true)
    setPingError(null)
    try {
      const going = await togglePing(detail.id)
      const count = await getGoingCount(detail.id)
      setState({ status: 'ready', detail, count, going, comments: state.comments })
    } catch (err) {
      setPingError(err instanceof Error ? err.message : 'Could not update your ping. Try again.')
    } finally {
      setPingBusy(false)
    }
  }

  /**
   * V2 slice 5 (the zero-pressure soul): the signed-out "I'm coming" tap.
   * Store BOTH the return target (the app shell applies it once the
   * onboarding gate has settled — a new signup goes through zip+radius
   * first) and the ping intent (the button highlights on return), then
   * hop to /login. The ping itself is NEVER issued here — it stays an
   * explicit tap after the return (no silent auto-ping).
   */
  function handleJoinIn() {
    if (state.status !== 'public') return
    const detail = state.detail
    window.sessionStorage.setItem(PLAYDATE_RETURN_KEY, `/playdate/${detail.id}`)
    window.sessionStorage.setItem(PLAYDATE_PING_INTENT_KEY, detail.id)
    navigate(LOGIN_PATH)
  }

  /**
   * V2 slice 5: Share — the Web Share API where supported, otherwise the
   * copy-link fallback (clipboard API + textarea fallback) with the
   * "Copied" confirmation. The URL is the pure buildShareUrl (db.getShareUrl:
   * VITE_PUBLIC_BASE_URL, or the window origin before deployment).
   */
  async function handleShare() {
    if (state.status !== 'ready' && state.status !== 'public') return
    if (shareBusy) return
    const detail = state.detail
    const url = getShareUrl(detail.id)
    setShareBusy(true)
    setShareCopied(false)
    try {
      if (navigator.share !== undefined) {
        try {
          await navigator.share({ title: detail.title, url })
          return
        } catch {
          // The share sheet was dismissed (or the platform rejected) —
          // fall through to the copy fallback.
        }
      }
      if (await copyToClipboard(url)) {
        setShareCopied(true)
        window.setTimeout(() => setShareCopied(false), 2000)
      }
    } finally {
      setShareBusy(false)
    }
  }

  /**
   * Post the composer's draft (V2 slice 4): the empty/over-cap rejection is
   * the pure validateCommentBody (the DB CHECK is the backstop); a success
   * re-fetches the thread for the new row (the insert is a plain chain —
   * the issueReportInsert discipline, so the fresh row's author join comes
   * back with the list).
   */
  async function handleAddComment() {
    if (state.status !== 'ready' || commentBusy) return
    const detail = state.detail
    const bodyError = validateCommentBody(commentDraft)
    if (bodyError !== null) {
      setCommentError(bodyError)
      return
    }
    setCommentBusy(true)
    setCommentError(null)
    try {
      await addComment(detail.id, commentDraft)
      setCommentDraft('')
      const comments = await listComments(detail.id)
      setState({ status: 'ready', detail, count: state.count, going: state.going, comments })
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Could not post your comment. Try again.')
    } finally {
      setCommentBusy(false)
    }
  }

  /** Delete a comment (author or event host — the pure planCommentAction gates the button). */
  async function handleDeleteComment(commentId: string) {
    if (state.status !== 'ready' || commentBusy) return
    const detail = state.detail
    setCommentBusy(true)
    setCommentError(null)
    try {
      await deleteComment(commentId)
      const comments = (state.comments ?? []).filter((c) => c.id !== commentId)
      setState({ status: 'ready', detail, count: state.count, going: state.going, comments })
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Could not delete that comment. Try again.')
    } finally {
      setCommentBusy(false)
    }
  }

  /**
   * Hide a comment (moderator op — the soft-hide via hidden_at, the /mod
   * model). 0014: the widened SELECT policy (hidden_at is null OR
   * moderator) keeps hidden rows readable by moderators, so the row
   * stays in the thread in its muted hidden state (matching a re-fetch)
   * instead of being dropped; non-moderators never see it (RLS).
   */
  async function handleHideComment(commentId: string) {
    if (state.status !== 'ready' || commentBusy) return
    const detail = state.detail
    setCommentBusy(true)
    setCommentError(null)
    try {
      await hideComment(commentId)
      const now = new Date().toISOString()
      const comments = (state.comments ?? []).map((c) =>
        c.id === commentId ? { ...c, hidden_at: now } : c,
      )
      setState({ status: 'ready', detail, count: state.count, going: state.going, comments })
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Could not hide that comment. Try again.')
    } finally {
      setCommentBusy(false)
    }
  }

  // V2 slice 5: signed-out visitors render the public view — the page is
  // Loading only while its own loads are in flight (a stale 'ready' state
  // with the session gone is one beat before the public load re-runs).
  if (
    sessionLoading ||
    state.status === 'loading' ||
    (session === null && state.status === 'ready')
  ) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }

  if (state.status === 'public') {
    return renderPublicView(state.detail)
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-red-600">{state.message}</p>
        <p className="text-xs text-slate-400">
          If you just signed up, the server setup may not be complete yet.
        </p>
        <Link to="/" className="text-sm text-indigo-600">
          Back to today
        </Link>
      </div>
    )
  }

  if (state.status === 'not-found') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">We couldn’t find this drop-in</h1>
        <p className="text-sm text-slate-500">It may have been removed, or the link is a typo.</p>
        <Link to="/" className="text-sm text-indigo-600">
          Back to today
        </Link>
      </div>
    )
  }

  if (state.status === 'hidden') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">This drop-in has been removed</h1>
        <p className="text-sm text-slate-500">
          A moderator hid this post — it no longer shows up in feeds.
        </p>
        <Link to="/" className="text-sm text-indigo-600">
          Back to today
        </Link>
      </div>
    )
  }

  if (state.status === 'blocked') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Hidden</h1>
        <p className="text-sm text-slate-500">
          You blocked @{state.handle} — their drop-ins are hidden from you.
        </p>
        <Link
          to={`/u/${encodeURIComponent(state.handle)}`}
          className="text-sm text-indigo-600"
        >
          View @{state.handle} to unblock
        </Link>
      </div>
    )
  }

  const { detail, count, going } = state
  // Unreachable (the loading gate above renders Loading for a null session
  // with a 'ready' state — 'ready' only ever settles from a signed-in
  // load): an explicit guard so TS narrows session to non-null below.
  if (session === null) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }
  const isHost = session.user.id === detail.host_profile_id
  // The moderator flag off the shared profile (same source the /mod route
  // guard reads): true shows each comment's Hide action (ticket 04).
  const isModerator = canModerate(profile)
  // V2 slice 5 (the zero-pressure soul): the stored ping intent highlights
  // the button as an EXPLICIT confirm — but only while the visitor is not
  // already going (a re-tap would unping, so the label tracks the real
  // state instead). Cleared by handlePingToggle (the tap happened).
  const confirmPing = pingIntent && !going

  /**
   * V2 slice 5: the signed-out public surface — EXACTLY the pinned public
   * fields (title, place, time window, age hint, details, neighborhood
   * label, host handle + avatar, going count). Every action surface shows
   * the sign-up prompt: the ping ("I'm coming" → the /login return path),
   * the auth-walled comment thread (no content, no composer), and reporting
   * (signed-in only — the reports RLS is the wall). The host line is plain
   * text: /u/:handle stays auth-walled, so no link out of here.
   */
  function renderPublicView(d: PublicPlaydateDetail) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{d.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {d.place} · {d.neighborhood_name}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-700">
            {formatDay(d.starts_at)} · {formatTime(d.starts_at)}–{formatTime(d.ends_at)}
          </p>
          {d.age_hint !== null ? (
            <p className="mt-1 text-sm text-slate-500">Best for {d.age_hint}</p>
          ) : null}
          {d.details !== null ? (
            <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{d.details}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <PublicHostAvatar name={d.host_display_name} avatarUrl={d.host_avatar_url} />
              <span>Hosted by @{d.host_display_name}</span>
            </span>
            <button
              type="button"
              onClick={() => void handleShare()}
              disabled={shareBusy}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {shareCopied ? 'Copied' : 'Share'}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
          <button
            type="button"
            onClick={handleJoinIn}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            I’m coming
          </button>
          <p className="mt-2 text-sm font-medium text-indigo-900">Sign up to join in</p>
          <p className="mt-1 text-sm text-indigo-700">{goingCountLine(d.going_count)}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Comments</h2>
          <p className="mt-2 text-sm text-slate-500">
            Comments are for signed-in parents.{' '}
            <Link to={LOGIN_PATH} className="font-medium text-indigo-600">
              Sign up to join in
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{detail.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {detail.place} · {detail.neighborhood.name}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-700">
          {formatDay(detail.starts_at)} · {formatTime(detail.starts_at)}–{formatTime(detail.ends_at)}
        </p>
        {detail.age_hint !== null ? (
          <p className="mt-1 text-sm text-slate-500">Best for {detail.age_hint}</p>
        ) : null}
        {detail.details !== null ? (
          <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{detail.details}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <Link
            to={`/u/${encodeURIComponent(detail.host.display_name)}`}
            className="flex items-center gap-2 text-sm font-medium text-indigo-600"
          >
            <HostAvatar host={detail.host} />
            <span>Hosted by @{detail.host.display_name}</span>
          </Link>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleShare()}
              disabled={shareBusy}
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 disabled:opacity-50"
            >
              {shareCopied ? 'Copied' : 'Share'}
            </button>
            <button
              type="button"
              onClick={() => setReporting(true)}
              className="text-sm text-slate-400 transition-colors hover:text-slate-600"
            >
              Report
            </button>
          </div>
        </div>
      </div>

      {isHost ? (
        // The host sees an explicit "This is your post" panel with the going
        // count and a Duplicate action (V2 slice 1) — no ping button (the
        // host cannot ping their own post: the client guard in
        // db.togglePing, the 0010 DB trigger behind it).
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-indigo-900">This is your post</p>
            <button
              type="button"
              onClick={() =>
                navigate('/new', { state: { duplicate: toDuplicatePrefill(detail) } })
              }
              className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
            >
              Duplicate
            </button>
          </div>
          <p className="mt-1 text-sm text-indigo-700">
            {count !== null ? hostGoingCountLine(count) : 'No pings yet'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <button
            type="button"
            aria-pressed={going}
            disabled={pingBusy || count === null}
            onClick={() => void handlePingToggle()}
            autoFocus={confirmPing}
            className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50${
              confirmPing ? ' ring-2 ring-indigo-400 ring-offset-2' : ''
            }`}
          >
            {pingBusy
              ? 'Updating…'
              : confirmPing
                ? 'Tap to confirm you’re coming'
                : going
                  ? 'You’re going'
                  : 'We’re going'}
          </button>
          {count !== null ? (
            <p className="mt-2 text-sm text-slate-500">{goingCountLine(count)}</p>
          ) : null}
          {pingError !== null ? <p className="mt-2 text-sm text-red-600">{pingError}</p> : null}
        </div>
      )}

      {/* V2 slice 4 (ticket 04): the comment thread — flat, chronological,
        author avatar (the HostAvatar shape) + handle linking to /u/:handle.
        The per-comment buttons come from the pure planCommentAction; the
        section is absent (null) until 0013 is applied — the page never
        crashes on a missing table. */}
      {state.comments !== null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Comments{state.comments.length > 0 ? ` (${state.comments.length})` : ''}
          </h2>
          {state.comments.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No comments yet — ask a question below.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {state.comments.map((comment) => {
                const plan = planCommentAction(comment, {
                  viewerId: session.user.id,
                  hostId: detail.host_profile_id,
                  isModerator,
                })
                // 0014: hidden comments come back to moderators only (the
                // SELECT policy's moderator branch) — render muted +
                // chipped, and never offer Hide on an already-hidden row
                // (no unhide in V2). Non-moderators never receive hidden
                // rows (RLS).
                const isHidden = !plan.canSee
                return (
                  <li key={comment.id} className={`flex gap-3${isHidden ? ' opacity-60' : ''}`}>
                    <HostAvatar host={comment.author} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <Link
                          to={`/u/${encodeURIComponent(comment.author.display_name)}`}
                          className="font-medium text-indigo-600"
                        >
                          @{comment.author.display_name}
                        </Link>
                        {isHidden ? (
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                            Hidden by moderator
                          </span>
                        ) : (
                          <span className="ml-2 text-xs text-slate-400">
                            {formatTime(comment.created_at)}
                          </span>
                        )}
                      </p>
                      <p
                        className={`mt-0.5 whitespace-pre-line text-sm ${isHidden ? 'text-slate-400' : 'text-slate-700'}`}
                      >
                        {comment.body}
                      </p>
                      {plan.canDelete || (plan.canHide && !isHidden) ? (
                        <div className="mt-1 flex gap-3">
                          {plan.canDelete ? (
                            <button
                              type="button"
                              disabled={commentBusy}
                              onClick={() => void handleDeleteComment(comment.id)}
                              className="text-xs text-slate-400 transition-colors hover:text-red-600"
                            >
                              Delete
                            </button>
                          ) : null}
                          {plan.canHide && !isHidden ? (
                            <button
                              type="button"
                              disabled={commentBusy}
                              onClick={() => void handleHideComment(comment.id)}
                              className="text-xs text-slate-400 transition-colors hover:text-red-600"
                            >
                              Hide
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="mt-4 border-t border-slate-100 pt-3">
            <label htmlFor="comment-composer" className="text-xs font-medium text-slate-500">
              Add a comment
            </label>
            <textarea
              id="comment-composer"
              rows={2}
              value={commentDraft}
              maxLength={COMMENT_MAX_LENGTH}
              placeholder="Ask a question — e.g. “Is a stroller okay to bring?”"
              onChange={(e) => setCommentDraft(e.target.value)}
              className="mt-1 w-full resize-none rounded-lg border border-slate-200 p-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">
                {commentDraft.length}/{COMMENT_MAX_LENGTH}
              </span>
              <button
                type="button"
                disabled={commentBusy || commentDraft.trim().length === 0}
                onClick={() => void handleAddComment()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {commentBusy ? 'Posting…' : 'Comment'}
              </button>
            </div>
            {commentError !== null ? (
              <p className="mt-2 text-sm text-red-600">{commentError}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {reporting ? (
        <ReportDialog
          targetLabel="this drop-in"
          playdateId={detail.id}
          profileId={detail.host.id}
          onClose={() => setReporting(false)}
        />
      ) : null}
    </div>
  )
}

/** Local day label, e.g. "Sat, Sep 12" (the device's timezone — V1). */
function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** Human-readable time, e.g. "3 PM" or "3:30 PM". */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** The friendly count line (counts only — no per-person attendee list). */
function goingCountLine(count: number): string {
  if (count === 0) return 'Be the first — we’d love to see you'
  return `${count} ${count === 1 ? 'family' : 'families'} going — come say hi`
}

/** The host's own count line (it's your post — no "come say hi"). */
function hostGoingCountLine(count: number): string {
  if (count === 0) return 'No one has pinged yet'
  return `${count} ${count === 1 ? 'family' : 'families'} going`
}

/**
 * V2 slice 5: the 40px round host avatar for the SIGNED-OUT public view —
 * the HostAvatar shape without the profile row (the public surface carries
 * only the host's display_name + avatar_url; no host.id crosses to anon).
 */
function PublicHostAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return avatarUrl !== null && avatarUrl !== '' ? (
    <img
      src={avatarUrl}
      alt=""
      className="h-10 w-10 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-500"
    >
      {(name.charAt(0) || '?').toUpperCase()}
    </span>
  )
}

/**
 * V2 slice 5: the copy-link fallback (the Share button's fallback path when
 * the Web Share API is absent or the sheet is dismissed): the async
 * clipboard API first, then the classic textarea + execCommand fallback.
 * Returns whether the text actually landed in the clipboard.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Insecure context / permission denied — fall through to the
    // textarea path below.
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(area)
  return ok
}