/**
 * The OAuth first-timer path, exercised without Google.
 *
 * Found while verifying the cleared blocker: the human's live Google test
 * signed in with an email that ALREADY had an account, so Supabase linked the
 * google identity to it (auth.identities shows the link) and the user went
 * straight to the feed. That means the branch every genuinely NEW parent will
 * hit — session present, no profiles row → "Pick your display name" — was
 * never exercised end to end.
 *
 * This reproduces that exact state: sign up a marker through the real UI, drop
 * its profiles row via SQL (= what an OAuth user arrives with), then drive the
 * app again and check the handle step appears and completes.
 *
 * Usage: node .scratch/v4/verify-handle-step.mjs <phase>
 *   phase 1 (signup)  -> writes .scratch/v4/marker-state.json + prints the email
 *   phase 2 (handle)  -> reuses the saved state, expects the handle step
 */
import { chromium } from '@playwright/test'

const BASE = 'http://127.0.0.1:4173'
const STATE = new URL('./marker-state.json', import.meta.url).pathname
const phase = process.argv[2]

const browser = await chromium.launch()

if (phase === 'signup') {
  const epoch = Math.floor(Date.now() / 1000)
  const email = `e2e-${epoch}@gmail.com`
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="splash"]', { state: 'detached' })
  await page.getByRole('button', { name: /Create an account/ }).click()
  await page.getByLabel('Display name').fill(`e2e marker ${epoch}`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('marker-password-123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('heading', { name: 'Set your location' }).waitFor({ timeout: 60000 })
  await ctx.storageState({ path: STATE })
  console.log(JSON.stringify({ email, reachedLocationStep: true }))
} else {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: STATE,
  })
  const page = await ctx.newPage()
  await page.goto(BASE + '/onboarding', { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="splash"]', { state: 'detached' })
  const handleHeading = await page
    .getByRole('heading', { name: 'Pick your display name' })
    .isVisible()
    .catch(() => false)
  const prefilled = await page.getByLabel('Display name').inputValue().catch(() => null)
  await page.getByLabel('Display name').fill('Handle Step Check')
  await page.getByRole('button', { name: 'Continue' }).click()
  const locationStep = await page
    .getByRole('heading', { name: 'Set your location' })
    .waitFor({ timeout: 60000 })
    .then(() => true)
    .catch(() => false)
  console.log(JSON.stringify({ handleStepShown: handleHeading, prefilled, locationStepAfterSubmit: locationStep }))
}

await browser.close()
