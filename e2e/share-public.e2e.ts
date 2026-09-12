/**
 * Spec (V2 ticket 05): share + public event view.
 *
 * (a) A signed-out visitor (a FRESH context with a clean storageState —
 *     the 8ecdfbf pattern) opens a marker playdate's /playdate/:id: the
 *     public surface renders (title, host handle, going count) + the
 *     "Sign up to join in" prompt on the action surfaces, and the comment
 *     thread stays auth-walled (no composer, no comment content).
 * (b) The marker (signed in, the host of its own post) taps Share: the
 *     copy-link fallback (no Web Share sheet in headless Chromium —
 *     navigator.share is undefined) copies `${origin}/playdate/<id>` —
 *     the base falls back to the origin in the preview env (no
 *     VITE_PUBLIC_BASE_URL in .env; deployment stays DECISION 3).
 *
 * Each spec creates its own marker playdate (the golden-path pattern, so
 * the shared URL is a REAL row); best-effort afterEach cleanup deletes
 * the marker's playdate rows via REST (the e2e-<epoch> title prefix marks
 * stragglers for the orchestrator's sweep). Pre-0015-apply spec (a) fails
 * (the get_public_playdate RPC does not exist yet — the public load
 * settles its error state): an expected failure until the orchestrator
 * applies migration 0015 live.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  editTitle,
  localDatePlusDays,
  openMoreOptions,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
  stepStartTimeOnce,
} from './fixtures'

/**
 * Post a drop-in through the V2 slice-1 UI (the golden-path pattern:
 * steppers + chips, end computed) as the marker (the signed-in default
 * context), then return the feed card's detail href — a real /playdate/:id.
 */
async function postMarkerDropIn(page: Page, title: string): Promise<string> {
  await page.goto('/new')
  // A cold load can lose the route to the onboarding-gate race — settle on
  // /new via the app's own navigation once the SPA state is warm.
  await settleOnRoute(page, '/new')
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page
    .getByPlaceholder('e.g. Green Lake playground, near the boathouse')
    .fill('E2E shared lot')
  // V9 ticket 01: /new no longer asks for a neighbourhood — nothing to pick.
  // V9 ticket 03: the date + the 30-minute stepper live behind "More options".
  await openMoreOptions(page)
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  const start = await stepStartTimeOnce(page)
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await expect(page.getByText(`Ends ${start.endLabel(60)}`)).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  const card = page.locator('a').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  const href = (await card.getAttribute('href')) ?? ''
  if (!href.startsWith('/playdate/')) {
    throw new Error(`The feed card for "${title}" has no detail href (got "${href}")`)
  }
  return href
}

test('a signed-out visitor sees the public surface + the sign-up prompt', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} public`
  const detailPath = await postMarkerDropIn(page, title)

  // A FRESH signed-out context (the 8ecdfbf pattern: a clean storageState
  // overrides the project's merged marker state, so the visitor starts
  // signed-out).
  const anonContext = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  const anonPage = await anonContext.newPage()
  await anonPage.goto(detailPath)

  // The public surface: the post content + the neighborhood label + the
  // host's handle (plain text — /u/:handle stays auth-walled) + the going
  // count (zero pings → the "Be the first" line).
  await expect(anonPage.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(anonPage.getByText(`Hosted by @${marker.displayName}`)).toBeVisible()
  await expect(anonPage.getByText('Be the first', { exact: false })).toBeVisible()

  // Every action surface shows the sign-up prompt; the comment thread is
  // auth-walled (no composer, no comment content — the composer's id only
  // exists in the signed-in view).
  await expect(anonPage.getByText('Sign up to join in').first()).toBeVisible()
  await expect(anonPage.locator('#comment-composer')).toHaveCount(0)

  await anonContext.close()
})

test('sharing a drop-in copies the origin-based URL (preview fallback)', async ({ page }) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} shared-link`
  const detailPath = await postMarkerDropIn(page, title)
  const playdateId = detailPath.split('/').pop() ?? ''

  // The marker IS the host of its own post — the host sees the "This is
  // your post" panel, but the Share button renders on the info card for
  // every viewer, host included (a host sharing their post is the real
  // distribution flow).
  await page.goto(detailPath)
  await page.getByRole('heading', { name: title, exact: true }).waitFor()

  // The copy-link fallback needs the clipboard (granted explicitly — the
  // fallback writes via navigator.clipboard and the spec reads it back).
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Share', exact: true }).click()

  // The fallback's "Copied" confirmation (headless Chromium has no Web
  // Share sheet — navigator.share is undefined, so the fallback runs).
  await expect(page.getByText('Copied', { exact: true })).toBeVisible()

  // The copied URL is the origin-based one (no VITE_PUBLIC_BASE_URL in the
  // preview env — the pinned fallback, placeholder-safe before deployment).
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  const origin = new URL(page.url()).origin
  expect(copied).toBe(`${origin}/playdate/${playdateId}`)
})

test.afterEach(async () => {
  // Best-effort cleanup (per ticket): delete the HOST marker's playdate
  // rows via REST with the marker's own JWT (host-only DELETE policy).
  // A failure is logged, not fatal — the e2e-<epoch> prefix marks the rows
  // for the orchestrator's sweep.
  try {
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken, userId } = readMarkerSession()
    const query = `${url}/rest/v1/playdates?host_profile_id=eq.${userId}&select=id`
    const headers: Record<string, string> = {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    }
    const del = await fetch(query, { method: 'DELETE', headers })
    const check = await fetch(query, { headers })
    const remaining = check.ok ? ((await check.json()) as Array<Record<string, unknown>>) : null
    if (!del.ok || (remaining !== null && remaining.length > 0)) {
      console.log(
        `[e2e cleanup] FAILED — playdate delete HTTP ${del.status}, ` +
          `${remaining?.length ?? '?'} remain (host ${userId}) — orchestrator sweep (e2e- prefix) will pick them up`,
      )
    } else {
      console.log(`[e2e cleanup] ok — deleted host marker playdate row(s) (host ${userId})`)
    }
  } catch (err) {
    console.log(`[e2e cleanup] FAILED (logged, best-effort): ${err instanceof Error ? err.message : err}`)
  }
})