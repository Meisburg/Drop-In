/**
 * THE SETTINGS RESTRUCTURE — the phone drill-down and the desktop pane.
 *
 * `/settings` used to be one long scroll of six `SettingsSection` blocks. The
 * founder called it *"really overwhelming … a hodgepodge of features"* and asked
 * for *"a left hand pain that has the different settings options. And you pick
 * one and then it populates like what's there."* It is now:
 *
 *   - below `md`: an INDEX of six rows at `/settings`, and one screen per
 *     category at `/settings/<id>` with a `settings-back` control,
 *   - at `md` and up: the same list as a left pane inside `<main>`, beside the
 *     shell's nav rail, with the selected category in the right column.
 *
 * WHAT THIS SPEC IS FOR, and what it is not:
 *  - The other specs prove each category's controls still work (they were
 *    retargeted to the category screen they exercise: `push-subscribe` and
 *    `email-optout` → `notifications`, `zip-radius` → `near-you`,
 *    `loop-closing` → `saved`, `sign-out`/`moderator-door` → `account`).
 *  - THIS spec proves the ARRANGEMENT: that the index is the phone's screen and
 *    mounts no category body; that a row opens exactly one category with a way
 *    back; that a `/settings/<unknown>` URL and the legacy `/settings#<id>` hash
 *    both land somewhere real; that the pane sits inside `<main>` to the RIGHT
 *    of the nav rail; and that NO category body is ever in the DOM twice.
 *
 * The last one is the drift risk the one-table index exists to remove: the
 * failure mode is a pane and a routed body both mounting, which would double
 * every read and every testid. `toHaveCount(1)` at both widths is the assertion
 * that catches it.
 *
 * No fixture rows are created or deleted here — it reads only the marker's
 * session, so there is nothing for the marker sweep to own.
 */
import { expect, test } from '@playwright/test'
import { settleOnRoute } from './fixtures'

/** The six load-bearing ids, in the shipped order (`src/lib/settingsIndex.ts`). */
const CATEGORY_IDS = [
  'notifications',
  'near-you',
  'saved',
  'privacy',
  'appearance',
  'account',
] as const

test.describe('the phone: an index, then one category (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('/settings is the index: six 44px rows, and no category body mounted', async ({ page }) => {
    await page.goto('/settings')
    await settleOnRoute(page, '/settings')

    await expect(page.getByTestId('settings-index')).toBeVisible()

    for (const id of CATEGORY_IDS) {
      const row = page.getByTestId(`settings-index-row-${id}`)
      await expect(row, `${id} must have an index row`).toBeVisible()
      await expect(row).toHaveAttribute('href', `/settings/${id}`)
      // The 44px floor. Measured, not assumed from a class name.
      const box = await row.boundingBox()
      expect(box, `${id} row must be measurable`).not.toBeNull()
      expect(Math.round(box?.height ?? 0), `${id} row height`).toBeGreaterThanOrEqual(44)
    }

    // The acceptance shape, verbatim: a row is a link whose accessible name
    // carries its category word.
    await expect(page.getByRole('link', { name: /Notifications/ })).toHaveCount(1)
    await expect(page.getByRole('link', { name: /Following & saved/ })).toHaveCount(1)

    // The whole point: the index is FINITE. No category body is mounted behind
    // it, and there is no back control to a list we are already on.
    await expect(page.getByTestId('notifications-section')).toHaveCount(0)
    await expect(page.getByTestId('account-sign-out')).toHaveCount(0)
    await expect(page.getByTestId('settings-radius')).toHaveCount(0)
    await expect(page.getByTestId('settings-back')).toHaveCount(0)
  })

  test('tapping a row opens ONLY that category, and back returns to the index', async ({ page }) => {
    await page.goto('/settings')
    await settleOnRoute(page, '/settings')

    await page.getByTestId('settings-index-row-notifications').click()
    await expect(page).toHaveURL(/\/settings\/notifications$/)

    // Exactly one body, and it is the one that was asked for.
    await expect(page.getByTestId('notifications-section')).toHaveCount(1)
    await expect(page.getByTestId('notifications-section')).toBeVisible()
    await expect(page.getByTestId('account-sign-out')).toHaveCount(0)
    await expect(page.getByTestId('settings-radius')).toHaveCount(0)
    // The list steps aside on the phone; the drill-down is one screen deep.
    await expect(page.getByTestId('settings-index')).toBeHidden()

    const back = page.getByTestId('settings-back')
    await expect(back).toBeVisible()
    const backBox = await back.boundingBox()
    expect(Math.round(backBox?.height ?? 0), 'back control height').toBeGreaterThanOrEqual(44)
    await back.click()

    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByTestId('settings-index')).toBeVisible()
    await expect(page.getByTestId('notifications-section')).toHaveCount(0)
  })

  test('the legacy hash still lands on its category, and replaces rather than pushes', async ({
    page,
  }) => {
    // One history entry first, so "Back" has an unambiguous destination: the
    // hash URL must NOT be one, or Back would bounce forward through the
    // redirect instead of returning to the index.
    await page.goto('/settings')
    await settleOnRoute(page, '/settings')

    await page.goto('/settings#saved')
    await expect(page).toHaveURL(/\/settings\/saved$/)
    await expect(
      page.getByRole('heading', { name: 'Following & saved', exact: true }),
    ).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByTestId('settings-index')).toBeVisible()
  })

  test('a category URL that names nothing lands on the index, never on a blank screen', async ({
    page,
  }) => {
    await page.goto('/settings/notes')
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByTestId('settings-index')).toBeVisible()
    await expect(page.getByTestId('settings-back')).toHaveCount(0)
  })
})

