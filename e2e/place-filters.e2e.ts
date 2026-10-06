import { expect, test } from '@playwright/test'
import { setDirectoryRadius, settleOnRoute } from './fixtures'

/**
 * V27 — the two quick gates the founder named on the places directory:
 * "is it open?" and "do other parents rate it?".
 *
 * These two controls are pure client-side over the seeded directory, so the
 * assertions are deliberately DATA-SHAPE independent rather than pinned to
 * today's seed: the gate's contract is "every row it leaves on screen is open",
 * which must hold whether the clock says 2pm or 3am. The count-returns-after-
 * toggle-off assertions prove the gate is a VIEW, never a destructive filter.
 */
test.describe('places directory — the open-now and top-rated gates (V27)', () => {
  test('Open now keeps only places that are actually open, and clears back to the full list', async ({
    page,
  }) => {
    await page.goto('/browse')
    await settleOnRoute(page, '/browse')
    await expect(page.getByTestId('places-search')).toBeVisible()

    // The widest radius, so the gate is exercised against the whole directory
    // rather than the marker's own stored radius. V31 map-and-distance: the
    // location control is the radius door now (the distance pill is deleted).
    await setDirectoryRadius(page)
    await expect(page.getByTestId('places-list')).toBeVisible()

    const rows = page.getByTestId('place-row')
    const before = await rows.count()
    expect(before, 'the seeded directory must have places to gate').toBeGreaterThan(0)

    await page.getByTestId('places-open-now-filter').click()
    await expect(page.getByTestId('places-open-now-filter')).toHaveAttribute('aria-pressed', 'true')

    // At a quiet hour every place can legitimately be closed, which renders the
    // honest empty state; otherwise EVERY visible row must carry an "Open" chip,
    // because a place with unknown hours is excluded by the gate.
    const empty = page.getByTestId('empty-open-now-state')
    if (await empty.isVisible().catch(() => false)) {
      await expect(empty).toBeVisible()
    } else {
      const openCount = await rows.count()
      expect(openCount).toBeLessThanOrEqual(before)
      for (let i = 0; i < openCount; i++) {
        await expect(rows.nth(i).getByTestId('place-open-status')).toContainText('Open')
      }
    }

    await page.getByTestId('places-open-now-filter').click()
    await expect(page.getByTestId('places-open-now-filter')).toHaveAttribute('aria-pressed', 'false')
    await expect(rows).toHaveCount(before)
  })

  test('Top rated toggles the review-based sort without changing which places are listed', async ({
    page,
  }) => {
    await page.goto('/browse')
    await settleOnRoute(page, '/browse')
    await expect(page.getByTestId('places-list')).toBeVisible()

    const rows = page.getByTestId('place-row')
    const before = await rows.count()
    expect(before).toBeGreaterThan(0)

    await page.getByTestId('places-top-rated-sort').click()
    await expect(page.getByTestId('places-top-rated-sort')).toHaveAttribute('aria-pressed', 'true')
    // Sorting is a reorder, never a filter: the same rows remain.
    await expect(rows).toHaveCount(before)

    await page.getByTestId('places-top-rated-sort').click()
    await expect(page.getByTestId('places-top-rated-sort')).toHaveAttribute('aria-pressed', 'false')
    await expect(rows).toHaveCount(before)
  })
})

/**
 * v30-3 (founder annotation 4): at 390px the pills read "Any SETT…" and
 * "within three…", so a parent could not tell what they filtered. Each trigger
 * now carries its own caption, and its value is short enough not to ellipsize.
 *
 * A PHONE viewport is the whole point — at the suite's default 1280px the old
 * pills never truncated, which is why this defect survived every existing spec.
 *
 * V31 map-and-distance: the third pill used to be the DISTANCE trigger (caption
 * "Distance", value "5 mi") and is DELETED — the radius lives on the location
 * control, which states its own value. The spec now checks the two triggers the
 * row actually renders; "Distance" is asserted ABSENT below, so a pill that
 * came back without a caption would not slip through this file.
 */
test.describe('places directory — the filter pills say what they filter (v30-3)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('every trigger names its purpose and clips neither line', async ({ page }) => {
    await page.goto('/browse')
    await settleOnRoute(page, '/browse')

    const triggers = [
      { testId: 'places-type-filter', caption: 'Setting' },
      { testId: 'places-when-filter', caption: 'When' },
    ]

    for (const { testId, caption } of triggers) {
      const trigger = page.getByTestId(testId)
      await expect(trigger).toBeVisible()
      // The caption is real text inside the control, so the accessible name
      // carries the purpose and not just the value.
      await expect(trigger).toHaveAccessibleName(new RegExp(caption))

      const clipped = await trigger.evaluate((node) => {
        const spans = Array.from(node.querySelectorAll('span'))
        return spans.some((span) => span.scrollWidth > span.clientWidth + 1)
      })
      expect(clipped, `${testId} must not ellipsize at 390px`).toBe(false)
    }

    // THE DELETED CONTROL IS REALLY GONE (V31 map-and-distance), and the radius
    // it used to state is still reachable — on the location control, beside the
    // search field.
    await expect(page.getByTestId('places-distance-filter-btn')).toHaveCount(0)
    await expect(page.getByTestId('places-distance-sheet')).toHaveCount(0)
    await expect(page.getByTestId('set-location-btn')).toBeVisible()
  })
})
