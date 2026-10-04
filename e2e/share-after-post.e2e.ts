/**
 * V27 slice 4 — the one-tap share prompt after posting.
 *
 * The contract (plan.md "Slice 4: the share prompt after posting"):
 *
 *  1. Posting on `/new` lands on `/` (the URL stays exactly `/` — router
 *     STATE, never a query, so every existing `waitForURL('/')` spec still
 *     matches) and the feed shows the just-posted banner naming the post.
 *  2. The banner's Share uses the same seam the detail page uses
 *     (`db.getShareUrl` → the pure `buildShareUrl`): headless Chromium has no
 *     Web Share sheet (`navigator.share` is undefined), so the clipboard
 *     fallback runs and the button reads "Copied".
 *  3. Dismiss removes the banner, and it is NOT persistent: a plain reload of
 *     `/` shows nothing (the prompt is one-shot router state, cleared on
 *     dismiss).
 *
 * Cleanup mirrors post-again.e2e.ts: a best-effort REST delete of the
 * marker's playdate rows with the marker's own JWT (the host-only DELETE
 * policy is the wall); the `e2e-<epoch>` title prefix marks any straggler for
 * the orchestrator's sweep.
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

test('posting shows a dismissible share banner that is not persisted', async ({ page }) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} share banner`

  // Post through the /new UI (the golden path): the page seeds the generated
  // title, but we assert on OUR title, so open the read-back and write it.
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill('E2E Share park')
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')

  // The banner names the just-posted drop-in.
  const banner = page.getByTestId('just-posted-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText(title)

  // The copy-link fallback needs the clipboard (granted explicitly — the
  // fallback writes via navigator.clipboard). Headless Chromium has no Web
  // Share sheet, so `navigator.share` is undefined and the fallback runs.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await banner.getByRole('button', { name: 'Share' }).click()
  await expect(banner.getByText('Copied', { exact: true })).toBeVisible()

  // Dismiss removes the banner.
  await banner.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByTestId('just-posted-banner')).toHaveCount(0)

  // …and it is never persisted: a plain load of `/` (no router state) shows
  // no banner.
  await page.reload()
  await expect(page.getByTestId('just-posted-banner')).toHaveCount(0)
})

/**
 * V29 v29-3 — THE RELOAD, WITHOUT DISMISSING FIRST.
 *
 * The test above reloads only AFTER dismissing, so it could not see the defect:
 * the banner reads router state, router state IS `history.state`, and
 * `history.state` survives a reload. A parent who refreshed the feed was told
 * again that they had just posted — a stale notice that reads as a second event.
 *
 * One banner per post is the rule, so this is its pin, and the banner's link to
 * the post it announces is pinned in the same breath.
 */
test('the banner does not survive a reload when it was never dismissed', async ({ page }) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} banner reload`

  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill('E2E Share park')
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')

  const banner = page.getByTestId('just-posted-banner')
  await expect(banner).toBeVisible()
  // The door to what was just posted: a "View" link, NOT the title. The title
  // is deliberately plain text — a linked title put the post's exact words in an
  // <a> on the same screen as the card's own link, so `a:has-text(title)`
  // matched the banner instead of the card across several specs.
  await expect(banner.getByRole('link', { name: 'View' })).toHaveAttribute(
    'href',
    /^\/playdate\//,
  )

  // THE FACT: never dismissed, and the reload is still silent.
  await page.reload()
  await expect(page.getByTestId('just-posted-banner')).toHaveCount(0)
})

test.afterEach(async () => {
  // Best-effort cleanup (the house pattern): the marker's playdate rows are
  // deleted via REST with the marker's own JWT (host-only DELETE policy). A
  // failure is logged, not fatal — the e2e-<epoch> prefix marks the rows for
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
