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

/**
 * Answer `navigator.permissions.query({name:'geolocation'})` with `state`.
 *
 * ⚠️ THE MODULE UNDER TEST DOES NOT READ THIS API AT ALL — and that is the
 * property the stub is here to hold. An earlier version of the fix gated the
 * retry on this value, which measured as DEAD CODE in the Android shell (see
 * `lib/geolocation.ts`); the one test that uses this stub feeds it `"granted"`,
 * the value that used to suppress the retry, and requires the retry anyway.
 * `removePermissions` below keeps a stale stub from leaking between tests.
 */
function stubPermissionState(state: PermissionState): void {
  Object.defineProperty(navigator, 'permissions', {
    value: { query: () => Promise.resolve({ state } as PermissionStatus) },
    configurable: true,
    writable: true,
  })
}

/** Remove the Permissions API, so no stub leaks between tests. */
function removePermissions(): void {
  Object.defineProperty(navigator, 'permissions', {
    value: undefined,
    configurable: true,
    writable: true,
  })
}

/**
 * Sequence several `getCurrentPosition` calls. Each entry decides how THAT call
 * settles, so a timeout followed by a fix (the dialog case) can be expressed.
 */
function stubGeolocationCalls(
  impls: Array<(success: PositionCallback, error: PositionErrorCallback) => void>,
): ReturnType<typeof vi.fn> {
  const spy = vi.fn((success: PositionCallback, error: PositionErrorCallback) => {
    const impl = impls[spy.mock.calls.length - 1]
    if (impl) impl(success, error)
    // No impl left: the call never answers, like a device that stopped replying.
  })
  stubGeolocation(spy)
  return spy
}

/** The spec's TIMEOUT, the only error a retry is spent on. */
const timeoutError = (
  _success: PositionCallback,
  error: PositionErrorCallback,
): void => error({ code: 3, TIMEOUT: 3 } as GeolocationPositionError)

afterEach(() => {
  removeGeolocation()
  removePermissions()
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
    // The permission state is read BEFORE the request now, so the call is one
    // microtask later than it used to be — nothing the app can observe, but the
    // assertion has to wait for it.
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    const options = spy.mock.calls[0][2] as PositionOptions
    expect(options.timeout).toBe(1234)
    // ⚠️ THIS USED TO ASSERT `false`, ON THE REASONING THAT COARSE IS CHEAPER
    // AND A ZIP NEEDS NO MORE. The reasoning was about battery, and the
    // assertion was about the ONLY thing that can break the feature: it is
    // edited on purpose in slice 2d, and the comment it replaced was wrong in
    // the installed Android shell. Chromium's `LocationProviderAndroid` reports
    // "Cannot generate approximate location." — a POSITION_UNAVAILABLE, i.e.
    // the app's `unavailable` — whenever the app holds ACCESS_FINE_LOCATION and
    // the page asked for LOW accuracy, and that guard is enabled by default
    // (`LocationProviderAndroid.java:61-73`, `features.cc:42-48`). So with
    // `false` the flow works for a parent who taps Approximate and FAILS for one
    // who taps Precise; `true` is the only value that works in both branches.
    // `lib/geolocation.ts` carries the full reasoning beside the option.
    expect(options.enableHighAccuracy).toBe(true)
  })

  it('defaults the timeout to the exported constant', async () => {
    const spy = vi.fn()
    stubGeolocation(spy)
    void readDeviceCoords()
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    const options = spy.mock.calls[0][2] as PositionOptions
    expect(options.timeout).toBe(GEOLOCATION_TIMEOUT_MS)
  })
})

/**
/**
 * THE RETRY.
 *
 * Chromium starts the request's 10 s clock when the request is made, and the OS
 * permission dialog is inside that window — measured on the emulator: the call
 * died at `ms=10001`, code 3 "Timeout expired", with `GrantPermissionsActivity`
 * still focused and unanswered. So the first-ever ask can be spent entirely on a
 * parent reading the dialog, and the retry is what makes that survivable
 * (measured on the device: answered at t+11 s → a position, `ms=5876`).
 *
 * These tests pin the rule and its two exceptions, because a retry that fires in
 * the wrong place doubles a wait instead of saving one:
 *
 *  - every TIMEOUT gets exactly one more attempt, WHATEVER the Permissions API
 *    says — including `"granted"`, which is precisely the shell's confusing case
 *    and the value a since-removed gate wrongly trusted;
 *  - `denied` and POSITION_UNAVAILABLE are answers, not timeouts: one attempt;
 *  - `timeout` never escapes to a caller: two of them become `unavailable`.
 */
describe('readDeviceCoords — the one retry after a TIMEOUT', () => {
  it('retries when the dialog ate the budget, and the second call gets the fix', async () => {
    // The dialog case: the first attempt times out while the parent is still
    // reading, and they have answered by the time the retry runs.
    const spy = stubGeolocationCalls([
      timeoutError,
      (success) => success(position(47.6685, -122.386)),
    ])
    await expect(readDeviceCoords()).resolves.toEqual({
      status: 'granted',
      coords: { lat: 47.6685, lng: -122.386 },
    })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('retries every TIMEOUT once, whatever the Permissions API claims — including "granted"', async () => {
    // ⚠️ THE SHELL'S CASE, AND THE REGRESSION GUARD FOR THE REMOVED GATE. Inside
    // the Android app `permissions.query` answers "prompt" even while the OS
    // permission is granted, so gating the retry on this value suppressed it
    // nowhere and protected nothing. Whatever it says, a TIMEOUT retries.
    for (const state of ['granted', 'prompt', 'denied'] as PermissionState[]) {
      stubPermissionState(state)
      const spy = stubGeolocationCalls([timeoutError, timeoutError])
      await expect(readDeviceCoords()).resolves.toEqual({ status: 'unavailable' })
      expect(spy, `permission state ${state}`).toHaveBeenCalledTimes(2)
    }
  })

  it('gives up after the second timeout without leaking an internal status', async () => {
    // `timeout` exists only inside this module; the caller's world has four
    // statuses and `unavailable` is the honest one after two windows.
    const spy = stubGeolocationCalls([timeoutError, timeoutError])
    await expect(readDeviceCoords()).resolves.toEqual({ status: 'unavailable' })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('spends the retry on the same budget as the first attempt', async () => {
    const spy = stubGeolocationCalls([timeoutError, timeoutError])
    await readDeviceCoords(1234)
    expect(spy).toHaveBeenCalledTimes(2)
    expect((spy.mock.calls[0][2] as PositionOptions).timeout).toBe(1234)
    expect((spy.mock.calls[1][2] as PositionOptions).timeout).toBe(1234)
  })

  it('never retries a refusal — a denial is an answer, not a timeout', async () => {
    const spy = stubGeolocationCalls([
      (_success, error) => error({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
      (success) => success(position(1, 2)),
    ])
    await expect(readDeviceCoords()).resolves.toEqual({ status: 'denied' })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('never retries POSITION_UNAVAILABLE — GPS off is not a slow dialog', async () => {
    const spy = stubGeolocationCalls([
      (_success, error) => error({ code: 2, POSITION_UNAVAILABLE: 2 } as GeolocationPositionError),
      (success) => success(position(1, 2)),
    ])
    await expect(readDeviceCoords()).resolves.toEqual({ status: 'unavailable' })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('does not retry a first attempt that succeeded', async () => {
    const spy = stubGeolocationCalls([(success) => success(position(3, 4))])
    await expect(readDeviceCoords()).resolves.toEqual({
      status: 'granted',
      coords: { lat: 3, lng: 4 },
    })
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
