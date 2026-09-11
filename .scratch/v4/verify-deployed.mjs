/**
 * Deployed-site verification (V5). Runs against the real Vercel URL and checks
 * the things that only break in production: the SPA rewrite for shared links,
 * the PWA install surface over HTTPS, and the Google handoff on the deployed
 * origin (which needs the Supabase allowlist to know about it).
 */
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'https://drop-in-mu.vercel.app'
const ID = process.argv[3]
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const out = {}

// 1. A shared link, opened signed-out: must render the drop-in, not the
//    not-found state and not a host 404.
const res = await page.goto(`${BASE}/playdate/${ID}`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 10000 }).catch(() => {})
out.sharedLink = {
  httpStatus: res.status(),
  renderedHeading: (await page.locator('h1').first().textContent().catch(() => null))?.trim() ?? null,
  showsNotFound: await page.getByText('We couldn’t find this drop-in').isVisible().catch(() => false),
  showsSignupPrompt: await page.getByText('Sign up to join in').first().isVisible().catch(() => false),
  hasShareButton: await page.getByRole('button', { name: 'Share' }).isVisible().catch(() => false),
}
await page.screenshot({ path: process.env.OUT + '/deployed-shared-link.png' })

// 2. Install surface over HTTPS.
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 10000 }).catch(() => {})
await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 10000 }).catch(() => {})
const manifest = await page.evaluate(async () => (await (await fetch('/manifest.webmanifest')).json()))
const icons = []
for (const icon of manifest.icons ?? []) {
  const r = await page.request.get(`${BASE}/${icon.src}`)
  icons.push(`${icon.src}:${r.status()}`)
}
out.install = {
  serviceWorkerControls: await page.evaluate(() => navigator.serviceWorker.controller !== null),
  manifestName: manifest.name,
  display: manifest.display,
  icons,
  appleStartupImages: await page.evaluate(() => document.querySelectorAll('link[rel="apple-touch-startup-image"]').length),
  secureContext: await page.evaluate(() => window.isSecureContext),
}

// 3. Google handoff on the deployed origin.
const seen = []
page.on('request', (r) => { if (r.url().includes('/auth/v1/authorize')) seen.push(r.url()) })
await page.getByRole('button', { name: 'Continue with Google' }).click()
await page.waitForURL(/accounts\.google\.com/, { timeout: 20000 }).catch(() => {})
const g = new URL(page.url())
out.google = {
  landedOn: g.host,
  returnedToParam: seen[0] ? decodeURIComponent(new URL(seen[0]).searchParams.get('redirect_to') ?? '') : null,
}

// 4. Cold offline load of the deployed app.
await ctx.setOffline(true)
let offline = null
try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 20000 })
  offline = { title: await page.title(), body: (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim().slice(0, 80) }
} catch (err) { offline = { error: err.message.slice(0, 100) } }
await ctx.setOffline(false)
out.offlineShell = offline

console.log(JSON.stringify(out, null, 1))
await browser.close()
