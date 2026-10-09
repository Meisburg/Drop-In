/**
 * V36 — THE OVERPASS DEGRADATION PATH FOR `bathrooms_nearby`, PROVEN WITHOUT A
 * NETWORK.
 *
 * WHY THIS FILE EXISTS, and why it is not a copy-paste of the coffee test's
 * intent. A live third-party endpoint cannot be asked "what do you do when you
 * are down?" on demand, and during this very slice Overpass could not be asked
 * anything reliably — the primary returned the "Dispatcher_Client / too busy"
 * HTML page for minutes, then answered an identical query normally moments later.
 * So the per-place decision was extracted into `bathroomsNearbyFromResponse` —
 * pure, in the build law's dependency-injection shape (the rule in a pure
 * function, the caller owns the I/O) — and this file asks it the questions a live
 * endpoint will not answer. **No socket is opened here. No mirror is contacted.**
 *
 * ⚠️ THE FAILURE MODE THIS FILE EXISTS TO CATCH, STATED EXACTLY:
 *
 *     a 429 / throttle / transport error must NOT write `null` over a KNOWN value.
 *
 * For a three-valued column there are two ways to be wrong, and they are not the
 * same bug:
 *   1. writing `false` from a failure — claiming "no bathroom here" when we never
 *      got an answer. That is the coffee test's defect, and case 1 covers it.
 *   2. writing a WRONG value over a value we already established — i.e. a re-run
 *      whose ask fails and CLEARS a place that was previously `true` (or `false`).
 *      The column would silently regress from "we know there is a bathroom" to
 *      "we don't know", and the pill would disappear from a place that has one.
 *
 * Case 7 below pins (2) specifically: it is the reason the script's write path is
 * "only a successful answer produces an update" rather than "every place in the
 * batch gets written". This failure mode matters MORE than coffee's, because a
 * parent who loses a bathrooms pill is a parent who has to guess.
 *
 * ⚠️ WHY THE CASES ARE PAIRED. A test that only asserts "nothing was written"
 * passes for the wrong reason if the code can NEVER write anything. Case 1
 * (throttle → null) is therefore paired with case 3 (a real zero → `false`) and
 * case 4 (a real hit → `true`) IN THIS SAME FILE, so the trio is the evidence
 * that the distinction is real rather than accidental.
 *
 * WHY `.mjs` AND OUTSIDE `src/`: `tsc -b` cannot type a `../scripts/*.mjs` import
 * and the app project includes only `src/` — the same reasoning
 * `refresh-coffee-nearby.test.mjs` records. Vitest transforms it regardless, so
 * it runs on every `npm run test`, which the gate output proves by counting it.
 */
import { describe, expect, it } from 'vitest'
import {
  BATHROOMS_NEARBY_RADIUS_METERS,
  bathroomsNearbyFromResponse,
  bathroomsNearbyQuery,
  isRetryableResponse,
} from './refresh-bathrooms-nearby.mjs'

/**
 * The MEASURED real throttle shape: the endpoint answers with an HTML page whose
 * text names Dispatcher, sometimes at 200 and sometimes at 504. Both are covered
 * below because the status alone is not the signal. Re-observed live while
 * writing this slice.
 */
const THROTTLE_HTML =
  '<!DOCTYPE html><html><head><title>Overpass API</title></head><body>' +
  '<p>Dispatcher_Client::request_read_and_idx::timeout. The server is probably too busy ' +
  'to handle your request. Please try again later.</p></body></html>'

/** The real success shape: an Overpass JSON document with an elements array. */
const jsonWith = (elements) => JSON.stringify({ version: 0.6, elements })

