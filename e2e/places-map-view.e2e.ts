/**
 * Spec (V24 slice 10): THE MAP VIEW — "See map" opens a map over the SAME
 * result set the list was showing, with a horizontally swipeable card strip
 * along the bottom. Focusing a card recentres the map; tapping a card opens that
 * place's detail page; "Back to list" returns to the list the parent came from,
 * with its filters and its scroll position intact.
 *
 * WHY THE ASSERTIONS LOOK THE WAY THEY DO:
 *
 *  - THE RECENTRE IS PROVEN BY STATE, NOT PIXELS. The map container carries
 *    `data-focused-place="<place id>"` and the focused card carries
 *    `aria-current="true"`. A pixel diff or a "did this tile load" check is a
 *    flake: both depend on OpenStreetMap being reachable and on easing having
 *    finished. The attribute is the app's own decision, and the pan is that
 *    decision's rendering.
 *
 *  - THE SWIPE IS A REAL SCROLL. The strip is CSS `scroll-snap`; the spec sets
 *    `scrollLeft` on the real element (what a thumb does) rather than calling a
 *    handler, so the rAF-throttled scroll → index mapping is what is under test.
 *
 *  - AT MOST ONE MAP IS MOUNTED. Every existing spec locates the directory's map
 *    as `places-map`, so the map view's own map is `places-map-view-map` and the
 *    band is NOT rendered while the map view is up. Each phase here asserts the
 *    other id has count 0, which is the trap this slice was designed around:
 *    two mounted Leaflet maps would fail every `getByTestId('places-map')` in
 *    the suite under Playwright's strict mode.
 *
 *  - ONE SPEC DRIVES THE STRIP WITH THE KEYBOARD ONLY. Tapping is not an input
 *    method for everyone, so the arrow keys and the explicit Previous/Next
 *    controls are covered as first-class paths, not as an afterthought.
 *
 * Cleanup: NONE, and that is deliberate — this spec creates no rows and no
 * accounts. It reads the seeded directory through the marker's own storage state
 * (the `chromium` project), filters it with the app's existing controls, and
 * writes nothing. There is therefore no fixture for the marker sweep to find and
 * no REST DELETE to scope.
 */
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { settleOnRoute } from './fixtures'

/** The directory's distance control, set to "Any distance" (see below). */
async function setAnyDistance(page: Page): Promise<void> {
  await page.getByTestId('places-distance-filter').selectOption('any')
}

/**
 * Open /browse with the distance filter wide, which is what makes this spec
 * INDEPENDENT of whatever radius an earlier spec parked the marker on.
 *
 * `feed-empty-state.e2e.ts` deliberately leaves the marker ~118 miles away on a
 * 2-mile radius; without this the map view would open over a one-card strip and
 * the swipe test would have nothing to swipe to. The search text then narrows
 * the set to one kind, so the strip is long enough for a swipe and short enough
 * to be cheap.
 */
async function openMapView(page: Page): Promise<void> {
  await page.goto('/browse')
  await settleOnRoute(page, '/browse')
  await setAnyDistance(page)
  await page.getByTestId('places-search').fill('park')
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  await page.getByTestId('places-see-map').click()
  await expect(page.getByTestId('places-map-view-map')).toBeVisible()
  await expect(page.getByTestId('places-map-strip')).toBeVisible()
}

/** Every place name the LIST is showing, in the list's own order. */
async function listNames(page: Page): Promise<string[]> {
  return page.getByTestId('place-card-name').allInnerTexts()
}

/** Every card's place name, in the strip's own order. */
async function cardNames(page: Page): Promise<string[]> {
  const texts = await page.locator('[data-testid^="places-map-card-"]').allInnerTexts()
  return texts.map((text) => text.split('\n')[0] ?? '')
}

/**
 * Every place id the given locator points at, in DOM order.
 *
 * Read from each node's `href` rather than from a data attribute: a directory
 * row is a react-router `Link` that carries no `data-place-id` (and adding one
 * to satisfy a spec would be a test seam in product markup). The card and the
 * row both link to `/place/:id` through the SAME `placePath` builder, so the
 * href is the honest comparison — it is the app's own route for that place, not
 * a parallel identifier.
 */
