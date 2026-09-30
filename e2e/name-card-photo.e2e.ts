/**
 * Spec (V28 r2 slice 2): the parent's PHOTO JOINS THE NAME CARD.
 *
 * WHAT CHANGED. V28 r2 slice 1b deleted the standalone "Add a photo" card from
 * the first run (the photo gate left the card sequence with it). Slice 2 re-homes
 * that photo onto the NAME card — the card that CREATES the profiles row. So the
 * crop step now runs BEFORE the row exists: `uploadAvatar`'s storage-object write
 * lands (the owner-scoped policy keys on auth.uid, not the row), but its
 * `profiles.avatar_url` UPDATE matches ZERO rows and PostgREST no-ops a 0-row
 * update SILENTLY (error === null, so `uploadAvatar` does not throw). Without a
 * seam to carry the URL forward, the confirmed photo would be an ORPHANED object
 * in the avatars bucket with the new row's column NULL. This slice adds exactly
 * that seam: the crop step's returned public URL is held in page state
 * (`pendingAvatarUrl`) and handed to `createProfile`'s INSERT (its new optional
 * `avatarUrl` arg), so the row is BORN carrying the column.
 *
 * WHAT THIS SPEC PROVES, precisely (acceptance #1, end-to-end — the db seam has
 * no unit coverage, so this spec IS its sibling test):
 *
 * (1) The name card carries the photo: pick a file → confirm the crop dialog →
 *     the upload runs at confirm ("Uploading…" busy line, then "Photo added").
 * (2) The card still walks: Continue creates the profiles row and lands on the
 *     KIDS card (the photo never gates Continue).
 * (3) The row CARRIES the photo: `profiles.avatar_url` holds the `?v=` URL the
 *     createProfile INSERT wrote (the 0-row uploadAvatar no-op made load-bearing)
 *     AND the object EXISTS in the avatars bucket at `<uid>/avatar`.
 *
 * Viewer pattern (the onboarding-resume one): one DETERMINISTIC viewer
 * (`e2e-ncp-<epoch>` prefix, sweepable by the orchestrator) in a FRESH
 * signed-out context — the default context carries the marker's session, and
 * this spec is about a NEW parent walking the name card. The viewer is left for
 * the sweep (no playdate rows of its own); its avatar object + avatar_url column
 * are best-effort-cleaned after the test (the avatar.e2e.ts convention: logged,
 * never fatal — the sweep's e2e- prefix picks up any stragglers).
 */
import { expect, test, type Browser, type Page } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import { readSessionFromBrowserPage, readSupabaseEnv } from './fixtures'

// --- The dependency-free PNG (solid RGB, 8-bit, non-interlaced) — the
// avatar.e2e.ts fixture, inlined (the repo pattern: each photo spec carries
// its own, a dependency-free node:zlib build). ---

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

function makePng(width: number, height: number, r: number, g: number, b: number): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor (RGB)
  const row = Buffer.alloc(1 + width * 3) // filter byte (0) + RGB pixels
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r
    row[2 + x * 3] = g
    row[3 + x * 3] = b
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

async function freshViewer(browser: Browser) {
  const context = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  return context
}

/**
 * Create the account and land on the NAME card (card 2). This is signUpViewer's
 * first half STOPPED at the name card: the account card is completed (so the
 * name card renders) but the name card itself is left for the test to drive —
 * because this spec is about the photo that now lives on that very card.
 */
async function createAccountToNameCard(
  page: Page,
  options: { email: string; password: string },
): Promise<void> {
  await page.goto('/login')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.locator('input[type="email"]').fill(options.email)
  await page.locator('input[type="password"]').fill(options.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByTestId('first-run-name-card')).toBeVisible()
}

