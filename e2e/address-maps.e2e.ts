/**
 * Spec (V3 ticket 08): address + tap-to-Maps link.
 *
 * The host marker posts a drop-in WITH an address (the /new "Address
 * (optional)" field, under place — migration 0021's playdates.address).
 * The detail page's place line becomes a tappable Google Maps link —
 * `https://www.google.com/maps?q=<URL-encoded "place, address">`, new tab
 * (target="_blank"), rel="noopener". The render logic is shared, so the
 * link shows for the HOST (the signed-in detail view) AND in the
 * SIGNED-OUT public view (a FRESH context with a clean storageState — the
 * share-public 8ecdfbf pattern): the public surface gained the address as
 * its 12th field (migration 0021's 11 -> 12 pin change; the signed-out
 * detail read flows through get_public_playdate).
 *
 * Pre-0021-apply this spec is RED by design: the playdates.address column
 * does not exist live yet, so the post-with-address insert 42703s (the
 * unknown column) and the form settles its designed submit error — the
 * failure lands at the POST-CREATE step (below), never a crash. It goes
 * green once the orchestrator/human applies 0021 live via the dashboard
 * SQL API (the V3.5 evidence step) — the same discipline as card-circles
 * was pre-0020-apply.
 *
 * Cleanup (best-effort per house): the host marker's playdate rows are
 * deleted via REST with the marker's own JWT (host-only DELETE policy);
 * the child rows (going_pings, comments) cascade with the post (0007 /
 * 0013 ON DELETE CASCADE). The marker account (e2e- prefix) is left for
 * the orchestrator's sweep (the zip-radius pattern).
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

const PLACE = 'E2E Maps lot'
const ADDRESS = '7200 4th Ave NE, Seattle, WA 98115'

/**
 * The maps href the detail page must render. The spec mirrors the app's
 * own pure seam (feed.mapsHref: the "place, address" query, URL-encoded)
 * — the unit tests in feed.test.ts pin the encoding with literal
 * expected strings.
 */
const MAPS_HREF = `https://www.google.com/maps?q=${encodeURIComponent(`${PLACE}, ${ADDRESS}`)}`

/**
 * Post a drop-in WITH an address through the /new UI (the golden-path
 * pattern + the V3 slice 5 "Address (optional)" field) as the marker
 * (the signed-in default context), then return the feed card's detail
 * href — a real /playdate/:id.
 *
 * Pre-0021-apply the create 42703s (the address column is missing live):
 * the failure lands HERE, at the post-create step (the form's designed
 * submit error), never a crash.
 */
async function postMarkerDropInWithAddress(page: Page, title: string): Promise<string> {
  await page.goto('/new')
  // A cold load can lose the route to the onboarding-gate race — settle on
  // /new via the app's own navigation once the SPA state is warm.
  await settleOnRoute(page, '/new')
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page
    .getByPlaceholder('e.g. Green Lake playground, near the boathouse')
    .fill(PLACE)
  await page.getByPlaceholder('e.g. 7200 4th Ave NE, near the boathouse').fill(ADDRESS)
  // V9 ticket 01: /new no longer asks for a neighbourhood — nothing to pick.
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  const start = await stepStartTimeOnce(page)
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await expect(page.getByText(`Ends ${start.endLabel(60)}`)).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  try {
    await page.waitForURL('/', { timeout: 30_000 })
  } catch {
    // The create did not navigate: it failed. Pre-0021-apply this is the
    // documented RED-by-design (the playdates.address insert 42703s) — the
    // form shows its designed submit error; surface it, never a crash.
    const submitError = await page.locator('p.text-red-600').first().textContent()
    throw new Error(
      `Post create failed (pre-0021-apply RED by design — the playdates.address ` +
        `insert 42703s): ${submitError ?? 'no submit error line rendered'}`,
    )
  }
  const card = page.locator('a').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  const href = (await card.getAttribute('href')) ?? ''
  if (!href.startsWith('/playdate/')) {
    throw new Error(`The feed card for "${title}" has no detail href (got "${href}")`)
  }
  return href
}

/** The link's pinned attributes (ticket 08): href + new tab + no referrer leak. */
async function expectMapsLink(pg: Page) {
  // The place line's link is the ONLY anchor named after the place (the
  // "Hosted by" line is a separate /u/ link — and plain text in the
  // signed-out public view).
  const link = pg.getByRole('link', { name: PLACE, exact: true })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', MAPS_HREF)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener')
}

test('a post with an address shows a tappable Maps link (host view + the signed-out public view)', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} maps`
  const detailPath = await postMarkerDropInWithAddress(page, title)

  // (a) The host's signed-in detail view: the place line is tappable
  // (the shared render logic — the pure mapsHref seam).
  await page.goto(detailPath)
  await page.getByRole('heading', { name: title, exact: true }).waitFor()
  await expectMapsLink(page)

  // (b) The signed-out public view (a FRESH context with a clean
  // storageState — the share-public 8ecdfbf pattern): the 12th field
  // (address, migration 0021's 11 -> 12 pin change) crosses to anon via
  // get_public_playdate, so the link renders there too.
  const anonContext = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  const anonPage = await anonContext.newPage()
  await anonPage.goto(detailPath)
  await expectMapsLink(anonPage)

  await anonContext.close()
})

test.afterEach(async () => {
  // Best-effort cleanup (per house): delete the HOST marker's playdate
  // rows via REST with the marker's own JWT (host-only DELETE policy).
  // The child rows (going_pings, comments) cascade with the post (0007 /
  // 0013 ON DELETE CASCADE). The marker account (e2e- prefix) is left for
  // the orchestrator's sweep. A failure is logged, not fatal. (Pre-
  // 0021-apply the post never existed — this deletes 0 rows.)
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
        `[e2e cleanup] ok — deleted host marker playdate row(s) (host ${userId}); child rows cascaded with the post`,
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