/**
 * V34 slice D — THE PLACE'S OWN ATTRIBUTES, AS PILLS ON `/place/:id`.
 *
 * The founder, anchored on this exact block of the place page:
 *
 *   *"The same filters that were used on the places page to get to this place
 *   could be populated here and be shown in the same way in pill form to show
 *   like these pills represent this place, so like coffee nearby, outdoor,
 *   playground."*
 *
 * WHAT THIS FILE PINS, and the half of each that could actually break:
 *
 *   1. The pills are the place's OWN stored facts — the kind pill's word comes
 *      from `placeKindLabel`, the indoor pill's from `placeIndoorLabel`, so the
 *      assertions read the seams rather than a second copy of the mapping. The
 *      expectations are built from the row read back over PostgREST (never
 *      hardcoded), because the pill's JOB is to repeat the row.
 *
 *   2. ⚠️ THE COFFEE PILL IS THREE CASES, NOT TWO — and collapsing `false`
 *      into `null` is the defect `places.coffee_nearby`'s three-valued design
 *      exists to prevent. `true` renders "Coffee nearby"; `false` renders NO
 *      pill (OSM was asked and found none); `null` renders NO pill (NEVER
 *      ASKED — what every pre-0068 row carries). Each case is written to the
 *      live row, read back to prove the write landed, reloaded in the browser,
 *      and asserted on its own — a spec that only ever tested `true` would pass
 *      against a page that rendered the pill for every value.
 *
 *      ⚠️ AND THE BATHROOMS PILL (V36, `muzka6tz`) IS THE SAME THREE CASES, held
 *      to the same standard by its own test. `true` renders "Bathrooms
 *      available"; `false` and `null` render NOTHING, separately asserted. The
 *      stakes are higher than coffee's: a wrong bathrooms pill costs a parent a
 *      toddler emergency, so a `null` row being read as "no bathrooms" is the
 *      single most expensive defect this file guards.
 *
 *   3. The pills are LABELS, not filters. The directory's are `<button>`s
 *      carrying `aria-pressed`; these must be neither. The assertion is
 *      positional as well as negative: NOTHING inside the pill row is a button,
 *      a link or a radio.
 *
 *   4. The row WRAPS rather than widens at 390px — `scrollWidth <=
 *      clientWidth + 1` on `documentElement`, the repo's own overflow rule.
 *
 *   5. A SIGNED-OUT visitor sees the SAME pills. They are public facts about a
 *      place (the 0029 anon SELECT is the reason that grant exists), not facts
 *      about a parent, so nothing here may sit behind the session gate.
 *
 * THE LIVE-DATA DISCIPLINE (docs/agents/e2e-fixture-convention.md). This suite
 * runs against the LIVE Supabase project, so the one column this spec writes is
 * SNAPSHOTTED before the run and RESTORED in a `finally`, with the restore
 * asserted — including when the stored value is `null`, which is a real state
 * and not "nothing to restore". No account, no drop-in and no notification is
 * created by this file; it reads a seeded row and writes one column of it.
 *
 * WHY THE ROW IS WRITTEN OVER POSTGREST: `places_update_moderators` (0062) is
 * the ONLY UPDATE policy on `places`, and it admits moderators only — so the
 * `false` and `null` cases cannot be set up through the app's own UI without
 * elevating the marker, which would be a far larger fixture than the column it
 * is there to test. The helper's read-back is what keeps that honest: a PATCH
 * that matched nothing fails loudly instead of letting the "no pill" assertion
 * pass because the value never changed.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  E2E_BASE_URL,
  readPlaceByName,
  readPlaceBathroomsNearby,
  readPlaceCoffeeNearby,
  readSupabaseEnv,
  setPlaceBathroomsNearby,
  setPlaceCoffeeNearby,
} from './fixtures'
// The pure seams, imported rather than re-spelled: the spec asserts the label
// the app decided, not a second copy of the decision (the repo's one-copy rule).
import { placeIndoorLabel, placeKindLabel } from '../src/lib/places'

/**
 * A seeded playground with stored coordinates, a real `kind`/`indoor`, and —
 * ⚠️ DELIBERATELY — a place NO OTHER SPEC RESERVES.
 *
 * An earlier draft used `Alki Playground`, which `place-reviews.e2e.ts` hardcodes
 * as its own fixture AND requires to carry zero reviews by other parents
 * (`claimEmptyReviewSet`). Sharing it coupled two unrelated specs: this one
 * writes a column of that row, and the reviews spec asserts a precondition about
 * it. Measured: `place-reviews.e2e.ts` was red on `Alki Playground now carries
 * 1 review(s) by other parents` in the same run. `Bryant Playground` is a real
 * seeded playground with no other spec's name on it, so the two lanes cannot
 * collide.
 *
 * Its stored `coffee_nearby` is `null` ("never asked") — which is also why the
 * three-case spec below snapshots and restores it rather than assuming a value.
 */
