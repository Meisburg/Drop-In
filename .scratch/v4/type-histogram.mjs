import { chromium } from '@playwright/test'
const BASE = process.argv[2], ID = process.argv[3]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
for (const route of ['/login', '/playdate/' + ID]) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(500)
  const h = await page.evaluate(() => {
    const out = {}
    for (const el of document.querySelectorAll('p, span, div, a, button, li, label, h1, h2, h3, strong')) {
      const t = (el.textContent ?? '').trim()
      if (!t || el.children.length > 0) continue
      const s = parseFloat(getComputedStyle(el).fontSize)
      out[s] = (out[s] ?? 0) + 1
    }
    return out
  })
  console.log(route, JSON.stringify(Object.fromEntries(Object.entries(h).sort((a,b)=>a[0]-b[0]))))
}
await browser.close()
