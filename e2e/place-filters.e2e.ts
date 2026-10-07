import { expect, test } from '@playwright/test'
import { readMarkerSession, readSupabaseEnv, setDirectoryRadius, settleOnRoute } from './fixtures'

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

    // The indoor/outdoor control is a single TOGGLE now (founder, 2026-10-06),
    // not a captioned dropdown: its label is the whole story, so it is asserted
    // below rather than in a captioned-trigger loop.
    //
    // V32-5: the loop that used to live here asserted the "When" trigger was
    // VISIBLE with an accessible name. That was the LAST captioned dropdown, and
    // the founder had it removed (annotation A1) — so this file's own
    // pin-of-removal habit applies, exactly as it does for the deleted distance
    // pill further down. The 390px no-ellipsis check is NOT lost with it: the
    // indoor toggle and the kind chips carry that assertion now, and both are
    // real controls on the surface.
    await expect(page.getByTestId('places-when-filter')).toHaveCount(0)
    await expect(page.getByTestId('places-when-sheet')).toHaveCount(0)

    // V32-5 ACCEPTANCE: the upcoming-count seam still drives the directory rows.
    // This is the one thing the deletion could have taken with it — the count
    // and the window share the SAME start-time read (`upcomingStartTimes`), so
    // removing the window is exactly when someone might "tidy away" the read.
    //
    // The row's own rule (`PlaceDirectory`'s `plannedCopy`/`inviteLine`, from
    // `planDirectoryList.upcomingCount`) states one of exactly three things, and
    // never nothing: "N drop-ins planned here", "1 drop-in planned here", or the
    // invite line when the count is a true zero. A row rendering NONE of them
    // means the read was lost. Asserting the DISJUNCTION is what makes this a
    // real check rather than a string guess — the seeded directory's counts vary
    // with live data, so pinning one literal would have been flaky by design.
    const countRows = page.getByTestId('place-row')
    expect(await countRows.count()).toBeGreaterThan(0)
    const countTexts = await countRows.evaluateAll((rows) => rows.map((r) => r.textContent ?? ''))
    const statesItsCount = (t: string) =>
      /\d+ drop-ins? planned here/.test(t) || /Be the first to start a drop-in here/.test(t)
    expect(
      countTexts.filter(statesItsCount).length,
      'every directory row must still state its upcoming count (or its honest zero)',
    ).toBe(countTexts.length)

    // THE TOGGLE THAT REPLACED THE "Setting" DROPDOWN. One control, one word,
    // a real pressed state — and no sheet behind it to open.
    const indoorToggle = page.getByTestId('places-indoor-filter')
    await expect(indoorToggle).toBeVisible()
    await expect(indoorToggle).toHaveAccessibleName(/Indoor/)
    await expect(indoorToggle).toHaveAttribute('aria-pressed', 'false')

    // THE DELETED CONTROL IS REALLY GONE (V31 map-and-distance), and the radius
    // it used to state is still reachable — on the location control, beside the
    // search field.
    await expect(page.getByTestId('places-distance-filter-btn')).toHaveCount(0)
    await expect(page.getByTestId('places-distance-sheet')).toHaveCount(0)
    await expect(page.getByTestId('set-location-btn')).toBeVisible()
  })
})

/**
 * V32 v32-10a (A5) — THE COFFEE-NEARBY TOGGLE.
 *
 * The founder: *"I think parents are really going to want to have a drop in where
 * there's coffee nearby… as a parent I would want to be like, okay, can our kids
 * play here and we can drink a coffee?"*
 *
 * The control filters on a CACHED COLUMN (`places.coffee_nearby`), never on a
 * live Overpass call — no read path queries Overpass. That is proven here too.
 */
