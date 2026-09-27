/**
 * Spec (V25 t08): THE SAVED (hearts) COLLECTION.
 *
 * THE FOUNDER'S ASK, verbatim: *"I did like the idea of having them be hearts to
 * like heart something that you like, but I feel like you should be able to see
 * a list of all of the things that you hearted somewhere or that makes sense
 * like maybe like when you're going to post a drop in, you have a collection of
 * all of your favorite places that you can select from."*
 *
 * TWO SURFACES, ONE SAVE:
 *
 *  1. `/browse` gains a **Saved** filter chip over the directory it already
 *     renders. It narrows the SAME rows by the caller's own `follows` row ids —
 *     there is no `saved_places` table and no second read SHAPE: /new now issues
 *     the same batched `listMyFollows` this page already issued, and neither
 *     surface reads anything else.
 *  2. `/new`'s place-picker SHEET (the same `PlaceDirectory` component, in
 *     `selectable` mode) offers the SAME chip. Picking a saved place closes the
 *     sheet and writes the form through the EXISTING `pickPlace` path — the
 *     evidence for that is the place field's value, not a new testid.
 *
 * WHAT THIS SPEC PROVES, in the order a parent would meet it:
 *  (a) saving a place on /browse puts it in the Saved list;
 *  (b) un-saving it from that list removes it and leaves an HONEST empty state
 *      (a sentence, never an empty bordered list, never a "broken filter");
 *  (c) a viewer with NO saves never sees a Saved chip that opens onto nothing;
 *  (d) the same saved place appears in /new's picker sheet and selecting it
 *      writes the form's place field through `pickPlace`.
 *
 * WHY THE MARKER'S OWN ROWS ARE PURGED FIRST: the marker is one long-lived
 * account, so a previous run (or the V17 heart spec) can leave place-follow rows
 * behind and make "starts with no saves" false. The purge is best-effort REST
 * with the marker's own JWT (the follows table is owner-only on every verb — the
 * ONLY credential that can remove them), and every test asserts on what it
 * OBSERVES rather than on the purge having worked.
 *
 * RED BY DESIGN pre-0033-apply: the follows table does not exist live yet, so
 * the chained `listMyFollows` read fails and both pages land their documented
 * empty set — no Saved chip, no error wall, the directory otherwise unchanged.
 * That is the designed degradation, not a crash.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readMarkerSession, readSupabaseEnv, settleOnRoute } from './fixtures'

/** A real seeded playground (the V17 heart spec's own marker place). */
const MARKER_PLACE_NAME = 'Ballard Corners Park'
/**
 * That place's id in the 0029 seed — the V17 heart spec pins the same constant
 * for the same reason: it is what lets this spec name the heart
 * (`place-heart-<id>`) and the picker row without guessing from the render.
 */
const MARKER_PLACE_ID = '26a77f22-7f99-4bd5-88df-4169b91ae7c7'

/* --- The marker's own follows rows, through PostgREST with its JWT --------- */

