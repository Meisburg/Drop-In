/**
 * V25 ticket 10 — THE FAMILY PHOTO FILLS THE BLOCK, and the viewer that opens it
 * is GALLERY-CAPABLE.
 *
 * The founder, on /profile's "Family photos" block:
 *
 *   "make sure that if there's any family photos that are uploaded here that
 *    they Fill the space of the phone so that it doesn't look weird And if
 *    there's more than one photo that could be like a grid Kind of set up where
 *    you click on each one and they expand and close Like they're tiled or
 *    whatever"
 *
 * WHAT THIS SPEC CAN PROVE, AND WHAT IT CANNOT (read this before adding a
 * two-tile assertion here). The profile stores exactly ONE family photo —
 * `profiles.family_photo_url` is one column, the object is `<uid>/family/
 * photo.<ext>` (`familyPhotoPath`), and one mint covers it
 * (`familyPhotoMintPaths`). There is NO second-photo source anywhere in the
 * schema, so NO browser test can render a two-tile grid: an attempt would have
 * to invent data, which is the thing ticket 10 forbids ("If no second-photo
 * source exists, say so instead of inventing one"). The multi-photo arithmetic
 * is therefore pinned by `src/lib/photoGallery.test.ts` (pure functions, N = 2
 * and N = 3), and THIS spec pins what a browser really receives:
 *
 *   (a) the block's photo is the WIDTH OF THE PHONE (measured against the mount
 *       and against a 2:1 source's own ratio, at 390px and at 320px) with its
 *       aspect ratio undistorted — the old `max-h-72` would have capped a 2:1
 *       photo's height at its own width, which is what "doesn't look weird"
 *       was about;
 *   (b) the viewer is handed an ARRAY, not a bare src: the dialog carries
 *       `data-photo-count="1"` and shows the position line "1 of 1" — so the
 *       gallery path (counter, index, per-photo alt) is LIVE at HEAD, not dead
 *       code waiting for a migration;
 *   (c) focus MOVES INTO the dialog on open and returns to the tile on close —
 *       the viewer is `aria-modal`, and before this slice focus stayed on the
 *       page behind it;
 *   (d) it CLOSES all three ways the ticket names: the close button, Escape, and
 *       a tap on the overlay;
 *   (e) the same block renders on `/u/:handle` (the ticket's cross-surface AC)
 *       and at 320px nothing overflows the viewport.
 *
 * WHY IT SEEDS A REAL OBJECT instead of stubbing a URL: the family photo is a
 * PRIVATE-bucket object and the render path is a SIGNED url minted at render
 * time (`useFamilyPhotoUrl`). Faking the src would test a path the app cannot
 * take; uploading the object and pointing the column at its object path is
 * exactly what the editor does, so the mint, the policy and the crop-free
 * render are all the real ones. Both extensions the app accepts are exercised —
 * a PNG (seeded up front) and a JPEG encoded through the browser's own canvas
 * (branch (f)) — because the stored filename carries the extension and only
 * `familyPhotoPath` knows how to build it.
 *
 * THE 2:1 SOURCE IS THE POINT, not decoration: at 320px a 2:1 photo is 288×144
 * and at 390px it is 358×179. Under the old `max-h-72` cap the height would have
 * been clamped to the MAX-H (288) instead of the image's own ratio — the
 * letterbox the founder circled. Asserting the rendered size against the
 * INTRINSIC ratio (`naturalWidth/naturalHeight`) is what makes this a shape
 * test rather than a pixels test.
 *
 * CLEANUP: it remembers the marker's own `family_photo_url` before seeding and
 * restores it in `finally` (both branches), deleting the objects it added. The
 * marker row is the only row it touches.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import { familyPhotoPath } from '../src/lib/photoStorage'
import { readMarkerMeta, readMarkerSession, readSupabaseEnv } from './fixtures'

const PHOTO_BUCKET = 'kid-photos'
/** The seeded source's intrinsic size. 2:1 on purpose — see the header. */
const WIDTH = 1200
const HEIGHT = 600

// --- A dependency-free real PNG (the avatar spec's generator, in miniature) ---
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

/** The family-photo block's measurable facts, read from the live DOM. */
interface BlockFacts {
  intrinsic: { w: number; h: number }
  img: { x: number; y: number; w: number; h: number }
  mount: { x: number; y: number; w: number; h: number }
  htmlScrollWidth: number
  viewportWidth: number
}

async function readBlock(page: Page): Promise<BlockFacts> {
  return await page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>('[data-testid="family-photo"]')
    const mount = document.querySelector<HTMLElement>('[data-testid="family-photo-grid"]')
    if (img === null || mount === null) throw new Error('the family-photo block is not on the page')
    const i = img.getBoundingClientRect()
    const m = mount.getBoundingClientRect()
    return {
      intrinsic: { w: img.naturalWidth, h: img.naturalHeight },
      img: { x: i.x, y: i.y, w: i.width, h: i.height },
      mount: { x: m.x, y: m.y, w: m.width, h: m.height },
      htmlScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }
  })
}

