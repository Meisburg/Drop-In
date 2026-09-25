/**
 * The geocode seam's sibling test (first-use audit, ticket 02).
 *
 * WHY THIS FILE EXISTS, beyond the build law's "every lib module ships a test":
 * the audit's second finding is that a parent whose signup address did not
 * resolve to a ZIP was moved to a ZIP screen with no explanation. The fix is
 * only worth anything if the UNRESOLVED path is real and testable, and it was
 * not: `zipFromAddressQuery` hit Nominatim directly, so the only way to reach
 * the failure was for the network to fail. Nothing here touches the network —
 * every case injects the lookup, which is the one dependency this module has.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  coordinatesFromResult,
  geocodeAddress,
  zipFromAddressQuery,
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

describe('zipFromResult — the two outcomes the signup fallback depends on', () => {
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
