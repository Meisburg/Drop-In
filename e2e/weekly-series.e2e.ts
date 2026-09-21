/**
 * V15 T05 (A12) — the "Repeat weekly" toggle is GONE from /new.
 *
 * What this proves:
 *  1. The /new form no longer renders a `repeat-weekly` control (count 0).
 *  2. A post can still be created via /new without any weekly series logic.
 *
 * The deeper series behavior (occurrence generation, ping isolation, stop-repeating)
 * was previously covered by this spec's UI-driven flow. With the toggle removed,
 * that path is no longer reachable from the UI. Series creation now happens only
 * via REST/DB seeding (out of scope for e2e). This spec asserts the ABSENCE of
 * the toggle and that a normal post still works.
 */
import { expect, test } from '@playwright/test'
import { formatDayLabel } from '../src/lib/feed'
import {
  editTitle,
  localDatePlusDays,
  readMarkerMeta,
  readMarkerSession,
  settleOnRoute,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'
const PLACE = 'E2E weekly lot'

test('the repeat-weekly toggle is absent from /new', async ({ page }) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e weekly-absent ${epoch}`
  const startDate = localDatePlusDays(2)

  console.log(
    `[e2e weekly-series] markers this run: host ${marker.email} (setup)`,
  )

  // (1) /new: the "Repeat weekly" control is gone.
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await expect(page.getByTestId('repeat-weekly')).toHaveCount(0)
  await expect(page.getByTestId('repeat-weekly-label')).toHaveCount(0)

  // (2) A normal post still works end-to-end.
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(PLACE)
  await page.locator('input[type="date"]').fill(startDate)

  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/', { timeout: 20_000 })
  await expect(page).toHaveURL('/')

  // The post appears in the feed with its day label.
  const dayLabel = formatDayLabel(startDate)
  await expect(page.getByText(dayLabel)).toBeVisible()
})