#!/usr/bin/env node
/**
 * REFRESH `places.coffee_nearby` FROM OPENSTREETMAP (V32 v32-10a, annotation A5).
 *
 * The founder: *"I think parents are really going to want to have a drop in where
 * there's coffee nearby… as a parent I would want to be like, okay, can our kids
 * play here and we can drink a coffee?"*
 *
 * WHY THIS IS A SCRIPT AND NOT A READ. Overpass is a shared free endpoint with
 * rate limits and multi-second latency (measured: a bare curl UA gets 406, and
 * most follow-up requests within a few seconds come back as the "server is
 * probably too busy" HTML page). Querying it at read time would make every
 * directory load depend on a public API being up. So the answer is CACHED ON THE
 * ROW (`places.coffee_nearby`) by this re-runnable script, and the toggle filters
 * on the COLUMN. **No read path in the app ever calls Overpass.**
 *
 * ⚠️ THE COLUMN IS THREE-VALUED AND THIS SCRIPT IS WHERE THAT IS KEPT HONEST:
 *   `true`  — a cafe is within COFFEE_NEARBY_RADIUS_METERS
 *   `false` — Overpass was ASKED about this place and there is none
 *   `null`  — NEVER ASKED
 *
 * **A FAILED, TIMED-OUT OR THROTTLED QUERY LEAVES THE ROW UNTOUCHED (null).**
 * Only a successful, parseable response reporting zero cafes writes `false`.
 * That single rule is the difference between an honest dataset and a lying one —
 * writing `false` from a failure would silently claim every unsampled place has
 * no coffee near it.
 *
 * Usage:
 *   node scripts/refresh-coffee-nearby.mjs              # a bounded first pass
 *   node scripts/refresh-coffee-nearby.mjs --limit 40   # explicit batch size
 *   node scripts/refresh-coffee-nearby.mjs --all        # every unset place
 *   node scripts/refresh-coffee-nearby.mjs --dry-run    # ask, report, write nothing
 *
 * v32-10a runs a BOUNDED pass on purpose: the plan anticipates a partial run, and
 * this script's output is what makes it visible rather than silent. v32-10b (the
 * long pass to shrink the remaining `null`s) is queued behind it.
 *
 * Exit: 0 ok (even when partial) | 1 setup error (no token / no ref)
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

/**
 * WHAT "NEARBY" MEANS, in one place. 750 metres is roughly a ten-minute walk with
 * kids. Measured before choosing it: `nwr(around:750,…)[amenity=cafe]` returned 2
 * and 10 cafes at two of three sampled places, while `node(around:400,…)` returned
 * 0 at all three — a 400 m radius would have produced an almost all-`false`
 * dataset, which would have been a measurement artefact rather than a fact.
 */
export const COFFEE_NEARBY_RADIUS_METERS = 750

/**
 * THE OSM TAG SET: `amenity=cafe`, matched with `nwr` — NODES, WAYS AND
 * RELATIONS. `nwr` matters: many cafes in OSM are mapped as ways (a building
 * footprint) or relations, so `node(...)` would undercount. A wider tag set
 * (bakery, restaurant) is a deliberate future change, not something to smuggle in
 * here.
 */
const AMENITY_TAG = 'cafe'

/**
 * A descriptive UA is REQUIRED, not a nicety: measured, a bare curl UA gets
 * HTTP 406 from overpass-api.de. Naming the app and a contact is also what a
 * shared free endpoint is owed.
 */
const USER_AGENT =
  'DropInCoffeeNearby/1.0 (playdate app; place directory enrichment; contact: hello@dropin.app)'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

/**
 * Overpass is a FEDERATION, and the mirrors serve the SAME OpenStreetMap data.
 * `overpass-api.de` is the primary and the default above; during v32-10a it
 * returned the "too busy" HTML page for minutes at a time after repeated probing
 * (the measured rate-limiting this script exists to survive), while
 * `overpass.kumi.systems` answered normally. Pass `--mirror <url>` — or set
 * `OVERPASS_URL` in the environment — to fall back to another replica WITHOUT
 * changing what "nearby" means.
 *
 * The tri-state rule is identical on any mirror: only a successful, parseable
 * response writes a value; a throttle or a failure leaves the row `null`.
 */
const MIRROR_URL = process.env.OVERPASS_URL ?? OVERPASS_URL

/** Polite pacing: seconds between requests, never concurrent. Measured: bursts
 *  inside a few seconds got throttled, so the gap is load-bearing. */
const REQUEST_GAP_MS = 6000
/** Bounded retries with backoff on the "too busy" body, 429 and 504/5xx. */
const MAX_RETRIES = 4
const BACKOFF_BASE_MS = 5000

const DEFAULT_LIMIT = 25

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

