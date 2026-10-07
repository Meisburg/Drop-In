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
 * ⚠️ THE ORIGIN TRAP, AND WHY THIS LANE MUST FAIL LOUDLY. A Playwright
 * `storageState` restores `localStorage` **PER ORIGIN**. The stored marker state
 * was minted at `http://localhost:4191`; pointed at any other port nothing is
 * restored, the app renders SIGNED OUT, and this lane reports tap-target,
 * overflow and shell numbers for the LOGIN PAGE as if they were audit results —
 * its own `:4180` default already produced two `nav is a left rail` failures that
 * do not exist in this tree, because a stale preview was listening there. So the
 * file's origin is compared to `E2E_BASE_URL` BEFORE any browser launches, and
 * the run then proves the SESSION in the browser instead of trusting the blob:
 * `supabase-js` rotates an access token from the stored refresh token, so an
 * `exp` in the past proves nothing and is deliberately NOT checked (a live
 * refresh is allowed to work), but an app that comes up on `/login` is measured
 * nothing. Every "cannot see" path exits 2 = NOT MEASURED (never a pass); exit 1
 * stays reserved for "the app was measured and it is wrong".
 *
 * Remedy when the session is missing or was minted for another origin:
 *   mint the marker on this port: E2E_BASE_URL=<base> npx playwright test e2e/auth.setup.ts e2e/zip-radius.e2e.ts
 *
 * WHAT IT WRITES: nothing but screenshots and a report under
 * `.scratch/signed-in-audit/`. It never writes application data.
 *
 * Usage:
 *   npx vite preview --port 4180 --strictPort &
 *   E2E_BASE_URL=http://localhost:4180 node scripts/signed-in-audit.mjs
 *
 * It needs a signed-in session at `e2e/.auth/marker-state.json` (written by the
 * e2e suite's `auth.setup`). WITHOUT one — or with one minted for another origin
 * — it does not pretend: it prints `NOT MEASURED` and exits 2, because a lane
 * that silently measures nothing is the failure class this repo keeps paying for.
 */
import { chromium } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const BASE = process.env.E2E_BASE_URL ?? process.argv[2] ?? 'http://localhost:4180'
const BASE_ORIGIN = new URL(BASE).origin
const STATE = 'e2e/.auth/marker-state.json'
const OUT = '.scratch/signed-in-audit'
const SHOTS = `${OUT}/screens`
const MD = 768
const REMEDY = `mint the marker on this port: E2E_BASE_URL=${BASE} npx playwright test e2e/auth.setup.ts e2e/zip-radius.e2e.ts`

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
/** Surfaces that had no shell to measure. Distinct from `notMeasured()`, which
 * refuses the whole RUN when it has no signed-in app to look at. */
const unmeasuredSurfaces = []
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
  /**
   * HOW MANY CANDIDATES THIS ROW ACTUALLY LOOKED AT. `small` and `exempt` record
   * only the SUB-44 offenders, so before this counter a row that rendered nothing
   * worth measuring was indistinguishable from a clean row — and the lane printed
   * `PASS — 12 page/viewport measurements, 0 failure(s)` over a feed whose only
   * 44px-relevant link was not on the page at all. An element counts as
   * CONSIDERED once it survives the zero-size and hidden filters below; a skipped
   * element does not. Compliant elements count too — the point is coverage, not
   * offenders.
   */
  let considered = 0
  for (const el of document.querySelectorAll(
    'a[href],button,input,select,textarea,[role="button"],[role="tab"]',
  )) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue
    considered += 1
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
    considered,
    imagesMissingAlt: images.filter((i) => !i.hasAttribute('alt')).length,
    h1: document.querySelectorAll('h1').length,
  }
}

/**
 * NOT MEASURED, and deliberately not a SKIP. Thrown by every state in which this
 * lane has no signed-in app to measure — the shape the trap lane proved in
 * `9de0d47`. Thrown rather than exited so the browser is closed on the way out;
 * the boundary below prints it and exits 2.
 */
class NotMeasured extends Error {}

function notMeasured(reason, detailLines = []) {
  throw new NotMeasured(`${reason}\n${detailLines.map((l) => `  ${l}`).join('\n')}`)
}

/** Print a NotMeasured the way every other "cannot see" path does, then exit 2. */
async function exitNotMeasured(error, browser = null) {
  if (!(error instanceof NotMeasured)) throw error
  if (browser !== null) await browser.close().catch(() => {})
  console.log(`\nNOT MEASURED — ${error.message}`)
  console.log(`  ${REMEDY}`)
  console.log('  Exit 2, deliberately: this lane measured NOTHING, and that is not a pass.')
  process.exit(2)
}

/**
 * The session FILE, checked for the one thing a file can prove: it was minted
 * for the origin this run measures. A `storageState` restores `localStorage`
 * PER ORIGIN, so a mismatch is not a smaller audience — it is a different app
 * (SIGNED OUT, on `/login`), and every number below would be a login-page number
 * reported as an audit result. See the docblock. Called BEFORE any browser
 * launches, so a mismatch costs nothing.
 *
 * The `auth-token` blob is checked for PRESENCE only, never for freshness: an
 * `exp` in the past proves nothing, because `supabase-js` rotates the token from
 * the stored refresh token. The run proves the session itself, below.
 */
