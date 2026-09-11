/**
 * Mobile audit (V4 slice 1) — a throwaway-but-repeatable check, not part of
 * the e2e gate. Loads the signed-out surfaces at real phone widths and
 * reports the three things a phone actually punishes:
 *   1. horizontal overflow,
 *   2. text controls below 16px (iOS zooms the viewport on focus),
 *   3. tap targets below 44px.
 *
 * Usage: node scripts/mobile-audit.mjs [baseURL]   (default :4173 preview)
 */
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:4173'
// Portrait phones plus landscape (V4 slice 1 AC5: dvh + rotation must not
// clip the layout or hide a control).
const VIEWPORTS = [
  [320, 812],
  [375, 812],
  [390, 844],
  [430, 932],
  [844, 390],
  [667, 375],
]
const ROUTES = ['/login', '/playdate/00000000-0000-0000-0000-000000000000']

const browser = await chromium.launch()
let failures = 0

for (const [width, height] of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' })
    const report = await page.evaluate(() => {
      const doc = document.documentElement
      const small = []
      for (const el of document.querySelectorAll('input, textarea, select')) {
        const type = el.getAttribute('type')
        if (type === 'checkbox' || type === 'radio') continue
        const size = parseFloat(getComputedStyle(el).fontSize)
        if (size < 16) small.push(`${el.tagName.toLowerCase()}[${type ?? 'text'}] ${size}px`)
      }
      const smallTargets = []
      for (const el of document.querySelectorAll('button, a[href], label[for]')) {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        // Inline links inside a sentence are running text, not controls.
        if (getComputedStyle(el).display === 'inline') continue
        if (rect.height < 44) {
          const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28)
          smallTargets.push(`${el.tagName.toLowerCase()} "${label}" ${Math.round(rect.height)}px`)
        }
      }
      return {
        overflow: doc.scrollWidth - doc.clientWidth,
        small,
        smallTargets,
      }
    })

    const problems = []
    if (report.overflow > 1) problems.push(`overflow +${report.overflow}px`)
    if (report.small.length) problems.push(`<16px text: ${report.small.join(', ')}`)
    if (report.smallTargets.length) problems.push(`<44px targets: ${report.smallTargets.join(', ')}`)

    if (problems.length) failures++
    console.log(
      `${`${width}x${height}`.padStart(9)} ${route.padEnd(52)} ${problems.length ? 'FAIL  ' + problems.join(' | ') : 'ok'}`,
    )
  }
  await context.close()
}

await browser.close()
console.log(failures === 0 ? '\nAll mobile checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)