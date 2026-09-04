import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { DropInCard } from '../components/DropInCard'
import { useSessionContext } from '../components/SessionProvider'
import { listMemberships, listNeighborhoods, listUpcomingByNeighborhood } from '../lib/db'
import { startOfTodayIso } from '../lib/feed'
import type { Neighborhood, PlaydateWithNeighborhood } from '../lib/types'

/**
 * /browse — upcoming drop-ins across all neighborhoods (slice 3), filtered
 * by neighborhood chips (multi-select; the default selection is the
 * user's own memberships) and grouped by local calendar day (Today /
 * Tomorrow / date label). A failed query renders a designed error state,
 * never a crash (the playdates table may not exist until the human applies
 * migration 0005 via the dashboard).
 */
export function BrowsePage() {
  const { session, loading } = useSessionContext()
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[] | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [posts, setPosts] = useState<PlaydateWithNeighborhood[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [postsError, setPostsError] = useState<string | null>(null)

  // Load the chip list + the default selection (the user's memberships).
  useEffect(() => {
    if (loading || session === null) return
    let cancelled = false
    setNeighborhoods(null)
    setLoadError(null)
    Promise.all([listNeighborhoods(), listMemberships(session.user.id)])
      .then(([rows, memberships]) => {
        if (cancelled) return
        setNeighborhoods(rows)
        setSelected(new Set(memberships.map((m) => m.neighborhood_id)))
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load neighborhoods.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [loading, session])

  // Fetch upcoming drop-ins whenever the selection changes (once the chip
  // list has loaded — the first run covers the default selection).
  useEffect(() => {
    if (neighborhoods === null || loading || session === null) return
    let cancelled = false
    setPosts(null)
    setPostsError(null)
    const ids = [...selected]
    const fetch =
      ids.length === 0
        ? Promise.resolve([])
        : listUpcomingByNeighborhood(ids, startOfTodayIso())
    fetch
      .then((rows) => {
        if (!cancelled) setPosts(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPostsError(err instanceof Error ? err.message : 'Could not load upcoming drop-ins.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [neighborhoods, selected, loading, session])

  function toggleNeighborhood(neighborhoodId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(neighborhoodId)) next.delete(neighborhoodId)
      else next.add(neighborhoodId)
      return next
    })
  }

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
          Upcoming drop-ins — pick the neighborhoods you’re curious about.
        </p>
      </div>

      {neighborhoods === null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Loading…
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {neighborhoods.map((n) => {
            const isSelected = selected.has(n.id)
            return (
              <button
                key={n.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggleNeighborhood(n.id)}
                className={
                  'rounded-full border px-3 py-1 text-sm transition-colors ' +
                  (isSelected
                    ? 'border-indigo-600 bg-indigo-50 font-medium text-indigo-700'
                    : 'border-slate-300 bg-white text-slate-700')
                }
              >
                {n.name}
              </button>
            )
          })}
        </div>
      )}

      {postsError !== null ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-red-600">{postsError}</p>
          <p className="text-xs text-slate-400">
            If you just signed up, the drop-in feed may not be set up on the server yet.
          </p>
        </div>
      ) : selected.size === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Pick at least one neighborhood to browse.
        </div>
      ) : posts === null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Loading…
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-500">
            Nothing upcoming in the selected neighborhoods — post the first one.
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

interface DayGroup {
  key: string
  label: string
  posts: PlaydateWithNeighborhood[]
}

/** Local-calendar-day key (YYYY-MM-DD in the device's timezone). */
function localDayKey(iso: string): string {
  const d = new Date(iso)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/**
 * Group starts_at-ascending posts by local calendar day; labels are
 * "Today" / "Tomorrow" / a locale date. Posts are pre-sorted, so equal
 * days are contiguous.
 */
function groupByDay(
  posts: PlaydateWithNeighborhood[],
  nowIso: string,
): DayGroup[] {
  const todayKey = localDayKey(nowIso)
  const tomorrow = new Date(nowIso)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowKey = localDayKey(tomorrow.toISOString())
  const groups: DayGroup[] = []
  for (const post of posts) {
    const key = localDayKey(post.starts_at)
    const label =
      key === todayKey
        ? 'Today'
        : key === tomorrowKey
          ? 'Tomorrow'
          : new Date(post.starts_at).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })
    const last = groups[groups.length - 1]
    if (last !== undefined && last.key === key) last.posts.push(post)
    else groups.push({ key, label, posts: [post] })
  }
  return groups
}