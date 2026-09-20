/**
 * V8 ticket 07: the PLACES seams — the pure, unit-testable decisions behind
 * the directory (see places.test.ts). No React, no Supabase: the pages and
 * db.ts call these, exactly like feed.ts's radius seams.
 *
 * Why a new module instead of more feed.ts: feed.ts owns the drop-in FEED
 * (ordering, day grouping, radius filtering). This owns the place ENTITY —
 * matching, filtering, distance, and labels over a directory row. The one
 * thing they share is the distance math (feed.haversineMiles), which is
 * imported rather than reimplemented.
 */
import { coordNumber, haversineMiles, placeDistanceMiles, statedAgeRangeLine } from './feed'
import type { ZipCoords } from './feed'
import type { Place, PlaceKind } from './types'

/**
 * The distance seams live in feed.ts, next to the haversine math they use and
 * next to filterFeed — the one caller that must EXCLUDE on a null distance
 * while the directory keeps the place. They are re-exported here so a place
 * consumer has one import site (and so places.ts -> feed.ts stays the only
 * direction of that dependency: no cycle).
 */
export { coordNumber, placeDistanceMiles, postDistanceMiles } from './feed'

/**
 * The TRAILING 5-digit zip embedded in a stored address ("5614 22nd Ave.
 * N.W., Seattle, WA 98107" -> "98107"), or null. The `places` table has no zip
 * column — the zip, when present at all, lives inside the address string —
 * so this is the only way a place's zip reaches the gazetteer (V12 t05).
 *
 * The zip is the address's LAST 5-digit run, not its first: a 5-digit
 * NON-zip token (a 10000+ street number, a suite number) can precede the
 * zip, and taking the first would key the gazetteer to the wrong city —
 * 0029's header rule says never a fake pin.
 */
export function zipFromAddress(address: string | null | undefined): string | null {
  if (address === null || address === undefined) return null
  const runs = address.match(/\b\d{5}\b/g)
  if (runs === null) return null
  // .at(-1) is `string | undefined` by type even though a non-null match
  // guarantees a hit; `?? null` maps the (impossible) miss back to null.
  return runs.at(-1) ?? null
}

/**
 * A place's map coordinates (V12 t05): the place's OWN lat/lng first (the
 * 0029 columns, coerced — PostgREST returns numerics as strings at runtime,
 * which is what coordNumber is for), else the gazetteer's coordinates for the
 * zip embedded in the address (the 0012 fallback), else null.
 *
 * The null is 0029's header rule made concrete: a NULL coordinate means
 * UNKNOWN — the map renders NOTHING rather than a fake pin, and never a
 * 404-tile-flooding default view. No browser location access anywhere: every
 * coordinate in this chain is stored in the database.
 */
export function resolveMapCoords(
  place: { lat?: number | string | null; lng?: number | string | null; address?: string | null },
  zipCoords: ReadonlyMap<string, ZipCoords> | null,
): { lat: number; lng: number } | null {
  const lat = coordNumber(place.lat)
  const lng = coordNumber(place.lng)
  if (lat !== null && lng !== null) return { lat, lng }
  const zip = zipFromAddress(place.address)
  if (zip === null || zipCoords === null) return null
  const found = zipCoords.get(zip)
  return found === undefined ? null : { lat: found.lat, lng: found.lng }
}

/**
 * The place kinds the schema allows (the 0029 CHECK constraint, verbatim —
 * the DB is the backstop, this is the app's mirror).
 */
export const PLACE_KINDS = [
  'park',
  'playground',
  'indoor_play',
  'museum',
  'pool',
  'splash_pad',
  'library',
  'beach',
  'trail',
  'other',
] as const

/** The human label for a place kind (the place page + the list rows). */
export function placeKindLabel(kind: PlaceKind | string): string {
  switch (kind) {
    case 'park':
      return 'Park'
    case 'playground':
      return 'Playground'
    case 'indoor_play':
      return 'Indoor play'
    case 'museum':
      return 'Museum'
    case 'pool':
      return 'Pool'
    case 'splash_pad':
      return 'Splash pad'
    case 'library':
      return 'Library'
    case 'beach':
      return 'Beach'
    case 'trail':
      return 'Trail'
    default:
      return 'Place'
  }
}

