#!/usr/bin/env node
/**
 * REFRESH `places.bathrooms_nearby` FROM OPENSTREETMAP
 * (V36, sentinel V36-BATHROOMS-PILL-Y7M5, annotation muzka6tz).
 *
 * The founder's ask: a "bathrooms available" pill on the place surfaces. For a
 * parent choosing where to take a small child, "is there a bathroom here" is
 * load-bearing — it is the difference between a two-hour outing and a twenty-
 * minute one.
 *
 * ⚠️ THIS FILE IS A DELIBERATE MIRROR OF `refresh-coffee-nearby.mjs`. The tag is
 * different (`amenity=toilets`, not `amenity=cafe`) and the column is different
 * (`bathrooms_nearby`, not `coffee_nearby`), but the POSTURE is identical and is
 * copied rather than reinvented: the pacing, the retry/backoff policy, the
 * batching, the browserless write path, the entry-point guard, and — above all —
 * the tri-state rule. Two HTTP clients would be two things to drift, so there is
 * exactly one shape here and it is the coffee script's.
 *
 * WHY THIS IS A SCRIPT AND NOT A READ. Overpass is a shared free endpoint with
 * rate limits and multi-second latency (re-measured during THIS slice: the
 * primary returned the "Dispatcher_Client / too busy" HTML page for minutes,
 * while an identical query answered normally moments later). Querying it at read
 * time would make every directory load depend on a public API being up. So the
 * answer is CACHED ON THE ROW (`places.bathrooms_nearby`) by this re-runnable
 * script, and the pill reads the COLUMN. **No read path in the app ever calls
 * Overpass.**
 *
 * ⚠️ THE SOURCE IS THE FREE ONE, BY RULING. OpenStreetMap via Overpass. No paid
 * source, no API key, ODbL-licensed data. `amenity=toilets` is the tag.
 *
 * ⚠️ THE COLUMN IS THREE-VALUED AND THIS SCRIPT IS WHERE THAT IS KEPT HONEST:
 *   `true`  — a bathroom is within BATHROOMS_NEARBY_RADIUS_METERS
 *   `false` — Overpass was ASKED about this place and there is none
 *   `null`  — NEVER ASKED
 *
 * **A FAILED, TIMED-OUT OR THROTTLED QUERY LEAVES THE ROW UNTOUCHED (null).**
 * Only a successful, parseable response reporting zero bathrooms writes `false`.
 *
 * This rule is STRICTER here than for coffee, and that is the point: writing
 * `false` from a throttle would tell a parent "no bathroom here" when we simply
 * never got an answer. A wrong coffee pill costs a coffee; a wrong bathroom pill
 * costs a parent a toddler emergency. The failure mode is therefore the primary
 * thing the sibling test pins.
 *
 * Usage:
 *   node scripts/refresh-bathrooms-nearby.mjs              # a bounded first pass
 *   node scripts/refresh-bathrooms-nearby.mjs --limit 40   # explicit batch size
 *   node scripts/refresh-bathrooms-nearby.mjs --all        # every unset place
 *   node scripts/refresh-bathrooms-nearby.mjs --dry-run    # ask, report, write nothing
 *
 * Exit: 0 ok (even when partial) | 1 setup error (no token / no ref)
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

/**
 * WHAT "NEARBY" MEANS, in one place. **400 metres — a quarter mile.**
 *
 * ⚠️ THIS MATCHES THE COFFEE COLUMN'S 400 m ON PURPOSE. The founder's rule for
 * the coffee claim was literal — *"if there's any coffee shop that's less than a
 * fourth of a mile from that location we can make that claim"* (V33-D,
 * `muzk3j1e`) — and the same walking-distance logic applies to a bathroom: this
 * is a facility a parent must be able to REACH with a small child mid-outing, not
 * a ten-minute trek. Keeping the two radii equal also means the two pills can
 * never disagree about what "nearby" means, which is what a parent reading both
 * would reasonably assume.
 */
export const BATHROOMS_NEARBY_RADIUS_METERS = 400

