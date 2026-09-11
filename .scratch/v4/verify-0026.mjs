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
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + t.slice(0, 200))
  return JSON.parse(t)
}
console.log('TABLE   ', JSON.stringify(await sql(`select column_name, data_type, is_nullable from information_schema.columns where table_name='ping_kids' order by ordinal_position`)))
console.log('RLS     ', JSON.stringify(await sql(`select relrowsecurity from pg_class where relname='ping_kids'`)))
console.log('POLICIES', JSON.stringify(await sql(`select policyname, cmd, roles::text from pg_policies where tablename='ping_kids' order by policyname`)))
console.log('FKS     ', JSON.stringify(await sql(`select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.ping_kids'::regclass and contype='f' order by conname`)))
console.log('FUNCS   ', JSON.stringify(await sql(`select p.proname, p.prosecdef as secdef, p.provolatile,
    coalesce(array_to_string(p.proacl, ' | '), '(default: PUBLIC)') as acl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('count_kids_going','get_kids_going')`), null, 1))
console.log('COUNTS  ', JSON.stringify(await sql(`select (select count(*) from ping_kids) as ping_kids_rows, (select count(*) from going_pings) as pings`)))
