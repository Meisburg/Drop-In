import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { DropInCard } from '../components/DropInCard'
import { useSessionContext } from '../components/SessionProvider'
import {
  countPingsOnMyPosts,
  fetchRainProbabilityForZip,
  listMyPingPostIds,
  countKidsGoingForPosts,
  listPingsForPosts,
  listRadiusFeed,
  restampLastSeen,
  togglePing,
  type PingForPost,
} from '../lib/db'
import {
  DEFAULT_RADIUS_MILES,
  dueToRefreshLastSeen,
  groupByDay,
  isEnded,
  isStartingSoon,
  localDayKey,
  rainBadgeLabel,
} from '../lib/feed'
import type { PlaydateWithNeighborhood } from '../lib/types'

/**
 * The retention cursor's restamp window (V3 slice 9, ticket 04): the
 * ticket's 1h pin — the call-site owner of the throttle window (the
 * pure dueToRefreshLastSeen decides; the e2e + unit tests pin the
 * behavior).
 */
const LAST_SEEN_WINDOW_MS = 60 * 60_000

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
 * paragraphs, NOT heading elements: the page title stays the single
 * heading the e2e specs pin on.
 *
 * V3 slice 3 (ticket 06): the page h1 is "Near you" (feedback #3 — the
 * old "Today" title was redundant with the first section header; the
 * feed is radius-based, the day lives in the section headers). The
 * cards' "going" check toggles get their state from ONE query (the
 * viewer's own going_pings, fetched when the session settles — the
 * optimistic toggle + revert on error, the detail page's behavior); the
 * host's own posts render no toggle (the detail's host panel covers it),
 * and the signed-out public view never renders a DropInCard (the
 * sign-up prompt stands in).
 *
 * V3 slice 2 (ticket 02): the Today-section cards get a best-effort
 * "Rain likely" badge (the rainLabel prop — the Open-Meteo daily
 * probability for the post's HOST zip on the event date, the pure
 * rainBadgeLabel threshold; the wrapper's per-(zip,date) cache +
 * in-flight dedupe keeps it one fetch per distinct pair, silently absent
 * on error). Other day sections (and BrowsePage) pass nothing new.
 *
 * V3 slice 4 (ticket 07): the cards' going lines (feedback #1 — "it'd be
 * cool to see their little circles"): one query for every visible post
 * (db.listPingsForPosts: the going_pings rows + the pinger profiles
 * embed, the FK hint pinned, ordered by the 0020 created_at); the rows
 * are grouped by post and each card renders its group via the pure
 * buildGoingLine ("N going" + up to 3 circles + a "+N" chip), replacing
 * the old age-hint line. The host's own posts keep the line (the host
 * sees who's coming); the signed-out public view never renders a
 * DropInCard, so no circles cross to it (the 0015 going-count pin stays
 * count-only there). A failed pings load (pre-0020-apply: the created_at
 * column is missing → 42703) degrades to no going lines, never a crash.
 *
 * V3 slice 9 (ticket 04): the host retention banner — "N new families
 * pinged your drop-ins" below the "Near you" h1 (db.countPingsOnMyPosts:
 * pings on the host's OWN posts created after the retention cursor,
 * profiles.last_seen_at, migration 0024; the 0020 created_at is the
 * key). The cursor is restamped on mount when null or >= 1h stale (the
 * pure dueToRefreshLastSeen throttle + db.restampLastSeen
 * fire-and-forget — pre-0024-apply the restamp 42703s and is
 * swallowed: the cursor never lands, the banner stays hidden, never a
 * crash). Banner tap: restamp + session refresh + navigate to /profile
 * (the fresh cursor lands in the shared session state, so the SPA back
 * navigation sees it).
 *
 * The zip_codes + location columns live in migration 0012 (the live
 * project may not have them yet) — a failed load renders a designed error
 * state, never a crash (same discipline as the onboarding load-error).
 */
