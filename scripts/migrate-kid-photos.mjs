/**
 * V9 ticket 11 — MOVE THE ALREADY-UPLOADED KID PHOTOS OUT OF THE PUBLIC BUCKET,
 * and repoint `kids.avatar_url` at their private copies.
 *
 * ============================ WHO RUNS THIS ============================
 * THE COORDINATOR, and only the coordinator: it needs the service-role key to
 * read and write storage objects, and the repo's rule is that DB-admin-level
 * access stays with the human-facing session (the same circle that applies
 * migrations). The builder wrote it and did NOT execute it — not even the dry
 * run — because obtaining that key is itself the privileged step.
 *
 * ============================ HOW TO RUN IT ============================
 *   # 1. the migration first (it creates the bucket + the column + the policies)
 *   node scripts/apply-migration.mjs supabase/migrations/0038_kid_photo_storage.sql
 *
 *   # 2. THE DRY RUN — the plan, the counts, NO writes. Always do this first.
 *   node scripts/migrate-kid-photos.mjs
 *
 *   # 3. the move (refuses to do anything without --yes)
 *   node scripts/migrate-kid-photos.mjs --yes
 *
 * Both runs need the CDP Chrome on :9222 (`bash scripts/cdp-migration-tooling.sh`),
 * exactly like `scripts/apply-migration.mjs`.
 *
 * ============================ WHAT IT DOES ============================
 * For every object in the PUBLIC `avatars` bucket whose key is the kid class
 * (`<uid>/kids/<kidId>`, the same rule the storage policies and the client's
 * `photoStorage.ts` use):
 *
 *   1. read the bytes through the Storage API (service role) and check the length
 *      against the size the DATABASE recorded for that object;
 *   2. write them into the PRIVATE `kid-photos` bucket at the SAME key
 *      (`x-upsert: true` — the Storage API refuses an existing key without it);
 *   3. READ THEM BACK and compare SHA-256 + length;
 *   4. only then delete the public original (verify-then-delete), then attempt a
 *      best-effort CDN purge for that key;
 *   5. and finally rewrite `kids.avatar_url` from the dead public URL to the
 *      bucket-qualified object path (`kid-photos/<uid>/kids/<kidId>`) — for the
 *      rows whose copy is PRESENT in the private bucket, was NOT a FAIL in this
 *      run, and READS BACK as non-empty bytes. A row whose object fails any of
 *      those is left alone and reported as a count: rewriting it would claim an
 *      image that nobody verified.
 *
 * WHY A SCRIPT AND NOT SQL: this project has NO object-move helper —
 * `pg_proc` has no `storage.move_object` / `storage.copy_object` — so a raw
 * `update storage.objects set bucket_id = …` would move the ROW and strand the
 * BYTES in the old bucket's backing store. The byte move has to go through the
 * Storage API. (The migration header says the same thing; this is the other half
 * of it.)
 *
 * ============================ THE KEY ============================
 * The service-role key is read IN-PROCESS, at run time, out of the `cron.job`
 * row that already holds it (`send-push-every-5-minutes`, the shape documented
 * in docs/push-setup.md), through the dashboard SQL API. It is:
 *   - never a command-line argument,
 *   - never written to a file,
 *   - never printed: every line this script logs goes through `redact()`, which
 *     replaces the key with `<redacted-service-key>` wherever it appears,
 *   - held in memory only, for the duration of the run.
 * The script prints COUNTS AND PATHS ONLY — no request bodies, no headers, no
 * keys. (The project URL and the PUBLISHABLE anon key come from `.env`: the URL is
 * not a secret and the anon key ships in every browser that loads the app. The
 * service key never reaches `redact`'s counterpart — it is never printed at all.)
 *
 * ============================ SAFETY ============================
 *   - `--yes` is REQUIRED to write anything; without it the run is a dry run.
 *   - Only kid-class objects are touched. Parent avatars (`<uid>/avatar`) are
 *     never read, moved or deleted — the ticket's T5.
 *   - IT REFUSES TO RUN unless `kid-photos` EXISTS (0038 applied) AND IS PRIVATE
 *     (`public = false`). The second half is not decoration: moving children's
 *     photos into a publicly-readable bucket would leave them anonymously
 *     fetchable at a new URL while every count here looked perfect.
 *   - Nothing is deleted before its copy is verified: read-side length check,
 *     SHA-256 of the read-back, then the delete.
 *   - IDEMPOTENT: a second run finds the sources gone and the destinations
 *     present, copies nothing, deletes nothing, and reports the same end state.
 *     A destination whose bytes DIFFER from a still-present source is re-uploaded
 *     with `x-upsert` (a repair of a partial earlier run), then verified, then the
 *     source is deleted.
 *   - KNOWN RESIDUAL (review cycle 1, F5): objects in `avatars` are stored with
 *     `cache-control: max-age=3600`, so a deleted public URL may keep serving from
 *     the CDN for up to an hour. The script attempts a purge per moved key and
 *     reports refusals, but the tail is real and no row count can see it — probe
 *     with a cache-busting query (`?cb=$(date +%s)`) and read a single 200 within
 *     the hour as a cache hit, not as a failed move.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** The private bucket 0038 creates (the client's PHOTO_BUCKET — kept in step by photoStorage.test.ts). */
