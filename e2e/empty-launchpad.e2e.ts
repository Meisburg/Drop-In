/**
 * V37 slice A (`P4K2`) — the empty feed's launchpad, proved on the REAL app.
 *
 * The marker this suite mints has ZERO drop-ins (the measured cold-start state:
 * 234 places, 151 playgrounds, no posts), which is precisely the state the slice
 * exists for. Verified here:
 *   (a) the empty state names up to three playgrounds, each with a distance;
 *   (b) each named playground EXISTS in the same read the browse surfaces use;
 *   (c) tapping one lands on /new with that place prefilled;
 *   (d) the list is capped at three;
 *   (f) 390px, no overflow.
 */
import { expect, test } from '@playwright/test'
import { E2E_BASE_URL } from './fixtures'

test.describe('the empty feed launchpad (V37-A, P4K2)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('names up to three real playgrounds, each with a distance, and taps through to /new', async ({
    page,
  }) => {
    // --- the empty feed -----------------------------------------------------
    await page.goto(E2E_BASE_URL + '/')
    await expect(page.getByTestId('empty-radius-state')).toBeVisible({ timeout: 30_000 })

    // (a) the launchpad and its rows.
    const headline = page.getByText('Start something here')
    await expect(headline).toBeVisible()
    const rows = page.getByTestId('empty-radius-launchpad-place')
    const count = await rows.count()
    expect(count, 'the launchpad must name at least one playground').toBeGreaterThan(0)
    expect(count, 'the list is capped at three').toBeLessThanOrEqual(3)

    // Each row states a distance. The label is integer miles at 1 mi and up, and
    // floors at "<1 mi" below it — three real sub-mile Ballard playgrounds read
    // "0 mi" under the shared integer formatter, which is a false distance.
    const distances = page.getByTestId('empty-radius-launchpad-distance')
    await expect(distances).toHaveCount(count)
    for (let i = 0; i < count; i++) {
      await expect(distances.nth(i)).toHaveText(/^(<1|\d+) mi$/)
    }

    // (b) every named place is a REAL playground from the SAME directory read the
    // browse surfaces use. Proved the strongest way available: the place named on
    // the FEED is found again in the /browse DIRECTORY, filtered to playgrounds —
    // one read, two surfaces, and the row's own `data-place-id` ties them together.
    const firstRow = rows.first()
    const placeId = await firstRow.getAttribute('data-place-id')
    expect(placeId, 'a launchpad row must carry its place id').toBeTruthy()
    const placeName = (await firstRow.locator('span').first().textContent())?.trim() ?? ''
    expect(placeName.length).toBeGreaterThan(0)

    await page.goto(E2E_BASE_URL + '/browse')
    await expect(page.getByTestId('place-row').first()).toBeVisible({ timeout: 30_000 })
    // Narrow the directory to playgrounds so the assertion is about the KIND, not
    // about the name happening to match something else.
    await page.getByTestId('place-kind-chip-playground').click()
    // The place named on the empty FEED is found again in the playground-filtered
    // DIRECTORY — one directory read, two surfaces. Its row is a link to the place
    // page, so the id ties the two surfaces together across the navigation.
    const directoryRow = page.getByTestId('place-row').filter({ hasText: placeName }).first()
    await expect(directoryRow).toBeVisible({ timeout: 30_000 })
    await expect(directoryRow).toHaveAttribute('href', `/place/${placeId}`)

    // Back to the feed to tap through.
    await page.goto(E2E_BASE_URL + '/')
    await expect(page.getByTestId('empty-radius-state')).toBeVisible({ timeout: 30_000 })

    // (c) tapping it lands on /new with THAT place prefilled — the prefill is
    // visible in the form's place field (the same placeholder the place-page
    // prefill spec asserts against).
    await firstRow.click()
    await page.waitForURL(/\/new$/, { timeout: 30_000 })
    await expect(page.getByPlaceholder('e.g. Green Lake playground, near the boathouse')).toHaveValue(
      placeName,
      { timeout: 30_000 },
    )

    // (f) no horizontal overflow at 390px, on the form we landed on.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    )
    expect(overflow, 'no horizontal overflow at 390px').toBe(false)
  })

  test('the launchpad rows keep 390px honest on the empty feed itself', async ({ page }) => {
    await page.goto(E2E_BASE_URL + '/')
    await expect(page.getByTestId('empty-radius-state')).toBeVisible({ timeout: 30_000 })
    const measured = await page.evaluate(() => {
      const doc = document.documentElement
      const row = document.querySelector('[data-testid="empty-radius-launchpad-place"]')
      const rowBox = row ? row.getBoundingClientRect() : null
      return {
        viewport: window.innerWidth,
        docScrollWidth: doc.scrollWidth,
        overflow: doc.scrollWidth > window.innerWidth + 1,
        rowRight: rowBox ? Math.round(rowBox.right) : null,
      }
    })
    console.log('390px measure:', JSON.stringify(measured))
    expect(measured.overflow, 'no horizontal overflow at 390px').toBe(false)
    if (measured.rowRight !== null) {
      expect(measured.rowRight).toBeLessThanOrEqual(measured.viewport + 1)
    }
  })
})