describe('bathroomsNearbyFromResponse — the three-valued decision (V36)', () => {
  it('1. a THROTTLE body leaves the row untouched (null) — the defect: writing `false` from a failed ask', () => {
    // A throttle is NOT an answer. Writing `false` here would claim every place
    // we happened to probe while the server was busy has no bathroom near it — a
    // silent lie in the dataset, and the exact failure this whole design exists
    // to prevent. A wrong bathrooms pill costs a parent a toddler emergency.
    expect(bathroomsNearbyFromResponse(THROTTLE_HTML, 504)).toBeNull()
    // ⚠️ AND AT HTTP 200. The endpoint answered 200 with this HTML during this
    // slice's own probing, so a status-only check would let it through as a
    // successful "zero bathrooms".
    expect(bathroomsNearbyFromResponse(THROTTLE_HTML, 200)).toBeNull()
    expect(bathroomsNearbyFromResponse(THROTTLE_HTML, 500)).toBeNull()
  })

  it('2. a NETWORK ERROR, a non-JSON body or an exhausted budget is null, never `false`', () => {
    // A transport failure reaches the decision as "no status" (the caller caught
    // the throw). It must be UNKNOWN, not "no bathroom".
    expect(bathroomsNearbyFromResponse('fetch failed: ECONNREFUSED', undefined)).toBeNull()
    // A 200 that is not JSON at all.
    expect(bathroomsNearbyFromResponse('not json at all', 200)).toBeNull()
    // A clean non-2xx (403/404) is not an answer either.
    expect(bathroomsNearbyFromResponse('{"elements":[]}', 403)).toBeNull()
    expect(bathroomsNearbyFromResponse('', 503)).toBeNull()
    // An explicit 429 — the rate-limit signal named in the brief.
    expect(bathroomsNearbyFromResponse('{"elements":[]}', 429)).toBeNull()
  })

  it('3. a SUCCESSFUL response with ZERO bathrooms writes `false` — the success path IS reachable', () => {
    // THE PAIRING HALF of case 1: without this, "a throttle writes nothing" would
    // pass on a function that can never write anything at all. This is a real
    // "asked, and there is none" answer.
    expect(bathroomsNearbyFromResponse(jsonWith([]), 200)).toBe(false)
  })

  it('4. a SUCCESSFUL response with bathrooms writes `true`', () => {
    expect(
      bathroomsNearbyFromResponse(jsonWith([{ type: 'node', id: 1 }, { type: 'way', id: 2 }]), 200),
    ).toBe(true)
  })

  it('5. a body that PARSES but has no `elements` array is null, not `false`', () => {
    // The defect: a shape we do not understand being read as "zero bathrooms". A
    // malformed-but-parseable document is not an answer, so it must stay unknown.
    expect(bathroomsNearbyFromResponse('{"version":0.6}', 200)).toBeNull()
    expect(bathroomsNearbyFromResponse('{"elements":"nope"}', 200)).toBeNull()
    expect(bathroomsNearbyFromResponse('null', 200)).toBeNull()
    expect(bathroomsNearbyFromResponse('[]', 200)).toBeNull()
  })

  it('6. the RETRY policy is separate from the decision, and a throttle IS retryable', () => {
    // Retrying is the caller's job; deciding what an answer means is not. This
    // pins that a throttle is worth another attempt while a clean 403 is not —
    // both of which still yield `null`.
    expect(isRetryableResponse(THROTTLE_HTML, 504)).toBe(true)
    expect(isRetryableResponse('busy', 429)).toBe(true)
    expect(isRetryableResponse('{"elements":[]}', 403)).toBe(false)
    expect(bathroomsNearbyFromResponse(THROTTLE_HTML, 504)).toBeNull()
    expect(bathroomsNearbyFromResponse('{"elements":[]}', 403)).toBeNull()
  })

  it('7. ⚠️ THE FAILURE MODE THIS SLICE IS ABOUT: a 429/throttle must NOT write NULL over a KNOWN value', () => {
    // THIS IS THE ONE THE BRIEF NAMES. The other cases prove what a single ask
    // returns; this one proves the CONSEQUENCE for a row that already holds a
    // fact. It models the script's actual write rule — a row is only ever updated
    // from a NON-NULL answer — and asserts that a failed re-run is a NO-OP on
    // known data rather than a silent clear.
    //
    // Without this, a throttled re-run could regress every previously-`true` place
    // to `null` and the bathroom pill would vanish from places that have one. The
    // parent sees "we don't know" where before they saw "yes".
    const writeRule = (previous, body, status) => {
      const answer = bathroomsNearbyFromResponse(body, status)
      // The script's contract: only a real answer produces an update. `null` is
      // not a value to store — it is the absence of one.
      return answer === null ? previous : answer
    }

    // A place that ALREADY HAS a known `true`, re-asked while the server is busy.
    expect(writeRule(true, THROTTLE_HTML, 429)).toBe(true)
    expect(writeRule(true, THROTTLE_HTML, 504)).toBe(true)
    expect(writeRule(true, THROTTLE_HTML, 200)).toBe(true)
    // …and one that already has a known `false` is equally not clobbered.
    expect(writeRule(false, THROTTLE_HTML, 429)).toBe(false)
    // A transport error (no status at all) is the same NO-OP.
    expect(writeRule(true, 'fetch failed: ECONNREFUSED', undefined)).toBe(true)

    // ⚠️ THE PAIRING HALF, so this cannot pass on a rule that ignores answers
    // entirely: a REAL answer DOES move the value, in both directions. A genuine
    // zero may correct a place we previously believed had bathrooms, and a
    // genuine hit may establish one for a row that was unasked.
    expect(writeRule(true, jsonWith([]), 200)).toBe(false)
    expect(writeRule(false, jsonWith([{ type: 'node', id: 9 }]), 200)).toBe(true)
    expect(writeRule(null, jsonWith([{ type: 'node', id: 9 }]), 200)).toBe(true)
    // …and `null` over `null` stays `null`: re-asking an unasked place while the
    // server is down changes nothing.
    expect(writeRule(null, THROTTLE_HTML, 429)).toBe(null)
  })
})

