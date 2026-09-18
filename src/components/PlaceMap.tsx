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
import { useEffect, useRef } from 'react'
import type { ZipCoords } from '../lib/feed'
import { resolveMapCoords } from '../lib/places'
import type { Place } from '../lib/types'

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
  const markers = places
    .map((p) => resolveMapCoords(p, zipCoords))
    .filter((c): c is MapMarker => c !== null)
  if (markers.length === 0) return null
  return <MapCanvas markers={markers} fit testId="places-map" className={className} />
}