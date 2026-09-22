#!/usr/bin/env node
/**
 * V18 t02 — fetch candidate place photos from Wikimedia Commons.
 *
 * THIS SCRIPT DOES NOT WRITE TO THE DATABASE. It writes a CANDIDATE SHEET for a
 * human to review. That is not a convenience: the V17 feasibility measurement
 * (`.scratch/v17/spec.md` §4.1.2) found Commons returns an image for ~80% of
 * place names but that the TOP HIT IS OFTEN THE WRONG SUBJECT — a congressman's
 * portrait for "Warren G Magnuson", a 1980 seniors' outing for a playground. An
 * automated backfill that trusts its own top hit puts visibly wrong photos on
 * family cards. So the pipeline is fetch -> human review -> apply, and the apply
 * step (`apply-place-photos.mjs`) only ever writes approved rows.
 *
 * THE TWO OPERATIONAL CONSTRAINTS, both learned the hard way and both fatal to
 * a naive script:
 *
 *   1. Commons returns **403** without a descriptive `User-Agent`.
 *   2. Commons returns **429** under fast pacing.
 *
 * Either one, read as "no photo exists", silently empties places that have
 * perfectly good images. The V17 probe did exactly that on its first run and
 * reported 0% — a measurement bug that presented as a finding. This script
 * therefore models a miss as three-valued (none | failed | null) and counts the
 * two separately in its summary.
 *
 * Usage:
 *   node scripts/fetch-place-photos.mjs                  # all 239 places
 *   node scripts/fetch-place-photos.mjs --retry-failed   # re-run only failures
 *   node scripts/fetch-place-photos.mjs --limit 10       # a smoke run
 *
 * Output:
 *   .scratch/v18/candidates.json  (machine — consumed by the apply step)
 *   .scratch/v18/candidates.md    (human — the sheet the founder reviews)
 *
 * The parsing rules live in `src/lib/commons.ts` and are unit-tested there.
 * This file is the network + pacing + reporting shell around them, and is
 * deliberately thin because it is the part no test can cover.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ROOT = process.cwd()
const OUT_JSON = join(ROOT, '.scratch/v18/candidates.json')
const OUT_MD = join(ROOT, '.scratch/v18/candidates.md')

/**
 * A descriptive User-Agent with a contact URL is REQUIRED — Commons 403s
 * without one. Verified working during V17's probe and re-verified in V18.
 */
const USER_AGENT =
  'DropInPlaydateApp/1.0 (https://drop-in-mu.vercel.app; contact: jonmeisburg@gmail.com)'

const API = 'https://commons.wikimedia.org/w/api.php'

/** Pacing: a floor between requests, and bounded exponential backoff on 429. */
const DELAY_MS = 350
const MAX_ATTEMPTS = 4
const BACKOFF_BASE_MS = 2000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * The candidate shape, mirrored from `src/lib/commons.ts`. This script is a
 * `.mjs` and cannot import TypeScript, so the two files must agree by hand —
 * the unit tests in `commons.test.ts` pin the lib's side, and the sheet's own
 * output is the evidence for this side.
 */
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

function buildAttribution(author, license) {
  return [String(author).trim(), String(license).trim()].filter((p) => p !== '').join(' / ')
}

function filePageUrlFor(title) {
  return `https://commons.wikimedia.org/wiki/${String(title).trim().replace(/\s+/g, '_')}`
}

/** Same three-valued rule as the lib: a failure is NEVER an absence. */
function failed(place, reason) {
  return { placeId: place.id, placeName: place.name, kind: place.kind, image: null, miss: 'failed', failure: reason }
}
function absent(place) {
  return { placeId: place.id, placeName: place.name, kind: place.kind, image: null, miss: 'none' }
}