test.describe('the desktop: the pane beside the nav rail (1280×900)', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('/settings shows the pane inside <main>, right of the rail, with the first category', async ({
    page,
  }) => {
    await page.goto('/settings')
    await settleOnRoute(page, '/settings')

    const pane = page.getByTestId('settings-pane')
    await expect(pane).toBeVisible()
    await expect(page.getByTestId('settings-index')).toBeVisible()

    // The pane is INSIDE <main>, to the right of the existing rail — the shell's
    // geometry is unchanged, and this is the measurement that says so.
    const nav = page.locator('nav')
    await expect(nav).toBeVisible()
    const paneBox = await pane.boundingBox()
    const navBox = await nav.boundingBox()
    expect(paneBox, 'pane must be measurable').not.toBeNull()
    expect(navBox, 'nav rail must be measurable').not.toBeNull()
    expect(
      Math.round(paneBox?.x ?? 0),
      'the pane starts after the nav rail ends',
    ).toBeGreaterThan(Math.round((navBox?.x ?? 0) + (navBox?.width ?? 0)))
    const main = page.locator('main')
    const mainBox = await main.boundingBox()
    expect(mainBox).not.toBeNull()
    expect(Math.round(paneBox?.x ?? 0)).toBeGreaterThanOrEqual(Math.round(mainBox?.x ?? 0))

    // The pane is never blank: the first category is selected by default, and
    // it renders exactly ONCE (the pane and the routed body are the same slot).
    await expect(page.getByTestId('notifications-section')).toHaveCount(1)
    await expect(page.getByTestId('notifications-section')).toBeVisible()
  })

  test('a category URL keeps the pane visible and renders one body', async ({ page }) => {
    await page.goto('/settings/account')
    await settleOnRoute(page, '/settings/account')

    await expect(page.getByTestId('settings-pane')).toBeVisible()
    await expect(page.getByTestId('settings-index')).toBeVisible()
    await expect(page.getByTestId('account-sign-out')).toHaveCount(1)
    // The one-body rule, measured on the OTHER side of the pane's default: a
    // bare /settings already mounts the notifications body, so a regression that
    // rendered both the routed body and the default would show up here as 2.
    await expect(page.getByTestId('notifications-section')).toHaveCount(0)
    // The back control is the phone's; on the pane the list is already on screen.
    await expect(page.getByTestId('settings-back')).toBeHidden()

    // Every row of the one table is present in the pane, so the two
    // arrangements cannot drift.
    for (const id of CATEGORY_IDS) {
      await expect(page.getByTestId(`settings-index-row-${id}`)).toBeVisible()
    }
  })
})
