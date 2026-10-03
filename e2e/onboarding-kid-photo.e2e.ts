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
 * Fix round 1 (this spec grew to pin the fixes):
 *   F1 — a name-only row (blank age) with a confirmed photo is REFUSED, not
 *        fabricated into an age-0 kid (`Number('')` is 0, and 0 is a legal
 *        age), and a fully-blank row with a photo is skipped (mirrored from
 *        the card's own blank-row rule). Neither writes anything.
 *   F2/F5 — a persisted row removed from a NON-empty list re-indexes the
 *        rows beneath it; the writes are keyed on the row's STABLE identity
 *        (never the array index) and the crop-step lock is released on a
 *        row's unmount, so Continue can never be stranded. (The literal
 *        "remove while the crop dialog is open" click is UI-unreachable —
 *        the dialog is a full-viewport overlay — so these tests pin the
 *        reachable consequence: the state after the list shrinks.)
 *   F3 — typing in a non-persisted row must not re-mint the other rows'
 *        signed URLs (the `persistedKids` memo is keyed on the id set, not
 *        the row array) — test 1 counts the sign requests around a typed
 *        row and asserts the settled photo never blanks.
 *
 * Fix round 2 (the regression round — fix round 1's keying was reviewed by
 * `ocr` and found to have killed a refresh):
 *   R1 — a re-pick on a PERSISTED row must re-mint and the card must show
 *        the NEW image. `uploadKidPhoto` writes the DETERMINISTIC stored ref
 *        (`kidPhotoStoredRef(uid, kidId)`), so a re-pick leaves the id, the
 *        photo marker, AND the `avatar_url` string all unchanged — a key
 *        that stopped at the id set cannot see NEW BYTES at the same path,
 *        and the freshly uploaded photo (which OVERWROTE the canonical
 *        path) would stay invisible for the rest of the mount. The key now
 *        carries a per-row `photoGen` (bumped on the re-pick), and test 5
 *        pins the fresh mint + the src swap. (8b also owns the F3 test's
 *        flake window and the inert eslint-disable — not this round.)
 *
 * WHAT THIS SPEC PROVES, precisely:
 *   test 1 — a kid WITH a photo + a kid WITHOUT one, Continue → the DB holds
 *            EXACTLY those two rows (no double-write of the persisted row),
 *            the photo kid's `avatar_url` is the stored ref and the object
 *            EXISTS in `kid-photos`, the no-photo kid's column is NULL, and
 *            the photo rendered on the card from a SIGNED URL that stays
 *            put (no blank, no re-mint) while a second row is typed;
 *   test 2 — the CONVERSE: a photo-confirmed row, then Remove → the DB row
 *            is gone (the local-state-only removal this slice replaces would
 *            have left it behind);
 *   test 3 — F1: a BLANK row's photo is skipped (no error, no write) and a
 *            NAME-ONLY row's photo is refused with the card's own
 *            validation message (no write) — Continue is held by the same
 *            error, and the DB stays empty;
 *   test 4 — F2/F5: a persisted row removed from a NON-EMPTY list (the row
 *            beneath it re-indexes) → the survivor is intact, Continue is
 *            enabled (the lock is not stranded), and the DB holds exactly
 *            the survivor;
 *   test 5 — R1: a re-picked photo on a PERSISTED row (photo B over photo
 *            A, same canonical path) → a FRESH signed-URL mint fires, the
 *            card's src swaps to the new URL (the <img> re-fetches), and
 *            the object's BYTES at the unchanged path are the new image —
 *            the regression the fix round 1 keying introduced, pinned so it
 *            cannot come back silently.
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
  //     the card exactly as before. Fix round 1 (F3): count the signed-URL
  //     mints DURING THE KEYSTROKES — the kids mint hits /object/sign/
  //     kid-photos. Pre-fix (the memo keyed on `kidRows`) every keystroke
  //     re-minted and the settled photo's src swapped to the fresh URL each
  //     time (measured: it never BLANKED — the new URL is valid for the
  //     same object — but the <img> reloaded on every keystroke). Post-fix
  //     keystrokes produce ZERO mints and the src stays put. (The "Add
  //     another kid" click itself still triggers ONE mint — the shared
  //     hook's effect is keyed on the ids array's identity, which a row add
  //     changes even though the id SET is unchanged; that is the residual,
  //     not the keystroke path.) ---
  const signRequests: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('/object/sign/')) signRequests.push(req.url())
  })
  await page.getByRole('button', { name: 'Add another kid' }).click()
  // Let the post-add mint settle (post-fix: exactly one) and the src
  // re-settle to the post-mint URL, so the window below measures KEYSTROKES
  // only.
  await page.waitForTimeout(800)
  await expect(img, 'the persisted photo must not blank when a second row is added').toBeVisible()
  const srcAfterAdd = (await img.getAttribute('src')) ?? ''

  // Type one character at a time: each keystroke is a fresh `kidRows`
  // array — exactly the re-mint vector the F3 memo-keying fix removes.
  const mintsBeforeKeystrokes = signRequests.length
  const noPhotoName = page.locator('input[placeholder="First name"]').nth(1)
  await noPhotoName.click()
  for (const ch of ['B', 'l', 'a', 'i', 'r']) await page.keyboard.press(ch)
  const noPhotoAge = page.locator('input[placeholder="Age"]').nth(1)
  await noPhotoAge.click()
  await page.keyboard.press('6')

  expect(
    signRequests.length - mintsBeforeKeystrokes,
    'keystrokes must not re-mint the other rows’ signed URLs (F3: the memo is keyed on the id set, not the row array)',
  ).toBe(0)
  await expect(
    img,
    'the persisted photo must not blank while a second row is typed (measured: pre-fix it never blanked either — the swap was the symptom)',
  ).toBeVisible()
  // The mint count above is the evidence; this equality only AGREES with it.
  // A Supabase signed-URL token is SECOND-GRANULAR — its payload is
  // `{url, scope, iat, exp}` with whole-second timestamps and nothing else
  // varying per mint (decode any token from DevTools to check the shape) —
  // so two mints of the same path inside one second return BYTE-IDENTICAL
  // bytes. This assertion therefore cannot see a re-mint the count catches.
  expect(
    (await img.getAttribute('src')) ?? '',
    'the settled signed URL stays put across keystrokes — corroboration of the mint-count assertion above, which is the evidence (the count catches a re-mint however the URL fell); this equality alone could not: a signed-URL token is second-granular, so a same-second re-mint is byte-identical',
  ).toBe(srcAfterAdd)

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

