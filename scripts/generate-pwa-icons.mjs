#!/usr/bin/env node
/**
 * Generates placeholder PWA icons (solid brand color + "P" glyph) with no
 * dependencies: a minimal PNG encoder on top of node:zlib.
 *
 * Run: node scripts/generate-pwa-icons.mjs
 * Output: public/pwa-192x192.png, public/pwa-512x512.png,
 *         public/apple-touch-icon.png (180x180)
 *
 * Real icon artwork is out of scope for slice 1 (see plan.md).
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')

// Brand color: indigo-600
const BRAND = [0x4f, 0x46, 0xe5]

// 5x7 bitmap of the letter P
const GLYPH = [
  '11110',
  '10001',
  '10001',
  '11110',
  '10000',
  '10000',
  '10000',
]

let crcTable
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c
    }
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  // Each scanline is prefixed with filter type 0 (None).
  const raw = Buffer.alloc(size * (1 + size * 4))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4)
    raw[rowStart] = 0
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4)
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function makeIcon(size, cell) {
  const rgba = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = BRAND[0]
    rgba[i * 4 + 1] = BRAND[1]
    rgba[i * 4 + 2] = BRAND[2]
    rgba[i * 4 + 3] = 255
  }
  const glyphW = 5 * cell
  const glyphH = 7 * cell
  const ox = Math.floor((size - glyphW) / 2)
  const oy = Math.floor((size - glyphH) / 2)
  for (let gy = 0; gy < GLYPH.length; gy++) {
    for (let gx = 0; gx < 5; gx++) {
      if (GLYPH[gy][gx] !== '1') continue
      for (let y = oy + gy * cell; y < oy + (gy + 1) * cell; y++) {
        for (let x = ox + gx * cell; x < ox + (gx + 1) * cell; x++) {
          const i = (y * size + x) * 4
          rgba[i] = 255
          rgba[i + 1] = 255
          rgba[i + 2] = 255
          rgba[i + 3] = 255
        }
      }
    }
  }
  return encodePng(size, rgba)
}

const targets = [
  ['pwa-192x192.png', 192, 18],
  ['pwa-512x512.png', 512, 44],
  ['apple-touch-icon.png', 180, 16],
]

for (const [name, size, cell] of targets) {
  writeFileSync(join(publicDir, name), makeIcon(size, cell))
  console.log(`wrote public/${name} (${size}x${size})`)
}