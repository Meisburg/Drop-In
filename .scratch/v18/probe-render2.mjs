import { chromium } from '@playwright/test'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, storageState: 'e2e/.auth/marker-state.json' })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', e => errs.push(String(e)))
await p.goto('http://localhost:4173/browse', { waitUntil: 'networkidle', timeout: 60000 })
await p.waitForTimeout(3500)
console.log('url:', p.url())
console.log('place-row count:', await p.locator('[data-testid="place-row"]').count())
console.log('data-photo="real" slots :', await p.locator('[data-testid="place-card-photo"][data-photo="real"]').count())
console.log('data-photo="kind" slots :', await p.locator('[data-testid="place-card-photo"][data-photo="kind"]').count())
console.log('credit labels           :', JSON.stringify(await p.locator('[data-testid="place-card-photo-credit"]').allTextContents()))
const img = p.locator('[data-photo="real"]').first()
if (await img.count()) {
  const info = await img.evaluate(el => ({ src: el.getAttribute('src')?.slice(0,85), complete: el.complete, nw: el.naturalWidth, nh: el.naturalHeight }))
  console.log('img loaded              :', JSON.stringify(info))
} else { console.log('img loaded              : NO real image on page') }
const nested = await p.evaluate(() => { for (const c of document.querySelectorAll('a[data-testid="place-row"]')) if (c.querySelector('a')) return true; return false })
console.log('nested <a> inside card  :', nested)
console.log('page errors             :', errs.length ? errs : 'none')
await b.close()