test(
  'fix round 1 (F1): a blank row’s photo is skipped and a name-only row’s is refused — neither writes anything',
  async ({ browser }) => {
    const context = await freshViewer(browser)
    const page = await context.newPage()

    const epoch = Math.floor(Date.now() / 1000)
    const viewerEmail = `e2e-okp-blank-${epoch}@gmail.com`
    const viewerPassword = `e2e-okp-blank-pw-${epoch}`

    // --- Land on the KIDS card; row 0 is left FULLY BLANK, then given a
    //     photo. Mirrored from the card’s own rule (invalidKidRows): a
    //     blank row is SKIPPED, not written, not errored. ---
    await createAccountToKidsCard(page, {
      email: viewerEmail,
      password: viewerPassword,
      givenName: `e2e-okp-blank-${epoch}`,
    })
    await page.getByRole('button', { name: 'Add a kid' }).click()
    await page.getByTestId('kid-row-photo-input-0').setInputFiles({
      name: 'blank.png',
      mimeType: 'image/png',
      buffer: makePng(400, 300, 79, 229, 70),
    })
    await page.getByRole('button', { name: 'Use this photo' }).click()
    // The confirm silently skipped the blank row: no error, and the row is
    // NOT frozen (nothing was persisted for it).
    await expect(page.getByTestId('first-run-kids-card').getByRole('alert')).toHaveCount(0)
    await expect(page.locator('input[placeholder="First name"]').first()).toBeEnabled()
    await expect(
      page.getByTestId('kid-row-photo-img-0'),
      'a skipped row renders no photo (nothing was written, nothing to mint)',
    ).toBeHidden()

    // --- Row 1: NAME ONLY (the F1 trap — `Number('')` is 0, and 0 is a
    //     LEGAL age, so a photo-confirmed name-only row must be REFUSED,
    //     not fabricated into an age-0 kid). ---
    await page.getByRole('button', { name: 'Add another kid' }).click()
    await page.locator('input[placeholder="First name"]').nth(1).fill('Dana')
    await page.getByTestId('kid-row-photo-input-1').setInputFiles({
      name: 'dana.png',
      mimeType: 'image/png',
      buffer: makePng(400, 300, 229, 79, 70),
    })
    await page.getByRole('button', { name: 'Use this photo' }).click()
    await expect(
      page.getByTestId('first-run-kids-card').getByRole('alert'),
      'the name-only row must be refused with the card’s own validation message',
    ).toHaveText(/Age must be a whole number from 0 to 17/)

    // --- Continue is held by the SAME error (the pure seam the card
    //     always used), and the card stays on screen. ---
    await page.getByRole('button', { name: /^Continue/ }).click()
    await expect(page.getByTestId('first-run-kids-card')).toBeVisible()
    await expect(page.getByTestId('first-run-area-card')).toBeHidden()

    // --- The database: NEITHER row was written (the uploads never ran —
    //     validation precedes addKid, and addKid precedes the upload). ---
    const viewerSession = await readSessionFromBrowserPage(page)
    expect(viewerSession).not.toBeNull()
    const { url, anonKey } = readSupabaseEnv()
    const headers = ownerHeaders(viewerSession!.accessToken, anonKey)
    const kids = await readKidsDb(url, headers, viewerSession!.userId)
    expect(kids, 'the blank row and the name-only row must not be written').toHaveLength(0)

    // Nothing to clean up (no rows, no objects) — the viewer account is
    // left for the e2e- prefix sweep, as always.
    console.log(`[e2e cleanup] nothing written — ${viewerSession!.userId} left for the sweep`)

    await context.close()
  },
)

