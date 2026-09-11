/**
 * Regenerate the iOS startup images (the native half of the V4 splash) from
 * the same geometry as the app icon. Requires rsvg-convert (librsvg).
 *
 * The <link rel="apple-touch-startup-image"> tags in index.html must list the
 * SAME sizes — this script prints them so the two never drift.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const SIZES = [
  [430, 932, 3],
  [393, 852, 3],
  [428, 926, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 2],
  [375, 667, 2],
  [768, 1024, 2],
]

const MARK = `
      <path d="M32 6 C32 6 19 25 19 34 a13 13 0 0 0 26 0 C45 25 32 6 32 6 Z" fill="#ffffff"/>
      <path d="M12 52 Q32 62 52 52" fill="none" stroke="#c7d2fe" stroke-width="5" stroke-linecap="round"/>`

mkdirSync('public/splash', { recursive: true })

for (const [w, h, dpr] of SIZES) {
  const px = w * dpr
  const py = h * dpr
  const mark = Math.round(Math.min(px, py) * 0.22)
  const scale = mark / 64
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${px} ${py}" width="${px}" height="${py}">
  <rect width="${px}" height="${py}" fill="#4f46e5"/>
  <g transform="translate(${(px - mark) / 2} ${(py - mark) / 2}) scale(${scale})">${MARK}
  </g>
</svg>
`
  const tmp = `public/splash/${px}x${py}.svg`
  writeFileSync(tmp, svg)
  execFileSync('rsvg-convert', ['-w', String(px), '-h', String(px), tmp, '-o', `public/splash/${px}x${py}.png`])
  execFileSync('rm', ['-f', tmp])
  console.log(`  ${px}x${py}.png`)
}

console.log('\nindex.html tags:\n')
for (const [w, h, dpr] of SIZES) {
  console.log(
    `    <link\n      rel="apple-touch-startup-image"\n      href="/splash/${w * dpr}x${h * dpr}.png"\n      media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr})"\n    />`,
  )
}
