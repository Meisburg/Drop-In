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

/**
 * place-photo-crop (2026-10-05) — UPLOAD A FILE, FRAME IT, SAVE IT.
 *
 * The founder's other half: *"either upload a file manually … and then be able
 * to like pan it or crop it to make it look right for our app."* This drives the
 * upload door end to end — pick a committed PNG, accept the crop step's default
 * frame, and prove the ROW ends up pointing at OUR `place-photos` object rather
 * than at anything the moderator typed.
 *
 * WHY THE CARD DOOR AND NOT /mod: the card is where the founder notices the
 * wrong picture, and it is the door that nests the crop step inside the editor's
 * `ModalShell` — the stacking case (`lib/stacking.ts`,
 * `OVERLAY_INSIDE_MODAL_Z_CLASS`) that a /mod-only run would never exercise.
 *
 * THE FILE IS COMMITTED AND SAME-ORIGIN (`public/pwa-192x192.png`, a real 192×192
 * PNG): no external host, no network dependency, nothing to flake on. It is not
 * uploaded to the app under test by any other spec.
 */
test('a moderator uploads a file, frames it, and the card shows our stored copy (place-photo-crop)', async ({
  page,
}) => {
  const { userId } = readMarkerSession()
  const snapshot = await readTarget()

  const editControl = page.getByTestId(`place-edit-photo-${snapshot.id}`)

  // --- SELF-HEAL, same reason as the two tests above: a killed run skips its
  // `finally`, so the row and the marker are reset before anything is asserted. ---
  const preReset = await setPlacePhotos(snapshot)
  expect(preReset.ok, `the pre-flight row reset must land: ${preReset.output}`).toBe(true)
  const preUnmoderate = await setModerator(userId, false)
  expect(preUnmoderate.ok, `the pre-flight un-elevate must land: ${preUnmoderate.output}`).toBe(
    true,
  )

  let restoreEnvelope: AdminResult | null = null
  let unmoderateEnvelope: AdminResult | null = null
  try {
    const elevate = await setModerator(userId, true)
    expect(elevate.ok, `the elevate call must land: ${elevate.output}`).toBe(true)
    await page.reload()
    await openDirectoryAt(page)
    await expect(editControl).toBeVisible()
    await editControl.click()

    const editor = page.getByTestId('place-photo-editor')
    await expect(editor).toBeVisible()
    await editor.getByTestId('photo-mode-upload').click()

    // --- CANCEL FIRST (criterion 2): the dialog opens, the moderator backs out,
    // and the row is left exactly as it was — no upload, no URL, no error. ---
    await editor.getByTestId('photo-file-input').setInputFiles('public/pwa-192x192.png')
    const cancelled = page.getByTestId('crop-photo-dialog')
    await expect(cancelled).toBeVisible()
    await cancelled.getByTestId('crop-cancel').click()
    await expect(cancelled).toHaveCount(0)
    expect(await readTarget(), 'a cancelled crop must leave all five columns alone').toEqual(
      snapshot,
    )
    await expect(editor.getByTestId('photo-admin-done')).toHaveCount(0)
    await expect(editor.getByTestId('photo-admin-error')).toHaveCount(0)

    // --- AND THEN COMMIT ONE. ---
    await editor.getByTestId('photo-file-input').setInputFiles('public/pwa-192x192.png')

    // The crop step opens on the decoded file. It is the RECTANGLE variant: a
    // place photo draws no avatar circle, and the dialog says so. `windowShape`
    // is `PLACE_PHOTO_SIZE`, so the window is 2:1 at BOTH viewports the mobile
    // audit measures — slice 3's criterion 1, and the fix for the founder's
    // *"It is the wrong size."*
    const cropDialog = page.getByTestId('crop-photo-dialog')
    await expect(cropDialog).toBeVisible()
    await expect(cropDialog).toContainText('The rectangle is what everyone will see.')
    await expect(cropDialog.locator('div[style*="9999px"]')).toHaveCount(0)
    const cropWindow = page.getByTestId('crop-window')
    for (const viewport of [
      { width: 390, height: 664 },
      { width: 768, height: 900 },
    ]) {
      await page.setViewportSize(viewport)
      await expect(cropWindow).toBeVisible()
      const windowBox = await cropWindow.boundingBox()
      expect(windowBox, `the crop window must render a box at ${viewport.width}px`).not.toBeNull()
      const ratio = windowBox!.width / windowBox!.height
      // Logged, not only asserted: the acceptance criterion is a MEASUREMENT, and
      // a log line is what lets a reader check the number without a rerun.
      console.log(
        `[slice3] place crop window at ${viewport.width}px: ${windowBox!.width}x${windowBox!.height} = ${ratio.toFixed(4)}:1`,
      )
      expect(
        Math.abs(ratio - 2),
        `the place crop window must be 2:1 ±1% at ${viewport.width}px (measured ${windowBox!.width}x${windowBox!.height} = ${ratio.toFixed(4)}:1)`,
      ).toBeLessThan(0.02)
    }
    // Back to the default viewport before the save, so this test's geometry does
    // not depend on the last viewport it measured in.
    await page.setViewportSize({ width: 1280, height: 720 })

    // The dialog's confirm IS the save — there is no separate upload step.
    await cropDialog.getByTestId('crop-confirm').click()
    await expect(editor.getByTestId('photo-admin-done')).toContainText('Photo updated.')
    await expect(cropDialog).toHaveCount(0)

    await editor.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByTestId('place-photo-editor')).toHaveCount(0)
    await expect(page.getByTestId(`place-photo-${snapshot.id}`)).toBeVisible({ timeout: 15_000 })

    // THE ROW POINTS AT OUR OWN OBJECT — never a third-party URL (slice 1 AC5),
    // and never at the raw file the moderator picked.
    const after = await readTarget()
    expect(after.photo_url, 'the upload must leave a stored url on the row').not.toBeNull()
    expect(after.photo_url!).toContain('/storage/v1/object/public/place-photos/')
    expect(after.photo_source_url).toBeNull()
    expect(after.photo_license).toBeNull()
    expect(after.photo_author).toBeNull()

    // AND THE STORED OBJECT IS WHAT WE CLAIM: a 1400×700 JPEG (slice 3: the 2:1
    // rectangle the hero renders, not the 1200px square of slice 1), decoded
    // from the bytes the row points at rather than inferred from the encoder's
    // source. The bucket serves `access-control-allow-origin: *`, so this read
    // is a real fetch of the public object.
    const stored = await page.evaluate(async (url: string) => {
      const response = await fetch(url)
      const bitmap = await createImageBitmap(await response.blob())
      return {
        contentType: response.headers.get('content-type'),
        width: bitmap.width,
        height: bitmap.height,
      }
    }, after.photo_url!)
    console.log(
      `[slice3] stored object decoded: ${stored.contentType} ${stored.width}x${stored.height}`,
    )
    expect(stored.contentType).toBe('image/jpeg')
    expect(stored.width).toBe(1400)
    expect(stored.height).toBe(700)
  } finally {
    restoreEnvelope = await setPlacePhotos(snapshot)
    unmoderateEnvelope = await setModerator(userId, false)
  }
  expect(restoreEnvelope.ok, `the restore MUST land: ${restoreEnvelope.output}`).toBe(true)
  expect(unmoderateEnvelope.ok, `the un-elevate MUST land: ${unmoderateEnvelope.output}`).toBe(true)
  expect((await readTarget()).photo_url).toBe(snapshot.photo_url)
})

