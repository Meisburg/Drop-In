/**
 * r3-9: the /new form's DRAFT (option B — the founder's 2026-10-04 decision).
 * The founder left mid-form, and a parent must find their work when they
 * come back: the draft (sessionStorage, keyed to the signed-in user) is
 * restored + disclosed on the return, and a successful post clears it.
 *
 * THE FLOW MIRRORS THE REAL EXIT: the marker host has no kids, so the kids
 * section's no-kids empty state renders its "Add kids" link to /settings —
 * the very exit the founder took (kids first, then back). Leaving /new
 * while the form is dirty persists the draft; returning to /new restores it.
 *
 * FIXTURE CONVENTION (docs/agents/e2e-fixture-convention.md): cleanup mirrors
 * quick-post — a best-effort REST DELETE of the marker's playdate rows with
 * the marker's own JWT (the host-only DELETE policy requires it). A failure
 * is logged, not fatal: the marker's `e2e-` account prefix marks the rows
 * for the batch-end sweep (scripts/sweep-e2e-markers.mjs).
 */
import { expect, test } from '@playwright/test'
import {
  editTitle,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'
const ADDRESS_PLACEHOLDER = 'e.g. 7200 4th Ave NE, near the boathouse'

test('leaving /new mid-form keeps a draft; returning restores it (disclosure); posting clears it', async ({ page }) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} drafted at the boathouse`
  const place = 'E2E drafted boathouse lot'
  const address = '7200 4th Ave NE, near the boathouse'

  // 1 — OPEN /new AND FILL IT. The title input sits behind the summary's
  // read-back line (V9 ticket 03), so it is tapped into edit mode first —
  // the same door quick-post opens.
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(place)
  await page.getByPlaceholder(ADDRESS_PLACEHOLDER).fill(address)

  // 2 — LEAVE MID-FORM. The marker host has no kids, so the kids section's
  // no-kids empty state renders its "Add kids" link — the founder's exit.
  // (If the marker ever gains kids the link disappears, and the spec fails
  // loudly here: a spec that cannot leave the form cannot test a draft.)
  await expect(page.getByRole('link', { name: 'Add kids' })).toBeVisible()
  await page.getByRole('link', { name: 'Add kids' }).click()
  await settleOnRoute(page, '/settings')

  // 3 — RETURN TO /new. A cold load in the SAME tab, so sessionStorage
  // (the draft's home) survives. The draft comes back with its disclosure.
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await expect(page.getByTestId('draft-restore-notice')).toBeVisible()
  await editTitle(page)
  await expect(page.getByPlaceholder(TITLE_PLACEHOLDER)).toHaveValue(title)
  await expect(page.getByPlaceholder(PLACE_PLACEHOLDER)).toHaveValue(place)
  await expect(page.getByPlaceholder(ADDRESS_PLACEHOLDER)).toHaveValue(address)

  // 4 — POST IT. The successful create clears the draft: the NEXT /new opens
  // empty and shows no disclosure. (The "Post again" card is a tap, not an
  // auto-apply — applyLastPost only runs on the control's own click, so it
  // cannot re-dirty this visit.)
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()

  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await expect(page.getByTestId('draft-restore-notice')).toHaveCount(0)
  await editTitle(page)
  await expect(page.getByPlaceholder(TITLE_PLACEHOLDER)).toHaveValue('')
})

test.afterEach(async () => {
  // Best-effort cleanup (the golden-path pattern, mirrored from quick-post):
  // delete the marker's playdate rows via PostgREST with the marker's own
  // JWT (the host-only DELETE policy requires it). A failure is logged, not
  // fatal — the e2e- prefix marks the rows for the sweep.
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
    if (!del.ok || (remaining !== null && remaining.length > 0)) {
      console.log(
        `[e2e cleanup] FAILED — delete HTTP ${del.status}, ${deleted.length} row(s) returned, ` +
          `${remaining?.length ?? '?'} remain (marker ${userId}) — orchestrator sweep (e2e- prefix) will pick them up`,
      )
    } else {
      console.log(`[e2e cleanup] ok — deleted ${deleted.length} marker playdate row(s)`)
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${err instanceof Error ? err.message : err}`,
    )
  }
})