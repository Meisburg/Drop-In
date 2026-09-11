import { chromium } from '@playwright/test'
const REF = 'ayzvjwxbxyrcgyoeaxuk'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const context = browser.contexts()[0]
const page = context.pages().find((p) => p.url().startsWith('https://supabase.com')) ?? await context.newPage()
if (page.url() === 'about:blank') await page.goto('https://supabase.com/dashboard', { waitUntil: 'domcontentloaded' })
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
await page.waitForTimeout(2500)
const raw = await page.evaluate(() => window.localStorage.getItem('supabase.dashboard.auth.token'))
await browser.close()
const token = JSON.parse(raw).access_token
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }) })
  const t = await res.text()
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + t.slice(0, 300))
  return JSON.parse(t)
}
export { sql }
console.log(JSON.stringify(await sql(`
  select con.conname, pg_get_constraintdef(con.oid) as def
  from pg_constraint con join pg_class c on c.oid = con.conrelid
  where c.relname in ('going_pings','kids','playdates') and con.contype in ('p','f','u')
  order by c.relname, con.conname`), null, 1).slice(0, 2500))
