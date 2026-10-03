/**
 * V15 ticket 02: the browse map rework's geocode seam.
 *
 * `geocodeAddress` turns a typed address into lat/lng via Nominatim (OpenStreetMap's
 * free geocoder — no key).
 *
 * V28 r4 — THE "NO BROWSER GEOLOCATION" HALF OF THIS SENTENCE IS NO LONGER TRUE,
 * and the claim is corrected rather than deleted so the reversal is visible. The
 * founder asked for device location on the address steps; that work lives in
 * `lib/geolocation.ts` (the browser permission API) and the reverse lookup below
 * (coordinates → ZIP). What survives, narrowed but still binding: **location is
 * read only after an explicit parent tap, typed address stays the default, and
 * nothing prompts on mount.** Every distance in the product still keys on a ZIP,
 * which is why a coordinate is never stored on its own.
 *
 * The pure decisions live here so the modal's Apply path and the area
 * card's (the first run's LAST card — 4 of 4 since V28 r2 deleted the photo card;
 * it was 5 of 5 when this line was written) address derivation are testable; the fetch itself is thin and returns null
 * on ANY failure (network error, non-OK status, empty result) — a failed
 * geocode must never invent coordinates.
 *
 * TWO EXTRACTIONS, ONE REQUEST. `zipFromResult` and `coordinatesFromResult`
 * are the pure policies over one Nominatim answer, and `locationFromResult`
 * pairs them: the area card needs BOTH the ZIP (the value every distance in
 * the product keys on) and the pin (its own map), and pairing them here is
 * what makes "one request per distinct address" a property of the seam rather
 * than a discipline the caller has to remember.
 *
 * V28 slice 4/5: the area card (the first run's last card, OnboardingPage)
 * runs that lookup through `locationFromAddressQueryBounded`, which is
 * BOUNDED — a Nominatim answer that does not settle in time settles to
 * "absent" (`null`) instead of stalling the card (the pending-state rule's
 * escape), which reveals the card's ZIP fallback rather than leaving the run a
 * wall (decision 6). `geocodeAddress` (the directory's Apply path) is
 * the same seam, unbounded. Every function shares one request builder, so
 * there is exactly one place the User-Agent header, the URL shape and the
 * failure contract live.
 *
 * V28 r2 slice 8a: the ZIP-ONLY pair (`zipFromResult`'s async wrappers
 * `zipFromAddressQuery` and `zipFromAddressQueryBounded`) was DELETED —
 * measured at 8d1170d they had zero production callers, because the card
 * replaced its zip-only call with the location one in slice 4. `zipFromResult`
 * itself stays: `locationFromResult` calls it.
 *
 * FIRST-USE AUDIT (ticket 02) adds the TEST SEAM. The two outcomes the area
 * card's fallback note (V28 slice 5) hangs on — a resolved address and an
 * unresolved one ("the address could not be matched to a ZIP") — were
 * previously unreachable without the live network: the module had no sibling
 * test, and the only way to exercise the failure was for Nominatim to fail for
 * real. So the policy is a pure function over a PRE-FETCHED lookup, and every
 * async function accepts an optional `lookup` (the ONE dependency injected).
 * Production passes nothing and gets the fetch; a test passes a fake and gets
 * the same decision the app would make.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
/**
 * V28 r4 — the REVERSE endpoint: coordinates in, an address out. Same
 * provider, same keyless policy, same User-Agent requirement.
 */
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'
// Nominatim's usage policy requires a User-Agent that identifies the client.
const USER_AGENT = 'playdate-app/1.0 (browse map rework; contact: local)'

export interface NominatimResult {
  lat?: string
  lon?: string
  /** V20 t06: filled only when the request asks for `addressdetails=1`. */
  address?: { postcode?: string; house_number?: string }
  /** V28 r4: the reverse endpoint's own display string, used only in reports. */
  display_name?: string
}

/** The injected dependency: one address string in, at most one result out. */
export type AddressLookup = (query: string) => Promise<NominatimResult | null>

/**
 * V28 r4 — the injected REVERSE dependency: coordinates in, at most one result
 * out. Injected for the same reason `AddressLookup` is: the decision over the
 * answer stays unit-testable with no network.
 */
export type ReverseLookup = (
  lat: number,
  lng: number,
) => Promise<NominatimResult | null>