/**
 * THE OSM TAG SET: `amenity=toilets`, matched with `nwr` — NODES, WAYS AND
 * RELATIONS. `nwr` matters for the same reason it does for cafes: many public
 * toilets in OSM are mapped as ways (a building footprint) or relations, so
 * `node(...)` would undercount. A wider tag set (`amenity=toilets` plus a
 * `toilets=yes` on another amenity, e.g. a park with facilities) is a deliberate
 * future change, not something to smuggle in here.
 */
const AMENITY_TAG = 'toilets'

/**
 * A descriptive UA is REQUIRED, not a nicety: measured, a bare curl UA gets
 * HTTP 406 from overpass-api.de. Naming the app and a contact is also what a
 * shared free endpoint is owed.
 */
const USER_AGENT =
  'DropInBathroomsNearby/1.0 (playdate app; place directory enrichment; contact: hello@dropin.app)'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

/**
 * Overpass is a FEDERATION, and the mirrors serve the SAME OpenStreetMap data.
 * `overpass-api.de` is the primary and the default above. Pass `--mirror <url>`
 * — or set `OVERPASS_URL` in the environment — to fall back to another replica
 * WITHOUT changing what "nearby" means.
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
 * is run as a program. Importing it (as `refresh-bathrooms-nearby.test.mjs` does)
 * must open no socket, read no .env and hold no secret; otherwise the test could
 * not load without live credentials, which is a test failure rather than a hang
 * — the discipline `refresh-coffee-nearby.mjs` and `migrate-kid-photos.test.mjs`
 * record for the same reason.
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
 * with a personal access token), the same path `scripts/refresh-coffee-nearby.mjs`
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
 * THE PER-PLACE DECISION, PURE AND INJECTABLE.
 *
 * ⚠️ WHY THIS IS ITS OWN EXPORTED FUNCTION. A live third-party endpoint cannot be
 * asked the question "what happens when you are down?" on demand — during this
 * very slice Overpass was throttling instead of failing cleanly, so the
 * degradation path could not have been exercised through it at all. The decision
 * is therefore separable from the transport: this function is what the script
 * asks, the script owns the retrying and the pacing, and a stub can ask it
 * questions no live endpoint would answer.
 *
 * It is also the build law's dependency-injection shape — the rule lives in a
 * pure function, the caller injects the I/O.
 *
 * THE CONTRACT, and the two `null`-vs-`false` outcomes are the whole point:
 *   `true`  — a successful response reporting at least one bathroom
 *   `false` — a successful response reporting ZERO bathrooms ("asked, and there
 *             is none"). ONLY a real answer may produce this.
 *   `null`  — NO ANSWER: a transport error, a throttle, a non-2xx, an
 *             unparseable body, or a parsed body with no `elements` array.
 *             THE CALLER MUST LEAVE THE ROW UNTOUCHED.
 *
 * A place we could not ask about must never be presented as bathroom-less. That
 * is the defect this function exists to make impossible, and the sibling test
 * exercises it directly.
 *
 * @param {unknown} body the response text, or the thrown error's message
 * @param {number|undefined} status the HTTP status, when a response arrived
 * @returns {boolean|null}
 */
