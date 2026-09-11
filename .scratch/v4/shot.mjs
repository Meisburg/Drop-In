import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
for (const [name, route] of [['login', '/login'], ['public-detail', '/playdate/00000000-0000-0000-0000-000000000000']]) {
  await page.goto('http://127.0.0.1:4173' + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${process.env.OUT}/${name}.png` })
  console.log('shot', name)
}
await browser.close()
