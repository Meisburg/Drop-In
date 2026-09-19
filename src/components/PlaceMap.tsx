/**
 * V12 t05: the shared Leaflet + OpenStreetMap map.
 *
 * Coordinates come from the DATABASE only (0029's places.lat/lng, else the
 * 0012 gazetteer for the zip embedded in the address — the pure
 * resolveMapCoords seam in lib/places.ts). There is deliberately no browser
 * location access here: no prompt, no location-API call — the ticket's
 * pinned invariant. A place whose coordinates resolve to null renders NO map —
 * 0029's header rule (NULL coordinate = UNKNOWN distance = never a fake pin),
 * and no default-view map means no 404 tile-flooding either.
 *
 * Two surfaces:
 * - PlaceMap: ONE place (the /place/:id detail) — a single circleMarker at a
 *   fixed zoom.
 * - PlacesMap: the /browse directory overview — a marker per placed row,
 *   fitted to the bounds.
 *
 * Leaflet-in-React pitfalls handled in MapCanvas: the map is created on mount
 * and `map.remove()`d on unmount (without the teardown a remount into the
 * same container throws "Map container is already initialized"), and markers
 * are circleMarkers (the default icon images break under a bundler; a circle
 * needs no image assets). Tiles are live OpenStreetMap — the e2e spec's
 * recorded choice: it asserts the container + marker DOM, never tile pixels,
 * so an offline or flaky tile fetch can never fail the spec.
 */
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { ZipCoords } from '../lib/feed'
import { placePath, resolveMapCoords } from '../lib/places'
import type { Place, PlacePrefill } from '../lib/types'

/** The tile source (pinned by the ticket — the only tile host the app fetches). */
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
/** OSM's required attribution (Leaflet's default control renders it). */
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
/** Where a map with nothing to anchor to looks (the city the app serves). */
const SEATTLE_CENTER: [number, number] = [47.6062, -122.3321]
/** A single-place view (the detail surface). */
const DETAIL_ZOOM = 15

interface MapMarker {
  lat: number
  lng: number
}

/**
 * The Leaflet core both exports share. ONE map per container lifetime:
 * created on mount, torn down with map.remove() on unmount, the marker
 * layerGroup re-keyed by a string of the coordinates so unrelated re-renders
 * (pages re-render on state changes all the time) never re-add identical
 * circles.
 */
function MapCanvas({
  markers,
  fit,
  testId,
  className,
}: {
  markers: MapMarker[]
  /** Fit the view to all markers (the directory overview). A single-marker
      map keeps its fixed detail zoom instead. */
  fit: boolean
  testId: string
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  // The map anchors on the FIRST marker at MOUNT only. Reading it through a
  // ref keeps the mount effect's dependency list empty — later marker changes
  // are the group effect's job (fitBounds / re-add), never a re-init.
  const initialMarkerRef = useRef(markers[0])

  // The marker effect's key: stable across renders that rebuild an identical
  // markers array (the pages hand this component a fresh array every render).
  const markersKey = markers.map((m) => `${m.lat}:${m.lng}`).join('|')

  useEffect(() => {
    const el = containerRef.current
    if (el === null) return
    const first = initialMarkerRef.current
    const map = L.map(el, { scrollWheelZoom: false }).setView(
      first === undefined ? SEATTLE_CENTER : [first.lat, first.lng],
      first === undefined ? 11 : DETAIL_ZOOM,
    )
    L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map)
    mapRef.current = map
    return () => {
      // Without this, a remount into the same container throws "Map container
      // is already initialized" (Leaflet tracks the instance on the element).
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (map === null) return
    const coords: MapMarker[] =
      markersKey === ''
        ? []
        : markersKey.split('|').map((pair) => {
            const i = pair.indexOf(':')
            return { lat: Number(pair.slice(0, i)), lng: Number(pair.slice(i + 1)) }
          })
    const group = L.layerGroup(
      coords.map((c) =>
        L.circleMarker([c.lat, c.lng], {
          radius: 7,
          color: '#4f46e5',
          weight: 2,
          fillColor: '#4f46e5',
          fillOpacity: 0.35,
        }),
      ),
    ).addTo(map)
    if (fit && coords.length > 0) {
      map.fitBounds(L.latLngBounds(coords.map((c) => [c.lat, c.lng])), { padding: [28, 28] })
    }
    return () => {
      group.remove()
    }
  }, [markersKey, fit])

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      className={`h-64 w-full overflow-hidden rounded-xl border border-slate-200 ${className ?? ''}`}
    />
  )
}