const PLACE_NAME = 'Bryant Playground'

/** Every pill in the row, by testid, so a count is always about the row. */
const PILLS = '[data-testid^="place-pill-"]'

interface PlaceAttributes {
  kind: string
  indoor: boolean
}

/**
 * The place's two PILL columns, read over PostgREST with the app's own anon key
 * — the same read `/place/:id` itself makes (0029's `places_select_public` is
 * anon + authenticated). `readPlaceByName` deliberately carries only the photo
 * columns, so this is the narrow second read that lets every expectation below
 * be built from the row instead of a hardcoded word.
 */
async function readPlaceAttributes(id: string): Promise<PlaceAttributes> {
  const { url, anonKey } = readSupabaseEnv()
  const res = await fetch(
    `${url}/rest/v1/places?id=eq.${encodeURIComponent(id)}&select=kind,indoor`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } },
  )
  if (!res.ok) {
    throw new Error(
      `reading the place's kind/indoor failed: HTTP ${res.status} ${await res.text()}`,
    )
  }
  const rows = (await res.json()) as PlaceAttributes[]
  if (rows.length !== 1) {
    throw new Error(`expected exactly one place for id ${id}, got ${rows.length}`)
  }
  return rows[0]
}

/** Open the place page and wait for the page AND the pill row to paint. */
async function openPlacePage(page: Page, placeId: string): Promise<void> {
  await page.goto(`/place/${placeId}`)
  // The h1 is the page's "this row rendered" gate; the pill row is asserted
  // separately, so a pill that failed to render cannot hide behind a page that
  // never painted (the vacuous-absence class this repo names).
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('place-pill-row')).toBeVisible()
}

test('the place page renders the place’s own kind and indoor/outdoor as pills (V34-D)', async ({
  page,
}) => {
  const place = await readPlaceByName(PLACE_NAME)
  const attributes = await readPlaceAttributes(place.id)

  await openPlacePage(page, place.id)

  const kindPill = page.getByTestId('place-pill-kind')
  await expect(kindPill).toHaveCount(1)
  await expect(kindPill).toHaveText(placeKindLabel(attributes.kind))
  // The word is the real one for this seeded row, not the generic fallback —
  // otherwise this test would pass on a row whose kind the app never read.
  expect(placeKindLabel(attributes.kind), 'the fixture row must have a real kind').not.toBe('Place')

  const indoorPill = page.getByTestId('place-pill-indoor')
  await expect(indoorPill).toHaveCount(1)
  await expect(indoorPill).toHaveText(placeIndoorLabel({ indoor: attributes.indoor }))
})