function loadMarkerState(baseOrigin) {
  if (!existsSync(STATE)) {
    notMeasured(`no marker session at ${STATE}.`, [
      '⚠️  A Playwright storageState restores localStorage PER ORIGIN: the file must',
      '    have been minted at the origin this run measures, or the app renders SIGNED OUT.',
      '    Run the e2e suite once (its auth.setup writes it), then re-run this lane.',
    ])
  }
  let saved
  try {
    saved = JSON.parse(readFileSync(STATE, 'utf8'))
  } catch (error) {
    notMeasured(`${STATE} is not readable JSON (${String(error).slice(0, 80)}).`)
  }
  const origins = (saved.origins ?? []).map((o) => o.origin)
  if (!origins.includes(baseOrigin)) {
    notMeasured(
      `the stored session is scoped to ${JSON.stringify(origins)} but this run is against ${baseOrigin}.`,
      [
        '⚠️  Playwright restores localStorage PER ORIGIN, so nothing is restored here:',
        '    the app renders SIGNED OUT and this lane would report tap-target, overflow',
        '    and shell numbers for the LOGIN PAGE as if they were audit results. This is',
        '    the origin trap, not a product defect.',
        `    (the session file is ${STATE})`,
      ],
    )
  }
  const hasBlob = (saved.origins ?? []).some((o) =>
    (o.localStorage ?? []).some((item) => item.name.includes('auth-token')),
  )
  if (!hasBlob) {
    notMeasured(`no Supabase session found in ${STATE}.`, [
      'The file exists and its origin matches, but it carries no auth-token blob.',
    ])
  }
  return saved
}

// FIRST LINE, before anything is launched or measured: say which app this run is
// about to measure. A silent target is how a lane measures a sibling checkout's
// build and reports it as a defect in this tree.
console.log(`signed-in-audit against ${BASE}\n`)

mkdirSync(SHOTS, { recursive: true })
let saved
try {
  saved = loadMarkerState(BASE_ORIGIN)
} catch (error) {
  await exitNotMeasured(error)
}
const browser = await chromium.launch({ headless: true, args: ['--headless=new'] })
const rows = []
const consoleErrors = []

// --- The SESSION, proven by the RUN rather than by the file. ----------------
// Rendering is what this lane's numbers depend on, so the proof is rendering: at
// this origin the app must come up SIGNED IN. A restored blob proves nothing
// (`supabase-js` can hold a token PostgREST rejects), and an `exp` check on the
// file is deliberately absent — a live refresh is allowed to work. What IS
// refused is the outcome that would otherwise be measured silently: `/` landing
// on `/login`, which is where `resolveAuthRedirect` sends a signed-out visitor
// (`src/lib/auth.ts`). The 2500 ms settle is the same budget the loop below
// allows each surface.
try {
  const probe = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: saved,
  })
  const probePage = await probe.newPage()
  await probePage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await probePage.waitForTimeout(2500)
  const session = await probePage.evaluate(() => ({
    path: location.pathname,
    hasToken: Object.keys(localStorage).some((k) => k.includes('auth-token')),
  }))
  await probe.close()
  if (session.path.startsWith('/login') || !session.hasToken) {
    notMeasured(`the marker session at ${STATE} did not sign this run in at ${BASE_ORIGIN}.`, [
      `loading ${BASE}/ landed on ${session.path} (auth-token in localStorage: ${session.hasToken}).`,
      'The stored access token lives 3600 s; if it can no longer be refreshed the',
      'session is dropped, so this is an EXPIRED marker, not a product defect.',
    ])
  }
} catch (error) {
  await exitNotMeasured(error, browser)
}

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

    // COVERAGE, PRINTED PER ROW. A green run must show what it LOOKED AT, not
    // only what it found, so every row states its candidate count even when the
    // count is good.
    console.log(`  ·    ${label} considered ${m.considered} target candidate(s)`)

    // A ZERO IS NOT A PASS. A row that evaluated no candidates measured nothing
    // — the same finding as a scan that read no file — so it joins the NOT
    // MEASURED list rather than passing silently.
    if (m.considered === 0) {
      unmeasuredSurfaces.push(`${label} considered 0 target candidates (nothing worth measuring rendered)`)
    }

    // The shell: present, named, and reachable by thumb, with the md switch.
    if (m.nav === null) {
      unmeasuredSurfaces.push(`${label} shell (no nav on this surface)`)
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
const consideredTotal = rows.reduce((n, r) => n + r.considered, 0)
console.log(`\nTARGET CANDIDATES CONSIDERED (per row — what the run actually looked at):`)
for (const r of rows) console.log(`   ${r.viewport} ${r.name}: ${r.considered}`)
console.log(`   total: ${consideredTotal} across ${rows.length} row(s)`)
// NOT MEASURED OUTRANKS PASS. The verdict may only claim PASS when the app was
// measured AND nothing was invisible to the lane; a surface it could not see
// makes the run at best a partial statement, which is what "NOT MEASURED" says.
const verdict =
  unmeasuredSurfaces.length > 0 ? 'NOT MEASURED' : failures.length === 0 ? 'PASS' : 'FAIL'
console.log(
  `\n${verdict} — ${rows.length} page/viewport measurements, ` +
    `${failures.length} failure(s), ${unmeasuredSurfaces.length} not measured.`,
)
if (consoleErrors.length > 0) {
  console.log(`⚠️ ${consoleErrors.length} console error(s):`)
  for (const e of consoleErrors.slice(0, 5)) console.log(`   ${e}`)
}
for (const n of unmeasuredSurfaces) console.log(`   NOT MEASURED: ${n}`)
console.log(`   screenshots + results: ${OUT}/`)
// 1 is "the app was measured and it is wrong"; 2 is "cannot see". They are not
// collapsed: an unmeasurable surface is not evidence that the app is broken, and
// a real failure is not a coverage problem.
process.exit(unmeasuredSurfaces.length > 0 ? 2 : failures.length > 0 ? 1 : 0)
