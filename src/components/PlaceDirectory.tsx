import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { LocationModal } from './LocationModal'
import { NAV_ICONS } from './icons'
import { PlacesMapView } from './PlacesMapView'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'
import { RadiusEmptyState } from './RadiusEmptyState'
import {
  DEFAULT_RADIUS_MILES,
  distanceChoiceFromValue,
  distanceSelectValue,
  formatDistanceLabel,
  milesWord,
  RADIUS_MILES_OPTIONS,
  type DistanceChoice,
} from '../lib/feed'
import type { ZipCoords } from '../lib/feed'
import { geocodeAddress } from '../lib/geocode'
import {
  DATE_WINDOWS,
  DATE_WINDOW_LABELS,
  dateWindowEmptyCopy,
  planDirectoryList,
  PLACE_KINDS,
  placeLearnMoreLink,
  placeIndoorLabel,
  placeKindLabel,
  placePath,
  placeUpcomingLabel,
  resolveMapCoords,
} from '../lib/places'
import type { DateWindow, PlaceListRow, SortMode } from '../lib/places'
import { reviewRatingLine } from '../lib/reviews'
import type { ReviewSummary } from '../lib/reviews'
import { scrollBehaviorFor } from '../lib/mapStrip'
import type { Place, PlacePrefill } from '../lib/types'
import { MODAL_OVER_LEAFLET_Z_CLASS } from '../lib/stacking'

/** V22 slice 10: default export for the lazy wrapper (see above). */
export { PlaceDirectory as default }

/**
 * V21 t02: the PLACES DIRECTORY SURFACE — V25 t01 made it LIST-FIRST: the
 * search/filter/distance card is the first block, the grouped list (every
 * matching row, no overflow door) sits below it, and the map is a MODE the
 * floating control toggles into. Still here: the "Not on the map yet" section,
 * the Filter & sort modal, the Set location modal (moved out of the removed
 * band's header into the controls card), and the PlacesMapView map mode.
 *
 * This is the ONE implementation of the directory. It used to live inside
 * `BrowsePage.tsx`; the page now renders it (Phase A) and `/new` opens it in a
 * full-screen sheet behind its "Browse all N places" door (Phase B — see
 * NewPlaydatePage's `directoryOpen` state and the `place-directory-sheet`
 * testid). One surface, two consumers — the copy-paste duplication that has
 * bitten this repo before (V15.2/V17/V20) is the failure mode this extraction
 * exists to prevent.
 *
 * The Phase B wiring is pinned by `e2e/place-directory-in-new.e2e.ts`, which
 * opens the sheet from `/new` and asserts the search field, the filter control,
 * the map canvas and a real list row — the assertion that distinguishes "the
 * full directory with its filters" from the V9 8-row picker shortcut.
 *
 * The component owns every piece of DIRECTORY STATE (search text, kind chips,
 * sort mode, radius filter, indoor/outdoor, the distance choice, the view mode,
 * both modals, the geocoded center + preview radius) and exposes only the DATA
 * it needs plus the CALLBACKS the host decides. The host supplies:
 *
 *   - the loaded directory rows (`places`, `zipCoords`, `upcoming`) — the reads
 *     stay in the host because each page loads them with its own discipline
 *     (/browse discloses a failed read; /new silently keeps free text);
 *   - the viewer's home pin + stored radius (the profile's), for distances and
 *     the map frame;
 *   - whether the save control renders at all (`canFollow`) and the caller's own saved set
 *     (`followedPlaceIds`), plus the toggle callback (`onToggleFollow`).
 *
 * Selection semantics are host-owned too: when `selectable` is true, tapping a
 * row's name or a map marker calls `onSelect(place)` instead of navigating to
 * the place page — that is how /new writes the pick into its form through the
 * SAME `pickPlace` path the suggestion list uses (no second write path). The
 * "Start a drop-in" row action and the map panel's "Host here" button are
 * suppressed in selectable mode (they navigate to /new, which IS the host).
 */
/**
 * V22 slice 10: this module is loaded through the dynamic import in
 * PlaceDirectoryLazy.tsx (the code split). A default export lets that wrapper's
 * `lazy()` factory resolve it; named consumers keep importing by name.
 */
