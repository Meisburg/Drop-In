/**
 * Spec (V2 ticket 02): the avatar. The marker picks a photo on /profile
 * (client-resized to a 256px square, stored at avatars/<uid>/avatar under
 * the owner-scoped write policy), posts a drop-in, and the 40px round
 * avatar renders on the feed card and on /u/<handle>.
 *
 * The test image is a dependency-free solid-color PNG generated in-process
 * (node:zlib — no fixtures on disk), deliberately wider than tall to
 * exercise the center-crop square resize.
 *
 * Cleanup (best-effort per ticket, e2e-<epoch> marker prefix): delete the
 * storage object, null profiles.avatar_url, and delete the marker's
 * playdate rows — all with the marker's own JWT (owner policies). Logged,
 * never fatal.
 */
import { expect, test } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import {
  localDatePlusDays,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
} from './fixtures'

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

test('marker uploads an avatar, sees the 40px round avatar on the feed card + /u/<handle>', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  // 400x300 (not square): the center-crop must square it before upload.
  const png = makePng(400, 300, 79, 70, 229)

  await page.goto('/profile')
  await settleOnRoute(page, '/profile')

  // Upload (the /profile photo card). The pure validateAvatarFile runs
  // first (this file is far under 5 MB), then the 256px client resize.
  await page.locator('input[type="file"]').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await expect(page.getByText('Photo updated.')).toBeVisible()

  // Post a drop-in (the V2 slice-1 UI, same pattern as the golden path) so
  // the feed card can render the host avatar.
  const title = `e2e ${marker.displayName} avatar lot`
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page.getByPlaceholder('e.g. Green Lake playground, near the boathouse').fill('E2E avatar lot')
  await page.locator('select').selectOption({ label: marker.neighborhood })
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  await page.getByRole('button', { name: 'Later start time' }).click()
  await expect(page.getByText('10:30 AM', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await expect(page.getByText('Ends 11:30 AM')).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()

  // The feed card renders the 40px round host avatar (not the fallback
  // initial circle — an <img> only exists when the upload worked).
  const card = page.locator('a').filter({ hasText: title }).first()
  await expect(card.locator('img.rounded-full')).toBeVisible()

  // The /u/<handle> header renders it too.
  await page.goto(`/u/${encodeURIComponent(marker.displayName)}`)
  await expect(page.locator('img.rounded-full').first()).toBeVisible()
})

test.afterEach(async () => {
  // Best-effort cleanup (per ticket): storage object + avatar_url + the
  // marker's playdate rows, via the marker's own JWT. Logged, never fatal.
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
    const query = `${url}/rest/v1/playdates?host_profile_id=eq.${userId}&select=id`
    const del = await fetch(query, {
      method: 'DELETE',
      headers: { ...headers, Prefer: 'return=representation' },
    })
    const deleted = del.ok ? ((await del.json()) as Array<Record<string, unknown>>) : []
    const check = await fetch(query, { headers })
    const remaining = check.ok ? ((await check.json()) as Array<Record<string, unknown>>) : null
    if (!del.ok || (remaining !== null && remaining.length > 0)) {
      console.log(
        `[e2e cleanup] FAILED — playdate delete HTTP ${del.status}, ` +
          `${remaining?.length ?? '?'} remain (marker ${userId}) — orchestrator sweep will pick them up`,
      )
    } else {
      console.log(
        `[e2e cleanup] ok — deleted avatar object + ${deleted.length} marker playdate row(s)`,
      )
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${
        err instanceof Error ? err.message : err
      } — orchestrator sweep (e2e- prefix) will pick stragglers up`,
    )
  }
})