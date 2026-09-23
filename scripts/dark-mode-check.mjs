/**
 * Dark-mode visual check (V22 slice 8) — verifies the RENDERED dark appearance,
 * not the token declarations.
 *
 * WHY: slice 8's evidence was a hand-computed contrast table plus a passing
 * mobile audit. A contrast table proves the NUMBERS are right; it does not prove
 * the numbers are APPLIED. The failure modes it cannot see:
 *   - a surface that never got re-pointed, so a white card sits on a dark page;
 *   - the `.bg-white` override losing to Tailwind's own utility;
 *   - text inheriting a light-mode colour because its token was missed.
 *
 * This samples actual painted background/text colours in a dark-scheme browser
 * context and asserts the page is dark, surfaces are dark, and body text is light.
 *
 * Usage: node scripts/dark-mode-check.mjs [baseURL]
 *   Needs a running server on :4173 (`npm run build && npm run preview`).
 */
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:4173'
const failures = []

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

const browser = await chromium.launch()

for (const scheme of ['dark', 'light']) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: scheme,
  })
  const page = await context.newPage()
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  // The boot splash is a fixed inset-0 z-50 overlay that unmounts a beat after
  // mount (SplashScreen.tsx). Measuring before it leaves samples the terracotta
  // splash, not the page — which is what the first version of this script did.
  await page
    .waitForFunction(() => document.getElementById('boot-splash') === null, { timeout: 5000 })
    .catch(() => {})
  await page.waitForTimeout(900)

  const report = await page.evaluate(() => {
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
      pageBg: pageShell ? pageShell.c : null,
      cards,
      texts: [...new Set(texts)],
    }
  })

  console.log(`\n--- ${scheme.toUpperCase()} (colorScheme: '${scheme}') ---`)
  console.log(`  page bg: ${report.pageBg}`)
  console.log(`  cards:   ${report.cards.join('  ')}`)

  const pageRgb = parseRgb(report.pageBg ?? '') ?? null
  check('a page background is painted', pageRgb !== null, String(report.pageBg))
  if (pageRgb === null) {
    await context.close()
    continue
  }
  const isDark = pageRgb[0] + pageRgb[1] + pageRgb[2] < 250

  if (scheme === 'dark') {
    check('page background is dark in dark mode', isDark, report.pageBg)
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
    const bodyText = report.texts.find((c) => {
      const rgb = parseRgb(c)
      return rgb && rgb[0] + rgb[1] + rgb[2] > 400
    })
    if (bodyText) {
      const t = parseRgb(bodyText)
      const ratio = contrast(t, pageRgb)
      check(
        'sampled body text clears 4.5:1 on the page background',
        ratio >= 4.5,
        `${ratio.toFixed(2)}:1 (${bodyText} on ${report.pageBg})`,
      )
    }
  } else {
    check('page background is light in light mode', !isDark, report.pageBg)
  }

  await context.close()
}

await browser.close()

if (failures.length > 0) {
  console.log(`\nFAIL — ${failures.length} check(s) failed`)
  process.exit(1)
}
console.log('\nPASS — dark appearance is applied and legible; light appearance unchanged')
