/**
 * Spec (V3 slice 9, ticket 04): the host retention loop.
 *
 * The host marker posts a drop-in (the feed mount after posting runs
 * the fire-and-forget cursor restamp — it lands post-0024-apply;
 * pre-apply it 42703s silently, never a crash). A second deterministic
 * marker (viewer, `e2e-v-<epoch>` prefix, a fresh signed-out context —
 * the zip-radius pattern) pings it via the card's "going" check toggle,
 * and the spec waits on the DB (REST going_pings poll — the
 * card-circles expect.poll gate) until the ping row lands. Then:
 * (a) /u/:handle shows "Hosted 1 drop-in" (SINGULAR — the AC pin; the
 * line depends only on the playdates table, so it is green pre- AND
 * post-apply, and it runs BEFORE the banner assert so the pre-apply
 * failure lands on the banner, never earlier); (b) the host's feed
 * shows the retention banner "1 new families pinged your drop-ins"
 * (count = the pings on the host's OWN posts created after
 * profiles.last_seen_at, the 0024 cursor). Tapping the banner
 * restamps + navigates to /profile (Your posts), and the next feed
 * visit shows no banner (the tap's restamp moved the cursor past the
 * ping).
 *
 * Pre-0024-apply this spec is RED by design (the 0021/0022/0023
 * pattern): the cursor never lands (the restamp 42703s and is
 * swallowed — never a crash), so the banner's count stays 0 and the
 * banner is hidden; the failure lands EXACTLY at the step-5 banner
 * assertion, and the spec completes. It goes green once the
 * orchestrator applies 0024 live (the ticket's CDP step — left
 * unchecked in the ticket until then).
 *
 * Cleanup (best-effort per house): the host marker's playdate rows are
 * deleted via REST with the marker's own JWT (host-only DELETE policy);
 * going_pings cascade per 0007, so the viewer's ping row goes with the
 * post. The viewer account + the marker persist for the sweep.
 */
import { expect, test } from '@playwright/test'
import {
  localDatePlusDays,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
  stepStartTimeOnce,
} from './fixtures'

