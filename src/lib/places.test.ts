import { describe, expect, it } from 'vitest'
import {
  browsePlaces,
  browsePlaceList,
  BROWSE_LIST_LEAD_LIMIT,
  coordNumber,
  DATE_WINDOWS,
  DATE_WINDOW_LABELS,
  dateWindowEmptyCopy,
  distanceMiles,
  feedMapPinEvent,
  filterPlacesByRadius,
  feedMapPins,
  pinMoreDropInsLabel,
  soonestFeedPinEvent,
  framingCircle,
  groupPlacesByKind,
  kindEmptyCopy,
  MIN_FOCUS_RADIUS_MILES,
  MAP_FOCUS_RADIUS_MILES,
  matchPlaces,
  placeAgeFitLabel,
  placeDistanceMiles,
  placeIdField,
  placeIndoorLabel,
  placeTrustLine,
  placeInDateWindow,
  placeKindLabel,
  placeKindChips,
  placePath,
  placeDetailsPath,
  placeWebSearchHref,
  PLACE_WEB_SEARCH_LABEL,
  placePickerMatches,
  placePickPatch,
  placeUpcomingLabel,
  placeExternalUrl,
  placeLearnMoreLink,
  placeOutboundLinks,
  photoCreditLine,
  radiusPreviewCircle,
  savedPlacesEmptyCopy,
  zoomForRadius,
  DETAIL_ZOOM_FALLBACK,
  placeFollowIdSet,
  planDirectoryList,
  PLACE_BROWSE_LIMIT,
  PLACE_KIND_CHIP_KINDS,
  PLACE_KIND_MISSING_NOTE,
  PLACE_KINDS,
  PLACE_SUGGESTION_LIMIT,
  resolveMapCoords,
  resolvePlaceByName,
  SOMEWHERE_ELSE_LABEL,
  sortPlaceUpcoming,
  sortPlaces,
  stripPlaceAlias,
  upcomingCountByPlace,
  groupUpcomingStartTimesByPlace,
  usesPlaceAlias,
  zipFromAddress,
} from './places'
import type { FeedMapPin, FeedMapPinEvent, PlaceListRow } from './places'
import type { ReviewSummary } from './reviews'
import { DEFAULT_RADIUS_MILES, cardWhenLabel, formatDayLabel, localDayKey, mapsHref, neighborhoodIdField, RADIUS_MILES_OPTIONS } from './feed'
import type { Place, PlaceKind } from './types'
import type { ZipCoords } from './feed'

/**
 * The V8 ticket 07 place seams. Everything here is pure: no React, no DB.
 *
 * The distances are real geography against the seeded gazetteer's two known
 * zips (98107 West Seattle at 47.66757/-122.37789 and 98007 Bellevue at
 * 47.61392/-122.14378, ~11.5 mi apart), so the radius assertions mean something
 * about the actual city rather than about made-up numbers.
 */
const ZIP_COORDS: Map<string, ZipCoords> = new Map([
  ['98107', { lat: 47.66757, lng: -122.37789 }],
  ['98007', { lat: 47.61392, lng: -122.14378 }],
])
const VIEWER = { homeZip: '98107' }

/** ~2.5 mi from the viewer (the Green Lake area). */
const NEAR = { lat: 47.6805, lng: -122.3267 }
/** ~53 mi from the viewer. */
const FAR = { lat: 46.9, lng: -122.0 }

/**
 * V23 slice 7: the city this app serves, as one number — the latitude the map's
 * Mercator correction is pinned against in the `zoomForRadius` tests. Taken from
 * the seeded 98107 gazetteer entry above rather than typed fresh, so the two
 * cannot drift apart.
 */
const SEATTLE_LAT = 47.66757

function place(overrides: Partial<Place> & { name: string }): Place {
  return {
    id: overrides.name.toLowerCase().replace(/\s+/g, '-'),
    kind: 'playground',
    address: '1 Test St',
    lat: 47.68,
    lng: -122.32,
    indoor: false,
    age_min: null,
    age_max: null,
    notes: null,
    photo_url: null,
    neighborhood_id: null,
    source: 'seattle-parks',
    ...overrides,
  }
}

/** A rated summary fixture (the DB-computed display average + count). */
function rated(count: number, displayAverage: number): ReviewSummary {
  return { count, displayAverage, hasReviews: true }
}

describe('matchPlaces (case-insensitive; prefixes rank above substrings; no fuzzy library)', () => {
  const greenLakePark = place({ name: 'Green Lake Park', address: '7201 East Green Lake Dr N' })
  const greenLakeEast = place({ name: 'Green Lake Park (East)', address: '7201 E Green Lake Drive N' })
  const lakeCity = place({ name: 'Lake City Community Center', address: '12531 28th Ave NE' })
  const alki = place({ name: 'Alki Playground', address: '5817 SW Lander St' })
  const directory = [greenLakePark, greenLakeEast, lakeCity, alki]

  it('is case-insensitive', () => {
    expect(matchPlaces('GREEN LAKE', directory, 10).map((p) => p.name)).toContain('Green Lake Park')
    expect(matchPlaces('green lake', directory, 10).map((p) => p.name)).toContain('Green Lake Park')
  })

  it('ranks a name PREFIX above a substring match', () => {
    // "Lake" starts "Lake City…" (rank 0) but is only inside "Green Lake Park"
    // (rank 2) — the prefix must come first even though it sorts later.
    const names = matchPlaces('lake', directory, 10).map((p) => p.name)
    expect(names[0]).toBe('Lake City Community Center')
    expect(names).toContain('Green Lake Park')
  })

  it('ranks a WORD prefix as a prefix (so "lake" still finds Green Lake Park)', () => {
    const names = matchPlaces('lake', directory, 10).map((p) => p.name)
    expect(names).toContain('Green Lake Park')
    expect(names).toContain('Green Lake Park (East)')
    expect(names).not.toContain('Alki Playground')
  })

  it('ranks name matches above address-only matches', () => {
    const viaAddress = place({ name: 'Seward Park', address: '5900 Lake Washington Blvd' })
    const names = matchPlaces('lake', [...directory, viaAddress], 10).map((p) => p.name)
    expect(names[names.length - 1]).toBe('Seward Park')
  })

  it('finds a place by its street address', () => {
    expect(matchPlaces('5817 SW Lander', directory, 10).map((p) => p.name)).toEqual(['Alki Playground'])
  })

  it('is stable: ties break by name, then id (never reshuffled between renders)', () => {
    const a = place({ name: 'Alki Playground' })
    const b = place({ name: 'Alki Beach' })
    const first = matchPlaces('alki', [a, b], 10).map((p) => p.id)
    const second = matchPlaces('alki', [b, a], 10).map((p) => p.id)
    expect(first).toEqual(second)
    expect(first).toEqual(['alki-beach', 'alki-playground'])
  })

  it('respects the limit', () => {
    expect(matchPlaces('lake', directory, 1)).toHaveLength(1)
  })

  it('matches NOTHING for an empty or whitespace query (or a non-positive limit)', () => {
    expect(matchPlaces('', directory, 10)).toEqual([])
    expect(matchPlaces('   ', directory, 10)).toEqual([])
    expect(matchPlaces('lake', directory, 0)).toEqual([])
  })

  it('matches nothing when the query hits no name and no address', () => {
    expect(matchPlaces('zzzz', directory, 10)).toEqual([])
  })

  it('tolerates a place with an empty address', () => {
    const noAddress = place({ name: 'Crown Hill Park', address: '' })
    expect(matchPlaces('zzzz', [noAddress], 10)).toEqual([])
    expect(matchPlaces('crown', [noAddress], 10).map((p) => p.name)).toEqual(['Crown Hill Park'])
  })

  it('suggests at most PLACE_SUGGESTION_LIMIT for the /new autocomplete', () => {
    const many = Array.from({ length: 20 }, (_, index) => place({ name: `Lake Place ${index}` }))
    expect(matchPlaces('lake', many, PLACE_SUGGESTION_LIMIT)).toHaveLength(PLACE_SUGGESTION_LIMIT)
  })

  it('names the free-text escape row "Somewhere else"', () => {
    expect(SOMEWHERE_ELSE_LABEL).toBe('Somewhere else')
  })
})

describe('resolvePlaceByName (exact match only — a fuzzy link would be an invented place)', () => {
  const directory = [place({ name: 'Green Lake Park' }), place({ name: 'Alki Playground' })]

  it('resolves an exact name, case- and whitespace-insensitively', () => {
    expect(resolvePlaceByName('Green Lake Park', directory)?.name).toBe('Green Lake Park')
    expect(resolvePlaceByName('  green lake   park ', directory)?.name).toBe('Green Lake Park')
  })

  it('resolves NOTHING for a near-miss (the typed text is never rewritten)', () => {
    expect(resolvePlaceByName('Green Lake playground, near the boathouse', directory)).toBeNull()
    expect(resolvePlaceByName('Green Lake', directory)).toBeNull()
    expect(resolvePlaceByName('', directory)).toBeNull()
    expect(resolvePlaceByName(null, directory)).toBeNull()
    expect(resolvePlaceByName(undefined, directory)).toBeNull()
  })

  it('resolves nothing against an empty or unavailable directory', () => {
    expect(resolvePlaceByName('Green Lake Park', [])).toBeNull()
  })
})

describe('placeAgeFitLabel (the place page\'s age line — or nothing)', () => {
  it('renders a range, an open top, and an open bottom', () => {
    expect(placeAgeFitLabel({ age_min: 2, age_max: 5 })).toBe('Best for ages 2–5')
    expect(placeAgeFitLabel({ age_min: 5, age_max: null })).toBe('Best for ages 5 and up')
    expect(placeAgeFitLabel({ age_min: null, age_max: 3 })).toBe('Best for ages 3 and under')
  })

  it('is null when the data says nothing (the line is omitted, not faked)', () => {
    expect(placeAgeFitLabel({ age_min: null, age_max: null })).toBeNull()
  })
})

describe('placeUpcomingLabel / upcomingCountByPlace (the "N upcoming" chips)', () => {
  it('pluralizes honestly and never renders a "0 upcoming"', () => {
    expect(placeUpcomingLabel(0)).toBe('Nothing planned yet')
    expect(placeUpcomingLabel(1)).toBe('1 upcoming')
    expect(placeUpcomingLabel(2)).toBe('2 upcoming')
  })

  it('is null for an UNKNOWN count (the read failed — no invented zero)', () => {
    expect(placeUpcomingLabel(null)).toBeNull()
  })

  it('counts posts per place and skips the ones with no place', () => {
    const counts = upcomingCountByPlace([
      { place_id: 'a' },
      { place_id: 'a' },
      { place_id: 'b' },
      { place_id: null },
      {},
      { place_id: '' },
    ])
    expect(counts.get('a')).toBe(2)
    expect(counts.get('b')).toBe(1)
    expect(counts.size).toBe(2)
  })
})

describe('groupUpcomingStartTimesByPlace (the date-chip start-time aggregator)', () => {
  it('groups start times by place id, sorted ascending', () => {
    const times = groupUpcomingStartTimesByPlace([
      { place_id: 'a', starts_at: '2026-09-05T09:00:00Z' },
      { place_id: 'a', starts_at: '2026-09-04T09:00:00Z' },
      { place_id: 'b', starts_at: '2026-09-06T10:00:00Z' },
      { place_id: null, starts_at: '2026-09-04T08:00:00Z' },
      { starts_at: '2026-09-04T07:00:00Z' },
      { place_id: '', starts_at: '2026-09-04T06:00:00Z' },
    ])
    expect(times.get('a')).toEqual(['2026-09-04T09:00:00Z', '2026-09-05T09:00:00Z'])
    expect(times.get('b')).toEqual(['2026-09-06T10:00:00Z'])
    expect(times.size).toBe(2)
  })

  it('returns an empty map when there are no posts', () => {
    const times = groupUpcomingStartTimesByPlace([])
    expect(times.size).toBe(0)
  })

  it('a place with no upcoming drop-ins gets an empty array (not missing)', () => {
    // The db read returns only rows with starts_at >= today, so a place that
    // appears in the map has at least one drop-in. A place NOT in the map has
    // none — the caller derives count from array length (0 = none).
    const times = groupUpcomingStartTimesByPlace([{ place_id: 'a', starts_at: '2026-09-04T09:00:00Z' }])
    expect(times.has('b')).toBe(false)
    expect(times.get('a')!.length).toBe(1)
  })
})

describe('browsePlaces (the directory\'s filter + sort decision)', () => {
  const near = place({ name: 'Near Playground', lat: NEAR.lat, lng: NEAR.lng })
  const far = place({ name: 'Far Playground', lat: FAR.lat, lng: FAR.lng })
  const noCoords = place({ name: 'Unmapped Park', lat: null, lng: null })
  const indoor = place({ name: 'Indoor Library', indoor: true, kind: 'library', lat: NEAR.lat, lng: NEAR.lng })
  const directory = [far, noCoords, indoor, near]

  const NO_FILTERS = { query: '', indoor: null, maxMiles: null }

  it('sorts nearest first, alphabetically on ties', () => {
    const rows = browsePlaces(directory, NO_FILTERS, VIEWER, ZIP_COORDS, null)
    expect(rows.map((row) => row.place.name)).toEqual([
      'Indoor Library',
      'Near Playground',
      'Far Playground',
      'Unmapped Park',
    ])
  })

  it('sorts an unknown-distance place LAST, never first', () => {
    const rows = browsePlaces(directory, NO_FILTERS, VIEWER, ZIP_COORDS, null)
    expect(rows[rows.length - 1].distanceMiles).toBeNull()
  })

  it('KEEPS a place whose distance is unknown even with a ceiling set (no hiding for missing data)', () => {
    const rows = browsePlaces(directory, { ...NO_FILTERS, maxMiles: 5 }, VIEWER, ZIP_COORDS, null)
    expect(rows.map((row) => row.place.name)).toContain('Unmapped Park')
    // …while a MEASURED beyond-ceiling distance is excluded.
    expect(rows.map((row) => row.place.name)).not.toContain('Far Playground')
  })

  it('measures from the PLACE, not the host (the ticket\'s distance model)', () => {
    const rows = browsePlaces([near], { ...NO_FILTERS, maxMiles: 5 }, VIEWER, ZIP_COORDS, null)
    expect(rows).toHaveLength(1)
    expect(rows[0].distanceMiles!).toBeLessThan(5)
  })

  it('filters indoor / outdoor when the parent picked one', () => {
    const indoors = browsePlaces(directory, { ...NO_FILTERS, indoor: true }, VIEWER, ZIP_COORDS, null)
    expect(indoors.map((row) => row.place.name)).toEqual(['Indoor Library'])
    const outdoors = browsePlaces(directory, { ...NO_FILTERS, indoor: false }, VIEWER, ZIP_COORDS, null)
    expect(outdoors.map((row) => row.place.name)).not.toContain('Indoor Library')
  })

  it('searches LAST, so a filter can never be undone by the search box', () => {
    // "Far Playground" matches the query, but 53 miles is outside the ceiling.
    const rows = browsePlaces(
      directory,
      { ...NO_FILTERS, query: 'far', maxMiles: 5 },
      VIEWER,
      ZIP_COORDS,
      null,
    )
    expect(rows.map((row) => row.place.name)).not.toContain('Far Playground')
  })

  it('orders search results by relevance, not by distance', () => {
    const rows = browsePlaces(
      directory,
      { ...NO_FILTERS, query: 'far' },
      VIEWER,
      ZIP_COORDS,
      null,
    )
    expect(rows.map((row) => row.place.name)).toEqual(['Far Playground'])
  })

  it('shows "N upcoming" per place (derived from start-time array length), and null for ALL when the read failed', () => {
    const withTimes = browsePlaces(
      directory,
      NO_FILTERS,
      VIEWER,
      ZIP_COORDS,
      new Map([['near-playground', ['2026-09-04T09:00:00Z', '2026-09-05T10:00:00Z', '2026-09-06T11:00:00Z']]]),
    )
    expect(withTimes.find((row) => row.place.name === 'Near Playground')?.upcomingCount).toBe(3)
    expect(withTimes.find((row) => row.place.name === 'Far Playground')?.upcomingCount).toBe(0)
    const noTimes = browsePlaces(directory, NO_FILTERS, VIEWER, ZIP_COORDS, null)
    expect(noTimes.every((row) => row.upcomingCount === null)).toBe(true)
  })

  it('is empty for an empty directory, an unusable viewer, or an unreadable gazetteer', () => {
    expect(browsePlaces([], NO_FILTERS, VIEWER, ZIP_COORDS, null)).toEqual([])
    const rows = browsePlaces(directory, NO_FILTERS, { homeZip: null }, ZIP_COORDS, null)
    expect(rows.every((row) => row.distanceMiles === null)).toBe(true)
    const noZips = browsePlaces(directory, NO_FILTERS, VIEWER, new Map(), null)
    expect(noZips.every((row) => row.distanceMiles === null)).toBe(true)
  })

  it('top-rated: hydrates ratingSummary from the injected ratings map (null when absent or failed)', () => {
    const ratings = new Map<string, ReviewSummary>([
      ['near-playground', rated(7, 4.5)],
      ['far-playground', rated(2, 3.1)],
    ])
    const hydrated = browsePlaces(directory, NO_FILTERS, VIEWER, ZIP_COORDS, null, ratings)
    expect(hydrated.find((row) => row.place.name === 'Near Playground')?.ratingSummary).toEqual(rated(7, 4.5))
    expect(hydrated.find((row) => row.place.name === 'Far Playground')?.ratingSummary).toEqual(rated(2, 3.1))
    // A place with no entry in the map stays null (unknown → nothing rendered).
    expect(hydrated.find((row) => row.place.name === 'Indoor Library')?.ratingSummary).toBeNull()
    // A FAILED bulk read (null) leaves every row's summary null — never a 0.0.
    const failed = browsePlaces(directory, NO_FILTERS, VIEWER, ZIP_COORDS, null, null)
    expect(failed.every((row) => row.ratingSummary === null)).toBe(true)
  })
})