/** "Indoor" / "Outdoor" — the place page's and the filter's one word. */
export function placeIndoorLabel(place: { indoor: boolean }): string {
  return place.indoor ? 'Indoor' : 'Outdoor'
}

/** `/place/:id` — the one place path builder (links never hand-roll it). */
export function placePath(placeId: string): string {
  return `/place/${encodeURIComponent(placeId)}`
}

/**
 * The `place_id` insert key — present ONLY when the parent actually picked a
 * place (the `seriesIdField` pattern, V8 ticket 06; the 0021 address lesson
 * before it).
 *
 * Why the spread and not `place_id: input.placeId ?? null`: pre-0030-apply the
 * column does not exist, and a payload that always carries the key would make
 * EVERY insert fail with 42703 — including the free-text posts ("Somewhere
 * else") that are the whole existing corpus, and including the weekly-series
 * insert that today's live suite exercises. Omitted key = the missing column
 * is never touched, so every pre-0030 path stays byte-identical.
 */
export function placeIdField(placeId?: string | null): { place_id?: string } {
  if (typeof placeId !== 'string' || placeId === '') return {}
  return { place_id: placeId }
}

/**
 * The place a piece of FREE TEXT names, by EXACT name (case- and
 * whitespace-insensitive) — or null.
 *
 * Where this is used and why it is exact rather than fuzzy: the "Recent places"
 * chips and a duplicate prefill both hand /new a place STRING that was typed on
 * an earlier post, long before the directory existed. Those strings are either
 * a directory name already or they are not, and this is the only rule that can
 * decide it without inventing a link. Fuzzy matching here would silently attach
 * "Green Lake playground, near the boathouse" to some other park, which is
 * exactly the failure the seed's human check exists to prevent — so a
 * non-match keeps place_id NULL and the post stays free text (fully supported).
 * The typed text is NEVER rewritten; only the id is attached.
 */
export function resolvePlaceByName(
  place: string | null | undefined,
  places: readonly Place[],
): Place | null {
  const wanted = (place ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (wanted === '') return null
  return (
    places.find((candidate) => candidate.name.replace(/\s+/g, ' ').trim().toLowerCase() === wanted) ??
    null
  )
}

/**
 * The /new (and /browse) place matcher — case-insensitive, prefix matches
 * rank above substring matches, NO fuzzy library (pinned).
 *
 * Ranks, in order: 0 = the NAME starts with the query; 1 = a WORD in the name
 * starts with it ("lake" finds "Green Lake Park"); 2 = the name contains it
 * anywhere; 3 = only the ADDRESS contains it (so a parent who types a street
 * still finds the playground on it). Ties break alphabetically by name, then
 * by id, so the order is STABLE — the same query over the same rows never
 * reshuffles between renders.
 *
 * An empty or whitespace-only query matches NOTHING (returns []): "nothing is
 * typed, nothing is matched" is the caller's decision to render, and a matcher
 * that silently returned the whole directory capped at `limit` would be a
 * different feature wearing this one's name. A non-positive `limit` returns [].
 */
export function matchPlaces(query: string, places: readonly Place[], limit: number): Place[] {
  const needle = query.trim().toLowerCase()
  if (needle === '' || limit <= 0) return []
  const scored: Array<{ rank: number; place: Place }> = []
  for (const place of places) {
    const name = place.name.toLowerCase()
    const address = (place.address ?? '').toLowerCase()
    let rank: number
    if (name.startsWith(needle)) {
      rank = 0
    } else if (name.split(/\s+/).some((word) => word.startsWith(needle))) {
      rank = 1
    } else if (name.includes(needle)) {
      rank = 2
    } else if (address.includes(needle)) {
      rank = 3
    } else {
      continue
    }
    scored.push({ rank, place })
  }
  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    const byName = a.place.name.localeCompare(b.place.name)
    if (byName !== 0) return byName
    return a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0
  })
  return scored.slice(0, limit).map((entry) => entry.place)
}

