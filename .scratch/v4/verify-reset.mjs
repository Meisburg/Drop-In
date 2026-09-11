import { chromium } from '@playwright/test'
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()

// --- the request screen -------------------------------------------------
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="splash"]', { state: 'detached' })
const forgotVisible = await page.getByRole('button', { name: 'Forgot password?' }).isVisible()
await page.getByRole('button', { name: 'Forgot password?' }).click()
const resetHeading = await page.getByRole('heading', { name: 'Reset your password' }).isVisible()
const oauthHiddenInReset = (await page.getByRole('button', { name: /^Continue with/ }).count()) === 0
const passwordHiddenInReset = (await page.getByLabel('Password').count()) === 0
await page.screenshot({ path: process.env.OUT + '/reset-request.png' })

await page.getByLabel('Email').fill('e2e-reset-probe@gmail.com')
await page.getByRole('button', { name: 'Send reset link' }).click()
await page.waitForTimeout(4000)
const notice = (await page.locator('p.text-emerald-700').first().textContent().catch(() => null))?.trim() ?? null
const inlineError = (await page.locator('p.text-red-600').first().textContent().catch(() => null))?.trim() ?? null
await page.screenshot({ path: process.env.OUT + '/reset-sent.png' })

// --- the landing screen with no token ----------------------------------
const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const p2 = await fresh.newPage()
await p2.goto(BASE + '/reset-password', { waitUntil: 'networkidle' })
await p2.waitForSelector('[data-testid="splash"]', { state: 'detached' }).catch(() => {})
await p2.waitForTimeout(1500)
const noTokenHeading = (await p2.getByRole('heading').first().textContent().catch(() => null))?.trim() ?? null
await p2.screenshot({ path: process.env.OUT + '/reset-no-token.png' })

console.log(JSON.stringify({
  forgotPasswordOnLogin: forgotVisible,
  resetModeHeading: resetHeading,
  oauthHiddenInReset,
  passwordHiddenInReset,
  noticeAfterSubmit: notice,
  inlineError,
  noTokenScreen: noTokenHeading,
}, null, 1))
await browser.close()