export function PlaceDirectory({
  places,
  zipCoords,
  upcomingStartTimes,
  ratings,
  followedPlaceIds,
  canFollow,
  onToggleFollow,
  homePin,
  viewerRadius,
  homeZip,
  selectable = false,
  stickyControls = false,
  onSelect,
}: {
  /** The loaded directory rows. `null` while the host's read is in flight. */
  places: Place[] | null
  /** The gazetteer zip→coords map (null while loading or on failure). */
  zipCoords: ReadonlyMap<string, ZipCoords> | null
  /** Per-place upcoming drop-in start times (null = the read failed → unknown). */
  upcomingStartTimes: Map<string, string[]> | null
  /**
   * V24: per-place aggregate ratings (the DB-computed display average + review
   * count), keyed by place id. `null` while the bulk read is in flight OR when
   * it failed — then every card shows no rating line at all (never a 0.0).
   * Optional: hosts that do not load ratings omit it entirely (same effect).
   */
  ratings?: ReadonlyMap<string, ReviewSummary> | null
  /** The caller's own saved place ids (the batched read; empty set default). */
  followedPlaceIds: ReadonlySet<string>
  /** Signed in? Signed out renders no save control at all (the /browse rule). */
  canFollow: boolean
  /** Toggle one place's save (the host owns the optimistic write). */
  onToggleFollow: (placeId: string) => void
  /** The viewer's home pin coords (null = no home pin). */
  homePin: { lat: number; lng: number } | null
  /** The viewer's stored radius in miles (drives the distance control default). */
  viewerRadius: number
  /** The viewer's stored home zip (the distance seam measures from it; null = none). */
  homeZip: string | null
  /** When true, taps select into the host instead of navigating away. */
  selectable?: boolean
  /** V23 slice 3: when true, the search + filter card pins to the top of the scroll area. */
  stickyControls?: boolean
  /** Called with the tapped place in selectable mode. */
  onSelect?: (place: Place) => void
}) {
  // --- Directory state -------------------------------------------------------

  const [query, setQuery] = useState('')
  const [indoorFilter, setIndoorFilter] = useState<boolean | null>(null)
  // 'profile' = follow the viewer's own radius (the default, and what makes the
  // shared empty state's escapes work). 'any' = no ceiling. A number = picked.
  const [distanceChoice, setDistanceChoice] = useState<DistanceChoice>('profile')
  // The filter & sort modal. The list defaults to alphabetical (A–Z); the modal
  // is where filtering + re-sorting lives — there are no controls below the list.
  const [sortMode, setSortMode] = useState<SortMode>('alpha')
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  // Empty set = all kinds (no kind filter active).
  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(new Set())
  // Miles from the home pin; null = no radius constraint from the modal.
  const [radiusFilter, setRadiusFilter] = useState<number | null>(null)

  // The date chips (annotation 15): a single-choice window filter. 'upcoming'
  // is the unfiltered default — selecting it clears the date narrowing.
  const [dateWindow, setDateWindow] = useState<DateWindow>('upcoming')

  // The address + radius modal ("Set location"). The geocoded center + radius
  // drive both the map overlay and the filtered list. V23 slice 1: the modal is
  // now the SHARED LocationModal (also opened from the feed's one location
  // control); this component keeps its own open state + geocode result, which
  // are what the map preview and the filtered list consume.
  const [locationModalOpen, setLocationModalOpen] = useState(false)
  const [geocodeCenter, setGeocodeCenter] = useState<{ lat: number; lng: number } | null>(null)
  const [radiusMiles, setRadiusMiles] = useState<number>(DEFAULT_RADIUS_MILES)

  // --- V24 slice 10: the view mode ------------------------------------------

  /**
   * WHICH SURFACE THE DIRECTORY IS SHOWING — the list (the filters card plus
   * every grouped row) or the map view (one map + the swipeable strip).
   * `'list'` is the default: the founder's ask is that the filters and the list
   * lead the page, with the map as a mode you toggle into.
   *
   * WHY THIS IS STATE AND NOT A ROUTE, and why it is not `history.back()`: the
   * map view's "Back to list" must return to THE LIST THE PARENT CAME FROM. A
   * new route (`/browse/map`) would rely on the browser's history containing
   * that list, and it may not — a parent who deep-linked into the map, or whose
   * history entry was replaced, would be sent somewhere else. State makes the
   * return unconditional. It also keeps the playtest `routes.json` guard
   * untouched (no new route exists to register).
   */
  const [view, setView] = useState<'list' | 'map'>('list')
  /**
   * The list's scroll offset, saved on ENTRY to the map view and restored on the
   * way back. Without it, "Back to list" lands at the top of a long directory
   * and the parent loses their place — the round trip would be a reset.
   */
  const listScrollRef = useRef<number | null>(null)
  /**
   * The restore is a ONE-SHOT: set the pending flag on the way back, and the
   * effect below consumes it. An effect rather than inlining the scroll in the
   * click handler because the handler runs BEFORE React has re-rendered the
   * list — scrolling then would measure the map view's (shorter) page and clamp
   * to a wrong maximum.
   */
  const pendingScrollRestoreRef = useRef(false)
  const reducedMotion = usePrefersReducedMotion()
  // The pure rule decides what the preference MEANS (src/lib/mapStrip.ts); this
  // component only reads it. The same value drives the map's recentre and the
  // strip's own scrolling, so the card and the pin animate together or not at
  // all.
  const focusBehavior = scrollBehaviorFor(reducedMotion)

  useEffect(() => {
    if (!pendingScrollRestoreRef.current) return
    pendingScrollRestoreRef.current = false
    const saved = listScrollRef.current
    if (saved === null) return
    window.scrollTo({ top: saved, behavior: focusBehavior })
  }, [view, focusBehavior])

  // --- Derived rows ----------------------------------------------------------

  const {
    listRows,
    unplaced,
    leadGroups,
    radiusReason,
    dateWindowReason,
    nothingMatches,
  } = planDirectoryList({
    places,
    query,
    indoorFilter,
    distanceChoice,
    viewerRadius,
    selectedKinds,
    radiusFilter,
    dateWindow,
    sortMode,
    homeZip,
    homePin,
    geocodeCenter,
    radiusMiles,
    zipCoords,
    upcomingStartTimes,
    ratings,
  })

  // The KIND filter must reach the "Not on the map yet" section too. Distance-
  // shaped filters are deliberately NOT applied there (a place may not be
  // hidden for missing data), but the kind is stated data. The date window is
  // applied to the rendered list by planDirectoryList, which owns this rule.
  const filteredUnplaced =
    selectedKinds.size > 0 ? unplaced.filter((row) => selectedKinds.has(row.place.kind)) : unplaced

  /**
   * V24 slice 10: the rows the MAP VIEW carries.
   *
   * TWO SETS, AND THE DISTINCTION IS LOAD-BEARING — this slice's second review
   * caught both halves of it:
   *
   *  1. `mapViewRows` is EVERY row the directory's filter produces
   *     (`filteredUnplaced` aside, it is `listRows`) — never a slice of it. (Before
   *     V25 t01 the list rendered a six-row lead behind a door, and a map fed from
   *     that lead showed six pins and said nothing about the other 233; the lead is
   *     gone now, but the rule it produced is the reason this field exists at all.)
   *     A parent who searched for "park" and tapped "See map" must see every
   *     matching place pinned — a matching place with no pin is the defect.
   *
   *  2. `placeableMapRows` is that set minus the rows the map cannot plot (no
   *     coordinates means no pin, never a fake one). The map view gets BOTH: the
   *     placeable rows are its PINS (all of them) and the source of its strip's
   *     cards (the first `MAP_STRIP_CARD_LIMIT` of them); the unplaceable rows go
   *     with the card overflow into its linear list, so no row is unreachable.
   *
   * The map view re-filters nothing: every row here is `planDirectoryList`'s own
   * output, so the map cannot disagree with the list it replaced.
   */
  const mapViewRows = listRows
  const placeableMapRows = mapViewRows.filter(
    (row) => resolveMapCoords(row.place, zipCoords) !== null,
  )

  // --- Handlers --------------------------------------------------------------

  function openFilterModal() {
    setFilterModalOpen(true)
  }

  function closeFilterModal() {
    setFilterModalOpen(false)
  }

  /**
   * V24 slice 10: enter the map view. The list's CURRENT scroll offset is saved
   * here — on the way out, before the DOM changes — because once the map view is
   * up the page is a different height and the offset is no longer readable.
   *
   * THE GUARD IS THE FIX FOR ocr FINDING 2, and it is a real corruption rather
   * than a no-op: the controls card stays mounted in the map view, so this button
   * is still there and still activatable. Activating it a second time would
   * OVERWRITE the saved offset with the MAP VIEW's `window.scrollY` — a number
   * from a different, shorter document — and the next "Back to list" would then
   * restore the parent to the wrong place (clamped to the list's height) instead
   * of where they left it. `setView('map')` was already a no-op, so the ONLY
   * effect of the second activation was the corruption; the early return removes
   * it and keeps the transition one-way until "Back to list" is pressed.
   */
  function openMapView() {
    if (view === 'map') return
    listScrollRef.current = typeof window === 'undefined' ? null : window.scrollY
    setView('map')
  }

  /**
   * V24 slice 10: return to the list the parent came from — the SAME list, with
   * its search/filter/sort/date state (all of it is this component's state and
   * was never unmounted) AND its scroll position (restored by the effect above).
   * The pending flag is what tells that effect this particular transition is a
   * return rather than an ordinary render.
   */
  function backToList() {
    pendingScrollRestoreRef.current = true
    setView('list')
  }

  /**
   * V25 t01: THE MODE SWITCH ITSELF, in one place. The in-card "See map" button
   * and the floating toggle both flip list<->map, and both must save/restore the
   * list's scroll offset identically (`openMapView` below owns the saving).
   */
  function seeMap() {
    openMapView()
  }

  /** Toggle one kind chip. An empty selection means "all kinds". */
  function toggleKind(kind: string) {
    setSelectedKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  async function handleGeocode(address: string) {
    const result = await geocodeAddress(address)
    if (result === null) {
      // The shared modal renders its own "could not find" line; the caller only
      // needs to know whether a center landed, which it reads via onGeocode's
      // return value (null = no center, keep the previous one).
      setGeocodeCenter(null)
    } else {
      setGeocodeCenter(result)
    }
    return result
  }

  function openLocationModal() {
    setRadiusMiles(viewerRadius)
    setLocationModalOpen(true)
  }

  function closeLocationModal() {
    setLocationModalOpen(false)
    setGeocodeCenter(null)
  }

  // --- Render ----------------------------------------------------------------

  return (
    <div
      className={
        view === 'map'
          ? 'flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start'
          : 'flex flex-col gap-4'
      }
    >
      {/* Search + filter chips + distance control. V25 t01: this card is the
           FIRST block in list view — the founder's ask ("I want to see the
           search filters at the very top with the list of all the different
           places below it"). It used to be column 2 of a two-column grid whose
           column 1 was the map band; the band is gone from list view, so the
           grid would now leave an empty column and a card pinned beside
           nothing. The grid returns in MAP VIEW only, where the map is real
           content beside the card.

           It carries "Set location" because that control lived in the band's
           header and the band no longer renders in list view — the location
           modal is the page's only address entry point, so it moved here
           rather than disappearing with its old host.

           V23 slice 3: stickyControls pins this card to the top of the scroll
           area (the directory sheet's own scroll container). */}
      <div className={`flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm ${view === 'map' ? 'md:col-start-2' : ''} ${stickyControls ? 'sticky top-0 z-10' : ''}`}>
        {/* V25 t01: "Set location" — relocated from the removed band header.
            It opens the shared LocationModal, which sets the geocoded center
            and radius the list and the map's preview circle both consume. */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">Nearby places</span>
          <button
            type="button"
            data-testid="set-location-btn"
            onClick={openLocationModal}
            className="min-h-11 rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 transition-colors motion-reduce:transition-none hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Set location
          </button>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">Search</span>
          <input
            type="search"
            data-testid="places-search"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Green Lake, splash pad, library"
            autoComplete="off"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="filter-sort-btn"
            onClick={openFilterModal}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors motion-reduce:transition-none hover:bg-slate-50"
          >
            Filter &amp; sort
          </button>
          <button
            type="button"
            data-testid="places-indoor-filter"
            aria-pressed={indoorFilter === true}
            onClick={() => {
              setIndoorFilter((prev) => (prev === true ? null : true))
            }}
            className={
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none ' +
              (indoorFilter === true
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-300 bg-white text-slate-700')
            }
          >
            Indoor
          </button>
          <button
            type="button"
            data-testid="places-outdoor-filter"
            aria-pressed={indoorFilter === false}
            onClick={() => {
              setIndoorFilter((prev) => (prev === false ? null : false))
            }}
            className={
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none ' +
              (indoorFilter === false
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-300 bg-white text-slate-700')
            }
          >
            Outdoor
          </button>
        </div>

        {/* The date chips (annotation 15): Upcoming / Today / Tomorrow / Weekend.
            Single-choice, rendered as a radiogroup so the selection is conveyed
            by MORE THAN colour (the role + aria-checked, not just the fill).
            Each chip keeps the house chip pattern — the same rounded-full border
            + indigo fill when selected — with min-h/min-w-11 (44px) tap targets
            and focus-visible rings. */}
        <div role="radiogroup" aria-label="Upcoming drop-in window" className="flex flex-wrap items-center gap-2">
          {DATE_WINDOWS.map((window) => {
            const selected = dateWindow === window
            return (
              <button
                key={window}
                type="button"
                role="radio"
                aria-checked={selected}
                data-testid={`date-chip-${window}`}
                onClick={() => {
                  setDateWindow(window)
                }}
                className={
                  'min-h-11 min-w-11 rounded-full border px-3 py-1.5 text-sm font-medium outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 ' +
                  (selected
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')
                }
              >
                {DATE_WINDOW_LABELS[window]}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <span className="text-slate-500">Distance</span>
            <select
              data-testid="places-distance-filter"
              className="min-h-11 max-w-full rounded-full border border-slate-300 bg-white px-3 text-base text-slate-600 outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
              value={distanceSelectValue(distanceChoice)}
              onChange={(e) => {
                setDistanceChoice(distanceChoiceFromValue(e.target.value))
              }}
            >
              <option value="profile">Within your radius ({viewerRadius} mi)</option>
              {RADIUS_MILES_OPTIONS.map((miles) => (
                <option key={miles} value={miles}>
                  Within {miles} {milesWord(miles)}
                </option>
              ))}
              <option value="any">Any distance</option>
            </select>
          </label>
        </div>

        {/* V24 slice 10, KEPT BY V25 t01: the map view's in-card entry point.
            Before V25 it was the only list-view door to the map (and the
            floating control's separate job was scrolling back to the band).
            Now the floating control is the mode toggle and NOTHING scrolls to a
            band, so this button is the explicit "See map" affordance beside the
            filters — the same door the toggle opens, reached from the card the
            founder asked to lead the page. Two doors to one mode, one map.

            It lives in the controls card rather than in the old band's header so
            it is still reachable when a search matches no PLACEABLE row — the
            parent can open the map and see the filter emptied it.

            It renders only when at least one row has coordinates, so the control
            is never a door to an empty map. The way back is the map view's own
            "Back to list" button, or the floating control, now labelled "List". */}
        {placeableMapRows.length > 0 ? (
          <button
            type="button"
            data-testid="places-see-map"
            onClick={seeMap}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 hover:bg-indigo-100"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={NAV_ICONS.browse} />
            </svg>
            See map
          </button>
        ) : null}
      </div>

      {/* V24 slice 10 — THE MAP VIEW REPLACES the list rather than sitting
          beside it, and this is the MEASURED reason for that shape: two mounted
          Leaflet maps means two `data-testid="places-map"` nodes, and every
          existing spec that calls `page.getByTestId('places-map')` then fails in
          Playwright's strict mode. At most ONE map is mounted at any moment, and
          the map view's own map carries its OWN test id
          (`places-map-view-map`, through PlacesMap's existing `testId` prop).

          V25 t01 made this the ONLY map on the page: list view no longer mounts
          a band above the filters, so the two maps this comment guards against
          cannot coexist even transiently.

          It spans both columns at md+: the strip wants the width, and the
          controls above it stay mounted so a parent can narrow the map's result
          set without leaving the map. */}
      {view === 'map' && places !== null ? (
        <div className="md:col-span-2">
          <PlacesMapView
            pins={placeableMapRows}
            rows={mapViewRows}
            zipCoords={zipCoords}
            homePin={homePin}
            focusBehavior={focusBehavior}
            onBackToList={backToList}
          />
        </div>
      ) : null}

      {/* The list (or its empty states). V22 slice 9: column 2 at md+.
          V24 slice 10: the WHOLE list renders only in list view — the map view
          REPLACES it (see the map view block above), because two mounted maps
          would give every existing `getByTestId('places-map')` spec two nodes to
          choose from and fail them in Playwright's strict mode. */}
      {view === 'list' && places === null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm md:col-start-2">
          Loading…
        </div>
      ) : radiusReason !== null ? (
        <div className="md:col-start-2"><RadiusEmptyState radiusMiles={radiusReason.radiusMiles} /></div>
      ) : dateWindowReason !== null ? (
        // The honest window empty state (annotation 15): names the window that
        // matched nothing and offers the way back to "Upcoming" — the house
        // empty-state pattern (RadiusEmptyState's copy + escapes shape).
        <div
          data-testid="empty-date-window-state"
          className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm md:col-start-2"
        >
          <p className="text-sm text-slate-600">{dateWindowEmptyCopy(dateWindowReason)}</p>
          <button
            type="button"
            data-testid="date-window-escape-upcoming"
            onClick={() => {
              setDateWindow('upcoming')
            }}
            className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 transition-colors motion-reduce:transition-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
          >
            Show Upcoming
          </button>
        </div>
      ) : nothingMatches ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm md:col-start-2">
          No places match that.
        </div>
      ) : (
        <div
          data-testid="places-list"
          /* V25 t01: the directory's own matched-row total, published for the
             spec that pins "the list is the whole list". Same discipline as the
             map view's `data-matched-rows`: assert the render against the
             surface's own declared total rather than against a seed size.
             Summed over the kind groups because that is the one array this
             component still holds; `planDirectoryList` grouped every row. */
          data-matched-rows={leadGroups.reduce((total, group) => total + group.rows.length, 0)}
          className="flex flex-col gap-2"
        >
          {/* V25 t01: THE WHOLE LIST, not a lead behind a door. `leadGroups` IS
              every matching row grouped by kind now — `planDirectoryList`'s
              lead/overflow split is the identity — which is the founder's "all
              these place cards under the filters below it as a long list". The
              A–Z / kind grouping is kept (grouping was never the complaint) and
              the "See all N places" fold is gone, so no matching place hides
              behind a second tap. */}
          {leadGroups.map((group) => (
            <section key={group.kind} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                {group.label}
              </h2>
              {group.rows.map((row) => (
                <DirectoryRow
                  key={row.place.id}
                  row={row}
                  followed={followedPlaceIds.has(row.place.id)}
                  canFollow={canFollow}
                  onToggleFollow={onToggleFollow}
                  selectable={selectable}
                  onSelect={onSelect}
                />
              ))}
            </section>
          ))}
        </div>
      )}

      {/* Places we could not measure. Never hidden, never given a fake distance.
          V24 slice 10: list view only — the map view carries a list of its own
          (the rows that did not become pins or cards), so nothing becomes
          unreachable. */}
      {view === 'list' && filteredUnplaced.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Not on the map yet
          </h2>
          <p className="text-xs text-slate-500">
            We don’t have coordinates for these, so the distance filter can’t place them.
          </p>
          <div className="flex flex-col gap-2">
            {filteredUnplaced.map((row) => (
              <DirectoryRow
                key={row.place.id}
                row={row}
                followed={followedPlaceIds.has(row.place.id)}
                canFollow={canFollow}
                onToggleFollow={onToggleFollow}
                selectable={selectable}
                onSelect={onSelect}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* V25 t01: THE MODE TOGGLE. One floating control that flips list↔map
          instead of scrolling to a band (there is no band left to scroll to:
          `scrollBackToMap` and the IntersectionObserver that used to hide this
          button while the band was visible are both gone).

          It renders in BOTH modes and its label follows the mode, because that
          is the founder's ask — "when you get to the map mode, this button
          should come back and it should be called list. you can toggle back and
          forth between them." The accessible name is the same word the button
          shows (`aria-label` matches the visible label), so a screen reader and
          the screen agree.

          NO z-index by design (document order clears the content; Leaflet's
          controls sit at 1000, so a number buys nothing). Clears the bottom nav
          by geometry and honours reduced motion. */}
      <button
        type="button"
        data-testid="places-view-toggle"
        aria-label={view === 'list' ? 'Map' : 'List'}
        onClick={view === 'list' ? openMapView : backToList}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 flex min-h-11 min-w-11 -translate-x-1/2 items-center justify-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 shadow-lg outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 hover:bg-slate-50 md:bottom-[calc(2rem+env(safe-area-inset-bottom))]"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={NAV_ICONS.browse} />
        </svg>
        {view === 'list' ? 'Map' : 'List'}
      </button>

      {/* The Filter & sort modal. State commits live as the parent toggles;
          Apply just closes. Stacking class beats Leaflet's 1000 wrapper. */}
      {filterModalOpen ? (
        <div
          data-testid="filter-sort-modal"
          className={`fixed inset-0 ${MODAL_OVER_LEAFLET_Z_CLASS} flex items-end justify-center bg-black/40 sm:items-center`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeFilterModal()
          }}
        >
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Filter &amp; sort</h3>
              <button
                type="button"
                onClick={closeFilterModal}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mb-3">
              <span className="mb-2 block text-xs font-medium text-slate-700">Place types</span>
              <div className="flex flex-wrap gap-2">
                {PLACE_KINDS.map((kind) => {
                  const selected = selectedKinds.has(kind)
                  return (
                    <button
                      key={kind}
                      type="button"
                      data-testid={`filter-kind-chip-${kind}`}
                      aria-pressed={selected}
                      onClick={() => toggleKind(kind)}
                      className={
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none ' +
                        (selected
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-300 bg-white text-slate-700')
                      }
                    >
                      {placeKindLabel(kind)}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1 text-xs text-slate-500">None selected = show all types.</p>
            </div>

            <label className="mb-3 flex flex-col gap-1 text-sm">
              <span className="text-slate-700">Sort by</span>
              <select
                data-testid="filter-sort-select"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
              >
                <option value="alpha">A–Z</option>
                <option value="distance">Closest to me</option>
                <option value="newest">Newest</option>
                <option value="top-rated">Top rated</option>
              </select>
            </label>

            <label className="mb-4 flex flex-col gap-1 text-sm">
              <span className="text-slate-700">Within (miles of home pin, optional)</span>
              <input
                type="number"
                min={1}
                data-testid="filter-radius-input"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
                placeholder="e.g. 5"
                value={radiusFilter ?? ''}
                onChange={(e) => {
                  const raw = e.target.value
                  setRadiusFilter(raw === '' ? null : Math.max(1, Number(raw)))
                }}
              />
            </label>

            <button
              type="button"
              data-testid="filter-apply-btn"
              onClick={closeFilterModal}
              className="w-full rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors motion-reduce:transition-none hover:bg-indigo-700"
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}

      {/* The Set location modal — address input + radius slider + "See places". */}
      <LocationModal
        open={locationModalOpen}
        onClose={closeLocationModal}
        radiusMiles={radiusMiles}
        homeZip={null}
        onGeocode={handleGeocode}
        // V23 s1 extraction regression fix: the slider must drive the map LIVE
        // (V20 t05), not only on the Apply button. `onApplyRadius` is this
        // caller's write; `onRadiusChange` is the per-tick preview the old inline
        // modal had and the extraction dropped.
        onRadiusChange={(miles) => setRadiusMiles(miles)}
        onApplyRadius={(miles) => setRadiusMiles(miles)}
      />
    </div>
  )
}

/**
 * One place CARD. In non-selectable mode the whole card taps through to the
 * place page (the /browse behaviour); in selectable mode the NAME selects into
 * the host instead (the /new behaviour) and the "Start a drop-in" action is
 * suppressed (it navigates to /new, which IS the host).
 *
 * The card's save control is the SAME Save / Saved bookmark the place pages
 * render (annotation 5: a heart reads as "like", not "follow/save"). It keeps
 * its pre-annotation-5 testid `place-heart-<id>` — the e2e specs locate it by
 * that name and assert its >=44px box + aria-pressed; renaming would force
 * spec churn this batch does not need. The stale name is deliberate.
 */
function DirectoryRow({
  row,
  followed,
  canFollow,
  onToggleFollow,
  selectable,
  onSelect,
}: {
  row: PlaceListRow
  followed: boolean
  canFollow: boolean
  onToggleFollow: (placeId: string) => void
  selectable: boolean
  onSelect?: (place: Place) => void
}) {
  const navigate = useNavigate()
  const upcomingLabel = placeUpcomingLabel(row.upcomingCount)
  // V24: the rating line — a real VALUE for screen readers ("4.3 out of 5, 12
  // reviews"), never decorative glyphs alone. A null summary (unrated, or the
  // bulk read failed) renders NOTHING — never a 0.0 (the `upcomingCount` rule).
  const ratingSummary = row.ratingSummary
  const ratingLine =
    ratingSummary !== null && ratingSummary.hasReviews
      ? reviewRatingLine(ratingSummary.count, ratingSummary.displayAverage, row.place.name)
      : null

  /** Non-selectable: "Start a drop-in" — the existing PlacePrefill router-state
      seam (navigate('/new', { state: { place } })). stopPropagation keeps the
      row's tap-through (the Link) from also firing. */
  function startDropIn(e: ReactMouseEvent) {
    e.stopPropagation()
    const prefill: PlacePrefill = {
      placeId: row.place.id,
      place: row.place.name,
      address: row.place.address,
      neighborhoodId: row.place.neighborhood_id,
    }
    navigate('/new', { state: { place: prefill } })
  }

  /** Selectable: select into the host (the /new pick path). */
  function select() {
    onSelect?.(row.place)
  }

  const learnMore = placeLearnMoreLink(row.place)

  return (
    <Link
      to={placePath(row.place.id)}
      data-testid="place-row"
      onClick={selectable ? (e) => {
        // In selectable mode the whole card selects instead of navigating.
        // stopPropagation stops the Link's navigation; the name span's own
        // click (below) is what actually selects, so a tap anywhere on the card
        // lands the pick.
        e.preventDefault()
        e.stopPropagation()
        select()
      } : undefined}
      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-colors motion-reduce:transition-none hover:bg-slate-50"
    >
      <div className="flex flex-col gap-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <span
            data-testid="place-card-name"
            onClick={selectable ? select : undefined}
            className="text-sm font-semibold text-slate-900"
          >
            {row.place.name}
          </span>
          {canFollow ? (
            <button
              type="button"
              data-testid={`place-heart-${row.place.id}`}
              aria-pressed={followed}
              aria-label={
                followed
                  ? `Saved ${row.place.name} — tap to unsave`
                  : `Save ${row.place.name}`
              }
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onToggleFollow(row.place.id)
              }}
              className="-mr-1 -mt-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none hover:bg-slate-100"
            >
              {/* The pressed state is conveyed by MORE THAN colour: the bookmark
                  glyph fills when saved (stroked otherwise) AND the accessible
                  name flips Save → Saved. Same glyph + fill channel as the
                  place pages' control; the glyph is decorative (aria-hidden). */}
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className={`h-6 w-6 ${followed ? 'text-indigo-600' : 'text-slate-400'}`}
                fill={followed ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={NAV_ICONS.bookmark} />
              </svg>
            </button>
          ) : null}
        </div>
        <span className="text-xs text-slate-600">
          {placeKindLabel(row.place.kind)} · {placeIndoorLabel(row.place)}
          {' · '}
          {row.distanceMiles !== null
            ? formatDistanceLabel(row.distanceMiles)
            : 'Distance unknown'}
        </span>
        <span className="text-xs text-slate-500">{row.place.address}</span>
        {ratingLine !== null ? (
          <span data-testid="place-rating-line" className="text-xs font-medium text-amber-700">
            {ratingLine}
          </span>
        ) : null}
        {upcomingLabel !== null ? (
          <span className="text-xs font-medium text-indigo-700">{upcomingLabel}</span>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {!selectable ? (
            <button
              type="button"
              data-testid={`row-start-dropin-${row.place.id}`}
              onClick={(e) => startDropIn(e)}
              className="min-h-11 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition-colors motion-reduce:transition-none hover:bg-indigo-700"
            >
              Start a drop-in
            </button>
          ) : null}
          {learnMore !== null ? (
            <a
              href={learnMore.url}
              target="_blank"
              rel="noopener"
              data-testid={`row-learn-more-${row.place.id}`}
              data-link-kind={learnMore.kind}
              onClick={(e) => {
                e.stopPropagation()
              }}
              className="flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors motion-reduce:transition-none hover:bg-slate-50"
            >
              {learnMore.kind === 'website' ? 'Visit website' : 'Find it on the map'}
            </a>
          ) : (
            <span className="text-xs text-slate-500">
              {placeKindLabel(row.place.kind)}
              {row.place.notes !== null && row.place.notes !== ''
                ? ` · ${row.place.notes}`
                : ''}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

