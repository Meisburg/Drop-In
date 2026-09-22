import { chromium } from '@playwright/test'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } })
await p.goto('file:///home/jmeisburg/Projects/playdate-app/.scratch/v18/review.html', { waitUntil: 'networkidle', timeout: 90000 })
await p.waitForTimeout(6000)
await p.screenshot({ path: '.scratch/v18/evidence/review-sheet-top.png' })
await b.close()
