/**
 * Spec (V9 ticket 11): the kid-photo exposure is CLOSED, and the family photo
 * that replaces it works.
 *
 * WHAT IT WALKS, in file order (the tests share the live project and run
 * serially, so each one cleans up after itself in `afterEach`):
 *
 *   1. THE EXPOSURE PROBE, with the anon key ALONE and no session — the exact
 *      call that found the exposure: `POST /storage/v1/object/list/avatars`
 *      with `{"prefix":""}`, then `{"prefix":"<uid>/kids"}` for every folder it
 *      exposed. It must answer with NO kid-photo objects. The SAME probe is
 *      what proves parent avatars are unaffected, from the other side: the
 *      marker uploads a real avatar object through the real owner policy, and
 *      anon must still be able to list and FETCH it.
 *   2. THE TWO CLASSES, PROVEN BY A PAIR OF MINTS (T4: "prove it with a probe,
 *      not an assumption"). The marker puts one kid photo in the PRIVATE bucket
 *      and mints a signed URL for it (200 + `token=`); a signed-in STRANGER
 *      attempts the same mint against the marker's kid path and must get NO
 *      signed URL. That is the case ticket 10's gate exists for: a signed-URL
 *      path must never let one parent fetch another family's kid photos.
 *   3. NO KID PHOTO RENDERS — and the row it would have rendered in still holds
 *      its `avatar_url` (a legacy public-URL shape, deliberately), so the
 *      assertion is not passing because the data is missing: it is passing
 *      because nothing reads it. No `<img>`, no photo control, and the sentence
 *      that tells a parent where the control went.
 *   4. THE FAMILY PHOTO round-trips through the real crop dialog onto /profile
 *      AND /u/:handle, as a SIGNED URL (never a public one), and what the
 *      DATABASE holds is an object PATH — a stored URL would expire on a timer.
 *      A second signed-in family can mint for it (that is what /u/:handle needs);
 *      anon cannot (T4: it usually depicts the children).
 *   5. "ABOUT THE PARENTS" saves and renders, and a profile with none of the
 *      optional blocks still renders cleanly (no placeholder, no empty card).
 *
 * ============================ THE PIVOTS ============================
 * 0038 WAS NOT APPLIED WHEN THIS SPEC WAS WRITTEN AND GATED, so the run below
 * has a DOCUMENTED RED. These are the pivot assertions — the ones that need
 * migration 0038 and the coordinator's object move, and the ONLY ones that may
 * be red pre-apply:
 *
 *   PIVOT A (test 1) — the anon walk finds ZERO kid-photo objects under every
 *     `<uid>/kids` prefix of the public `avatars` bucket. This is the ticket's
 *     core probe: pre-apply it finds the real families' kid photos (the object
 *     count is quoted in the failure message), and it goes green only when the
 *     objects have actually left the public bucket.
 *   PIVOT B (test 2) — the marker's own kid-photo upload into `kid-photos`
 *     answers 200. Pre-apply the BUCKET does not exist and the storage API
 *     answers 400.
 *   PIVOT C (test 2) — the OWNER's signed-URL mint for that kid photo answers
 *     200 with a `token=` URL. It is a pivot for the same reason as B (it needs
 *     the bucket AND the policy), but it is UNREACHABLE while B is red: the
 *     pre-apply run stops at the upload above, so the evidence for C is a green
 *     run after 0038, not a quoted failure. Together with the stranger's refusal
 *     right below it, C is the T4 pair — and the stranger's half is the one that
 *     must stay empty.
 *   PIVOT D (test 4) — the family photo uploads through the crop dialog and
 *     renders as a signed URL. Pre-apply this fails twice over: the bucket is
 *     missing AND `profiles.family_photo_url` does not exist (42703 on the
 *     write), so the card reports its designed error line instead of "Family
 *     photo updated.". MEASURED pre-apply: the card renders the storage API's own
 *     `Bucket not found` message in its error slot — a designed error STATE with
 *     the raw message, which is this app's house discipline for a write that the
 *     schema cannot accept yet (updateBio / addKid / the location write all
 *     surface the driver's message). No crash, and the rest of the page is
 *     intact.
 *
 * GREEN IN EVERY STATE (they need no migration, and a failure here is a real
 * regression, not the documented red):
 *   - the stranger's kid-photo mint returns NO signed URL (fail-closed by
 *     construction, and still fail-closed after 0038 — where it is the storage
 *     POLICY that refuses, which is the point);
 *   - anon cannot list or fetch anything in `kid-photos`, and the old
 *     public-URL SHAPE of a kid photo does not resolve;
 *   - the parent avatar stays public (upload, list, fetch, all with the anon key);
 *   - the kid row renders no `<img>` and no photo control on /u/:handle (the
 *     visitor surface stays photo-free — V13 ticket 01 re-homed the editor to
 *     /profile, so the photo-free pin is now the visitor page);
 *   - "About the parents" saves and renders; an empty profile renders cleanly.
 * A failure in one of THOSE is a real assertion failure with the received value
 * quoted — never a crash, never a bare timeout.
 *
 * WHY THE NEGATIVES ARE NOT VACUOUS: the anon walk first proves it can SEE the
 * bucket at all (the marker's own avatar folder is listed, by name), and test 3
 * seeds a kid row whose `avatar_url` is SET. A `toHaveCount(0)` that would also
 * pass on a broken page or on missing data is not evidence, so both halves are
 * pinned before the negative is asserted.
 *
 * WHAT THIS SPEC DOES NOT DO: it never uploads a kid photo to the PUBLIC
 * `avatars` bucket (that would re-create the exposure it exists to prove is
 * closed), it never touches another family's object, and it never runs the
 * migration or the move script.
 *
 * Cleanup (best-effort per house, the `e2e-<epoch>` marker prefix so the
 * coordinator's sweep picks stragglers up): every object THIS spec uploaded is
 * deleted with the marker's own JWT — its avatar object, its kid-photo probe in
 * the private bucket, and its family photo — plus the kid rows it created, the
 * `family_photo_url` and the `bio` it set, and the `avatar_url` it nulled. The
 * `e2e-v-*` stranger ACCOUNT is left for the coordinator's sweep (the sweep owns
 * `email like 'e2e-%'`); no rows are. Every failure is logged, never fatal.
 */
