/**
 * The profile's Past archive, IN A BROWSER: 5 rows on first paint, one real
 * "Show N more" control that appends the rest and retires
 * (`.scratch/profile-archive/spec.md` §3b — the coverage residual f1414bd left).
 *
 * WHY THIS SPEC EXISTS. Commit f1414bd landed the bounded Past list
 * (`src/lib/profileArchive.ts`, rendered by `ProfileView`'s Past section): a
 * first page of 5 compact rows, then a `past-show-more` button that adds 20 and
 * disappears when nothing is left. That behaviour is pinned by 22 unit tests
 * over the PURE PLAN and was measured once by a throwaway probe — but no
 * committed browser spec seeded more than THREE past rows (the brief's own
 * measurement: the largest `starts_at` count in any spec that creates rows is
 * 3), so a regression in the first paint's COUNT or in the button's
 * append/retire WIRING would not turn the suite red. This spec closes that: it
 * seeds 7 past drop-ins — one more than the first page — through REST with the
 * marker's OWN JWT (the `feed-empty-state.e2e.ts` precedent), then asserts what
 * the browser actually renders.
 *
 * WHAT IT PINS:
 *
 *   AC1 — the Past section renders EXACTLY 5 `dropin-card` rows on first paint
 *         (`toHaveCount(5)`, not "at most"), and the OLDEST seeded row (rank 7,
 *         behind the first page) is NOT among them.
 *   AC2 — `past-show-more` is visible, enabled, clears the 44px tap floor
 *         (`min-h-11`), and its label counts what is LEFT; ONE click appends the
 *         rest of the archive (every seeded row, including the one the first
 *         paint hid) and the button RETIRES (`toHaveCount(0)`). The dead
 *         `+N older` text — the defect the slice removed — is absent at BOTH
 *         moments.
 *
 * THE NUMBERS ARE LITERALS (5 / 20), deliberately NOT imported from
 * `src/lib/profileArchive.ts`: reading them back from the module would make the
 * browser assertion agree with whatever the module says, which is the one thing
 * this spec exists to prevent. A deliberate change to the page size is a
 * deliberate change to this file too.
 *
 * MONTH HEADINGS ARE NOT COVERED HERE, deliberately. `PAST_MONTH_HEADING_MIN`
 * is 15 and the per-heading counts are pinned by the unit tests over
 * `pastMonthGroups`; covering them in the browser needs 16+ seeded rows, which
 * is more live data than this half is worth (§3b says exactly this).
 *
 * LIVE-DATA DISCIPLINE. Every count assertion is anchored to a REST measurement
 * this spec takes itself (the marker's own past-row count before the seed), so
 * leftover rows from any other run can change the numbers but cannot make a
 * false claim true. The one structural precondition — the whole archive fits in
 * the first page plus ONE click — is asserted rather than assumed.
 *
 * CLEANUP, AND THE PROOF. Each row is deleted with the marker's own JWT, scoped
 * by `host_profile_id` AND the id this spec's own INSERT returned (the
 * host-only DELETE policy is the wall, and a plain anon delete is an RLS no-op
 * that PostgREST reports as a 2xx — the logged lesson). Then the spec READS
 * BACK, per row and as a total count, and FAILS if the archive is not back to
 * its starting value: a cleanup that reports success and removes nothing is the
 * `messages`-DELETE defect this repo already paid for.
 */
import { expect, test, type Page } from '@playwright/test'
import { computeEndIso, computeStartIso } from '../src/lib/feed'
import {
  localDatePlusDays,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
} from './fixtures'

/** How many past drop-ins this spec seeds — one more than the first page (5). */
const SEEDED_ROWS = 7
/** The old dead tail text this slice replaced with a real button. */
const DEAD_OLDER_TEXT = /^\+\d+ older$/

/**
 * This spec's seeded row ids + titles, empty on a run that failed before the
 * seed. Module-scoped because `afterEach` has no access to the test body's
 * locals; the ids are what cleanup scopes by.
 */
let seededIds: string[] = []
let seededTitles: string[] = []
/** The marker's past-row count BEFORE the seed — the value cleanup must restore. */
let baselinePastRows = 0

