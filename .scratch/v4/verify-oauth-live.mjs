/**
 * Live OAuth round-trip check (V4 slice 4). What this CAN prove without a
 * Google account: the button hands the browser to Google's real consent
 * screen, carrying the client id and the callback we expect — instead of the
 * raw JSON error page or the "not switched on yet" sentence.
 */
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await ctx.newPage()

await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.waitForSelector('[data-testid="splash"]', { state: 'detached', timeout: 8000 })

const buttons = await page.getByRole('button', { name: /^Continue with/ }).allTextContents()

await page.getByRole('button', { name: 'Continue with Google' }).click()
await page.waitForURL(/accounts\.google\.com|supabase\.co/, { timeout: 20000 })
await page.waitForLoadState('domcontentloaded')

const url = new URL(page.url())
console.log(JSON.stringify({
  socialButtonsRendered: buttons,
  landedOnHost: url.host,
  isGoogleConsent: url.host.endsWith('accounts.google.com'),
  clientId: url.searchParams.get('client_id'),
  supabaseCallback: url.searchParams.get('redirect_uri'),
  returnsTo: url.searchParams.get('redirect_to'),
  scope: url.searchParams.get('scope'),
  bodyLooksLikeJsonError: /^\s*\{/.test((await page.locator('body').innerText()).trim().slice(0, 20)),
}, null, 1))

await browser.close()