describe('sortPlaceUpcoming (soonest first — the place page asked about THIS place)', () => {
  it('orders by starts_at ascending without mutating the input', () => {
    const input = [
      { id: 'b', starts_at: '2026-09-12T18:00:00Z' },
      { id: 'a', starts_at: '2026-09-12T16:00:00Z' },
    ]
    expect(sortPlaceUpcoming(input).map((post) => post.id)).toEqual(['a', 'b'])
    expect(input.map((post) => post.id)).toEqual(['b', 'a'])
  })
})

// V15 ticket 03: the browse list's sort seam (alpha default, distance, newest).
describe('sortPlaces (V15 ticket 03: the browse list\'s ordering decision)', () => {
  function row(
    name: string,
    overrides: Partial<{ kind: PlaceKind; lat: number | null; lng: number | null; created_at?: string }> & {
      distanceMiles?: number | null
      ratingSummary?: ReviewSummary | null
    } = {},
  ): PlaceListRow {
    const { distanceMiles: dist, ratingSummary, ...placeOverrides } = overrides
    return {
      place: place({ name, ...placeOverrides }),
      // `dist ?? 1` is the fixture default; an EXPLICIT null must stay null
      // (the "unknown distance" cases pin that).
      distanceMiles: dist === undefined ? 1 : dist,
      upcomingCount: null,
      ratingSummary: ratingSummary === undefined ? null : ratingSummary,
    }
  }

  // One fixture, deliberately ordered so that NO mode is a no-op on it:
  // - names are NOT alphabetical (Zed < Milo < Aiden);
  // - distances are NOT ascending (9 < 2 < 4);
  // - dates are NOT descending (oldest < middle < newest).
  const FIXTURE = [
    row('Zed Park', { distanceMiles: 9, lat: NEAR.lat, lng: NEAR.lng, created_at: '2026-01-01T00:00:00Z' }),
    row('Milo Pool', { distanceMiles: 2, lat: FAR.lat, lng: FAR.lng, created_at: '2026-06-01T00:00:00Z' }),
    row('Aiden Playground', { distanceMiles: 4, lat: NEAR.lat, lng: FAR.lng, created_at: '2026-09-01T00:00:00Z' }),
  ]

  it('alpha: orders A→Z by name regardless of distance or date', () => {
    const names = sortPlaces(FIXTURE, 'alpha').map((r) => r.place.name)
    expect(names).toEqual(['Aiden Playground', 'Milo Pool', 'Zed Park'])
  })

  it('distance: uses each row\'s distanceMiles, ascending, when no center is given', () => {
    const names = sortPlaces(FIXTURE, 'distance').map((r) => r.place.name)
    expect(names).toEqual(['Milo Pool', 'Aiden Playground', 'Zed Park'])
  })

  it('distance: puts unknown (null) distances LAST, never first', () => {
    const rows = [
      row('Known Near', { distanceMiles: 1 }),
      row('Unknown One', { distanceMiles: null }),
      row('Known Far', { distanceMiles: 50 }),
    ]
    // "Last" is the precise contract: every known row precedes every unknown
    // row. (The full tie-break — alphabetical among equal keys — is pinned by
    // its own test below.)
    const names = sortPlaces(rows, 'distance').map((r) => r.place.name)
    expect(names).toEqual(['Known Near', 'Known Far', 'Unknown One'])
  })

  it('distance: ties break alphabetically (stable order across renders)', () => {
    const rows = [
      row('Zeta Park', { distanceMiles: 3 }),
      row('Alpha Pool', { distanceMiles: 3 }),
      row('Mid Playground', { distanceMiles: 3 }),
      row('Unknown One', { distanceMiles: null }),
      row('Unknown Two', { distanceMiles: null }),
    ]
    // Equal keys — including the two unknowns — fall back to name, so the
    // order is deterministic no matter how the input was arranged.
    const names = sortPlaces(rows, 'distance').map((r) => r.place.name)
    expect(names).toEqual(['Alpha Pool', 'Mid Playground', 'Zeta Park', 'Unknown One', 'Unknown Two'])
  })

  it('distance: measures from the provided center to the place\'s own coordinates', () => {
    const center = { lat: NEAR.lat, lng: NEAR.lng } // Green Lake area
    const rows = [
      // ~0 mi from center (own coords at the center), stored distance says 50.
      row('At Center', { distanceMiles: 50, lat: NEAR.lat, lng: NEAR.lng }),
      // ~53 mi from center (own coords far away), stored distance says 1.
      row('Far From Center', { distanceMiles: 1, lat: FAR.lat, lng: FAR.lng }),
    ]
    const names = sortPlaces(rows, 'distance', center).map((r) => r.place.name)
    expect(names).toEqual(['At Center', 'Far From Center'])
  })

  it('distance: a place with no own coordinates is unknown and sorts last when a center is given', () => {
    const center = { lat: NEAR.lat, lng: NEAR.lng }
    const rows = [
      row('No Coords', { distanceMiles: 1, lat: null, lng: null }),
      row('Has Coords', { distanceMiles: 99, lat: NEAR.lat, lng: NEAR.lng }),
    ]
    const names = sortPlaces(rows, 'distance', center).map((r) => r.place.name)
    expect(names).toEqual(['Has Coords', 'No Coords'])
  })

  it('newest: most recent created_at first, missing dates last', () => {
    const rows = [
      row('Oldest', { created_at: '2026-01-01T00:00:00Z' }),
      row('No Date'),
      row('Newest', { created_at: '2026-09-01T00:00:00Z' }),
    ]
    const names = sortPlaces(rows, 'newest').map((r) => r.place.name)
    expect(names).toEqual(['Newest', 'Oldest', 'No Date'])
  })

  it('top-rated: rated places order by display average, best first', () => {
    const rows = [
      row('Mid Rated', { ratingSummary: rated(5, 3.4) }),
      row('Top Rated', { ratingSummary: rated(2, 4.8) }),
      row('Low Rated', { ratingSummary: rated(9, 1.2) }),
    ]
    const names = sortPlaces(rows, 'top-rated').map((r) => r.place.name)
    expect(names).toEqual(['Top Rated', 'Mid Rated', 'Low Rated'])
  })

  it('top-rated: an UNRATED place (null summary) sorts AFTER every rated place, including low-rated ones', () => {
    // THE unrated-place rule: a missing average is the absence of an opinion,
    // not a 0.0 — it must never rank as if it scored zero.
    const rows = [
      row('Unrated One', { ratingSummary: null }),
      row('Low Rated', { ratingSummary: rated(1, 1.0) }),
      row('Unrated Two', { ratingSummary: null }),
      row('High Rated', { ratingSummary: rated(4, 4.9) }),
    ]
    const names = sortPlaces(rows, 'top-rated').map((r) => r.place.name)
    expect(names).toEqual(['High Rated', 'Low Rated', 'Unrated One', 'Unrated Two'])
  })

  it('top-rated: equal displayed averages break on review COUNT (more reviews = stronger evidence), then name, then id', () => {
    const rows = [
      row('B Fewer Reviews', { ratingSummary: rated(1, 4.0) }),
      row('A More Reviews', { ratingSummary: rated(12, 4.0) }),
      row('C Same Count As B', { ratingSummary: rated(1, 4.0) }),
    ]
    const names = sortPlaces(rows, 'top-rated').map((r) => r.place.name)
    // A (12 reviews) beats B and C (1 review each); the tie between B and C
    // breaks alphabetically — a total deterministic order.
    expect(names).toEqual(['A More Reviews', 'B Fewer Reviews', 'C Same Count As B'])
  })

  it('top-rated: an all-unrated list keeps a stable alphabetical order', () => {
    const rows = [
      row('Zed Park', { ratingSummary: null }),
      row('Milo Pool', { ratingSummary: null }),
      row('Aiden Playground', { ratingSummary: null }),
    ]
    const names = sortPlaces(rows, 'top-rated').map((r) => r.place.name)
    expect(names).toEqual(['Aiden Playground', 'Milo Pool', 'Zed Park'])
  })

  it('top-rated: a summary with hasReviews=false (count 0) also sorts after every rated place', () => {
    // The DB can return count 0 + null average for a place with no reviews;
    // that shape must be treated exactly like a null summary (unrated).
    const unratedShape: ReviewSummary = { count: 0, displayAverage: null, hasReviews: false }
    const rows = [
      row('Rated Low', { ratingSummary: rated(1, 2.0) }),
      row('Unrated Shape', { ratingSummary: unratedShape }),
    ]
    const names = sortPlaces(rows, 'top-rated').map((r) => r.place.name)
    expect(names).toEqual(['Rated Low', 'Unrated Shape'])
  })

  it('returns a NEW array and never mutates the input', () => {
    const originalOrder = FIXTURE.map((r) => r.place.name)
    const result = sortPlaces(FIXTURE, 'alpha')
    expect(result).not.toBe(FIXTURE) // a new array, not the input itself
    // The input array is untouched: same order as before the call.
    expect(FIXTURE.map((r) => r.place.name)).toEqual(originalOrder)
  })

  it('yields [] for an empty input in every mode', () => {
    expect(sortPlaces([], 'alpha')).toEqual([])
    expect(sortPlaces([], 'distance')).toEqual([])
    expect(sortPlaces([], 'newest')).toEqual([])
    expect(sortPlaces([], 'top-rated')).toEqual([])
  })

  it('the modes produce different orders on the same fixture', () => {
    const alpha = sortPlaces(FIXTURE, 'alpha').map((r) => r.place.name)
    const distance = sortPlaces(FIXTURE, 'distance').map((r) => r.place.name)
    const newest = sortPlaces(FIXTURE, 'newest').map((r) => r.place.name)
    // The fixture is built so each mode picks a DIFFERENT first row:
    expect(alpha[0]).toBe('Aiden Playground') // A–Z
    expect(distance[0]).toBe('Milo Pool') // closest (2 mi)
    expect(newest[0]).toBe('Aiden Playground') // most recent created_at
    expect(distance).not.toEqual(alpha)
    expect(newest).not.toEqual(distance)
  })
})

describe('groupPlacesByKind (V13 ticket 05 A7: the browse list\'s grouped presentation)', () => {
  function row(name: string, kind: PlaceKind, distanceMiles: number | null = 1): PlaceListRow {
    return { place: place({ name, kind }), distanceMiles, upcomingCount: null, ratingSummary: null }
  }

  it('groups rows by kind and orders groups in schema order (PLACE_KINDS)', () => {
    const rows = [row('A', 'pool'), row('B', 'park'), row('C', 'playground')]
    const groups = groupPlacesByKind(rows)
    expect(groups.map((g) => g.kind)).toEqual(['park', 'playground', 'pool'])
    expect(groups.map((g) => g.label)).toEqual(['Park', 'Playground', 'Pool'])
  })

  it('keeps the caller\'s row order inside each group (distance sort survives grouping)', () => {
    const rows = [
      row('Near park', 'park', 1),
      row('Far park', 'park', 9),
      row('Mid pool', 'pool', 4),
    ]
    const groups = groupPlacesByKind(rows)
    expect(groups.find((g) => g.kind === 'park')!.rows.map((r) => r.place.name)).toEqual([
      'Near park',
      'Far park',
    ])
    expect(groups.find((g) => g.kind === 'pool')!.rows.map((r) => r.place.name)).toEqual([
      'Mid pool',
    ])
  })

  it('omits empty kinds (only kinds present in the input get a group)', () => {
    const groups = groupPlacesByKind([row('A', 'beach')])
    expect(groups.map((g) => g.kind)).toEqual(['beach'])
  })

  it('yields [] for an empty input (the caller renders nothing, exactly as today)', () => {
    expect(groupPlacesByKind([])).toEqual([])
  })

  it('keeps unknown kinds in their own alphabetized bucket, never dropped', () => {
    const rows = [
      row('X', 'zeta' as PlaceKind),
      row('A', 'alpha' as PlaceKind),
      row('P', 'park'),
    ]
    const groups = groupPlacesByKind(rows)
    // Known kinds first in schema order, then unknown kinds alphabetized.
    expect(groups.map((g) => g.kind)).toEqual(['park', 'alpha', 'zeta'])
    expect(groups[1].label).toBe('Place') // the fallback label, not a crash
  })

  it('pins the lead limit to the ticket (6 — mobile-first scannable lead)', () => {
    expect(BROWSE_LIST_LEAD_LIMIT).toBe(6)
  })
})

describe('the small place label seams', () => {
  it('names every kind the 0029 CHECK allows', () => {
    expect(placeKindLabel('playground')).toBe('Playground')
    expect(placeKindLabel('splash_pad')).toBe('Splash pad')
    expect(placeKindLabel('pool')).toBe('Pool')
    expect(placeKindLabel('library')).toBe('Library')
    expect(placeKindLabel('beach')).toBe('Beach')
    expect(placeKindLabel('museum')).toBe('Museum')
    expect(placeKindLabel('indoor_play')).toBe('Indoor play')
    expect(placeKindLabel('park')).toBe('Park')
    expect(placeKindLabel('trail')).toBe('Trail')
    expect(placeKindLabel('other')).toBe('Place')
  })

  it('falls back to "Place" for a kind the app does not know (never a blank label)', () => {
    expect(placeKindLabel('water_park')).toBe('Place')
  })

  it('says Indoor or Outdoor', () => {
    expect(placeIndoorLabel({ indoor: true })).toBe('Indoor')
    expect(placeIndoorLabel({ indoor: false })).toBe('Outdoor')
  })

  it('joins the kind and the indoor word into one trust line', () => {
    expect(placeTrustLine({ kind: 'playground', indoor: false })).toBe('Playground · Outdoor')
    expect(placeTrustLine({ kind: 'indoor_play', indoor: true })).toBe('Indoor play · Indoor')
  })

  it('is null for no place or a blank kind (never a dangling " · ")', () => {
    expect(placeTrustLine(null)).toBeNull()
    expect(placeTrustLine(undefined)).toBeNull()
    expect(placeTrustLine({ kind: '', indoor: false })).toBeNull()
  })

  it('builds /place/:id, escaping the id', () => {
    expect(placePath('abc-123')).toBe('/place/abc-123')
    expect(placePath('a/b')).toBe('/place/a%2Fb')
  })
})

describe('placeIdField (the insert key, present only for a picked place)', () => {
  it('omits the key entirely for free text (so pre-0030-apply nothing 42703s)', () => {
    expect(placeIdField(undefined)).toEqual({})
    expect(placeIdField(null)).toEqual({})
    expect(placeIdField('')).toEqual({})
  })

  it('carries the id when a place was actually picked', () => {
    expect(placeIdField('place-1')).toEqual({ place_id: 'place-1' })
  })
})

