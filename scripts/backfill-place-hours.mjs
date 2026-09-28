#!/usr/bin/env node
/**
 * V27 — one-time backfill of `places.hours` ("is this place open right now?").
 *
 * WHAT THIS WRITES. Two columns on `public.places`, per migration 0056:
 *
 *   hours         jsonb  — { display, weekly: { "0":[["HH:MM","HH:MM"]], ... } }
 *                           keyed by JS `getDay()` (0 = Sunday); NULL = unknown.
 *   hours_source  text   — 'osm' (a real per-venue OSM schedule, ODbL) or
 *                           'city_default' (Seattle open-space default, LABELLED).
 *
 * Every written row also gets `hours_checked_at = now()`, so a stale snapshot can
 * be re-checked rather than trusted forever.
 *
 * THE HONEST-UNKNOWN RULE (same convention as `placeHours.ts`): a row we cannot
 * source confidently STAYS NULL. The card then renders NO open/closed chip.
 * "We do not know" and "it is closed" are different claims, and this script never
 * upgrades one to the other. Concretely, an `opening_hours` string is DROPPED —
 * not guessed — when the parser throws, when it cannot resolve public holidays
 * for the row's country, when it carries a dependency on sunrise/sunset (a
 * fixed weekly snapshot of a sun-relative schedule would be a lie), when the
 * parser flags it as vague/ambiguous, or when the representative week is fully
 * closed (seasonal schedules like a summer-only wading pool).
 *
 * THE TWO PASSES:
 *   1. OSM (`hours_source='osm'`) — ONLY for kinds where a same-name match is a
 *      real schedule: `library` and `other` (community centres). Two Overpass
 *      POSTs (never one per place), then for each place: the nearest feature
 *      within 150 m whose normalized name similarity >= 0.5. If that feature
 *      carries `opening_hours`, it is parsed ONCE here with the `opening_hours`
 *      npm package (a devDependency; the app bundle never sees it) over a
 *      representative week with no public holidays, and bucketed by each
 *      interval's local `getDay()`.
 *
 *      WHY THE OTHER KINDS ARE EXCLUDED FROM OSM. The first live run matched by
 *      name alone and produced real errors: `Rainier Beach Pool` took the
 *      hours of `Rainier Beach Community Center` 52 m away, the three wading
 *      pools took their park's 04:00–23:30 open-space hours, and two
 *      playgrounds took a community centre's hours. Those are false "Open now"
 *      answers, so an OSM schedule is now accepted only for the two kinds the
 *      research memo actually measured as trustworthy. Pools and splash pads
 *      keep NULL (no clean source); playgrounds/beaches get the labelled city
 *      default below instead.
 *   2. City default (`hours_source='city_default'`). Rows still NULL in the
 *      playground / beach / park buckets get Seattle Parks' standard open-space
 *      hours, 6:00 AM – 10:00 PM daily. This is a LABELLED citywide assumption,
 *      not a venue schedule — that is exactly why `hours_source` exists and why
 *      the card says "typical hours" for it. Pools, splash pads, museums,
 *      indoor-play, libraries and community centres are deliberately EXCLUDED:
 *      a default would be a guess about those, not a citywide policy.
 *
 * IDEMPOTENT AND RE-RUNNABLE. Writing a row whose value is already exactly the
 * computed value is skipped (so a second run is a no-op, not a timestamp
 * churn), and a row whose hours were set by a source this script does not own
 * (e.g. a future 'hand' correction) is never overwritten.
 *
 * ARTIFACTS (the plan is written BEFORE it is applied, then applied from disk):
 *   .scratch/hours-backfill/hours.json  — the reviewable list of intended writes
 *   .scratch/hours-backfill/apply.log   — the evidence log of every run
 *
 * Usage:
 *   node scripts/backfill-place-hours.mjs --dry-run   # print plan, no DB writes
 *   node scripts/backfill-place-hours.mjs --report    # DB coverage only
 *   node scripts/backfill-place-hours.mjs             # write it
 *   node scripts/backfill-place-hours.mjs --refresh   # ignore the Overpass cache
 *   node scripts/backfill-place-hours.mjs --force     # re-write every desired row
 *
 * Requires VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_ACCESS_TOKEN
 * in .env. Reads use the anon REST endpoint; the writes use the Management API
 * (POST /v1/projects/<ref>/database/query), because `places` has no write policy
 * for app roles by design — it is seed-only reference data.
 *
 * OVERPASS IS FLAKY. The research memo noted a "server too busy" retry, and the
 * public instance still returns 504s under load. So each query is retried with
 * backoff, then tried against two mirrors, and its successful response is cached
 * under `.scratch/hours-backfill/overpass-<n>.json` so a re-run does not have to
 * race the API again. `--refresh` forces a fresh fetch.
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import OpeningHours from 'opening_hours'

const ROOT = process.cwd()
const OUT_DIR = join(ROOT, '.scratch/hours-backfill')
const PLAN_PATH = join(OUT_DIR, 'hours.json')
const EVIDENCE = join(OUT_DIR, 'apply.log')

/** The research endpoint first, then two well-known mirrors for 504 fallback. */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const BBOX = '47.49,-122.46,47.74,-122.22'