/**
 * ONE place's map (the /place/:id detail surface). Resolves the place's own
 * coordinates first, else the address zip's gazetteer coordinates; when both
 * are absent it renders nothing (0029's rule — the card simply stays as
 * today, no crash, no fake pin, no 404 tiles).
 */
export function PlaceMap({
  place,
  zipCoords,
  className,
}: {
  place: Place
  zipCoords: ReadonlyMap<string, ZipCoords> | null
  className?: string
}) {
  const coords = resolveMapCoords(place, zipCoords)
  if (coords === null) return null
  return <MapCanvas markers={[coords]} fit={false} testId="place-map" className={className} />
}

/**
 * The directory's overview map (the /browse list): a marker per place that
 * resolves to coordinates, fitted to their bounds. Renders nothing when
 * nothing resolves — the caller shows the list either way.
 *
 * V13 ticket 05 (A6): a marker tap is an ENTRY POINT, not just a tooltip.
 * Tapping one opens a small info panel under the map with the place's name +
 * address and two actions: "Host here" (the existing place pre-fill router
 * state — navigate('/new', { state: { place } }), exactly the place page's
 * "Start a drop-in here" payload) and "Details" (the place page). The panel
 * lives in THIS component because the tapped place is Leaflet-side state;
 * everything it renders is presentational data handed back from the click.
 */