export const PHOTO_BUCKET = 'kid-photos'
/** The public bucket the kid photos are leaving. */
export const AVATARS_BUCKET = 'avatars'
/** The second path segment that marks the kid class (both buckets, one rule). */
export const KIDS_FOLDER = 'kids'

/**
 * THE PATH CLASSIFIER, byte-for-byte the rule in `src/lib/photoStorage.ts`
 * (`isKidPhotoPath`) — duplicated here because this is plain JS and that module
 * is TypeScript, and CROSS-CHECKED against it by
 * `src/lib/photoStorage.test.ts` so the two cannot drift apart in silence.
 */
export function isKidPhotoPath(objectPath) {
  const parts = String(objectPath).split('/').filter((part) => part !== '')
  return parts.length >= 3 && parts[1] === KIDS_FOLDER
}

/**
 * The value `kids.avatar_url` holds after the rewrite — the same rule as
 * `photoStorage.kidPhotoStoredRef`, cross-checked the same way.
 */
export function kidPhotoStoredRef(profileId, kidId) {
  return `${PHOTO_BUCKET}/${profileId}/${KIDS_FOLDER}/${kidId}`
}

/** A uuid-ish segment (`<uid>` and `<kidId>` are both uuids in this schema). */
export function isUuidLike(segment) {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    segment,
  )
}

/**
 * A kid-class path split into its rewrite parts, or null when the path's shape
 * is not one this ticket anticipated (the object is still MOVED — it is the kid
 * class by the folder rule — but nothing is rewritten for it, and it is
 * reported).
 */
export function kidPhotoPathParts(objectPath) {
  const parts = String(objectPath).split('/').filter((part) => part !== '')
  if (parts.length !== 3 || parts[1] !== KIDS_FOLDER) return null
  const [profileId, , kidId] = parts
  if (!isUuidLike(profileId) || !isUuidLike(kidId)) return null
  return { profileId, kidId }
}

/**
 * THE PLAN, pure: given the kid-class object keys in the public bucket and the
 * keys already present in the private bucket, decide each source's fate.
 *
 * Three outcomes, and the third is the one that makes re-running safe:
 *   - `copy`     → the destination is absent; copy, verify, delete.
 *   - `repair`   → the destination EXISTS. Nothing is copied unless its bytes
 *                  differ from the source's (checked by the caller, which is the
 *                  only layer that can read bytes) — the entry is `copy` with
 *                  `existing: true` so the caller knows to compare first.
 *   - `orphan`   → a private object with no public source: already migrated (or
 *                  uploaded by the app). NOTHING is done to it.
 * A source that is not the kid class never reaches this function (the SQL that
 * fills `sources` already filters on the folder).
 */
export function planKidPhotoMoves(sources, destinations = []) {
  const dest = new Set(destinations)
  const moves = []
  const orphans = []
  for (const source of sources) {
    if (!isKidPhotoPath(source)) continue
    moves.push({ path: source, destination: source, existing: dest.has(source) })
  }
  const sourceSet = new Set(moves.map((move) => move.path))
  for (const name of destinations) {
    if (isKidPhotoPath(name) && !sourceSet.has(name)) orphans.push(name)
  }
  return { moves, orphans }
}

/**
 * A content fingerprint: SHA-256 with the byte length appended.
 *
 * It replaced an FNV-1a hash in review cycle 1 (F4), for a reason worth keeping:
 * the comparison below proves `what I wrote == what I read back`, and a 32-bit
 * non-cryptographic hash is a weak witness for a file a family cannot replace. It
 * is not a defence against an adversary (nothing here is), it is the difference
 * between "the bytes arrived" and "the bytes arrived, to a collision-resistant
 * standard", and SHA-256 costs nothing on images this size. The length travels
 * WITH the digest, so a truncated copy can never match even in principle.
 */
export function fingerprint(bytes) {
  return `${createHash('sha256').update(bytes).digest('hex')}:${bytes.length}`
}

/**
 * The `kids.avatar_url` rewrite for one verified move, as SQL, or null when the
 * row must be left alone. Both the row id and its owner are pinned from the
 * PATH (not from a guess), and the stored value must still be the public URL
 * shape — so this can never rewrite a row that is already repointed, and it can
 * never touch a row whose owner does not match the path it came from.
 */
