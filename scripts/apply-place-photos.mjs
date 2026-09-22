#!/usr/bin/env node
/**
 * V18 t03 — apply the CURATED place photos to the live database.
 *
 * THIS IS THE GATE. It writes ONLY rows whose `disposition` is exactly "keep".
 * A row that is `pending` or `reject` is skipped, silently and by design, so
 * the default state of the sheet (everything `pending`) writes NOTHING. That is
 * the whole safety property: running this script against an unreviewed sheet is
 * a no-op, not a backfill.
 *
 * Why the human gate exists at all (`.scratch/v17/spec.md` §4.1.2, re-measured
 * in V18 t02): Commons returns an image for ~80% of these place names, but the
 * top hit is frequently the WRONG SUBJECT. The V18 run matched "12th West /
 * West Howe Park" to a Victorian memorial pamphlet, "Baker Park on Crown Hill"
 * to a 1919 seed catalogue, and "Alki Community Center" to an EU fisheries
 * visit to Greece. An unattended backfill puts those on family cards.
 *
 * Idempotent and re-runnable: it writes the same values for the same approved
 * ids, so a second run changes nothing.
 *
 * Five columns are written TOGETHER, never `photo_url` alone — a photo without
 * its licence and author is an unhonourable licence (V18 spec D4).
 *
 * Usage:
 *   node scripts/apply-place-photos.mjs --dry-run   # show what WOULD be written
 *   node scripts/apply-place-photos.mjs             # write it
 *
 * Requires SUPABASE_ACCESS_TOKEN in .env (the management API; the anon key has
 * no write policy on `places` by design and cannot do this).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ROOT = process.cwd()
const SHEET = join(ROOT, '.scratch/v18/candidates.json')
const EVIDENCE = join(ROOT, '.scratch/v18/evidence/t03-apply.log')

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

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  if (!REF || !TOKEN) {
    console.error('FATAL: .env needs VITE_SUPABASE_URL and SUPABASE_ACCESS_TOKEN.')
    process.exit(1)
  }
  if (!existsSync(SHEET)) {
    console.error(`FATAL: ${SHEET} does not exist. Run scripts/fetch-place-photos.mjs first.`)
    process.exit(1)
  }

  const sheet = JSON.parse(readFileSync(SHEET, 'utf8'))
  const all = sheet.candidates ?? []
  const approved = all.filter((c) => c.disposition === 'keep')
  const rejected = all.filter((c) => c.disposition === 'reject')
  const pending = all.filter((c) => (c.disposition ?? 'pending') === 'pending')

  mkdirSync(dirname(EVIDENCE), { recursive: true })
  const log = []
  const say = (s) => {
    console.log(s)
    log.push(s)
  }

  say(`sheet: ${all.length} candidates`)
  say(`  keep    ${approved.length}`)
  say(`  reject  ${rejected.length}`)
  say(`  pending ${pending.length}  <- SKIPPED, never written`)
  say('')

  if (approved.length === 0) {
    say('Nothing approved. The apply step is a no-op — this is the safe default.')
    mkdirSync(dirname(EVIDENCE), { recursive: true })
    writeFileSync(EVIDENCE, log.join('\n') + '\n')
    return
  }

  // Refuse to write any row missing its licence or source: that is not a
  // partial success, it is a licence violation.
  const incomplete = approved.filter(
    (c) => !c.image || !c.image.license || !c.image.filePageUrl || !c.image.thumbUrl,
  )
  if (incomplete.length > 0) {
    say(`FATAL: ${incomplete.length} approved row(s) lack licence/source/image. Refusing to write.`)
    for (const c of incomplete) say(`  - ${c.placeName}`)
    writeFileSync(EVIDENCE, log.join('\n') + '\n')
    process.exit(1)
  }

  // One UPDATE per row, all five columns together, scoped by id.
  const statements = approved.map((c) =>
    [
      'update public.places set',
      `  photo_url = ${sqlStr(c.image.thumbUrl)},`,
      `  photo_source_url = ${sqlStr(c.image.filePageUrl)},`,
      `  photo_license = ${sqlStr(c.image.license)},`,
      `  photo_author = ${sqlStr(c.image.author)},`,
      `  photo_attribution = ${sqlStr(c.image.attribution)}`,
      `where id = ${sqlStr(c.placeId)};`,
    ].join('\n'),
  )

  if (dryRun) {
    say(`DRY RUN — would write ${approved.length} row(s). First statement:`)
    say(statements[0])
    writeFileSync(EVIDENCE, log.join('\n') + '\n')
    return
  }

  say(`Writing ${approved.length} row(s)…`)
  const batch = statements.join('\n')
  const result = await query(batch, 'apply')
  if (result.status !== 200 && result.status !== 201) {
    say('FATAL: the apply did not succeed; the database is unchanged for these rows.')
    writeFileSync(EVIDENCE, log.join('\n') + '\n')
    process.exit(1)
  }

  // READ-BACK. The write result is not evidence (the 2025-09-04 lesson: the
  // dashboard reports 0 rows for all DML); the counts are.
  say('')
  say('READ-BACK (the counts are the evidence, not the write result):')
  const counts = await query(
    'select count(*) filter (where photo_url is not null) as with_photo, ' +
      'count(*) filter (where photo_url is not null and (photo_source_url is null or photo_license is null or photo_author is null)) as incomplete, ' +
      'count(*) as total from public.places;',
    'readback',
  )
  say('')
  say(`EXPECTED with_photo = ${approved.length}`)
  say(`read-back: ${counts.text}`)

  writeFileSync(EVIDENCE, log.join('\n') + '\n')
  say('')
  say(`wrote ${EVIDENCE}`)
}

main().catch((err) => {
  console.error(`FATAL: ${err.message}`)
  process.exit(1)
})