/**
 * The one request both callers make. `addressdetails=1` is what makes the
 * structured `address.postcode` come back — it is harmless for the lat/lng
 * caller and required by the ZIP one, so it is always on rather than a flag
 * that could drift between the two.
 */
async function searchFirst(query: string): Promise<NominatimResult | null> {
  const trimmed = query.trim()
  if (trimmed === '') return null
  try {
    const url = `${NOMINATIM_URL}?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(trimmed)}`
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!response.ok) return null
    const results = (await response.json()) as NominatimResult[]
    return results[0] ?? null
  } catch {
    return null
  }
}

/**
 * V28 r4 — the reverse request. Coordinates in, one address out.
 *
 * WHY THIS EXISTS AT ALL: the browser's geolocation API returns a LAT/LNG, but
 * the entire product keys on a **ZIP** — `profiles.home_zip` is what every
 * distance and the feed radius are computed from (`lib/feed.ts`), and a
 * coordinate is not a substitute. So "use my location" needs one more hop to
 * become the value the app actually stores.
 *
 * SAME FAILURE CONTRACT AS `searchFirst`: never throws, returns null on
 * anything unexpected. A reverse lookup that fails must not invent a ZIP, and
 * the caller's fallback (the typed-ZIP field) is the honest outcome.
 *
 * NO `zoom` / `addressdetails` TUNING BEYOND WHAT IS NEEDED: `addressdetails=1`
 * is what surfaces the structured `address.postcode`; the default zoom returns
 * the nearest addressable object, which is the right granularity for "which ZIP
 * am I in".
 */
async function reverseFirst(lat: number, lng: number): Promise<NominatimResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  try {
    const url = `${NOMINATIM_REVERSE_URL}?format=json&addressdetails=1&lat=${lat}&lon=${lng}`
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!response.ok) return null
    return (await response.json()) as NominatimResult
  } catch {
    return null
  }
}

/**
 * V28 r4 — THE DECISION over a reverse-geocode answer: is there a usable 5-digit
 * ZIP here? Pure, so the guard is testable without a network or a browser.
 *
 * Deliberately STRICTER than `zipFromResult`. That function has to decide
 * whether Nominatim resolved the address the parent TYPED, so it can treat a
 * matching typed ZIP as its own proof of precision. Here there is no typed
 * address to corroborate anything — the coordinates came from the device and
 * the answer is taken on faith — so the only acceptable evidence is a
 * well-formed 5-digit postcode in the structured address. A missing or
 * partial code means we do not know the ZIP, and the caller must fall back to
 * asking rather than guess.
 */
export function zipFromReverseResult(result: NominatimResult | null): string | null {
  const postcode = (result?.address?.postcode ?? '').trim()
  return /^\d{5}$/.test(postcode) ? postcode : null
}

/**
 * V28 r4 — THE SEAM THE "USE MY LOCATION" BUTTON CALLS.
 *
 * Coordinates → a validated ZIP (or null). The device half (`getCurrentPosition`)
 * lives in `lib/geolocation.ts`, NOT here: this module is the network seam, and
 * keeping the browser permission API out of it is what lets both halves be
 * tested in isolation — a jsdom test can supply coordinates without a permission
 * prompt, and the coordinate helper can be tested without a network.
 *
 * THE BOUNDED RACE IS THE SAME DISCIPLINE the area card's address lookup already
 * uses (`locationFromAddressQueryBounded`): a reverse lookup that does not settle
 * within the deadline settles to "absent" rather than stalling a card mid-run.
 * A rejection still rethrows, exactly like its forward sibling.
 */
export function zipFromCoordsBounded(
  coords: { lat: number; lng: number },
  timeoutMs: number,
  lookup: ReverseLookup = reverseFirst,
): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<string | null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs)
  })
  const resolved = lookup(coords.lat, coords.lng)
    .then((result) => {
      if (timer !== undefined) clearTimeout(timer)
      return zipFromReverseResult(result)
    })
    .catch((err) => {
      if (timer !== undefined) clearTimeout(timer)
      throw err
    })
  return Promise.race([resolved, deadline])
}

