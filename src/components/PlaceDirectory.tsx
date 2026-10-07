import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { DropInMark } from './DropInMark'
import { LocationModal } from './LocationModal'
import { PlaceFilterSheet } from './PlaceFilterSheet'
import { NAV_ICONS, PLACE_KIND_ICONS } from './icons'
import { PlacesMapView } from './PlacesMapView'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'
import { RadiusEmptyState } from './RadiusEmptyState'
import {
  formatDistanceLabel,
} from '../lib/feed'
import type { ZipCoords } from '../lib/feed'
import { geocodeAddress } from '../lib/geocode'
import {
  DATE_DROPDOWN_LABELS,
  DATE_WINDOWS,
  dateWindowEmptyCopy,
  filterTriggerLabels,
  kindEmptyCopy,
  placePhotoNeedsReview,
  placePhotoVisibleTo,
  MAP_FOCUS_RADIUS_MILES,
  planDirectoryList,
  PLACE_KINDS,
  placeKindChips,
  placeLearnMoreLink,
  placeIndoorLabel,
  placeKindLabel,
  placePath,
  placeAgeFitLabel,
  photoCreditLine,
  radiusPreviewCircle,
  resolveMapCoords,
  savedPlacesEmptyCopy,
} from '../lib/places'
import type { DateWindow, PlaceListRow, PlacePhotoViewer, SortMode } from '../lib/places'
import type { ReviewSummary } from '../lib/reviews'
import { scrollBehaviorFor } from '../lib/mapStrip'
import { hoursSourceNote, hoursStatus } from '../lib/placeHours'
import { dropInProofLine, reviewQuoteLine } from '../lib/placeSocial'
import type { PlaceDropInProof, PlaceReviewHighlight } from '../lib/placeSocial'
import type { Place, PlacePrefill } from '../lib/types'
import { MODAL_OVER_LEAFLET_Z_CLASS } from '../lib/stacking'
import { KIND_ACCENTS, PlaceKindArt } from './PlaceKindArt'
import { ModalShell } from './ModalShell'
import { PlacePhotoAdmin } from './PlacePhotoAdmin'

/**
 * V27 — one of the prominent dropdown triggers. A shared presentational control
 * so the type and when buttons cannot drift apart: same height, same chevron,
 * same focus ring. Pure presentation; the caller owns the option list and the
 * sheet. (V31 map-and-distance deleted the third trigger — the distance pill —
 * and this control is unchanged by that: it renders whatever it is handed.)
 */
function DropdownTrigger({
  testId,
  caption,
  label,
  iconPath,
  onClick,
}: {
  testId: string
  caption: string
  label: string
  iconPath: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex min-h-11 min-w-0 grow basis-28 items-center justify-center gap-1 rounded-full border border-slate-300 bg-white px-2 text-sm font-medium text-slate-700 outline-none transition-colors motion-reduce:transition-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="hidden h-4 w-4 shrink-0 text-slate-500 sm:block"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={iconPath} />
      </svg>
      <span className="flex min-w-0 flex-col items-start leading-tight">
        {/* The caption names WHAT this control filters; the value is short
            enough to survive the pill (founder annotation 4). Both are 14px —
            the mobile audit's floor — and both are real text, so the button's
            accessible name carries the purpose and not just the value. */}
        <span className="text-sm text-slate-500">{caption}</span>
        <span className="w-full truncate text-sm font-medium text-slate-700">{label}</span>
      </span>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 text-slate-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={NAV_ICONS['chevron-down']} />
      </svg>
    </button>
  )
}

/** V27: how far the page scrolls before the floating map toggle appears. */
const MAP_TOGGLE_SCROLL_THRESHOLD_PX = 220

/** V22 slice 10: default export for the lazy wrapper (see above). */
export { PlaceDirectory as default }

