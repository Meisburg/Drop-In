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
  // route stood, and the display name renders as its own text node in the
  // bottom identity block (seeded from the marker's profiles row).
  await expect(page.getByRole('heading', { name: 'Your family', exact: true })).toBeVisible()
  await expect(page.getByText(marker.displayName, { exact: true })).toBeVisible()
  // The app-shell header shows the marker's public handle.
  await expect(page.getByText(`@${marker.displayName}`, { exact: true })).toBeVisible()
})