export function avatarUrlRewriteSql(profileId, kidId) {
  return (
    `update public.kids set avatar_url = '${kidPhotoStoredRef(profileId, kidId)}' ` +
    `where id = '${kidId}' and profile_id = '${profileId}' ` +
    `and avatar_url like '%/storage/v1/object/public/${AVATARS_BUCKET}/%'`
  )
}

// ---------------------------------------------------------------------------
// The Supabase project: read from the repo .env, NEVER hardcoded. (The V9
// ticket-11 brief carries the project ref TRANSPOSED — `ayzvjwxyrcgyoeaxuk`
// instead of `ayzvjwxbxyrcgyoeaxuk` — which is exactly why this file takes the
// URL from the same `.env` the app and the specs use: one source of truth, and
// no ref to mistype.)
// ---------------------------------------------------------------------------
function readEnvValue(key) {
  const envPath = path.join(process.cwd(), '.env')
  if (!existsSync(envPath)) {
    throw new Error(`Cannot read ${envPath} — run this from the repo root.`)
  }
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith(`${key}=`)) continue
    const value = trimmed.slice(key.length + 1).trim().replace(/^["']|["']$/g, '')
    if (value !== '') return value
  }
  return null
}

function readProjectUrl() {
  const value = readEnvValue('VITE_SUPABASE_URL')
  if (value === null) throw new Error('VITE_SUPABASE_URL missing from .env')
  return value.replace(/\/+$/, '')
}

/**
 * The PUBLISHABLE anon key from the same `.env` — the key that ships in the
 * client bundle, used ONLY for the one anonymous fetch the end-state check makes.
 * It is not a secret (it is in every browser that loads the app); the
 * service-role key above is the one that must never be printed, and this function
 * cannot reach it.
 */
function readAnonKey() {
  return readEnvValue('VITE_SUPABASE_ANON_KEY')
}

/**
 * THE DASHBOARD SQL API (scripts/apply-migration.mjs's documented path): the
 * session token lives in the CDP Chrome profile's Local Storage under
 * `supabase.dashboard.auth.token`, 1-hour TTL, refreshed on page load.
 */
async function readDashboardToken() {
  const { chromium } = await import('@playwright/test')
  let browser
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  } catch {
    throw new Error(
      'No CDP Chrome on :9222 — run: bash scripts/cdp-migration-tooling.sh   then retry.',
    )
  }
  const context = browser.contexts()[0]
  const page =
    context.pages().find((candidate) => candidate.url().startsWith('https://supabase.com')) ??
    (await context.newPage())
  if (page.url() === 'about:blank') {
    await page.goto('https://supabase.com/dashboard', { waitUntil: 'domcontentloaded' })
  }
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(2500)
  const raw = await page.evaluate(() =>
    window.localStorage.getItem('supabase.dashboard.auth.token'),
  )
  await browser.close()
  if (!raw) {
    throw new Error(
      'No dashboard token in the CDP Chrome profile — the session is gone.\n' +
        'Run: bash scripts/cdp-migration-tooling.sh   then retry.',
    )
  }
  return JSON.parse(raw).access_token
}

// ---------------------------------------------------------------------------
// The secret handling. One variable, one redactor, and every log line goes
// through it — including the ones printed from inside an error path.
// ---------------------------------------------------------------------------
let SERVICE_KEY = ''
function redact(text) {
  const value = String(text)
  return SERVICE_KEY === '' ? value : value.split(SERVICE_KEY).join('<redacted-service-key>')
}
function log(message) {
  console.log(redact(message))
}