function loadEnv() {
  const env = {}
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

/**
 * ⚠️ ENTRY-POINT GUARD. Everything below that touches the world — reading `.env`,
 * holding the token, calling Overpass, writing rows — happens ONLY when this file
 * is run as a program. Importing it (as `refresh-coffee-nearby.test.mjs` does)
 * must open no socket, read no .env and hold no secret; otherwise the test could
 * not load without live credentials, which is a test failure rather than a hang
 * — the discipline `migrate-kid-photos.test.mjs` records for the same reason.
 */
const IS_ENTRY_POINT =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`

const env = IS_ENTRY_POINT ? loadEnv() : {}
const REF = (env.VITE_SUPABASE_URL || '').replace(/^https:\/\//, '').replace(/\.supabase\.co$/, '')
const TOKEN = env.SUPABASE_ACCESS_TOKEN

if (IS_ENTRY_POINT && (TOKEN === undefined || REF === '')) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or VITE_SUPABASE_URL in .env — cannot run.')
  process.exit(1)
}

/** Escape a JS string for a single-quoted SQL literal. */
function sqlStr(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

/**
 * The write path is the repo's documented BROWSERLESS one (the dashboard SQL API
 * with a personal access token), the same path `scripts/backfill-place-websites.mjs`
 * uses. It needs no new secret handling and never touches the human's Chrome. The
 * token is never printed.
 */
async function query(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (res.status >= 300) {
    throw new Error(`${label}: HTTP ${res.status} ${text.slice(0, 300)}`)
  }
  return text
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// Overpass
// ---------------------------------------------------------------------------

/**
 * Ask Overpass whether a cafe is near one point.
 *
 * Returns a TRI-STATE, and the caller must not conflate the last two:
 *   `true`  — the response parsed and reports at least one cafe
 *   `false` — the response parsed and reports ZERO cafes
 *   `null`  — we could not get an answer (HTTP failure, unparseable body, the
 *             "too busy" HTML page, or an exhausted retry budget). THE ROW MUST
 *             BE LEFT ALONE.
 */
/**
 * THE PER-PLACE DECISION, PURE AND INJECTABLE.
 *
 * ⚠️ WHY THIS IS ITS OWN EXPORTED FUNCTION. The first version of this script made
 * the decision inside the fetch loop, so the only way to exercise it was to call
 * the real Overpass endpoint — and a live third-party endpoint cannot be asked
 * the question "what happens when you are down?" on demand. It was throttling
 * instead of failing, so the degradation path could not be verified at all. The
 * decision is now separable from the transport: this function is what the script
 * asks, the script owns the retrying and the pacing, and a stub can ask it
 * questions no live endpoint would answer.
 *
 * It is also the build law's dependency-injection shape — the rule lives in a
 * pure function, the caller injects the I/O.
 *
 * THE CONTRACT, and the two `null`-vs-`false` outcomes are the whole point:
 *   `true`  — a successful response reporting at least one cafe
 *   `false` — a successful response reporting ZERO cafes ("asked, and there is
 *             none"). ONLY a real answer may produce this.
 *   `null`  — NO ANSWER: a transport error, a throttle, a non-2xx, an
 *             unparseable body, or a parsed body with no `elements` array.
 *             THE CALLER MUST LEAVE THE ROW UNTOUCHED.
 *
 * A place we could not ask about must never be presented as cafe-less.
 *
 * @param {unknown} body the response text, or the thrown error's message
 * @param {number|undefined} status the HTTP status, when a response arrived
 * @returns {boolean|null}
 */
export function coffeeNearbyFromResponse(body, status) {
  // A transport failure arrives here as a thrown-catch result: no status.
  if (status === undefined) return null

  const text = typeof body === 'string' ? body : String(body ?? '')

  // THE THROTTLE IS AN HTML PAGE, NOT JSON, and it always names Dispatcher. This
  // is the measured real shape (the endpoint answers 504, or 200, with this HTML
  // body when it is saturated), so it must be recognised by BODY as well as by
  // status — a 200 carrying it is still not an answer.
  const looksThrottled =
    text.includes('Dispatcher_Client') || text.includes('too busy') || text.includes('<html')
  if (looksThrottled) return null

  // Any non-2xx is not an answer. 429/5xx are the retryable ones; the caller
  // decides whether to retry, but NONE of them may ever yield `false`.
  if (status < 200 || status >= 300) return null

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    // A 200 with an unparseable body is still not an answer.
    return null
  }

  // A body that parses but carries no `elements` array is MALFORMED, not empty:
  // treating it as "zero cafes" would invent a `false` from a shape we do not
  // understand.
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.elements)) {
    return null
  }

  return parsed.elements.length > 0
}

/** Is this response worth retrying? A throttle or a 429/5xx is; a clean non-2xx
 *  answer (403, 404) is not. Pure, so the policy is testable too. */
export function isRetryableResponse(body, status) {
  const text = typeof body === 'string' ? body : String(body ?? '')
  const looksThrottled =
    text.includes('Dispatcher_Client') || text.includes('too busy') || text.includes('<html')
  return looksThrottled || status === 429 || status === 504 || status >= 500
}

async function askOverpass(lat, lng) {
  const q =
    `[out:json][timeout:25];` +
    `nwr(around:${COFFEE_NEARBY_RADIUS_METERS},${lat},${lng})[amenity=${AMENITY_TAG}];` +
    `out tags;`

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let res
    try {
      res = await fetch(MIRROR_URL, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(q)}`,
      })
    } catch (err) {
      // A transport failure is an UNKNOWN, never a "no".
      console.log(`    transport error (attempt ${attempt}/${MAX_RETRIES}): ${err.message}`)
      await sleep(BACKOFF_BASE_MS * attempt)
      continue
    }

    const body = await res.text()
    // THE ONE DECISION — the pure function above. Retrying is this caller's job;
    // deciding what the answer MEANS is not.
    const decision = coffeeNearbyFromResponse(body, res.status)

    if (decision === null && isRetryableResponse(body, res.status)) {
      console.log(`    throttled/unavailable (HTTP ${res.status}, attempt ${attempt}/${MAX_RETRIES})`)
      if (attempt < MAX_RETRIES) await sleep(BACKOFF_BASE_MS * attempt)
      continue
    }

    if (decision === null) {
      console.log(`    HTTP ${res.status} — not retryable, leaving the row untouched`)
      return null
    }

    return decision
  }

  return null
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
const ALL = argv.includes('--all')
const DRY_RUN = argv.includes('--dry-run')
const limitFlag = argv.indexOf('--limit')
const LIMIT = limitIdx(limitFlag, argv)