/** How many suggestions the /new autocomplete shows (ticket 07 pin). */
export const PLACE_SUGGESTION_LIMIT = 6

/**
 * How many rows the picker's BROWSE list shows (V9 ticket 01). Deliberately
 * larger than PLACE_SUGGESTION_LIMIT: browsing is "show me the directory",
 * typing is "find this one", and 239 rows rendered inline on a phone would
 * bury the rest of the form. The full directory with its filters is /browse
 * (V8 ticket 07) — this list is the shortcut beside the field.
 */
export const PLACE_BROWSE_LIMIT = 8

/**
 * The /new place picker's label (V9 ticket 01). The ticket's words, verbatim:
 * the field used to read as a plain text box, so nobody discovered that one
 * tap fills place + address. It is now the first field AND it says what it is.
 */
export const PLACE_PICKER_LABEL = 'Where? — pick a place'

/** The visible affordance beside the field that opens the directory list. */
export const BROWSE_PLACES_LABEL = 'Browse places'

/**
 * The picker's text with its ALIAS removed: a single leading `@` is a gesture
 * ("open the picker"), never part of a place name, so it is stripped here and
 * trimmed. This is the ONE rule, used in three places that must agree:
 *
 *  1. MATCHING — what the typed text means for the directory, and what a bare
 *     `@` means (the empty query → the browse list).
 *  2. THE TITLE SEED — /new's "Playdate at <place>" default (V8 ticket 01).
 *     Without this, the most natural use of the alias (type `@`, pick from the
 *     list) seeded the title "Playdate at @" and — because the seed never
 *     overwrites — POSTED it. Found by e2e/post-location, fixed here: the
 *     alias is not text, so it cannot reach a title.
 *  3. THE SUBMITTED PLACE — a parent who types `@` and picks nothing has
 *     typed no place at all, so the validator asks for one instead of
 *     accepting the bare character.
 *
 * What is NOT rewritten: the FIELD's text while the parent types (the
 * resolvePlaceByName pin — the app never moves text under a finger). The
 * alias only disappears from the values the app derives from it.
 */
export function stripPlaceAlias(raw: string): string {
  const trimmed = raw.trim()
  const withoutAlias = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
  return withoutAlias.trim()
}

/** True when the field's text starts with the `@` picker alias. */
export function usesPlaceAlias(raw: string): boolean {
  return raw.trim().startsWith('@')
}

/**
 * What PICKING a place writes into the /new form — the ticket-01 one-tap rule,
 * as a pure seam so a unit test holds it rather than a React page's handler:
 * the place's name, its address, and the neighbourhood FORM VALUE.
 *
 * THE FORM VALUE, not the database's answer: the form's "no neighbourhood" is
 * `''` (the shape's own rule — see feed.PlaydateFormValues), so a place with
 * none yields `''`, not null.
 *
 * THE PRECEDENCE IS IN THE SIGNATURE, deliberately: this takes ONLY the place.
 * A picked place REPLACES the form's neighbourhood — including replacing it
 * with nothing — so there is no "previous value" it could fall back to.
 *
 * That is a fix, not a style choice (review cycle 1, F1): an earlier version
 * took the place's neighbourhood `?? prev.neighborhoodId`, and on /new that
 * previous value can be a REAL id the parent cannot see. A "Recent places" chip
 * (V8 ticket 01) writes the remembered post's neighbourhood into the form
 * (`applyRecentPlace`), and /new renders NO neighbourhood field (showNeighborhood
 * = false), so tapping a chip for an older post and then picking a directory
 * place — whose neighbourhood is NULL for every one of the 239 seeded rows —
 * kept the chip's id and wrote it. The post then carried the OLD place's
 * neighbourhood next to the NEW place: invisible to the parent, and wrong in the
 * data. With the previous value unreachable, that state cannot be expressed.
 *
 * What this does NOT do: invent a fallback (no "nearest neighbourhood", no
 * host-zip guess). The directory is the only authority on which neighbourhood a
 * place is in, and where it says nothing the honest answer is nothing.
 */