// The two measured queries from `research/place-hours-source.md`, verbatim.
const OVERPASS_QUERIES = [
  `[out:json][timeout:180];
(
  nwr["leisure"~"^(park|playground|swimming_pool|sports_centre|water_park)$"](${BBOX});
  nwr["amenity"~"^(community_centre|library|public_bath|swimming_pool)$"](${BBOX});
  nwr["natural"="beach"](${BBOX});
);
out center tags;`,
  `[out:json][timeout:120];
(
  nwr["tourism"="museum"](${BBOX});
  nwr["leisure"="indoor_play"](${BBOX});
  nwr["leisure"="water_park"](${BBOX});
  nwr["playground"="splash_pad"](${BBOX});
  nwr["attraction"="water_park"](${BBOX});
);
out center tags;`,
]

/** Seattle open-space default — a labelled citywide ASSUMPTION, not a schedule. */
const CITY_DEFAULT = {
  display: '6:00 AM – 10:00 PM',
  weekly: {
    0: [['06:00', '22:00']],
    1: [['06:00', '22:00']],
    2: [['06:00', '22:00']],
    3: [['06:00', '22:00']],
    4: [['06:00', '22:00']],
    5: [['06:00', '22:00']],
    6: [['06:00', '22:00']],
  },
}
/** Only these buckets may receive the citywide default (see the doc comment). */
const CITY_DEFAULT_KINDS = new Set(['playground', 'beach', 'park'])
/**
 * Only these kinds may take an OSM schedule. A same-name feature within 150 m is
 * a trustworthy schedule for a library or a community centre; for a pool, a
 * wading pool, a playground or a beach the nearest named feature is frequently a
 * DIFFERENT facility (see the doc comment's live-run examples), so those kinds
 * never take OSM hours.
 */
const OSM_KINDS = new Set(['library', 'other'])
/** Sources this script owns; anything else on a row is left untouched. */
const OWNED_SOURCES = new Set(['osm', 'city_default'])

const MAX_MATCH_METERS = 150
const SIMILARITY_MIN = 0.5

// A representative week with NO public holidays: Mon 2027-03-01 .. Sun 2027-03-07
// local. The sample window is padded a day either side so an overnight interval
// that starts before/ends after the week is not clipped into a fake short one;
// intervals are kept only when their START falls inside the target week.
const WEEK_START = new Date(2027, 2, 1, 0, 0, 0)
const WEEK_END = new Date(2027, 2, 8, 0, 0, 0)
const SAMPLE_START = new Date(2027, 1, 27, 0, 0, 0)
const SAMPLE_END = new Date(2027, 2, 9, 0, 0, 0)

/** Parser warning types that mean "not confidently parseable" -> leave NULL. */
const FATAL_WARNINGS = new Set([
  'nothing_useful',
  'vague',
  'ambiguous_word',
  'default_state',
  'combine_rules',
  'switched',
  'additional_rule_which_evaluates_to_closed',
  'date_past',
  'date_range_past',
  'year_past',
])
/**
 * Sun-relative schedules cannot be stored as fixed clock times without lying
 * about the season. The `opening_hours` package happily returns a fallback
 * (a constant 06:00–18:00 in our test) with no warning, so the raw string is
 * screened here before it is trusted.
 */
const SUN_RELATIVE = /\b(sunrise|sunset|dawn|dusk|daylight)\b/i

const NAME_STOPWORDS = new Set(['the', 'of', 'and', 'at', 'a', 'an', 'seattle', 'wa'])

