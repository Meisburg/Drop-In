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
import { escapeForRegExp } from '../src/lib/escapeForRegExp.mjs'
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
  //
  // V15.2 fix two separate defects here:
  //  1. `formatDayLabel(startIso, nowIso)` takes TWO arguments, and this call
  //     passed only one — `nowIso` was undefined, so the label seam threw
  //     `RangeError: Invalid time value` before the assertion ever ran.
  //  2. The label is computed from a clock that can move UNDER the assertion:
  //     `+2 days` flips from a weekday name ("Tue, Sep 22") to "Tomorrow" the
  //     moment the wall clock crosses midnight between the post and this read.
  //     That is a real flake, not a rare one — it surfaced on a run that started
  //     at 23:52. Bracket the two candidate labels instead of pinning one: the
  //     post is `+2 days` from the spec's own start, so at most one midnight can
  //     fall between the two reads. `formatDayLabel` is still the single source
  //     of both strings (no second copy of the day-label rule).
  //  3. The feed renders the section label with CSS `uppercase`, so the DOM text
  //     is "TUE, SEP 22" while `formatDayLabel` returns "Tue, Sep 22" —
  //     `getByText` is case-SENSITIVE by default, so an exact-case locator can
  //     never match what the page paints. Match case-insensitively.
  //  4. The label seam is fed a full TIMESTAMP by the app (`daySectionIso` hands
  //     it an ISO instant); this spec handed it the bare "YYYY-MM-DD" from the
  //     date INPUT. JS parses a bare date as UTC MIDNIGHT, so `getDay()` reads it
  //     a day early in any timezone behind UTC — the label came back "Tomorrow"
  //     while the feed correctly painted "TUE, SEP 22". Anchoring the date at
  //     local noon (the same trick the app's own summary code uses) keeps the
  //     calendar day stable in every timezone.
  const startIso = `${startDate}T12:00:00`
  const beforeLabel = formatDayLabel(startIso, new Date().toISOString())
  const dayLabels = [beforeLabel]
  const afterLabel = formatDayLabel(startIso, new Date(Date.now() + 60_000).toISOString())
  if (afterLabel !== beforeLabel) dayLabels.push(afterLabel)
  const labelText = new RegExp(dayLabels.map(escapeForRegExp).join('|'), 'i')
  await expect(page.getByText(labelText).first()).toBeVisible()
})
