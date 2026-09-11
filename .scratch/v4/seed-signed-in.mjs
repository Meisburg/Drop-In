/**
 * Signs in a throwaway marker against the real project, posts one drop-in, and
 * screenshots the signed-in surfaces at phone size — the only way to actually
 * SEE the feed/card/nav, which the signed-out checks cannot reach.
 *
 * Usage: node .scratch/v4/seed-signed-in.mjs [baseURL]
 * Clean up afterwards: node scripts/sweep-e2e-markers.mjs delete
 */
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173'
const OUT = process.env.OUT ?? '.scratch/v4'
const epoch = Math.floor(Date.now() / 1000)
const email = `e2e-${epoch}@gmail.com`
const displayName = `e2e-${epoch}`

const tomorrow = new Date(Date.now() + 86400000)
const startDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const settle = async () => {
  await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 12000 }).catch(() => {})
}

// --- signup + onboarding -------------------------------------------------
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await settle()
await page.getByRole('button', { name: 'New here? Create an account' }).click()
await page.locator('input[autocomplete="nickname"]').fill(displayName)
await page.locator('input[type="email"]').fill(email)
await page.locator('input[type="password"]').fill(`e2e-pw-${epoch}`)
await page.getByRole('button', { name: 'Create account' }).click()
await page.getByRole('heading', { name: 'Set your location' }).waitFor({ timeout: 60000 })
await page.getByPlaceholder('e.g. 98107').fill('98107')
await page.locator('select').first().selectOption({ label: '5 miles' })
await page.getByRole('button', { name: /^Continue/ }).click()
await page.getByRole('heading', { name: 'Near you' }).waitFor({ timeout: 60000 })

// --- post a drop-in ------------------------------------------------------
await page.goto(BASE + '/new', { waitUntil: 'networkidle' })
await settle()
await page.getByPlaceholder('e.g. Playground time at Green Lake').fill('Playground time at Green Lake')
await page.getByPlaceholder('e.g. Green Lake playground, near the boathouse').fill('Green Lake playground')
await page.getByPlaceholder(/Address/).fill('5900 W Green Lake Way N').catch(() => {})
await page.locator('select').selectOption({ label: 'Ballard' })
await page.locator('input[type="date"]').fill(startDate)
await page.getByRole('button', { name: 'Later start time' }).click()
await page.getByRole('button', { name: '1h', exact: true }).click()
await page.getByRole('button', { name: 'Post drop-in' }).click()
await page.waitForURL(BASE + '/', { timeout: 60000 }).catch(() => {})
await settle()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/signed-in-feed.png`, fullPage: false })

const detailHref = await page.locator('a[href^="/playdate/"]').first().getAttribute('href').catch(() => null)
if (detailHref) {
  await page.goto(BASE + detailHref, { waitUntil: 'networkidle' })
  await settle()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/signed-in-detail.png` })
}

await ctx.storageState({ path: `${OUT}/marker-state.json` })
console.log(JSON.stringify({ email, detailHref, feed: `${OUT}/signed-in-feed.png` }))
await browser.close()
