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
 * ONE `getCurrentPosition` call. `timeout` is an INTERNAL status and never
 * escapes this module: `readDeviceCoords` maps it to `unavailable` in the end,
 * because "we could not get a fix" is what the parent has to act on, and the
 * four named outcomes are what `locationCopy` writes sentences for ("a new
 * status cannot be added without a compile error here" — `lib/locationCopy.ts`).
 * The two are kept apart inside ONLY so the caller below can tell a request that
 * ran out of time from one the device actually answered, which is the whole
 * basis of the retry.
 */
type Attempt = GeolocationOutcome | { status: 'timeout' }

function askOnce(timeoutMs: number): Promise<Attempt> {
  return new Promise<Attempt>((resolve) => {
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
        // The spec's three error codes. A TIMEOUT is not "denied": the parent
        // did not refuse, and telling them they did would be a lie that also
        // hides the retry. It is kept distinct from POSITION_UNAVAILABLE (code
        // 2 — location services off, no provider, no hardware) because only the
        // timeout is worth another window; see `readDeviceCoords`.
        if (error.code === error.PERMISSION_DENIED) {
          resolve({ status: 'denied' })
          return
        }
        if (error.code === error.TIMEOUT) {
          resolve({ status: 'timeout' })
          return
        }
        resolve({ status: 'unavailable' })
      },
      {
        // ⚠️ `true` IS NOT COSMETIC, AND THE OBVIOUS CHOICE — `false` — IS THE
        // WRONG ONE. The W3C spec calls this hint only ("the implementation MAY
        // avoid using geolocation providers that consume a significant amount of
        // power"), so asking for LESS accuracy looks strictly safer. In the
        // installed Android shell it is the opposite.
        //
        // Chromium's `LocationProviderAndroid.start()` refuses to answer at all
        // when it holds ACCESS_FINE_LOCATION and the page asked for low accuracy
        // — "When Chrome is granted with app-level precise permission, we cannot
        // generate approximate (coarse) location using Criteria. To avoid leaking
        // precise location when coarse location is requested, report a position
        // error." (`services/device/geolocation/android/java/…/LocationProviderAndroid.java:61-73`,
        // crbug.com/502587667) — and the feature behind it
        // (`kApproximateGeolocationPermission`) is
        // `FEATURE_ENABLED_BY_DEFAULT` on Android. So with `false` the feature
        // WORKS for a parent who taps Approximate (no fine permission held → the
        // guard cannot fire) and FAILS, as `unavailable`, for one who taps
        // Precise — the reverse of intuition, and the one branch no one would
        // test. `true` never enters the guard in either branch; if the parent
        // chose Approximate, `has_precise_permission_` is false and the coarse
        // fix still comes back.
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 60_000,
      },
    )
  })
}

/**
 * Ask for ONE position fix — or, after a timeout, for one more. Never rejects:
 * every failure mode becomes a named outcome, so a caller never needs a
 * try/catch and a parent never sees a crash from a permission dialog.
 *
 * ⚠️ WHY A RETRY AND NOT A LONGER CONSTANT — measured, 2026-10-06. Chromium
 * starts this timeout when the request is made, and the OS permission dialog is
 * part of that request: on the emulator the call died at `ms=10001`, code 3
 * "Timeout expired", with `GrantPermissionsActivity` **still focused and
 * unanswered**, while a cold precise fix afterwards took ~4.4–5.9 s. So a
 * first-time parent — the only one who ever sees that dialog, and the parent this
 * feature was built for — who took more than ~5 s to read it was told
 * *"We couldn't get your location just now"* AFTER allowing, and had to tap
 * again. With the retry in place the same walk was measured on the device
 * answering at t+11 s and returning a position (`ms=5876`), so the survivable
 * dialog-read time went from ~5 s to ~11 s. Raising `GEOLOCATION_TIMEOUT_MS`
 * would buy that by making EVERY failure wait longer, including the ones with no
 * dialog in sight; this buys it by spending a second window only where the first
 * expired.
 *
 * ⚠️ THE RETRY IS UNCONDITIONAL ON PURPOSE, AND A GATE HERE WAS TRIED AND
 * REMOVED. The first version of this fix asked `navigator.permissions.query`
 * before the call and skipped the retry when the permission was already
 * `granted` — reasoning that no dialog can appear then, so a timeout is a real
 * "no fix in 10 s". MEASURED, AND IT IS FALSE IN THE SHIPPED ANDROID SHELL: with
 * `dumpsys package` showing `ACCESS_FINE_LOCATION: granted=true`, that query
 * still answers `"prompt"`, because Capacitor satisfies the WebView's geolocation
 * prompt itself (`onGeolocationPermissionsShowPrompt`) and never persists a
 * Chromium grant. The gate could not fire in the app at all — dead code that
 * looked like protection, which by this repo's own standard ("a checker that
 * matches nothing looks like a clean repo") is a defect, not caution. The shell
 * genuinely cannot tell "a dialog is pending" from "the provider is silent", and
 * pretending otherwise is what produced that dead gate.
 *
 * What is left is the honest shape: **every TIMEOUT gets one more attempt**;
 * `denied` (code 1) and POSITION_UNAVAILABLE (code 2) do not — see `askOnce`. A
 * timeout on the first attempt usually MEANS a pending dialog or a fix that
 * needed longer, which is precisely what the second attempt fixes, so the extra
 * time is mostly spent on requests that then succeed; and when it does not
 * succeed, it was going to fail anyway.
 *
 * WORST CASE, stated plainly: 20 s — 10 s + 10 s — before the parent is told
 * `unavailable`, with the button reading "Finding you…" for the whole of it. It
 * applies to the TIMEOUT path ONLY. `denied`, POSITION_UNAVAILABLE (Location
 * services off, no provider, no hardware) and `unsupported` are single-attempt
 * and still resolve in 10 s or less.
 *
 * `once: false` is left at its default deliberately — this reads a single fix
 * and stops; nothing here subscribes to movement.
 */
export async function readDeviceCoords(
  timeoutMs: number = GEOLOCATION_TIMEOUT_MS,
): Promise<GeolocationOutcome> {
  if (!isGeolocationAvailable()) return { status: 'unsupported' }

  const first = await askOnce(timeoutMs)
  if (first.status !== 'timeout') return first

  const second = await askOnce(timeoutMs)
  return second.status === 'timeout' ? { status: 'unavailable' } : second
}
