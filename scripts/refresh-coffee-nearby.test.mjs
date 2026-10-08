/**
 * V32-10AF — THE OVERPASS DEGRADATION PATH, PROVEN WITHOUT A NETWORK.
 *
 * WHY THIS FILE EXISTS. v32-10a's degradation requirement — *a place whose ask
 * failed is never presented as cafe-less* — was being verified against the LIVE
 * Overpass endpoint, and that cannot converge: twice it burned a 900 s run and
 * could not distinguish "Overpass is down" from "Overpass is throttling me". A
 * live third-party endpoint cannot be asked "what do you do when you are down?"
 * on demand, so the requirement was untestable through it.
 *
 * So the per-place decision was extracted into `coffeeNearbyFromResponse` — pure,
 * in the build law's dependency-injection shape (the rule in a pure function, the
 * caller owns the I/O) — and this file asks it the questions a live endpoint will
 * not answer. **No socket is opened here. No mirror is contacted.** Milliseconds,
 * not minutes.
 *
 * ⚠️ WHY THE CASES ARE PAIRED. A test that only asserts "nothing was written"
 * passes for the wrong reason if the code can NEVER write anything. Case 1
 * (throttle → null) is therefore paired with case 3 (a real zero → `false`) and
 * case 4 (a real hit → `true`) IN THIS SAME FILE, so the trio is the evidence
 * that the distinction is real rather than accidental.
 *
 * WHY `.mjs` AND OUTSIDE `src/`: `tsc -b` cannot type a `../scripts/*.mjs` import
 * and the app project includes only `src/` — the same reasoning
 * `migrate-kid-photos.test.mjs` records. Vitest transforms it regardless, so it
 * runs on every `npm run test`, which the gate output proves by counting it.
 */
import { describe, expect, it } from 'vitest'
import {
  COFFEE_NEARBY_RADIUS_METERS,
  coffeeNearbyFromResponse,
  coffeeNearbyQuery,
  isRetryableResponse,
} from './refresh-coffee-nearby.mjs'

/**
 * The MEASURED real throttle shape: the endpoint answers with an HTML page whose
 * text names Dispatcher, sometimes at 200 and sometimes at 504. Both are covered
 * below because the status alone is not the signal.
 */
const THROTTLE_HTML =
  '<!DOCTYPE html><html><head><title>Overpass API</title></head><body>' +
  '<p>Dispatcher_Client::request_read_and_idx::timeout. The server is probably too busy ' +
  'to handle your request. Please try again later.</p></body></html>'

/** The real success shape: an Overpass JSON document with an elements array. */
const jsonWith = (elements) => JSON.stringify({ version: 0.6, elements })

describe('coffeeNearbyFromResponse — the three-valued decision (V32-10AF)', () => {
  it('1. a THROTTLE body leaves the row untouched (null) — the defect: writing `false` from a failed ask', () => {
    // A throttle is NOT an answer. Writing `false` here would claim every place
    // we happened to probe while the server was busy has no cafe near it — a
    // silent lie in the dataset, and the exact failure this whole design exists
    // to prevent.
    expect(coffeeNearbyFromResponse(THROTTLE_HTML, 504)).toBeNull()
    // ⚠️ AND AT HTTP 200. The endpoint answered 200 with this HTML during
    // v32-10a's probing, so a status-only check would let it through as a
    // successful "zero cafes".
    expect(coffeeNearbyFromResponse(THROTTLE_HTML, 200)).toBeNull()
    expect(coffeeNearbyFromResponse(THROTTLE_HTML, 500)).toBeNull()
  })

  it('2. a NETWORK ERROR, a non-JSON body or an exhausted budget is null, never `false`', () => {
    // A transport failure reaches the decision as "no status" (the caller caught
    // the throw). It must be UNKNOWN, not "no cafe".
    expect(coffeeNearbyFromResponse('fetch failed: ECONNREFUSED', undefined)).toBeNull()
    // A 200 that is not JSON at all.
    expect(coffeeNearbyFromResponse('not json at all', 200)).toBeNull()
    // A clean non-2xx (403/404) is not an answer either.
    expect(coffeeNearbyFromResponse('{"elements":[]}', 403)).toBeNull()
    expect(coffeeNearbyFromResponse('', 503)).toBeNull()
  })

  it('3. a SUCCESSFUL response with ZERO cafes writes `false` — the success path IS reachable', () => {
    // THE PAIRING HALF of case 1: without this, "a throttle writes nothing" would
    // pass on a function that can never write anything at all. This is a real
    // "asked, and there is none" answer.
    expect(coffeeNearbyFromResponse(jsonWith([]), 200)).toBe(false)
  })

  it('4. a SUCCESSFUL response with cafes writes `true`', () => {
    expect(
      coffeeNearbyFromResponse(jsonWith([{ type: 'node', id: 1 }, { type: 'way', id: 2 }]), 200),
    ).toBe(true)
  })

  it('5. a body that PARSES but has no `elements` array is null, not `false`', () => {
    // The defect: a shape we do not understand being read as "zero cafes". A
    // malformed-but-parseable document is not an answer, so it must stay unknown.
    expect(coffeeNearbyFromResponse('{"version":0.6}', 200)).toBeNull()
    expect(coffeeNearbyFromResponse('{"elements":"nope"}', 200)).toBeNull()
    expect(coffeeNearbyFromResponse('null', 200)).toBeNull()
    expect(coffeeNearbyFromResponse('[]', 200)).toBeNull()
  })

  it('6. the RETRY policy is separate from the decision, and a throttle IS retryable', () => {
    // Retrying is the caller's job; deciding what an answer means is not. This
    // pins that a throttle is worth another attempt while a clean 403 is not —
    // both of which still yield `null`.
    expect(isRetryableResponse(THROTTLE_HTML, 504)).toBe(true)
    expect(isRetryableResponse('busy', 429)).toBe(true)
    expect(isRetryableResponse('{"elements":[]}', 403)).toBe(false)
    expect(coffeeNearbyFromResponse(THROTTLE_HTML, 504)).toBeNull()
    expect(coffeeNearbyFromResponse('{"elements":[]}', 403)).toBeNull()
  })
})

describe('COFFEE_NEARBY_RADIUS_METERS — the ¼-mile claim (V33-D, muzk3j1e)', () => {
  it('is 400 m — a quarter mile — narrowing v32-10’s 750 m by founder instruction', () => {
    // The defect this detects: the claim drifting back to v32-10's 750 m (a
    // ten-minute walk), which is NOT what the founder's rule says. His words:
    // *"if there's any coffee shop that's less than a fourth of a mile from that
    // location we can make that claim."* ¼ mile ≈ 402 m, so 400 is the pin.
    expect(COFFEE_NEARBY_RADIUS_METERS).toBe(400)
    // Stated as the claim, so a future edit cannot keep the number without the
    // meaning.
    expect(COFFEE_NEARBY_RADIUS_METERS).toBeLessThan(750)
  })

  it('the emitted Overpass query CARRIES that radius — the request is the claim', () => {
    // The pure decision under test: the number above must be the number the
    // request actually asks Overpass for. A constant that no query reads would
    // pass the assertion above while the data rule stayed at 750 m.
    const q = coffeeNearbyQuery(47.6612, -122.3247)
    expect(q).toContain('nwr(around:400,47.6612,-122.3247)')
    // `nwr`, not `node`: ways and relations are real cafes in OSM, and the
    // node-only probe was the artefact v32-10 measured against.
    expect(q).toContain('nwr(')
    expect(q).not.toContain('node(around')
    expect(q).toContain('[amenity=cafe]')
  })
})
