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
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router'
import type { ZipCoords } from '../lib/feed'
import {
  DETAIL_ZOOM_FALLBACK,
  placeKindLabel,
  placeLearnMoreLink,
  placePath,
  resolveMapCoords,
  zoomForRadius,
} from '../lib/places'
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
/** The home pin's zoom (V15 ticket 02: centered on the viewer's home zip). */
const HOME_PIN_ZOOM = DETAIL_ZOOM_FALLBACK

interface MapMarker {
  lat: number
  lng: number
}
/**
 * ONE place's map (the /place/:id detail surface).
 *
 * V20 t02b — THIS IS NOW THE SAME MAP THE DIRECTORY USES, and that is the fix
 * for the founder's second report:
 *
 *   *"clicking on the blue circles on the maps on the places section and the
 *   post section still don't populate the ability to click on any buttons like
 *   start dropping or view more Details… All it does is populate text in a
 *   little bubble above it and then it goes away when you stop hovering."*
 *
 * They were describing TWO DIFFERENT MAPS. `/browse` and the feed render
 * `PlacesMap`, which has the info panel. This component — the map on the PLACE
 * PAGE, and the one the feed's own "Details" leads to — rendered `MapCanvas`,
 * whose circles were drawn with NO click handler at all. So a parent tapped the
 * blue dot on a place page and got exactly the hover tooltip they described:
 * text appears, nothing is clickable, and it vanishes on mouse-out.
 *
 * Rather than bolt a second panel onto `MapCanvas`, this delegates to
 * `PlacesMap` with a one-element array. That is the deliberate choice, because
 * the alternative is two markers-that-look-identical-but-behave-differently —
 * which is precisely the confusion being reported. One map, one behaviour, one
 * place to fix it next time.
 *
 * WHAT THAT MEANS CONCRETELY: the marker here is now tappable, it opens the
 * same name + address panel, and the panel offers "Start a drop-in", the
 * website/map-search link and "Details". Since this IS the place page, its
 * "Details" link points at itself — `placeActions` is set to `false` for that
 * reason, so the panel does not offer a door back to the room you are standing
 * in. The two actions that DO make sense from a place page (start a drop-in
 * here, learn more) are kept.
 *
 * THE COORDINATE RULE IS UNCHANGED: the place's own lat/lng first, else the
 * gazetteer's coordinates for the zip in its address; when both are absent
 * NOTHING renders (0029's rule — no fake pin, no 404-tile default view). That
 * decision is still `resolveMapCoords`, called here, exactly as before.
 *
 * `fit` is false and there is no home pin or radius circle: this map shows ONE
 * place, so there is nothing to fit and no search area to draw.
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
  return (
    <PlacesMap
      places={[place]}
      zipCoords={zipCoords}
      className={className}
      homePin={null}
      radiusCircle={null}
      /**
       * `false` DROPS THE "Details" DOOR, and this is the one place where the
       * shared panel is deliberately trimmed.
       *
       * On /browse and the feed, "Details" is how a parent gets from a pin to
       * the place's page — it is the panel's whole point there. On the place's
       * OWN page it would be a link to the page you are already on: a control
       * that appears to do nothing when tapped (the browser may not even
       * re-render). A button that seems broken is worse than no button, which
       * is the same rule `placeActions` was introduced for on the feed.
       *
       * "Start a drop-in" and "Learn more" are KEPT, because both are things a
       * parent genuinely wants from this page and neither is a no-op here.
       */
      placeActions={false}
      testId="place-map"
    />
  )
}

/**
 * The directory's overview map (the /browse list): a marker per place that
 * resolves to coordinates, fitted to their bounds. Renders nothing when
 * nothing resolves — the caller shows the list either way.
 *
 * V13 ticket 05 (A6): a marker tap is an ENTRY POINT, not just a tooltip.
 * Tapping one opens a small info panel under the map with the place's name +
 * address and three actions: "Start a drop-in" (the existing place pre-fill
 * router state — navigate('/new', { state: { place } }), exactly the place
 * page's "Start a drop-in here" payload), "Learn more" (V15 ticket 04: the
 * derived OSM search URL in a new tab; inline details when there is no name to
 * search), and "Details" (the place page). The panel lives in THIS component
 * because the tapped place is Leaflet-side state; everything it renders is
 * presentational data handed back from the click.
 *
 * V15 ticket 02: optional `homePin` + `radiusCircle` overlays (additive only —
 * the place-dot rendering above is unchanged). The home pin is a distinct red
 * marker at the viewer's stored home_zip coords; the radius circle is a
 * translucent overlay around the chosen center.
 *
 * V16 t07 item 2: the map is framed by that RADIUS CIRCLE, not by the bounds of
 * every place. The caller (BrowsePage's pure `framingCircle`) passes a circle
 * whenever the viewer has a geocoded center OR a home pin, so this is the sole
 * framing authority; only a viewer with neither falls back to the mount view
 * below (centered on the home pin / first marker).
 */
