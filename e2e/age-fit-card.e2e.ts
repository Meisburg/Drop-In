/**
 * V37 slice C (`R8W5`) — AGE FIT ON THE CARD, AND THE CARD/DETAIL PARITY.
 *
 * The founder: *"and show age fit more clearly on outings."*
 *
 * ⚠️ WHAT THIS SLICE FOUND, AND WHY THE ASSERTIONS LOOK LIKE THIS. The age range
 * was ALREADY on the feed card (`DropInCard`'s `card-age-range`, since V9 ticket
 * 05, with its own spec in `feed-ages.e2e.ts`). What was NOT unified was the
 * WORDING: the card's attendee band spelled its own `ages X–Y` inside `feed.ts`
 * while the stated line and the detail page went through `statedAgeRangeLine`.
 * Two formatters agreeing by luck is the drift this slice removes.
 *
 * ⚠️ AND WHAT IT DELIBERATELY DOES NOT DO. A later founder annotation (v33-5 /
 * `muyed1t6`) suppresses the standalone range on any card that shows an attendee
 * band, so a card never prints two age ranges. That rule STANDS — this spec does
 * not assert a second age line, because producing one is the exact defect that
 * annotation named. See `cardAgeLineDecision`'s docblock for the ruling.
 *
 * Verified here:
 *   (a) an outing with a stated range shows that range on its feed card;
 *   (b) ⚠️ the card's string is IDENTICAL to the detail page's for the same outing
 *       — the whole point of one helper, asserted directly;
 *   (c) an outing with no stated range shows nothing, on card and detail alike;
 *   (e) 390px, no overflow on the card.
 *
 * The marker skips kids at signup, so this spec ADDS two through the profile's
 * own add-kid form first (the app's real path — no admin write for user data it
 * can create through the UI), and deletes them in a finally.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { E2E_BASE_URL, editTitle, readMarkerSession, readSupabaseEnv, settleOnRoute } from './fixtures'

const PLACE = 'Green Lake Park'

/** One card on the feed, found by its title (the golden-path pattern). */
function cardFor(page: Page, title: string) {
  return page.locator('a').filter({ hasText: title }).first()
}

/** Local YYYY-MM-DD `days` from today (the date input's own format). */
function localDatePlusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The marker's own kid rows, with the marker's JWT (only ever its own rows). */
async function markerKidRows(): Promise<Array<{ id: string; first_name: string; age: number }>> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const res = await fetch(
    `${url}/rest/v1/kids?profile_id=eq.${userId}&select=id,first_name,age&order=age`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) throw new Error(`marker kid read HTTP ${res.status}: ${await res.text()}`)
  return (await res.json()) as Array<{ id: string; first_name: string; age: number }>
}

/** Add a kid through the profile's OWN form — the app's real path. */
async function addKidViaProfile(page: Page, firstName: string, age: number) {
  await page.goto('/profile')
  await settleOnRoute(page, '/profile')
  // The kids editor sits BEHIND the "Edit profile" button (the page's own gate,
  // V34), so it must be opened before the add row exists.
  await page.getByTestId('edit-profile').click()
  // ⚠️ THE ADD ROW vs AN EXISTING KID'S ROW — the two are NOT interchangeable.
  // An existing row's inputs carry `aria-label="Kid first name"` / `"Kid age"` and
  // NO placeholder; the ADD row is the OPPOSITE: its name input has
  // `placeholder="First name"` and no aria-label, and its age input has BOTH
  // `placeholder="Age"` and `aria-label="Kid age"`. So the name input's placeholder
  // is the one unambiguous handle on the add row, and the age input is scoped to
  // the same container rather than matched globally (probed live; an earlier draft
  // filled an EXISTING kid's row by mistake and silently added an unnamed child).
  const addName = page.getByPlaceholder('First name')
  await addName.fill(firstName)
  await page.getByPlaceholder('Age').fill(String(age))
  await page.getByRole('button', { name: 'Add kid' }).click()
  // The write + re-read round-trips and the row appears. ⚠️ Assert on the row's
  // INPUT VALUE, not its text content: a kid's name lives in an `<input value>` and
  // is therefore NOT part of the row's text, so `filter({ hasText })` never matches
  // it (an earlier draft waited 30s on exactly that).
  await expect(page.locator(`input[data-testid="kid-name"][value="${firstName}"]`)).toHaveCount(1, {
    timeout: 30_000,
  })
  // Leave edit mode so the rest of the walk uses the settled page.
  await page.getByTestId('done-editing-profile').click()
}

