/**
 * Sibling tests for `lib/geolocation.ts` (the device half of "use my location").
 *
 * WHAT THIS FILE IS ACTUALLY GUARDING. Not "does it call getCurrentPosition" —
 * that is one line. The value is in the FOUR-WAY OUTCOME MAPPING and the
 * never-rejects contract: a parent who denies permission, a device that cannot
 * get a fix, and a browser on an insecure origin must each produce a DIFFERENT
 * named outcome, because the caller renders a different sentence for each. A
 * helper that collapses them into a boolean cannot be phrased honestly.
 *
 * The stubs below replace `navigator.geolocation` wholesale. jsdom does not
 * implement it, so the "API absent" case is the natural state of the test
 * environment and is asserted as such rather than simulated.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GEOLOCATION_TIMEOUT_MS,
  isGeolocationAvailable,
  readDeviceCoords,
} from './geolocation'

/** The shape `getCurrentPosition` hands its success callback. */
function position(latitude: number, longitude: number): GeolocationPosition {
  return { coords: { latitude, longitude } } as GeolocationPosition
}

/**
 * Install a stub geolocation. `impl` decides how the call settles; returning
 * nothing simulates a device that never answers (the timeout path).
 */
function stubGeolocation(
  impl: (
    success: PositionCallback,
    error: PositionErrorCallback,
  ) => void,
): void {
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition: impl },
    configurable: true,
    writable: true,
  })
}

/** Remove geolocation entirely, simulating an insecure origin. */
function removeGeolocation(): void {
  Object.defineProperty(navigator, 'geolocation', {
    value: undefined,
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  removeGeolocation()
  vi.restoreAllMocks()
})

describe('isGeolocationAvailable (the render gate)', () => {
  it('is false when the API is absent (an insecure origin, jsdom default)', () => {
    removeGeolocation()
    expect(isGeolocationAvailable()).toBe(false)
  })

  it('is true when a geolocation object is present', () => {
    stubGeolocation(() => {})
    expect(isGeolocationAvailable()).toBe(true)
  })

  it('treats an explicit null as absent, not as available', () => {
    // Some browsers expose the property but null it on an insecure origin.
    Object.defineProperty(navigator, 'geolocation', {
      value: null,
      configurable: true,
      writable: true,
    })
    expect(isGeolocationAvailable()).toBe(false)
  })
})

describe('readDeviceCoords (four named outcomes, and it never rejects)', () => {
  it('granted: returns the coordinates from a successful fix', async () => {
    stubGeolocation((success) => success(position(47.6685, -122.386)))
    await expect(readDeviceCoords()).resolves.toEqual({
      status: 'granted',
      coords: { lat: 47.6685, lng: -122.386 },
    })
  })

  it('unsupported: the API is missing, and it does NOT throw', async () => {
    removeGeolocation()
    await expect(readDeviceCoords()).resolves.toEqual({ status: 'unsupported' })
  })

  it('denied: PERMISSION_DENIED maps to the denied outcome, not to unavailable', async () => {
    // This is the distinction that matters most: "you said no" and "we could not
    // get a fix" need different sentences, and the second one is a retry.
    stubGeolocation((_success, error) =>
      error({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
    )
    await expect(readDeviceCoords()).resolves.toEqual({ status: 'denied' })
  })

  it('unavailable: a POSITION_UNAVAILABLE error is retryable, not a refusal', async () => {
    stubGeolocation((_success, error) =>
      error({ code: 2, POSITION_UNAVAILABLE: 2 } as GeolocationPositionError),
    )
    await expect(readDeviceCoords()).resolves.toEqual({ status: 'unavailable' })
  })

  it('unavailable: a TIMEOUT error is NOT reported as denied', async () => {
    // Telling a parent they denied permission when they did not is a lie that
    // also hides the retry — the exact defect this branch exists to prevent.
    stubGeolocation((_success, error) =>
      error({ code: 3, TIMEOUT: 3 } as GeolocationPositionError),
    )
    await expect(readDeviceCoords()).resolves.toEqual({ status: 'unavailable' })
  })

  it('unavailable: a fix with non-finite coordinates is refused, not passed on', async () => {
    // A NaN latitude would flow into a reverse-geocode URL and produce a
    // confident wrong answer from the network. Refuse it here instead.
    stubGeolocation((success) => success(position(NaN, -122.386)))
    await expect(readDeviceCoords()).resolves.toEqual({ status: 'unavailable' })
  })

  it('never rejects, for any failure mode', async () => {
    // The contract that keeps callers free of try/catch.
    stubGeolocation((_success, error) =>
      error({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
    )
    await expect(readDeviceCoords()).resolves.toBeDefined()
  })

  it('passes a timeout to the browser so a dead provider cannot hang the card', async () => {
    const spy = vi.fn()
    stubGeolocation(spy)
    void readDeviceCoords(1234)
    expect(spy).toHaveBeenCalledTimes(1)
    const options = spy.mock.calls[0][2] as PositionOptions
    expect(options.timeout).toBe(1234)
    // Coarse accuracy is deliberate: a ZIP needs city-block precision, and
    // high accuracy means a longer fix and a bigger battery cost for nothing.
    expect(options.enableHighAccuracy).toBe(false)
  })

  it('defaults the timeout to the exported constant', async () => {
    const spy = vi.fn()
    stubGeolocation(spy)
    void readDeviceCoords()
    const options = spy.mock.calls[0][2] as PositionOptions
    expect(options.timeout).toBe(GEOLOCATION_TIMEOUT_MS)
  })
})