describe('the /new place PICKER (V9 ticket 01)', () => {
  const DIRECTORY = [
    place({ name: 'Ballard Commons', address: '5701 22nd Ave NW' }),
    place({ name: 'Green Lake Park', address: '7201 East Green Lake Dr N' }),
    place({ name: 'Discovery Park', address: '3801 Discovery Park Blvd' }),
    place({ name: 'Carkeek Park', address: '950 NW Carkeek Park Rd' }),
  ]

  it('strips ONE leading @ (the alias) and nothing else', () => {
    expect(stripPlaceAlias('@green')).toBe('green')
    expect(stripPlaceAlias('  @green lake  ')).toBe('green lake')
    expect(stripPlaceAlias('green')).toBe('green')
    // Only the FIRST character is an alias: an @ inside a name is text.
    expect(stripPlaceAlias('park @ 5th')).toBe('park @ 5th')
    expect(stripPlaceAlias('@@green')).toBe('@green')
    // A bare alias is NO place at all — which is what makes the validator ask
    // for one instead of posting the character.
    expect(stripPlaceAlias('@')).toBe('')
    expect(stripPlaceAlias('   ')).toBe('')
  })

  it('reports whether the alias was used', () => {
    expect(usesPlaceAlias('@')).toBe(true)
    expect(usesPlaceAlias('@green')).toBe(true)
    expect(usesPlaceAlias('  @green')).toBe(true)
    expect(usesPlaceAlias('green @')).toBe(false)
    expect(usesPlaceAlias('')).toBe(false)
  })

  it('browses the directory A→Z, deterministically, capped', () => {
    // The browse cap is deliberately larger than the typed-suggestion cap: the
    // button says "show me the directory", the field says "find this one".
    expect(PLACE_BROWSE_LIMIT).toBeGreaterThan(PLACE_SUGGESTION_LIMIT)
    const listed = browsePlaceList(DIRECTORY, 3)
    expect(listed.map((p) => p.name)).toEqual([
      'Ballard Commons',
      'Carkeek Park',
      'Discovery Park',
    ])
    expect(browsePlaceList(DIRECTORY, 99)).toHaveLength(4)
    expect(browsePlaceList(DIRECTORY, 0)).toEqual([])
  })

  it('a bare @ shows the directory (an alias for the picker, not for an empty list)', () => {
    // This is the whole reason the picker has three states: with a query-only
    // rule, typing `@` would open a list containing nothing but "Somewhere
    // else", which is not an alias for anything a parent can see.
    expect(placePickerMatches('@', DIRECTORY, 6, true).map((p) => p.name)).toEqual([
      'Ballard Commons',
      'Carkeek Park',
      'Discovery Park',
      'Green Lake Park',
    ])
  })

  it('typing (not browsing) matches the ranked query, and shows NOTHING when empty', () => {
    expect(placePickerMatches('green', DIRECTORY, 6, false).map((p) => p.name)).toEqual([
      'Green Lake Park',
    ])
    expect(placePickerMatches('', DIRECTORY, 6, false)).toEqual([])
  })

  it('the @ alias matches the same places the plain query does', () => {
    expect(placePickerMatches('@green', DIRECTORY, 6, false)).toEqual(
      placePickerMatches('green', DIRECTORY, 6, false),
    )
  })

  it('narrowing a browse list keeps the query rule (address matches still count)', () => {
    expect(placePickerMatches('carkeek', DIRECTORY, 6, true).map((p) => p.name)).toEqual([
      'Carkeek Park',
    ])
    // Rank 3: the query appears only in the ADDRESS.
    expect(placePickerMatches('3801', DIRECTORY, 6, true).map((p) => p.name)).toEqual([
      'Discovery Park',
    ])
  })
})

describe('placePickPatch (V9 ticket 01: what one tap on a suggestion writes into the form)', () => {
  it('fills place + address together, and the form value is "" when the place has no neighbourhood', () => {
    // The seeded case (every one of 0029's rows): no neighbourhood at all. The
    // form value is the shape's own "none" (''), not null — the field is a
    // string and the write seam (feed.neighborhoodIdField) omits the key for ''.
    expect(
      placePickPatch(
        place({
          name: 'Green Lake Park',
          address: '7201 East Green Lake Dr N',
          neighborhood_id: null,
        }),
      ),
    ).toEqual({
      place: 'Green Lake Park',
      address: '7201 East Green Lake Dr N',
      neighborhoodId: '',
    })
    // A place that DOES carry one hands it to the post — a suggestion, never a
    // decision, and never a guess when the directory is silent.
    expect(
      placePickPatch(
        place({ name: 'Ballard Commons', address: '5701 22nd Ave NW', neighborhood_id: 'n-bal' }),
      ),
    ).toEqual({
      place: 'Ballard Commons',
      address: '5701 22nd Ave NW',
      neighborhoodId: 'n-bal',
    })
  })

  it('the pick REPLACES the neighbourhood, including with none (review cycle 1, F1)', () => {
    // THE BUG THIS PINS. On /new the neighbourhood field is not rendered
    // (showNeighborhood={false}), but a "Recent places" chip still writes the
    // remembered post's REAL id into the form (applyRecentPlace). Picking a
    // directory place after that must NOT keep that invisible id: the post would
    // carry the old place's neighbourhood next to the new place. The seam takes
    // only the place, so "fall back to what the form held" is not expressible —
    // and this asserts the outcome for the chip-then-pick sequence explicitly.
    const chipRemembered = 'hood-from-an-older-post'
    const patch = placePickPatch(place({ name: 'Green Lake Park', neighborhood_id: null }))
    // What the page writes: patch.neighborhoodId, never a merge with the chip's.
    const formValueAfterPick = patch.neighborhoodId
    expect(formValueAfterPick).toBe('')
    expect(formValueAfterPick).not.toBe(chipRemembered)
    // …and the write seam then omits the column entirely, so the post stores
    // NULL rather than the stale id.
    expect(neighborhoodIdField(formValueAfterPick)).toEqual({})
  })

  it('fills the directory row\'s address verbatim (the seed guarantees one — 0029:128)', () => {
    expect(placePickPatch(place({ name: 'Carkeek Park', address: '950 NW Carkeek Park Rd' })).address).toBe(
      '950 NW Carkeek Park Rd',
    )
  })
})

describe('placeExternalUrl (V15 ticket 04: the "Learn more" link\'s derived OSM URL)', () => {
  it('returns an OSM search URL containing the encoded name for a valid name', () => {
    expect(placeExternalUrl({ name: 'Green Lake Park' })).toBe(
      'https://www.openstreetmap.org/search?query=Green%20Lake%20Park,+Seattle',
    )
  })

  it('encodes special characters in the name', () => {
    const url = placeExternalUrl({ name: 'Ballard Branch, Seattle Public Library' })
    expect(url).toContain(encodeURIComponent('Ballard Branch, Seattle Public Library'))
    expect(url).toContain(',+Seattle')
  })

  it('returns null for an empty name', () => {
    expect(placeExternalUrl({ name: '' })).toBeNull()
  })

  it('returns null for a whitespace-only name', () => {
    expect(placeExternalUrl({ name: '   ' })).toBeNull()
  })
})

/**
 * V20 t01 — the "Learn more" destination, and the reason the place page no
 * longer depends on a photo to say anything about a place.
 *
 * The precedence is the whole contract: a stored operator site wins, the
 * derived map search is the honest fallback, and a place with neither a site
 * nor a name gets nothing at all.
 */
describe('placeLearnMoreLink (V20 t01: the stored website, else the map search)', () => {
  it('prefers the stored website_url and reports it as a website', () => {
    expect(
      placeLearnMoreLink({ name: 'Green Lake Park', website_url: 'https://www.seattle.gov/parks/greenlake' }),
    ).toEqual({ url: 'https://www.seattle.gov/parks/greenlake', kind: 'website' })
  })

  it('falls back to the derived OSM search when website_url is null', () => {
    expect(placeLearnMoreLink({ name: 'Green Lake Park', website_url: null })).toEqual({
      url: placeExternalUrl({ name: 'Green Lake Park' }),
      kind: 'map-search',
    })
  })

  it('falls back when website_url is absent entirely (a pre-0048 row)', () => {
    expect(placeLearnMoreLink({ name: 'Alki Playground' })?.kind).toBe('map-search')
  })

  it('treats a whitespace-only website_url as missing, not as a link', () => {
    expect(placeLearnMoreLink({ name: 'Alki Playground', website_url: '   ' })?.kind).toBe(
      'map-search',
    )
  })

  it('rejects a non-http(s) value and falls back — the column has no DB CHECK, so it can hold anything', () => {
    // The caller puts this straight into an <a href>. A `javascript:` value is
    // an injection vector; it must never reach the anchor.
    for (const bad of ['javascript:alert(1)', 'ftp://x/y', 'seattle.gov/parks', '//evil.example']) {
      expect(
        placeLearnMoreLink({ name: 'Green Lake Park', website_url: bad })?.kind,
        `"${bad}" must not be treated as the place's website`,
      ).toBe('map-search')
    }
  })

  it('accepts http as well as https (an operator site that never got a certificate is still the site)', () => {
    expect(
      placeLearnMoreLink({ name: 'X', website_url: 'http://example.org/visit' }),
    ).toEqual({ url: 'http://example.org/visit', kind: 'website' })
  })

  it('returns null when there is neither a usable URL nor a name to search', () => {
    expect(placeLearnMoreLink({ name: '', website_url: null })).toBeNull()
    expect(placeLearnMoreLink({ name: '   ', website_url: 'javascript:x' })).toBeNull()
  })
})

/**
 * V25 t04 — the place page's two outbound actions ("Learn more" + "Get
 * directions"), and above all the NULL contract the page renders from: no
 * address means no Get-directions control, never a queryless Google Maps link.
 *
 * This is the only deterministic place that absence CAN be pinned — vitest runs
 * in the node environment (no jsdom/RTL in this repo), and every one of the 239
 * seeded places carries an address (measured: an anon REST read of
 * `places?address=is.null` returns []), so a browser lane can never meet the
 * no-address case either. The render's conditionals consume exactly the two
 * booleans these tests pin.
 */
describe('placeOutboundLinks (V25 t04: the place page\'s two buttons)', () => {
  it('offers both actions when the place has an address, keeping the site when there is one', () => {
    expect(
      placeOutboundLinks({
        name: 'Green Lake Park',
        address: '7201 East Green Lake Dr N',
        website_url: 'https://www.seattle.gov/parks/greenlake',
      }),
    ).toEqual({
      learnMore: { url: 'https://www.seattle.gov/parks/greenlake', kind: 'website' },
      directions:
        'https://www.google.com/maps?q=Green%20Lake%20Park%2C%207201%20East%20Green%20Lake%20Dr%20N',
    })
  })

  it('reuses feed.mapsHref verbatim — no second URL builder, and the address link cannot drift', () => {
    const place = { name: 'Zürich Spielplatz', address: 'Café str. 12' }
    // Byte equality against the seam the address link and the feed card use.
    expect(placeOutboundLinks(place).directions).toBe(mapsHref(place.name, place.address))
    // …including its trimming, so "  123 Main  " and "123 Main" are one href.
    expect(placeOutboundLinks({ name: 'X', address: '  123 Main  ' }).directions).toBe(
      mapsHref('X', '123 Main'),
    )
  })

  it('drops Get directions when there is no address — and still offers Learn more', () => {
    for (const address of [null, undefined, '', '   '] as const) {
      const links = placeOutboundLinks({ name: 'Green Lake Park', address })
      expect(links.directions, `address ${JSON.stringify(address)} must yield no Maps link`).toBeNull()
      // The other action is INDEPENDENT of the address: a park with no street
      // still has its OSM search, so the row is one button, not none.
      expect(links.learnMore).toEqual({
        url: placeExternalUrl({ name: 'Green Lake Park' }),
        kind: 'map-search',
      })
    }
  })

  it('keeps Get directions when Learn more is null (no name, no site) — the two are independent', () => {
    expect(placeOutboundLinks({ name: '', address: '123 Main St' })).toEqual({
      learnMore: null,
      directions: 'https://www.google.com/maps?q=%2C%20123%20Main%20St',
    })
  })
})

/**
 * V20 t05 — the live radius preview. The founder's Marketplace comparison: the
 * circle must grow while the slider is being dragged, not only after "See
 * places" is pressed.
 */
/**
 * V20 t05 — the zoom that frames a radius. This exists because the circle can
 * no longer be framed by `fitBounds`: fitting the bounds rescales the camera to
 * the circle, so the circle renders at a near-constant pixel size and the
 * parent cannot see the radius growing at all (measured: 1 mi and 30 mi both
 * drew a 125px circle). The camera has to be placed by arithmetic instead.
 */
describe('zoomForRadius (V20 t05: where the camera starts for a radius)', () => {
  it('zooms IN for a small radius and OUT for a large one', () => {
    expect(zoomForRadius(1)).toBeGreaterThan(zoomForRadius(5))
    expect(zoomForRadius(5)).toBeGreaterThan(zoomForRadius(30))
  })

  it('is monotonically decreasing across the app\'s whole radius ladder', () => {
    const ladder = [1, 2, 5, 10, 20, 35]
    const zooms = ladder.map((m) => zoomForRadius(m))
    for (let i = 1; i < zooms.length; i += 1) {
      expect(zooms[i], `zoom must fall as the radius grows (at ${ladder[i]} mi)`).toBeLessThan(
        zooms[i - 1]!,
      )
    }
  })

  it('produces a usable zoom level for every radius the app offers', () => {
    // Leaflet's tile layer is capped at maxZoom 19, and a negative zoom asks for
    // tiles that do not exist — neither may escape this function.
    for (const miles of [1, 2, 5, 10, 20, 35]) {
      const z = zoomForRadius(miles)
      expect(z, `${miles} mi must yield a real zoom`).toBeGreaterThanOrEqual(0)
      expect(z, `${miles} mi must stay within the tile layer's maxZoom`).toBeLessThanOrEqual(19)
    }
  })

  it('keeps the circle on screen: the radius spans about half the pane at the chosen zoom', () => {
    // The arithmetic's own contract, checked against itself so a sign error or a
    // dropped constant is caught rather than merely re-stated.
    const panePx = 250
    for (const miles of [1, 5, 30]) {
      const z = zoomForRadius(miles, panePx)
      const milesPerPixel = (360 * 69) / (Math.pow(2, z) * 256)
      const radiusPx = miles / milesPerPixel
      expect(
        radiusPx,
        `${miles} mi should render at roughly half the ${panePx}px pane (got ${Math.round(radiusPx)}px)`,
      ).toBeGreaterThan(panePx * 0.25)
      expect(radiusPx).toBeLessThan(panePx * 1.5)
    }
  })

  it('falls back to the detail zoom for a radius that cannot be framed', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(zoomForRadius(bad)).toBe(DETAIL_ZOOM_FALLBACK)
    }
    expect(zoomForRadius(5, 0)).toBe(DETAIL_ZOOM_FALLBACK)
  })

  /**
   * V23 slice 7 — the radius circle was hanging outside the map card, and these
   * are the two arithmetic facts that let it. Both are stated as the geometry
   * the map actually draws rather than as re-statements of the constants: a
   * circle of radius R occupies `R / milesPerPixel` pixels, and that has to be no
   * more than half the pane on BOTH axes for the disc to be inside it.
   */
  describe('V23 slice 7: the circle fits inside the pane it is framing', () => {
    /** Leaflet's own scale, at a latitude — the correction this slice added. */
    function milesPerPixel(z: number, lat: number): number {
      return (360 * 69 * Math.cos((lat * Math.PI) / 180)) / (Math.pow(2, z) * 256)
    }

    it('leaves margin: the drawn circle is smaller than the pane, never equal to it', () => {
      const panePx = 332
      for (const miles of [1, 2, 5, 10]) {
        const z = zoomForRadius(miles, panePx, SEATTLE_LAT)
        const radiusPx = miles / milesPerPixel(z, SEATTLE_LAT)
        // The diameter, which is what has to fit across the pane.
        expect(
          radiusPx * 2,
          `${miles} mi must draw inside the ${panePx}px pane (drew ${Math.round(radiusPx * 2)}px)`,
        ).toBeLessThan(panePx)
        // And still large enough to read as a radius rather than a dot.
        expect(radiusPx * 2).toBeGreaterThan(panePx * 0.5)
      }
    })

    it('corrects for latitude: Seattle needs a LOWER zoom than the equator for one radius', () => {
      // Mercator inflates the map by 1/cos(lat), so at Seattle's latitude the
      // same geographic radius covers MORE pixels — the zoom must come down to
      // compensate. Getting this backwards is what hung the circle over the edge.
      const seattle = zoomForRadius(1, 332, SEATTLE_LAT)
      const equator = zoomForRadius(1, 332, 0)
      expect(seattle).toBeLessThan(equator)
      // The gap IS the 1/cos(47.6) factor, in octaves (log2).
      expect(equator - seattle).toBeCloseTo(Math.log2(1 / Math.cos((SEATTLE_LAT * Math.PI) / 180)), 2)
    })

    it('keeps the equator default bit-for-bit, so existing callers are unchanged', () => {
      for (const miles of [1, 5, 30]) {
        expect(zoomForRadius(miles, 332, 0)).toBe(zoomForRadius(miles, 332))
      }
    })

    it('survives a latitude that cannot be used, rather than blanking the layer', () => {
      for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -Number.POSITIVE_INFINITY]) {
        const z = zoomForRadius(5, 332, bad)
        expect(Number.isFinite(z), `lat=${bad} must not produce a non-finite zoom`).toBe(true)
        expect(z).toBe(zoomForRadius(5, 332, 0))
      }
      // A pole would send cos to 0 and the ratio to infinity; the floor holds.
      expect(Number.isFinite(zoomForRadius(5, 332, 90))).toBe(true)
      expect(zoomForRadius(5, 332, 90)).toBeGreaterThanOrEqual(0)
    })
  })

  it('answers a larger radius with a larger geographic span at the same zoom', () => {
    // The claim the e2e spec makes on the real map, as arithmetic: holding the
    // zoom fixed, 30 miles of radius IS 30 times 1 mile of pixels.
    const z = 12
    const milesPerPixel = (360 * 69) / (Math.pow(2, z) * 256)
    const oneMilePx = 1 / milesPerPixel
    const thirtyMilePx = 30 / milesPerPixel
    expect(thirtyMilePx / oneMilePx).toBeCloseTo(30, 6)
  })
})