/**
 * place-photo-crop slice 2 (amended 2026-10-05) — A PASTED LINK STAYS A LINK
 * UNLESS THE MODERATOR FRAMES IT.
 *
 * The founder's cost ruling: *"we should prefer hosting using whoever has
 * already got the image hosted on their link if possible, but then you have the
 * option to — if you need to crop or pan the image — then it gets copied to our
 * database, because otherwise we're going to be paying to serve up every image
 * for everyone."*
 *
 * So this walks BOTH exits of URL mode in one run:
 *   1. Save stores the remote URL verbatim — no fetch, no upload, no new object;
 *   2. Crop or adjust copies the bytes and stores OUR `place-photos` URL.
 *
 * THE DONOR: another seeded row's own `photo_url`. In the live directory that is
 * a `thumb.wikimedia.org` URL, which answers with `image/jpeg` and
 * `access-control-allow-origin: *` — so the copy is same-run, cross-host and
 * CORS-clean, with no host we do not already depend on.
 */
test('a pasted link saves as the remote URL; Crop or adjust stores our own copy (place-photo-crop)', async ({
  page,
}) => {
  const { userId } = readMarkerSession()
  const snapshot = await readTarget()
  const donorUrl = await readDonorUrl()

  const editControl = page.getByTestId(`place-edit-photo-${snapshot.id}`)

  // --- SELF-HEAL, the file's discipline: a killed run skips its `finally`. ---
  const preReset = await setPlacePhotos(snapshot)
  expect(preReset.ok, `the pre-flight row reset must land: ${preReset.output}`).toBe(true)
  const preUnmoderate = await setModerator(userId, false)
  expect(preUnmoderate.ok, `the pre-flight un-elevate must land: ${preUnmoderate.output}`).toBe(
    true,
  )

  let restoreEnvelope: AdminResult | null = null
  let unmoderateEnvelope: AdminResult | null = null
  try {
    const elevate = await setModerator(userId, true)
    expect(elevate.ok, `the elevate call must land: ${elevate.output}`).toBe(true)
    await page.reload()
    await openDirectoryAt(page)
    await expect(editControl).toBeVisible()
    await editControl.click()

    const editor = page.getByTestId('place-photo-editor')
    await expect(editor).toBeVisible()

    // --- EXIT 1: SAVE KEEPS THE LINK. The row must carry the remote URL
    // byte-for-byte, which is the cost rule (and criterion 1). ---
    await editor.getByTestId('photo-url-input').fill(donorUrl)
    await expect(editor.getByTestId('photo-url-preview')).toBeVisible()
    await editor.getByTestId('photo-save-btn').click()
    await expect(editor.getByTestId('photo-admin-done')).toContainText('Photo updated.')
    const savedAsLink = await readTarget()
    expect(savedAsLink.photo_url, 'Save must store the remote URL verbatim').toBe(donorUrl)

    // --- EXIT 2: CROP OR ADJUST COPIES IT, and the row stops pointing at the
    // remote URL (criterion 2). ---
    await editor.getByTestId('photo-url-input').fill(donorUrl)
    await editor.getByTestId('photo-crop-btn').click()

    const cropDialog = page.getByTestId('crop-photo-dialog')
    await expect(cropDialog).toBeVisible()
    await expect(cropDialog).toContainText('The rectangle is what everyone will see.')
    await cropDialog.getByTestId('crop-confirm').click()
    await expect(editor.getByTestId('photo-admin-done')).toContainText('Photo updated.')

    const savedAsCopy = await readTarget()
    expect(savedAsCopy.photo_url, 'the crop must not leave the remote URL on the row').not.toBe(
      donorUrl,
    )
    expect(savedAsCopy.photo_url!).toContain('/storage/v1/object/public/place-photos/')
    // The pasted URL is never written to the provenance column either.
    expect(savedAsCopy.photo_source_url).toBeNull()
  } finally {
    restoreEnvelope = await setPlacePhotos(snapshot)
    unmoderateEnvelope = await setModerator(userId, false)
  }
  expect(restoreEnvelope.ok, `the restore MUST land: ${restoreEnvelope.output}`).toBe(true)
  expect(unmoderateEnvelope.ok, `the un-elevate MUST land: ${unmoderateEnvelope.output}`).toBe(true)
  expect((await readTarget()).photo_url).toBe(snapshot.photo_url)
})

