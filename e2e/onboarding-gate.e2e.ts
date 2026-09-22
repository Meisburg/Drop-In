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

  // V20 t01: /profile opens on the READ view, so the display name is an
  // @handle HEADING (rendered from the loaded session profile), not an input.
  // The heading is the "the profile row loaded" signal this spec wants: it
  // cannot render until the profile fetch settled, so if the gate still bounced
  // the load, the page would end on / (via /onboarding) and this would time
  // out. (The editable input still exists, one Edit tap away.)
  await expect(
    page.getByRole('heading', { name: `@${marker.displayName}`, exact: true }),
  ).toBeVisible()

  // Settled on the requested route, and the app-shell header shows the
  // marker's handle (the profile round-trip worked).
  //
  // The handle renders TWICE on /profile — the app-shell header link and the
  // identity card's own "@handle" heading — so a bare getByText hits a
  // strict-mode violation. The BANNER is what this assertion is about (the app
  // shell's handle), so it is scoped there.
  expect(new URL(page.url()).pathname).toBe('/profile')
  await expect(
    page.getByRole('banner').getByText(`@${marker.displayName}`, { exact: true }),
  ).toBeVisible()
})