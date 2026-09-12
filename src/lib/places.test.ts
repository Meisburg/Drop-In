import { describe, expect, it } from 'vitest'
import {
  browsePlaces,
  coordNumber,
  matchPlaces,
  placeAgeFitLabel,
  placeDistanceMiles,
  placeFitsKidAges,
  placeIdField,
  placeIndoorLabel,
  placeKindLabel,
  placePath,
  placeUpcomingLabel,
  PLACE_SUGGESTION_LIMIT,
  resolvePlaceByName,
  SOMEWHERE_ELSE_LABEL,
  sortPlaceUpcoming,
  upcomingCountByPlace,
} from './places'
import type { Place } from './types'
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

describe('placeFitsKidAges (NULL is UNKNOWN and an unknown never excludes)', () => {
  it('keeps a place with no age data at all (every seeded row today)', () => {
    expect(placeFitsKidAges({ age_min: null, age_max: null }, [4])).toBe(true)
    expect(placeFitsKidAges({ age_min: null, age_max: null }, [])).toBe(true)
  })

  it('keeps everything when the viewer has no kid ages to compare ([] or none)', () => {
    expect(placeFitsKidAges({ age_min: 8, age_max: 12 }, [])).toBe(true)
  })

  it('fits when AT LEAST ONE of the viewer\'s kids is in range', () => {
    expect(placeFitsKidAges({ age_min: 2, age_max: 5 }, [3, 9])).toBe(true)
    expect(placeFitsKidAges({ age_min: 2, age_max: 5 }, [9, 4])).toBe(true)
  })

  it('excludes only when the data positively says it does not fit', () => {
    expect(placeFitsKidAges({ age_min: 2, age_max: 5 }, [9])).toBe(false)
    expect(placeFitsKidAges({ age_min: 5, age_max: null }, [4])).toBe(false)
    expect(placeFitsKidAges({ age_min: null, age_max: 3 }, [4])).toBe(false)
  })

  it('treats a one-sided bound as open on the other side', () => {
    expect(placeFitsKidAges({ age_min: 5, age_max: null }, [5])).toBe(true)
    expect(placeFitsKidAges({ age_min: 5, age_max: null }, [12])).toBe(true)
    expect(placeFitsKidAges({ age_min: null, age_max: 3 }, [3])).toBe(true)
    expect(placeFitsKidAges({ age_min: null, age_max: 3 }, [1])).toBe(true)
  })

  it('treats the bounds as inclusive', () => {
    expect(placeFitsKidAges({ age_min: 2, age_max: 5 }, [2])).toBe(true)
    expect(placeFitsKidAges({ age_min: 2, age_max: 5 }, [5])).toBe(true)
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

describe('browsePlaces (the directory\'s filter + sort decision)', () => {
  const near = place({ name: 'Near Playground', lat: NEAR.lat, lng: NEAR.lng })
  const far = place({ name: 'Far Playground', lat: FAR.lat, lng: FAR.lng })
  const noCoords = place({ name: 'Unmapped Park', lat: null, lng: null })
  const indoor = place({ name: 'Indoor Library', indoor: true, kind: 'library', lat: NEAR.lat, lng: NEAR.lng })
  const directory = [far, noCoords, indoor, near]

  const NO_FILTERS = { query: '', indoor: null, kidAges: null, maxMiles: null }

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

  it('applies the age filter only when it is ON (null = off = keep everything)', () => {
    const agey = place({ name: 'Big Kid Park', age_min: 8, age_max: 12 })
    const rows = browsePlaces([agey, near], NO_FILTERS, VIEWER, ZIP_COORDS, null)
    expect(rows).toHaveLength(2)
    const filtered = browsePlaces([agey, near], { ...NO_FILTERS, kidAges: [4] }, VIEWER, ZIP_COORDS, null)
    expect(filtered.map((row) => row.place.name)).toEqual(['Near Playground'])
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

  it('shows "N upcoming" per place, and null for ALL when the counts read failed', () => {
    const withCounts = browsePlaces(directory, NO_FILTERS, VIEWER, ZIP_COORDS, new Map([['near-playground', 3]]))
    expect(withCounts.find((row) => row.place.name === 'Near Playground')?.upcomingCount).toBe(3)
    expect(withCounts.find((row) => row.place.name === 'Far Playground')?.upcomingCount).toBe(0)
    const noCounts = browsePlaces(directory, NO_FILTERS, VIEWER, ZIP_COORDS, null)
    expect(noCounts.every((row) => row.upcomingCount === null)).toBe(true)
  })

  it('is empty for an empty directory, an unusable viewer, or an unreadable gazetteer', () => {
    expect(browsePlaces([], NO_FILTERS, VIEWER, ZIP_COORDS, null)).toEqual([])
    const rows = browsePlaces(directory, NO_FILTERS, { homeZip: null }, ZIP_COORDS, null)
    expect(rows.every((row) => row.distanceMiles === null)).toBe(true)
    const noZips = browsePlaces(directory, NO_FILTERS, VIEWER, new Map(), null)
    expect(noZips.every((row) => row.distanceMiles === null)).toBe(true)
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

describe('placeDistanceMiles re-exported from the place module', () => {
  it('is the same seam the feed uses (one implementation, two import sites)', () => {
    expect(placeDistanceMiles(NEAR, VIEWER, ZIP_COORDS)).not.toBeNull()
    expect(coordNumber('47.5')).toBe(47.5)
  })
})
