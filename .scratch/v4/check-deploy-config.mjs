import { chromium } from '@playwright/test'
const REF = 'ayzvjwxbxyrcgyoeaxuk'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const context = browser.contexts()[0]
const page = context.pages().find((p) => p.url().startsWith('https://supabase.com')) ?? await context.newPage()
if (page.url() === 'about:blank') await page.goto('https://supabase.com/dashboard', { waitUntil: 'domcontentloaded' })
const raw = await page.evaluate(() => window.localStorage.getItem('supabase.dashboard.auth.token'))
await browser.close()
const token = JSON.parse(raw).access_token
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `select id, title, starts_at, hidden_at from playdates order by created_at` }),
})
console.log('PLAYDATES', JSON.stringify(await res.json()))
const cfg = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, { headers: { Authorization: `Bearer ${token}` } })
const c = await cfg.json()
console.log('site_url      ', JSON.stringify(c.site_url))
console.log('uri_allow_list', JSON.stringify(c.uri_allow_list))