/**
 * V28 r4 — the HUMAN-READABLE label for a coordinate, bounded.
 *
 * The "Set location" modal needs a street address it can put in a text field;
 * `zipFromCoordsBounded` answers a different question (which ZIP, for the
 * onboarding card, where the ZIP is what gets stored). Both run the same
 * reverse request, so this is the second pure extraction over ONE answer shape
 * rather than a second network path.
 *
 * Returns null on any failure, including an empty or whitespace-only display
 * name — the caller then keeps the coordinates and says so, because the fix is
 * still usable even when its label is not.
 */
export function addressFromReverseResult(result: NominatimResult | null): string | null {
  const name = (result?.display_name ?? '').trim()
  return name === '' ? null : name
}

export function addressFromCoordsBounded(
  coords: { lat: number; lng: number },
  timeoutMs: number,
  lookup: ReverseLookup = reverseFirst,
): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<string | null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs)
  })
  const resolved = lookup(coords.lat, coords.lng)
    .then((result) => {
      if (timer !== undefined) clearTimeout(timer)
      return addressFromReverseResult(result)
    })
    .catch((err) => {
      if (timer !== undefined) clearTimeout(timer)
      throw err
    })
  return Promise.race([resolved, deadline])
}

/**
 * The lat/lng DECISION, over an already-fetched result. Pure, so the parse and
 * the finite-number guard are testable without a network.
 */
