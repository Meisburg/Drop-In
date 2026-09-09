import { useState } from 'react'
import { Link } from 'react-router'
import { ReportDialog } from './ReportDialog'
import { isHappeningNow } from '../lib/feed'
import type { PlaydateWithNeighborhood } from '../lib/types'

/**
 * One drop-in in the feed / browse lists (slice 3). Title, place,
 * neighborhood, a locale-formatted time window, and the host's public
 * handle; live drop-ins get a "Happening now" badge. Tapping navigates to
 * /playdate/:id. Slice 4 adds a small report flag (post report: the post +
 * its host) — the button lives inside the card link, so a click on it must
 * not navigate (preventDefault + stopPropagation).
 */
export function DropInCard({
  playdate,
  nowIso,
}: {
  playdate: PlaydateWithNeighborhood
  nowIso: string
}) {
  const [reporting, setReporting] = useState(false)
  const live = isHappeningNow(playdate, nowIso)
  return (
    <Link
      to={`/playdate/${playdate.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-300"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">{playdate.title}</h3>
          <div className="flex shrink-0 items-center gap-1">
            {live ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Happening now
              </span>
            ) : null}
            <button
              type="button"
              aria-label={`Report ${playdate.title}`}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setReporting(true)
              }}
              className="rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
            >
              <FlagIcon />
            </button>
          </div>
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
      {reporting ? (
        <ReportDialog
          targetLabel="this drop-in"
          playdateId={playdate.id}
          profileId={playdate.host.id}
          onClose={() => setReporting(false)}
        />
      ) : null}
    </Link>
  )
}

/** A small flag (the report entry). */
function FlagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" x2="4" y1="22" y2="15" />
    </svg>
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