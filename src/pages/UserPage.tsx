import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { HostAvatar } from '../components/DropInCard'
import { ReportDialog } from '../components/ReportDialog'
import { useSessionContext } from '../components/SessionProvider'
import { getBlockState, getProfileByHandle, toggleBlock } from '../lib/db'
import type { ProfileWithKids } from '../lib/types'

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
 */
export function UserPage() {
  const { handle } = useParams<{ handle: string }>()
  const { session } = useSessionContext()
  const [state, setState] = useState<UserPageState>({ status: 'loading' })
  const [blocked, setBlocked] = useState(false)
  const [blockingBusy, setBlockingBusy] = useState(false)
  const [blockError, setBlockError] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)

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
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-red-600">{state.message}</p>
        <Link to="/" className="text-sm text-indigo-600">
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
        <p className="text-sm text-slate-500">
          The handle may be a typo, or this family may not be on Playdate yet.
        </p>
        <Link to="/" className="text-sm text-indigo-600">
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

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <HostAvatar host={profile} />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900">@{profile.display_name}</h1>
            <p className="mt-1 text-sm text-slate-500">Here since {joined}.</p>
          </div>
        </div>
        {profile.bio != null && profile.bio.trim() !== '' ? (
          <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{profile.bio}</p>
        ) : null}
      </div>

      {/* V2 ticket 02: the kids list — first name + age ONLY (privacy pin:
          no full names, no gender, anywhere in the schema or the UI). */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Kids</h2>
        {profile.kids.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">No kids listed.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {profile.kids.map((kid) => (
              <li key={kid.id} className="text-sm text-slate-800">
                {kid.first_name} · {kid.age}
              </li>
            ))}
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
                'rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50 ' +
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
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-500"
            >
              Report
            </button>
          </div>
          {blockError !== null ? <p className="text-sm text-red-600">{blockError}</p> : null}
          {blocked ? (
            <p className="text-xs text-slate-400">
              Their drop-ins are hidden from your feed and detail pages.
            </p>
          ) : null}
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold text-slate-900">Posts</h2>
        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-500">No posts yet.</p>
        </div>
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