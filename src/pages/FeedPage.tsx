import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { DropInCard } from '../components/DropInCard'
import { useSessionContext } from '../components/SessionProvider'
import { listTodayFeed } from '../lib/db'
import type { PlaydateWithNeighborhood } from '../lib/types'

/**
 * / — today's drop-ins in the signed-in user's neighborhoods (slice 3).
 * Time-ordered, with a "Happening now" badge on live drop-ins. The feed
 * query (db.listTodayFeed) filters to followed neighborhoods, starts today
 * or later (client-local midnight), and never returns blocked hosts' posts.
 *
 * The playdates table (migration 0005) may not exist in the live project
 * until the human applies it via the dashboard — a failed query renders a
 * designed error state, never a crash (same discipline as the onboarding
 * load-error).
 */
export function FeedPage() {
  const { session, loading } = useSessionContext()
  const [posts, setPosts] = useState<PlaydateWithNeighborhood[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (loading || session === null) return
    let cancelled = false
    setPosts(null)
    setLoadError(null)
    listTodayFeed(session.user.id)
      .then((rows) => {
        if (!cancelled) setPosts(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load today’s drop-ins.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [loading, session])

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }

  if (loadError !== null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Today</h1>
        <p className="text-sm text-red-600">{loadError}</p>
        <p className="text-xs text-slate-400">
          If you just signed up, the drop-in feed may not be set up on the server yet.
        </p>
      </div>
    )
  }

  const nowIso = new Date().toISOString()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Today</h1>

      {posts === null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Loading…
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-500">
            Nothing happening in your neighborhoods today — post the first one.
          </p>
          <Link
            to="/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
          >
            Post a drop-in
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post) => (
            <DropInCard key={post.id} playdate={post} nowIso={nowIso} />
          ))}
        </div>
      )}
    </div>
  )
}