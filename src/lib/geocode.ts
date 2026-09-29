/**
 * V15 ticket 02: the browse map rework's geocode seam.
 *
 * `geocodeAddress` turns a typed address into lat/lng via Nominatim (OpenStreetMap's
 * free geocoder — no key, no browser geolocation: the app's pinned invariant).
 * The pure decisions live here so the modal's "See places" path and the area
 * card's (the first run's 5th card, V28 slice 5) ZIP derivation are testable; the fetch itself is thin and returns null
 * on ANY failure (network error, non-OK status, empty result) — a failed
 * geocode must never invent coordinates.
 *
 * V20 t06 adds `zipFromAddressQuery`, one Nominatim request that answers
 * with a ZIP instead of a point. V28 slice 5 adds `zipFromAddressQueryBounded`,
 * the first run's area card's (its 5th card, OnboardingPage) use of the same
 * seam: the card-gating lookup is BOUNDED — a Nominatim answer that does not
 * settle in time settles to "absent" (`null`) instead of stalling the card
 * (the pending-state rule's escape), which reveals the card's ZIP fallback
 * rather than leaving the run a wall (decision 6). Both functions share one
 * request builder, so there is exactly one place the User-Agent header, the
 * URL shape and the failure contract live.
 *
 * FIRST-USE AUDIT (ticket 02) adds the TEST SEAM. `zipFromAddressQuery`'s two
 * outcomes — a resolved address and an unresolved one — are the two paths the
 * area card's fallback note (V28 slice 5) hangs on ("the address could not be
 * matched to a ZIP"), and
 * neither was reachable without the live network: the module had no sibling
 * test, and the only way to exercise the failure was for Nominatim to fail for
 * real. So the policy is now two pure functions over a PRE-FETCHED lookup, and
 * both async functions accept an optional `lookup` (the ONE dependency
 * injected). Production passes nothing and gets the fetch; a test passes a fake
 * and gets the same decision the app would make.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
// Nominatim's usage policy requires a User-Agent that identifies the client.
const USER_AGENT = 'playdate-app/1.0 (browse map rework; contact: local)'

export interface NominatimResult {
  lat?: string
  lon?: string
  /** V20 t06: filled only when the request asks for `addressdetails=1`. */
  address?: { postcode?: string; house_number?: string }
}

/** The injected dependency: one address string in, at most one result out. */
export type AddressLookup = (query: string) => Promise<NominatimResult | null>

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
 * This is the area card's (the first run's 5th card, since V28 slice 5 — the
 * signup form's address left /login in slice 3b) "your address sets your
 * location" step: the parent types their address once, and the app derives the
 * ZIP that the rest of the product keys on (the onboarding gate, `filterFeed`'
 * s radius, every distance on every card).
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

export async function zipFromAddressQuery(
  query: string,
  lookup: AddressLookup = searchFirst,
): Promise<string | null> {
  const trimmed = query.trim()
  if (trimmed === '') return null
  return zipFromResult(trimmed, await lookup(trimmed))
}

/**
 * V28 slice 5 — the bounded escape the pending-state rule requires for any
 * lookup that may gate a card: a card that awaits a promise that might never
 * settle (a Nominatim answer stalling on the network) would stall the run,
 * and decision 6 says the run is never a wall. The area card is the run's
 * REQUIRED card (no Skip), so its escape is the rule's first form — a
 * timeout that settles to "absent" (`null`) plus the card's skippable ZIP
 * fallback (the note + the typed zip), never a wait.
 *
 * Races the injected lookup against a timer: a lookup that has not settled
 * in `timeoutMs` settles to `null` (the card reveals the fallback); a fast
 * lookup wins the race and settles to its zip exactly as
 * `zipFromAddressQuery` does. Same seam discipline as the rest of this
 * module — the fetch is injected, and `timeoutMs` is the caller's (tests pass
 * a small value; the page passes `ADDRESS_LOOKUP_TIMEOUT_MS`).
 */
export const ADDRESS_LOOKUP_TIMEOUT_MS = 10_000

export function zipFromAddressQueryBounded(
  query: string,
  timeoutMs: number,
  lookup: AddressLookup = searchFirst,
): Promise<string | null> {
  const trimmed = query.trim()
  if (trimmed === '') return Promise.resolve(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs)
  })
  // Cancel the still-pending timer ONLY when the lookup itself settles —
  // either outcome: a fast lookup leaves no timer behind, and the rejection
  // leg cleans up too (it still rethrows — a lookup that rejects before the
  // deadline is a real failure the caller may see). Clearing it up front
  // would be the bug this function exists to prevent: with no live timer the
  // deadline never fires, and a never-settling lookup would stall the race
  // forever — exactly the wall the pending-state rule forbids.
  const resolved = zipFromAddressQuery(trimmed, lookup).then(
    (zip) => {
      if (timer !== undefined) clearTimeout(timer)
      return zip
    },
    (err) => {
      if (timer !== undefined) clearTimeout(timer)
      throw err
    },
  )
  // The race itself: a deadline that fires first settles to "absent" (null)
  // — the card reveals its ZIP fallback, the run is never a wall. A lookup
  // that wins the race leaves its loser (the pending, or already-fired,
  // timer) behind harmlessly: a fired timer is inert, and a never-settling
  // loser promise is ignored by the race.
  return Promise.race([resolved, deadline])
}
