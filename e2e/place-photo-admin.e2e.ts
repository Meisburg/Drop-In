import { expect, test } from '@playwright/test'
import {
  readMarkerSession,
  readPlaceByName,
  setModerator,
  setPlacePhotos,
  type AdminResult,
  type PlacePhotoRow,
} from './fixtures'

/**
 * v30-8 / v30-9 — THE PLACE-PHOTO EDITOR, REACHED FROM WHERE THE PROBLEM IS.
 *
 * The founder: *"I still don't see an option for me to click upload or edit a
 * photo on each place … there's tons of photos on these places where there's
 * either no photo there or it's the wrong photo. I need a way to update them
 * easily in the UI."* The editor shipped in V28 r4 and was mounted ONLY in
 * /mod, so this spec exists because a live tool with no entry point looked like
 * a missing one — it has ZERO e2e coverage before this file.
 *
 * WHAT THIS PROVES, in the two halves the tickets name:
 *   - a parent sees no edit control anywhere in the directory (the absence);
 *   - a moderator sees one on the card, it opens the SHIPPED editor, and saving
 *     updates the card.
 *
 * THE LIVE-DATA DISCIPLINE. The directory is the founder's real directory, so
 * this spec SNAPSHOTS the row's five photo columns before the edit and RESTORES
 * them in a `finally`, asserting the restore. The donor URL is another seeded
 * row's own photo (known to load, and already public), so the assertion does not
 * depend on an external host the suite has never fetched.
 *
 * WHY THE ROW IS READ AND WRITTEN OVER POSTGREST (`readPlaceByName` /
 * `setPlacePhotos`): `runLiveSql` shells out to `apply-migration.mjs`, which needs
 * a CDP Chrome on :9222 — a human's desktop session on this machine, and absent
 * in a plain run. v31-5 replaced the management-API path
 * (`SUPABASE_ACCESS_TOKEN`, ACCOUNT-level and deliberately absent in CI) with the
 * PROJECT-scoped service-role key, read from the repo `.env` and never compiled
 * into the client bundle.
 */

const PLACE_NAME = 'Green Lake Park'
const DONOR_PLACE = 'Green Lake Park (East)'

/** The seeded row this spec edits (it currently carries NO photo). */
async function readTarget(): Promise<PlacePhotoRow> {
  return readPlaceByName(PLACE_NAME)
}

/** Land on /browse with no distance ceiling and the target row on screen. */
async function openDirectoryAt(page: import('@playwright/test').Page) {
  await page.goto('/browse')
  await expect(page.getByTestId('places-distance-filter-btn')).toBeVisible()
  await page.getByTestId('places-distance-filter-btn').click()
  await page.getByTestId('places-distance-sheet-option-any').click()
  await page.getByTestId('places-search').fill(PLACE_NAME)
  await expect(page.getByTestId('places-list')).toBeVisible()
}

/** The donor photo: another seeded row's own image (known to load, already public). */
async function readDonorUrl(): Promise<string> {
  const donor = await readPlaceByName(DONOR_PLACE)
  if (donor.photo_url === null) {
    throw new Error(`the donor row ${DONOR_PLACE} must carry a seeded photo`)
  }
  return donor.photo_url
}

test('a moderator replaces a place photo from its card, and the card updates (v30-8)', async ({
  page,
}) => {
  const { userId } = readMarkerSession()
  const snapshot = await readTarget()
  const donorUrl = await readDonorUrl()

  const editControl = page.getByTestId(`place-edit-photo-${snapshot.id}`)

  // --- SELF-HEAL (v30-10 `ocr` finding): a KILLED previous run skips its
  // `finally`, so the marker could still be elevated and the row could still
  // carry the donor photo. Both are reset idempotently BEFORE the absence is
  // asserted, so HALF 1 fails only for a reason that belongs to this run. ---
  const preReset = await setPlacePhotos(snapshot)
  expect(preReset.ok, `the pre-flight row reset must land: ${preReset.output}`).toBe(true)
  const preUnmoderate = await setModerator(userId, false)
  expect(preUnmoderate.ok, `the pre-flight un-elevate must land: ${preUnmoderate.output}`).toBe(true)

  // --- HALF 1 — an ordinary parent sees NO control on any card. ---
  await openDirectoryAt(page)
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  await expect(editControl).toHaveCount(0)

  let restoreEnvelope: AdminResult | null = null
  let unmoderateEnvelope: AdminResult | null = null
  try {
    // --- HALF 2 — elevate the marker, and the control appears. ---
    const elevate = await setModerator(userId, true)
    expect(elevate.ok, `the elevate call must land: ${elevate.output}`).toBe(true)
    await page.reload()
    await openDirectoryAt(page)
    await expect(editControl).toBeVisible()
    await editControl.click()

    // It opens the SHIPPED editor (the same component /mod mounts).
    const editor = page.getByTestId('place-photo-editor')
    await expect(editor).toBeVisible()
    await editor.getByTestId('photo-url-input').fill(donorUrl)
    await editor.getByTestId('photo-save-btn').click()
    await expect(editor.getByTestId('photo-admin-done')).toContainText('Photo updated.')

    // Close the dialog; the host re-read behind it, so the card shows the new
    // picture — this row had NO photo before, so an <img> here is the save
    // reaching the screen.
    await editor.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByTestId('place-photo-editor')).toHaveCount(0)
    await expect(page.getByTestId(`place-photo-${snapshot.id}`)).toBeVisible({ timeout: 15_000 })
  } finally {
    // BOTH restores, always: the place's five photo columns AND the marker's
    // moderator flag. The flag is the one that is easy to forget — a spec that
    // elevates and does not put it back changes the behaviour of every spec
    // that runs after it (and leaves a stray moderator in the live database,
    // which is exactly what the first draft of this file did).
    restoreEnvelope = await setPlacePhotos(snapshot)
    unmoderateEnvelope = await setModerator(userId, false)
  }
  expect(restoreEnvelope.ok, `the restore MUST land: ${restoreEnvelope.output}`).toBe(true)
  expect(unmoderateEnvelope.ok, `the un-elevate MUST land: ${unmoderateEnvelope.output}`).toBe(true)

  // The restore is real, and the directory is back to its seeded state.
  expect((await readTarget()).photo_url).toBe(snapshot.photo_url)
})

