import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { NAV_ICONS } from '../components/icons'
import { PlacesMap } from '../components/PlaceMap'
import { RadiusEmptyState } from '../components/RadiusEmptyState'
import { SectionHeader } from '../components/SectionHeader'
import { useSessionContext } from '../components/SessionProvider'
import { listPlaces, loadZipCodes, upcomingCountsByPlace } from '../lib/db'
import { DEFAULT_RADIUS_MILES, formatDistanceLabel, RADIUS_MILES_OPTIONS } from '../lib/feed'
import type { ZipCoords } from '../lib/feed'
import {
  browsePlaces,
  BROWSE_LIST_LEAD_LIMIT,
  groupPlacesByKind,
  placeIndoorLabel,
  placeKindLabel,
  placePath,
  placeUpcomingLabel,
  resolveMapCoords,
} from '../lib/places'
import type { PlaceListRow } from '../lib/places'
import type { Place } from '../lib/types'

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
 * router state; see PlacesMap). The list below defaults to distance-sorted,
 * closest first (distance from the user's stored zip — NO geolocation, the
 * V12 t05 invariant).
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
 */
export function BrowsePage() {
  const { session, loading, profile } = useSessionContext()
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [placesFailed, setPlacesFailed] = useState(false)
  const [zipCoords, setZipCoords] = useState<ReadonlyMap<string, ZipCoords> | null>(null)
  // null = the count read failed (pre-0030-apply: no place_id column) → no
  // count is rendered at all, because "0 upcoming" is a claim we cannot make.
  const [upcoming, setUpcoming] = useState<Map<string, number> | null>(null)

  const [query, setQuery] = useState('')
  const [indoorFilter, setIndoorFilter] = useState<boolean | null>(null)
  // 'profile' = follow the viewer's own radius (the default, and what makes the
  // shared empty state's escapes work — they re-write that radius and the page
  // re-renders off the refreshed profile). 'any' = no ceiling. A number = the
  // parent picked one.
  const [distanceChoice, setDistanceChoice] = useState<'profile' | 'any' | number>('profile')
  // V13 ticket 05 (A7): the overflow door. Collapsed shows the lead (the
  // BROWSE_LIST_LEAD_LIMIT closest, grouped by kind); expanded shows every
  // row. Resetting on any filter change keeps "see all" honest — a widened
  // result set must not stay collapsed around a stale lead.
  const [showAll, setShowAll] = useState(false)

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

  if (loading || profile === null) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  const viewerRadius = profile.radius_miles ?? DEFAULT_RADIUS_MILES
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

  // V13 ticket 05 (A7): the grouped lead + overflow. browsePlaces already
  // distance-sorts (closest first; unknown distances last), so the LEAD is
  // simply the first BROWSE_LIST_LEAD_LIMIT rows — the closest places — and
  // the overflow door reveals the rest. Grouping (groupPlacesByKind) only
  // buckets by kind; it never re-ranks within a group.
  const leadRows = placed.slice(0, BROWSE_LIST_LEAD_LIMIT)
  const overflowRows = placed.slice(BROWSE_LIST_LEAD_LIMIT)
  const leadGroups = groupPlacesByKind(leadRows)
  const overflowGroups = groupPlacesByKind(overflowRows)

  // The shared radius empty state is the honest answer ONLY when the radius is
  // actually the reason nothing is showing: no search text, no kind filter.
  // Otherwise the copy would blame the radius for a filter the parent set.
  const radiusIsTheReason =
    maxMiles !== null && placed.length === 0 && query.trim() === '' && indoorFilter === null
  const nothingMatches = placed.length === 0 && unplaced.length === 0

  /** Any filter change collapses the list back to its lead (a widened result
      set must not stay expanded around a stale lead). */
  function resetShowAll() {
    setShowAll(false)
  }

  /** The overflow door's label: "See all N places" when collapsed, "Hide" when
      expanded. N is the TOTAL placed count (lead + overflow), so the door
      names the full directory, not just the hidden remainder. */
  const seeAllLabel = showAll ? 'Hide' : `See all ${placed.length} places`

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
          <PlacesMap places={placed.map((row) => row.place)} zipCoords={zipCoords} />
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

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">Distance</span>
          <select
            data-testid="places-distance-filter"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            value={distanceChoice === 'profile' ? 'profile' : distanceChoice === 'any' ? 'any' : String(distanceChoice)}
            onChange={(e) => {
              const value = e.target.value
              setDistanceChoice(
                value === 'profile' ? 'profile' : value === 'any' ? 'any' : Number(value),
              )
              resetShowAll()
            }}
          >
            <option value="profile">Within your radius ({viewerRadius} mi)</option>
            {RADIUS_MILES_OPTIONS.map((miles) => (
              <option key={miles} value={miles}>
                Within {miles} miles
              </option>
            ))}
            <option value="any">Any distance</option>
          </select>
        </label>
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
          {/* V13 ticket 05 (A7): the grouped lead — the closest
              BROWSE_LIST_LEAD_LIMIT places, bucketed by kind (kind chips as
              section headers, rows in the caller's distance order inside each
              group). The raw unbroken long-list is gone. */}
          {leadGroups.map((group) => (
            <section key={group.kind} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                {group.label}
              </h2>
              {group.rows.map((row) => (
                <PlaceRow key={row.place.id} row={row} />
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
                        <PlaceRow key={row.place.id} row={row} />
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
      {unplaced.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Not on the map yet
          </h2>
          <p className="text-xs text-slate-500">
            We don’t have coordinates for these, so the distance filter can’t place them.
          </p>
          <div className="flex flex-col gap-2">
            {unplaced.map((row) => (
              <PlaceRow key={row.place.id} row={row} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

/** One place row: the whole row taps through to the place page. */
function PlaceRow({ row }: { row: PlaceListRow }) {
  const upcomingLabel = placeUpcomingLabel(row.upcomingCount)
  return (
    <Link
      to={placePath(row.place.id)}
      data-testid="place-row"
      className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:bg-slate-50"
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
      {upcomingLabel !== null ? (
        <span className="text-xs font-medium text-indigo-700">{upcomingLabel}</span>
      ) : null}
    </Link>
  )
}
