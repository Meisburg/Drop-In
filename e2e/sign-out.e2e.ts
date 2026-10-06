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
 *  - and the sign-in screen renders, so removing the header control did not take
 *    /login's own escape for a signed-in visitor with it.
 *
 * ⚠️ A THROWAWAY ACCOUNT, AND THAT IS THE POINT. `supabase.auth.signOut()`
 * revokes the refresh token GLOBALLY, and the marker's saved grant is the one
 * EVERY other spec reads — so an earlier version of this test, which signed the
 * MARKER out, left ~15 unrelated specs staring at a /login screen on this
 * batch's first full run. That was measured, not theorised. A fresh account
 * proves exactly the same behaviour and touches nothing shared; it is an
 * `e2e-` fixture, so the marker sweep owns it.
 */
import { expect, test } from '@playwright/test'
import { E2E_BASE_URL, finishSignup, readMarkerMeta, signUpViewer } from './fixtures'

test('sign out is in Settings, not the header, and still lands on /login', async ({ browser }) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)

  const context = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: { cookies: [], origins: [] },
  })
  const page = await context.newPage()
  await signUpViewer(page, {
    name: `e2e-so-${epoch} Marker`,
    email: `e2e-so-${epoch}@gmail.com`, // gmail.com: the project rejects example.com
    password: `e2e-so-pw-${epoch}`, // in-memory only — never written, never committed
  })
  await finishSignup(page, { homeZip: marker.homeZip, radiusMiles: marker.radiusMiles })

  // The header's one-tap control is gone (the settings gear stays).
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
  await expect(page.getByLabel('Settings')).toBeVisible()

  // settings-restructure: the Account category's own screen.
  await page.goto('/settings/account')
  const control = page.getByTestId('account-sign-out')
  await expect(control).toBeVisible()
  await control.click()

  await expect(page).toHaveURL(/\/login\/?$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  await context.close()
})
