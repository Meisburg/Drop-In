/**
 * Spec (V3 ticket 07): the card's going circles.
 *
 * The host marker posts a drop-in; a second deterministic marker (viewer,
 * `e2e-v-<epoch>` prefix, a fresh signed-out context — the zip-radius
 * pattern) pings it via the card's "going" check toggle (ticket 06's
 * optimistic write path — the round-trip upserts the going_pings row; the
 * 0010 self-ping trigger allows it, the viewer is not the host). The
 * host's OWN feed card then shows the going line (the ticket pin: own
 * posts keep the line, the host sees who's coming — unlike the ping
 * toggle, which is hidden there): "1 going" + the pinger's circle. The
 * viewer has no avatar → the fallback-initial circle (the display name's
 * first char, upper — "E" for e2e-v-<epoch>; names never surface on
 * cards, the guest list stays on the detail page per ticket 05). One
 * pinger: the "+N" overflow chip is absent (it appears only past the
 * 3-circle cap).
 *
 * Before the host reload the spec waits on the DB: it polls REST
 * going_pings (the broad authenticated SELECT, 0007; the marker's own
 * JWT) until the ping row is visible — the feed's pings fetch is one-shot
 * per load and the product intentionally has no live refresh after a
 * toggle (the parked ticket-07 observation), so a reload that beats the
 * viewer's upsert chain would see an empty feed.
 *
 * Pre-0020-apply this spec is RED by design: listPingsForPosts selects
 * going_pings.created_at (migration 0020), which 42703s on the missing
 * column and the feed page degrades to no going lines (never a crash).
 * It goes green once the orchestrator/verifier applies 0020 live via the
 * dashboard SQL API (the V3.4 evidence step) — the same discipline as
 * host-status.e2e.ts was pre-0016-apply.
 *
 * Cleanup (best-effort per house): the host marker's playdate rows are
 * deleted via REST with the marker's own JWT (host-only DELETE policy);
 * going_pings.playdate_id is ON DELETE CASCADE (0007), so the viewer's
 * ping row goes with the post. The viewer account (e2e-v- prefix, no
 * playdate rows of its own) is left for the orchestrator's sweep (the
 * zip-radius pattern).
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

test('a pinger\'s circle shows on the host\'s own card ("1 going" + initial, no "+N")', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-v-${epoch}`
  const viewerEmail = `e2e-v-${epoch}@gmail.com` // gmail.com: the project rejects example.com
  const viewerPassword = `e2e-v-pw-${epoch}` // in-memory only — never written, never committed
  const title = `e2e ${marker.displayName} going lot`

  // --- The host (the marker's signed-in context) posts a drop-in. ---
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page
    .getByPlaceholder('e.g. Green Lake playground, near the boathouse')
    .fill('E2E going lot')
  await page.locator('select').selectOption({ label: marker.neighborhood })
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  const start = await stepStartTimeOnce(page)
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await expect(page.getByText(`Ends ${start.endLabel(60)}`)).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')

  // No pings yet: the host's own card renders NO going line (count 0 →
  // the line is hidden — "0 going" is not a state). The anchored regex
  // matches the going line's "N going" label only (the card's title also
  // contains the word "going" — an unanchored match would hit the h3).
  const hostCard = page.locator('a').filter({ hasText: title }).first()
  await expect(hostCard).toBeVisible()
  await expect(hostCard.getByText(/^\d+ going$/)).toHaveCount(0)

  // --- The viewer: a second deterministic marker in a FRESH signed-out
  // context (the default context carries the host marker's session). The
  // clean storageState overrides the project's merged marker state. Same
  // home zip as the host (the post sits at the host's zip — distance 0,
  // inside any radius), so the post is in the viewer's radius feed. ---
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

  // The viewer pings the host's post via the card's "going" check toggle
  // (the active state = the write round-tripped; the optimistic flip is
  // authoritative here because there is no concurrent toggle).
  const viewerCard = viewerPage.locator('a').filter({ hasText: title }).first()
  await expect(viewerCard).toBeVisible()
  await viewerCard.getByRole('button', { name: /^Say we’re going to/ }).click()
  await expect(
    viewerCard.getByRole('button', { name: /^Going — tap to take it back$/ }),
  ).toBeVisible()

  // --- Deterministic gate: wait for the ping row to LAND before the host
  // reload. The card's optimistic flip (the assertion above) resolves
  // before the viewer's 4-call upsert chain commits, and the host reload
  // below re-runs the feed's ONE-SHOT pings fetch (no live refresh after
  // a toggle — the product behavior, parked ticket-07 observation). A
  // reload that beats the upsert sees an empty feed and the "1 going"
  // assertion misses its window. Poll REST going_pings (the broad
  // authenticated SELECT, 0007) with the marker's own JWT (the same
  // extraction the cleanup below uses) until the row is visible.
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

  // --- The host's feed: the host's OWN post keeps the going line. The
  // viewer has no avatar → the fallback-initial circle (the display
  // name's first char, upper — "E" for e2e-v-<epoch>; the only
  // span.bg-slate-200 in the card is that circle). ---
  await page.reload()
  await expect(hostCard.getByText('1 going', { exact: true })).toBeVisible()
  await expect(hostCard.locator('span.bg-slate-200')).toHaveText('E')
  // One pinger: no "+N" overflow chip (the chip only appears past the
  // 3-circle cap — buildGoingLine's overflow math, unit-tested).
  await expect(hostCard.getByText(/^\+\d+$/)).toHaveCount(0)

  await viewerContext.close()
})

test.afterEach(async () => {
  // Best-effort cleanup (per house): delete the HOST marker's playdate
  // rows via REST with the marker's own JWT (host-only DELETE policy).
  // going_pings.playdate_id is ON DELETE CASCADE (0007), so the pinger's
  // row is removed with the post. The viewer account (e2e-v- prefix, no
  // playdate rows) is left for the orchestrator's sweep. A failure is
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