export function PlacesMap({
  places,
  zipCoords,
  className,
}: {
  places: readonly Place[]
  zipCoords: ReadonlyMap<string, ZipCoords> | null
  className?: string
}) {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Resolve each place's coords; keep the (place, coords) pairs so a tap can
  // hand back the full row, not just the coordinate.
  const entries = places
    .map((p) => ({ place: p, coords: resolveMapCoords(p, zipCoords) }))
    .filter((e): e is { place: Place; coords: MapMarker } => e.coords !== null)

  const markers = entries.map((e) => e.coords)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const initialMarkerRef = useRef(markers[0])
  const markersKey = markers.map((m) => `${m.lat}:${m.lng}`).join('|')
  // The clicked id must survive re-renders that rebuild an identical entries
  // array (the page hands this component fresh arrays every render); keying
  // off the id keeps the selection stable across those.
  const selected = selectedId === null ? null : (entries.find((e) => e.place.id === selectedId)?.place ?? null)

  useEffect(() => {
    const el = containerRef.current
    if (el === null || markers.length === 0) return
    const first = initialMarkerRef.current
    const map = L.map(el, { scrollWheelZoom: false }).setView(
      first === undefined ? SEATTLE_CENTER : [first.lat, first.lng],
      first === undefined ? 11 : DETAIL_ZOOM,
    )
    L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (map === null || markers.length === 0) return
    const group = L.layerGroup(
      entries.map(({ place, coords }) => {
        const marker = L.circleMarker([coords.lat, coords.lng], {
          radius: 8,
          color: '#4f46e5',
          weight: 2,
          fillColor: '#4f46e5',
          fillOpacity: 0.35,
        })
        marker.bindTooltip(place.name, { direction: 'top', offset: [0, -8] })
        marker.on('click', () => setSelectedId(place.id))
        return marker
      }),
    ).addTo(map)
    map.fitBounds(L.latLngBounds(entries.map((e) => [e.coords.lat, e.coords.lng])), {
      padding: [28, 28],
    })
    return () => {
      group.remove()
    }
  }, [markersKey])

  if (entries.length === 0) return null

  /**
   * "Host here" — the SAME payload the place page's "Start a drop-in here"
   * builds (App.tsx NewRoute reads state.place as a typed PlacePrefill): the
   * post lands with the place link, its address, and its coordinates for
   * distance; the parent still picks the time. Reusing the existing pattern
   * rather than inventing a second navigation shape.
   */
  function hostHere() {
    if (selected === null) return
    const prefill: PlacePrefill = {
      placeId: selected.id,
      place: selected.name,
      address: selected.address,
      neighborhoodId: selected.neighborhood_id,
    }
    navigate('/new', { state: { place: prefill } })
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        data-testid="places-map"
        className={`h-64 w-full overflow-hidden rounded-xl border border-slate-200 ${className ?? ''}`}
      />
      {selected !== null ? (
        <div
          data-testid="place-marker-info"
          className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-slate-900">{selected.name}</span>
            <span className="text-xs text-slate-600">{selected.address}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="host-here"
              onClick={() => hostHere()}
              className="rounded-xl bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Host here
            </button>
            <Link
              to={placePath(selected.id)}
              data-testid="marker-details"
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Details
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * V13 ticket 02: the interactive PICK-MODE map for /new's place picker.
 *
 * A marker per directory place that resolves to coordinates (DB lat/lng first,
 * else the gazetteer zip via `resolveMapCoords` — the same seam as PlacesMap).
 * Tapping a marker calls `onPick(place)` with the full Place row, so the page
 * can pre-fill the place field through the SAME pick path as the suggestion
 * list (`pickPlace` → `placePickPatch`). No browser geolocation anywhere:
 * coordinates come from the database only (the V12 t05 invariant), and a
 * place whose coordinates resolve to null simply has no marker (never a fake
 * pin).
 *
 * The canvas is interactive (scrollWheelZoom on, drag pan on) unlike the
 * read-only detail/browse surfaces — this is a picker, not a display. The
 * container keeps the `place-map` testid family so e2e specs can target it.
 */
export function PlacePickerMap({
  places,
  zipCoords,
  onPick,
  className,
}: {
  /** The directory rows to plot (the page passes whatever it loaded). */
  places: readonly Place[]
  /** The gazetteer zip→coords map (null while loading or on failure). */
  zipCoords: ReadonlyMap<string, ZipCoords> | null
  /** Called with the tapped Place; the page routes it through its pick seam. */
  onPick: (place: Place) => void
  className?: string
}) {
  // Resolve each place's coords; keep the (place, coords) pairs so a tap can
  // hand back the full row, not just the coordinate. Hooks must be called
  // unconditionally (rules-of-hooks), so they sit ABOVE the early return and
  // branch inside their effects when there is nothing to plot.
  const entries = places
    .map((p) => ({ place: p, coords: resolveMapCoords(p, zipCoords) }))
    .filter((e): e is { place: Place; coords: MapMarker } => e.coords !== null)

  const markers = entries.map((e) => e.coords)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const initialMarkerRef = useRef(markers[0])
  const markersKey = markers.map((m) => `${m.lat}:${m.lng}`).join('|')

  useEffect(() => {
    const el = containerRef.current
    if (el === null || markers.length === 0) return
    const first = initialMarkerRef.current
    const map = L.map(el, { scrollWheelZoom: true }).setView(
      first === undefined ? SEATTLE_CENTER : [first.lat, first.lng],
      first === undefined ? 11 : DETAIL_ZOOM,
    )
    L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (map === null || markers.length === 0) return
    const group = L.layerGroup(
      entries.map(({ place, coords }) => {
        const marker = L.circleMarker([coords.lat, coords.lng], {
          radius: 8,
          color: '#4f46e5',
          weight: 2,
          fillColor: '#4f46e5',
          fillOpacity: 0.35,
        })
        marker.bindTooltip(place.name, { direction: 'top', offset: [0, -8] })
        marker.on('click', () => onPick(place))
        return marker
      }),
    ).addTo(map)
    if (entries.length > 0) {
      map.fitBounds(L.latLngBounds(entries.map((e) => [e.coords.lat, e.coords.lng])), {
        padding: [28, 28],
      })
    }
    return () => {
      group.remove()
    }
  }, [markersKey])

  if (entries.length === 0) return null

  return (
    <div
      ref={containerRef}
      data-testid="place-picker-map"
      className={`h-64 w-full overflow-hidden rounded-xl border border-slate-200 ${className ?? ''}`}
    />
  )
}