function markerHeaders(): Record<string, string> {
  const { anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  return { apikey: anonKey, Authorization: `Bearer ${accessToken}` }
}

/** The marker's own `follows` rows for one place (rows, never the status). */
async function markerPlaceFollows(placeId: string): Promise<Array<{ id: string }>> {
  const { url } = readSupabaseEnv()
  const query = `follows?place_id=eq.${placeId}&select=id`
  const response = await fetch(`${url}/rest/v1/${query}`, { headers: markerHeaders() })
  if (!response.ok) {
    throw new Error(`REST ${query} → HTTP ${response.status} ${await response.text()}`)
  }
  return (await response.json()) as Array<{ id: string }>
}

/** Remove every place-follow row the marker owns (best-effort, the house shape). */
async function clearMarkerPlaceFollows(): Promise<void> {
  try {
    const { url } = readSupabaseEnv()
    const response = await fetch(`${url}/rest/v1/follows?place_id=not.is.null`, {
      method: 'DELETE',
      headers: markerHeaders(),
    })
    if (!response.ok) {
      console.log(`[e2e cleanup] follows delete HTTP ${response.status} (best-effort)`)
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] follows delete failed (logged, best-effort): ${
        err instanceof Error ? err.message : err
      }`,
    )
  }
}

/* --- Page helpers (the places.e2e.ts shapes) ------------------------------- */

/** /browse, settled — the directory (not the feed) is what this spec drives. */
async function openPlacesTab(page: Page): Promise<void> {
  await page.goto('/browse')
  await settleOnRoute(page, '/browse')
}

/**
 * Set the distance filter to "Any distance": the directory's default follows the
 * viewer's own radius, and the marker's radius is whatever the last spec left it
 * on. Driving the control keeps this spec independent of that.
 */
async function selectAnyDistance(page: Page): Promise<void> {
  await page.getByTestId('places-distance-filter').selectOption('any')
}

/** The seeded place row for the marker place (a link to the place page). */
function markerRow(page: Page) {
  return page.getByTestId('place-row').filter({ hasText: MARKER_PLACE_NAME }).first()
}

/** The marker place's heart, in whichever surface is on screen. */
function markerHeart(scope: Page | ReturnType<Page['getByTestId']>) {
  return scope.getByTestId(`place-heart-${MARKER_PLACE_ID}`)
}

/**
 * The Saved chip, once it is on screen. The chip is deliberately absent for a
 * viewer with no saves (a door to nowhere), so every caller waits for it.
 */
function savedChip(page: Page) {
  return page.getByTestId('places-saved-filter')
}

/** Save the marker place from /browse and return the heart locator. */
async function saveMarkerPlaceFromBrowse(page: Page): Promise<void> {
  await openPlacesTab(page)
  await selectAnyDistance(page)
  await page.getByTestId('places-search').fill(MARKER_PLACE_NAME)
  await expect(markerRow(page)).toBeVisible()
  await expect(markerHeart(page)).toHaveAttribute('aria-pressed', 'false')
  await markerHeart(page).click()
  await expect(markerHeart(page)).toHaveAttribute('aria-pressed', 'true')
  // The row is the database's answer, not a local bit: read it back.
  await expect.poll(async () => (await markerPlaceFollows(MARKER_PLACE_ID)).length).toBe(1)
}

/* --- Tests ----------------------------------------------------------------- */

test.beforeEach(async () => {
  // A long-lived marker account: start from "this parent has saved nothing".
  await clearMarkerPlaceFollows()
})

test('saving a place puts it in the Places Saved list, and un-saving removes it (V25 t08)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })

  // --- (a) SAVE TWO PLACES, then open the collection. ---
  await saveMarkerPlaceFromBrowse(page)
  // A SECOND save (whatever the directory leads with), so the filter's list can
  // be narrowed by the search and the "saves exist but are filtered out" copy is
  // reachable — the two empty messages are different truths and both need a
  // witness.
  await page.getByTestId('places-search').fill('')
  const secondHeart = page.locator('[data-testid^="place-heart-"]').first()
  const secondHeartId = (await secondHeart.getAttribute('data-testid')) ?? ''
  expect(secondHeartId).not.toMatch(new RegExp(`${MARKER_PLACE_ID}$`))
  await expect(secondHeart).toHaveAttribute('aria-pressed', 'false')
  await secondHeart.click()
  await expect(page.locator(`[data-testid="${secondHeartId}"]`)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator(`[data-testid="${secondHeartId}"]`)).toBeVisible()

  // The chip appears the moment a save exists (it is hidden while there is
  // nothing to open), is a 44px tap target, and reports its own state.
  const chip = savedChip(page)
  await expect(chip).toBeVisible()
  const box = await chip.boundingBox()
  if (box === null) throw new Error('the Saved chip has no box — it is not rendered')
  expect(box.height).toBeGreaterThanOrEqual(44)
  await expect(chip).toHaveAttribute('aria-pressed', 'false')

  // Turn the filter on. The search is still empty, so the collection is the
  // FILTER's doing, and it holds exactly the caller's own follows rows.
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  await expect(markerRow(page)).toBeVisible()
  await expect(page.getByTestId('place-row')).toHaveCount(2)
  await expect(markerHeart(page)).toHaveAttribute('aria-pressed', 'true')

  // --- (b) THE "ALL FILTERED OUT" EMPTY STATE (hasSaves === true). ---
  // A search that matches neither save: the collection is not empty, and the
  // copy must say so rather than tell this parent they have saved nothing.
  await page.getByTestId('places-search').fill('zzzz-no-such-place-zzzz')
  await expect(page.getByTestId('place-row')).toHaveCount(0)
  await expect(page.getByTestId('empty-saved-state')).toBeVisible()
  await expect(page.getByTestId('empty-saved-state')).toContainText(
    'None of your saved places match these filters.',
  )
  await expect(page.getByTestId('saved-empty-escape-all')).toHaveText('Show all places')

  // The escape clears the gate — never a dead end. The search is still the
  // nonsense query, so with the gate off the generic no-match state is the
  // honest answer; clearing the search is what restores the directory.
  await page.getByTestId('saved-empty-escape-all').click()
  await expect(page.getByTestId('empty-saved-state')).toHaveCount(0)
  await expect(chip).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('places-search').fill('')
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  expect(await page.getByTestId('place-row').count()).toBeGreaterThan(1)

  // --- (c) UN-SAVE FROM THE COLLECTION: each row leaves without a reload. ---
  await chip.click()
  await expect(page.getByTestId('place-row')).toHaveCount(2)
  await markerHeart(page).click()
  await expect(page.getByTestId('place-row')).toHaveCount(1)
  await expect.poll(async () => (await markerPlaceFollows(MARKER_PLACE_ID)).length).toBe(0)

  await page.locator(`[data-testid="${secondHeartId}"]`).click()
  await expect(page.getByTestId('place-row')).toHaveCount(0)

  // --- (d) THE FIRST-RUN EMPTY STATE (hasSaves === false): after the LAST
  //         unsave the truth changes, and so does the sentence. ---
  await expect(page.getByTestId('empty-saved-state')).toBeVisible()
  await expect(page.getByTestId('empty-saved-state')).toContainText(
    'You haven’t saved any places yet.',
  )
  await expect(page.getByTestId('empty-saved-state')).toContainText(
    'Tap the bookmark on a place to keep it here.',
  )
  await expect(page.getByTestId('saved-empty-escape-all')).toHaveText('Browse all places')

  // The escape returns the whole directory (the empty state is never a dead end).
  await page.getByTestId('saved-empty-escape-all').click()
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  expect(await page.getByTestId('place-row').count()).toBeGreaterThan(1)
})

test('a viewer with no saves sees no Saved chip that opens onto nothing (V25 t08)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })

  // The purge in beforeEach leaves the marker with zero place follows.
  await openPlacesTab(page)
  await selectAnyDistance(page)
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  expect(await markerPlaceFollows(MARKER_PLACE_ID)).toHaveLength(0)

  // NO chip: a "Saved" control with nothing behind it is the door-to-nowhere
  // defect the directory's own mode toggle already avoids. The chip is a
  // promise, so it is withheld until a save exists.
  await expect(page.getByTestId('places-saved-filter')).toHaveCount(0)
})

test('the post form offers the saved places, and selecting one writes the form (V25 t08)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })

  // One save, made on /browse (the surface the founder was looking at).
  await saveMarkerPlaceFromBrowse(page)

  // --- /new, through the feed's own action (`settleOnRoute` owns that hop:
  //     there is no Post tab any more, so it lands on the feed first). ---
  await settleOnRoute(page, '/new')
  await expect(page.getByRole('heading', { name: 'Post a drop-in' })).toBeVisible()

  const door = page.getByTestId('browse-places')
  await expect(door).toBeVisible({ timeout: 15_000 })
  await door.click()
  const sheet = page.getByTestId('place-directory-sheet')
  await expect(sheet).toBeVisible()

  // The sheet opens on the WHOLE directory (the picker's own semantics are
  // untouched), and it carries the SAME collection door. The distance control is
  // the sheet's own (the marker's radius is whatever the last spec left it on),
  // so it is driven here exactly as on /browse.
  const chip = sheet.getByTestId('places-saved-filter')
  await expect(chip).toBeVisible()
  await expect(chip).toHaveAttribute('aria-pressed', 'false')
  await sheet.getByTestId('places-distance-filter').selectOption('any')
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')

  // Exactly the saved place, with its heart reporting the saved state — the
  // heart in the sheet renders from the SAME batched read /browse made.
  const row = markerRow(sheet)
  await expect(row).toBeVisible()
  await expect(sheet.getByTestId('place-row')).toHaveCount(1)
  await expect(markerHeart(sheet)).toHaveAttribute('aria-pressed', 'true')

  // --- PICK IT: the existing one-tap `pickPlace` write, nothing new. ---
  await row.getByTestId('place-card-name').click()
  await expect(sheet).toHaveCount(0)
  const placeInput = page.getByPlaceholder('e.g. Green Lake playground, near the boathouse')
  await expect(placeInput).toHaveValue(new RegExp(MARKER_PLACE_NAME))
})
