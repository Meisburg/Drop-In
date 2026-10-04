import { expect, test } from './fixtures'

// r3-9: the /new form's DRAFT (option B — the founder's 2026-10-04 decision).
// The founder left mid-form, and a parent must find their work when they come
// back: the draft (sessionStorage, keyed to the signed-in user) is restored,
// a disclosure says so, and a successful post clears it.
//
// THE FLOW MIRRORS THE REAL EXIT: the marker user has no kids, so the form's
// "Add kids" link (PlaydateFormFields) points at /settings — the very exit
// the founder hit (kids first, then back). Leaving /new while the form is
// dirty is what persists the draft; returning to /new restores it.
//
// Conventions: fixture markers (docs/agents/e2e-fixture-convention.md), the
// sweep in the `afterAll` hook, the step timing from fixtures.ts (this spec
// posts exactly ONE playdate), and the form's own placeholders (post-fast).

const DRAFT_TITLE = 'Drafted at the boathouse'
const DRAFT_PLACE = 'Drafted by the boathouse'
const DRAFT_ADDRESS = '7200 4th Ave NE, near the boathouse'

test('leaving /new mid-form keeps a draft; returning restores it (disclosure); posting clears it', async ({ page }) => {
  const { supabase, session } = await readMarkerSession(page, 'new-form-draft')
  const marker = session.user!.id

  const started = new Map<string, number>()
  const step = (name: string) => {
    started.set(name, stepStartTimeOnce(started, name))
    return name
  }
  const steps = ['read-marker-session', 'fill-new-form', 'leave-to-settings', 'return-to-new', 'post-playdate']

  test.info().annotations.push({
    type: 'e2e-marker',
    description: `playdate parent_id='${marker}' sweep_target='playdate'`,
  })

  try {
    await step('read-marker-session')

    // 1 — OPEN /new AND FILL IT. The marker user has no kids, so the
    //    "Add kids" exit is the one the founder took (PlaydateFormFields'
    //    location-required block). Filling the title alone dirties the form
    //    (the write effect only fires on a touched form).
    await step('fill-new-form')
    await page.goto('/new')
    const titleInput = page.getByPlaceholder('e.g. Playground time at Green Lake')
    await titleInput.waitFor({ state: 'visible' })
    await titleInput.fill(DRAFT_TITLE)
    await page.getByPlaceholder('e.g. Green Lake playground, near the boathouse').fill(DRAFT_PLACE)
    await page.getByPlaceholder('e.g. 7200 4th Ave NE, near the boathouse').fill(DRAFT_ADDRESS)

    // 2 — LEAVE MID-FORM. The "Add kids" link (the founder's exit) takes the
    //    parent to /settings; the draft persists on the way out.
    await step('leave-to-settings')
    await page.getByTestId('add-kids-link').click()
    await settleOnRoute(page, '/settings')

    // 3 — RETURN TO /new. The draft comes back with a disclosure.
    await step('return-to-new')
    await page.getByRole('link', { name: /new/i }).first().click()
    await settleOnRoute(page, '/new')
    await expect(page.getByTestId('draft-restore-notice')).toBeVisible()
    await expect(page.getByPlaceholder('e.g. Playground time at Green Lake')).toHaveValue(DRAFT_TITLE)
    await expect(page.getByPlaceholder('e.g. Green Lake playground, near the boathouse')).toHaveValue(DRAFT_PLACE)
    await expect(page.getByPlaceholder('e.g. 7200 4th Ave NE, near the boathouse')).toHaveValue(DRAFT_ADDRESS)

    // 4 — POST IT. The successful create clears the draft (the spec's rule 4):
    //    the next /new opens empty.
    await step('post-playdate')
    await page.getByRole('button', { name: 'Post the drop-in' }).click()
    const posted = await page.getByTestId('post-summary-line').waitFor({ state: 'visible' })
    await expect(posted).toBeVisible()

    // A NEW /new visit must be empty (the draft is gone) and show no
    // disclosure.
    await page.getByRole('link', { name: /new/i }).first().click()
    await settleOnRoute(page, '/new')
    await expect(page.getByTestId('draft-restore-notice')).toHaveCount(0)
    await expect(page.getByPlaceholder('e.g. Playground time at Green Lake')).toHaveValue('')
  } finally {
    await cleanupPlaydateRows(supabase, marker)
  }
})