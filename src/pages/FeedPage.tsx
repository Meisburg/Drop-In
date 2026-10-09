import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { DropInCard } from '../components/DropInCard'
import { FirstRunTooltips } from '../components/FirstRunTooltips'
import { LocationModal } from '../components/LocationModal'
import { NAV_ICONS } from '../components/icons'
import { PlacesMap } from '../components/PlaceMapLazy'
import { RadiusEmptyState } from '../components/RadiusEmptyState'
import { LocationRequiredNotice } from '../components/LocationRequiredNotice'
import { SectionHeader } from '../components/SectionHeader'
import { useSessionContext } from '../components/SessionProvider'
import { WhileAwayCard } from '../components/WhileAwayCard'
// V8 ticket 08: recording the meaningful action (a saved ping from a card) that
// may be followed by the notification opt-in.
import { armPushPromptForAction } from '../lib/pushClient'
// V28 slice 2a fix 1/5: the ONE home-zip presence predicate (lib/homeZip.ts).
import { hasHomeZip } from '../lib/homeZip'
// r3-7: the first-run tooltips' pure decisions (lib/firstRunTooltips.ts) and
// the shared first-run dismissal fact they extend.
import {
  isFirstRunTooltipsArmed,
  markFirstRunDismissed,
  readFirstRunDismissed,
  shouldShowTooltips,
} from '../lib/firstRunTooltips'
import {
  countKidsGoingForPosts,
  fetchDailyForecastForZip,
  getShareUrl,
  kidAgeBandsGoingForPosts,
  kidAgesByPostForPosts,
  listCommentsOnPosts,
  listMyFollows,
  listMyPingedPosts,
  listMyPingPostIds,
  listMyPostRefs,
  loadZipCodes,
  listPingProfileIdsForPosts,
  listPingsForPosts,
  listRadiusFeed,
  restampLastSeen,
  togglePing,
  updateHomeZipRadius,
  type KidAgeBand,
  type PingForPost,
  type PingProfileRow,
} from '../lib/db'
// V8 ticket 09: the met-before line's pure seam (the viewer's follows ∩ this
// post's going families) — the card renders the string, the page owns the data.
import { followTargetsFrom, metBeforeLine } from '../lib/follows'
import {
  buildWhileAwayItems,
  cardAgeRangeLabel,
  daySectionIso,
  DEFAULT_RADIUS_MILES,
  dueToRefreshLastSeen,
  feedCardCountdown,
  feedLocationSummary,
  feedNowSummary,
  goingPingsByPost,
  groupByDay,
  hostCommonGroundLine,
  isStartingSoon,
  localDayKey,
  milesWord,
  pastDropInsHref,
  PAST_DROP_INS_LABEL,
  rainBadgeLabel,
  shouldRefreshFeed,
  WHILE_AWAY_ITEM_LIMIT,
  type WhileAwayInbox,
} from '../lib/feed'
import { geocodeAddress } from '../lib/geocode'
import type { DailyForecast } from '../lib/weather'
import {
  feedMapPinEvent,
  feedMapPins,
  framingCircle,
  MAP_FOCUS_RADIUS_MILES,
  distanceMiles,
  type MapPinEvent,
} from '../lib/places'
// V21 t09 (A9): the feed view toggle's pure rules — default list, labels, and
// which view makes the map band the primary content. The page holds the state;
// this module owns the decisions around it.
import { FEED_VIEW_DEFAULT, FEED_VIEW_LABELS, feedViewShowsMap, type FeedView } from '../lib/feedView'
import type { ZipCoords } from '../lib/feed'
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
 * feed query (db.listRadiusFeed) fetches the posts that have NOT ENDED
 * (`ends_at > now`, V9 ticket 04) with the host's home zip pinned in the
 * embed (PGRST201), applies the pure haversine radius filter
 * (feed.filterFeed — unit-tested), and tags each survivor with its "N mi"
 * distance for the card label.
 *
 * V3 slice 1 (ticket 01), as V9 ticket 04 leaves it: the flat list is rendered
 * in day sections (feed.groupByDay, ascending start-of-day order) with section
 * headers from feed.formatDayLabel ("Today" / "Tomorrow" / "Sat, Sep 12"), and
 * the single soonest event of the Today section gets a "Starts soon" badge when
 * it starts within 60 min (feed.isStartingSoon). The section headers are styled
 * paragraphs, NOT heading elements: the page title stays the single heading the
 * e2e specs pin on.
 *
 * TWO PARTS OF V3/01 CHANGED HERE, IN ONE RULE, because a section header and the
 * list it heads must not disagree:
 * - The ended/upcoming DEMOTION is gone, not hidden. `listRadiusFeed` no longer
 *   returns an ended post at all (`ends_at <= now` is filtered in the query AND
 *   in feed.filterFeed), so the split, the second `ended.map` block and the
 *   greyed card at the bottom of Today were unreachable code describing a rule
 *   the product no longer has. An ended drop-in now lives in exactly one place:
 *   the archive (V8/04's Past list on /profile), which the feed links to — a
 *   "See past drop-ins" line under the day sections, and inside the empty state
 *   when nothing is ahead. DropInCard KEEPS its `ended`/muted/"Ended" chip
 *   styling: the archive cards on /profile and /u/:handle are exactly what those
 *   branches render.
 * - The day a row is grouped under follows the cutoff (feed.daySectionIso): a
 *   post's START, clamped up to now once it has started. Without it, a
 *   still-running overnight drop-in (23:30 + 3h — a window /new really produces)
 *   would be the FIRST section on the screen under a past-dated header such as
 *   "Fri, Sep 11" while its own card said "Happening now". Such a row is only
 *   reachable at all because the cutoff is time-based now, which is why V3/01's
 *   grouping tests never saw it.
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
 * buildGoingLine (up to 3 circles + a "+N" chip + the "N going" label),
 * replacing the old age-hint line. The host's own posts keep the line (the
 * host sees who's coming); the signed-out public view never renders a
 * DropInCard, so no circles cross to it (the 0015 going-count pin stays
 * count-only there). A failed pings load (pre-0020-apply: the created_at
 * column is missing → 42703) degrades to no going lines, never a crash.
 *
 * V8 ticket 09 (migration 0033): each card's going-line area can also carry
 * the "met before" line — "2 families you've met before are going" (the pure
 * follows.metBeforeLine over that post's going FAMILIES ∩ the viewer's own
 * followed families). Two reads feed it: the viewer's own follows rows
 * (db.listMyFollows — owner-only RLS, one read per session; a failure or the
 * pre-apply PGRST205 settles to the empty set) and one more going_pings read
 * carrying just the (post, family) pairs (db.listPingProfileIdsForPosts —
 * deliberately separate from the circles' read, whose pinned shape the
 * existing unit tests assert). Both are best-effort: the line is a
 * decoration, so a failed read hides it rather than costing the feed an
 * error state.
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
  const { session, loading, profile, refresh, homeZipSet } = useSessionContext()
  const navigate = useNavigate()
  const location = useLocation()
  /**
   * V27 slice 4 (corrected by V29 v29-3): the just-posted share prompt. `/new`
   * navigates here with router state (`{ justPosted: { id, title } }`) and the
   * URL stays exactly `/`; this reads that one-shot state and offers a one-tap
   * Share.
   *
   * ⚠️ THE OLD COMMENT HERE WAS WRONG, AND THE WRONGNESS WAS THE BUG. It said
   * "it is NEVER persisted: a plain load of `/` carries no state and shows
   * nothing". Router state IS `history.state`, which SURVIVES a reload — so a
   * parent who refreshed the feed was told again that they had just posted, and
   * a stale notice that reads as a second event is a trust bug.
   *
   * The state is now CONSUMED on mount (the effect below): the banner renders
   * from component state, the history entry is replaced with the same URL and
   * no state, and reload / back / forward cannot resurrect it.
   */
  const justPostedFromState =
    (location.state as { justPosted?: { id: string; title: string } } | null)?.justPosted ?? null
  // A mount-time SNAPSHOT, deliberately without a setter: the effect below
  // strips the router state on the same tick, so a live read of
  // `location.state` would go null and hide the banner the parent just earned.
  const [justPosted] = useState<{ id: string; title: string } | null>(justPostedFromState)
  const [shareDismissed, setShareDismissed] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const showJustPosted = justPosted !== null && !shareDismissed
  useEffect(() => {
    if (justPostedFromState === null) return
    // Replace the entry with an identical URL and NO state. The banner keeps
    // rendering (it lives in component state now) and the reload is silent.
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [justPostedFromState, location.pathname, location.search, navigate])
  /**
   * r3-7: the first-run tooltips. The run ends by navigating to THIS page
   * (`OnboardingPage`'s finish redirect carries `FIRST_RUN_TOOLTIPS_ARMED_STATE`),
   * and the tour shows for the parent whose run JUST ENDED in this tab — the
   * gate (shouldShowTooltips) needs the armed router state, the run's
   * completion clause (homeZipSet), and the absence of the SHARED dismissal
   * fact: the nudge's key, extended (lib/firstRunTooltips), so a parent who
   * stood down the tour — or the nudge — never sees either again this tab.
   *
   * Deliberately NOT consumed like `justPosted`: the armed state survives a
   * reload of the same entry, and the persisted dismissal fact is what keeps
   * the second load quiet. A dismiss here writes that fact AND stands the
   * tour down for this mount.
   */
  const [tooltipsDismissed, setTooltipsDismissed] = useState(() =>
    readFirstRunDismissed(window.sessionStorage),
  )
  const showTooltips = shouldShowTooltips({
    signedIn: session !== null,
    homeZipSet,
    armed: isFirstRunTooltipsArmed(location.state),
    dismissed: tooltipsDismissed,
  })
  const dismissTooltips = useCallback(() => {
    setTooltipsDismissed(true)
    markFirstRunDismissed(window.sessionStorage)
  }, [])
  const [posts, setPosts] = useState<PlaydateWithNeighborhood[] | null>(null)
  /**
   * V29 v29-6: how many drop-ins are further out than the current radius (within
   * the widest one). It comes back from the SAME feed read — the radius filter is
   * what discards those rows — and it is only ever read by the empty state.
   */
  const [beyondRadiusCount, setBeyondRadiusCount] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  /**
   * V19 t02 — the feed map's gazetteer, for resolving the HOME PIN.
   *
   * The posts' own place coordinates arrive WITH the feed (`place_coords`,
   * stitched by `listRadiusFeed`), so the map's PINS need no extra read. The
   * home pin does: it is the stored `home_zip` resolved through the zip
   * gazetteer, exactly as `/browse` resolves it.
   *
   * A failed load leaves this null, which drops only the home pin — every
   * drop-in pin still draws. Degrading to "no home pin" is strictly better than
   * degrading to "no map", and it matches the browse page's posture (a failed
   * gazetteer is never an error state, and never an empty page).
   */
  const [zipCoords, setZipCoords] = useState<ReadonlyMap<string, ZipCoords> | null>(null)
  // V3 slice 2 (ticket 02): the Today-section cards' "Rain likely" labels
  // (post id → forecast; null = no badge and no chip panel). Best-effort —
  // the wrapper never rejects, so a failed fetch just leaves the entry null
  // (silently absent, the zero-pressure soul).
  const [rainForecasts, setRainForecasts] = useState<Record<string, DailyForecast | null>>({})
  // V3 slice 3 (ticket 06): the viewer's own "going" pings (one query —
  // every card's toggle state). null = not settled (a failed load
  // degrades to an empty set: the toggles render inactive, never a
  // crash — the zero-pressure soul).
  const [myPingPostIds, setMyPingPostIds] = useState<ReadonlySet<string> | null>(null)
  // One in-flight card toggle per feed (the write path round-trips).
  const [pingBusyPostId, setPingBusyPostId] = useState<string | null>(null)
  // V28 slice 2a fix 1/5: the no-home-zip notice for a card ping SET that the
  // location guard blocked (handleCardPingToggle) — the post id that raised
  // it. Rendered ONCE near the top of the feed (the cards carry no per-card
  // notice slot), self-clearing once a zip lands via the one predicate.
  const [cardPingLocationNoticeId, setCardPingLocationNoticeId] = useState<string | null>(null)
  // V3 slice 4 (ticket 07): the feed posts' "going" pings (the cards'
  // going lines — up to 3 avatar circles + a "+N" chip + "N going"). The
  // rows are grouped by post id (the card renders its own group via the
  // pure buildGoingLine). null = not settled (the cards show no line
  // yet); a failed load (pre-0020-apply: 42703 on the missing created_at
  // column) degrades to empty groups — no going lines, never a crash
  // (the zero-pressure soul).
  const [pingsByPostId, setPingsByPostId] = useState<Record<string, PingForPost[]> | null>(null)
  // V6: post id -> how many kids are coming (the 0027 batch RPC).
  const [kidsByPostId, setKidsByPostId] = useState<Record<string, number> | null>(null)
  /**
   * V9 ticket 05: post id -> the AGES of the kids the post's HOST said they
   * are bringing (the 0022 playdate_kids selection, projected to `kids.age`
   * ONLY — no name, no kid id crosses). ONE batched read for the whole feed
   * (db.kidAgesByPostForPosts), the same "one call per feed, never one per
   * card" shape the kids count above uses, so a card never issues its own
   * query.
   *
   * null = unsettled; a failed read — or the pre-0022 state — degrades to {}
   * and every card simply omits its ages line. A card decoration is never
   * worth an error state (the zero-pressure soul).
   */
  const [kidAgesByPostId, setKidAgesByPostId] = useState<Record<string, number[]> | null>(null)
  /**
   * V27 slice 4 (migration 0056): post id -> the aggregate AGE BAND of the
   * kids the post's PINGERS are bringing (the ping_kids selections, reduced in
   * SQL to `min`/`max` — an aggregate only; per-kid ages and identities never
   * cross). ONE batched read for the whole feed (db.kidAgeBandsGoingForPosts),
   * the same "one call per feed, never one per card" rule as the two reads
   * above.
   *
   * null = unsettled; a failed read — or the pre-0056 state — settles to {} and
   * every card simply omits its band, keeping the V6 count label. A card
   * decoration is never worth an error state (the zero-pressure soul).
   */
  const [kidAgeBandsByPostId, setKidAgeBandsByPostId] = useState<
    Record<string, KidAgeBand> | null
  >(null)
  /**
   * V8 ticket 09 (migration 0033): the viewer's OWN followed families (the
   * `follows` rows, owner-only RLS) — the left half of the card's met-before
   * line. An EMPTY set is the honest default and the pre-apply state (the
   * 0033 read answers PGRST205 until the coordinator applies it): the line is
   * hidden for every card, which is exactly what a viewer who follows nobody
   * sees. Never an error state — a card decoration is not worth one
   * (the zero-pressure soul).
   */
  const [followeeIds, setFolloweeIds] = useState<ReadonlySet<string>>(() => new Set<string>())
  /**
   * V8 ticket 09: post id -> (post, family) pairs for that post's going pings
   * — the right half of the met-before line. A SEPARATE read from
   * `pingsByPostId` (which carries the avatars the circles need): this one
   * needs only the family ids, and adding a field to the pinned ping shape
   * would churn its unit tests for nothing. null = unsettled; a failed read
   * degrades to no line.
   */
  const [pingFamiliesByPostId, setPingFamiliesByPostId] = useState<
    Record<string, PingProfileRow[]> | null
  >(null)
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
   * V16 t06 items 1–2: the location control's write state. This page holds NO
   * location of its own — `profile.home_zip` and `profile.radius_miles ??
   * DEFAULT_RADIUS_MILES` are the values, and BOTH are folded into the load
   * effect's contextKey — so the control needs no local override or a second
   * query: it writes the SAVED columns through the same `updateHomeZipRadius`
   * the empty state's escapes use, and `refresh()` re-runs the feed because the
   * key changed.
   *
   * These are the write's bookkeeping, not a mirror of the values:
   * `radiusBusy` locks the control for the one in-flight write (a second write
   * mid-flight could land out of order), and the error string says so out loud
   * — a control that silently does nothing is the dead end this page exists to
   * remove.
   */
  const [radiusBusy, setRadiusBusy] = useState(false)
  /** V23 slice 1: the feed's ONE location control opens the shared LocationModal. */
  const [locationModalOpen, setLocationModalOpen] = useState(false)
  /**
   * V32-7 (A2 + A4): the centre the modal's own map frames.
   *
   * `/` used to hand `onGeocode={geocodeAddress}` — the lib function straight —
   * and store nothing, so the modal had no centre to draw and its slider drove
   * no map at all. This mirrors `/browse`'s `geocodeCenter` state: the CALLER
   * owns the geocoded centre, the modal asks for it, the caller keeps the answer.
   *
   * ⚠️ IT IS DELIBERATELY NOT CLEARED ON CLOSE. `/browse` used to clear its
   * equivalent and that was a defect it still documents
   * (`PlaceDirectory.tsx`: *"THERE IS DELIBERATELY NO CLEAR HERE"*): once the
   * dialog's geocode is committed, closing without re-applying must not discard
   * where the parent said they were. This state follows that lesson.
   *
   * It feeds the MODAL's map only. The feed's own map band keeps
   * `feedMapFrame` with `geocodeCenter: null` and `MAP_FOCUS_RADIUS_MILES` —
   * V20 t05's ruling that the radius frames that map and nothing else moves its
   * camera. Do not wire this into the band.
   */
  const [locationModalCenter, setLocationModalCenter] = useState<{
    lat: number
    lng: number
  } | null>(null)
  /**
   * V21 t09 (A9): which of the feed's two views is showing — list (the day
   * sections) or map (the map band as primary content).
   *
   * PERSISTENCE: NONE, deliberately. This page persists no UI state anywhere,
   * and the ticket requires list to be the default on every first load, so the
   * choice resets on reload rather than being remembered in localStorage or
   * sessionStorage (the repo has no house pattern for persisting a page-local
   * view choice — its persistence keys are cross-page intents and push prefs).
   * The pure seam (feedView.ts) owns the default and the branch rule; this is
   * just the one piece of state the toggle flips.
   */
  const [feedView, setFeedView] = useState<FeedView>(FEED_VIEW_DEFAULT)
  /**
   * When the feed query was last ISSUED (the visibility gate's clock; the
   * pure shouldRefreshFeed compares against it). A ref, not state: reading it
   * must never re-render, and stamping it must never fight the load effect.
   */
  const lastFeedLoadedAtRef = useRef<string | null>(null)
  /**
   * The context the last COMPLETED load belonged to (user + zip + radius).
   * A re-run for the same context is a refresh, not a context change — see
   * the load effect's isRefresh (V8 ticket 02 review round).
   */
  const loadedContextRef = useRef<string | null>(null)

  /**
   * V19 t02: load the zip gazetteer once, for the map's home pin. Best-effort —
   * a failure leaves it null and the map simply has no home pin (see the state
   * declaration). No cancellation ceremony beyond the flag, because a late
   * resolve of the gazetteer is harmless: it only ever ADDS a pin.
   */
  useEffect(() => {
    let cancelled = false
    loadZipCodes()
      .then((coords) => {
        if (!cancelled) setZipCoords(coords)
      })
      .catch(() => {
        if (!cancelled) setZipCoords(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * V19 t02: the home pin's coordinates — the stored `home_zip` resolved through
   * the gazetteer, the same derivation `/browse` uses (`BrowsePage`'s
   * `homePinCoords`). Null when there is no zip, no gazetteer yet, or an unknown
   * zip: in every one of those cases the map draws its drop-in pins without a
   * home pin rather than guessing a location.
   */
  const homePinCoords = (() => {
    if (!hasHomeZip(profile?.home_zip)) return null
    if (zipCoords === null) return null
    const found = zipCoords.get(profile.home_zip)
    return found === undefined ? null : { lat: found.lat, lng: found.lng }
  })()

  /**
   * V19 t02: the feed map's pins and its frame.
   *
   * `feedMapPins` is the pure seam: it drops posts with no resolvable
   * coordinate (a free-text place names no location — the map must not invent
   * one) and collapses posts sharing an exact coordinate into a single pin, so
   * two sessions at one park do not stack two dots on one pixel.
   *
   * The frame reuses `framingCircle` with `MAP_FOCUS_RADIUS_MILES`, exactly as
   * `/browse` does after V19 t01, so both maps open on the same neighbourhood
   * view. `geocodeCenter` is absent here (the feed has no "Set location" modal),
   * so the frame anchors on the home pin; with no home pin the circle is null
   * and the map keeps its own mount view rather than framing on nothing.
   */
  const feedPins = feedMapPins(posts ?? [])
  /**
   * V25 t07 — THE FEED PIN IDENTITY, and the event payload that goes with it.
   *
   * The map's popup is keyed by the id the pin carries in the `places` array
   * below, so that id is built ONCE, here, and the `places` array and the
   * `pinEvents` lookup both read it. Two spellings of `feed-pin-${index}` in one
   * render is exactly how a lookup goes missing for the free-text pins the
   * ticket calls out — those are the pins with no directory id, and they must
   * name their event like any other.
   *
   * `feedMapPinEvent` is the tested seam: the SOONEST of the drop-ins behind the
   * dot, its title and `cardWhenLabel` window, the "N more drop-ins here"
   * sentence when the dot stands for several, and the `/playdate/:id` the bubble
   * links. Null when a pin names no event, and the popup then keeps its
   * place-only content.
   */
  const feedPinIds = feedPins.map((pin, index) => pin.placeId ?? `feed-pin-${index}`)
  const feedPinEvents = new Map(
    feedPins
      .map((pin, index) => [feedPinIds[index], feedMapPinEvent(pin)] as const)
      .filter((entry): entry is readonly [string, MapPinEvent] => entry[1] !== null),
  )
  /** V19 t02: how many feed pins fall OUTSIDE the neighbourhood frame the map
   * draws. The header counts every place in the FEED; the map shows only the
   * ones near home, so this states the difference rather than letting the two
   * numbers contradict each other. Computed from the same array the map draws. */
  const feedPinsOutsideFrame = (() => {
    if (homePinCoords === null) return 0
    return feedPins.filter(
      (pin) => distanceMiles(homePinCoords, { lat: pin.lat, lng: pin.lng }) > MAP_FOCUS_RADIUS_MILES,
    ).length
  })()

  /**
   * THE FEED MAP'S FRAME — and V20 t05 removed `focusPoints` from it.
   *
   * It used to pass `focusPoints: feedPins`, which is V17 t04's "frame the
   * searched subset": `framingCircle` takes the MIDPOINT of those points and
   * shrinks the frame to a circle just covering them, floored at
   * `MIN_FOCUS_RADIUS_MILES` (0.5).
   *
   * THAT IS WHAT MADE THE FEED'S OWN PINS UNREACHABLE, and it was found by this
   * batch's e2e run rather than by reasoning. With one placed drop-in, the
   * midpoint IS that pin, the extent around it is zero, and the frame becomes a
   * half-mile circle centred on the PIN — so the camera leaves home entirely and
   * the home pin is projected off the canvas. Playwright's trace showed the
   * marker at SVG `y = -43`, i.e. 43px above the pane, where the app's own
   * container intercepts every tap: a blue dot that looks tappable and is not.
   *
   * V20 t05's ruling is that the RADIUS frames the map and nothing else moves
   * the camera (the same ruling that removed `focusPoints` from `/browse`), so
   * this passes the home pin and the focus radius, exactly like /browse does.
   * A feed pin outside that frame is still drawn — `feedPinsOutsideFrame` below
   * counts them and the band says so — and the follow-up for making those dots
   * themselves reachable is recorded there.
   */
  const feedMapFrame = framingCircle({
    geocodeCenter: null,
    homePin: homePinCoords,
    radiusMiles: MAP_FOCUS_RADIUS_MILES,
  })

  // The viewer side of the radius filter: the profile's home zip + radius.
  // V28 slice 2b removed the shell's onboarding gate, so a settled signed-in
  // session may have NO zip: listRadiusFeed then returns [] and the empty
  // state renders the location notice (RadiusEmptyState's slice-2c early
  // return), not a wall and not a dead end. A null profile is the in-flight
  // load state (ticket 06 cold-load race — never query before the profile
  // settles).
  useEffect(() => {
    if (loading || session === null || profile === null) return
    let cancelled = false
    /**
     * V8 ticket 02 REVIEW ROUND (found by the fresh-context reviewer, and a
     * real regression on the product's primary screen): a token-driven re-run
     * is a REFRESH, and a refresh must not blank the list. `posts = null` is
     * right when the CONTEXT changed — a different user, zip or radius means
     * the list on screen is wrong and "Loading…" is honest — but it is wrong
     * for an automatic freshness refetch, which used to replace the day
     * sections with "Loading…" on every tab return and let a single transient
     * failure swap a perfectly good list for the error screen.
     *
     * So: clear for a new context, keep the last good list for a refresh, and
     * let only a NEW context own the error state (a failed refresh leaves the
     * stale-but-correct list alone; the next refresh retries).
     */
    const contextKey = `${session.user.id}|${profile.home_zip ?? ''}|${
      profile.radius_miles ?? DEFAULT_RADIUS_MILES
    }`
    const isRefresh = loadedContextRef.current === contextKey
    if (!isRefresh) {
      setPosts(null)
      setLoadError(null)
    }
    // The visibility gate's clock (V8 ticket 02) — stamped when the query is
    // issued, so a focus/visibility event during a slow load cannot stack a
    // second one behind it.
    lastFeedLoadedAtRef.current = new Date().toISOString()
    const viewer = {
      homeZip: profile.home_zip ?? null,
      radiusMiles: profile.radius_miles ?? DEFAULT_RADIUS_MILES,
    }
    listRadiusFeed(viewer, session.user.id)
      .then((result) => {
        loadedContextRef.current = contextKey
        if (!cancelled) {
          setLoadError(null)
          setPosts(result.posts)
          // V29 v29-6: the empty state's second line — what is further out.
          // It rides this same read (the radius filter is what discards those
          // rows), so no extra query exists to go stale.
          setBeyondRadiusCount(result.beyondRadiusCount)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && !isRefresh) {
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
    // V9 ticket 05: the derived AGE RANGE's input — the host's picked kids'
    // ages, in ONE more batched read (never one per card). Best-effort like
    // every card decoration: a failure settles to {} and every card omits its
    // ages line rather than costing the feed an error state. The STATED half
    // needs no read at all: age_min / age_max ride the feed row's own `*`
    // select once 0037 is applied, and are simply absent before it.
    kidAgesByPostForPosts(postIds)
      .then((ages) => {
        if (!cancelled) setKidAgesByPostId(ages)
      })
      .catch(() => {
        if (!cancelled) setKidAgesByPostId({})
      })
    // V27 slice 4 (migration 0056): the aggregate AGE BAND of the kids the
    // PINGERS are bringing — the SAME effect as the host-kids ages read above,
    // one more batched call for the whole feed (never one per card).
    // Best-effort like every card decoration: any failure (pre-0056-apply
    // included) settles to {} and every card omits its band rather than
    // costing the feed an error state.
    kidAgeBandsGoingForPosts(postIds)
      .then((bands) => {
        if (!cancelled) setKidAgeBandsByPostId(bands)
      })
      .catch(() => {
        if (!cancelled) setKidAgeBandsByPostId({})
      })
    listPingsForPosts(postIds)
      .then((rows) => {
        if (cancelled) return
        setPingsByPostId(goingPingsByPost(rows))
      })
      .catch(() => {
        // V29 v29-2: a FAILED read must not become {} — the card reads {} as
        // "loaded, and nobody is going", which is a claim about a query that
        // never answered. Leaving the state null renders no going line at all,
        // and the card's `goingPingsLoaded` gate keeps the absence sentence off
        // the screen. (The decoration still costs the feed no error state.)
      })
    // V8 ticket 09: the met-before line's input — the (post, family) pairs of
    // the same posts, in ONE more query. Pre-0033-apply this read is on the
    // EXISTING going_pings table (green); the 0033 read below is the follows
    // set. Best-effort like every card decoration.
    listPingProfileIdsForPosts(postIds)
      .then((rows) => {
        if (cancelled) return
        const grouped: Record<string, PingProfileRow[]> = {}
        for (const row of rows) {
          const group = grouped[row.playdateId]
          if (group === undefined) grouped[row.playdateId] = [row]
          else group.push(row)
        }
        setPingFamiliesByPostId(grouped)
      })
      .catch(() => {
        if (!cancelled) setPingFamiliesByPostId({})
      })
    return () => {
      cancelled = true
    }
  }, [posts])

  /**
   * V8 ticket 09 (migration 0033): the viewer's own follows — ONE read when
   * the session settles, grouped into the two id sets the UI needs (only
   * `followeeIds` is used here; /profile and /place/:id read the rows
   * themselves). A failed or not-yet-applied read (PGRST205 pre-apply)
   * settles to the EMPTY set, so every card renders exactly as it does for a
   * viewer who follows nobody — no card error UI, no feed cost.
   */
  useEffect(() => {
    if (loading || session === null) return
    let cancelled = false
    listMyFollows()
      .then((rows) => {
        if (!cancelled) setFolloweeIds(followTargetsFrom(rows).followeeIds)
      })
      .catch(() => {
        if (!cancelled) setFolloweeIds(new Set<string>())
      })
    return () => {
      cancelled = true
    }
  }, [loading, session])

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
    // V28 slice 2a fix 1/5: SETTING a card ping requires a home zip at the
    // point of action (the same one-predicate guard as the detail page and
    // the host form). CLEARING (willBeActive false) is never blocked — a
    // zip-less parent must always be able to withdraw a ping.
    if (willBeActive && !hasHomeZip(profile?.home_zip)) {
      setCardPingLocationNoticeId(postId)
      return
    }
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
    // V8 ticket 08: a ping was just saved from a card — the same meaningful
    // action the detail page records, so the opt-in may follow it here too
    // (the write publishes to subscribePushArmed; the shell's prompt listens).
    // Only on the way IN: taking a ping back is not "we're going".
    if (going) armPushPromptForAction('ping_saved')
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
  // never an invented coordinate. Forecasts merge into the map by post id
  // (a stale id from a previous load is harmless — it renders no card).
  //
  // V24 slice 04: the map holds the whole FORECAST object now, not just the
  // badge string — the same single request feeds the badge (via the unchanged
  // rainBadgeLabel at the render site) and the tappable chip's panel.
  //
  // V9 ticket 04: "today" and "the event date" are the SECTION's rule
  // (feed.daySectionIso), not the raw start day — the same seam the section
  // headers use. For every post that starts today (or later) that is the post's
  // own start, so nothing changes; for a still-running overnight drop-in it is
  // NOW, which is the honest date for a forecast about a drop-in happening right
  // now (and it keeps the badge from vanishing on a card the section calls
  // today's).
  useEffect(() => {
    if (posts === null) return
    let cancelled = false
    const nowIso = new Date().toISOString()
    const todayKey = localDayKey(nowIso)
    const todays = posts.filter((post) => localDayKey(daySectionIso(post, nowIso)) === todayKey)
    if (todays.length === 0) return
    void Promise.all(
      todays.map(async (post) => {
        const zip = post.host?.home_zip
        if (typeof zip !== 'string' || zip === '') return [post.id, null] as const
        const forecast = await fetchDailyForecastForZip(zip, daySectionIso(post, nowIso))
        return [post.id, forecast] as const
      }),
    ).then((entries) => {
      if (cancelled) return
      setRainForecasts((prev) => {
        const next: Record<string, DailyForecast | null> = { ...prev }
        for (const [id, forecast] of entries) next[id] = forecast
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
      <div className="flex flex-col gap-4">
        <SectionHeader icon={NAV_ICONS.nearby} title="Near you" tagline="Drop-ins other parents are hosting near you" />
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-red-600">{loadError}</p>
          <p className="text-xs text-slate-500">
            If you just signed up, the drop-in feed may not be set up on the server yet.
          </p>
        </div>
      </div>
    )
  }

  const nowIso = new Date().toISOString()
  // V3 slice 1: day sections (feed.groupByDay, ascending start-of-day
  // order). Every post the query returned has NOT ended (V9 ticket 04 moved
  // the cutoff from start-of-today to now on BOTH layers), so a section renders
  // its posts in starts_at order — there is no ended/upcoming split left to
  // make. V27 slice 2: "Starts soon" is now PER CARD (isStartingSoon, within
  // 60 min) rather than a single soonest event, and each card states its own
  // time-to-start/end (feedCardCountdown).
  const dayGroups = posts === null ? [] : groupByDay(posts, nowIso)
  const nowSummary = posts === null ? null : feedNowSummary(posts, nowIso)
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

  /**
   * V9 ticket 05: one card's age-range label — the card's FIRST meta line.
   *
   * The precedence is the pure seam's (feed.playdateAgeRangeLine): the range
   * the HOST STATED with the /new chips wins over the one DERIVED from the kids
   * they picked, because the explicit statement is the parent saying it out
   * loud; with nothing stated, the derived range answers; with neither, the
   * label is null and the card renders no line at all (never a guess).
   *
   * Both inputs are already on hand and neither is a per-card query: the stated
   * pair rides the feed row (age_min / age_max, undefined pre-0037), and the
   * derived ages come from the ONE batched read above.
   */
  /**
   * V32-7 (A2 + A4): store what the modal's geocode resolved, so the modal's own
   * map has a centre to frame. Mirrors `/browse`'s handler, including its two
   * lessons: a null result KEEPS the previous centre (the modal renders its own
   * "could not find" line, and the caller merely reports whether one landed), and
   * a close does NOT clear it.
   */
  async function handleLocationGeocode(
    address: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const result = await geocodeAddress(address)
    if (result !== null) setLocationModalCenter(result)
    return result
  }

  /**
   * V23 slice 1: the feed's ONE location control writes through the SAME
   * `updateHomeZipRadius` path as the old permanent controls. The shared
   * LocationModal calls this from its ONE Apply button (V28 r3-4; it used to be
   * "Apply radius", one of three buttons a parent had to press in order).
   */
  async function handleLocationApplyRadius(miles: number) {
    if (loading || session === null || profile === null) return
    const homeZip = profile.home_zip
    // V28 slice 2a fix 1/5: the same one predicate (hasHomeZip) — this write
    // path already refused the empty zip, now through the shared rule.
    if (!hasHomeZip(homeZip)) return
    // The modal's per-tick path is `onRadiusChange` (preview only) — the feed
    // deliberately omits it. `onApplyRadius` is the explicit write, fired once
    // from Apply, never per tick. The equal-value guard stays so applying the
    // saved radius is a no-op, not a redundant write.
    if (miles === (profile.radius_miles ?? DEFAULT_RADIUS_MILES)) return
    if (radiusBusy) return
    setRadiusBusy(true)
    try {
      await updateHomeZipRadius(session.user.id, homeZip, miles)
      await refresh()
    } catch (err) {
      /* V23 slice 1 REVIEW — THIS USED TO SWALLOW THE ERROR, and combined with
       * the modal's own swallowing it produced a silent no-op: the parent moved
       * the slider, pressed the apply control, the dialog closed, and nothing
       * said the radius had not saved. The old permanent radius select this
       * replaced DID show a line (`radiusControlError`, rendered from
       * `radiusSaveErrorMessage`), so dropping it lost a real capability rather
       * than removing clutter.
       *
       * The fix is to RE-THROW: the LocationModal is now the surface that owns
       * this write's error (it renders `location-radius-error`), and it can only
       * do that if the failure reaches it. ⚠️ V28 r3-4 made that dependency
       * LOAD-BEARING: the modal now closes on success, so a swallowed error
       * would close the dialog over a write that never landed. Re-throwing is
       * what keeps the dialog open with the reason showing — the `catch` there
       * returns without calling `onClose`.
       *
       * `err` is deliberately not inspected: `radiusSaveErrorMessage` maps the
       * rejected zip and the range violation to their own sentences, and it
       * belongs to the caller that owns those validators — the modal shows a
       * generic "That did not save." and this comment records why that is enough
       * rather than silently losing the detail. */
      throw err
    } finally {
      setRadiusBusy(false)
    }
  }

  function buildCardAgeRangeLabel(post: PlaydateWithNeighborhood) {
    // feed.cardAgeRangeLabel is the ONE composition of that precedence over a
    // row's own columns — the same call PlacePage and UserPage make, so the
    // card's first line cannot be spelled differently per surface.
    return cardAgeRangeLabel(post, kidAgesByPostId?.[post.id] ?? [])
  }

  /**
   * V27 slice 5: one card's common-ground line — the follow edge ONLY (the
   * viewer's own follows, `followeeIds`). The host's kids' ages are deliberately
   * NOT passed: the card's `card-age-range` line already derives from the same
   * `kidAgesByPostId` source, so repeating them here would print the same ages
   * twice on one card (the slice-5 review ruling). Both inputs are already in
   * scope, so this adds NO new query. null (no follow edge, own post, or signed
   * out) renders no line.
   */
  function buildCardHostCommonGround(post: PlaydateWithNeighborhood) {
    return hostCommonGroundLine(post.host_profile_id, viewerId, followeeIds)
  }

  /**
   * V8 ticket 09: one card's met-before line — "N families you've met before
   * are going" (the pure follows.metBeforeLine over this post's going
   * families ∩ the viewer's own follows). null (the line is hidden) when the
   * count is 0, when the viewer follows nobody, and while either read is
   * unsettled/failed — so the ordinary card is unchanged.
   */
  function buildCardMetBeforeLabel(post: PlaydateWithNeighborhood) {
    return metBeforeLine(pingFamiliesByPostId?.[post.id] ?? [], followeeIds)
  }

  /**
   * V29 v29-3: dismiss the just-posted banner. The router state was consumed on
   * mount, so this only flips the component's own flag — there is nothing left
   * in history for a dismissal to clean up, which is what the old
   * `navigate('/', { replace: true, state: null })` was standing in for (and
   * only on an explicit dismiss, which is why a reload kept the banner).
   */
  function dismissJustPosted() {
    setShareDismissed(true)
  }

  /**
   * V27 slice 4: Share the just-posted drop-in. The Web Share API where
   * supported, otherwise the clipboard fallback with a transient "Copied" —
   * the same two-step shape PlaydateDetailPage uses, via db.getShareUrl (the
   * VITE_PUBLIC_BASE_URL / window-origin wrapper over the pure buildShareUrl).
   * A cancelled sheet or a denied clipboard stays silent: the parent is never
   * scolded for declining to share.
   */
  async function shareJustPosted() {
    if (justPosted === null) return
    const url = getShareUrl(justPosted.id)
    setShareCopied(false)
    try {
      if (navigator.share !== undefined) {
        await navigator.share({ title: justPosted.title, url })
        return
      }
      if (navigator.clipboard !== undefined) {
        await navigator.clipboard.writeText(url)
        setShareCopied(true)
        window.setTimeout(() => setShareCopied(false), 2000)
      }
    } catch {
      // the share sheet was cancelled, or the clipboard was denied: stay silent
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        icon={NAV_ICONS.nearby}
        title="Near you"
        tagline="Drop-ins other parents are hosting near you"
        testId="feed-section-header"
      />

      {/* V27 slice 4: the one-tap share prompt, immediately after a successful
          post. Router-state-driven and one-shot — a plain load of `/` (no
          state) renders nothing.
          ⚠️ Corrected by V29 v29-3: the router state is CONSUMED on mount (a
          mount-time snapshot drives this banner), so a RELOAD cannot re-announce
          the post, and `dismissJustPosted` no longer touches history — there is
          nothing left in it to clear. The old comment here said "dismissing
          clears the state", which described exactly the bug v29-3 fixed. */}
      {showJustPosted ? (
        <div
          data-testid="just-posted-banner"
          className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <p className="min-w-0 text-sm text-slate-700">
            <span className="font-medium">Posted!</span> {justPosted.title}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {/* V29 v29-3: the banner announced the post and offered only Share
                and Dismiss, so a parent who wanted to LOOK at what they had just
                made had to go find it. The door is this link, NOT the title:
                making the TITLE a link put the post's exact words in an <a> on
                the same screen as the card's own link, and `a:has-text(title)`
                then matched the banner instead of the card — which is how a
                locator idiom used across the e2e suite (and how a screen reader,
                hearing the same link twice) found the wrong thing. Distinct
                label, one target. */}
            <Link
              to={`/playdate/${justPosted.id}`}
              className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-indigo-700 transition-colors motion-reduce:transition-none hover:bg-slate-50"
            >
              View
            </Link>
            <button type="button" onClick={() => void shareJustPosted()} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-indigo-700 transition-colors motion-reduce:transition-none hover:bg-slate-50">
              {shareCopied ? 'Copied' : 'Share'}
            </button>
            <button type="button" onClick={dismissJustPosted} aria-label="Dismiss" className="min-h-11 min-w-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors motion-reduce:transition-none hover:bg-slate-50">Dismiss</button>
          </div>
        </div>
      ) : null}

      {/* V28 slice 2a fix 1/5: the no-home-zip notice after a blocked CARD
          ping SET — one instance for the whole feed (the cards carry no
          per-card notice slot), self-clearing once a zip lands. */}
      {cardPingLocationNoticeId !== null && !hasHomeZip(profile?.home_zip) ? (
        <LocationRequiredNotice />
      ) : null}

      {/* V24 slice 05: the Post action moved OFF the feed into the nav's centre
          (the raised circular "+" in App.tsx, PostActionButton) after the founder
          overrode V22 slice 12 on 2026-09-25. The feed no longer leads with a
          prominent Post CTA — the drop-ins are what a parent sees first. What
          survives from the old "one action row" (V23 slice 1) is the secondary
          "Drop-ins near you" control, which opens the shared LocationModal; the
          location control lives INSIDE that modal rather than rendering
          permanently. */}
      <div className="flex flex-col gap-2 md:max-w-md">
        <button
          type="button"
          data-testid="feed-location-control"
          onClick={() => setLocationModalOpen(true)}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition-colors motion-reduce:transition-none hover:bg-slate-50 focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
        >
          <span className="text-sm font-medium text-slate-700">Drop-ins near you</span>
          <span className="flex items-center gap-1 text-xs text-slate-500">
            {feedLocationSummary(profile.home_zip, profile.radius_miles ?? DEFAULT_RADIUS_MILES)}
            {/* V27 slice 1: a decorative chevron so the row reads as a control
                that opens something, not as a status label. aria-hidden keeps
                the button's accessible name exactly its two text spans. */}
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 text-slate-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
        </button>
      </div>

      {/* V21 t09 (A9): THE VIEW TOGGLE — list | map, at the very top of the
          feed, above every other control. The founder's ask: "At the very top
          there should be a toggle between list view and map view."

          List is the default on every load (FEED_VIEW_DEFAULT — no persistence;
          see the state declaration). In list view the day sections below are
          the content and the map band does not render; in map view the map
          band IS the primary content (given room) and the day sections do not
          render. The branch rule lives in the pure seam (feedViewShowsMap);
          this row just flips the state.

          Both buttons carry min-h-11 (the 44px tap-target floor the mobile
          audit measures), and aria-pressed mirrors the current view so the
          active choice is announced, not only styled. */}
      <div className="flex gap-2 md:max-w-md" role="group" aria-label="Feed view">
        {(Object.keys(FEED_VIEW_LABELS) as FeedView[]).map((view) => {
          const active = feedView === view
          return (
            <button
              key={view}
              type="button"
              data-testid={`feed-view-toggle-${view}`}
              aria-pressed={active}
              onClick={() => setFeedView(view)}
              className={
                'min-h-11 flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none ' +
                (active
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
              }
            >
              {FEED_VIEW_LABELS[view]}
            </button>
          )
        })}
      </div>

      {/* V27 slice 2: the "what is happening NOW" line — live count, then
          today's count (feedNowSummary; null when neither is non-zero, so
          nothing renders on an empty/loading feed). It sits under the view
          toggle, above the WhileAway inbox, and renders in both views (the
          count is about the feed, not the list, and duplicating it per view
          would be the drift risk the seam exists to remove). */}
      {nowSummary !== null ? (
        <p data-testid="feed-now-summary" className="text-sm font-medium text-slate-700">
          {nowSummary}
        </p>
      ) : null}

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

      {/* V23 slice 1: the shared LocationModal — the feed's ONE location
          control. It replaces the old permanent radius select + zip form,
          which lived here forever and made the page feel crowded. The modal
          owns the address input, radius slider, and apply button; the feed
          passes its own write path through `onApplyRadius`. */}
      <LocationModal
        open={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        radiusMiles={profile.radius_miles ?? DEFAULT_RADIUS_MILES}
        homeZip={profile.home_zip ?? null}
        onGeocode={handleLocationGeocode}
        onApplyRadius={handleLocationApplyRadius}
        mapCenter={locationModalCenter}
        mapHomePin={homePinCoords}
      />

      {/* V23 slice 1: the old permanent radius select + zip form are GONE. The feed's
          ONE location control now lives in the action row above (the secondary
          "Drop-ins near you" button), which opens the shared LocationModal.
          That modal owns the address input, radius slider, and apply button —
          the same surface /browse uses. This removes the two identical Post
          CTAs (the empty state no longer renders its own) and the crowded
          permanent controls that made the page feel cluttered. */}
      {posts === null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
          Loading…
        </div>
      ) : posts.length === 0 && !(feedViewShowsMap(feedView) && homePinCoords !== null) ? (
        /* V8 ticket 02: the honest empty-radius state — the shared
           RadiusEmptyState (Browse renders the same component): the viewer's
           ACTUAL radius in the copy (never "today") plus the way out of an
           empty radius. The radius N is the same value the filter above just
           used (profile.radius_miles with the DEFAULT_RADIUS_MILES fallback).
           V13 ticket 05 (A1): the archive door no longer lives inside this
           shared state — it is the quiet line UNDER the day sections below,
           which only exists when there IS something to list.

           V16 t06 item 1 used to suppress the escapes HERE because a persistent
           radius picker sat directly above this state.
           V23 slice 1 removed that picker, so the feed's ONLY location control
           is now the button that opens the shared LocationModal — the escapes
           are the feed's one-tap widen path inside this empty state, and
           suppressing them was the dead end the bug report names. V27 slice 1
           therefore lets the component render its default escapes (its Browse
           caller is untouched). showPostCta stays false: the raised nav "+" is
           the persistent post action, so a second "Post a drop-in" link here is
           the duplication V23 removed.

           V31 v31-1: showBrowseCta is TRUE here and only here. The feed's parent
           has not seen the places directory (it is one nav tab away and nothing
           in this state offered it), while Browse's parent is already on it — so
           the door is a prop, not a behaviour of the shared component.

           meetup-empty-state: showCreateHere is TRUE here and only here — the
           feed is the caller that can name the viewer's own location (the home
           zip the map band draws), so "Create one here" has a place to seed.
           Browse never passes it. The map-stays-rendered half of Meetup's
           EmptyOrError (mapItems) is ALREADY satisfied by the feed's MAP view
           (the S9 pin in feed-empty-state.e2e.ts: the empty radius draws the
           home-pin map when the Map toggle is tapped). This slice therefore
           does NOT add a map to the list view — that split is deliberate and
           pinned. It adds only the location-seeded create.

           empty-state-one-button (Jon's doctrine, 2026-10-08): the feed's empty
           state now offers ONE control. Jon: *"I'm a minimalist and I don't
           wanna make the user think ... there should just be one button here ...
           WIDEN THE SEARCH."* So the feed passes `widenOnly` — the state renders
           its honest count line and the single filled "Widen the search" button
           (the immediate next radius preset, one step per tap), and suppresses
           the browse door, the escape ladder, the create CTA and the headline.
           This supersedes the props below (showBrowseCta / showCreateHere) for
           the FEED only: Browse never passes `widenOnly`, so its render is
           byte-for-byte unchanged. */
        <RadiusEmptyState
          radiusMiles={profile.radius_miles ?? DEFAULT_RADIUS_MILES}
          showPostCta={false}
          widenOnly
          beyondRadiusCount={beyondRadiusCount}
        />
      ) : feedViewShowsMap(feedView) ? (
        /* V21 t09 (A9): MAP VIEW — the map band is the primary content, given
           room. The day sections do NOT render here: a parent who switched to
           the map wants the map, not the list under it (the branch rule lives
           in the pure seam). The band keeps its "renders only when at least one
           drop-in has a real location" rule — with zero pins there is nothing to
           show on a map, so this state renders the honest line instead of an
           empty canvas (the same "no empty card" rule the browse map follows). */
        <div className="flex flex-col gap-4 md:max-w-md">
          {feedPins.length > 0 ? (
            <div
              data-testid="feed-map-band"
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  {feedPins.length === 1
                    ? '1 place with drop-ins'
                    : `${feedPins.length} places with drop-ins`}
                </span>
              </div>
              <PlacesMap
                className="h-[60dvh] min-h-[320px]"
                /* V19 t02, CORRECTED after the `ocr` review lane caught a real
                   bug: a feed pin now carries the drop-in's REAL place identity
                   where it has one, instead of a synthesised
                   `id: 'feed-pin-N'`. That fake id would have been handed to
                   `/new` by the panel's "Start a drop-in" and rejected by the
                   `playdates.place_id` uuid FK on submit — while "Details"
                   linked to `/place/feed-pin-0`.

                   `placeActions` is true only when EVERY pin names a real
                   directory place. A free-text drop-in has coordinates (from
                   its address) but no `places` row, so a map containing one
                   drops the directory controls rather than offering an action
                   that cannot succeed. Such a pin keeps the informational
                   panel — the place text the parent typed. */
                places={feedPins.map((pin, index) => ({
                  id: feedPinIds[index],
                  name: pin.name === '' ? 'Drop-in location' : pin.name,
                  kind: 'other' as const,
                  address: pin.address,
                  lat: pin.lat,
                  lng: pin.lng,
                  indoor: false,
                  age_min: null,
                  age_max: null,
                  notes: null,
                  photo_url: null,
                  neighborhood_id: null,
                  source: 'feed',
                }))}
                zipCoords={zipCoords}
                homePin={homePinCoords}
                radiusCircle={feedMapFrame}
                placeActions={feedPins.every((pin) => pin.placeId !== null)}
                /* V25 t07: what each pin's popup should say about the EVENT
                   happening there. The browse and picker surfaces pass nothing
                   and are unchanged (see `PlacesMap`'s prop doc). */
                pinEvents={feedPinEvents}
              />
              {/* V19 t02: the same honesty rule the browse map follows. The map
                  frames the NEIGHBOURHOOD (`MAP_FOCUS_RADIUS_MILES`), and the
                  feed's posts are filtered by the viewer's PICKED radius (up to
                  35 mi) — so at the common 5-mile setting most pins sit outside
                  the initial frame. A header saying "6 places with drop-ins"
                  above a map showing two would read as a broken map.

                  `ocr` (medium) flagged exactly this. The count stays (it is
                  about the FEED, which is what the parent is looking at) and
                  the number hidden by the frame is now stated underneath, so
                  the two never contradict each other. */}
              {feedPinsOutsideFrame > 0 ? (
                <p data-testid="feed-map-outside" className="mt-2 text-xs text-slate-500">
                  {feedPinsOutsideFrame}{' '}
                  {feedPinsOutsideFrame === 1 ? 'place is' : 'places are'} outside this{' '}
                  {milesWord(MAP_FOCUS_RADIUS_MILES)} view — switch to List to see them all.
                </p>
              ) : null}
            </div>
          ) : posts.length === 0 ? (
            /* A MAP VIEW MUST PRODUCE A MAP (founder, 2026-10-05, live session
               603cc8d3). The band used to render ONLY when at least one drop-in
               had a real location — *"with zero pins there is nothing to show
               on a map"* — so an empty radius drew a card instead. That card sat
               under a List/Map toggle that had already flipped: the Map button
               filled with the action tone, announced aria-pressed="true", and
               changed nothing underneath, which reads as a broken control rather
               than an empty one. It now draws the canvas the parent asked for,
               framed by their OWN pin and their radius circle — both already in
               hand (`homePinCoords`, `feedMapFrame`), so this adds no read. The
               outer guard guarantees `homePinCoords !== null` on this path.

               SCOPED TO THE EMPTY RADIUS. The case below — posts exist, none has
               a location — keeps the card it was actually written for: there the
               instruction is true and useful, and `e2e/places.e2e.ts` pins it. */
            <div
              data-testid="feed-map-band"
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  You are here — nothing in your radius yet
                </span>
              </div>
              <PlacesMap
                className="h-[60dvh] min-h-[320px]"
                places={[]}
                zipCoords={zipCoords}
                homePin={homePinCoords}
                radiusCircle={feedMapFrame}
                placeActions={false}
                pinEvents={feedPinEvents}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
              No drop-ins have a location yet — switch to List to see them all.
            </div>
          )}
          {/* The empty radius keeps its honest count and its ONE widen control
              UNDER the map (V27 slice 1 / V31 v31-1 / empty-state-one-button):
              the map answers "where am I?", not "is it worth widening?".
              Dropping the card would trade one dead end for another.
              empty-state-one-button: this map-view card now matches the list
              view — `widenOnly`, the single "Widen the search" button, the
              browse door and escape ladder suppressed (the doctrine is per
              CALLER, not per view). */}
          {posts.length === 0 ? (
            <RadiusEmptyState
              radiusMiles={profile.radius_miles ?? DEFAULT_RADIUS_MILES}
              showPostCta={false}
              widenOnly
              beyondRadiusCount={beyondRadiusCount}
            />
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4 md:max-w-md">
          {/* V21 t09 (A9): LIST VIEW — the existing day sections, soonest-first,
              unchanged. The map band does not render here (the founder's ruling:
              "the feed defaults to a LIST"). */}
          {dayGroups.map((group, groupIndex) => {
            const isToday = group.key === todayKey
            return (
              <section key={group.key} className="flex flex-col gap-2">
                <p className="font-display text-lg font-semibold text-slate-900">
                  {group.label}
                </p>
                <div className="flex flex-col gap-3">
                  {group.posts.map((post, postIndex) => (
                    <DropInCard
                      key={post.id}
                      playdate={post}
                      nowIso={nowIso}
                      startsSoon={isStartingSoon(post, nowIso)}
                      countdown={feedCardCountdown(post, nowIso)}
                      rainLabel={
                        isToday
                          ? rainBadgeLabel(
                              rainForecasts[post.id]?.precipitationProbability ?? null,
                            )
                          : undefined
                      }
                      rainForecast={isToday ? (rainForecasts[post.id] ?? null) : undefined}
                      pingToggle={buildCardPingToggle(post)}
                      goingPings={buildCardGoingPings(post)}
                      goingPingsLoaded={pingsByPostId !== null}
                      kidsGoingCount={buildCardKidsCount(post)}
                      kidsGoingAgeBand={kidAgeBandsByPostId?.[post.id] ?? null}
                      metBeforeLabel={buildCardMetBeforeLabel(post)}
                      ageRangeLabel={buildCardAgeRangeLabel(post)}
                      hostCommonGroundLabel={buildCardHostCommonGround(post)}
                      eagerAvatar={groupIndex === 0 && postIndex === 0}
                    />
                  ))}
                </div>
              </section>
            )
          })}

          {/* V9 ticket 04: the archive's one door on the feed. It sits UNDER
              the day sections (the ticket's placement) as a quiet line, not a
              card and not a button: it is navigation to the viewer's own
              history, never a claim that the history is interesting. The label
              is a shared constant so this line and any future empty-state usage cannot drift. V13 ticket 05 (A1): this is now the ONLY "past drop-ins" link in the app — the empty-radius state no longer carries one.

              The row is a 44px target (`inline-flex min-h-11`) because the
              launch audit measured it at 133x19 at all three viewports, and
              WCAG 2.5.8's inline exemption cannot rescue a link with no sibling
              text. It stays a quiet line: no background, no border, no card. */}
          <p className="text-center text-sm">
            <Link
              to={pastDropInsHref(profile?.display_name)}
              className="inline-flex min-h-11 items-center font-medium text-indigo-600 underline-offset-2 hover:underline"
            >
              {PAST_DROP_INS_LABEL}
            </Link>
          </p>
        </div>
      )}

      {/* r3-7: the first-run tooltips — mounted only while the gate says show
          (the page owns the decision; the component is the tour itself). */}
      {showTooltips ? <FirstRunTooltips onDismiss={dismissTooltips} /> : null}
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