import { expect, test } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import os from 'node:os'
import path from 'node:path'
import {
  PHOTO_BUCKET,
  familyPhotoPath,
  familyPhotoVisibility,
  isKidPhotoPath,
  kidPhotoPath,
  kidPhotoStoredRef,
  kidPhotoVisibility,
} from '../src/lib/photoStorage'
import {
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
} from './fixtures'

const AVATARS_BUCKET = 'avatars'
/** The legacy public shape every stored kid photo used to hold. */
const LEGACY_PUBLIC_MARKER = '/storage/v1/object/public/avatars/'

// --- A tiny dependency-free PNG (the avatar spec's generator, in miniature). ---
// The family photo MUST decode as a real image (the crop step runs
// `createImageBitmap`), so a base64 constant would not do; the avatar spec needs
// 400x300 to prove the crop squares it, and this spec needs only a real bitmap.

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

/** The marker's own headers (the 0011 owner write policies run as this JWT). */
function markerHeaders(e: Env, withJson = false): Record<string, string> {
  return {
    apikey: e.anonKey,
    Authorization: `Bearer ${e.markerToken}`,
    ...(withJson ? { 'Content-Type': 'application/json' } : {}),
  }
}

/** THE ANON PROBE: the anon key alone, no session, exactly the call that found the exposure. */
async function anonList(
  e: Env,
  bucket: string,
  prefix: string,
): Promise<{ status: number; entries: Array<{ name: string; id: string | null }> }> {
  const res = await fetch(`${e.url}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: {
      apikey: e.anonKey,
      Authorization: `Bearer ${e.anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
  })
  if (res.status !== 200) return { status: res.status, entries: [] }
  const body = (await res.json()) as Array<{ name?: unknown; id?: unknown }>
  return {
    status: res.status,
    entries: body.map((row) => ({
      name: String(row.name ?? ''),
      id: typeof row.id === 'string' ? row.id : null,
    })),
  }
}

/**
 * An object path with its uid masked to 8 characters, for a failure message.
 *
 * The paths ARE the evidence (the ticket's T8 asks for the object count and the
 * exact probe), but the uid is another family's profile id and a report is a
 * durable artifact: 8 characters identify the prefix without republishing an id
 * that has no business in a test log. The COUNT is never masked.
 */
function describePaths(paths: string[]): string {
  const masked = paths.map((objectPath) => {
    const [owner, folder, rest] = objectPath.split('/')
    return `${String(owner).slice(0, 8)}…/${folder ?? ''}/${rest === undefined ? '' : '…'}`
  })
  return `${paths.length} object(s): ${masked.join(', ')}`
}

interface Stranger {
  context: BrowserContext
  page: Page
  userId: string
  accessToken: string
}

