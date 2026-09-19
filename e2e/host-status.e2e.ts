/**
 * Spec (V3 ticket 02; adapted by V3 ticket 06): host status — the muted
 * state round-trips.
 *
 * The marker (signed in via the setup project, the host of its own post)
 * posts a drop-in, opens its detail page, and sets the status to
 * CANCELLED via the "This is your post" panel (the ONLY status surface —
 * non-hosts + the signed-out view never render the control; the control
 * is On / Cancelled / "End this post now" — the third option was trimmed
 * by ticket 06 + migration 0019 and returned by V12 ticket 03 + migration
 * 0041 as 'ended'): the muted "Cancelled" chip appears on the detail page
 * (next to the title) AND on the feed card (the card re-fetches the row
 * — the DB round-trip), then the marker reverts to ON and the chip is
 * gone (the event stayed in the feed the whole time — no auto-expiry).
 *
 * V12 ticket 03 adds a SECOND test — the "ended" round-trip: the host
 * picks "End this post now" (status='ended') on a FUTURE post. RED until
 * 0041 is applied live (the write hits the live two-value CHECK — the
 * constraint violation text is carried in the REST-probe assertion);
 * green after. The UI half (the third option rendering, the "Ended" chip
 * on the detail page + the owner's Past list) is asserted after the probe,
 * so the failure point pre-apply is the probe, never a test-logic bug.
 *
 * Pre-0016-apply this spec FAILS (the status column does not exist — the
 * panel's write throws, the error line renders instead of the chip): an
 * expected failure until the orchestrator applies migration 0016 live.
 * Pre-0019-apply it STAYS GREEN: 'cancelled' is already allowed by
 * 0016's CHECK (the 0019 trim only re-narrows the CHECK + converts the
 * removed option's rows — 'cancelled' rows are untouched by it).
 *
 * Each spec creates its own marker playdate (the golden-path pattern, so
 * the detail page is a REAL row); best-effort afterEach cleanup deletes
 * the marker's playdate rows via REST (the e2e-<epoch>/title prefix marks
 * stragglers for the orchestrator's sweep).
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  editTitle,
  localDatePlusDays,
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
    .fill('E2E status lot')
  // V9 ticket 01: /new no longer asks for a neighbourhood — nothing to pick.
  // V13 ticket 02: the date + the 30-minute stepper live in the visible "When" section (the disclosure is gone).
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

test('the host sets CANCELLED — the muted state round-trips on the card + detail', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} host-status`
  const detailPath = await postMarkerDropIn(page, title)

  // (a) The marker IS the host — the "This is your post" panel renders the
  // status control (On / Cancelled, the active option filled).
  await page.goto(detailPath)
  await page.getByRole('heading', { name: title, exact: true }).waitFor()
  await expect(page.getByText('This is your post')).toBeVisible()
  await expect(page.getByRole('button', { name: 'On', exact: true })).toBeVisible()
  // The chip is ABSENT while the status is 'on'.
  await expect(page.locator('h1 + span')).toHaveCount(0)

  // (b) Set CANCELLED — the muted chip appears on the detail page (next
  // to the title; the card/info card gray out — the event stays in the
  // feed, it is not removed).
  await page.getByRole('button', { name: 'Cancelled', exact: true }).click()
  await expect(page.locator('h1 + span').getByText('Cancelled', { exact: true })).toBeVisible()

  // (c) The feed card carries the muted state too — a fresh feed load
  // re-fetches the row (the DB round-trip: the write persisted).
  await settleOnRoute(page, '/')
  const card = page.locator('a').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  await expect(card.getByText('Cancelled', { exact: true })).toBeVisible()

  // (d) Revert to ON — the chip is gone (the host can flip back; no
  // auto-expiry anywhere).
  await page.goto(detailPath)
  await page.getByRole('button', { name: 'On', exact: true }).click()
  await expect(page.locator('h1 + span')).toHaveCount(0)
})

/**
 * V12 ticket 03 — the "ended" round-trip: the host ends a FUTURE drop-in early
 * ("End this post now", status='ended'). The REST probe IS the red point
 * pre-0041-apply (the live CHECK is still 0019's two values, so the write
 * comes back as the constraint violation and its text lands in the assertion
 * message); the UI half — the third option rendering, the "Ended" chip on the
 * detail page, and the revert to On — is asserted AFTER the probe, so the
 * pre-apply failure point is the probe, never a test-logic bug. (The post
 * also leaves the feed — the read's .neq('status','ended') — which
 * feed-ended-out.e2e.ts covers from the feed side.)
 */
test('the host ends a FUTURE post early — "End this post now" (V12 t03)', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} host-ended`
  const detailPath = await postMarkerDropIn(page, title)
  const postId = detailPath.slice('/playdate/'.length)

  await page.goto(detailPath)
  await page.getByRole('heading', { name: title, exact: true }).waitFor()
  await expect(page.getByText('This is your post')).toBeVisible()

  // (a) All three options now render (client-side — GREEN even pre-apply: the
  // option constant carries 'ended'; only the DB CHECK is the wall).
  await expect(page.getByRole('button', { name: 'On', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancelled', exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'End this post now', exact: true }),
  ).toBeVisible()

  // (b) The REST probe — pre-0041-apply this expect IS the red capture: the
  // live CHECK is still ('on','cancelled'), so the violation text comes back
  // in the body and lands in the message.
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  const res = await fetch(`${url}/rest/v1/playdates?id=eq.${postId}`, {
    method: 'PATCH',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'ended' }),
  })
  const body = await res.text()
  expect(
    res.ok,
    `the status='ended' write must be accepted (pre-0041-apply this is the expected RED — ` +
      `the live CHECK violation: ${body})`,
  ).toBe(true)

  // (c) The "Ended" chip appears on the detail page (re-fetch after the
  // out-of-band REST write — the app's React state is unaware of it).
  await page.reload()
  await page.getByRole('heading', { name: title, exact: true }).waitFor()
  await expect(page.locator('h1 + span').getByText('Ended', { exact: true })).toBeVisible()

  // (d) The host can bring it back — revert to ON (always CHECK-legal), the
  // chip is gone (no stickiness).
  await page.getByRole('button', { name: 'On', exact: true }).click()
  await expect(page.locator('h1 + span')).toHaveCount(0)
})

test.afterEach(async () => {
  // Best-effort cleanup (per ticket): delete the HOST marker's playdate
  // rows via REST with the marker's own JWT (host-only DELETE policy).
  // A failure is logged, not fatal — the e2e- prefix marks the rows for
  // the orchestrator's sweep.
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