/**
 * place-photo-crop slice 2 — THE REFUSAL BLOCKS THE CROP AND NOTHING ELSE.
 *
 * The link here is the preview server's OWN `/` — a committed, same-origin
 * resource that answers `text/html`, which the crop path must refuse as a
 * non-image. No external host, no network flake, and a real content-type rather
 * than a mocked one.
 *
 * The second half is the point of the amendment: **Save on the same link still
 * succeeds**, because Save never fetches. A refusal costs the moderator the
 * crop, never the save.
 *
 * TWO KINDS OF REFUSAL, because they arrive as different sentences: a host the
 * browser cannot reach at all (`.invalid` is reserved by RFC 2606 and never
 * resolves, so `fetch` REJECTS — the CORS/offline branch, whose message has to
 * name the way out), and a host that answers with something that is not an image.
 */
test('a refused fetch is reported and blocks only the crop; Save on the same link still works (place-photo-crop)', async ({
  page,
}) => {
  const { userId } = readMarkerSession()
  const snapshot = await readTarget()

  const editControl = page.getByTestId(`place-edit-photo-${snapshot.id}`)

  const preReset = await setPlacePhotos(snapshot)
  expect(preReset.ok, `the pre-flight row reset must land: ${preReset.output}`).toBe(true)
  const preUnmoderate = await setModerator(userId, false)
  expect(preUnmoderate.ok, `the pre-flight un-elevate must land: ${preUnmoderate.output}`).toBe(
    true,
  )

  let restoreEnvelope: AdminResult | null = null
  let unmoderateEnvelope: AdminResult | null = null
  try {
    const elevate = await setModerator(userId, true)
    expect(elevate.ok, `the elevate call must land: ${elevate.output}`).toBe(true)
    await page.reload()
    await openDirectoryAt(page)
    await expect(editControl).toBeVisible()
    await editControl.click()

    const editor = page.getByTestId('place-photo-editor')
    await expect(editor).toBeVisible()

    // --- REFUSAL 1: the host cannot be reached, so `fetch` throws. The message
    // must name the way out. ---
    await editor.getByTestId('photo-url-input').fill('https://example.invalid/park.jpg')
    await editor.getByTestId('photo-crop-btn').click()
    await expect(editor.getByTestId('photo-admin-error')).toContainText(
      "That site wouldn't let us copy the photo",
    )
    await expect(editor.getByTestId('photo-admin-error')).toContainText('Upload a file')
    await expect(page.getByTestId('crop-photo-dialog')).toHaveCount(0)
    expect((await readTarget()).photo_url, 'a refused crop must store nothing').toBe(
      snapshot.photo_url,
    )

    // --- REFUSAL 2: the host answers, with something that is not an image. The
    // link here is the preview server's OWN `/` — committed and same-origin, so
    // the content-type is real rather than mocked. Derived from the page's
    // origin, so this spec does not care which port the private recipe used. ---
    const notAnImage = new URL('/', page.url()).toString()
    await editor.getByTestId('photo-url-input').fill(notAnImage)
    await editor.getByTestId('photo-crop-btn').click()
    await expect(editor.getByTestId('photo-admin-error')).toContainText('not an image')
    await expect(page.getByTestId('crop-photo-dialog')).toHaveCount(0)
    expect((await readTarget()).photo_url, 'a refused crop must store nothing').toBe(
      snapshot.photo_url,
    )

    // --- AND SAVE ON THE SAME LINK STILL WORKS. ---
    await editor.getByTestId('photo-save-btn').click()
    await expect(editor.getByTestId('photo-admin-done')).toContainText('Photo updated.')
    expect((await readTarget()).photo_url).toBe(notAnImage)
  } finally {
    restoreEnvelope = await setPlacePhotos(snapshot)
    unmoderateEnvelope = await setModerator(userId, false)
  }
  expect(restoreEnvelope.ok, `the restore MUST land: ${restoreEnvelope.output}`).toBe(true)
  expect(unmoderateEnvelope.ok, `the un-elevate MUST land: ${unmoderateEnvelope.output}`).toBe(true)
  expect((await readTarget()).photo_url).toBe(snapshot.photo_url)
})

