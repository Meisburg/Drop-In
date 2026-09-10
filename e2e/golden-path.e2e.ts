/**
 * Spec 2 (V2 ticket 00) — the golden path: signed in as the marker (via
 * the setup project's storageState) → post a drop-in through the V2
 * slice-1 UI (30-minute steppers + duration chips, end computed) → the
 * post appears in the feed → delete the marker's playdate row via REST
 * (anon key from .env + the marker's JWT, which the host-only DELETE
 * policy requires — a plain anon delete is an RLS no-op that PostgREST
 * surfaces as a 2xx, the logged lesson).
 *
 * Cleanup is best-effort (per ticket): a failure here is logged, not
 * fatal — the marker's rows carry the e2e-<epoch> prefix, so the
 * orchestrator's sweep picks stragglers up either way.
 */
import { expect, test } from '@playwright/test'
import { localDatePlusDays, readMarkerMeta, readMarkerSession, readSupabaseEnv, settleOnRoute } from './fixtures'

test('post a drop-in via the V2 slice-1 UI, see it in the feed, clean it up', async ({ page }) => {
  const marker = readMarkerMeta()

  const title = `e2e ${marker.displayName} playground`
  const place = 'E2E marker lot'
  // Tomorrow: always inside the feed's "starts today or later" window.
  const startDate = localDatePlusDays(1)

  await page.goto('/new')
  // A cold load can lose the route to the onboarding-gate race — settle on
  // /new via the app's own navigation once the SPA state is warm.
  await settleOnRoute(page, '/new')

  // Title + place (the form's required text fields).
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page.getByPlaceholder('e.g. Green Lake playground, near the boathouse').fill(place)
  // Neighborhood — one the marker follows (the setup spec's pick).
  await page.locator('select').selectOption({ label: marker.neighborhood })

  // Start: date picker + the 30-minute stepper (V2 slice-1 time entry —
  // the time is stepped, never typed). The stepper starts at 10:00 AM;
  // one + step lands on 10:30 AM, proving the 30-minute grid.
  await page.locator('input[type="date"]').fill(startDate)
  await page.getByRole('button', { name: 'Later start time' }).click()
  await expect(page.getByText('10:30 AM', { exact: true })).toBeVisible()

  // Duration: pick the 1h chip — the end (11:30 AM) is computed, never
  // typed (pinned contract).
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await expect(page.getByText('Ends 11:30 AM')).toBeVisible()

  // Post → the page navigates to / and the feed re-fetches on mount, so
  // the marker's post appears in its own feed (the neighborhood is
  // followed).
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  await expect(page.getByRole('heading', { name: 'Near you' })).toBeVisible()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
})

test.afterEach(async () => {
  // Best-effort cleanup (per ticket): delete the marker's playdate rows
  // via PostgREST. The anon key (from the repo .env) names the project;
  // the marker's access token (read out of the saved storageState)
  // authenticates the host-only DELETE policy. A failure is logged, not
  // fatal — the e2e-<epoch> prefix marks the rows for the orchestrator.
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
    const deleted = del.ok ? ((await del.json()) as Array<Record<string, unknown>>) : []
    const check = await fetch(query, { headers })
    const remaining = check.ok ? ((await check.json()) as Array<Record<string, unknown>>) : null
    if (!del.ok || remaining !== null && remaining.length > 0) {
      console.log(
        `[e2e cleanup] FAILED — delete HTTP ${del.status}, ${deleted.length} row(s) returned, ` +
          `${remaining?.length ?? '?'} remain (marker ${userId}) — orchestrator sweep (e2e- prefix) will pick them up`,
      )
    } else {
      console.log(`[e2e cleanup] ok — deleted ${deleted.length} marker playdate row(s)`)
    }
  } catch (err) {
    console.log(`[e2e cleanup] FAILED (logged, best-effort): ${err instanceof Error ? err.message : err}`)
  }
})