import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
const REF = 'ayzvjwxbxyrcgyoeaxuk'
const file = process.argv[2]
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const context = browser.contexts()[0]
const page = context.pages().find((p) => p.url().startsWith('https://supabase.com')) ?? await context.newPage()
if (page.url() === 'about:blank') await page.goto('https://supabase.com/dashboard', { waitUntil: 'domcontentloaded' })
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
await page.waitForTimeout(2500)
const raw = await page.evaluate(() => window.localStorage.getItem('supabase.dashboard.auth.token'))
await browser.close()
const token = JSON.parse(raw).access_token
const query = readFileSync(file, 'utf8')
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
})
const text = await res.text()
console.log('HTTP', res.status)
console.log(text.slice(0, 800))
