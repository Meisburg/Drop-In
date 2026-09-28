/**
 * V27 slice 1 — the sticky Post bar on /new.
 *
 * The bar's whole job is that the parent can always see and submit the plan.
 * This spec pins the three things that are easy to break and cheap to check:
 *
 *   1. There is exactly ONE control named "Post drop-in" on /new — the bar's.
 *      (`hideSubmit` removes the in-form button; a second would be a strict-mode
 *      violation for the ~30 existing specs that click by that accessible name.)
 *   2. The bar's read-back is LIVE: typing a place updates the line.
 *   3. At 320px the bar neither overflows sideways nor drops its button below
 *      the 44px tap floor.
 *
 * It deliberately does NOT submit: e2e/post-fast.e2e.ts already proves the
 * /new submit path end to end, and a spec that posts would need the marker
 * cleanup those specs carry. Read-only, so it leaves no row behind.
 */
import { expect, test } from '@playwright/test'
import { settleOnRoute } from './fixtures'

/** The place field's own placeholder (the string every post spec fills by). */
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'
/** A place the directory need not know — this spec never posts it. */
const TYPED_PLACE = 'E2E sticky bar lot'

test('the sticky Post bar reads the plan back and owns the ONE Post control', async ({
  page,
}) => {
  // The tightest width the slice's AC names, so the same run covers the phone
  // pass (no horizontal overflow, the 44px button) and the read-back.
  await page.setViewportSize({ width: 320, height: 812 })
  await page.goto('/new')
  await settleOnRoute(page, '/new')

  // (1) The bar is there, and its button is the page's ONLY "Post drop-in".
  // The in-form button is hidden by `hideSubmit`, so strict mode resolves to
  // exactly this one.
  const bar = page.getByTestId('sticky-post-bar')
  await expect(bar).toBeVisible()
  const postButton = page.getByRole('button', { name: 'Post drop-in' })
  await expect(postButton).toHaveCount(1)
  await expect(postButton).toBeVisible()

  // (2) The phone pass: nothing pushes the page sideways, and the bar's button
  // clears the 44px tap-target floor.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth)
  const box = await postButton.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)

  // (3) The read-back is LIVE. A cold /new has no place, so the line says
  // "Add a place"; typing the place updates it in place (the pure
  // `stickyPostLine` seam, never an inline rule on the page).
  const line = page.getByTestId('sticky-post-line')
  await expect(line).toContainText('Add a place')
  await expect(line).not.toContainText(TYPED_PLACE)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(TYPED_PLACE)
  await expect(line).toContainText(TYPED_PLACE)
})
