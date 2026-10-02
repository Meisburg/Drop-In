/**
 * Spec (V12 ticket 04): the owner's /profile is the app's ORIGINAL kid-photo
 * render site, and it renders through the batched, best-effort signed-URL read
 * path — never a public URL.
 *
 * V16 t05 (founder decision Q3) ADDED A SECOND SITE: the owner's own view of
 * /u/:handle now renders the same photos through the same hook. Test 1 below
 * covers both halves. This spec's marker always IS the owner, so it makes the
 * owner-side assertion only.
 *
 * V25 t14 WIDENED WHO MAY SEE THESE PHOTOS: the founder reversed V9 ticket 11's
 * owner-only rule on 2026-09-26 (migration 0054 drops the owner check from the
 * kid class's storage SELECT policy; the bucket stays private, anon still reads
 * nothing). The OTHER side of that boundary — a second signed-in parent, both
 * before and after 0040 hands them the row — is asserted with a real second
 * account in e2e/kid-photo-exposure.e2e.ts test 2, with the stranger's empty
 * answer pinned in e2e/kid-names-privacy.e2e.ts 3b.
 *
 * WHAT IT WALKS, in file order (the tests share the live project and run
 * serially — workers are pinned to 1 in playwright.config.ts — so each one
 * cleans up after itself in `afterEach`):
 *
 *   1. THE POSITIVE ROUND-TRIP. The marker creates a kid row whose
 *      `avatar_url` is SET (the legacy public-URL shape the column has always
 *      held — deliberately, the read path must not parse it) and uploads a
 *      real object to the canonical `<uid>/kids/<kidId>` path in the PRIVATE
 *      `kid-photos` bucket, with the marker's own JWT. On /profile the kid row
 *      shows its photo: a SIGNED URL (a `token=` from the private bucket,
 *      never `/object/public/`) that a plain GET can actually fetch. The same
 *      run then walks to /u/<handle> — the marker's own self view — and the
 *      photo renders there too (V16 t05), still from the private bucket.
 *   2. THE COLUMN IS THE GATE, NOT THE OBJECT. A second kid row with
 *      `avatar_url = null` gets an object uploaded to ITS canonical path. On
 *      /profile the row still renders name + age and carries NO <img> — the
 *      object existing in the bucket is not what a render keys on; the column
 *      is. Without the uploaded object this negative could pass for the wrong
 *      reason (nothing to show), so the object is the control that makes the
 *      negative evidence.
 *
 * WHY THE NEGATIVES ARE NOT VACUOUS: test 1 reads the kid row back from the
 * database and asserts its `avatar_url` IS set before the positive is claimed,
 * and test 2 does the same in the null direction. A `toHaveCount(0)` that
 * would also pass on missing data is not evidence.
 *
 * THE HOUSE INVARIANTS this spec does NOT re-prove: the ANON mint refusal, the
 * anon bucket walk, the legacy-column no-<img> pin, and (since V25 t14) the
 * second parent's mint-and-render all live in e2e/kid-photo-exposure.e2e.ts —
 * so a regression there is its failure, not this one.
 *
 * WHAT THIS SPEC DOES NOT DO: it never uploads a kid photo to the PUBLIC
 * `avatars` bucket (that would re-create the exposure ticket 11 exists to
 * prove is closed), it never touches another family's object, and it never
 * runs a migration.
 *
 * Cleanup (best-effort per house, the `e2e-<epoch>` marker prefix so the
 * coordinator's sweep picks stragglers up): the kid rows this spec created
 * and every object it uploaded are deleted with the marker's own JWT in
 * `afterEach`. Every failure is logged, never fatal.
 *
 * The marker helpers below are COPIED from e2e/kid-photo-exposure.e2e.ts
 * (the ticket-11 pattern — not lifted into fixtures.ts, which every spec
 * shares and which this ticket has no reason to change).
 */
import { expect, test } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import { PHOTO_BUCKET, kidPhotoPath } from '../src/lib/photoStorage'
import { readMarkerMeta, readMarkerSession, readSupabaseEnv, openProfileEditor } from './fixtures'

/** The legacy public shape every stored kid `avatar_url` used to hold. */
const LEGACY_PUBLIC_MARKER = '/storage/v1/object/public/avatars/'

// --- A tiny dependency-free PNG (the avatar spec's generator, in miniature). ---

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), 8 + data.length)
  return out
}

/** A solid-RGB 8-bit non-interlaced PNG (no files on disk, no dependency). */
function makePng(width: number, height: number, r: number, g: number, b: number): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r
    row[2 + x * 3] = g
    row[3 + x * 3] = b
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

interface Env {
  url: string
  anonKey: string
  markerUserId: string
  markerToken: string
  markerHandle: string
}

/** The marker's identity + the project's public credentials (read once per test). */
function env(): Env {
  const { url, anonKey } = readSupabaseEnv()
  const session = readMarkerSession()
  return {
    url,
    anonKey,
    markerUserId: session.userId,
    markerToken: session.accessToken,
    markerHandle: readMarkerMeta().displayName,
  }
}

