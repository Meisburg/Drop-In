import { chromium } from '@playwright/test'
const REF = 'ayzvjwxbxyrcgyoeaxuk'
const email = process.argv[2]
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
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + t.slice(0, 250))
  return JSON.parse(t)
}
console.log(JSON.stringify(await sql(`
  insert into public.kids (profile_id, first_name, age)
  select p.id, 'Bernie', 6 from public.profiles p
  join auth.users u on u.id = p.id where u.email = '${email}'
  returning id, first_name, age`)))
console.log(JSON.stringify(await sql(`select count(*) as kids from public.kids k join auth.users u on u.id = k.profile_id where u.email = '${email}'`)))
