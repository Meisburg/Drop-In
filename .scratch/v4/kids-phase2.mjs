import { chromium } from '@playwright/test'
const BASE = 'http://127.0.0.1:4173'
const OUT = process.env.OUT ?? '.scratch/v4'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: `${OUT}/marker-state.json` })
const page = await ctx.newPage()
const settle = async () => { await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 12000 }).catch(() => {}) }
const out = {}

// --- open a drop-in Jon hosts, say we're going ---------------------------
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await settle()
await page.waitForTimeout(2500)
const href = await page.locator('a[href^="/playdate/"]').first().getAttribute('href')
await page.goto(BASE + href, { waitUntil: 'networkidle' })
await settle()
await page.waitForTimeout(2000)

// Idempotent: only ping if we are not already going (the button toggles).
const pingButton = page.getByRole('button', { name: /Attend|Going|confirm/i }).first()
const alreadyGoing = (await pingButton.getAttribute('aria-pressed')) === 'true'
out.wasAlreadyGoing = alreadyGoing
if (!alreadyGoing) {
  await pingButton.click()
  await page.waitForTimeout(3500)
}

// --- the picker appears because we are going and have a kid --------------
out.pickerHeading = await page.getByText('Who’s coming with you?').isVisible().catch(() => false)
const chip = page.getByRole('button', { name: /Bernie/ })
out.chipVisible = await chip.isVisible().catch(() => false)
if (out.chipVisible) await chip.click()
await page.waitForTimeout(2500)
out.chipPressed = await chip.getAttribute('aria-pressed').catch(() => null)
await page.screenshot({ path: `${OUT}/kids-picker.png` })

// --- the detail now names the kid for someone who is going --------------
out.otherKidsLine = (await page.getByText('Other kids coming:').first().textContent().catch(() => null))?.trim() ?? null
out.pingCountLine = (await page.getByText(/going/).first().textContent().catch(() => null))?.trim() ?? null

// --- and the CARD carries the count -------------------------------------
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await settle()
await page.waitForTimeout(3000)
out.cardLine = (await page.getByText(/going/).first().textContent().catch(() => null))?.trim() ?? null
await page.screenshot({ path: `${OUT}/kids-card.png` })

console.log(JSON.stringify(out, null, 1))
await browser.close()
