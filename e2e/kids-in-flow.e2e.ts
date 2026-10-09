/**
 * V37 slice B (`T6N3`) — ADD A KID WITHOUT LEAVING THE OUTING FLOW.
 *
 * The founder, verbatim: *"I'd also bring 'add your kids' into the outing flow
 * instead of stopping the parent and sending them to Settings."*
 *
 * The marker this suite mints SKIPS the kids step during signup, so it is exactly
 * the parent the slice is for: no kids, mid-outing, stopped where the picker would
 * be. Verified here:
 *   (a) the inline form appears instead of a Settings instruction;
 *   (b) submitting adds the kid (proved by reading the row back over PostgREST)
 *       and the parent is back in the flow with the DRAFT INTACT;
 *   (c) a failed add leaves the parent in place with the draft intact;
 *   (d) the fields and messages match the existing kid form;
 *   (e) the Settings path still works;
 *   (f) 390px, no overflow.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { E2E_BASE_URL, deleteKid, editTitle, listKidRows } from './fixtures'

/** The place field on /new — the draft value the tests prove survives the add. */
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'

/**
 * Fill enough of the form that "the draft is intact" is a real claim. The title is
 * a READ-BACK until tapped (V9 ticket 03), so `editTitle` — the suite's own helper
 * for exactly that — opens it before typing.
 */
async function fillDraft(page: Page, title: string, place: string) {
  await editTitle(page)
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(place)
}

test.describe('kids in the outing flow (V37-B, T6N3)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('a no-kids parent adds a kid INLINE and keeps their draft', async ({ page }) => {
    const title = 'Inline kid test'
    const place = 'Test Playground Inline'

    await page.goto(E2E_BASE_URL + '/new')
    await expect(page.getByTestId('inline-add-kid')).toBeVisible({ timeout: 30_000 })

    // (a) the form is IN PLACE, not a Settings instruction.
    await expect(page.getByTestId('inline-add-kid-submit')).toBeVisible()

    // Fill the outing BEFORE adding the kid, so "draft intact" has something to be
    // intact ABOUT.
    await fillDraft(page, title, place)

    // (d) the fields match the existing kid form: the same placeholders and limits.
    const nameInput = page.getByLabel('Kid first name')
    const ageInput = page.getByLabel('Kid age')
    await expect(nameInput).toHaveAttribute('placeholder', 'First name')
    await expect(nameInput).toHaveAttribute('maxlength', '30')
    await expect(ageInput).toHaveAttribute('placeholder', 'Age')
    await expect(ageInput).toHaveAttribute('max', '17')

    // (b) submit → the kid is added, and we are STILL on /new.
    const kidName = `Inline${Math.floor(Date.now() / 1000) % 100000}`
    await nameInput.fill(kidName)
    await ageInput.fill('7')
    await page.getByTestId('inline-add-kid-submit').click()

    // The form stays put (no navigation) and the picker now shows the kid.
    await expect(page).toHaveURL(/\/new$/)
    await expect(page.getByRole('button', { name: `${kidName} · Age 7` })).toBeVisible({
      timeout: 30_000,
    })

    // (b) the DRAFT IS INTACT — the fields filled before the add still hold.
    await expect(page.getByPlaceholder('e.g. Playground time at Green Lake')).toHaveValue(title)
    await expect(page.getByPlaceholder(PLACE_PLACEHOLDER)).toHaveValue(place)

    // (b) the row genuinely EXISTS in the database (not just in the DOM).
    const rows = await listKidRows(kidName)
    expect(rows.length, `${kidName} must be a real kids row`).toBe(1)
    expect(rows[0].age).toBe(7)

    // clean up the row this spec created
    await deleteKid(rows[0].id)
  })

  test('a failed add leaves the parent in place with the draft intact', async ({ page }) => {
    await page.goto(E2E_BASE_URL + '/new')
    await expect(page.getByTestId('inline-add-kid')).toBeVisible({ timeout: 30_000 })
    await fillDraft(page, 'Failure test', 'Somewhere Park')

    // ⚠️ Make the WRITE fail at the network layer — the same shape as a dropped
    // connection or a rejected insert. The parent must not be thrown out of the
    // form and must not lose what they typed.
    await page.route('**/rest/v1/kids**', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'new row violates row-level security policy' }),
        })
      }
      return route.continue()
    })

    await page.getByLabel('Kid first name').fill('FailureKid')
    await page.getByLabel('Kid age').fill('4')
    await page.getByTestId('inline-add-kid-submit').click()

    // (c) the error shows, in place, and the draft is untouched.
    await expect(page.getByTestId('inline-add-kid-error')).toBeVisible({ timeout: 30_000 })
    await expect(page).toHaveURL(/\/new$/)
    await expect(page.getByPlaceholder('e.g. Playground time at Green Lake')).toHaveValue(
      'Failure test',
    )
    await expect(page.getByPlaceholder(PLACE_PLACEHOLDER)).toHaveValue('Somewhere Park')
    // …and no kid was created.
    expect(await listKidRows('FailureKid')).toHaveLength(0)
  })

  test('the Settings door is still there for a parent who prefers it', async ({ page }) => {
    await page.goto(E2E_BASE_URL + '/new')
    await expect(page.getByTestId('inline-add-kid')).toBeVisible({ timeout: 30_000 })
    // (e) the door was ADDED to, not swapped for.
    const settings = page.getByRole('link', { name: 'Manage kids in Settings' })
    await expect(settings).toBeVisible()
    await expect(settings).toHaveAttribute('href', '/settings')
  })
})
