import { chromium } from '@playwright/test'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 390, height: 844 } })
const errs = []
p.on('pageerror', e => errs.push(String(e)))
await p.goto('http://localhost:4173/browse', { waitUntil: 'networkidle', timeout: 60000 })
await p.waitForTimeout(2500)
const real = await p.locator('[data-testid="place-card-photo"][data-photo="real"]').count()
const kind = await p.locator('[data-testid="place-card-photo"][data-photo="kind"]').count()
const credits = await p.locator('[data-testid="place-card-photo-credit"]').allTextContents()
console.log('data-photo="real" slots :', real)
console.log('data-photo="kind" slots :', kind)
console.log('credit labels           :', JSON.stringify(credits))
// the image really loaded (naturalWidth > 0) vs a broken image
const img = p.locator('[data-photo="real"]').first()
if (await img.count()) {
  const info = await img.evaluate(el => ({ src: el.getAttribute('src')?.slice(0,80), complete: el.complete, nw: el.naturalWidth, nh: el.naturalHeight }))
  console.log('img loaded              :', JSON.stringify(info))
}
// nested-anchor check: an <a> inside the card's <a> is invalid HTML
const nested = await p.evaluate(() => {
  for (const card of document.querySelectorAll('a[data-testid="place-row"]')) {
    if (card.querySelector('a')) return true
  }
  return false
})
console.log('nested <a> inside card  :', nested)
console.log('page errors             :', errs.length ? errs : 'none')
await b.close()
