import { expect, test } from '@playwright/test'
import { readMarkerSession, readSupabaseEnv, setDirectoryRadius, settleOnRoute } from './fixtures'

// One definition, shared by the Node-side guard and the browser-side evaluate —
// two spellings of one selector is the drift this repo hunts. The `:not(...)`
// exclusion keeps the scroll container out of the clip check: its own horizontal
// overflow at 390px is the "still side-scrolls" feature, not a defect.
const KIND_CHIP_SELECTOR = '[data-testid^="place-kind-chip-"]:not([data-testid="place-kind-chip-row"])'

// Module-level tolerance, passed into both evaluate callbacks as an argument.
// Sibling specs that hardcode their own `scrollWidth <= clientWidth + 1` can
// adopt this constant instead of spelling the number a second time.
const CLIP_TOLERANCE = 1

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

  test('Best first is the default sort and A–Z reorders without changing which places are listed', async ({
    page,
  }) => {
    await page.goto('/browse')
    await settleOnRoute(page, '/browse')
    await expect(page.getByTestId('places-list')).toBeVisible()

    const rows = page.getByTestId('place-row')
    const before = await rows.count()
    expect(before).toBeGreaterThan(0)

    // V33-D: `Best first` is the LOAD DEFAULT (was `alpha` — the defect). The
    // control lives above the list, so it is asserted from the page, not a modal.
    // 2026-10-08 (directory-polish): it is ONE DROPDOWN now — drive it with
    // `selectOption`, read its value back, and the options keep their own testids
    // (a label regression still surfaces here).
    const sort = page.getByTestId('places-sort-control')
    await expect(sort).toHaveValue('top-rated')
    await expect(page.getByTestId('places-sort-best-first')).toHaveText('Best first (top rated)')

    // Switching to A–Z is a reorder, never a filter: the same rows remain.
    await sort.selectOption('alpha')
    await expect(sort).toHaveValue('alpha')
    await expect(rows).toHaveCount(before)

    // And back — still the same set.
    await sort.selectOption('top-rated')
    await expect(sort).toHaveValue('top-rated')
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
    // V33-D — PIN THE RADIUS. This spec never did, so the row it measured was
    // whatever radius the LAST spec had left on the shared marker account. That
    // is mutable global state: measured, this test passed at 08:38 and failed at
    // 09:0x on the same code with `place-row` count 0 — the marker's stored
    // radius had been narrowed by the spec that ran before it. The wide radius
    // is what the sibling specs use, and it makes the row under measurement the
    // whole directory rather than a number another test chose.
    await setDirectoryRadius(page)
    await expect(page.getByTestId('place-row').first()).toBeVisible()

    // The indoor/outdoor control is a single TOGGLE now (founder, 2026-10-06),
    // not a captioned dropdown: its label is the whole story, so it is asserted
    // below rather than in a captioned-trigger loop.
    //
    // V32-5: the loop that used to live here asserted the "When" trigger was
    // VISIBLE with an accessible name. That was the LAST captioned dropdown, and
    // the founder had it removed (annotation A1) — so this file's own
    // pin-of-removal habit applies, exactly as it does for the deleted distance
    // pill further down.
    //
    // v33-0 (restores what V32-5's deletion actually took): the 390px
    // no-ellipsis gate for the controls that exist NOW. For the indoor toggle,
    // every kind chip, every placeholder pill, and the coffee controls — each
    // element plus any descendant carrying non-whitespace text with a real layout
    // box (`clientWidth > 0`, so inline boxes are skipped) — `scrollWidth <=
    // clientWidth + TOLERANCE` (a chip whose label sits in a child span can clip
    // on the span while the button itself measures fine, so the check walks the
    // descendants too, and the failure names the chip). The scroll CONTAINER
    // (`place-kind-chip-row`) is deliberately exempt: side-scrolling inside it at
    // 390px is the feature ("still side-scrolls"), not a defect. Plus the page
    // itself must not widen at 390px: `documentElement.scrollWidth <=
    // clientWidth + TOLERANCE`. Both run after the count assertion above has
    // settled, so the measurements are taken on the fully-rendered row set.
    await expect(page.getByTestId('places-when-filter')).toHaveCount(0)
    await expect(page.getByTestId('places-when-sheet')).toHaveCount(0)

    // V32-5 ACCEPTANCE: the upcoming-count seam still drives the directory rows.
    // This is the one thing the deletion could have taken with it — the count
    // and the window share the SAME start-time read (`upcomingStartTimes`), so
    // removing the window is exactly when someone might "tidy away" the read.
    //
    // FIX ROUND 1 (ocr): the row's own rule (`PlaceDirectory`'s
    // `plannedCopy`/`inviteLine`, from `planDirectoryList.upcomingCount`)
    // produces FOUR states, not three — `src/lib/placeSocial.ts:139-146` +
    // `PlaceDirectory.tsx:1782-1791`:
    //
    //   | state                                            | renders                    |
    //   |--------------------------------------------------|----------------------------|
    //   | `upcomingCount > 0`                              | "N drop-ins planned here"  |
    //   | `upcomingCount === 0` and no proof               | "Be the first to start a drop-in here today!" |
    //   | `upcomingCount === 0` and `dropInProofLine(proof) !== null` | NEITHER — documented behaviour: a place that has hosted keeps quiet (the historical proof line was removed from the row in the distill pass, `PlaceDirectory.tsx:1905-1918`) |
    //   | `upcomingCount === null` (read not landed)       | neither                    |
    //
    // So "every row states its count" was never true — the third state is a
    // legitimate render, and asserting it would time out on a healthy app as
    // hosting accumulates. The invariant worth protecting is instead: the
    // `upcomingStartTimes` READ still drives the rows. It is one batched read for
    // the whole directory, so when it lands, states 1 and 2 appear; when it is
    // lost, `upcomingCount` is `null` for every row and the directory goes
    // entirely quiet. So this assertion POLLS until at least one row states a
    // positive count OR the invite line — which fails loudly exactly when the
    // read is lost, the regression the check exists for.
    //
    // PARKED LIMITATION (ocr round 3, ruled by the operator): the poll requires
    // ≥1 upcoming-or-honest-zero row in the live directory; a directory where
    // every place has hosted and has nothing upcoming would false-red here,
    // which is the price of a text-only signal.
    const countRows = page.getByTestId('place-row')
    expect(await countRows.count()).toBeGreaterThan(0)
    const statesItsCount = (t: string) =>
      /\d+ drop-ins? planned here/.test(t) || /Be the first to host a drop-in here/.test(t)
    await expect
      .poll(async () => {
        const countTexts = await countRows.evaluateAll((rows) => rows.map((r) => r.textContent ?? ''))
        return countTexts.length > 0 && countTexts.filter(statesItsCount).length > 0
      }, {
        message: 'the upcoming-start-times read must drive at least one directory row (positive count or honest zero)',
        timeout: 20_000,
      })
      .toBe(true)

    // THE KIND PILLS (V33-D). One flat wrapping row; the kind-blind indoor
    // toggle is gone, so "somewhere indoors" is the `indoor_play` kind pill,
    // reached through `More kinds`. One control, one word, a real pressed state
    // — and no sheet behind it to open.
    await page.getByTestId('place-more-kinds').click()
    const indoorChip = page.getByTestId('place-kind-chip-indoor_play')
    await expect(indoorChip).toBeVisible()
    await expect(indoorChip).toHaveAccessibleName(/Indoor play/)
    await expect(indoorChip).toHaveAttribute('aria-pressed', 'false')

    // v33-0 / V33-D — the 390px NO-ELLIPSIS gate. Every pill in the row — the
    // kind chips, the placeholder pills, the coffee toggle, and the row's own
    // controls — must clip no text, and the page itself must not widen. The
    // check walks each element's descendants that carry non-whitespace text with
    // a real layout box (inline boxes are skipped — their `clientWidth` is 0
    // while `scrollWidth` is engine-dependent), and the failure names the
    // culprit. Both gates POLL so a transient reflow (late webfont swap,
    // scrollbar appearing) is retried instead of failing the run.
    //
    // FIX ROUND 2 (ocr): the gate must NOT pass vacuously when the chip row is
    // deleted — assert the row and a non-empty chip set BEFORE the clip check.
    const chipRow = page.getByTestId('place-kind-chip-row')
    await expect(chipRow).toBeVisible()
    const chipCount = await page.locator(KIND_CHIP_SELECTOR).count()
    expect(chipCount, 'the kind-chip row must render at least one chip').toBeGreaterThan(0)

    await expect
      .poll(async () => {
        return page.evaluate(({ tolerance, chipSelector }: { tolerance: number; chipSelector: string }) => {
          const offenders: string[] = []
          const check = (el: Element, name: string) => {
            if (el.scrollWidth > el.clientWidth + tolerance) {
              offenders.push(`${name} (scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth})`)
            }
            // Any descendant with non-whitespace text AND a real layout box is a
            // clip candidate. Inline boxes (`display: inline`) have `clientWidth === 0`
            // while `scrollWidth` is engine-dependent, so they are skipped — a
            // non-clipping inline span would otherwise false-positive.
            el.querySelectorAll('*').forEach((desc) => {
              if ((desc.textContent ?? '').trim().length > 0 && desc.clientWidth > 0) {
                if (desc.scrollWidth > desc.clientWidth + tolerance) {
                  offenders.push(`${name} → <${desc.tagName.toLowerCase()}> (scrollWidth ${desc.scrollWidth} > clientWidth ${desc.clientWidth})`)
                }
              }
            })
          }
          // V33-D: every pill in the ONE wrapping row, including the row's own
          // controls (`Open now`, `Café`, `More kinds`) and the Maps door that
          // left the row for its own line.
          const selectors = [
            chipSelector,
            '[data-testid^="place-kind-placeholder-"]',
            '[data-testid="place-coffee-filter"]',
            '[data-testid="place-coffee-nearby"]',
            '[data-testid="places-open-now-filter"]',
            '[data-testid="places-saved-filter"]',
            '[data-testid="place-more-kinds"]',
          ]
          for (const selector of selectors) {
            document.querySelectorAll(selector).forEach((pill) => {
              check(pill, `${pill.getAttribute('data-testid')}`)
            })
          }
          return offenders
        }, { tolerance: CLIP_TOLERANCE, chipSelector: KIND_CHIP_SELECTOR })
      }, {
        message: 'the 390px filter row must clip no text',
        timeout: 10_000,
      })
      .toEqual([])

    // V33-D — THE ROW WRAPS AND SHOWS EVERY PILL (the founder's wife's ask,
    // `muzk5y54`): no side-scroll, no pill pushed off screen, and no page widen.
    // This is the INVERSE of the assertion it replaces, which required the row to
    // side-scroll.
    await expect
      .poll(async () => {
        return page.evaluate((tolerance: number) => {
          const doc = document.documentElement
          const row = document.querySelector('[data-testid="place-kind-chip-row"]') as HTMLElement | null
          if (row === null) return { missing: true }
          const viewport = doc.clientWidth
          const offscreen: string[] = []
          row.querySelectorAll<HTMLElement>('[data-testid]').forEach((pill) => {
            const box = pill.getBoundingClientRect()
            if (box.width > 0 && (box.left < -1 || box.right > viewport + 1)) {
              offscreen.push(pill.getAttribute('data-testid') ?? '?')
            }
          })
          return {
            missing: false,
            pageOverflow: doc.scrollWidth > viewport + tolerance,
            rowOverflow: row.scrollWidth - row.clientWidth,
            offscreen,
          }
        }, CLIP_TOLERANCE)
      }, {
        message: 'the pill row must wrap with every pill visible at 390px',
        timeout: 10_000,
      })
      .toEqual({ missing: false, pageOverflow: false, rowOverflow: 0, offscreen: [] })

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

  // THE DOOR IS STILL A DOOR — V33-D moved it OUT of the pill row (`muzk3j1e`):
  // it answers the AREA question ("where is coffee around here"), not a filter
  // over this list, so it is no longer a pill among the filters. It stays a real
  // `<a>` to Maps.
  await expect(page.getByTestId('place-coffee-nearby')).toHaveRole('link')
  await expect(page.getByTestId('place-coffee-nearby')).toHaveAttribute('href', /google\.com\/maps/)
  // ...and the TOGGLE is the one coffee pill in the row — exactly once.
  const chipRow = page.getByTestId('place-kind-chip-row')
  await expect(chipRow.getByTestId('place-coffee-filter')).toHaveCount(1)
  await expect(chipRow.getByTestId('place-coffee-nearby')).toHaveCount(0)
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