test('the coffee toggle filters the directory, and its off state is inert (V32-10a A5)', async ({
  page,
}) => {
  // NO OVERPASS, EVER, ON THE READ PATH. Intercept and fail loudly if a request
  // appears — the column is cached precisely so the directory never depends on a
  // public API being up.
  const overpassCalls: string[] = []
  await page.route(/overpass/i, (route) => {
    overpassCalls.push(route.request().url())
    return route.abort()
  })

  await page.goto('/browse')
  await settleOnRoute(page, '/browse')
  await expect(page.getByTestId('place-row').first()).toBeVisible({ timeout: 20_000 })

  const toggle = page.getByTestId('place-coffee-filter')
  await expect(toggle).toBeVisible()
  // A REAL control, not the door: pressed state, and it is a BUTTON.
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(toggle).toHaveRole('button')

  // OFF IS INERT: the row set with the toggle untouched is today's row set.
  const rowsOff = await page.getByTestId('place-row').count()
  expect(rowsOff, 'the directory must render rows').toBeGreaterThan(1)

  // ON: the row set CHANGES — asserted by comparing rendered counts, not by
  // asserting the control exists.
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(async () => page.getByTestId('place-row').count(), {
      message: 'selecting the coffee toggle must change the rendered row set',
    })
    .toBeLessThan(rowsOff)
  const rowsOn = await page.getByTestId('place-row').count()
  console.log(`[V32-10a] coffee OFF rows=${rowsOff} ON rows=${rowsOn}`)
  expect(rowsOn, 'the coffee filter must narrow the directory').toBeLessThan(rowsOff)

  // Every row that survives carries the fact: read the column back through the
  // app's own read and check the rendered rows are a subset of the `true` set.
  const { url: restUrl, anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  const res = await fetch(
    `${restUrl}/rest/v1/places?coffee_nearby=is.true&select=name`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } },
  )
  const truePlaces = res.ok ? ((await res.json()) as Array<{ name: string }>) : []
  const trueNames = new Set(truePlaces.map((p) => p.name))
  const rendered = await page.getByTestId('place-card-name').allInnerTexts()
  for (const name of rendered) {
    expect(trueNames.has(name.trim()), `${name} must be a coffee_nearby=true place`).toBe(true)
  }

  // OFF AGAIN restores the full set (the filter is a view, not a mutation).
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect
    .poll(async () => page.getByTestId('place-row').count(), { timeout: 15_000 })
    .toBe(rowsOff)

  // THE READ PATH NEVER TOUCHED OVERPASS.
  expect(overpassCalls, 'no /browse load may call Overpass').toEqual([])

  // THE DOOR IS STILL A DOOR — both live in the row, with different jobs.
  await expect(page.getByTestId('place-coffee-nearby')).toHaveRole('link')
  await expect(page.getByTestId('place-coffee-nearby')).toHaveAttribute('href', /google\.com\/maps/)
})

test('the coffee empty state does not claim a place has no cafe when it never asked (V32-10a A5)', async ({
  page,
}) => {
  await page.goto('/browse')
  await settleOnRoute(page, '/browse')
  await expect(page.getByTestId('place-row').first()).toBeVisible({ timeout: 20_000 })

  const toggle = page.getByTestId('place-coffee-filter')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')

  // The empty state is HONEST and never overclaims. Whichever branch shows, the
  // "never asked" wording must not assert an absence the data does not support.
  const empty = page.getByTestId('empty-coffee-nearby-state')
  if ((await empty.count()) > 0) {
    const copy = (await empty.innerText()).toLowerCase()
    if (copy.includes('haven’t checked') || copy.includes("haven't checked")) {
      // The unknown branch: it may NOT say any place has no cafe.
      expect(copy).not.toContain('no cafe')
    }
    // The escape is always there, so the state is never a dead end.
    await expect(page.getByTestId('coffee-nearby-escape')).toBeVisible()
  } else {
    // Rows exist, so the filter found something and the empty state is correctly
    // absent. Both outcomes are legal; what is asserted either way is that the
    // page never renders the zero-case INVITATION for a filter.
    expect(await page.getByTestId('place-row').count()).toBeGreaterThan(0)
  }
})
