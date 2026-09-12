/**
 * Spec (V2 ticket 04): comments on events.
 *
 * (a) The marker host posts a drop-in + a comment on its detail page; a
 *     viewer marker (a second deterministic marker, `e2e-v-<epoch>` prefix
 *     — sweepable by the orchestrator) sees the comment in the same thread;
 *     the host deletes it (author delete — the host is the comment's author)
 *     and it is gone for the viewer. All marker JWTs — no service role, no
 *     moderator: the moderator-hide proof is the orchestrator's live check
 *     (markers cannot be moderators — the self-elevation trigger blocks it,
 *     and the CDP postgres path is orchestrator-only).
 * (b) The composer rejects empty bodies client-side (submit disabled) and
 *     caps input at 500 chars (maxLength — a 600-char fill lands at 500).
 *
 * Pre-0013-apply these specs fail (the comments table + RLS don't exist
 * yet) — an expected failure until the orchestrator applies migration 0013
 * live.
 *
 * Cleanup (best-effort per ticket): the host marker's playdate rows are
 * deleted via REST with the marker's own JWT (host-only DELETE policy); the
 * comments cascade via the table's on delete cascade. The viewer account
 * (e2e-v- prefix, no playdate rows) is left for the orchestrator's sweep.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  localDatePlusDays,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
  stepStartTimeOnce,
} from './fixtures'

/** The viewer's location: the MARKER's own zip (the post is in-radius) + default radius. */
const VIEWER_ZIP = '98107'

/** The marker host posts a drop-in through the /new UI (the golden-path pattern). */
async function postMarkerDropIn(page: Page, title: string): Promise<void> {
  const marker = readMarkerMeta()
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page
    .getByPlaceholder('e.g. Green Lake playground, near the boathouse')
    .fill('E2E comments lot')
  await page.locator('select').selectOption({ label: marker.neighborhood })
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  const start = await stepStartTimeOnce(page)
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await expect(page.getByText(`Ends ${start.endLabel(60)}`)).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  await page.getByRole('heading', { name: 'Near you' }).waitFor()
}

/** The most-recent marker playdate id (the marker's own JWT — JWT-safe). */
async function latestMarkerPlaydateId(): Promise<string> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const query = `${url}/rest/v1/playdates?host_profile_id=eq.${userId}&select=id&order=created_at.desc&limit=1`
  const res = await fetch(query, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  })
  expect(res.ok).toBe(true)
  const rows = (await res.json()) as Array<{ id: string }>
  expect(rows.length).toBe(1)
  return rows[0].id
}

test('a comment is visible to a second viewer, then the author’s delete removes it', async ({
  page,
  browser,
}) => {
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e cmt ${epoch}`
  const body = `e2e comment ${epoch} — is the lot open on weekends?`

  // The host (the marker's signed-in context) posts + comments on the
  // detail page (the comment thread — V2 slice 4; 0013 applied).
  await postMarkerDropIn(page, title)
  await page.locator('a').filter({ hasText: title }).first().click()
  await page.locator('#comment-composer').fill(body)
  await page.getByRole('button', { name: 'Comment' }).click()
  const commentLine = page.locator('li', { hasText: body }).first()
  await expect(commentLine).toBeVisible()

  // The viewer: a second deterministic marker in a FRESH context (the
  // default context carries the host marker's session), onboarded through
  // the location step (the same REST write a real user gets).
  const viewerName = `e2e-v-${epoch}`
  const viewerEmail = `e2e-v-${epoch}@gmail.com` // gmail.com: the project rejects example.com
  const viewerPassword = `e2e-v-pw-${epoch}` // in-memory only — never written
  const viewerContext = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  const viewerPage = await viewerContext.newPage()
  await viewerPage.goto('/login')
  await viewerPage.getByRole('button', { name: 'New here? Create an account' }).click()
  await viewerPage.locator('input[autocomplete="nickname"]').fill(viewerName)
  await viewerPage.locator('input[type="email"]').fill(viewerEmail)
  await viewerPage.locator('input[type="password"]').fill(viewerPassword)
  await viewerPage.getByRole('button', { name: 'Create account' }).click()
  await viewerPage.getByRole('heading', { name: 'Set your location' }).waitFor()
  await viewerPage.getByPlaceholder('e.g. 98107').fill(VIEWER_ZIP)
  await viewerPage.locator('select').first().selectOption({ label: '5 miles' })
  await viewerPage.getByRole('button', { name: /^Continue/ }).click()
  await viewerPage.getByRole('heading', { name: 'Near you' }).waitFor()

  // The viewer opens the same event (the detail path — a direct fetch,
  // authenticated-only) and sees the host's comment.
  const playdateId = await latestMarkerPlaydateId()
  await viewerPage.goto(`/playdate/${playdateId}`)
  await expect(viewerPage.locator('li', { hasText: body }).first()).toBeVisible()

  // The host (the comment's author) deletes it — gone for the host...
  await page.locator('li', { hasText: body }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.locator('li', { hasText: body })).toHaveCount(0)
  await expect(page.getByText('No comments yet')).toBeVisible()

  // ...and for the viewer (a reload re-fetches the thread — the row is gone).
  await viewerPage.reload()
  await expect(viewerPage.locator('li', { hasText: body })).toHaveCount(0)

  await viewerContext.close()
})

test('the composer rejects empty bodies and caps input at 500 chars', async ({ page }) => {
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e cmtb ${epoch}`

  await postMarkerDropIn(page, title)
  await page.locator('a').filter({ hasText: title }).first().click()

  const composer = page.locator('#comment-composer')
  await expect(composer).toHaveAttribute('maxlength', '500')
  const submit = page.getByRole('button', { name: 'Comment' })
  await expect(submit).toBeDisabled() // empty body rejected client-side
  await composer.fill('a'.repeat(500))
  await expect(submit).toBeEnabled() // exactly the cap is acceptable
  await composer.fill('b'.repeat(600)) // maxLength truncates the input
  await expect(composer).toHaveValue('b'.repeat(500))
})

test.afterEach(async () => {
  // Best-effort cleanup (per ticket): delete the HOST marker's playdate
  // rows via REST with the marker's own JWT (host-only DELETE policy);
  // the comments cascade via the table's on delete cascade. The viewer
  // account (e2e-v- prefix, no playdate rows) is left for the
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
    const remaining = check.ok
      ? ((await check.json()) as Array<Record<string, unknown>>)
      : null
    if (!del.ok || (remaining !== null && remaining.length > 0)) {
      console.log(
        `[e2e cleanup] FAILED — playdate delete HTTP ${del.status}, ` +
          `${remaining?.length ?? '?'} remain (host ${userId}) — orchestrator sweep (e2e- prefix) will pick them up`,
      )
    } else {
      console.log(`[e2e cleanup] ok — deleted host marker playdate row(s) (host ${userId})`)
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${err instanceof Error ? err.message : err}`,
    )
  }
})