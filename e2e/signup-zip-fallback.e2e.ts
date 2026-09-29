/**
 * Spec (V28 slice 3b): THE NEW SIGNUP PATH WALKS CARDS 2 → 5 OF THE FIRST
 * RUN, AND THE FEED IS ABOUT THE ZIP THE PARENT ENTERED THEMSELVES.
 *
 * WHAT CHANGED. Before this slice the signup form collected a HOME ADDRESS,
 * geocoded it, and a resolved address skipped the location step entirely —
 * this spec intercepted Nominatim (both sides) to pin that. V28 decisions
 * 4–5 moved the location onto the first run's cards: the signup form is
 * EMAIL + PASSWORD ONLY (card 1 of 5), the name card (card 2) creates the
 * profile row, and the LOCATION step (before the area card) is where the
 * home zip is set by hand. There is no address to resolve and no geocode to
 * mock — the path is deterministic, which is why this spec needs no network
 * interception at all anymore.
 *
 * THE FALLBACK NOTE. The one-shot "your account is ready, tell us your ZIP"
 * note was the explanation shown when the SIGNUP-TIME geocode did not
 * resolve (first-use audit, ticket 02). With the address gone from signup,
 * nothing sets that flag any more, so the note must not render at all:
 * test 2 pins its absence. (The area card's own zip-failure explanation is
 * covered by that card's own spec — slice 5.)
 *
 * WHY A FRESH CONTEXT. The `chromium` project hands every spec the marker's
 * signed-in storage state, and this spec is about the SIGNED-OUT signup flow:
 * with that state, `/login` correctly redirects to the feed. So both tests open
 * their own signed-out context rather than fighting the inherited one.
 *
 * CLEANUP: this spec creates real accounts through the UI, so there is no
 * owner-scoped row for a spec-local REST delete to reach (the accounts ARE the
 * fixtures). Both are `e2e-`-prefixed, which is exactly the convention the sweep
 * deletes — see docs/agents/e2e-fixture-convention.md, and the fixture-marker
 * guard that keeps this spec inside it.
 */
import { expect, test, type Browser, type Page } from '@playwright/test'
import { readMarkerMeta } from './fixtures'

async function signedOutPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  return { page: await context.newPage(), close: () => context.close() }
}

/**
 * Sign up (email + password only) and walk the name card. Lands on /onboarding
 * with the location step next. The name card's Continue button sits OUTSIDE
 * its <form> and is joined to it only by the HTML form attribute
 * (FirstRunCard.tsx) — if that association breaks, the profile row is never
 * created, the location step never renders, and this helper hangs. That is
 * what makes it the pin for the association.
 */
async function signUpAndFinishNameCard(
  page: Page,
  options: { name: string; email: string; password: string },
): Promise<void> {
  const space = options.name.indexOf(' ')
  await page.goto('/login')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.locator('input[type="email"]').fill(options.email)
  await page.locator('input[type="password"]').fill(options.password)
  await page.getByRole('button', { name: 'Create account' }).click()

  // Card 2 of 5: the name card. Card 1 sent us here, and the card composes
  // the two halves into the same handle the old signup form produced.
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 })
  await page.locator('input[autocomplete="given-name"]').fill(options.name.slice(0, space))
  await page.locator('input[autocomplete="family-name"]').fill(options.name.slice(space + 1))
  await page.getByRole('button', { name: /^Continue/ }).click()
}

test('the signup path lands on the location step, and the feed is about the entered zip', async ({
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const { page, close } = await signedOutPage(browser)
  try {
    await signUpAndFinishNameCard(page, {
      name: `e2e-z-${epoch} Marker`,
      email: `e2e-z-${epoch}@gmail.com`,
      password: `e2e-z-pw-${epoch}`,
    })

    // The location step is deterministically next: there is no address to
    // resolve that could skip it (V28 slice 3b removed the geocode branch).
    await expect(page.getByRole('heading', { name: 'Set your location' })).toBeVisible({
      timeout: 30_000,
    })

    // The parent enters their own home zip — the same value the marker uses,
    // so the feed assertion below checks the entered zip, not a geocode.
    await page.getByPlaceholder('e.g. 98107').fill(marker.homeZip)
    await page
      .locator('select')
      .first()
      .selectOption({ label: `${marker.radiusMiles} miles` })
    await page.getByRole('button', { name: /^Continue/ }).click()

    // Straight to discovery.
    await expect(page.getByRole('heading', { name: 'Near you' })).toBeVisible({
      timeout: 30_000,
    })
    expect(new URL(page.url()).pathname).toBe('/')
    // And no fallback note anywhere — there is no signup-time geocode any
    // more, so the failure-path explanation must not borrow into this one.
    await expect(page.getByTestId('signup-zip-fallback-note')).toHaveCount(0)
    // The feed is about the zip the parent entered (the marker's zip, 98107)
    // — which is the whole point of the location step owning the location.
    await expect(page.getByTestId('feed-location-control')).toContainText(marker.homeZip)
  } finally {
    await close()
  }
})

test('no fallback note renders on the location step: nothing at signup can fail a lookup', async ({
  browser,
}) => {
  const epoch = Math.floor(Date.now() / 1000)
  const { page, close } = await signedOutPage(browser)
  try {
    await signUpAndFinishNameCard(page, {
      name: `e2e-zu-${epoch} Marker`,
      email: `e2e-zu-${epoch}@gmail.com`,
      password: `e2e-zu-pw-${epoch}`,
    })

    await expect(page.getByRole('heading', { name: 'Set your location' })).toBeVisible({
      timeout: 30_000,
    })

    // THE PIN: the one-shot "your account is ready, tell us your ZIP" note
    // existed to explain a FAILED SIGNUP-TIME geocode (ticket 02). The signup
    // form no longer carries an address, so nothing sets that flag — the note
    // must not render, not even for a parent who was bounced to this step
    // with nothing to explain.
    await expect(page.getByTestId('signup-zip-fallback-note')).toHaveCount(0)

    // No dead end: the ZIP field is right there, and the inline validation
    // the page already had still answers a bad ZIP with its own accessible
    // error.
    const zip = page.getByPlaceholder('e.g. 98107')
    await expect(zip).toBeVisible()
    await zip.fill('00000')
    await page.getByRole('button', { name: /^Continue/ }).click()
    await expect(page.getByRole('alert')).toBeVisible()
  } finally {
    await close()
  }
})