describe('radiusPreviewCircle (V20 t05: the circle follows the slider)', () => {
  const HOME = { lat: 47.66757, lng: -122.37789 }
  const PINNED = { lat: 47.6805, lng: -122.3267 }

  it('uses the live preview centre + radius when one is present', () => {
    expect(
      radiusPreviewCircle({
        previewCenter: PINNED,
        previewMiles: 12,
        geocodeCenter: null,
        homePin: HOME,
        committedMiles: MAP_FOCUS_RADIUS_MILES,
      }),
    ).toEqual({ center: PINNED, radiusMiles: 12 })
  })

  it('grows the returned radius as the miles grow — the whole point of the slice', () => {
    const at = (miles: number) =>
      radiusPreviewCircle({
        previewCenter: PINNED,
        previewMiles: miles,
        geocodeCenter: null,
        homePin: HOME,
        committedMiles: MAP_FOCUS_RADIUS_MILES,
      })?.radiusMiles ?? 0
    expect(at(1)).toBeLessThan(at(5))
    expect(at(5)).toBeLessThan(at(30))
  })

  it('falls back to the committed frame when there is no preview at all (the pre-t05 return)', () => {
    expect(
      radiusPreviewCircle({
        previewCenter: null,
        previewMiles: 12,
        geocodeCenter: PINNED,
        homePin: HOME,
        committedMiles: MAP_FOCUS_RADIUS_MILES,
      }),
    ).toEqual(framingCircle({ geocodeCenter: PINNED, homePin: HOME, radiusMiles: MAP_FOCUS_RADIUS_MILES }))
  })

  it('ignores a non-finite or non-positive preview radius rather than blanking the layer', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -3]) {
      const result = radiusPreviewCircle({
        previewCenter: PINNED,
        previewMiles: bad,
        geocodeCenter: null,
        homePin: HOME,
        committedMiles: MAP_FOCUS_RADIUS_MILES,
      })
      expect(result, `radius ${bad} must not be drawn`).toEqual({
        center: HOME,
        radiusMiles: MAP_FOCUS_RADIUS_MILES,
      })
    }
  })

  it('ignores a non-finite preview centre', () => {
    expect(
      radiusPreviewCircle({
        previewCenter: { lat: Number.NaN, lng: -122 },
        previewMiles: 5,
        geocodeCenter: null,
        homePin: HOME,
        committedMiles: MAP_FOCUS_RADIUS_MILES,
      }),
    ).toEqual({ center: HOME, radiusMiles: MAP_FOCUS_RADIUS_MILES })
  })

  it('returns null when there is neither a preview nor any pinned anchor', () => {
    expect(
      radiusPreviewCircle({
        previewCenter: null,
        previewMiles: 5,
        geocodeCenter: null,
        homePin: null,
        committedMiles: MAP_FOCUS_RADIUS_MILES,
      }),
    ).toBeNull()
  })
})

describe('placeDistanceMiles re-exported from the place module', () => {
  it('is the same seam the feed uses (one implementation, two import sites)', () => {
    expect(placeDistanceMiles(NEAR, VIEWER, ZIP_COORDS)).not.toBeNull()
    expect(coordNumber('47.5')).toBe(47.5)
  })
})

/**
 * V12 t05: the map-coordinate seam. The gazetteer below is the seeded
 * gazetteer's real 98107 (West Seattle), so the fallback assertions are about
 * real geography, matching this file's discipline.
 */
describe('zipFromAddress (the trailing 5-digit zip embedded in the address)', () => {
  it('extracts the trailing 5-digit zip', () => {
    expect(zipFromAddress('5614 22nd Ave. N.W., Seattle, WA 98107')).toBe('98107')
  })

  it('takes the LAST 5-digit run when a non-zip 5-digit token precedes the zip (reviewer shape)', () => {
    // 98107 is a suite number, not the zip; 98128 (Ballard) is the trailing
    // run. The first-run bug would have keyed the gazetteer to 98107's city.
    expect(zipFromAddress('Suite 98107, 200 5th Ave S, Seattle, WA 98128')).toBe('98128')
  })

  it('takes the LAST 5-digit run past a 5-digit street number', () => {
    expect(zipFromAddress('10000 1st Ave S, Seattle, WA 98128')).toBe('98128')
  })

  it('is null for an address with no 5-digit zip', () => {
    expect(zipFromAddress('7201 East Green Lake Dr N')).toBe(null)
  })

  it('is null for a null or undefined address', () => {
    expect(zipFromAddress(null)).toBe(null)
    expect(zipFromAddress(undefined)).toBe(null)
  })
})

describe('resolveMapCoords (own lat/lng, else the address zip, else null)', () => {
  const GAZETTEER: Map<string, ZipCoords> = new Map([
    ['98107', { lat: 47.66757, lng: -122.37789 }],
  ])

  it('prefers the place\'s own coordinates', () => {
    const p = place({ name: 'A', lat: 47.68, lng: -122.32 })
    expect(resolveMapCoords(p, GAZETTEER)).toEqual({ lat: 47.68, lng: -122.32 })
  })

  it('coerces string coordinates (PostgREST returns numerics as strings)', () => {
    // The seam's parameter is deliberately wider than Place (string | number |
    // null): at runtime PostgREST hands back numerics as strings, and that is
    // exactly what the seam must absorb.
    const raw = { lat: '47.68', lng: '-122.32', address: '1 Test St' }
    expect(resolveMapCoords(raw, GAZETTEER)).toEqual({ lat: 47.68, lng: -122.32 })
  })

  it('falls back to the address zip\'s gazetteer coordinates when the place has none', () => {
    const p = place({ name: 'A', lat: null, lng: null, address: '1 Somewhere, Seattle, WA 98107' })
    expect(resolveMapCoords(p, GAZETTEER)).toEqual({ lat: 47.66757, lng: -122.37789 })
  })

  it('is null when the address zip is not in the gazetteer', () => {
    const p = place({ name: 'A', lat: null, lng: null, address: '1 Nowhere, Elsewhere, WA 99999' })
    expect(resolveMapCoords(p, GAZETTEER)).toBe(null)
  })

  it('is null when the address carries no zip to look up', () => {
    const p = place({ name: 'A', lat: null, lng: null, address: '7201 East Green Lake Dr N' })
    expect(resolveMapCoords(p, GAZETTEER)).toBe(null)
  })

  it('is null when the gazetteer is unavailable (a failed load)', () => {
    const p = place({ name: 'A', lat: null, lng: null, address: '1 Somewhere, Seattle, WA 98107' })
    expect(resolveMapCoords(p, null)).toBe(null)
  })
})

// V15 ticket 02: the browse map rework's pure distance + radius-filter seams.
describe('distanceMiles (haversine alias over feed.haversineMiles)', () => {
  it('returns 0 for identical points', () => {
    expect(distanceMiles({ lat: 47.6, lng: -122.3 }, { lat: 47.6, lng: -122.3 })).toBeCloseTo(0, 6)
  })

  it('matches the known ~11.5 mi gap between the two seeded zips', () => {
    // 98107 West Seattle → 98007 Bellevue (the test file's own constants).
    const d = distanceMiles(ZIP_COORDS.get('98107')!, ZIP_COORDS.get('98007')!)
    expect(d).toBeGreaterThan(10)
    expect(d).toBeLessThan(13)
  })

  it('is symmetric', () => {
    const a = { lat: 47.68, lng: -122.32 }
    const b = { lat: 47.61, lng: -122.14 }
    expect(distanceMiles(a, b)).toBeCloseTo(distanceMiles(b, a), 6)
  })
})

describe('filterPlacesByRadius (pure radius filter over resolveMapCoords)', () => {
  const GAZETTEER: Map<string, ZipCoords> = new Map([
    ['98107', { lat: 47.66757, lng: -122.37789 }],
  ])
  const CENTER = { lat: 47.68, lng: -122.32 } // Green Lake area

  it('keeps places within the radius and excludes those outside', () => {
    const near = place({ name: 'Near', lat: 47.68, lng: -122.32 }) // ~0 mi
    const far = place({ name: 'Far', lat: 46.9, lng: -122.0 }) // ~53 mi
    const result = filterPlacesByRadius([near, far], CENTER, 5, GAZETTEER)
    expect(result.map((p) => p.name)).toEqual(['Near'])
  })

  it('includes the boundary (distance <= radius)', () => {
    // A place exactly at the center is always included.
    const atCenter = place({ name: 'At Center', lat: CENTER.lat, lng: CENTER.lng })
    const result = filterPlacesByRadius([atCenter], CENTER, 1, GAZETTEER)
    expect(result.map((p) => p.name)).toEqual(['At Center'])
  })

  it('excludes places with no resolvable coordinates', () => {
    const noCoords = place({ name: 'No Coords', lat: null, lng: null, address: '1 Nowhere St' })
    const result = filterPlacesByRadius([noCoords], CENTER, 30, GAZETTEER)
    expect(result).toEqual([])
  })

  it('falls back to the gazetteer zip when the place has no own coords', () => {
    // 98107 resolves to West Seattle (~2.5 mi from CENTER via haversine).
    const byZip = place({
      name: 'By Zip',
      lat: null,
      lng: null,
      address: '1 Somewhere, Seattle, WA 98107',
    })
    const result = filterPlacesByRadius([byZip], CENTER, 5, GAZETTEER)
    expect(result.map((p) => p.name)).toEqual(['By Zip'])
  })

  it('returns an empty array for a non-positive radius', () => {
    const near = place({ name: 'Near', lat: CENTER.lat, lng: CENTER.lng })
    expect(filterPlacesByRadius([near], CENTER, 0, GAZETTEER)).toEqual([])
    expect(filterPlacesByRadius([near], CENTER, -5, GAZETTEER)).toEqual([])
  })

  it('works with an empty places array', () => {
    expect(filterPlacesByRadius([], CENTER, 10, GAZETTEER)).toEqual([])
  })
})

