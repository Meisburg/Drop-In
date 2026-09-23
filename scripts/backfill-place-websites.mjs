#!/usr/bin/env node
/**
 * V20 t01 — apply the VERIFIED operator websites to the live database.
 *
 * WHAT THIS WRITES: one column, `places.website_url`, for the rows listed in
 * `.scratch/website-backfill/websites.json`. That file is produced by a
 * RESEARCH step, not by a scrape — every URL in it was fetched (HTTP 200) and
 * its page confirmed to be about that place, with the verifying source URL and
 * the check date recorded beside it. This script does not fetch anything and
 * cannot invent a URL: it is the dumb, reviewable apply half.
 *
 * WHY A HUMAN-REVIEWED FILE AND NOT A GENERATOR. The 0046 photo backfill
 * learned this the expensive way: a scraped top hit is frequently the WRONG
 * SUBJECT (V18 matched "Baker Park on Crown Hill" to a 1919 seed catalogue).
 * The same failure is cheaper here but still real — a wrong website sends a
 * parent to a stranger's page. So the file is the gate and this script writes
 * ONLY what is in it.
 *
 * A NULL IS THE NORMAL OUTCOME. 188 of the 239 rows keep `website_url` NULL,
 * because the city publishes no URL for most playgrounds and spray pads, and
 * two community centers genuinely have no dedicated page. `placeLearnMoreLink`
 * (`src/lib/places.ts`) falls back to the derived OSM map search for those, and
 * the button says so. **Do not chase 100% coverage by guessing slugs.**
 *
 * Idempotent and re-runnable: it sets the same value for the same name, so a
 * second run changes nothing.
 *
 * Usage:
 *   node scripts/backfill-place-websites.mjs --dry-run   # show what WOULD be written
 *   node scripts/backfill-place-websites.mjs             # write it
 *   node scripts/backfill-place-websites.mjs --report    # coverage only, writes nothing
 *
 * Requires SUPABASE_ACCESS_TOKEN in .env (the management API). The anon key
 * CANNOT do this: `places` carries only a SELECT policy for app roles, by
 * design — the directory is seed-only reference data and a parent must never be
 * able to rewrite it.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ROOT = process.cwd()
const SOURCE = join(ROOT, '.scratch/website-backfill/websites.json')
const EVIDENCE = join(ROOT, '.scratch/website-backfill/apply.log')

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
const TOKEN = env.SUPABASE_ACCESS_TOKEN

/** Escape a JS string for a single-quoted SQL literal. */
function sqlStr(value) {
  if (value === null || value === undefined) return 'null'
  return `'${String(value).replace(/'/g, "''")}'`
}

async function query(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  const line = `${label}: HTTP ${res.status} ${text.slice(0, 600)}`
  console.log(`  ${line}`)
  return { status: res.status, text, line }
}

/**
 * The coverage report: how many rows carry a site, and how many are left to the
 * OSM fallback. Printed on every run — the numbers are the evidence, and the
 * "missing" count is a fact about the world rather than a failure to fix.
 */
