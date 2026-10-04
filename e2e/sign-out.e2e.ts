/**
 * V29 v29-10 — SIGN OUT LIVES IN SETTINGS, NOT THE HEADER.
 *
 * The header carried a permanent `Sign out` button on every signed-in screen,
 * one 44px tap from the settings gear, with no confirmation; `signOutUser` is a
 * bare `supabase.auth.signOut()` and the shell bounces to /login, so a mis-tap
 * cost a password reset.
 *
 * WHAT THIS PINS, in the order the decision was made:
 *  - the header no longer offers it on the feed,
 *  - Settings → Account does, beside the other account-level actions,
 *  - it still lands on /login (the one behaviour that must not change),
 *  - and /login's OWN "Sign out" for a signed-in visitor is KEPT — it is the
 *    only escape from that screen, and removing the header control must not
 *    have taken it with it.
 *
 * The marker context is signed in to start with. Signing out here affects only
 * this test's browser context: every other test gets a fresh context from the
 * saved storage state, and the afterEach sweeps with the marker JWT read from
 * the state FILE rather than from the page.
 */
import { expect, test } from '@playwright/test'
import { settleOnRoute } from './fixtures'

test('sign out is in Settings, not the header, and still lands on /login', async ({ page }) => {
  await page.goto('/')
  await settleOnRoute(page, '/')

  // The header's one-tap control is gone (the settings gear stays).
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
  await expect(page.getByLabel('Settings')).toBeVisible()

  await page.goto('/settings')
  await settleOnRoute(page, '/settings')
  const control = page.getByTestId('account-sign-out')
  await expect(control).toBeVisible()
  await control.click()

  await expect(page).toHaveURL(/\/login\/?$/)
  // …and the signed-out screen keeps its own escape for a still-signed-in
  // visitor, which is a different control in the same words.
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})
