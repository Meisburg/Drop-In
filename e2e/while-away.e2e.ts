/**
 * Spec (V8 ticket 03): the "While you were away" inbox — the feed-top card
 * that replaced the dead-end amber banner.
 *
 * The flow (the ticket's e2e AC):
 *  1. The host marker posts a drop-in (the feed mount after posting runs the
 *     fire-and-forget cursor restamp, so profiles.last_seen_at is established
 *     BEFORE any news exists — the pre-0024-apply red point is documented in
 *     host-retention.e2e.ts, which owns the cursor's own assertions).
 *  2. A second deterministic marker (viewer, `e2e-v-<epoch>` prefix, a fresh
 *     signed-out context — the host-retention / zip-radius pattern) pings that
 *     drop-in through the card's "going" toggle, gated on the DB (a REST
 *     going_pings poll — the card-circles expect.poll pattern).
 *  2b. The viewer also comments on a SECOND post of the host's, so the
 *     comments kind (`1 new comment on "<title>"`) is exercised live in the
 *     same feed load. (On one post the two kinds would dedupe into a single
 *     item — that rule is the unit tests' subject, not this spec's.)
 *  3. The host's feed shows the inbox, NAMING the viewer: the item's copy is
 *     the pinned template (`1 family is going to "<title>"` — singular at 1)
 *     and the family itself rides on the face circle (alt + title +
 *     aria-label), because the copy carries no name by design.
 *  4. Tapping the item restamps the cursor (awaited) and lands on that post's
 *     /playdate/:id.
 *  5. Back on the feed BOTH items are gone — the cursor moved past the ping
 *     and the comment (no new "read" flag: opening the inbox IS the
 *     dismissal).
 *  6. The cancellation kind, end to end: the host cancels the drop-in the
 *     viewer said they'd go to (REST-gated on status=eq.cancelled), and the
 *     VIEWER's feed carries `"<title>" was cancelled — you said you'd go` —
 *     the "don't drive to an empty park" line, with no push infrastructure.
 *     (Cancellations are gated on the drop-in still being ahead, not on the
 *     cursor — see buildWhileAwayItems: the schema records no cancellation
 *     timestamp, so a cursor gate would hide exactly the news that matters.)
 *
 * Cleanup (best-effort per house): the host marker's playdate rows are deleted
 * via REST with the marker's own JWT (host-only DELETE policy); going_pings
 * cascade per 0007 and the viewer's ping row goes with the post. The viewer
 * account + the marker persist for the orchestrator's sweep.
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
  type MarkerMeta,
} from './fixtures'

/**
 * Post one drop-in through the /new UI as the marker (the golden-path /
 * host-status pattern: steppers + chips, the end time computed) and land back
 * on the feed.
 */
async function postDropIn(
  page: Page,
  marker: MarkerMeta,
  title: string,
  place: string,
): Promise<void> {
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page.getByPlaceholder('e.g. Green Lake playground, near the boathouse').fill(place)
  await page.locator('select').selectOption({ label: marker.neighborhood })
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  const start = await stepStartTimeOnce(page)
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await expect(page.getByText(`Ends ${start.endLabel(60)}`)).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
}

