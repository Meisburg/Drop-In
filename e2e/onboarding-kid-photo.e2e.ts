/**
 * Spec (V28 r2 slice 3): the onboarding KIDS card's OPTIONAL kid photos.
 *
 * WHAT CHANGED. The kids card (first run, card 3) got a photo control on each
 * kid row. The shape the ordering decided (brief's mandate): the row is
 * written at the crop step's CONFIRM — `useCropStep` closes the bitmap in its
 * `finally` the moment `onConfirm` resolves, so there is no "crop now, upload
 * later", and `uploadKidPhoto` needs a persisted kid id. The card used to
 * DISCARD `addKid`'s return value; the slice keeps it (the row's `kid`), so:
 *
 * (1) a photo picked on a row lands in the PRIVATE `kid-photos` bucket at the
 *     canonical `<uid>/kids/<kidId>` path, the row's `avatar_url` is set to
 *     the bucket-qualified object path, and the row RENDERS through the
 *     signed URL (`useKidPhotoUrls`) — never the raw column;
 * (2) the photo is OPTIONAL — a kid without one walks the card exactly as
 *     before;
 * (3) NEITHER DIRECTION ORPHANS: the photo is never attached to a row that
 *     does not exist (addKid first), and a row written at confirm is
 *     remembered — Continue never writes it twice, and Remove removes the
 *     REAL row (today's Remove only dropped local state; the leak a parent
 *     "deleted" a kid who still existed in the DB);
 * (4) a failed UPLOAD still keeps the written row (Continue skips it, Remove
 *     deletes it) — the error is honest and the card stays usable.
 *
 * WHAT THIS SPEC PROVES, precisely:
 *   test 1 — a kid WITH a photo + a kid WITHOUT one, Continue → the DB holds
 *            EXACTLY those two rows (no double-write of the persisted row),
 *            the photo kid's `avatar_url` is the stored ref and the object
 *            EXISTS in `kid-photos`, the no-photo kid's column is NULL, and
 *            the photo rendered on the card from a SIGNED URL;
 *   test 2 — the CONVERSE: a photo-confirmed row, then Remove → the DB row
 *            is gone (the local-state-only removal this slice replaces would
 *            have left it behind).
 *
 * Viewer pattern (the onboarding-resume one): one DETERMINISTIC viewer
 * (`e2e-okp-<epoch>` prefix, sweepable by the orchestrator) in a FRESH
 * signed-out context — this spec is about a NEW parent walking the kids card.
 * The viewer account is left for the sweep; its kids rows + kid-photo
 * objects are best-effort-cleaned after each test (logged, never fatal —
 * the sweep's e2e- prefix picks up stragglers).
 */
import { expect, test, type Browser, type Page } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import { readSessionFromBrowserPage, readSupabaseEnv } from './fixtures'

// --- The dependency-free PNG (solid RGB, 8-bit, non-interlaced) — the
// repo's photo-spec fixture, inlined (each photo spec carries its own). ---

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
 * Create the account and land on the KIDS card (card 3 of 4): the account
 * card is completed, the name card is filled (given name only — the photo
 * on that card is optional and not this spec's subject) and continued, so
 * the kids card renders with its "Add a kid" button.
 */
async function createAccountToKidsCard(
  page: Page,
  options: { email: string; password: string; givenName: string },
): Promise<void> {
  await page.goto('/login')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.locator('input[type="email"]').fill(options.email)
  await page.locator('input[type="password"]').fill(options.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByTestId('first-run-name-card')).toBeVisible()
  await page.locator('input[autocomplete="given-name"]').fill(options.givenName)
  await page.getByRole('button', { name: /^Continue/ }).click()
  await expect(page.getByTestId('first-run-kids-card')).toBeVisible()
}

/** The owner's own-JWT read headers (the owner-scoped kid + storage policies). */
function ownerHeaders(token: string, anonKey: string): Record<string, string> {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
  }
}

interface KidRowDb {
  id: string
  first_name: string | null
  age: number | null
  avatar_url: string | null
}

async function readKidsDb(
  url: string,
  headers: Record<string, string>,
  profileId: string,
): Promise<KidRowDb[]> {
  const res = await fetch(
    `${url}/rest/v1/kids?profile_id=eq.${profileId}&select=id,first_name,age,avatar_url`,
    { headers },
  )
  expect(res.ok, `the owner's kids read must succeed (HTTP ${res.status})`).toBe(true)
  return (await res.json()) as KidRowDb[]
}

