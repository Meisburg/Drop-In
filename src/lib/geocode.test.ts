/**
 * The geocode seam's sibling test (first-use audit, ticket 02; V28 slice 5).
 *
 * WHY THIS FILE EXISTS, beyond the build law's "every lib module ships a test":
 * the audit's second finding is that a parent whose address did not
 * resolve to a ZIP was moved to a ZIP screen with no explanation — since V28
 * slice 5 that note is the AREA CARD's own (its bounded lookup's "absent"
 * outcome). The fix is only worth anything if the UNRESOLVED path is real and
 * testable, and it was
 * not: the lookup hit Nominatim directly, so the only way to reach the failure
 * was for the network to fail. Nothing here touches the network —
 * every case injects the lookup, which is the one dependency this module has.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  coordinatesFromResult,
  geocodeAddress,
  locationFromAddressQuery,
  locationFromAddressQueryBounded,
  locationFromResult,
  zipFromCoordsBounded,
  zipFromResult,
  zipFromReverseResult,
  type NominatimResult,
} from './geocode'

const SEATTLE = '4139 1st Ave NE, Seattle, WA'
const SPARSE = 'Green Lake playground, near the boathouse'

/** A result Nominatim returns for a real street address. */
const STREET_RESULT: NominatimResult = {
  lat: '47.6612',
  lon: '-122.3255',
  address: { postcode: '98105', house_number: '4139' },
}

describe('coordinatesFromResult', () => {
  it('parses a real result into finite numbers', () => {
    expect(coordinatesFromResult(STREET_RESULT)).toEqual({ lat: 47.6612, lng: -122.3255 })
  })

  it('returns null rather than inventing coordinates', () => {
    expect(coordinatesFromResult(null)).toBe(null)
    expect(coordinatesFromResult({})).toBe(null)
    expect(coordinatesFromResult({ lat: '47.6' })).toBe(null)
    expect(coordinatesFromResult({ lon: '-122.3' })).toBe(null)
    // Nominatim answers with strings; a non-numeric one is not a coordinate.
    expect(coordinatesFromResult({ lat: 'north', lon: '-122.3' })).toBe(null)
    expect(coordinatesFromResult({ lat: 'NaN', lon: 'NaN' })).toBe(null)
  })
})

describe('zipFromResult — the two outcomes the area card\'s fallback note depends on', () => {
  it('RESOLVED: a street address with a recognised house number yields its ZIP', () => {
    expect(zipFromResult(SEATTLE, STREET_RESULT)).toBe('98105')
  })

  it('RESOLVED: a typed ZIP that matches the answer is proof of a precise match', () => {
    // No house number in the answer, but the parent wrote the ZIP themselves.
    expect(
      zipFromResult('Seattle, WA 98105', { address: { postcode: '98105' } }),
    ).toBe('98105')
  })

  it('UNRESOLVED: nothing found at all', () => {
    expect(zipFromResult(SEATTLE, null)).toBe(null)
  })

  it('UNRESOLVED: an answer with no postcode', () => {
    expect(zipFromResult(SPARSE, { address: {} })).toBe(null)
    expect(zipFromResult(SPARSE, { lat: '47.6', lon: '-122.3' })).toBe(null)
  })

  it('UNRESOLVED: a non-US postcode is never truncated into a US-shaped ZIP', () => {
    // A UK "SW1A 1AA" must not become "1AA" or pass as five digits.
    expect(
      zipFromResult('10 Downing Street, London', {
        address: { postcode: 'SW1A 1AA', house_number: '10' },
      }),
    ).toBe(null)
    expect(
      zipFromResult('Vancouver, BC', { address: { postcode: 'V5K 0A1' } }),
    ).toBe(null)
  })

  it('UNRESOLVED: a CITY-level answer is a partial match, not a match', () => {
    // The parent typed a street; the answer is the city centre's postcode. A ZIP
    // they do not live in would filter every drop-in they ever see.
    expect(zipFromResult(SEATTLE, { address: { postcode: '98195' } })).toBe(null)
  })

  it('UNRESOLVED: an empty or whitespace query never reaches a lookup', () => {
    expect(zipFromResult('', STREET_RESULT)).toBe(null)
    expect(zipFromResult('   ', STREET_RESULT)).toBe(null)
  })
})

