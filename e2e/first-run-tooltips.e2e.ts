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
import { finishSignup, readMarkerMeta, signUpViewer } from './fixtures'

/** The tour's overlay root (the veil + ring + card all live under it). */
const tourOf = (page: Page) => page.getByTestId('first-run-tooltips')

/**
 * The base URL for the SIGNED-OUT viewer contexts this spec opens (the
 * specs' own `page` fixture gets its base from Playwright's config / the
 * `--base-url` flag; a freshly opened browser context does not inherit it).
 * Defaults to the config's 4173; point it at a private preview port when the
 * human's lane owns 4173.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:4173'

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

    // THE PARENT IGNORES THE TOUR: with it still up, they tap the inbox tab
    // (the tour's step 1 card sits by the feed's header — far from the nav).
    // The capture-phase pointerdown dismisses the tour AND the tap activates
    // the control: both happen in one gesture. (Step 1's target is the feed
    // header, so the card cannot sit on the nav in either layout.)
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