export function FeedPage() {
  const { session, loading, profile, refresh } = useSessionContext()
  const navigate = useNavigate()
  const [posts, setPosts] = useState<PlaydateWithNeighborhood[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // V3 slice 2 (ticket 02): the Today-section cards' "Rain likely" labels
  // (post id → label; null = no badge). Best-effort — the wrapper never
  // rejects, so a failed fetch just leaves the label null (silently
  // absent, the zero-pressure soul).
  const [rainLabels, setRainLabels] = useState<Record<string, string | null>>({})
  // V3 slice 3 (ticket 06): the viewer's own "going" pings (one query —
  // every card's toggle state). null = not settled (a failed load
  // degrades to an empty set: the toggles render inactive, never a
  // crash — the zero-pressure soul).
  const [myPingPostIds, setMyPingPostIds] = useState<ReadonlySet<string> | null>(null)
  // One in-flight card toggle per feed (the write path round-trips).
  const [pingBusyPostId, setPingBusyPostId] = useState<string | null>(null)
  // V3 slice 4 (ticket 07): the feed posts' "going" pings (the cards'
  // going lines — "N going" + up to 3 avatar circles + a "+N" chip). The
  // rows are grouped by post id (the card renders its own group via the
  // pure buildGoingLine). null = not settled (the cards show no line
  // yet); a failed load (pre-0020-apply: 42703 on the missing created_at
  // column) degrades to empty groups — no going lines, never a crash
  // (the zero-pressure soul).
  const [pingsByPostId, setPingsByPostId] = useState<Record<string, PingForPost[]> | null>(null)
  // V6: post id -> how many kids are coming (the 0027 batch RPC).
  const [kidsByPostId, setKidsByPostId] = useState<Record<string, number> | null>(null)
  // V3 slice 9 (ticket 04): the host retention banner's count — pings on
  // the host's OWN posts created after the retention cursor (0024's
  // profiles.last_seen_at; the 0020 created_at is the key). null =
  // unsettled (no banner render); a failed load degrades to 0 (the
  // banner stays hidden — zero-pressure soul, no error state).
  const [newPingCount, setNewPingCount] = useState<number | null>(null)

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

  // V3 slice 3 (ticket 06): the viewer's own "going" pings (one query —
  // every card's toggle state). Fetched once when the session settles; a
  // failed load degrades to an empty set (the toggles render inactive,
  // never a crash — the zero-pressure soul). The feed load above runs
  // against the settled session too, so both settle together.
  useEffect(() => {
    if (loading || session === null) return
    let cancelled = false
    setMyPingPostIds(null)
    listMyPingPostIds()
      .then((ids) => {
        if (!cancelled) setMyPingPostIds(ids)
      })
      .catch(() => {
        if (!cancelled) setMyPingPostIds(new Set<string>())
      })
    return () => {
      cancelled = true
    }
  }, [loading, session])

  // V3 slice 4 (ticket 07): the cards' going lines — one query for every
  // visible post (db.listPingsForPosts: the going_pings rows + the
  // pinger profiles embed, the FK hint pinned, the 0020 created_at
  // order). Fetched when the feed settles (re-fetches on a new feed
  // load); the rows are grouped by post id — each card renders its own
  // group. A failed load (pre-0020-apply: 42703 on the missing
  // created_at column) degrades to empty groups (no going lines — the
  // zero-pressure soul), never a crash.
  useEffect(() => {
    if (posts === null) return
    let cancelled = false
    setPingsByPostId(null)
    const postIds = posts.map((post) => post.id)
    // V6 (migration 0027): the kids count per post — ONE batched call for the
    // whole feed, not one per card. Signed-out or pre-0027-apply this fails
    // quietly and every card just omits the kids half of its line.
    countKidsGoingForPosts(postIds)
      .then((counts) => {
        if (!cancelled) setKidsByPostId(counts)
      })
      .catch(() => {
        if (!cancelled) setKidsByPostId({})
      })
    listPingsForPosts(postIds)
      .then((rows) => {
        if (cancelled) return
        const grouped: Record<string, PingForPost[]> = {}
        for (const row of rows) {
          const group = grouped[row.playdateId]
          if (group === undefined) grouped[row.playdateId] = [row]
          else group.push(row)
        }
        setPingsByPostId(grouped)
      })
      .catch(() => {
        if (!cancelled) setPingsByPostId({})
      })
    return () => {
      cancelled = true
    }
  }, [posts])

  // V3 slice 9 (ticket 04): the retention banner's count — pings on the
  // host's OWN posts created after the retention cursor (0024's
  // profiles.last_seen_at; the 0020 created_at is the key). Fetched when
  // the session + profile settle (re-fetches on a fresh profile load —
  // the banner's baseline is the shared session state's cursor). The
  // null-cursor pin: a null/absent cursor (pre-0024-apply) settles to 0
  // (no query — the first visit establishes the baseline via the restamp
  // below). A failed load degrades to 0 (hidden — zero-pressure soul, no
  // error state).
  useEffect(() => {
    if (loading || session === null || profile === null) return
    let cancelled = false
    setNewPingCount(null)
    countPingsOnMyPosts(session.user.id, profile.last_seen_at ?? null)
      .then((count) => {
        if (!cancelled) setNewPingCount(count)
      })
      .catch(() => {
        if (!cancelled) setNewPingCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [loading, session, profile])

  // V3 slice 9 (ticket 04): the mount restamp — fire-and-forget. Restamp
  // the retention cursor when it is null or >= 1h stale (the pure
  // dueToRefreshLastSeen throttle; LAST_SEEN_WINDOW_MS owns the window).
  // Pre-0024-apply the restamp 42703s on the missing column — swallowed
  // (the pinned fire-and-forget contract: the e2e's documented red point,
  // never a crash).
  useEffect(() => {
    if (loading || session === null || profile === null) return
    if (
      !dueToRefreshLastSeen(
        profile.last_seen_at ?? null,
        new Date().toISOString(),
        LAST_SEEN_WINDOW_MS,
      )
    ) return
    void restampLastSeen(session.user.id).catch(() => {
      /* Swallowed (the pinned fire-and-forget contract): pre-0024-apply the missing
         column 42703s; the cursor never lands; the banner stays hidden. */
    })
  }, [loading, session, profile])

  /**
   * V3 slice 3 (ticket 06): the card's "going" check toggle — the
   * existing ping write path (db.togglePing, the upsert→delete
   * round-trip with the host-cannot-ping-own-post guard) with the
   * detail page's behavior: an optimistic flip that reverts on error
   * (the card shows no error line — zero pressure; the detail page
   * keeps its own error surface). One in-flight toggle per feed.
   */
  async function handleCardPingToggle(postId: string) {
    const base = myPingPostIds
    if (base === null || pingBusyPostId !== null) return
    const willBeActive = !base.has(postId)
    setPingBusyPostId(postId)
    setMyPingPostIds(withPingId(base, postId, willBeActive))
    try {
      const going = await togglePing(postId)
      // Reconcile with the write path's authoritative result (a
      // concurrent toggle elsewhere shows as-is, not the optimistic guess).
      setMyPingPostIds((prev) => (prev === null ? prev : withPingId(prev, postId, going)))
    } catch {
      setMyPingPostIds((prev) => (prev === null ? prev : withPingId(prev, postId, !willBeActive)))
    } finally {
      setPingBusyPostId(null)
    }
  }

  // V3 slice 2 (ticket 02): the best-effort "Rain likely" labels for the
  // Today-section cards — one Open-Meteo fetch per distinct (host zip,
  // event date) (the wrapper's module cache + in-flight dedupe; the
  // marker's own post + any co-hosted events share a fetch). A host with
  // no home zip (or a zip outside the 0012 gazetteer) gets no label —
  // never an invented coordinate. Labels merge into the map by post id
  // (a stale id from a previous load is harmless — it renders no card).
  useEffect(() => {
    if (posts === null) return
    let cancelled = false
    const todayKey = localDayKey(new Date().toISOString())
    const todays = posts.filter((post) => localDayKey(post.starts_at) === todayKey)
    if (todays.length === 0) return
    void Promise.all(
      todays.map(async (post) => {
        const zip = post.host?.home_zip
        if (typeof zip !== 'string' || zip === '') return [post.id, null] as const
        const probability = await fetchRainProbabilityForZip(zip, post.starts_at)
        return [post.id, rainBadgeLabel(probability)] as const
      }),
    ).then((entries) => {
      if (cancelled) return
      setRainLabels((prev) => {
        const next: Record<string, string | null> = { ...prev }
        for (const [id, label] of entries) next[id] = label
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [posts])

  if (loading || profile === null) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  if (loadError !== null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Near you</h1>
        <p className="text-sm text-red-600">{loadError}</p>
        <p className="text-xs text-slate-500">
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
  // V3 slice 3 (ticket 06): the viewer id (the signed-in surface — cards
  // only render once the session is settled, so non-null here) for the
  // card toggle's "hide on your own posts" gate.
  const viewerId = session === null ? null : session.user.id

  /**
   * V3 slice 9 (ticket 04): the retention banner tap — restamp the
   * cursor (AWAITED, so the count window's baseline moves to now and
   * the banner is gone on the next feed visit), land the fresh cursor
   * in the shared session state (refresh — so the SPA back navigation
   * sees it), then go to /profile (Your posts). Pre-apply the restamp
   * 42703s → caught → the navigation still happens.
   */
  async function handleRetentionBannerTap() {
    if (session === null) return
    await restampLastSeen(session.user.id).catch(() => {})
    await refresh().catch(() => {})
    navigate('/profile')
  }

  /**
   * V3 slice 3 (ticket 06): one card's "going" check toggle state.
   * Omitted (undefined) while the ping query is unsettled or signed out;
   * the host's own posts get no toggle (the detail's host panel covers
   * it); the busy flag disables the circle while the write round-trips.
   */
  function buildCardPingToggle(post: PlaydateWithNeighborhood) {
    if (myPingPostIds === null || viewerId === null) return undefined
    return {
      enabled: post.host_profile_id !== viewerId,
      active: myPingPostIds.has(post.id),
      busy: pingBusyPostId === post.id,
      onToggle: () => void handleCardPingToggle(post.id),
    }
  }

  /**
   * V3 slice 4 (ticket 07): one card's going line data — the pings
   * grouped for that post (in the 0020 created_at order). An empty array
   * (no pings, or the query unsettled / signed out / failed) renders no
   * line. Unlike the ping toggle, this is NOT hidden on the host's own
   * posts — the host sees who's coming (the ticket pin).
   */
  function buildCardGoingPings(post: PlaydateWithNeighborhood) {
    return pingsByPostId?.[post.id] ?? []
  }

  /** V6: how many kids are coming to this post, 0 when nobody's said. */
  function buildCardKidsCount(post: PlaydateWithNeighborhood) {
    return kidsByPostId?.[post.id] ?? 0
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Near you</h1>

      {/* V3 slice 9 (ticket 04): the host retention banner — the amber
          nudge-banner pattern (ProfilePage's "Finish your profile"),
          full-width + left-aligned. The copy is pinned VERBATIM (no
          singular/plural variant). Hidden when the count is 0 or
          unsettled. */}
      {newPingCount !== null && newPingCount > 0 ? (
        <button
          type="button"
          onClick={() => void handleRetentionBannerTap()}
          className="w-full rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800"
        >
          {newPingCount} new families pinged your drop-ins
        </button>
      ) : null}

      {posts === null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
          Loading…
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-600">
            Nothing happening near you today — post the first one.
          </p>
          <Link
            to="/new"
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
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
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  {group.label}
                </p>
                <div className="flex flex-col gap-3">
                  {upcoming.map((post) => (
                    <DropInCard
                      key={post.id}
                      playdate={post}
                      nowIso={nowIso}
                      startsSoon={post.id === startsSoonId}
                      rainLabel={isToday ? (rainLabels[post.id] ?? null) : undefined}
                      pingToggle={buildCardPingToggle(post)}
                      goingPings={buildCardGoingPings(post)}
                      kidsGoingCount={buildCardKidsCount(post)}
                    />
                  ))}
                  {ended.map((post) => (
                    <DropInCard
                      key={post.id}
                      playdate={post}
                      nowIso={nowIso}
                      rainLabel={isToday ? (rainLabels[post.id] ?? null) : undefined}
                      pingToggle={buildCardPingToggle(post)}
                      goingPings={buildCardGoingPings(post)}
                      kidsGoingCount={buildCardKidsCount(post)}
                    />
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

/**
 * The card toggle's set math (V3 slice 3, ticket 06): flip ONE post id's
 * membership in the viewer's "going" pings (the optimistic flip's and the
 * error-revert's shared helper — always a fresh set, never a mutation of
 * the settled state).
 */
function withPingId(set: ReadonlySet<string>, postId: string, active: boolean): ReadonlySet<string> {
  const next = new Set(set)
  if (active) next.add(postId)
  else next.delete(postId)
  return next
}