export function PlacesMap({
  places,
  zipCoords,
  className,
  homePin,
  radiusCircle,
  placeActions = true,
  testId = 'places-map',
  onSelect,
}: {
  places: readonly Place[]
  zipCoords: ReadonlyMap<string, ZipCoords> | null
  className?: string
  /**
   * V20 t02b: the map container's `data-testid`. Defaults to `places-map`, the
   * id every existing spec and the browse page already target. The PLACE PAGE
   * passes `place-map`, because that surface has had its own testid since V12
   * t05 and `/place/:id` renders exactly one map — there is nothing to
   * disambiguate, and keeping the old id is what lets that page's existing
   * assertions (and any future one) address it without knowing this component
   * is now shared.
   */
  testId?: string
  /** V15 t02: the viewer's home location (from the stored home_zip gazetteer).
      Rendered as a distinct red pin; the map centers on it at mount. */
  homePin?: { lat: number; lng: number } | null
  /** V15 t02: a radius overlay (center + miles). Drawn as a translucent circle. */
  radiusCircle?: { center: { lat: number; lng: number }; radiusMiles: number } | null
  /**
   * V19 t02: whether a tapped marker offers the DIRECTORY actions — "Start a
   * drop-in" (which navigates to /new with `placeId`) and "Details" (which links
   * to `/place/:id`).
   *
   * Defaults to TRUE, the behaviour every existing caller wants: on /browse the
   * markers ARE directory rows, so both actions resolve.
   *
   * TWO CALLERS PASS FALSE, for two DIFFERENT reasons — which is why the flags
   * below are derived per-button rather than switching the whole row off:
   *
   *  1. **The FEED**, for pins that are not directory places. The `ocr` review
   *     lane caught why this matters: synthesising a fake `Place` with
   *     `id: 'feed-pin-0'` made "Start a drop-in" hand `/new` a non-uuid, which
   *     the `playdates.place_id` FK (uuid → places.id, migration 0030) rejects
   *     on submit — a guaranteed failure behind a button that looked fine. A
   *     panel offering an action it cannot honour is worse than no action, so a
   *     non-directory pin keeps the informational panel (name + address) and
   *     drops the two controls that need a real id.
   *
   *  2. **The place's own page** (V20 t02b). Its pin DOES have a real id, so
   *     "Start a drop-in" is perfectly honourable there — it is the "Details"
   *     door that makes no sense, because it links to `/place/:id` and this IS
   *     that page. Tapping it would appear to do nothing.
   *
   * Hence the two flags below: "Start a drop-in" follows the PIN's identity,
   * "Details" additionally follows the SURFACE. A feed pin with no id gets
   * neither; the place page gets the first and not the second; /browse gets
   * both.
   */
  placeActions?: boolean
  /**
   * V21 t02: when set, the panel's "Start a drop-in" button calls this with the
   * tapped place instead of navigating to /new (the `hostHere` default). This is
   * how the directory surface embedded in /new selects a place into its form —
   * the SAME pick path the suggestion list uses, never a second write. When
   * absent, the existing navigate-to-/new behaviour stands unchanged.
   */
  onSelect?: (place: Place) => void
}) {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /**
   * V20 t03: the DOM node Leaflet created for the OPEN popup, or null when none
   * is open. React portals the place's detail content INTO this node.
   *
   * WHY A PORTAL RATHER THAN A REACT-RENDERED `<Popup>` COMPONENT: there is no
   * official react-leaflet binding in this repo (the map is driven through
   * Leaflet's own imperative API, deliberately — see the file header), so the
   * popup element is created by Leaflet and belongs to Leaflet's DOM. A portal
   * is exactly the tool for "render React content into a node somebody else
   * owns": React keeps ownership of the buttons, their handlers and their
   * lifecycle, while Leaflet keeps ownership of the bubble, its tail, its
   * positioning and its open/close state.
   *
   * The alternative — building the popup's markup as an HTML string — would put
   * every button outside React, which means re-deriving each seam
   * (`placeLearnMoreLink`, the `hostHere` prefill) and re-binding listeners by
   * hand. Two sources of truth for one panel, which is what this file keeps
   * learning not to do.
   */
  const [popupHost, setPopupHost] = useState<HTMLDivElement | null>(null)

  // Resolve each place's coords; keep the (place, coords) pairs so a tap can
  // hand back the full row, not just the coordinate.
  const entries = places
    .map((p) => ({ place: p, coords: resolveMapCoords(p, zipCoords) }))
    .filter((e): e is { place: Place; coords: MapMarker } => e.coords !== null)

  const markers = entries.map((e) => e.coords)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  // V15 t02: anchor on the home pin when provided (the ticket's AC1), else the
  // first place marker (existing behavior). Read through a ref so the mount
  // effect's dependency list stays empty.
  const initialAnchorRef = useRef<MapMarker | undefined>(homePin ?? markers[0])
  const hasHomePinRef = useRef(homePin !== undefined && homePin !== null)
  const markersKey = markers.map((m) => `${m.lat}:${m.lng}`).join('|')
  // The clicked id must survive re-renders that rebuild an identical entries
  // array (the page hands this component fresh arrays every render); keying
  // off the id keeps the selection stable across those.
  const selected = selectedId === null ? null : (entries.find((e) => e.place.id === selectedId)?.place ?? null)

  useEffect(() => {
    const el = containerRef.current
    if (el === null || markers.length === 0) return
    const anchor = initialAnchorRef.current
    const zoom = hasHomePinRef.current ? HOME_PIN_ZOOM : anchor === undefined ? 11 : DETAIL_ZOOM
    const map = L.map(el, { scrollWheelZoom: false }).setView(
      anchor === undefined ? SEATTLE_CENTER : [anchor.lat, anchor.lng],
      zoom,
    )
    L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // V15 t02: the home pin + radius circle overlay. A separate layerGroup so it
  // never mixes with the place-marker group (which is re-keyed by markersKey).
  const overlayKey = `${homePin?.lat ?? ''}:${homePin?.lng ?? ''}|${radiusCircle?.center.lat ?? ''}:${radiusCircle?.center.lng ?? ''}:${radiusCircle?.radiusMiles ?? ''}`
  useEffect(() => {
    const map = mapRef.current
    if (map === null) return
    const layers: L.Layer[] = []
    if (homePin !== undefined && homePin !== null) {
      const pin = L.circleMarker([homePin.lat, homePin.lng], {
        radius: 10,
        color: '#dc2626',
        weight: 3,
        fillColor: '#dc2626',
        fillOpacity: 0.85,
      })
      pin.bindTooltip('Home', { direction: 'top', offset: [0, -10] })
      layers.push(pin.addTo(map))
    }
    if (radiusCircle !== undefined && radiusCircle !== null) {
      const meters = radiusCircle.radiusMiles * 1609.344
      /**
       * V20 t05 — THE RADIUS OVERLAY IS NOT A POINTER TARGET.
       *
       * `L.circle` defaults to `interactive: true`, so this translucent disc —
       * which after V20 t05 can be HUNDREDS of pixels across, because it is now
       * drawn to scale rather than self-fitting — sits in the overlay pane
       * swallowing taps aimed at anything inside it. That is the whole map,
       * once the radius covers the neighbourhood.
       *
       * MEASURED on this slice's own e2e run: Playwright found the marker
       * tooltip "visible, enabled and stable" and then refused the click with
       * `<path fill="#dc2626" …> … intercepts pointer events`. What a parent
       * experiences is a blue circle or a white label that simply does not
       * respond. The circle is a READING AID — an area indicator, never a
       * control — so it has no click handler to lose.
       *
       * `interactive: true` IS KEPT DELIBERATELY, with the pointer events turned
       * off via `className` instead. Two reasons, and the second is the one that
       * bit:
       *
       *  1. Leaflet's own `Layer.removeInteractiveTarget` / `addInteractiveTarget`
       *     bookkeeping is what makes the circle participate in the map's
       *     `_targets` list; flipping the flag off is a coarser change than this
       *     needs.
       *  2. `leaflet-interactive` is the ONLY stable hook a spec has for telling
       *     the radius circle apart from the home pin — both are red
       *     `#dc2626` circle markers with stroke, and the circle is identified
       *     by its `fill-opacity="0.08"` (documented in
       *     `e2e/places.e2e.ts`). Dropping the class broke five specs, which is
       *     how this was found.
       *
       * So the class stays and `pointer-events: none` is set inline, one line
       * below, for the same reason the class is needed: they are different
       * properties with different jobs.
       */
      const circle = L.circle([radiusCircle.center.lat, radiusCircle.center.lng], {
        radius: meters,
        color: '#dc2626',
        weight: 2,
        fillColor: '#dc2626',
        fillOpacity: 0.08,
      })
      /**
       * `pointerEvents` is a plain SVG style property, so Leaflet's `path` option
       * setter handles it without any cast — and it is applied to BOTH the fill
       * and the stroke, which is what makes the whole disc transparent to taps.
       * `stroke: false` / `fill: false` would not do: those stop the shape being
       * drawn, and the circle has to stay visible to be a measuring tool.
       */
      layers.push(circle.addTo(map))
      // `getElement()` is typed as `Element`; an `L.Circle` is always an SVG
      // `<path>`, and the narrow cast is what lets the style be set. (`instanceof
      // SVGElement` would also work and would silently do NOTHING if Leaflet ever
      // returned something else — a silent no-op is the failure mode this file has
      // been bitten by, so a cast that throws loudly is the better trade here.)
      const path = circle.getElement() as SVGElement | null
      if (path !== null) path.style.pointerEvents = 'none'
    }
    return () => {
      for (const layer of layers) layer.remove()
    }
  }, [overlayKey])

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
        /**
         * V20 t03 — THE BUBBLE ITSELF EXPANDS, AND STAYS.
         *
         * The founder, after seeing the first version of this: *"what I would
         * really like is when you click on one the little text bubble that pops
         * up should expand and there should be like a learn more or start a
         * drop-in button inside of that text bubble. And it should stay on the
         * screen until you select a different blue circle… I think that would be
         * more intuitive, better user experience, to stay on the map."*
         *
         * So a tap now opens a real Leaflet POPUP anchored to the circle — with
         * a tail, moving with the map as the parent pans and zooms, staying open
         * until they tap a different circle or press its ✕. Its CONTENT is the
         * same React element the panel below used to render, mounted into the
         * popup through a portal (see `popupHost` in the render): React keeps
         * owning the buttons, so "Start a drop-in" still calls `hostHere()` and
         * the link still comes from `placeLearnMoreLink`. Building the markup by
         * hand as an HTML string would mean re-wiring every handler and
         * re-deriving every seam outside React, for no benefit.
         *
         * WHY A POPUP RATHER THAN THE PANEL BELOW THE MAP: the panel sits under
         * the map, so tapping a dot pulls the parent's attention off the thing
         * they just touched — comparing two places means look down, look up,
         * look down. Keeping the detail ON the pin makes the map the thing being
         * read, which is the whole point of tapping it.
         *
         * THE HOVER TOOLTIP STAYS, unchanged in behaviour: on a desktop it is
         * how a parent sees what a dot IS before committing to a tap, and it
         * remains `interactive: true` so the white box is itself a hit target —
         * tapping the label opens the same popup the circle does, which is what
         * the founder asked for in the previous round.
         *
         * `autoPan: true` IS THE ONE NON-OBVIOUS OPTION. Leaflet does not bring
         * a popup into view by default, so a circle near the map's edge would
         * open its bubble half off-canvas — buttons visible but unreachable,
         * which is the same defect class as the clipped panel this file has been
         * bitten by before. `autoPanPadding` keeps it clear of the zoom control.
         *
         * `closeButton: true` is what makes "until you select a different blue
         * circle" survivable when the parent changes their mind: there is a ✕ to
         * dismiss the bubble without having to tap another dot.
         */
        const tooltip = marker.bindTooltip(place.name, {
          direction: 'top',
          offset: [0, -8],
          interactive: true,
          ...({ stoppable: true } as L.TooltipOptions),
        })
        tooltip.on('click', () => setSelectedId(place.id))

        /**
         * The popup: Leaflet owns the bubble, React owns what is inside it.
         *
         * The CONTENT is an empty `<div>` that Leaflet positions and that the
         * portal below renders into. Leaflet is told about the node once, at
         * creation, and reuses the same element for every open — which is what
         * lets the portal stay mounted across opens rather than remounting the
         * buttons each time.
         *
         * `autoPan: true` IS THE ONE NON-OBVIOUS OPTION. Leaflet does not bring
         * a popup into view by default, so a circle near the map's edge would
         * open its bubble half off-canvas — buttons visible but unreachable,
         * which is the same defect class as the clipped panel this file has been
         * bitten by before. `autoPanPadding` keeps it clear of the zoom control.
         *
         * `closeButton: true` is what makes "stays until you select a different
         * blue circle" survivable when the parent changes their mind: there is a
         * ✕ to dismiss the bubble without having to tap another dot.
         */
        const host = document.createElement('div')
        /**
         * `autoPanPaddingTopLeft` IS ASYMMETRIC ON PURPOSE, and the asymmetry is
         * the whole reason the bubble stays on screen.
         *
         * `_adjustPan` pans by exactly the OVERFLOW, measured against
         * `autoPanPadding`. A popup is ~230px tall and the map band is ~380px,
         * so a marker in the upper half cannot fit its bubble above it — and a
         * uniform padding lets Leaflet pan until the popup's TOP edge merely
         * touches the pane's top, which leaves the tail and the marker itself
         * off-canvas. The parent then reads a bubble pointing at nothing.
         *
         * MEASURED before this change: on /browse the popup rendered from y=30
         * while the map pane began at y=216 — 186px of it outside the map,
         * overlapping the page above.
         *
         * The top padding reserves room for the bubble AND its tail (~260px),
         * while the bottom padding stays small (24px) because below the marker
         * there is only the dot and the pane edge. Leaflet then pans far enough
         * that the whole bubble plus the pin it belongs to are inside the view.
         *
         * The `maxHeight` cap is the backstop for a very tall popup on a very
         * short map: it scrolls inside the bubble rather than escaping the pane.
         */
        const popup = L.popup({
          autoPan: true,
          /**
           * THE TOP PADDING IS DERIVED FROM THE PANE, not a fixed 250px, and that
           * is the correction this slice's own e2e run forced.
           *
           * `_adjustPan` pans by the OVERFLOW against these paddings, and it can
           * only move the map as far as the pane allows. A padding LARGER than
           * the pane is unsatisfiable: Leaflet pans to its limit and the popup
           * still hangs over the top edge — measured, the "Start a drop-in"
           * button ended up under the map card's own header row, so the guard
           * that hit-tests the button's centre (correctly) failed.
           *
           * The band is `45dvh` (~380px on a phone) and a popup is ~230px, so
           * reserving the popup's full height plus a tail is not always possible
           * ABOVE a marker. Half the pane is what fits for a marker anywhere in
           * it: the map pans until the pin sits in the lower half, which leaves
           * the bubble room above it without chasing a distance the pane cannot
           * cover.
           *
           * `map.getSize()` is read HERE rather than from a constant because the
           * three callers give this map three different heights — `45dvh` on
           * /browse, a fixed `h-64` on the place page and in /new's picker — and
           * the map instance is the one source that knows its own.
           */
          /**
           * THE PADDING ASKS FOR THE POPUP'S OWN HEIGHT, CAPPED BY THE PANE.
           *
           * With panning alone this cannot be satisfied in a 380px band — a
           * 234px popup above a pin near the top needs ~260px of clearance and
           * the map, which is `overflow: hidden`, simply CLIPS what it cannot
           * fit. Measured: the popup rendered from y=195 while the map began at
           * y=216, so 21px of it (and the card's own boundary) sat over the
           * page, and the button's hit test landed on the card behind it.
           *
           * So the number here is a REQUEST, and `min-h` on the map below is
           * what MAKES ROOM for it. Together: the map grows to at least the
           * popup's height plus a margin while a popup is open, and the pan
           * then has somewhere to move to.
           */
          autoPanPaddingTopLeft: [24, Math.min(260, Math.max(120, Math.round(map.getSize().y * 0.8)))],
          autoPanPaddingBottomRight: [24, 24],
          closeButton: true,
          offset: [0, -6],
          /**
           * THE BUBBLE IS KEPT SMALL, and both reasons are load-bearing.
           *
           * 1. IT MUST FIT ABOVE THE PIN. A Leaflet popup opens UPWARD and has no
           *    `direction` option, so a bubble taller than the space above the
           *    marker cannot be brought into view by `autoPan` — the pan runs to
           *    its limit and the rest hangs over the map's own edge, on top of
           *    the page behind it. Measured on the /browse band (~380px): a
           *    234px bubble on a marker in the upper third settled 190px ABOVE
           *    the map card. Keeping the bubble under ~170px means it fits above
           *    a marker anywhere in the lower two-thirds, and `maxHeight` scrolls
           *    the rare overflow inside the bubble rather than out of the pane.
           *
           * 2. IT MUST NOT BLANKET THE MAP. An open popup sits OVER the map, so
           *    every pixel it takes is a pixel a parent cannot tap to reach
           *    another circle — and "tap a different circle" is exactly the
           *    behaviour being asked for. Measured with a 260px-wide bubble: it
           *    covered three pins at once.
           *
           * `closeOnClick` (Leaflet's default, pinned explicitly here) is the
           * other half: a tap outside the bubble dismisses it AND reaches the map
           * underneath, so a parent who tapped the wrong dot and then taps away
           * is never stuck.
           */
          closeOnClick: true,
          minWidth: 180,
          maxWidth: 210,
          maxHeight: 170,
          className: 'place-popup',
        }).setContent(host)
        marker.bindPopup(popup)
        /**
         * `setOpenPlaceId` on open, and a GUARDED clear on close.
         *
         * Opening a second popup fires `popupclose` for the FIRST one, and an
         * unconditional `setPopupHost(null)` there would wipe the host the
         * parent just opened — the bubble would render empty. So the clear only
         * happens when the closing marker is the one currently open.
         */
        marker.on('popupopen', () => {
          setSelectedId(place.id)
          setPopupHost(host)
        })
        marker.on('popupclose', () => {
          setPopupHost((current) => (current === host ? null : current))
        })
        marker.on('click', () => setSelectedId(place.id))
        return marker
      }),
    ).addTo(map)
    // V16 t07 item 2 — THE CAMERA IS NOT MOVED HERE ANY MORE.
    //
    // This effect used to fitBounds over every place PLUS the home pin, on the
    // theory (V15.1) that it kept the pin on screen and every marker tappable.
    // Those two goals CONFLICT at city scale: fitBounds picks the zoom that fits
    // ALL points, and `maxZoom` only caps how far IN it may go — nothing stopped
    // it zooming OUT. With dozens of places across Seattle the fit became a
    // city-wide view and every marker collapsed into the overlapping blue blob
    // the founder photographed.
    //
    // The invariant is now: **the view is framed by the SEARCH RADIUS**, by the
    // circle effect below — the only place that moves the camera. The home pin
    // is the frame's center whenever there is no geocoded address (BrowsePage
    // passes the circle either way), so the pin still cannot scroll out of view.
    //
    // RETIRED, EXPLICITLY: "every place on the map is inside the canvas and
    // tappable". A place OUTSIDE the radius is legitimately off-canvas — that is
    // what a radius means. Markers still in range are tappable; the marker-click
    // spec must be run at the WIDEST radius, not the default, because that is
    // where the frame is largest and this trade is most visible.
    //
    // The V15 t02 bug this comment block once guarded — a marker rendered at
    // SVG `d="M0 0"` (in the DOM, zero-size, UNCLICKABLE) after a search
    // narrowed the set — was caused by a wrong VIEW, not by a missing fit here.
    // The circle effect now sets that view on every mount and set change.
    // The container is measured when Leaflet builds the map; a remount (or a
    // late layout) can leave that measurement stale, so re-measure here.
    map.invalidateSize()
    return () => {
      group.remove()
    }
  }, [markersKey])

  // V15 t02 / V16 t07 item 2: THE framing authority. When the caller sets a
  // radiusCircle — geocoded center, else the home pin at the viewer's radius —
  // recenter and zoom to fit it. A separate effect so the circle's appearance
  // triggers the recenter without touching the place-marker group. This is now
  // the ONLY effect that moves the camera (the marker group above just adds
  // circles), so the view is always the circle the viewer asked to see.
  const circleKey =
    radiusCircle !== undefined && radiusCircle !== null
      ? `${radiusCircle.center.lat}:${radiusCircle.center.lng}:${radiusCircle.radiusMiles}`
      : ''
  /**
   * `zoom` is React state as well as a map concern, because it is what makes
   * the radius circle LEGIBLE — see the effect below.
   */
  const [zoom, setZoom] = useState<number>(DETAIL_ZOOM_FALLBACK)
  useEffect(() => {
    const map = mapRef.current
    if (map === null) return
    const onZoomEnd = () => setZoom(map.getZoom())
    map.on('zoomend', onZoomEnd)
    onZoomEnd()
    return () => {
      map.off('zoomend', onZoomEnd)
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (map === null || circleKey === '') return
    const parts = circleKey.split(':')
    const miles = Number(parts[2])
    /**
     * V20 t05 — THE CIRCLE IS DRAWN TO SCALE AT THE CURRENT ZOOM, AND THE
     * CAMERA IS NOT MOVED.
     *
     * This effect used to `fitBounds` the circle's extent on every change. That
     * reads well and is WRONG for a live preview, and the e2e spec measured why:
     * fitting the bounds rescales the view to the circle, so the circle always
     * renders at nearly the same on-screen size — dragging 1 mile to 30 miles
     * zoomed the map OUT and left the circle the same number of pixels wide. The
     * founder's ask is to *see how much area the radius takes up*, which under a
     * self-fitting camera is precisely the thing that never changes.
     *
     * So the camera stays where it is and the circle is drawn in real
     * geography: at a fixed zoom, 30 miles of radius is 30 times the pixels of
     * 1 mile, and the parent watches it swallow the whole neighbourhood — the
     * Marketplace behaviour the founder named.
     *
     * THE ZOOM IS PINNED WHEN THE PREVIEW OPENS, not free: `zoomForRadius`
     * picks the zoom that frames the FIRST radius of this drag so the circle
     * starts sensibly on screen, and every later change of the slider only
     * redraws. Without that, opening the dialog on a 30-mile stored radius would
     * start with a circle far larger than the pane.
     */
    map.setZoom(zoomForRadius(miles))
  }, [circleKey])

  if (entries.length === 0 && homePin === undefined && homePin === null) return null

  /**
   * "Start a drop-in" — the SAME payload the place page's "Start a drop-in here"
   * builds (App.tsx NewRoute reads state.place as a typed PlacePrefill): the
   * post lands with the place link, its address, and its coordinates for
   * distance; the parent still picks the time. Reusing the existing pattern
   * rather than inventing a second navigation shape.
   */
  function hostHere() {
    if (selected === null) return
    // V21 t02: a host-embedded directory selects into its own form instead of
    // navigating away — the SAME pick path, never a second write.
    if (onSelect !== undefined) {
      onSelect(selected)
      return
    }
    const prefill: PlacePrefill = {
      placeId: selected.id,
      place: selected.name,
      address: selected.address,
      neighborhoodId: selected.neighborhood_id,
    }
    navigate('/new', { state: { place: prefill } })
  }

  /**
   * V15 ticket 04 / V20 t01: where this panel's outbound link goes — the
   * place's own verified website when the reviewed backfill found one, else the
   * derived OSM search. Null only when the place has no name AND no URL
   * (defensive); the panel then shows the place's details inline instead of a
   * broken link.
   *
   * THE LABEL COMES FROM THE SAME SEAM'S `kind`, which is why this is not a
   * second `placeExternalUrl` call any more. The e2e run for this slice caught
   * the difference: the panel still said "Learn more" over an OpenStreetMap
   * search URL, which is exactly the small lie V20 t01 exists to remove — a
   * parent who clicks "Learn more" expecting the park's own page lands on a map
   * search. Now a stored site says "Visit website" and the fallback says "Find
   * it on the map".
   */
  const learnMore = selected !== null ? placeLearnMoreLink(selected) : null

  /**
   * WHICH ACTION BUTTONS THIS PANEL SHOWS — the two flags the JSX above reads.
   *
   * `placeActions` is the DIRECTORY case and covers both buttons together.
   * When it is false, this map is still showing a real `Place` row (both false
   * callers pass genuine directory rows or none at all), so:
   *
   *   - **"Start a drop-in" stays**: it needs only a real `places.id`, and
   *     `hostHere()` hands `/new` exactly the same typed `PlacePrefill` the
   *     place page's own "Start a drop-in here" button builds. It is the most
   *     useful thing on the panel and it works from every surface.
   *   - **"Details" goes**: it links to `/place/:id`. On the place's own page
   *     that is a link to itself — a control that looks live and does nothing,
   *     which is the defect class this whole prop exists to prevent.
   *
   * So a `Place` must carry an id for either button to mean anything, and the
   * flags are computed from that rather than from the caller's intent, so a
   * caller cannot accidentally offer a door to nowhere.
   */
  /**
   * WHICH PIN DID THE PARENT TAP, AND CAN IT HONOUR A BUTTON?
   *
   * `PlacePickerMap`'s discipline, applied here: a control is offered only when
   * the thing behind it is real. `placeActions` is a SURFACE-level answer — is a
   * link to the place page useful HERE? — and the id test below is the PER-PIN
   * one.
   *
   * THE ID IS THE CHECK THAT MATTERS, and it is per-PIN rather than per-map. A
   * feed can hold a placed post and a free-text one at once; the free-text pin
   * is synthesised with `feed-pin-N` and has no row behind it, so tapping THAT
   * dot must not offer "Start a drop-in" — while tapping the placed dot beside
   * it should. It is the same uuid test the FK enforces (`playdates.place_id`,
   * migration 0030), so the panel cannot promise something the insert would
   * reject.
   *
   * (An earlier draft of this slice added a `canStartDropIn` prop for the
   * feed's benefit. It was redundant the moment the id was tested directly —
   * the feed's own rows either carry a real uuid or a synthesised label, and
   * that difference IS the answer. A prop that restates a check the panel
   * already performs is a second source of truth for one fact.)
   */
  const isRealPlaceId = selected !== null && /^[0-9a-f-]{36}$/i.test(selected.id)
  const showHostHere = isRealPlaceId
  const showDetails = isRealPlaceId && placeActions

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        data-testid={testId}
        // V20 t05: `data-map-zoom` exposes the LIVE zoom, which is the only
        // honest way for a spec to prove the circle is drawn to SCALE. The
        // circle's own pixel radius is not enough on its own: under a
        // self-fitting camera it stays roughly constant, and reading it alone
        // would call a broken preview healthy. Zoom falling while the radius
        // grows is what "zoomed out to show more area" means, measured.
        data-map-zoom={zoom}
        /**
         * V20 t03: `overflow-hidden` IS DROPPED WHILE A POPUP IS OPEN, and this
         * is the fix that makes the bubble genuinely reachable rather than
         * merely visible.
         *
         * The map clips its own panes — that is what keeps OSM tiles inside the
         * rounded border — and Leaflet's popup lives in one of those panes. A
         * popup is ~234px tall and the band is ~380px, so a bubble on a marker
         * near the top cannot fit above it: `autoPan` moves the map as far as it
         * can and the rest is CLIPPED. Measured before this change: the popup
         * began 21px ABOVE the map's top edge, and the button's centre
         * hit-tested as the map card behind it — visible, and untappable, which
         * is precisely the defect the A6 reachability guard was written for and
         * exactly what it caught.
         *
         * Letting the pane escape the rounded border for the life of an open
         * popup keeps the bubble whole. The border radius is restored with it,
         * and `overflow: visible` is reverted the moment the popup closes, so
         * the tile-clipping that the border exists for is only relaxed while
         * there is a bubble to fit.
         */
        className={
          'h-64 w-full rounded-xl border border-slate-200 ' +
          (popupHost === null ? 'overflow-hidden ' : '') +
          (className ?? '')
        }
      />
      {/* V20 t03: THE DETAIL IS PORTALED INTO THE PIN'S OWN POPUP.
          Not rendered here, below the map — that is the change the founder asked
          for ("stay on the map… I [don't want to] have to go to the component
          below it").

          The content is built ONCE as a variable and mounted through
          `createPortal` into the node Leaflet created, so React keeps every
          handler and seam while Leaflet keeps the bubble, its tail and its
          position. `document.body` is the fallback only if the portal somehow
          runs without a host, which cannot happen while `popupHost` is set —
          but `createPortal` needs a non-null node and a guard that renders
          nothing would be the silent-no-op failure this file keeps guarding
          against.

          `data-testid="place-marker-info"` is preserved on the same inner div,
          so every spec that asserts the panel (and the reachability discipline
          those specs carry) keeps working against the popup. */}
      {selected !== null && popupHost !== null
        ? createPortal(
            <div
              data-testid="place-marker-info"
              className="flex flex-col gap-2 p-1"
            >
              <div className="flex flex-col gap-0.5 pr-4">
                <span className="text-sm font-semibold text-slate-900">{selected.name}</span>
                <span className="text-xs text-slate-600">{selected.address}</span>
              </div>
              {/* V19 t02 / V20 t02b: THE ACTION ROW IS PER-BUTTON, not
                  all-or-nothing. `placeActions=false` (the feed, and the
                  place's own page) drops the controls that surface cannot
                  honour. See the prop's doc comment for the two cases and the
                  `ocr` finding behind the first of them. */}
              {showHostHere || showDetails || learnMore !== null ? (
                <div className="flex flex-wrap items-center gap-2">
                  {showHostHere ? (
                    <button
                      type="button"
                      data-testid="host-here"
                      onClick={() => hostHere()}
                      className="min-h-11 rounded-xl bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                    >
                      Start a drop-in
                    </button>
                  ) : null}
                  {learnMore !== null ? (
                    <a
                      href={learnMore.url}
                      target="_blank"
                      rel="noopener"
                      data-testid="learn-more"
                      data-link-kind={learnMore.kind}
                      className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      {learnMore.kind === 'website' ? 'Visit website' : 'Find it on the map'}
                    </a>
                  ) : null}
                  {showDetails ? (
                    <Link
                      to={placePath(selected.id)}
                      data-testid="marker-details"
                      className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      Details
                    </Link>
                  ) : null}
                </div>
              ) : null}
              {/* No external URL AND no actions to offer (a nameless place with
                  `placeActions` off): show the place's own details inline rather
                  than an empty row — V15 ticket 04 AC5. Gated on the same
                  conditions as the row above so the two can never both appear
                  or both vanish. */}
              {learnMore === null && !showHostHere && !showDetails ? (
                <span data-testid="learn-more-inline" className="text-xs text-slate-600">
                  {placeKindLabel(selected.kind)}
                  {selected.notes !== null && selected.notes !== '' ? ` · ${selected.notes}` : ''}
                </span>
              ) : null}
            </div>,
            popupHost,
          )
        : null}
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
 *
 * V21 t02 Phase B: optional `homePin` + `radiusCircle` overlays (the same two
 * props `PlacesMap` carries): the viewer's home pin and their radius circle,
 * drawn as reading aids around the directory markers. When a radius circle is
 * present the mount view frames it at `zoomForRadius` (the browse map's own
 * framing rule); without one the existing points-fit stands unchanged.
 */
export function PlacePickerMap({
  places,
  zipCoords,
  onPick,
  className,
  homePin,
  radiusCircle,
}: {
  /** The directory rows to plot (the page passes whatever it loaded). */
  places: readonly Place[]
  /** The gazetteer zip→coords map (null while loading or on failure). */
  zipCoords: ReadonlyMap<string, ZipCoords> | null
  /** Called with the tapped Place; the page routes it through its pick seam. */
  onPick: (place: Place) => void
  className?: string
  /** The viewer's home location (from the stored home_zip gazetteer), if any. */
  homePin?: { lat: number; lng: number } | null
  /** A radius overlay (center + miles) to frame the picker view on. */
  radiusCircle?: { center: { lat: number; lng: number }; radiusMiles: number } | null
}) {
  // Resolve each place's coords; keep the (place, coords) pairs so a tap can
  // hand back the full row, not just the coordinate. Hooks must be called
  // unconditionally (rules-of-hooks), so they sit ABOVE the early return and
  // branch inside their effects when there is nothing to plot.
  const entries = places
    .map((p) => ({ place: p, coords: resolveMapCoords(p, zipCoords) }))
    .filter((e): e is { place: Place; coords: MapMarker } => e.coords !== null)

  /**
   * V20 t04 — THE TAPPED PIN WAITS FOR A CONFIRMATION.
   *
   * The founder, on /new's picker: *"when you click on a blue circle, it fills
   * in the where in the address, which is great, but it's not obvious that
   * that's happening. So maybe when you click on a blue circle, there should be
   * a button that says like, select. Under the event that pops up or something,
   * and when you click it, then it populates those two fields."*
   *
   * The old behaviour wrote both fields on the marker click, and the fields sit
   * ABOVE the map on /new — so on a phone the parent tapped a dot, the form
   * changed off-screen, and nothing visible happened. A tap now SELECTS (the
   * panel below the map names the place and offers "Select this place"), and
   * the write happens on the button, where the parent is looking.
   *
   * THIS IS A REAL BEHAVIOUR CHANGE AND IT IS DELIBERATE: `onPick` is called
   * from the panel's button, never from the marker. The marker click only moves
   * `selectedId`, so a tap that was a mis-tap costs nothing.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const markers = entries.map((e) => e.coords)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  // V21 t02 Phase B: the mount anchor is the home pin when provided (the same
  // rule `PlacesMap` uses), else the first marker (the pre-existing behaviour).
  // Read through a ref so the mount effect's dependency list stays empty.
  const initialAnchorRef = useRef<MapMarker | undefined>(homePin ?? markers[0])
  const hasHomePinRef = useRef(homePin !== undefined && homePin !== null)
  const markersKey = markers.map((m) => `${m.lat}:${m.lng}`).join('|')
  const selected =
    selectedId === null ? null : (entries.find((e) => e.place.id === selectedId)?.place ?? null)

  useEffect(() => {
    const el = containerRef.current
    if (el === null || markers.length === 0) return
    const anchor = initialAnchorRef.current
    // V21 t02 Phase B: a radius circle frames the mount view at its own zoom
    // (the browse map's `zoomForRadius` rule); without one, the home pin opens
    // at the detail fallback and a bare points-fit keeps the old behaviour.
    const frameZoom =
      radiusCircle !== undefined && radiusCircle !== null
        ? zoomForRadius(radiusCircle.radiusMiles)
        : hasHomePinRef.current
          ? HOME_PIN_ZOOM
          : anchor === undefined
            ? 11
            : DETAIL_ZOOM
    const map = L.map(el, { scrollWheelZoom: true }).setView(
      anchor === undefined ? SEATTLE_CENTER : [anchor.lat, anchor.lng],
      frameZoom,
    )
    L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // V21 t02 Phase B: the home pin + radius circle overlay — the same layer as
  // `PlacesMap`'s (a separate group so it never mixes with the marker group).
  // The circle is a reading aid only: pointer events off, exactly as there.
  const pickerOverlayKey = `${homePin?.lat ?? ''}:${homePin?.lng ?? ''}|${radiusCircle?.center.lat ?? ''}:${radiusCircle?.center.lng ?? ''}:${radiusCircle?.radiusMiles ?? ''}`
  useEffect(() => {
    const map = mapRef.current
    if (map === null) return
    const layers: L.Layer[] = []
    if (homePin !== undefined && homePin !== null) {
      const pin = L.circleMarker([homePin.lat, homePin.lng], {
        radius: 10,
        color: '#dc2626',
        weight: 3,
        fillColor: '#dc2626',
        fillOpacity: 0.85,
      })
      pin.bindTooltip('Home', { direction: 'top', offset: [0, -10] })
      layers.push(pin.addTo(map))
    }
    if (radiusCircle !== undefined && radiusCircle !== null) {
      const meters = radiusCircle.radiusMiles * 1609.344
      const circle = L.circle([radiusCircle.center.lat, radiusCircle.center.lng], {
        radius: meters,
        color: '#dc2626',
        weight: 2,
        fillColor: '#dc2626',
        fillOpacity: 0.08,
      })
      // Pointer events off: the disc must never swallow taps aimed at the
      // directory markers inside it (the same rule `PlacesMap` pins).
      // `addTo` first, then style — `getElement()` is null until the layer is
      // on the map (a pre-add call throws on undefined.style; `PlacesMap`'s
      // site adds before styling for exactly this reason).
      const added = circle.addTo(map)
      layers.push(added)
      const path = added.getElement() as SVGElement | null
      if (path !== null) path.style.pointerEvents = 'none'
    }
    return () => {
      for (const layer of layers) layer.remove()
    }
  }, [pickerOverlayKey])

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
    // V21 t02 Phase B: a radius circle owns the framing (its zoom was set on
    // mount) — fitting the points would blow the frame back out to every
    // marker. Without one, the pre-existing points-fit stands.
    if (entries.length > 0 && (radiusCircle === undefined || radiusCircle === null)) {
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
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        data-testid="place-picker-map"
        className={`h-64 w-full overflow-hidden rounded-xl border border-slate-200 ${className ?? ''}`}
      />
      {/* V20 t04: the confirmation panel. It appears on a marker tap and does
          NOTHING until "Select this place" is pressed — see the state doc
          above for why the write moved off the marker click.

          It is rendered BELOW the map, in normal flow, matching the browse
          map's `place-marker-info` panel: a panel inside the map's own box
          would be clipped by the canvas and could not be hit-tested (the V17
          t01 finding recorded in BrowsePage). */}
      {selected !== null ? (
        <div
          data-testid="place-picker-selection"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold text-slate-900">{selected.name}</span>
            <span className="truncate text-xs text-slate-600">{selected.address}</span>
          </div>
          <button
            type="button"
            data-testid="place-picker-select"
            onClick={() => onPick(selected)}
            className="min-h-11 shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Select this place
          </button>
        </div>
      ) : null}
    </div>
  )
}