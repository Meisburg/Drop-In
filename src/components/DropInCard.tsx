import { Link } from 'react-router'
import { formatDistanceLabel, isEnded, isHappeningNow } from '../lib/feed'
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
 * 'rained_out' / 'cancelled' — 0016) renders muted like an ended post:
 * the status chip takes the badge slot (the host's explicit state wins
 * over the time-based badges) + the grayed-out card (the event STAYS in
 * the feed — the host can revert; no auto-expiry). Pre-0016-apply the row
 * lacks the column (undefined → the normal styling). The optional
 * "Rain likely" badge (the rainLabel prop, from the page's best-effort
 * Open-Meteo fetch) renders in the same slot, independent of the status
 * (a forecast, not a state) — only Today-section cards get it (the page
 * decides; BrowsePage passes nothing new).
 */
export function DropInCard({
  playdate,
  nowIso,
  startsSoon = false,
  rainLabel = null,
}: {
  playdate: PlaydateWithNeighborhood
  nowIso: string
  /** V3 slice 1: the feed's Today-section "Starts soon" badge (see above). */
  startsSoon?: boolean
  /** V3 slice 2: the Today-section "Rain likely" badge (see above). */
  rainLabel?: string | null
}) {
  const live = isHappeningNow(playdate, nowIso)
  const ended = isEnded(playdate, nowIso)
  // V3 slice 2 (ticket 02): the host's status chip (null = 'on' / the
  // column is absent pre-0016-apply → the normal, non-muted styling).
  const statusChip =
    playdate.status === 'rained_out'
      ? 'Rained out'
      : playdate.status === 'cancelled'
        ? 'Cancelled'
        : null
  const muted = ended || statusChip !== null
  // The radius feed's per-post distance (V2 slice 3, the "N mi" label,
  // integer miles — the pure haversine predicate in feed.ts). Undefined
  // outside the radius feed (e.g. the detail page) → no label.
  const distanceLabel =
    playdate.distanceMiles !== undefined && playdate.distanceMiles !== null
      ? formatDistanceLabel(playdate.distanceMiles)
      : null
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
              state wins — a "Rained out" post does not also say
              "Happening now"), then the time-based badges, then the
              independent "Rain likely" forecast badge. */}
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {statusChip !== null ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                {statusChip}
              </span>
            ) : ended ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
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
        <p className="text-sm text-slate-500">
          {playdate.neighborhood.name} · {formatTimeWindow(playdate.starts_at, playdate.ends_at)}
          {distanceLabel !== null ? ` · ${distanceLabel}` : ''}
        </p>
        <div className="flex items-center gap-2">
          <HostAvatar host={playdate.host} />
          <p className="text-sm text-slate-400">@{playdate.host.display_name}</p>
        </div>
        {playdate.age_hint ? (
          <p className="text-xs text-slate-500">Best for {playdate.age_hint}</p>
        ) : null}
      </div>
    </Link>
  )
}

/**
 * A 40px round host avatar (V2 ticket 02): the host's avatar_url when set,
 * otherwise a deterministic initial-fallback circle (the same shape the
 * comment list will reuse — "comments-ready" per the ticket AC).
 */
export function HostAvatar({ host }: { host: PlaydateHost }) {
  return host.avatar_url !== undefined && host.avatar_url !== null && host.avatar_url !== '' ? (
    <img
      src={host.avatar_url}
      alt=""
      className="h-10 w-10 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-500"
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