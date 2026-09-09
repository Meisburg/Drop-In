import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { HostAvatar } from '../components/DropInCard'
import { ReportDialog } from '../components/ReportDialog'
import { useSessionContext } from '../components/SessionProvider'
import {
  getBlockState,
  getGoingCount,
  getPlaydateDetail,
  hasPinged,
  togglePing,
} from '../lib/db'
import { isHiddenPost, toDuplicatePrefill } from '../lib/feed'
import type { PlaydateWithNeighborhood } from '../lib/types'

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'not-found' }
  | { status: 'hidden' }
  | { status: 'blocked'; handle: string }
  | { status: 'ready'; detail: PlaydateWithNeighborhood; count: number | null; going: boolean }

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
 * The going_pings table (migration 0007) may not exist in the live project
 * until the orchestrator applies it — a failed count/ping load hides the
 * ping section instead of crashing the page (same discipline as slices 2–3).
 */
export function PlaydateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session, loading: sessionLoading } = useSessionContext()
  const [state, setState] = useState<DetailState>({ status: 'loading' })
  const [reporting, setReporting] = useState(false)
  const [pingBusy, setPingBusy] = useState(false)
  const [pingError, setPingError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionLoading || session === null || id === undefined || id === '') return
    let cancelled = false
    setState({ status: 'loading' })
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
        // The ping table may not be applied yet: a failed count/ping-state
        // load just hides the ping section, it never hides the post itself.
        const [count, going] = await Promise.all([
          getGoingCount(id).catch(() => null),
          hasPinged(id).catch(() => false),
        ])
        if (cancelled) return
        setState({ status: 'ready', detail, count, going })
      } catch (err) {
        if (cancelled) return
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Could not load this drop-in.',
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, session, sessionLoading])

  async function handlePingToggle() {
    if (state.status !== 'ready' || pingBusy) return
    const detail = state.detail
    setPingBusy(true)
    setPingError(null)
    try {
      const going = await togglePing(detail.id)
      const count = await getGoingCount(detail.id)
      setState({ status: 'ready', detail, count, going })
    } catch (err) {
      setPingError(err instanceof Error ? err.message : 'Could not update your ping. Try again.')
    } finally {
      setPingBusy(false)
    }
  }

  if (sessionLoading || session === null || state.status === 'loading') {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
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
  const isHost = session.user.id === detail.host_profile_id

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
          <button
            type="button"
            onClick={() => setReporting(true)}
            className="text-sm text-slate-400 transition-colors hover:text-slate-600"
          >
            Report
          </button>
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
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pingBusy ? 'Updating…' : going ? 'You’re going' : 'We’re going'}
          </button>
          {count !== null ? (
            <p className="mt-2 text-sm text-slate-500">{goingCountLine(count)}</p>
          ) : null}
          {pingError !== null ? <p className="mt-2 text-sm text-red-600">{pingError}</p> : null}
        </div>
      )}

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