// ---------------------------------------------------------------------------
// The async wrappers: they add the lookup, nothing else. Asserting that is what
// makes the pure tests above meaningful for the real call path.
// ---------------------------------------------------------------------------

describe('the async wrappers inject exactly one dependency', () => {
  it('geocodeAddress uses the same injected seam', async () => {
    const lookup = vi.fn(async () => STREET_RESULT)
    expect(await geocodeAddress(SEATTLE, lookup)).toEqual({ lat: 47.6612, lng: -122.3255 })
    expect(lookup).toHaveBeenCalledWith(SEATTLE)
  })

  it('geocodeAddress returns null when the lookup yields nothing', async () => {
    expect(await geocodeAddress(SEATTLE, async () => null)).toBe(null)
  })
})

/** A city-level answer: Nominatim found the CITY, not the house number. */
const CITY_RESULT: NominatimResult = {
  lat: '47.6062',
  lon: '-122.3321',
  address: { postcode: '98101' },
}

describe('locationFromResult (V28 slice 4 — one Nominatim result, two extractions)', () => {
  it('yields BOTH the zip and the pin from one street-address result', () => {
    expect(locationFromResult(SEATTLE, STREET_RESULT)).toEqual({
      zip: '98105',
      coordinates: { lat: 47.6612, lng: -122.3255 },
    })
  })

  it('a city-level answer: no zip (the fallback is the escape) but the pin is real', () => {
    // The map CAN show a pin for a city-level match while the ZIP fallback
    // stays the way the card finishes — the two fields are independent.
    expect(locationFromResult(SEATTLE, CITY_RESULT)).toEqual({
      zip: null,
      coordinates: { lat: 47.6062, lng: -122.3321 },
    })
  })

  it('a null result yields both nulls (absent is the only honest value)', () => {
    expect(locationFromResult(SEATTLE, null)).toEqual({ zip: null, coordinates: null })
  })

  it('an empty query yields both nulls', () => {
    expect(locationFromResult('   ', STREET_RESULT)).toEqual({ zip: null, coordinates: null })
  })
})

describe('locationFromAddressQuery (V28 slice 4 — the injectable, one-request seam)', () => {
  it('runs exactly ONE lookup and reads both fields off that one result', async () => {
    const lookup = vi.fn(async () => STREET_RESULT)
    const result = await locationFromAddressQuery(SEATTLE, lookup)
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledWith(SEATTLE)
    expect(result).toEqual({ zip: '98105', coordinates: { lat: 47.6612, lng: -122.3255 } })
  })

  it('an empty query short-circuits without a lookup', async () => {
    const lookup = vi.fn(async () => STREET_RESULT)
    expect(await locationFromAddressQuery('   ', lookup)).toEqual({ zip: null, coordinates: null })
    expect(lookup).not.toHaveBeenCalled()
  })
})

