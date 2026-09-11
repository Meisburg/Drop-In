import { chromium } from '@playwright/test'
const BASE = 'http://127.0.0.1:4173'
const OUT = process.env.OUT ?? '.scratch/v4'
const epoch = Math.floor(Date.now() / 1000)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const settle = async () => { await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 12000 }).catch(() => {}) }
const out = {}

await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await settle()
await page.getByRole('button', { name: 'New here? Create an account' }).click()
await page.locator('input[autocomplete="nickname"]').fill(`e2e-${epoch}`)
await page.locator('input[type="email"]').fill(`e2e-${epoch}@gmail.com`)
await page.locator('input[type="password"]').fill(`e2e-pw-${epoch}`)
await page.getByRole('button', { name: 'Create account' }).click()
await page.getByRole('heading', { name: 'Set your location' }).waitFor({ timeout: 60000 })
await page.getByPlaceholder('e.g. 98107').fill('98103')
await page.locator('select').first().selectOption({ label: '5 miles' })
await page.getByRole('button', { name: /^Continue/ }).click()
await page.getByRole('heading', { name: 'Near you' }).waitFor({ timeout: 60000 })
await page.waitForTimeout(2500)

// --- the card: labelled pill + More info ---
out.card = {
  pillLabel: (await page.getByRole('button', { name: /going/i }).first().textContent().catch(() => null))?.trim() ?? null,
  moreInfoVisible: await page.getByText('More info').first().isVisible().catch(() => false),
  pillHeight: Math.round((await page.getByRole('button', { name: /going/i }).first().boundingBox().catch(() => null))?.height ?? 0),
}
await page.screenshot({ path: `${OUT}/card-affordance.png` })

// --- tapping the pill marks us going ---
await page.getByRole('button', { name: /going/i }).first().click()
await page.waitForTimeout(2500)
out.afterPing = {
  pillLabel: (await page.getByRole('button', { name: /going/i }).first().textContent().catch(() => null))?.trim() ?? null,
  wentLine: (await page.getByText(/going/).first().textContent().catch(() => null))?.trim() ?? null,
}
await page.screenshot({ path: `${OUT}/card-pinged.png` })

// --- detail page: tap the host photo -> full screen ---
const href = await page.locator('a[href^="/playdate/"]').first().getAttribute('href')
await page.goto(BASE + href, { waitUntil: 'networkidle' })
await settle()
await page.waitForTimeout(2000)
out.detailHostIsExpandable = await page.getByRole('button', { name: /photo full screen/i }).first().isVisible().catch(() => false)
await page.getByRole('button', { name: /photo full screen/i }).first().click()
await page.waitForTimeout(600)
out.lightboxOpen = await page.getByRole('dialog').isVisible().catch(() => false)
await page.screenshot({ path: `${OUT}/lightbox.png` })
await page.getByRole('dialog').click({ position: { x: 20, y: 700 } })
await page.waitForTimeout(500)
out.lightboxClosedOnTap = (await page.getByRole('dialog').count()) === 0

// --- the handle still goes to the profile ---
out.handleHref = await page.getByRole('link', { name: /Hosted by/ }).getAttribute('href').catch(() => null)

console.log(JSON.stringify(out, null, 1))
await browser.close()