/**
 * Sign up + onboard a fresh `e2e-v-*` account (the ticket-04 pattern, copied
 * from e2e/kid-names-privacy.e2e.ts — NOT lifted into fixtures.ts, which every
 * spec shares and which this ticket has no reason to change).
 *
 * The session is read back from a temp storageState file: the stranger's mint
 * attempt has to be issued AS THE STRANGER, which is the whole point — a
 * client-side absence is not proof that the storage policy refuses.
 */
async function signUpStranger(browser: Browser, e: Env, name: string): Promise<Stranger> {
  // The marker's own zip + radius, so the stranger is a plausible neighbour of
  // this family rather than a caller with no relationship at all (the
  // kid-names-privacy pattern).
  const marker = readMarkerMeta()
  const context = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.locator('input[autocomplete="nickname"]').fill(name)
  await page.locator('input[type="email"]').fill(`${name}@gmail.com`)
  await page.locator('input[type="password"]').fill('e2e-watch-1')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('heading', { name: 'Set your location' }).waitFor()
  await page.getByPlaceholder('e.g. 98107').fill(marker.homeZip)
  await page.locator('select').first().selectOption({ label: `${marker.radiusMiles} miles` })
  await page.getByRole('button', { name: /^Continue/ }).click()
  await page.getByRole('heading', { name: 'Near you' }).waitFor()
  const statePath = path.join(os.tmpdir(), `dropin-e2e-${name}.json`)
  await context.storageState({ path: statePath })
  const session = readMarkerSession(statePath)
  return { context, page, userId: session.userId, accessToken: session.accessToken }
}

/**
 * Ask the storage API to SIGN one object, as `asToken`. Returns the status and
 * whether a usable signed URL came back — the assertion that matters, because it
 * is what a caller could actually use and it holds whatever status the refusal
 * happens to carry (the storage API answers a policy denial with a 4xx and an
 * error body, and pinning the exact code would pin an implementation detail
 * rather than the rule).
 */
async function mintSignedUrl(
  e: Env,
  asToken: string,
  bucket: string,
  objectPath: string,
): Promise<{ status: number; signedUrl: string | null; body: string }> {
  const res = await fetch(`${e.url}/storage/v1/object/sign/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: e.anonKey,
      Authorization: `Bearer ${asToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 60 }),
  })
  const body = await res.text()
  let signedUrl: string | null = null
  try {
    const parsed = JSON.parse(body) as { signedURL?: unknown; signedUrl?: unknown }
    const value = parsed.signedURL ?? parsed.signedUrl
    if (typeof value === 'string' && value.includes('token=')) signedUrl = value
  } catch {
    // A refusal body is not JSON-shaped with a URL — that is a refusal.
  }
  return { status: res.status, signedUrl, body: body.slice(0, 300) }
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

