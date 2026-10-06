/**
 * SIGNED-IN AUDIT — the browser lane for the surfaces nothing else reaches.
 *
 * WHY THIS EXISTS. `scripts/mobile-audit.mjs` visits only signed-out routes
 * (`/login`, `/reset-password`, `/playdate/:id`, `/browse` — and `/browse`
 * redirects to `/login`), and `scripts/layout-width-check.mjs` says so in its own
 * header: "The signed-out shell is what is measurable without credentials." So
 * the six surfaces a family actually launches into had NO lane at all. They were
 * measured by hand once (2026-10-05, `docs/audits/launch-audit-2026-10-05.md`),
 * which found two real tap-target defects — and a hand measurement is not a lane.
 * This is that measurement, repeatable.
 *
 * IT ALSO TAKES OVER THE SHELL CHECKS the width lane could never run: the nav
 * (its accessible name, its 44px targets, and the bottom-bar→left-rail switch at
 * `md`) lives in the SIGNED-IN shell, so a signed-out route has no nav to measure
 * and those checks failed 10 times out of 10 on every run. They are measured here
 * instead — on a page that has one.
 *
 * WHAT IT WRITES: nothing but screenshots and a report under
 * `.scratch/signed-in-audit/`. It never writes application data.
 *
 * Usage:
 *   npx vite preview --port 4180 --strictPort &
 *   E2E_BASE_URL=http://localhost:4180 node scripts/signed-in-audit.mjs
 *
 * It needs a signed-in session at `e2e/.auth/marker-state.json` (written by the
 * e2e suite's `auth.setup`). WITHOUT one it does not pretend: it prints
 * `NOT MEASURED` and exits 2, because a lane that silently measures nothing is
 * the failure class this repo keeps paying for.
 */
import { chromium } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const BASE = process.env.E2E_BASE_URL ?? process.argv[2] ?? 'http://localhost:4180'
const STATE = 'e2e/.auth/marker-state.json'
const OUT = '.scratch/signed-in-audit'
const SHOTS = `${OUT}/screens`
const MD = 768

/** The surfaces a family launches into, and nothing that duplicates mobile-audit. */
const SURFACES = [
  ['feed', '/'],
  ['post-form', '/new'],
  ['profile', '/profile'],
  ['settings', '/settings'],
]

const VIEWPORTS = [
  { name: 'phone-390x844', width: 390, height: 844 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'desktop-1440x900', width: 1440, height: 900 },
]

