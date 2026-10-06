/**
 * Spec (r3-7): THE FIRST-RUN TOOLTIPS — the run ends on the feed, and the
 * feed teaches its controls to the parent who just finished the run.
 *
 * WHAT THIS PINNED BEFORE r3-7: nothing. r3-D3 removed the run's ending card
 * (the feed IS the landing); r3-7 adds the tour the card's copy finally
 * meets a screen in — five lightboxed steps, one per tour line, each
 * pointing at the REAL control the line describes.
 *
 * The legs (each unreachable without the tour's own surface):
 *
 *  1. THE SHOW + WALK: the tour is up on the run's arrival, step 1 is the
 *     "Drop Ins" line, Next walks to step 2 ("Inbox"), Escape ends the tour
 *     — and the app underneath is usable: the feed's location control still
 *     opens its modal after the tour is down, and a RELOAD of the same entry
 *     is quiet (the armed state is history.state and survives the reload —
 *     the persisted dismissal fact is what closes the gate on the second
 *     load, which is exactly the pin this leg exists for).
 *  2. THE POINTER DISMISSAL: the Skip button is a real button (not a
 *     focus-trapped modal's escape hatch) — one tap ends the tour, and the
 *     app is usable afterward (the nav still navigates).
 *  3. THE PASS-THROUGH: the tour's veil never blocks the app. With the tour
 *     UP, a tap on a real control (the inbox tab) both dismisses the tour
 *     (the capture-phase pointerdown) AND activates the control — the parent
 *     who ignores the tour taps straight through to where they were going.
 *
 * Every leg signs up its OWN viewer (the shared `finishSignup` walk), so no
 * leg can be green on the marker's state.
 */
import { expect, test, type Browser, type Page } from '@playwright/test'
// v30-10 (`ocr` finding, low): the tour's step count comes from the tour's own
// data, never a restated literal — adding or removing a line must not silently
// under-test this leg (it used to stop one step early in that case).
import { TOOLTIPS_STEPS } from '../src/lib/firstRunTooltips'
import { E2E_BASE_URL, finishSignup, readMarkerMeta, signUpViewer } from './fixtures'

/** The tour's overlay root (the veil + ring + card all live under it). */
const tourOf = (page: Page) => page.getByTestId('first-run-tooltips')

/**
 * The base URL for the SIGNED-OUT viewer contexts this spec opens (the
 * specs' own `page` fixture gets its base from Playwright's config / the
 * `--base-url` flag; a freshly opened browser context does not inherit it).
 * Defaults to the config's 4173; point it at a private preview port when the
 * human's lane owns 4173.
 */
const BASE_URL = E2E_BASE_URL

/** Sign up a fresh viewer and finish the run: lands on the feed, tour up. */
async function signUpAndFinishRun(browser: Browser, tag: string) {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  })
  const viewer = await context.newPage()
  await signUpViewer(viewer, {
    name: `e2e-r37-${epoch}-${tag}`,
    email: `e2e-r37-${epoch}-${tag}@gmail.com`,
    password: `e2e-r37-pw-${epoch}-${tag}`,
  })
  await finishSignup(viewer, { homeZip: marker.homeZip, radiusMiles: marker.radiusMiles })
  return { viewer, context }
}

