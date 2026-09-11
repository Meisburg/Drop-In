import { Link } from 'react-router'
import { PhotoButton } from './ImageLightbox'
import {
  buildGoingLine,
  formatDistanceLabel,
  GOING_CIRCLE_LIMIT,
  isEnded,
  isHappeningNow,
  type GoingPinger,
} from '../lib/feed'
import type { PlaydateHost, PlaydateWithNeighborhood } from '../lib/types'

/**
 * One drop-in in the feed / browse lists (slice 3). Title, place,
 * neighborhood, a locale-formatted time window, and the host's public
 * handle; live drop-ins get a "Happening now" badge. Tapping navigates to
 * /playdate/:id. (V2 slice 1: the card's report flag is gone — reporting
 * lives on the detail page and the profile page, so the card stays clean at
 * 375px.)
 *
 * V2 slice 2: the host line gains a 40px round avatar (the host's
 * avatar_url, with an initial-fallback circle when there is none).
 *
 * V2 slice 3: the card's meta line gains the radius feed's "N mi"
 * distance label (integer miles, from the pure haversine predicate) when
 * the post came through the radius feed (distanceMiles set).
 *
 * V3 slice 1 (ticket 01): an ended post (feed.isEnded, ends_at <= now)
 * renders grayed with an "Ended" badge — the feed's Today section demotes
 * these behind the upcoming ones. A "Starts soon" badge (amber) renders in
 * the same badge slot as "Happening now" when the page passes startsSoon
 * (the single soonest upcoming event of the Today section that starts
 * within 60 min — the page decides who gets it, the card only renders it).
 * Cards never carry a per-card day label — the day section headers do.
 *
 * V3 slice 2 (ticket 02): a host-marked post (playdate.status
 * 'cancelled' — 0016, trimmed to 'on' | 'cancelled' by 0019) renders
 * muted like an ended post: the status chip takes the badge slot (the
 * host's explicit state wins over the time-based badges) + the
 * grayed-out card (the event STAYS in the feed — the host can revert;
 * no auto-expiry). Pre-0016-apply the row lacks the column (undefined →
 * the normal styling). The optional "Rain likely" badge (the rainLabel
 * prop, from the page's best-effort Open-Meteo fetch) renders in the
 * same slot, independent of the status (a forecast, not a state) — only
 * Today-section cards get it (the page decides; BrowsePage passes
 * nothing new).
 *
 * V3 slice 3 (ticket 06, the quick feedback batch): a 32px circular
 * "going" check toggle in the card's top-right (the badge cluster's last
 * item — appended, never shifting the content at 375px). Inactive:
 * white bg + slate border + gray check; active (this post is pinged by
 * the viewer): green-600 fill + white check. The click stops
 * propagation + prevents the default so the card's <Link> still
 * navigates when tapped elsewhere. Hidden (the pingToggle prop
 * omitted) on the host's own posts (the detail's host panel covers it)
 * and in the signed-out public view (DropInCard is not used there — the
 * sign-up prompt stands in); the feed page owns the optimistic write
 * path (toggle + revert on error, the detail page's behavior).
 *
 * V3 slice 4 (ticket 07): the card's age-hint line is REPLACED by the
 * going line (feedback #1 — "it'd be cool to see their little circles"):
 * "N going" + up to 3 pinger avatar circles (24px, -8px overlap) + a
 * "+N" overflow chip. The circles are the pingers' avatars (the feed
 * page's listPingsForPosts group, in the 0020 created_at order), with a
 * display-name initial on a slate-200 circle as the fallback; names
 * never surface on cards (the guest list stays on the detail page per
 * ticket 05). count 0 → the line is hidden. The host's own posts keep
 * the line (the host sees who's coming — unlike the ping toggle, which
 * is hidden there).
 */