function readCommonsResponse(place, raw) {
  if (raw === null || typeof raw !== 'object') return failed(place, 'response was not an object')
  if (raw.error != null) {
    const info = typeof raw.error === 'object' ? String(raw.error.info ?? 'api error') : String(raw.error)
    return failed(place, `api error: ${info}`)
  }
  const query = raw.query
  if (query == null || typeof query !== 'object') return absent(place)
  const pages = query.pages
  if (pages == null || typeof pages !== 'object' || Array.isArray(pages)) return absent(place)
  const entries = Object.values(pages)
  if (entries.length === 0) return absent(place)

  entries.sort((a, b) => {
    const ai = a && typeof a.index === 'number' ? a.index : Number.MAX_SAFE_INTEGER
    const bi = b && typeof b.index === 'number' ? b.index : Number.MAX_SAFE_INTEGER
    return ai - bi
  })

  for (const page of entries) {
    if (page == null || typeof page !== 'object') continue
    const info = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null
    if (info == null || typeof info !== 'object') continue
    const thumbUrl = typeof info.thumburl === 'string' ? info.thumburl : ''
    if (thumbUrl === '') continue
    const title = typeof page.title === 'string' ? page.title : ''
    const ext = info.extmetadata != null && typeof info.extmetadata === 'object' ? info.extmetadata : {}
    const license = stripHtml(ext.LicenseShortName?.value ?? '')
    const author = stripHtml(ext.Artist?.value ?? '')
    return {
      placeId: place.id,
      placeName: place.name,
      kind: place.kind,
      miss: null,
      image: {
        thumbUrl,
        filePageUrl: title === '' ? '' : filePageUrlFor(title),
        license,
        author,
        attribution: buildAttribution(author, license),
      },
    }
  }
  return absent(place)
}

/**
 * One place -> one candidate. Retries 429 and 5xx with backoff; treats 403 as a
 * hard configuration error (it means the UA was rejected) rather than silently
 * recording 239 absences.
 */
async function fetchPlace(place) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: place.name,
    gsrnamespace: '6',
    gsrlimit: '5',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '800',
    format: 'json',
    origin: '*',
  })
  const url = `${API}?${params}`

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) return failed(place, `network: ${err.message}`)
      await sleep(BACKOFF_BASE_MS * attempt)
      continue
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt === MAX_ATTEMPTS) return failed(place, `HTTP ${res.status} after ${attempt} attempts`)
      await sleep(BACKOFF_BASE_MS * attempt)
      continue
    }
    if (res.status === 403) {
      // Not a per-place fact — the User-Agent was rejected. Fail loudly, and
      // distinctly, so nobody reads 239 failures as "no photos exist".
      throw new Error(
        `Commons returned 403. The User-Agent was rejected; fix it before trusting any output.`,
      )
    }
    if (!res.ok) return failed(place, `HTTP ${res.status}`)

    let body
    try {
      body = await res.json()
    } catch (err) {
      return failed(place, `bad json: ${err.message}`)
    }
    return readCommonsResponse(place, body)
  }
  return failed(place, 'exhausted attempts')
}