test('the while-away inbox names who did what, opens the post, and clears', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-v-${epoch}`
  const viewerEmail = `e2e-v-${epoch}@gmail.com` // gmail.com: the project rejects example.com
  const viewerPassword = `e2e-v-pw-${epoch}` // in-memory only — never written, never committed
  // TWO of the host's posts, so BOTH item kinds surface in one feed load: the
  // pinged one (the pings kind) and the commented one (the comments kind —
  // the same post would be deduped into a single item, which is the unit
  // test's job, not this spec's).
  const title = `e2e ${marker.displayName} while-away lot`
  const commentedTitle = `e2e ${marker.displayName} while-away comment lot`
  const commentBody = `e2e while-away comment ${epoch} — we may be late`

  // --- 1. The host posts two drop-ins: one the viewer will ping, one the
  // viewer will comment on (both AFTER the cursor gets established — the feed
  // mount of the first post does that). ---
  await postDropIn(page, marker, title, 'E2E while-away lot')
  await postDropIn(page, marker, commentedTitle, 'E2E while-away comment lot')

  // --- 2. The viewer: a fresh signed-out context (the default context
  // carries the host marker's session). Same home zip + radius as the host
  // (the post sits at the host's zip — distance 0, inside any radius), so
  // the post is in the viewer's radius feed. The viewer pings it with the
  // card's "going" toggle (the active state = the write round-tripped). ---
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

  // ...and comments on the OTHER post (the comments kind's live input).
  await viewerPage.locator('a').filter({ hasText: commentedTitle }).first().click()
  await viewerPage.waitForURL(/\/playdate\//)
  await viewerPage.locator('#comment-composer').fill(commentBody)
  await viewerPage.getByRole('button', { name: 'Comment' }).click()
  await expect(viewerPage.locator('li', { hasText: commentBody }).first()).toBeVisible()

  // --- 3. Deterministic gate (the card-circles / host-retention pattern):
  // wait for the ping row to LAND before the host reloads, and read back this
  // run's post id for the /playdate/:id assertion. The inbox's reads are
  // one-shot per load (no live refresh — the product behavior), so a reload
  // that beats the viewer's upsert chain would show no news. ---
  const { url: restUrl, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const restHeaders: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
  }
  /** This run's post id for `title` (newest first: a leftover post from a
   * failed cleanup can never answer a poll with a stale row). */
  async function latestPostIdFor(postTitle: string): Promise<string | null> {
    const query =
      `${restUrl}/rest/v1/playdates?host_profile_id=eq.${userId}` +
      `&title=eq.${encodeURIComponent(postTitle)}&order=created_at.desc&limit=1&select=id`
    const res = await fetch(query, { headers: restHeaders })
    if (!res.ok) throw new Error(`playdates lookup HTTP ${res.status}`)
    const rows = (await res.json()) as Array<{ id: string }>
    return rows[0]?.id ?? null
  }

  /** How many rows a REST select returns (the ping / comment landing gate). */
  async function countRows(query: string): Promise<number> {
    const res = await fetch(query, { headers: restHeaders })
    if (!res.ok) throw new Error(`REST poll HTTP ${res.status}`)
    return ((await res.json()) as unknown[]).length
  }

  let postId = ''
  await expect
    .poll(
      async () => {
        const id = await latestPostIdFor(title)
        if (id === null) return 0
        postId = id
        return countRows(`${restUrl}/rest/v1/going_pings?playdate_id=eq.${id}&select=profile_id`)
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(1)

  let commentedPostId = ''
  await expect
    .poll(
      async () => {
        const id = await latestPostIdFor(commentedTitle)
        if (id === null) return 0
        commentedPostId = id
        return countRows(`${restUrl}/rest/v1/comments?playdate_id=eq.${id}&select=id`)
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(1)
  // The two kinds must live on DIFFERENT posts here: on one post they would
  // dedupe into a single item (the unit-tested rule), and this spec asserts
  // both items.
  if (commentedPostId === postId) {
    throw new Error('the commented post resolved to the pinged post — the spec needs two posts')
  }

  // Give the host's feed-mount restamp (fire-and-forget) time to commit — it
  // must land BEFORE the ping for the ping to read as news post-apply.
  await page.waitForTimeout(1500)

  // --- 4. The host's feed shows the inbox, naming the viewer: the pinned
  // copy carries the count at 1 (the ping-count AC, moved here from the old
  // banner) and the viewer's own name rides on the face circle. ---
  const pingNews = `1 family is going to "${title}"`
  const commentNews = `1 new comment on "${commentedTitle}"`
  await page.goto('/')
  await expect(page.getByText(pingNews, { exact: true })).toBeVisible()
  await expect(page.getByTitle(viewerName)).toBeVisible()
  // The comments kind, live: the viewer's comment on the OTHER post is news
  // too (a different post, so nothing is deduped away here).
  await expect(page.getByText(commentNews, { exact: true })).toBeVisible()

  // --- 5. An item tap opens that post's detail page (the V8 tap target —
  // the old banner went to /profile, which named nobody). ---
  await page.getByText(pingNews, { exact: true }).click()
  await page.waitForURL(`/playdate/${postId}`)

  // --- 6. The tap's restamp moved the cursor past the ping: the next feed
  // visit shows no ping news (the card is gone — dismissed by opening it). ---
  await page.goto('/')
  await expect(page.getByText(pingNews, { exact: true })).toHaveCount(0)
  await expect(page.getByText(commentNews, { exact: true })).toHaveCount(0)

  // --- 7. The cancellation kind: the host cancels the drop-in the viewer
  // said they'd go to (the same control host-status.e2e.ts pins), REST-gated
  // so the viewer's reload cannot beat the write. ---
  await page.goto(`/playdate/${postId}`)
  await page.getByRole('heading', { name: title, exact: true }).waitFor()
  await page.getByRole('button', { name: 'Cancelled', exact: true }).click()
  await expect(page.locator('h1 + span').getByText('Cancelled', { exact: true })).toBeVisible()
  await expect
    .poll(
      async () => {
        const statusQuery = `${restUrl}/rest/v1/playdates?id=eq.${postId}&select=status`
        const res = await fetch(statusQuery, { headers: restHeaders })
        if (!res.ok) throw new Error(`playdate status poll HTTP ${res.status}`)
        const rows = (await res.json()) as Array<{ status: string }>
        return rows[0]?.status ?? ''
      },
      { timeout: 10_000 },
    )
    .toBe('cancelled')

  // The viewer's feed (a cold load: the viewer's cursor never gates a
  // cancellation) carries the "don't drive to an empty park" line. ---
  await viewerPage.goto('/')
  await expect(
    viewerPage.getByText(`"${title}" was cancelled — you said you'd go`, { exact: true }),
  ).toBeVisible()

  // --- 8. Revert to ON so the swept marker leaves no cancelled straggler
  // (best-effort; the afterEach deletes the row either way). ---
  await page.getByRole('button', { name: 'On', exact: true }).click()

  await viewerContext.close()
})

test.afterEach(async () => {
  // Best-effort cleanup (per house): delete the HOST marker's playdate rows
  // via REST with the marker's own JWT (host-only DELETE policy); going_pings
  // cascade per 0007, so the viewer's ping row is removed with the post. The
  // viewer account (e2e-v- prefix, no playdate rows) + the marker persist for
  // the orchestrator's sweep. A failure is logged, not fatal.
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
