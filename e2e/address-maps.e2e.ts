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
// V25 ticket 05: the card's date words and the Maps href are asserted against
// the app's OWN seams (the house lesson: import the rule, never restate it).
import { formatStartDayLabel, mapsHref } from '../src/lib/feed'
import {
  editTitle,
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
 * Post a drop-in through the /new UI (the golden-path pattern + the V3 slice 5
 * "Address (optional)" field) as the marker (the signed-in default context),
 * then return the feed card's detail href — a real /playdate/:id.
 *
 * `address` is typed into the visible Address field when it is given. When it is
 * null the field is CLEARED instead: /new prefills it from the parent's
 * remembered last post (`useState(placePrefill?.address ?? '')`,
 * NewPlaydatePage.tsx:380), so "left alone" is NOT "no address" — V25 ticket 05's
 * no-address half has to say so out loud.
 *
 * Pre-0021-apply the create 42703s (the address column is missing live):
 * the failure lands HERE, at the post-create step (the form's designed
 * submit error), never a crash.
 */
async function postMarkerDropIn(
  page: Page,
  title: string,
  address: string | null,
): Promise<string> {
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
    .fill(PLACE)
  // V9 ticket 03: the address's MANUAL entry (the pick fills the address;
  // typing one is the adjustment). V25 ticket 05: null means "post with NO
  // address" and therefore CLEARS the field — /new prefills it from the
  // remembered last post, so an untouched field can still carry a street.
  const addressField = page.getByPlaceholder('e.g. 7200 4th Ave NE, near the boathouse')
  await addressField.fill(address ?? '')
  // V9 ticket 01: /new no longer asks for a neighbourhood — nothing to pick.
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  const start = await stepStartTimeOnce(page)
  // V13 ticket 03: no duration chips on /new — the End stepper shows
  // the current end time (start + auto-duration). Verify it's visible.
  await expect(page.getByTestId('end-time-label')).toBeVisible()
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
  const detailPath = await postMarkerDropIn(page, title, ADDRESS)

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

test('the feed card leads with title → day · time, and its address row is a real Maps link OUTSIDE the card link', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} maps card`
  // Posted for TOMORROW on purpose: the card's own day must be a DATE in the
  // founder's reference form ("Sat, Sep 26") and NEVER the section header's
  // relative word — the card also renders on browse, both place pages and a
  // profile's lists, where there is no header to borrow the day from.
  await postMarkerDropIn(page, title, ADDRESS)

  const card = page.getByTestId('dropin-card').filter({ hasText: title }).first()
  await expect(card).toBeVisible()

  // (1) THE CARD'S OWN ANCHOR IS STILL THE DETAIL LINK — and it contains NO
  //     anchor at all. This is the whole nested-link question in one assertion:
  //     an <a> inside the card's <a> is invalid HTML (the browser hoists it out
  //     of the card), so the count must be zero forever.
  const bodyLink = card.locator('a[href^="/playdate/"]')
  await expect(bodyLink).toHaveCount(1)
  await expect(bodyLink.locator('a')).toHaveCount(0)

  // (2) THE ADDRESS ROW: a REAL link (role=link), the app's own href, a new
  //     tab, no referrer leak — and NOT a descendant of the card's anchor.
  const mapsRow = card.getByTestId('card-maps-link')
  await expect(mapsRow).toHaveCount(1)
  await expect(mapsRow).toHaveRole('link')
  await expect(mapsRow).toHaveAttribute('href', MAPS_HREF)
  await expect(mapsRow).toHaveAttribute('href', mapsHref(PLACE, ADDRESS) ?? '')
  await expect(mapsRow).toHaveAttribute('target', '_blank')
  await expect(mapsRow).toHaveAttribute('rel', 'noopener')
  await expect(bodyLink.getByTestId('card-maps-link')).toHaveCount(0)
  // …announced: the accessible name carries the visible address AND the
  // destination (WCAG 2.5.3 — the visible text is inside the name).
  expect(await mapsRow.getAttribute('aria-label')).toContain(ADDRESS)
  // …keyboard-reachable, with the house's focus ring (not just clickable).
  await mapsRow.focus()
  await expect(mapsRow).toBeFocused()

  // (3) THE RENDERED ORDER: title, then the day · time line, then the place,
  //     then the address row — proved by the boxes, not by the JSX order.
  const titleBox = await card.getByRole('heading', { name: title, exact: true }).boundingBox()
  const whenBox = await card.getByTestId('card-when').boundingBox()
  const placeBox = await card.getByTestId('card-place').boundingBox()
  const mapsBox = await mapsRow.boundingBox()
  expect(titleBox).not.toBeNull()
  expect(whenBox).not.toBeNull()
  expect(placeBox).not.toBeNull()
  expect(mapsBox).not.toBeNull()
  expect(whenBox!.y).toBeGreaterThan(titleBox!.y)
  expect(placeBox!.y).toBeGreaterThan(whenBox!.y)
  expect(mapsBox!.y).toBeGreaterThan(placeBox!.y)
  // The 44px tap target the house requires (the row is the whole card width).
  expect(mapsBox!.height).toBeGreaterThanOrEqual(44)

  // (4) THE DAY IS THE DATE the spec posted for, in the app's own words — the
  //     reference's "Sat, Sep 26" form, never the header's "Tomorrow".
  const expectedDay = formatStartDayLabel(localDatePlusDays(1))
  const whenText = (await card.getByTestId('card-when').innerText()).replace(/\s+/g, ' ').trim()
  expect(whenText.startsWith(`${expectedDay} · `), `the card's when line read "${whenText}"`).toBe(
    true,
  )
  expect(whenText).not.toContain('Tomorrow')
  expect(whenText).not.toContain('Today')
  expect(whenText).toMatch(/(AM|PM)/)
  // …and the place line is the place (it stays on the card; only its Maps
  // affordance is new).
  await expect(card.getByTestId('card-place')).toHaveText(PLACE)
})

test('a post with NO address gets no Maps row — the place stays plain text', async ({ page }) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} maps none`
  await postMarkerDropIn(page, title, null)

  const card = page.getByTestId('dropin-card').filter({ hasText: title }).first()
  await expect(card).toBeVisible()

  // The mapsHref null contract: no address → NO link at all, and the place is
  // plain text inside the card's one anchor.
  await expect(card.getByTestId('card-maps-link')).toHaveCount(0)
  await expect(card.locator('a')).toHaveCount(1)
  await expect(card.getByTestId('card-place')).toHaveText(PLACE)
  await expect(card.getByTestId('card-place').locator('a')).toHaveCount(0)

  // The day · time line is there regardless of the address — it is the card's
  // new leading fact, not something the Maps row brought.
  const expectedDay = formatStartDayLabel(localDatePlusDays(1))
  await expect(card.getByTestId('card-when')).toContainText(`${expectedDay} · `)
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