/** Read the seeded places straight from the live DB via PostgREST (anon read). */
async function loadPlaces() {
  const env = {}
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  const base = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_ANON_KEY
  if (!base || !key) throw new Error('.env is missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  const res = await fetch(`${base}/rest/v1/places?select=id,name,kind&order=name.asc&limit=1000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`places read failed: HTTP ${res.status} ${await res.text()}`)
  return res.json()
}

/**
 * True when the Commons file is a SCANNED DOCUMENT rather than a photograph.
 *
 * The dominant false-positive class in this corpus: Internet Archive book scans
 * (`... (IA filialtributetom00reid_0).pdf`) whose TITLE shares a surname or a
 * street name with a Seattle park, so a name-overlap count alone ranks a
 * Victorian memorial pamphlet as a photo of that park. The V17 probe saw the
 * same shape ("a 1980 seniors' outing", "a 1919 price list").
 *
 * A PDF/DjVu served through Commons' thumbnailer is essentially never a usable
 * card photo, so this is a safe structural signal — unlike guessing at content.
 */
function isDocumentScan(candidate) {
  const url = candidate.image.thumbUrl.toLowerCase()
  const title = decodeURIComponent(candidate.image.filePageUrl.split('/wiki/').pop() ?? '')
  if (/\.(pdf|djvu|djvu\.jpg|pdf\.jpg)/.test(url)) return true
  if (/\.(pdf|djvu)$/i.test(title)) return true
  // Internet Archive scan markers, and the generic document words that show up
  // in scanned-book titles.
  if (/\(IA [a-z0-9_]+\)/i.test(title)) return true
  return /\b(price list|catalogue|catalog|guide book|treatise|bulletin|annual report|pamphlet|tribute|memoir|souvenir|programme|proceedings)\b/i.test(
    title,
  )
}

/**
 * True when the image is HISTORICAL rather than a picture of the place today.
 *
 * Found by looking at the rendered contact sheet, not by reasoning about the
 * API. Cards are for "where should we go this afternoon", so a 1910 postcard of
 * a playground or a 1950 archival diving shot is the wrong ANSWER even when it
 * is the right SUBJECT — it shows a place that no longer looks like that.
 *
 * The signal is in the file name: Wikimedia's archival imports carry a year
 * (`ca. 1910 - DPLA - …`, `Hiawatha Playfield in 1913.png`) and the DPLA /
 * Municipal Archives collections are historical by construction. 24 of the 217
 * hits carry a pre-1955 year and 11 are DPLA scans.
 *
 * Deliberately conservative: it flags clearly-old material and does not try to
 * judge "recent enough". A borderline 1998 photo passes, which is the right
 * error to make — this only routes a row to human review, it never approves or
 * rejects anything itself.
 */
function isHistorical(candidate) {
  const title = decodeURIComponent(candidate.image.filePageUrl.split('/wiki/').pop() ?? '')
  const years = [...title.matchAll(/\b(1[89]\d\d|19[0-5]\d)\b/g)].map((m) => Number(m[1]))
  // `ca. 1910`, `in 1913`, or a bare archival year in the name.
  if (years.some((y) => y < 1955)) return true
  if (/DPLA|post\s?card/i.test(title)) return true
  return false
}

/** The human sheet. Grouped so 239 rows can be reviewed in one sitting. */

/** Words too common in this corpus to count as agreement. */
const STOPWORDS = new Set([
  'file', 'the', 'and', 'seattle', 'park', 'playground', 'community', 'center', 'centre',
  'jpg', 'jpeg', 'png', 'pdf', 'djvu', 'tif', 'tiff', 'webp', 'washington',
])

function nameTokens(value) {
  return new Set(
    String(value)
      .replace(/\.(jpe?g|png|pdf|djvu|tiff?|webp)$/i, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  )
}

/**
 * How many distinctive words the Commons FILE NAME shares with the place name.
 *
 * Deliberately a dumb count, not a score with a threshold: it is a SORTING AID
 * for a human reviewer, never a filter that decides anything. Reporting a
 * number here and letting the reviewer judge is the honest split — anything
 * cleverer would be an unreviewed judgement of exactly the kind this sheet
 * exists to expose.
 */
function nameAgreement(candidate) {
  const fileTitle = decodeURIComponent(candidate.image.filePageUrl.split('/wiki/').pop() ?? '')
  const placeTokens = nameTokens(candidate.placeName)
  const fileTokens = nameTokens(fileTitle)
  let shared = 0
  for (const token of placeTokens) if (fileTokens.has(token)) shared++
  return shared
}function renderSheet(candidates, meta) {
  const lines = []
  lines.push('# V18 candidate sheet — place photos from Wikimedia Commons')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push('')
  lines.push('## Summary — read these three numbers separately')
  lines.push('')
  lines.push('| Outcome | Count | Meaning |')
  lines.push('|---|---|---|')
  lines.push(`| **hit** | ${meta.hits} | Commons returned an image |`)
  lines.push(`| **none** | ${meta.none} | Commons answered; there is genuinely no image |`)
  lines.push(`| **failed** | ${meta.failed} | **The request failed — we know NOTHING about this place** |`)
  lines.push('')
  if (meta.failed > 0) {
    lines.push(
      `> ⚠️ **${meta.failed} request(s) failed.** These are NOT "no photo exists". ` +
        `Re-run with \`--retry-failed\` before reviewing, or leave them uncurated on purpose.`,
    )
    lines.push('')
  }
  lines.push('> **A hit is not an approval.** Two of five top hits inspected in the V17 probe were the')
  lines.push('> wrong subject entirely. Set `keep` on the rows you have actually looked at.')
  lines.push('')
  lines.push('## How to curate')
  lines.push('')
  lines.push('Edit `candidates.json`: set `"disposition"` on each row to one of')
  lines.push('')
  lines.push('- `keep` — approved; apply this image')
  lines.push('- `reject` — wrong subject / unusable; keep the illustration fallback')
  lines.push('- `pending` — not yet reviewed; the apply step SKIPS these')
  lines.push('')
  lines.push('Only `keep` rows are ever written to the database.')
  lines.push('')

  const hits = candidates.filter((c) => c.miss === null)
  const failedRows = candidates.filter((c) => c.miss === 'failed')

  /**
   * Split the hits by how much the FILE NAME actually agrees with the place
   * name. This is a REVIEW AID, not a decision — it cannot tell a good photo
   * from a bad one, and it never sets a disposition. Its only job is to put the
   * rows most likely to be right in front of the reviewer first, because the
   * measured reality (V17 §4.1.2) is that a large share of top hits are
   * unrelated scans whose names share no word with the place.
   */
  const confident = hits.filter((c) => nameAgreement(c) > 0 && !isDocumentScan(c) && !isHistorical(c))
  const doubtful = hits.filter((c) => !(nameAgreement(c) > 0 && !isDocumentScan(c) && !isHistorical(c)))

  lines.push(`## Tier 1 — file name shares a word with the place (${confident.length})`)
  lines.push('')
  lines.push('These are the ones most likely to be right. Still look at each one.')
  lines.push('')
  for (const c of confident) {
    lines.push(`### ${c.placeName}  \`${c.kind}\``)
    lines.push('')
    lines.push(`- disposition: **${c.disposition ?? 'pending'}**`)
    lines.push(`- image: ${c.image.thumbUrl}`)
    lines.push(`- file page: ${c.image.filePageUrl}`)
    lines.push(`- licence: ${c.image.license || '(none stated)'}`)
    lines.push(`- author: ${c.image.author || '(not named)'}`)
    lines.push(`- credit line: ${c.image.attribution || '(none)'}`)
    lines.push('')
  }

  lines.push(`## Tier 2 — DOUBTFUL: no name agreement, a scanned document, or a historical image (${doubtful.length})`)
  lines.push('')
  lines.push('Expected to be mostly wrong — this tier is where the V17 probe found a')
  lines.push("congressman's portrait and a 1919 seed catalogue, and where this run found")
  lines.push('Internet Archive book scans matching a park on a surname, plus archival')
  lines.push('photos of places as they looked a century ago. Reject by default; a card')
  lines.push('should show somewhere a parent can go THIS WEEK.')
  lines.push('')
  for (const c of doubtful) {
    lines.push(`### ${c.placeName}  \`${c.kind}\``)
    lines.push('')
    lines.push(`- disposition: **${c.disposition ?? 'pending'}**`)
    lines.push(`- image: ${c.image.thumbUrl}`)
    lines.push(`- file page: ${c.image.filePageUrl}`)
    lines.push(`- licence: ${c.image.license || '(none stated)'}`)
    lines.push(`- credit line: ${c.image.attribution || '(none)'}`)
    lines.push('')
  }

  lines.push(`## No image found (${meta.none}) — these keep the illustration`)
  lines.push('')
  for (const c of candidates.filter((x) => x.miss === 'none')) lines.push(`- ${c.placeName} \`${c.kind}\``)
  lines.push('')

  if (failedRows.length > 0) {
    lines.push(`## FAILED requests (${failedRows.length}) — NOT the same as "no image"`)
    lines.push('')
    for (const c of failedRows) lines.push(`- ${c.placeName} \`${c.kind}\` — ${c.failure}`)
    lines.push('')
  }
  return lines.join('\n')
}

async function main() {
  const argv = process.argv.slice(2)

  /**
   * `--sheet-only` regenerates the human sheet from the EXISTING json, with no
   * network at all. It exists because the sheet's grouping is presentation and
   * presentation should never require re-hitting a rate-limited API to change.
   */
  if (argv.includes('--sheet-only')) {
    const saved = JSON.parse(readFileSync(OUT_JSON, 'utf8'))
    writeFileSync(OUT_MD, renderSheet(saved.candidates, saved.meta))
    console.log(`sheet regenerated from ${OUT_JSON} (no network)`)
    console.log(`wrote ${OUT_MD}`)
    return
  }

  const retryFailed = argv.includes('--retry-failed')
  const limitIdx = argv.indexOf('--limit')
  const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : null

  mkdirSync(dirname(OUT_JSON), { recursive: true })

  let places = await loadPlaces()
  let previous = []
  if (existsSync(OUT_JSON)) {
    try {
      previous = JSON.parse(readFileSync(OUT_JSON, 'utf8')).candidates ?? []
    } catch {
      previous = []
    }
  }

  if (retryFailed) {
    // Resumable: re-run ONLY the failures, so a partial run is never a restart.
    const failedIds = new Set(previous.filter((c) => c.miss === 'failed').map((c) => c.placeId))
    places = places.filter((p) => failedIds.has(p.id))
    console.log(`--retry-failed: ${places.length} place(s) to retry`)
  }
  if (limit !== null) places = places.slice(0, limit)

  console.log(`Fetching ${places.length} place(s) from Commons…`)
  const fetched = []
  for (let i = 0; i < places.length; i++) {
    const place = places[i]
    const candidate = await fetchPlace(place)
    fetched.push(candidate)
    const mark = candidate.miss === null ? 'hit ' : candidate.miss === 'failed' ? 'FAIL' : 'none'
    if (i % 10 === 0 || candidate.miss === 'failed') {
      console.log(`  [${i + 1}/${places.length}] ${mark} ${place.name}`)
    }
    await sleep(DELAY_MS) // pacing — 429 otherwise
  }

  // Merge: keep every previously-fetched row, replace the ones just fetched.
  const byId = new Map(previous.map((c) => [c.placeId, c]))
  for (const c of fetched) {
    const prior = byId.get(c.placeId)
    byId.set(c.placeId, { ...c, disposition: prior?.disposition ?? 'pending' })
  }
  const candidates = [...byId.values()].sort((a, b) => a.placeName.localeCompare(b.placeName))

  const meta = {
    hits: candidates.filter((c) => c.miss === null).length,
    none: candidates.filter((c) => c.miss === 'none').length,
    failed: candidates.filter((c) => c.miss === 'failed').length,
    total: candidates.length,
  }

  writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), meta, candidates }, null, 2))
  writeFileSync(OUT_MD, renderSheet(candidates, meta))

  console.log('')
  console.log(`total ${meta.total} | hits ${meta.hits} | none ${meta.none} | FAILED ${meta.failed}`)
  if (meta.failed > 0) {
    console.log('NOTE: failures are NOT absences. Re-run with --retry-failed.')
  }
  console.log(`wrote ${OUT_JSON}`)
  console.log(`wrote ${OUT_MD}`)
}

/**
 * Guarded entry point. Without this, importing the module (for its helpers, or
 * from a test) would START A 239-REQUEST CRAWL as a side effect — which is
 * exactly what happened during V18 t02 when a driver script imported this file
 * to regenerate the sheet. The guard is not style; it prevents a network
 * side effect on import.
 */
const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`

if (isDirectRun) {
  main().catch((err) => {
    console.error(`FATAL: ${err.message}`)
    process.exit(1)
  })
}
