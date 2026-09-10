import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { DropInCard } from '../components/DropInCard'
import { useSessionContext } from '../components/SessionProvider'
import { listRadiusFeed } from '../lib/db'
import { DEFAULT_RADIUS_MILES, groupByDay, isEnded, isStartingSoon, localDayKey } from '../lib/feed'
import type { PlaydateWithNeighborhood } from '../lib/types'

/**
 * / — drop-ins within the signed-in user's home zip + radius (V2 slice 3:
 * discovery is distance-based; neighborhoods are display labels only). The
 * feed query (db.listRadiusFeed) fetches upcoming posts with the host's
 * home zip pinned in the embed (PGRST201), applies the pure haversine
 * radius filter (feed.filterFeed — unit-tested), and tags each survivor
 * with its "N mi" distance for the card label.
 *
 * V3 slice 1 (ticket 01): the flat list is rendered in day sections
 * (feed.groupByDay, ascending start-of-day order) with section headers from
 * feed.formatDayLabel ("Today" / "Tomorrow" / "Sat, Sep 12"). Within the
 * Today section, upcoming events (non-ended, starts_at ascending) come
 * first and ended events are demoted behind them, grayed on the card; the
 * single soonest upcoming event gets a "Starts soon" badge when it starts
 * within 60 min (feed.isStartingSoon). The section headers are styled
 * paragraphs, NOT heading elements: the page title (<h1>Today</h1>) stays
 * the single "Today" heading the e2e specs pin on.
 *
 * The zip_codes + location columns live in migration 0012 (the live
 * project may not have them yet) — a failed load renders a designed error
 * state, never a crash (same discipline as the onboarding load-error).
 */
export function FeedPage() {
  const { session, loading, profile } = useSessionContext()
  const [posts, setPosts] = useState<PlaydateWithNeighborhood[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // The viewer side of the radius filter: the profile's home zip + radius.
  // The shell's onboarding gate keys on home_zip, so a settled signed-in
  // session here has a zip; a null profile is the in-flight load state
  // (ticket 06 cold-load race — never query before the profile settles).
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
          setLoadError(err instanceof Error ? err.message : 'Could not load drop-ins near you.')
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
        <h1 className="text-xl font-semibold text-slate-900">Today</h1>
        <p className="text-sm text-red-600">{loadError}</p>
        <p className="text-xs text-slate-400">
          If you just signed up, the drop-in feed may not be set up on the server yet.
        </p>
      </div>
    )
  }

  const nowIso = new Date().toISOString()
  // V3 slice 1: day sections (feed.groupByDay, ascending start-of-day
  // order). Only the Today section splits its posts: upcoming (non-ended,
  // still starts_at-ascending) first, then ended demoted behind them (the
  // card carries the grayed styling). The "Starts soon" badge goes on the
  // single soonest upcoming event of the Today section — and only when it
  // has not started yet and starts within 60 min (an already-started
  // soonest gets the card's "Happening now" badge instead).
  const dayGroups = posts === null ? [] : groupByDay(posts, nowIso)
  const todayKey = localDayKey(nowIso)

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
            Nothing happening near you today — post the first one.
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
          {dayGroups.map((group) => {
            const isToday = group.key === todayKey
            const upcoming = isToday ? group.posts.filter((p) => !isEnded(p, nowIso)) : group.posts
            const ended = isToday ? group.posts.filter((p) => isEnded(p, nowIso)) : []
            const soonest = upcoming[0]
            const startsSoonId =
              isToday && soonest !== undefined && isStartingSoon(soonest, nowIso)
                ? soonest.id
                : null
            return (
              <section key={group.key} className="flex flex-col gap-2">
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {group.label}
                </p>
                <div className="flex flex-col gap-3">
                  {upcoming.map((post) => (
                    <DropInCard
                      key={post.id}
                      playdate={post}
                      nowIso={nowIso}
                      startsSoon={post.id === startsSoonId}
                    />
                  ))}
                  {ended.map((post) => (
                    <DropInCard key={post.id} playdate={post} nowIso={nowIso} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}