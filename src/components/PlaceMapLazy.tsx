/**
 * V22 slice 10 — code-split the map out of the initial chunk.
 *
 * The Leaflet + OpenStreetMap implementation (components/PlaceMap.tsx) is the
 * app's heaviest third-party dependency and it used to be statically imported
 * by every page that renders a map — so its JS AND its CSS were parsed and
 * executed on first paint even on /login, where no map can ever appear. This
 * wrapper moves the whole module behind `React.lazy`: the dynamic import makes
 * Vite emit PlaceMap (and its `leaflet` + `leaflet/dist/leaflet.css` imports)
 * as a separate chunk that loads only when a map-bearing surface mounts.
 *
 * What lives HERE (the eager side): the lazy factory, one Suspense boundary
 * per export, and the fallbacks. The fallbacks render immediately and match
 * the expected container height so nothing shifts layout while the chunk
 * downloads (Apple's loading guidance: show something as soon as possible,
 * never an empty box).
 *
 * Behaviour, props and styling are UNCHANGED — this file only decides WHEN
 * the real component loads, never WHAT it renders.
 */
import { Suspense, lazy } from 'react'
import type * as React from 'react'

// The dynamic import IS the split: everything PlaceMap.tsx pulls in (leaflet,
// leaflet's CSS, the OSM tile plumbing) rides with THIS chunk, not the entry.
//
// Slice 12 fix: the module has THREE named exports but no default, so a plain
// `lazy(() => import('./PlaceMap'))` resolved to `undefined` and every map
// surface crashed at render (React #306 — "Element type is invalid"). The
// wrapper now resolves through the module's explicit default export
// (`export { PlacePickerMap as default }` in PlaceMap.tsx): all three wrappers
// below are pick-mode surfaces that open on /new, so the picker component is
// the one they hand back. Named consumers keep importing by name.
/**
 * V23 FIX — ONE LAZY PER NAMED EXPORT, AND THE BUG THIS REPLACES WAS REAL.
 *
 * The previous version had a SINGLE factory resolving through the module's
 * DEFAULT export, and cast the result to `ComponentType<any>`:
 *
 *     const LazyPlaceMap = lazy(
 *       () => import('./PlaceMap') as unknown as Promise<{ default: ComponentType<any> }>,
 *     )
 *     // used by PlaceMap, PlacesMap AND PlacePickerMap alike
 *
 * The default export is `PlacePickerMap`. So `PlaceMap` — which passes `place`
 * — rendered `PlacePickerMap`, which reads `places.map(...)` and found
 * `undefined`: **TypeError: Cannot read properties of undefined (reading
 * 'map')**, and the whole /place/:id page rendered BLANK (React tore the tree
 * down; the body was empty). `PlacesMap` had the same mismatch in a different
 * shape: it passes `places` and got the picker, which needs `onPick`.
 *
 * WHY IT SURVIVED A BATCH: the `as unknown as ComponentType<any>` cast erased
 * the prop mismatch that TypeScript would otherwise have reported, so this was
 * a compile-time-safe lie. The V22 note above records that the ORIGINAL crash
 * (#306, "Element type is invalid") was fixed by ADDING a default export — which
 * fixed the `undefined` COMPONENT while introducing a wrong COMPONENT. One bug
 * was traded for a quieter one, and nothing asserted the right component
 * rendered with its own props.
 *
 * PROVEN PRE-EXISTING before fixing: the identical pageerror, blank body and
 * missing `place-map` testid all reproduce on base `ff49d0c` (built in an
 * isolated git worktree), so this was not introduced by V23 — the audit merely
 * looked at /place/:id for the first time.
 *
 * THE FIX: each wrapper resolves ITS OWN named export, so props and component
 * cannot disagree. The casts are now honest — they name the props type the
 * caller actually passes — and the default export is left in place for any
 * external consumer.
 */
const LazyPlaceMap = lazy(() =>
  import('./PlaceMap').then((m) => ({ default: m.PlaceMap })),
) as unknown as React.ComponentType<{
  place: import('../lib/types').Place
  zipCoords: ReadonlyMap<string, import('../lib/feed').ZipCoords> | null
  className?: string
}>

const LazyPlacesMap = lazy(() =>
  import('./PlaceMap').then((m) => ({ default: m.PlacesMap })),
) as unknown as React.ComponentType<{
  places: readonly import('../lib/types').Place[]
  zipCoords: ReadonlyMap<string, import('../lib/feed').ZipCoords> | null
  className?: string
  homePin?: { lat: number; lng: number } | null
  radiusCircle?: { center: { lat: number; lng: number }; radiusMiles: number } | null
  placeActions?: boolean
  testId?: string
  onSelect?: (place: import('../lib/types').Place) => void
}>

const LazyPlacePickerMap = lazy(() =>
  import('./PlaceMap').then((m) => ({ default: m.PlacePickerMap })),
) as unknown as React.ComponentType<{
  places: readonly import('../lib/types').Place[]
  zipCoords: ReadonlyMap<string, import('../lib/feed').ZipCoords> | null
  onPick: (place: import('../lib/types').Place) => void
  className?: string
  homePin?: { lat: number; lng: number } | null
  radiusCircle?: { center: { lat: number; lng: number }; radiusMiles: number } | null
}>

/**
 * The Suspense fallback for a map band: a fixed-height placeholder matching
 * the band's own dimensions (the same rounded border the map draws), so the
 * surrounding layout never reflows while the chunk arrives. A centred line
 * says what is happening instead of rendering nothing.
 */
function MapBandFallback({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading map…"
      className={`flex h-64 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500 ${className ?? ''}`}
    >
      Loading map…
    </div>
  )
}

/**
 * ONE place's map (the /place/:id detail surface). Same props as before; the
 * real component now resolves through the lazy module.
 */
export function PlaceMap(props: {
  place: import('../lib/types').Place
  zipCoords: ReadonlyMap<string, import('../lib/feed').ZipCoords> | null
  className?: string
}) {
  const Comp = LazyPlaceMap
  return (
    <Suspense fallback={<MapBandFallback className={props.className} />}>
      <Comp {...props} />
    </Suspense>
  )
}

/**
 * The directory's overview map (/browse, the feed's map view). Same props as
 * before; the caller's `className` carries the band's height (e.g.
 * `h-[45dvh] min-h-[240px]`) and the fallback mirrors it so the swap is
 * invisible.
 */
export function PlacesMap(props: {
  places: readonly import('../lib/types').Place[]
  zipCoords: ReadonlyMap<string, import('../lib/feed').ZipCoords> | null
  className?: string
  homePin?: { lat: number; lng: number } | null
  radiusCircle?: { center: { lat: number; lng: number }; radiusMiles: number } | null
  placeActions?: boolean
  testId?: string
  onSelect?: (place: import('../lib/types').Place) => void
}) {
  const Comp = LazyPlacesMap
  return (
    <Suspense fallback={<MapBandFallback className={props.className} />}>
      <Comp {...props} />
    </Suspense>
  )
}

/**
 * The interactive pick-mode map for /new's place picker. Same props as before.
 */
export function PlacePickerMap(props: {
  places: readonly import('../lib/types').Place[]
  zipCoords: ReadonlyMap<string, import('../lib/feed').ZipCoords> | null
  onPick: (place: import('../lib/types').Place) => void
  className?: string
  homePin?: { lat: number; lng: number } | null
  radiusCircle?: { center: { lat: number; lng: number }; radiusMiles: number } | null
}) {
  const Comp = LazyPlacePickerMap
  return (
    <Suspense fallback={<MapBandFallback className={props.className} />}>
      <Comp {...props} />
    </Suspense>
  )
}