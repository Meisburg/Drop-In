import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { PlacesMap } from './PlaceMap'
import {
  formatDistanceLabel,
  type ZipCoords,
} from '../lib/feed'
import {
  clampCardIndex,
  nearestCardIndex,
  nextCardIndex,
  shouldRenderPlacesMap,
  splitStripRows,
} from '../lib/mapStrip'
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
  pins,
  rows,
  zipCoords,
  homePin,
  focusBehavior,
  onBackToList,
}: {
  /**
   * EVERY row the map can plot — the map's pins, and the source of the strip's
   * cards. NOT capped: the strip's `MAP_STRIP_CARD_LIMIT` governs cards only, and
   * a cap that reached here would draw fewer pins than the directory matched.
   * (This slice's second review caught exactly that regression.) This is the same
   * set the directory's own band pins.
   */
  pins: readonly PlaceListRow[]
  /**
   * The full matched row set, in the list's own order — `pins` plus the rows the
   * map cannot place. Here so the strip and its linear list can be derived in one
   * place, from one array, rather than by the caller slicing twice.
   */
  rows: readonly PlaceListRow[]
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
   * WHERE THE STRIP STOPS, as a tested rule rather than a slice in this file.
   *
   * The predicate is "this row is one of the map's pins", so the split cannot
   * assume an order — the caller's rows are KIND-GROUPED, and an unplaceable row
   * can sit between two placeable ones. `stripRows` is what the strip renders
   * (placeable, capped); the linear list below renders the rest — the placeable
   * overflow past the cap AND every unplaceable row — so no row is in two places
   * and none is nowhere.
   *
   * MEASURED, and why it matters: the unfiltered directory has 239 placeable
   * rows, so without the cap the strip mounted 239 card links in one scroller.
   * The cap makes the strip 40 cards; `pins` still carries all 239 to the map.
   */
  const pinnedIds = new Set(pins.map((row) => row.place.id))
  const { cards: stripRows, rest: restRows } = splitStripRows(rows, (row) =>
    pinnedIds.has(row.place.id),
  )

  /** The rows-reset effect below needs a stable way to write the index too. */
  const resetFocus = useCallback(() => {
    setFocusedIndex(0)
    const strip = stripRef.current
    if (strip !== null) strip.scrollTo({ left: 0, behavior: behaviorRef.current })
  }, [])

  /**
   * A NEW RESULT SET RESTARTS THE STRIP, and this is a correctness rule rather
   * than a nicety. `focusedIndex` is an INDEX, so it outlives the rows it
   * indexes: narrowing the search while the map is open could leave index 5
   * pointing at a different place — or at nothing. Resetting to the first card
   * (and scrolling the strip back to it) is the only state that is always true
   * of the new set. The identity is the row ids, not the array — the parent
   * hands a fresh array on every render.
   */
  const rowsKey = stripRows.map((row) => row.place.id).join('|')
  const lastRowsKeyRef = useRef(rowsKey)
  useEffect(() => {
    if (lastRowsKeyRef.current === rowsKey) return
    lastRowsKeyRef.current = rowsKey
    resetFocus()
  }, [rowsKey, resetFocus])

  const pinCount = pins.length
  const count = stripRows.length
  /**
   * The index is normalised through `clampCardIndex` (lib, with its own test)
   * rather than being trusted, and rather than being clamped inline.
   *
   * `focusedIndex` is STATE and outlives the array it indexes: a search that
   * narrows the set under an open map view can leave it past the end, and an
   * inline `Math.min` here would be a rule living in a `.tsx` — the thing
   * `docs/agents/code-structure.md` forbids and this slice's first review caught.
   * `rowsKey`'s effect above resets the index when the set changes; this clamp
   * is the second half, covering the render BEFORE that effect commits.
   */
  const safeIndex = clampCardIndex(focusedIndex, count)
  const focusedRow = count === 0 ? null : (stripRows[safeIndex] ?? null)
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
   * The card count, readable from a handler that must not close over it. A ref
   * rather than the render value for the same reason the index below uses the
   * functional updater: a keyboard or click handler can run against a commit the
   * render it was created in has already been replaced by.
   */
  const countRef = useRef(count)
  useEffect(() => {
    countRef.current = count
  }, [count])

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
   *
   * THE BASE INDEX IS COMPUTED INSIDE THE UPDATER, and that is the fix for a real
   * defect ocr's re-read surfaced: the previous version read `safeIndex` from the
   * render closure, so a handler created before a rows change stepped from a
   * stale index — and the render value could be out of range for the new set
   * while the clamp is exactly what makes it valid. Reading `current` inside the
   * updater is always the freshest committed value, and the card to scroll to is
   * computed from the same `target` the state receives, so the two cannot
   * disagree.
   */
  const moveFocus = useCallback((delta: number) => {
    const total = countRef.current
    if (total === 0) return
    setFocusedIndex((current) => {
      const target = nextCardIndex(clampCardIndex(current, total), delta, total)
      const card = cardRefs.current[target]
      if (card !== undefined && card !== null) {
        card.focus({ preventScroll: true })
        card.scrollIntoView({ behavior: behaviorRef.current, inline: 'center', block: 'nearest' })
      }
      return target
    })
  }, [])


  return (
    <div
      data-testid="places-map-view"
      /**
       * V24 slice 10 — HOW MANY ROWS THIS SURFACE CARRIES, published for the spec
       * that checks nothing is dropped (ocr finding 4).
       *
       * The cards and the linear list must PARTITION the rows, and a spec cannot
       * prove that from the DOM alone: the card count and the list count are both
       * readable, but the total is the component's own state. Asserting the two
       * add up to a number derived from the SEED (as the first version did) is an
       * assertion about today's data; asserting it against the surface's own
       * declared total is an assertion about the partition. Same discipline as
       * `data-map-center`: publish the fact, then assert the fact.
       */
      data-matched-rows={rows.length}
      className="flex flex-col gap-3"
    >
      {/* The map panel. Its own test id — never `places-map` — because every
          existing spec locates the directory's map by that name and a second
          match would fail them in strict mode. The height is shorter than the
          list's band on purpose: the strip below it needs room too, and the two
          together have to fit one phone screen. */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
          {/* THE PIN COUNT, not the card count. The strip may show fewer cards
              than the map draws pins (the cap), and a header that reported the
              cards would under-report the surface — which is exactly what this
              slice's second review caught: "40 places on the map" over a
              directory of 239. */}
          <span className="text-xs font-medium text-slate-500">
            {pinCount === 1 ? '1 place on the map' : `${pinCount} places on the map`}
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
        {/* V24 slice 10 (ocr HIGH) — THE MAP IS RENDERED ONLY WHEN THERE IS
            SOMETHING TO PUT ON IT, and that is a correctness condition rather
            than tidiness.

            THE DEFECT: `PlacesMap` early-returns `null` when it has no entries and
            no home pin, which UNMOUNTS ITS OWN CONTAINER DIV while the component
            stays mounted. Its Leaflet instance is created by an effect whose
            cleanup only runs when the COMPONENT unmounts — so that never fires,
            `map.remove()` is never called, and `mapRef.current` keeps pointing at
            a map whose container has been destroyed. Widening the search then
            renders a NEW div while that effect refuses to re-create the map (its
            deps are `[]`), so the pane is permanently blank. A parent who types a
            narrow search and then clears it, with no home pin, hits it.

            THE SHAPE CHOSEN: conditionally RENDER the whole map here, so React
            unmounts `PlacesMap` — and runs its cleanup, `map.remove()` — at
            exactly the moment there is nothing to draw. That is stronger than
            teaching `PlacesMap` to render a placeholder for its empty case: the
            component's other callers (the band, the place page, /new's picker)
            keep their `null`-means-nothing behaviour untouched, and the Leaflet
            instance is genuinely destroyed rather than parked against a dead
            container. Letting `PlacesMap` hold an empty map instead would leave a
            live Leaflet instance attached to a zero-pin view, which is the state
            this bug is made of.

            The decision itself is `shouldRenderPlacesMap` in `src/lib/mapStrip.ts`,
            a pure predicate with its own tests — one of which is the defect case
            (no places AND no home pin), because that branch is the one the seeded
            marker cannot reach from the UI: it always has a home pin, so the
            runtime path this spec exercises is the other one (an empty map that
            keeps its live camera). Splitting the rule out is what makes the
            unreachable branch assertable at all. */}
        {shouldRenderPlacesMap(pins.length, homePin) ? (
          <PlacesMap
            className="h-[38dvh] min-h-[200px]"
            places={pins.map((row) => row.place)}
            zipCoords={zipCoords}
            homePin={homePin}
            focusPlaceId={focusedPlaceId}
            focusBehavior={focusBehavior}
            testId="places-map-view-map"
          />
        ) : (
          <p
            data-testid="places-map-view-empty"
            className="flex h-[38dvh] min-h-[200px] w-full items-center justify-center p-4 text-center text-sm text-slate-600"
          >
            No places to show on the map for this search. Widen it, or go back to the list.
          </p>
        )}
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
        {stripRows.map((row, index) => {
          const ratingLine =
            row.ratingSummary !== null && row.ratingSummary.hasReviews
              ? reviewRatingLine(
                  row.ratingSummary.count,
                  row.ratingSummary.displayAverage,
                  row.place.name,
                )
              : null
          // `safeIndex`, not the raw state: the card highlight must agree with
          // the pin the map was told to focus (`focusedPlaceId`, also derived from
          // `safeIndex`). Reading the raw index here was ocr finding [2] — after
          // the set shrank, the label and the pin used the clamped index while the
          // highlight and the buttons used the stale one, so they could disagree
          // about which card was even focused.
          const focused = index === safeIndex
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
          disabled={safeIndex <= 0}
          className="flex min-h-11 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 hover:bg-slate-50 disabled:opacity-50"
        >
          <span aria-hidden="true">←</span> Previous
        </button>
        <span data-testid="places-map-position" className="text-xs text-slate-500">
          {count === 0 ? 'No places' : `${safeIndex + 1} of ${count}`}
        </span>
        <button
          type="button"
          data-testid="places-map-next"
          onClick={() => moveFocus(1)}
          disabled={count === 0 || safeIndex >= count - 1}
          className="flex min-h-11 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 hover:bg-slate-50 disabled:opacity-50"
        >
          Next <span aria-hidden="true">→</span>
        </button>
      </div>

      {/* THE ROWS THE STRIP DOES NOT CARRY, and ONLY those: the placeable rows
          past the strip's cap, plus every row the map cannot place (no
          coordinates means no pin, so no card).

          WHY IT IS A SUBTRACTION AND NOT A COPY. `splitStripRows` partitions the
          caller's rows into `cards` and `rest` in one place, so the two lists
          cannot overlap: a place is either on the map or in this list. This
          slice's first pass listed the WHOLE directory here instead, which made a
          screen reader hear every name twice — once from the strip's card link
          and once from this list. */}
      <ul data-testid="places-map-list" className="sr-only">
        {restRows.map((row) => (
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
