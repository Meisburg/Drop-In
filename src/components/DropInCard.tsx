import { Link } from 'react-router'
import { isHappeningNow } from '../lib/feed'
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
 */
export function DropInCard({
  playdate,
  nowIso,
}: {
  playdate: PlaydateWithNeighborhood
  nowIso: string
}) {
  const live = isHappeningNow(playdate, nowIso)
  return (
    <Link
      to={`/playdate/${playdate.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-300"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">{playdate.title}</h3>
          {live ? (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Happening now
            </span>
          ) : null}
        </div>
        <p className="text-sm text-slate-700">{playdate.place}</p>
        <p className="text-sm text-slate-500">
          {playdate.neighborhood.name} · {formatTimeWindow(playdate.starts_at, playdate.ends_at)}
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