/**
 * v30-9 — THE SAME EDITOR, FROM THE PLACE PAGE.
 *
 * The founder notices a wrong or missing picture *on the place*, so the door
 * belongs there too. This test is deliberately an EXTENSION of the one above,
 * not a second behavioural spec: the same editor, the same ModalShell, the same
 * assertions about the confirmation and the re-read. What is new is only the
 * entry point and the surface it updates — the hero.
 */
test('a moderator replaces a place photo from the place page (v30-9)', async ({ page }) => {
  const { userId } = readMarkerSession()
  const snapshot = await readTarget()
  const donorUrl = await readDonorUrl()

  const control = page.getByTestId('place-edit-photo')

  // --- SELF-HEAL, same reason as the card test above: a killed run skips its
  // `finally`, so both the row and the flag are reset before HALF 1. ---
  const preReset = await setPlacePhotos(snapshot)
  expect(preReset.ok, `the pre-flight row reset must land: ${preReset.output}`).toBe(true)
  const preUnmoderate = await setModerator(userId, false)
  expect(preUnmoderate.ok, `the pre-flight un-elevate must land: ${preUnmoderate.output}`).toBe(true)

  // --- HALF 1 — a parent sees the picture slot, and no way to change it. ---
  await page.goto(`/place/${snapshot.id}`)
  await expect(page.getByTestId('place-page-photo-slot')).toBeVisible()
  await expect(control).toHaveCount(0)

  let restoreEnvelope: AdminResult | null = null
  let unmoderateEnvelope: AdminResult | null = null
  try {
    const elevate = await setModerator(userId, true)
    expect(elevate.ok, `the elevate call must land: ${elevate.output}`).toBe(true)

    await page.reload()
    await expect(control).toBeVisible()
    await control.click()

    const editor = page.getByTestId('place-photo-editor')
    await expect(editor).toBeVisible()
    await editor.getByTestId('photo-url-input').fill(donorUrl)
    await editor.getByTestId('photo-save-btn').click()
    await expect(editor.getByTestId('photo-admin-done')).toContainText('Photo updated.')

    await editor.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByTestId('place-photo-editor')).toHaveCount(0)

    // The page re-read its own row, so the HERO shows the picture — still above
    // the name, which is the placement this batch pinned in v30-6.
    const hero = page.getByTestId('place-page-photo')
    await expect(hero).toBeVisible({ timeout: 15_000 })
    const heroBox = await hero.boundingBox()
    const headingBox = await page.getByRole('heading', { name: PLACE_NAME, exact: true }).boundingBox()
    expect(heroBox).not.toBeNull()
    expect(headingBox).not.toBeNull()
    expect(heroBox!.y, 'the picture must still sit above the name').toBeLessThan(headingBox!.y)
  } finally {
    restoreEnvelope = await setPlacePhotos(snapshot)
    unmoderateEnvelope = await setModerator(userId, false)
  }
  expect(restoreEnvelope.ok, `the restore MUST land: ${restoreEnvelope.output}`).toBe(true)
  expect(unmoderateEnvelope.ok, `the un-elevate MUST land: ${unmoderateEnvelope.output}`).toBe(true)
  expect((await readTarget()).photo_url).toBe(snapshot.photo_url)
})