function limitIdx(flagIdx, args) {
  if (flagIdx === -1) return DEFAULT_LIMIT
  const value = Number(args[flagIdx + 1])
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_LIMIT
}

async function main() {
  console.log(`coffee-nearby refresh — radius ${COFFEE_NEARBY_RADIUS_METERS}m, tag amenity=${AMENITY_TAG}`)
  console.log(`target ref ${REF}${DRY_RUN ? ' (DRY RUN — nothing will be written)' : ''}`)

  // Only places we have coordinates for AND have never asked about. A `null` is
  // the "never asked" state, so re-running converges: rows already set are
  // skipped, and a second run writes the same values or nothing.
  const selectSql =
    'select id, name, lat, lng from public.places ' +
    'where coffee_nearby is null and lat is not null and lng is not null ' +
    'order by name' +
    (ALL ? '' : ` limit ${LIMIT}`) +
    ';'

  const raw = await query(selectSql, 'select candidates')
  const parsed = JSON.parse(raw)
  const rows = Array.isArray(parsed) ? parsed : (parsed.result ?? [])
  console.log(`\nplaces to ask about this run: ${rows.length}${ALL ? ' (all unset)' : ` (bounded to ${LIMIT})`}\n`)

  let asked = 0
  let setTrue = 0
  let setFalse = 0
  let leftNull = 0
  const updates = []

  for (const row of rows) {
    asked++
    const answer = await askOverpass(Number(row.lat), Number(row.lng))
    if (answer === null) {
      // THE HONEST BRANCH: no answer means the row keeps its `null`.
      leftNull++
      console.log(`  ${row.name}: NO ANSWER — left null`)
    } else if (answer) {
      setTrue++
      updates.push(`update public.places set coffee_nearby = true where id = ${sqlStr(row.id)};`)
      console.log(`  ${row.name}: cafe nearby`)
    } else {
      setFalse++
      updates.push(`update public.places set coffee_nearby = false where id = ${sqlStr(row.id)};`)
      console.log(`  ${row.name}: no cafe nearby (asked, answer was zero)`)
    }
    // Polite pacing between requests — never concurrent.
    if (asked < rows.length) await sleep(REQUEST_GAP_MS)
  }

  // One batched write, generated as SQL and applied through the browserless path.
  // A dry run reports and writes nothing.
  if (!DRY_RUN && updates.length > 0) {
    await query(updates.join('\n'), 'update rows')
  }

  // ---- THE FOUR NUMBERS, so a partial or throttled run is VISIBLE -----------
  console.log('\n=== coffee-nearby pass summary ===')
  console.log(`asked:      ${asked}`)
  console.log(`set true:   ${setTrue}`)
  console.log(`set false:  ${setFalse}`)
  console.log(`left null:  ${leftNull}   (no answer — the ask failed or was throttled; the row is UNTOUCHED)`)
  if (DRY_RUN) console.log('(dry run — no rows were written)')
  if (leftNull > 0) {
    console.log(
      '\nNOTE: this pass was PARTIAL. The rows above are still `null` ("never asked"), not\n' +
        '`false` ("no cafe") — re-run this script to make progress against them.',
    )
  }

  // The remaining coverage, so the dataset's completeness is stated rather than
  // assumed.
  const coverage = JSON.parse(
    await query(
      'select count(*) filter (where coffee_nearby is true) as y, ' +
        'count(*) filter (where coffee_nearby is false) as n, ' +
        'count(*) filter (where coffee_nearby is null) as unasked, ' +
        'count(*) as total from public.places;',
      'coverage',
    ),
  )
  const cov = Array.isArray(coverage) ? coverage[0] : null
  if (cov) {
    console.log(`\ncoverage now: true ${cov.y} / false ${cov.n} / never asked ${cov.unasked} (of ${cov.total})`)
  }
}

if (IS_ENTRY_POINT) {
  main().catch((err) => {
    console.error('\nrefresh failed:', err.message)
    process.exit(1)
  })
}