/** The marker's own headers (the owner write policies run as this JWT). */
function markerHeaders(e: Env, withJson = false): Record<string, string> {
  return {
    apikey: e.anonKey,
    Authorization: `Bearer ${e.markerToken}`,
    ...(withJson ? { 'Content-Type': 'application/json' } : {}),
  }
}

/** One kid row created for this run, with the id the private path needs. */
async function createMarkerKid(e: Env, name: string, age: number, avatarUrl: string | null) {
  const res = await fetch(`${e.url}/rest/v1/kids`, {
    method: 'POST',
    headers: { ...markerHeaders(e, true), Prefer: 'return=representation' },
    body: JSON.stringify({ profile_id: e.markerUserId, first_name: name, age, avatar_url: avatarUrl }),
  })
  if (!res.ok) {
    throw new Error(`marker kid insert HTTP ${res.status}: ${await res.text()}`)
  }
  const rows = (await res.json()) as Array<{ id: string }>
  const id = rows[0]?.id
  if (typeof id !== 'string') throw new Error(`kid insert returned no id: ${JSON.stringify(rows)}`)
  return id
}

/** The marker's kid row's `avatar_url` as the database holds it. */
async function readMarkerKidAvatarUrl(e: Env, kidId: string): Promise<string | null | undefined> {
  const res = await fetch(`${e.url}/rest/v1/kids?id=eq.${kidId}&select=avatar_url`, {
    headers: markerHeaders(e),
  })
  if (!res.ok) return undefined
  const rows = (await res.json()) as Array<{ avatar_url?: string | null }>
  return rows[0]?.avatar_url
}

/** Upload one object with the marker's own JWT (the owner-scoped write policies). */
async function markerUpload(e: Env, bucket: string, objectPath: string, bytes: Buffer) {
  return fetch(`${e.url}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: { ...markerHeaders(e), 'Content-Type': 'image/png', 'x-upsert': 'true' },
    body: new Uint8Array(bytes),
  })
}

/** DELETE one object with the marker's own JWT. Logged by the caller, never fatal. */
async function markerDeleteObject(e: Env, bucket: string, objectPath: string): Promise<boolean> {
  const res = await fetch(`${e.url}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'DELETE',
    headers: markerHeaders(e),
  })
  return res.ok || res.status === 404
}

/** DELETE the marker's own kid rows. */
async function markerDeleteKids(e: Env): Promise<number> {
  const res = await fetch(`${e.url}/rest/v1/kids?profile_id=eq.${e.markerUserId}&select=id`, {
    method: 'DELETE',
    headers: { ...markerHeaders(e), Prefer: 'return=representation' },
  })
  if (!res.ok) return -1
  const rows = (await res.json()) as unknown[]
  return rows.length
}

/** What this run created, so `afterEach` can clean up after ANY failure. */
const created: { kidPhotoA: string | null; kidPhotoB: string | null } = {
  kidPhotoA: null,
  kidPhotoB: null,
}