const failures = []
const notMeasured = []
function check(label, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

/** Everything measured inside the page: one round trip per surface. */
function measure() {
  const doc = document.documentElement
  const nav = document.querySelector('nav')
  const navRect = nav ? nav.getBoundingClientRect() : null
  const main = document.querySelector('main')
  const mainRect = main ? main.getBoundingClientRect() : null

  /**
   * WHICH SUB-44 ELEMENTS ARE NOT SUB-44 TARGETS.
   *
   * Three exemptions, each a fact rather than a taste call, and EVERY one is
   * printed with its reason so an over-broad exemption is visible instead of
   * silently green. The first hand run of this audit produced 13 flags on
   * `/settings` that were all the first case, and reporting them as defects cost
   * a reader's time — which is exactly how a lane becomes one nobody reads.
   */
  function exemption(el) {
    // 1. A GLYPH INSIDE A TARGET: the checkbox is 20px, but the LABEL bound to
    //    it (`label[for]` or an ancestor `<label>`) is the thing a thumb hits.
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
      const owner =
        el.closest('label') ??
        (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null)
      if (owner) {
        const lr = owner.getBoundingClientRect()
        if (lr.width >= 44 && lr.height >= 44) {
          return `bound-label ${Math.round(lr.width)}x${Math.round(lr.height)}`
        }
      }
    }
    // 2. THIRD-PARTY INTERNALS — the repo's own rule: "DO NOT flag … third-party
    //    component internals". Leaflet's attribution and zoom controls are the
    //    map library's, at sizes it chose.
    if (el.closest('.leaflet-container, .leaflet-control, .mapboxgl-map')) return 'third-party (map control)'
    // 3. AN INLINE LINK IN A SENTENCE — WCAG 2.5.8's own inline exception. It is
    //    an EXEMPTION, not a pass: the element is below the floor and stays
    //    below it, and the reason is printed. Restricted to true flowing-text
    //    parents (not a flex row, where a link really is a standalone control).
    if (el.tagName === 'A') {
      const parent = el.parentElement
      if (parent && ['P', 'LI', 'SPAN', 'LABEL'].includes(parent.tagName)) {
        const siblingText = [...parent.childNodes].some(
          (n) =>
            (n.nodeType === 3 && (n.textContent ?? '').trim() !== '') ||
            (n.nodeType === 1 && n !== el && !el.contains(n) && (n.textContent ?? '').trim() !== ''),
        )
        if (siblingText) return 'inline in a sentence (WCAG 2.5.8)'
      }
    }
    return null
  }

  const small = []
  const exempt = []
  for (const el of document.querySelectorAll(
    'a[href],button,input,select,textarea,[role="button"],[role="tab"]',
  )) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue
    if (r.width >= 44 && r.height >= 44) continue
    const entry = {
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute('data-testid') ?? null,
      label: ((el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ')).slice(0, 40),
      w: Math.round(r.width),
      h: Math.round(r.height),
    }
    const reason = exemption(el)
    if (reason === null) small.push(entry)
    else exempt.push({ ...entry, reason })
  }

  const images = [...document.querySelectorAll('img')]
  return {
    overflowX: doc.scrollWidth - doc.clientWidth,
    mainWidth: mainRect ? Math.round(mainRect.width) : null,
    nav: navRect
      ? {
          w: Math.round(navRect.width),
          h: Math.round(navRect.height),
          position: getComputedStyle(nav).position,
          label: nav.getAttribute('aria-label'),
          links: [...nav.querySelectorAll('a')].map((a) => {
            const r = a.getBoundingClientRect()
            return Math.round(Math.min(r.width, r.height))
          }),
        }
      : null,
    small,
    exempt,
    imagesMissingAlt: images.filter((i) => !i.hasAttribute('alt')).length,
    h1: document.querySelectorAll('h1').length,
  }
}

if (!existsSync(STATE)) {
  console.log(`signed-in-audit — NOT MEASURED: no session at ${STATE}.`)
  console.log('  Run the e2e suite once (its auth.setup writes it), then re-run this lane.')
  console.log('  Exit 2, deliberately: this lane measured NOTHING, and that is not a pass.')
  process.exit(2)
}

mkdirSync(SHOTS, { recursive: true })
const saved = JSON.parse(readFileSync(STATE, 'utf8'))
const browser = await chromium.launch({ headless: true, args: ['--headless=new'] })
const rows = []
const consoleErrors = []

console.log(`signed-in-audit against ${BASE}\n`)

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    storageState: saved,
  })
  for (const [name, route] of SURFACES) {
    const page = await context.newPage()
    page.on('pageerror', (e) => consoleErrors.push(`[${name} ${vp.name}] ${String(e).slice(0, 160)}`))
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`[${name} ${vp.name}] ${m.text().slice(0, 160)}`)
    })
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForTimeout(2500)
    const m = await page.evaluate(measure)
    await page.screenshot({ path: `${SHOTS}/${name}-${vp.name}.png`, fullPage: true })
    rows.push({ name, route, viewport: vp.name, ...m })

    const label = `${vp.name} ${name}`
    if (m.overflowX > 0) check(`${label} no horizontal overflow`, false, `${m.overflowX}px`)

    // The shell: present, named, and reachable by thumb, with the md switch.
    if (m.nav === null) {
      notMeasured.push(`${label} shell (no nav on this surface)`)
    } else if (!m.nav.label) {
      check(`${label} nav has an accessible name`, false, String(m.nav.label))
    }
    if (m.small.length > 0) {
      check(
        `${label} all targets >= 44px`,
        false,
        m.small.map((s) => `${s.tag}${s.testid ? `[${s.testid}]` : ''} ${s.w}x${s.h} "${s.label}"`).join('; '),
      )
    }
    if (m.imagesMissingAlt > 0) check(`${label} every img has alt`, false, `${m.imagesMissingAlt} missing`)
    await page.close()
  }

  // The breakpoint, measured on the surface that HAS the shell.
  const feed = rows.find((r) => r.viewport === vp.name && r.name === 'feed')
  if (feed?.nav) {
    const isRail = feed.nav.h > feed.nav.w
    if (vp.width >= MD) {
      check(`${vp.name} nav is a left rail (not a bottom bar)`, isRail, `${feed.nav.w}x${feed.nav.h}`)
    } else {
      check(`${vp.name} nav is the bottom bar`, !isRail, `${feed.nav.w}x${feed.nav.h}`)
    }
    const worst = feed.nav.links.length === 0 ? 0 : Math.min(...feed.nav.links)
    check(`${vp.name} nav targets >= 44px`, worst >= 44, `${worst}px across ${feed.nav.links.length} link(s)`)
  }
  await context.close()
}

await browser.close()
writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, rows, consoleErrors }, null, 2))
const exempted = rows.flatMap((r) => r.exempt.map((e) => `[${r.name} ${r.viewport}] ${e.tag}${e.testid ? `[${e.testid}]` : ''} ${e.w}x${e.h} "${e.label}" — ${e.reason}`))
if (exempted.length > 0) {
  console.log(`\n${exempted.length} sub-44 element(s) EXEMPTED, with reason (not passes — printed so an over-broad rule is visible):`)
  for (const e of exempted.slice(0, 12)) console.log(`   ${e}`)
  if (exempted.length > 12) console.log(`   … and ${exempted.length - 12} more in ${OUT}/results.json`)
}
console.log(
  `\n${failures.length === 0 ? 'PASS' : 'FAIL'} — ${rows.length} page/viewport measurements, ` +
    `${failures.length} failure(s), ${notMeasured.length} not measured.`,
)
if (consoleErrors.length > 0) {
  console.log(`⚠️ ${consoleErrors.length} console error(s):`)
  for (const e of consoleErrors.slice(0, 5)) console.log(`   ${e}`)
}
for (const n of notMeasured) console.log(`   NOT MEASURED: ${n}`)
console.log(`   screenshots + results: ${OUT}/`)
process.exit(failures.length === 0 ? 0 : 1)