test('the tour shows on arrival, walks, ends on Escape — and the second load is quiet', async ({
  browser,
}) => {
  const { viewer, context } = await signUpAndFinishRun(browser, 'a')
  try {
    // THE TOUR IS UP: step 1 is the "Drop Ins" line (what the feed does).
    const tour = tourOf(viewer)
    await expect(tour).toBeVisible({ timeout: 30_000 })
    await expect(tour).toContainText('Drop Ins')
    await expect(tour).toContainText('browse drop-ins within your radius')

    /**
     * THE FOUNDER'S RULE, ASSERTED IN THE BROWSER (2026-10-05).
     *
     * His report, verbatim: *"the first thing at lightboxes should be the drop-in
     * icon on the bottom left of the app, but it doesn't do that at lightboxes
     * something else randomly."* The step's LABEL was already "Drop Ins"; its
     * TARGET was the feed's "Near you" `<h1>` at the top of the page, which is
     * what he saw as something else. The ring is the target's rect ± 4px
     * (`FirstRunTooltips`'s `deco.ring`), so "the ring IS the nav tab" is a
     * subtraction a browser can check. The unit test pins the mapping; this pins
     * that the mapping reaches the real control on the real screen.
     */
    const firstRing = tour.getByTestId('first-run-tooltips-ring')
    await expect(firstRing).toBeVisible()
    const ringBox = await firstRing.boundingBox()
    const dropInsBox = await viewer.getByTestId('nav-tab-drop-ins').boundingBox()
    expect(ringBox, 'the first step must draw a ring').not.toBeNull()
    expect(dropInsBox, 'the nav renders the Drop Ins tab for a finished run').not.toBeNull()
    expect(
      Math.abs(dropInsBox!.x - (ringBox!.x + 4)),
      `the first lightbox must ring the Drop Ins nav tab (ring ${JSON.stringify(ringBox)}, tab ${JSON.stringify(dropInsBox)})`,
    ).toBeLessThanOrEqual(2)
    expect(Math.abs(dropInsBox!.y - (ringBox!.y + 4))).toBeLessThanOrEqual(2)
    expect(Math.abs(dropInsBox!.width - (ringBox!.width - 8))).toBeLessThanOrEqual(2)
    expect(Math.abs(dropInsBox!.height - (ringBox!.height - 8))).toBeLessThanOrEqual(2)

    // NEXT walks the steps: step 2 is the "Inbox" line.
    await tour.getByRole('button', { name: 'Next' }).click()
    await expect(tour).toContainText('Inbox')
    await expect(tour).toContainText('message the parents')

    // ESCAPE ends the tour (the keydown listener, no trap to break out of).
    await viewer.keyboard.press('Escape')
    await expect(tour).toHaveCount(0)

    // THE APP UNDERNEATH IS USABLE: the feed's one location control still
    // opens the shared modal now that the tour is down.
    await viewer.getByTestId('feed-location-control').click()
    await expect(viewer.getByTestId('location-modal')).toBeVisible()
    await viewer.keyboard.press('Escape')
    await expect(viewer.getByTestId('location-modal')).toHaveCount(0)

    // THE SECOND LOAD IS QUIET. The armed state is history.state — it
    // SURVIVES this reload (a plain load of the feed would not carry it) —
    // so the quietness can only come from the persisted dismissal fact.
    // Without the shared fact this leg is the one that catches "the tour
    // re-arms on reload".
    await viewer.reload()
    await expect(viewer.getByRole('heading', { name: 'Near you' })).toBeVisible({ timeout: 30_000 })
    await expect(viewer.getByTestId('first-run-tooltips')).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('Skip is a real button: one tap ends the tour, the app is usable after', async ({
  browser,
}) => {
  const { viewer, context } = await signUpAndFinishRun(browser, 'b')
  try {
    const tour = tourOf(viewer)
    await expect(tour).toBeVisible({ timeout: 30_000 })
    await tour.getByRole('button', { name: 'Skip' }).click()
    await expect(tour).toHaveCount(0)

    // The nav is the app, and it still works: the tour stood down, the tab
    // still navigates.
    await viewer.getByTestId('nav-tab-inbox').click()
    await expect(viewer.getByTestId('new-message-button')).toBeVisible({ timeout: 30_000 })
  } finally {
    await context.close()
  }
})

test('a tap on the app passes through the tour (the veil never blocks)', async ({
  browser,
}) => {
  const { viewer, context } = await signUpAndFinishRun(browser, 'c')
  try {
    const tour = tourOf(viewer)
    await expect(tour).toBeVisible({ timeout: 30_000 })

    // THE PARENT IGNORES THE TOUR: with it still up, they tap the inbox tab.
    // The capture-phase pointerdown dismisses the tour AND the tap activates
    // the control: both happen in one gesture.
    //
    // ⚠️ THIS LEG IS WHY STEP 1'S TARGET MOVED, AND IT CAUGHT THE REASON THE
    // MOVE ALONE WAS NOT ENOUGH (2026-10-05). Once step 1 rang the nav's Drop
    // Ins tab, this tap was SWALLOWED at desktop width: the card was placed
    // below the rail's first item and left-clamped to x 8, so it sat over the
    // left rail (x 0..72) and `elementFromPoint` at Inbox's centre returned the
    // tour. `placeTooltip` now starts a card beside a VERTICAL rail at the
    // rail's right edge, so no rail item is ever covered — the rail's items in
    // the unit test are these same measured rects.
    await viewer.getByTestId('nav-tab-inbox').click()
    await expect(viewer.getByTestId('new-message-button')).toBeVisible({ timeout: 30_000 })
    await expect(viewer.getByTestId('first-run-tooltips')).toHaveCount(0)
  } finally {
    await context.close()
  }
})

/**
 * v30-4 (founder annotation 2): the ring was drawn around the control while the
 * veil covered it, so the thing being taught was the dimmest thing on screen.
 *
 * The veil is now a 9999px spread shadow cast by the ring's own box, which makes
 * "the hole is the ring" a DOM fact a browser can check: the two rectangles must
 * be the same rectangle, on every step.
 */
test('the veil leaves a hole exactly where the ring is — on every step', async ({ browser }) => {
  const { viewer, context } = await signUpAndFinishRun(browser, 'd')
  try {
    const tour = tourOf(viewer)
    await expect(tour).toBeVisible({ timeout: 30_000 })

    // One iteration per tour step, from the tour's OWN length: the veil follows
    // the ring on every step, whatever the count is.
    const stepCount = TOOLTIPS_STEPS.length
    for (let step = 0; step < stepCount; step++) {
      const ring = viewer.getByTestId('first-run-tooltips-ring')
      const veil = viewer.getByTestId('first-run-tooltips-veil')
      await expect(ring).toBeVisible()
      await expect(veil).toBeVisible()

      const ringBox = await ring.boundingBox()
      const veilBox = await veil.boundingBox()
      expect(ringBox, 'the ring must have a box').not.toBeNull()
      expect(veilBox, 'the veil must have a box').not.toBeNull()
      expect(veilBox!.x).toBeCloseTo(ringBox!.x, 0)
      expect(veilBox!.y).toBeCloseTo(ringBox!.y, 0)
      expect(veilBox!.width).toBeCloseTo(ringBox!.width, 0)
      expect(veilBox!.height).toBeCloseTo(ringBox!.height, 0)

      if (step < stepCount - 1) {
        await tour.getByRole('button', { name: 'Next' }).click()
      }
    }
  } finally {
    await context.close()
  }
})