export function placePickPatch(place: Place): {
  place: string
  address: string
  neighborhoodId: string
} {
  return {
    place: place.name,
    // The directory's address is NOT NULL (0029:128 — the seed drops any row
    // without one), so this is the row's street verbatim: no '' fallback is
    // needed and none is invented.
    address: place.address,
    neighborhoodId: place.neighborhood_id ?? '',
  }
}

/**
 * V15 ticket 04: the external URL for a place (the "Learn more" link in the
 * marker panel and the browse list rows). Places have no canonical URL column,
 * so one is derived: an OpenStreetMap search URL for the place's name + city
 * (Seattle — the city the app serves). The caller renders it as a new-tab link
 * (`target="_blank" rel="noopener"`); when this returns null the caller shows
 * the place's details inline instead of a broken link.
 *
 * Returns null only when the name is empty or whitespace-only (defensive — a
 * place without a name cannot be searched anywhere).
 */
export function placeExternalUrl(place: Pick<Place, 'name'>): string | null {
  const name = place.name.trim()
  if (name === '') return null
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(name)},+Seattle`
}

/**
 * The directory, A→Z, capped — the BROWSE list. Deterministic (name, then id,
 * the matchPlaces tiebreak) so the same directory never reshuffles between
 * renders, and NOT a ranking: browsing shows the alphabet, not a guess at
 * relevance. A non-positive limit returns [] (matchPlaces' contract).
 */
export function browsePlaceList(places: readonly Place[], limit: number): Place[] {
  if (limit <= 0) return []
  return [...places]
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name)
      if (byName !== 0) return byName
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    .slice(0, limit)
}

/**
 * What the picker's inline list SHOWS (V9 ticket 01) — the one decision both
 * the typed path and the "Browse places" button funnel through.
 *
 * - a query (after the `@` alias is stripped) → matchPlaces' ranked matches,
 *   exactly as before this ticket.
 * - no query + `browsing` (the Browse button, or a bare `@`) → the directory
 *   itself, A→Z, capped. Without this a bare `@` would render an empty list,
 *   which is not an alias for anything.
 * - no query + not browsing → [] : "nothing typed, nothing matched" stays the
 *   caller's decision to render (and the list stays closed).
 */
export function placePickerMatches(
  raw: string,
  places: readonly Place[],
  limit: number,
  browsing: boolean,
): Place[] {
  const query = stripPlaceAlias(raw)
  if (query !== '') return matchPlaces(query, places, limit)
  return browsing ? browsePlaceList(places, limit) : []
}

/**
 * The "Somewhere else" row's identity in the /new suggestion list: picking it
 * means FREE TEXT — the typed place stays as-is and place_id stays null (the
 * pinned escape hatch; the app must never lock a parent out of meeting at a
 * place the directory does not know).
 */
export const SOMEWHERE_ELSE_LABEL = 'Somewhere else'

/**
 * The place page's age line: "Best for ages 2–5", "Best for ages 5 and up",
 * "Best for ages 3 and under", or null when the data says nothing (the render
 * omits the line — an empty "Best for ages" is not a state).
 *
 * V9 ticket 05: this is now `'Best for ' + feed.statedAgeRangeLine` — the SAME
 * seam a drop-in's own `age_min` / `age_max` pair goes through (the /new "Ages
 * (optional)" chips). The two rows carry the identical shape, so they must
 * carry the identical words: before this, a one-sided band read "5 and up" here
 * and "age 5" on a card, i.e. two spellings of one fact. The output is
 * unchanged, byte for byte (its unit tests below were not touched), and the
 * place page's copy keeps its own "Best for " prefix.
 */
export function placeAgeFitLabel(place: {
  age_min: number | null
  age_max: number | null
}): string | null {
  const range = statedAgeRangeLine(place.age_min, place.age_max)
  return range === null ? null : `Best for ${range}`
}

/**
 * "N upcoming" for a place row — the count of upcoming drop-ins AT that place.
 *
 * Pluralized honestly: 1 is "1 upcoming", 0 is "Nothing planned yet" (a
 * "0 upcoming" chip reads as a bug, and the zero state is information — this
 * place is empty, be the first). `count` null means the count is UNKNOWN (the
 * count query failed, e.g. pre-0030-apply when playdates.place_id does not
 * exist yet): the caller renders NOTHING rather than inventing a zero.
 */
export function placeUpcomingLabel(count: number | null): string | null {
  if (count === null) return null
  if (count === 0) return 'Nothing planned yet'
  return count === 1 ? '1 upcoming' : `${count} upcoming`
}

/**
 * Upcoming drop-ins per place, for the browse list's "N upcoming" chips.
 * Rows with no place_id are skipped (a free-text place is not in the
 * directory, so it counts toward nothing).
 */
export function upcomingCountByPlace(
  posts: ReadonlyArray<{ place_id?: string | null }>,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const post of posts) {
    const placeId = post.place_id
    if (placeId === null || placeId === undefined || placeId === '') continue
    counts.set(placeId, (counts.get(placeId) ?? 0) + 1)
  }
  return counts
}

/** One browse row: the place + the distance the list sorted and filtered on. */
export interface PlaceListRow {
  place: Place
  /** Null = unknown (no coordinates, no home zip) — sorted last, never hidden. */
  distanceMiles: number | null
  /** Upcoming drop-ins here; null = the count could not be read. */
  upcomingCount: number | null
}

/**
 * The viewer's place filters (the browse screen's controls). Every one of them
 * is OPTIONAL and its "off" value is the one that excludes nothing, so the
 * unfiltered directory is the default state and each control only ever narrows
 * what the parent asked to narrow.
 */
export interface PlaceFilters {
  /** The search box; '' = no search (the whole directory, not an empty list). */
  query: string
  /** null = both kinds; true = indoor only; false = outdoor only. */
  indoor: boolean | null
  /**
   * The distance filter's ceiling in miles, or null for "any distance".
   * Defaulted by the caller to the viewer's radius (the app's discovery
   * model); a place with UNKNOWN distance is kept — see browsePlaces.
   */
  maxMiles: number | null
}

/**
 * The browse list's whole decision, pure + unit-tested: filter, then search,
 * then sort — so BrowsePage is a thin call site and the "why is that place
 * missing" question has exactly one answer in one place.
 *
 * Order of operations, each with its reason:
 * 1. DISTANCE (from the viewer's home zip to the PLACE's coordinates — the
 *    ticket's filter). A place with unknown distance is KEPT even when a
 *    ceiling is set: null is unknown, and an unknown never excludes.
 *    Only a measured, beyond-ceiling distance hides.
 * 2. INDOOR/OUTDOOR, when the parent picked one.
 * 3. SEARCH last, over what survived: the result is what the parent is looking
 *    at, so search must never resurrect a place a filter just excluded.
 *
 * SORT: nearest first, then by name. Unknown-distance places sort LAST (they
 * are still shown, above) rather than first — "we don't know how far this is"
 * belongs at the end of a distance-ordered list, not the top. Ties (and the
 * unknown block) break alphabetically, so the order is stable across renders.
 */
export function browsePlaces(
  places: readonly Place[],
  filters: PlaceFilters,
  viewer: { homeZip: string | null },
  zipCoords: ReadonlyMap<string, ZipCoords>,
  upcoming: Map<string, number> | null,
): PlaceListRow[] {
  const rows: PlaceListRow[] = []
  for (const place of places) {
    const distanceMiles = placeDistanceMiles(place, viewer, zipCoords)
    if (filters.maxMiles !== null && distanceMiles !== null && distanceMiles > filters.maxMiles) {
      continue
    }
    if (filters.indoor !== null && place.indoor !== filters.indoor) continue
    rows.push({
      place,
      distanceMiles,
      upcomingCount: upcoming === null ? null : (upcoming.get(place.id) ?? 0),
    })
  }

  const searched =
    filters.query.trim() === ''
      ? rows
      : (() => {
          const ranked = matchPlaces(
            filters.query,
            rows.map((row) => row.place),
            rows.length,
          )
          const byId = new Map(rows.map((row) => [row.place.id, row]))
          return ranked.map((place) => byId.get(place.id)).filter((row): row is PlaceListRow =>
            row !== undefined,
          )
        })()

  // Search already ordered by relevance; distance ordering only applies when
  // there is no query (a parent who searched wants the match, not the radius).
  if (filters.query.trim() !== '') return searched

  return [...searched].sort((a, b) => {
    if (a.distanceMiles === null && b.distanceMiles !== null) return 1
    if (a.distanceMiles !== null && b.distanceMiles === null) return -1
    if (a.distanceMiles !== null && b.distanceMiles !== null) {
      const byDistance = a.distanceMiles - b.distanceMiles
      if (byDistance !== 0) return byDistance
    }
    return a.place.name.localeCompare(b.place.name)
  })
}

/**
 * The place page's "upcoming drop-ins here" ordering: soonest first. A thin,
 * named seam so the page (and its test) never hand-rolls the comparison, and
 * so the radius-independent promise is explicit — this list is NOT filtered by
 * distance, because the parent asked about THIS place.
 */
export function sortPlaceUpcoming<T extends { starts_at: string }>(posts: readonly T[]): T[] {
  return [...posts].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
}

/**
 * V13 ticket 05 (A7): how many place rows the /browse list shows before the
 * overflow affordance takes over.
 *
 * The raw unbroken long-list was the complaint: 239 seeded rows rendered
 * inline on a phone bury everything below them. A short lead (the closest
 * places, which are what "nearby" means) plus a single "See all N places"
 * door keeps every row reachable while the screen stays scannable. Mobile-
 * first (max-w-md shell), no new dependencies — the cap is a number, not a
 * library.
 */
export const BROWSE_LIST_LEAD_LIMIT = 6

/** One kind group in the browse list: the kind label + that kind's rows. */
export interface PlaceKindGroup {
  kind: string
  label: string
  rows: PlaceListRow[]
}

/**
 * V13 ticket 05 (A7): group the browse rows by KIND, for the grouped/chips
 * presentation. Pure + unit-tested (no React, no DB — the house pattern).
 *
 * Group order: kinds in their schema order (PLACE_KINDS, the 0029 CHECK
 * constraint's mirror), with an unknown-kind bucket last; within a group the
 * caller's row order is kept (distance-sorted when there is no search query,
 * relevance-ordered when there is — grouping must never re-rank). An empty
 * input yields [] (the caller renders nothing, exactly as today).
 */
export function groupPlacesByKind(rows: readonly PlaceListRow[]): PlaceKindGroup[] {
  const groups = new Map<string, PlaceKindGroup>()
  for (const row of rows) {
    const kind = row.place.kind
    const label = placeKindLabel(kind)
    let group = groups.get(kind)
    if (group === undefined) {
      group = { kind, label, rows: [] }
      groups.set(kind, group)
    }
    group.rows.push(row)
  }
  const ordered = PLACE_KINDS.filter((kind) => groups.has(kind)).map(
    (kind) => groups.get(kind)!,
  )
  // Unknown kinds (a future CHECK value the app does not know yet) keep their
  // own bucket, alphabetized after the known kinds — never dropped.
  const unknownKinds = [...groups.keys()]
    .filter((kind) => !(PLACE_KINDS as readonly string[]).includes(kind))
    .sort()
  for (const kind of unknownKinds) {
    ordered.push(groups.get(kind)!)
  }
  return ordered
}

/**
 * V15 ticket 03: how the browse list orders its rows. 'alpha' is the default
 * (the founder's A–Z); 'distance' reorders by closeness; 'newest' by creation
 * date. Pure + unit-tested (no React, no DB).
 */
export type SortMode = 'alpha' | 'distance' | 'newest'

/**
 * V15 ticket 03: sort browse rows by the chosen mode. Returns a NEW array —
 * the input is never mutated.
 *
 * - 'alpha': A→Z by place name (localeCompare), ties broken by id so the
 *   order is stable across renders (the matchPlaces tiebreak discipline).
 * - 'distance': closest first. When `center` is provided, each row's distance
 *   is measured from that center to the place's OWN coordinates (haversine,
 *   the same math as filterPlacesByRadius) — the geocoded "Set location" path
 *   has no per-row distanceMiles. Otherwise the row's own distanceMiles is
 *   used (the home-zip path). Unknown distances (null / unresolvable) sort
 *   LAST — "we don't know how far this is" belongs at the end of a
 *   distance-ordered list, never the top. Ties break alphabetically.
 * - 'newest': most recent created_at first (descending); missing dates last,
 *   then alphabetical within the unknown block.
 */
export function sortPlaces(
  rows: readonly PlaceListRow[],
  mode: SortMode,
  center?: { lat: number; lng: number },
): PlaceListRow[] {
  const copy = [...rows]
  switch (mode) {
    case 'alpha':
      copy.sort((a, b) => {
        const byName = a.place.name.localeCompare(b.place.name)
        if (byName !== 0) return byName
        return a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0
      })
      return copy
    case 'distance': {
      // Per-row key: measured-from-center when a center is given, else the
      // row's stored distanceMiles. null = unknown → sorts last.
      const key = (row: PlaceListRow): number | null => {
        if (center !== undefined) {
          const lat = row.place.lat
          const lng = row.place.lng
          if (lat === null || lng === null) return null
          return haversineMiles(center, { lat, lng })
        }
        return row.distanceMiles
      }
      copy.sort((a, b) => {
        const da = key(a)
        const db = key(b)
        if (da === null && db !== null) return 1
        if (da !== null && db === null) return -1
        if (da !== null && db !== null && da !== db) return da - db
        const byName = a.place.name.localeCompare(b.place.name)
        if (byName !== 0) return byName
        return a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0
      })
      return copy
    }
    case 'newest': {
      const time = (row: PlaceListRow): number | null => {
        const raw = row.place.created_at
        if (raw === undefined || raw === null || raw === '') return null
        const parsed = Date.parse(raw)
        return Number.isNaN(parsed) ? null : parsed
      }
      copy.sort((a, b) => {
        const ta = time(a)
        const tb = time(b)
        if (ta === null && tb !== null) return 1
        if (ta !== null && tb === null) return -1
        if (ta !== null && tb !== null && ta !== tb) return tb - ta
        const byName = a.place.name.localeCompare(b.place.name)
        if (byName !== 0) return byName
        return a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0
      })
      return copy
    }
  }
}

/**
 * V15 ticket 02: the browse map rework's pure distance seam — the haversine
 * miles between two lat/lng points. A thin alias over feed.haversineMiles so
 * a place consumer has one import site (the same re-export discipline as
 * placeDistanceMiles above). Pure + unit-tested.
 */
export function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversineMiles(a, b)
}

/**
 * V15 ticket 02: keep only the places whose coordinates fall within
 * `radiusMiles` of `center` (boundary inclusive — the app's existing radius
 * predicate, withinRadius). A place with UNKNOWN coordinates (lat/lng null or
 * unresolvable) is EXCLUDED here: this is a radius filter, not the directory's
 * "unknown never hides" rule — the caller (BrowsePage's "See places") has
 * chosen a specific center and radius, and a place we cannot measure against
 * it cannot be shown as inside it.
 *
 * Places are resolved through resolveMapCoords (their own lat/lng first, else
 * the gazetteer zip embedded in the address) — the same seam the map renders
 * from, so the list and the circle always agree. Pure + unit-tested.
 */
export function filterPlacesByRadius(
  places: readonly Place[],
  center: { lat: number; lng: number },
  radiusMiles: number,
  zipCoords?: ReadonlyMap<string, ZipCoords> | null,
): Place[] {
  if (radiusMiles <= 0) return []
  const kept: Place[] = []
  for (const place of places) {
    const coords = resolveMapCoords(place, zipCoords ?? null)
    if (coords === null) continue
    const distance = distanceMiles(center, coords)
    if (distance <= radiusMiles) kept.push(place)
  }
  return kept
}
