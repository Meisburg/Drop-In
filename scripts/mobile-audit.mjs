/**
 * Mobile audit (V4 slice 1) — a throwaway-but-repeatable check, not part of
 * the e2e gate. Loads the signed-out surfaces at real phone widths and
 * reports the three things a phone actually punishes:
 *   1. horizontal overflow,
 *   2. text controls below 16px (iOS zooms the viewport on focus),
 *   3. tap targets below 44px.
 *
 * Usage: node scripts/mobile-audit.mjs [baseURL] [playdateId]
 *   (default :4173 preview; the deployed site works too —
 *    node scripts/mobile-audit.mjs https://drop-in-mu.vercel.app <id>)
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
// Pass a real drop-in id as the second argument to audit a content-bearing
// detail page; the default exercises the not-found state (also a real screen).
const DETAIL_ID = process.argv[3] ?? '00000000-0000-0000-0000-000000000000'
// V17: /browse added. It is the page the redesign changed most (a map band, a
// card per place, a floating control, a 44px heart), and until now this audit
// never loaded it — so the measured floors the `ocr` rules also enforce had no
// lane watching the one screen V17 rebuilt. Signed out it redirects to /login,
// which is the state audited here (no marker account is available to this
// throwaway script); the signed-in layout is measured by the places e2e specs
// at 390 and by the mobile-audit assertions those specs carry.
const ROUTES = ['/login', `/playdate/${DETAIL_ID}`, '/browse']

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
      // V6: WCAG AA contrast, measured on the rendered pixels rather than read
      // off the class names. The design jury found a real failure my audit had
      // missed — white on green-600 is 3.30:1 — so the check now lives here.
      // Parse ANY css color by asking the browser to paint it: Tailwind v4
      // emits oklch(), and getComputedStyle hands it back verbatim, so a naive
      // number scrape reads 51.1/.262/276 as r/g/b — which reported indigo on
      // white as 1.17:1. One painted pixel is exact for every color syntax.
      const probe = document.createElement('canvas')
      probe.width = 1
      probe.height = 1
      const probeCtx = probe.getContext('2d', { willReadFrequently: true })
      const toRgb = (value) => {
        if (value === undefined || value === null || value === '') return null
        probeCtx.clearRect(0, 0, 1, 1)
        probeCtx.fillStyle = '#000000'
        probeCtx.fillStyle = String(value)
        probeCtx.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data
        // A translucent layer's real color depends on the whole stack behind
        // it; rather than guess, report it as unknown and skip the element.
        if (a !== 255) return null
        return [r, g, b]
      }
      const relLum = ([r, g, b]) => {
        const f = (c) => {
          const v = c / 255
          return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
      }
      const contrast = (a, b) => {
        const l1 = relLum(a)
        const l2 = relLum(b)
        const hi = Math.max(l1, l2)
        const lo = Math.min(l1, l2)
        return (hi + 0.05) / (lo + 0.05)
      }
      const effectiveBg = (el) => {
        let node = el
        while (node !== null) {
          const rgb = toRgb(getComputedStyle(node).backgroundColor)
          if (rgb !== null) return rgb
          node = node.parentElement
        }
        return [255, 255, 255]
      }
      const lowContrast = []
      const small = []
      for (const el of document.querySelectorAll('input, textarea, select')) {
        const type = el.getAttribute('type')
        if (type === 'checkbox' || type === 'radio') continue
        const size = parseFloat(getComputedStyle(el).fontSize)
        if (size < 16) small.push(`${el.tagName.toLowerCase()}[${type ?? 'text'}] ${size}px`)
      }
      // V6: nothing renders below 14px. First phone feedback was "the text is
      // too small all over the place" (16px body still read small, so the floor
      // moved to 17px), and the fix is only real if it cannot silently regress.
      const tinyText = []
      const sizeHistogram = {}
      for (const el of document.querySelectorAll('p, span, div, a, button, li, label, h1, h2, h3, strong')) {
        const content = (el.textContent ?? '').trim()
        // Leaf nodes only — a container inherits its children's text.
        if (content.length === 0 || el.children.length > 0) continue
        const size = parseFloat(getComputedStyle(el).fontSize)
        sizeHistogram[size] = (sizeHistogram[size] ?? 0) + 1
        if (size < 14) tinyText.push(`${el.tagName.toLowerCase()} "${content.slice(0, 24)}" ${size}px`)
        // AA: 3.0 is the floor for large text (>=24px, or >=18.66px bold).
        const weight = Number(getComputedStyle(el).fontWeight) || 400
        const isLarge = size >= 24 || (size >= 18.66 && weight >= 700)
        const floor = isLarge ? 3 : 4.5
        const fg = toRgb(getComputedStyle(el).color)
        const bg = effectiveBg(el)
        if (fg !== null) {
          const ratio = contrast(fg, bg)
          if (ratio < floor) {
            lowContrast.push(
              `${el.tagName.toLowerCase()} "${content.slice(0, 22)}" ${ratio.toFixed(2)}:1 (needs ${floor})`,
            )
          }
        }
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
        tinyText,
        lowContrast,
        sizeHistogram,
      }
    })

    const problems = []
    if (report.overflow > 1) problems.push(`overflow +${report.overflow}px`)
    if (report.small.length) problems.push(`<16px text: ${report.small.join(', ')}`)
    if (report.smallTargets.length) problems.push(`<44px targets: ${report.smallTargets.join(', ')}`)
    if (report.tinyText.length) problems.push(`text below 14px: ${report.tinyText.join(', ')}`)
    if (report.lowContrast.length) problems.push(`contrast: ${report.lowContrast.join(', ')}`)

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