#!/usr/bin/env node
/**
 * Place-photo sourcing (slice 5) — the network shell that fills the directory's
 * blank pictures from Openverse and Wikimedia Commons.
 *
 * WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT. Every DECISION this pipeline
 * makes lives in `src/lib/placePhotoSourcing.ts`, as pure functions with sibling
 * tests: which candidates are dropped, which are tier 1 (a tier that is live to
 * parents), which are tier 2 (stored for review, hidden until a moderator
 * confirms), and what the row patch looks like. That module is imported here
 * directly (`../src/lib/placePhotoSourcing.ts`; Node 26 strips the types,
 * `tsconfig.app.json` sets `allowImportingTsExtensions`) so there is ONE copy of
 * the gate — the V18 shell had to mirror its rules by hand and said so in its own
 * header. What is left here is the part no unit test can cover: fetching, pacing,
 * verifying that a URL answers `image/*`, writing, and reporting.
 *
 * ⚠️ A DRY RUN IS THE DEFAULT, AND THAT IS NOT A FLAG CHOICE. A live write
 * requires `--apply`; without it this script prints the exact table a live run
 * would write and touches nothing. There is no path from "no arguments" to a
 * database write, which is the only way "never write without printing the table
 * first" can be a property rather than a promise.
 *
 * ⚠️ NOTHING IS DOWNLOADED. `photo_url` becomes the REMOTE url the source
 * serves. The founder's hosting ruling (2026-10-05) is link-first: *"we should
 * prefer hosting using whoever has already got the image hosted on their link if
 * possible"* — we only copy an image into our own bucket when a moderator frames
 * it in the editor (`lib/placePhotoAdmin.ts`). The live run asserts the
 * `place-photos` bucket did not grow.
 *
 * ⚠️ THE TWO OPERATIONAL CONSTRAINTS, both recorded in
 * `scripts/fetch-place-photos.mjs`'s header and both fatal to a naive script:
 *
 *   1. Commons returns **403** without a descriptive `User-Agent`.
 *   2. Commons returns **429** under fast pacing.
 *
 * Either one, read as "no photo exists", silently empties places that have good
 * images. So a miss is THREE-VALUED here exactly as it is there: `no candidate`
 * means the sources answered with nothing usable; `failed` means the request
 * itself failed and we know NOTHING. The report keeps them in separate lists.
 *
 * Sources, and why only these two (all measured, not assumed —
 * `.scratch/place-photo-sourcing/spec.md` §1): Openverse (keyless, aggregating
 * Flickr + Wikimedia CC) and Commons NAME search. Commons GEOSEARCH and Wikidata
 * P178 yielded nothing usable for these small parks — geosearch returned
 * photographs taken NEAR them, which is what the name gate exists to reject.
 *
 * BOTH QUERIES CARRY THE CITY (2026-10-05). Commons name search is not
 * locality-bound; measured, the bare name returned a playground in England for
 * "Beacon Hill Playground" and Central Park's Diana Ross Playground for "Ross
 * Playground". `gsrsearch` is therefore `<name> Seattle`, and the gate still
 * checks the file's own geotag when it has one (see `isWrongLocation` in
 * `src/lib/placePhotoSourcing.ts`) — the query improves the candidates, the gate
 * refuses the ones that are still provably elsewhere.
 *
 * Usage:
 *   node scripts/source-place-photos.mjs --dry-run            # all blanks, no writes
 *   node scripts/source-place-photos.mjs --dry-run --limit 10 # the smoke run
 *   node scripts/source-place-photos.mjs --only "Albert Davis Park"
 *   node scripts/source-place-photos.mjs --apply --limit 10   # the LIVE write
 *
 * Output:
 *   .scratch/place-photo-sourcing/report.md    (human — the founder's worklist)
 *   .scratch/place-photo-sourcing/report.json  (machine — rows as written)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { rankCandidates, renderSourcingReport, sourcingPhotoPatch } from '../src/lib/placePhotoSourcing.ts'

const ROOT = process.cwd()
const OUT_DIR = join(ROOT, '.scratch/place-photo-sourcing')
const OUT_MD = join(OUT_DIR, 'report.md')
const OUT_JSON = join(OUT_DIR, 'report.json')

/**
 * A descriptive User-Agent with a contact URL is REQUIRED — Commons 403s without
 * one, and Openverse asks for the same courtesy.
 */
