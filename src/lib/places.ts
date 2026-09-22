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
 * V19 t02 — the FEED's map pins: one per drop-in that resolves to a coordinate.
 *
 * The founder's ask was a map on the posts screen showing "drop-ins CLOSEST to
 * you". This is the pure half of that: given the feed's posts, return the points
 * the map should draw.
 *
 * THREE THINGS THIS DELIBERATELY DOES, each of them a decision rather than an
 * implementation detail:
 *
 * 1. **A post with no `place_id` gets NO pin.** Free-text posts ("Somewhere
 *    else") carry `place_coords: null` — they name a place, not a location — and
 *    the map must not invent one. This is the same `unplaced` distinction
 *    `/browse` already draws, and it matters more here: a map pin is a spatial
 *    claim, and a made-up one sends a parent to the wrong park.
 *
 * 2. **Duplicate coordinates collapse to ONE pin.** The feed can hold several
 *    drop-ins at the same place (a morning and an afternoon session at Green
 *    Lake). Drawing two pins on the identical pixel makes an unclickable pile
 *    and reads as clutter, so they collapse. The LIST still shows both — this
 *    only de-duplicates the map's dots.
 *
 * 3. **Order is preserved from the input.** The caller passes posts in its own
 *    display order, so the pins come back in that order; nothing here re-sorts,
 *    because a map's draw order is not a ranking.
 *
 * The count returned is therefore "places with drop-ins", not "drop-ins" —
 * which is what a pin means and what the caller's label should say.
 */
export function feedMapPins(
  posts: ReadonlyArray<{
    place_coords?: { lat?: number | string | null; lng?: number | string | null } | null
  }>,
  zipCoords: ReadonlyMap<string, ZipCoords> | null = null,
): Array<{ lat: number; lng: number }> {
  const seen = new Set<string>()
  const pins: Array<{ lat: number; lng: number }> = []
  for (const post of posts) {
    const coords = resolveMapCoords(post.place_coords ?? {}, zipCoords)
    if (coords === null) continue
    // Key on the exact coordinate pair, so two posts at the same place collapse
    // and two posts at genuinely different spots both survive.
    const key = `${coords.lat},${coords.lng}`
    if (seen.has(key)) continue
    seen.add(key)
    pins.push(coords)
  }
  return pins
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
 * V18 t04: the credit line to render over a place photo, or null when there is
 * nothing to credit.
 *
 * THIS IS A LICENCE-COMPLIANCE FUNCTION, not decoration. The photos V18 sources
 * from Wikimedia Commons are CC BY / CC BY-SA / CC0 / public domain, and the
 * first two REQUIRE attribution as a condition of use. So the credit is not
 * optional polish that can be dropped when the card looks cramped.
 *
 * It is a seam rather than an inline expression because the render must decide
 * NOTHING (the build law) and because three separate facts have to agree:
 *
 *   1. **No photo ⇒ no credit.** The illustration fallback is the app's own
 *      drawing; crediting its author to Commons would be a lie.
 *   2. **A photo with no stored attribution ⇒ null**, NOT an empty string and
 *      not a placeholder. The backfill writes the attribution line itself
 *      (`buildAttribution`, `commons.ts`), so a missing one means a row was
 *      written outside the pipeline — the render should show nothing rather
 *      than invent a credit.
 *   3. **Whitespace-only counts as missing**, because a card pinned to a corner
 *      label should not reserve space for a string that renders as blank.
 *
 * The `photo_url` check mirrors `PlacePhotoSlot`'s own branch condition
 * exactly (`!== null && !== ''`), so the credit can never appear on a slot that
 * took the illustration branch. Those two conditions are pinned together by a
 * unit test rather than by hope.
 */
export function photoCreditLine(place: Place): string | null {
  const hasPhoto = place.photo_url !== null && place.photo_url !== ''
  if (!hasPhoto) return null
  const credit = (place.photo_attribution ?? '').trim()
  return credit === '' ? null : credit
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

/** The circle a map should frame itself on: a center and a radius in miles. */
export interface FramingCircle {
  center: { lat: number; lng: number }
  radiusMiles: number
}

/**
 * V16 t07 item 2: WHICH circle frames the /browse overview map. A pure decision
 * so the component renders what it is given and the page never encodes it.
 *
 * The map is framed by the SEARCH RADIUS, never by the bounds of every place
 * (that fit zoomed out to the whole city and collapsed every marker into an
 * overlapping blob). A geocoded "Set location" center wins when present — that
 * is the center the viewer explicitly chose. Otherwise the viewer's HOME PIN
 * frames the map at their stored radius, so the circle effect stays the sole
 * framing authority in the common no-geocode case. With neither there is no
 * circle to frame and the caller falls back to its mount view.
 *
 * `radiusMiles` <= 0 yields null: a zero-radius circle has no extent to fit and
 * leaflet's fitBounds on a degenerate box zooms to street level.
 *
 * ---
 *
 * V17 t04: the frame also accounts for the SEARCHED subset — `focusPoints`, the
 * coordinates of the FILTERED rows. A parent who typed "pool" wants the camera
 * on the pools, not on the whole radius they happen to live inside.
 *
 * WHERE THIS LINE IS, AND WHY IT IS NOT IN THE COMPONENT. V16 t07 item 2
 * (`93f313b`) DELETED a `fitBounds` over every marker because that fit picks the
 * zoom which fits ALL points — nothing caps how far OUT it may go — so it zoomed
 * to the whole city and collapsed every dot into the blob the founder
 * photographed. That ruling stands; nothing here re-adds a points-fit to
 * `PlaceMap.tsx`. What t04 does instead is give the ONE remaining framing
 * authority (this circle) a second input, so the frame follows the results while
 * staying a circle the radius still governs.
 *
 * THE RADIUS IS A CEILING, NOT A STARTING POINT. The returned radius is
 * `min(radiusMiles, the miles that cover every focus point)`:
 *
 * - points spread wider than the viewer radius -> the radius itself, unchanged;
 *   t04 can never zoom out past it, which is the "never reverts `93f313b`" rule
 *   expressed as arithmetic;
 * - points inside it -> a circle centered on them that just covers them, so a
 *   narrow result set tightens the camera;
 * - absent or EMPTY `focusPoints` -> `{ center, radiusMiles }` verbatim, byte for
 *   byte the pre-t04 return. That identity is the regression guard and is
 *   asserted in `places.test.ts`.
 *
 * A DEGENERATE SUBSET IS NOT A DEGENERATE CIRCLE. One point, or twenty copies of
 * one coordinate, has zero extent — handing Leaflet that circle would zoom to
 * street level (the same failure `radiusMiles <= 0` guards against). So the
 * result radius is floored at `MIN_FOCUS_RADIUS_MILES`: a single match frames a
 * small neighbourhood, never a zero-extent box.
 *
 * The inputs are structural (`{ lat, lng }`), matching the rest of this module —
 * a `PlaceListRow`'s resolved coordinates pass through with no re-projection.
 */
export function framingCircle(input: {
  geocodeCenter: { lat: number; lng: number } | null
  homePin: { lat: number; lng: number } | null
  radiusMiles: number
  /** t04: the SEARCHED subset. Absent/empty = today's behaviour exactly. */
  focusPoints?: ReadonlyArray<{ lat: number; lng: number }>
}): FramingCircle | null {
  const { geocodeCenter, homePin, radiusMiles, focusPoints } = input
  if (!(radiusMiles > 0)) return null

  const base =
    geocodeCenter !== null
      ? { center: geocodeCenter, radiusMiles }
      : homePin !== null
        ? { center: homePin, radiusMiles }
        : null
  if (base === null) return null

  // No searched subset — the pre-t04 return, unchanged. `undefined`, `[]` and an
  // all-unusable array all land here, which is what "falls back to today's
  // radius frame" means for a query with zero placed results.
  if (focusPoints === undefined || focusPoints.length === 0) return base

  const center = focusCenter(focusPoints)
  if (center === null) return base

  /**
   * V19 t01 — THE SEARCH MAY TIGHTEN THE FRAME, NEVER MOVE IT OFF HOME.
   *
   * Found by this slice's own test, and it is a real defect the founder would
   * have seen. `focusCenter` returns the MIDPOINT of the matched points, so a
   * search matching one place 85 miles away returns that place as the centre;
   * the extent around a single point is zero, which floors to
   * `MIN_FOCUS_RADIUS_MILES` (0.5). The old result was therefore a half-mile
   * circle centred on a place 85 miles from home — the home pin vanished off
   * the canvas entirely, which is precisely what D1 forbids ("the map ALWAYS
   * frames tight around home").
   *
   * The rule that fixes it: a search result OUTSIDE the neighbourhood view must
   * not drag the frame to itself. When the matched centre lies beyond the focus
   * radius from the frame's own centre, the search has found something that is
   * not "near me", so the caller keeps the neighbourhood frame and the UI
   * announces the matches instead. Tightening still happens for near matches,
   * which is the behaviour V17 t04 actually wanted.
   *
   * `base.center` is the home pin (or a geocoded centre) — the anchor D1 pins.
   */
  const centerDistance = distanceMiles(base.center, center)
  if (centerDistance > base.radiusMiles) {
    // The matches are outside the neighbourhood view: keep the frame anchored
    // where it was instead of following them.
    return base
  }

  // The tightest circle about `center` that still covers every focus point. The
  // radius can only shrink: `base.radiusMiles` is the ceiling.
  //
  // Non-finite points are skipped. `focusCenter` above already skips them, so
  // this keeps the two halves of the function agreeing about which points count.
  //
  // HONEST SCOPE — this is defence in depth, NOT a live bug fix. A V17 t04
  // review flagged it as a real hole ("`NaN > span` is false, so the frame
  // collapses to the 0.5-mile floor") and I could not reproduce that: traced
  // with the guard REMOVED, a non-finite point anywhere in the list still yields
  // the CORRECT radius, because any later finite point sets `span`, and a list
  // with NO finite point never reaches here at all (`focusCenter` returns null
  // and the caller keeps its radius frame). Recorded so a later reader does not
  // treat this guard as evidence of a defect that was actually present.
  let span = 0
  for (const point of focusPoints) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue
    const miles = distanceMiles(center, point)
    if (miles > span) span = miles
  }
  const fitted = Math.max(span, MIN_FOCUS_RADIUS_MILES)
  // V19 t01: the cap that keeps D1 true. `base.radiusMiles` is now the caller's
  // MAP FOCUS radius (`MAP_FOCUS_RADIUS_MILES`), not the picked list radius, so
  // a search can tighten the frame toward its own results but can NEVER widen it
  // past the neighbourhood view. The `Math.min` is unchanged — what changed is
  // the value the caller puts into `base`, which is precisely the point of
  // splitting the two radii.
  return { center, radiusMiles: Math.min(base.radiusMiles, fitted) }
}

/**
 * The focus points' own center: the midpoint of their lat/lng EXTENT (not the
 * mean), so the covering radius above is genuinely tight and every point is
 * inside it by construction. Returns null when no point carries usable
 * coordinates — the caller then keeps its radius frame rather than framing on
 * `NaN`, which would blank the map.
 */
function focusCenter(
  points: ReadonlyArray<{ lat: number; lng: number }>,
): { lat: number; lng: number } | null {
  let minLat = Number.POSITIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY
  let minLng = Number.POSITIVE_INFINITY
  let maxLng = Number.NEGATIVE_INFINITY
  let usable = 0
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue
    usable += 1
    if (point.lat < minLat) minLat = point.lat
    if (point.lat > maxLat) maxLat = point.lat
    if (point.lng < minLng) minLng = point.lng
    if (point.lng > maxLng) maxLng = point.lng
  }
  if (usable === 0) return null
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }
}

