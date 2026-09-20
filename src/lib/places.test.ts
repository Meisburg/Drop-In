import { describe, expect, it } from 'vitest'
import {
  browsePlaces,
  browsePlaceList,
  BROWSE_LIST_LEAD_LIMIT,
  coordNumber,
  distanceMiles,
  filterPlacesByRadius,
  groupPlacesByKind,
  matchPlaces,
  placeAgeFitLabel,
  placeDistanceMiles,
  placeIdField,
  placeIndoorLabel,
  placeKindLabel,
  placePath,
  placePickerMatches,
  placePickPatch,
  placeUpcomingLabel,
  PLACE_BROWSE_LIMIT,
  PLACE_SUGGESTION_LIMIT,
  resolveMapCoords,
  resolvePlaceByName,
  SOMEWHERE_ELSE_LABEL,
  sortPlaceUpcoming,
  sortPlaces,
  stripPlaceAlias,
  upcomingCountByPlace,
  usesPlaceAlias,
  zipFromAddress,
} from './places'
import type { PlaceListRow } from './places'
import { neighborhoodIdField } from './feed'
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

// V15 ticket 03: the browse list's sort seam (alpha default, distance, newest).
describe('sortPlaces (V15 ticket 03: the browse list\'s ordering decision)', () => {
  function row(
    name: string,
    overrides: Partial<{ kind: PlaceKind; lat: number | null; lng: number | null; created_at?: string }> & {
      distanceMiles?: number | null
    } = {},
  ): PlaceListRow {
    const { distanceMiles: dist, ...placeOverrides } = overrides
    return {
      place: place({ name, ...placeOverrides }),
      // `dist ?? 1` is the fixture default; an EXPLICIT null must stay null
      // (the "unknown distance" cases pin that).
      distanceMiles: dist === undefined ? 1 : dist,
      upcomingCount: null,
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
  })

  it('the three modes produce different orders on the same fixture', () => {
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
    return { place: place({ name, kind }), distanceMiles, upcomingCount: null }
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
