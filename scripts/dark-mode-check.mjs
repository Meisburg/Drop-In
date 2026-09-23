/**
 * Appearance check (V22 slice 14) — verifies the RENDERED appearance under the
 * NEW contract: light is the default for everyone, dark is a stored user
 * choice. The OS colour scheme no longer decides anything.
 *
 * WHY: slice 8's script emulated `colorScheme: 'dark'` and asserted the page
 * went dark — that mechanism was the bug. A prefer-dark desktop auto-darkened
 * the app, which the human did not want. The regression this script now pins:
 *   - default (no stored preference) paints LIGHT even when the browser
 *     emulates colorScheme 'dark' — THE key regression test;
 *   - with localStorage['dropin-theme'] = 'dark' set before load, the page
 *     paints DARK (the pre-paint script in index.html applies it).
 *
 * It keeps slice 8's painted-pixel approach: read getComputedStyle backgrounds
 * of the actual shell and assert on the measured rgb values.
 *
 * Usage: node scripts/dark-mode-check.mjs [baseURL]
 *   Needs a running server on :4173 (`npm run build && npm run preview`).
 */
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:4173'
const failures = []

// The pinned painted values (src/index.css token declarations):
const LIGHT_PAGE = 'rgb(251, 247, 244)' // --color-slate-50 light
const DARK_PAGE = 'rgb(24, 20, 18)' // --color-slate-50 dark (#181412)

function check(label, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

/** Relative luminance + contrast, computed on painted colours. */
function contrast(a, b) {
  const lum = (rgb) => {
    const [r, g, bl] = rgb.map((v) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

const parseRgb = (s) => {
  const m = s.match(/rgba?\(([^)]+)\)/)
  if (!m) return null
  return m[1].split(',').slice(0, 3).map((n) => parseFloat(n))
}

/** Sample the painted page: shell background, card surfaces, text colours. */
async function samplePage(page) {
  // The boot splash is a fixed inset-0 overlay that unmounts a beat after
  // mount (SplashScreen.tsx). Measuring before it leaves samples the splash,
  // not the page — which is what the first version of this script did.
  await page
    .waitForFunction(() => document.getElementById('boot-splash') === null, { timeout: 5000 })
    .catch(() => {})
  await page.waitForTimeout(900)

  return page.evaluate(() => {
    // body is transparent here — the shell paints the page. Walk the tree and
    // collect every OPAQUE background, skipping fixed overlays (splash, lightbox,
    // dialogs) since those are transient layers, not the page surface.
    const isOverlay = (el) => {
      const pos = getComputedStyle(el).position
      return pos === 'fixed' || pos === 'absolute'
    }
    const opaque = [...document.querySelectorAll('body, div, header, nav, main, section')]
      .filter((el) => !isOverlay(el))
      .map((el) => ({ el, c: getComputedStyle(el).backgroundColor, r: el.getBoundingClientRect() }))
      .filter((x) => x.c && !x.c.includes('rgba(0, 0, 0, 0)'))
    // The page background = the largest opaque area that covers most of the viewport.
    const vw = window.innerWidth
    const vh = window.innerHeight
    const pageShell = opaque
      .filter((x) => x.r.width >= vw * 0.9 && x.r.height >= vh * 0.5)
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0]
    // Card surfaces = opaque, but not the full-bleed shell.
    const cards = [...new Set(
      opaque
        .filter((x) => x !== pageShell && x.r.width < vw * 0.95 && x.r.width > 40)
        .map((x) => x.c),
    )]
    const texts = [...document.querySelectorAll('p,span,h1,h2,h3,label,a,button')]
      .filter((el) => (el.textContent ?? '').trim().length > 1)
      .slice(0, 40)
      .map((el) => getComputedStyle(el).color)
    return {
      dataTheme: document.documentElement.dataset.theme ?? null,
      pageBg: pageShell ? pageShell.c : null,
      cards,
      texts: [...new Set(texts)],
    }
  })
}

const browser = await chromium.launch()

// --- Case 1 (THE KEY REGRESSION TEST): no stored preference, OS emulated DARK.
// The app must paint LIGHT — the OS no longer decides.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  })
  const page = await context.newPage()
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  const report = await samplePage(page)

  console.log(`\n--- NO STORED PREFERENCE, OS EMULATED DARK ---`)
  console.log(`  data-theme attr: ${report.dataTheme}`)
  console.log(`  page bg: ${report.pageBg}`)
  console.log(`  cards:   ${report.cards.join('  ')}`)

  check(
    'no stored pref + OS dark renders LIGHT (the regression this slice fixes)',
    report.pageBg === LIGHT_PAGE,
    report.pageBg,
  )
  check(
    'data-theme attribute is not "dark" without a stored choice',
    report.dataTheme !== 'dark',
    String(report.dataTheme),
  )
  const brightCards = report.cards.filter((c) => {
    const rgb = parseRgb(c)
    return rgb && rgb[0] + rgb[1] + rgb[2] > 400
  })
  check('card surfaces stay light (white cards on the light page)', brightCards.length > 0, brightCards.join('  '))
  await context.close()
}

// --- Case 2: stored dark preference, OS emulated LIGHT. Must paint DARK.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
  })
  const page = await context.newPage()
  // Seed the stored choice BEFORE the document loads so the pre-paint script
  // in index.html sees it and sets data-theme="dark" synchronously.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('dropin-theme', 'dark')
    } catch (e) {}
  })
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  const report = await samplePage(page)

  console.log(`\n--- STORED DARK PREFERENCE, OS EMULATED LIGHT ---`)
  console.log(`  data-theme attr: ${report.dataTheme}`)
  console.log(`  page bg: ${report.pageBg}`)
  console.log(`  cards:   ${report.cards.join('  ')}`)

  check('stored dark + reload renders DARK', report.pageBg === DARK_PAGE, report.pageBg)
  check('data-theme attribute is "dark"', report.dataTheme === 'dark', String(report.dataTheme))
  const brightCards = report.cards.filter((c) => {
    const rgb = parseRgb(c)
    return rgb && rgb[0] + rgb[1] + rgb[2] > 400
  })
  check('no bright card surface on the dark page', brightCards.length === 0, brightCards.join('  '))
  // Body text must be light. Ignore text that sits on the terracotta brand fill
  // (that is intentionally dark-on-terracotta via the .bg-indigo-600 override).
  const darkTexts = report.texts.filter((c) => {
    const rgb = parseRgb(c)
    return rgb && rgb[0] + rgb[1] + rgb[2] < 200
  })
  check(
    'text tokens resolve light in dark mode (dark = brand fill only)',
    darkTexts.length <= 1,
    darkTexts.join('  ') || 'none',
  )
  // Contrast of the most common text colour against the page.
  const pageRgb = parseRgb(report.pageBg ?? '')
  const bodyText = report.texts.find((c) => {
    const rgb = parseRgb(c)
    return rgb && rgb[0] + rgb[1] + rgb[2] > 400
  })
  if (bodyText && pageRgb) {
    const t = parseRgb(bodyText)
    const ratio = contrast(t, pageRgb)
    check(
      'sampled body text clears 4.5:1 on the dark page background',
      ratio >= 4.5,
      `${ratio.toFixed(2)}:1 (${bodyText} on ${report.pageBg})`,
    )
  }
  await context.close()
}

await browser.close()

if (failures.length > 0) {
  console.log(`\nFAIL — ${failures.length} check(s) failed`)
  process.exit(1)
}
console.log('\nPASS — light is the default even under an emulated dark OS; a stored dark choice paints dark')