test('the family photo fills the block and its viewer is gallery-capable (V25 t10)', async ({
  page,
}) => {
  test.setTimeout(240_000) // a live storage upload + a live profiles PATCH + two viewports

  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const handle = readMarkerMeta().displayName
  const pngPath = familyPhotoPath(userId, 'png')
  const jpgPath = familyPhotoPath(userId, 'jpg')
  const headers = { apikey: anonKey, Authorization: `Bearer ${accessToken}` }

  async function patchProfile(body: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`profiles PATCH HTTP ${res.status}: ${await res.text()}`)
  }

  async function currentFamilyPhotoUrl(): Promise<string | null> {
    const res = await fetch(`${url}/rest/v1/profiles?select=family_photo_url&id=eq.${userId}`, {
      headers,
    })
    if (!res.ok) throw new Error(`profiles read HTTP ${res.status}: ${await res.text()}`)
    const rows = (await res.json()) as Array<{ family_photo_url: string | null }>
    return rows[0]?.family_photo_url ?? null
  }

  async function uploadObject(objectPath: string, bytes: Buffer, contentType: string): Promise<void> {
    const res = await fetch(`${url}/storage/v1/object/${PHOTO_BUCKET}/${objectPath}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': contentType, 'x-upsert': 'true' },
      body: new Uint8Array(bytes),
    })
    if (!res.ok) {
      throw new Error(
        `storage upload ${objectPath} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
      )
    }
  }

  async function deleteObject(objectPath: string): Promise<void> {
    await fetch(`${url}/storage/v1/object/${PHOTO_BUCKET}/${objectPath}`, {
      method: 'DELETE',
      headers,
    }).catch(() => {})
  }

  const original = await currentFamilyPhotoUrl()
  let seeded: string | null = null

  try {
    // ---- SEED the PNG the way the editor would: object first, then the column.
    await uploadObject(pngPath, makePng(WIDTH, HEIGHT, 232, 85, 47), 'image/png')
    await patchProfile({ family_photo_url: pngPath })
    seeded = pngPath

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/profile')

    const img = page.getByTestId('family-photo')
    const mount = page.getByTestId('family-photo-grid')
    await expect(img).toBeVisible({ timeout: 30_000 })
    await expect(mount).toBeVisible()
    // The signed URL really is the private bucket's (the render path, not this
    // spec's business elsewhere — kid-photo-exposure owns the URL shape).
    const src = (await img.getAttribute('src')) ?? ''
    expect(src).toContain(PHOTO_BUCKET)
    expect(src).toContain('token=')

    // ================= (a) IT FILLS THE PHONE'S WIDTH, UNDISTORTED ==========
    for (const viewport of [390, 320]) {
      await page.setViewportSize({ width: viewport, height: 844 })
      // Wait for the browser to settle the layout after the resize.
      await page.waitForFunction(() => document.documentElement.clientWidth > 0)
      const facts = await readBlock(page)

      // (a1) a 2:1 source arrived, so every expectation below is against ITS
      //      ratio rather than a number this spec made up.
      expect(
        facts.intrinsic.w / facts.intrinsic.h,
        `the seeded photo must decode as 2:1 (got ${facts.intrinsic.w}×${facts.intrinsic.h})`,
      ).toBeCloseTo(WIDTH / HEIGHT, 2)

      // (a2) THE IMAGE IS THE MOUNT'S FULL WIDTH — no inset, no gutter.
      expect(
        Math.abs(facts.img.w - facts.mount.w),
        `at ${viewport}px the photo must fill its block: img ${facts.img.w} vs block ${facts.mount.w}`,
      ).toBeLessThanOrEqual(1)
      expect(facts.mount.w, 'the block itself must span the phone content width').toBeCloseTo(
        Math.min(390, viewport) - 32,
        0,
      )

      // (a3) THE BLOCK DOES NOT PUSH THE PAGE SIDEWAYS.
      expect(
        facts.htmlScrollWidth,
        `at ${viewport}px nothing may overflow the viewport (scrollWidth ${facts.htmlScrollWidth})`,
      ).toBeLessThanOrEqual(facts.viewportWidth)

      // (a4) THE IMAGE KEEPS ITS OWN RATIO — no letterbox, no crop, no stretch.
      //      A `max-h-72` cap would make a 2:1 photo show at ~1:1 here.
      expect(
        facts.img.h,
        `at ${viewport}px the photo's height must follow its 2:1 ratio, not a height cap`,
      ).toBeCloseTo(facts.img.w / 2, 0)
      expect(facts.img.h).toBeLessThan(288) // 288 was the old max-h-72 cap
    }

    // ================= (b) THE VIEWER GOT AN ARRAY (gallery path is LIVE) ====
    await page.setViewportSize({ width: 390, height: 844 })
    const tile = page.getByTestId('family-photo-button')
    await expect(tile).toHaveCount(1)
    await expect(tile).toHaveAttribute('aria-label', `See @${handle}’s family photo full screen`)
    await tile.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // The gallery contract, live: the dialog knows how many photos it was given
    // and shows which one is on screen. A bare-src viewer could not.
    await expect(dialog).toHaveAttribute('data-photo-count', '1')
    await expect(page.getByTestId('lightbox-position')).toHaveText('1 of 1')
    // ...and it is still the SAME dialog the existing specs pin (account-links
    // reads the alt off `aria-label`).
    await expect(dialog).toHaveAttribute('aria-label', `@${handle}’s family photo`)
    const overlayImg = page.getByTestId('lightbox-photo')
    await expect(overlayImg).toBeVisible()
    expect((await overlayImg.getAttribute('src')) ?? '').toBe(src)

    // ================= (c) FOCUS IS INSIDE THE DIALOG, AND STAYS ============
    // On open, focus moves to the dialog's first control. A one-photo gallery
    // has exactly ONE control, so the trap's correct behaviour is that focus
    // does not move at all — Tab and Shift+Tab both wrap back to the close
    // button. Before this slice the trap was not mounted at all, so Tab walked
    // into the page BEHIND an `aria-modal` overlay; that is the failure these
    // two assertions catch (either direction escaping shows up here).
    const closeButton = page.getByRole('button', { name: 'Close photo' })
    await expect(closeButton).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(closeButton).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(closeButton).toBeFocused()
    expect(
      await page.evaluate(() =>
        document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false,
      ),
      'focus must still be inside the dialog after Tab and Shift+Tab',
    ).toBe(true)

    // ================= (d) ESCAPE CLOSES (and focus returns to the tile) =====
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(tile).toBeFocused()

    // ================= (d2) THE CLOSE BUTTON CLOSES =========================
    await tile.click()
    await expect(dialog).toBeVisible()
    await page.getByRole('button', { name: 'Close photo' }).click()
    await expect(dialog).toHaveCount(0)

    // ================= (d3) A TAP ON THE OVERLAY CLOSES ====================
    await tile.click()
    await expect(dialog).toBeVisible()
    // The overlay IS the dialog element; a tap on its padding (a corner, clear
    // of the photo and the close button) is the tap-to-dismiss path.
    await dialog.click({ position: { x: 5, y: 5 } })
    await expect(dialog).toHaveCount(0)
    await expect(tile).toBeFocused()

    // ================= (e) THE OTHER SURFACE SHOWS THE SAME BLOCK ===========
    await page.setViewportSize({ width: 320, height: 844 })
    await page.goto(`/u/${encodeURIComponent(handle)}`)
    const publicImg = page.getByTestId('family-photo')
    await expect(publicImg).toBeVisible({ timeout: 30_000 })
    const publicFacts = await readBlock(page)
    expect(
      Math.abs(publicFacts.img.w - publicFacts.mount.w),
      `/u/:handle must fill its block too (img ${publicFacts.img.w} vs block ${publicFacts.mount.w})`,
    ).toBeLessThanOrEqual(1)
    expect(publicFacts.htmlScrollWidth).toBeLessThanOrEqual(publicFacts.viewportWidth)

    // ================= (f) THE OTHER EXTENSION THE APP ACCEPTS: .jpg ========
    // The stored filename carries the extension and only `familyPhotoPath` knows
    // the shape, so a JPEG on a `.jpg` object must mint and render identically.
    // Encoded through the browser's own canvas (the same `toBlob('image/jpeg')`
    // the crop flow uses), so a real JPEG byte stream is what gets uploaded.
    const jpegBase64: string = await page.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1200
      canvas.height = 600
      const ctx = canvas.getContext('2d')
      if (ctx === null) throw new Error('canvas 2d unavailable')
      ctx.fillStyle = '#1d4ed8'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b === null ? reject(new Error('no blob')) : resolve(b)), 'image/jpeg', 0.85),
      )
      const buffer = await blob.arrayBuffer()
      let binary = ''
      const bytes = new Uint8Array(buffer)
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      return btoa(binary)
    })
    await uploadObject(jpgPath, Buffer.from(jpegBase64, 'base64'), 'image/jpeg')
    await patchProfile({ family_photo_url: jpgPath })
    seeded = jpgPath
    await page.goto('/profile')
    await expect(page.getByTestId('family-photo')).toBeVisible({ timeout: 30_000 })
    const jpgSrc = (await page.getByTestId('family-photo').getAttribute('src')) ?? ''
    expect(jpgSrc, 'the .jpg object must be the one served').toContain(jpgPath)
    const jpgFacts = await readBlock(page)
    expect(jpgFacts.intrinsic.w, 'the JPEG must decode as the 2:1 canvas').toBe(1200)
    expect(
      Math.abs(jpgFacts.img.w - jpgFacts.mount.w),
      'the .jpg photo fills its block like the .png one',
    ).toBeLessThanOrEqual(1)
  } finally {
    // Restore the marker exactly: its own stored value, and the objects this
    // spec added are gone. Logged, never fatal — a cleanup failure must not turn
    // a green product assertion into a red.
    try {
      await patchProfile({ family_photo_url: original })
    } catch (err) {
      console.log(`[t10 cleanup] restoring family_photo_url failed: ${String(err)}`)
    }
    await deleteObject(pngPath)
    await deleteObject(jpgPath)
    if (seeded !== null) console.log(`[t10 cleanup] restored family_photo_url; removed ${seeded}`)
  }
})
