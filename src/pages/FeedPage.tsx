import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { DropInCard } from '../components/DropInCard'
import { RadiusEmptyState } from '../components/RadiusEmptyState'
import { useSessionContext } from '../components/SessionProvider'
import { WhileAwayCard } from '../components/WhileAwayCard'
import {
  countKidsGoingForPosts,
  fetchRainProbabilityForZip,
  listCommentsOnPosts,
  listMyPingedPosts,
  listMyPingPostIds,
  listMyPostRefs,
  listPingsForPosts,
  listRadiusFeed,
  restampLastSeen,
  togglePing,
  type PingForPost,
} from '../lib/db'
import {
  buildWhileAwayItems,
  DEFAULT_RADIUS_MILES,
  dueToRefreshLastSeen,
  groupByDay,
  isEnded,
  isStartingSoon,
  localDayKey,
  rainBadgeLabel,
  shouldRefreshFeed,
  WHILE_AWAY_ITEM_LIMIT,
  type WhileAwayInbox,
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
 * The visibility-refresh window (V8 ticket 02): the feed re-issues its query
 * when the tab becomes visible again, but ONLY when the last load is at least
 * this old. The window is owned here, exactly like LAST_SEEN_WINDOW_MS above —
 * the pure shouldRefreshFeed takes it as a parameter.
 *
 * 60 s is the pin: long enough that a quick app switch (check a text, come
 * back) starts nothing — no polling loop, no refetch storm — and short enough
 * that a parent who has actually been away sees current pings.
 */
const FEED_REFRESH_WINDOW_MS = 60_000

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
 * V3 slice 9 (ticket 04): the host retention cursor — the feed mounts
 * restamp profiles.last_seen_at (migration 0024) when it is null or >= 1h
 * stale (the pure dueToRefreshLastSeen throttle + db.restampLastSeen,
 * fire-and-forget — pre-0024-apply the restamp 42703s and is swallowed:
 * the cursor never lands, the inbox stays hidden, never a crash).
 *
 * V8 ticket 03 (the inbox that replaced the dead-end banner): the amber
 * banner "N new families pinged your drop-ins" is GONE — it rendered only
 * while the host was already in the app and tapping it landed on /profile,
 * which names nobody. In its place, at the top of the feed, the
 * WhileAwayCard renders up to WHILE_AWAY_ITEM_LIMIT items saying who did
 * what: a cancelled drop-in the viewer said they'd go to, the families who
 * pinged the viewer's OWN posts since the cursor, and new comments on
 * those posts (the pure buildWhileAwayItems decides all of it —
 * ordering, grouping, dedupe, cap). The cursor is the SAME
 * profiles.last_seen_at (no new "read" flag): an item tap restamps it
 * (awaited) and opens /playdate/:id; the "+N more" line and the card's
 * padding restamp it and stay. Every read failure is silent — the card
 * simply does not render (the zero-pressure soul). There is exactly ONE
 * "you have news" surface: the old count query is deleted with its
 * banner.
 *
 * The zip_codes + location columns live in migration 0012 (the live
 * project may not have them yet) — a failed load renders a designed error
 * state, never a crash (same discipline as the onboarding load-error).
 *
 * V8 ticket 02 (the first visit that isn't a dead end): the empty-radius
 * state is the shared RadiusEmptyState component (honest "Nothing within N
 * miles yet." + the widen/see-everything escapes + the post CTA — see that
 * file for why the old copy was wrong twice); the feed re-issues its query
 * when the tab becomes visible again, gated to a >60 s stale load by the pure
 * shouldRefreshFeed (no polling, no refetch storm); and a card's "going"
 * toggle re-reads that post's pings, so pingsByPostId no longer goes stale
 * until the next full load (the parked ticket-07 observation).
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
  // V8 ticket 03: the "While you were away" inbox — the feed-top card's
  // items (the pure buildWhileAwayItems output: capped items + the "+N more"
  // count). null = unsettled (no card); a failed read settles to an EMPTY
  // inbox (the card renders nothing — zero-pressure soul, never an error
  // state).
  const [whileAway, setWhileAway] = useState<WhileAwayInbox | null>(null)
  /**
   * V8 ticket 02: bumped by the visibility/focus listener when the last load
   * is older than FEED_REFRESH_WINDOW_MS — the feed effect below re-runs and
   * re-issues the query. It is a token rather than a direct call so the ONE
   * load path stays the effect (no second fetch implementation).
   */
  const [feedReloadToken, setFeedReloadToken] = useState(0)
  /**
   * When the feed query was last ISSUED (the visibility gate's clock; the
   * pure shouldRefreshFeed compares against it). A ref, not state: reading it
   * must never re-render, and stamping it must never fight the load effect.
   */
  const lastFeedLoadedAtRef = useRef<string | null>(null)

  // The viewer side of the radius filter: the profile's home zip + radius.
  // The shell's onboarding gate keys on home_zip, so a settled signed-in
  // session here has a zip; a null profile is the in-flight load state
  // (ticket 06 cold-load race — never query before the profile settles).
  useEffect(() => {
    if (loading || session === null || profile === null) return
    let cancelled = false
    setPosts(null)
    setLoadError(null)
    // The visibility gate's clock (V8 ticket 02) — stamped when the query is
    // issued, so a focus/visibility event during a slow load cannot stack a
    // second one behind it.
    lastFeedLoadedAtRef.current = new Date().toISOString()
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
  }, [loading, session, profile, feedReloadToken])

  /**
   * V8 ticket 02: the focus/visibility refresh. Coming back to the tab
   * re-issues the feed query — but only when the last load is at least
   * FEED_REFRESH_WINDOW_MS old (the pure shouldRefreshFeed gate, unit-tested
   * with the 60 s pin). A hidden document is never refreshed (a background tab
   * firing 'focus' would be a refetch nobody asked for), and the listener set
   * is registered once: no polling loop, no interval.
   */
  useEffect(() => {
    function maybeRefreshFeed() {
      if (document.visibilityState !== 'visible') return
      if (
        !shouldRefreshFeed(
          lastFeedLoadedAtRef.current,
          new Date().toISOString(),
          FEED_REFRESH_WINDOW_MS,
        )
      ) {
        return
      }
      setFeedReloadToken((token) => token + 1)
    }
    document.addEventListener('visibilitychange', maybeRefreshFeed)
    window.addEventListener('focus', maybeRefreshFeed)
    return () => {
      document.removeEventListener('visibilitychange', maybeRefreshFeed)
      window.removeEventListener('focus', maybeRefreshFeed)
    }
  }, [])

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

  // V8 ticket 03: the inbox's four reads, one shot when the session +
  // profile settle (re-fetches on a fresh profile load — the cursor is the
  // shared session state's). The pinger rows come from the EXISTING gated
  // read (listPingsForPosts: the going_pings → profiles embed); the other
  // three are the viewer's own rows. The cursor decision (and the whole
  // ordering/grouping/cap) is the pure buildWhileAwayItems — the cursor is
  // never re-derived here. A null cursor (pre-0024-apply, or a first visit)
  // is no news: the pure seam returns nothing for the pings/comments kinds,
  // so this still issues the reads (a cancellation is not cursor-gated — it
  // must surface on the first visit too). ANY failure settles to an empty
  // inbox: the card does not render, and there is no error state anywhere
  // (the zero-pressure pin).
  useEffect(() => {
    if (loading || session === null || profile === null) return
    let cancelled = false
    setWhileAway(null)
    const inputs = {
      sinceIso: profile.last_seen_at ?? null,
      nowIso: new Date().toISOString(),
    }
    Promise.all([listMyPostRefs(), listMyPingedPosts()])
      .then(async ([myPosts, pingedPosts]) => {
        const postIds = myPosts.map((post) => post.id)
        const [pingsOnMyPosts, commentsOnMyPosts] = await Promise.all([
          listPingsForPosts(postIds),
          listCommentsOnPosts(postIds),
        ])
        if (cancelled) return
        setWhileAway(
          buildWhileAwayItems(
            { ...inputs, myPosts, pingedPosts, pingsOnMyPosts, commentsOnMyPosts },
            WHILE_AWAY_ITEM_LIMIT,
          ),
        )
      })
      .catch(() => {
        if (!cancelled) setWhileAway({ items: [], moreCount: 0 })
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
   *
   * V8 ticket 02: the toggle also re-reads THAT post's pings (closing the
   * parked ticket-07 observation: pingsByPostId used to stay stale until the
   * next full feed load, so a card could say "1 going" while the count it was
   * drawn from had already moved). Only this post's group is replaced — a
   * full re-read of every visible post would be a write path triggering N
   * reads for one tap. Best-effort like every other card decoration: a failed
   * re-read leaves the previous group (silent — no card error UI, the
   * zero-pressure pin).
   */
  async function handleCardPingToggle(postId: string) {
    const base = myPingPostIds
    if (base === null || pingBusyPostId !== null) return
    const willBeActive = !base.has(postId)
    setPingBusyPostId(postId)
    setMyPingPostIds(withPingId(base, postId, willBeActive))
    let going: boolean
    try {
      going = await togglePing(postId)
    } catch {
      setMyPingPostIds((prev) => (prev === null ? prev : withPingId(prev, postId, !willBeActive)))
      setPingBusyPostId(null)
      return
    }
    // Reconcile with the write path's authoritative result (a
    // concurrent toggle elsewhere shows as-is, not the optimistic guess).
    setMyPingPostIds((prev) => (prev === null ? prev : withPingId(prev, postId, going)))
    setPingBusyPostId(null)
    // The write LANDED — the re-read below is a separate, best-effort step:
    // a failed read leaves the previous group standing (silent) rather than
    // reverting a ping that is already in the database.
    try {
      const rows = await listPingsForPosts([postId])
      setPingsByPostId((prev) =>
        prev === null
          ? prev
          : { ...prev, [postId]: rows.filter((row) => row.playdateId === postId) },
      )
    } catch {
      /* Swallowed: the cards never show error UI (the zero-pressure pin). */
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
   * V8 ticket 03: opening the inbox IS the dismissal — the EXISTING cursor
   * path, no new flag: restamp profiles.last_seen_at (AWAITED) and land the
   * fresh cursor in the shared session state (refresh), so the inbox's own
   * load effect re-runs against the new cursor and the card clears. Both
   * failures are swallowed (pre-0024-apply the restamp 42703s — the pinned
   * fire-and-forget contract: never a crash, the card simply stays).
   */
  async function dismissWhileAway() {
    if (session === null) return
    await restampLastSeen(session.user.id).catch(() => {})
    await refresh().catch(() => {})
  }

  /**
   * V8 ticket 03: an ITEM tap — dismiss (the awaited restamp + refresh)
   * THEN open that post's detail page. The tap always lands on
   * /playdate/:id: the inbox names who did what, and the detail page is
   * where the guest list / thread actually live.
   */
  async function handleWhileAwayItemTap(playdateId: string) {
    await dismissWhileAway()
    navigate(`/playdate/${playdateId}`)
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

      {/* V8 ticket 03: the "While you were away" inbox — the retention
          banner's replacement and the ONLY "you have news" surface (the
          amber nudge-banner pattern). Renders nothing while the inbox is
          unsettled or empty (a failed read settles empty); an item opens
          its post, "+N more" / the card's padding just dismiss. */}
      {whileAway === null ? null : (
        <WhileAwayCard
          inbox={whileAway}
          onOpenItem={(playdateId) => void handleWhileAwayItemTap(playdateId)}
          onDismiss={() => void dismissWhileAway()}
        />
      )}

      {posts === null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
          Loading…
        </div>
      ) : posts.length === 0 ? (
        /* V8 ticket 02: the honest empty-radius state — the shared
           RadiusEmptyState (Browse renders the same component): the viewer's
           ACTUAL radius in the copy (never "today" — the list is
           today-and-later) plus the way out of an empty radius. The radius N
           is the same value the filter above just used (profile.radius_miles
           with the DEFAULT_RADIUS_MILES fallback). */
        <RadiusEmptyState radiusMiles={profile.radius_miles ?? DEFAULT_RADIUS_MILES} />
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