test('the host retention loop: banner + "Hosted 1 drop-in" line (red by design pre-0024-apply)', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-v-${epoch}`
  const viewerEmail = `e2e-v-${epoch}@gmail.com` // gmail.com: the project rejects example.com
  const viewerPassword = `e2e-v-pw-${epoch}` // in-memory only — never written, never committed
  const title = `e2e ${marker.displayName} retention lot`

  // --- The host (the marker's signed-in context) posts a drop-in. The
  // feed mount after posting runs the fire-and-forget cursor restamp
  // (it lands post-0024-apply; pre-apply it 42703s silently). ---
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page
    .getByPlaceholder('e.g. Green Lake playground, near the boathouse')
    .fill('E2E retention lot')
  await page.locator('select').selectOption({ label: marker.neighborhood })
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  const start = await stepStartTimeOnce(page)
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await expect(page.getByText(`Ends ${start.endLabel(60)}`)).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')

  // --- The viewer: a second deterministic marker in a FRESH signed-out
  // context (the default context carries the host marker's session).
  // Same home zip + radius as the host (the post sits at the host's zip
  // — distance 0, inside any radius), so the post is in the viewer's
  // radius feed. The viewer pings it via the card's "going" check
  // toggle (the active state = the write round-tripped). ---
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

  // The viewer's location step (the same REST write a real user gets).
  await viewerPage.getByRole('heading', { name: 'Set your location' }).waitFor()
  await viewerPage.getByPlaceholder('e.g. 98107').fill(marker.homeZip)
  await viewerPage
    .locator('select')
    .first()
    .selectOption({ label: `${marker.radiusMiles} miles` })
  await viewerPage.getByRole('button', { name: /^Continue/ }).click()
  await viewerPage.getByRole('heading', { name: 'Near you' }).waitFor()

  const viewerCard = viewerPage.locator('a').filter({ hasText: title }).first()
  await expect(viewerCard).toBeVisible()
  await viewerCard.getByRole('button', { name: /^Say we’re going to/ }).click()
  await expect(
    viewerCard.getByRole('button', { name: /^Going — tap to take it back$/ }),
  ).toBeVisible()

  // --- Deterministic gate (the card-circles pattern): wait for the ping
  // row to LAND before the host reload. The feed's cursor-count query is
  // one-shot per load (no live refresh — the product behavior), so a
  // reload that beats the viewer's upsert chain would count 0. Poll REST
  // going_pings (the broad authenticated SELECT, 0007) with the marker's
  // own JWT until the row is visible.
  const { url: restUrl, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const restHeaders: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
  }
  await expect
    .poll(
      async () => {
        // This run's post (newest first — a leftover post from a failed
        // cleanup can't answer the poll with a stale ping row).
        const postQuery =
          `${restUrl}/rest/v1/playdates?host_profile_id=eq.${userId}` +
          `&title=eq.${encodeURIComponent(title)}&order=created_at.desc&limit=1&select=id`
        const postRes = await fetch(postQuery, { headers: restHeaders })
        if (!postRes.ok) throw new Error(`playdates lookup HTTP ${postRes.status}`)
        const posts = (await postRes.json()) as Array<{ id: string }>
        if (posts.length === 0) return 0
        const pingQuery = `${restUrl}/rest/v1/going_pings?playdate_id=eq.${posts[0].id}&select=profile_id`
        const pingRes = await fetch(pingQuery, { headers: restHeaders })
        if (!pingRes.ok) throw new Error(`going_pings poll HTTP ${pingRes.status}`)
        const pings = (await pingRes.json()) as Array<Record<string, unknown>>
        return pings.length
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(1)

  // Give the feed mount's fire-and-forget restamp time to commit (it
  // lands post-0024-apply; pre-apply it never commits — harmless, the
  // banner just stays hidden below).
  await page.waitForTimeout(1500)

  // --- (a) "Hosted 1 drop-in" (SINGULAR — the e2e AC pin). Depends only
  // on the playdates table, so it is green pre- AND post-apply. This
  // runs BEFORE the banner assert: the pre-apply failure must land on
  // the banner, never here. ---
  await page.goto(`/u/${marker.displayName}`)
  await expect(page.getByText('Hosted 1 drop-in', { exact: true })).toBeVisible()

  // --- (b) THE RED POINT PRE-APPLY: a fresh feed load shows the
  // retention banner. Post-apply the count window's baseline is the
  // restamped cursor (set by the step-1 feed mount, before the viewer's
  // ping), so exactly the viewer's ping counts. Pre-0024-apply the
  // cursor never lands (the restamp 42703s, swallowed) -> count 0 ->
  // the banner is hidden; the failure lands EXACTLY here, never a
  // crash. ---
  await page.goto('/')
  await expect(
    page.getByText('1 new families pinged your drop-ins', { exact: true }),
  ).toBeVisible()

  // --- Tap the banner: the restamp (awaited) moves the cursor past the
  // ping + the navigation lands on /profile (Your posts). ---
  await page
    .getByText('1 new families pinged your drop-ins', { exact: true })
    .click()
  await page.waitForURL('/profile')

  // --- The tap's restamp moved the cursor past the ping: the banner is
  // gone on the next feed visit. ---
  await page.goto('/')
  await expect(
    page.getByText('1 new families pinged your drop-ins', { exact: true }),
  ).toHaveCount(0)

  await viewerContext.close()
})

test.afterEach(async () => {
  // Best-effort cleanup (per house): delete the HOST marker's playdate
  // rows via REST with the marker's own JWT (host-only DELETE policy);
  // going_pings cascade per 0007, so the viewer's ping row is removed
  // with the post. The viewer account (e2e-v- prefix, no playdate rows)
  // + the marker persist for the orchestrator's sweep. A failure is
  // logged, not fatal.
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
      console.log(
        `[e2e cleanup] ok — deleted host marker playdate row(s) (host ${userId}); the pinger's going_pings row cascaded with the post`,
      )
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${
        err instanceof Error ? err.message : err
      } — orchestrator sweep (e2e- prefix) will pick stragglers up`,
    )
  }
})
