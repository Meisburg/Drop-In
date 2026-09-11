import { chromium } from '@playwright/test'
const BASE = 'http://127.0.0.1:4173'
const OUT = process.env.OUT ?? '.scratch/v4'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: `${OUT}/marker-state.json` })
const page = await ctx.newPage()
const settle = async () => { await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 12000 }).catch(() => {}) }
const out = {}
const pingButton = () => page.getByRole('button', { name: /Attend|Going|confirm/i }).first()

await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await settle(); await page.waitForTimeout(2500)
const href = await page.locator('a[href^="/playdate/"]').first().getAttribute('href')
await page.goto(BASE + href, { waitUntil: 'networkidle' })
await settle(); await page.waitForTimeout(2500)

// --- start clean: if already going, un-ping (cascades the kid rows away) ---
if ((await pingButton().getAttribute('aria-pressed')) === 'true') {
  await pingButton().click()
  await page.waitForTimeout(3500)
}
out.cleanSlateUnpinged = (await pingButton().getAttribute('aria-pressed')) === 'false'

// --- say we're going: the picker should appear, kid UNSELECTED -------------
await pingButton().click()
await page.waitForTimeout(4000)
out.pickerAppears = await page.getByText('Who’s coming with you?').isVisible().catch(() => false)
const chip = page.getByRole('button', { name: /Bernie/ })
out.chipStartsUnselected = (await chip.getAttribute('aria-pressed')) === 'false'

// --- pick the kid ---------------------------------------------------------
await chip.click()
await page.waitForTimeout(3500)
out.chipSelectedAfterTap = (await chip.getAttribute('aria-pressed')) === 'true'
out.namesLine = (await page.getByText('Other kids coming:').first().textContent().catch(() => null))?.trim() ?? null
await page.screenshot({ path: `${OUT}/kids-detail-final.png` })

// --- the feed card carries both numbers ----------------------------------
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await settle(); await page.waitForTimeout(3500)
out.cardLine = (await page.getByText(/going/).first().textContent().catch(() => null))?.trim() ?? null
await page.screenshot({ path: `${OUT}/kids-card-final.png` })

console.log(JSON.stringify(out, null, 1))
await browser.close()
