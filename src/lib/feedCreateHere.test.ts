import { describe, expect, it } from 'vitest'
import { createHerePrefill } from './feedCreateHere'
import { placeIdField } from './places'

/**
 * The "Create one here" seam's defect, named (the feed's empty-radius state):
 * a "Create one here" CTA that either
 *
 *   (a) FIRES WITH NO LOCATION — it seeds /new with an empty place: the tap
 *       promises "here" and the parent arrives at /new with nowhere, the
 *       dead end the CTA exists to remove (unknown / no place → the prefill
 *       is null → the CTA does not render — the first test is its own
 *       assertion of that), or
 *   (b) SEEDS A PLACE WHOSE placeId DOES NOT MATCH THE NAMED PLACE — the
 *       named place is the viewer's HOME, which is not a directory place, so
 *       the seeded placeId must be the empty string the write path omits
 *       (placeIdField). Seeding the zip itself would FK-fail on submit (a zip
 *       is not a uuid), and any fabricated id would point the post at the
 *       wrong place.
 */
describe('createHerePrefill (the "Create one here" seam)', () => {
  it('DEFECT (a): with no location the prefill is null — the CTA must not render', () => {
    expect(createHerePrefill(null)).toBeNull()
    expect(createHerePrefill(undefined)).toBeNull()
    expect(createHerePrefill('')).toBeNull()
  })

  it('a known zip names the viewer home: the label carries the zip, never a bare "Home"', () => {
    const prefill = createHerePrefill('98901')
    expect(prefill).not.toBeNull()
    expect(prefill!.place).toBe('Home (98901)')
  })

  it('DEFECT (b): the seeded placeId matches the named place — home is not a directory place, so it is the empty string the insert omits, never the zip', () => {
    const prefill = createHerePrefill('98901')
    expect(prefill!.placeId).toBe('')
    expect(prefill!.placeId).not.toBe('98901')
    // …and that empty string is exactly what the write path drops (no
    // place_id key, no FK to a non-uuid) — the round trip through the ONE
    // insert-key builder, so the two cannot drift.
    expect(placeIdField(prefill!.placeId)).toEqual({})
  })

  it('seeds the rest of the /new shape honestly: no invented address, no invented neighborhood', () => {
    const prefill = createHerePrefill('98901')
    expect(prefill!.address).toBe('')
    expect(prefill!.neighborhoodId).toBeNull()
  })
})
