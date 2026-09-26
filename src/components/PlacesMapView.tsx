import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { PlacesMap } from './PlaceMap'
import {
  formatDistanceLabel,
  type ZipCoords,
} from '../lib/feed'
import { nearestCardIndex, nextCardIndex } from '../lib/mapStrip'
import { placeIndoorLabel, placeKindLabel, placePath } from '../lib/places'
import type { PlaceListRow } from '../lib/places'
import { reviewRatingLine } from '../lib/reviews'

/**
 * V24 slice 10 — THE MAP VIEW: one map, a horizontally swipeable strip of cards
 * along the bottom, and ONE focused card that both the strip and the map agree
 * on.
 *
 * WHY THIS IS A SEPARATE COMPONENT FROM `PlaceDirectory`, and not more JSX
 * inside it. The directory is already 900+ lines and owns search, filter, sort,
 * the distance control, the date window, two modals, the map band and the
 * grouped list. The map view is a different SURFACE over the same data: it has
 * its own focus state, its own scroll handling and its own keyboard rules. Adding
 * it inline would put two focus models in one file. It is a component, not a
 * route — see `PlaceDirectory`'s `view` state for why there is no new route.
 *
 * THE MEASURED TRAP THIS COMPONENT IS SHAPED AROUND: two mounted Leaflet maps
 * means two `data-testid="places-map"` nodes, and every existing spec that does
 * `page.getByTestId('places-map')` then dies in Playwright strict mode. So the
 * directory REPLACES the band and the list with this view rather than sitting
 * beside them, and this view's map gets its OWN test id
 * (`places-map-view-map`, passed through `PlacesMap`'s existing `testId` prop).
 * At most ONE map is mounted at any moment.
 *
 * FOCUS IS THE SINGLE SOURCE OF TRUTH (`focusedIndex` below). Everything else
 * is a rendering of it:
 *
 *   - a SWIPE does not set the index directly. A rAF-throttled scroll handler
 *     maps the strip's live scroll position through `nearestCardIndex` — the
 *     pure comparison in `src/lib/mapStrip.ts` — so the index is derived from
 *     the same geometry the browser snapped to. `scrollend` is deliberately NOT
 *     used: its support is not universal, and a handler that never fires on an
 *     older engine is a map that stops following the strip.
 *   - the KEYBOARD (ArrowLeft/ArrowRight on a focused card) and the explicit
 *     Previous/Next buttons both move through `nextCardIndex` — the same pure
 *     rule, so the two paths cannot disagree about the ends of the strip.
 *     A swipe is therefore never the ONLY way to change the focus.
 *   - the MAP recentres from the focused place's id, through `PlacesMap`'s
 *     controlled `focusPlaceId` prop. It is never panned twice by two
 *     mechanisms.
 *
 * WHAT THIS COMPONENT DOES NOT DO: it does not re-derive the result set. The
 * rows arrive from `PlaceDirectory`'s own `planDirectoryList` output — the SAME
 * filtered, sorted, date-windowed array the list was showing — so the map view
 * cannot disagree with the list it replaced.
 */