/** The marker's `profiles.family_photo_url` as the database holds it. */
async function readStoredFamilyPhoto(e: Env): Promise<string | null | undefined> {
  const res = await fetch(`${e.url}/rest/v1/profiles?id=eq.${e.markerUserId}&select=family_photo_url`, {
    headers: markerHeaders(e),
  })
  if (!res.ok) return undefined
  const rows = (await res.json()) as Array<{ family_photo_url?: string | null }>
  return rows[0]?.family_photo_url
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

/**
 * PATCH one or more profiles fields with the marker's own JWT.
 *
 * THE SPLIT IS LOAD-BEARING, not tidiness: `profiles.family_photo_url` does not
 * exist until 0038 is applied, and PostgREST rejects a PATCH whose payload names
 * an unknown column with 42703 — the WHOLE statement, not just that field. A
 * combined `{ avatar_url, bio, family_photo_url }` cleanup would therefore clear
 * NOTHING pre-apply, silently leaving the bio set and `avatar_url` pointing at a
 * deleted object. So the ticket-only columns go on their own, and a failure there
 * is logged rather than thrown.
 */
const TICKET_ONLY_COLUMNS = ['family_photo_url']

async function markerPatchProfile(e: Env, patch: Record<string, unknown>): Promise<void> {
  const always: Record<string, unknown> = {}
  const ticketOnly: Record<string, unknown> = {}
  for (const [column, value] of Object.entries(patch)) {
    if (TICKET_ONLY_COLUMNS.includes(column)) ticketOnly[column] = value
    else always[column] = value
  }
  const send = async (body: Record<string, unknown>) => {
    if (Object.keys(body).length === 0) return
    const res = await fetch(`${e.url}/rest/v1/profiles?id=eq.${e.markerUserId}`, {
      method: 'PATCH',
      headers: { ...markerHeaders(e, true), Prefer: 'return=representation' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.log(
        `[e2e] profiles PATCH (${Object.keys(body).join(',')}) HTTP ${res.status}: ` +
          `${(await res.text()).slice(0, 160)}`,
      )
    }
  }
  await send(always)
  await send(ticketOnly)
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
const created: {
  /** The private-bucket kid object this run uploaded (its exact key). */
  kidProbePath: string | null
  familyPhotoUploaded: boolean
  avatarUploaded: boolean
} = {
  kidProbePath: null,
  familyPhotoUploaded: false,
  avatarUploaded: false,
}

// ---------------------------------------------------------------------------
// 1. THE CORE PROBE.
// ---------------------------------------------------------------------------
test('the anon probe that found the exposure lists no kid photo — and parent avatars stay public', async () => {
  const e = env()

  // A REAL avatar object, through the real owner policy, so the walk below has
  // something it must see. WITHOUT THIS the probe could pass by finding nothing
  // at all (an empty or unreadable bucket answers `[]` too), which is why the
  // positive half is asserted FIRST and is asserted as a NAME.
  const avatarBytes = makePng(64, 64, 79, 70, 229)
  const avatarRes = await markerUpload(e, AVATARS_BUCKET, `${e.markerUserId}/avatar`, avatarBytes)
  if (!avatarRes.ok) {
    throw new Error(
      `the marker could not upload its own avatar object (HTTP ${avatarRes.status}) — the ` +
        `0011 owner write policy must allow this; the probe below would be vacuous without it`,
    )
  }
  created.avatarUploaded = true
  const publicAvatarUrl = `${e.url}/storage/v1/object/public/${AVATARS_BUCKET}/${e.markerUserId}/avatar`

  // (a) THE POSITIVE HALF OF T5: a parent avatar is still publicly fetchable,
  //     with the anon key alone and no session. This is the "separation, not
  //     lockdown" property the ticket preserved.
  const anonAvatar = await fetch(publicAvatarUrl)
  expect(
    anonAvatar.status,
    'a parent avatar must stay PUBLIC (the ticket keeps avatars exactly as they were)',
  ).toBe(200)

  // (b) The anon walk. Root first: this is the call that enumerated the user
  //     folders and led to the finding.
  const root = await anonList(e, AVATARS_BUCKET, '')
  expect(root.status, 'the avatars bucket must stay publicly LISTABLE (T5)').toBe(200)
  const folders = root.entries.filter((entry) => entry.id === null).map((entry) => entry.name)
  expect(
    folders,
    `the root listing must expose the marker's own folder — without it this probe proves nothing`,
  ).toContain(e.markerUserId)

  // (c) PIVOT A: every exposed folder's `kids` prefix, walked with the anon key.
  const kidObjects: string[] = []
  for (const folder of folders) {
    const listed = await anonList(e, AVATARS_BUCKET, `${folder}/kids`)
    for (const entry of listed.entries) {
      const fullPath = `${folder}/kids/${entry.name}`
      if (isKidPhotoPath(fullPath)) kidObjects.push(fullPath)
    }
  }
  // Asserted as the COUNT plus a masked shape rather than as the raw array: the
  // evidence is "3 objects, all of the `<uid>/kids/<kidId>` shape", and the ids
  // themselves are another family's profile/kid uuids, which have no business in
  // a test log. The unmasked list is the P6 count probe in 0038's header, run by
  // the coordinator in a terminal.
  expect(
    kidObjects.length,
    'PIVOT A: the anonymous probe must find NO kid-photo object in the public ' +
      `'${AVATARS_BUCKET}' bucket. Still listable: ${describePaths(kidObjects)}. ` +
      'The objects leave that bucket only when the coordinator runs migration 0038 and ' +
      'then scripts/migrate-kid-photos.mjs --yes.',
  ).toBe(0)

  // (d) SHAPE CHECK — AND IT IS NOT EVIDENCE (review cycle 1, F7). The fetch
  //     below names an object that has NEVER EXISTED (this spec deliberately never
  //     uploads a kid photo to the public bucket), so it answers a non-200 in every
  //     state — including a deployment where the closure never happened. It is
  //     kept ONLY to pin that the shape this app knows how to build is not served
  //     anonymously, and it is labelled here so nobody reads it as proof. THE REAL
  //     old-URL check needs a key that existed before the move: the coordinator
  //     runs it against a real key from the dry run's output, cache-busted (the
  //     steps are in the builder's report and in 0038's header, F5). The closure's
  //     evidence in THIS spec is PIVOT A above plus (e) below.
  const placeholderKidId = '00000000-0000-4000-8000-000000000000'
  const oldShapeUrl = `${e.url}${LEGACY_PUBLIC_MARKER}${kidPhotoPath(e.markerUserId, placeholderKidId)}`
  const anonOld = await fetch(oldShapeUrl)
  expect(
    anonOld.status,
    `the public kid-photo URL SHAPE must not resolve (shape-only check, not proof of the move): ${oldShapeUrl}`,
  ).not.toBe(200)

  // (e) The NEW home is not anonymously reachable either — no listing, and no
  //     public-URL fetch (the bucket is private, so that endpoint refuses).
  const privateList = await anonList(e, PHOTO_BUCKET, '')
  expect(privateList.entries.length, 'an anon caller must not list the private bucket').toBe(0)
  const anonPrivateKid = await fetch(
    `${e.url}/storage/v1/object/public/${PHOTO_BUCKET}/${kidPhotoPath(e.markerUserId, placeholderKidId)}`,
  )
  expect(anonPrivateKid.status, 'no kid photo may be fetched from a public URL in the private bucket').not.toBe(200)
})

// ---------------------------------------------------------------------------
// 2. THE TWO CLASSES, BY A PAIR OF MINTS.
// ---------------------------------------------------------------------------
test('a signed-in stranger cannot mint a URL for another family’s kid photo — the family can', async ({
  browser,
}) => {
  const e = env()
  const epoch = Math.floor(Date.now() / 1000)
  // The row carries a LEGACY `avatar_url` on purpose: test 3 uses the same row
  // to prove that a SET avatar_url still renders nothing. No bytes are ever put
  // in the public bucket for it.
  const kidId = await createMarkerKid(
    e,
    `E2E Photo ${epoch}`,
    4,
    `${e.url}${LEGACY_PUBLIC_MARKER}${e.markerUserId}/kids/legacy-${epoch}`,
  )
  const objectPath = kidPhotoPath(e.markerUserId, kidId)

  // THE INTENTION, asserted before the wall is probed (the seam is what the app
  // believes; the storage policy is what enforces it).
  expect(kidPhotoVisibility(e.markerUserId, e.markerUserId)).toBe('owner')
  expect(kidPhotoStoredRef(e.markerUserId, kidId)).toBe(`${PHOTO_BUCKET}/${objectPath}`)

  // PIVOT B: the owner's own write into the private bucket.
  const upload = await markerUpload(e, PHOTO_BUCKET, objectPath, makePng(48, 48, 232, 85, 47))
  expect(
    upload.status,
    `PIVOT B: the owner's kid-photo write into '${PHOTO_BUCKET}' must succeed — the ` +
      'bucket exists only once migration 0038 is applied (pre-apply the storage API ' +
      `answers 400). Received HTTP ${upload.status}: ${(await upload.text()).slice(0, 200)}`,
  ).toBe(200)
  created.kidProbePath = objectPath

  // PIVOT C: the FAMILY can still reach the file it kept (the AC's "a signed-URL
  // read by the family still works"). This is also the positive control that
  // makes the stranger's empty answer below evidence.
  const ownMint = await mintSignedUrl(e, e.markerToken, PHOTO_BUCKET, objectPath)
  expect(
    ownMint.signedUrl,
    `PIVOT C: the owner must be able to mint a signed URL for its own kid photo ` +
      `(HTTP ${ownMint.status}): ${ownMint.body}`,
  ).not.toBeNull()

  // THE STRANGER: a fresh, genuinely signed-in account that has no relationship
  // to this family — the case ticket 10's gate is about.
  const stranger = await signUpStranger(browser, e, `e2e-v-photo-${epoch}`)
  try {
    const attempt = await mintSignedUrl(e, stranger.accessToken, PHOTO_BUCKET, objectPath)
    expect(
      attempt.signedUrl,
      'a SIGNED-IN STRANGER must not be able to mint a URL for another family’s kid ' +
        `photo — that would undo ticket 10’s gate through the storage layer. ` +
        `HTTP ${attempt.status}: ${attempt.body}`,
    ).toBeNull()
    // And it must not be able to fetch the object by any other storage-API door.
    const strangerList = await fetch(`${e.url}/storage/v1/object/list/${PHOTO_BUCKET}`, {
      method: 'POST',
      headers: {
        apikey: e.anonKey,
        Authorization: `Bearer ${stranger.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefix: `${e.markerUserId}/kids`, limit: 100 }),
    })
    // BOTH BRANCHES ARE ASSERTED (review cycle 1, F8). This used to check only the
    // 200 case, which meant any refusal — the likeliest answer, 403 — skipped the
    // assertion entirely and the check silently proved nothing. So: a 200 must be
    // EMPTY, and anything else must be a REFUSAL (4xx) rather than a server error
    // (5xx), which would be a real finding rather than a policy saying no.
    if (strangerList.status === 200) {
      const rows = (await strangerList.json()) as unknown[]
      expect(rows.length, 'a stranger must not list another family’s kid photos').toBe(0)
    } else {
      expect(
        strangerList.status,
        'a refused list must be a 4xx refusal, not a server error: ' +
          `${strangerList.status} ${(await strangerList.text()).slice(0, 200)}`,
      ).toBeLessThan(500)
    }
    // The stranger's own profile page still works (the account is a real signed-in
    // viewer, not a broken session) — the check that makes the refusals above
    // mean "denied", not "that caller could do nothing at all".
    await stranger.page.goto(`/u/${encodeURIComponent(e.markerHandle)}`)
    await expect(stranger.page.getByRole('heading', { name: `@${e.markerHandle}` })).toBeVisible()
  } finally {
    await stranger.context.close().catch(() => {})
  }
})

// ---------------------------------------------------------------------------
// 3. NO KID PHOTO RENDERS ON THE VISITOR SURFACE — and the owner's /profile is
//    the one place a kid photo control lives.
// ---------------------------------------------------------------------------
test('a kid row renders no photo on /u/:handle; the owner’s /profile is the one render site', async ({ page }) => {
  const e = env()
  const epoch = Math.floor(Date.now() / 1000)
  const kidName = `E2E NoPhoto ${epoch}`
  // Created AND left in place: the row is what the assertions below read.
  await createMarkerKid(
    e,
    kidName,
    6,
    `${e.url}${LEGACY_PUBLIC_MARKER}${e.markerUserId}/kids/legacy-${epoch}`,
  )

  // V13 ticket 01: the visitor surface (/u/:handle) is the photo-free pin. The
  // kid row is name · age · likes, exactly — no <img>, no photo control. (The
  // old spec pinned this on /settings; the editor moved to /profile, so the
  // photo-free surface is now the visitor page.)
  await page.goto(`/u/${encodeURIComponent(e.markerHandle)}`)
  const publicRow = page.getByTestId('kid-row').first()
  await expect(publicRow).toContainText(kidName)
  await expect(publicRow.locator('img, picture, [role="img"], svg')).toHaveCount(0)
  await expect(page.getByTestId('kid-photo'), 'no kid photo may render on /u/<handle>').toHaveCount(0)

  // THE OWNER'S /PROFILE IS THE ONE RENDER SITE (V12 t04): the row carries its
  // own "Add photo" / tap-to-update control (the crop step), and a SET
  // avatar_url keys the signed-URL render. The row's avatar_url IS set (a
  // legacy public URL, deliberately), so the photo here is evidence that the
  // column gates the render — not that the data is missing. The control is a
  // <label> wrapping a hidden file input (not a <button>), so match by text.
  await page.goto('/profile')
  await settleOnRoute(page, '/profile')
  // The kid name lives in an <input data-testid="kid-name"> (the editor), not as
  // plain text on the <li>, so hasText won't match it. This test creates exactly
  // one kid, so .first() is safe.
  //
  // V15.2 fix: this step used to assert the row's `photo` TEXT was visible. Two
  // things changed underneath it, and neither is a regression:
  //   - V15 ticket 06 (A17–A20) replaced the old visible "Add photo" label with
  //     a TAP-TO-UPDATE avatar (`aria-label="Update photo"`), so the bare text
  //     "photo" no longer exists.
  //   - The control renders only when the kid HAS an uploaded photo
  //     (`kidPhotoUrls[kid.id]` — a signed URL minted from the PRIVATE bucket).
  //     This kid was seeded with a LEGACY PUBLIC `avatar_url` and no uploaded
  //     object, and by design that column no longer drives the render (V9
  //     ticket 11 / V12 t04: private-bucket photos only). The owner row
  //     therefore correctly shows NO photo control.
  //
  // The invariant this spec protects is the PRIVACY line — a kid photo renders
  // on the owner's /profile and NOWHERE else. The visitor half above pins that,
  // and the sibling spec ("the family photo uploads through the crop dialog…")
  // proves the owner-side render with a REAL upload. Asserted here is the honest
  // corollary for a kid whose only photo data is the retired public column: no
  // photo control, but the row is still editable (the name input is present).
  const ownerRow = page.getByTestId('kid-row').first()
  await expect(ownerRow).toBeVisible()
  await expect(ownerRow.getByTestId('kid-name')).toBeVisible()
  await expect(
    ownerRow.getByTestId('kid-photo-trigger'),
    'a legacy public avatar_url must not mint a photo control (the private bucket is the only source)',
  ).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// 4. THE FAMILY PHOTO.
// ---------------------------------------------------------------------------
test('the family photo uploads through the crop dialog and renders on /profile and /u/<handle>', async ({
  page,
  browser,
}) => {
  const e = env()
  const epoch = Math.floor(Date.now() / 1000)
  const png = makePng(400, 300, 232, 85, 47)
  const storedPath = familyPhotoPath(e.markerUserId, 'jpg')

  // V13 ticket 01: the family-photo control MOVED from /settings to /profile
  // (the now-editable "what other families see" view). The crop step + the
  // signed-URL render live here now.
  await page.goto('/profile')
  await settleOnRoute(page, '/profile')

  await page.getByTestId('family-photo-input').setInputFiles({
    name: 'family.png',
    mimeType: 'image/png',
    buffer: png,
  })
  // The crop step opens on the decoded bitmap; accepting its default frame is one
  // tap. Pre-0038 this is where the flow ends in the designed error line instead.
  await page.getByRole('button', { name: 'Use this photo' }).click()
  await expect(
    page.getByText('Family photo updated.'),
    'PIVOT D: the family photo must round-trip — pre-0038 there is no kid-photos ' +
      'bucket and no profiles.family_photo_url column, so the card reports its ' +
      'designed error line instead of a confirmation',
  ).toBeVisible()
  created.familyPhotoUploaded = true

  // (a) It renders, from a SIGNED url in the PRIVATE bucket — never a public one.
  const img = page.getByTestId('family-photo')
  await expect(img).toBeVisible()
  const src = (await img.getAttribute('src')) ?? ''
  expect(src, `the family photo must render from '${PHOTO_BUCKET}'`).toContain(PHOTO_BUCKET)
  expect(src, 'a family photo must never be served from a public object URL').not.toContain(
    '/object/public/',
  )
  expect(src, 'and it must be a SIGNED url').toContain('token=')

  // (b) WHAT THE DATABASE HOLDS is an object PATH, not a URL (T6): a stored URL
  //     is a broken image on a timer.
  const stored = await readStoredFamilyPhoto(e)
  expect(stored, 'profiles.family_photo_url must hold the object path').toBe(storedPath)

  // (c) /u/<handle> renders the same photo. The marker IS the owner, so this is
  //     the self view; the stranger's mint below covers the other viewer class.
  await page.goto(`/u/${encodeURIComponent(e.markerHandle)}`)
  const publicImg = page.getByTestId('family-photo')
  await expect(publicImg).toBeVisible()
  expect((await publicImg.getAttribute('src')) ?? '').toContain('token=')

  // (d) THE FAMILY CLASS IS READABLE BY OTHER SIGNED-IN FAMILIES — that is what
  //     /u/:handle needs — and by nobody anonymous (T4: the photo usually depicts
  //     the children).
  expect(familyPhotoVisibility(e.markerUserId)).toBe('authenticated')
  expect(familyPhotoVisibility(null)).toBe('denied')
  const anonMint = await mintSignedUrl(e, e.anonKey, PHOTO_BUCKET, storedPath)
  expect(anonMint.signedUrl, 'an ANON caller must not be able to mint a family-photo URL').toBeNull()

  const stranger = await signUpStranger(browser, e, `e2e-v-family-${epoch}`)
  try {
    const strangerMint = await mintSignedUrl(e, stranger.accessToken, PHOTO_BUCKET, storedPath)
    expect(
      strangerMint.signedUrl,
      'another signed-in family must be able to mint the family photo (that is how ' +
        `/u/:handle renders it): HTTP ${strangerMint.status}: ${strangerMint.body}`,
    ).not.toBeNull()
    await stranger.page.goto(`/u/${encodeURIComponent(e.markerHandle)}`)
    await expect(
      stranger.page.getByTestId('family-photo'),
      'the family photo must render for another signed-in family on /u/<handle>',
    ).toBeVisible()
  } finally {
    await stranger.context.close().catch(() => {})
  }
})

// ---------------------------------------------------------------------------
// 5. "ABOUT THE PARENTS", and an empty profile.
// ---------------------------------------------------------------------------
test('“About the parents” saves and renders; a profile with none of the blocks still renders cleanly', async ({
  page,
}) => {
  const e = env()
  const epoch = Math.floor(Date.now() / 1000)
  const about = `E2E about ${epoch} — two grown-ups, one small person, a lot of sand.`

  // V13 ticket 01: the bio editor MOVED from /settings to /profile (the
  // "About the parents" card). The autosave machine is the same V12 t01 engine
  // — no Save button anywhere on /profile either, so the typed bio lands on its
  // own once the debounce settles and the indicator says so.
  await page.goto('/profile')
  await settleOnRoute(page, '/profile')
  await expect(page.getByRole('heading', { name: 'About the parents', exact: true })).toBeVisible()
  await page.getByPlaceholder('Who’s in your family, and what are you into? (optional)').fill(about)
  await expect(page.getByTestId('profile-save-note')).toHaveText('Saved.')
  await page.goto(`/u/${encodeURIComponent(e.markerHandle)}`)
  await expect(page.getByText(about)).toBeVisible()

  // EMPTY: clear the description and the kids, then both pages must still look
  // finished — no placeholder, no empty card, no "no photo yet".
  await markerDeleteKids(e)
  await markerPatchProfile(e, { bio: null, family_photo_url: null })
  // The object is deleted by `afterEach`; nulling the column here is what makes
  // the empty render real (and the marker's own row is the only one touched).
  if (created.familyPhotoUploaded) {
    await markerDeleteObject(e, PHOTO_BUCKET, familyPhotoPath(e.markerUserId, 'jpg'))
    created.familyPhotoUploaded = false
  }

  await page.goto('/profile')
  await settleOnRoute(page, '/profile')
  // `exact` matters here: the page's own h1 is "Your family" and the family-photo
  // card's heading is "A photo of your family", so a non-exact name match finds
  // two headings. The editable /profile shows the empty kids line and carries
  // the photo control (V13 ticket 01 re-homed it here from /settings).
  await expect(page.getByRole('heading', { name: 'Your family', exact: true })).toBeVisible()
  await expect(page.getByTestId('family-photo')).toHaveCount(0)
  await expect(page.getByText('No kids yet.')).toBeVisible()
  await expect(page.getByText('Add a family photo', { exact: true })).toBeVisible()

  await page.goto(`/u/${encodeURIComponent(e.markerHandle)}`)
  await expect(page.getByRole('heading', { name: `@${e.markerHandle}` })).toBeVisible()
  await expect(page.getByTestId('family-photo')).toHaveCount(0)
  await expect(page.getByText(about)).toHaveCount(0)
  // The kids card is absent entirely (not an empty "No kids listed." line) —
  // the ticket's "looks finished with none of them".
  await expect(page.getByRole('heading', { name: 'About the kids' })).toHaveCount(0)
})

test.afterEach(async () => {
  // Best-effort cleanup (per ticket): every object THIS spec uploaded, plus the
  // rows it created and the two profile fields it set — all with the marker's own
  // JWT, so nothing here can reach another family's data. Logged, never fatal.
  try {
    const e = env()
    const notes: string[] = []

    const remainingKids = await markerDeleteKids(e)
    notes.push(`marker kid rows deleted: ${remainingKids < 0 ? 'FAILED' : remainingKids}`)
  
    if (created.kidProbePath !== null) {
      const ok = await markerDeleteObject(e, PHOTO_BUCKET, created.kidProbePath)
      notes.push(`kid-photo probe object (${created.kidProbePath.replace(/^[^/]+/, '<uid>')}) deleted: ${ok}`)
      created.kidProbePath = null
    }
    if (created.familyPhotoUploaded) {
      const ok = await markerDeleteObject(e, PHOTO_BUCKET, familyPhotoPath(e.markerUserId, 'jpg'))
      notes.push(`family photo object deleted: ${ok}`)
      created.familyPhotoUploaded = false
    }
    if (created.avatarUploaded) {
      const ok = await markerDeleteObject(e, AVATARS_BUCKET, `${e.markerUserId}/avatar`)
      notes.push(`avatar object deleted: ${ok}`)
      created.avatarUploaded = false
    }
    // The avatar object is gone, so the profile must stop pointing at it (the
    // avatar.e2e.ts discipline) — and the three fields this spec set are cleared.
    await markerPatchProfile(e, { avatar_url: null, family_photo_url: null, bio: null })
    console.log(`[e2e cleanup] ${notes.join('; ')}`)
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${
        err instanceof Error ? err.message : err
      } — the coordinator's sweep owns stragglers; anything left in the PRIVATE ` +
        `bucket is visible to the P6 count probe in 0038's header`,
    )
  }
})
