import { chromium } from '@playwright/test'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, storageState: 'e2e/.auth/marker-state.json' })
const p = await ctx.newPage()
await p.goto('http://localhost:4173/browse', { waitUntil: 'networkidle', timeout: 60000 })
await p.waitForTimeout(2500)
const seeAll = p.getByTestId('places-see-all')
if (await seeAll.count()) { await seeAll.first().click(); await p.waitForTimeout(1500) }
const info = await p.evaluate(() => {
  const slots = [...document.querySelectorAll('[data-testid="place-card-photo"]')]
  const real = slots.filter(s => s.getAttribute('data-photo') === 'real')
  return {
    total: slots.length,
    realCount: real.length,
    realTagNames: real.map(s => s.tagName),
    realHasImgChild: real.map(s => !!s.querySelector('img')),
    creditCount: document.querySelectorAll('[data-testid="place-card-photo-credit"]').length,
  }
})
console.log(JSON.stringify(info, null, 2))
await b.close()