describe('locationFromAddressQueryBounded (V28 slice 4 — the card-gating lookup\'s bounded escape)', () => {
  it('a fast lookup wins the race and leaves no timer behind', async () => {
    vi.useFakeTimers()
    try {
      const lookup = vi.fn(async () => STREET_RESULT)
      const pending = locationFromAddressQueryBounded(SEATTLE, 10_000, lookup)
      expect(await pending).toEqual({ zip: '98105', coordinates: { lat: 47.6612, lng: -122.3255 } })
      expect(lookup).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a never-settling lookup settles to the null shape at the deadline (the pending-state escape)', async () => {
    vi.useFakeTimers()
    try {
      const neverSettled = new Promise<NominatimResult | null>(() => {})
      const lookup = vi.fn(() => neverSettled)
      const pending = locationFromAddressQueryBounded(SEATTLE, 10_000, lookup)
      vi.advanceTimersByTime(10_000)
      expect(await pending).toEqual({ zip: null, coordinates: null })
      expect(lookup).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a failed lookup settles to the null shape before the deadline (the fast fallback path)', async () => {
    vi.useFakeTimers()
    try {
      const lookup = vi.fn(async () => null)
      const pending = locationFromAddressQueryBounded(SEATTLE, 10_000, lookup)
      expect(await pending).toEqual({ zip: null, coordinates: null })
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a rejecting lookup rethrows (a real failure the caller may see — the card catches it)', async () => {
    vi.useFakeTimers()
    try {
      const lookup = vi.fn(() => Promise.reject(new Error('boom')))
      const pending = locationFromAddressQueryBounded(SEATTLE, 10_000, lookup)
      await expect(pending).rejects.toThrow('boom')
      // B3 (slice 4 fix 1): the REJECTION leg clears the deadline timer too —
      // the same `vi.getTimerCount()` instrument the sibling's legs use, so
      // "the timer was cleared" is pinned, not asserted in a comment.
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('an empty query short-circuits without a lookup (and without a timer)', async () => {
    const lookup = vi.fn(async () => STREET_RESULT)
    expect(await locationFromAddressQueryBounded('   ', 10_000, lookup)).toEqual({
      zip: null,
      coordinates: null,
    })
    expect(lookup).not.toHaveBeenCalled()
  })
})

/**
 * V28 r4 — THE REVERSE HALF, added with the "Use my location" tap.
 *
 * These tests exist because the reverse lookup is the ONLY place a device
 * coordinate can become the ZIP the product stores, and its failure must be an
 * honest null rather than a guessed postcode. The lookup is injected for the
 * same reason the forward one is: reaching these outcomes against live Nominatim
 * would make the suite depend on the network and on a real address.
 */
describe('zipFromReverseResult (the strict extraction, pure)', () => {
  it('returns the 5-digit postcode from a resolved reverse result', () => {
    expect(zipFromReverseResult({ address: { postcode: '98107' } })).toBe('98107')
  })

  it('trims whitespace around the postcode', () => {
    expect(zipFromReverseResult({ address: { postcode: '  98107  ' } })).toBe('98107')
  })

  it('returns null for a null result (the lookup failed)', () => {
    expect(zipFromReverseResult(null)).toBeNull()
  })

  it('returns null when there is no address block at all', () => {
    expect(zipFromReverseResult({ lat: '47.6', lon: '-122.3' })).toBeNull()
  })

  it('returns null for a missing postcode', () => {
    expect(zipFromReverseResult({ address: {} })).toBeNull()
  })

  it('refuses a non-5-digit postcode rather than passing it through', () => {
    // Deliberately STRICTER than zipFromResult: there is no typed address here
    // to corroborate precision, so a partial or foreign code is not acceptable
    // evidence — the caller must ask instead of guessing.
    expect(zipFromReverseResult({ address: { postcode: '9810' } })).toBeNull()
    expect(zipFromReverseResult({ address: { postcode: 'SW1A 1AA' } })).toBeNull()
    expect(zipFromReverseResult({ address: { postcode: '' } })).toBeNull()
  })
})

describe('zipFromCoordsBounded (the race the button awaits)', () => {
  const SEATTLE_COORDS = { lat: 47.6685, lng: -122.386 }

  it('resolves the ZIP when the lookup answers in time', async () => {
    const lookup = vi.fn().mockResolvedValue({ address: { postcode: '98107' } })
    await expect(zipFromCoordsBounded(SEATTLE_COORDS, 5000, lookup)).resolves.toBe('98107')
    expect(lookup).toHaveBeenCalledWith(47.6685, -122.386)
  })

  it('settles to null when the lookup outruns the deadline', async () => {
    // The pending-state rule: a slow reverse lookup must not hold the card.
    const lookup = vi.fn().mockReturnValue(new Promise(() => {}))
    await expect(zipFromCoordsBounded(SEATTLE_COORDS, 10, lookup)).resolves.toBeNull()
  })

  it('settles to null when the lookup finds no usable postcode', async () => {
    const lookup = vi.fn().mockResolvedValue({ address: {} })
    await expect(zipFromCoordsBounded(SEATTLE_COORDS, 5000, lookup)).resolves.toBeNull()
  })

  it('rethrows a rejection that lands before the deadline', async () => {
    // Same contract as the forward sibling: a real failure the caller may see
    // is not silently converted into "absent".
    const lookup = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(zipFromCoordsBounded(SEATTLE_COORDS, 5000, lookup)).rejects.toThrow('boom')
  })

  it('leaves no dangling timer after a fast success', async () => {
    vi.useFakeTimers()
    try {
      const lookup = vi.fn().mockResolvedValue({ address: { postcode: '98107' } })
      const promise = zipFromCoordsBounded(SEATTLE_COORDS, 5000, lookup)
      await vi.advanceTimersByTimeAsync(0)
      await expect(promise).resolves.toBe('98107')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
