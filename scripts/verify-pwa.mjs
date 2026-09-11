/**
 * PWA installability + offline check (V4). The objective is "feels like
 * a phone app on Android + iOS" — that means the manifest must be installable,
 * every advertised icon must actually resolve, the service worker must take
 * control, and a cold offline load must still paint the app shell rather than
 * the browser's error page.
 *
 * Usage: node scripts/verify-pwa.mjs [baseURL]   (default :4173 preview)
 */
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await ctx.newPage()

await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 8000 })

// 1. the service worker registers and takes control (needs a reload to control
//    the page that registered it)
await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 8000 })
const controlled = await page.evaluate(() => navigator.serviceWorker.controller !== null)

// 2. the manifest is real and every icon it advertises resolves
const manifest = await page.evaluate(async () => {
  const res = await fetch('/manifest.webmanifest')
  return res.ok ? await res.json() : null
})
const iconStatus = []
for (const icon of manifest?.icons ?? []) {
  const res = await page.request.get(BASE + '/' + icon.src)
  iconStatus.push(`${icon.src} ${res.status()} ${icon.sizes}${icon.purpose ? ' ' + icon.purpose : ''}`)
}

// 3. iOS standalone + startup-image metadata actually made it into the document
const head = await page.evaluate(() => ({
  appleCapable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute('content') ?? null,
  appleTitle: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content') ?? null,
  startupImages: document.querySelectorAll('link[rel="apple-touch-startup-image"]').length,
  themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
  title: document.title,
}))

// 4. cold offline load: the precache must serve the shell
await ctx.setOffline(true)
let offlineShell = null
try {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 })
  offlineShell = await page.evaluate(() => ({
    title: document.title,
    hasRoot: document.getElementById('root') !== null,
    bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
  }))
} catch (err) {
  offlineShell = { error: err.message.slice(0, 120) }
}
await ctx.setOffline(false)

console.log(JSON.stringify({
  serviceWorkerControls: controlled,
  manifestName: manifest?.name ?? null,
  manifestDisplay: manifest?.display ?? null,
  manifestStartUrl: manifest?.start_url ?? null,
  manifestBackground: manifest?.background_color ?? null,
  icons: iconStatus,
  head,
  offlineShell,
}, null, 1))

await browser.close()