test(
  'fix round 1 (F2/F5): a persisted row removed from a non-empty list leaves the survivor intact and Continue un-stranded',
  async ({ browser }) => {
    const context = await freshViewer(browser)
    const page = await context.newPage()

    const epoch = Math.floor(Date.now() / 1000)
    const viewerEmail = `e2e-okp-shift-${epoch}@gmail.com`
    const viewerPassword = `e2e-okp-shift-pw-${epoch}`

    // --- Land on the KIDS card: row 0 PERSISTED (photo-confirmed), row 1
    //     plain. (The literal "remove while the crop dialog is open" click
    //     is UI-unreachable — the dialog is a full-viewport overlay and the
    //     holder’s own Remove is disabled — so this pins the reachable
    //     consequence: the list shrinks with a persisted row above a plain
    //     one, the survivor re-indexes, and the lock must not strand.) ---
    await createAccountToKidsCard(page, {
      email: viewerEmail,
      password: viewerPassword,
      givenName: `e2e-okp-shift-${epoch}`,
    })
    await page.getByRole('button', { name: 'Add a kid' }).click()
    await page.locator('input[placeholder="First name"]').first().fill('Faye')
    await page.locator('input[placeholder="Age"]').first().fill('7')
    await page.getByTestId('kid-row-photo-input-0').setInputFiles({
      name: 'faye.png',
      mimeType: 'image/png',
      buffer: makePng(400, 300, 70, 229, 79),
    })
    await page.getByRole('button', { name: 'Use this photo' }).click()
    const fayeImg = page.getByTestId('kid-row-photo-img-0')
    await expect(fayeImg, 'the confirmed photo must render on the row').toBeVisible()

    // Capture Faye’s row BEFORE her removal (test 2’s convention): the
    // stored ref is how the best-effort cleanup reaches her ORPHANED
    // object later — once her row is deleted, the column is gone with it.
    const viewerSession = await readSessionFromBrowserPage(page)
    expect(viewerSession).not.toBeNull()
    const { url, anonKey } = readSupabaseEnv()
    const headers = ownerHeaders(viewerSession!.accessToken, anonKey)
    const fayeBefore = await readKidsDb(url, headers, viewerSession!.userId)
    expect(fayeBefore, 'the photo-confirmed row must be a real DB row').toHaveLength(1)
    const fayeRef = fayeBefore[0].avatar_url

    // The plain row beneath it.
    await page.getByRole('button', { name: 'Add another kid' }).click()
    await page.locator('input[placeholder="First name"]').nth(1).fill('Eli')
    await page.locator('input[placeholder="Age"]').nth(1).fill('4')

    // --- Remove the PERSISTED row (row 0) — a real `removeKid`, and Eli
    //     re-indexes from 1 to 0. The F2 writes are keyed on the row’s
    //     stable identity (never the array index), and F5’s unmount
    //     cleanup releases Faye’s lock as her row leaves the tree. ---
    await page.getByRole('button', { name: 'Remove' }).first().click()
    await expect(
      page.locator('input[placeholder="First name"]').first(),
      'the survivor must be intact at its new (re-indexed) position',
    ).toHaveValue('Eli')

    // --- THE PIN: Continue is enabled — the crop-step lock did not strand
    //     (a stranded key would leave the card’s Continue disabled for
    //     the rest of the mount, with no dialog open to release it). ---
    await expect(
      page.getByRole('button', { name: /^Continue/ }),
      'the lock must not strand Continue after a persisted row is removed',
    ).toBeEnabled()

    // Continue writes ONLY the plain row (Faye was persisted at her
    // confirm, and she was just removed).
    await page.getByRole('button', { name: /^Continue/ }).click()
    await expect(page.getByTestId('first-run-area-card')).toBeVisible()

    // --- The database: EXACTLY the survivor. Faye is gone (the real row
    //     was deleted, not just dropped from local state), Eli was written
    //     exactly once (no double-write of the removed row’s id, no
    //     stray write of a re-indexed index). ---
    const kids = await readKidsDb(url, headers, viewerSession!.userId)
    expect(kids, 'the DB must hold exactly the survivor').toHaveLength(1)
    expect(kids[0].first_name).toBe('Eli')
    expect(kids[0].avatar_url, 'the plain survivor carries a NULL column').toBeNull()

    // --- Best-effort cleanup: delete Faye’s ORPHANED object (her row is
    //     gone; the object outlives it) + the survivor’s row. Logged,
    //     never fatal. ---
    try {
      if (fayeRef !== null && fayeRef !== '') {
        await fetch(`${url}/storage/v1/object/${fayeRef}`, { method: 'DELETE', headers })
      }
      for (const kid of kids) {
        await fetch(`${url}/rest/v1/kids?id=eq.${kid.id}`, { method: 'DELETE', headers })
      }
      console.log(
        `[e2e cleanup] ok — deleted ${viewerSession!.userId}’s survivor kid row + Faye’s orphaned object`,
      )
    } catch (err) {
      console.log(
        `[e2e cleanup] FAILED (logged, best-effort): ${
          err instanceof Error ? err.message : err
        } — orchestrator sweep (e2e- prefix) will pick stragglers up`,
      )
    }

    await context.close()
  },
)


