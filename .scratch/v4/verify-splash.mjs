import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()

const t0 = Date.now()
await page.goto(BASE + '/login', { waitUntil: 'commit' })

// 1. the boot splash is painted before the bundle runs
const bootVisible = await page.locator('#boot-splash').count()
await page.waitForSelector('[data-testid="splash"]', { timeout: 5000 })
const splashAppearedAt = Date.now() - t0
await page.screenshot({ path: process.env.OUT + '/splash.png' })

// 2. it goes away on its own, inside the cap
await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 6000 })
const splashGoneAt = Date.now() - t0

// 3. the static boot splash never lingers
const bootLeft = await page.locator('#boot-splash').count()

// 4. the app is actually usable afterwards
const signInVisible = await page.getByRole('button', { name: 'Sign in' }).isVisible()

// 5. in-app navigation does NOT replay the splash
await page.getByRole('button', { name: /Create an account/ }).click()
await page.waitForTimeout(900)
const splashOnNav = await page.locator('[data-testid="splash"]').count()

console.log(JSON.stringify({
  bootSplashInHtml: bootVisible === 1,
  splashAppearedAtMs: splashAppearedAt,
  splashGoneAtMs: splashGoneAt,
  withinCap: splashGoneAt < 2600,
  bootSplashRemoved: bootLeft === 0,
  appUsableAfter: signInVisible,
  splashReplayedOnNav: splashOnNav > 0,
}, null, 1))

await browser.close()