const USER_AGENT =
  'DropInPlaydateApp/1.0 (https://drop-in-mu.vercel.app; contact: jonmeisburg@gmail.com)'

const OPENVERSE_API = 'https://api.openverse.org/v1/images/'
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'

/**
 * The city this directory covers, handed to the gate as a PLACE SIGNAL.
 *
 * The app is single-city (every seeded address is Seattle; `places` has no city
 * column and `neighborhood_id` is NULL on all 239 rows, so there is no finer
 * data to hand over). It matters because tier 1 now needs the place's name AND a
 * place signal — "Wunderkind" alone is not enough to go live on a kids' play
 * space, but "Wunderkind, Seattle" is.
 */
const DIRECTORY_CITY = 'Seattle'

/** The spec's page size for Openverse. */
const OPENVERSE_PAGE_SIZE = 8
/** How many Commons name-search hits to consider per place. */
const COMMONS_LIMIT = 5

/**
 * Pacing floors, per source. Openverse's anonymous allowance is 20/min burst and
 * 200/day sustained (measured from its own `x-ratelimit-*` headers), so 1.1s
 * between calls keeps a 112-place run inside the minute window; Commons 429s
 * under fast pacing and 400ms is the V18 pipeline's proven floor.
 */
const OPENVERSE_DELAY_MS = 1100
const COMMONS_DELAY_MS = 400
const MAX_ATTEMPTS = 4
const BACKOFF_BASE_MS = 2000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Escape a JS value for a single-quoted SQL literal. */
function sqlStr(value) {
  if (value === null || value === undefined) return 'null'
  return `'${String(value).replace(/'/g, "''")}'`
}

function stripHtml(value) {
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Read `.env` into a map. Strips an inline ` # comment` (the V18 lesson: a
 * captured comment made a token `abc # note` and surfaced as an opaque 401).
 */
function readEnvFile() {
  const env = {}
  const path = join(ROOT, '.env')
  if (!existsSync(path)) return env
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim().startsWith('#')) continue
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (!match) continue
    let value = match[2].trim()
    const quoted = /^(["'])(.*)\1$/.exec(value)
    if (quoted) {
      value = quoted[2]
    } else {
      const hash = value.indexOf(' #')
      if (hash >= 0) value = value.slice(0, hash)
    }
    env[match[1]] = value.trim()
  }
  return env
}

/**
 * One GET with bounded exponential backoff on 429 and 5xx.
 *
 * `{ retry: true }` means the request failed and we know nothing; a thrown error
 * is reserved for a 403, which is never a per-place fact (it means the
 * User-Agent was rejected) and must abort the whole run rather than record 112
 * absences.
 */
async function getJson(url, { headers = {}, label = url } = {}) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers } })
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, failure: `network: ${err.message}` }
      await sleep(BACKOFF_BASE_MS * attempt)
      continue
    }
    if (res.status === 403) {
      throw new Error(
        `403 from ${label}. A descriptive User-Agent is required; fix it before trusting any output.`,
      )
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, failure: `HTTP ${res.status} after ${attempt} attempts` }
      await sleep(BACKOFF_BASE_MS * attempt)
      continue
    }
    if (!res.ok) return { ok: false, failure: `HTTP ${res.status}` }
    try {
      return { ok: true, body: await res.json() }
    } catch (err) {
      return { ok: false, failure: `bad json: ${err.message}` }
    }
  }
  return { ok: false, failure: 'exhausted attempts' }
}

/**
 * Does this URL answer with an image?
 *
 * HEAD FIRST, THEN A RANGED GET: some hosts reject HEAD outright, and a link
 * that 404s must never be written to a row a parent will load. The body of the
 * GET probe is cancelled immediately — the point is the header, not the bytes.
 */
async function urlAnswersImage(url) {
  for (const method of ['HEAD', 'GET']) {
    let res
    try {
      res = await fetch(url, {
        method,
        headers: { 'User-Agent': USER_AGENT, Accept: 'image/*', ...(method === 'GET' ? { Range: 'bytes=0-0' } : {}) },
        redirect: 'follow',
      })
    } catch {
      continue
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {})
      continue
    }
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    await res.body?.cancel().catch(() => {})
    if (contentType.startsWith('image/')) return { ok: true, contentType }
  }
  return { ok: false, contentType: null }
}

