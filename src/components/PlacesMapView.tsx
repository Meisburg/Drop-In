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
import type { FramingCircle, PlaceListRow } from '../lib/places'
import { reviewRatingLine } from '../lib/reviews'

/**
 * V24 slice 10 — THE MAP VIEW: one map, a horizontally swipeable strip of cards
 * along the bottom, and ONE focused card that both the strip and the map agree
 * on.
 *
 * WHY THIS IS A SEPARATE COMPONENT FROM `PlaceDirectory`, and not more JSX
 * inside it. The directory is already 900+ lines and owns search, filter, sort,
 * the distance control, the date window, two modals and the grouped list. The
 * map view is a different SURFACE over the same data: it has
 * its own focus state, its own scroll handling and its own keyboard rules. Adding
 * it inline would put two focus models in one file. It is a component, not a
 * route — see `PlaceDirectory`'s `view` state for why there is no new route.
 *
 * THE MEASURED TRAP THIS COMPONENT IS SHAPED AROUND: two mounted Leaflet maps
 * means two `data-testid="places-map"` nodes, and every existing spec that does
 * `page.getByTestId('places-map')` then dies in Playwright strict mode. So the
 * directory REPLACES the list with this view rather than sitting beside it, and
 * this view's map gets its OWN test id (`places-map-view-map`, passed through
 * `PlacesMap`'s existing `testId` prop). At most ONE map is mounted at any
 * moment — V25 t01 removed the list-view band, so this holds structurally now
 * rather than by convention.
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
 *     mechanisms. V31: that includes the MOUNT frame (`focusOnMount`), because
 *     the entry state used to be the one exception — the map opened on the
 *     viewer's home pin while this component's own strip highlighted card 0,
 *     which is the founder's "it should actually show the map where there's a
 *     red pin in the middle and it doesn't do that".
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
  radiusCircle,
  focusBehavior,
  onBackToList,
}: {
  /**
   * EVERY row the map can plot — the map's pins, and the source of the strip's
   * cards. NOT capped: the strip's `MAP_STRIP_CARD_LIMIT` governs cards only, and
   * a cap that reached here would draw fewer pins than the directory matched.
   * (This slice's second review caught exactly that regression.) This is every
   * row of the directory's own list that resolves to coordinates.
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
  /**
   * V25 t01: the radius frame's circle. The directory's list-view band used to
   * draw it; the band is gone, so its caller hands it here instead and map mode
   * keeps the committed-radius circle — and the LIVE preview while the
   * Set-location dialog is open, which is the founder's *"when you drag the
   * radius, it should expand or grow the red circle in real time"*.
   *
   * IT DOES NOT STEAL THE CAMERA. `PlacesMap` yields the framing to a caller
   * that passes `focusPlaceId` (this component always does), so the circle is
   * drawn and redrawn while the focused card keeps ownership of the view.
   * Without that yield the two effects fight and four camera specs go red —
   * measured, see the guard in `PlaceMap.tsx`.
   *
   * Absent/null means no circle, which is what the picker and the place page's
   * own maps pass.
   */
  radiusCircle?: FramingCircle | null
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
   * The map's own frame inside the map panel — what the entry scroll centres, so
   * "the middle of what the parent sees" is the middle of the map rather than of
   * the panel plus its header row.
   */
  const mapFrameRef = useRef<HTMLDivElement | null>(null)
  /**
   * V31 map-and-distance — THE MAP COMES INTO THE MIDDLE OF WHAT THE PARENT SEES.
   *
   * THE FOUNDER, on tapping the map control: *"it should actually show the map
   * where there's a red pin in the middle and it doesn't do that."* MEASURED on
   * the built app at 390x844 before this effect: the view toggle only renders
   * once the page is scrolled (list view hides it below ~220px), so the mode
   * opened at a scroll position chosen by the LIST — the map card landed at
   * viewport y 59..380 in an 844px screen and its centre pin at y≈219, while the
   * middle of the screen was the card strip. One entry scroll (measured: from a
   * deep list offset the browser's own clamp put the pane at y 250..571) is what
   * makes "the map is what you now see" true rather than incidental.
   *
   * WHY THE MAP'S FRAME AND NOT THE WHOLE VIEW: the wrapper also carries the
   * strip and the Previous/Next row, so centring the wrapper would put the MAP
   * above the centre; and the panel adds a header row, which measured ~30px of
   * offset. Centring `mapFrameRef` is what puts the map pane's centre — the pin
   * the map was just told to frame — at the centre of the viewport.
   *
   * ONE SHOT, ON MOUNT, and never again: this is the mode's entry, not a
   * scroll-follow. Re-running it as the parent scrolls would fight them. It uses
   * the injected `behaviorRef` (the reduced-motion-derived value, written by the
   * effect above), so reduced motion gets an instant jump.
   *
   * "BACK TO LIST" IS UNAFFECTED: `PlaceDirectory.openMapView` saves the list's
   * offset BEFORE this mounts, and the return restores that saved number, so the
   * round trip still lands where the parent left it (`places-map-view.e2e.ts`).
   */
  useEffect(() => {
    const node = mapFrameRef.current
    if (node === null) return
    node.scrollIntoView({ block: 'center', behavior: behaviorRef.current })
  }, [])

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
   * rather than the render value for the same reason `indexRef` below exists: a
   * keyboard or click handler can run against a commit the render it was created
   * in has already been replaced by.
   */
  const countRef = useRef(count)
  useEffect(() => {
    countRef.current = count
  }, [count])

  /**
   * The COMMITTED card index, readable from a handler that must not close over
   * the render value — the sibling of `countRef` above, and the base `moveFocus`
   * steps from.
   *
   * A ref is the tool for the reason stated there: an event handler is created
   * in one render and can run against a commit that render has already been
   * replaced by, so a value baked into the closure is a value that can be one
   * rows-change stale. Written from the effect, never during render: a ref write
   * inside the render body is the pattern React flags and the one a discarded
   * concurrent render would corrupt. `safeIndex` (not `focusedIndex`) is what is
   * stored, so the ref is always a legal index for the current strip.
   */
  const indexRef = useRef(safeIndex)
  useEffect(() => {
    indexRef.current = safeIndex
  }, [safeIndex])

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
   * THE BASE INDEX COMES FROM A REF, AND THE DOM WRITES SIT IN THE HANDLER BODY
   * — both halves are corrections of real defects, and they conflict unless you
   * are deliberate about which one moves where.
   *
   *  - The ORIGINAL defect (ocr's re-read): the handler read `safeIndex` from the
   *    RENDER CLOSURE, so a handler created before a rows change stepped from a
   *    stale index, and the render value could be out of range for the new set.
   *    `indexRef` is written by the effect below on every commit, so the handler
   *    reads the freshest COMMITTED index — the same value `safeIndex` had.
   *  - The SECOND defect (this round): the fix for the first one put the writes
   *    INSIDE the `setFocusedIndex` updater. An updater must be PURE — the app
   *    runs StrictMode (`src/main.tsx`), which double-invokes it in dev, and a
   *    concurrent render React throws away can run it too. Focusing a node and
   *    scrolling it are side effects, and running them from a discarded render is
   *    a real bug class, not a style note. They are back in the handler body,
   *    where fix 2 (`a35f9cf:216-224`) had them, and the updater receives a plain
   *    value rather than a function.
   *
   * The eager `indexRef.current = target` is what keeps the ref honest between
   * the keypress and the re-render: two presses inside one frame must step twice,
   * and the effect below (which re-syncs the ref from `safeIndex`) has not run
   * yet at that point.
   *
   * WHAT IS *NOT* CLAIMED HERE, because the previous version of this comment
   * claimed it and it was not true: `total` is read OUTSIDE the state update
   * (from `countRef`) and the index from `indexRef`, so the two are read as two
   * separate values rather than from one atomic snapshot. They cannot describe
   * different strips in practice — both refs are written by effects that run
   * after the SAME commit, and the eager write above only ever moves the index
   * within a `total` that a render has already fixed (a keypress does not change
   * the row set) — but "the two cannot disagree" was an overstatement, and the
   * honest version is the one written here.
   */
  const moveFocus = useCallback((delta: number) => {
    const total = countRef.current
    if (total === 0) return
    const target = nextCardIndex(clampCardIndex(indexRef.current, total), delta, total)
    // Written BEFORE the state update: a second press in the same frame steps
    // from where the first one landed rather than from the committed render.
    indexRef.current = target
    setFocusedIndex(target)
    const card = cardRefs.current[target]
    if (card !== undefined && card !== null) {
      card.focus({ preventScroll: true })
      card.scrollIntoView({ behavior: behaviorRef.current, inline: 'center', block: 'nearest' })
    }
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
      /**
       * V25 t01: HOW MANY OF THOSE ROWS THE MAP CAN ACTUALLY PIN — the `pins`
       * array's length, which is also what the header's count is written from.
       * Published for the same reason as `data-matched-rows`: the spec that
       * pins "the pins are complete" must assert the render against the
       * surface's own declared total, not against a number derived from the
       * seed (a partial pin loss — 239 rows down to 45 pins — is exactly what
       * a seed-derived bound cannot see).
       */
      data-placeable-rows={pins.length}
      className="flex flex-col gap-3"
    >
      {/* The map panel. Its own test id — never `places-map` — because every
          existing spec locates the directory's map by that name and a second
          match would fail them in strict mode. The map is deliberately short
          (`h-[38dvh] min-h-[200px]`, asserted by the map-view spec): the strip
          below it needs room too, and the two together have to fit one phone
          screen. */}
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
            component's other callers (the place page, /new's picker)
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
        {/* V31 map-and-distance — THE MAP'S OWN FRAME, and the element the entry
            scroll centres. A plain block wrapper with no layout of its own: it
            exists so "the centre of what the parent sees" can mean the centre of
            the MAP, not of the panel (whose header row would push the pane ~30px
            below the viewport's middle — measured). */}
        <div ref={mapFrameRef}>
          {shouldRenderPlacesMap(pins.length, homePin) ? (
            <PlacesMap
              className="h-[38dvh] min-h-[200px]"
              places={pins.map((row) => row.place)}
              zipCoords={zipCoords}
              homePin={homePin}
              radiusCircle={radiusCircle}
              focusPlaceId={focusedPlaceId}
              /**
               * V31 map-and-distance — THE ENTRY CAMERA IS THE FOCUSED PLACE.
               *
               * The founder, after tapping the map control: *"it should actually
               * show the map where there's a red pin in the middle and it doesn't
               * do that."* MEASURED on the built app (390x844, the seeded marker):
               * the map view opened with `data-map-center=47.66753,-122.37791` —
               * the marker's HOME ZIP 98107 — at zoom 13, while the card the strip
               * highlighted was elsewhere and, at the viewer's own radius, mostly
               * outside the pane. So the one caller whose camera is defined as "the
               * focused card" was the one caller whose MOUNT frame ignored it.
               *
               * `focusOnMount` makes the mount frame take the same `setView` a
               * focus change takes: the focused place's marker lands at the centre
               * of the pane. It is passed HERE and nowhere else — the place page,
               * /new's picker and the feed all keep their radius-framed mount.
               */
              focusOnMount
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