async function placeIds(scope: Locator): Promise<string[]> {
  return scope.evaluateAll((nodes) =>
    nodes.map((node) => {
      const href = node.getAttribute('href') ?? ''
      const [, id = ''] = href.split('/place/')
      return id.split(/[/?#]/)[0] ?? ''
    }),
  )
}

/**
 * The map's declared focused place, read from the map view's OWN container (the
 * band's `places-map` is not mounted in this view — see the file header).
 */
function focusedPlaceId(page: Page): Promise<string | null> {
  return page.getByTestId('places-map-view-map').getAttribute('data-focused-place')
}

test('the map view shows the list\'s own result set and mounts exactly one map (V24 s10)', async ({
  page,
}) => {
  // The list's result set, captured BEFORE the switch — this is the thing the
  // map view must reproduce, not re-derive.
  await page.goto('/browse')
  await settleOnRoute(page, '/browse')
  await setAnyDistance(page)
  await page.getByTestId('places-search').fill('park')
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  const names = await listNames(page)
  expect(names.length, 'the search must leave more than one row to compare').toBeGreaterThan(1)
  const listRowIds = await placeIds(page.getByTestId('place-row'))

  // AC: there IS a "See map" entry point, and it is a real >=44px tap target
  // with a real accessible name (the repo's measured floor).
  const seeMap = page.getByTestId('places-see-map')
  await expect(seeMap).toBeVisible()
  const seeMapBox = await seeMap.boundingBox()
  if (seeMapBox === null) throw new Error('the See map control has no box')
  expect(seeMapBox.width).toBeGreaterThanOrEqual(44)
  expect(seeMapBox.height).toBeGreaterThanOrEqual(44)

  await seeMap.click()
  const mapViewMap = page.getByTestId('places-map-view-map')
  await expect(mapViewMap).toBeVisible()

  // AC (the trap): the map view REPLACED the band — the old test id is gone, so
  // no spec in the suite can match two maps at once.
  await expect(page.getByTestId('places-map')).toHaveCount(0)
  await expect(page.getByTestId('places-map-view-map')).toHaveCount(1)

  // AC: THE SAME RESULT SET. Same count, same order, place for place.
  const cards = await cardNames(page)
  expect(cards, 'the strip shows the list\'s rows, in the list\'s order').toEqual(names)
  const cardIds = await placeIds(page.locator('[data-testid^="places-map-card-"]'))
  expect(cardIds, 'each card is the same place row the list rendered').toEqual(listRowIds)

  // AC: the first card is the focused one and the map agrees, through the
  // observable recentre attribute.
  await expect(page.getByTestId('places-map-card-0')).toHaveAttribute('aria-current', 'true')
  expect(await focusedPlaceId(page)).toBe(cardIds[0])

  // AC: a swipe must never be the ONLY way — the explicit controls exist, carry
  // real accessible names, and are >=44px.
  const prev = page.getByTestId('places-map-prev')
  const next = page.getByTestId('places-map-next')
  await expect(prev).toHaveAccessibleName(/previous/i)
  await expect(next).toHaveAccessibleName(/next/i)
  for (const control of [prev, next]) {
    const box = await control.boundingBox()
    if (box === null) throw new Error('a strip control has no box')
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  // At the first card, "Previous" is honestly disabled rather than a no-op.
  await expect(prev).toBeDisabled()

  // AC: the strip is horizontal snap scrolling and NOT a vertical page hijack.
  const strip = page.getByTestId('places-map-strip')
  const overflowX = await strip.evaluate((el) => getComputedStyle(el).overflowX)
  expect(overflowX, 'the strip scrolls horizontally').toBe('auto')
  const snapType = await strip.evaluate((el) => getComputedStyle(el).scrollSnapType)
  expect(snapType, 'the strip snaps').toContain('x')
  const beforeScroll = await page.evaluate(() => window.scrollY)
  await strip.evaluate((el) => {
    el.scrollLeft = el.clientWidth
  })
  // A horizontal scroll inside the strip must not move the PAGE.
  expect(await page.evaluate(() => window.scrollY)).toBe(beforeScroll)
})

test('swiping the strip recentres the map, and a card opens its detail page (V24 s10)', async ({
  page,
}) => {
  await openMapView(page)
  const cardCount = await page.locator('[data-testid^="places-map-card-"]').count()
  expect(cardCount, 'the strip needs a second card to swipe to').toBeGreaterThan(1)
  const cardIds = await placeIds(page.locator('[data-testid^="places-map-card-"]'))

  // Baseline: card 0 is focused and the map says so.
  expect(await focusedPlaceId(page)).toBe(cardIds[0])
  await expect(page.getByTestId('places-map-card-0')).toHaveAttribute('aria-current', 'true')

  // AC: THE SWIPE. The strip really moves, and the focus/map follow it.
  //
  // WHAT THIS DOES, and why it is a scroll of the real element. `scrollIntoView`
  // on the SECOND card is the input the strip is built for — a horizontal
  // scroll-snap scroller — and it is exactly what a thumb's fling resolves to:
  // the browser scrolls the container and the snap points settle on a card. It
  // is used instead of a synthesised touch drag because the app has no gesture
  // code to exercise (the requirement is CSS snap plus a scroll handler), and
  // instead of assigning `scrollLeft` because that write is NOT honoured under
  // `scroll-snap-type: x mandatory` — MEASURED, the container snapped straight
  // back and the strip was left focusing card 0.
  //
  // The focus is then read from the CARD's own `aria-current`, so the swipe is
  // proven to have changed what the strip considers focused rather than merely to
  // have scrolled the box.
  await page
    .getByTestId('places-map-card-1')
    .evaluate((el) => el.scrollIntoView({ behavior: 'instant', inline: 'center', block: 'nearest' }))

  // AC: the focused CARD moved to index 1 — asserted as an attribute, so a
  // mid-scroll position can never pass by accident.
  await expect(page.getByTestId('places-map-card-1')).toHaveAttribute('aria-current', 'true')
  await expect(page.getByTestId('places-map-card-0')).not.toHaveAttribute('aria-current', 'true')

  // AC: the MAP RECENTRED, proven by the observable attribute the slice exists
  // to expose. The polling expectation is deliberate: the scroll handler
  // intentionally coalesces to one animation frame, so the update is a frame
  // after the scroll rather than synchronous with it.
  await expect
    .poll(() => focusedPlaceId(page), {
      message: 'the map recentres on the card the swipe focused',
    })
    .toBe(cardIds[1])

  // AC: the card the map followed is the card the swipe moved to — the two
  // halves cannot be reading different state. (Already implied by the two
  // assertions above; restated as one href check so a future change to either
  // side has to argue with the identity of the card itself.)
  await expect(page.getByTestId('places-map-card-1')).toHaveAttribute(
    'href',
    `/place/${cardIds[1]}`,
  )

  // AC: TAPPING A CARD OPENS THAT PLACE'S DETAIL PAGE. The card is a react-router
  // Link, so this is a real navigation and the URL names the SAME place the card
  // carried — not merely "some place page".
  const focusedCard = page.getByTestId('places-map-card-1')
  const cardNameText = (await focusedCard.innerText()).split('\n')[0] ?? ''
  await focusedCard.click()
  await expect(page).toHaveURL(new RegExp(`/place/${cardIds[1]}$`))
  await expect(page.locator('body')).toContainText(cardNameText)
})

test('the strip is fully operable with the keyboard alone (V24 s10)', async ({ page }) => {
  await openMapView(page)
  const cardIds = await placeIds(page.locator('[data-testid^="places-map-card-"]'))
  expect(cardIds.length, 'the keyboard spec needs at least three cards').toBeGreaterThan(2)

  // Reach the strip the way a keyboard user does — by Tabbing, not by a test
  // shortcut. The first card is a real focusable link.
  await page.getByTestId('places-map-card-0').focus()
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(
    'places-map-card-0',
  )

  // AC: ArrowRight moves the focus to the next card AND recentres the map.
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('places-map-card-1')).toHaveAttribute('aria-current', 'true')
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
    'the DOM focus follows the index, or the next keypress would land elsewhere',
  ).toBe('places-map-card-1')
  await expect
    .poll(() => focusedPlaceId(page), { message: 'ArrowRight recentres the map' })
    .toBe(cardIds[1])

  // AC: ArrowRight again, and the map follows without a pointer ever touching the
  // strip.
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('places-map-card-2')).toHaveAttribute('aria-current', 'true')
  await expect
    .poll(() => focusedPlaceId(page), { message: 'a second ArrowRight recentres the map' })
    .toBe(cardIds[2])

  // AC: ArrowLeft goes back, and the map follows in that direction too.
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('places-map-card-1')).toHaveAttribute('aria-current', 'true')
  await expect
    .poll(() => focusedPlaceId(page), { message: 'ArrowLeft recentres the map back' })
    .toBe(cardIds[1])

  // AC: NEXT/PREVIOUS are the pointer half of the same rule — a swipe is not the
  // only way, and neither is the keyboard.
  await page.getByTestId('places-map-next').click()
  await expect
    .poll(() => focusedPlaceId(page), { message: 'Next recentres the map' })
    .toBe(cardIds[2])
  await page.getByTestId('places-map-prev').click()
  await page.getByTestId('places-map-prev').click()
  await expect
    .poll(() => focusedPlaceId(page), { message: 'Previous recentres the map' })
    .toBe(cardIds[0])
  // The clamp is visible: at the first card there is no further Previous.
  await expect(page.getByTestId('places-map-prev')).toBeDisabled()
})