function loadEnv() {
  const env = {}
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const env = loadEnv()
const REF = (env.VITE_SUPABASE_URL || '').replace(/^https:\/\//, '').replace(/\.supabase\.co$/, '')
const REST_URL = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const ANON = env.VITE_SUPABASE_ANON_KEY
const TOKEN = env.SUPABASE_ACCESS_TOKEN

/** Escape a JS string for a single-quoted SQL literal. */
function sqlStr(value) {
  if (value === null || value === undefined) return 'null'
  return `'${String(value).replace(/'/g, "''")}'`
}

/**
 * Append one timestamped run to the evidence log. APPEND, not overwrite: an
 * idempotent "nothing to write" check minutes later must not erase the record
 * of the run that actually applied the backfill.
 */
function appendEvidence(lines) {
  appendFileSync(EVIDENCE, `\n===== ${new Date().toISOString()} =====\n${lines.join('\n')}\n`)
}

async function query(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  const line = `${label}: HTTP ${res.status} ${text.slice(0, 900)}`
  console.log(`  ${line}`)
  return { status: res.status, text, line }
}

// ---------------------------------------------------------------------------
// Geo + name matching.
// ---------------------------------------------------------------------------

/** Significant lowercase tokens of a place/feature name. */
function tokens(name) {
  return String(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t !== '' && !NAME_STOPWORDS.has(t))
}

/**
 * Name similarity = shared significant tokens / size of the LARGER token set.
 * This mirrors the examples measured in `research/place-hours-source.md`
 * ("Mt Baker Park" vs "Mount Baker Beach" → 0.33; "Northgate Community Center"
 * vs the Northgate library → 0.17), which is the rule the research memo used.
 */
function nameSimilarity(a, b) {
  const A = new Set(tokens(a))
  const B = new Set(tokens(b))
  if (A.size === 0 || B.size === 0) return 0
  let shared = 0
  for (const t of A) if (B.has(t)) shared += 1
  return shared / Math.max(A.size, B.size)
}

/** Great-circle distance in metres (haversine). */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// ---------------------------------------------------------------------------
// opening_hours → normalized weekly map.
// ---------------------------------------------------------------------------

const pad2 = (n) => String(n).padStart(2, '0')
const toHm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`

function addInterval(weekly, key, pair) {
  if (!Array.isArray(weekly[key])) weekly[key] = []
  const exists = weekly[key].some((p) => p[0] === pair[0] && p[1] === pair[1])
  if (!exists) weekly[key].push(pair)
}

/**
 * Parse one raw `opening_hours` string into a normalized weekly map, or return
 * null when the schedule cannot be stated confidently (see the module header).
 * Never throws and never invents: null is the safe answer.
 */
function parseSchedule(raw, lat, lng) {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  if (SUN_RELATIVE.test(raw)) return null

  let oh
  try {
    // The country code lets `PH …` rules resolve; without it the package throws
    // on perfectly ordinary schedules ("PH closed"). Seattle's places are US/WA.
    oh = new OpeningHours(raw, {
      lat,
      lon: lng,
      address: { country_code: 'us', state: 'Washington' },
    })
  } catch {
    return null
  }

  if (oh.getStructuredWarnings().some((w) => FATAL_WARNINGS.has(w.type))) return null

  let intervals
  try {
    intervals = oh.getOpenIntervals(SAMPLE_START, SAMPLE_END)
  } catch {
    return null
  }

  const weekly = {}
  for (const [from, to, unknown] of intervals) {
    // `unknown` means "maybe open" (a rule that depends on data we do not have).
    // The honest answer for a maybe is UNKNOWN, so it is dropped, not asserted.
    if (unknown) continue
    const spanMs = to.getTime() - from.getTime()
    if (spanMs <= 0) continue

    // A span covering a whole local day or more is all-day: express it as
    // 00:00–23:59 (the app's `parseHm` rejects "24:00"), not as a zero-length
    // interval, which `placeHours.ts` deliberately reads as CLOSED.
    if (spanMs >= 24 * 3600 * 1000) {
      for (let d = 0; d < 7; d += 1) {
        const dayStart = new Date(2027, 2, 1 + d, 0, 0, 0)
        const dayEnd = new Date(2027, 2, 2 + d, 0, 0, 0)
        if (from <= dayStart && to >= dayEnd) {
          addInterval(weekly, String(dayStart.getDay()), ['00:00', '23:59'])
        }
      }
      continue
    }

    // Keep only intervals that START inside the target week, so the padded
    // window cannot leak the previous week's overnight tail into this one.
    if (from < WEEK_START || from >= WEEK_END) continue
    addInterval(weekly, String(from.getDay()), [toHm(from), toHm(to)])
  }

  for (const key of Object.keys(weekly)) {
    weekly[key].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  }
  // A week with no confidently-open day is not a schedule we can stand behind
  // (e.g. a summer-only wading pool sampled in March). Leave the row NULL.
  if (Object.keys(weekly).length === 0) return null
  return { display: raw, weekly }
}

// ---------------------------------------------------------------------------
// Sourcing.
// ---------------------------------------------------------------------------

/** GET the full places list from the anon REST endpoint. */
async function fetchPlaces() {
  const select = 'id,name,kind,lat,lng,hours,hours_source'
  const res = await fetch(`${REST_URL}/rest/v1/places?select=${select}&order=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  })
  if (!res.ok) throw new Error(`places REST HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const rows = await res.json()
  if (!Array.isArray(rows)) throw new Error('places REST did not return an array')
  return rows
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function overpassCachePath(index) {
  return join(OUT_DIR, `overpass-${index + 1}.json`)
}

/** Read a cached Overpass response, or null when there is not a usable one. */
function readOverpassCache(index) {
  try {
    const doc = JSON.parse(readFileSync(overpassCachePath(index), 'utf8'))
    if (Array.isArray(doc.elements) && doc.elements.length > 0) return doc
  } catch {
    /* no usable cache */
  }
  return null
}

/**
 * Run one Overpass POST with the documented headers. Retries each endpoint with
 * backoff, then moves to the next mirror. Throws only when every mirror failed —
 * a partial feature set is never written.
 */
async function overpass(query, label) {
  let lastErr = null
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'User-Agent': 'playdate-place-hours-backfill/1.0 (Seattle place directory; contact: ops)',
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ data: query }).toString(),
        })
        const text = await res.text()
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`)
        const json = JSON.parse(text)
        if (!Array.isArray(json.elements)) throw new Error('response has no elements[]')
        return json
      } catch (err) {
        lastErr = err
        if (attempt < 3) {
          console.log(`  ${label}: ${endpoint} attempt ${attempt} failed (${err.message.slice(0, 80)}); retrying…`)
          await sleep(attempt * 5000)
        }
      }
    }
    console.log(`  ${label}: ${endpoint} unavailable; trying the next mirror…`)
  }
  throw new Error(`${label}: every Overpass endpoint failed after retries — ${lastErr?.message}`)
}