/** Post a drop-in on /new with the given kid chips picked. */
async function postDropIn(page: Page, title: string, kidLabels: string[]) {
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await editTitle(page)
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page.getByPlaceholder('e.g. Green Lake playground, near the boathouse').fill(PLACE)
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  for (const label of kidLabels) {
    await page.getByRole('button', { name: label, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
}

test.describe('age fit on the card (V37-C, R8W5)', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  // The profile form is the only way these kids are created, so this spec needs
  // a signed-in marker with a profile — the setup project provides both.
  test.describe.configure({ mode: 'serial' })

  test('the card states the range, and it is the SAME string the detail page states', async ({
    page,
  }) => {
    const stamp = Math.floor(Date.now() / 1000) % 100000
    const kidA = `A${stamp}`
    const kidB = `B${stamp}`
    const created: string[] = []
    try {
      await addKidViaProfile(page, kidA, 3)
      await addKidViaProfile(page, kidB, 6)
      created.push(...(await markerKidRows()).map((r) => r.id))

      // ⚠️ THE RECORD MARKER (docs/agents/e2e-fixture-convention.md): a fixture
    // drop-in title MUST carry `e2e ` or `e2e-`, or the sweep cannot find it and
    // the row outlives the run. `fixture-marker-guard` enforces this deterministically.
    const title = `e2e age fit ${stamp}`
      await postDropIn(page, title, [`${kidA} · Age 3`, `${kidB} · Age 6`])

      const card = cardFor(page, title)
      await expect(card).toBeVisible({ timeout: 30_000 })

      // --- (a) the card carries the age line ---
      const cardAge = card.getByTestId('card-age-range')
      await expect(cardAge).toBeVisible({ timeout: 30_000 })
      const cardText = (await cardAge.textContent())?.trim() ?? ''
      expect(cardText).toMatch(/^age[s]? /)

      // --- (b) ⚠️ THE PARITY: the detail page states the SAME string ---
      await card.click()
      await page.waitForURL(/\/playdate\//, { timeout: 30_000 })
      await expect(page.getByText(cardText, { exact: true }).first()).toBeVisible({
        timeout: 30_000,
      })

      // --- (e) no horizontal overflow at 390px, on the card we came from ---
      await page.goto(E2E_BASE_URL + '/')
      const back = cardFor(page, title)
      await expect(back).toBeVisible({ timeout: 30_000 })
      const measured = await back.evaluate((el) => {
        const doc = document.documentElement
        const r = el.getBoundingClientRect()
        return {
          viewport: window.innerWidth,
          overflow: doc.scrollWidth > window.innerWidth + 1,
          cardRight: Math.round(r.right),
        }
      })
      expect(measured.overflow, 'no horizontal overflow at 390px').toBe(false)
      expect(measured.cardRight).toBeLessThanOrEqual(measured.viewport + 1)
    } finally {
      await cleanupKids(page, created)
    }
  })

  test('an outing with NO stated range shows no age line — nothing, not a placeholder', async ({
    page,
  }) => {
    // ⚠️ THE RECORD MARKER is required (docs/agents/e2e-fixture-convention.md), so
    // the title cannot double as the absence probe — an earlier draft titled this
    // post "No age …" and tripped its own assertion. The absence check below is
    // therefore about the AGE-RANGE SENTENCE, which is the real contract, and not
    // about the bare substring "age".
    const title = `e2e untimed pick ${Math.floor(Date.now() / 1000) % 100000}`
    // No kid chips picked → neither age column is named → nothing stated.
    await postDropIn(page, title, [])

    const card = cardFor(page, title)
    await expect(card).toBeVisible({ timeout: 30_000 })
    // (c) NOTHING on the card — no empty chip, no "All ages", no placeholder.
    await expect(card.getByTestId('card-age-range')).toHaveCount(0)
    // No age-range SENTENCE anywhere on the card either: the helper's own vocabulary
    // (`ages X–Y` / `age N` / `all ages` / `ages N and up|under`) must not appear in
    // any other row's text. This is the feed-ages precedent, narrowed so the
    // required `e2e ` title marker cannot make it vacuous.
    await expect(card).not.toContainText(/\bages? \d|all ages|and up|and under/)
    // Belt-and-braces on the positive half: the card still rendered its other meta,
    // so the absence above is "no age line", not "a card that failed to paint".
    await expect(card).toContainText('Green Lake Park')

    // …and the detail page states nothing either: the same absent end state.
    await card.click()
    await page.waitForURL(/\/playdate\//, { timeout: 30_000 })
    await expect(page.getByText(/^ages \d/)).toHaveCount(0)
  })
})

/** Delete the kids this spec created, so the marker is left as it was found. */
async function cleanupKids(page: Page, kidIds: string[]) {
  if (kidIds.length === 0) return
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  for (const id of kidIds) {
    await fetch(`${url}/rest/v1/kids?id=eq.${id}`, {
      method: 'DELETE',
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
    }).catch(() => undefined)
  }
  await page.goto('/')
}