export function bathroomsNearbyFromResponse(body, status) {
  // A transport failure arrives here as a thrown-catch result: no status.
  if (status === undefined) return null

  const text = typeof body === 'string' ? body : String(body ?? '')

  // THE THROTTLE IS AN HTML PAGE, NOT JSON, and it always names Dispatcher. This
  // is the measured real shape (the endpoint answers 504, or 200, with this HTML
  // body when it is saturated), so it must be recognised by BODY as well as by
  // status — a 200 carrying it is still not an answer. Re-measured live during
  // this slice.
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
  // treating it as "zero bathrooms" would invent a `false` from a shape we do not
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

/**
 * THE OVERPASS QUERY FOR ONE POINT, pure and exported.
 *
 * ⚠️ WHY THIS IS ITS OWN FUNCTION. The threshold is a DATA-CLAIM decision — a
 * place is marked "Bathrooms" only when a toilet sits within
 * `BATHROOMS_NEARBY_RADIUS_METERS` of it — so the radius the request actually
 * carries is the thing under test. When the query was assembled inline inside
 * `askOverpass` (the coffee script's first version), proving the radius meant
 * either reading the source or calling the live endpoint, which throttles.
 * Extracting it lets the sibling test assert the emitted radius offline.
 *
 * `nwr` — not `node` — is load-bearing: many public toilets in OSM are mapped as
 * ways or relations, so a node-only probe undercounts.
 */
export function bathroomsNearbyQuery(lat, lng) {
  return (
    `[out:json][timeout:25];` +
    `nwr(around:${BATHROOMS_NEARBY_RADIUS_METERS},${lat},${lng})[amenity=${AMENITY_TAG}];` +
    `out tags;`
  )
}

async function askOverpass(lat, lng) {
  const q = bathroomsNearbyQuery(lat, lng)

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
    const decision = bathroomsNearbyFromResponse(body, res.status)

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
  console.log(
    `bathrooms-nearby refresh — radius ${BATHROOMS_NEARBY_RADIUS_METERS}m, tag amenity=${AMENITY_TAG}`,
  )
  console.log(`target ref ${REF}${DRY_RUN ? ' (DRY RUN — nothing will be written)' : ''}`)

  // Only places we have coordinates for AND have never asked about. A `null` is
  // the "never asked" state, so re-running converges: rows already set are
  // skipped, and a second run writes the same values or nothing.
  const selectSql =
    'select id, name, lat, lng from public.places ' +
    'where bathrooms_nearby is null and lat is not null and lng is not null ' +
    'order by name' +
    (ALL ? '' : ` limit ${LIMIT}`) +
    ';'

  const raw = await query(selectSql, 'select candidates')
  const parsed = JSON.parse(raw)
  const rows = Array.isArray(parsed) ? parsed : (parsed.result ?? [])
  console.log(
    `\nplaces to ask about this run: ${rows.length}${ALL ? ' (all unset)' : ` (bounded to ${LIMIT})`}\n`,
  )

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
      updates.push(`update public.places set bathrooms_nearby = true where id = ${sqlStr(row.id)};`)
      console.log(`  ${row.name}: bathrooms nearby`)
    } else {
      setFalse++
      updates.push(`update public.places set bathrooms_nearby = false where id = ${sqlStr(row.id)};`)
      console.log(`  ${row.name}: no bathrooms nearby (asked, answer was zero)`)
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
  console.log('\n=== bathrooms-nearby pass summary ===')
  console.log(`asked:      ${asked}`)
  console.log(`set true:   ${setTrue}`)
  console.log(`set false:  ${setFalse}`)
  console.log(`left null:  ${leftNull}   (no answer — the ask failed or was throttled; the row is UNTOUCHED)`)
  if (DRY_RUN) console.log('(dry run — no rows were written)')
  if (leftNull > 0) {
    console.log(
      '\nNOTE: this pass was PARTIAL. The rows above are still `null` ("never asked"), not\n' +
        '`false` ("no bathrooms") — re-run this script to make progress against them.',
    )
  }

  // The remaining coverage, so the dataset's completeness is stated rather than
  // assumed.
  const coverage = JSON.parse(
    await query(
      'select count(*) filter (where bathrooms_nearby is true) as y, ' +
        'count(*) filter (where bathrooms_nearby is false) as n, ' +
        'count(*) filter (where bathrooms_nearby is null) as unasked, ' +
        'count(*) as total from public.places;',
      'coverage',
    ),
  )
  const cov = Array.isArray(coverage) ? coverage[0] : null
  if (cov) {
    console.log(
      `\ncoverage now: true ${cov.y} / false ${cov.n} / never asked ${cov.unasked} (of ${cov.total})`,
    )
  }
}

if (IS_ENTRY_POINT) {
  main().catch((err) => {
    console.error('\nrefresh failed:', err.message)
    process.exit(1)
  })
}