describe('framingCircle', () => {
  const GEO = { lat: 47.6, lng: -122.3 }
  const HOME = { lat: 47.7, lng: -122.4 }

  it('frames on the geocoded center when the viewer set one', () => {
    expect(framingCircle({ geocodeCenter: GEO, homePin: HOME, radiusMiles: 5 })).toEqual({
      center: GEO,
      radiusMiles: 5,
    })
  })

  it('falls back to the home pin at the viewer radius when there is no geocode', () => {
    const framed = framingCircle({ geocodeCenter: null, homePin: HOME, radiusMiles: 35 })
    expect(framed).toEqual({ center: HOME, radiusMiles: 35 })
  })

  it('lets a geocoded center win over the home pin', () => {
    const framed = framingCircle({ geocodeCenter: GEO, homePin: HOME, radiusMiles: 10 })
    expect(framed?.center).toEqual(GEO)
  })

  it('returns null with no center to frame on (the caller keeps its mount view)', () => {
    expect(framingCircle({ geocodeCenter: null, homePin: null, radiusMiles: 5 })).toBeNull()
  })

  it('returns null for a non-positive radius (a degenerate box has no extent)', () => {
    expect(framingCircle({ geocodeCenter: GEO, homePin: HOME, radiusMiles: 0 })).toBeNull()
    expect(framingCircle({ geocodeCenter: GEO, homePin: HOME, radiusMiles: -5 })).toBeNull()
  })

  // ---------------------------------------------------------------------
  // V17 t04: the regression guard. With no searched subset the frame must be
  // IDENTICAL to pre-t04 for the same inputs. This is the assertion that fails
  // if anyone re-introduces a points-fit, or lets an empty/absent focus set
  // perturb the radius frame V16 t07 item 2 (`93f313b`) settled.
  // ---------------------------------------------------------------------
  it('is identical to pre-t04 when there is no query (the 93f313b guard)', () => {
    const cases = [
      { geocodeCenter: GEO, homePin: HOME, radiusMiles: 5 },
      { geocodeCenter: null, homePin: HOME, radiusMiles: 35 },
      { geocodeCenter: GEO, homePin: null, radiusMiles: 10 },
      { geocodeCenter: null, homePin: null, radiusMiles: 5 },
      { geocodeCenter: GEO, homePin: HOME, radiusMiles: 0 },
    ] as const
    for (const input of cases) {
      const expected = framingCircle({ ...input })
      // Absent and empty are both "no query" — a caller may pass either, and
      // both must return the pre-t04 answer unchanged.
      expect(framingCircle({ ...input, focusPoints: undefined })).toEqual(expected)
      expect(framingCircle({ ...input, focusPoints: [] })).toEqual(expected)
    }
    // …and the pre-t04 answers themselves are spelled out, so this test cannot
    // pass by both sides drifting together.
    expect(framingCircle({ geocodeCenter: GEO, homePin: HOME, radiusMiles: 5 })).toEqual({
      center: GEO,
      radiusMiles: 5,
    })
    expect(framingCircle({ geocodeCenter: null, homePin: HOME, radiusMiles: 35 })).toEqual({
      center: HOME,
      radiusMiles: 35,
    })
    expect(framingCircle({ geocodeCenter: null, homePin: null, radiusMiles: 5 })).toBeNull()
  })

  it('tightens to the searched subset when the matches sit inside the radius', () => {
    // Four points within ~2 miles of home, well inside a 5-mile radius.
    const focusPoints = [
      { lat: HOME.lat, lng: HOME.lng + 0.01 },
      { lat: HOME.lat + 0.01, lng: HOME.lng + 0.01 },
      { lat: HOME.lat + 0.02, lng: HOME.lng + 0.02 },
      { lat: HOME.lat + 0.01, lng: HOME.lng + 0.03 },
    ]
    const unfiltered = framingCircle({ geocodeCenter: null, homePin: HOME, radiusMiles: 5 })
    const framed = framingCircle({ geocodeCenter: null, homePin: HOME, radiusMiles: 5, focusPoints })
    expect(unfiltered).toEqual({ center: HOME, radiusMiles: 5 })
    expect(framed).not.toBeNull()
    expect(framed).not.toEqual(unfiltered)
    expect(framed?.radiusMiles).toBeLessThan(5)
    // Every matched point is INSIDE the returned circle — the results are
    // framed, not merely zoomed at.
    for (const point of focusPoints) {
      expect(distanceMiles(framed!.center, point)).toBeLessThanOrEqual(framed!.radiusMiles)
    }
  })

  it('never exceeds the viewer radius, even when the matches spread wider than it', () => {
    // Points a full degree apart in both axes — far further than 5 miles.
    const focusPoints = [
      { lat: HOME.lat - 0.5, lng: HOME.lng - 0.5 },
      { lat: HOME.lat + 0.5, lng: HOME.lng + 0.5 },
    ]
    expect(
      framingCircle({ geocodeCenter: null, homePin: HOME, radiusMiles: 5, focusPoints }),
    ).toEqual({ center: HOME, radiusMiles: 5 })
  })

  it('keeps the radius ceiling under a geocoded center too', () => {
    const spread = [
      { lat: GEO.lat - 1, lng: GEO.lng - 1 },
      { lat: GEO.lat + 1, lng: GEO.lng + 1 },
    ]
    expect(
      framingCircle({ geocodeCenter: GEO, homePin: HOME, radiusMiles: 2, focusPoints: spread }),
    ).toEqual({ center: GEO, radiusMiles: 2 })
  })

  it('a query with zero placed results falls back to the radius frame', () => {
    const framed = framingCircle({ geocodeCenter: null, homePin: HOME, radiusMiles: 5, focusPoints: [] })
    expect(framed).toEqual({ center: HOME, radiusMiles: 5 })
    expect(framed!.radiusMiles).toBeGreaterThan(0)
  })

  it('a single match (or many at one coordinate) never yields a zero-extent circle', () => {
    // V19 t01 AMENDED THIS TEST'S PREMISE. It originally asserted that a search
    // match 8 miles from home pulled the frame to that match at the 0.5-mile
    // floor. Founder ruling D1 (V19) supersedes that: the map ALWAYS frames the
    // neighbourhood around home, so a match outside the focus radius no longer
    // drags the frame to itself. The real invariant this test exists for — that
    // the frame is never a zero-extent circle — is preserved and asserted below
    // with a NEARBY match, which is the case where tightening still applies.
    const one = framingCircle({
      geocodeCenter: null,
      homePin: HOME,
      radiusMiles: 5,
      // ~200m from home: INSIDE any neighbourhood frame, so the search tightens.
      focusPoints: [{ lat: HOME.lat + 0.002, lng: HOME.lng + 0.002 }],
    })
    expect(one).not.toBeNull()
    expect(one?.radiusMiles).toBeGreaterThan(0)
    expect(one?.radiusMiles).toBe(MIN_FOCUS_RADIUS_MILES)

    const sameSpot = framingCircle({
      geocodeCenter: null,
      homePin: HOME,
      radiusMiles: 5,
      // Many results at one nearby coordinate — still zero extent, still floored.
      focusPoints: Array.from({ length: 12 }, () => ({ lat: HOME.lat + 0.002, lng: HOME.lng + 0.002 })),
    })
    expect(sameSpot?.radiusMiles).toBe(MIN_FOCUS_RADIUS_MILES)
    // The floor is still bounded by the ceiling: a viewer on a tiny radius is
    // never framed wider than the radius they asked for.
    expect(
      framingCircle({
        geocodeCenter: null,
        homePin: HOME,
        radiusMiles: 0.25,
        focusPoints: [{ lat: HOME.lat + 0.002, lng: HOME.lng + 0.002 }],
      })?.radiusMiles,
    ).toBe(0.25)
  })

  it('V19 t01: a match OUTSIDE the focus radius keeps the frame on home (D1)', () => {
    // The defect this rule fixes, measured: the founder's home is 98103, and a
    // search can easily match a place in another part of the city. Before V19,
    // `focusCenter` returned that far place, the extent around a single point
    // floored to 0.5 miles, and the result was a half-mile circle centred ~8
    // MILES from home — the home pin off the canvas entirely, which is exactly
    // what D1 forbids.
    const faraway = { lat: 47.61, lng: -122.33 } // ~7 miles from HOME
    const framed = framingCircle({
      geocodeCenter: null,
      homePin: HOME,
      radiusMiles: MAP_FOCUS_RADIUS_MILES,
      focusPoints: [faraway],
    })
    // The frame stays where home is, at the focus radius — not on the match.
    expect(framed?.center).toEqual(HOME)
    expect(framed?.radiusMiles).toBe(MAP_FOCUS_RADIUS_MILES)
  })

  it('falls back to the radius frame when no focus point carries usable coordinates', () => {
    expect(
      framingCircle({
        geocodeCenter: null,
        homePin: HOME,
        radiusMiles: 5,
        focusPoints: [{ lat: Number.NaN, lng: Number.NaN }],
      }),
    ).toEqual({ center: HOME, radiusMiles: 5 })
  })

  it('frames on the FINITE points when the set mixes finite and non-finite', () => {
    // V17 t04 review raised this as a latent hole: "`NaN > span` is false, so a
    // non-finite point leaves span at 0 and the frame collapses to the 0.5-mile
    // floor". I could not reproduce that, so I traced the loop rather than
    // trusting either the finding or my first test — and the premise does not
    // hold. `NaN > span` IS false, but that only matters if no LATER finite
    // point runs: with the guard REMOVED, [NaN, finite, finite] still returns
    // the correct 0.729 miles, because the finite points set span afterwards.
    // The only way span stays 0 is having NO finite point at all, which
    // `focusCenter` already catches by returning null (the case above).
    //
    // So this test documents the REAL contract rather than a bug that is not
    // there: the non-finite points are ignored, the finite ones size the frame,
    // and the center never drifts toward NaN. The guard in the span loop is kept
    // as defence in depth — it makes the two halves of the function agree about
    // which points count without relying on iteration order — but it is NOT
    // load-bearing, and the comment says so rather than overclaiming.
    //
    // Ordering is still varied deliberately (non-finite FIRST and LAST) so a
    // future change that makes the guard load-bearing shows up here.
    const nonFiniteFirst = [
      { lat: Number.NaN, lng: Number.NaN },
      { lat: HOME.lat + 0.02, lng: HOME.lng },
      { lat: HOME.lat + 0.04, lng: HOME.lng + 0.01 },
    ]
    const nonFiniteLast = [...nonFiniteFirst.slice(1), { lat: HOME.lat, lng: Number.POSITIVE_INFINITY }]
    for (const mixed of [nonFiniteFirst, nonFiniteLast]) {
      const framed = framingCircle({
        geocodeCenter: null,
        homePin: HOME,
        radiusMiles: 5,
        focusPoints: mixed,
      })
      expect(framed).not.toBeNull()
      expect(
        framed!.radiusMiles,
        'the frame must be sized by the usable points, not collapsed to the floor',
      ).toBeGreaterThan(MIN_FOCUS_RADIUS_MILES)
      // …and every USABLE point is still inside it, the seam's core promise.
      for (const point of mixed) {
        if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue
        expect(distanceMiles(framed!.center, point)).toBeLessThanOrEqual(framed!.radiusMiles)
      }
      // The unusable point must not have dragged the center toward NaN.
      expect(Number.isFinite(framed!.center.lat)).toBe(true)
      expect(Number.isFinite(framed!.center.lng)).toBe(true)
    }
  })

  it('centers on the searched subset, not on the viewer home pin', () => {
    // All matches cluster north of home: the returned center moves to them,
    // which is what "frames the results" means.
    const cluster = [
      { lat: HOME.lat + 0.02, lng: HOME.lng },
      { lat: HOME.lat + 0.04, lng: HOME.lng + 0.01 },
    ]
    const framed = framingCircle({ geocodeCenter: null, homePin: HOME, radiusMiles: 5, focusPoints: cluster })
    expect(framed?.center).not.toEqual(HOME)
    expect(framed!.center.lat).toBeGreaterThan(HOME.lat)
    for (const point of cluster) {
      expect(distanceMiles(framed!.center, point)).toBeLessThanOrEqual(framed!.radiusMiles)
    }
  })
})

describe('placeFollowIdSet (V17 t02: the place ids the caller follows, for the card heart)', () => {
  it('collects the followed PLACE ids (the membership the heart reads)', () => {
    const followed = placeFollowIdSet([
      { id: 'follow-1', place_id: 'place-a' },
      { id: 'follow-2', place_id: 'place-b' },
    ])
    expect([...followed].sort()).toEqual(['place-a', 'place-b'])
    expect(followed.has('place-a')).toBe(true)
    // The ROW id never leaks into the set — the heart asks about places.
    expect(followed.has('follow-1')).toBe(false)
  })

  it('skips a null place_id — that row is a FAMILY follow, never a card heart', () => {
    const followed = placeFollowIdSet([
      { id: 'follow-family', place_id: null },
      { id: 'follow-place', place_id: 'place-a' },
    ])
    expect([...followed]).toEqual(['place-a'])
  })

  it('skips a row with no place_id key at all (the same family case)', () => {
    expect(placeFollowIdSet([{ id: 'follow-family' }]).size).toBe(0)
  })

  it('skips a blank place_id — an empty string is not a place', () => {
    expect(placeFollowIdSet([{ id: 'follow-1', place_id: '' }]).size).toBe(0)
  })

  it('skips a blank or absent follow id — a row we cannot identify is not claimed', () => {
    const followed = placeFollowIdSet([
      { id: '', place_id: 'place-a' },
      { place_id: 'place-b' },
      { id: 'follow-3', place_id: 'place-c' },
    ])
    expect([...followed]).toEqual(['place-c'])
  })

  it('returns an empty set for no rows (the viewer who follows nothing)', () => {
    expect(placeFollowIdSet([]).size).toBe(0)
  })

  it('takes db.FollowRow rows directly — the input shape is structural', () => {
    // The seam reads `id` and `place_id` only, so BrowsePage hands over the
    // read's own row objects with no re-projection; the family row in the same
    // array is skipped.
    const rows = [
      { id: 'follow-family', followee_profile_id: 'profile-1', place_id: null },
      { id: 'follow-1', followee_profile_id: null, place_id: 'place-a' },
    ]
    const followed: Set<string> = placeFollowIdSet(rows)
    expect([...followed]).toEqual(['place-a'])
  })
})

/**
 * V18 t04: the photo credit line.
 *
 * This is a LICENCE-COMPLIANCE seam (CC BY / CC BY-SA require attribution), so
 * the cases that matter are the ones where it must stay SILENT: no photo, or a
 * photo whose attribution was never recorded. Showing a credit for the app's
 * own illustration would be a false statement about who made the drawing, and
 * showing an empty label would reserve card space for nothing.
 */
describe('photoCreditLine (V18 — the licence-compliance line)', () => {
  function place(overrides: Partial<Place>): Place {
    return {
      id: 'p1',
      name: 'Green Lake Park',
      kind: 'playground',
      address: '7201 E Green Lake Dr N',
      lat: 47.68,
      lng: -122.33,
      indoor: false,
      age_min: null,
      age_max: null,
      notes: null,
      photo_url: null,
      neighborhood_id: null,
      source: 'seattle-parks',
      ...overrides,
    }
  }

  it('returns null when there is no photo — the illustration is not credited to Commons', () => {
    expect(photoCreditLine(place({ photo_url: null }))).toBeNull()
  })

  it('treats an empty-string photo_url as no photo, matching PlacePhotoSlot exactly', () => {
    // PlacePhotoSlot's real branch is `!== null && !== ''`. If these two
    // conditions ever disagree, a credit could render on a slot showing the
    // illustration — so the agreement is pinned here rather than assumed.
    expect(photoCreditLine(place({ photo_url: '', photo_attribution: 'Someone / CC0' }))).toBeNull()
  })

  it('returns the stored line when there is a photo and an attribution', () => {
    expect(
      photoCreditLine(
        place({ photo_url: 'https://x/y.jpg', photo_attribution: 'en:user:Shakespeare / CC BY-SA 3.0' }),
      ),
    ).toBe('en:user:Shakespeare / CC BY-SA 3.0')
  })

  it('returns null for a photo with no recorded attribution, rather than inventing one', () => {
    expect(photoCreditLine(place({ photo_url: 'https://x/y.jpg', photo_attribution: null }))).toBeNull()
    expect(photoCreditLine(place({ photo_url: 'https://x/y.jpg' }))).toBeNull()
  })

  it('treats whitespace-only attribution as missing', () => {
    expect(photoCreditLine(place({ photo_url: 'https://x/y.jpg', photo_attribution: '   ' }))).toBeNull()
  })

  it('trims a padded attribution', () => {
    expect(
      photoCreditLine(place({ photo_url: 'https://x/y.jpg', photo_attribution: '  Someone / CC0  ' })),
    ).toBe('Someone / CC0')
  })
})

/**
 * V19 t01 — THE MAP FOCUS RADIUS (founder ruling D1).
 *
 * The policy is one constant plus one call site, and these tests pin BOTH halves
 * of the claim the founder cares about:
 *
 *   1. the map's frame radius is the FOCUS radius, always;
 *   2. that radius is NOT the picked list radius — the two are deliberately
 *      different values, and re-merging them is the regression this slice
 *      exists to prevent.
 *
 * Point 2 is why `MAP_FOCUS_RADIUS_MILES` is asserted to be strictly smaller
 * than every entry in `RADIUS_MILES_OPTIONS` except the smallest. If someone
 * later "simplifies" by making the map use the picked radius, these fail.
 */
describe('MAP_FOCUS_RADIUS_MILES (V19 t01 — D1: the map frames the neighbourhood)', () => {
  // The same home pin the `framingCircle` block uses, declared locally because
  // that block's constants are scoped to it.
  const HOME = { lat: 47.7, lng: -122.4 }

  it('is one mile — the founder asked for the "less than 1 mile view"', () => {
    expect(MAP_FOCUS_RADIUS_MILES).toBe(1)
  })

  it('is strictly tighter than the DEFAULT radius, so the map opens nearer than the list', () => {
    // The founder's own stored radius is 35 and the default is 5; the map must
    // frame tighter than both. This is the whole observable change.
    expect(MAP_FOCUS_RADIUS_MILES).toBeLessThan(DEFAULT_RADIUS_MILES)
  })

  it('is never wider than any radius the user can PICK for the list', () => {
    // Every selectable radius is >= 1 (RADIUS_MIN_MILES), so the map frame is
    // always at least as tight as the widest thing the user could have chosen —
    // which is what "always frames near home" means in practice.
    for (const miles of RADIUS_MILES_OPTIONS) {
      expect(MAP_FOCUS_RADIUS_MILES).toBeLessThanOrEqual(miles)
    }
  })

  it('is NOT the same value as the search floor — they are different jobs', () => {
    // MIN_FOCUS_RADIUS_MILES (0.5) is how tight a SEARCH may be framed;
    // MAP_FOCUS_RADIUS_MILES (1) is how wide the DEFAULT frame may be. Collapsing
    // them would either make the default frame too tight to read as "near me" or
    // stop a single-result search from tightening.
    expect(MAP_FOCUS_RADIUS_MILES).not.toBe(MIN_FOCUS_RADIUS_MILES)
    expect(MAP_FOCUS_RADIUS_MILES).toBeGreaterThan(MIN_FOCUS_RADIUS_MILES)
  })

  it('produces a frame the home pin sits at the centre of', () => {
    // The observable consequence of feeding the map the focus radius instead of
    // a 35-mile one: the frame is `radiusMiles: 1` about the home pin.
    const framed = framingCircle({
      geocodeCenter: null,
      homePin: HOME,
      radiusMiles: MAP_FOCUS_RADIUS_MILES,
    })
    expect(framed).toEqual({ center: HOME, radiusMiles: 1 })
  })

  it('cannot be widened by a search — a query only ever TIGHTENS the frame', () => {
    // V17 t04's cap, now measured against the focus radius: a focus point far
    // away must NOT push the frame wider than the neighbourhood view.
    const faraway = { lat: 48.9, lng: -122.4 } // ~85 miles north
    const framed = framingCircle({
      geocodeCenter: null,
      homePin: HOME,
      radiusMiles: MAP_FOCUS_RADIUS_MILES,
      focusPoints: [faraway],
    })
    expect(framed?.radiusMiles).toBe(MAP_FOCUS_RADIUS_MILES)
    expect(framed?.radiusMiles).toBeLessThan(5)
  })

  it('STILL tightens below the focus radius when the search matches nearby', () => {
    // The other direction: a nearby match frames tighter than 1 mile, floored at
    // MIN_FOCUS_RADIUS_MILES rather than collapsing to zero extent.
    const near = { lat: 47.7005, lng: -122.4005 } // a few dozen metres away
    const framed = framingCircle({
      geocodeCenter: null,
      homePin: HOME,
      radiusMiles: MAP_FOCUS_RADIUS_MILES,
      focusPoints: [near],
    })
    expect(framed?.radiusMiles).toBe(MIN_FOCUS_RADIUS_MILES)
  })
})

/**
 * V19 t02 — the feed map's pins.
 *
 * Two rules carry real product weight here, and both are about NOT lying with a
 * map pin: a post with no location gets no pin (a pin is a spatial claim), and
 * posts at the same place collapse to one dot (two dots on one pixel is an
 * unclickable pile).
 */