/** The marker's REST credentials + its own JWT (the app's own write path). */
function markerRest(): { url: string; userId: string; headers: Record<string, string> } {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  return {
    url,
    userId,
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  }
}

/**
 * The marker's PAST row count over PostgREST, through the SAME filter the app's
 * Past query uses (`hidden_at is null`, `ends_at <= now`) — so this number and
 * the archive the browser renders describe the same set of rows. null = the
 * read failed (reported, never treated as zero).
 */
async function countMarkerPastRows(): Promise<number | null> {
  const { url, userId, headers } = markerRest()
  const res = await fetch(
    `${url}/rest/v1/playdates?host_profile_id=eq.${userId}` +
      `&hidden_at=is.null&ends_at=lte.${encodeURIComponent(new Date().toISOString())}&select=id`,
    { headers },
  )
  if (!res.ok) return null
  return ((await res.json()) as Array<{ id: string }>).length
}

/** The section element whose heading is exactly `heading` (the profile-posts pattern). */
function section(page: Page, heading: string) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
}

test('the Past archive paints 5 rows, then one "Show more" click appends the rest and retires', async ({
  page,
}) => {
  const epoch = Math.floor(Date.now() / 1000)
  const { url, userId, headers } = markerRest()

  // --- The archive's starting value, measured (the cleanup's own yardstick) ---
  const measuredBaseline = await countMarkerPastRows()
  expect(
    measuredBaseline,
    'the marker\'s past-row count must be readable over REST — it is this spec\'s baseline',
  ).not.toBeNull()
  baselinePastRows = measuredBaseline ?? 0
  // The whole archive must fit in the first page plus ONE click, or the AC2
  // claim below ("one click appends the rest and retires") does not apply. The
  // setup project mints a FRESH marker each run, so a larger baseline is a
  // straggler a previous run left behind — sweep the e2e- markers and re-run.
  expect(
    baselinePastRows,
    `${baselinePastRows} marker past rows already exist; this spec needs the whole ` +
      `archive to fit in 5 + 20 rows so ONE click retires the control`,
  ).toBeLessThanOrEqual(25 - SEEDED_ROWS)

  // --- Seed 7 PAST drop-ins over REST (the feed-empty-state precedent) ---
  for (let i = 0; i < SEEDED_ROWS; i++) {
    const title = `e2e-${epoch} archive ${i}`
    // Days 1..7 ago at 10:00 local — on the app's 30-minute grid, ending an
    // hour later, so every row is PAST by the app's own `ends_at <= now` rule.
    const startDate = localDatePlusDays(-(i + 1))
    const res = await fetch(`${url}/rest/v1/playdates`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        host_profile_id: userId,
        title,
        place: 'E2E archive lot',
        starts_at: computeStartIso(startDate, 10 * 60),
        ends_at: computeEndIso(startDate, 10 * 60, 60),
      }),
    })
    const body = await res.text()
    expect(res.ok, `seed ${i} must insert (HTTP ${res.status}: ${body.slice(0, 200)})`).toBe(true)
    const row = (JSON.parse(body) as Array<{ id: string }>)[0]
    expect(row?.id, `seed ${i} must return its id`).toBeTruthy()
    seededIds.push(row.id)
    seededTitles.push(title)
  }

  const expectedTotal = baselinePastRows + SEEDED_ROWS
  // The seed really landed — otherwise every count below would be measuring a
  // POST that silently inserted nothing.
  expect(await countMarkerPastRows(), 'the seed must land in the marker\'s archive').toBe(
    expectedTotal,
  )

  // --- The profile's Past section, in a browser ---
  await page.goto('/profile')
  await settleOnRoute(page, '/profile')
  const past = section(page, 'Past')
  await expect(past.getByRole('heading', { name: 'Past', exact: true })).toBeVisible()

  // AC1: EXACTLY the first page — a literal 5, not "at most", not the module's
  // constant. This is the assertion a regression in PAST_FIRST_PAGE (or in the
  // slicing that honours it) must turn red.
  const rows = past.getByTestId('dropin-card')
  await expect(rows).toHaveCount(5)

  // …and the row the first page hides is really one of OURS, not a row that
  // failed to render: it is rank 7 (the oldest seed), which sits behind the first
  // page by construction. Its absence here is the page boundary, and its
  // presence after the click is the append wiring.
  const hiddenByFirstPage = seededTitles[SEEDED_ROWS - 1]
  await expect(past.getByText(hiddenByFirstPage, { exact: true })).toHaveCount(0)

  // --- AC2: the real control, its honest label, and the 44px floor ---
  const showMore = past.getByTestId('past-show-more')
  await expect(showMore).toBeVisible()
  await expect(showMore).toBeEnabled()
  // The label counts what is LEFT (never a bare "Show 20 more" over 2 rows).
  const remaining = expectedTotal - 5
  await expect(showMore).toHaveText(`Show ${Math.min(20, remaining)} more`)
  const box = await showMore.boundingBox()
  expect(box, 'the control must have a box to measure').not.toBeNull()
  expect(
    Math.round(box?.height ?? 0),
    'the tap target must clear the 44px floor (min-h-11)',
  ).toBeGreaterThanOrEqual(44)
  // Moment 1: the dead text the slice removed is absent with the button up.
  await expect(past.getByText(DEAD_OLDER_TEXT)).toHaveCount(0)

  // --- ONE click appends the rest, and the control RETIRES ---
  await showMore.click()
  // Every past row is on screen now (5 + 20 covers the asserted precondition),
  // so the retirement below is about the button, not about a missing row.
  await expect(rows).toHaveCount(expectedTotal)
  // THE WIRING, not just the count: every row this spec seeded is rendered —
  // including the one the first paint hid — so the click APPENDED the tail
  // rather than merely re-rendering the same five.
  for (const title of seededTitles) {
    await expect(past.getByText(title, { exact: true })).toBeVisible()
  }
  await expect(showMore).toHaveCount(0)
  // Moment 2: still no dead text where the button used to be (the honest
  // `olderNote` line is the fetch-cap's, which is unit-tested and not
  // manufactured here).
  await expect(past.getByText(DEAD_OLDER_TEXT)).toHaveCount(0)
})