/**
 * place-photo-crop slice 3 (2026-10-05) — THE HERO IS THE SHAPE HE FRAMED.
 *
 * The founder used slice 1's square crop and reported: *"Why is it a square that
 * I'm editing in when what I see for each place is a rectangle? … it doesn't look
 * right in the rectangles when it's done for each place. It is the wrong size."*
 * The hero was `h-48 w-full`, re-measured in the shipped tree: 358×192 at 390px
 * (1.86:1), 664×192 at 768px (3.46:1) and 740×192 at 844px (3.85:1) — the page
 * column is `max-w-md md:max-w-3xl` (App.tsx), so the old box was wide at EVERY
 * width and `object-cover` re-cropped a square upload on every render. (The
 * spec's table records 448×192 at `md`; the live box is measured here instead.)
 *
 * This test pins the FIX on the two surfaces the criterion names, at the two
 * viewports the mobile audit measures (390×664 and 844×390), and it needs no
 * moderator: the slot renders the per-kind illustration when the row carries no
 * photo, and it is the SLOT that owns the aspect. A hero whose box is not 2:1
 * fails here, which is the regression that would silently return.
 *
 * It also asserts NO HORIZONTAL OVERFLOW at both viewports: the hero grew 32px
 * taller at `md` (448/2 = 224 vs the old 192), and the thing that must not happen
 * is a control pushed off the screen sideways.
 */
test('the place page hero is the stored 2:1 rectangle, with no overflow at 390×664 or 844×390 (place-photo-crop slice 3)', async ({
  page,
}) => {
  const snapshot = await readTarget()

  await page.goto(`/place/${snapshot.id}`)
  const slot = page.getByTestId('place-page-photo-slot')
  await expect(slot).toBeVisible()

  for (const viewport of [
    { width: 390, height: 664 },
    { width: 844, height: 390 },
    { width: 768, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    const heroBox = await slot.boundingBox()
    expect(heroBox, `the hero must render a box at ${viewport.width}×${viewport.height}`).not.toBeNull()
    const ratio = heroBox!.width / heroBox!.height
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    console.log(
      `[slice3] hero at ${viewport.width}x${viewport.height}: ${heroBox!.width}x${heroBox!.height} = ${ratio.toFixed(4)}:1 (page overflow ${horizontalOverflow}px)`,
    )
    expect(
      Math.abs(ratio - 2),
      `the hero must be the 2:1 rectangle the moderator framed for, at ${viewport.width}×${viewport.height} (measured ${heroBox!.width}x${heroBox!.height} = ${ratio.toFixed(4)}:1)`,
    ).toBeLessThan(0.02)
    expect(heroBox!.width, 'the hero may not exceed the viewport width').toBeLessThanOrEqual(
      viewport.width,
    )
    expect(
      horizontalOverflow,
      `the page must not scroll sideways at ${viewport.width}×${viewport.height}`,
    ).toBeLessThanOrEqual(0)
  }
})
