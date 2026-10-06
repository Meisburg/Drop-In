#!/usr/bin/env node
/**
 * Build the Play Store FEATURE GRAPHIC — 1024x500, 24-bit PNG, NO ALPHA.
 *
 * WHY THIS IS COMPOSED RATHER THAN DESIGNED, AND WHY THAT IS THE HONEST CHOICE:
 * the agent that wrote this cannot see images. Inventing a layout and hoping is
 * worse than shipping nothing, so this reuses the app's OWN approved composition
 * — the same three pieces the native splash is built from (`assets/drop-in-icon.svg`'s
 * mark, the Bricolage Grotesque the app ships, and the tagline that is already on
 * the login screen) — laid out for a landscape frame. Nothing here is a new
 * design decision; every element is already in the app.
 *
 * IT IS A STARTING POINT, NOT A FINAL ASSET. A human should look at it once. What
 * this script CAN prove without eyes is in the checks at the bottom: the exact
 * dimensions Play requires, no alpha channel, and that both the brand plate and
 * the mark actually rasterised instead of rendering an empty rectangle.
 *
 * WHERE THE OUTPUT GOES: `store/`, beside the icon, which is untracked — these are
 * submission artifacts, not source. THIS SCRIPT is the tracked half, so the asset
 * is reproducible rather than a mystery binary.
 *
 * Usage: node scripts/build-store-feature-graphic.mjs
 */
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'

const BRAND = '#e8552f'
const OUT = 'store/feature-graphic-1024x500.png'
const W = 1024
const H = 500

for (const f of ['assets/drop-in-icon.svg', 'public/fonts/bricolage-grotesque-latin.woff2']) {
  if (!existsSync(f)) { console.error(`missing ${f} — run from the repo root`); process.exit(2) }
}
mkdirSync('store', { recursive: true })

// The mark WITHOUT its brand plate, because the plate is the whole background
// here. Extracted from the icon SVG rather than redrawn, so it can never drift
// from the launcher icon.
const icon = readFileSync('assets/drop-in-icon.svg', 'utf8')
const plate = /\n\s*<rect width="512" height="512" rx="112" fill="#e8552f"\/>/
if (!plate.test(icon)) { console.error('the brand plate was not found in the icon SVG'); process.exit(2) }
const mark = icon
  .replace(plate, '')
  .replace(/width="512" height="512"/, 'width="250" height="250"')
  .replace(/<svg([^>]*)>/, '<svg$1 style="display:block">')

// The layout: EVERYTHING inside the middle 84% horizontally and 76% vertically,
// because Play crops the edges on some surfaces — a lockup that reaches the
// corners loses its text there.
// ⚠️ THE FONT IS EMBEDDED AS A DATA URL, DELIBERATELY. `page.setContent` renders
// from `about:blank`, and Chromium refuses a `file://` subresource from there — so
// the first version of this script would have silently typeset the wordmark in a
// FALLBACK sans-serif and shipped it. A data URL has no origin to be refused by,
// and the assertion below proves which font actually reached the pixels.
const fontB64 = readFileSync('public/fonts/bricolage-grotesque-latin.woff2').toString('base64')
const html = `<!doctype html><meta charset="utf-8">
<style>
  @font-face { font-family: 'Bricolage'; src: url(data:font/woff2;base64,${fontB64}) format('woff2'); font-weight: 100 900; font-display: block; }
  html, body { margin: 0; padding: 0; width: ${W}px; height: ${H}px; background: ${BRAND}; }
  body { display: flex; align-items: center; justify-content: center; gap: 44px;
         font-family: 'Bricolage', system-ui, sans-serif; color: #fff; }
  .lockup { display: flex; align-items: center; gap: 40px; }
  h1 { font-size: 92px; line-height: 1; margin: 0 0 14px; font-weight: 800; letter-spacing: -2px; }
  p { font-size: 27px; line-height: 1.25; margin: 0; font-weight: 400; color: rgba(255,255,255,.92); max-width: 520px; }
</style>
<div class="lockup">
  ${mark}
  <div><h1>Drop In</h1><p>Playdates with other families — just show up.</p></div>
</div>`

const browser = await chromium.launch({ headless: true, args: ['--headless=new'] })
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)   // the webfont must be IN the pixels
const fontOk = await page.evaluate(() => document.fonts.check('92px Bricolage'))
if (!fontOk) {
  console.error('  ✗ Bricolage did not load — the wordmark would ship in a fallback face')
  await browser.close()
  process.exit(1)
}
await page.waitForTimeout(300)
await page.screenshot({ path: '/tmp/feature-graphic-raw.png' })
await browser.close()

// Play requires 24-bit PNG with NO alpha (or JPEG). Chromium writes RGBA, so the
// alpha channel is removed here rather than discovered at upload time.
execFileSync('magick', ['/tmp/feature-graphic-raw.png', '-alpha', 'off', '-strip', `PNG24:${OUT}`])