test('the name card photo lands on the profiles row (object in the bucket + avatar_url set)', async ({
  browser,
}) => {
  const context = await freshViewer(browser)
  const page = await context.newPage()

  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-ncp-${epoch}`
  const viewerEmail = `e2e-ncp-${epoch}@gmail.com` // gmail.com: the project rejects example.com
  const viewerPassword = `e2e-ncp-pw-${epoch}` // in-memory only — never written, never committed

  // --- Land on the NAME card (no profiles row yet — this card creates it). ---
  await createAccountToNameCard(page, { email: viewerEmail, password: viewerPassword })

  // Fill the two name fields (the given/family inputs the 17-spec helper drives
  // the same way). The name is the required half; the photo is the optional one.
  const space = viewerName.indexOf(' ')
  const first = space === -1 ? viewerName : viewerName.slice(0, space)
  await page.locator('input[autocomplete="given-name"]').fill(first)

  // --- The PHOTO, re-homed onto this card (slice 2). ---
  // 400x300 (not square): the center-crop must square it before upload, so a
  // missing crop step would store a stretched rectangle the read-back catches.
  const png = makePng(400, 300, 79, 70, 229)
  await page.getByTestId('name-card-photo-input').setInputFiles({
    name: 'parent.png',
    mimeType: 'image/png',
    buffer: png,
  })
  // Confirm the crop dialog — the upload runs HERE (at confirm, before the
  // profiles row exists). "Uploading…" then "Photo added" on the card's own
  // label (the card is not skippable, so there is no Skip control under it).
  await page.getByRole('button', { name: 'Use this photo' }).click()
  await expect(page.getByText('Uploading…')).toBeVisible()
  await expect(page.getByText('Photo added')).toBeVisible()

  // --- Continue creates the profiles row; the photo must ride along. ---
  await page.getByRole('button', { name: /^Continue/ }).click()
  // Lands on the KIDS card (the photo never gates Continue — the card walks).
  await expect(page.getByTestId('first-run-kids-card')).toBeVisible()

  // --- Prove the row CARRIES the photo. ---
  // Read the profile row back with the viewer's OWN JWT (owner policies), then
  // read the object back off the storage API at its bucket path.
  const viewerSession = await readSessionFromBrowserPage(page)
  expect(viewerSession).not.toBeNull()
  const { url, anonKey } = readSupabaseEnv()
  const restHeaders: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${viewerSession!.accessToken}`,
  }

  const profileRes = await fetch(
    `${url}/rest/v1/profiles?id=eq.${viewerSession!.userId}&select=id,display_name,avatar_url`,
    { headers: restHeaders },
  )
  expect(profileRes.ok).toBe(true)
  const profiles = (await profileRes.json()) as Array<{
    id: string
    display_name: string
    avatar_url: string | null
  }>
  expect(profiles).toHaveLength(1)
  const row = profiles[0]
  // The column is SET on the row this run just created — the 0-row no-op's
  // payoff. It is a versioned public URL (the crop step's `?v=` cache-bust).
  expect(row.avatar_url).not.toBeNull()
  expect(row.avatar_url).toContain(`/avatars/${viewerSession!.userId}/avatar`)
  expect(row.avatar_url).toMatch(/\?v=\d+$/)

  // The object EXISTS in the avatars bucket at the owner-scoped path (an
  // owner-JWT read — the write policy's mirror). A 200 proves the object is
  // there, not just that the column points somewhere.
  const objectRes = await fetch(`${url}/storage/v1/object/avatars/${viewerSession!.userId}/avatar`, {
    headers: restHeaders,
  })
  expect(objectRes.status, 'the avatars bucket object must exist').toBe(200)
  expect(objectRes.headers.get('content-type')).toContain('image/jpeg')

  // --- Best-effort cleanup (the avatar.e2e.ts convention): delete the object,
  // null the column. The viewer account itself is left for the sweep. Logged,
  // never fatal. ---
  try {
    await fetch(`${url}/storage/v1/object/avatars/${viewerSession!.userId}/avatar`, {
      method: 'DELETE',
      headers: restHeaders,
    })
    await fetch(`${url}/rest/v1/profiles?id=eq.${viewerSession!.userId}`, {
      method: 'PATCH',
      headers: { ...restHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ avatar_url: null }),
    })
    console.log(`[e2e cleanup] ok — deleted ${viewerSession!.userId}'s avatar object + nulled avatar_url`)
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${
        err instanceof Error ? err.message : err
      } — orchestrator sweep (e2e- prefix) will pick stragglers up`,
    )
  }

  await context.close()
})