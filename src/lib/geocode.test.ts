/**
 * The geocode seam's sibling test (first-use audit, ticket 02; V28 slice 5).
 *
 * WHY THIS FILE EXISTS, beyond the build law's "every lib module ships a test":
 * the audit's second finding is that a parent whose address did not
 * resolve to a ZIP was moved to a ZIP screen with no explanation — since V28
 * slice 5 that note is the AREA CARD's own (its bounded lookup's "absent"
 * outcome). The fix is only worth anything if the UNRESOLVED path is real and
 * testable, and it was
 * not: `zipFromAddressQuery` hit Nominatim directly, so the only way to reach
 * the failure was for the network to fail. Nothing here touches the network —
 * every case injects the lookup, which is the one dependency this module has.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  coordinatesFromResult,
  geocodeAddress,
  locationFromAddressQuery,
  locationFromAddressQueryBounded,
  locationFromResult,
  zipFromAddressQuery,
  zipFromAddressQueryBounded,
  zipFromResult,
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
  it('zipFromAddressQuery passes the TRIMMED query and returns the pure decision', async () => {
    const lookup = vi.fn(async () => STREET_RESULT)
    expect(await zipFromAddressQuery(`  ${SEATTLE}  `, lookup)).toBe('98105')
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledWith(SEATTLE)
  })

  it('zipFromAddressQuery short-circuits an empty query WITHOUT a lookup', async () => {
    const lookup = vi.fn(async () => STREET_RESULT)
    expect(await zipFromAddressQuery('   ', lookup)).toBe(null)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('zipFromAddressQuery survives a lookup that fails — the fallback path', async () => {
    // This is the audit's unresolved branch for real: the dependency returns
    // null (network error, non-OK, nothing found), and the caller must get a
    // clean null so /onboarding can explain itself instead of crashing.
    const lookup = vi.fn(async () => null)
    expect(await zipFromAddressQuery(SEATTLE, lookup)).toBe(null)
  })

  it('geocodeAddress uses the same injected seam', async () => {
    const lookup = vi.fn(async () => STREET_RESULT)
    expect(await geocodeAddress(SEATTLE, lookup)).toEqual({ lat: 47.6612, lng: -122.3255 })
    expect(lookup).toHaveBeenCalledWith(SEATTLE)
  })

  it('geocodeAddress returns null when the lookup yields nothing', async () => {
    expect(await geocodeAddress(SEATTLE, async () => null)).toBe(null)
  })
})

// ---------------------------------------------------------------------------
// V28 slice 5 — the bounded escape the pending-state rule requires for a
// card-gating lookup. The area card (required, no Skip) races the injected
// lookup against a timer: a Nominatim answer that stalls must settle to
// "absent" and reveal the card's ZIP fallback, never stall the run.
// ---------------------------------------------------------------------------

describe('zipFromAddressQueryBounded (V28 slice 5 — the card-gating lookup\'s bounded escape)', () => {
  it('a fast lookup wins the race and settles to its zip', async () => {
    vi.useFakeTimers()
    try {
      const lookup = vi.fn(async () => STREET_RESULT)
      const pending = zipFromAddressQueryBounded(SEATTLE, 10_000, lookup)
      expect(await pending).toBe('98105')
      expect(lookup).toHaveBeenCalledTimes(1)
      // The pending deadline was cancelled: a fast lookup leaves no timer behind.
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a lookup that never settles settles to "absent" (null) at the deadline', async () => {
    vi.useFakeTimers()
    try {
      // A stalled network: a promise that never settles (the rule\'s trap —
      // a card awaiting it would stall the run, and the run is never a wall).
      const neverSettled = new Promise<NominatimResult | null>(() => {})
      const lookup = vi.fn(() => neverSettled)
      const pending = zipFromAddressQueryBounded(SEATTLE, 10_000, lookup)
      vi.advanceTimersByTime(10_000)
      expect(await pending).toBe(null)
      expect(lookup).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a failed lookup settles to null before the deadline (the fast fallback path)', async () => {
    vi.useFakeTimers()
    try {
      const lookup = vi.fn(async () => null)
      const pending = zipFromAddressQueryBounded(SEATTLE, 10_000, lookup)
      expect(await pending).toBe(null)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('an empty query short-circuits without a lookup (and without a timer)', async () => {
    const lookup = vi.fn(async () => STREET_RESULT)
    expect(await zipFromAddressQueryBounded('   ', 10_000, lookup)).toBe(null)
    expect(lookup).not.toHaveBeenCalled()
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
