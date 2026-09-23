/**
 * Spec (V2 ticket 03): zip + radius discovery.
 *
 * (a) V15 T07: the /settings location card is GONE — the marker's /settings
 *     page renders no zip input and no radius select (the location card was
 *     removed; zip is set during onboarding, radius in the browse modal).
 * (b) A host marker (known zip 98107) posts a drop-in; a viewer marker
 *     (different known zip 98007, ~12 mi away, a generous 20-mi radius)
 *     sees the card in its radius feed WITH the "N mi" distance label.
 *
 * Viewer pattern: a SECOND deterministic marker (`e2e-v-<epoch>` prefix,
 * sweepable by the orchestrator) signed up in a fresh context — the
 * default context carries the host marker's session. The viewer's radius
 * is set through the onboarding location step (the same REST write a real
 * user gets). Pre-0012-apply these specs fail (the profiles location
 * columns + zip_codes table don't exist yet) — an expected failure until
 * the orchestrator applies migration 0012 live.
 *
 * Cleanup (best-effort per ticket): the host marker's playdate rows are
 * deleted via REST with the marker's own JWT; the viewer account (no
 * playdate rows of its own) is left for the orchestrator's sweep.
 */
import { expect, test } from '@playwright/test'
import {
  editTitle, localDatePlusDays, readMarkerMeta, readMarkerSession,
  readSupabaseEnv, settleOnRoute, signUpViewer, stepStartTimeOnce,
} from './fixtures'

/** The viewer's location: a known WA zip ~11.5 mi from 98107 + a generous radius. */
const VIEWER_ZIP = '98007'
const VIEWER_RADIUS_LABEL = '20 miles'

test('the marker\'s /settings has no location card (V15 T07)', async ({ page }) => {
  await page.goto('/settings')
  await settleOnRoute(page, '/settings')

  // V15 T07: the location card was removed from /settings — no zip input and
  // no radius select render on this page. The viewer's location step in spec
  // (b) still uses the onboarding "e.g. 98107" placeholder (that one stays).
  await expect(page.getByPlaceholder('e.g. 98107')).toHaveCount(0)
  await expect(page.locator('select')).toHaveCount(0)
})

test('a host marker\'s drop-in reaches a viewer\'s radius feed with an "N mi" label', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta() // the host (the setup spec's marker, home zip 98107)
  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-v-${epoch}`
  const viewerEmail = `e2e-v-${epoch}@gmail.com` // gmail.com: the project rejects example.com
  const viewerPassword = `e2e-v-pw-${epoch}` // in-memory only — never written, never committed

  // The viewer: a second deterministic marker, signed up in a FRESH context
  // (the default context carries the host marker's session). The clean
  // storageState overrides the project's merged marker state so the viewer
  // starts signed-out.
  const viewerContext = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  const viewerPage = await viewerContext.newPage()
  // V20 t06: signup is first + last name + address now — one shared helper
  // (`signUpViewer`) so the form's field list lives in one place.
  await signUpViewer(viewerPage, {
    name: viewerName,
    email: viewerEmail,
    password: viewerPassword,
  })

  // The viewer's location step: a different known zip + a generous radius
  // (the host's post is ~11.5 mi away — inside 20, outside the default 5).
  await viewerPage.getByRole('heading', { name: 'Set your location' }).waitFor()
  await viewerPage.getByPlaceholder('e.g. 98107').fill(VIEWER_ZIP)
  await viewerPage.locator('select').first().selectOption({ label: VIEWER_RADIUS_LABEL })
  await viewerPage.getByRole('button', { name: /^Continue/ }).click()
  await viewerPage.getByRole('heading', { name: 'Near you' }).waitFor()

  // The host (the marker's signed-in context) posts a drop-in — the
  // golden-path pattern (steppers + chips; the neighborhood is a display
  // label, discovery is radius-based).
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  const title = `e2e ${marker.displayName} shared`
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page
    .getByPlaceholder('e.g. Green Lake playground, near the boathouse')
    .fill('E2E shared lot')
  // V9 ticket 01: /new no longer asks for a neighbourhood — nothing to pick.
  // V13 ticket 02: the date + the 30-minute stepper live in the visible "When" section (the disclosure is gone).
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  const start = await stepStartTimeOnce(page)
  // V13 ticket 03: no duration chips on /new — the End stepper shows
  // the current end time (start + auto-duration). Verify it's visible.
  await expect(page.getByTestId('end-time-label')).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')

  // The viewer's radius feed shows the card WITH the "N mi" distance label
  // (integer miles — the pure haversine predicate, unit-tested in feed.ts).
  // The label lives on the card's meta line (the "neighborhood · time · N mi"
  // <p>); scope the check to it — the anchor's textContent glues the host's
  // avatar initial right after "mi", which breaks the \b boundary.
  await viewerPage.reload()
  const card = viewerPage.locator('a').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  await expect(card.locator('p').filter({ hasText: /\d+ mi\b/ })).toBeVisible()

  await viewerContext.close()
})

test.afterEach(async () => {
  // Best-effort cleanup (per ticket): delete the HOST marker's playdate
  // rows via REST with the marker's own JWT (host-only DELETE policy).
  // The viewer account (e2e-v- prefix, no playdate rows) is left for the
  // orchestrator's sweep. A failure is logged, not fatal.
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