export function PlacesMapView({
  rows,
  allRows,
  zipCoords,
  homePin,
  focusBehavior,
  onBackToList,
}: {
  /**
   * The rows the STRIP shows, in the list's own order — only those the map can
   * place. Passed pre-filtered by the caller so this component never re-derives
   * the result set.
   */
  rows: readonly PlaceListRow[]
  /**
   * The directory's FULL rendered row set, including rows the map cannot place.
   * They get no card (there is no pin to recentre on) but they must not vanish:
   * the list below the strip keeps every one of them reachable.
   */
  allRows: readonly PlaceListRow[]
  /** The gazetteer zip→coords map, handed straight to the map. */
  zipCoords: ReadonlyMap<string, ZipCoords> | null
  /** The viewer's home pin (the map's frame when there is one). */
  homePin: { lat: number; lng: number } | null
  /** `scrollBehaviorFor(reducedMotion)` — computed by the caller, never here. */
  focusBehavior: ScrollBehavior
  /** "Back to list" — restores the parent directory's view AND its scroll. */
  onBackToList: () => void
}) {
  const [focusedIndex, setFocusedIndex] = useState(0)
  const stripRef = useRef<HTMLDivElement | null>(null)
  /**
   * One ref per card, so a focus MOVE can put real DOM focus on the card the
   * index names. This is what makes the arrow keys work with no pointer at all
   * (and with no touch): the index moving is not enough, the browser's focus has
   * to move with it or the next keypress lands somewhere else.
   */
  const cardRefs = useRef<Array<HTMLAnchorElement | null>>([])
  // The rAF handle for the scroll handler. One pending frame at a time: a scroll
  // fires dozens of events, and one `getBoundingClientRect` per event is a
  // forced layout in the middle of the scroll. The frame samples once.
  const frameRef = useRef<number | null>(null)
  /**
   * The scroll behaviour is read from inside event handlers and effects, which
   * are attached once and must keep seeing the LIVE value. A ref is the standard
   * tool for that, but it is updated in an EFFECT rather than during render:
   * writing a ref while rendering is the pattern `react(refs)` flags, and it is
   * also the one that breaks under a render React throws away. An effect cannot
   * be discarded, so the handler can only ever see a value that was committed.
   */
  const behaviorRef = useRef<ScrollBehavior>(focusBehavior)
  useEffect(() => {
    behaviorRef.current = focusBehavior
  }, [focusBehavior])

  /**
   * A NEW RESULT SET RESTARTS THE STRIP, and this is a correctness rule rather
   * than a nicety. `focusedIndex` is an INDEX, so it outlives the rows it
   * indexes: narrowing the search while the map is open could leave index 5
   * pointing at a different place — or at nothing. Resetting to the first card
   * (and scrolling the strip back to it) is the only state that is always true
   * of the new set. The identity is the row ids, not the array — the parent
   * hands a fresh array on every render.
   */
  const rowsKey = rows.map((row) => row.place.id).join('|')
  const lastRowsKeyRef = useRef(rowsKey)
  useEffect(() => {
    if (lastRowsKeyRef.current === rowsKey) return
    lastRowsKeyRef.current = rowsKey
    setFocusedIndex(0)
    const strip = stripRef.current
    if (strip !== null) strip.scrollTo({ left: 0, behavior: behaviorRef.current })
  }, [rowsKey])

  const count = rows.length
  const focusedRow = rows.length === 0 ? null : (rows[Math.min(focusedIndex, count - 1)] ?? null)
  const focusedPlaceId = focusedRow === null ? null : focusedRow.place.id

  /**
   * The scroll → index mapping. Skips cards whose boxes cannot be measured (the
   * array is passed through `nearestCardIndex`'s own NaN guard as well), and
   * skips the write when the index has not changed — a scroll frame that sets
   * the same state is a re-render per frame for no reason.
   */
  const syncFocusToScroll = useCallback(() => {
    frameRef.current = null
    const strip = stripRef.current
    if (strip === null) return
    const stripBox = strip.getBoundingClientRect()
    const stripCenter = stripBox.left + stripBox.width / 2
    const centers = cardRefs.current.map((card) => {
      if (card === null) return Number.NaN
      const box = card.getBoundingClientRect()
      return box.left + box.width / 2
    })
    const nearest = nearestCardIndex(stripCenter, centers)
    setFocusedIndex((current) => (current === nearest ? current : nearest))
  }, [])

  useEffect(() => {
    const strip = stripRef.current
    if (strip === null) return
    const onScroll = () => {
      if (frameRef.current !== null) return
      frameRef.current = requestAnimationFrame(() => syncFocusToScroll())
    }
    strip.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      strip.removeEventListener('scroll', onScroll)
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [syncFocusToScroll])

  /**
   * Move the focus one card, and take the DOM focus with it.
   *
   * The step itself is `nextCardIndex` (clamps — see its doc comment in
   * `src/lib/mapStrip.ts` for why it does not wrap). `focus({ preventScroll:
   * true })` is the non-obvious half: without the option the browser scrolls the
   * PAGE to bring the card into view, which would slide the map off screen the
   * moment a parent pressed ArrowRight. The strip is then scrolled explicitly,
   * with the reduced-motion-derived behaviour — the same value the map uses, so
   * the card and the pin move together or neither animates.
   */
  function moveFocus(delta: number) {
    if (count === 0) return
    const target = nextCardIndex(focusedIndex, delta, count)
    setFocusedIndex(target)
    const card = cardRefs.current[target]
    if (card === undefined || card === null) return
    card.focus({ preventScroll: true })
    card.scrollIntoView({ behavior: behaviorRef.current, inline: 'center', block: 'nearest' })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The map panel. Its own test id — never `places-map` — because every
          existing spec locates the directory's map by that name and a second
          match would fail them in strict mode. The height is shorter than the
          list's band on purpose: the strip below it needs room too, and the two
          together have to fit one phone screen. */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
          <span className="text-xs font-medium text-slate-500">
            {count === 1 ? '1 place on the map' : `${count} places on the map`}
          </span>
          <button
            type="button"
            data-testid="places-back-to-list"
            onClick={onBackToList}
            className="min-h-11 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 hover:bg-slate-50"
          >
            Back to list
          </button>
        </div>
        <PlacesMap
          className="h-[38dvh] min-h-[200px]"
          places={rows.map((row) => row.place)}
          zipCoords={zipCoords}
          homePin={homePin}
          focusPlaceId={focusedPlaceId}
          focusBehavior={focusBehavior}
          testId="places-map-view-map"
        />
      </div>

      {/* The strip. `overflow-x-auto` + `snap-x snap-mandatory` and `snap-center`
          children — CSS only, no gesture library and no new dependency. It is
          one-dimensional horizontal scrolling; nothing here touches vertical
          page scroll. `overscroll-x-contain` keeps a hard swipe at the end of the
          strip from triggering the browser's back gesture.

          The container is deliberately NOT focusable: the cards are real links,
          so a keyboard user Tabs straight into the strip rather than landing on
          an empty scroller first. */}
      <div
        ref={stripRef}
        data-testid="places-map-strip"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2"
      >
        {rows.map((row, index) => {
          const ratingLine =
            row.ratingSummary !== null && row.ratingSummary.hasReviews
              ? reviewRatingLine(
                  row.ratingSummary.count,
                  row.ratingSummary.displayAverage,
                  row.place.name,
                )
              : null
          const focused = index === focusedIndex
          return (
            <Link
              key={row.place.id}
              to={placePath(row.place.id)}
              ref={(node) => {
                cardRefs.current[index] = node
              }}
              data-testid={`places-map-card-${index}`}
              aria-current={focused ? 'true' : undefined}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') {
                  event.preventDefault()
                  moveFocus(-1)
                } else if (event.key === 'ArrowRight') {
                  event.preventDefault()
                  moveFocus(1)
                }
              }}
              className={
                'flex min-w-[85%] shrink-0 snap-center flex-col gap-1 rounded-xl border bg-white p-3 shadow-sm outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:min-w-[300px] ' +
                (focused
                  ? 'border-indigo-500 ring-2 ring-indigo-200'
                  : 'border-slate-200 hover:bg-slate-50')
              }
            >
              <span className="text-sm font-semibold text-slate-900">{row.place.name}</span>
              <span className="text-xs text-slate-600">
                {placeKindLabel(row.place.kind)} · {placeIndoorLabel(row.place)}
                {' · '}
                {row.distanceMiles !== null
                  ? formatDistanceLabel(row.distanceMiles)
                  : 'Distance unknown'}
              </span>
              <span className="text-xs text-slate-500">{row.place.address}</span>
              {ratingLine !== null ? (
                <span className="text-xs font-medium text-amber-700">{ratingLine}</span>
              ) : null}
            </Link>
          )
        })}
      </div>

      {/* The explicit controls. A swipe must never be the only way to change the
          focus, so the same step the arrow keys take is available as two real
          buttons with accessible names. They are DISABLED at the strip's ends —
          the visible half of "nextCardIndex clamps": the control says there is no
          further card rather than silently doing nothing. */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          data-testid="places-map-prev"
          onClick={() => moveFocus(-1)}
          disabled={focusedIndex <= 0}
          className="flex min-h-11 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 hover:bg-slate-50 disabled:opacity-50"
        >
          <span aria-hidden="true">←</span> Previous
        </button>
        <span data-testid="places-map-position" className="text-xs text-slate-500">
          {count === 0 ? 'No places' : `${Math.min(focusedIndex + 1, count)} of ${count}`}
        </span>
        <button
          type="button"
          data-testid="places-map-next"
          onClick={() => moveFocus(1)}
          disabled={count === 0 || focusedIndex >= count - 1}
          className="flex min-h-11 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 hover:bg-slate-50 disabled:opacity-50"
        >
          Next <span aria-hidden="true">→</span>
        </button>
      </div>

      {/* The rows the map could not place (and, for a screen-reader user, the
          same directory in a linear form). The strip is a visual,
          horizontally-scrolling surface; this list is what keeps the map view
          from being a sighted-only view of the directory, and it is why dropping
          unplaceable rows from the STRIP loses nothing. */}
      <ul data-testid="places-map-list" className="sr-only">
        {allRows.map((row) => (
          <li key={row.place.id} className="text-sm">
            <Link to={placePath(row.place.id)} className="text-indigo-700 underline">
              {row.place.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
