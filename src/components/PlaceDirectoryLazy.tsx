/**
 * V22 slice 10 — code-split the places directory out of the initial chunk.
 *
 * PlaceDirectory pulls in PlacesMap → Leaflet, so statically importing it would
 * put leaflet + its CSS in the initial chunk of every page that embeds the
 * directory (/browse, /new). This wrapper moves the module behind `React.lazy`:
 * the dynamic import makes Vite emit PlaceDirectory (and, through it, the lazy
 * PlaceMap chunk) only when a directory surface mounts.
 *
 * The fallback matches the directory's own list-first shape: the controls card
 * (search pill + dropdown rows) at its real height, plus a fixed-height list
 * placeholder, so the swap in is invisible and nothing shifts layout while the
 * chunk downloads.
 */
import { Suspense, lazy } from 'react'
import type { PlaceDropInProof, PlaceReviewHighlight } from '../lib/placeSocial'

// The dynamic import IS the split: everything PlaceDirectory.tsx pulls in
// (the lazy PlaceMap chunk, the directory's own logic) rides with THIS chunk,
// not the entry.
const LazyPlaceDirectory = lazy(() => import('./PlaceDirectory'))

type Place = import('../lib/types').Place
type ZipCoords = import('../lib/feed').ZipCoords
type ReviewSummary = import('../lib/reviews').ReviewSummary

interface DirectoryProps {
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
  /**
   * V27: per-place review highlight (the newest review with a body), keyed by
   * place id. `null`/omitted while the read is in flight OR when it failed —
   * then no card shows a quote. Optional: hosts that do not load highlights
   * omit it entirely (same effect).
   */
  reviewHighlights?: ReadonlyMap<string, PlaceReviewHighlight> | null
  /**
   * V27: per-place past-drop-in activity, keyed by place id. `null`/omitted
   * while the read is in flight OR when it failed — then no card shows an
   * activity line (never a fabricated "0 drop-ins hosted here").
   */
  dropInProofs?: ReadonlyMap<string, PlaceDropInProof> | null
  /**
   * V27: the single clock the activity line is measured against. Hosts that
   * load proofs pass the SAME instant they read with, so every card's "last one
   * X ago" agrees within one render.
   */
  nowIso?: string
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
  /**
   * V27: the place-name on the location row. Defaults to the app's city, so
   * /new's picker sheet names where it searches without passing one. (V30: it is
   * the pin button's visible label, not the search placeholder — this wrapper
   * mirrors PlaceDirectory's own prop doc.)
   */
  locationLabel?: string
  /** When true, taps select into the host instead of navigating away. */
  selectable?: boolean
  /** V23 slice 3: when true, the search + filter card pins to the top of the scroll area. */
  stickyControls?: boolean
  /**
   * v30-8 — may this viewer replace a place's photo from a card? The HOST
   * answers it (BrowsePage passes the pure `canModerate(profile)`); false — the
   * default, and what /new's picker passes — renders no edit control at all.
   */
  canEditPlacePhotos?: boolean
  /** v30-8 — fired after a replacement, so the host can re-read the directory. */
  onPlacePhotoSaved?: () => void
  /** Called with the tapped place in selectable mode. */
  onSelect?: (place: Place) => void
}

/**
 * The Suspense fallback: the new list-first shape at its real sizes — the
 * controls card (search pill + dropdown rows) and a fixed-height list
 * placeholder — so the layout does not reflow when the chunk arrives and the
 * loading state does not promise a map band that no longer exists.
 */
function DirectoryFallback() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="h-11 rounded-full bg-slate-100" />
        <div className="flex gap-2">
          <div className="h-11 flex-1 rounded-full bg-slate-100" />
          <div className="h-11 flex-1 rounded-full bg-slate-100" />
          <div className="h-11 flex-1 rounded-full bg-slate-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-12 w-16 rounded-xl bg-slate-100" />
          <div className="h-12 w-16 rounded-xl bg-slate-100" />
          <div className="h-12 w-16 rounded-xl bg-slate-100" />
          <div className="h-12 w-16 rounded-xl bg-slate-100" />
        </div>
      </div>
      <div
        role="status"
        aria-label="Loading places…"
        className="flex h-48 items-center justify-center rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-500 shadow-sm"
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