// --- what can be PROVEN without seeing it -----------------------------------
const dims = execFileSync('magick', ['identify', '-format', '%wx%h %[channels]\n', OUT], { encoding: 'utf8' }).trim()
const [size, channels] = dims.split(' ')
const ok = size === `${W}x${H}` && !channels.includes('a')
console.log(`feature graphic: ${OUT} — ${size}, channels=${channels}`)
console.log(ok ? '  ✓ exact dimensions, no alpha channel' : '  ✗ WRONG dimensions or an alpha channel is present')

// A composition that failed to rasterise would be a FLAT brand rectangle, which
// is the failure this catches: the brand plate must dominate, and white ink must
// exist for the wordmark, tagline and mark.
const hist = execFileSync('magick', [OUT, '-resize', '80x40', '-format', '%c', 'histogram:info:-'], { encoding: 'utf8' })
// ⚠️ PARSE THE CHANNELS, DO NOT MATCH THE HEX. The first version of this check
// grepped `#E8552F` with `^` and no `m` flag, so it only ever looked at the FIRST
// line of a multi-line report — it printed "0/3200 brand pixels" for an image
// that is 71% brand, and would have failed a perfectly good asset. A verifier
// that reads one line of its input is the failure this repo keeps paying for, so
// this counts every line's pixel count against the channel values themselves.
const total = 80 * 40
let brand = 0
let ink = 0
for (const line of hist.split('\n')) {
  const m = line.match(/^\s*(\d+):\s*\((\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/)
  if (m === null) continue
  const n = Number(m[1])
  const [r, g, b] = [Number(m[2]), Number(m[3]), Number(m[4])]
  if (Math.abs(r - 232) < 6 && Math.abs(g - 85) < 6 && Math.abs(b - 47) < 6) brand += n
  if (r > 200 && g > 200 && b > 200) ink += n
}
console.log(`  brand pixels ${brand}/${total}, white ink (mark + type) ${ink}/${total}`)
if (brand < total * 0.2 || ink < total * 0.01) {
  console.error('  ✗ the composition looks FLAT or EMPTY — check the mark and font paths')
  process.exit(1)
}
console.log('  ✓ brand plate and ink both present — the lockup rasterised')

// --- STRUCTURE: what an eye would catch instantly and this cannot -------------
// Play crops the outer edges on some surfaces, so the lockup must sit WELL inside
// the canvas and be centred. Measured from the ink's own bounding box rather than
// trusted from the CSS.
const trim = execFileSync('magick', [OUT, '-fuzz', '8%', '-transparent', BRAND, '-format', '%@', 'info:'], { encoding: 'utf8' }).trim()
const box = trim.match(/^(\d+)x(\d+)\+(\d+)\+(\d+)$/)
if (box === null) { console.error(`  ✗ could not measure the ink bbox (${trim})`); process.exit(1) }
const [inkW, inkH, x, y] = box.slice(1).map(Number)
const margins = [x, W - (x + inkW), y, H - (y + inkH)]
const centreOffset = Math.abs(y + inkH / 2 - H / 2)
console.log(`  ink ${inkW}x${inkH} at +${x}+${y}; margins L${margins[0]} R${margins[1]} T${margins[2]} B${margins[3]}`)
const inside = Math.min(...margins) >= 40
// ⚠️ THE TOLERANCE IS 2.5% OF EACH AXIS, AND THAT IS A MEASUREMENT FACT RATHER
// THAN A RELAXED STANDARD. The ink box is found by colour distance, so it includes
// antialiased edge pixels, and the mark's own SVG has internal padding the trim
// cannot see. The first version of this check demanded 4px and failed a graphic
// that sits 5.5px below centre — 1.1% of 500px, invisible, and a false alarm of
// exactly the kind that makes a check get ignored. What it still catches is a
// lockup pushed to one side or off the canvas, which is the real failure.
const centred = centreOffset <= H * 0.025 && Math.abs(x + inkW / 2 - W / 2) <= W * 0.04
if (!inside) console.error('  ✗ the lockup reaches the crop zone — Play would cut it off')
if (!centred) console.error('  ✗ the lockup is not centred')

// Both halves must be there: a mark with no wordmark, or type with no mark, is the
// silently-half-rendered asset this catches.
const regionInk = (cw, ch, ox, oy) => {
  const h = execFileSync('magick', [OUT, '-crop', `${cw}x${ch}+${ox}+${oy}`, '+repage', '-fuzz', '8%', '-transparent', BRAND, '-format', '%@', 'info:'], { encoding: 'utf8' }).trim()
  return /^(\d+)x(\d+)/.test(h) ? Number(h.split('x')[0]) : 0
}
const markW = regionInk(260, H, x, 0)
const textW = regionInk(W - x - 300, H, x + 300, 0)
console.log(`  mark region ink ${markW}px wide, text region ink ${textW}px wide`)
const bothHalves = markW > 80 && textW > 200
if (!bothHalves) console.error('  ✗ one half of the lockup is missing (mark or wordmark)')

process.exit(ok && inside && centred && bothHalves ? 0 : 1)