test('coffee nearby: true renders the pill, false and null render none (V34-D)', async ({
  page,
}) => {
  const place = await readPlaceByName(PLACE_NAME)
  const original = await readPlaceCoffeeNearby(place.id)

  try {
    // --- CASE 1: `true` — a cafe IS near. The pill renders. ---
    const wrote = await setPlaceCoffeeNearby(place.id, true)
    expect(wrote.ok, `setting coffee_nearby=true must land: ${wrote.output}`).toBe(true)
    expect(await readPlaceCoffeeNearby(place.id), 'the true write must be readable').toBe(true)
    await openPlacePage(page, place.id)
    await expect(page.getByTestId('place-pill-coffee')).toHaveCount(1)
    await expect(page.getByTestId('place-pill-coffee')).toHaveText('Coffee nearby')
    // The kind and indoor pills are still there: the coffee pill is an
    // ADDITION to the row, never a replacement for what it already showed.
    await expect(page.getByTestId('place-pill-kind')).toHaveCount(1)
    await expect(page.getByTestId('place-pill-indoor')).toHaveCount(1)

    // --- CASE 2: `false` — OSM was asked and found none. NO pill, and
    // specifically not a pill saying "No coffee nearby". ---
    const cleared = await setPlaceCoffeeNearby(place.id, false)
    expect(cleared.ok, `setting coffee_nearby=false must land: ${cleared.output}`).toBe(true)
    expect(await readPlaceCoffeeNearby(place.id), 'the false write must be readable').toBe(false)
    await page.reload()
    await expect(page.getByTestId('place-pill-row')).toBeVisible()
    await expect(page.getByTestId('place-pill-coffee')).toHaveCount(0)
    // The absence is not the word hidden somewhere else in the row.
    await expect(page.getByTestId('place-pill-row')).not.toContainText('Coffee')
    // The page still rendered its other pills — absence on a broken page would
    // satisfy every count above for the wrong reason.
    await expect(page.getByTestId('place-pill-kind')).toHaveCount(1)

    // --- CASE 3: `null` — NEVER ASKED, what every pre-0068 row carries. NO
    // pill either, and this is the case a two-valued reading gets wrong. ---
    const nulled = await setPlaceCoffeeNearby(place.id, null)
    expect(nulled.ok, `setting coffee_nearby=null must land: ${nulled.output}`).toBe(true)
    expect(await readPlaceCoffeeNearby(place.id), 'the null write must be readable').toBeNull()
    await page.reload()
    await expect(page.getByTestId('place-pill-row')).toBeVisible()
    await expect(page.getByTestId('place-pill-coffee')).toHaveCount(0)
    await expect(page.getByTestId('place-pill-row')).not.toContainText('Coffee')
    await expect(page.getByTestId('place-pill-kind')).toHaveCount(1)
  } finally {
    // RESTORE THE COLUMN EXACTLY AS FOUND — `null` is a real state to write
    // back, not "nothing to do".
    const restored = await setPlaceCoffeeNearby(place.id, original)
    expect(restored.ok, `restoring coffee_nearby must succeed: ${restored.output}`).toBe(true)
  }
  expect(await readPlaceCoffeeNearby(place.id), 'the row must be back as found').toBe(original)
})

/**
 * V36 (`muzka6tz`) — THE BATHROOMS PILL IS THREE CASES, NOT TWO.
 *
 * This is the same discipline as the coffee test above, and it is written as its
 * own test rather than folded into that one because the failure it guards against
 * is more expensive: a wrong "Café" pill costs a parent a coffee, a wrong
 * "Bathrooms" pill costs them a toddler emergency. The assertion that matters is
 * CASE 3 — a `null` row (NEVER ASKED, what all 234 pre-0070 rows carry) must
 * render NOTHING, and specifically must not be read as `false` and printed as
 * "no bathrooms". Collapsing those two is the defect the column's three-valued
 * design exists to prevent, so `false` and `null` are written, read back, and
 * asserted SEPARATELY.
 */
test('bathrooms nearby: true renders the pill, false and null render none (V36)', async ({
  page,
}) => {
  const place = await readPlaceByName(PLACE_NAME)
  const original = await readPlaceBathroomsNearby(place.id)

  try {
    // --- CASE 1: `true` — a bathroom IS near. The pill renders. ---
    const wrote = await setPlaceBathroomsNearby(place.id, true)
    expect(wrote.ok, `setting bathrooms_nearby=true must land: ${wrote.output}`).toBe(true)
    expect(await readPlaceBathroomsNearby(place.id), 'the true write must be readable').toBe(true)
    await openPlacePage(page, place.id)
    await expect(page.getByTestId('place-pill-bathrooms')).toHaveCount(1)
    await expect(page.getByTestId('place-pill-bathrooms')).toHaveText('Bathrooms available')
    // The kind and indoor pills are still there: the bathrooms pill is an
    // ADDITION to the row, never a replacement for what it already showed.
    await expect(page.getByTestId('place-pill-kind')).toHaveCount(1)
    await expect(page.getByTestId('place-pill-indoor')).toHaveCount(1)

    // --- CASE 2: `false` — OSM was asked and found none. NO pill, and
    // specifically not a pill saying "No bathrooms". ---
    const cleared = await setPlaceBathroomsNearby(place.id, false)
    expect(cleared.ok, `setting bathrooms_nearby=false must land: ${cleared.output}`).toBe(true)
    expect(await readPlaceBathroomsNearby(place.id), 'the false write must be readable').toBe(false)
    await page.reload()
    await expect(page.getByTestId('place-pill-row')).toBeVisible()
    await expect(page.getByTestId('place-pill-bathrooms')).toHaveCount(0)
    // The absence is not the word hidden somewhere else in the row.
    await expect(page.getByTestId('place-pill-row')).not.toContainText(/bathroom/i)
    // The page still rendered its other pills — absence on a broken page would
    // satisfy every count above for the wrong reason.
    await expect(page.getByTestId('place-pill-kind')).toHaveCount(1)

    // --- CASE 3: `null` — NEVER ASKED, what every pre-0070 row carries. NO pill
    // either, and this is the case a two-valued reading gets wrong: `null` is NOT
    // "no bathrooms", it is "we do not know". ---
    const nulled = await setPlaceBathroomsNearby(place.id, null)
    expect(nulled.ok, `setting bathrooms_nearby=null must land: ${nulled.output}`).toBe(true)
    expect(await readPlaceBathroomsNearby(place.id), 'the null write must be readable').toBeNull()
    await page.reload()
    await expect(page.getByTestId('place-pill-row')).toBeVisible()
    await expect(page.getByTestId('place-pill-bathrooms')).toHaveCount(0)
    await expect(page.getByTestId('place-pill-row')).not.toContainText(/bathroom/i)
    await expect(page.getByTestId('place-pill-kind')).toHaveCount(1)
  } finally {
    // RESTORE THE COLUMN EXACTLY AS FOUND — `null` is a real state to write back,
    // not "nothing to do".
    const restored = await setPlaceBathroomsNearby(place.id, original)
    expect(restored.ok, `restoring bathrooms_nearby must succeed: ${restored.output}`).toBe(true)
  }
  expect(await readPlaceBathroomsNearby(place.id), 'the row must be back as found').toBe(original)
})