/** Flatten an Overpass element to {name, hours, lat, lng}. */
function toFeature(el) {
  const lat = el.lat ?? el.center?.lat
  const lng = el.lon ?? el.center?.lon
  const name = el.tags?.name
  if (lat == null || lng == null || typeof name !== 'string' || name.trim() === '') return null
  return {
    osm_type: el.type,
    osm_id: el.id,
    name,
    hours: el.tags?.opening_hours,
    lat,
    lng,
  }
}

/**
 * The nearest feature within 150 m whose normalized name shares >= 0.5 tokens.
 * Returns the match whether or not it carries `opening_hours`; the caller then
 * checks the hours, exactly as the research rule specifies ("nearest ... whose
 * name matches; if that feature has opening_hours, parse it").
 */
function nearestNameMatch(place, features) {
  let best = null
  for (const f of features) {
    const distance = haversineMeters(place.lat, place.lng, f.lat, f.lng)
    if (distance > MAX_MATCH_METERS) continue
    const similarity = nameSimilarity(place.name, f.name)
    if (similarity < SIMILARITY_MIN) continue
    if (best === null || distance < best.distance) best = { feature: f, distance, similarity }
  }
  return best
}

// ---------------------------------------------------------------------------
// Plan building.
// ---------------------------------------------------------------------------

/**
 * Structural equality for a stored `hours` value. `jsonb` canonicalizes object
 * key order (it stores `weekly` before `display`), so comparing serializations
 * would report a false "changed" on every run. Compare field by field instead.
 */
