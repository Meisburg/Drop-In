import { hasHomeZip } from './homeZip'
import type { PlacePrefill } from './types'

/**
 * The "Create one here" prefill — the ONE place the feed's empty-radius state
 * can name: the viewer's OWN home zip, the home pin the feed's map band
 * already draws ("You are here — nothing in your radius yet").
 *
 * Pure: RadiusEmptyState owns the home zip (the profile from the session
 * context) and passes it here; it renders the CTA only when this returns a
 * prefill. Null = no nameable location = NO control — a control that would
 * seed /new with nowhere is the "control that swallows its tap" the escapes
 * already removed. The sibling test (feedCreateHere.test.ts) names both
 * halves of that defect.
 *
 * The seeded PlacePrefill is the SAME shape /new's route reads (App.tsx
 * NewRoute, `state.place`): the viewer's home is NOT a directory place, so
 * `placeId` is the EMPTY STRING — `placeIdField('')` (lib/places.ts) omits
 * the `place_id` key from the insert, so the post stays a free-text post
 * anchored on the label, with no FK pointing at a place that is not one.
 * `address` stays empty (the app knows the zip, not a street address — a
 * fabricated address would be a lie) and `neighborhoodId` null (the parent
 * picks one, exactly as the place-page prefill does when the place carries
 * none).
 *
 * "The viewer has a home zip" goes through the ONE predicate (hasHomeZip —
 * the V28 discipline: same rule, one definition, no inline `!= null` drift).
 */
export function createHerePrefill(homeZip: string | null | undefined): PlacePrefill | null {
  if (!hasHomeZip(homeZip)) return null
  return {
    placeId: '',
    place: `Home (${homeZip})`,
    address: '',
    neighborhoodId: null,
  }
}
