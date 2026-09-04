import { Link } from 'react-router'
import { isHappeningNow } from '../lib/feed'
import type { PlaydateWithNeighborhood } from '../lib/types'

/**
 * One drop-in in the feed / browse lists (slice 3). Title, place,
 * neighborhood, a locale-formatted time window, and the host's public
 * handle; live drop-ins get a "Happening now" badge. Tapping navigates to
 * /playdate/:id (the detail page lands in slice 4 — the placeholder is
 * correct for now).
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
        <p className="text-sm text-slate-400">@{playdate.host.display_name}</p>
        {playdate.age_hint ? (
          <p className="text-xs text-slate-500">Best for {playdate.age_hint}</p>
        ) : null}
      </div>
    </Link>
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