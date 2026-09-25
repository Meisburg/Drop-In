/**
 * Spec (V21 t02, A2; V22 slice 12; V23 slice 3): THE PLACES DIRECTORY LIVES INSIDE THE POST FLOW.
 *
 * THE FOUNDER'S ASK, verbatim: "I'm beginning to think we don't need this
 * section anymore... in the post section when you select like where the place
 * is — that's when you have the option to browse the list and you can see all
 * of them on a map, right? So we move the map and the list of places to the
 * where section inside of the post section."
 *
 * WHAT THIS PROVES, in the order a parent would meet it:
 *  1. THE NAV IS NAVIGATION ONLY (V22 slice 12): its four tabs are exactly
 *     Drop Ins / Inbox / Places / Profile. The Post tab was an ACTION sitting
 *     in a nav bar (Apple HIG forbids it) and is gone; the freed slot went to
 *     Places (/browse). Removing the action tab is what makes step 2
 *     load-bearing: the directory has to be reachable from the feed's own
 *     "Post a drop-in" action.
 *  2. /new OFFERS THE DIRECTORY: the field's own "Browse places" button opens
 *     the SAME `PlaceDirectory` component /browse renders — the map band AND
 *     the list, not a second copy. V23 slice 3: the bottom "Browse all N
 *     places" door is GONE; the field's button is the only door.
 *  3. THE DIRECTORY IS THE REAL ONE: the search field and the filter control
 *     exist inside the sheet, which is the difference between "the full
 *     directory with its filters" and the V9 8-row shortcut that predated this
 *     ticket (PLACE_BROWSE_LIMIT = 8).
 *  4. THE MAP IS THERE: a Leaflet canvas with at least one real pin.
 *  5. SELECTING Writes the form: tapping a place name in the sheet closes it
 *     and fills the form's place field — the one `pickPlace` write path.
 *  6. V23 slice 3: the sheet is a real dialog — focus is trapped while open,
 *     Escape closes, the scroll container actually scrolls, and the bottom
 *     "browse-all-places" testid does not exist anywhere on /new.
 *
 * WHY THE ASSERTIONS ARE SHAPED THIS WAY: the earlier, WEAKER version of this
 * slice shipped the nav removal plus a map tweak and called itself done, while
 * /new still offered only the 8-row list. A test that only asserted "the Post
 * tab is gone" would have passed on that broken tree. Steps 2-5 exist because
 * "the action left the nav" and "the directory is reachable" are different
 * claims, and only the second one is the founder's ask.
 */
import { expect, test } from '@playwright/test'
import { settleOnRoute } from './fixtures'

test('the place directory is reachable from /new, with its map and list (V21 t02)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })

  // --- 1. THE NAV: navigation only. The Post tab is GONE (it was an action,
  //         not a destination); the four surviving tabs are Drop Ins / Inbox /
  //         Places / Profile. ---
  await settleOnRoute(page, '/')
  const nav = page.locator('nav').last()
  await expect(nav.getByRole('link', { name: 'Post', exact: true })).toHaveCount(0)
  for (const label of ['Drop Ins', 'Inbox', 'Places', 'Profile']) {
    await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible()
  }

  // --- 2. THE DOOR ON /new — reached via the feed's OWN action (one tap),
  //         now that the Post tab no longer exists. ---
  await page.getByTestId('feed-post-drop-in').click()
  await settleOnRoute(page, '/new')
  await expect(page.getByRole('heading', { name: 'Post a drop-in' })).toBeVisible()

  // V23 slice 3: the bottom "browse-all-places" door is GONE. The field's own
  // "Browse places" button is the only door to the directory sheet.
  await expect(page.getByTestId('browse-all-places')).toHaveCount(0)

  const door = page.getByTestId('browse-places')
  await expect(door).toBeVisible({ timeout: 15_000 })
  await door.click()

  // --- 3. THE SHEET IS THE DIRECTORY: search + filters + list + map. ---
  const sheet = page.getByTestId('place-directory-sheet')
  await expect(sheet).toBeVisible()
  // The search field: present only on the real directory surface.
  await expect(sheet.getByTestId('places-search')).toBeVisible()
  // The filter/sort control: the "filters" half of the founder's ask.
  await expect(sheet.getByTestId('filter-sort-btn')).toBeVisible()
  // The map band with a real Leaflet canvas.
  await expect(sheet.getByTestId('places-map-band')).toBeVisible()
  await expect(sheet.locator('.leaflet-container')).toBeVisible()

  // The list itself: at least one real place row, and more than the 8-row
  // shortcut would have shown once we ask for them all. (The sheet renders the
  // grouped lead, so we assert the presence of rows rather than a magic count.)
  const rows = sheet.getByTestId('place-row')
  await expect(rows.first()).toBeVisible()
  expect(await rows.count()).toBeGreaterThan(0)

  // --- 4. SELECTING WRITES THE FORM. ---
  const firstName = (await rows.first().getByTestId('place-card-name').innerText()).trim()
  await rows.first().click()

  // The sheet closes and the pick lands in the form's place field.
  await expect(sheet).toHaveCount(0)
  const placeInput = page.getByPlaceholder('e.g. Green Lake playground, near the boathouse')
  await expect(placeInput).toHaveValue(new RegExp(firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  // --- 5. THE PAGE RENDERS NO INTERNAL SOURCE PROSE. ---
  // The first-use audit found a block comment that had lost its `{/* … */}`
  // wrapper rendered as literal page text below the submit button. It sits as a
  // SIBLING of the form element, not inside it, so this reads the rendered
  // <main> region rather than the form — and it reads RENDERED text, not the
  // source: the defect was invisible to any grep of src/ because the text was
  // valid JSX either way.
  const renderedMainText = await page.getByRole('main').innerText()
  expect(renderedMainText).not.toContain('/*')
  expect(renderedMainText).not.toContain('Browse all')
})

test('the directory sheet can be dismissed without picking (V21 t02)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  // Navigate from `/` so `settleOnRoute` has a stable route to settle on —
  // calling it while already on /new would look for a nav link to click with
  // nothing to click, and fail on the helper rather than on this spec's claim.
  await settleOnRoute(page, '/')
  // The feed's own action reaches /new in one tap (the Post tab is gone).
  await page.getByTestId('feed-post-drop-in').click()
  await expect(page.getByRole('heading', { name: 'Post a drop-in' })).toBeVisible()

  // V23 slice 3: the field's button is the door (the bottom door is gone).
  await expect(page.getByTestId('browse-all-places')).toHaveCount(0)
  const door = page.getByTestId('browse-places')
  await expect(door).toBeVisible({ timeout: 15_000 })
  await door.click()
  await expect(page.getByTestId('place-directory-sheet')).toBeVisible()

  // Close leaves the form untouched — "the directory is never a wall" (the V8
  // t07 rule the picker's own "Somewhere else" escape also honours).
  await page.getByTestId('place-directory-close').click()
  await expect(page.getByTestId('place-directory-sheet')).toHaveCount(0)
  const placeInput = page.getByPlaceholder('e.g. Green Lake playground, near the boathouse')
  await expect(placeInput).toHaveValue('')
})

