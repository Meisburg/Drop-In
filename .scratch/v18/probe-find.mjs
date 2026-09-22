import { chromium } from '@playwright/test'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, storageState: 'e2e/.auth/marker-state.json' })
const p = await ctx.newPage()
await p.goto('http://localhost:4173/browse', { waitUntil: 'networkidle', timeout: 60000 })
await p.waitForTimeout(3000)
// open the overflow door
const seeAll = p.locator('[data-testid="places-see-all"]')
if (await seeAll.count()) { await seeAll.first().click(); await p.waitForTimeout(2000) }
console.log('rows after See all:', await p.locator('[data-testid="place-row"]').count())
console.log('real slots:', await p.locator('[data-photo="real"]').count())
console.log('kind slots:', await p.locator('[data-photo="kind"]').count())
console.log('credits   :', JSON.stringify(await p.locator('[data-testid="place-card-photo-credit"]').allTextContents()))
// is the probe place even in the DOM?
const has = await p.locator('text=Green Lake Community Center').count()
console.log('probe place visible:', has)
const img = p.locator('[data-photo="real"]').first()
if (await img.count()) console.log('img:', JSON.stringify(await img.evaluate(el=>({complete:el.complete,nw:el.naturalWidth,nh:el.naturalHeight,src:el.getAttribute('src')?.slice(0,70)}))))
await b.close()
