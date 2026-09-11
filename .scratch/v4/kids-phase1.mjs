import { chromium } from '@playwright/test'
const BASE = 'http://127.0.0.1:4173'
const OUT = process.env.OUT ?? '.scratch/v4'
const epoch = Math.floor(Date.now() / 1000)
const email = `e2e-${epoch}@gmail.com`
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const settle = async () => { await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 12000 }).catch(() => {}) }
const out = { email }

// --- sign up + onboard ---------------------------------------------------
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await settle()
await page.getByRole('button', { name: 'New here? Create an account' }).click()
await page.locator('input[autocomplete="nickname"]').fill(`e2e-${epoch}`)
await page.locator('input[type="email"]').fill(email)
await page.locator('input[type="password"]').fill(`e2e-pw-${epoch}`)
await page.getByRole('button', { name: 'Create account' }).click()
await page.getByRole('heading', { name: 'Set your location' }).waitFor({ timeout: 60000 })
await page.getByPlaceholder('e.g. 98107').fill('98103')
await page.locator('select').first().selectOption({ label: '5 miles' })
await page.getByRole('button', { name: /^Continue/ }).click()
await page.getByRole('heading', { name: 'Near you' }).waitFor({ timeout: 60000 })
await page.waitForTimeout(2000)

// The marker needs a kid to bring; the SQL insert happens outside (see the
// caller) and the page is reloaded afterwards.
console.log('SEEDED ' + JSON.stringify({ email }))
await ctx.storageState({ path: `${OUT}/marker-state.json` })
await browser.close()