test(
  'fix round 2 (R1): a re-picked photo on a persisted row re-mints and the card shows the NEW image',
  async ({ browser }) => {
    const context = await freshViewer(browser)
    const page = await context.newPage()

    const epoch = Math.floor(Date.now() / 1000)
    const viewerEmail = `e2e-okp-repick-${epoch}@gmail.com`
    const viewerPassword = `e2e-okp-repick-pw-${epoch}`

    await createAccountToKidsCard(page, {
      email: viewerEmail,
      password: viewerPassword,
      givenName: `e2e-okp-repick-${epoch}`,
    })
    await page.getByRole('button', { name: 'Add a kid' }).click()
    await page.locator('input[placeholder="First name"]').first().fill('Avery')
    await page.locator('input[placeholder="Age"]').first().fill('8')

    // First pick (photo A) — the row is PERSISTED at its confirm (the
    // re-pick branch the regression hit requires a persisted row).
    const pngA = makePng(400, 300, 79, 70, 229)
    await page.getByTestId('kid-row-photo-input-0').setInputFiles({
      name: 'avery.png',
      mimeType: 'image/png',
      buffer: pngA,
    })
    await page.getByRole('button', { name: 'Use this photo' }).click()
    const img = page.getByTestId('kid-row-photo-img-0')
    await expect(img, 'the confirmed photo must render on the row').toBeVisible()
    const srcBefore = (await img.getAttribute('src')) ?? ''
    expect(srcBefore, 'the photo must render from a signed URL').toContain('token=')

    // Session + DB: the row is persisted at the DETERMINISTIC canonical
    // path — the ref the re-pick will overwrite in place.
    const viewerSession = await readSessionFromBrowserPage(page)
    expect(viewerSession, 'the onboarding page must have a live session').not.toBeNull()
    const { url, anonKey } = readSupabaseEnv()
    const headers = ownerHeaders(viewerSession!.accessToken, anonKey)
    const rows = await readKidsDb(url, headers, viewerSession!.userId)
    expect(rows).toHaveLength(1)
    const row = rows[0]
    const storedRef = row.avatar_url
    expect(storedRef, 'the stored ref is the deterministic canonical path (kidPhotoStoredRef)').toBe(
      `kid-photos/${viewerSession!.userId}/kids/${row.id}`,
    )
    // The object's FIRST bytes — the re-pick OVERWRITES this exact path, so
    // "new bytes at the same path" is proven by the AFTER read.
    const objectA = Buffer.from(await (await fetch(`${url}/storage/v1/object/${storedRef}`, { headers })).arrayBuffer())

    // --- THE RE-PICK (photo B, different pixels) on the SAME persisted row.
    // The stored ref is deterministic, so the write lands at the SAME
    // canonical path — only the per-row generation can carry "the image
    // changed" to the minting hook.
    //
    // ⚠️ CROSS THE TOKEN'S SECOND BOUNDARY FIRST (measured here: the two
    // mints landed 1057 ms apart — 57 ms of margin — because a Supabase
    // signed-URL token is second-granular, `src` can only be seen to swap
    // when the two mints fall in different seconds; a faster run mints the
    // SAME bytes and the swap assertion below false-fails. The wait makes the
    // swap observable, so the assertion fails only for the reason it names
    // (no fresh mint), never for a clock boundary.
    await page.waitForTimeout(1100)
    const signRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/object/sign/')) signRequests.push(req.url())
    })
    const pngB = makePng(400, 300, 229, 79, 70)
    await page.getByTestId('kid-row-photo-input-0').setInputFiles({
      name: 'avery-v2.png',
      mimeType: 'image/png',
      buffer: pngB,
    })
    const mintsBeforeConfirm = signRequests.length
    await page.getByRole('button', { name: 'Use this photo' }).click()

    // THE PIN: a re-pick must fire a FRESH signed-URL mint (a new sign
    // request) and the card must swap to the NEW image (the <img> re-fetches
    // under the fresh URL). If the key went back to ignoring the re-pick —
    // id set + photo marker only, no generation — the `avatar_url` string
    // is byte-identical, the memo keeps its identity, the hook's effect
    // never re-runs, no sign request fires, and the src never swaps: the
    // freshly uploaded photo (which overwrote the canonical path) stays
    // invisible for the rest of the mount. Both assertions below would
    // fail against the regressed key.
    await expect(
      async () => {
        expect(
          signRequests.length,
          'a re-pick on a persisted row must trigger a fresh signed-URL mint',
        ).toBeGreaterThan(mintsBeforeConfirm)
      },
      'the fresh mint (the one the regressed keying never fires) must land',
    ).toPass()
    await expect(
      async () => {
        expect(
          (await img.getAttribute('src')) ?? '',
          'the card must show the NEW image — the src swaps to the fresh URL (corroboration of the fresh-mint count above, not its proof: a signed-URL token is second-granular, so a fresh mint inside the same second as the stale one is byte-identical and the swap is unobservable; the count is the evidence)',
        ).not.toBe(srcBefore)
      },
      'the img must re-fetch under the fresh URL',
    ).toPass()
    const srcAfter = (await img.getAttribute('src')) ?? ''
    expect(srcAfter, 'the swapped src must be a fresh signed URL').toContain('token=')

    // New bytes at the SAME canonical path: the object's bytes changed.
    // READ THROUGH A FRESH SIGNED URL, not the plain object URL (fix round 3):
    // the storage edge caches the object's read response per PATH for up to an
    // hour — measured live: a poll of the plain read served the FIRST
    // generation's bytes for 90+ seconds with `cf-cache-status: HIT, cc=
    // public, max-age=3600`, while a freshly minted signed URL (unique token,
    // therefore a unique cache key) served the re-pick's bytes immediately. A
    // cache-busting query string does NOT bypass it (measured: a `?cb=` read
    // answered `cf-cache-status: HIT` off the same entry), so the only fresh
    // read is a per-poll MINT — the same path the browser's <img> uses. The
    // poll stays bounded (30s): the upsert already landed before the mint the
    // test just watched, so a write-visibility lag of that size would itself
    // be a failure worth surfacing, not a wait to absorb.
    const mintKidPhotoUrl = async () => {
      const mr = await fetch(
        `${url}/storage/v1/object/sign/kid-photos/${viewerSession!.userId}/kids/${row.id}`, {
          method: 'POST',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${viewerSession!.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ expiresIn: 60 }),
        },
      )
      const mj = await mr.json()
      const rel: unknown = (mj as { signedURL?: unknown; signedUrl?: unknown }).signedURL ??
        (mj as { signedURL?: unknown; signedUrl?: unknown }).signedUrl
      if (typeof rel !== 'string') throw new Error(`sign mint failed: HTTP ${mr.status}`)
      return rel.startsWith('http') ? rel : `${url}/storage/v1${rel}`
    }
    await expect
      .poll(
        async () => {
          const signedUrl = await mintKidPhotoUrl()
          const objectB = Buffer.from(await (await fetch(signedUrl)).arrayBuffer())
          return objectB.equals(objectA)
        },
        {
          message:
            `waits for the re-pick's OVERWRITE to become visible at the canonical path (${storedRef}): ` +
            `the bytes must stop matching photo A's ${objectA.length} bytes ` +
            '(the upsert already landed — the fresh mint above proves the success branch ran; ' +
            'each poll mints its own signed URL, because the edge caches the plain read per path for an hour)',
          timeout: 30_000,
          intervals: [500],
        },
      )
      .toBe(false)

    // The DB row is unchanged in shape: a re-pick re-attaches the SAME
    // deterministic ref (the generation is client-side state, not a column).
    const rowsAfter = await readKidsDb(url, headers, viewerSession!.userId)
    expect(rowsAfter).toHaveLength(1)
    expect(rowsAfter[0].avatar_url, 'a re-pick re-attaches the SAME deterministic ref').toBe(storedRef)

    // --- Best-effort cleanup: the row + the (now second-generation) object.
    try {
      await fetch(`${url}/storage/v1/object/${storedRef}`, { method: 'DELETE', headers })
      await fetch(`${url}/rest/v1/kids?id=eq.${row.id}`, { method: 'DELETE', headers })
      console.log(`[e2e cleanup] ok — deleted ${viewerSession!.userId}'s kid row + kid-photo object (re-pick generation)`)
    } catch (err) {
      console.log(
        `[e2e cleanup] FAILED (logged, best-effort): ${
          err instanceof Error ? err.message : err
        } — orchestrator sweep (e2e- prefix) will pick stragglers up`,
      )
    }

    await context.close()
  },
)
