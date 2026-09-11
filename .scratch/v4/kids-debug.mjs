import { chromium } from '@playwright/test'
const BASE = 'http://127.0.0.1:4173'
const OUT = process.env.OUT ?? '.scratch/v4'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: `${OUT}/marker-state.json` })
const page = await ctx.newPage()
const settle = async () => { await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 12000 }).catch(() => {}) }

await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await settle()
await page.waitForTimeout(3000)
const href = await page.locator('a[href^="/playdate/"]').first().getAttribute('href')
console.log('card href:', href)
console.log('signed in as:', (await page.locator('header').textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim().slice(0, 60))
await page.goto(BASE + href, { waitUntil: 'networkidle' })
await settle()
await page.waitForTimeout(3000)
console.log('buttons:', JSON.stringify(await page.getByRole('button').allTextContents()))
console.log('h1:', await page.locator('h1').first().textContent().catch(() => null))
await page.screenshot({ path: `${OUT}/kids-detail-debug.png` })
await browser.close()