describe('feedMapPins (V19 t02 — the feed map)', () => {
  it('returns a pin for every post that has real coordinates', () => {
    const pins = feedMapPins([
      { place: 'Green Lake', place_coords: { lat: 47.67, lng: -122.38 } },
      { place: 'Alki', place_coords: { lat: 47.68, lng: -122.39 } },
    ])
    expect(pins.map((p) => [p.lat, p.lng])).toEqual([
      [47.67, -122.38],
      [47.68, -122.39],
    ])
  })

  /**
   * THE FIX THE `ocr` LANE FORCED.
   *
   * The first version returned bare coordinates, and FeedPage synthesised
   * `id: 'feed-pin-0'` around them. The map's marker panel then offered "Start
   * a drop-in", which hands `/new` that id as `placeId` — and
   * `playdates.place_id` is a uuid with an FK to places(id), so the post would
   * fail on submit. These tests pin the identity that prevents it.
   */
  it('carries the REAL place id when the post links a directory place', () => {
    const pins = feedMapPins([
      {
        place: 'Ballard Corners Park',
        place_id: '26a77f22-7f99-4bd5-88df-4169b91ae7c7',
        place_coords: { lat: 47.6743, lng: -122.3791 },
      },
    ])
    expect(pins[0].placeId).toBe('26a77f22-7f99-4bd5-88df-4169b91ae7c7')
    expect(pins[0].name).toBe('Ballard Corners Park')
  })

  it('carries a NULL place id for a free-text post, never a synthesised one', () => {
    // A free-text post can still have coordinates (from its address) but it has
    // NO directory row, so there is no id to hand to a place action. Null is the
    // honest answer; a fake id is what broke posting.
    const pins = feedMapPins([
      { place: 'Somewhere else entirely', place_id: null, place_coords: { lat: 47.67, lng: -122.38 } },
    ])
    expect(pins).toHaveLength(1)
    expect(pins[0].placeId).toBeNull()
    // The parent's own words survive, so the panel can still say where it is.
    expect(pins[0].name).toBe('Somewhere else entirely')
  })

  it('gives NO pin to a post with no coordinates at all', () => {
    // The "Somewhere else" case with no resolvable location: `place_coords` is
    // null, so the map must not invent one — a made-up pin sends a parent to
    // the wrong park.
    expect(feedMapPins([{ place: 'Somewhere', place_coords: null }])).toEqual([])
    expect(feedMapPins([{ place: 'Somewhere' }])).toEqual([])
    expect(feedMapPins([{ place_coords: { lat: null, lng: null } }])).toEqual([])
  })

  it('collapses several drop-ins at ONE place into a single pin', () => {
    // A morning and an afternoon session at the same park: the LIST shows both
    // (they are separate drop-ins), but the map draws one dot, because two dots
    // on the identical pixel cannot be told apart or clicked separately.
    const id = '26a77f22-7f99-4bd5-88df-4169b91ae7c7'
    const pins = feedMapPins([
      { place_id: id, place_coords: { lat: 47.67, lng: -122.38 } },
      { place_id: id, place_coords: { lat: 47.67, lng: -122.38 } },
      { place_id: id, place_coords: { lat: 47.67, lng: -122.38 } },
    ])
    expect(pins).toHaveLength(1)
  })

  it('collapses two free-text posts at one coordinate too (no id to key on)', () => {
    const pins = feedMapPins([
      { place: 'A', place_coords: { lat: 47.67, lng: -122.38 } },
      { place: 'B', place_coords: { lat: 47.67, lng: -122.38 } },
    ])
    expect(pins).toHaveLength(1)
  })

  it('keeps pins that differ by a hair — they are genuinely different spots', () => {
    const pins = feedMapPins([
      { place_coords: { lat: 47.67, lng: -122.38 } },
      { place_coords: { lat: 47.6701, lng: -122.38 } },
    ])
    expect(pins).toHaveLength(2)
  })

  it('preserves input order rather than re-sorting', () => {
    // A map draws in the order it is given; the caller's order is a display
    // decision (soonest first), not something this seam should re-rank.
    const pins = feedMapPins([
      { place_coords: { lat: 47.9, lng: -122.1 } },
      { place_coords: { lat: 47.1, lng: -122.9 } },
    ])
    expect(pins[0]).toMatchObject({ lat: 47.9, lng: -122.1 })
  })

  it('accepts an empty feed', () => {
    expect(feedMapPins([])).toEqual([])
  })

  it('trims the place text and tolerates it being absent', () => {
    const pins = feedMapPins([{ place: '  Green Lake  ', place_coords: { lat: 47.67, lng: -122.38 } }])
    expect(pins[0].name).toBe('Green Lake')
    const noName = feedMapPins([{ place_coords: { lat: 47.67, lng: -122.38 } }])
    expect(noName[0].name).toBe('')
  })

  /**
   * V25 t07 — THE COLLAPSE ACCUMULATES.
   *
   * Rule 2 makes one dot stand for 1..N drop-ins, which is exactly why the pin
   * has to CARRY all of them: a bubble that names one of two sessions presents a
   * choice as the whole truth. These tests pin the accumulation, and they are the
   * reason `feedMapPins` stopped keeping a `Set` of seen keys.
   */
  it('keeps EVERY drop-in behind a collapsed pin, in input order (V25 t07)', () => {
    const id = '26a77f22-7f99-4bd5-88df-4169b91ae7c7'
    const pins = feedMapPins([
      {
        id: 'morning',
        title: 'Morning session',
        starts_at: '2026-09-26T09:00:00',
        ends_at: '2026-09-26T10:30:00',
        place: 'Ballard Corners Park',
        place_id: id,
        place_coords: { lat: 47.6743, lng: -122.3791 },
      },
      {
        id: 'afternoon',
        title: 'Afternoon session',
        starts_at: '2026-09-26T14:00:00',
        ends_at: '2026-09-26T15:00:00',
        place: 'Ballard Corners Park',
        place_id: id,
        place_coords: { lat: 47.6743, lng: -122.3791 },
      },
    ])
    expect(pins).toHaveLength(1)
    // Both, not just the first — the whole point of the ticket's collapse rule.
    expect(pins[0].events.map((event) => event.id)).toEqual(['morning', 'afternoon'])
    expect(pins[0].events.map((event) => event.title)).toEqual([
      'Morning session',
      'Afternoon session',
    ])
    // The first post at the place still owns the pin's identity (unchanged).
    expect(pins[0].name).toBe('Ballard Corners Park')
    expect(pins[0].placeId).toBe(id)
  })

  it('keeps every event on a FREE-TEXT pin collapsed by coordinate (V25 t07)', () => {
    // Nothing to key a place on, so the coordinate collapse applies — and the
    // ticket's free-text bullet is exactly this case: no directory id, and the
    // event must still be nameable.
    const pins = feedMapPins([
      {
        id: 'text-1',
        title: 'Rooftop play',
        starts_at: '2026-09-26T09:00:00',
        ends_at: '2026-09-26T10:00:00',
        place: 'Somewhere else entirely',
        place_coords: { lat: 47.67, lng: -122.38 },
      },
      {
        id: 'text-2',
        title: 'Second rooftop play',
        starts_at: '2026-09-26T11:00:00',
        ends_at: '2026-09-26T12:00:00',
        place: 'Somewhere else entirely',
        place_coords: { lat: 47.67, lng: -122.38 },
      },
    ])
    expect(pins).toHaveLength(1)
    expect(pins[0].placeId).toBeNull()
    expect(pins[0].events.map((event) => event.id)).toEqual(['text-1', 'text-2'])
  })

  it('contributes NO event for a post with no id — and still draws its pin (V25 t07)', () => {
    // There is no `/playdate/:id` behind a post with no id, so there is no event
    // this seam can name. The PIN is unaffected (rule 1/2 are about location).
    const pins = feedMapPins([
      { title: 'Nameless', place: 'Green Lake', place_coords: { lat: 47.67, lng: -122.38 } },
    ])
    expect(pins).toHaveLength(1)
    expect(pins[0].events).toEqual([])
    expect(feedMapPinEvent(pins[0])).toBeNull()
  })

  it('contributes NO event when the window does not parse, rather than "Invalid Date" (V25 t07)', () => {
    // `cardWhenLabel` would print the unparseable half verbatim
    // (`formatTimeWindow`'s `Invalid Date`), which is a popup that lies. The
    // refusal is the honest answer; real rows are NOT NULL timestamptz.
    const badStart = feedMapPins([
      {
        id: 'x',
        title: 'X',
        starts_at: 'not a date',
        ends_at: '2026-09-26T10:00:00',
        place_coords: { lat: 47.67, lng: -122.38 },
      },
    ])
    expect(badStart[0].events).toEqual([])
    const badEnd = feedMapPins([
      {
        id: 'x',
        title: 'X',
        starts_at: '2026-09-26T09:00:00',
        ends_at: '',
        place_coords: { lat: 47.67, lng: -122.38 },
      },
    ])
    expect(badEnd[0].events).toEqual([])
    // A missing title is not a missing event: the bubble gets a name.
    const untitled = feedMapPins([
      {
        id: 'x',
        title: '   ',
        starts_at: '2026-09-26T09:00:00',
        ends_at: '2026-09-26T10:00:00',
        place_coords: { lat: 47.67, lng: -122.38 },
      },
    ])
    expect(untitled[0].events[0].title).toBe('Drop-in')
  })
})

/**
 * V25 t07 — THE BUBBLE'S OWN DECISIONS.
 *
 * The founder, on `/`: tapping a blue circle should tell you "the name of the
 * event that's happening there and some information about that". The pin can
 * stand for SEVERAL drop-ins (rule 2), so these tests pin the two halves of the
 * honest answer: WHICH event is named (the soonest, by data rather than by the
 * caller's sort) and HOW the rest are disclosed (a count, never silence).
 */
describe('feedMapPinEvent (V25 t07 — the feed pin\'s popup payload)', () => {
  const pinOf = (events: FeedMapPinEvent[]): FeedMapPin => ({
    placeId: null,
    name: 'Ballard Corners Park',
    address: 'Ballard, Seattle',
    lat: 47.6743,
    lng: -122.3791,
    events,
  })
  const at = (id: string, title: string, startsAt: string, endsAt: string): FeedMapPinEvent => ({
    id,
    title,
    startsAt,
    endsAt,
  })

  it('names the event: its title, the CARD\'s own when line, and the /playdate door', () => {
    const event = feedMapPinEvent(
      pinOf([at('aaaaaaaa-1111-4111-8111-111111111111', 'Pumpkin painting', '2026-09-26T17:00:00', '2026-09-26T18:30:00')]),
    )
    expect(event).not.toBeNull()
    expect(event?.title).toBe('Pumpkin painting')
    expect(event?.playdateId).toBe('aaaaaaaa-1111-4111-8111-111111111111')
    // ONE window rule: the bubble's line IS `cardWhenLabel`'s, so a feed card
    // and the bubble over its pin cannot disagree about the same drop-in.
    expect(event?.whenLabel).toBe(cardWhenLabel('2026-09-26T17:00:00', '2026-09-26T18:30:00'))
    // And it really is a day + window, not an empty or generic string. The DAY
    // is locale-independent by construction (`formatStartDayLabel`'s own tables).
    expect(event?.whenLabel.startsWith('Sat, Sep 26 · ')).toBe(true)
    expect(event?.href).toBe('/playdate/aaaaaaaa-1111-4111-8111-111111111111')
    // One drop-in says nothing about others.
    expect(event?.moreLabel).toBeNull()
  })

  it('encodes the id in the href so a path segment cannot break', () => {
    const event = feedMapPinEvent(pinOf([at('a/b', 'Split', '2026-09-26T09:00:00', '2026-09-26T10:00:00')]))
    expect(event?.href).toBe('/playdate/a%2Fb')
  })

  /**
   * THE NON-VACUOUS HALF. `events[0]` would name the AFTERNOON session here,
   * because input order is the caller's business (rule 3). The bubble's claim is
   * "the soonest", so it must read the data.
   */
  it('names the SOONEST event, not the first one in the list', () => {
    const event = feedMapPinEvent(
      pinOf([
        at('afternoon', 'Afternoon session', '2026-09-26T14:00:00', '2026-09-26T15:00:00'),
        at('morning', 'Morning session', '2026-09-26T09:00:00', '2026-09-26T10:30:00'),
      ]),
    )
    expect(event?.playdateId).toBe('morning')
    expect(event?.title).toBe('Morning session')
    // And the second drop-in is DISCLOSED rather than hidden.
    expect(event?.moreLabel).toBe('1 more drop-in here')
  })

  it('keeps input order when two events start at the same instant', () => {
    const both = [
      at('first', 'First', '2026-09-26T09:00:00', '2026-09-26T10:00:00'),
      at('second', 'Second', '2026-09-26T09:00:00', '2026-09-26T10:00:00'),
    ]
    expect(soonestFeedPinEvent(both)?.id).toBe('first')
  })

  it('skips an unparseable start rather than letting it win', () => {
    const events = [
      at('bad', 'Bad', 'not a date', '2026-09-26T10:00:00'),
      at('good', 'Good', '2026-09-26T09:00:00', '2026-09-26T10:00:00'),
    ]
    expect(soonestFeedPinEvent(events)?.id).toBe('good')
    // Nothing parses at all: the first member stands, so the rule is total.
    expect(soonestFeedPinEvent([events[0], at('bad2', 'Bad 2', '', '')])?.id).toBe('bad')
  })

  it('returns null for a pin with no events, and for the empty list', () => {
    expect(feedMapPinEvent(pinOf([]))).toBeNull()
    expect(soonestFeedPinEvent([])).toBeNull()
  })

  it('states the overflow in one place: 0 → nothing, 1 → singular, N → plural', () => {
    expect(pinMoreDropInsLabel(0)).toBeNull()
    expect(pinMoreDropInsLabel(-1)).toBeNull()
    expect(pinMoreDropInsLabel(1)).toBe('1 more drop-in here')
    expect(pinMoreDropInsLabel(2)).toBe('2 more drop-ins here')
    // Three drop-ins behind one dot: the bubble names one and counts the rest.
    const event = feedMapPinEvent(
      pinOf([
        at('a', 'A', '2026-09-26T09:00:00', '2026-09-26T10:00:00'),
        at('b', 'B', '2026-09-26T11:00:00', '2026-09-26T12:00:00'),
        at('c', 'C', '2026-09-26T13:00:00', '2026-09-26T14:00:00'),
      ]),
    )
    expect(event?.playdateId).toBe('a')
    expect(event?.moreLabel).toBe('2 more drop-ins here')
  })
})

/**
 * V23 slice 4/5: the two new link seams. Both are pure string builders, and
 * both exist so a path/URL is spelled in exactly ONE place — the tests below
 * pin the properties the callers depend on (encoding, the address's
 * disambiguating role, and the honest null).
 */
describe('placeDetailsPath (V23 slice 4)', () => {
  it('builds the details path beside placePath', () => {
    expect(placeDetailsPath('abc-123')).toBe('/place/abc-123/details')
  })

  it('encodes an id that would otherwise break the segment', () => {
    expect(placeDetailsPath('a/b')).toBe('/place/a%2Fb/details')
  })

  it('is a strict extension of placePath — same prefix, one more segment', () => {
    const id = '3130badc-57bd-42da-93a7-e38019b3d82c'
    expect(placeDetailsPath(id).startsWith(placePath(id))).toBe(true)
    expect(placeDetailsPath(id).slice(placePath(id).length)).toBe('/details')
  })
})

describe('placeWebSearchHref (V23 slice 5)', () => {
  it('searches the name alone when there is no address', () => {
    expect(placeWebSearchHref({ name: 'Green Lake Park' })).toBe(
      'https://www.google.com/search?q=Green%20Lake%20Park',
    )
  })

  it('adds the address when present, because it is what disambiguates', () => {
    const href = placeWebSearchHref({
      name: 'Green Lake Park',
      address: '7201 East Green Lake Dr N',
    })
    expect(href).toBe(
      'https://www.google.com/search?q=' +
        encodeURIComponent('Green Lake Park, 7201 East Green Lake Dr N'),
    )
  })

  it('does not leave a stray comma for a blank or null address', () => {
    expect(placeWebSearchHref({ name: 'Baker Park', address: '   ' })).toBe(
      'https://www.google.com/search?q=Baker%20Park',
    )
    expect(placeWebSearchHref({ name: 'Baker Park', address: null })).toBe(
      'https://www.google.com/search?q=Baker%20Park',
    )
  })

  it('trims the name rather than searching its whitespace', () => {
    expect(placeWebSearchHref({ name: '  Baker Park  ' })).toBe(
      'https://www.google.com/search?q=Baker%20Park',
    )
  })

  it('returns null for a nameless place — the caller hides the link', () => {
    expect(placeWebSearchHref({ name: '' })).toBeNull()
    expect(placeWebSearchHref({ name: '   ' })).toBeNull()
  })

  it('ships the one label the callers render', () => {
    expect(PLACE_WEB_SEARCH_LABEL).toBe('Search the web for this place')
  })
})