test('a kid added with a photo lands in kid-photos and Continue never double-writes it', async ({
  browser,
}) => {
  const context = await freshViewer(browser)
  const page = await context.newPage()

  const epoch = Math.floor(Date.now() / 1000)
  const viewerEmail = `e2e-okp-${epoch}@gmail.com` // gmail.com: the project rejects example.com
  const viewerPassword = `e2e-okp-pw-${epoch}` // in-memory only — never written, never committed

  // --- Land on the KIDS card. ---
  await createAccountToKidsCard(page, {
    email: viewerEmail,
    password: viewerPassword,
    givenName: `e2e-okp-${epoch}`,
  })

  // --- The photo kid (row 0): name + age + photo. ---
  await page.getByRole('button', { name: 'Add a kid' }).click()
  await page.locator('input[placeholder="First name"]').first().fill('Avery')
  await page.locator('input[placeholder="Age"]').first().fill('8')

  // 400x300 (not square): the crop step squares it before upload.
  const png = makePng(400, 300, 79, 70, 229)
  await page.getByTestId('kid-row-photo-input-0').setInputFiles({
    name: 'avery.png',
    mimeType: 'image/png',
    buffer: png,
  })
  // THE WRITE: confirm runs addKid (the row) → uploadKidPhoto (the object),
  // before the crop step's `finally` releases the bitmap. The photo then
  // renders from the SIGNED URL the page mints (kid photos are private).
  await page.getByRole('button', { name: 'Use this photo' }).click()
  const img = page.getByTestId('kid-row-photo-img-0')
  await expect(img, 'the confirmed photo must render on the row').toBeVisible()
  const imgSrc = (await img.getAttribute('src')) ?? ''
  expect(imgSrc, 'a kid photo must render from the kid-photos bucket').toContain('kid-photos')
  expect(imgSrc, 'a kid photo must never be served from a public object URL').not.toContain(
    '/object/public/',
  )
  expect(imgSrc, 'and it must be a SIGNED url').toContain('token=')
  // The URL is not just shaped right — it loads (the bare GET the browser's
  // <img> does is the signed-URL contract).
  const fetched = await fetch(imgSrc)
  expect(fetched.status, `the signed kid-photo URL must be fetchable (HTTP ${fetched.status})`).toBe(
    200,
  )

  // --- The no-photo kid (row 1): the photo stays OPTIONAL, the row walks
  //     the card exactly as before. ---
  await page.getByRole('button', { name: 'Add another kid' }).click()
  await page.locator('input[placeholder="First name"]').nth(1).fill('Blair')
  await page.locator('input[placeholder="Age"]').nth(1).fill('6')

  // --- Continue: lands on the area card, writing ONLY the row that has no
  //     persisted id (the photo kid was written at its confirm). ---
  await page.getByRole('button', { name: /^Continue/ }).click()
  await expect(page.getByTestId('first-run-area-card')).toBeVisible()

  // --- Prove the database: EXACTLY two rows (no double-write of the
  //     persisted row), the photo kid's column IS the stored ref, the
  //     no-photo kid's is NULL. ---
  const viewerSession = await readSessionFromBrowserPage(page)
  expect(viewerSession).not.toBeNull()
  const { url, anonKey } = readSupabaseEnv()
  const headers = ownerHeaders(viewerSession!.accessToken, anonKey)
  const kids = await readKidsDb(url, headers, viewerSession!.userId)
  expect(kids, 'Continue must have written exactly the two rows shown on the card').toHaveLength(2)
  const photoKid = kids.find((k) => k.first_name === 'Avery')
  expect(photoKid, 'the photo kid must exist').toBeDefined()
  // The stored ref: the BUCKET-QUALIFIED object path (never a URL — signed
  // URLs expire; the column holds the path, the render mints).
  expect(photoKid!.avatar_url).toBe(`kid-photos/${viewerSession!.userId}/kids/${photoKid!.id}`)
  const noPhotoKid = kids.find((k) => k.first_name === 'Blair')
  expect(noPhotoKid, 'the no-photo kid must exist').toBeDefined()
  expect(noPhotoKid!.avatar_url, 'a kid without a photo carries a NULL column').toBeNull()

  // The object EXISTS in the kid-photos bucket at the canonical path (an
  // owner-JWT read — the write policy's mirror). A 200 proves the object is
  // there, not just that the column points somewhere.
  const objectRes = await fetch(
    `${url}/storage/v1/object/kid-photos/${viewerSession!.userId}/kids/${photoKid!.id}`,
    { headers },
  )
  expect(objectRes.status, 'the kid-photos object must exist').toBe(200)
  expect(objectRes.headers.get('content-type')).toContain('image/jpeg')

  // --- Best-effort cleanup (the photo-spec convention): delete the object +
  //     both kid rows. The viewer account itself is left for the sweep.
  //     Logged, never fatal. ---
  try {
    await fetch(`${url}/storage/v1/object/kid-photos/${viewerSession!.userId}/kids/${photoKid!.id}`, {
      method: 'DELETE',
      headers,
    })
    for (const kid of kids) {
      await fetch(`${url}/rest/v1/kids?id=eq.${kid.id}`, { method: 'DELETE', headers })
    }
    console.log(`[e2e cleanup] ok — deleted ${viewerSession!.userId}'s kid rows + kid-photo object`)
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${
        err instanceof Error ? err.message : err
      } — orchestrator sweep (e2e- prefix) will pick stragglers up`,
    )
  }

  await context.close()
})

test('removing a photo-confirmed row removes the REAL row (not just the local state)', async ({
  browser,
}) => {
  const context = await freshViewer(browser)
  const page = await context.newPage()

  const epoch = Math.floor(Date.now() / 1000)
  const viewerEmail = `e2e-okp-rm-${epoch}@gmail.com`
  const viewerPassword = `e2e-okp-rm-pw-${epoch}`

  // --- Land on the KIDS card; one photo kid. ---
  await createAccountToKidsCard(page, {
    email: viewerEmail,
    password: viewerPassword,
    givenName: `e2e-okp-rm-${epoch}`,
  })
  await page.getByRole('button', { name: 'Add a kid' }).click()
  await page.locator('input[placeholder="First name"]').first().fill('Cleo')
  await page.locator('input[placeholder="Age"]').first().fill('5')
  await page.getByTestId('kid-row-photo-input-0').setInputFiles({
    name: 'cleo.png',
    mimeType: 'image/png',
    buffer: makePng(400, 300, 229, 79, 70),
  })
  await page.getByRole('button', { name: 'Use this photo' }).click()
  await expect(page.getByTestId('kid-row-photo-img-0'), 'the confirmed photo must render').toBeVisible()

  // The row is REAL at this point (written at the photo's confirm) — prove
  // it before removing it, so "gone after" cannot pass vacuously.
  const viewerSession = await readSessionFromBrowserPage(page)
  expect(viewerSession).not.toBeNull()
  const { url, anonKey } = readSupabaseEnv()
  const headers = ownerHeaders(viewerSession!.accessToken, anonKey)
  const before = await readKidsDb(url, headers, viewerSession!.userId)
  expect(before, 'the photo-confirmed row must be a real DB row').toHaveLength(1)

  // --- Remove it. The local state drops only AFTER the delete lands (a
  //     failed removal keeps the row + shows the error), so the row leaving
  //     the DOM is the signal the delete is done. ---
  await page.getByRole('button', { name: 'Remove' }).click()
  await expect(
    page.getByRole('button', { name: 'Add a kid' }),
    'the card is empty again — the local row dropped with the delete',
  ).toBeVisible()

  // THE CONVERSE DIRECTION: the database is empty. A local-state-only
  // removal (what the card did before this slice) would have left the row
  // behind — the leak a parent "deleted" a kid who still existed.
  const after = await readKidsDb(url, headers, viewerSession!.userId)
  expect(after, 'Remove must delete the real row, not just the local state').toHaveLength(0)

  // --- Best-effort cleanup: the row is already gone; delete the object
  //     (the orphaned half of the removed kid). Logged, never fatal. ---
  try {
    const orphaned = before[0]
    const objectPath = orphaned.avatar_url
    if (objectPath !== null && objectPath !== '') {
      await fetch(`${url}/storage/v1/object/${objectPath}`, { method: 'DELETE', headers })
    }
    console.log(`[e2e cleanup] ok — deleted ${viewerSession!.userId}'s orphaned kid-photo object`)
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${
        err instanceof Error ? err.message : err
      } — orchestrator sweep (e2e- prefix) will pick stragglers up`,
    )
  }

  await context.close()
})