async function report(say, label) {
  const result = await query(
    'select count(*) filter (where website_url is not null) as with_site, ' +
      'count(*) filter (where website_url is null) as without_site, ' +
      'count(*) filter (where website_url is not null and website_url !~ \'^https?://\') as malformed, ' +
      'count(*) as total from public.places;',
    label,
  )
  return result
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const reportOnly = process.argv.includes('--report')

  mkdirSync(dirname(EVIDENCE), { recursive: true })
  const log = []
  const say = (s) => {
    console.log(s)
    log.push(s)
  }

  if (!REF || !TOKEN) {
    console.error('FATAL: .env needs VITE_SUPABASE_URL and SUPABASE_ACCESS_TOKEN.')
    process.exit(1)
  }

  if (reportOnly) {
    say('COVERAGE REPORT (nothing written):')
    const counts = await report(say, 'report')
    writeFileSync(EVIDENCE, log.join('\n') + '\n')
    return counts.status === 200 ? undefined : process.exit(1)
  }

  let rows
  try {
    rows = JSON.parse(readFileSync(SOURCE, 'utf8'))
  } catch (err) {
    console.error(`FATAL: could not read ${SOURCE}: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
  if (!Array.isArray(rows)) {
    console.error(`FATAL: ${SOURCE} must be a JSON array.`)
    process.exit(1)
  }
  say(`source: ${SOURCE} — ${rows.length} row(s)`)

  /**
   * REFUSE TO WRITE AN UNVERIFIED ROW.
   *
   * Each row must name a place, carry an https URL, and record the source it
   * was verified against. A row missing its `source` is a row nobody checked —
   * writing it would defeat the entire point of the reviewed file, and the
   * 0046 script's `incomplete` check is the precedent (its `ocr` finding was
   * that the check was incomplete, not that it existed).
   *
   * `http://` is accepted (an operator site that never got a certificate is
   * still the operator's site, and `placeLearnMoreLink` renders both), but
   * anything that is not http(s) is refused here rather than being filtered
   * silently at render time.
   */
  const incomplete = rows.filter(
    (r) =>
      typeof r.name !== 'string' ||
      r.name.trim() === '' ||
      typeof r.website_url !== 'string' ||
      !/^https?:\/\/\S+$/i.test(r.website_url) ||
      typeof r.source !== 'string' ||
      r.source.trim() === '',
  )
  if (incomplete.length > 0) {
    say(`FATAL: ${incomplete.length} row(s) lack name/url/source. Refusing to write.`)
    for (const r of incomplete.slice(0, 10)) say(`  - ${JSON.stringify(r)}`)
    writeFileSync(EVIDENCE, log.join('\n') + '\n')
    process.exit(1)
  }

  /**
   * MATCH ON `name`, NOT ON AN ID, and the WHERE clause is deliberately
   * multiplicity-tolerant. The research file was built from the seed's own
   * text, and `places` has NO unique constraint on name alone (its unique key
   * is `(name, address)`, 0029). A name matching more than one row therefore
   * writes the same site to each of them.
   *
   * THAT IS CORRECT FOR EVERY CASE IT ACTUALLY HAPPENS HERE, and the read-back
   * below is what makes the claim checkable rather than assumed. Measured on
   * the live table: exactly two names match two rows each — "Madison Park"
   * (a playground at 1898 43rd Ave E and a beach at 1900 43rd Ave E) and
   * "Seward Park" (a playground at 5898 Lake Washington Bv S and a beach at
   * 5900 Lake Washington Blvd). Both pairs are ONE PHYSICAL PARK that the city
   * publishes in two feature layers, so the park's own page is the right
   * destination for both rows. The expected count is therefore computed from
   * the rows the write can reach, not from the size of the source file.
   *
   * The read-back's job is to catch the OTHER case — a name that matches ZERO
   * rows (a typo, a renamed row). That shows up as an actual count BELOW the
   * expected one, which is what the comparison below fails on. A count ABOVE
   * it cannot happen without new duplicate names appearing in the seed, so it
   * is reported loudly rather than silently accepted.
   */
  const statements = rows.map((r) =>
    `update public.places set website_url = ${sqlStr(r.website_url)} where name = ${sqlStr(r.name)};`,
  )

  if (dryRun) {
    say(`DRY RUN — would write ${rows.length} row(s). First statement:`)
    say(statements[0])
    writeFileSync(EVIDENCE, log.join('\n') + '\n')
    return
  }

  say(`Writing ${rows.length} row(s)…`)
  const result = await query(statements.join('\n'), 'apply')
  if (result.status !== 200 && result.status !== 201) {
    say('FATAL: the apply did not succeed; the database is unchanged for these rows.')
    writeFileSync(EVIDENCE, log.join('\n') + '\n')
    process.exit(1)
  }

  // READ-BACK. The write result is not evidence (the 2025-09-04 lesson: the
  // dashboard reports 0 rows for all DML); the counts are.
  //
  // The expected ROW count is asked of the database rather than assumed from
  // the source file, because a name can match more than one row (see the
  // statement builder above). One extra query, and it turns "51 names" into
  // "the 55 rows those names actually identify" without hard-coding either.
  say('')
  say('READ-BACK (the counts are the evidence, not the write result):')
  const nameList = rows.map((r) => sqlStr(r.name)).join(', ')
  const expectedResult = await query(
    `select count(*) as n from public.places where name in (${nameList});`,
    'expected',
  )
  const expectedRows = (() => {
    try {
      const parsed = JSON.parse(expectedResult.text)
      const first = Array.isArray(parsed) ? parsed[0] : parsed
      return Number(first?.n)
    } catch {
      return Number.NaN
    }
  })()

  const counts = await report(say, 'readback')
  say('')
  say(
    `EXPECTED: ${expectedRows} row(s) across ${rows.length} name(s) — ` +
      `a name matching more than one row is one park published twice (see the notes above)`,
  )

  let actual = null
  try {
    const parsed = JSON.parse(counts.text)
    const first = Array.isArray(parsed) ? parsed[0] : parsed
    actual = Number(first?.with_site)
  } catch {
    actual = null
  }

  if (actual === null || Number.isNaN(actual)) {
    say('FATAL: could not parse the read-back count. Treat the apply as UNVERIFIED.')
    writeFileSync(EVIDENCE, log.join('\n') + '\n')
    process.exit(1)
  }
  if (Number.isNaN(expectedRows)) {
    say('FATAL: could not parse the expected-row count. Treat the apply as UNVERIFIED.')
    writeFileSync(EVIDENCE, log.join('\n') + '\n')
    process.exit(1)
  }
  /**
   * EXACT EQUALITY, in both directions, and both failures are real:
   *
   *  - FEWER rows than expected means a name in the source file matches no row
   *    in `places` (a typo, a renamed row). That is the failure this check
   *    exists for: the site the researcher verified never reaches the place.
   *  - MORE rows than expected means the directory gained a duplicate name
   *    since this script's notes were written, so the name-matched UPDATE is
   *    now writing to a row nobody reviewed. That deserves a human look, not a
   *    shrug.
   */
  if (actual !== expectedRows) {
    say(
      `FATAL: read-back says ${actual} row(s) carry a site, expected ${expectedRows}. ` +
        'A name in the source file matches the wrong number of rows in `places` — inspect and re-run.',
    )
    writeFileSync(EVIDENCE, log.join('\n') + '\n')
    process.exit(1)
  }
  const malformed = (() => {
    try {
      const parsed = JSON.parse(counts.text)
      const first = Array.isArray(parsed) ? parsed[0] : parsed
      return Number(first?.malformed)
    } catch {
      return Number.NaN
    }
  })()
  if (malformed !== 0) {
    say(`FATAL: ${malformed} row(s) hold a non-http(s) website_url. Fix them before shipping.`)
    writeFileSync(EVIDENCE, log.join('\n') + '\n')
    process.exit(1)
  }

  say(`OK: ${actual} row(s) carry a verified website. The rest use the OSM fallback by design.`)
  writeFileSync(EVIDENCE, log.join('\n') + '\n')
}

await main()
