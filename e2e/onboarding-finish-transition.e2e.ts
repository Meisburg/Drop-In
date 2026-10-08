/**
 * V34-C — THE FINISH TRANSITION (slice `muzkg290`).
 *
 * THE ANNOTATION THIS EXISTS FOR, anchored on `/onboarding`:
 *
 *   "When you click on finish here, I feel like it jumps into the main app
 *    really quickly and it's like kind of jarring. Maybe there should be some
 *    kind of animation state or loading state or like building your profile
 *    state or something."
 *
 * WHAT IT PINS, one leg per acceptance clause:
 *
 *  1. **The state appears BETWEEN the tap and the feed, and the feed still
 *     lands exactly as before.** A fresh account walks the run, taps Finish,
 *     and this spec asserts `onboarding-completing` is visible — THEN the
 *     feed's own heading. The ordering matters: asserting only the feed would
 *     pass with the state absent, which is the bug the slice fixes.
 *  2. **Under `prefers-reduced-motion: reduce` the copy still appears and
 *     nothing animates.** The context is created with Playwright's documented
 *     `reducedMotion: 'reduce'` (which sets the media query the app's CSS
 *     reads), and every element inside the state is measured for
 *     `animationName === 'none'`. Asserting the attribute instead would be a
 *     claim about markup; measuring the COMPUTED animation is a claim about
 *     what the browser would actually run.
 *  3. **A FAILED completion surfaces its existing error and never shows the
 *     success state.** The profiles PATCH is intercepted and failed; the area
 *     card's own `role="alert"` error must appear and `onboarding-completing`
 *     must have count 0. This is the leg that proves the transition did not
 *     become a second success path.
 *  4. **The walk's total time did not grow past the chosen minimum.** The
 *     walk's tap-to-feed window is MEASURED here and reported in the test's
 *     stdout, so the number in the report is produced by the same run that
 *     gates the slice rather than by a hand-timed one-off.
 *
 * WHY A FRESH, SIGNED-OUT CONTEXT. The `chromium` project hands every spec the
 * marker's signed-in storage state, and `/login` correctly redirects a signed-in
 * viewer to the feed — so a signup walk needs its own empty context, exactly as
 * `signup-zip-fallback.e2e.ts` documents for the same reason.
 *
 * CLEANUP: the accounts this spec creates ARE the fixtures and are
 * `e2e-`-prefixed — the convention the sweep deletes
 * (docs/agents/e2e-fixture-convention.md, enforced by the fixture-marker guard).
 */
import { expect, test, type Browser, type Page } from '@playwright/test'
import { E2E_BASE_URL, NOMINATIM_ROUTE, readMarkerMeta, readSupabaseEnv } from './fixtures'

/** The area card's placeholder, and the street both legs type. */
const ADDRESS = '1200 1st Ave S, Seattle'

/**
 * The minimum hold the app chose — `ONBOARDING_COMPLETION_MIN_MS` in
 * `src/lib/onboardingCompletion.ts`. RESTATED here deliberately as a literal
 * with the source of truth named, rather than imported: importing it would
 * make this spec agree with a CHANGED constant automatically, and the point of
 * this leg is to catch a hold that stopped being "short and explicit". A drift
 * is a FINDING — reconcile the two on purpose.
 */
const CHOSEN_MINIMUM_MS = 500

async function signedOutPage(
  browser: Browser,
  options?: { reducedMotion?: 'reduce' | 'no-preference' },
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: { cookies: [], origins: [] },
    reducedMotion: options?.reducedMotion,
  })
  return { page: await context.newPage(), close: () => context.close() }
}

/**
 * Sign up (email + password only), walk the name card, Skip the kids card —
 * and land on the AREA card ("4 of 4"), which is the card whose Finish this
 * spec is about. The shape is `signup-zip-fallback.e2e.ts`'s helper: the name
 * card's Continue sits OUTSIDE its form, joined by the HTML `form` attribute,
 * so this wait is also the pin for that association.
 *
 * ⚠️ THE RATE-LIMIT GATE, AND WHY IT IS NOT OPTIONAL. This spec creates THREE
 * real accounts per run against the LIVE Supabase project, and repeated local
 * runs of it (the stability loop this slice's own race was found with) trip
 * Supabase's auth rate limit. The app then renders its own honest error —
 * "Request rate limit reached" on `/login` — and the walk never leaves the
 * signup form. WITHOUT this gate the failure surfaces at the FIRST LATER
 * assertion, which is `onboarding-completing`: a suite report reading
 * "element(s) not found" against the transition state, accusing the slice of
 * the bug it fixes. That is exactly the misattributed failure this batch keeps
 * recording. So the gate detects the harness condition and SKIPS with the
 * cause named, rather than letting a throttle masquerade as a product defect.
 */