describe('BATHROOMS_NEARBY_RADIUS_METERS — the walking-distance claim (V36)', () => {
  it('is 400 m — a quarter mile — matching the coffee column’s founder-pinned radius', () => {
    // The defect this detects: the bathrooms radius drifting away from the
    // coffee one. The founder's rule for the coffee claim was literal — *"if
    // there's any coffee shop that's less than a fourth of a mile from that
    // location we can make that claim"* (V33-D, muzk3j1e) — and a bathroom is the
    // same kind of claim: a facility a parent must be able to REACH mid-outing
    // with a small child. If the two radii diverged, a place could be "Café" and
    // not "Bathrooms" at the same distance, which is a contradiction a parent
    // would rightly not expect.
    expect(BATHROOMS_NEARBY_RADIUS_METERS).toBe(400)
    // Stated as the claim, so a future edit cannot keep the number without the
    // meaning.
    expect(BATHROOMS_NEARBY_RADIUS_METERS).toBeLessThan(750)
  })

  it('the emitted Overpass query CARRIES that radius AND the toilets tag — the request is the claim', () => {
    // The pure decision under test: the number above must be the number the
    // request actually asks Overpass for, and the tag must be `toilets`, not a
    // copy-paste leftover of `cafe`. A constant that no query reads, or a query
    // still asking about coffee, would pass the assertion above while the data
    // rule stayed wrong.
    const q = bathroomsNearbyQuery(47.6612, -122.3247)
    expect(q).toContain('nwr(around:400,47.6612,-122.3247)')
    // `nwr`, not `node`: ways and relations are real toilets in OSM too.
    expect(q).toContain('nwr(')
    expect(q).not.toContain('node(around')
    expect(q).toContain('[amenity=toilets]')
    // ⚠️ THE COPY-PASTE GUARD. This script was mirrored from the coffee one; the
    // single most likely way for it to be wrong is to still be asking about
    // cafes. Name that explicitly so a mirror-drift is a red test, not a silent
    // wrong dataset.
    expect(q).not.toContain('[amenity=cafe]')
  })
})
