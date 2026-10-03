/**
 * V28 r4 — the /new submit control, after the sticky bar was deleted.
 *
 * WHAT CHANGED AND WHY THIS SPEC SURVIVED RATHER THAN BEING DELETED. V27 slice 1
 * put the "Post drop-in" button in a fixed bar pinned above the bottom nav and
 * suppressed the in-form button via `hideSubmit`, so the bar owned the page's
 * one accessible control. The founder asked for the bar gone:
 *
 *   *"not sure what this is or why it pops up when i scroll down … we should
 *   probably remove it? i also think this text that populates as you select
 *   info on the bottom is unnecessary and should be removed."*
 *
 * Deleting the bar without restoring the in-form submit would have left /new
 * with NO way to post — the trap this spec's first assertion exists to catch.
 * The bar's read-back line is gone; its two surviving guarantees are not.
 *
 * So this spec was REWRITTEN, not retired, and it now pins:
 *
 *   1. There is still exactly ONE control named "Post drop-in" on /new. This is
 *      the guarantee that made `hideSubmit` necessary in the first place: ~30
 *      existing specs click that accessible name, and Playwright strict mode
 *      fails on a second match. The bar's removal must not add one, and the
 *      restore must not leave zero.
 *   2. The submit is reachable at the tightest phone width and clears the 44px
 *      tap floor. With the bar gone this is no longer a fixed element, so the
 *      assertion now proves the IN-FORM button meets it.
 *
 * It deliberately does NOT submit: e2e/post-fast.e2e.ts already proves the /new
 * submit path end to end, and a spec that posts would need the marker cleanup
 * those specs carry. Read-only, so it leaves no row behind.
 */
import { expect, test } from '@playwright/test'
import { settleOnRoute } from './fixtures'

test('the form owns the ONE Post control, and no sticky bar renders', async ({ page }) => {
  // The tightest width this spec has ever covered, so the phone pass (no
  // horizontal overflow, the 44px button) rides along.
  await page.setViewportSize({ width: 320, height: 812 })
  await page.goto('/new')
  await settleOnRoute(page, '/new')

  // (1) Exactly one "Post drop-in", and it is visible. Zero would mean the bar
  // was deleted without restoring the in-form submit; two would be a strict-mode
  // violation for every spec that clicks by this name.
  const postButton = page.getByRole('button', { name: 'Post drop-in' })
  await expect(postButton).toHaveCount(1)
  await expect(postButton).toBeVisible()

  // (2) The bar is GONE — both the strip and its read-back line. Pinned as an
  // absence so a future slice cannot quietly reintroduce the duplicate control
  // or the "unnecessary text" the founder objected to.
  await expect(page.getByTestId('sticky-post-bar')).toHaveCount(0)
  await expect(page.getByTestId('sticky-post-line')).toHaveCount(0)

  // (3) The phone pass: nothing pushes the page sideways, and the submit clears
  // the 44px tap-target floor.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth)
  const box = await postButton.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
})