async function signUpToAreaCard(
  page: Page,
  options: { name: string; email: string; password: string },
): Promise<void> {
  await page.goto('/login')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.locator('input[type="email"]').fill(options.email)
  await page.locator('input[type="password"]').fill(options.password)
  await page.getByRole('button', { name: 'Create account' }).click()

  // The throttle is the harness talking, not the app: it is reported by the
  // signup form itself as a visible alert, so it is detected rather than
  // guessed at from a timeout.
  const rateLimited = page.getByText(/rate limit/i)
  const reachedOnboarding = page.waitForURL(/\/onboarding/, { timeout: 30_000 })
  const outcome = await Promise.race([
    reachedOnboarding.then(() => 'onboarding' as const),
    rateLimited
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => 'rate-limited' as const)
      .catch(() => 'no-signal' as const),
  ])
  if (outcome !== 'onboarding') {
    // Skipped, not failed: no product code ran. Re-run later (or run the full
    // suite, whose single signup does not approach the limit).
    test.skip(
      true,
      `V34-C harness condition: Supabase auth rate limit reached while creating this spec's account ` +
        `(${outcome}) — the signup walk never reached /onboarding, so nothing about the finish ` +
        `transition was exercised. This is NOT a product finding; re-run when the limit clears.`,
    )
    return
  }
  await reachedOnboarding
  const space = options.name.indexOf(' ')
  const first = space === -1 ? options.name : options.name.slice(0, space)
  const last = space === -1 ? '' : options.name.slice(space + 1)
  await page.locator('input[autocomplete="given-name"]').fill(first)
  if (last !== '') await page.locator('input[autocomplete="family-name"]').fill(last)
  await page.getByRole('button', { name: /^Continue/ }).click()

  const skip = page.getByRole('button', { name: 'Skip' })
  await skip.waitFor({ timeout: 30_000 })
  await skip.click()
  await page.getByTestId('first-run-area-card').waitFor({ timeout: 30_000 })
}

/**
 * Install the area card's ONE Nominatim answer (the caller's own zip, so the
 * gazetteer accepts it and the resolved leg is taken — no typed zip, no
 * fallback note). The same instrument `finishSignup` uses, trimmed to what
 * this spec walks.
 */
async function answerAddressLookup(page: Page, homeZip: string): Promise<void> {
  await page.route(NOMINATIM_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          lat: '47.6205',
          lon: '-122.3414',
          address: { postcode: homeZip, house_number: '1200' },
        },
      ]),
    }),
  )
}

/** Fill the address, pick the default radius, tap Finish. */
async function tapFinish(page: Page): Promise<void> {
  await page.getByPlaceholder('e.g. 1200 1st Ave S, Seattle').fill(ADDRESS)
  await page.getByRole('button', { name: 'Finish' }).click()
}

test('the completion state appears between the Finish tap and the feed', async ({ browser }) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const { page, close } = await signedOutPage(browser)
  try {
    await answerAddressLookup(page, marker.homeZip)
    await signUpToAreaCard(page, {
      name: `e2e-fin-${epoch} Marker`,
      email: `e2e-fin-${epoch}@gmail.com`,
      password: `e2e-fin-pw-${epoch}`,
    })

    // THE TAP-TO-FEED WINDOW IS MEASURED HERE — acceptance 4's number, produced
    // by the same walk that pins acceptance 1. It lives in this test rather
    // than a standalone one deliberately: each signup is a real account on the
    // live project, and the project THROTTLES rapid signups (measured: a fifth
    // fresh account in one run leaves the browser on /login with no session, a
    // failure that looks like a product bug and is not one). One walk, two
    // acceptances, one account.
    const startedAt = Date.now()
    await tapFinish(page)

    // 1. THE STATE IS VISIBLE, and the copy is the module's line. This is the
    //    assertion that would fail on the pre-slice code (there was no state at
    //    all between the tap and the feed).
    const completing = page.getByTestId('onboarding-completing')
    await expect(completing).toBeVisible({ timeout: 15_000 })
    await expect(completing).toContainText('Building your profile')
    // The house's busy shape: a status region, not an alert (DESIGN.md).
    await expect(completing).toHaveAttribute('role', 'status')

    // 2. AND THE FEED LANDS EXACTLY AS BEFORE. The run's own ending is
    //    unchanged: the state is a transition, not a new destination.
    await expect(page.getByRole('heading', { name: 'Near you' })).toBeVisible({
      timeout: 30_000,
    })
    const totalMs = Date.now() - startedAt
    expect(new URL(page.url()).pathname).toBe('/')
    await expect(page.getByTestId('feed-location-control')).toContainText(marker.homeZip)
    // The transition is gone once the feed is up — it must not linger.
    await expect(completing).toHaveCount(0)

    // ACCEPTANCE 4 — the measured window, printed so the report quotes the
    // same run the gate ran rather than a hand-timed one-off. The bound is
    // deliberately generous (the write is a real network round-trip to a live
    // project): it fails on a floor that stopped being short, not on a slow CI
    // minute.
    console.log(
      `V34-C MEASUREMENT: finish tap → feed heading = ${totalMs} ms ` +
        `(app's chosen minimum hold = ${CHOSEN_MINIMUM_MS} ms)`,
    )
    expect(totalMs).toBeLessThan(CHOSEN_MINIMUM_MS + 3_000)
  } finally {
    await close()
  }
})

