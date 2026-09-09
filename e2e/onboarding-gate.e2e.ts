/**
 * Spec (V2 ticket 06): the onboarding-gate race fix. A fresh full-page
 * load of /profile (the marker follows a neighborhood, so it has
 * memberships) must land on /profile without bouncing through
 * /onboarding → / — the gate now renders the shell's loading state until
 * the membership fetch settles, so the pre-fix settleOnRoute()
 * client-side-hop workaround is deliberately NOT used here.
 */
import { expect, test } from '@playwright/test'
import { readMarkerMeta } from './fixtures'

test('a cold full-page /profile load lands on /profile (no onboarding-gate bounce)', async ({ page }) => {
  const marker = readMarkerMeta()

  // A fresh full-page navigation — no SPA warm-up, no settleOnRoute hop.
  // The marker has memberships (the setup spec follows a neighborhood),
  // so the gate must hold on /profile instead of bouncing
  // /onboarding → / while the membership fetch is in flight.
  await page.goto('/profile')

  // The display-name field only renders on a settled /profile (the gate
  // must have passed). If the gate still bounced the load, the page
  // would end on / (via /onboarding) and this would time out.
  await expect(page.locator('input[autocomplete="nickname"]')).toHaveValue(marker.displayName)

  // Settled on the requested route, and the app-shell header shows the
  // marker's handle (the profile round-trip worked).
  expect(new URL(page.url()).pathname).toBe('/profile')
  await expect(page.getByText(`@${marker.displayName}`, { exact: true })).toBeVisible()
})