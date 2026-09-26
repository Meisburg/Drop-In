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
  PLACE_MARKER_FOCUSED_STYLE,
  PLACE_MARKER_STYLE,
} from '../lib/mapStrip'
import {
  DETAIL_ZOOM_FALLBACK,
  placeDetailsPath,
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
 * V24 slice 10 — KEEP THE PINS OUT OF THE TAB ORDER.
 *
 * MEASURED, and it is a keyboard-a11y fix rather than tidiness: Leaflet emits a
 * `circleMarker` as an SVG `<path>`, and Chromium puts those in the TAB ORDER.
 * With a full directory that is 236 tab stops of marker paths — a keyboard user
 * had to press Tab more than 100 times to reach the card strip this slice exists
 * to make reachable (measured: past 50 presses and still inside the marker list).
 *
 * BOTH ATTRIBUTES ARE NEEDED, and that was measured too: `focusable="false"` is
 * the SVG-document answer (and the one Safari honours) but Chromium IGNORED it
 * here — the probe still tabbed into path after path. `tabindex="-1"` is what
 * removes an element from the tab order in Chromium. Together they cover both
 * engines; neither is redundant enough to drop.
 *
 * Nothing is lost: a marker is a POINTER affordance that opens a popup. The same
 * places are keyboard-reachable as cards (real links), as list rows, and through
 * the popup's own buttons.
 */
function keepMarkerOutOfTabOrder(marker: L.CircleMarker | L.Circle): void {
  const el = marker.getElement() as SVGElement | null
  if (el === null) return
  el.setAttribute('focusable', 'false')
  el.setAttribute('tabindex', '-1')
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
  focusPlaceId,
  focusBehavior = 'smooth',
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
  /**
   * V24 slice 10 — THE CONTROLLED FOCUS PROP, and the whole reason the map view
   * can have a card strip without becoming a second map component.
   *
   * The strip's focused card index is React state in the CALLER; that index is
   * the SINGLE source of truth, and it arrives here as the focused place's id.
   * The map recentres from this prop and from nothing else — there is no second
   * mechanism (no marker-click callback the caller also has to feed), which is
   * the invariant the slice exists to keep.
   *
   * `undefined` (the default) means "this caller does not drive the camera":
   * every pre-existing caller (/browse's band, the place page, /new's picker)
   * passes nothing and is therefore byte-for-byte unchanged. An id that matches
   * no marker is likewise a no-op — there is nothing to pan to, and inventing a
   * center would be a fake pin.
   *
   * THE MARKER-TAP POPUP IS UNTOUCHED: `selectedId` and `popupHost` stay private
   * internal state. A parent tapping a pin still selects it for the popup; the
   * strip is a different control with a different job, and conflating them is
   * the two-sources-of-truth defect this prop is shaped to avoid.
   */
  focusPlaceId?: string | null
  /**
   * How the recentre ANIMATES, as a value rather than a boolean.
   *
   * The caller computes it with `scrollBehaviorFor(reducedMotion)` from
   * `src/lib/mapStrip.ts` — the pure rule this repo's build law requires. This
   * component deliberately does NOT read `matchMedia` itself: a component that
   * both reads the preference and decides what it means is the layout-vs-logic
   * collapse code-structure.md forbids, and it would be a second place the
   * interpretation could drift.
   */
  focusBehavior?: ScrollBehavior
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
  /**
   * V24 slice 10: the markers actually on the map, paired with the place each
   * one belongs to. The focus effect paints the focused one from this list, so it
   * needs no rebuild — and therefore no popup teardown (see the marker effect).
   */
  const markerRefs = useRef<Array<{ id: string; marker: L.CircleMarker }>>([])
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
    /**
     * V23 slice 7 — `zoomSnap: 0` IS REQUIRED FOR THE RADIUS CIRCLE TO FIT, and
     * without it the circle effect below is a silent no-op.
     *
     * Leaflet's `zoomSnap` defaults to 1, which means every `setZoom` is ROUNDED
     * to a whole level. `zoomForRadius` returns a FRACTIONAL level — it inverts
     * the tile arithmetic, so 1 mile on a 330px pane is 13.97 — and Leaflet was
     * flooring that to 13. The circle is drawn to true geographic scale, so at
     * the floored zoom it rendered 250px of radius inside a 330px-wide pane:
     * the oversized disc the founder photographed hanging outside the map.
     *
     * MEASURED, with the value logged from inside the effect on the live dev
     * server: `target=13.96669976735366 before=13` and `after=13` — the call
     * ran, the map did not move. That is why passing the map's real size to
     * `zoomForRadius` alone changed nothing on screen, and it is the reason this
     * is a `zoomSnap` change rather than a better constant.
     *
     * `zoomSnap: 0` lets Leaflet hold the fractional zoom, so the circle is
     * framed as the arithmetic intends. It is set on THIS map (the browse/detail
     * surface, where the radius is the framing authority) and not on the /new
     * picker, whose camera is the parent's to drive.
     *
     * `zoomDelta` is pinned to 0.5 so the +/- control still steps by a sensible
     * amount rather than Leaflet's own fractional default, and the pinch/wheel
     * gestures stay at whole steps where a parent expects them.
     */
    const map = L.map(el, { scrollWheelZoom: false, zoomSnap: 0, zoomDelta: 0.5 }).setView(
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
      const addedPin = pin.addTo(map)
      // V24 slice 10 (ocr finding 6): the home pin is `interactive: true` for its
      // tooltip, which also makes it a TAB STOP. It is a reading aid, not a
      // control, so it leaves the tab order with the place pins.
      keepMarkerOutOfTabOrder(addedPin)
      layers.push(addedPin)
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
      const addedCircle = circle.addTo(map)
      layers.push(addedCircle)
      // V24 slice 10 (ocr finding 6): the radius circle is `pointer-events: none`
      // and has NO handler, so as a tab stop it was a focusable control that did
      // nothing — the same defect class as a button that looks live and is not.
      keepMarkerOutOfTabOrder(addedCircle)
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
    /**
     * EVERY MARKER IS BUILT PLAIN, and the FOCUS IS PAINTED ON AFTERWARDS by the
     * effect below. That split is deliberate and it replaced a construction-time
     * focus flag, because the earlier shape had a real defect:
     *
     *   REBUILDING THIS GROUP TO CHANGE THE FOCUS CLOSES AN OPEN POPUP. Leaflet's
     *   `LayerGroup.remove()` removes each marker, and `remove()` closes that
     *   marker's popup — so a parent who tapped a pin to read about a place and
     *   then moved the card strip lost the panel they were reading. MEASURED,
     *   and asserted by `e2e/places-map-view.e2e.ts`'s "a pin's panel survives a
     *   focus move" spec.
     *
     * The group is therefore built ONCE per marker set (its dependency list is
     * `markersKey` alone) and never rebuilt for a focus change; the focus keys
     * the separate style effect further down.
     */
    const group = L.layerGroup(
      entries.map(({ place, coords }) => {
        const marker = L.circleMarker([coords.lat, coords.lng], PLACE_MARKER_STYLE)
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
           * V23 slice 7 — THE PADDING NOW LEAVES ROOM FOR THE *WHOLE* BUBBLE,
           * and the number is derived from the pane rather than a magic 260.
           *
           * The bubble grew in this slice (it now shows a 44px button plus the
           * two links instead of scrolling them away), so the clearance above a
           * marker has to grow with it. `_adjustPan` pans by the OVERFLOW against
           * these paddings, so a top padding smaller than the bubble means
           * Leaflet stops panning while the bubble's top edge is still outside
           * the pane.
           *
           * MEASURED before this change at 390x844: the popup rendered from y=194
           * while the map began at y=216 — 22px of it, including the place's
           * name, sat over the "Nearby places" header above the card.
           *
           * The value is `pane height * 0.8`, which is the fraction a Leaflet
           * popup can actually occupy above a marker: popups open UPWARD only
           * (there is no `direction` option), so the space available is the
           * distance from the marker to the pane's top edge, and a marker in the
           * lower fifth has ~80% of the pane above it. Asking for more than that
           * is an unsatisfiable request — Leaflet pans to its limit and the rest
           * hangs outside, which is the defect being fixed. 120px is the floor so
           * a very short map still reserves something usable.
           */
          autoPanPaddingTopLeft: [24, Math.max(120, Math.round(map.getSize().y * 0.8))],
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
    /**
     * Keep the built markers, so the focus effect can paint one of them without
     * rebuilding anything. `getLayers()` preserves insertion order, so marker N
     * belongs to `entries[N]` — the pairing is positional rather than a second
     * lookup by coordinate.
     */
    markerRefs.current = (group.getLayers() as L.CircleMarker[]).map((layer, index) => {
      keepMarkerOutOfTabOrder(layer)
      return { id: entries[index]?.place.id ?? '', marker: layer }
    })
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
    // V24 slice 10: `focusPlaceId` is deliberately NOT a dependency any more.
    // The group is keyed by the marker set alone, so a focus change never tears
    // it down — which is what keeps an open popup open (see the top of this
    // effect). The focus is painted by the separate effect below.
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

  /**
   * V24 slice 10 — THE CAMERA'S OWN REPORT, and the difference between "the app
   * decided to focus this place" and "the map actually moved there".
   *
   * WHY THIS EXISTS. `data-focused-place` (below) is the caller's STATE: it is
   * written from the prop, so it would keep saying "focused" even if the
   * recentring `setView` call were deleted entirely — a spec asserting only that
   * attribute would pass for a camera that never moved, which is a test that
   * cannot fail for the defect it exists to catch. This slice's first review
   * caught exactly that.
   *
   * So the live centre is published too, from Leaflet's OWN `getCenter()` on
   * `moveend` — the map's report of where it is, not the app's intent. A spec
   * that reads it can fail for a camera that did not move, and the focused
   * marker's position in the pane is the same fact measured a second way.
   *
   * `moveend` (not `move`) for the same reason `zoomend` is used above: it fires
   * once per settled camera rather than on every animation frame, so this does
   * not put a React render inside the pan's frame loop. Rounded to 5 decimals
   * (~1 m, far below the map's own precision) so the attribute is a stable
   * string and the equality assertion is exact rather than tolerance-shaped.
   */
  const [mapCenter, setMapCenter] = useState<string>('')
  useEffect(() => {
    const map = mapRef.current
    if (map === null) return
    const report = () => {
      const center = map.getCenter()
      setMapCenter(`${center.lat.toFixed(5)},${center.lng.toFixed(5)}`)
    }
    map.on('moveend', report)
    report()
    return () => {
      map.off('moveend', report)
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    // `circleKey` is '' exactly when `radiusCircle` is null (see its own doc
    // comment above), so this one guard narrows BOTH — and it is written as a
    // check on the object rather than on the string so the narrowing is visible
    // to the compiler and the center read below needs no non-null assertion.
    if (map === null || radiusCircle === undefined || radiusCircle === null) return
    const miles = radiusCircle.radiusMiles
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
     *
     * V23 slice 1 — the pin now tracks the LATEST radius, not just the first:
     * the shared LocationModal (also opened from the feed) updates its caller's
     * radius state on every slider tick, which flows back down as a new
     * `radiusCircle.radiusMiles`. The old inline modal did the same (its slider's
     * onChange called setRadiusMiles directly), so the Places spec's "dragging
     * the radius slider shows a bigger area on the map" assertion — which
     * expects the camera to zoom OUT as the radius grows — still holds. The
     * comment above ("every later change of the slider only redraws") describes
     * the pre-extraction behaviour; the extraction made the slider's live value
     * the source of truth, which is what the spec measures.
     *
     * V23 slice 7 — THE CAMERA NOW CENTERS ON THE CIRCLE, AND `panePx` IS THE
     * MAP'S OWN MEASURED SIZE. Both halves are the fix for the founder's second
     * report on this screenshot: *"the red radius is going outside the map lol
     * … the whole thing is not looking right."*
     *
     * MEASURED on the live dev server (390x844, /browse): the band is 332x380
     * and the radius circle came back 502px across — 1.5x the pane's WIDTH —
     * with the SVG path starting at x=-55, i.e. 85px of the stroke and the fill
     * painted outside the map card and across the page behind it. The card's own
     * border did not contain it, because the circle is a Leaflet overlay pane
     * that the band clips with `overflow: hidden` — and the whole point of the
     * V23 slice 7 class fix above is that this clipping is now ALWAYS on. So
     * an oversized circle is no longer merely ugly; it is the top and right
     * edges of the disc being cut off mid-arc.
     *
     * WHY IT WAS OVERSIZED — THREE causes, and fixing any one alone changes
     * nothing visible. This is why the fix is spread across this component and
     * `zoomForRadius` rather than being one line.
     *
     *   1. A STALE PANE SIZE. `zoomForRadius` sizes the circle to fill HALF the
     *      pane it is told about, and it defaults to `panePx = 250` — the `h-64`
     *      (256px) map the place page and /new's picker use. The browse band is
     *      `h-[45dvh]`, which is 380px on this phone. The function was never
     *      told, so it computed the zoom for a map a third smaller than the one
     *      on screen and drew a circle a third too wide. Fixed by passing
     *      `map.getSize()` below — the same correction the popup's
     *      `autoPanPadding` above already makes, for the same reason: the map
     *      instance is the one source that knows its own size.
     *   2. LEAFLET WAS DISCARDING THE FRACTIONAL ZOOM. `zoomSnap` defaults to 1,
     *      so the fractional level the arithmetic returns was ROUNDED to a whole
     *      one. Logged from inside this effect on the live server:
     *      `target=13.96669976735366 before=13` and `after=13` — the call ran and
     *      the map did not move. That is why cause 1 alone changed nothing on
     *      screen. Fixed by `zoomSnap: 0` on the map's own options.
     *   3. THE ARITHMETIC WAS LATITUDE-BLIND. It treats a degree of latitude as
     *      69 miles, which is an EQUATOR fact; Mercator inflates the map by
     *      `1 / cos(lat)`, and at Seattle's 47.6 degrees that is 1.48x. MEASURED:
     *      a 1-mile radius on the 332px pane drew 490px — 1.48x the pane, the
     *      cosine factor almost exactly. Fixed by passing the circle's latitude
     *      to `zoomForRadius`, which now applies the correction and a margin.
     *
     * The SHORTER axis is what is passed, not the width: a circle is drawn in
     * the pane's smaller dimension, so fitting to the width alone still overflows
     * the height on a tall narrow phone.
     *
     * `panTo` alongside the zoom is the second half. `setZoom` alone keeps the
     * map's CURRENT center, which after the mount view has moved (a marker tap's
     * `autoPan`, or the parent panning) is no longer the circle's center — so a
     * correctly sized circle could still sit half off the pane. Centering on the
     * circle is what makes "the radius frames the view" true rather than
     * approximate. `panTo` is instant, never animated, so a slider drag does not
     * stack a queue of easing animations.
     */
    const panePx = Math.min(map.getSize().x, map.getSize().y)
    map.setZoom(zoomForRadius(miles, panePx, radiusCircle.center.lat))
    map.panTo([radiusCircle.center.lat, radiusCircle.center.lng], { animate: false })
  }, [circleKey])

  /**
   * V24 slice 10 — THE CONTROLLED FOCUS, and the ONE effect that may move the
   * camera for a reason other than the radius circle.
   *
   * The comment on the circle effect above says "this is now the ONLY effect
   * that moves the camera". That stays true for every caller that passes no
   * `focusPlaceId` — which is all of them except the map view. The map view
   * passes no `radiusCircle` at all, so the two effects can never both drive the
   * camera in the same mount: exactly one of them is armed. That is why this is
   * an addition rather than a conflict.
   *
   * WHY IT SKIPS THE FIRST RUN. The mount view and the circle effect above
   * already frame the map correctly on mount. Re-running the focus here on mount
   * would zoom a freshly-opened map into whatever card happened to be first —
   * overriding the frame the caller asked for and doing it invisibly. So the
   * first pass records the id and does nothing; only a CHANGE pans. The ref (not
   * a state flag) is what makes that decision without a re-render.
   *
   * `focusPlaceId === null` is honoured as "no card is focused": the map simply
   * does not move. `undefined` (the prop absent) and `null` therefore behave the
   * same way for the camera, and the caller's `data-focused-place` attribute is
   * written separately in the render below so the spec can see the honest value.
   *
   * `setView` rather than `panTo` because a card is a place, not a direction:
   * panning alone at city zoom would leave the pin somewhere off-pane, so the
   * focus also sets `DETAIL_ZOOM`. `setView` is also what makes the call
   * idempotent — Leaflet's own `panTo` re-entry guard can leave the view
   * fractionally off the requested center, and the spec asserts the recentre
   * through a data attribute, so "did the camera really move" is proven by the
   * caller's state rather than by a pixel.
   */
  const focusedEntry = focusPlaceId === undefined || focusPlaceId === null
    ? null
    : (entries.find((e) => e.place.id === focusPlaceId) ?? null)
  const focusKey = focusedEntry === null ? '' : focusedEntry.place.id

  /**
   * V24 slice 10 — THE FOCUS IS PAINTED HERE, on markers that already exist.
   *
   * WHY IT IS NOT DONE AT CONSTRUCTION any more: a focus change used to rebuild
   * the marker group, and a rebuild removes every marker — which closes an open
   * popup (Leaflet's `remove()` calls `closePopup`). A parent reading a pin's
   * panel and then moving the strip lost it. MEASURED; the map-view spec now
   * asserts the panel survives.
   *
   * `setStyle` is Leaflet's own path update, so there is still exactly ONE writer
   * of this element's appearance — the concern that put the focus into the
   * construction path in the first place. MEASURED: the attribute survives a pan,
   * a zoom and a marker tap.
   *
   * ONLY THE PAIR THAT CHANGED IS REPAINTED (ocr finding 3). The first version
   * called `setStyle` on every marker on every pass: on the unfiltered seed that
   * is ~239 markers × 6 properties of DOM writes per arrow press or swipe, for a
   * change that involves exactly two pins. The previous id is tracked in a ref so
   * the pass can restyle the pin LOSING focus and the pin GAINING it.
   *
   * THE FULL PASS STILL HAPPENS WHEN THE MARKERS ARE REBUILT. `markersKey` is a
   * dependency for that reason: after a rebuild the refs are new elements, every
   * one of them carries no focus mark, and nothing knows which — if any — was
   * focused before. Narrowing to a pair there would leave the focus mark off
   * entirely.
   *
   * THE PLAIN STYLE IS A COMPLETE RESET — `PLACE_MARKER_STYLE` sets every property
   * `PLACE_MARKER_FOCUSED_STYLE` sets (it lives in `src/lib/mapStrip.ts` with a
   * test asserting exactly that key-set equality). Without that completeness, the
   * narrowed repaint would leave the pin that LOST the focus holding a stale
   * focused property, which is the leak this note exists to prevent.
   */
  const previousFocusIdRef = useRef<string>('')
  /**
   * The marker-set identity the LAST repaint saw, so a `markersKey` change can be
   * told apart from a `focusKey` change. A ref rather than state: this is
   * bookkeeping for an effect, not something the render reads.
   */
  const previousMarkerGenerationRef = useRef<string | null>(null)
  useEffect(() => {
    const repaint = (entry: { id: string; marker: L.CircleMarker }) => {
      const focused = entry.id !== '' && entry.id === focusKey
      entry.marker.setStyle(focused ? PLACE_MARKER_FOCUSED_STYLE : PLACE_MARKER_STYLE)
      const el = entry.marker.getElement() as SVGElement | null
      if (el === null) return
      if (focused) el.setAttribute('data-focused-marker', entry.id)
      else el.removeAttribute('data-focused-marker')
    }
    const markersRebuilt = previousMarkerGenerationRef.current !== markersKey
    previousMarkerGenerationRef.current = markersKey
    const previousId = previousFocusIdRef.current
    previousFocusIdRef.current = focusKey
    if (markersRebuilt) {
      // New elements: repaint all of them (and clear any stale pair state).
      for (const entry of markerRefs.current) repaint(entry)
      return
    }
    if (previousId === focusKey) return
    // The pair only: the pin that lost the focus keeps nothing, the one that
    // gained it gets the focused style and the observable.
    for (const entry of markerRefs.current) {
      if (entry.id === previousId || entry.id === focusKey) repaint(entry)
    }
  }, [focusKey, markersKey])

  const lastFocusKeyRef = useRef<string | null>(null)
  const ranOnceRef = useRef(false)
  useEffect(() => {
    const map = mapRef.current
    if (map === null) return
    // The first pass records the incoming id and does NOT move: on mount the map
    // is already framed (see above). The separate ref is load-bearing — an empty
    // focusKey ('') on that first pass would otherwise be indistinguishable from
    // "has not run", and the second pass would re-run the comparison forever.
    if (!ranOnceRef.current) {
      ranOnceRef.current = true
      lastFocusKeyRef.current = focusKey
      return
    }
    if (lastFocusKeyRef.current === focusKey) return
    lastFocusKeyRef.current = focusKey
    if (focusedEntry === null) return
    // The map's size is re-measured before the move, for the reason the marker
    // group's own `invalidateSize` gives: a card tap can be the first event after
    // a layout change, and a stale measurement would center on the wrong pixel.
    map.invalidateSize()
    map.setView(
      [focusedEntry.coords.lat, focusedEntry.coords.lng],
      DETAIL_ZOOM,
      { animate: focusBehavior === 'smooth' },
    )
    // `focusBehavior` IS a dependency, even though it changes only when the
    // viewer's reduced-motion preference does: the effect reads it, and leaving
    // it out would let a preference flipped while the map view is open keep
    // animating until the next focus change. `focusedEntry` is derived from
    // `focusKey` (a place id present in `entries`) so the key is the honest
    // identity of everything this body reads.
  }, [focusKey, focusBehavior])

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
   *
   * V23 slice 4 — **THE MAP-SEARCH FALLBACK IS GONE FROM THIS PANEL**, on the
   * founder's instruction: *"I would remove the find it on the map button. We
   * don't need that button."*
   *
   * The refusal is kept here rather than in a commit message because the next
   * reader will otherwise "restore the missing fallback" as a bug fix. The
   * reasoning: this panel floats OVER a map. A button labelled "Find it on the
   * map" that opens an OpenStreetMap SEARCH is offering to do something the
   * parent is already looking at — the pin they just tapped is the location.
   * The fallback was never wrong on the place page (where there is no map in
   * view and `placeExternalUrl` is the only way to locate it), so
   * `placeLearnMoreLink` KEEPS its two-kind behaviour and the place page KEEPS
   * its "Find it on the map" label. What is dropped is only this PANEL's use of
   * the map-search kind, where it duplicates the surface behind it.
   *
   * So: a place with a VERIFIED site still shows "Visit website" here; a place
   * with none simply has no outbound link on this panel, and the parent reaches
   * the wider web through the place's Details page, which carries the Google
   * search the founder asked for (V23 slice 5, `placeWebSearchHref`).
   */
  const learnMore = selected !== null ? placeLearnMoreLink(selected) : null
  /** Only a REAL operator site belongs on this panel — never the map search. */
  const websiteLink = learnMore !== null && learnMore.kind === 'website' ? learnMore : null

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
         * V24 slice 10 — THE CAMERA'S LIVE CENTRE, `"lat,lng"` at 5 decimals.
         *
         * This is the observable that CAN fail for a camera that did not move:
         * it is written from Leaflet's `getCenter()` on `moveend`, not from a
         * prop. The spec asserts it changes to the focused place when the focus
         * moves, which a deleted `setView` breaks — see the doc comment on the
         * state above.
         */
        data-map-center={mapCenter}
        /**
         * V24 slice 10 — `data-focused-place` IS THE OBSERVABLE RECENTRE, and it
         * is deliberately on the container rather than asserted from the map's
         * own camera.
         *
         * A pixel diff of the pane, or a check that a given tile loaded, is a
         * flake: both depend on OpenStreetMap being reachable, on font metrics
         * and on animation timing. The focused id is the app's own state and it
         * is exactly what "recentred on the focused card" MEANS — a spec that
         * reads this attribute is asserting the decision, and the pan is the
         * rendering of that decision.
         *
         * The value is the FOCUSED id, never the popup's `selectedId`: the two
         * are independent controls (see the `focusPlaceId` prop), and naming the
         * popup here would let a marker tap masquerade as a strip focus.
         */
        data-focused-place={focusPlaceId ?? ''}
        /**
         * V23 slice 7 — `className` IS FROZEN AT ITS FIRST VALUE, AND THAT IS
         * THE FIX FOR THE WHITE MAP.
         *
         * THE DEFECT (the founder, with a screenshot): *"when i click on a blue
         * circle in the map in the places section, the map goes white."*
         *
         * ROOT CAUSE, and it is not in this component's logic — it is a
         * DOM-OWNERSHIP COLLISION on this exact attribute. Leaflet adds its own
         * classes to the container div it is handed (`leaflet-container`,
         * `leaflet-touch`, `leaflet-grab`, `leaflet-fade-anim`, …). React
         * believes it owns `className` here because this component passes one,
         * so on the NEXT render React sets the attribute to its own string —
         * DELETING every class Leaflet added. Nothing merges them.
         *
         * MEASURED on the live dev server (390x844, /browse), reading the
         * container's own class list before and after a marker tap:
         *
         *   BEFORE: h-64 w-full rounded-xl border border-slate-200
         *           overflow-hidden h-[45dvh] min-h-[240px]
         *           leaflet-container leaflet-touch leaflet-fade-anim
         *           leaflet-grab leaflet-touch-drag leaflet-touch-zoom
         *   AFTER:  h-64 w-full rounded-xl border border-slate-200
         *           h-[45dvh] min-h-[240px]
         *
         * Every `leaflet-*` class is gone. The previous version of this prop
         * changed its value on exactly that event — `overflow-hidden` was
         * dropped while a popup was open, so `popupHost` flipping from null was
         * what re-rendered the attribute — which is why the map went white on a
         * TAP and not at any other time.
         *
         * WHY THAT BLANKS THE MAP RATHER THAN JUST UNSTYLING IT. Leaflet's own
         * sheet hides every tile by default and reveals the loaded ones by
         * inheritance:
         *
         *   .leaflet-tile        { visibility: hidden }
         *   .leaflet-tile-loaded { visibility: inherit }
         *
         * `inherit` resolves against the ANCESTOR chain, which is the container
         * that just lost `.leaflet-container`. So the moment the class is
         * stripped, the loaded tiles inherit `hidden` from a chain that no
         * longer says otherwise — and `.leaflet-container { background: #ddd }`
         * went with it. The result is a blank white rounded box with the
         * markers still drawn on top, which is precisely what was photographed.
         *
         * THE FIX, and why it is a frozen constant rather than a merge. React
         * will always own this attribute while a string is passed to it, and
         * there is no supported way to tell it "leaflet owns part of this".
         * Merging Leaflet's classes back on every render would mean this
         * component re-deriving a list that Leaflet is free to change on any
         * future version — a second source of truth for one fact, which is the
         * mistake this file keeps recording. Instead the string is computed
         * ONCE and never changes, so React's writes are idempotent and the
         * classes Leaflet appended survive every subsequent render. `className`
         * and the other props are fixed for the life of a mount by every caller
         * in this repo, so freezing costs nothing real.
         *
         * THE `overflow-hidden` TOGGLE IS GONE WITH IT, deliberately. It
         * existed to let the popup escape the rounded border it was being
         * clipped by, and it was the trigger for this bug. The popup is now
         * kept inside the pane by `autoPan` plus the `max-height` ceiling in
         * `index.css` — the mechanism that already carries the V23 slice 6
         * "must not blanket the map" fix — so nothing needs the border to
         * unclip. `overflow-hidden` is therefore simply always on, which is
         * also what keeps OSM tiles inside the rounded border.
         */
        className={`h-64 w-full rounded-xl border border-slate-200 overflow-hidden ${className ?? ''}`}
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
              {showHostHere || showDetails || websiteLink !== null ? (
                <div className="flex flex-wrap items-center gap-2">
                  {showHostHere ? (
                    <button
                      type="button"
                      data-testid="host-here"
                      onClick={() => hostHere()}
                      className="min-h-11 rounded-xl bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors motion-reduce:transition-none hover:bg-indigo-700"
                    >
                      Start a drop-in
                    </button>
                  ) : null}
                  {/* V23 slice 4: ONLY a verified operator site, never the map
                      search — see `websiteLink`'s doc comment for why this
                      panel drops that fallback while the place page keeps it. */}
                  {websiteLink !== null ? (
                    <a
                      href={websiteLink.url}
                      target="_blank"
                      rel="noopener"
                      data-testid="learn-more"
                      data-link-kind="website"
                      className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors motion-reduce:transition-none hover:bg-slate-50"
                    >
                      Visit website
                    </a>
                  ) : null}
                  {showDetails ? (
                    <Link
                      to={placePath(selected.id)}
                      data-testid="marker-details"
                      className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors motion-reduce:transition-none hover:bg-slate-50"
                    >
                      Details
                    </Link>
                  ) : null}
                </div>
              ) : null}
              {/* No website AND no actions to offer (a nameless place with
                  `placeActions` off, or a place with no verified site):
                  show the place's own details inline rather than an empty row —
                  V15 ticket 04 AC5. Gated on the same conditions as the row
                  above so the two can never both appear or both vanish. */}
              {websiteLink === null && !showHostHere && !showDetails ? (
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
   * V25 t02 — THE TAPPED PIN *IS* THE PICK. THIS REVERSES V20 t04.
   *
   * V20 t04 moved the write OFF the marker click for a real reason, in the
   * founder's own words on /new's picker: *"when you click on a blue circle, it
   * fills in the where in the address, which is great, but it's not obvious
   * that that's happening. So maybe when you click on a blue circle, there
   * should be a button that says like, select… and when you click it, then it
   * populates those two fields."* The answer then was two steps: the tap
   * SELECTS (panel below the map, "Select this place"), the button WRITES.
   *
   * The founder has since rejected the extra step twice — V24 annotation #2
   * (`.scratch/v24/spec.md:23`) and again on the V25 walk: *"you shouldn't have
   * to click Select this place button. It should just automatically select it
   * and populate the address in the address bar above. Don't make the user have
   * to do an extra step, it's annoying."*
   *
   * The t04 complaint does not stop being true because the button is annoying,
   * so the contract now carries BOTH halves:
   *   - the marker click WRITES — `onPick(place)`, the page's one pick path
   *     (`places.placePickPatch`: place + address + neighbourhood) which also
   *     regenerates the title, so no "selected but unwritten" state is left
   *     behind; and
   *   - the marker click still SELECTS — `setSelectedId`, which paints the panel
   *     below the map naming the place and the address that just landed. That
   *     panel IS t04's answer to "it's not obvious that that's happening": the
   *     fields sit ABOVE the map on /new, so the write may never rest on them
   *     alone being noticed.
   *
   * ONE WRITE, ONE CONTROL. "Select this place" had nothing left to do once the
   * tap wrote — pressing it would be a second write of the same values — so it
   * is removed. The panel keeps the place name + address and the Details link
   * (`place-picker-details`), the only door from the picker to a place's
   * research page.
   *
   * `e2e/places.e2e.ts` pins this in both directions: a tap writes both fields,
   * and a second tap on a different pin replaces both.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null)

  /**
   * The marker layer is built once per coordinate set (the effect below), so a
   * marker handler calling `onPick` directly would hold the `onPick` from THAT
   * render. On /new that closure carries `titleTouched`, so a tapped pin could
   * overwrite a title the parent had typed themselves. Read the prop through a
   * ref instead — the same "read through a ref so the effect's dependency list
   * stays empty" discipline the mount effect above uses for its anchor — and
   * re-point it on every render so the handler always sees the current one.
   */
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

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
        // V25 t02: ONE TAP DOES BOTH — the write (`onPick`, the page's one pick
        // path) and the visible confirmation (`setSelectedId`, the panel below
        // the map). See the state doc above; `onPick` is read through a ref
        // because this effect runs once per coordinate set, not per render.
        marker.on('click', () => {
          setSelectedId(place.id)
          onPickRef.current(place)
        })
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
      {/* V25 t02: the CONFIRMATION panel. The marker tap has ALREADY written
          the form (see the state doc above) — this panel is why that write is
          not silent, which is the whole reason V20 t04 put a panel here. It
          names the place and the address that just landed in the fields above
          the map; `role="status"` announces the same confirmation to a screen
          reader, which cannot see a panel appear.

          It is rendered BELOW the map, in normal flow, matching the browse
          map's `place-marker-info` panel: a panel inside the map's own box
          would be clipped by the canvas and could not be hit-tested (the V17
          t01 finding recorded in BrowsePage). */}
      {selected !== null ? (
        <div
          data-testid="place-picker-selection"
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold text-slate-900">{selected.name}</span>
            <span className="truncate text-xs text-slate-600">{selected.address}</span>
          </div>
          {/* V23 slice 4 — "for each places, I think the two options should be
              start dropping and details."

              V25 t02: the "Select this place" half of that pair is GONE with the
              two-step it existed for — the tap writes now. Details is the READ
              (it opens the place's research page — what parents have said, who
              follows it, a web-search link) and it stays, at the same weight: a
              parent comparing parks can open Details, come back, and see the
              pick already written. It must NOT be the thing that fills the
              field.

              The destination comes from `placeDetailsPath` (lib/places.ts), the
              one builder, so this panel, the map popup and the place page cannot
              drift to different URLs. It is a real <Link> (a new tab is the
              browser's business) rather than a button, matching the popup's own
              "Details" link. */}
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to={placeDetailsPath(selected.id)}
              data-testid="place-picker-details"
              className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors motion-reduce:transition-none hover:bg-slate-50"
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
 * V22 slice 10: default export for the lazy wrapper (see PlaceMapLazy.tsx).
 * The wrapper's `lazy()` factory resolves the module through this default;
 * named consumers keep importing by name.
 */
export { PlacePickerMap as default }