/** Openverse candidates for one place. */
async function fetchOpenverse(place) {
  const params = new URLSearchParams({ q: `${place.name} Seattle`, page_size: String(OPENVERSE_PAGE_SIZE) })
  const result = await getJson(`${OPENVERSE_API}?${params}`, { label: 'Openverse' })
  if (!result.ok) return { candidates: [], failure: result.failure }
  const results = Array.isArray(result.body?.results) ? result.body.results : []
  return {
    candidates: results
      .filter((row) => row !== null && typeof row === 'object')
      .map((row) => ({
        title: String(row.title ?? ''),
        description: row.description == null ? null : String(row.description),
        url: String(row.url ?? ''),
        source: 'openverse',
        sourceUrl: row.foreign_landing_url == null ? null : String(row.foreign_landing_url),
        license:
          [row.license, row.license_version].filter((part) => part != null && part !== '').join(' ') || null,
        author: row.creator == null ? null : String(row.creator),
      })),
    failure: null,
  }
}

/** Commons NAME-search candidates for one place (the V18 pipeline's own source). */
async function fetchCommons(place) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    // ⚠️ THE CITY IS PART OF THE QUERY, and that is a 2026-10-05 fix measured
    // against the bare-name search the V18 pipeline used. Commons search is NOT
    // locality-bound, so the bare name matched a Seattle park to a playground in
    // ENGLAND ("Beacon Hill Playground - geograph.org.uk"), to Dan Ross
    // Playground in BROOKLYN, to Diana Ross Playground in CENTRAL PARK, and to
    // Norwegian churches for "Kirke Park" — and a photograph 4,000 km away looks
    // exactly like a correct answer. Measured both ways for eight places: the
    // qualified query kept every Seattle hit AND found ones the bare query missed
    // (Kirke Park's own P-Patch, three modern Hiawatha Playfield photos), so this
    // is precision AND yield, not a trade.
    gsrsearch: `${place.name} ${DIRECTORY_CITY}`,
    gsrnamespace: '6',
    gsrlimit: String(COMMONS_LIMIT),
    prop: 'imageinfo|categories|coordinates',
    iiprop: 'url|extmetadata',
    iiurlwidth: '800',
    cllimit: '20',
    format: 'json',
    origin: '*',
  })
  const result = await getJson(`${COMMONS_API}?${params}`, { label: 'Commons' })
  if (!result.ok) return { candidates: [], failure: result.failure }
  const pages = result.body?.query?.pages
  if (pages === null || typeof pages !== 'object' || Array.isArray(pages)) {
    return { candidates: [], failure: null }
  }
  const entries = Object.values(pages).sort((a, b) => {
    const ai = a && typeof a.index === 'number' ? a.index : Number.MAX_SAFE_INTEGER
    const bi = b && typeof b.index === 'number' ? b.index : Number.MAX_SAFE_INTEGER
    return ai - bi
  })
  const candidates = []
  for (const page of entries) {
    if (page === null || typeof page !== 'object') continue
    const info = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null
    if (info === null || typeof info !== 'object') continue
    const url = typeof info.thumburl === 'string' ? info.thumburl : ''
    if (url === '') continue
    const title = typeof page.title === 'string' ? page.title : ''
    const ext = info.extmetadata !== null && typeof info.extmetadata === 'object' ? info.extmetadata : {}
    const license = stripHtml(ext.LicenseShortName?.value ?? '')
    const author = stripHtml(ext.Artist?.value ?? '')
    // The file's own categories — a place signal the gate can trust when the
    // file name is unhelpful ("P-Patch at Kirke Park…" in "Category:Community
    // gardens in Seattle"). Commons returns them as `{ title: 'Category:…' }`.
    const categories = Array.isArray(page.categories)
      ? page.categories
          .map((category) => (category && typeof category.title === 'string' ? category.title : ''))
          .filter((category) => category !== '')
      : []
    // The file's OWN geotag, when it has one. This is what stops a perfect name
    // match 4,000 km away: Commons name search is not locality-bound, and the
    // 2026-10-05 run matched a Seattle park to a playground in England.
    const fileCoordinates = Array.isArray(page.coordinates) ? page.coordinates[0] : null
    const coordinates =
      fileCoordinates && Number.isFinite(Number(fileCoordinates.lat)) && Number.isFinite(Number(fileCoordinates.lon))
        ? { lat: Number(fileCoordinates.lat), lng: Number(fileCoordinates.lon) }
        : null
    candidates.push({
      title,
      description: null,
      url,
      source: 'commons',
      sourceUrl: title === '' ? null : `https://commons.wikimedia.org/wiki/${title.replace(/\s+/g, '_')}`,
      license: license === '' ? null : license,
      author: author === '' ? null : author,
      categories,
      coordinates,
    })
  }
  return { candidates, failure: null }
}