function sameHours(a, b) {
  if (a == null || b == null) return (a ?? null) === (b ?? null)
  if (a.display !== b.display) return false
  const aw = a.weekly ?? {}
  const bw = b.weekly ?? {}
  const ak = Object.keys(aw)
  const bk = Object.keys(bw)
  if (ak.length !== bk.length) return false
  for (const key of ak) {
    if (!(key in bw)) return false
    if (JSON.stringify(aw[key]) !== JSON.stringify(bw[key])) return false
  }
  return true
}

/**
 * Compute the intended final state for every row, then keep only the rows whose
 * live value differs. `protected` rows (hours set by a source we do not own)
 * are never touched.
 */
function buildPlan(places, features, force = false) {
  const plan = []
  const summary = { total: places.length, osm: 0, city_default: 0, null: 0, protected: 0 }
  const byKind = new Map()
  const unparsed = []

  for (const place of places) {
    if (!byKind.has(place.kind)) byKind.set(place.kind, { total: 0, osm: 0, city_default: 0, null: 0 })
    const bucket = byKind.get(place.kind)
    bucket.total += 1

    // A row we do not own (e.g. a future hand correction) keeps its value.
    if (place.hours != null && !OWNED_SOURCES.has(place.hours_source)) {
      summary.protected += 1
      const src = place.hours_source === 'osm' ? 'osm' : place.hours_source === 'city_default' ? 'city_default' : null
      if (src) {
        summary[src] += 1
        bucket[src] += 1
      } else {
        summary.null += 1
        bucket.null += 1
      }
      continue
    }

    let desired = null
    let match = null
    if (place.lat != null && place.lng != null && OSM_KINDS.has(place.kind)) {
      match = nearestNameMatch(place, features)
      if (match?.feature.hours) {
        const parsed = parseSchedule(match.feature.hours, place.lat, place.lng)
        if (parsed) {
          desired = { hours: parsed, source: 'osm' }
        } else {
          unparsed.push({
            id: place.id,
            name: place.name,
            kind: place.kind,
            osm_name: match.feature.name,
            raw: match.feature.hours,
            reason: 'unparseable/unconfident',
          })
        }
      }
    }
    if (desired === null && CITY_DEFAULT_KINDS.has(place.kind)) {
      desired = { hours: CITY_DEFAULT, source: 'city_default' }
    }

    if (desired === null) {
      summary.null += 1
      bucket.null += 1
      continue
    }

    summary[desired.source] += 1
    bucket[desired.source] += 1

    const unchanged =
      place.hours != null && place.hours_source === desired.source && sameHours(place.hours, desired.hours)

    plan.push({
      id: place.id,
      name: place.name,
      kind: place.kind,
      hours_source: desired.source,
      display: desired.hours.display,
      weekly: desired.hours.weekly,
      // Records the FULL intended state; only `changed` rows are applied, so the
      // reviewable artifact stays stable across idempotent re-runs.
      changed: force || !unchanged,
      osm: match && desired.source === 'osm'
        ? { name: match.feature.name, osm_type: match.feature.osm_type, osm_id: match.feature.osm_id, distance_m: Math.round(match.distance), similarity: Number(match.similarity.toFixed(3)), raw: match.feature.hours }
        : null,
    })
  }

  return { plan, summary, byKind, unparsed }
}

/** Validate a planned row before it can become SQL. Refuse anything malformed. */
function assertPlannable(row) {
  if (typeof row.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(row.id)) {
    throw new Error(`plan row has a bad id: ${JSON.stringify(row)}`)
  }
  if (row.hours_source !== 'osm' && row.hours_source !== 'city_default') {
    throw new Error(`plan row has a bad source: ${row.hours_source}`)
  }
  if (typeof row.display !== 'string' || row.display.trim() === '') {
    throw new Error(`plan row has no display: ${row.id}`)
  }
  const days = Object.keys(row.weekly ?? {})
  if (days.length === 0) throw new Error(`plan row has an empty weekly: ${row.id}`)
  for (const day of days) {
    if (!/^[0-6]$/.test(day)) throw new Error(`plan row has a bad getDay key "${day}": ${row.id}`)
    const pairs = row.weekly[day]
    if (!Array.isArray(pairs) || pairs.length === 0) throw new Error(`plan row day ${day} is empty: ${row.id}`)
    for (const pair of pairs) {
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((t) => /^\d{2}:\d{2}$/.test(t))) {
        throw new Error(`plan row day ${day} has a bad interval ${JSON.stringify(pair)}: ${row.id}`)
      }
    }
  }
}

