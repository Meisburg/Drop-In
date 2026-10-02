/**
 * V21 t05: the profile avatar is a CIRCLE, not an ellipse.
 *
 * The founder's annotation measured the read-view avatar (ProfileView →
 * HostAvatar size="lg" expandable) at 80px tall × 43.99px wide — the PhotoButton
 * wrapper's fixed h-11 w-11 (44px) around an 80px img. This spec pins the
 * invariant in a real browser: on /profile, every rendered avatar image has a
 * bounding box whose width equals its height within 1px.
 *
 * It walks both render sites that can carry an <img>:
 *   - the READ view's identity card (HostAvatar lg, expandable) — the defect;
 *   - the EDITOR's "Your photo & name" card (label + img, both h-20 w-20).
 *
 * A marker without an avatar renders the initial-fallback circle (a <span>, no
 * <img>), so the spec first uploads one through the editor (the same round-trip
 * e2e/avatar.e2e.ts drives) and then measures. Cleanup follows the house
 * discipline: delete the object, null the column, logged never fatal.
 */
import { expect, test } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import { openProfileEditor, readMarkerMeta, readMarkerSession, readSupabaseEnv } from './fixtures'

// --- The dependency-free PNG (solid RGB, 8-bit, non-interlaced). ---

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

test('the /profile avatar renders as a square (width == height ±1px)', async ({ page }) => {
  const marker = readMarkerMeta()
  const png = makePng(400, 300, 79, 70, 229)

  // Upload an avatar through the editor so BOTH render sites carry an <img>.
  await page.goto('/profile')
  await openProfileEditor(page)
  await page.getByTestId('avatar-photo-input').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await page.getByRole('button', { name: 'Use this photo' }).click()
  await expect(page.getByTestId('avatar-photo')).toBeVisible()

  // EDITOR site: the "Your photo & name" card's trigger (label h-20 w-20) and
  // its img must agree — measure the img's own box.
  const editorBox = await page.getByTestId('avatar-photo').evaluate((el) => {
    const rect = el.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  })
  expect(
    Math.abs(editorBox.width - editorBox.height),
    `editor avatar box ${editorBox.width}×${editorBox.height} must be square`,
  ).toBeLessThanOrEqual(1)

  // Done returns to the READ view — the surface the founder annotated.
  await page.getByTestId('done-editing-profile').click()
  await expect(page.getByTestId('edit-profile')).toBeVisible()

  // READ view: the identity card's avatar (HostAvatar lg, expandable). The img
  // is the one with alt `${display_name}'s photo` inside the identity card.
  // `marker.displayName` is the full "First Last" handle — the same value the
  // profile's display_name column holds, so the alt text matches exactly.
  // The PhotoButton wrapper renders a <button aria-label="See {alt} full screen">
  // around the <img>, so we target the button and measure its child img.
  const readBtn = page.getByRole('button', { name: `See ${marker.displayName}’s photo full screen` }).first()
  await expect(readBtn).toBeVisible()
  const readImg = readBtn.locator('img')
  const readBox = await readImg.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  })
  expect(
    Math.abs(readBox.width - readBox.height),
    `read-view avatar box ${readBox.width}×${readBox.height} must be square (V21 t05)`,
  ).toBeLessThanOrEqual(1)
})

test.afterEach(async () => {
  // Best-effort cleanup (house discipline): delete the storage object, null
  // profiles.avatar_url. Logged, never fatal.
  try {
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken, userId } = readMarkerSession()
    const headers: Record<string, string> = {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    }
    await fetch(`${url}/storage/v1/object/avatars/${userId}/avatar`, { method: 'DELETE', headers })
    await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ avatar_url: null }),
    })
    console.log('[e2e cleanup] ok — deleted avatar object + nulled avatar_url')
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${
        err instanceof Error ? err.message : err
      } — orchestrator sweep will pick stragglers up`,
    )
  }
})