// ---------------------------------------------------------------------------
// 1. THE POSITIVE ROUND-TRIP, AND THE SURFACE THAT STAYS PHOTO-FREE.
// ---------------------------------------------------------------------------
test('the owner’s /profile shows a kid’s photo as a signed URL — and so does the owner’s own /u/<handle> self view (V16 t05)', async ({
  page,
}) => {
  const e = env()
  const epoch = Math.floor(Date.now() / 1000)
  const kidName = `E2E PPhoto ${epoch}`
  // The row carries the LEGACY public shape on purpose: the read path must key
  // on the column being SET and build the canonical path itself — never parse
  // the stored value (a legacy URL would 404 or expire if rendered raw).
  const legacyAvatar = `${e.url}${LEGACY_PUBLIC_MARKER}${e.markerUserId}/kids/legacy-${epoch}`
  const kidId = await createMarkerKid(e, kidName, 5, legacyAvatar)
  const objectPath = kidPhotoPath(e.markerUserId, kidId)

  // THE POSITIVE HALF OF THE EVIDENCE, asserted before the render is claimed:
  // the database row's avatar_url IS set. Without this, a passing img below
  // could be minted for a different row.
  expect(
    await readMarkerKidAvatarUrl(e, kidId),
    'the kid row’s avatar_url must be SET before the render is claimed',
  ).toBe(legacyAvatar)

  // The object, through the real owner write policy, into the PRIVATE bucket.
  const upload = await markerUpload(e, PHOTO_BUCKET, objectPath, makePng(48, 48, 79, 70, 229))
  expect(
    upload.status,
    `the owner's kid-photo write into '${PHOTO_BUCKET}' must succeed (HTTP ${upload.status}: ` +
      `${(await upload.text()).slice(0, 200)})`,
  ).toBe(200)
  created.kidPhotoA = objectPath

  await page.goto('/profile')
  await openProfileEditor(page)

  // V13 ticket 01: /profile is now the EDITOR (name lives in <input kid-name>,
  // not plain text), so hasText won't match the row. This test creates exactly
  // one kid, so .first() identifies it.
  const row = page.getByTestId('kid-row-editor').first()
  await expect(row).toBeVisible()
  const img = row.getByTestId('kid-photo')
  await expect(img, 'the owner’s /profile kid row must show its photo').toBeVisible()
  const src = (await img.getAttribute('src')) ?? ''
  expect(src, `the kid photo must render from '${PHOTO_BUCKET}'`).toContain(PHOTO_BUCKET)
  expect(src, 'a kid photo must never be served from a public object URL').not.toContain(
    '/object/public/',
  )
  expect(src, 'and it must be a SIGNED url').toContain('token=')
  // The URL is not just shaped right — it loads. A bare GET (no session) is
  // exactly what the browser's <img> does, so this is the signed-URL contract.
  const fetched = await fetch(src)
  expect(fetched.status, `the signed kid-photo URL must be fetchable (HTTP ${fetched.status})`).toBe(200)

  // AC2, RE-PINNED BY V16 t05 (founder decision Q3): the owner's own view of
  // /u/:handle is a SECOND kid-photo render site — the owner looking at their
  // own public page is still the owner, so the photo renders there too, minted
  // through the same private-bucket read path as the /profile row above. V25 t14
  // then widened that path to any signed-in parent (0054); the marker IS the
  // owner, so this walk still asserts the owner half only: the row is there AND
  // carries the signed photo. The other half — a second parent, and a parent
  // 0040 returns no row to — is e2e/kid-photo-exposure.e2e.ts test 2.
  await page.goto(`/u/${encodeURIComponent(e.markerHandle)}`)
  await expect(page.getByTestId('kid-row').filter({ hasText: kidName })).toContainText(kidName)
  const selfImg = page.getByTestId('kid-photo')
  await expect(
    selfImg,
    'V16 t05: the owner’s own self view of /u/<handle> renders the kid photo',
  ).toBeVisible()
  const selfSrc = (await selfImg.getAttribute('src')) ?? ''
  expect(selfSrc, `the self-view kid photo must render from '${PHOTO_BUCKET}'`).toContain(
    PHOTO_BUCKET,
  )
  expect(selfSrc, 'and never from a public object URL').not.toContain('/object/public/')
})

// ---------------------------------------------------------------------------
// 2. THE COLUMN IS THE GATE, NOT THE OBJECT.
// ---------------------------------------------------------------------------
test('a kid with no avatar_url renders name + age on /profile even when its object exists', async ({
  page,
}) => {
  const e = env()
  const epoch = Math.floor(Date.now() / 1000)
  const kidName = `E2E NoPhotoCol ${epoch}`
  const kidId = await createMarkerKid(e, kidName, 7, null)

  // THE CONTROL: the object DOES exist at this kid's canonical path. If the
  // row still renders no <img>, the gate is the column — not the bucket.
  const objectPath = kidPhotoPath(e.markerUserId, kidId)
  const upload = await markerUpload(e, PHOTO_BUCKET, objectPath, makePng(48, 48, 232, 85, 47))
  expect(
    upload.status,
    `the control object must exist (HTTP ${upload.status}: ${(await upload.text()).slice(0, 200)})`,
  ).toBe(200)
  created.kidPhotoB = objectPath
  expect(
    await readMarkerKidAvatarUrl(e, kidId),
    'the kid row’s avatar_url must be NULL — that is the input the render keys on',
  ).toBeNull()

  await page.goto('/profile')
  await openProfileEditor(page)

  // V13 ticket 01: /profile is now the EDITOR (name lives in <input kid-name>,
  // not plain text), so hasText won't match the row. This test creates exactly
  // one kid, so .first() identifies it.
  const row = page.getByTestId('kid-row-editor').first()
  await expect(row).toBeVisible()
  await expect(
    row.getByTestId('kid-photo'),
    'a kid without an avatar_url must render no photo, object or no object',
  ).toHaveCount(0)
  await expect(row.locator('img, picture, [role="img"]')).toHaveCount(0)
})

test.afterEach(async () => {
  // Best-effort cleanup (per house): the kid rows this spec created plus every
  // object it uploaded — all with the marker's own JWT, so nothing here can
  // reach another family's data. Logged, never fatal.
  try {
    const e = env()
    const notes: string[] = []

    const remainingKids = await markerDeleteKids(e)
    notes.push(`marker kid rows deleted: ${remainingKids < 0 ? 'FAILED' : remainingKids}`)

    for (const [label, objectPath] of Object.entries(created)) {
      if (objectPath !== null) {
        const ok = await markerDeleteObject(e, PHOTO_BUCKET, objectPath)
        notes.push(`${label} object (${objectPath.replace(/^[^/]+/, '<uid>')}) deleted: ${ok}`)
      }
    }
    created.kidPhotoA = null
    created.kidPhotoB = null
    console.log(`[e2e cleanup] ${notes.join('; ')}`)
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${
        err instanceof Error ? err.message : err
      } — the coordinator's sweep owns stragglers`,
    )
  }
})
