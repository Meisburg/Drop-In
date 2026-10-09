import { describe, expect, it } from 'vitest'
import {
  LAUNCHPAD_PLACE_KIND,
  LAUNCHPAD_PLACE_LIMIT,
  launchpadDistanceLabel,
  launchpadPrefill,
  nearbyPlaygrounds,
} from './feedLaunchpad'
import { formatDistanceLabel, type ZipCoords } from './feed'
import type { Place, PlaceKind } from './types'

/**
 * V37 slice A (`P4K2`) — THE EMPTY FEED'S LAUNCHPAD, AND THE DEFECTS IT DETECTS.
 *
 * The founder's cold-start gap: *"the drop-in feed was empty at 1, 20, and 35
 * miles, so a new parent may find a park but still not find another family to
 * meet."* The measured diagnosis: 234 places (151 playgrounds), ZERO drop-ins —
 * supply of PLACES, none of PEOPLE. The launchpad converts the one parent present
 * into the first host by naming real playgrounds that already exist.
 *
 * ⚠️ FOUR DEFECTS, each with a case below:
 *   1. NAMING A PLACE THAT IS NOT A PLAYGROUND — the list is about playgrounds;
 *      a café in it is a different product ("fun places"), and the founder asked
 *      for the one kind a parent takes a toddler to.
 *   2. NAMING A PLACE OUTSIDE THE RADIUS — the state says "Nothing within N
 *      miles yet." one line above. A row further out than N contradicts it.
 *   3. INVENTING A DISTANCE — a place whose distance is UNKNOWN (no coords, no
 *      gazetteer) must not be printed with "0 mi" or any number. A real park
 *      described with a made-up distance is worse than a park not listed.
 *   4. AN UNSTABLE ORDER — nearest-first is the promise; without a deterministic
 *      tie-break two equidistant playgrounds can swap between renders, and the
 *      list flickers for no reason a parent could ever explain.
 *
 * ⚠️ AND THE DEGRADATION, WHICH IS THE POINT OF THE WHOLE SLICE: with nothing to
 * name the function returns an EMPTY LIST, and the caller renders its existing
 * state unchanged. The state must never be WORSE than it is today, so "no rows"
 * is a supported, tested outcome — never an empty list on screen, never a
 * placeholder row.
 */

/** A seeded-zip gazetteer: one known zip, so distances are real and testable. */
const ZIPS: ReadonlyMap<string, ZipCoords> = new Map<string, ZipCoords>([
  ['98107', { lat: 47.6690, lng: -122.3830 }],
])

/**
 * A place fixture. The defaults are DELIBERATELY the launchpad's happy path
 * (a playground, with coordinates near the known zip) so each case below changes
 * exactly the one field its defect is about.
 */
function place(overrides: Partial<Place> & { name: string }): Place {
  return {
    id: overrides.id ?? overrides.name.toLowerCase().replace(/\s+/g, '-'),
    kind: 'playground',
    address: '1 Test St',
    // ~0.5 mi north of 98107 — comfortably inside a 5-mile radius.
    lat: 47.6760,
    lng: -122.3830,
    indoor: false,
    age_min: null,
    age_max: null,
    notes: null,
    photo_url: null,
    neighborhood_id: null,
    source: 'seattle-parks',
    ...overrides,
  } as Place
}