/**
 * The smallest radius a t04 focus frame may collapse to, in miles.
 *
 * Pinned numerically because the alternative is a zero-extent circle: a single
 * matching place (or several at one coordinate) has no extent at all, and
 * Leaflet's `fitBounds` on a degenerate box zooms to street level — the map
 * would frame one doorway instead of a neighbourhood. Half a mile keeps the
 * tightest search at "a few blocks", which is what a parent searching for one
 * place actually wants to see around it.
 */
export const MIN_FOCUS_RADIUS_MILES = 0.5

/**
 * V19 t01 — HOW FAR THE MAP FRAMES, ALWAYS.
 *
 * The founder's ask, in their words: *"I want the map to be zoomed in as close
 * as possible by default, showing the less-than-1-mile view… this is the value
 * added to make this feel like a neighbourhood feel."*
 *
 * This constant is the whole of D1, so it is worth being precise about what it
 * does and does not control:
 *
 *   - It controls THE MAP'S FRAME — the circle the map fits on open.
 *   - It does NOT control the LIST. The picked radius (`radius_miles`, the
 *     1/5/20/35 ladder) still runs `filterPlacesByRadius`, unchanged. Choosing
 *     35 miles shows far more rows; the map still opens on your own blocks.
 *
 * Those two values were THE SAME VALUE before this slice, which is exactly why
 * the map opened on all of Seattle for a parent whose stored radius is 35 (the
 * founder's own, measured). Splitting them is the fix. **Do not re-merge them**
 * — a diff that feeds the picked radius back into the map frame has reverted
 * this slice, and the map would silently widen again.
 *
 * Why 1 mile and not `MIN_FOCUS_RADIUS_MILES` (0.5): half a mile is the floor
 * for a SEARCH-tightened frame — the tightest a single result may be framed at.
 * The default frame is deliberately a little wider than that, because "what is
 * near me" should show a few streets of context, not one block. The two
 * constants have different jobs and must not be collapsed.
 *
 * A search that narrows results still tightens BELOW this (V17 t04's behaviour,
 * via `framingCircle`'s `focusPoints`); this is the ceiling it can never exceed.
 */
