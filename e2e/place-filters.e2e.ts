import { expect, test } from '@playwright/test'
import { settleOnRoute } from './fixtures'

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

    // Any distance, so the gate is exercised against the whole directory rather
    // than the marker's 5-mile radius.
    await page.getByTestId('places-distance-filter-btn').click()
    await page.getByTestId('places-distance-sheet-option-any').click()
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