/** Read the blank places straight from the live DB via PostgREST (anon read). */
async function loadBlankPlaces() {
  const env = readEnvFile()
  const base = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_ANON_KEY
  if (!base || !key) throw new Error('.env is missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  const query = 'places?select=id,name,kind,lat,lng&photo_url=is.null&order=name.asc&limit=1000'
  const res = await fetch(`${base}/rest/v1/${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`places read failed: HTTP ${res.status} ${await res.text()}`)
  const places = await res.json()
  // A bare limit is a SILENT coverage cap (the V18 lesson): one extra probe row
  // makes an overflow loud instead of hiding the tail of the directory.
  if (Array.isArray(places) && places.length >= 1000) {
    throw new Error(`places returned ${places.length} rows (the request limit) — paginate before trusting this run.`)
  }
  return places
}

/** Run the management-API query the apply/read-back path needs. */
async function runSql(sql, label) {
  const env = readEnvFile()
  const ref = (env.VITE_SUPABASE_URL || '').replace(/^https:\/\//, '').replace(/\.supabase\.co.*$/, '')
  const token = env.SUPABASE_ACCESS_TOKEN
  if (!ref || !token) throw new Error('.env needs VITE_SUPABASE_URL and SUPABASE_ACCESS_TOKEN for --apply.')
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  console.log(`  ${label}: HTTP ${res.status}`)
  return { status: res.status, text, parsed }
}

/** The read-back counters, as one object. */
async function readState(label) {
  const result = await runSql(
    'select count(*) filter (where photo_url is null) as blanks, ' +
      "count(*) filter (where photo_review_state = 'unreviewed') as unreviewed, " +
      'count(*) as total, ' +
      "(select count(*) from storage.objects where bucket_id = 'place-photos') as place_photos_objects " +
      'from public.places;',
    label,
  )
  const row = Array.isArray(result.parsed) ? result.parsed[0] : null
  if (row === null || typeof row.blanks !== 'number') {
    throw new Error(`could not read the counters back (${result.text.slice(0, 300)})`)
  }
  return row
}

/**
 * THE APPLY STEP. One UPDATE per row, built FROM the pure patch, so the columns
 * written are exactly the ones `sourcingPhotoPatch` decided — never a hand-copied
 * column list that can drift from the tested shape.
 */
async function applyRows(rows) {
  const writes = rows.filter((row) => row.outcome === 'applied' && row.verified === true)
  if (writes.length !== rows.filter((row) => row.outcome === 'applied').length) {
    throw new Error('refusing to write: an applied row was not verified to answer image/*.')
  }
  const before = await readState('read-back (before)')
  const statements = writes.map((row) => {
    const patch = sourcingPhotoPatch({
      tier: row.tier,
      url: row.url,
      sourceUrl: row.sourceUrl,
      license: row.license,
      author: row.author,
    })
    const sets = Object.entries(patch)
      .map(([column, value]) => `${column} = ${sqlStr(value)}`)
      .join(', ')
    return `update public.places set ${sets} where id = ${sqlStr(row.placeId)};`
  })
  const applied = await runSql(statements.join('\n'), 'apply')
  if (applied.status !== 200 && applied.status !== 201) {
    throw new Error(`the apply did not succeed (HTTP ${applied.status}); the database is unchanged for these rows.`)
  }

  const after = await readState('read-back (after)')
  const tier2 = writes.filter((row) => row.tier === 'tier2').length
  const failures = []
  if (after.blanks !== before.blanks - writes.length) {
    failures.push(`blanks went ${before.blanks} -> ${after.blanks}, expected ${before.blanks - writes.length}`)
  }
  if (after.unreviewed !== before.unreviewed + tier2) {
    failures.push(
      `unreviewed went ${before.unreviewed} -> ${after.unreviewed}, expected ${before.unreviewed + tier2}`,
    )
  }
  if (after.place_photos_objects !== before.place_photos_objects) {
    failures.push(
      `the place-photos bucket grew ${before.place_photos_objects} -> ${after.place_photos_objects} — this pipeline must not copy images`,
    )
  }

  // AND THE PER-ROW FACT, not just the counters: every id that was written must
  // read back with a photo. The 2025-09-04 lesson is that a DML result of 0 rows
  // reports success, so the count is the evidence, never the write result.
  const ids = writes.map((row) => sqlStr(row.placeId)).join(', ')
  const readBack = await runSql(
    `select count(*) as written from public.places where id in (${ids}) and photo_url is not null;`,
    'read-back (rows)',
  )
  const written = Array.isArray(readBack.parsed) ? readBack.parsed[0]?.written : null
  if (written !== writes.length) {
    failures.push(`read-back found ${written} of ${writes.length} written rows with a photo_url`)
  }

  console.log(`  before: ${JSON.stringify(before)}`)
  console.log(`  after:  ${JSON.stringify(after)}`)
  if (failures.length > 0) {
    for (const failure of failures) console.log(`  FINDING: ${failure}`)
    throw new Error(`the live apply did NOT verify: ${failures.length} finding(s). Investigate before trusting it.`)
  }
  console.log(`  VERIFIED: ${written} row(s) written (${tier2} tier-2 unreviewed), no bucket growth.`)
}

/** A compact, pasteable console table of the run. */
function printTable(rows, dryRun) {
  console.log('')
  console.log(dryRun ? 'DRY RUN — nothing will be written' : 'LIVE RUN — these rows WILL be written')
  console.log('-'.repeat(100))
  console.log(
    `${'PLACE'.padEnd(38)} ${'OUTCOME'.padEnd(14)} ${'TIER'.padEnd(6)} DETAIL`,
  )
  console.log('-'.repeat(100))
  for (const row of rows) {
    const detail =
      row.outcome === 'applied'
        ? `${row.source} · "${row.title ?? 'unknown title'}" · ${row.license ?? 'no licence stated'} · ${row.url}`
        : `${row.reason ?? 'unknown'}${row.url ? ` · ${row.url}` : ''}`
    console.log(`${row.placeName.slice(0, 37).padEnd(38)} ${row.outcome.padEnd(14)} ${(row.tier ?? '—').padEnd(6)} ${detail}`)
  }
  console.log('-'.repeat(100))
}

async function main() {
  const argv = process.argv.slice(2)
  const dryRun = !argv.includes('--apply')
  const limitIndex = argv.indexOf('--limit')
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : null
  const onlyIndex = argv.indexOf('--only')
  const only = onlyIndex >= 0 ? argv[onlyIndex + 1] : null
  if (limitIndex >= 0 && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error('--limit needs a positive number')
  }

  let places = await loadBlankPlaces()
  if (only !== null && only !== undefined) {
    places = places.filter((place) => place.name.toLowerCase() === String(only).toLowerCase())
    if (places.length === 0) throw new Error(`--only "${only}" matched no blank place`)
  }
  const totalBlanks = places.length
  if (limit !== null) places = places.slice(0, limit)

  console.log(`${dryRun ? 'DRY RUN' : 'LIVE RUN'} — ${places.length} of ${totalBlanks} blank place(s)`)
  console.log(`sources: Openverse (q="<name> ${DIRECTORY_CITY}", page_size=${OPENVERSE_PAGE_SIZE}) + Commons name search (q="<name> ${DIRECTORY_CITY}")`)
  console.log('')

  const rows = []
  for (let index = 0; index < places.length; index++) {
    const place = places[index]
    const openverse = await fetchOpenverse(place)
    await sleep(OPENVERSE_DELAY_MS)
    const commons = await fetchCommons(place)
    await sleep(COMMONS_DELAY_MS)

    const candidates = [...openverse.candidates, ...commons.candidates]
    const failures = [openverse.failure, commons.failure].filter((failure) => failure !== null)
    console.log(
      `[${index + 1}/${places.length}] ${place.name} — ${candidates.length} candidate(s)` +
        (failures.length > 0 ? ` · ${failures.length} source failure(s)` : ''),
    )

    if (candidates.length === 0 && failures.length > 0) {
      rows.push({
        placeId: place.id,
        placeName: place.name,
        kind: place.kind,
        outcome: 'failed',
        reason: failures.join('; '),
      })
      continue
    }
    if (candidates.length === 0) {
      rows.push({ placeId: place.id, placeName: place.name, kind: place.kind, outcome: 'no-candidate', reason: '0 results' })
      continue
    }

    const ranked = rankCandidates(place.name, candidates, {
      city: DIRECTORY_CITY,
      // PostgREST returns `numeric` as a string; the gate coerces, and passing
      // null for the three rows without coordinates simply skips the check.
      lat: place.lat,
      lng: place.lng,
    })
    if (ranked.accepted.length === 0) {
      // Say WHICH titles the gate dropped and why, so the log is an audit trail
      // rather than a verdict. "all failed the gate" alone cannot be checked.
      console.log(
        `      nothing passed the gate — ${ranked.dropped
          .map((entry) => `${entry.reason}:"${entry.title}"`)
          .join(', ')}`,
      )
      rows.push({
        placeId: place.id,
        placeName: place.name,
        kind: place.kind,
        outcome: 'no-candidate',
        reason: 'all failed the gate',
      })
      continue
    }

    // Walk the ranked candidates — tier 1 first — and take the first whose URL
    // actually answers an image. A candidate that cannot be verified is not
    // written, so the next-best is tried rather than leaving the row blank.
    let chosen = null
    for (const entry of ranked.accepted) {
      const check = await urlAnswersImage(entry.candidate.url)
      if (check.ok) {
        chosen = { ...entry, contentType: check.contentType }
        break
      }
      console.log(`      skipping ${entry.candidate.url} — not an image response`)
    }
    if (chosen === null) {
      rows.push({
        placeId: place.id,
        placeName: place.name,
        kind: place.kind,
        outcome: 'no-candidate',
        reason: 'all failed the image check',
      })
      continue
    }

    rows.push({
      placeId: place.id,
      placeName: place.name,
      kind: place.kind,
      outcome: 'applied',
      tier: chosen.tier,
      title: chosen.candidate.title,
      url: chosen.candidate.url,
      source: chosen.candidate.source,
      sourceUrl: chosen.candidate.sourceUrl ?? null,
      license: chosen.candidate.license ?? null,
      author: chosen.candidate.author ?? null,
      verified: true,
      contentType: chosen.contentType,
    })
  }

  printTable(rows, dryRun)

  mkdirSync(dirname(OUT_MD), { recursive: true })
  writeFileSync(
    OUT_MD,
    renderSourcingReport({ rows, requested: places.length, dryRun, generatedAt: new Date().toISOString() }),
  )
  writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), dryRun, rows }, null, 2))

  const applied = rows.filter((row) => row.outcome === 'applied')
  const noCandidate = rows.filter((row) => row.outcome === 'no-candidate')
  const failed = rows.filter((row) => row.outcome === 'failed')
  console.log('')
  console.log(
    `applied ${applied.length} (tier1 ${applied.filter((row) => row.tier === 'tier1').length}, ` +
      `tier2 ${applied.filter((row) => row.tier === 'tier2').length}) | no candidate ${noCandidate.length} | ` +
      `failed ${failed.length} | requested ${places.length}`,
  )
  console.log(`wrote ${OUT_MD}`)
  console.log(`wrote ${OUT_JSON}`)

  if (!dryRun) {
    if (applied.length === 0) {
      console.log('Nothing to write — the apply step is a no-op.')
      return
    }
    console.log('')
    console.log('APPLY:')
    await applyRows(rows)
  }
}

/**
 * Guarded entry point: importing this file (for its helpers, or from a driver)
 * must never start a 112-place crawl. `pathToFileURL` rather than string-building
 * `file://` so a relative or Windows-style path is detected correctly — both
 * failure directions are bad (a false negative starts the crawl on import).
 */
const isDirectRun =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch((err) => {
    console.error(`FATAL: ${err.message}`)
    process.exit(1)
  })
}
