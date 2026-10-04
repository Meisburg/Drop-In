/**
 * V29 v29-8 (+ v29-4) — THE SIGNED-OUT FIRST SCREEN.
 *
 * Two claims about the one screen a parent meets before they trust the app with
 * anything, both from the 2026-10-04 external review triage:
 *
 *  - v29-8: it must say what Drop In IS. Five independent reviewers, reading
 *    this exact screen, could not say what a "drop-in" was or what they would do
 *    with the app — the line above the form promised something vague ("See what
 *    families are up to in your area!") and implied knowledge of local activity
 *    the signed-out app cannot have. The screen also greeted a first-time visitor
 *    with "Welcome back."
 *  - v29-4: the new-parent path must be INSIDE the viewport at 390×664 — a
 *    390-wide phone with the browser chrome a real phone shows. The control sat
 *    28px below the fold.
 *
 * WHY THE FOLD CLAIM IS ALSO PINNED HERE: `scripts/mobile-audit.mjs` proves it
 * across seven viewports and both appearances, but that script is deliberately
 * NOT in `npm run verify` — so without this assertion a layout regression would
 * wait for someone to remember to run it.
 *
 * A CLEAN CONTEXT ON PURPOSE: the default context carries the marker's session,
 * and this spec is about the screen a SIGNED-OUT visitor gets.
 */
import { expect, test } from '@playwright/test'

const TAGLINE = 'Casual drop-ins near you — no RSVP, no planning.'

test('the signed-out first screen says what Drop In is, and fits a portrait phone', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 664 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  })
  const page = await context.newPage()
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  // v29-8: the noun, the payoff and the low commitment, before any tap.
  await expect(page.getByText(TAGLINE)).toBeVisible()
  // …with no presumption that the visitor has been here before, and no claim
  // about activity this screen cannot see.
  await expect(page.getByText(/Welcome back/)).toHaveCount(0)
  await expect(page.getByText(/See what families are up to/)).toHaveCount(0)

  // v29-4: the create-account control is fully visible without scrolling.
  const toggle = page.getByRole('button', { name: 'New here? Create an account' })
  await expect(toggle).toBeVisible()
  const box = await toggle.boundingBox()
  expect(box, 'the create-account control must have a rendered box').not.toBeNull()
  const height = page.viewportSize()?.height ?? 0
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBeLessThanOrEqual(height + 1)

  await context.close()
})
