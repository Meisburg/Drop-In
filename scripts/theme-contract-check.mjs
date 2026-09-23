/**
 * Independent verification for V22 slice 14 — the regression the human reported.
 *
 * THE REPORT: the deployed app "defaults to dark mode" and the human expected
 * light. Root cause was that slice 8 used `@media (prefers-color-scheme: dark)`,
 * so the app followed the OS — and the human's desktop is `prefer-dark`.
 *
 * Slice 14's contract: LIGHT IS THE DEFAULT FOR EVERYONE. The OS must no longer
 * decide. Dark applies only when the user flips the switch on /settings, which
 * persists to localStorage and must apply BEFORE the first paint.
 *
 * This probe tests the contract from the OUTSIDE, with a real browser, so it
 * cannot be satisfied by a comment claiming the behaviour.
 *
 * Usage: node scripts/theme-contract-check.mjs [baseURL]
 */
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:4173'
const failures = []
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

const LIGHT_PAGE = 'rgb(251, 247, 244)'
const DARK_PAGE = 'rgb(24, 20, 18)'
const KEY = 'dropin-theme'

const browser = await chromium.launch()

/** Load /login under a given OS preference and stored theme; return painted bg. */
async function load({ osDark, stored }) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: osDark ? 'dark' : 'light',
  })
  if (stored !== undefined) {
    await context.addInitScript(
      ([k, v]) => {
        window.localStorage.setItem(k, v)
      },
      [KEY, stored],
    )
  }
  const page = await context.newPage()
  // Sample the FIRST painted frame. `domcontentloaded` is too late: React
  // mounts and removes #boot-splash almost immediately, so a probe there
  // measures null and proves nothing. Capture the splash's computed background
  // at document_start instead, before any app code runs.
  let splashFirstFrame = null
  await page.addInitScript(() => {
    // Runs before page scripts; wait for <head> to exist then read the CSS once
    // the stylesheet applies. requestAnimationFrame fires after style resolution.
    const read = () => {
      const s = document.getElementById('boot-splash')
      if (s) {
        window.__splashFirstFrame = getComputedStyle(s).backgroundColor
        return
      }
      if (window.__splashProbes === undefined) window.__splashProbes = 0
      if (window.__splashProbes++ < 60) requestAnimationFrame(read)
    }
    requestAnimationFrame(read)
  })
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  splashFirstFrame = await page.evaluate(() => window.__splashFirstFrame ?? null)
  const firstFrame = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
  }))
  await page
    .waitForFunction(() => document.getElementById('boot-splash') === null, { timeout: 5000 })
    .catch(() => {})
  await page.waitForTimeout(700)
  const settled = await page.evaluate(() => {
    const bg = (el) => (el ? getComputedStyle(el).backgroundColor : null)
    const opaque = [...document.querySelectorAll('div,main,section,header')]
      .filter((el) => {
        const p = getComputedStyle(el).position
        return p !== 'fixed' && p !== 'absolute'
      })
      .map((el) => ({ c: bg(el), r: el.getBoundingClientRect() }))
      .filter((x) => x.c && !x.c.includes('rgba(0, 0, 0, 0)'))
    const vw = window.innerWidth
    const vh = window.innerHeight
    const shell = opaque
      .filter((x) => x.r.width >= vw * 0.9 && x.r.height >= vh * 0.5)
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0]
    return {
      attr: document.documentElement.getAttribute('data-theme'),
      pageBg: shell ? shell.c : null,
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    }
  })
  await context.close()
  return { firstFrame, settled, splashFirstFrame }
}

console.log(`theme-contract-check against ${BASE}\n`)

// --- THE REGRESSION THE HUMAN REPORTED -------------------------------------
console.log('1. OS says dark, user has NO preference -> app must be LIGHT')
{
  const r = await load({ osDark: true })
  check(
    'page is LIGHT despite a dark OS',
    r.settled.pageBg === LIGHT_PAGE,
    `page ${r.settled.pageBg} (want ${LIGHT_PAGE})`,
  )
  check('no data-theme attribute is set', r.settled.attr === null, String(r.settled.attr))
}

console.log('\n2. OS says dark, user CHOSE dark -> app must be DARK')
{
  const r = await load({ osDark: true, stored: 'dark' })
  check('page is DARK', r.settled.pageBg === DARK_PAGE, `page ${r.settled.pageBg}`)
  check('data-theme="dark"', r.settled.attr === 'dark', String(r.settled.attr))
}

console.log('\n3. OS says light, user CHOSE dark -> app must be DARK')
{
  const r = await load({ osDark: false, stored: 'dark' })
  check('page is DARK', r.settled.pageBg === DARK_PAGE, `page ${r.settled.pageBg}`)
}

console.log('\n4. Garbage in storage -> app must be LIGHT (light-default contract)')
{
  const r = await load({ osDark: true, stored: 'banana' })
  check('page is LIGHT', r.settled.pageBg === LIGHT_PAGE, `page ${r.settled.pageBg}`)
}

console.log('\n5. NO FLASH: a stored-dark cold load must paint dark on the FIRST frame')
{
  const r = await load({ osDark: false, stored: 'dark' })
  check(
    'data-theme is set before the app bundle runs',
    r.firstFrame.attr === 'dark',
    `first-frame attr: ${String(r.firstFrame.attr)}`,
  )
  check(
    'boot splash first frame is dark, not terracotta',
    r.splashFirstFrame === DARK_PAGE,
    `splash ${r.splashFirstFrame} (want ${DARK_PAGE})`,
  )
}

console.log('\n6. Browser chrome color follows the choice')
{
  const light = await load({ osDark: false })
  const dark = await load({ osDark: false, stored: 'dark' })
  check(
    'theme-color differs between light and dark',
    light.settled.themeColor !== dark.settled.themeColor,
    `light ${light.settled.themeColor} vs dark ${dark.settled.themeColor}`,
  )
}

await browser.close()

if (failures.length > 0) {
  console.log(`\nFAIL — ${failures.length} check(s) failed`)
  process.exit(1)
}
console.log('\nPASS — light is the default for everyone; dark is opt-in and flash-free')