describe('nearbyPlaygrounds — the empty feed names up to three real playgrounds', () => {
  it('names a playground inside the radius, with a formatted distance', () => {
    const rows = nearbyPlaygrounds([place({ name: 'Ballard Playground' })], '98107', 5, ZIPS)
    expect(rows).toHaveLength(1)
    expect(rows[0].place.name).toBe('Ballard Playground')
    // The distance is a REAL number (not a placeholder) and its label is the
    // shared formatter's output, so the row and the browse cards cannot drift.
    expect(rows[0].distanceMiles).toBeGreaterThan(0)
    // The label is the LAUNCHPAD's own (see `launchpadDistanceLabel`): the shared
    // integer formatter at 1 mi and up, floored to "<1 mi" below it. This fixture
    // sits ~0.6 mi away, so it takes the floor — the honest answer for a real
    // sub-mile park, where the shared formatter would have printed a false "0 mi".
    expect(rows[0].distanceLabel).toBe('<1 mi')
    expect(rows[0].distanceLabel).toMatch(/^(<1|\d+) mi$/)
  })

  it('⚠️ DEFECT 1 — never names a place that is not a playground', () => {
    const rows = nearbyPlaygrounds(
      [
        place({ name: 'Ballard Playground' }),
        // The kinds a parent might equally want, and that this list must NOT show:
        // it is the PLAYGROUND launchpad, not a second directory.
        place({ name: 'Caffe Umbria', kind: 'other' as PlaceKind }),
        place({ name: 'Ballard Pool', kind: 'pool' as PlaceKind }),
        place({ name: 'Green Lake Park', kind: 'park' as PlaceKind }),
      ],
      '98107',
      5,
      ZIPS,
    )
    expect(rows.map((r) => r.place.name)).toEqual(['Ballard Playground'])
    // And the kind it filters on is the schema's own member, named once.
    expect(LAUNCHPAD_PLACE_KIND).toBe('playground')
  })

  it('⚠️ DEFECT 2 — never names a place OUTSIDE the radius (it would contradict the count line)', () => {
    // ~60 miles south: real, a playground, with coordinates — and NOT nearby.
    const farAway = place({ name: 'Tacoma Playground', lat: 47.10, lng: -122.383 })
    const near = place({ name: 'Ballard Playground' })
    expect(nearbyPlaygrounds([near, farAway], '98107', 5, ZIPS).map((r) => r.place.name)).toEqual([
      'Ballard Playground',
    ])
    // At a radius that DOES cover it, it is named — so the exclusion above is the
    // radius rule firing, not the row being dropped for some other reason.
    expect(nearbyPlaygrounds([near, farAway], '98107', 100, ZIPS).map((r) => r.place.name)).toContain(
      'Tacoma Playground',
    )
  })

  it('⚠️ DEFECT 3 — never invents a distance for a place whose distance is unknown', () => {
    const noCoords = place({ name: 'Unmapped Playground', lat: null, lng: null })
    const unknownZip = place({ name: 'Elsewhere Playground' })
    // A gazetteer WITHOUT the viewer's zip: every distance on this viewer is unknown.
    const otherZips: ReadonlyMap<string, ZipCoords> = new Map([['00000', { lat: 0, lng: 0 }]])

    expect(nearbyPlaygrounds([noCoords], '98107', 5, ZIPS)).toEqual([])
    expect(nearbyPlaygrounds([unknownZip], '98107', 5, otherZips)).toEqual([])
    // A null gazetteer (not loaded yet) is the same unknown, not zero.
    expect(nearbyPlaygrounds([unknownZip], '98107', 5, null)).toEqual([])
    // And with no home zip there is no distance to any place.
    expect(nearbyPlaygrounds([unknownZip], null, 5, ZIPS)).toEqual([])
    expect(nearbyPlaygrounds([unknownZip], '', 5, ZIPS)).toEqual([])
  })

  it('⚠️ DEFECT 4 — nearest first, with a DETERMINISTIC tie-break (stable across calls)', () => {
    // Two places at the SAME coordinates (a tie) and one nearer. The tie must
    // resolve by name, so the order is total — two calls cannot disagree.
    const near = place({ name: 'Zzz Near Playground', lat: 47.6710, lng: -122.3830 })
    const tieB = place({ name: 'Bravo Playground', lat: 47.6800, lng: -122.3830 })
    const tieA = place({ name: 'Alpha Playground', lat: 47.6800, lng: -122.3830 })
    const input = [tieB, near, tieA]

    const first = nearbyPlaygrounds(input, '98107', 5, ZIPS).map((r) => r.place.name)
    const second = nearbyPlaygrounds(input, '98107', 5, ZIPS).map((r) => r.place.name)
    // Nearest first; the equidistant pair by name.
    expect(first).toEqual(['Zzz Near Playground', 'Alpha Playground', 'Bravo Playground'])
    expect(second).toEqual(first)
  })

  it('names AT MOST three — the fourth nearest is not shown', () => {
    const four = [1, 2, 3, 4].map((n) =>
      // Increasingly far north: 1 is nearest, 4 is furthest.
      place({ name: `Playground ${n}`, lat: 47.6760 + n * 0.01, lng: -122.3830 }),
    )
    const rows = nearbyPlaygrounds(four, '98107', 40, ZIPS)
    expect(LAUNCHPAD_PLACE_LIMIT).toBe(3)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.place.name)).toEqual(['Playground 1', 'Playground 2', 'Playground 3'])
  })

  it('⚠️ THE DEGRADATION — no playgrounds in radius yields an EMPTY result, never a stub row', () => {
    // The state must never be WORSE than it is today: the caller renders its
    // existing panel unchanged when this is empty. A placeholder row here would
    // be the invented content this whole slice forbids.
    expect(nearbyPlaygrounds([], '98107', 5, ZIPS)).toEqual([])
    expect(
      nearbyPlaygrounds([place({ name: 'Ballard Pool', kind: 'pool' as PlaceKind })], '98107', 5, ZIPS),
    ).toEqual([])
    // A playground that exists but is out of radius is also nothing to name.
    expect(
      nearbyPlaygrounds([place({ name: 'Far Playground', lat: 47.10, lng: -122.383 })], '98107', 5, ZIPS),
    ).toEqual([])
  })
})

