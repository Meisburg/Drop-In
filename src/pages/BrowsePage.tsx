import { useEffect, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { NAV_ICONS, PLACE_KIND_ICONS } from '../components/icons'
import { PlacesMap } from '../components/PlaceMap'
import { RadiusEmptyState } from '../components/RadiusEmptyState'
import { SectionHeader } from '../components/SectionHeader'
import { useSessionContext } from '../components/SessionProvider'
import {
  listMyFollows,
  listPlaces,
  loadZipCodes,
  toggleFollowPlace,
  upcomingCountsByPlace,
} from '../lib/db'
import { MODAL_OVER_LEAFLET_Z_CLASS } from '../lib/stacking'
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
  browsePlaces,
  BROWSE_LIST_LEAD_LIMIT,
  filterPlacesByRadius,
  framingCircle,
  groupPlacesByKind,
  PLACE_KINDS,
  placeExternalUrl,
  placeFollowIdSet,
  placeIndoorLabel,
  placeKindLabel,
  placePath,
  placeUpcomingLabel,
  resolveMapCoords,
  sortPlaces,
} from '../lib/places'
import type { PlaceListRow, SortMode } from '../lib/places'
import type { Place, PlacePrefill } from '../lib/types'

/**
 * /browse — the PLACES directory (V8 ticket 07). The day-grouped list of
 * drop-ins is GONE from this screen: it was the same `listRadiusFeed` call the
 * feed makes (the ticket's opening complaint — a tab that showed the feed's own
 * content), and it lives on the feed only. What is left is the thing the
 * product's premise needs and nothing had: a searchable directory of the city's
 * playgrounds, pools, splash pads, beaches, community centers and indoor
 * options, with "N upcoming" per place.
 *
 * V13 ticket 05 (A6): the map is the mental model for "what's happening
 * nearby", so the overview map now sits at the TOP of the page — above the
 * search/filter card and the list — and a marker tap opens the place's info
 * (name + address) with a "Host here" action (the existing place pre-fill
 * router state; see PlacesMap). The list below defaults to ALPHABETICAL, A–Z
 * (V15 ticket 03 — the founder's order); filtering and re-sorting live in the
 * "Filter & sort" modal above the list, never below it. Distances are still
 * measured from the user's stored zip — NO geolocation, the V12 t05 invariant.
 *
 * V13 ticket 05 (A7): the raw unbroken long-list is gone. The list leads with
 * the BROWSE_LIST_LEAD_LIMIT closest places grouped by kind (the pure
 * groupPlacesByKind seam), then a single "See all N places" overflow door that
 * reveals every remaining row — all place data stays reachable, no new
 * dependencies, mobile-first (the shell's max-w-md column).
 *
 * FILTERS, all of them narrowing and none of them inventing:
 * - SEARCH: the pure `matchPlaces` (case-insensitive, prefixes above
 *   substrings, no fuzzy library). Search runs on what survived the other
 *   filters — it must never resurrect a place a filter just excluded.
 * - INDOOR / OUTDOOR: the places.indoor column (real data: the city's
 *   Swimming Pools layer publishes INDOOR_OUT and 0029 uses it).
 * - DISTANCE from the viewer's home zip to the PLACE's coordinates (the whole
 *   point of the ticket — not the host's zip). Its default follows the viewer's
 *   own radius, the app's existing discovery model, so the shared empty state
 *   below stays the honest answer to "there is nothing near you".
 *
 * WHY THE PLACES READ FAILING IS NOT A WALL: this page's empty state is the
 * SAME shared RadiusEmptyState the feed uses (V8 ticket 02's one-component
 * decision, pinned by an existing e2e assertion about this exact route). When
 * the directory read fails — the documented pre-0029-apply state, PGRST205 —
 * there is genuinely nothing to show within the radius, so the page renders
 * that state with the escapes AND says plainly that the directory could not be
 * loaded. The failure is disclosed, never swallowed; it is not turned into a
 * full-page error only because a bare error card would assert that nothing is
 * near you without offering the way out that this state exists to offer.
 *
 * A place with UNKNOWN distance (no coordinates for it yet — three hand-seeded
 * rows, 0029's header) is NEVER hidden by the distance filter: it moves to its
 * own clearly-labelled section instead, because the rule is that a filter may
 * not hide a place for missing data. That section is also why 0029's lat/lng
 * are nullable.
 *
 * V17 t02: THE HEART IS THE EXISTING FOLLOW, not a second save concept. A
 * signed-in parent sees one heart per card, filled when they already follow
 * that place, and tapping it toggles the SAME `follows` row the /place/:id
 * Follow control writes (0033's exactly-one-target table, owner-only RLS) —
 * there is no `saved_places` table and no per-card follower COUNT. A count
 * would be one `countPlaceFollowers` RPC PER CARD (239 cards = 239 round
 * trips, and a popularity score on a place), so the grid shows only the
 * caller's own state, read ONCE for the whole page via `listMyFollows` + the
 * pure `placeFollowIdSet` seam. Signed out
 * renders no heart at all, and issues no follows request — the /place/:id
 * decision (a control a visitor cannot press is decoration).
 *
 * THE FOLLOW READ IS BEST-EFFORT, exactly like the gazetteer read above it: a
 * failure (pre-0033-apply: PGRST205) leaves every heart unfilled and the
 * directory rendering normally. A heart is a card decoration; it is never
 * worth an error state, and it must never cost the page its places.
 *
 * V17 t01 (D2 = 6a): the map is a deliberate BAND at the top of the page, not
 * a card-sized map box. Its height is pinned to 45dvh with a 240px floor — the
 * spec's measurable rule (§3: ">= 240px and <= 60dvh at 390px", and the first
 * list row's top edge BELOW the band's bottom edge). 45dvh is a phone height,
 * so the band is a stable fraction of the viewport rather than a fixed pixel
 * box that a tall phone renders as a letterbox. The band's own container
 * carries `data-testid="places-map-band"`; `PlacesMap` is handed the height as
 * `className` (the prop it already had — no new prop was needed), so the map
 * component itself stays layout-agnostic.
 *
 * V17 t01 (7a): each row is a CONTENT-FORWARD CARD, not a text line. The card
 * leads with a photo slot, the heart (t02) sits at that slot's top-right, and
 * the place's name / kind / distance / address / actions follow beneath it.
 * THERE ARE NO PHOTOS YET — `photo_url` is NULL for every seeded row
 * (`types.ts:307`; third-party photos are deliberately never scraped), and
 * sourcing real ones is t05. So the slot renders the place's KIND
 * ILLUSTRATION (the `PLACE_KIND_ICONS` glyph family in components/icons.ts,
 * the same 24px stroked `currentColor` vocabulary as the nav) and a real photo
 * is an `<img>` swap in the SAME slot when t05 lands. The slot is never a
 * broken image and never an empty box: every one of the ten `PLACE_KINDS`
 * draws a glyph, and an unknown kind falls back to `other`.
 */