/**
 * V21 t02: the PLACES DIRECTORY SURFACE — V25 t01 made it LIST-FIRST: the
 * search/filter/distance card is the first block, the grouped list (every
 * matching row, no overflow door) sits below it, and the map is a MODE the
 * floating control toggles into. Still here: the "Not on the map yet" section,
 * the Filter & sort modal, the Set location modal (moved out of the removed
 * band's header into the controls card), and the PlacesMapView map mode.
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
 * sort mode, radius filter, indoor/outdoor, the distance choice, the view mode,
 * both modals, the geocoded center + preview radius) and exposes only the DATA
 * it needs plus the CALLBACKS the host decides. The host supplies:
 *
 *   - the loaded directory rows (`places`, `zipCoords`, `upcoming`) — the reads
 *     stay in the host because each page loads them with its own discipline
 *     (/browse discloses a failed read; /new silently keeps free text);
 *   - the viewer's home pin + stored radius (the profile's), for distances and
 *     the map frame;
 *   - whether the save control renders at all (`canFollow`) and the caller's own saved set
 *     (`followedPlaceIds`), plus the toggle callback (`onToggleFollow`).
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
  reviewHighlights,
  dropInProofs,
  nowIso,
  followedPlaceIds,
  canFollow,
  onToggleFollow,
  homePin,
  viewerRadius,
  homeZip,
  locationLabel,
  selectable = false,
  stickyControls = false,
  canEditPlacePhotos = false,
  onPlacePhotoSaved,
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
  /** The caller's own saved place ids (the batched read; empty set default). */
  followedPlaceIds: ReadonlySet<string>
  /** Signed in? Signed out renders no save control at all (the /browse rule). */
  canFollow: boolean
  /** Toggle one place's save (the host owns the optimistic write). */
  onToggleFollow: (placeId: string) => void
  /** The viewer's home pin coords (null = no home pin). */
  homePin: { lat: number; lng: number } | null
  /** The viewer's stored radius in miles (drives the distance control default). */
  viewerRadius: number
  /** The viewer's stored home zip (the distance seam measures from it; null = none). */
  homeZip: string | null
  /**
   * V27: the place-name on the location row. Defaults to the app's city so
   * /new's picker sheet (which does not pass one) still names where it searches.
   *
   * V30 (2026-10-05): this label used to live inside the search placeholder
   * ("Places · Seattle, WA"), which left the pin beside it a bare glyph. The
   * clarify pass moved it onto the pin button, where one word names the control
   * AND states its value, and the placeholder went back to being a hint.
   */
  locationLabel?: string
  /** When true, taps select into the host instead of navigating away. */
  selectable?: boolean
  /** V23 slice 3: when true, the search + filter card pins to the top of the scroll area. */
  stickyControls?: boolean
  /**
   * v30-8 — may the viewer replace a place's photo from a card?
   *
   * The HOST answers this (BrowsePage passes the pure `canModerate(profile)`),
   * because permission is not this component's to decide. False — the default,
   * and what /new's picker gets — renders no edit control anywhere, so a parent
   * never sees one.
   */
  canEditPlacePhotos?: boolean
  /**
   * v30-8 — called after a photo is replaced, so the host can re-read the
   * directory. The card cannot update itself: the photo URL lives on the row
   * the host loaded, and inventing a new one here would be a second source of
   * truth for `places.photo_url`.
   */
  onPlacePhotoSaved?: () => void
  /** Called with the tapped place in selectable mode. */
  onSelect?: (place: Place) => void
}) {
  // --- Directory state -------------------------------------------------------

  const [query, setQuery] = useState('')
  const [indoorFilter, setIndoorFilter] = useState<boolean | null>(null)
  /**
   * V31 map-and-distance — THE ONE RADIUS DOOR.
   *
   * `null` = follow the viewer's own stored radius (the profile's
   * `radius_miles`, arriving as the `viewerRadius` prop). A number = the radius
   * the parent picked in the LOCATION CONTROL (`set-location-btn` →
   * `LocationModal`'s slider → Apply), which is now the only radius control on
   * this surface: the `places-distance-filter-btn` pill and its sheet were the
   * second door to the same number, and the founder's ruling was that the
   * location control already owns it.
   *
   * DELETING THE PILL ALONE WOULD HAVE DELETED THE RADIUS FILTER, which is why
   * this state exists at all. MEASURED on the built app (390x844, the seeded
   * marker, whose stored radius is 5): setting the modal's radius to 30 and
   * pressing Apply left the directory at 117 matched rows — UNCHANGED — while
   * the pill took it to 239 at "Any distance". The modal's radius only reached
   * the list when an address had been geocoded; with the pill gone it must reach
   * it whatever the centre is, so the location control now drives the same value
   * the pill did.
   *
   * The lib seam KEEPS its `DistanceChoice` policy ('profile' | 'any' | a
   * number): that is the tested radius rule, and the FEED's own ladder still
   * speaks it. This component simply only ever passes 'profile' (nothing picked)
   * or the picked number — `'any'` is unreachable from /browse by design now,
   * because "no ceiling" is not something the radius control can say.
   */
  const [pickedRadiusMiles, setPickedRadiusMiles] = useState<number | null>(null)
  /**
   * The radius every consumer here agrees on: the parent's pick, else the
   * viewer's stored radius. One value, so the filtered list, the drawn circle
   * and the slider cannot disagree.
   */
  const radiusMiles = pickedRadiusMiles ?? viewerRadius
  // The filter & sort modal. The list defaults to alphabetical (A–Z); the modal
  // is where filtering + re-sorting lives — there are no controls below the list.
  const [sortMode, setSortMode] = useState<SortMode>('alpha')
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  // Empty set = all kinds (no kind filter active).
  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(new Set())
  /**
   * V25 t08 — THE SAVED GATE. True = the directory shows ONLY the viewer's own
   * saved places (the founder's "collection of all of your favorite places").
   * It is a filter over the SAME `followedPlaceIds` set the bookmark controls
   * read — the follows table through `listMyFollows`, never a second store —
   * and the pure seam (`planDirectoryList`) owns what it does, exactly like
   * `selectedKinds` above. Component state (not a route): the ticket chose a
   * filter on the surfaces that already exist, and a new route would have to
   * join the playtest `routes.json`.
   */
  const [savedOnly, setSavedOnly] = useState(false)
  /**
   * V27 — THE "OPEN NOW" GATE. True = show only places whose hours say they are
   * open this minute. A place with no hours is excluded (unknown ≠ open); the
   * decision itself lives in the pure `planDirectoryList` seam.
   */
  const [openNowOnly, setOpenNowOnly] = useState(false)
  /**
   * Miles from the home pin; null = no radius constraint.
   *
   * V28 r4: this is ALWAYS null now. The filter modal's own "Within (miles of
   * home pin, optional)" input was its only writer, and that input was deleted
   * — it duplicated the distance dropdown below it while persisting nothing,
   * because it was never a saved preference (`/settings` owns that, via
   * `updateHomeZipRadius`). Two radius controls that could disagree, one of
   * which silently evaporated on navigation, was the confusion the founder
   * reported.
   *
   * The state and the `planDirectoryList` parameter are KEPT, not removed: the
   * seam's radius branch (`places.ts` `filterPlacesByRadius`) is the tested
   * mechanism, and it is reached through `radiusMiles` — the ONE value the
   * location control owns (see `pickedRadiusMiles` above). Deleting the seam
   * would remove tested behaviour for no user-visible gain, so the parameter
   * stays as the explicit "no modal radius constraint" default.
   *
   * V31 map-and-distance: the sentence above used to end "and `radiusMiles` —
   * the SEPARATE, saved-and-overridable value the dropdown drives — is the live
   * path". There is no dropdown any more; the one radius value is the location
   * control's, which is what this parameter never was.
   */
  const [radiusFilter] = useState<number | null>(null)

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
  /**
   * v30-8 — the place whose photo a moderator is replacing.
   *
   * ONE modal for the whole directory, not one per card: 239 rows must not each
   * mount a dialog, and a single instance is also what keeps "one editor" true —
   * the same component /mod mounts, never a second copy.
   */
  const [editingPhotoPlace, setEditingPhotoPlace] = useState<Place | null>(null)
  /**
   * place-photo-crop slice 4 — the moderator should not have to hunt for the
   * card they just changed, and the one sentence a refused copy produces has to
   * outlive the editor that produced it (the editor unmounts on save).
   *
   * `photoNotice` is that sentence; the editor hands it to `onSaved` and is gone
   * by the time this renders it. `pendingPhotoScrollId` is the place whose card
   * must be brought back into view, and it stays set until that card is actually
   * on screen: BrowsePage's re-read sets `places` to null for a beat, so the
   * card's node does not exist yet in the commit that closes the modal. An id
   * rather than a flag, so a re-render can still find the right row.
   */
  const [photoNotice, setPhotoNotice] = useState<string | null>(null)
  const [pendingPhotoScrollId, setPendingPhotoScrollId] = useState<string | null>(null)
  /**
   * The `places` array as it stood when the save was requested — the identity the
   * scroll effect waits to see replaced. The host's re-read blanks the list for a
   * beat (BrowsePage sets `places` to null while loading), and scrolling to a card
   * that is about to unmount is thrown away when the page shortens under it, so
   * the effect holds until a NEW list has arrived. It is re-armed by the next
   * save, alongside the pending id.
   */
  const photoScrollArmedRef = useRef<Place[] | null>(null)
  /**
   * The card nodes by place id — a map rather than one ref, because the row that
   * must scroll into view is chosen at SAVE time, long after the 239 rows were
   * rendered, and it is not necessarily the first one.
   */
  const photoRowNodes = useRef(new Map<string, HTMLDivElement>())

  // --- V27: the top controls ------------------------------------------------

  /**
   * V27 — THE SEARCH IS INLINE. The founder: *"I expected to be able to do it
   * right then and there on the same screen. I don't want it to take me
   * anywhere else."* So there is no search sheet any more: the pill IS a real
   * `<input>` on the page that filters the list live as it is typed. Focusing
   * it reveals the topic chips underneath (the old sheet's suggestions) and
   * nothing else moves. Because the parent taps the input itself, the
   * on-screen keyboard opens natively — the sheet's programmatic-focus problem
   * cannot occur.
   */
  const [searchFocused, setSearchFocused] = useState(false)
  /**
   * V27 — a placeholder category the parent tapped (Food/Cafe, Zoo/Animals).
   * The data source for these does not exist, so rather than a chip that could
   * only ever return an empty list, they open one honest "coming soon" line.
   */
  const [comingSoonKind, setComingSoonKind] = useState<string | null>(null)
  /** Which of the prominent dropdowns is open (one at a time), or none. */
  const [openDropdown, setOpenDropdown] = useState<'when' | null>(null)
  /**
   * The place-name shown on the pill / location row. The host may pass one
   * (the viewer's city); after a "Set location" geocode the typed address wins,
   * so the row reflects where the list is actually measured from.
   */
  const [locationLabelText, setLocationLabelText] = useState(locationLabel ?? 'Seattle, WA')
  /**
   * V27: whether the floating map toggle is on screen. It starts HIDDEN and
   * appears once the page is scrolled — the founder's ask (*"This shouldn't
   * populate until you start scrolling down"*) — but the map view itself always
   * shows it (the "List" way back can never be scrolled away).
   */
  const [showMapToggle, setShowMapToggle] = useState(false)

  // --- V24 slice 10: the view mode ------------------------------------------

  /**
   * WHICH SURFACE THE DIRECTORY IS SHOWING — the list (the filters card plus
   * every grouped row) or the map view (one map + the swipeable strip).
   * `'list'` is the default: the founder's ask is that the filters and the list
   * lead the page, with the map as a mode you toggle into.
   *
   * WHY THIS IS STATE AND NOT A ROUTE, and why it is not `history.back()`: the
   * map view's "Back to list" must return to THE LIST THE PARENT CAME FROM. A
   * new route (`/browse/map`) would rely on the browser's history containing
   * that list, and it may not — a parent who deep-linked into the map, or whose
   * history entry was replaced, would be sent somewhere else. State makes the
   * return unconditional. It also keeps the playtest `routes.json` guard
   * untouched (no new route exists to register).
   */
  const [view, setView] = useState<'list' | 'map'>('list')
  /**
   * The list's scroll offset, saved on ENTRY to the map view and restored on the
   * way back. Without it, "Back to list" lands at the top of a long directory
   * and the parent loses their place — the round trip would be a reset.
   */
  const listScrollRef = useRef<number | null>(null)
  /**
   * The restore is a ONE-SHOT: set the pending flag on the way back, and the
   * effect below consumes it. An effect rather than inlining the scroll in the
   * click handler because the handler runs BEFORE React has re-rendered the
   * list — scrolling then would measure the map view's (shorter) page and clamp
   * to a wrong maximum.
   */
  const pendingScrollRestoreRef = useRef(false)
  const reducedMotion = usePrefersReducedMotion()
  // The pure rule decides what the preference MEANS (src/lib/mapStrip.ts); this
  // component only reads it. The same value drives the map's recentre and the
  // strip's own scrolling, so the card and the pin animate together or not at
  // all.
  const focusBehavior = scrollBehaviorFor(reducedMotion)

  useEffect(() => {
    if (!pendingScrollRestoreRef.current) return
    pendingScrollRestoreRef.current = false
    const saved = listScrollRef.current
    if (saved === null) return
    window.scrollTo({ top: saved, behavior: focusBehavior })
  }, [view, focusBehavior])

  /**
   * place-photo-crop slice 4, change 3 — BRING THE CHANGED PLACE BACK INTO VIEW.
   * The founder, after using slices 1–3: *"Ideally, it would show you that place
   * automatically so you don't have to scroll down and find it, but whatever."*
   *
   * WHY IT WAITS FOR THE HOST'S RE-READ. The save closes the editor and asks the
   * host to re-read the directory, and that re-read blanks the list for a beat
   * (BrowsePage sets `places` to null while loading). Scrolling in the commit
   * that closes the modal would move a card that is about to be unmounted — and
   * the browser clamps the scroll back when the page shortens under it, so the
   * moderator would land somewhere arbitrary. So the effect holds until `places`
   * is a NEW array (a host that does not re-read has no `onPlacePhotoSaved` and
   * scrolls at once), then retries until the card's node exists.
   *
   * `block: 'center'` because the founder's ask is to SEE the picture, and a
   * centred card shows it whatever the card's height does next. `photoRowNodes`
   * drops a node when its row unmounts, so a stale node can never be scrolled to
   * after a place is filtered out.
   */
  useEffect(() => {
    if (pendingPhotoScrollId === null) return
    if (onPlacePhotoSaved !== undefined && places === photoScrollArmedRef.current) return
    const node = photoRowNodes.current.get(pendingPhotoScrollId)
    if (node === undefined) return
    node.scrollIntoView({ block: 'center', behavior: focusBehavior })
    setPendingPhotoScrollId(null)
  }, [pendingPhotoScrollId, places, focusBehavior, onPlacePhotoSaved])

  /**
   * V27 — the floating map toggle's visibility. It is hidden at the top of the
   * list and appears once the parent scrolls past the controls (the design
   * feedback: *"This shouldn't populate until you start scrolling down"*). The
   * listener reads the window scroll (the page scrolls normally), is passive,
   * and is only attached in list view — the map view's "List" control must
   * never depend on a scroll position.
   */
  useEffect(() => {
    if (view !== 'list') {
      setShowMapToggle(false)
      return
    }
    function onScroll() {
      setShowMapToggle(window.scrollY > MAP_TOGGLE_SCROLL_THRESHOLD_PX)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [view])

  // --- Derived rows ----------------------------------------------------------

  const {
    listRows,
    radiusReason,
    dateWindowReason,
    kindReason,
    savedReason,
    nothingMatches,
    openNowReason,
  } = planDirectoryList({
    places,
    query,
    indoorFilter,
    // V31 map-and-distance: the pill that used to write this is gone. A pick in
    // the location control is the radius ceiling; nothing picked means 'profile',
    // which resolves to the viewer's stored radius — byte-identical to the old
    // default. `'any'` is no longer reachable from this surface.
    distanceChoice: pickedRadiusMiles ?? 'profile',
    viewerRadius,
    selectedKinds,
    savedOnly,
    openNowOnly,
    followedPlaceIds,
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

  /**
   * V27 — NO SECTION HEADINGS. The founder: *"We don't need headers for the
   * places. At all."* The old list grouped placed rows by kind under an `<h2>`
   * and split coordinate-less rows into a separate "Not on the map yet" section
   * with its own heading. The list now renders `listRows` FLAT — every matching
   * row, placed or not, in `sortPlaces` order — so a place with no coordinates
   * still appears (the "a filter may not hide a place for missing data" rule)
   * but under no heading and exactly once. The card's own kind · indoor ·
   * distance line is what tells the parent what the row is.
   */

  /**
   * V25 t03: THE CATEGORY CHIP ROW's content — one chip per
   * `PLACE_KIND_CHIP_KINDS` (the EIGHT kinds the data actually has; `park` and
   * `trail` are withheld because a chip for either could only ever return an
   * empty list), labelled by `placeKindLabel` and flagged with whether the loaded
   * directory has any row of that kind at all. The decision lives in the pure
   * seam (`placeKindChips`, src/lib/places.ts); this component only renders it.
   *
   * The words and the glyphs are both PRE-EXISTING app vocabulary, not new ones:
   * `placeKindLabel` is what the list's group headings and the sheet's kind chips
   * already render, and `PLACE_KIND_ICONS` is the per-kind glyph set V17 built
   * for the card photo slot. The row therefore introduces no second label map and
   * no second icon set.
   */
  const kindChips = placeKindChips(places)

  /**
   * V24 slice 10: the rows the MAP VIEW carries.
   *
   * TWO SETS, AND THE DISTINCTION IS LOAD-BEARING — this slice's second review
   * caught both halves of it:
   *
   *  1. `mapViewRows` is EVERY row the directory's filter produces (it IS
   *     `listRows`) — never a slice of it. (Before
   *     V25 t01 the list rendered a six-row lead behind a door, and a map fed from
   *     that lead showed six pins and said nothing about the other 233; the lead is
   *     gone now, but the rule it produced is the reason this field exists at all.)
   *     A parent who searched for "park" and opened the map must see every
   *     matching place pinned — a matching place with no pin is the defect.
   *
   *  2. `placeableMapRows` is that set minus the rows the map cannot plot (no
   *     coordinates means no pin, never a fake one). The map view gets BOTH: the
   *     placeable rows are its PINS (all of them) and the source of its strip's
   *     cards (the first `MAP_STRIP_CARD_LIMIT` of them); the unplaceable rows go
   *     with the card overflow into its linear list, so no row is unreachable.
   *
   * The map view re-filters nothing: every row here is `planDirectoryList`'s own
   * output, so the map cannot disagree with the list it replaced.
   */
  const mapViewRows = listRows
  const placeableMapRows = mapViewRows.filter(
    (row) => resolveMapCoords(row.place, zipCoords) !== null,
  )

  /**
   * V25 t01: DOES THE MODE TOGGLE RENDER?
   *
   * THE DEFECT THIS NAMES (found in review): an unconditional button is on
   * screen while the directory is still loading and on a search that matches
   * nothing, where it opens a map with nothing on it and a way back to a list
   * with nothing in it — a control that promises two modes and delivers none.
   *
   * The rule, in one place:
   *
   *   * not while the read is in flight (`places === null`): there is no second
   *     mode yet;
   *   * not when there is nothing to draw in either mode (no rows AND nothing
   *     the map can plot): a mode switch between two empty surfaces is not a
   *     switch. This is the zero-result / radius-reason / date-window case —
   *     those messages are what the parent needs, and they are already up.
   *   * otherwise it is on screen in BOTH modes, which is the founder's ask
   *     ("when you get to the map mode, this button should come back and it
   *     should be called list").
   */
  const toggleAvailable =
    places !== null && (listRows.length > 0 || placeableMapRows.length > 0)

  /**
   * V25 t08 — DOES THE SAVED CHIP RENDER?
   *
   * YES when this viewer has saved at least one place (the collection exists to
   * be opened) OR when the gate is already on (so the control that clears a
   * filter is never the thing the filter removed). NO when the read is in
   * flight, and NO for a viewer with no saves: `setSavedOnly(true)` exists only
   * in this chip's own onClick, so a zero-save viewer has no way to turn the gate
   * on, and a chip there really would be a door to nowhere — the same "a control
   * that promises and delivers nothing" defect `toggleAvailable` above exists to
   * prevent.
   *
   * SO THE hasSaves=false SENTENCE IS NOT REACHED BY TURNING THE GATE ON. It is
   * reached FROM INSIDE an already-open collection: a viewer who HAS saves opens
   * the Saved list and un-saves their last one — the gate is still on, so the
   * chip stays (the `savedOnly` half of the rule above) and the first-run copy is
   * what they see. That is the path e2e/hearts-collection.e2e.ts step (d) drives.
   */
  const savedToggleAvailable =
    places !== null && (followedPlaceIds.size > 0 || savedOnly)

  // --- Handlers --------------------------------------------------------------

  function openFilterModal() {
    setFilterModalOpen(true)
  }

  function closeFilterModal() {
    setFilterModalOpen(false)
  }

  /**
   * V24 slice 10: enter the map view. The list's CURRENT scroll offset is saved
   * here — on the way out, before the DOM changes — because once the map view is
   * up the page is a different height and the offset is no longer readable.
   *
   * THE GUARD IS THE FIX FOR ocr FINDING 2, and it is a real corruption rather
   * than a no-op: the controls card stays mounted in the map view, so this button
   * is still there and still activatable. Activating it a second time would
   * OVERWRITE the saved offset with the MAP VIEW's `window.scrollY` — a number
   * from a different, shorter document — and the next "Back to list" would then
   * restore the parent to the wrong place (clamped to the list's height) instead
   * of where they left it. `setView('map')` was already a no-op, so the ONLY
   * effect of the second activation was the corruption; the early return removes
   * it and keeps the transition one-way until "Back to list" is pressed.
   */
  function openMapView() {
    if (view === 'map') return
    listScrollRef.current = typeof window === 'undefined' ? null : window.scrollY
    setView('map')
  }

  /**
   * V24 slice 10: return to the list the parent came from — the SAME list, with
   * its search/filter/sort/date state (all of it is this component's state and
   * was never unmounted) AND its scroll position (restored by the effect above).
   * The pending flag is what tells that effect this particular transition is a
   * return rather than an ordinary render.
   */
  function backToList() {
    pendingScrollRestoreRef.current = true
    setView('list')
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

  /**
   * V25 t03: the empty KIND state's escape — "Show all types" clears the kind
   * selection entirely (the same meaning the sheet's own "None selected = show
   * all types." line states), which is the one thing that can fix a chip whose
   * category has no rows: the kind was the whole answer, so clearing it restores
   * the directory.
   */
  function clearKindFilter() {
    setSelectedKinds(new Set())
  }

  async function handleGeocode(address: string) {
    const result = await geocodeAddress(address)
    if (result === null) {
      // The shared modal renders its own "could not find" line; the caller only
      // needs to know whether a center landed, which it reads via onGeocode's
      // return value (null = no center, keep the previous one).
      setGeocodeCenter(null)
    } else {
      setGeocodeCenter(result)
      // V27: once the address resolves, the pill and the search sheet's
      // location row name where the list is actually measured from.
      setLocationLabelText(address)
    }
    return result
  }

  /**
   * V31 map-and-distance — OPEN THE LOCATION CONTROL, AND DO NOT TOUCH ITS RADIUS.
   *
   * This used to reset the radius to the viewer's stored value on every open
   * (`setRadiusMiles(viewerRadius)`), because the modal's slider was then a
   * per-session draft that had to mirror the profile's saved radius each time.
   * The radius it commits is now the LIST's ceiling — the only radius door this
   * surface has — so resetting it here would silently discard a radius the
   * parent picked the moment they reopened the control to change the address.
   * The slider mirrors whatever the control holds, which is what "one radius
   * value" means.
   */
  function openLocationModal() {
    setLocationModalOpen(true)
  }

  /**
   * V28 r4 — the device fix from the modal's "Use my location" tap.
   *
   * It lands the centre IMMEDIATELY, before the modal's reverse lookup has
   * resolved a label, so the map moves the moment the device answers. That
   * ordering is the point of the separate prop: the label is cosmetic and a
   * failed reverse lookup must not cost the parent their location.
   *
   * The label is NOT set here — the modal writes the resolved address into its
   * own field and the parent presses Apply, which runs `handleGeocode` and sets
   * `locationLabelText` through the normal path. One label writer, so a
   * device-derived location cannot name itself differently from a typed one.
   */
  function handleDeviceCoords(coords: { lat: number; lng: number }) {
    setGeocodeCenter(coords)
  }

  /**
   * ⚠️ V28 r3-4: THIS DELIBERATELY NO LONGER CLEARS `geocodeCenter`.
   *
   * It used to: `setGeocodeCenter(null)`. That was correct while the dialog's
   * only geocoding control was "See places", which a parent pressed to PREVIEW a
   * centre and then had to confirm with a separate "Apply radius" — closing
   * without applying meant discarding the preview.
   *
   * With ONE Apply button the dialog's contract changed: Apply geocodes AND
   * commits AND closes. Clearing the centre on that close threw away the very
   * thing Apply had just resolved, so the circle snapped back to the home pin and
   * the parent saw "it did nothing" — the exact symptom r3-4 exists to fix, and
   * one the browser lane caught (`places-map-view`, "the geocoded centre must
   * reframe the drawn circle").
   *
   * The centre is now the committed frame and survives the close. Reopening
   * re-geocodes if the parent types again, and Cancel closing without an address
   * simply keeps the last committed centre — which is what the map is already
   * drawing, so nothing moves.
   */
  function closeLocationModal() {
    setLocationModalOpen(false)
  }

  // --- Render ----------------------------------------------------------------

  /**
   * V27 / v30-3 — the dropdown triggers' own labels. Each names the CONTROL and
   * its CURRENT choice, so the row reads as named state readouts rather than
   * unlabelled values. The derivation is the pure `filterTriggerLabels` seam
   * (lib/places, unit-tested); the option lists live beside it so a trigger and
   * its sheet can never disagree about what is selectable.
   *
   * V31 map-and-distance: there are TWO triggers now, not three. The distance
   * pill — and with it this seam's `distance` label — is gone; the radius is the
   * location control's and is stated on that control (`radiusMiles` below).
   */
  const triggers = filterTriggerLabels({ dateWindow })
  const whenOptions = DATE_WINDOWS.map((window) => ({
    value: window,
    label: DATE_DROPDOWN_LABELS[window],
  }))
  /**
   * The inline suggestion chips shown when the search field is focused and
   * empty — the same kind words the pill row uses, so the two can never
   * disagree.
   */
  const suggestionWords = kindChips.map((chip) => chip.label)
  /**
   * V27 — the two categories the DATA CANNOT EXPRESS (no food/cafe, zoo or amenity
   * dataset anywhere), rendered as the row's trailing pills. They are not
   * filters: tapping one opens a single honest "coming soon" line instead of a
   * chip that could only ever return an empty list. The founder asked for them
   * by name; the substrate does not exist, so the request is named rather than
   * faked.
   */
  const comingSoonKinds = [
    { id: 'food', label: 'Food/Cafe', copy: 'Coming soon! Want to request local food spots?' },
    { id: 'zoo', label: 'Zoo/Animals', copy: 'Coming soon! Want to request a zoo or animal farm?' },
  ] as const
  const comingSoonCopy = comingSoonKinds.find((k) => k.id === comingSoonKind)?.copy ?? null

  return (
    <div
      className={
        view === 'map'
          ? 'flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start'
          : 'flex flex-col gap-4'
      }
    >
      {/* V27 — THE TOP THIRD: search pill, the dropdowns, and the horizontal
          icon sub-filter row. The founder's ask was that the controls read like
          the reference (a rounded search bar, prominent dropdown filters,
          a colourful icon strip under them) and occupy only the top of the
          screen, leaving the list to own the rest of it. The controls that used
          to sit here are all still reachable, restated:
            * the TYPE dropdown      — Any type / Indoor / Outdoor (was the
                                       indoor + outdoor chip pair)
            * the WHEN dropdown      — Any day / Today / Tomorrow / Weekend
                                       (was the date chip radiogroup)
            * the search pill        — a real inline input (the old full-screen
                                       search sheet is gone)
            * the location control   — address + THE radius (the "Set location"
                                       modal). V31 map-and-distance: this is the
                                       ONE radius door; the DISTANCE dropdown
                                       that used to sit in this row is deleted.
            * the icon strip         — the same `selectedKinds` set as the
                                       filter sheet's own chips
          Sorting still lives in the sliders ("Filter & sort") sheet, so nothing
          was dropped in the restyle. */}
      <div
        className={`flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ${view === 'map' ? 'md:col-start-2' : ''} ${stickyControls ? 'sticky top-0 z-10' : ''}`}
      >
        {/* The search field + the two utilities, ONE inline row.
            THE FOUNDER: *"I expected to be able to do it right then and there on
            the same screen. I don't want it to take me anywhere else."* So the
            old full-screen sheet is gone. This is a REAL `<input>` that filters
            the list live as it is typed, and because the parent taps the input
            itself the on-screen keyboard opens natively. The pin button changes
            the location; the sliders button opens Filter & sort. */}
        <div className="flex flex-col gap-2">
          {/* Says it in place: the pin carries the location's own value and
              the sliders carry a word, so neither is a bare glyph. */}
          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 pl-3 pr-1 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-200">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={NAV_ICONS.search} />
            </svg>
            <input
              type="search"
              data-testid="places-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search places"
              autoComplete="off"
              className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
            />
            <button
              type="button"
              data-testid="set-location-btn"
              onClick={openLocationModal}
              aria-label="Change location"
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-slate-600 outline-none transition-colors motion-reduce:transition-none hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={NAV_ICONS.nearby} />
              </svg>
              {locationLabelText}
            </button>
            <button
              type="button"
              data-testid="filter-sort-btn"
              onClick={openFilterModal}
              aria-label="Filter and sort"
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-slate-600 outline-none transition-colors motion-reduce:transition-none hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={NAV_ICONS.sliders} />
              </svg>
              Filters
            </button>
          </div>

          {/* Focusing the empty field offers the SAME kind words as the pill row,
              as quick starts. `onPointerDown` preventDefault keeps focus on the
              input so the keyboard does not flicker shut when one is tapped. */}
          {searchFocused && query.trim() === '' ? (
            <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1">
              {suggestionWords.map((word) => (
                <button
                  key={word}
                  type="button"
                  data-testid={`places-search-suggestion-${word}`}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => setQuery(word)}
                  className="min-h-11 shrink-0 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 outline-none transition-colors motion-reduce:transition-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  {word}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* The prominent dropdowns. Equal width, one open sheet at a time; the
            next control is the Saved gate, rendered only when it is not a door
            to nowhere (see `savedToggleAvailable`).

            V31 map-and-distance — TWO triggers, NOT THREE. The
            `places-distance-filter-btn` pill and its `places-distance-sheet`
            are deleted: the radius is the location control's (the `set-location-btn`
            row above), and two doors to one number is what the founder ruled
            out. The radius itself is unchanged in behaviour — it still ceilings
            the list — it is simply written by the location modal now.

            v30-3, measured (kept because the geometry lesson still governs this
            row): with the Saved gate present at 390px each pill was 86px wide and
            the caption column only 52px — "Distance" needed 66px, so it
            ellipsized by 14px and the parent could not read what the pill
            filtered, which is the whole defect. The row therefore WRAPS
            (`flex-wrap`) with a real `basis` on each trigger, so a further
            control moves to a second line instead of squeezing the captions out
            of the first. With the distance pill gone, the one caption that
            remains ("When") has more room than it did, not less.

            V30 (2026-10-05, accepted over impeccable live on /browse): the gate
            itself was the next thing the founder could not read — a 44px
            icon-only circle whose only word was its `aria-label`, and his note
            was "as a user, I would have no idea what this does". It is now a
            named pill (bookmark + "Saved"). */}
        {/* DISTILL (V30, 2026-10-05, over impeccable live on /browse): the
            card spent TWO rows on one job — a row of filter pills, then a row
            of quick gates, with a gap and a heading-shaped comment between
            them. They are the same kind of control answering the same
            question ("narrow what I am looking at"), so they are now one
            wrapping row and the card is a row shorter. The gates stay last,
            where the eye arrives after the filters. */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        data-testid="places-indoor-filter"
                        aria-pressed={indoorFilter === true}
                        onClick={() => {
                          setIndoorFilter((prev) => (prev === true ? null : true))
                        }}
                        className={
                          'flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 ' +
                          (indoorFilter === true
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
                        }
                      >
                        <svg
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          className={
                            'h-4 w-4 shrink-0 ' +
                            (indoorFilter === true ? 'text-white' : 'text-violet-500')
                          }
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 10.5 12 4l9 6.5 M5 10.8V20h14v-9.2 M9.5 20v-5h5v5" />
                        </svg>
                        Indoor
                      </button>
                                    <DropdownTrigger
                        testId="places-when-filter"
                        caption={triggers.when.caption}
                        label={triggers.when.value}
                        iconPath={NAV_ICONS.clock}
                        onClick={() => setOpenDropdown('when')}
                      />
        {savedToggleAvailable ? (
                        <button
                          type="button"
                          data-testid="places-saved-filter"
                          aria-pressed={savedOnly}
                          aria-label="Saved places"
                          onClick={() => {
                            setSavedOnly((prev) => !prev)
                          }}
                          className={
                            'flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-medium outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 ' +
                            (savedOnly
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')
                          }
                        >
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0"
                            fill={savedOnly ? 'currentColor' : 'none'}
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d={NAV_ICONS.bookmark} />
                          </svg>
                          Saved
                        </button>
                      ) : null}
                      <button
                        type="button"
                        data-testid="places-open-now-filter"
                        aria-pressed={openNowOnly}
                        onClick={() => setOpenNowOnly((prev) => !prev)}
                        className={
                          'flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 ' +
                          (openNowOnly
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
                        }
                      >
                        <span
                          aria-hidden="true"
                          className={openNowOnly ? 'text-white' : 'text-emerald-500'}
                        >
                          ●
                        </span>
                        Open now
                      </button>
                      <button
                        type="button"
                        data-testid="places-top-rated-sort"
                        aria-pressed={sortMode === 'top-rated'}
                        onClick={() =>
                          setSortMode((prev) => (prev === 'top-rated' ? 'alpha' : 'top-rated'))
                        }
                        className={
                          'flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 ' +
                          (sortMode === 'top-rated'
                            ? 'border-amber-500 bg-amber-500 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
                        }
                      >
                        <span
                          aria-hidden="true"
                          className={sortMode === 'top-rated' ? 'text-white' : 'text-amber-500'}
                        >
                          ★
                        </span>
                        Top rated
                      </button>
                    </div>

        {/* V27 — THE INTENT PILLS. Padded capsule buttons rather than the old
            tight icon-above-word chips: easier to hit one-handed, and the
            selected state is a SOLID indigo fill with white text/icon so it
            reads instantly against the neutral inactive pills. Each still
            toggles the SAME `selectedKinds` set the filter sheet's chips use.

            THE TWO TRAILING PILLS ARE NOT FILTERS. This app has no food/cafe or
            zoo/animal dataset anywhere, so a real chip for either could only
            ever return an empty list. They are named to the parent and open one
            honest "coming soon" line instead — the previous static disclaimer
            sentence is gone. */}
        <div className="flex flex-col gap-1.5">
          <div
            data-testid="place-kind-chip-row"
            role="group"
            aria-label="Place types"
            className="flex snap-x gap-2 overflow-x-auto overscroll-x-contain pb-1"
          >
            {kindChips.map((chip) => {
              const selected = selectedKinds.has(chip.kind)
              return (
                <button
                  key={chip.kind}
                  type="button"
                  data-testid={`place-kind-chip-${chip.kind}`}
                  data-empty={chip.empty ? 'true' : 'false'}
                  aria-pressed={selected}
                  onClick={() => {
                    toggleKind(chip.kind)
                  }}
                  className={
                    'flex min-h-11 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 ' +
                    (selected
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className={
                      'h-5 w-5 shrink-0 ' +
                      (selected ? 'text-white' : (KIND_ACCENTS[chip.kind] ?? 'text-slate-500'))
                    }
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={PLACE_KIND_ICONS[chip.kind]} />
                  </svg>
                  {chip.label}
                </button>
              )
            })}
            {comingSoonKinds.map((kind) => (
              <button
                key={kind.id}
                type="button"
                data-testid={`place-kind-placeholder-${kind.id}`}
                onClick={() => setComingSoonKind((prev) => (prev === kind.id ? null : kind.id))}
                className="flex min-h-11 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-slate-300 bg-white px-4 text-sm font-medium text-slate-400 outline-none transition-colors motion-reduce:transition-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {kind.label}
              </button>
            ))}
            {/* COFFEE NEARBY (founder, 2026-10-06, over impeccable live on /browse).
                It belongs WITH the place chips, not in a row's action cluster:
                "the coffee nearby button should be with the other buttons like
                Playground / Indoor play / Museum". It is the last chip in the
                scroll row, and the only one that is not a filter — it is a DOOR.

                WHAT IT CAN HONESTLY BE TODAY. This app holds no cafe data: the
                directory's kinds are places, and "Food/Cafe" is a dashed
                placeholder precisely because there is no dataset behind it. So
                the chip cannot say "there is a coffee shop 3 minutes away". It
                opens that question in the tool that does know, centred on the
                area being browsed — the same move `mapsHref` (lib/feed.ts) makes
                for a single place. An in-app per-place answer needs a
                nearby-places source (Google Places Nearby or Overpass) plus a
                caching decision; that is a slice, not a chip. */}
            <a
              href={`https://www.google.com/maps?q=${encodeURIComponent(
                `coffee near ${locationLabelText}`,
              )}`}
              target="_blank"
              rel="noopener"
              data-testid="place-coffee-nearby"
              className="flex min-h-11 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition-colors motion-reduce:transition-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-amber-700"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 8h13v5.5A4.5 4.5 0 0 1 12.5 18h-4A4.5 4.5 0 0 1 4 13.5V8Z M17 9.5h1.6a2.6 2.6 0 0 1 0 5.2H17 M3.5 21h14" />
              </svg>
              Coffee nearby
            </a>
          </div>
          {comingSoonCopy !== null ? (
            <p
              data-testid="place-kind-coming-soon"
              role="status"
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600"
            >
              {comingSoonCopy}{' '}
              <button
                type="button"
                onClick={() => setComingSoonKind(null)}
                className="font-medium text-indigo-600 underline underline-offset-2"
              >
                Dismiss
              </button>
            </p>
          ) : null}
        </div>
      </div>

      {/* V24 slice 10 — THE MAP VIEW REPLACES the list rather than sitting
          beside it, and this is the MEASURED reason for that shape: two mounted
          Leaflet maps means two `data-testid="places-map"` nodes, and every
          existing spec that calls `page.getByTestId('places-map')` then fails in
          Playwright's strict mode. At most ONE map is mounted at any moment, and
          the map view's own map carries its OWN test id
          (`places-map-view-map`, through PlacesMap's existing `testId` prop).

          V25 t01 made this the ONLY map on the page: list view no longer mounts
          a band above the filters, so the two maps this comment guards against
          cannot coexist even transiently.

          It spans both columns at md+: the strip wants the width, and the
          controls above it stay mounted so a parent can narrow the map's result
          set without leaving the map. */}
      {view === 'map' && places !== null ? (
        <div className="md:col-span-2">
          <PlacesMapView
            pins={placeableMapRows}
            rows={mapViewRows}
            zipCoords={zipCoords}
            homePin={homePin}
            /* V25 t01: the committed-radius circle (and the live preview while
               the Set-location dialog is open) is drawn on the map in map mode.
               The band that used to carry it is gone, and the founder's ask —
               "when you drag the radius, it should expand or grow the red circle
               in real time" — needs a map to be visible on. Passed only in map
               mode: in list view there is no map to draw it on. */
            radiusCircle={
              view === 'map'
                ? radiusPreviewCircle({
                    previewCenter: locationModalOpen ? geocodeCenter : null,
                    previewMiles: radiusMiles,
                    geocodeCenter,
                    homePin,
                    committedMiles: MAP_FOCUS_RADIUS_MILES,
                  })
                : null
            }
            focusBehavior={focusBehavior}
            onBackToList={backToList}
          />
        </div>
      ) : null}

      {/* The list (or its empty states). V25 t01: THE WHOLE BLOCK IS LIST-ONLY.
          The map view REPLACES the list — "they're not both visible on the page
          at the same time in different places" is the founder's ask — and the
          V24 shape only gated the Loading branch, so the else-chain below
          (empty states AND the 239-row list) rendered under the map in map mode.

          Gating the whole chain rather than only the `places-list` branch is
          deliberate: a radius/date-window/kind/zero-match message is a statement
          ABOUT THE LIST, and map mode is not showing a list. The mode toggle is
          always on screen (see the floating control below), so the way back to
          those messages is one tap and never a dead end. */}
      {/* place-photo-crop slice 4 — THE EDITOR'S ONE SENTENCE, AFTER IT CLOSES.
          The link fallback stores the remote photo and finishes; the moderator
          has to be told why the picture they just saved cannot be framed, and a
          message rendered by the editor could not survive the editor unmounting.
          It sits above the list, the region the save scrolls back to.

          `role="status"` rather than `role="alert"`: the write SUCCEEDED (the
          photo is on the card), so this is a report, not a failure. It stays
          until the next photo change — no timer, because a sentence that
          disappears on its own is a sentence a slow reader does not get. */}
      {photoNotice !== null ? (
        <p
          role="status"
          data-testid="place-photo-notice"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm md:col-start-2"
        >
          {photoNotice}
        </p>
      ) : null}

      {view !== 'list' ? null : places === null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm md:col-start-2">
          Loading…
        </div>
      ) : savedReason !== null ? (
        /* V25 t08 — THE SAVED GATE'S EMPTY STATE, and it leads the chain for the
           same reason the kind state does: the parent asked for their own
           collection, so "your collection is empty" is the true answer, and
           "Nothing within N miles yet" (the radius branch below) would blame a
           control they never touched. Two honest messages plus their escapes:

             * `hasSaves === false` — no saves at all. A sentence, no bordered
               empty list, and the escape is to the whole directory so the
               bookmark they need is one tap away.
             * `hasSaves === true` — saves exist but the current narrowing
               excluded them all. The copy says exactly that; the escape clears
               the gate.

           Both escapes write the SAME `savedOnly` state the chip does, so there
           is one filter and one way to clear it. */
        <div
          data-testid="empty-saved-state"
          className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm md:col-start-2"
        >
          <p className="text-sm text-slate-600">{savedPlacesEmptyCopy(savedReason.hasSaves)}</p>
          <button
            type="button"
            data-testid="saved-empty-escape-all"
            onClick={() => {
              setSavedOnly(false)
            }}
            className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 outline-none transition-colors motion-reduce:transition-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {savedReason.hasSaves ? 'Show all places' : 'Browse all places'}
          </button>
        </div>
      ) : kindReason !== null ? (
        /* V25 t03: THE HONEST ZERO-ROW KIND STATE, and it still outranks the
           radius and date-window branches. `kindReason` is non-null only when
           EVERY selected kind has zero rows in the whole loaded directory
           (`park` and `trail` today), and that is the one emptiness no other
           control can explain or fix: widening the radius, choosing another date
           window, or clearing the search cannot conjure a place whose kind does
           not exist. Naming the chip's own label is therefore the true answer,
           and the escape returns the parent to the full directory. Every other
           cause (a radius, a window, a search) still falls through to its own
           message below, exactly as before.
           V25 t08: the SAVED branch now sits ahead of it, because when the
           parent has asked for their own collection, "your collection is empty"
           is the more specific truth; the kind state still leads the others. */
        <div
          data-testid="empty-kind-state"
          className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm md:col-start-2"
        >
          <p className="text-sm text-slate-600">{kindEmptyCopy(kindReason.label)}</p>
          <button
            type="button"
            data-testid="kind-empty-escape-all"
            onClick={clearKindFilter}
            className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 outline-none transition-colors motion-reduce:transition-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Show all types
          </button>
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
            }}
            className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 transition-colors motion-reduce:transition-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
          >
            Show Upcoming
          </button>
        </div>
      ) : openNowReason ? (
        /* V27 — THE OPEN-NOW EMPTY STATE. The gate is a control the parent
           touched, so when it is the reason nothing shows, name it and offer the
           one tap that restores the directory. Unknown-hours places are excluded
           by the gate, which is the honest behaviour (never assume open), and
           this line is where that is said out loud. */
        <div
          data-testid="empty-open-now-state"
          className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm md:col-start-2"
        >
          <p className="text-sm text-slate-600">
            Nothing here is open right now — or we don’t have their hours yet.
          </p>
          <button
            type="button"
            data-testid="open-now-empty-escape"
            onClick={() => {
              setOpenNowOnly(false)
            }}
            className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 outline-none transition-colors motion-reduce:transition-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Show all places
          </button>
        </div>
      ) : nothingMatches ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm md:col-start-2">
          No places match that.
        </div>
      ) : (
        <div
          data-testid="places-list"
          /* V25 t01: the directory's own totals, published for the specs that
             pin "the list is the whole list" and "nothing renders twice" — the
             same publish-the-fact discipline the map view uses. Asserting the
             render against the surface's own declared totals is an assertion
             about the render; asserting numbers derived from the seed is an
             assertion about today's data.

             `matched` is EVERY matching row (placed + unplaced); `placed` is
             the subset this container renders. The difference must be the rows
             the "Not on the map yet" section renders, exactly once each. */
          data-matched-rows={listRows.length}
          data-placed-rows={listRows.filter((row) => row.distanceMiles !== null).length}
          className="flex flex-col gap-2"
        >
          {/* V27: THE WHOLE LIST, FLAT AND UNGROUPED. The founder: "We don't
              need headers for the places. At all." So every matching row —
              placed or not — renders once, in `sortPlaces` order (A–Z by
              default; the filter sheet's sort mode can change it). A
              coordinate-less row is no longer exiled to a separate headed
              section: it keeps its place in the flat order and its own card
              line says "Distance unknown", so it is still never hidden. */}
          {listRows.map((row) => (
            <DirectoryRow
              key={row.place.id}
              row={row}
              highlight={reviewHighlights?.get(row.place.id) ?? null}
              proof={dropInProofs?.get(row.place.id) ?? null}
              nowIso={nowIso}
              followed={followedPlaceIds.has(row.place.id)}
              canFollow={canFollow}
              onToggleFollow={onToggleFollow}
              selectable={selectable}
              onSelect={onSelect}
              onEditPhoto={
                canEditPlacePhotos ? () => setEditingPhotoPlace(row.place) : undefined
              }
              /* slice 5: the audience for the review rule. The moderator IS the
                 reviewer, and `canEditPlacePhotos` is already the host's answer
                 to "is this viewer the moderator" — one fact, not two. */
              photoViewer={canEditPlacePhotos ? 'moderator' : 'parent'}
              /* place-photo-crop slice 4: the card's own node, registered so the
                 save's scroll-into-view has something to point at. Deleting on
                 unmount is what keeps a filtered-out place from being scrolled
                 to later. */
              cardRef={(node) => {
                if (node === null) photoRowNodes.current.delete(row.place.id)
                else photoRowNodes.current.set(row.place.id, node)
              }}
            />
          ))}
        </div>
      )}

      {/* V25 t01: THE MODE TOGGLE. One floating control that flips list↔map
          instead of scrolling to a band (there is no band left to scroll to:
          `scrollBackToMap` and the IntersectionObserver that used to hide this
          button while the band was visible are both gone).

          It renders in BOTH modes — `toggleAvailable` above is the one rule
          that can suppress it, and that rule exists so it is never a button to
          nowhere — and its label follows the mode, because that is the founder's
          ask: "when you get to the map mode, this button should come back and it
          should be called list. you can toggle back and forth between them." The
          accessible name is the same word the button shows (`aria-label`
          matches the visible label), so a screen reader and the screen agree.

          NO z-index by design (document order clears the content; Leaflet's
          controls sit at 1000, so a number buys nothing). Clears the bottom nav
          by geometry and honours reduced motion.

          V27: IN LIST VIEW IT STARTS HIDDEN and appears only after the parent
          scrolls past the controls (`showMapToggle`, the founder's "This
          shouldn't populate until you start scrolling down"). In MAP VIEW it is
          always on screen — the way back to the list can never be scrolled away.
          In the /new picker SHEET (`selectable`) there is no window scroll to
          read, so the control is always available there: the sheet's map mode is
          a real way to pick a place and must never be unreachable. */}
      {toggleAvailable && (view === 'map' || showMapToggle || selectable) ? (
        <button
          type="button"
          data-testid="places-view-toggle"
          aria-label={view === 'list' ? 'Map' : 'List'}
          onClick={view === 'list' ? openMapView : backToList}
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 flex min-h-11 min-w-11 -translate-x-1/2 items-center justify-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 shadow-lg outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 hover:bg-slate-50 md:bottom-[calc(2rem+env(safe-area-inset-bottom))]"
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
          {view === 'list' ? 'Map' : 'List'}
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

      {/* The Set location modal — address + THE radius. V31 map-and-distance:
          this is the surface's ONE radius door (the distance pill that used to
          repeat it is deleted), so the slider's value ceilings the list as well
          as drawing the circle. The founder's placeholder names the coordinate
          kinds a parent might type. */}
      <LocationModal
        open={locationModalOpen}
        onClose={closeLocationModal}
        radiusMiles={radiusMiles}
        homeZip={null}
        addressPlaceholder="Neighborhood, city, or zip"
        onGeocode={handleGeocode}
        // V23 s1 extraction regression fix: the slider must drive the map LIVE
        // (V20 t05), not only on the committed value. `onRadiusChange` is the
        // per-tick preview the old inline modal had and the extraction dropped.
        //
        // V28 r3-4: this caller has NO server write — /browse's centre and radius
        // are page-local state — so `onApplyRadius` restates the same setter. It
        // is kept (rather than omitted) because it is what the ONE Apply button
        // commits through before the dialog closes, and it makes the modal's
        // apply-then-close contract uniform for both callers. It cannot fail, so
        // the modal's error surface simply never fires here.
        //
        // V31: both halves write the SAME `pickedRadiusMiles`, which is the
        // list's radius ceiling as well as the circle's radius. One value, so the
        // number on the slider is the number the list was filtered by — which is
        // exactly what the deleted pill could not guarantee (they were two
        // independent states that could disagree).
        onRadiusChange={(miles) => setPickedRadiusMiles(miles)}
        onApplyRadius={(miles) => setPickedRadiusMiles(miles)}
        // V28 r4: the device tap moves the map before its label resolves.
        onDeviceCoords={handleDeviceCoords}
      />

      {/* v30-8 — THE SAME EDITOR, opened from the card whose photo is wrong.
          The founder's complaint was specifically that he could not fix a photo
          from where he NOTICED it ("I still don't see an option for me to click
          upload or edit a photo on each place"). The modal is the shared
          ModalShell and the body is the shipped PlacePhotoAdmin — this mounts
          an existing tool, it does not build one. */}
      {editingPhotoPlace !== null ? (
        <ModalShell
          title="Fix a place photo"
          testId="place-photo-editor"
          /* The directory renders a Leaflet map band, so this dialog must
             out-stack it (z-[1100], not z-50) — the defect lib/stacking.ts
             records as having shipped before. */
          zClass={MODAL_OVER_LEAFLET_Z_CLASS}
          onDismiss={() => setEditingPhotoPlace(null)}
          dismissLabel="Close"
        >
          <PlacePhotoAdmin
            place={editingPhotoPlace}
            onSaved={(notice) => {
              /**
               * place-photo-crop slice 4 — FINISHING CLOSES THE EDITOR.
               *
               * The founder: *"when you're finished, this fix up place photo
               * modal should disappear and the photo will just be populated on
               * the place now."* So the empty string of work below is the whole
               * confirmation: the modal goes, the host re-reads behind it, and
               * the card (with the picture) is scrolled back into view.
               *
               * `notice` is set only by the link fallback — a host refused the
               * copy and the remote URL was stored instead — and it is rendered
               * above the list, which is where the scroll lands. A later save
               * clears the previous sentence rather than stacking them.
               */
              setEditingPhotoPlace(null)
              setPhotoNotice(notice ?? null)
              photoScrollArmedRef.current = places
              setPendingPhotoScrollId(editingPhotoPlace.id)
              onPlacePhotoSaved?.()
            }}
          />
        </ModalShell>
      ) : null}

      {/* V27: the dropdown sheets. One shared component, one open at a time
          (`openDropdown`), each committing straight into the same state the
          controls above render — there is no separate "apply" step.
          V31 map-and-distance: two, not three — the distance sheet is deleted
          with its pill. */}
      <PlaceFilterSheet
        open={openDropdown === 'when'}
        testId="places-when-sheet"
        title="When"
        options={whenOptions}
        value={dateWindow}
        onSelect={(value) => {
          setDateWindow(value)
        }}
        onClose={() => setOpenDropdown(null)}
      />
    </div>
  )
}

/**
 * V27 — the parents' aggregate star rating, rendered as five stars plus the
 * value and count. The founder: *"is it open? … is it indoor or outdoor? …
 * how other parents have reviewed it … and how close it is to me. Those are
 * the prominent things."*
 *
 * HONEST ZERO: this component is only rendered when `hasReviews` is true; the
 * caller shows a quiet "No reviews yet" otherwise, so a place with no reviews
 * is never given a 0-star or 5-star appearance it did not earn. `displayAverage`
 * is the DB-computed value (0052's `review_summary`), never re-derived here.
 *
 * A11Y: `role="img"` with a full sentence label, and the glyphs + numeric text
 * are `aria-hidden` so a screen reader hears "Rated 4.3 out of 5 from 12
 * reviews" once, not a row of star characters.
 */
function PlaceStars({ count, average }: { count: number; average: number | null }) {
  const value = average ?? 0
  const filled = Math.max(0, Math.min(5, Math.round(value)))
  const label = `Rated ${value.toFixed(1)} out of 5 from ${count} ${count === 1 ? 'review' : 'reviews'}`
  return (
    <span
      role="img"
      aria-label={label}
      data-testid="place-rating-line"
      className="flex shrink-0 items-center gap-1 pt-0.5"
    >
      <span aria-hidden="true" className="text-sm leading-none text-amber-500">
        {'★'.repeat(filled)}
        {'☆'.repeat(5 - filled)}
      </span>
      <span aria-hidden="true" className="text-xs font-medium text-slate-600">
        {value.toFixed(1)}
        <span className="text-slate-400"> ({count})</span>
      </span>
    </span>
  )
}

/**
 * One place CARD. In non-selectable mode the whole card taps through to the
 * place page (the /browse behaviour); in selectable mode the NAME selects into
 * the host instead (the /new behaviour) and the "Start a drop-in" action is
 * suppressed (it navigates to /new, which IS the host).
 *
 * The card's save control is the SAME Save / Saved bookmark the place pages
 * render (annotation 5: a heart reads as "like", not "follow/save"). It keeps
 * its pre-annotation-5 testid `place-heart-<id>` — the e2e specs locate it by
 * that name and assert its >=44px box + aria-pressed; renaming would force
 * spec churn this batch does not need. The stale name is deliberate.
 */
function DirectoryRow({
  row,
  highlight,
  proof,
  nowIso,
  followed,
  canFollow,
  onToggleFollow,
  selectable,
  onSelect,
  onEditPhoto,
  photoViewer,
  cardRef,
}: {
  row: PlaceListRow
  /** V27: this place's newest review with a body, or null (none / read failed). */
  highlight: PlaceReviewHighlight | null
  /** V27: this place's past-drop-in activity, or null (none / read failed). */
  proof: PlaceDropInProof | null
  /** V27: the shared clock for the activity line (falls back to now). */
  nowIso?: string
  followed: boolean
  canFollow: boolean
  onToggleFollow: (placeId: string) => void
  selectable: boolean
  onSelect?: (place: Place) => void
  /**
   * v30-8 — present ONLY for a moderator (the host decides; see the prop on
   * PlaceDirectory). Its presence is the whole permission UI on this surface.
   */
  onEditPhoto?: () => void
  /**
   * Place-photo sourcing (slice 5) — WHO is looking at this card.
   *
   * A moderator sees a tier-2 picture (they are the reviewer) and the "review"
   * badge; a parent keeps the per-kind illustration until it is confirmed. WHICH
   * viewer gets what is decided by the pure `placePhotoVisibleTo` /
   * `placePhotoNeedsReview` in lib/places.ts — this prop is only the audience, so
   * the card cannot invent its own rule.
   */
  photoViewer: PlacePhotoViewer
  /**
   * place-photo-crop slice 4 — the card's outer node, handed to the directory so
   * a save can scroll this card back into view. A callback ref rather than a
   * `forwardRef`: it is one element and the directory needs "which node for
   * which place", not a ref the directory would have to keep in an array anyway.
   */
  cardRef?: (node: HTMLDivElement | null) => void
}) {
  const navigate = useNavigate()
  /**
   * V27 — the photo, with a HARD fallback. About half the directory carries a
   * Wikimedia `photo_url`; the rest draw the per-kind illustration, and a URL
   * that fails (the founder's original reason for pulling photos) falls back on
   * `onError` too, so a card is never a broken image.
   *
   * V30 batch close (2026-10-05): the failure is keyed to the URL that failed,
   * not to the component — the same fix, and the same reason, as the place
   * page's hero: a moderator's replacement has to be able to render over a
   * picture that had already failed on this mount.
   */
  const [photoFailedUrl, setPhotoFailedUrl] = useState<string | null>(null)
  const photoUrl = row.place.photo_url
  // v30-6: the DATA half of "show a photo" is the shared pure predicate (the
  // place page asks the same question); the failed-load half stays local state.
  //
  // slice 5 makes that DATA half viewer-aware: a tier-2 sourcing fill is real
  // enough to store and not real enough to show a family, so a parent keeps the
  // per-kind illustration until the picture is confirmed.
  const showPhoto = placePhotoVisibleTo(row.place, photoViewer) && photoFailedUrl !== photoUrl
  const photoNeedsReview = placePhotoNeedsReview(row.place)
  const photoCredit = photoCreditLine(row.place)
  const ageFit = placeAgeFitLabel(row.place)
  /**
   * V27 — the open/closed answer, when the row has hours. `null` means UNKNOWN
   * (no hours, or a schedule we could not read) and renders NO chip, never a
   * guessed "Open". The note marks a citywide default as "typical hours" so an
   * assumption is never shown in the same voice as a real schedule.
   */
  const openStatus = hoursStatus(row.place.hours ?? null, new Date())
  const openNote = hoursSourceNote(row.place.hours_source ?? null)
  /**
   * V27 — THE SOCIAL CUE, in strict PRIORITY (a card shows exactly one line,
   * and the first true fact wins):
   *
   *   1. a POSITIVE upcoming count — the most actionable fact ("3 drop-ins
   *      planned here"), the pre-existing copy;
   *   2. else a place that has ALREADY hosted past drop-ins — `dropInProofLine`
   *      returns null for a place that never has, so this can never say "0
   *      drop-ins hosted here";
   *   3. else, only when the count is a KNOWN zero, the honest invitation;
   *   4. else nothing — a null count with no activity is the honest unknown, and
   *      a fabricated zero is exactly what this priority exists to prevent.
   *
   * The quote line (the newest review's text) renders separately under the
   * title/rating row; it never replaces this line.
   */
  const plannedCopy =
    row.upcomingCount !== null && row.upcomingCount > 0
      ? row.upcomingCount === 1
        ? '1 drop-in planned here'
        : `${row.upcomingCount} drop-ins planned here`
      : null
  const proofLine = dropInProofLine(proof, nowIso ?? new Date().toISOString())
  const inviteLine =
    row.upcomingCount === 0 && proofLine === null
      ? 'Be the first to start a drop-in here today!'
      : null
  /**
   * V27 — the review quote, truncated to ~96 chars on a word boundary (the
   * `reviewQuoteLine` seam). Null when the highlight has no body → nothing
   * extra renders and the title row's existing "No reviews yet" answer stands.
   */
  const quoteLine = highlight === null ? null : reviewQuoteLine(highlight, 96)
  // V24: the rating line — a real VALUE for screen readers ("4.3 out of 5, 12
  // reviews"), never decorative glyphs alone. A null summary (unrated, or the
  // bulk read failed) renders NOTHING — never a 0.0 (the `upcomingCount` rule).
  const ratingSummary = row.ratingSummary

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
    /* V27 — THE SAVE CONTROL IS A SIBLING OF THE CARD LINK, not a button nested
       inside the anchor. A `<button>` inside an `<a>` is invalid HTML, and under
       a synthetic coordinate click (Playwright) the browser can resolve the
       click to the anchor and navigate instead of toggling the save. The link
       still wraps the whole card, so a tap anywhere else navigates; the bookmark
       floats above it at the title row's height. The title row reserves a
       matching 44px spacer so the name never runs under the floating control. */
    <div
      ref={cardRef}
      /* place-photo-crop slice 4: the CARD as one box, named per place. Slice 4's
         acceptance criterion is "the changed place is in the viewport", and the
         only honest way to measure that is a box around the whole card rather
         than around a control inside it. */
      data-testid={`place-card-${row.place.id}`}
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-colors motion-reduce:transition-none hover:bg-slate-50"
    >
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
        className="flex flex-col"
      >
      {/* The picture first — the founder: *"each place should have a picture
          above the title … that will really decide whether or not a parent would
          want to go there."* A real Wikimedia photo when the row has one; the
          per-kind illustration when it does not, or when the URL fails, so the
          slot is never a broken image. */}
      <div className="relative h-36 w-full bg-slate-100">
        {showPhoto ? (
          <img
            src={photoUrl ?? ''}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setPhotoFailedUrl(photoUrl)}
            data-testid={`place-photo-${row.place.id}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <PlaceKindArt kind={row.place.kind} />
        )}
        {/* Commons attribution travels with the card that shows the image, not
            only with the place page. */}
        {showPhoto && photoCredit !== null ? (
          <span className="absolute bottom-1 right-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/90">
            {photoCredit}
          </span>
        ) : null}
        {/* slice 5 — THE REVIEW BADGE, moderator-only. It turns the review pass
            into a visible checklist item on the card where the picture is
            actually seen; a parent never sees it, because a parent never sees
            this picture at all until it is confirmed. */}
        {photoNeedsReview && photoViewer === 'moderator' ? (
          <span
            data-testid={`place-photo-review-${row.place.id}`}
            className="absolute left-2 top-2 rounded bg-amber-100/95 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 shadow-sm"
          >
            review
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5 p-3">
        {/* Title row: the name on the left, the Save bookmark on the right — the
            brief's "Top Line Row: [Place Title] on the left; explicit Bookmark/
            Save actions stacked on the right", and the layout the specs pin
            (the heart shares a row with the name). The stars sit on their own
            line just below, so a rating never competes with the save control for
            the same corner. */}
        <div className="flex items-start justify-between gap-2">
          <span
            data-testid="place-card-name"
            onClick={selectable ? select : undefined}
            className="text-base font-semibold text-slate-900"
          >
            {row.place.name}
          </span>
          {/* Reserves the floating bookmark's 44px so the name never runs under
              it. The control itself is a SIBLING of this link (see the wrapper
              comment) — never nested inside the anchor. */}
          {canFollow ? <span aria-hidden="true" className="h-11 w-11 shrink-0" /> : null}
        </div>
        {/* Rating line, just under the name. "No reviews yet" is stated, never
            left blank and never shown as 0 stars. */}
        {ratingSummary !== null && ratingSummary.hasReviews ? (
          <PlaceStars count={ratingSummary.count} average={ratingSummary.displayAverage} />
        ) : (
          <span className="text-xs text-slate-400">No reviews yet</span>
        )}
        {/* V27: a real parent's words under the rating. The `reviewQuoteLine`
            seam owns truncation + the "Sam R." reduction; the stars are NOT
            repeated here (they sit on the line above). Null renders nothing, so
            "No reviews yet" is never second-guessed. */}
        {quoteLine !== null ? (
          <p
            data-testid="place-review-quote"
            className="line-clamp-2 text-xs italic text-slate-600"
          >
            {quoteLine}
          </p>
        ) : null}
        {/* The prominent logistics row: indoor/outdoor (the rain question),
            distance (how far), and the kind. A real "Open now" chip joins this
            row the day the directory carries public opening hours — it is not
            faked in the meantime. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {openStatus !== null ? (
            <span
              data-testid="place-open-status"
              title={row.place.hours?.display ?? undefined}
              className={
                'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ' +
                (openStatus === 'open'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-500')
              }
            >
              <span
                aria-hidden="true"
                className={openStatus === 'open' ? 'text-emerald-500' : 'text-slate-400'}
              >
                ●
              </span>
              {openStatus === 'open' ? 'Open now' : 'Closed'}
              {openNote !== null ? (
                <span className="font-normal text-slate-400"> · {openNote}</span>
              ) : null}
            </span>
          ) : null}
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            {placeIndoorLabel(row.place)}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            {row.distanceMiles !== null
              ? formatDistanceLabel(row.distanceMiles)
              : 'Distance unknown'}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            {placeKindLabel(row.place.kind)}
          </span>
          {ageFit !== null ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              {ageFit}
            </span>
          ) : null}
        </div>
        <span className="text-xs text-slate-500">{row.place.address}</span>
        {/* V27: the ONE social line, in the priority order computed above —
            planned count, else past activity, else the zero-state invitation,
            else nothing. `upcomingCount === 0` with a proof shows the proof,
            so "be the first" can never appear on a place that has hosted. */}
        {plannedCopy !== null ? (
          <span className="text-xs font-medium text-indigo-700">👥 {plannedCopy}</span>
        ) : proofLine !== null ? (
          <span data-testid="place-dropin-proof" className="text-xs font-medium text-indigo-700">
            {proofLine}
          </span>
        ) : inviteLine !== null ? (
          <span className="text-xs text-slate-500">✨ {inviteLine}</span>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {!selectable ? (
            <button
              type="button"
              data-testid={`row-start-dropin-${row.place.id}`}
              onClick={(e) => startDropIn(e)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors motion-reduce:transition-none hover:bg-indigo-700"
            >
              {/* V30 (founder decision, over impeccable live 2026-10-05): the
                  app's OWN mark — the slide under a tree — replaces 🚀, which he
                  read as a category reflex that does not mean "start a drop-in".
                  `mono` draws it in currentColor, so it is white on the action
                  fill like the label beside it. The emoji was also an extra word
                  in the accessible name ("rocket, Start a drop-in"). */}
              <DropInMark variant="mono" className="h-4 w-4 shrink-0" />
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
              className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors motion-reduce:transition-none hover:bg-slate-50"
            >
              🗺️ {learnMore.kind === 'website' ? 'Visit website' : 'Find it on the map'}
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

      {/* v30-8 — the moderator's photo control, a SIBLING of the link like the
          save control below (a button inside an anchor is invalid HTML, and
          under a synthetic click the browser can resolve the tap to the link and
          navigate away instead). It floats over the picture's top-right corner,
          the corner the credit chip does not use, and it is rendered ONLY when
          the host said the viewer is a moderator. */}
      {onEditPhoto !== undefined ? (
        <button
          type="button"
          data-testid={`place-edit-photo-${row.place.id}`}
          aria-label={`Edit the photo for ${row.place.name}`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onEditPhoto()
          }}
          className="absolute right-2 top-2 inline-flex min-h-11 items-center rounded-full border border-slate-300 bg-white/95 px-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition-colors motion-reduce:transition-none hover:bg-white focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          Edit photo
        </button>
      ) : null}

      {/* The save control, a SIBLING of the link (never nested in the anchor),
          floating at the title row's height — 9rem photo banner + 0.75rem card
          padding, minus the old `-mt-1` nudge. */}
      {canFollow ? (
        <button
          type="button"
          data-testid={`place-heart-${row.place.id}`}
          aria-pressed={followed}
          aria-label={followed ? `Saved ${row.place.name} — tap to unsave` : `Save ${row.place.name}`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onToggleFollow(row.place.id)
          }}
          className="absolute right-2 top-[9.5rem] flex min-h-11 min-w-11 items-center justify-center rounded-full outline-none transition-colors motion-reduce:transition-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          {/* The pressed state is conveyed by MORE THAN colour: the bookmark
              glyph fills when saved (stroked otherwise) AND the accessible name
              flips Save → Saved. The glyph is decorative (aria-hidden). */}
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`h-6 w-6 ${followed ? 'text-indigo-600' : 'text-slate-400'}`}
            fill={followed ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={NAV_ICONS.bookmark} />
          </svg>
        </button>
      ) : null}
    </div>
  )
}