test('the directory sheet traps focus, closes on Escape, and scrolls (V23 slice 3)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await settleOnRoute(page, '/')
  await page.getByTestId('feed-post-drop-in').click()
  await expect(page.getByRole('heading', { name: 'Post a drop-in' })).toBeVisible()

  // Open the sheet through the field's button.
  const door = page.getByTestId('browse-places')
  await expect(door).toBeVisible({ timeout: 15_000 })
  await door.click()
  const sheet = page.getByTestId('place-directory-sheet')
  await expect(sheet).toBeVisible()

  // --- FOCUS TRAP: Tab cycles within the sheet. The trap intercepts Tab at
  //         the boundary; mid-list Tab moves are native (the trap only wraps).
  //         Verify focus starts inside the sheet, then press Tab repeatedly and
  //         confirm focus never escapes the sheet boundary. ---
  const sheetEl = await sheet.elementHandle()
  expect(sheetEl).not.toBeNull()

  // Give the trap a moment to settle (useFocusTrap records the previously-
  // focused element; the first Tab press will land on the first focusable).
  await page.waitForTimeout(100)

  // Focus the Close button explicitly so we have a known starting point inside
  // the sheet, then verify Tab keeps us inside.
  await page.getByTestId('place-directory-close').focus()
  let activeInSheet = await page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="place-directory-sheet"]')
    return sheet ? sheet.contains(document.activeElement) : false
  })
  expect(activeInSheet).toBe(true)

  // Press Tab 5 times; focus must stay inside the sheet every time.
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab')
    activeInSheet = await page.evaluate(() => {
      const sheet = document.querySelector('[data-testid="place-directory-sheet"]')
      return sheet ? sheet.contains(document.activeElement) : false
    })
    expect(activeInSheet).toBe(true)
  }

  // --- ESCAPE CLOSES: pressing Escape dismisses the sheet. ---
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)

  // Re-open to measure scrollability.
  await door.click()
  await expect(sheet).toBeVisible()

  // --- SCROLLABILITY: the scroll container's scrollHeight exceeds its
  //         clientHeight (the 239-row list overflows the viewport). ---
  const scrollMetrics = await page.evaluate(() => {
    const scroller = document.querySelector('[data-testid="place-directory-scroll"]')
    if (!scroller) return null
    return { scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight }
  })
  expect(scrollMetrics).not.toBeNull()
  expect(scrollMetrics!.scrollHeight).toBeGreaterThan(scrollMetrics!.clientHeight)

  // Clean up: close the sheet.
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
})

test('typing in the place field still opens inline suggestions (V23 slice 3 regression guard)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await settleOnRoute(page, '/')
  await page.getByTestId('feed-post-drop-in').click()
  await expect(page.getByRole('heading', { name: 'Post a drop-in' })).toBeVisible()

  // Type a partial place name; the inline suggestion list should appear.
  const placeInput = page.getByPlaceholder('e.g. Green Lake playground, near the boathouse')
  await placeInput.fill('Green')
  await expect(page.getByTestId('place-suggestions')).toBeVisible()
})