describe('launchpadDistanceLabel — the sub-mile floor (MEASURED on the real directory)', () => {
  it('floors a real sub-mile distance at "<1 mi" rather than the false "0 mi"', () => {
    // ⚠️ THE MEASURED CASE. The three nearest playgrounds to zip 98107 are
    // Ballard Commons (0.39 mi), Gilman Playground (0.41 mi) and Ballard Corners
    // (0.47 mi). `Math.round` renders all three as "0 mi" — a distance that reads
    // as "you are standing on it", and that makes the nearest-first order
    // inexplicable because every row shows the same value.
    expect(launchpadDistanceLabel(0.39)).toBe('<1 mi')
    expect(launchpadDistanceLabel(0.41)).toBe('<1 mi')
    expect(launchpadDistanceLabel(0.47)).toBe('<1 mi')
    expect(launchpadDistanceLabel(0.0)).toBe('<1 mi')
  })

  it('is EXACTLY the shared formatter at 1 mile and up — the two cannot drift', () => {
    // Below 1 mi they differ (that is the point); at and above it they must agree,
    // so this is not a second distance scheme, only a floor on the first.
    expect(launchpadDistanceLabel(1)).toBe(formatDistanceLabel(1))
    expect(launchpadDistanceLabel(2.32)).toBe(formatDistanceLabel(2.32))
    expect(launchpadDistanceLabel(5.9)).toBe(formatDistanceLabel(5.9))
    expect(launchpadDistanceLabel(1)).toBe('1 mi')
    expect(launchpadDistanceLabel(2.32)).toBe('2 mi')
  })

  it('⚠️ PAIRING HALF — it is not simply a constant, so the cases above are not vacuous', () => {
    expect(launchpadDistanceLabel(0.99)).not.toBe(launchpadDistanceLabel(1.01))
  })
})

describe('launchpadPrefill — the SAME router-state shape the place pages seed', () => {
  it('carries the REAL place id, name and address (not the home-zip form)', () => {
    const row = nearbyPlaygrounds(
      [place({ name: 'Ballard Playground', address: '1234 NW Test St' })],
      '98107',
      5,
      ZIPS,
    )[0]
    const prefill = launchpadPrefill(row)
    // ⚠️ `placeId` IS THE PLACE'S ID — unlike `createHerePrefill`'s `placeId: ''`.
    // A post hosted at a named playground must carry the FK to the directory row
    // it was created from; an empty id would silently make it a free-text post.
    expect(prefill.placeId).toBe(row.place.id)
    expect(prefill.placeId).not.toBe('')
    expect(prefill.place).toBe('Ballard Playground')
    expect(prefill.address).toBe('1234 NW Test St')
    expect(prefill.neighborhoodId).toBeNull()
  })

  it('passes a place’s own neighborhood through when it has one', () => {
    const row = nearbyPlaygrounds(
      [place({ name: 'Ballard Playground', neighborhood_id: 'n-1' })],
      '98107',
      5,
      ZIPS,
    )[0]
    expect(launchpadPrefill(row).neighborhoodId).toBe('n-1')
  })

  it('⚠️ PAIRING HALF — the list CAN be non-empty, so the degradation cases are not vacuous', () => {
    // Without this, every "returns []" case above would pass on a function that
    // can never return anything at all. A real playground, in radius, with coords.
    const rows = nearbyPlaygrounds([place({ name: 'Ballard Playground' })], '98107', 5, ZIPS)
    expect(rows).toHaveLength(1)
    expect(rows[0].place.name).toBe('Ballard Playground')
  })
})
