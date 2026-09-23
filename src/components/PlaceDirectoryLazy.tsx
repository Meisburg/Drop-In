/**
 * V22 slice 10 — code-split the places directory out of the initial chunk.
 *
 * PlaceDirectory renders the map band (PlacesMap → Leaflet), so statically
 * importing it pulled leaflet + its CSS into every page that embeds the
 * directory (/browse, /new). This wrapper moves the module behind `React.lazy`:
 * the dynamic import makes Vite emit PlaceDirectory (and, through it, the lazy
 * PlaceMap chunk) only when a directory surface mounts.
 *
 * The fallback matches the directory's own shape: the map card at its real band
 * height (`h-[45dvh] min-h-[240px]`) with a centred "Loading map…" line, plus a
 * fixed-height placeholder for the list card, so the swap in is invisible and
 * nothing shifts layout while the chunk downloads.
 */
import { Suspense, lazy } from 'react'

// The dynamic import IS the split: everything PlaceDirectory.tsx pulls in
// (the lazy PlaceMap chunk, the directory's own logic) rides with THIS chunk,
// not the entry.
const LazyPlaceDirectory = lazy(() => import('./PlaceDirectory'))

type Place = import('../lib/types').Place
type ZipCoords = import('../lib/feed').ZipCoords

interface DirectoryProps {
  /** The loaded directory rows. `null` while the host's read is in flight. */
  places: Place[] | null
  /** The gazetteer zip→coords map (null while loading or on failure). */
  zipCoords: ReadonlyMap<string, ZipCoords> | null
  /** Per-place "N upcoming" counts (null = the count read failed → none shown). */
  upcoming: Map<string, number> | null
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
}

/**
 * The Suspense fallback: the two cards the directory leads with, at their real
 * sizes — the map card at the band's own height (the same rounded border the
 * map draws) and a fixed-height list placeholder — so the layout never reflows
 * while the chunk arrives. A centred line says what is happening.
 */
function DirectoryFallback() {
  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:sticky md:top-16">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">Nearby places</span>
        </div>
        <div
          role="status"
          aria-label="Loading map…"
          className="flex h-[45dvh] min-h-[240px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500"
        >
          Loading map…
        </div>
      </div>
      <div
        role="status"
        aria-label="Loading places…"
        className="flex h-48 items-center justify-center rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-500 shadow-sm md:col-start-2"
      >
        Loading places…
      </div>
    </div>
  )
}

/**
 * The ONE implementation of the places directory surface (V21 t02) — now
 * resolved through the lazy module. Same props as before; this file only
 * decides WHEN the real component loads, never WHAT it renders.
 */
export function PlaceDirectory(props: DirectoryProps) {
  const Comp = LazyPlaceDirectory
  return (
    <Suspense fallback={<DirectoryFallback />}>
      <Comp {...props} />
    </Suspense>
  )
}