/**
 * V27 slice 3 — the privacy preview + trust line on /new.
 *
 * The RULE is unit-tested at the pure seam
 * (src/lib/postSummary.test.ts → `privacyPreview`). This spec proves the WIRING
 * the unit test cannot: the block renders at the point of posting, the note is
 * the exact fixed promise, and the preview line is LIVE — a cold /new says
 * "Add a place" and typing a place updates the line in place (the same
 * `privacyPreview(values, …)` seam, never an inline rule on the page).
 *
 * It deliberately does NOT submit: e2e/post-fast.e2e.ts already proves the /new
 * submit path end to end, and a spec that posted would need the marker cleanup
 * those specs carry. Read-only, so it leaves no row behind and needs no
 * cleanup.
 */
import { expect, test } from '@playwright/test'
import { PRIVACY_PREVIEW_NOTE } from '../src/lib/postSummary'
import { settleOnRoute } from './fixtures'

/** The place field's own placeholder (the string every post spec fills by). */
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'
/** A place the directory need not know — this spec never posts it. */
const TYPED_PLACE = 'E2E privacy preview lot'

test('the privacy preview states the promise and reads the place back', async ({ page }) => {
  // The tightest width the slice's AC names, so this run also covers the phone
  // pass (the block must push nothing sideways).
  await page.setViewportSize({ width: 320, height: 812 })
  await page.goto('/new')
  await settleOnRoute(page, '/new')

  // The block sits at the point of posting, with the EXACT fixed trust note.
  await expect(page.getByTestId('privacy-preview')).toBeVisible()
  await expect(page.getByTestId('privacy-preview-note')).toHaveText(PRIVACY_PREVIEW_NOTE)

  // A cold /new has no place, so the preview prompts for one…
  const line = page.getByTestId('privacy-preview-line')
  await expect(line).toContainText('Add a place')

  // …and typing the place updates it in place (the pure seam, live).
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(TYPED_PLACE)
  await expect(line).toContainText(TYPED_PLACE)

  // The block adds no horizontal overflow at 320px.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth)
})