describe('placeKindChips + kindEmptyCopy (V25 t03, the category chip row)', () => {
  it('ships exactly PLACE_KIND_CHIP_KINDS — the eight kinds with rows — in PLACE_KINDS order', () => {
    // The row's set is the app's own taxonomy MINUS the kinds a chip could only
    // ever return empty for. The exact-set assertion is what makes that
    // deliberate: a kind added to PLACE_KINDS must be consciously added here (or
    // consciously withheld), and it cannot silently disappear from the row.
    const chips = placeKindChips([])
    expect(chips.map((chip) => chip.kind)).toEqual([...PLACE_KIND_CHIP_KINDS])
    expect(chips.length).toBe(8)
    // The words come from placeKindLabel — the SAME words the filter sheet's chips
    // and the list's group headings render. No second label map.
    expect(chips.map((chip) => chip.label)).toEqual(
      PLACE_KIND_CHIP_KINDS.map((kind) => placeKindLabel(kind)),
    )
    // In PLACE_KINDS order: filtering the taxonomy, never re-sorting it.
    const order = PLACE_KINDS.filter((kind) => placeKindChips([]).some((c) => c.kind === kind))
    expect(chips.map((chip) => chip.kind)).toEqual(order)
  })

  it('withholds the chips that could only ever return an empty list (park, trail) — while the KINDS stay real', () => {
    // The founder's binding decision: no chip that can only ever come back empty.
    // Live and in the 0029 seed, park and trail both hold 0 of 239 rows.
    const kinds: readonly string[] = placeKindChips([]).map((chip) => chip.kind)
    expect(kinds).not.toContain('park')
    expect(kinds).not.toContain('trail')
    // But the KIND is NOT deleted from the app: the taxonomy, its label, the
    // filter sheet's chips (which iterate PLACE_KINDS) and the list's group
    // headings all still carry them, so a seed row would surface immediately.
    expect([...PLACE_KINDS]).toContain('park')
    expect([...PLACE_KINDS]).toContain('trail')
    expect(placeKindLabel('park')).toBe('Park')
    expect(placeKindLabel('trail')).toBe('Trail')
  })

  it('flags a kind empty ONLY when the loaded directory really holds no row of it — and never while the read is unknown', () => {
    const rows = [
      place({ name: 'Green Lake Pool', kind: 'pool' }),
      place({ name: 'Madison Pool', kind: 'pool' }),
    ]
    const chips = placeKindChips(rows)
    const chip = (kind: PlaceKind) => chips.find((c) => c.kind === kind)
    // A kind with rows is never flagged…
    expect(chip('pool')?.empty).toBe(false)
    // …and a shipped kind that measures empty at runtime IS (the flag is a
    // measurement of the loaded directory, not a claim about the seed), which is
    // what lets the empty state name it instead of the generic copy.
    expect(chip('playground')?.empty).toBe(true)
    expect(chip('museum')?.empty).toBe(true)
    // `places === null` is UNKNOWN, not empty: claiming emptiness before the read
    // answers would put an honest-sounding lie in front of the parent.
    expect(placeKindChips(null).some((c) => c.empty)).toBe(false)
  })

  it('names the selected label in the honest zero-row copy — including a kind only the sheet can select', () => {
    expect(kindEmptyCopy('Park')).toBe('No “Park” places in the directory yet.')
    // The words travel from placeKindLabel, so the copy can never drift from the
    // selection that opened the state. Every kind is covered, including the two
    // the ROW withholds: the filter sheet still lists them, so their empty state
    // is reachable and must be just as honest.
    for (const kind of PLACE_KINDS) {
      expect(kindEmptyCopy(placeKindLabel(kind))).toContain(placeKindLabel(kind))
    }
  })

  it('ships no chip for a category the schema cannot express (food, zoo, coffee)', () => {
    // The wife's list names food and a zoo; the thing she cares about most is
    // "whether or not there's a coffee shop nearby". The 0029 CHECK has no such
    // value (`food`/`zoo` are not kinds) and the directory has no amenity or POI
    // data, so a chip for any of them would return nothing FOREVER. This pins
    // that absence — the honest open question on ticket 03 — rather than letting
    // a later "let's add the missing categories" diff quietly ship a dead chip.
    const kinds: readonly string[] = placeKindChips([]).map((chip) => chip.kind)
    for (const unsupported of ['food', 'zoo', 'cafe', 'coffee', 'restaurant']) {
      expect(kinds).not.toContain(unsupported)
    }
  })

  it('names those unshippable categories in RENDERED copy, not only in a comment', () => {
    // The decision requires the withholding to be visible to the parent: the row
    // carries one quiet line naming food, a zoo and a coffee shop nearby. Without
    // this assertion the naming could be deleted and every other test would pass.
    for (const named of ['food', 'zoo', 'coffee']) {
      expect(PLACE_KIND_MISSING_NOTE.toLowerCase()).toContain(named)
    }
    // It is a statement, not an apology or a promise, and it is not a control.
    expect(PLACE_KIND_MISSING_NOTE).toContain('We don’t have that data yet.')
  })
})

