import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()

const rpc = []
page.on('response', (res) => {
  if (res.url().includes('/auth/v1/authorize')) rpc.push(`${res.status()} ${res.url().slice(0, 80)}`)
})

await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="splash"]', { state: 'detached' })

const google = page.getByRole('button', { name: 'Continue with Google' })
const facebook = page.getByRole('button', { name: 'Continue with Facebook' })
const googleVisible = await google.isVisible()
const facebookVisible = await facebook.isVisible()
const googleHeight = (await google.boundingBox())?.height ?? 0
await page.screenshot({ path: process.env.OUT + '/login-oauth.png' })

// The live check for AC4: with the provider not enabled yet, the button must
// say so in a sentence — never a silent no-op.
await google.click()
await page.waitForTimeout(3500)
const errorText = (await page.locator('p.text-red-600').first().textContent().catch(() => null))?.trim() ?? null
await page.screenshot({ path: process.env.OUT + '/login-oauth-error.png' })

console.log(JSON.stringify({
  googleButton: googleVisible,
  facebookButton: facebookVisible,
  googleButtonHeight: googleHeight,
  authorizeCalls: rpc,
  inlineError: errorText,
}, null, 1))
await browser.close()