export function DropInCard({
  playdate,
  nowIso,
  startsSoon = false,
  rainLabel = null,
  pingToggle,
  goingPings = [],
  kidsGoingCount = 0,
}: {
  playdate: PlaydateWithNeighborhood
  nowIso: string
  /** V3 slice 1: the feed's Today-section "Starts soon" badge (see above). */
  startsSoon?: boolean
  /** V3 slice 2: the Today-section "Rain likely" badge (see above). */
  rainLabel?: string | null
  /**
   * V3 slice 3 (ticket 06): the card's "going" check toggle (see above).
   * Omitted = no toggle (BrowsePage; the host's own posts; the signed-out
   * public view never renders a DropInCard at all).
   */
  pingToggle?: DropInCardPingToggle
  /**
   * V3 slice 4 (ticket 07): this post's pingers (the feed page's
   * listPingsForPosts group, in ping order). Rendered as the card's
   * going line (buildGoingLine: "N going" + up to 3 circles + a "+N"
   * chip), replacing the old age-hint line. Empty (BrowsePage; no pings)
   * = no line.
   */
  goingPings?: ReadonlyArray<GoingPinger>
  /**
   * V6 (migration 0027): how many kids are coming, for the card's line. A bare
   * COUNT — decision #2 keeps names and ages off the card entirely (they reach
   * only the host and the people going, through the 0026 gated RPC).
   */
  kidsGoingCount?: number
}) {
  const live = isHappeningNow(playdate, nowIso)
  const ended = isEnded(playdate, nowIso)
  // V3 slice 2 (ticket 02; trimmed by V3 slice 3, ticket 06 + migration
  // 0019): the host's status chip (null = 'on' / the column is absent
  // pre-0016-apply → the normal, non-muted styling). The chip renders
  // for "Cancelled" only (the redundant option was removed — the muted
  // styling stays); the "Rain likely" badge is an independent forecast.
  const statusChip = playdate.status === 'cancelled' ? 'Cancelled' : null
  const muted = ended || statusChip !== null
  // The radius feed's per-post distance (V2 slice 3, the "N mi" label,
  // integer miles — the pure haversine predicate in feed.ts). Undefined
  // outside the radius feed (e.g. the detail page) → no label.
  const distanceLabel =
    playdate.distanceMiles !== undefined && playdate.distanceMiles !== null
      ? formatDistanceLabel(playdate.distanceMiles)
      : null
  // V3 slice 4 (ticket 07): the card's going line (null = hidden — no
  // pings yet). The page owns the data (the listPingsForPosts group); the
  // card applies the pure buildGoingLine with the 3-circle cap.
  const goingLine = buildGoingLine(
    goingPings.length,
    goingPings,
    GOING_CIRCLE_LIMIT,
    kidsGoingCount,
  )
  const cardClasses = [
    'block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-300',
    muted ? 'opacity-60' : '',
  ]
    .filter((c) => c !== '')
    .join(' ')
  return (
    <Link to={`/playdate/${playdate.id}`} className={cardClasses}>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">{playdate.title}</h3>
          {/* The badge slot: the host's status chip first (the explicit
              state wins — a cancelled post does not also say
              "Happening now"), then the time-based badges, then the
              independent "Rain likely" forecast badge, then the
              "going" check toggle (V3 slice 3, ticket 06 — the
              card's top-right circle; appended last so it never shifts
              the badges or the content at 375px). */}
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {statusChip !== null ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {statusChip}
              </span>
            ) : ended ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                Ended
              </span>
            ) : live ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Happening now
              </span>
            ) : startsSoon ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Starts soon
              </span>
            ) : null}
            {rainLabel !== null && rainLabel !== '' ? (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                ☔ {rainLabel}
              </span>
            ) : null}

          </div>
        </div>
        <p className="text-sm text-slate-700">{playdate.place}</p>
        <p className="text-sm text-slate-600">
          {playdate.neighborhood.name} · {formatTimeWindow(playdate.starts_at, playdate.ends_at)}
          {distanceLabel !== null ? ` · ${distanceLabel}` : ''}
        </p>
        <div className="flex items-center gap-2">
          <HostAvatar host={playdate.host} />
          <p className="text-sm text-slate-500">@{playdate.host.display_name}</p>
        </div>
        {/* V6 (first phone feedback): the going toggle used to be a bare
            circle in the badge cluster, and it read as a status badge rather
            than a button — 'it's not clear that's indicating that you're
            going'. It is now a LABELLED pill in the card's action row, so it
            says what it does; and the same row carries a 'More info' chevron
            so the card's tappability is advertised instead of assumed. */}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-slate-100 pt-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {goingLine !== null ? (
              <>
                <span className="text-xs text-slate-600">{goingLine.label}</span>
                <div className="flex items-center">
                  {goingLine.circles.map((circle, index) =>
                    circle.avatarUrl !== null && circle.avatarUrl !== '' ? (
                      <img
                        key={index}
                        src={circle.avatarUrl}
                        alt=""
                        className={`h-6 w-6 rounded-full border-2 border-white object-cover${index > 0 ? ' -ml-2' : ''}`}
                      />
                    ) : (
                      <span
                        key={index}
                        aria-hidden="true"
                        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-xs font-semibold text-slate-600${index > 0 ? ' -ml-2' : ''}`}
                      >
                        {circle.initial}
                      </span>
                    ),
                  )}
                </div>
                {goingLine.overflow > 0 ? (
                  <span className="text-xs font-medium text-slate-600">+{goingLine.overflow}</span>
                ) : null}
              </>
            ) : (
              <span className="text-xs text-slate-600">
                {pingToggle?.enabled ? 'No one’s said they’re going yet' : 'No one’s going yet'}
              </span>
            )}
          </div>
          {pingToggle?.enabled ? (
            <button
              type="button"
              aria-pressed={pingToggle.active}
              aria-label={
                pingToggle.active
                  ? `Going — tap to take it back`
                  : `Say we’re going to ${playdate.title}`
              }
              disabled={pingToggle.busy}
              onClick={(event) => {
                // The card is a <Link>: the toggle must NOT navigate —
                // prevent the default (the href) and stop the click from
                // reaching the card (the link still navigates when the card
                // itself is tapped).
                event.preventDefault()
                event.stopPropagation()
                if (!pingToggle.busy) pingToggle.onToggle()
              }}
              className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors disabled:opacity-60 ${
                pingToggle.active
                  ? 'border-green-700 bg-green-700 text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              <svg
                viewBox="0 0 16 16"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M3.5 8.5 6.5 11.5 12.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {pingToggle.active ? 'Going' : 'I’m going'}
            </button>
          ) : null}
        </div>
        {/* The card is a link, so this is a label, not a nested control
            (an <a> inside an <a> is invalid HTML) — it advertises where a tap
            already goes. */}
        <div className="flex items-center justify-end gap-1 text-sm font-medium text-indigo-600">
          More info
          <span aria-hidden="true">›</span>
        </div>
      </div>
    </Link>
  )
}

/**
 * The card's "going" check toggle (V3 slice 3, ticket 06): the feed page
 * owns the write path (the optimistic toggle + revert on error, the
 * detail page's behavior) and hands each card its slice of the state.
 * The card only renders — it never issues the query itself.
 */
export interface DropInCardPingToggle {
  /** Render + enable (the caller confirmed a signed-in, non-host viewer). */
  enabled: boolean
  /** The viewer has pinged this post (the green-700 filled state). */
  active: boolean
  /** The write path is in flight (the circle is disabled while pending). */
  busy: boolean
  /** Issue the toggle (the feed's optimistic write path). */
  onToggle: () => void
}

/**
 * A 40px round host avatar (V2 ticket 02): the host's avatar_url when set,
 * otherwise a deterministic initial-fallback circle (the same shape the
 * comment list will reuse — "comments-ready" per the ticket AC).
 *
 * V3 slice 7 (ticket 10): `size` — 'md' (the default, 40px: every
 * existing call site — the card's host line, the detail page's host line,
 * /u/:handle, and top-level comment rows) or 'sm' (24px — the indented
 * one-level reply rows under the detail page's comment thread).
 */
export function HostAvatar({
  host,
  size = 'md',
  expandable = false,
}: {
  host: PlaydateHost
  size?: 'md' | 'sm'
  /**
   * V6: when the avatar has a photo, tapping it opens the full-screen
   * viewer instead of doing nothing. Deliberately opt-in — on the feed card
   * the whole surface is a link to the drop-in, and intercepting the avatar
   * there would break the card's one obvious gesture. An initial-fallback
   * circle has nothing to enlarge, so it stays inert.
   */
  expandable?: boolean
}) {
  const box = size === 'sm' ? 'h-6 w-6' : 'h-10 w-10'
  const initialClass = size === 'sm' ? 'text-xs' : 'text-sm'
  const photoUrl = host.avatar_url ?? ''
  if (photoUrl !== '') {
    const photo = (
      <img src={photoUrl} alt="" className={`${box} shrink-0 rounded-full object-cover`} />
    )
    return expandable ? (
      <PhotoButton src={photoUrl} alt={`${host.display_name}’s photo`}>
        {photo}
      </PhotoButton>
    ) : (
      photo
    )
  }
  return (
    <span
      aria-hidden
      className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-indigo-100 ${initialClass} font-semibold text-indigo-500`}
    >
      {(host.display_name.charAt(0) || '?').toUpperCase()}
    </span>
  )
}

/** Locale-formatted time window, e.g. "3 PM–5 PM" (minutes drop at :00). */
function formatTimeWindow(startIso: string, endIso: string): string {
  const format = (iso: string): string => {
    const d = new Date(iso)
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: d.getMinutes() === 0 ? undefined : '2-digit',
    })
  }
  return `${format(startIso)}–${format(endIso)}`
}