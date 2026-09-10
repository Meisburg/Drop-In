import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { DropInCard } from '../components/DropInCard'
import { useSessionContext } from '../components/SessionProvider'
import { listRadiusFeed } from '../lib/db'
import { DEFAULT_RADIUS_MILES, groupByDay } from '../lib/feed'
import type { PlaydateWithNeighborhood } from '../lib/types'

/**
 * /browse — upcoming drop-ins within the signed-in user's home zip +
 * radius (V2 slice 3: the neighborhood chips left the filter path —
 * neighborhoods are display labels on the cards, memberships stay in the
 * schema but no longer filter), grouped by local calendar day (Today /
 * Tomorrow / "Sat, Sep 12" — the pure feed.groupByDay + feed.formatDayLabel
 * seam, unit-tested in feed.test.ts; V3 slice 1 promoted it out of this
 * page so the feed and browse share the single implementation). Each card
 * carries its "N mi" distance (the pure haversine predicate, unit-tested
 * in feed.ts).
 *
 * A failed query renders a designed error state, never a crash (the
 * zip_codes table + location columns land in migration 0012).
 */
export function BrowsePage() {
  const { session, loading, profile } = useSessionContext()
  const [posts, setPosts] = useState<PlaydateWithNeighborhood[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // One radius fetch (the shell's gate guarantees a settled signed-in
  // session has a home zip; a null profile is the in-flight load state).
  useEffect(() => {
    if (loading || session === null || profile === null) return
    let cancelled = false
    setPosts(null)
    setLoadError(null)
    const viewer = {
      homeZip: profile.home_zip ?? null,
      radiusMiles: profile.radius_miles ?? DEFAULT_RADIUS_MILES,
    }
    listRadiusFeed(viewer, session.user.id)
      .then((rows) => {
        if (!cancelled) setPosts(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load upcoming drop-ins.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [loading, session, profile])

  if (loading || profile === null) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }

  if (loadError !== null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Browse</h1>
        <p className="text-sm text-red-600">{loadError}</p>
        <p className="text-xs text-slate-400">
          If you just signed up, the drop-in feed may not be set up on the server yet.
        </p>
      </div>
    )
  }

  const nowIso = new Date().toISOString()
  const dayGroups = posts === null ? [] : groupByDay(posts, nowIso)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Browse</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upcoming drop-ins within your radius — change it in your profile.
        </p>
      </div>

      {posts === null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Loading…
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-500">
            Nothing upcoming within your radius — post the first one.
          </p>
          <Link
            to="/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
          >
            Post a drop-in
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {dayGroups.map((group) => (
            <section key={group.key} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {group.label}
              </h2>
              <div className="flex flex-col gap-3">
                {group.posts.map((post) => (
                  <DropInCard key={post.id} playdate={post} nowIso={nowIso} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}