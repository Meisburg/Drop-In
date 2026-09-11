import { chromium } from '@playwright/test'
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 12000 }).catch(() => {})
await page.evaluate(() => document.fonts.ready)
const info = await page.evaluate(() => {
  const h1 = document.querySelector('h1')
  const wordmark = [...document.querySelectorAll('p')].find((p) => p.textContent === 'Drop In')
  const loaded = [...document.fonts].map((f) => `${f.family} ${f.status}`)
  return {
    headingFontFamily: h1 ? getComputedStyle(h1).fontFamily.slice(0, 46) : null,
    wordmarkFontFamily: wordmark ? getComputedStyle(wordmark).fontFamily.slice(0, 46) : null,
    fontFaceLoaded: document.fonts.check('700 24px "Bricolage Grotesque"'),
    faces: loaded,
  }
})
await page.screenshot({ path: process.env.OUT + '/font-live.png' })
console.log(JSON.stringify(info, null, 1))
await browser.close()
