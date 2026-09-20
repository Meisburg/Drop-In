/**
 * V15 ticket 02: the browse map rework's geocode seam.
 *
 * `geocodeAddress` turns a typed address into lat/lng via Nominatim (OpenStreetMap's
 * free geocoder — no key, no browser geolocation: the app's pinned invariant).
 * The pure decision lives here so the modal's "See places" path is testable;
 * the fetch itself is thin and returns null on ANY failure (network error,
 * non-OK status, empty result) — a failed geocode must never invent coordinates.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
// Nominatim's usage policy requires a User-Agent that identifies the client.
const USER_AGENT = 'playdate-app/1.0 (browse map rework; contact: local)'

interface NominatimResult {
  lat?: string
  lon?: string
}

/**
 * Geocode an address string to { lat, lng } via Nominatim. Returns null when
 * the query is empty, the request fails, or Nominatim finds nothing — the
 * caller renders its "could not find that address" state rather than a pin.
 */
export async function geocodeAddress(
  query: string,
): Promise<{ lat: number; lng: number } | null> {
  const trimmed = query.trim()
  if (trimmed === '') return null
  try {
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(trimmed)}`
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!response.ok) return null
    const results = (await response.json()) as NominatimResult[]
    const first = results[0]
    if (first === undefined || first.lat === undefined || first.lon === undefined) return null
    const lat = Number(first.lat)
    const lng = Number(first.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  } catch {
    return null
  }
}