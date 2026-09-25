import { useCallback, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { LocationModal } from './LocationModal'
import { NAV_ICONS } from './icons'
import { PlacesMap } from './PlaceMap'
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
  distanceMiles,
  MAP_FOCUS_RADIUS_MILES,
  planDirectoryList,
  radiusPreviewCircle,
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
import type { Place, PlacePrefill } from '../lib/types'
import { MODAL_OVER_LEAFLET_Z_CLASS } from '../lib/stacking'

/** V22 slice 10: default export for the lazy wrapper (see above). */
export { PlaceDirectory as default }

/**
 * V21 t02: the PLACES DIRECTORY SURFACE — the map band, the search/filter/distance
 * controls, the grouped list with its overflow door, the "Not on the map yet"
 * section, the Filter & sort modal, the Set location modal, and the floating
 * "Map" button that scrolls back to the band.
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
 * sort mode, radius filter, indoor/outdoor, the distance choice, the overflow
 * door, both modals, the geocoded center + preview radius, the map-band observer)
 * and exposes only the DATA it needs plus the CALLBACKS the host decides. The
 * host supplies:
 *
 *   - the loaded directory rows (`places`, `zipCoords`, `upcoming`) — the reads
 *     stay in the host because each page loads them with its own discipline
 *     (/browse discloses a failed read; /new silently keeps free text);
 *   - the viewer's home pin + stored radius (the profile's), for distances and
 *     the map frame;
 *   - whether hearts render at all (`canFollow`) and the caller's own follow
 *     set (`followedPlaceIds`), plus the toggle callback (`onToggleFollow`).
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
  /** The caller's own followed place ids (the batched read; empty set default). */
  followedPlaceIds: ReadonlySet<string>
  /** Signed in? Signed out renders no heart at all (the /browse rule). */
  canFollow: boolean
  /** Toggle one place's follow (the host owns the optimistic write). */
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
  // The overflow door. Collapsed shows the lead; expanded shows every row.
  const [showAll, setShowAll] = useState(false)

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

  // --- Floating "Map" button (V17 t03) --------------------------------------
  // Is the map band scrolled out of view? Drives the floating button that
  // scrolls back to it. An IntersectionObserver rather than a scroll listener:
  // a scroll handler fires on every frame of every scroll and would force a
  // layout read inside the paint frame; the observer hit-tests off the main
  // thread and calls back only on a crossing. `true` is the honest initial
  // value (the band lives at the top, so first paint either sees it or the page
  // opened already scrolled).
  const [mapBandOutOfView, setMapBandOutOfView] = useState(true)
  const mapBandRef = useRef<HTMLDivElement | null>(null)
  const bandObserverRef = useRef<IntersectionObserver | null>(null)
  // A callback ref attaches exactly when the node enters the DOM and detaches
  // when it leaves — the lifetime the observer actually wants. The band renders
  // CONDITIONALLY (after an early return), so an effect could not depend on it
  // without calling a hook conditionally (a real rules-of-hooks error).
  const attachMapBand = useCallback((node: HTMLDivElement | null) => {
    bandObserverRef.current?.disconnect()
    bandObserverRef.current = null
    mapBandRef.current = node
    if (node === null) {
      // The band left the DOM (no mappable places): nothing to scroll back TO.
      setMapBandOutOfView(false)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (entry === undefined) return
        setMapBandOutOfView(!entry.isIntersecting)
      },
      { threshold: 0 },
    )
    observer.observe(node)
    bandObserverRef.current = observer
  }, [])

  // --- Derived rows ----------------------------------------------------------

  const {
    listRows,
    placed,
    unplaced,
    overflowRows,
    leadGroups,
    overflowGroups,
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

  // The overview map's null condition: at least one placed row resolves to a
  // stored coordinate (same seam as PlacesMap).
  const mappedMarkers = placed
    .map((row) => resolveMapCoords(row.place, zipCoords))
    .filter((c): c is { lat: number; lng: number } => c !== null)

  // How many drawn places fall outside the map's neighbourhood frame (V19 t01).
  const outsideFocusCount = (() => {
    const anchor = geocodeCenter ?? homePin
    if (anchor === null) return 0
    return mappedMarkers.filter((point) => distanceMiles(anchor, point) > MAP_FOCUS_RADIUS_MILES)
      .length
  })()

  // The KIND filter must reach the "Not on the map yet" section too. Distance-
  // shaped filters are deliberately NOT applied there (a place may not be
  // hidden for missing data), but the kind is stated data. The date window is
  // applied to the rendered list by planDirectoryList, which owns this rule.
  const filteredUnplaced =
    selectedKinds.size > 0 ? unplaced.filter((row) => selectedKinds.has(row.place.kind)) : unplaced

  // --- Handlers --------------------------------------------------------------

  /** Any filter change collapses the list back to its lead. */
  function resetShowAll() {
    setShowAll(false)
  }

  function openFilterModal() {
    setFilterModalOpen(true)
  }

  function closeFilterModal() {
    setFilterModalOpen(false)
  }

  function scrollBackToMap() {
    mapBandRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

  const seeAllLabel = showAll ? 'Hide' : `See all ${listRows.length} places`

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
    <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start">
      {/* The map leads the surface — the mental model for "what's nearby".
          V22 slice 9: at md+ this is column 1 of a two-column grid, sticky
          under the full-width header so the map stays in view while the list
          scrolls. Below md it is the ordinary stacked band. */}
      {places !== null && mappedMarkers.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:sticky md:top-16">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Nearby places</span>
            <button
              type="button"
              data-testid="set-location-btn"
              onClick={openLocationModal}
              className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 transition-colors motion-reduce:transition-none hover:bg-indigo-100"
            >
              Set location
            </button>
          </div>
          {/* The BAND. 45dvh with a 240px floor. The height is given to the MAP
              itself (className), not a wrapper — a fixed clipping band cut the
              popup panel off (measured, ocr-found). The band sizes only the map
              and clips nothing; the panel renders in normal flow beneath it. */}
          <div ref={attachMapBand} data-testid="places-map-band" className="w-full">
            <PlacesMap
              className="h-[45dvh] min-h-[240px]"
              places={placed.map((row) => row.place)}
              zipCoords={zipCoords}
              homePin={homePin}
              placeActions={!selectable}
              onSelect={selectable ? onSelect : undefined}
              radiusCircle={radiusPreviewCircle({
                previewCenter: locationModalOpen ? geocodeCenter : null,
                previewMiles: radiusMiles,
                geocodeCenter,
                homePin,
                committedMiles: MAP_FOCUS_RADIUS_MILES,
              })}
            />
          </div>
          {outsideFocusCount > 0 ? (
            <p data-testid="places-outside-focus" className="mt-2 text-xs text-slate-500">
              {outsideFocusCount} {outsideFocusCount === 1 ? 'place' : 'places'} outside this{' '}
              {milesWord(MAP_FOCUS_RADIUS_MILES)} view — widen the distance below to see more.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Search + filter chips + distance control. V22 slice 9: column 2 at md+.
           V23 slice 3: stickyControls pins this card to the top of the scroll area. */}
      <div className={`flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:col-start-2 ${stickyControls ? 'sticky top-0 z-10' : ''}`}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">Search</span>
          <input
            type="search"
            data-testid="places-search"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              resetShowAll()
            }}
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
              resetShowAll()
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
              resetShowAll()
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
                  resetShowAll()
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
                resetShowAll()
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
      </div>

      {/* The list (or its empty states). V22 slice 9: column 2 at md+. */}
      {places === null ? (
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
              resetShowAll()
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
        <div className="flex flex-col gap-2 md:col-start-2">
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

          {overflowRows.length > 0 ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                data-testid="places-see-all"
                onClick={() => setShowAll((prev) => !prev)}
                className="self-start rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors motion-reduce:transition-none hover:bg-slate-50"
              >
                {seeAllLabel}
              </button>
              {showAll
                ? overflowGroups.map((group) => (
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
                  ))
                : null}
            </div>
          ) : null}
        </div>
      )}

      {/* Places we could not measure. Never hidden, never given a fake distance. */}
      {filteredUnplaced.length > 0 ? (
        <section className="flex flex-col gap-2 md:col-start-2">
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

      {/* The floating "Map" button. NO z-index by design (document order clears
          the list; Leaflet's controls sit at 1000, so a number buys nothing).
          Clears the bottom nav by geometry. */}
      {mapBandOutOfView ? (
        <button
          type="button"
          data-testid="scroll-to-map-btn"
          aria-label="Back to map"
          onClick={scrollBackToMap}
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 flex min-h-11 min-w-11 -translate-x-1/2 items-center justify-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 shadow-lg transition-colors motion-reduce:transition-none hover:bg-slate-50 md:bottom-[calc(2rem+env(safe-area-inset-bottom))]"
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
          Map
        </button>
      ) : null}

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
                  ? `Following ${row.place.name} — tap to unfollow`
                  : `Follow ${row.place.name}`
              }
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onToggleFollow(row.place.id)
              }}
              className="-mr-1 -mt-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full transition-colors motion-reduce:transition-none hover:bg-slate-100"
            >
              <HeartIcon filled={followed} />
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

/**
 * The place heart. Filled (solid indigo) when followed, an indigo OUTLINE when
 * not. The fill is decided by the prop; `aria-hidden` keeps the glyph out of the
 * accessibility tree — the button around it carries the label + pressed state.
 */
function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-6 w-6 ${filled ? 'text-indigo-600' : 'text-slate-400'}`}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20.5S4 15.3 4 9.9A4.6 4.6 0 0 1 12 6.4a4.6 4.6 0 0 1 8 3.5c0 5.4-8 10.6-8 10.6Z" />
    </svg>
  )
}