async function coverageReport(say, label) {
  const result = await query(
    'select count(*) as total, ' +
      "count(*) filter (where hours_source = 'osm') as osm, " +
      "count(*) filter (where hours_source = 'city_default') as city_default, " +
      'count(*) filter (where hours is null) as null_hours ' +
      'from public.places;',
    label,
  )
  return result
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const reportOnly = process.argv.includes('--report')
  const force = process.argv.includes('--force')

  mkdirSync(dirname(EVIDENCE), { recursive: true })
  const log = []
  const say = (s) => {
    console.log(s)
    log.push(s)
  }

  if (!REF || !TOKEN || !REST_URL || !ANON) {
    console.error('FATAL: .env needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_ACCESS_TOKEN.')
    process.exit(1)
  }

  if (reportOnly) {
    say('COVERAGE REPORT (nothing written):')
    const counts = await coverageReport(say, 'report')
    appendEvidence(log)
    return counts.status === 200 ? undefined : process.exit(1)
  }

  say(`mode: ${dryRun ? 'DRY RUN (no database writes)' : 'WRITE'}`)

  // 1. The places whose hours we are deciding.
  const places = await fetchPlaces()
  say(`places: ${places.length} row(s) from ${REST_URL}/rest/v1/places`)

  // 2. OSM source data — two POSTs, never one per place. A successful response
  //    is cached so an idempotent re-run does not have to race the public API.
  const refresh = process.argv.includes('--refresh')
  say('Overpass: loading the two measured queries…')
  const elements = []
  for (let i = 0; i < OVERPASS_QUERIES.length; i += 1) {
    let doc = refresh ? null : readOverpassCache(i)
    if (doc) {
      say(`  query ${i + 1}: cached response -> ${overpassCachePath(i)} (pass --refresh to refetch)`)
    } else {
      doc = await overpass(OVERPASS_QUERIES[i], `overpass query ${i + 1}`)
      writeFileSync(overpassCachePath(i), JSON.stringify(doc) + '\n')
      const stamp = doc.osm3s?.timestamp_osm_base ?? 'unknown'
      say(`  query ${i + 1}: fetched ${doc.elements.length} element(s), OSM data ${stamp} -> ${overpassCachePath(i)}`)
    }
    const features = doc.elements.map(toFeature).filter(Boolean)
    const withHours = features.filter((f) => f.hours).length
    say(`  query ${i + 1}: ${doc.elements.length} element(s), ${features.length} usable, ${withHours} with opening_hours`)
    elements.push(...features)
  }
  // The two queries overlap (water_park appears in both); dedupe by OSM identity.
  const seen = new Set()
  const features = elements.filter((f) => {
    const key = `${f.osm_type}/${f.osm_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  say(`features: ${features.length} unique (${features.filter((f) => f.hours).length} with opening_hours)`)

  // 3. Decide every row, then write the reviewable plan BEFORE applying it.
  const { plan, summary, byKind, unparsed } = buildPlan(places, features, force)
  const changedRows = plan.filter((row) => row.changed)

  const planDoc = {
    generatedAt: new Date().toISOString(),
    weekSampled: { start: WEEK_START.toISOString(), end: WEEK_END.toISOString() },
    rule: {
      maxDistanceM: MAX_MATCH_METERS,
      nameSimilarityMin: SIMILARITY_MIN,
      similarity: 'shared significant tokens / larger token set',
      cityDefaultKinds: [...CITY_DEFAULT_KINDS],
      osmKinds: [...OSM_KINDS],
      cityDefault: CITY_DEFAULT,
    },
    totals: { ...summary, desired: plan.length, changed: changedRows.length },
    // Everything the OSM pass saw with hours but could not stand behind.
    unparsed,
    // The FULL intended state; `changed` marks the subset applied this run.
    rows: plan,
  }
  writeFileSync(PLAN_PATH, JSON.stringify(planDoc, null, 2) + '\n')
  say(`plan: ${plan.length} desired row(s), ${changedRows.length} change(s) to write -> ${PLAN_PATH}`)

  for (const row of changedRows) {
    if (row.osm) {
      say(`  osm           | ${row.name} (${row.kind}) -> ${row.osm.name} [${row.osm.distance_m} m, sim ${row.osm.similarity}] "${row.osm.raw}"`)
    } else {
      say(`  city_default  | ${row.name} (${row.kind}) -> ${row.display}`)
    }
  }
  if (unparsed.length > 0) {
    say(`unparsed (left NULL, never guessed): ${unparsed.length}`)
    for (const u of unparsed) say(`  - ${u.name} (${u.kind}) <- "${u.raw}"`)
  }

  // Validate the plan before it becomes SQL; a malformed row aborts the run.
  for (const row of plan) assertPlannable(row)

  if (dryRun) {
    say(`DRY RUN — no database writes. The ${changedRows.length} row(s) above are the exact set that would be applied.`)
    say(renderSummary(summary, byKind))
    appendEvidence(log)
    return
  }

  if (changedRows.length === 0) {
    say('Nothing to write — the database already matches the computed plan (idempotent re-run).')
    say(renderSummary(summary, byKind))
    appendEvidence(log)
    return
  }

  // 4. Apply from the plan ON DISK (not from memory), so the reviewed file is
  //    provably the thing that was written.
  const fromDisk = JSON.parse(readFileSync(PLAN_PATH, 'utf8'))
  if (!Array.isArray(fromDisk.rows) || fromDisk.rows.length !== plan.length) {
    say('FATAL: the plan file on disk does not match what was computed. Refusing to apply.')
    appendEvidence(log)
    process.exit(1)
  }

  const statements = fromDisk.rows
    .filter((row) => row.changed)
    .map(
      (row) =>
        `update public.places set hours = ${sqlStr(JSON.stringify({ display: row.display, weekly: row.weekly }))}::jsonb, ` +
        `hours_source = ${sqlStr(row.hours_source)}, hours_checked_at = now() where id = ${sqlStr(row.id)};`,
    )
  say(`applying ${statements.length} update(s)…`)
  const result = await query(statements.join('\n'), 'apply')
  if (result.status !== 200 && result.status !== 201) {
    say('FATAL: the apply did not succeed; treat the database as unchanged for these rows.')
    appendEvidence(log)
    process.exit(1)
  }

  // 5. Read-back — the counts are the evidence, not the write result.
  say('')
  say('READ-BACK (counts are the evidence):')
  const counts = await coverageReport(say, 'readback')
  let parsed = null
  try {
    const json = JSON.parse(counts.text)
    parsed = Array.isArray(json) ? json[0] : json
  } catch {
    parsed = null
  }
  if (parsed == null) {
    say('FATAL: could not parse the read-back. Treat the apply as UNVERIFIED.')
    appendEvidence(log)
    process.exit(1)
  }
  const got = {
    osm: Number(parsed.osm),
    city_default: Number(parsed.city_default),
    null_hours: Number(parsed.null_hours),
    total: Number(parsed.total),
  }
  const expected = {
    osm: summary.osm,
    city_default: summary.city_default,
    null_hours: summary.null,
    total: summary.total + summary.protected,
  }
  say(`expected: osm=${expected.osm} city_default=${expected.city_default} null=${expected.null_hours} total=${expected.total}`)
  say(`actual:   osm=${got.osm} city_default=${got.city_default} null=${got.null_hours} total=${got.total}`)
  const ok =
    got.osm === expected.osm &&
    got.city_default === expected.city_default &&
    got.null_hours === expected.null_hours &&
    got.total === expected.total
  if (!ok) {
    say('FATAL: read-back does not match the plan. Inspect before trusting these hours.')
    appendEvidence(log)
    process.exit(1)
  }
  say('OK: read-back matches the plan.')
  say(renderSummary(summary, byKind))
  appendEvidence(log)
}

function renderSummary(summary, byKind) {
  const lines = []
  lines.push('COVERAGE:')
  lines.push(`  total=${summary.total} osm=${summary.osm} city_default=${summary.city_default} null=${summary.null}${summary.protected ? ` protected=${summary.protected}` : ''}`)
  lines.push('  by kind (total | osm | city_default | null):')
  for (const [kind, b] of [...byKind.entries()].sort()) {
    lines.push(`    ${kind.padEnd(11)} ${String(b.total).padStart(3)} | ${String(b.osm).padStart(3)} | ${String(b.city_default).padStart(3)} | ${String(b.null).padStart(3)}`)
  }
  return lines.join('\n')
}

await main()
