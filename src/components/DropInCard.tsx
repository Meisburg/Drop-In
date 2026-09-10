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
 */
export function DropInCard({
  playdate,
  nowIso,
  startsSoon = false,
}: {
  playdate: PlaydateWithNeighborhood
  nowIso: string
  /** V3 slice 1: the feed's Today-section "Starts soon" badge (see above). */
  startsSoon?: boolean
}) {
  const live = isHappeningNow(playdate, nowIso)
  const ended = isEnded(playdate, nowIso)
  // The radius feed's per-post distance (V2 slice 3, the "N mi" label,
  // integer miles — the pure haversine predicate in feed.ts). Undefined
  // outside the radius feed (e.g. the detail page) → no label.
  const distanceLabel =
    playdate.distanceMiles !== undefined && playdate.distanceMiles !== null
      ? formatDistanceLabel(playdate.distanceMiles)
      : null
  const cardClasses = [
    'block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-300',
    ended ? 'opacity-60' : '',
  ]
    .filter((c) => c !== '')
    .join(' ')
  return (
    <Link to={`/playdate/${playdate.id}`} className={cardClasses}>
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">{playdate.title}</h3>
          {ended ? (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              Ended
            </span>
          ) : live ? (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Happening now
            </span>
          ) : startsSoon ? (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Starts soon
            </span>
          ) : null}
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