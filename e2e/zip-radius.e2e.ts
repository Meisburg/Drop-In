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
  E2E_BASE_URL,
  editTitle, localDatePlusDays, readMarkerMeta, readMarkerSession,
  readSupabaseEnv, settleOnRoute, finishSignup,
  signUpViewer, stepStartTimeOnce,
} from './fixtures'

/**
 * The viewer's location: a known WA zip ~11.5 mi from 98107 + a generous radius. */
const VIEWER_ZIP = '98007'
const VIEWER_RADIUS_LABEL = '20 miles'

/**
 * V29 v29-7: write the MARKER's own radius over PostgREST with its own JWT (the
 * app's own write path + owner policy), asking for no row back — a write whose
 * SELECT policy excludes the actor must never go through RETURNING (the 42501
 * lesson). The same helper `feed-empty-state.e2e.ts` defines; if a THIRD spec
 * needs it, promote it to fixtures.ts rather than copying it again.
 */
async function patchMarkerRadius(radiusMiles: number): Promise<boolean> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const res = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ radius_miles: radiusMiles }),
  })
  return res.ok
}

test("the marker's /settings edits distance but not the home ZIP (V27)", async ({ page }) => {
  // settings-restructure: the radius lives in the Near you category's own screen.
  await page.goto('/settings/near-you')
  await settleOnRoute(page, '/settings/near-you')

  // V15 T07 removed the location CARD (the ZIP editor) from /settings, and that
  // half stands: no zip input renders here and the onboarding "e.g. 98107"
  // placeholder stays off this page. (V28 slice 7a cut that placeholder's
  // toHaveCount(0) pin: the placeholder lives only in the onboarding card,
  // which cannot render on /settings at all — the line was structurally
  // guaranteed true, so its intent now lives in this comment.) V27 re-opens
  // the OTHER half deliberately:
  // the saved discovery radius is now editable in the "Near you" section,
  // writing through the same `updateHomeZipRadius` path the feed uses. This
  // assertion is the pin for that reversal — a future slice that removes the
  // radius control again must update this line, not silently pass.
  await expect(page.getByTestId('settings-radius')).toBeVisible()
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
    baseURL: E2E_BASE_URL,
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

  await finishSignup(viewerPage, {
    homeZip: VIEWER_ZIP,
    radiusMiles: VIEWER_RADIUS_LABEL,
  })

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

/**
 * V29 v29-7 — THE HOST SEES THEIR OWN DROP-IN, WHATEVER THE RADIUS.
 *
 * The radius is a DISCOVERY rule, and it was being applied to the host's own
 * post: a parent who posted at a park across town could not see their own
 * drop-in in their own feed, and the "Posted!" banner did not link to it either.
 * Two independent external reviews hit it (a post 7 miles out vanished from a
 * 5-mile feed).
 *
 * DISCOVERY vs HOSTING, pinned: the chosen place is "Lakeridge Park and
 * Playground", ~12.5 mi from 98107 and the furthest seeded place — "the nearest
 * real place" would have made the 1-mile radius assertion depend on which place
 * sorts first. The post's distance comes from the PLACE's coordinates, not the
 * host's home zip (feed.postDistanceMiles' precedence), which is what makes an
 * own post outside the radius reachable at all.
 *
 * Non-vacuous: at a 1-mile radius the radius filter drops this post, so without
 * the exemption the feed renders the empty state and the card assertion fails.
 */
test('V29 v29-7: the host sees their own drop-in even when it is outside their radius', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} own far post`

  // WIDE FIRST: the place directory is radius-filtered from the viewer's own
  // profile, so at 1 mile it would list nothing and there would be no far place
  // to pick. Patch wide, post, then NARROW and reload — which is also the real
  // story (post from wherever you are, then tighten the radius later).
  expect(await patchMarkerRadius(35)).toBe(true)
  try {
    await page.goto('/new')
    await settleOnRoute(page, '/new')
    await editTitle(page)
    await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
    await page.getByTestId('browse-places').click()
    const sheet = page.getByTestId('place-directory-sheet')
    await expect(sheet).toBeVisible()
    // The sheet's own search field, selected by testid rather than by its
    // placeholder: V30 moved the place-name out of the placeholder and onto the
    // location button, and this spec is about distance, not about that copy.
    await sheet.getByTestId('places-search').fill('Lakeridge')
    const rows = sheet.getByTestId('place-row')
    await expect(rows.first()).toBeVisible()
    await rows.first().click()
    await expect(sheet).toHaveCount(0)
    await page.getByRole('button', { name: 'Post drop-in' }).click()
    await page.waitForURL('/')

    // Now the radius is narrower than the post's own distance from home.
    expect(await patchMarkerRadius(1)).toBe(true)
    await page.reload()
    await settleOnRoute(page, '/')

    // THE CLAIM: the feed is not empty for its own host.
    const card = page.locator('a').filter({ hasText: title }).first()
    await expect(card).toBeVisible()
    await expect(page.getByTestId('empty-radius-state')).toHaveCount(0)
    // …and the distance label proves it really is the far post, not a
    // same-radius neighbour.
    await expect(card.locator('p').filter({ hasText: /\d+ mi\b/ })).toBeVisible()
  } finally {
    // Restore the marker's radius: every other spec reads this row.
    expect(await patchMarkerRadius(marker.radiusMiles)).toBe(true)
  }
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
