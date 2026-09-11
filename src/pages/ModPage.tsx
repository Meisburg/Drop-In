import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useSessionContext } from '../components/SessionProvider'
import { banProfile, hidePlaydate, listReports, type ModReport } from '../lib/db'
import { canModerate } from '../lib/moderation'

/**
 * /mod — moderator tools (slice 5): the report list (reason, reporter /
 * reported handles, the reported post, timestamp) with per-item actions —
 * hide a post (playdates.hidden_at) and ban a profile (profiles.banned_at).
 * Both are final in V1 (no unhide/unban UI, V1-minimum).
 *
 * Access: the shell's route guard (App.tsx) redirects non-moderators off
 * this page (the pure canModerate guard, unit-tested) and the reports RLS
 * (migration 0008) is the second wall — a non-moderator's listReports
 * returns 0 rows. Designed 375px-first (the app shell's max-w-md column).
 */
export function ModPage() {
  const { session, loading, profile } = useSessionContext()

  const [reports, setReports] = useState<ModReport[] | null>(null)
  const [reportsError, setReportsError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [hiddenPostIds, setHiddenPostIds] = useState<ReadonlySet<string>>(new Set())
  const [bannedProfileIds, setBannedProfileIds] = useState<ReadonlySet<string>>(new Set())
  const [confirmBanProfileId, setConfirmBanProfileId] = useState<string | null>(null)

  // Load the report list once access is established (a moderator profile +
  // a live session). Re-runs when the profile refreshes (e.g. after the
  // shared session state re-fetches).
  useEffect(() => {
    if (loading || session === null || profile === null || !canModerate(profile)) return
    let cancelled = false
    setReports(null)
    setReportsError(null)
    listReports()
      .then((rows) => {
        if (!cancelled) setReports(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setReportsError(err instanceof Error ? err.message : 'Could not load reports.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [loading, session, profile])

  async function handleHide(item: ModReport) {
    const playdateId = item.report.playdate_id
    if (playdateId === null || busyKey !== null) return
    setBusyKey(`hide:${playdateId}`)
    setActionError(null)
    try {
      await hidePlaydate(playdateId)
      setHiddenPostIds((prev) => new Set([...prev, playdateId]))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not hide the post. Try again.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleBan(item: ModReport) {
    const profileId = item.report.reported_profile_id
    if (profileId === null || busyKey !== null) return
    setBusyKey(`ban:${profileId}`)
    setActionError(null)
    try {
      await banProfile(profileId)
      setBannedProfileIds((prev) => new Set([...prev, profileId]))
      setConfirmBanProfileId(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not ban the profile. Try again.')
    } finally {
      setBusyKey(null)
    }
  }

  // The shell redirects non-moderators, and a null profile (the DB not
  // applied yet / a failed fetch) keeps the access check pending — both
  // render a designed state, never a crash.
  if (loading || profile === null) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }

  if (!canModerate(profile)) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Moderator tools</h1>
        <p className="text-sm text-slate-500">
          Moderator tools are only available to moderator-flagged accounts.
        </p>
        <Link to="/" className="text-sm text-indigo-600">
          Back to today
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Moderator tools</h1>
        <p className="mt-1 text-sm text-slate-500">
          Reports, newest first. Hiding a post and banning a profile are
          final in V1 — there is no unhide or unban yet.
        </p>
      </div>

      {reportsError !== null ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-red-600">{reportsError}</p>
          <p className="text-xs text-slate-400">
            If you just set up the server, the moderation tables may not be applied yet.
          </p>
        </div>
      ) : reports === null ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
          Loading reports…
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-500">No reports — clean town.</p>
          <p className="text-xs text-slate-400">New reports from the app will show up here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((item) => (
            <ReportCard
              key={item.report.id}
              item={item}
              busyKey={busyKey}
              actionError={actionError}
              hidden={
                item.report.playdate_id !== null && hiddenPostIds.has(item.report.playdate_id)
              }
              banned={
                item.report.reported_profile_id !== null &&
                bannedProfileIds.has(item.report.reported_profile_id)
              }
              confirmingBan={
                item.report.reported_profile_id !== null &&
                confirmBanProfileId === item.report.reported_profile_id
              }
              onHide={() => void handleHide(item)}
              onBan={() => void handleBan(item)}
              onConfirm={() => {
                if (item.report.reported_profile_id !== null) {
                  setConfirmBanProfileId(item.report.reported_profile_id)
                }
              }}
              onCancelConfirm={() => setConfirmBanProfileId(null)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * One report in the mod list (375px-first: every line wraps, the action
 * row uses flex-wrap so Hide + Ban never force horizontal scroll).
 */
function ReportCard({
  item,
  busyKey,
  actionError,
  hidden,
  banned,
  confirmingBan,
  onHide,
  onBan,
  onConfirm,
  onCancelConfirm,
}: {
  item: ModReport
  busyKey: string | null
  actionError: string | null
  hidden: boolean
  banned: boolean
  confirmingBan: boolean
  onHide: () => void
  onBan: () => void
  onConfirm: () => void
  onCancelConfirm: () => void
}) {
  const { report } = item
  const reportedHandle = item.reported !== null ? `@${item.reported}` : 'a post'
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-700">“{report.reason}”</p>
      <p className="text-sm text-slate-500">
        {item.reporter !== null ? `@${item.reporter}` : 'Unknown reporter'} reported{' '}
        {reportedHandle}
      </p>
      {item.postTitle !== null && report.playdate_id !== null ? (
        <Link
          to={`/playdate/${report.playdate_id}`}
          className="break-words text-sm font-medium text-indigo-600"
        >
          Post: “{item.postTitle}”
        </Link>
      ) : null}
      <p className="text-xs text-slate-400">
        {new Date(report.created_at).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {report.playdate_id !== null ? (
          hidden ? (
            <span className="text-sm font-medium text-emerald-700">Hidden ✓</span>
          ) : (
            <button
              type="button"
              disabled={busyKey !== null}
              onClick={onHide}
              className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              {busyKey === `hide:${report.playdate_id}` ? 'Hiding…' : 'Hide post'}
            </button>
          )
        ) : null}

        {report.reported_profile_id !== null ? (
          banned ? (
            <span className="text-sm font-medium text-emerald-700">Banned ✓</span>
          ) : confirmingBan ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">
                Ban {reportedHandle}? Final — no unban in V1.
              </span>
              <button
                type="button"
                disabled={busyKey !== null}
                onClick={onBan}
                className="rounded-lg bg-red-600 px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {busyKey === `ban:${report.reported_profile_id}` ? 'Banning…' : 'Ban'}
              </button>
              <button
                type="button"
                onClick={onCancelConfirm}
                className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-slate-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busyKey !== null}
              onClick={onConfirm}
              className="rounded-lg border border-red-200 bg-white px-3 py-3 text-sm font-medium text-red-700 disabled:opacity-50"
            >
              Ban {reportedHandle}
            </button>
          )
        ) : null}
      </div>
      {actionError !== null ? <p className="text-sm text-red-600">{actionError}</p> : null}
    </div>
  )
}