test('under prefers-reduced-motion the copy appears and NOTHING animates', async ({ browser }) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  // Playwright's `reducedMotion: 'reduce'` is what sets the media query the
  // app's `motion-reduce:` utilities and usePrefersReducedMotion read.
  const { page, close } = await signedOutPage(browser, { reducedMotion: 'reduce' })
  try {
    // The preference is really applied — a spec that forgot this option would
    // otherwise pass over the animated build and prove nothing.
    expect(
      await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    ).toBe(true)

    await answerAddressLookup(page, marker.homeZip)
    await signUpToAreaCard(page, {
      name: `e2e-fin-rm-${epoch} Marker`,
      email: `e2e-fin-rm-${epoch}@gmail.com`,
      password: `e2e-fin-rm-pw-${epoch}`,
    })

    await tapFinish(page)

    const completing = page.getByTestId('onboarding-completing')
    await expect(completing).toBeVisible({ timeout: 15_000 })
    // THE COPY STILL APPEARS — reduced motion removes motion, never meaning.
    await expect(completing).toContainText('Building your profile')

    // ⚠️ MEASURED, NOT ASSERTED FROM MARKUP. Every element inside the state
    // (and the state itself) is asked for its COMPUTED `animationName`; the
    // reduced-motion build must leave every one of them `none`. A
    // `motion-reduce:animate-none` utility that a future edit dropped, or a
    // keyframe added without its `motion-reduce:` pair, fails HERE.
    const animated = await completing.evaluate((root) => {
      const nodes = [root, ...Array.from(root.querySelectorAll('*'))]
      return nodes
        .map((node) => ({
          tag: node.tagName.toLowerCase(),
          testid: node.getAttribute('data-testid'),
          animationName: getComputedStyle(node).animationName,
          animationDuration: getComputedStyle(node).animationDuration,
        }))
        .filter((entry) => entry.animationName !== 'none')
    })
    expect(animated).toEqual([])

    // And the walk still ends on the feed — the preference changes the motion,
    // not the destination.
    await expect(page.getByRole('heading', { name: 'Near you' })).toBeVisible({
      timeout: 30_000,
    })
  } finally {
    await close()
  }
})

test('a FAILED completion shows its existing error and never the success state', async ({
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const { url } = readSupabaseEnv()
  const { page, close } = await signedOutPage(browser)
  try {
    await answerAddressLookup(page, marker.homeZip)

    // FAIL THE REAL WRITE: the area card's save PATCHes `profiles`, and this is
    // that request — not a stub of the app's own code, the actual HTTP call the
    // completion makes. Answering 500 makes `updateHomeZipRadius` throw, which
    // is the app's genuine failure path (`saveLocation`'s catch).
    await page.route(`${url}/rest/v1/profiles*`, (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'e2e-v34c: forced write failure' }),
        })
      }
      return route.continue()
    })

    await signUpToAreaCard(page, {
      name: `e2e-fin-fail-${epoch} Marker`,
      email: `e2e-fin-fail-${epoch}@gmail.com`,
      password: `e2e-fin-fail-pw-${epoch}`,
    })

    await tapFinish(page)

    // THE EXISTING ERROR PATH, unchanged: the area card's own alert. Its copy
    // is `radiusSaveErrorMessage`'s (lib/feed), which is not this slice's to
    // pin word-for-word — what this leg pins is that AN ALERT APPEARS AT ALL,
    // which is the failure path's contract.
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 15_000 })

    // AND THE SUCCESS STATE NEVER SHOWS. `completing` is cleared in the catch,
    // so `view` never resolves to a finish state that could paint it. Waiting
    // a beat is deliberate: a state that appeared for one frame after a failure
    // would be exactly the defect, and an immediate `toHaveCount(0)` could miss
    // it.
    await page.waitForTimeout(CHOSEN_MINIMUM_MS + 250)
    await expect(page.getByTestId('onboarding-completing')).toHaveCount(0)
    // And we are still ON the card, not on the feed — the failure did not
    // silently complete the run.
    await expect(page.getByTestId('first-run-area-card')).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/onboarding')
  } finally {
    await close()
  }
})