test('the pills are labels, not filters — nothing in the row is pressable (V34-D)', async ({
  page,
}) => {
  const place = await readPlaceByName(PLACE_NAME)
  await openPlacePage(page, place.id)

  const row = page.getByTestId('place-pill-row')
  // At least the kind and indoor pills, so the negative assertions below are
  // not about an empty container.
  expect(await row.locator(PILLS).count()).toBeGreaterThanOrEqual(2)

  // The directory's chips are buttons with `aria-pressed`; these are not.
  await expect(row.locator('button')).toHaveCount(0)
  await expect(row.locator('a')).toHaveCount(0)
  await expect(row.locator('input')).toHaveCount(0)
  await expect(row.locator('[aria-pressed]')).toHaveCount(0)
  // And each pill is a plain list item, not a role a screen reader would
  // announce as actionable.
  await expect(page.getByTestId('place-pill-kind')).toHaveJSProperty('tagName', 'LI')
  await expect(page.getByTestId('place-pill-indoor')).toHaveJSProperty('tagName', 'LI')
})

test('the pill row wraps at 390px and never widens the page (V34-D)', async ({ page }) => {
  const place = await readPlaceByName(PLACE_NAME)
  await page.setViewportSize({ width: 390, height: 844 })
  await openPlacePage(page, place.id)

  const row = page.getByTestId('place-pill-row')
  await expect(row).toHaveCount(1)
  const flexWrap = await row.evaluate((node) => getComputedStyle(node).flexWrap)
  expect(flexWrap, 'the row must wrap rather than overflow').toBe('wrap')

  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(
    widths.scroll,
    `390px must not widen: scrollWidth ${widths.scroll} vs clientWidth ${widths.client}`,
  ).toBeLessThanOrEqual(widths.client + 1)

  // Every pill stays INSIDE the viewport's right edge — a pill clipped at the
  // edge would keep the document width legal while hiding half a word.
  for (const testid of ['place-pill-kind', 'place-pill-indoor']) {
    const box = await page.getByTestId(testid).boundingBox()
    expect(box, `${testid} must render a box`).not.toBeNull()
    expect(box!.x + box!.width, `${testid} must not cross the 390px edge`).toBeLessThanOrEqual(391)
  }
})

test('a signed-out visitor sees the same pills (V34-D)', async ({ browser }) => {
  const place = await readPlaceByName(PLACE_NAME)
  const attributes = await readPlaceAttributes(place.id)
  const context = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: { cookies: [], origins: [] },
  })
  try {
    const anonPage = await context.newPage()
    await openPlacePage(anonPage, place.id)
    // The SAME words a signed-in parent reads: the pills are the place's own
    // public columns, never a viewer-specific decoration.
    await expect(anonPage.getByTestId('place-pill-kind')).toHaveText(
      placeKindLabel(attributes.kind),
    )
    await expect(anonPage.getByTestId('place-pill-indoor')).toHaveText(
      placeIndoorLabel({ indoor: attributes.indoor }),
    )
    // And they are not a sign-in teaser: no pressable control hides in the row.
    await expect(anonPage.getByTestId('place-pill-row').locator('button')).toHaveCount(0)
  } finally {
    await context.close()
  }
})