test.afterEach(async () => {
  if (seededIds.length === 0) return
  const { url, userId, headers } = markerRest()
  const seedCount = seededIds.length
  let deleted = 0

  for (const id of seededIds) {
    // Scoped by the OWNER and by the id THIS spec's own insert returned: two
    // `eq` filters on owner/row columns, never a broad operator and never
    // another spec's row.
    const query =
      `${url}/rest/v1/playdates?host_profile_id=eq.${userId}` +
      `&id=eq.${id}&select=id`
    const del = await fetch(query, {
      method: 'DELETE',
      headers: { ...headers, Prefer: 'return=representation' },
    })
    const rows = del.ok ? ((await del.json()) as Array<{ id: string }>) : []
    deleted += rows.length
    expect(del.ok, `cleanup DELETE for ${id} must be accepted (HTTP ${del.status})`).toBe(true)

    // THE READ-BACK THAT MAKES THIS A CLEANUP: an RLS no-op DELETE answers 2xx
    // with an empty body, so the row still being there is the only signal that
    // distinguishes "removed" from "reported success and removed nothing".
    const check = await fetch(query, { headers })
    const left = check.ok ? ((await check.json()) as Array<{ id: string }>) : null
    expect(left, `cleanup read-back for ${id} must succeed`).not.toBeNull()
    expect(left, `row ${id} must be GONE after the delete (a 2xx delete can be an RLS no-op)`).toEqual(
      [],
    )
  }

  // The COUNT read-back: the marker's past archive is back to its STARTING value.
  const finalCount = await countMarkerPastRows()
  expect(finalCount, 'the marker\'s past-row count must be readable after cleanup').not.toBeNull()
  expect(
    finalCount,
    `cleanup must restore the marker's past-row count to ${baselinePastRows} ` +
      `(deleted ${deleted}/${seedCount} seeded rows)`,
  ).toBe(baselinePastRows)
  console.log(
    `[e2e cleanup] ok — deleted ${deleted}/${seedCount} profile-archive row(s); ` +
      `marker past rows back to ${baselinePastRows}`,
  )
})
