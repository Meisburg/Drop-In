/**
 * Spec 1 (V2 ticket 00): signed in as the marker (via the setup project's
 * storageState), /profile renders the marker's display_name.
 */
import { expect, test } from '@playwright/test'
import { readMarkerMeta, settleOnRoute } from './fixtures'

test('signed in as the marker, /profile renders the marker display name', async ({ page }) => {
  const marker = readMarkerMeta()

  await page.goto('/profile')
  // A cold load can lose the route to the onboarding-gate race — settle on
  // /profile via the app's own navigation once the SPA state is warm.
  await settleOnRoute(page, '/profile')

  // V13 ticket 01 re-homed the editor onto /profile (it was read-only + a
  // /settings link before). The page's own "Your family" heading proves the
  // route stood.
  //
  // V15.2 fix: V15 ticket 06 moved the identity block to the TOP of /profile and
  // made the display name an editable INPUT, so the name is an input VALUE, not
  // a text node — `getByText(displayName)` could never match it. The input is
  // the same "seeded from the marker's profiles row" proof.
  await expect(page.getByRole('heading', { name: 'Your family', exact: true })).toBeVisible()
  await expect(page.getByTestId('display-name-input')).toHaveValue(marker.displayName)
  // The app-shell header shows the marker's public handle. Scoped to the banner:
  // the identity block renders its own "@handle" read-back too (V15 ticket 06),
  // so an unscoped locator is a strict-mode violation.
  await expect(
    page.getByRole('banner').getByText(`@${marker.displayName}`, { exact: true }),
  ).toBeVisible()
})