/**
 * Layout-width check (V22 slice 9) — measures the shell at phone and desktop
 * widths and asserts the two properties the slice promised:
 *
 *   1. BELOW md (768px): the layout is the phone layout — fixed bottom bar,
 *      content column <= 448px. This is the SAFETY property: if a phone changed
 *      shape, the slice failed no matter how good the desktop looks.
 *   2. AT md AND UP: a left rail replaces the bottom bar and the content column
 *      is wider than the phone measure.
 *
 * Plus: no horizontal overflow at any width, and all nav destinations reachable.
 *
 * Usage: node scripts/layout-width-check.mjs [baseURL]
 *   Needs a running server on :4173 (`npm run build && npm run preview`).
 * The signed-out shell is what is measurable without credentials; /login renders
 * inside the same <main>, so the measure and overflow properties are testable.
 */
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:4173'
const WIDTHS = [320, 375, 390, 430, 768, 1024, 1440]
const MD = 768
const failures = []

function check(label, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

const browser = await chromium.launch()

console.log(`layout-width-check against ${BASE}\n`)

for (const width of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  await page.goto(BASE + '/playdate/00000000-0000-0000-0000-000000000000', {
    waitUntil: 'networkidle',
  })
  await page
    .waitForFunction(() => document.getElementById('boot-splash') === null, { timeout: 5000 })
    .catch(() => {})
  await page.waitForTimeout(500)

  const m = await page.evaluate(() => {
    const main = document.querySelector('main')
    const nav = document.querySelector('nav')
    const navStyle = nav ? getComputedStyle(nav) : null
    const navRect = nav ? nav.getBoundingClientRect() : null
    const mainRect = main ? main.getBoundingClientRect() : null
    const doc = document.documentElement
    // A nav is a bottom bar when it is fixed to the bottom of the viewport and
    // spans its width; it is a rail when it is a tall/narrow sticky column.
    return {
      mainWidth: mainRect ? Math.round(mainRect.width) : null,
      navWidth: navRect ? Math.round(navRect.width) : null,
      navHeight: navRect ? Math.round(navRect.height) : null,
      navPosition: navStyle ? navStyle.position : null,
      navLabel: nav ? nav.getAttribute('aria-label') : null,
      navLinks: nav ? nav.querySelectorAll('a').length : 0,
      overflowX: doc.scrollWidth - doc.clientWidth,
      // min target size among nav links
      minTarget: nav
        ? Math.min(
            ...[...nav.querySelectorAll('a')].map((a) => {
              const r = a.getBoundingClientRect()
              return Math.min(r.width, r.height)
            }),
          )
        : null,
    }
  })

  const isDesktop = width >= MD
  const label = `${String(width).padStart(4)}px`

  // No horizontal overflow at any width.
  check(`${label} no horizontal overflow`, m.overflowX <= 0, `overflow ${m.overflowX}px`)

  // ⚠️ WHAT THIS LANE DOES NOT CHECK ANY MORE, AND WHY (2026-10-05).
  //
  // It used to assert the nav here — bottom bar below `md`, left rail at `md` and
  // up, an accessible name, 44px targets. **Every one of those checks failed on
  // every run**, and they had to: this lane visits a SIGNED-OUT route (its own
  // header says so — "the signed-out shell is what is measurable without
  // credentials") and the nav lives in the SIGNED-IN shell. A route with no nav
  // cannot satisfy an assertion about the nav, so ten checks were red 10 times
  // out of 10 and the lane read as broken.
  //
  // The SHELL is now measured by `scripts/signed-in-audit.mjs`, which has the
  // credentials this lane lacks and asserts exactly these properties — nav
  // present, named, ≥44px targets, bottom bar below `md`, left rail at `md` and
  // up — on the feed, AND is proven able to fail (a forced 20px nav target fails
  // it; see that script's header).
  //
  // What remains here is what a signed-out page can honestly answer: overflow at
  // seven widths, and the content column's phone measure.
  const contentColumnOk = isDesktop ? (m.mainWidth ?? 0) > 448 : (m.mainWidth ?? 9999) <= 448
  check(
    isDesktop
      ? `${label} content wider than the phone measure`
      : `${label} content column <= 448px (phone measure preserved)`,
    contentColumnOk,
    `${m.mainWidth}px`,
  )

  await context.close()
}

await browser.close()

if (failures.length > 0) {
  console.log(`\nFAIL — ${failures.length} check(s) failed`)
  process.exit(1)
}
console.log(
  '\nPASS — overflow clear at 7 widths; the content column keeps its phone measure below 768px ' +
    'and widens above it. THE SHELL (nav, rail, targets) is measured by scripts/signed-in-audit.mjs, ' +
    'which is where it can actually be seen.',
)
