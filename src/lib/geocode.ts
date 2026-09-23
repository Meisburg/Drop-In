/**
 * V15 ticket 02: the browse map rework's geocode seam.
 *
 * `geocodeAddress` turns a typed address into lat/lng via Nominatim (OpenStreetMap's
 * free geocoder — no key, no browser geolocation: the app's pinned invariant).
 * The pure decision lives here so the modal's "See places" path is testable;
 * the fetch itself is thin and returns null on ANY failure (network error,
 * non-OK status, empty result) — a failed geocode must never invent coordinates.
 *
 * V20 t06 adds `zipFromAddressQuery`, the signup form's use of the same
 * service: one Nominatim request that answers with a ZIP instead of a point.
 * Both functions share one request builder, so there is exactly one place the
 * User-Agent header, the URL shape and the failure contract live.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
// Nominatim's usage policy requires a User-Agent that identifies the client.
const USER_AGENT = 'playdate-app/1.0 (browse map rework; contact: local)'

interface NominatimResult {
  lat?: string
  lon?: string
  /** V20 t06: filled only when the request asks for `addressdetails=1`. */
  address?: { postcode?: string }
}

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
 * Geocode an address string to { lat, lng } via Nominatim. Returns null when
 * the query is empty, the request fails, or Nominatim finds nothing — the
 * caller renders its "could not find that address" state rather than a pin.
 */
export async function geocodeAddress(
  query: string,
): Promise<{ lat: number; lng: number } | null> {
  const first = await searchFirst(query)
  if (first === null || first.lat === undefined || first.lon === undefined) return null
  const lat = Number(first.lat)
  const lng = Number(first.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

/**
 * V20 t06 — the HOME ZIP for a typed address, or null.
 *
 * This is the signup form's "your address sets your location" step: the parent
 * types their address once, and the app derives the ZIP that the rest of the
 * product keys on (the onboarding gate, `filterFeed`'s radius, every distance
 * on every card).
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
 */
export async function zipFromAddressQuery(query: string): Promise<string | null> {
  const trimmed = query.trim()
  if (trimmed === '') return null
  // The zip the parent typed themselves, if any: matching it is proof enough
  // that Nominatim resolved THIS address rather than its city.
  const typedZip = /\b\d{5}\b/.exec(trimmed)?.[0] ?? null
  const first = await searchFirst(trimmed)
  const postcode = (first?.address?.postcode ?? '').trim()
  if (!/^\d{5}$/.test(postcode)) return null
  const houseNumber = (first?.address as { house_number?: string } | undefined)?.house_number
  const precise =
    (typeof houseNumber === 'string' && houseNumber.trim() !== '') ||
    (typedZip !== null && typedZip === postcode)
  return precise ? postcode : null
}