export const MAP_FOCUS_RADIUS_MILES = 1

/**
 * V17 t02: which PLACES the caller follows, as a plain id set — what a browse
 * card's heart reads to decide whether it is filled.
 *
 * WHY THIS EXISTS BESIDE `follows.followTargetsFrom`: that seam is shaped
 * around the FOLLOW ROW (`FollowRowLike` -> `{ followeeIds, placeIds }`) and is
 * the right answer for a surface that asks the follow graph about BOTH kinds
 * at once (the feed's met-before line needs the family half). The browse grid
 * asks one narrow question about one kind — "is THIS place hearted?" — and a
 * grid of 239 cards should not carry a two-set aggregate to answer it.
 *
 * (An earlier attempt returned `Map<placeId, followId>` on the theory that the
 * unfollow path needs the row id. It does not: `db.toggleFollowPlace` resolves
 * the row itself via `findFollowRow`, so the value was dead data. A Set is the
 * honest shape.)
 *
 * A row with a null (or absent) `place_id` is a FAMILY follow and is SKIPPED —
 * the exactly-one-target rule in `follows.validateFollowTarget`; a browse card
 * is never a family. Rows with a blank id are skipped too: a row we cannot
 * identify is not a row we should claim to hold.
 *
 * The input type is structural, not `db.FollowRow`: this module imports no
 * Supabase types, so the seam stays callable from a pure test (and a wider row
 * passes through with no re-projection).
 */
export function placeFollowIdSet(
  rows: ReadonlyArray<{ id?: string | null; place_id?: string | null }>,
): Set<string> {
  const followed = new Set<string>()
  for (const row of rows) {
    if (typeof row.id !== 'string' || row.id === '') continue
    const placeId = row.place_id
    if (placeId === null || placeId === undefined || placeId === '') continue
    followed.add(placeId)
  }
  return followed
}
