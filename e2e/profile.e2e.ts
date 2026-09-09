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

  // The display-name field is seeded from the marker's profiles row.
  await expect(page.locator('input[autocomplete="nickname"]')).toHaveValue(marker.displayName)
  // The app-shell header shows the marker's public handle.
  await expect(page.getByText(`@${marker.displayName}`, { exact: true })).toBeVisible()
})