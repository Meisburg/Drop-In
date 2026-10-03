/**
 * V28 r4 — THE DEVICE HALF of "use my location": reading the browser's position.
 *
 * WHY THIS IS ITS OWN MODULE, SEPARATE FROM `lib/geocode.ts`. That module is the
 * NETWORK seam — one request builder, injected lookups, pure decision functions.
 * This one touches a BROWSER PERMISSION API, which is a different kind of
 * dependency with a different failure mode. Keeping them apart is what lets the
 * geocode half stay testable with no browser at all, and lets this half be the
 * one place that knows about `navigator.geolocation`.
 *
 * ⚠️ THIS REVERSES A WRITTEN INVARIANT, DELIBERATELY. Three files used to state
 * that the app NEVER uses browser geolocation:
 *
 *   `lib/geocode.ts`            "no key, no browser geolocation: the app's pinned invariant"
 *   `components/PlaceMap.tsx`   "No browser geolocation anywhere"
 *   `components/PlaydateFormFields.tsx` "never browser geolocation"
 *
 * The founder asked for the opposite — *"for the places where we ask the user
 * for their address/zip code, I'm wondering if we could pull that automatically
 * from their phone to get their location and put it in with their permission to
 * access that data? isn't that what most apps do?"* — and the answer is yes,
 * that is what most apps do. Those comments are updated to describe what is now
 * true rather than left as claims the code contradicts. The INVARIANT they were
 * protecting is preserved in a narrower, still-true form:
 *
 *   **Location is only ever read after an explicit parent tap, and a typed
 *   address remains the default path.** Nothing in the app asks for location on
 *   arrival, on mount, or in the background — an auto-prompt is the pattern that
 *   trains people to hit "Block", and a block cannot be re-asked.
 *
 * ⚠️ HTTPS ONLY, AND THAT IS A HARD BROWSER RULE, NOT A CHOICE. `getCurrentPosition`
 * is unavailable in a non-secure context: on a plain-HTTP origin (a LAN dev
 * server at `192.168.1.x:5173`, say) the API is simply absent. `isGeolocationAvailable`
 * reports that honestly so the caller can hide the button rather than render a
 * control that cannot work. Production is HTTPS, so real parents are unaffected.
 */

/** How long a position fix may take before we give up and offer the typed field. */
export const GEOLOCATION_TIMEOUT_MS = 10_000

/** A successful read: the coordinates, never the raw `GeolocationPosition`. */
export interface DeviceCoords {
  lat: number
  lng: number
}

/**
 * The outcome of asking the device for a position. EVERY case is named, because
 * the caller must phrase a different sentence for each and "it failed" is not
 * actionable to a parent:
 *
 *  - `granted`   — coordinates in hand.
 *  - `denied`    — the parent said no (or a previous answer was remembered).
 *  - `unavailable` — no fix: no signal, a timeout, or a device with no provider.
 *  - `unsupported` — the API is absent entirely (insecure origin, old browser).
 */
export type GeolocationOutcome =
  | { status: 'granted'; coords: DeviceCoords }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'unsupported' }

/**
 * Is there a usable geolocation API here at all? False on an insecure origin.
 * The caller uses this to decide whether to RENDER the button — a control that
 * silently does nothing is worse than no control.
 */
export function isGeolocationAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.geolocation !== 'undefined' &&
    navigator.geolocation !== null
  )
}

/**
 * Ask for ONE position fix. Never rejects: every failure mode becomes a named
 * outcome, so a caller never needs a try/catch and a parent never sees a crash
 * from a permission dialog.
 *
 * `once: false` is left at its default deliberately — this reads a single fix
 * and stops; nothing here subscribes to movement.
 */
export function readDeviceCoords(
  timeoutMs: number = GEOLOCATION_TIMEOUT_MS,
): Promise<GeolocationOutcome> {
  if (!isGeolocationAvailable()) return Promise.resolve({ status: 'unsupported' })

  return new Promise<GeolocationOutcome>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        // A position object with non-finite numbers is not a usable fix; treat
        // it as unavailable rather than handing NaN to a URL builder.
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          resolve({ status: 'unavailable' })
          return
        }
        resolve({ status: 'granted', coords: { lat: latitude, lng: longitude } })
      },
      (error) => {
        // The spec's three error codes. A TIMEOUT is "unavailable" and not
        // "denied": the parent did not refuse, and telling them they did would
        // be a lie that also hides the retry.
        if (error.code === error.PERMISSION_DENIED) {
          resolve({ status: 'denied' })
          return
        }
        resolve({ status: 'unavailable' })
      },
      {
        enableHighAccuracy: false,
        timeout: timeoutMs,
        maximumAge: 60_000,
      },
    )
  })
}
