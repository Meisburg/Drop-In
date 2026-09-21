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

  // V15.2 fix: the display name is now an editable INPUT (V15 ticket 06 moved
  // the identity block to the top of /profile as a name field, with a live
  // "@handle" read-back under it), so the bare name is an input VALUE, not page
  // text — `getByText(displayName)` can never match it and this spec failed.
  // The name input is the equivalent "the profile row loaded" signal: it is
  // seeded from the marker's profiles row, so it only renders on a settled
  // /profile. If the gate still bounced the load, the page would end on / (via
  // /onboarding) and this would time out.
  await expect(page.getByTestId('display-name-input')).toHaveValue(marker.displayName)

  // Settled on the requested route, and the app-shell header shows the
  // marker's handle (the profile round-trip worked).
  //
  // V15.2 fix: the handle is now rendered TWICE on /profile — the header link
  // and the identity block's own "@handle" read-back (V15 ticket 06) — so a bare
  // getByText hit a strict-mode violation. The BANNER is what this assertion is
  // about (the app shell's handle), so it is scoped there.
  expect(new URL(page.url()).pathname).toBe('/profile')
  await expect(
    page.getByRole('banner').getByText(`@${marker.displayName}`, { exact: true }),
  ).toBeVisible()
})