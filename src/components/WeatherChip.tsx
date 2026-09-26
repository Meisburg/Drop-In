import { useState } from 'react'
import { weatherPanelFor, type DailyForecast } from '../lib/weather'

/**
 * The tappable weather chip (V24 slice 04, ticket 04).
 *
 * It renders in TWO places — the feed card's badge slot (`DropInCard`) and the
 * playdate detail page's time line — and both work from THIS one seam: the
 * decision of what the panel shows and whether the chip is interactive at all is
 * `weather.weatherPanelFor` (pure, in `src/lib/`, unit-tested), so the two
 * surfaces cannot drift.
 *
 * The null rule is the load-bearing one: a NULL (or fact-less) forecast renders
 * the plain badge the app already shipped — NOT a disabled-looking button, NOT a
 * tap that opens an empty panel, NOT an error (the zero-pressure soul).
 *
 * The disclosure is announced with `aria-expanded` alone: the panel is MOUNTED
 * only while open, so an `aria-controls` pointing at it would dangle (an ARIA
 * reference to an id that is not in the document) whenever the chip is closed.
 *
 * Tapping is intercepted (`preventDefault` + `stopPropagation`) because the feed
 * card is itself a `<Link>` — the same pinned pattern as the card's going
 * toggle: the chip opens its own panel, the card still navigates when tapped
 * anywhere else. The panel is an inline `<span>` (display:block), never a
 * portalled popover, so it is valid inside the card's `<Link>` AND inside the
 * detail page's `<p>` time line, and it can never be clipped or stacked behind
 * the map.
 */
export function WeatherChip({
  label,
  forecast,
  whenLabel,
}: {
  /** The badge's own words — the pure `feed.rainBadgeLabel` output. */
  label: string
  /** The event's forecast, or null (the pre-fetch / failed-fetch state). */
  forecast: DailyForecast | null
  /** The event's window, formatted by the CALLER (the two surfaces differ). */
  whenLabel: string
}) {
  const [open, setOpen] = useState(false)
  const panel = weatherPanelFor(forecast, whenLabel)
  const pill =
    'inline-flex min-h-11 items-center rounded-full bg-sky-100 px-2.5 text-xs font-medium text-sky-700'

  if (panel === null) {
    // No forecast (or nothing in it worth a tap): the chip stays exactly what it
    // was before this ticket — a non-interactive badge, no empty panel.
    return <span className={pill}>☔ {label}</span>
  }

  return (
    <>
      <button
        type="button"
        data-testid="weather-chip"
        aria-expanded={open}
        aria-label={`${label} — see the forecast for this drop-in`}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen((wasOpen) => !wasOpen)
        }}
        className={`${pill} outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-sky-500 hover:bg-sky-200`}
      >
        ☔ {label}
      </button>
      {open ? (
        <span
          data-testid="weather-panel"
          className="mt-1 block w-full basis-full rounded-xl border border-sky-200 bg-sky-50 p-3 text-left"
        >
          <span className="block text-xs font-semibold text-sky-900">{panel.title}</span>
          <span className="mt-1 block text-xs text-sky-800">
            {panel.lines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </span>
        </span>
      ) : null}
    </>
  )
}