export function coordinatesFromResult(
  result: NominatimResult | null,
): { lat: number; lng: number } | null {
  if (result === null || result.lat === undefined || result.lon === undefined) return null
  const lat = Number(result.lat)
  const lng = Number(result.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

/**
 * Geocode an address string to { lat, lng } via Nominatim. Returns null when
 * the query is empty, the request fails, or Nominatim finds nothing — the
 * caller renders its "could not find that address" state rather than a pin.
 */
export async function geocodeAddress(
  query: string,
  lookup: AddressLookup = searchFirst,
): Promise<{ lat: number; lng: number } | null> {
  return coordinatesFromResult(await lookup(query))
}

/**
 * V20 t06 — the HOME ZIP for a typed address, or null.
 *
 * This is the area card's (the first run's LAST card — 5 of 5 when V28 slice 5
 * wrote this, 4 of 4 since V28 r2 deleted the photo card — and the signup form's
 * address left /login in slice 3b) "your address sets your location" step: the
 * parent types their address once, and the app derives the ZIP that the rest of
 * the product keys on (`filterFeed`'s radius, every distance on every card, and
 * the write paths' `hasHomeZip` — NOT an onboarding gate, which V28 slice 2b
 * removed, see docs/adr/0001-home-zip-stops-being-a-gate.md).
 *
 * IT RETURNS A ZIP, NOT COORDINATES, and that is deliberate. The product's
 * location model is ZIP-based end to end — `profiles.home_zip`, the seeded
 * `zip_codes` gazetteer, `validateHomeZip` — so writing coordinates would mean
 * inventing a second location model to keep in sync. The ZIP is the value
 * `updateHomeZipRadius` expects and the value /onboarding would have collected
 * by hand.
 *
 * ONLY A 5-DIGIT ZIP IS RETURNED. Nominatim answers with the local postcode
 * format, which for a non-US address is not five digits; a UK "SW1A 1AA" or a
 * Canadian "V5K 0A1" must NOT be truncated into something that looks like a US
 * ZIP and silently fails the gazetteer. So a non-5-digit postcode yields null
 * — "we could not set your zip" — and the onboarding step asks for it.
 *
 * A PARTIAL MATCH IS NOT A MATCH. Nominatim will happily geocode "Seattle" and
 * return a city-centre postcode; a parent who typed a street address but got a
 * city-level answer would silently be given a home ZIP they do not live in,
 * which then filters every drop-in they ever see. So the ZIP is accepted only
 * when Nominatim actually recognised a HOUSE NUMBER or a street in the query's
 * answer — `address.house_number` present, or the returned `postcode` being the
 * one already written in the address the parent typed. Anything looser trades a
 * visible "add your zip" step for an invisible wrong answer.
 *
 * `zipFromResult` is that whole policy as a pure function; the async wrappers
 * below only add the lookup, so the two outcomes the area card's fallback note
 * depends on are unit-testable.
 */
export function zipFromResult(query: string, result: NominatimResult | null): string | null {
  const trimmed = query.trim()
  if (trimmed === '') return null
  // The zip the parent typed themselves, if any: matching it is proof enough
  // that Nominatim resolved THIS address rather than its city.
  const typedZip = /\b\d{5}\b/.exec(trimmed)?.[0] ?? null
  const postcode = (result?.address?.postcode ?? '').trim()
  if (!/^\d{5}$/.test(postcode)) return null
  const houseNumber = result?.address?.house_number
  const precise =
    (typeof houseNumber === 'string' && houseNumber.trim() !== '') ||
    (typedZip !== null && typedZip === postcode)
  return precise ? postcode : null
}

/**
 * V28 slice 5 — the deadline the area card's bounded address lookup races
 * against: the pending-state rule's first form (the run is never a wall).
 * The page passes it to `locationFromAddressQueryBounded`; the sibling tests
 * pass a small value.
 */
export const ADDRESS_LOOKUP_TIMEOUT_MS = 10_000

/**
 * V28 slice 4 — ONE NOMINATIM RESULT, TWO EXTRACTIONS.
 *
 * The V28 area card resolves the address EARLY (on blur, debounced) so the same
 * single request can yield BOTH the ZIP (for `saveLocation`) and the pin
 * coordinates (for the card's own Leaflet map). `zipFromResult` and
 * `coordinatesFromResult` are the two extractors this pairs; pairing them
 * here — instead of letting the page fire two bounded lookups — is what keeps
 * "one request per distinct address" a property of the seam rather than a
 * discipline the caller has to remember.
 */
export interface AddressGeocodeResult {
  /** The validated ZIP for the house number, else `null` (the ZIP fallback). */
  zip: string | null
  /** The geocoded position, else `null` (no map can be shown). */
  coordinates: { lat: number; lng: number } | null
}

export function locationFromResult(
  query: string,
  result: NominatimResult | null,
): AddressGeocodeResult {
  // An empty query has no address to claim: a result handed in alongside it
  // belongs to nothing the card showed, so BOTH fields are null (the zip
  // extractor already agrees — coordinates must not outlive the address).
  if (query.trim() === '') return { zip: null, coordinates: null }
  return {
    zip: zipFromResult(query, result),
    coordinates: coordinatesFromResult(result),
  }
}

export async function locationFromAddressQuery(
  query: string,
  lookup: AddressLookup = searchFirst,
): Promise<AddressGeocodeResult> {
  const trimmed = query.trim()
  if (trimmed === '') return { zip: null, coordinates: null }
  return locationFromResult(trimmed, await lookup(trimmed))
}

/**
 * V28 slice 4 — the BOUNDED address geocode the onboarding area card runs on
 * blur: one Nominatim request (the same seam the ZIP lookup used) racing
 * against a deadline, returning BOTH the ZIP and the pin in one result.
 *
 * The race discipline: a lookup that does not settle within `timeoutMs`
 * settles to the null shape (absent is the only honest value — there is no
 * answer to decide from), a fast lookup wins the race, and a lookup that
 * REJECTS still rethrows: a rejection before the deadline is a real failure
 * the caller may see (the card catches it and reveals its ZIP fallback; it
 * never stalls). V28 r2 slice 8a deleted the ZIP-only sibling that used to
 * carry this paragraph's cross-reference; this is now the module's only
 * bounded lookup.
 */
export function locationFromAddressQueryBounded(
  query: string,
  timeoutMs: number,
  lookup: AddressLookup = searchFirst,
): Promise<AddressGeocodeResult> {
  const trimmed = query.trim()
  if (trimmed === '') return Promise.resolve({ zip: null, coordinates: null })
  let timer: ReturnType<typeof setTimeout> | undefined
  const nullResult: AddressGeocodeResult = { zip: null, coordinates: null }
  const deadline = new Promise<AddressGeocodeResult>((resolve) => {
    timer = setTimeout(() => resolve(nullResult), timeoutMs)
  })
  const resolved = locationFromAddressQuery(trimmed, lookup).then(
    (result) => {
      if (timer !== undefined) clearTimeout(timer)
      return result
    },
    // THE REJECTION LEG CLEANS UP TOO: a lookup that rejects before the
    // deadline still clears its deadline timer — a dangling timer is an
    // invisible defect, so the sibling test pins `vi.getTimerCount() === 0` on
    // this leg — and it still rethrows, because a rejection before the
    // deadline is a real failure the caller may see.
    (err) => {
      if (timer !== undefined) clearTimeout(timer)
      throw err
    },
  )
  return Promise.race([resolved, deadline])
}