/** One read through the dashboard SQL API. Returns parsed rows. */
async function dashboardSql(token, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`dashboard SQL HTTP ${res.status}: ${redact(text).slice(0, 800)}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`dashboard SQL answered non-JSON: ${redact(text).slice(0, 800)}`)
  }
}

let PROJECT_REF = ''
let PROJECT_URL = ''

/**
 * THE SERVICE-ROLE KEY, obtained in-process and never printed.
 *
 * It is already in the `cron.job` row that `docs/push-setup.md` documents for
 * the push sender (pg_cron cannot read an env var, so the key sits in the job's
 * `net.http_post` headers as `'Authorization', 'Bearer <key>'`). Reading it from
 * there needs only the dashboard token this script already has, which is why no
 * 0600 temp file and no terminal argument is needed at all.
 *
 * The row's command is never printed, and neither is the key: the extracted
 * value goes into SERVICE_KEY, and `redact()` covers everything printed after.
 */
async function readServiceRoleKey(token) {
  const rows = await dashboardSql(
    token,
    "select jobid, jobname, command from cron.job where command like '%Bearer %'",
  )
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      'No cron.job row carries a Bearer token — cannot obtain the service-role key in-process.\n' +
        'The documented home is the send-push job (docs/push-setup.md). Nothing was changed.',
    )
  }
  for (const row of rows) {
    const match = /Bearer\s+([A-Za-z0-9._-]{20,})/.exec(String(row.command ?? ''))
    if (match === null) continue
    SERVICE_KEY = match[1]
    log(
      `service-role key: obtained in-process from cron.job jobid=${row.jobid} ` +
        `jobname=${row.jobname} (never printed; <redacted-service-key>)`,
    )
    return SERVICE_KEY
  }
  throw new Error('No usable Bearer token found in cron.job. Nothing was changed.')
}

/** The service-role headers, kept in one place so no caller invents its own. */
function serviceHeaders(extra = {}) {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...extra }
}

/** GET/POST/DELETE against the Storage API; returns { status, bytes|json|text }. */
async function storageRequest(method, urlPath, { body, contentType, headers: extra, raw } = {}) {
  const headers = serviceHeaders(extra)
  if (contentType !== undefined) headers['Content-Type'] = contentType
  const res = await fetch(`${PROJECT_URL}${urlPath}`, {
    method,
    headers,
    body,
  })
  if (raw) {
    const buffer = Buffer.from(await res.arrayBuffer())
    return { status: res.status, bytes: buffer }
  }
  const text = await res.text()
  return { status: res.status, text: redact(text) }
}

/** Download one object's bytes with the service role. */
async function downloadObject(bucket, objectPath) {
  const res = await storageRequest(
    'GET',
    `/storage/v1/object/${bucket}/${objectPath}`,
    { raw: true },
  )
  if (res.status !== 200) {
    return { status: res.status, bytes: null }
  }
  return { status: res.status, bytes: res.bytes }
}

/**
 * Upload one object's bytes with the service role, OVERWRITING any existing
 * object at that key.
 *
 * `x-upsert: true` IS REQUIRED AND WAS THE BUG (review cycle 1, F1): the Storage
 * API's create path refuses an existing key with a duplicate-object 409, and the
 * header is the only thing that turns it into an overwrite — the app's own
 * uploads set it (`db.ts` `uploadPrivatePhotoObject`), and so does the exposure
 * spec. Without it, this script's REPAIR path (a destination whose bytes differ
 * from a still-present source) could never run: every re-run would 409, the
 * repair would be logged FAIL, and that object would stay PUBLICLY READABLE
 * forever while the header claimed the repair worked.
 */
async function uploadObject(bucket, objectPath, bytes) {
  const res = await storageRequest('POST', `/storage/v1/object/${bucket}/${objectPath}`, {
    body: bytes,
    contentType: 'image/jpeg',
    // ONLY x-upsert (F1). No cache-control: the storage service already defaults
    // these objects to `max-age=3600`, and adding a header this script cannot test
    // would buy a second way for an upload to 400 for no benefit.
    headers: { 'x-upsert': 'true' },
  })
  return res.status
}

/** Delete one object with the service role. */
async function deleteObject(bucket, objectPath) {
  const res = await storageRequest('DELETE', `/storage/v1/object/${bucket}/${objectPath}`)
  return res.status
}

/**
 * BEST-EFFORT CDN purge for one moved key (review cycle 1, F5).
 *
 * Every object in the public `avatars` bucket is stored with
 * `cache-control: max-age=3600` (probed live), so deleting the object does not
 * necessarily stop the CDN from serving it for up to an hour. Supabase's storage
 * API does not document a purge endpoint, so this is an ATTEMPT: a non-2xx is
 * counted and logged, never treated as a failure, and the residual ≤1h cache tail
 * is stated in this header and in migration 0038's header rather than papered
 * over. It runs AFTER the object's verified delete, so even if a deployment
 * routed this path to the object handler instead of a purge handler it could only
 * re-delete something that is already gone.
 */
async function purgeCdnKey(bucket, objectPath) {
  const res = await storageRequest('DELETE', `/cdn/${bucket}/${objectPath}`)
  return res.status
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    log(
      'usage: node scripts/migrate-kid-photos.mjs [--yes]\n' +
        '  (no flags)  dry run: prints the plan and the counts, writes nothing\n' +
        '  --yes       performs the move and the kids.avatar_url rewrite',
    )
    return 0
  }
  const confirmed = args.includes('--yes')

  PROJECT_URL = readProjectUrl()
  PROJECT_REF = new URL(PROJECT_URL).hostname.split('.')[0]
  log(`project: ${PROJECT_REF} (from .env — never hardcoded in this script)`)
  log(confirmed ? 'MODE: --yes (this run WRITES)' : 'MODE: dry run (nothing will be written)')

  const token = await readDashboardToken()
  await readServiceRoleKey(token)

  // --- 1. The bucket must exist: that is 0038, and nothing here works without it.
  const buckets = await storageRequest('GET', '/storage/v1/bucket')
  if (buckets.status !== 200) {
    throw new Error(
      `could not list buckets with the service key (HTTP ${buckets.status}) — refusing to continue`,
    )
  }
  const bucketIds = (JSON.parse(buckets.text) ?? []).map((bucket) => bucket.id)
  if (!bucketIds.includes(PHOTO_BUCKET)) {
    throw new Error(
      `the '${PHOTO_BUCKET}' bucket does not exist — migration 0038 is NOT applied.\n` +
        'Apply it first: node scripts/apply-migration.mjs supabase/migrations/0038_kid_photo_storage.sql\n' +
        'Nothing was changed.',
    )
  }
  log(`buckets: ${bucketIds.join(', ')} — '${PHOTO_BUCKET}' is present`)

  // --- 1b. THE BUCKET MUST BE PRIVATE, or the move would close nothing.
  //
  // THE ONE PROPERTY THE WHOLE CLOSURE RESTS ON (review cycle 1, F2): the point
  // of this script is that the public copies STOP RESOLVING, and moving bytes into
  // a bucket whose `public` flag is true would leave every child's photo
  // anonymously fetchable at a new URL while the object counts looked perfect.
  // So the flag is read from the bucket ROW and the script refuses BEFORE any
  // write — not "warn and continue", because the failure mode is children's
  // photos staying public while the run reports success.
  const photoBucket = (JSON.parse(buckets.text) ?? []).find(
    (bucket) => bucket.id === PHOTO_BUCKET,
  )
  if (photoBucket.public !== false) {
    throw new Error(
      `the '${PHOTO_BUCKET}' bucket is NOT private (public=${String(photoBucket.public)}) — ` +
        'moving the objects here would leave every kid photo anonymously fetchable at a new ' +
        'URL. Nothing was changed. 0038 pins `public = false` on every apply; re-apply it, ' +
        'then check: select id, public from storage.buckets where id = \'kid-photos\';',
    )
  }
  log(`'${PHOTO_BUCKET}' is present and PRIVATE (public = false)`)

  // --- 2. The two object sets, from storage.objects (the authoritative list).
  //
  // The SOURCE query also brings each object's recorded byte size (F4): the
  // read-back comparison below proves copy == what-I-read, which on its own is
  // only as good as HTTP framing. Comparing the download against the size the
  // database recorded for that object is the second, independent check on the
  // READ side — so a truncated or empty read can never become "the new copy".
  const sourceRows = await dashboardSql(
    token,
    `select name, (metadata->>'size')::bigint as size from storage.objects ` +
      `where bucket_id = '${AVATARS_BUCKET}' ` +
      `and split_part(name, '/', 2) = '${KIDS_FOLDER}' order by name`,
  )
  const sourceSizes = new Map(sourceRows.map((row) => [row.name, row.size]))
  const sources = sourceRows.map((row) => row.name)
  const destinations = (
    await dashboardSql(
      token,
      `select name from storage.objects where bucket_id = '${PHOTO_BUCKET}' ` +
        `and split_part(name, '/', 2) = '${KIDS_FOLDER}' order by name`,
    )
  ).map((row) => row.name)
  const plan = planKidPhotoMoves(sources, destinations)

  log('')
  log(`kid-photo objects in the PUBLIC '${AVATARS_BUCKET}' bucket : ${sources.length}`)
  log(`kid-photo objects already in '${PHOTO_BUCKET}'            : ${destinations.length}`)
  log(`planned moves                                              : ${plan.moves.length}`)
  log(`already-private (no source, nothing to do)                  : ${plan.orphans.length}`)
  for (const move of plan.moves) {
    log(`  move  ${AVATARS_BUCKET}/${move.path}  ->  ${PHOTO_BUCKET}/${move.destination}` +
      (move.existing ? '  (destination exists: bytes will be compared, not blindly copied)' : ''))
  }

  // --- 3. The kid rows whose stored value still points at the public bucket.
  const legacyRows = await dashboardSql(
    token,
    `select id, profile_id, avatar_url from public.kids ` +
      `where avatar_url like '%/storage/v1/object/public/${AVATARS_BUCKET}/%' order by id`,
  )
  log(`kids rows still pointing at the public URL                  : ${legacyRows.length}`)

  if (!confirmed) {
    log('')
    log('DRY RUN — nothing was written. Re-run with --yes to perform the move.')
    return 0
  }

  // --- 4. The move, one object at a time: copy, verify, then delete.
  let copied = 0
  let skippedIdentical = 0
  let repaired = 0
  let deleted = 0
  let purged = 0
  let purgeRefused = 0
  let failed = 0
  /** Every key this run logged a FAIL for — the rewrite below must never claim one. */
  const failedPaths = new Set()
  const movedPaths = []
  for (const move of plan.moves) {
    const source = await downloadObject(AVATARS_BUCKET, move.path)
    if (source.status !== 200 || source.bytes === null) {
      log(`  FAIL  could not read ${AVATARS_BUCKET}/${move.path} (HTTP ${source.status})`)
      failedPaths.add(move.path)
      failed += 1
      continue
    }

    // SECOND, INDEPENDENT READ-SIDE CHECK (review cycle 1, F4): the comparison
    // below proves `copy == what I read`; it says nothing about whether the read
    // itself was complete, and what made that safe was HTTP framing rather than
    // this script. So the download is checked against the byte size the DATABASE
    // recorded for that object. A row with no recorded size (null metadata) is
    // reported and falls back to the read-back comparison alone — deliberately,
    // because refusing on a missing number would strand a real photo.
    const recordedSize = sourceSizes.get(move.path)
    if (recordedSize === null || recordedSize === undefined) {
      log(`  note  ${move.path}: no recorded size — the read-back comparison is the only check`)
    } else if (Number(recordedSize) !== source.bytes.length) {
      log(
        `  FAIL  ${AVATARS_BUCKET}/${move.path} read ${source.bytes.length} bytes but the ` +
          `database recorded ${recordedSize} — refusing to copy or delete anything for it`,
      )
      failedPaths.add(move.path)
      failed += 1
      continue
    }
    const sourceHash = fingerprint(source.bytes)

    let needUpload = true
    if (move.existing) {
      const existing = await downloadObject(PHOTO_BUCKET, move.destination)
      if (existing.status === 200 && existing.bytes !== null) {
        if (fingerprint(existing.bytes) === sourceHash) {
          needUpload = false
          skippedIdentical += 1
          log(`  skip  ${PHOTO_BUCKET}/${move.destination} already matches (${sourceHash})`)
        } else {
          repaired += 1
          log(
            `  repair ${PHOTO_BUCKET}/${move.destination} differs from the source ` +
              `(private ${fingerprint(existing.bytes)} vs public ${sourceHash}) — re-uploading ` +
              '(x-upsert, F1)',
          )
        }
      } else {
        // This is the case F1 was about: the destination exists per storage.objects
        // but could not be read, so the only way forward is an upsert.
        repaired += 1
        log(
          `  repair ${PHOTO_BUCKET}/${move.destination} could not be read back ` +
            `(HTTP ${existing.status}) — re-uploading with x-upsert`,
        )
      }
    }

    if (needUpload) {
      const status = await uploadObject(PHOTO_BUCKET, move.destination, source.bytes)
      if (status !== 200 && status !== 201) {
        log(`  FAIL  could not write ${PHOTO_BUCKET}/${move.destination} (HTTP ${status}) — source LEFT IN PLACE`)
        failedPaths.add(move.path)
        failed += 1
        continue
      }
      copied += 1
    }

    // VERIFY BEFORE DELETE: read the private copy back and compare.
    const check = await downloadObject(PHOTO_BUCKET, move.destination)
    if (check.status !== 200 || check.bytes === null || fingerprint(check.bytes) !== sourceHash) {
      log(
        `  FAIL  verification of ${PHOTO_BUCKET}/${move.destination} did NOT match the source ` +
          `(HTTP ${check.status}) — the public original is LEFT IN PLACE`,
      )
      failedPaths.add(move.path)
      failed += 1
      continue
    }
    const delStatus = await deleteObject(AVATARS_BUCKET, move.path)
    if (delStatus !== 200 && delStatus !== 204) {
      log(
        `  FAIL  the verified copy stands but the public original could not be deleted ` +
          `(HTTP ${delStatus}) — ${AVATARS_BUCKET}/${move.path} is STILL PUBLICLY READABLE`,
      )
      failedPaths.add(move.path)
      failed += 1
      continue
    }
    deleted += 1
    movedPaths.push(move.path)

    // BEST-EFFORT CDN purge (F5). Non-2xx is counted, never fatal: the objects in
    // this bucket are stored with `cache-control: max-age=3600`, so the deleted URL
    // can keep serving from the CDN for up to an hour and neither the row counts
    // nor this script can see that — the header states the tail instead.
    const purgeStatus = await purgeCdnKey(AVATARS_BUCKET, move.path)
    if (purgeStatus >= 200 && purgeStatus < 300) purged += 1
    else purgeRefused += 1

    log(`  ok    ${move.path} — copied, verified (${sourceHash}), public original deleted`)
  }
  log(
    `  cdn   purge attempted for ${movedPaths.length} moved key(s): ${purged} accepted, ` +
      `${purgeRefused} refused (no documented purge endpoint — the ≤1h cache tail stands)`,
  )

  // --- 5. THE REWRITE, only for rows whose private copy is VERIFIED AND PRESENT.
  //
  // The gate has THREE parts, and the third is review cycle 1's F3:
  //   (a) the key is present in 'kid-photos' AFTER the moves, read from
  //       storage.objects — not this run's own in-memory list. That is a repair
  //       path, not a detail: if an earlier run moved the objects and then died
  //       before the rewrite, a re-run finds no sources, copies nothing, and an
  //       in-memory-only gate would rewrite nothing either, leaving the row
  //       pointing at a dead public URL forever;
  //   (b) the key is NOT in `failedPaths` — anything this run logged a FAIL for is
  //       refused, so a destination whose repair failed (the F1 case) can never be
  //       claimed as the row's new home;
  //   (c) the object is READ BACK NOW and must answer 200 with non-empty bytes.
  //       For a key verified in this run that is the same file the byte comparison
  //       above already cleared; for a key inherited from an earlier run it is the
  //       only verification available (the source is gone), and it is what turns
  //       "a row exists" into "an image is really there".
  // Anything that fails one of the three is LEFT ALONE and reported as a count.
  const privateKidPaths = new Set(
    (
      await dashboardSql(
        token,
        `select name from storage.objects where bucket_id = '${PHOTO_BUCKET}' ` +
          `and split_part(name, '/', 2) = '${KIDS_FOLDER}' order by name`,
      )
    ).map((row) => row.name),
  )
  const rewrites = []
  let leftAlone = 0
  let verifiedByReadBackOnly = 0
  for (const row of legacyRows) {
    // The stored value is a URL, not a path — read the owner + kid out of the
    // path INSIDE it, which is the same `<uid>/kids/<kidId>` shape the object
    // keys use. A value whose shape is not recognized is reported, never guessed at.
    const fromUrl = /\/object\/public\/[^/]+\/([^?]+)/.exec(String(row.avatar_url ?? ''))
    const pathParts = fromUrl === null ? null : kidPhotoPathParts(fromUrl[1])
    if (pathParts === null) {
      log(`  note  kids row ${row.id}: avatar_url shape not recognized — LEFT ALONE`)
      leftAlone += 1
      continue
    }
    const { profileId, kidId } = pathParts
    const key = `${profileId}/${KIDS_FOLDER}/${kidId}`
    if (profileId !== row.profile_id) {
      log(
        `  note  kids row ${row.id}: the path's owner does not match profile_id — LEFT ALONE`,
      )
      leftAlone += 1
      continue
    }
    if (!privateKidPaths.has(key)) {
      log(
        `  note  kids row ${row.id}: no private copy in '${PHOTO_BUCKET}' for its path — ` +
          'avatar_url LEFT ALONE',
      )
      leftAlone += 1
      continue
    }
    if (failedPaths.has(key)) {
      log(
        `  note  kids row ${row.id}: this run FAILED on its object — avatar_url LEFT ALONE ` +
          '(a pointer must not claim an image nobody verified)',
      )
      leftAlone += 1
      continue
    }
    if (!movedPaths.includes(key)) {
      // Not moved in this run: inherited from an earlier one. Verify it NOW.
      const present = await downloadObject(PHOTO_BUCKET, key)
      if (present.status !== 200 || present.bytes === null || present.bytes.length === 0) {
        log(
          `  note  kids row ${row.id}: the private copy could not be read back ` +
            `(HTTP ${present.status}) — avatar_url LEFT ALONE`,
        )
        leftAlone += 1
        continue
      }
      verifiedByReadBackOnly += 1
    }
    rewrites.push(avatarUrlRewriteSql(profileId, kidId))
  }
  if (rewrites.length > 0) {
    // The ROW COUNT is not claimed here (review cycle 1, F6): a statement whose
    // `id` does not match the path's kid id is a silent 0-row no-op, and counting
    // statements would report it as a rewrite. The evidence is the END STATE
    // below (`private_refs`), which is counted from the database, plus the
    // warning when it disagrees with what this run believed it wrote.
    await dashboardSql(token, rewrites.join(';\n') + ';')
    log(
      `  ok    issued ${rewrites.length} kids.avatar_url rewrite statement(s) ` +
        `(${rewrites.length - verifiedByReadBackOnly} byte-verified in this run, ` +
        `${verifiedByReadBackOnly} verified by read-back) — the END STATE count below is the evidence`,
    )
  } else {
    log('  ok    no kids.avatar_url needed rewriting')
  }
  if (leftAlone > 0) {
    log(`  note  ${leftAlone} kids row(s) still point at the public URL and were LEFT ALONE`)
  }

  // --- 6. THE END STATE, counted from the database rather than asserted.
  const endState = await dashboardSql(
    token,
    `select
       (select count(*) from storage.objects where bucket_id = '${AVATARS_BUCKET}'
          and split_part(name, '/', 2) = '${KIDS_FOLDER}') as public_kid_objects,
       (select count(*) from storage.objects where bucket_id = '${PHOTO_BUCKET}'
          and split_part(name, '/', 2) = '${KIDS_FOLDER}') as private_kid_objects,
       (select count(*) from public.kids
          where avatar_url like '%/storage/v1/object/public/${AVATARS_BUCKET}/%') as legacy_urls,
       (select count(*) from public.kids
          where avatar_url like '${PHOTO_BUCKET}/%') as private_refs`,
  )
  const counts = Array.isArray(endState) ? endState[0] : endState
  log('')
  log(`copied=${copied} identical-skipped=${skippedIdentical} repaired=${repaired} ` +
    `deleted-from-public=${deleted} failed=${failed}`)
  log(`END STATE: ${JSON.stringify(counts)}`)
  if (counts.public_kid_objects !== 0) {
    log(
      `WARNING: ${counts.public_kid_objects} kid-photo object(s) are STILL in the public ` +
        `'${AVATARS_BUCKET}' bucket. The exposure is NOT closed until that count is 0.`,
    )
  }
  // F6's other half: the rewrite's evidence is this count, so a disagreement
  // between "what this run believed it wrote" and "what the database now holds" is
  // reported rather than glossed over (a 0-row no-op hides in exactly that gap).
  const expectedRefs = rewrites.length
  if (rewrites.length > 0 && Number(counts.private_refs) < expectedRefs) {
    log(
      `WARNING: this run issued ${rewrites.length} rewrite statement(s) but only ` +
        `${counts.private_refs} kids row(s) hold a private reference — inspect the rows ` +
        'that were LEFT ALONE above (a rewrite whose row id did not match is a 0-row no-op).',
    )
  }
  if (purgeRefused > 0) {
    log(
      `NOTE: the CDN purge was refused for ${purgeRefused} key(s); the objects in ` +
        `'${AVATARS_BUCKET}' are stored with cache-control: max-age=3600, so a deleted public ` +
        'URL may keep serving from the CDN for up to an hour. The row counts cannot see that ' +
        'tail — probe with a cache-busting query (see the header).',
    )
  }
  // THE ONE ANONYMOUS PROBE THIS SCRIPT CAN RUN (F2's second half): a public-URL
  // fetch of a key that now EXISTS in the private bucket must not answer 200. It
  // uses the PUBLISHABLE anon key from .env (the one that ships in the client
  // bundle — never the service key), and it is evidence about the bucket's
  // posture rather than about one object.
  // The key MUST be one that is known to be there — a key from a FAILED move would
  // answer non-200 for the wrong reason and make this check pass vacuously. So:
  // the first key this run moved and deleted, else the first pre-existing private
  // kid object, and only when the end state says one exists at all.
  const probeKey = movedPaths[0] ?? destinations[0]
  if (probeKey !== undefined && Number(counts.private_kid_objects) > 0) {
    const anonStatus = await anonymousPublicFetch(`/${PHOTO_BUCKET}/${probeKey}`)
    if (anonStatus === -1) {
      log('anonymous public-URL probe SKIPPED (no VITE_SUPABASE_ANON_KEY in .env)')
    } else {
      log(
        `anonymous public-URL probe for '${PHOTO_BUCKET}/${probeKey}': HTTP ${anonStatus} ` +
          (anonStatus === 200
            ? '← FAILURE: a kid photo is anonymously fetchable in the private bucket!'
            : '(not served — the bucket is not public)'),
      )
      if (anonStatus === 200) return 1
    }
  }
  return failed === 0 ? 0 : 1
}

/**
 * One fetch of the PUBLIC object endpoint with the publishable anon key and NO
 * session — the anonymous caller's own door.
 */
async function anonymousPublicFetch(bucketAndPath) {
  const anonKey = readAnonKey()
  if (anonKey === null) return -1
  const res = await fetch(`${PROJECT_URL}/storage/v1/object/public${bucketAndPath}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  })
  return res.status
}

// Importable without side effects: the unit test imports the pure helpers above
// to cross-check them against src/lib/photoStorage.ts. `main()` runs only when
// this file is the process entry point.
const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isEntryPoint) {
  main()
    .then((code) => {
      process.exit(code)
    })
    .catch((err) => {
      console.error(redact(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`))
      process.exit(1)
    })
}