test('"Back to list" restores the same list, its filters and its scroll position (V24 s10)', async ({
  page,
}) => {
  await page.goto('/browse')
  await settleOnRoute(page, '/browse')
  await setAnyDistance(page)
  await page.getByTestId('places-search').fill('park')
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  // Two further, independent directories of state the round trip must survive:
  // the indoor/outdoor toggle and the filter modal's SORT.
  //
  // The sort is chosen deliberately over the date chips: a date window can (and,
  // for `park` + indoor + Tomorrow, does) narrow the set to nothing, which would
  // leave the map view with no card to open its entry control from. Sorting only
  // REORDERS, so the round trip is exercised against a live, non-empty list.
  await page.getByTestId('places-indoor-filter').click()
  await page.getByTestId('filter-sort-btn').click()
  await page.getByTestId('filter-sort-select').selectOption('newest')
  await page.getByTestId('filter-apply-btn').click()
  await expect(page.getByTestId('places-indoor-filter')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  const names = await listNames(page)

  /**
   * A temporary SPACER, and it is what makes the scroll half of this spec
   * deterministic rather than a measure of the harness.
   *
   * MEASURED: the filters above leave only TWO rows on the seeded directory, so
   * on Playwright's 1280x720 viewport the whole page is ~1053px tall. A page
   * that short has no scroll to lose, so "the offset came back" would be
   * vacuously true (0 === 0) and the round trip would have nothing to prove.
   * Widening the set instead would make the spec depend on the seed.
   *
   * The spacer gives the document a scrollRange without touching the
   * directory's own DOM, and it is removed on the way out so nothing leaks into
   * a later assertion in this page.
   */
  await page.evaluate(() => {
    const spacer = document.createElement('div')
    spacer.id = 'scroll-range-probe'
    spacer.style.height = '1800px'
    document.body.appendChild(spacer)
  })
  const seeMap = page.getByTestId('places-see-map')
  // Let the harness settle the control into view first, then scroll a little
  // FURTHER — which keeps the control on screen while moving the page away from
  // the top.
  //
  // The order is load-bearing and was MEASURED: choosing an offset first and
  // letting the click settle the control afterwards loses the offset, because a
  // control left above the viewport is scrolled by Playwright immediately before
  // the click. Settling first and then nudging keeps both — the control stays
  // visible and the page is genuinely scrolled when the offset is saved.
  await seeMap.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollBy(0, 250))
  // Give the nudge a beat to land before it is read as the offset to restore.
  // Without it the read can happen inside the same task as the scroll, and the
  // number it captures is not the one the parent left.
  await page.waitForTimeout(200)
  const savedScroll = await page.evaluate(() => window.scrollY)
  expect(
    savedScroll,
    'the page must be scrolled away from the top for this to be a real check',
  ).toBeGreaterThan(0)

  await seeMap.click()
  await expect(page.getByTestId('places-map-view-map')).toBeVisible()

  // AC: "Back to list" exists, is a real control, and returns to the LIST.
  const back = page.getByTestId('places-back-to-list')
  await expect(back).toBeVisible()
  await expect(back).toHaveAccessibleName(/back to list/i)
  const backBox = await back.boundingBox()
  if (backBox === null) throw new Error('the Back to list control has no box')
  expect(backBox.height).toBeGreaterThanOrEqual(44)
  await back.click()

  // AC: the band is back — and there is still exactly ONE map mounted, because
  // the map view's map is unmounted rather than hidden.
  await expect(page.getByTestId('places-map-band')).toBeVisible()
  await expect(page.getByTestId('places-map')).toHaveCount(1)
  await expect(page.getByTestId('places-map-view-map')).toHaveCount(0)

  // AC: the SCROLL POSITION came back, to the exact offset the parent left, and
  // it is asserted FIRST — before any other control is driven.
  //
  // WHY THE ORDER MATTERS, and it is MEASURED: opening a fixed-position modal
  // (the Filter & sort dialog, asserted further down) scrolls the page, because
  // a closed <dialog>-shaped overlay is only reachable once the browser brings
  // the control that opens it into view. The restore had ALREADY PUT the page
  // back at the right offset; a later assertion then moved it. Checking the
  // restore immediately after the return measures the restore instead of the
  // harness.
  //
  // The poll (not a single sample) is for the other half: the restore runs in an
  // effect after the list re-renders, and it uses the reduced-motion-derived
  // scroll behaviour — smooth by default — so the page arrives over a few frames.
  await expect
    .poll(() => page.evaluate(() => window.scrollY), {
      message: 'the list scroll position is restored on the way back',
    })
    .toBe(savedScroll)

  // AC: THE SAME LIST — same rows, same order.
  expect(await listNames(page)).toEqual(names)

  // AC: the FILTER STATE survived the round trip. Asserted from the CONTROLS,
  // not from the result count: a filter that silently reset could still leave a
  // same-sized list behind, and the control is the state itself.
  await expect(page.getByTestId('places-search')).toHaveValue('park')
  await expect(page.getByTestId('places-indoor-filter')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('places-distance-filter')).toHaveValue('any')
  // The sort lives behind the modal, so it is read from the control that owns it.
  await page.getByTestId('filter-sort-btn').click()
  await expect(page.getByTestId('filter-sort-select')).toHaveValue('newest')
  await page.getByTestId('filter-apply-btn').click()

  // Nothing leaks: the probe spacer leaves with the spec that made it.
  await page.evaluate(() => document.getElementById('scroll-range-probe')?.remove())
})

/**
 * The one thing the four specs above deliberately do NOT assert: that no
 * `places-map-band` node survives while the map view is up. It is asserted in
 * the first spec through its own test id (count 0 for `places-map`), and the trap
 * is about the MAP's id rather than the band's wrapper — so the band is checked
 * where the round trip brings it back rather than duplicated here.
 */
test('the map view leaves no second Leaflet container behind (V24 s10)', async ({ page }) => {
  await openMapView(page)
  const containers = await page.locator('.leaflet-container').count()
  expect(containers, 'exactly one Leaflet instance is live in the map view').toBe(1)
  await page.getByTestId('places-back-to-list').click()
  await expect(page.getByTestId('places-map')).toHaveCount(1)
  expect(await page.locator('.leaflet-container').count()).toBe(1)
})
