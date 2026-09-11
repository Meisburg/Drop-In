import { chromium } from '@playwright/test'
const REF = 'ayzvjwxbxyrcgyoeaxuk'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const context = browser.contexts()[0]
const page = context.pages().find((p) => p.url().startsWith('https://supabase.com')) ?? await context.newPage()
if (page.url() === 'about:blank') await page.goto('https://supabase.com/dashboard', { waitUntil: 'domcontentloaded' })
const raw = await page.evaluate(() => window.localStorage.getItem('supabase.dashboard.auth.token'))
await browser.close()
const token = JSON.parse(raw).access_token
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  headers: { Authorization: `Bearer ${token}` },
})
if (!res.ok) { console.log('HTTP', res.status, (await res.text()).slice(0, 300)); process.exit(1) }
const c = await res.json()
const KEEP = ['site_url','uri_allow_list','mailer_autoconfirm','external_email_enabled','smtp_admin_email','smtp_host','smtp_port','smtp_user','smtp_sender_name','rate_limit_email_sent','mailer_otp_exp','security_captcha_enabled','external_google_enabled','external_facebook_enabled']
for (const k of KEEP) console.log(k.padEnd(28), JSON.stringify(c[k]))