export function BrowsePage() {
  const { session, loading, profile } = useSessionContext()
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [placesFailed, setPlacesFailed] = useState(false)
  const [zipCoords, setZipCoords] = useState<ReadonlyMap<string, ZipCoords> | null>(null)
  // null = the count read failed (pre-0030-apply: no place_id column) → no
  // count is rendered at all, because "0 upcoming" is a claim we cannot make.
  const [upcoming, setUpcoming] = useState<Map<string, number> | null>(null)
  /**
   * V17 t02: the PLACE ids the caller already follows (the pure
   * placeFollowIdSet seam) — what each card's heart reads. ONE batched read for
   * the whole grid, never one call per card, and never `countPlaceFollowers` (a
   * grid of 239 cards must not make 239 RPCs; the heart shows the caller's OWN
   * state, which is all this read returns).
   *
   * The empty set is the honest default twice over: a signed-out viewer (the
   * effect never runs) and a FAILED read (the catch below lands the empty set)
   * both render every heart unfilled — identical to the page before this slice,
   * never an error state and never an empty page (the `zipCoords` precedent).
   */
  const [followedPlaceIds, setFollowedPlaceIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  )

  const [query, setQuery] = useState('')
  const [indoorFilter, setIndoorFilter] = useState<boolean | null>(null)
  // 'profile' = follow the viewer's own radius (the default, and what makes the
  // shared empty state's escapes work — they re-write that radius and the page
  // re-renders off the refreshed profile). 'any' = no ceiling. A number = the
  // parent picked one.
  const [distanceChoice, setDistanceChoice] = useState<DistanceChoice>('profile')
  // V13 ticket 05 (A7): the overflow door. Collapsed shows the lead (the
  // BROWSE_LIST_LEAD_LIMIT closest, grouped by kind); expanded shows every
  // row. Resetting on any filter change keeps "see all" honest — a widened
  // result set must not stay collapsed around a stale lead.
  const [showAll, setShowAll] = useState(false)

  // V15 ticket 03: the filter & sort modal. The list DEFAULTS to alphabetical
  // (the founder's A–Z); the modal is where filtering + re-sorting lives —
  // there are no sort/filter controls below the list anymore.
  const [sortMode, setSortMode] = useState<SortMode>('alpha')
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  // Empty set = all kinds (no kind filter active).
  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(new Set())
  // Miles from the home pin; null = no radius constraint from the modal.
  const [radiusFilter, setRadiusFilter] = useState<number | null>(null)

  // V15 ticket 02: the address + radius modal ("Set location"). The geocoded
  // center + radius drive both the map overlay and the filtered list.
  const [locationModalOpen, setLocationModalOpen] = useState(false)
  const [locationAddress, setLocationAddress] = useState('')
  const [geocodeCenter, setGeocodeCenter] = useState<{ lat: number; lng: number } | null>(null)
  const [radiusMiles, setRadiusMiles] = useState<number>(DEFAULT_RADIUS_MILES)
  const [geocodeError, setGeocodeError] = useState<string | null>(null)
  const [geocoding, setGeocoding] = useState(false)

  // The directory. A failed read is disclosed (placesFailed) rather than
  // rendered as a wall — see the page doc.
  useEffect(() => {
    let cancelled = false
    setPlaces(null)
    setPlacesFailed(false)
    listPlaces()
      .then((rows) => {
        if (!cancelled) setPlaces(rows)
      })
      .catch(() => {
        if (!cancelled) {
          setPlaces([])
          setPlacesFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The gazetteer (for every place distance). A failed load leaves zipCoords
  // null → every distance is UNKNOWN → every place lands in the
  // "not on the map yet" section rather than being hidden or mis-measured.
  useEffect(() => {
    let cancelled = false
    loadZipCodes()
      .then((coords) => {
        if (!cancelled) setZipCoords(coords)
      })
      .catch(() => {
        if (!cancelled) setZipCoords(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The "N upcoming" counts. Signed-in only (the read is RLS-scoped to the
  // authenticated role anyway); a failure yields null → no counts rendered.
  useEffect(() => {
    if (loading || session === null) return
    let cancelled = false
    upcomingCountsByPlace()
      .then((counts) => {
        if (!cancelled) setUpcoming(counts)
      })
      .catch(() => {
        if (!cancelled) setUpcoming(null)
      })
    return () => {
      cancelled = true
    }
  }, [loading, session])

  // V17 t02: the caller's own place follows, ONCE for the whole grid — the
  // hearts' first paint comes from this read, never from a per-card call. The
  // same signed-in-only shape as the counts effect above: signed out returns
  // before the call, so no follows request is ever issued, and a failure lands
  // the EMPTY SET so every heart renders unfilled and the page is otherwise
  // untouched.
  //
  // The read is the DEFAULT-CLIENT wrapper (listMyFollows), the repo's
  // established page-side pattern — no page in src/ imports the Supabase client
  // directly. The wrapper resolves the user itself; the `session` guard here is
  // what keeps a signed-out visitor from issuing the request at all.
  useEffect(() => {
    if (loading || session === null) return
    let cancelled = false
    listMyFollows()
      .then((rows) => {
        if (!cancelled) setFollowedPlaceIds(placeFollowIdSet(rows))
      })
      .catch(() => {
        if (!cancelled) setFollowedPlaceIds(new Set<string>())
      })
    return () => {
      cancelled = true
    }
  }, [loading, session])

  if (loading || profile === null) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  const viewerRadius = profile.radius_miles ?? DEFAULT_RADIUS_MILES
  // V15 t02: the home pin's coords — the stored home_zip resolved through the
  // same gazetteer seam the feed uses. Null when the zip is unset or missing
  // from the gazetteer (AC5: no home pin renders for a new user).
  const homePinCoords = (() => {
    if (profile.home_zip === null || profile.home_zip === undefined) return null
    if (zipCoords === null) return null
    const found = zipCoords.get(profile.home_zip)
    return found === undefined ? null : { lat: found.lat, lng: found.lng }
  })()
  const maxMiles =
    distanceChoice === 'profile' ? viewerRadius : distanceChoice === 'any' ? null : distanceChoice
  // A place's distance is unknown when the gazetteer failed to load; the pure
  // seam decides that, so the page never guesses.
  const coords: ReadonlyMap<string, ZipCoords> = zipCoords ?? new Map()
  const rows = browsePlaces(
    places ?? [],
    {
      query,
      indoor: indoorFilter,
      maxMiles,
    },
    { homeZip: profile.home_zip ?? null },
    coords,
    upcoming,
  )

  // The two sections: places we could measure, and places we could not. A
  // place with no coordinates is NEVER dropped (see the page doc).
  const placed = rows.filter((row) => row.distanceMiles !== null)
  const unplaced = rows.filter((row) => row.distanceMiles === null)

  // V12 t05: the overview map's null condition, computed once here so the
  // wrapper card renders only when at least one placed row resolves to a
  // stored coordinate. Matches PlacesMap exactly (same seam, same input):
  // an all-NULL-coord placed list — or a failed gazetteer load — yields an
  // empty card, so the card is skipped and the list stands alone.
  const mappedMarkers = placed
    .map((row) => resolveMapCoords(row.place, zipCoords))
    .filter((c): c is { lat: number; lng: number } => c !== null)

  // V15 t02: when the user has geocoded an address via "Set location", the list
  // is filtered to places within the chosen radius of that center (the pure
  // filterPlacesByRadius seam). The existing browsePlaces pipeline still runs
  // (it feeds the map + the un-geocoded path); this overrides the LIST only.
  const effectiveRows: PlaceListRow[] = (() => {
    if (geocodeCenter === null) return rows
    const filtered = filterPlacesByRadius(places ?? [], geocodeCenter, radiusMiles, zipCoords)
    return filtered.map((place) => ({
      place,
      distanceMiles: null as number | null,
      upcomingCount: upcoming === null ? null : (upcoming.get(place.id) ?? 0),
    }))
  })()

  // V15 ticket 03: the LIST is now alphabetical by default (the founder's A–Z).
  // The modal's kind chips + radius filter narrow the rows first, then
  // sortPlaces orders them. The MAP still shows the full placed set — the
  // modal filters the list only (the map's circle overlay communicates the
  // t02 geocode filter visually).
  const filteredRows: PlaceListRow[] = (() => {
    let base = rows
    if (selectedKinds.size > 0) {
      base = base.filter((row) => selectedKinds.has(row.place.kind))
    }
    if (radiusFilter !== null && homePinCoords !== null) {
      const keptIds = new Set(
        filterPlacesByRadius(places ?? [], homePinCoords, radiusFilter, zipCoords).map(
          (p) => p.id,
        ),
      )
      base = base.filter((row) => keptIds.has(row.place.id))
    }
    return sortPlaces(base, sortMode, homePinCoords ?? undefined)
  })()

  // V13 ticket 05 (A7): the grouped lead + overflow. The list rows are
  // filtered + sorted by the modal (filteredRows above); the LEAD is simply
  // the first BROWSE_LIST_LEAD_LIMIT rows and the overflow door reveals the
  // rest. Grouping (groupPlacesByKind) only buckets by kind; it never
  // re-ranks within a group.
  // V15 t02: when geocodeCenter is set, the LIST uses effectiveRows (filtered
  // by radius); the MAP still shows the full placed set (the circle overlay
  // communicates the active filter visually).
  const listRows = geocodeCenter !== null ? effectiveRows : filteredRows
  const leadRows = listRows.slice(0, BROWSE_LIST_LEAD_LIMIT)
  const overflowRows = listRows.slice(BROWSE_LIST_LEAD_LIMIT)
  const leadGroups = groupPlacesByKind(leadRows)
  const overflowGroups = groupPlacesByKind(overflowRows)

  // V15.1 fix: the KIND filter must reach the "Not on the map yet" section too.
  //
  // That section renders the UNPLACED rows (no coordinates, so no distance), and
  // it used the raw `unplaced` array — so a kind chip never touched it.
  // Selecting "Park" therefore left every unmeasured indoor-play / museum row on
  // screen, which reads as the filter doing the OPPOSITE of what the chip says.
  // The distance-shaped filters are deliberately NOT applied here — a place may
  // not be hidden for MISSING DATA (this section's own rule) — but the kind is
  // stated data, and an explicit kind choice is the parent's instruction to
  // hide everything else.
  const filteredUnplaced =
    selectedKinds.size > 0 ? unplaced.filter((row) => selectedKinds.has(row.place.kind)) : unplaced

  // The shared radius empty state is the honest answer ONLY when the radius is
  // actually the reason nothing is showing: no search text, no kind filter.
  // Otherwise the copy would blame the radius for a filter the parent set.
  const radiusIsTheReason =
    maxMiles !== null && placed.length === 0 && query.trim() === '' && indoorFilter === null
  const nothingMatches = listRows.length === 0 && filteredUnplaced.length === 0

  /** Any filter change collapses the list back to its lead (a widened result
      set must not stay expanded around a stale lead). */
  function resetShowAll() {
    setShowAll(false)
  }

  /** V15 t03: open the filter & sort modal. */
  function openFilterModal() {
    setFilterModalOpen(true)
  }

  /** V15 t03: close the filter & sort modal (Apply or Cancel — the state is
      committed live as the parent toggles, so closing needs no extra work). */
  function closeFilterModal() {
    setFilterModalOpen(false)
  }

  /** V15 t03: toggle one kind chip in the modal. An empty selection means
      "all kinds" — tapping the last selected chip clears the filter. */
  function toggleKind(kind: string) {
    setSelectedKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  /** The overflow door's label: "See all N places" when collapsed, "Hide" when
      expanded. N is the TOTAL placed count (lead + overflow), so the door
      names the full directory, not just the hidden remainder. */
  const seeAllLabel = showAll ? 'Hide' : `See all ${listRows.length} places`

  // V15 t02: geocode the address from the modal and drop a temporary pin.
  async function handleGeocode(address: string) {
    setGeocoding(true)
    setGeocodeError(null)
    const result = await geocodeAddress(address)
    if (result === null) {
      setGeocodeError('Could not find that address. Try a more specific one.')
    } else {
      setGeocodeCenter(result)
    }
    setGeocoding(false)
  }

  /** Open the "Set location" modal with the profile's stored radius as default. */
  function openLocationModal() {
    setRadiusMiles(viewerRadius)
    setLocationAddress('')
    setGeocodeError(null)
    setLocationModalOpen(true)
  }

  /** Close the modal and clear the geocoded center (resets the list to full). */
  function closeLocationModal() {
    setLocationModalOpen(false)
    setGeocodeCenter(null)
    setGeocodeError(null)
    setLocationAddress('')
  }

  /**
   * V17 t02: heart / un-heart ONE place — the EXISTING follow write, never a
   * competing "save". The local set is flipped FIRST (the heart moves on tap,
   * the ping toggle's optimistic discipline), then `toggleFollowPlace` — which
   * is a read-then-write against the owner-only row (it resolves the follow row
   * itself, which is why the heart never needs the row id) and already treats a
   * concurrent 23505 as success — confirms it in the background.
   *
   * Both writes use the FUNCTIONAL updater, not a value captured from this
   * render's closure. The follows read is a concurrent effect: it can land a
   * fresh set between the tap and the write settling, and rolling back to a
   * captured `previous` would then restore a set that is no longer the one we
   * replaced — silently discarding a read that arrived mid-flight. The updater
   * receives the CURRENT state and inverts only this place, so the rollback
   * restores exactly what it changed.
   *
   * There is no second local write when the promise resolves: the database
   * decides, the UI only reflects it.
   */
  async function handleTogglePlaceFollow(placeId: string) {
    const wasFollowed = followedPlaceIds.has(placeId)
    setFollowedPlaceIds((prev) => {
      const next = new Set(prev)
      if (wasFollowed) next.delete(placeId)
      else next.add(placeId)
      return next
    })
    try {
      await toggleFollowPlace(placeId)
    } catch {
      setFollowedPlaceIds((prev) => {
        const next = new Set(prev)
        if (wasFollowed) next.add(placeId)
        else next.delete(placeId)
        return next
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionHeader icon={NAV_ICONS.browse} title="Places" tagline="Find a place to gather" />
        <p className="mt-1 text-sm text-slate-600">
          Playgrounds, pools, splash pads and indoor options around Seattle.
        </p>
      </div>

      {placesFailed ? (
        <p className="text-sm text-red-600">
          The places directory couldn’t be loaded — it may not be set up on the server yet.
        </p>
      ) : null}

      {/* V13 ticket 05 (A6): the map leads the page — the mental model for
          "what's happening nearby". It sits above the filters and the list,
          and a marker tap opens the place's info + "Host here" (the existing
          place pre-fill router state, inside PlacesMap). Renders only when at
          least one placed row resolves to stored coordinates (mappedMarkers,
          below) — an empty list or an all-NULL-coord list leaves no empty card. */}
      {places !== null && mappedMarkers.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          {/* V15 t02: "Set location" button above the map opens the modal. */}
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Nearby places</span>
            <button
              type="button"
              data-testid="set-location-btn"
              onClick={openLocationModal}
              className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
            >
              Set location
            </button>
          </div>
          {/* V17 t01: the BAND. 45dvh with a 240px floor is the spec's §3
              measurable rule (>= 240px and <= 60dvh at 390px) — the floor is
              what keeps the band a map on a short viewport, and 45dvh is what
              makes it a stable fraction of a phone's height rather than a
              letterboxed fixed box. `dvh` (not `vh`) so a mobile URL bar
              appearing does not clip it.

              The height is given to the MAP itself (`className`), not to a
              wrapper, and that is deliberate — measured, not assumed.
              `PlacesMap` renders `flex flex-col gap-2` around the map div, and
              that wrapper has AUTO height. Passing `h-full` to the map (the
              first thing I tried) resolves `height: 100%` against an auto
              parent and collapses the map to its 2px border: the band still
              measures 380px, but the map inside it is invisible. Both `h-64`
              (the component's own default) and `h-full` are in Tailwind's
              `utilities` layer, so `h-full` simply wins by source order.
              Giving the map a self-sufficient height sidesteps the whole
              question and keeps `PlaceMap.tsx` untouched (no new prop — the
              component already took `className`). e2e asserts the map element
              itself has a real height, so this cannot silently regress. */}
          <div
            data-testid="places-map-band"
            className="h-[45dvh] min-h-[240px] w-full overflow-hidden"
          >
            <PlacesMap
              className="h-[45dvh] min-h-[240px]"
              places={placed.map((row) => row.place)}
              zipCoords={zipCoords}
              homePin={homePinCoords}
              radiusCircle={framingCircle({
                geocodeCenter,
                homePin: homePinCoords,
                radiusMiles: geocodeCenter !== null ? radiusMiles : viewerRadius,
              })}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">Search</span>
          <input
            type="search"
            data-testid="places-search"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
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
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-slate-50"
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
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ' +
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
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ' +
              (indoorFilter === false
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-300 bg-white text-slate-700')
            }
          >
            Outdoor
          </button>
        </div>

        {/* V16 t07 item 4: the distance control, DEMOTED not removed. It sets the
            RANGE while "Set location" sets the ORIGIN, so both are needed; it sat
            in a full-width form row and read as a competitor, so it joins the
            filter-chip row instead — inline, auto-width, quiet label.
            `min-h-11`/`text-base` are measured floors (mobile-audit.mjs flags a
            select under 16px, which iOS zooms on focus); `max-w-full` keeps a long
            option label inside a 320px viewport. The testid and option VALUES are
            unchanged — two e2e specs drive this control by testid. */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <span className="text-slate-500">Distance</span>
            <select
              data-testid="places-distance-filter"
              className="min-h-11 max-w-full rounded-full border border-slate-300 bg-white px-3 text-base text-slate-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
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

      {places === null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
          Loading…
        </div>
      ) : radiusIsTheReason ? (
        <RadiusEmptyState radiusMiles={maxMiles} />
      ) : nothingMatches ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
          No places match that.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* V13 ticket 05 (A7): the grouped lead — the first BROWSE_LIST_LEAD_LIMIT
              places in the list's current order (alphabetical by default, or
              whatever the Filter & sort modal set), bucketed by kind (kind
              chips as section headers, rows in the caller's order inside each
              group). The raw unbroken long-list is gone. */}
          {leadGroups.map((group) => (
            <section key={group.kind} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                {group.label}
              </h2>
              {group.rows.map((row) => (
                <PlaceRow
                  key={row.place.id}
                  row={row}
                  followed={followedPlaceIds.has(row.place.id)}
                  canFollow={session !== null}
                  onToggleFollow={(placeId) => void handleTogglePlaceFollow(placeId)}
                />
              ))}
            </section>
          ))}

          {/* The overflow door: every remaining row stays reachable behind ONE
              affordance (the ticket's "all place data must remain reachable").
              Expanded, the same grouping continues from where the lead left
              off, and the door flips to "Hide". */}
          {overflowRows.length > 0 ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                data-testid="places-see-all"
                onClick={() => setShowAll((prev) => !prev)}
                className="self-start rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-slate-50"
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
                        <PlaceRow
                          key={row.place.id}
                          row={row}
                          followed={followedPlaceIds.has(row.place.id)}
                          canFollow={session !== null}
                          onToggleFollow={(placeId) => void handleTogglePlaceFollow(placeId)}
                        />
                      ))}
                    </section>
                  ))
                : null}
            </div>
          ) : null}
        </div>
      )}

      {/* Places we could not measure. Never hidden (a filter may not hide a
          place for missing data) and never given an invented distance. */}
      {filteredUnplaced.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Not on the map yet
          </h2>
          <p className="text-xs text-slate-500">
            We don’t have coordinates for these, so the distance filter can’t place them.
          </p>
          <div className="flex flex-col gap-2">
            {filteredUnplaced.map((row) => (
              <PlaceRow
                key={row.place.id}
                row={row}
                followed={followedPlaceIds.has(row.place.id)}
                canFollow={session !== null}
                onToggleFollow={(placeId) => void handleTogglePlaceFollow(placeId)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* V15 t03: the "Filter & sort" modal — kind chips (multi-select), a sort
          dropdown, and an optional radius input. State commits live as the
          parent toggles; Apply just closes (the list already re-rendered).
          V16 t07: the stacking class comes from MODAL_OVER_LEAFLET_Z_CLASS —
          this modal sits over the Leaflet overview map, whose zoom control is
          wrapped in a layer at z-index 1000 (NOT 800: that is only the inner
          `.leaflet-control`). The old literal `z-50` lost that comparison and
          painted the +/− buttons over the dialog. Read that constant's doc in
          src/lib/stacking.ts for the full layer table before changing it. */}
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
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ' +
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
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
              >
                <option value="alpha">A–Z</option>
                <option value="distance">Closest to me</option>
                <option value="newest">Newest</option>
              </select>
            </label>

            <label className="mb-4 flex flex-col gap-1 text-sm">
              <span className="text-slate-700">Within (miles of home pin, optional)</span>
              <input
                type="number"
                min={1}
                data-testid="filter-radius-input"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
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
              className="w-full rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}

      {/* V15 t02: the "Set location" modal — address input + radius slider +
          "See places" button. Geocodes on submit, drops a temporary pin, and
          draws the radius circle on the map.
          V16 t07 item 1: the founder photographed Leaflet's +/− zoom box
          painting ON TOP of this dialog. Same fix as the filter modal above —
          the class comes from MODAL_OVER_LEAFLET_Z_CLASS, which is 1100: above
          Leaflet's 1000 wrapper AND below the image lightbox at 1200. */}
      {locationModalOpen ? (
        <div
          data-testid="location-modal"
          className={`fixed inset-0 ${MODAL_OVER_LEAFLET_Z_CLASS} flex items-end justify-center bg-black/40 sm:items-center`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeLocationModal()
          }}
        >
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Set location</h3>
              <button
                type="button"
                data-testid="location-modal-close"
                onClick={closeLocationModal}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <label className="mb-3 flex flex-col gap-1 text-sm">
              <span className="text-slate-700">Address</span>
              <input
                type="text"
                data-testid="location-address-input"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                placeholder="e.g. Green Lake Park, Seattle"
                autoComplete="off"
                value={locationAddress}
                onChange={(e) => setLocationAddress(e.target.value)}
              />
            </label>

            <label className="mb-4 flex flex-col gap-1 text-sm">
              <span className="text-slate-700">
                Radius: {radiusMiles} {milesWord(radiusMiles)}
              </span>
              <input
                type="range"
                data-testid="location-radius-slider"
                min={1}
                max={30}
                step={1}
                value={radiusMiles}
                onChange={(e) => setRadiusMiles(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </label>

            {geocodeError !== null ? (
              <p data-testid="location-geocode-error" className="mb-3 text-xs text-red-600">
                {geocodeError}
              </p>
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                data-testid="location-cancel-btn"
                onClick={closeLocationModal}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="location-see-places-btn"
                disabled={geocoding || locationAddress.trim() === ''}
                onClick={() => {
                  void handleGeocode(locationAddress)
                }}
                className="flex-1 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                {geocoding ? 'Finding…' : 'See places'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * One place CARD (V17 t01, item 7a): the whole card taps through to the place
 * page. The card leads with the photo slot, then the place's facts, then the
 * two row actions.
 */
function PlaceRow({
  row,
  followed,
  canFollow,
  onToggleFollow,
}: {
  row: PlaceListRow
  /** V17 t02: the caller already follows this place (the batched read). */
  followed: boolean
  /** V17 t02: signed in? Signed OUT renders no heart at all — see the page doc. */
  canFollow: boolean
  onToggleFollow: (placeId: string) => void
}) {
  const navigate = useNavigate()
  const upcomingLabel = placeUpcomingLabel(row.upcomingCount)

  /**
   * V15 ticket 04: "Start a drop-in" — the SAME PlacePrefill router-state seam
   * the map panel's button uses (navigate('/new', { state: { place } })).
   * stopPropagation keeps the row's tap-through (the Link) from also firing.
   */
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

  // V15 ticket 04: the "Learn more" external URL (derived OSM search URL).
  // Null only when the place has no name; then the row shows inline details
  // instead of a broken link.
  const learnMoreUrl = placeExternalUrl(row.place)

  return (
    <Link
      to={placePath(row.place.id)}
      data-testid="place-row"
      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50"
    >
      {/* V17 t01: the PHOTO SLOT, with the heart (V17 t02) at its top-right.
          The slot is the card's lead — the founder's Airbnb shape (item 7a) —
          and it is `relative` so the heart can pin to it. `h-32` is the slot's
          band height: big enough to read as a photo, small enough that six
          lead cards still scan on a phone.

          A real photo is `<img src={row.place.photo_url}>` HERE, in this same
          slot, when t05 lands. There is no broken image today because there is
          no `<img>` at all yet: `photo_url` is NULL for every seeded row
          (`types.ts:307`) and sourcing real photos is t05's job. Rendering an
          `<img>` whose src is null would be the "broken image" the acceptance
          criteria forbid, so the fallback is the branch taken, not an error
          path. */}
      <div className="relative h-32 w-full">
        <PlacePhotoSlot place={row.place} />
        {/* V17 t02, moved but UNCHANGED in behavior: the heart is the EXISTING
            place follow, rendered ONLY for a signed-in parent — a signed-out
            visitor sees the card without it (the /place/:id decision, where
            signed-out gets a sign-in prompt instead of a Follow control).

            `min-h-11 min-w-11` is the measured 44px tap-target floor (the V16
            t07 control discipline), kept from the previous header. It is a
            <button> INSIDE the card's <Link>, so the click is
            preventDefault'd + stopPropagation'd — the card ping toggle's guard
            — or tapping the heart would also navigate. The opaque background
            is what keeps the glyph legible over the slot's tint, in both
            themes the parent might be in; there is no `-m-1` here because the
            heart now floats on the slot rather than sitting in the card's
            text padding. */}
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
            className="absolute right-2 top-2 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/95 shadow-sm transition-colors hover:bg-white"
          >
            <HeartIcon filled={followed} />
          </button>
        ) : null}
      </div>

      {/* The card's content, below the slot. The padding lives here rather than
          on the Link so the slot can run edge to edge. */}
      <div className="flex flex-col gap-1 p-3">
        <span data-testid="place-card-name" className="text-sm font-semibold text-slate-900">
          {row.place.name}
        </span>
        <span className="text-xs text-slate-600">
          {placeKindLabel(row.place.kind)} · {placeIndoorLabel(row.place)}
          {' · '}
          {row.distanceMiles !== null
            ? formatDistanceLabel(row.distanceMiles)
            : 'Distance unknown'}
        </span>
        <span className="text-xs text-slate-500">{row.place.address}</span>
        {upcomingLabel !== null ? (
          <span className="text-xs font-medium text-indigo-700">{upcomingLabel}</span>
        ) : null}
        {/* V15 ticket 04: the two row actions (AC4) — compact, below the meta. */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid={`row-start-dropin-${row.place.id}`}
            onClick={(e) => startDropIn(e)}
            className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Start a drop-in
          </button>
          {learnMoreUrl !== null ? (
            <a
              href={learnMoreUrl}
              target="_blank"
              rel="noopener"
              data-testid={`row-learn-more-${row.place.id}`}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Learn more
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
 * V17 t01: the card's photo slot — the photo when there is one, the place's
 * KIND illustration when there is not.
 *
 * Today there never is one: `Place.photo_url` is NULL for all 239 seeded rows
 * (`types.ts:307`), and t05 is the separate batch that sources real photos.
 * So this renders the fallback branch, and it renders it DELIBERATELY — a
 * tinted panel plus the kind's glyph in the repo's own stroked 24px family
 * (`PLACE_KIND_ICONS`, `components/icons.ts`), never a broken image and never
 * an empty box.
 *
 * `data-testid="place-card-photo"` marks the slot itself, so the slot's
 * presence is assertable independently of which branch it took; `data-photo`
 * records which branch that was, which is how a spec (or t05) tells them
 * apart without reading private DOM structure.
 *
 * The glyph is wrapped in `aria-hidden` and labelled by the slot's
 * `aria-label`: a decorative drawing should not be announced, but the slot
 * still says what it is to a screen reader.
 */
function PlacePhotoSlot({ place }: { place: Place }) {
  const label = `${placeKindLabel(place.kind)} illustration`
  if (place.photo_url !== null && place.photo_url !== '') {
    return (
      <img
        src={place.photo_url}
        alt={place.name}
        data-testid="place-card-photo"
        data-photo="real"
        loading="lazy"
        className="h-full w-full object-cover"
      />
    )
  }
  // The per-kind glyph. An unknown kind is not an empty box: it falls back to
  // the `other` pin, which is exactly what `other` is for.
  const glyph = PLACE_KIND_ICONS[place.kind as keyof typeof PLACE_KIND_ICONS]
  const path = glyph ?? PLACE_KIND_ICONS.other
  return (
    <div
      data-testid="place-card-photo"
      data-photo="kind"
      aria-label={label}
      className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-12 w-12 text-indigo-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
    </div>
  )
}

/**
 * V17 t02: the place heart. One inline SVG in the repo's own glyph family
 * (24px viewBox, `currentColor`, the `NAV_ICONS` stroke convention) rather
 * than a new icon dependency.
 *
 * FILLED and EMPTY are the two states the parent reads at a glance: an
 * unfollowed place is an indigo OUTLINE, a followed one is a SOLID indigo
 * heart. The fill is decided by the prop, never by this component, and
 * `aria-hidden` keeps the glyph itself out of the accessibility tree — the
 * button around it carries the label and the pressed state.
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