describe('planDirectoryList (the directory list composition, moved out of PlaceDirectory)', () => {
  const HOME_PIN = { lat: 47.66757, lng: -122.37789 } // 98107, the viewer's home pin
  const GEO_CENTER = { lat: 47.68, lng: -122.32 } // a geocoded "Set location" center
  const PARK_A = place({ name: 'Alki Beach Park', kind: 'park' })
  // ~9.4 mi from the viewer (the seeded 98007 gazetteer entry) — inside a 20-mile
  // radius, outside a 5-mile one. The fixture's geography is what makes the
  // radius assertions below mean something about the actual city. Its OWN lat/lng
  // are deliberately null: resolveMapCoords falls back to the zip embedded in the
  // address (the 0012 fallback), which is exactly the seam these tests exercise.
  const PLAY_B = place({
    name: 'Bellevue Playground',
    kind: 'playground',
    address: '1 X St, Bellevue, WA 98007',
    lat: null,
    lng: null,
  })
  const DIR = [PARK_A, PLAY_B]
  // Fixed "now" for date-window tests: local Fri Sep 4 2026 12:00.
  const NOW_ISO = new Date(2026, 8, 4, 12, 0).toISOString()

  function plan(overrides: Partial<Parameters<typeof planDirectoryList>[0]> = {}) {
    return planDirectoryList({
      places: DIR,
      query: '',
      indoorFilter: null,
      distanceChoice: 'any',
      viewerRadius: 5,
      selectedKinds: new Set(),
      radiusFilter: null,
      dateWindow: 'upcoming',
      sortMode: 'alpha',
      homeZip: '98107',
      homePin: HOME_PIN,
      geocodeCenter: null,
      radiusMiles: 5,
      zipCoords: ZIP_COORDS,
      upcomingStartTimes: null,
      nowIso: NOW_ISO,
      ...overrides,
    })
  }

  it('plain case: no center, no filters — the full browse list in name order', () => {
    const p = plan()
    expect(p.listRows.map((r) => r.place.name)).toEqual(['Alki Beach Park', 'Bellevue Playground'])
    expect(p.rows).toStrictEqual(p.listRows) // the unfiltered path IS the browse rows
    expect(p.effectiveRows).toStrictEqual(p.rows) // no center → effectiveRows is the same rows
    // A place with no coordinates of its own is UNPLACED — its address does not
    // place it (distanceMiles uses only the place's own lat/lng, never the zip
    // gazetteer fallback that resolveMapCoords provides for map markers).
    expect(p.placed.length).toBe(1)
    expect(p.placed[0].place.name).toBe('Alki Beach Park')
    expect(p.unplaced.length).toBe(1)
    expect(p.unplaced[0].place.name).toBe('Bellevue Playground')
    expect(p.radiusIsTheReason).toBe(false)
    expect(p.nothingMatches).toBe(false)
  })

  it('the open-now gate keeps only places whose schedule says open, and explains an empty list', () => {
    const openNow = place({
      name: 'Open Playground',
      hours: { display: '6:00 AM – 10:00 PM', weekly: { '5': [['06:00', '22:00']] } },
      hours_source: 'city_default',
    })
    const closedNow = place({
      name: 'Closed Playground',
      hours: { display: '6:00 PM – 10:00 PM', weekly: { '5': [['18:00', '22:00']] } },
      hours_source: 'osm',
    })
    // No hours at all: UNKNOWN must never be shown as open.
    const unknown = place({ name: 'Unknown Playground' })

    const filtered = plan({ places: [openNow, closedNow, unknown], openNowOnly: true })
    expect(filtered.listRows.map((r) => r.place.name)).toEqual(['Open Playground'])
    expect(filtered.openNowReason).toBe(false)

    const none = plan({ places: [closedNow, unknown], openNowOnly: true })
    expect(none.listRows).toEqual([])
    expect(none.openNowReason).toBe(true)

    // Off by default: the same directory keeps every row.
    expect(plan({ places: [openNow, closedNow, unknown] }).listRows.length).toBe(3)
  })

  it('a kind filter narrows the list to that kind only', () => {
    const p = plan({ selectedKinds: new Set(['park']) })
    expect(p.listRows.map((r) => r.place.name)).toEqual(['Alki Beach Park'])
    // The map still shows the FULL placed set — the kind filter never hides a marker.
    // Placement depends on the place's own coordinates, not on kind, so `placed`
    // here is the same single row as in the plain case.
    expect(p.placed.length).toBe(1)
    expect(p.placed[0].place.name).toBe('Alki Beach Park')
    expect(p.nothingMatches).toBe(false)
  })

  it('a radius filter keeps only places within the miles of the home pin', () => {
    const wide = plan({ radiusFilter: 20 })
    expect(wide.listRows.length).toBe(2)
    const tight = plan({ radiusFilter: 5 })
    expect(tight.listRows.map((r) => r.place.name)).toEqual(['Alki Beach Park'])
    // A radius filter with NO home pin is a no-op (nothing to measure from).
    expect(plan({ radiusFilter: 5, homePin: null }).listRows.length).toBe(2)
  })

  it('a geocoded center switches the list to effectiveRows, re-measured from the pin', () => {
    // GEO_CENTER sits on Green Lake (~2.5 mi from home): inside a 5-mile radius,
    // far outside the ~9.4-mile Bellevue place.
    const p = plan({ geocodeCenter: GEO_CENTER, radiusMiles: 5 })
    expect(p.listRows).toStrictEqual(p.effectiveRows)
    expect(p.listRows.map((r) => r.place.name)).toEqual(['Alki Beach Park'])
    // Distances are measured FROM the geocoded center (not nulled), so the row
    // leaves the unplaced bucket and every card shows a true distance from the pin.
    expect(p.listRows[0].distanceMiles).not.toBeNull()
    expect(p.unplaced.length).toBe(0)
  })

  it('radiusIsTheReason is true ONLY when the radius is actually why nothing shows', () => {
    // True: a non-null maxMiles ('profile'), zero placed rows, no search text, no indoor filter.
    // PLAY_B alone: its zip resolves, but ~9.4 mi > the 5-mile profile radius,
    // so browsePlaces drops it and `placed` is empty — the radius is the reason.
    expect(
      plan({ distanceChoice: 'profile', viewerRadius: 5, places: [PLAY_B] }).radiusIsTheReason,
    ).toBe(true)
    // False: a search text is present (the radius is not the whole story).
    expect(
      plan({ distanceChoice: 'profile', viewerRadius: 5, places: [PLAY_B], query: 'x' }).radiusIsTheReason,
    ).toBe(false)
    // False: an indoor filter is set.
    expect(
      plan({ distanceChoice: 'profile', viewerRadius: 5, places: [PLAY_B], indoorFilter: true }).radiusIsTheReason,
    ).toBe(false)
    // False: maxMiles is null ('any' has no ceiling, so there is no radius reason).
    expect(plan({ places: [] }).radiusIsTheReason).toBe(false)
  })

  it('radiusReason carries the numeric radius exactly when radiusIsTheReason holds — and stays in sync with it', () => {
    // All four conditions hold → the field is non-null and carries the number.
    const hit = plan({ distanceChoice: 'profile', viewerRadius: 7, places: [PLAY_B] })
    expect(hit.radiusReason).toEqual({ radiusMiles: 7 })
    expect(hit.radiusIsTheReason).toBe(true)

    // Each failing condition keeps the field null (and the flag false):
    // a search text…
    expect(
      plan({ distanceChoice: 'profile', viewerRadius: 7, places: [PLAY_B], query: 'x' }).radiusReason,
    ).toBeNull()
    // …an indoor filter…
    expect(
      plan({ distanceChoice: 'profile', viewerRadius: 7, places: [PLAY_B], indoorFilter: true }).radiusReason,
    ).toBeNull()
    // …a non-empty placed set…
    expect(plan({ distanceChoice: 'profile', viewerRadius: 20 }).radiusReason).toBeNull()
    // …and 'any', where maxMiles is null by construction — there is no radius to blame.
    expect(plan({ places: [] }).radiusReason).toBeNull()
    expect(plan({ places: [] }).radiusIsTheReason).toBe(false)

    // The two fields never disagree: the flag is exactly the null-check on the field.
    for (const p of [
      plan(),
      plan({ distanceChoice: 'profile', viewerRadius: 7, places: [PLAY_B] }),
      plan({ distanceChoice: 'profile', viewerRadius: 7, places: [PLAY_B], query: 'x' }),
      plan({ places: [] }),
    ]) {
      expect(p.radiusIsTheReason).toBe(p.radiusReason !== null)
    }
  })

  it('nothingMatches is true only when BOTH the list and the unplaced section are empty', () => {
    // An empty directory empties both sections.
    expect(plan({ places: [] }).nothingMatches).toBe(true)
    // A kind filter that matches nothing empties the list AND its unplaced section.
    expect(plan({ selectedKinds: new Set(['beach']) }).nothingMatches).toBe(true)
    // But an UNFILTERED empty list still shows the unplaced section → false.
    expect(plan().nothingMatches).toBe(false)
  })

  describe('the date chips (annotation 15): Upcoming / Today / Tomorrow / Weekend', () => {
    // The upcoming map is what makes the window assertions mean something:
    // PARK_A has drop-ins, PLAY_B does not. Both carry coordinates of their own
    // (the `place` fixture), so neither lands in the unplaced section — a window
    // that excludes one leaves the other, never an empty page.
    // Fixed "now": local Fri Sep 4 2026 12:00. The three windows are DIFFERENT:
    //   today    → a drop-in starting on Fri Sep 4
    //   tomorrow → a drop-in starting on Sat Sep 5
    //   weekend  → a drop-in starting on Sat Sep 6 or Sun Sep 7 (upcoming weekend)
    const TODAY_START = new Date(2026, 8, 4, 9, 0).toISOString() // Fri Sep 4 09:00
    const TOMORROW_START = new Date(2026, 8, 5, 9, 0).toISOString() // Sat Sep 5 09:00
    const WEEKEND_SAT_START = new Date(2026, 8, 6, 18, 0).toISOString() // Sat Sep 6 18:00
    const WEEKEND_SUN_START = new Date(2026, 8, 7, 10, 0).toISOString() // Sun Sep 7 10:00
    // Alki has a drop-in today; Bellevue has none.
    const UPCOMING_TIMES = new Map([
      ['alki-beach-park', [TODAY_START]],
      ['bellevue-playground', []],
    ])
    // A place with a drop-in tomorrow (Sat Sep 5) but NOT today.
    const TOMORROW_TIMES = new Map([
      ['alki-beach-park', [TOMORROW_START]],
      ['bellevue-playground', []],
    ])
    // A place with a drop-in on Saturday of the upcoming weekend.
    const WEEKEND_TIMES = new Map([
      ['alki-beach-park', [WEEKEND_SAT_START]],
      ['bellevue-playground', []],
    ])
    // A place with a drop-in on Sunday of the upcoming weekend.
    const WEEKEND_SUN_TIMES = new Map([
      ['alki-beach-park', [WEEKEND_SUN_START]],
      ['bellevue-playground', []],
    ])

    it('each chip selects the right rows for its window — the three windows DIFFER', () => {
      // 'today' keeps only places with a drop-in starting on today's local day.
      expect(
        plan({ upcomingStartTimes: UPCOMING_TIMES, dateWindow: 'today' }).listRows.map((r) => r.place.name),
      ).toEqual(['Alki Beach Park'])
      // 'tomorrow' keeps only places with a drop-in starting on tomorrow's local day.
      // A drop-in starting TODAY does NOT satisfy 'tomorrow'.
      expect(
        plan({ upcomingStartTimes: UPCOMING_TIMES, dateWindow: 'tomorrow' }).listRows.map((r) => r.place.name),
      ).toEqual([])
      // 'weekend' keeps only places with a drop-in on the upcoming Saturday or Sunday.
      // A drop-in starting today (Fri) does NOT satisfy 'weekend'.
      expect(
        plan({ upcomingStartTimes: UPCOMING_TIMES, dateWindow: 'weekend' }).listRows.map((r) => r.place.name),
      ).toEqual([])
      // A drop-in starting tomorrow (Sat Sep 5) satisfies 'tomorrow' but NOT 'weekend'
      // (the upcoming weekend is Sep 6–7, not Sep 5).
      expect(
        plan({ upcomingStartTimes: TOMORROW_TIMES, dateWindow: 'tomorrow' }).listRows.map((r) => r.place.name),
      ).toEqual(['Alki Beach Park'])
      expect(
        plan({ upcomingStartTimes: TOMORROW_TIMES, dateWindow: 'weekend' }).listRows.map((r) => r.place.name),
      ).toEqual([])
      // But it does NOT satisfy 'today'.
      expect(
        plan({ upcomingStartTimes: TOMORROW_TIMES, dateWindow: 'today' }).listRows.map((r) => r.place.name),
      ).toEqual([])
      // A drop-in on Saturday of the upcoming weekend satisfies 'weekend' but not 'today'/'tomorrow'.
      expect(
        plan({ upcomingStartTimes: WEEKEND_TIMES, dateWindow: 'weekend' }).listRows.map((r) => r.place.name),
      ).toEqual(['Alki Beach Park'])
      expect(
        plan({ upcomingStartTimes: WEEKEND_TIMES, dateWindow: 'today' }).listRows.map((r) => r.place.name),
      ).toEqual([])
      expect(
        plan({ upcomingStartTimes: WEEKEND_TIMES, dateWindow: 'tomorrow' }).listRows.map((r) => r.place.name),
      ).toEqual([])
      // A drop-in on Sunday of the upcoming weekend also satisfies 'weekend'.
      expect(
        plan({ upcomingStartTimes: WEEKEND_SUN_TIMES, dateWindow: 'weekend' }).listRows.map((r) => r.place.name),
      ).toEqual(['Alki Beach Park'])
    })

    it("a place with a drop-in today is under Today, NOT Tomorrow", () => {
      const p = plan({ upcomingStartTimes: UPCOMING_TIMES, dateWindow: 'today' })
      expect(p.listRows.map((r) => r.place.name)).toEqual(['Alki Beach Park'])
      const pTomorrow = plan({ upcomingStartTimes: UPCOMING_TIMES, dateWindow: 'tomorrow' })
      expect(pTomorrow.listRows.map((r) => r.place.name)).toEqual([])
    })

    it('a place with a drop-in on Saturday is under Weekend', () => {
      const p = plan({ upcomingStartTimes: WEEKEND_TIMES, dateWindow: 'weekend' })
      expect(p.listRows.map((r) => r.place.name)).toEqual(['Alki Beach Park'])
    })

    it('a place with no drop-ins appears under Upcoming only', () => {
      // Both places have zero drop-ins: 'upcoming' shows both, specific windows show none.
      const EMPTY = new Map([['alki-beach-park', []], ['bellevue-playground', []]])
      expect(
        plan({ upcomingStartTimes: EMPTY, dateWindow: 'upcoming' }).listRows.map((r) => r.place.name),
      ).toEqual(['Alki Beach Park', 'Bellevue Playground'])
      expect(
        plan({ upcomingStartTimes: EMPTY, dateWindow: 'today' }).listRows.length,
      ).toBe(0)
      expect(
        plan({ upcomingStartTimes: EMPTY, dateWindow: 'tomorrow' }).listRows.length,
      ).toBe(0)
      expect(
        plan({ upcomingStartTimes: EMPTY, dateWindow: 'weekend' }).listRows.length,
      ).toBe(0)
    })

    it("'Upcoming' is the unfiltered default and returns everything the other filters allow", () => {
      // With no date window, both places render regardless of their start times.
      expect(
        plan({ upcomingStartTimes: UPCOMING_TIMES, dateWindow: 'upcoming' }).listRows.map((r) => r.place.name),
      ).toEqual(['Alki Beach Park', 'Bellevue Playground'])
      // The default state (no override) agrees: the helper's dateWindow defaults
      // to 'upcoming', which never filters.
      expect(plan({ upcomingStartTimes: UPCOMING_TIMES }).listRows.length).toBe(2)
    })

    it('a window with no matching places produces the empty result AND the reason flag', () => {
      // Every place has zero upcoming drop-ins: 'today' excludes all of them.
      const empty = plan({
        upcomingStartTimes: new Map([['alki-beach-park', []], ['bellevue-playground', []]]),
        dateWindow: 'today',
      })
      expect(empty.listRows).toEqual([])
      expect(empty.dateWindowIsTheReason).toBe(true)
      expect(empty.dateWindowReason).toBe('today')
      expect(empty.nothingMatches).toBe(true)
      // The escape copy names the window (the house empty-state pattern).
      expect(dateWindowEmptyCopy('today')).toContain('today')
      expect(dateWindowEmptyCopy('today')).toContain('Upcoming')
    })

    it('the reason flag stays null whenever another filter also narrows (or the window is "upcoming")', () => {
      // A search text is present → the window is not the whole story.
      expect(
        plan({ upcomingStartTimes: new Map([['alki-beach-park', []]]), dateWindow: 'today', query: 'x' }).dateWindowReason,
      ).toBeNull()
      // 'upcoming' never carries a reason (there is no window to name).
      expect(plan({ upcomingStartTimes: new Map([['alki-beach-park', []]]) }).dateWindowReason).toBeNull()
      // A non-empty list → nothing is empty, so no reason.
      expect(plan({ upcomingStartTimes: UPCOMING_TIMES, dateWindow: 'today' }).dateWindowReason).toBeNull()
    })

    it('unknown start times (null) are NOT claimed by any specific window (radius rule)', () => {
      // The start-time read failed: every row's starts are unknown, and a window
      // must not claim a place it cannot measure against the filter.
      const p = plan({ upcomingStartTimes: null, dateWindow: 'today' })
      expect(p.listRows.length).toBe(0)
      expect(p.dateWindowReason).toBe('today')
      // But 'upcoming' still shows everything (never hidden).
      const pUpcoming = plan({ upcomingStartTimes: null, dateWindow: 'upcoming' })
      expect(pUpcoming.listRows.length).toBe(2)
      expect(pUpcoming.dateWindowReason).toBeNull()
    })

    it('the date rule agrees with feed.ts day-section boundaries (ONE definition, tested through the same seam)', () => {
      // The chip windows reuse the feed's day labels rather than inventing a
      // second "today" rule: for a fixed nowIso, the feed says which day a start
      // belongs to (formatDayLabel), and the chip predicate must agree that a
      // drop-in starting in that day is inside that window.
      const nowIso = new Date(2026, 8, 4, 12, 0).toISOString() // local Fri Sep 4 2026 12:00
      const todayStart = new Date(2026, 8, 4, 9, 0).toISOString()
      const tomorrowStart = new Date(2026, 8, 5, 9, 0).toISOString()
      const saturdayStart = new Date(2026, 8, 6, 18, 0).toISOString() // Sat Sep 6 evening
      expect(formatDayLabel(todayStart, nowIso)).toBe('Today')
      expect(formatDayLabel(tomorrowStart, nowIso)).toBe('Tomorrow')
      // Saturday is neither today nor tomorrow: the feed gives it a weekday label.
      expect(formatDayLabel(saturdayStart, nowIso)).not.toBe('Today')
      expect(formatDayLabel(saturdayStart, nowIso)).not.toBe('Tomorrow')
      // The chip predicate claims a place by the EXISTENCE of a drop-in whose
      // start falls in the window (start times, not counts):
      expect(placeInDateWindow([todayStart], 'today', nowIso)).toBe(true)
      expect(placeInDateWindow([todayStart], 'tomorrow', nowIso)).toBe(false)
      expect(placeInDateWindow([todayStart], 'weekend', nowIso)).toBe(false)
      expect(placeInDateWindow([tomorrowStart], 'today', nowIso)).toBe(false)
      expect(placeInDateWindow([tomorrowStart], 'tomorrow', nowIso)).toBe(true)
      // Saturday Sep 6 is the upcoming weekend (now is Fri Sep 4):
      expect(placeInDateWindow([saturdayStart], 'weekend', nowIso)).toBe(true)
      expect(placeInDateWindow([saturdayStart], 'today', nowIso)).toBe(false)
      expect(placeInDateWindow([saturdayStart], 'tomorrow', nowIso)).toBe(false)
      // Unknown (null) is NOT claimed by any specific window:
      expect(placeInDateWindow(null, 'today', nowIso)).toBe(false)
      expect(placeInDateWindow(null, 'tomorrow', nowIso)).toBe(false)
      expect(placeInDateWindow(null, 'weekend', nowIso)).toBe(false)
      // And the local-day key the feed groups on is the same function the test
      // pins above (localDayKey), so "today" means the same calendar day in both.
      expect(localDayKey(nowIso)).toBe(localDayKey(todayStart))
      expect(localDayKey(nowIso)).not.toBe(localDayKey(tomorrowStart))
    })

    it('the chip labels + order come from ONE table (DATE_WINDOWS / DATE_WINDOW_LABELS)', () => {
      // The control iterates DATE_WINDOWS; the labels are the record values.
      expect(DATE_WINDOWS).toEqual(['upcoming', 'today', 'tomorrow', 'weekend'])
      expect(DATE_WINDOWS.map((w) => DATE_WINDOW_LABELS[w])).toEqual([
        'Upcoming',
        'Today',
        'Tomorrow',
        'Weekend',
      ])
    })
  })

  it('kindReason names a selected kind ONLY when every selected kind has zero rows in the whole directory', () => {
    // NOTE: the ROW no longer offers a park/trail chip (they could only ever
    // return an empty list), but the filter SHEET still lists every kind — so
    // these selections are reachable in the product, and the honest empty state
    // must still fire for them.
    // No kind selected → never a kind reason, whatever else is true.
    expect(plan({ places: [] }).kindReason).toBeNull()
    // A kind with rows that simply needs no narrowing → null.
    expect(plan({ selectedKinds: new Set(['playground']) }).kindReason).toBeNull()
    // A kind ABSENT from the loaded directory, nothing else narrowing → named,
    // and `nothingMatches` is the generic flag it refines.
    const only = plan({ places: [PLAY_B], selectedKinds: new Set(['park']) })
    expect(only.nothingMatches).toBe(true)
    expect(only.kindReason).toEqual({ kind: 'park', label: 'Park' })
    // A search is ALSO narrowing, so the kind is not the whole story → the
    // generic empty state, no kind-specific claim.
    expect(
      plan({ places: [PLAY_B], selectedKinds: new Set(['park']), query: 'zzz' }).kindReason,
    ).toBeNull()
    // While the read is in flight the directory is UNKNOWN, never empty.
    expect(plan({ places: null, selectedKinds: new Set(['park']) }).kindReason).toBeNull()
    // An empty directory that really loaded + a kind selected IS the honest case.
    const empty = plan({ places: [], selectedKinds: new Set(['trail']) })
    expect(empty.kindReason).toEqual({ kind: 'trail', label: 'Trail' })
    expect(empty.nothingMatches).toBe(true)
    // A SHIPPED chip whose kind measures empty at runtime gets the same honest
    // state — the rule is about the selection, not about a hardcoded list.
    const goneKind = plan({ places: [PLAY_B], selectedKinds: new Set(['museum']) })
    expect(goneKind.kindReason).toEqual({ kind: 'museum', label: 'Museum' })
  })

  it('kindReason refuses to name a chip when the emptiness has ANOTHER cause (every, not any)', () => {
    // `park` + `playground` selected, both in the directory, and a date window
    // that matches nothing: naming `park` would be a FALSE cause — the window is
    // what emptied the list, and clearing "Park" would not fix it.
    const mixed = plan({
      selectedKinds: new Set(['park', 'playground']),
      upcomingStartTimes: null,
      dateWindow: 'today',
    })
    expect(mixed.listRows.length).toBe(0)
    expect(mixed.dateWindowReason).toBe('today')
    expect(mixed.kindReason).toBeNull()
    // Narrow it to the one kind that IS absent and the same emptiness becomes a
    // true kind reason (a place that does not exist cannot be brought back by a
    // window), so the kind state wins the render chain.
    const absentOnly = plan({
      places: [PLAY_B],
      selectedKinds: new Set(['park']),
      upcomingStartTimes: null,
      dateWindow: 'today',
    })
    expect(absentOnly.kindReason).toEqual({ kind: 'park', label: 'Park' })
  })

  /**
   * V25 t08 — THE SAVED GATE (the hearts collection). The gate is a filter over
   * the SAME saved-id set the bookmark controls read, so these cases pin what it
   * does to the plan and, just as importantly, that it is INERT for every caller
   * that does not pass it.
   */
  describe('the saved gate (V25 t08)', () => {
    it('is INERT by default — an unfiltered plan is byte-for-byte what it was', () => {
      const plain = plan()
      const explicitOff = plan({ savedOnly: false, followedPlaceIds: new Set(['alki-beach-park']) })
      expect(explicitOff.listRows).toStrictEqual(plain.listRows)
      expect(explicitOff.savedReason).toBeNull()
    })

    it('shows ONLY the viewer’s saved places, whatever else is in the directory', () => {
      const p = plan({ savedOnly: true, followedPlaceIds: new Set([PLAY_B.id]) })
      expect(p.listRows.map((r) => r.place.name)).toEqual(['Bellevue Playground'])
      expect(p.savedReason).toBeNull()
    })

    it('reads the set by id, not by index or name — an id that is not in the directory shows nothing', () => {
      const p = plan({ savedOnly: true, followedPlaceIds: new Set(['no-such-place-id']) })
      expect(p.listRows).toHaveLength(0)
      expect(p.savedReason).toEqual({ hasSaves: true })
    })

    it('honours the gate on the GEOCODED path too (both list paths narrow)', () => {
      const p = plan({
        savedOnly: true,
        followedPlaceIds: new Set([PLAY_B.id]),
        geocodeCenter: GEO_CENTER,
        radiusMiles: 50,
      })
      expect(p.listRows.map((r) => r.place.name)).toEqual(['Bellevue Playground'])
    })

    it('reports the saved gate as the reason, with hasSaves FALSE for a viewer who saved nothing', () => {
      const p = plan({ savedOnly: true, followedPlaceIds: new Set() })
      expect(p.savedReason).toEqual({ hasSaves: false })
      expect(p.nothingMatches).toBe(true)
      // The radius/date branches must NOT claim this emptiness: the gate is why
      // there is nothing to see, and the component renders `savedReason` first.
      expect(p.radiusIsTheReason).toBe(false)
      expect(p.dateWindowIsTheReason).toBe(false)
    })

    it('reports hasSaves TRUE when saves exist but the search excludes them all', () => {
      const p = plan({
        savedOnly: true,
        followedPlaceIds: new Set([PLAY_B.id]),
        query: 'zzzz-nothing-matches',
      })
      expect(p.listRows).toHaveLength(0)
      expect(p.savedReason).toEqual({ hasSaves: true })
    })

    it('is null while a genuinely-matching saved row renders (never a false empty state)', () => {
      const p = plan({ savedOnly: true, followedPlaceIds: new Set([PARK_A.id, PLAY_B.id]) })
      expect(p.savedReason).toBeNull()
      expect(p.listRows).toHaveLength(2)
    })

    it('is null while the read is in flight (an unanswered read is UNKNOWN, never "none saved")', () => {
      const p = plan({ savedOnly: true, followedPlaceIds: new Set(), places: null })
      expect(p.savedReason).toBeNull()
    })

    it('keeps the unplaced saved row reachable (a coordinate-less save is not hidden by the gate)', () => {
      const p = plan({ savedOnly: true, followedPlaceIds: new Set([PLAY_B.id]) })
      expect(p.unplaced.map((r) => r.place.name)).toEqual(['Bellevue Playground'])
    })
  })
})

describe('savedPlacesEmptyCopy (V25 t08, the two honest empty messages)', () => {
  it('tells a viewer who saved nothing what the list is for — and never blames a filter', () => {
    const copy = savedPlacesEmptyCopy(false)
    expect(copy).toContain('haven’t saved any places yet')
    expect(copy.toLowerCase()).not.toContain('filter')
  })

  it('tells a viewer whose saves are all filtered out the truth about their own data', () => {
    const copy = savedPlacesEmptyCopy(true)
    expect(copy).toBe('None of your saved places match these filters.')
    expect(copy).not.toContain('haven’t saved')
  })

  it('is two DIFFERENT sentences (the branches cannot collapse to one)', () => {
    expect(savedPlacesEmptyCopy(true)).not.toBe(savedPlacesEmptyCopy(false))
  })
})
