import { chromium } from '@playwright/test'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, storageState: 'e2e/.auth/marker-state.json' })
const p = await ctx.newPage()
await p.goto('http://localhost:4173/browse', { waitUntil: 'networkidle', timeout: 60000 })
await p.waitForTimeout(3000)
const info = await p.evaluate(() => {
  const out = []
  for (const card of document.querySelectorAll('a[data-testid="place-row"]')) {
    const inner = card.querySelectorAll('a')
    if (inner.length) {
      out.push({
        cardText: (card.innerText || '').slice(0, 40).replace(/\n/g, ' | '),
        innerAnchors: [...inner].map(a => ({ text: (a.innerText||'').slice(0,30), href: a.getAttribute('href'), testid: a.getAttribute('data-testid') })),
      })
    }
  }
  return out
})
console.log(JSON.stringify(info, null, 2))
await b.close()
