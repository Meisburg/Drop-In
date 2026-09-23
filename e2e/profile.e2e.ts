/**
 * Spec 1 (V2 ticket 00): signed in as the marker (via the setup project's
 * storageState), /profile renders the marker's display_name.
 *
 * V20 t01: /profile opens on the READ view (the same face a @handle link
 * shows) and the editor moved behind the founder's "Edit profile" button. This
 * spec now walks BOTH modes: the read view's @handle heading, the Edit toggle
 * into the seeded name input, and Done back out.
 */
import { expect, test } from '@playwright/test'
import { readMarkerMeta, settleOnRoute } from './fixtures'

test('signed in as the marker, /profile renders the marker display name', async ({ page }) => {
  const marker = readMarkerMeta()

  await page.goto('/profile')
  // A cold load can lose the route to the onboarding-gate race — settle on
  // /profile via the app's own navigation once the SPA state is warm.
  await settleOnRoute(page, '/profile')

  // The page's own "Profile" heading proves the route stood, and the identity
  // card's @handle (rendered from the session profile) proves the row loaded —
  // a failed load has no name to show.
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: `@${marker.displayName}`, exact: true }),
  ).toBeVisible()

  // V21 t10: the header's duplicate profile link is removed — the banner no
// longer renders the @handle. The identity card's own "@handle" heading
// (asserted above) is the single source of truth for the loaded row.
  await expect(
    page.getByRole('banner').getByText(`@${marker.displayName}`, { exact: true }),
  ).toHaveCount(0)

  // The founder's Edit profile button is the only way into the editor, and it
  // sits at the very top of the read view.
  await page.getByTestId('edit-profile').click()

  // V13 ticket 01 re-homed the editor onto /profile (it was read-only + a
  // /settings link before); V20 t01 put that editor behind the Edit toggle.
  //
  // The display name is an editable INPUT inside the editor (V15 ticket 06
  // moved the identity block to the top of /profile as a name field), so the
  // name is an input VALUE, not a text node — `getByText(displayName)` could
  // never match it. The input is the same "seeded from the marker's profiles
  // row" proof.
  await expect(page.getByTestId('display-name-input')).toHaveValue(marker.displayName)

  // Done is the mode's exit: the editor is gone and the read view is back.
  await page.getByTestId('done-editing-profile').click()
  await expect(page.getByTestId('display-name-input')).toHaveCount(0)
  await expect(page.getByTestId('edit-profile')).toBeVisible()
})
