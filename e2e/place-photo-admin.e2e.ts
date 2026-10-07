import { expect, test } from '@playwright/test'
import {
  readMarkerSession,
  readPlaceByName,
  setDirectoryRadius,
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
 * v33-2 — THE PANEL IS ONE STEP NOW: the mode picker is gone, the file picker
 * renders first and opens the crop dialog directly, "or paste a link" is a plain
 * field, and `photo-edit-current-btn` re-frames the stored photo through the
 * existing fetch path. This file's flows were updated in the same diff: the
 * upload test no longer clicks a mode button, and the new tests below prove the
 * one-step panel and the Edit photo control end to end (each reading the row
 * back from the live DB).
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

/**
 * The public-URL prefix every stored place photo carries: the app builds the URL
 * at runtime, so this literal has no shared constant to import — it lives here,
 * once, and every assertion in this file uses it.
 */
const PLACE_PHOTOS_PUBLIC_PREFIX = '/storage/v1/object/public/place-photos/'

/** The seeded row this spec edits (it currently carries NO photo). */
async function readTarget(): Promise<PlacePhotoRow> {
  return readPlaceByName(PLACE_NAME)
}

/** The donor row's own stored photo (one read, one guard, one error string). */
async function readDonor(): Promise<PlacePhotoRow> {
  const donor = await readPlaceByName(DONOR_PLACE)
  if (donor.photo_url === null) {
    throw new Error(`the donor row ${DONOR_PLACE} must carry a seeded photo`)
  }
  return donor
}

/** The donor row's own stored photo URL, fetched through the app's fetch path. */
async function readDonorUrl(): Promise<string> {
  const donor = await readDonor()
  return donor.photo_url
}

/**
 * Land on /browse with the radius widened and the target row on screen.
 *
 * `search` defaults to the edited place's name. The slice-4 scroll test passes a
 * BROAD term instead, because proving "the changed card is brought back into
 * view" needs a page that can actually scroll the card off screen first — a
 * one-row list is not a measurement.
 *
 * V31 map-and-distance: the radius is set through the LOCATION control (the
 * distance pill is deleted, and the modal's radius now ceilings the list too —
 * `fixtures.setDirectoryRadius`).
 */
async function openDirectoryAt(
  page: import('@playwright/test').Page,
  search: string = PLACE_NAME,
) {
  await page.goto('/browse')
  await setDirectoryRadius(page)
  await page.getByTestId('places-search').fill(search)
  await expect(page.getByTestId('places-list')).toBeVisible()
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
    // place-photo-crop slice 4: there is ONE action in URL mode, and it opens the
    // crop step — the "Crop or adjust" button is gone from the DOM (criterion 1).
    await expect(editor.getByTestId('photo-crop-btn')).toHaveCount(0)
    await editor.getByTestId('photo-url-input').fill(donorUrl)
    await editor.getByTestId('photo-save-btn').click()

    // The link is copied and framed: the crop dialog opens on the fetched image
    // and confirming IS the save.
    const cropDialog = page.getByTestId('crop-photo-dialog')
    await expect(cropDialog).toBeVisible()
    await cropDialog.getByTestId('crop-confirm').click()

    // FINISHING CLOSES THE EDITOR — the dialog's test id is gone, rather than a
    // "Photo updated." line being rendered inside it.
    await expect(page.getByTestId('place-photo-editor')).toHaveCount(0)
    // A framed copy is the outcome we wanted, so there is no notice to read.
    await expect(page.getByTestId('place-photo-notice')).toHaveCount(0)

    // THE COPY IS OURS: the row no longer points at the donor's URL.
    const after = await readTarget()
    expect(after.photo_url, 'the crop must store our own object').toContain(
      PLACE_PHOTOS_PUBLIC_PREFIX,
    )
    expect(after.photo_url).not.toBe(donorUrl)

    // The host re-read behind the closed dialog, so the card shows the new
    // picture — this row had NO photo before, so an <img> here is the save
    // reaching the screen.
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

    // place-photo-crop slice 4: the one action opens the crop step, and the
    // dialog's confirm closes the editor on the PLACE PAGE too.
    const cropDialog = page.getByTestId('crop-photo-dialog')
    await expect(cropDialog).toBeVisible()
    await cropDialog.getByTestId('crop-confirm').click()
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

    // --- AND THE PLACE PAGE'S OTHER OUTCOME (slice 4, changes 1 and 3): a host
    // that refuses the copy stores the link, the editor closes, one sentence says
    // so, and the HERO is brought back into view on this door too.
    await control.click()
    const secondEditor = page.getByTestId('place-photo-editor')
    await expect(secondEditor).toBeVisible()
    // Scroll the hero off screen WHILE the editor is open (a programmatic scroll
    // still moves an `overflow: hidden` viewport), so "it came back into view"
    // is a measurement rather than a coincidence.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const viewport = page.viewportSize()!
    const slot = page.getByTestId('place-page-photo-slot')
    const slotBefore = await slot.boundingBox()
    expect(slotBefore, 'the hero must render a box').not.toBeNull()
    expect(
      slotBefore!.y >= viewport.height || slotBefore!.y + slotBefore!.height <= 0,
      `the hero must be OFF screen before the save (y=${slotBefore!.y}, h=${slotBefore!.height}, viewport=${viewport.height})`,
    ).toBe(true)

    await secondEditor.getByTestId('photo-url-input').fill('https://example.invalid/hero.jpg')
    await secondEditor.getByTestId('photo-save-btn').click()
    await expect(page.getByTestId('place-photo-editor')).toHaveCount(0)
    await expect(page.getByTestId('place-photo-notice')).toContainText('We saved the link instead.')
    expect(
      (await readTarget()).photo_url,
      'a refused copy on the place page still saves the link',
    ).toBe('https://example.invalid/hero.jpg')

    await expect(async () => {
      const box = await slot.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.y, `the hero must be back in view (y=${box!.y})`).toBeGreaterThanOrEqual(0)
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
    }).toPass({ timeout: 10_000 })
    console.log(`[slice4] place page hero scrolled back into view at y=${(await slot.boundingBox())!.y}`)
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
    // A WIDE search: this test has to be able to scroll the target card OFF
    // screen to prove the save brings it back (criterion 5). "Park" matches many
    // seeded rows, so the target is not the whole list.
    await openDirectoryAt(page, 'Park')
    await expect(editControl).toBeVisible()
    await editControl.click()

    const editor = page.getByTestId('place-photo-editor')
    await expect(editor).toBeVisible()

    // --- CANCEL FIRST (criterion 2): the file picker opens the crop dialog
    // DIRECTLY (v33-2: no mode step), the moderator backs out, and the row is
    // left exactly as it was — no upload, no URL, no error. ---
    await editor.getByTestId('photo-file-input').setInputFiles('public/pwa-192x192.png')
    const cancelled = page.getByTestId('crop-photo-dialog')
    await expect(cancelled).toBeVisible()
    await cancelled.getByTestId('crop-cancel').click()
    await expect(cancelled).toHaveCount(0)
    expect(await readTarget(), 'a cancelled crop must leave all five columns alone').toEqual(
      snapshot,
    )
    // Cancelling the CROP leaves the EDITOR open — only a completed save closes
    // it (slice 4, change 2), and nothing at all was written.
    await expect(editor).toBeVisible()
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

    // --- SCROLL THE CHANGED PLACE AWAY BEFORE SAVING (slice 4, criterion 5).
    // The founder: *"Ideally, it would show you that place automatically so you
    // don't have to scroll down and find it, but whatever."* Proving it needs the
    // card OFF screen first, or "it is in the viewport" is true by accident. The
    // card is named as one box (`place-card-<id>`, added for this measurement).
    const card = page.getByTestId(`place-card-${snapshot.id}`)
    const viewport = page.viewportSize()!
    const offScreen = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
      return window.scrollY
    })
    expect(offScreen, 'the directory must be scrollable for this measurement to mean anything').toBeGreaterThan(0)
    const escaped = await card.boundingBox()
    expect(escaped, 'the card must render a box').not.toBeNull()
    expect(
      escaped!.y >= viewport.height || escaped!.y + escaped!.height <= 0,
      `the card must be OUT of the viewport before the save (y=${escaped!.y}, h=${escaped!.height}, viewport=${viewport.height})`,
    ).toBe(true)

    // The dialog's confirm IS the save — there is no separate upload step.
    await cropDialog.getByTestId('crop-confirm').click()
    await expect(cropDialog).toHaveCount(0)
    // FINISHING CLOSES THE EDITOR (slice 4, change 2): the test id is GONE, which
    // is the assertion criterion 2 asks for rather than a confirmation line.
    await expect(page.getByTestId('place-photo-editor')).toHaveCount(0)

    // --- AND THE CHANGED CARD COMES BACK INTO VIEW. `scrollIntoView` animates
    // (unless the viewer asked for reduced motion), so this polls rather than
    // measuring mid-flight: the whole card must be inside the viewport.
    await expect(async () => {
      const box = await card.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.y, `the changed card must be in the viewport (y=${box!.y})`).toBeGreaterThanOrEqual(0)
      expect(
        box!.y + box!.height,
        `the changed card must be inside the viewport (bottom=${box!.y + box!.height}, viewport=${viewport.height})`,
      ).toBeLessThanOrEqual(viewport.height)
    }).toPass({ timeout: 10_000 })
    console.log(`[slice4] changed card scrolled back into view at y=${(await card.boundingBox())!.y}`)

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
 * place-photo-crop slice 4 (2026-10-05) — ONE PRIMARY ACTION, AND IT FRAMES.
 *
 * The founder, after using slices 1–3: *"I don't think we need a crop or adjust
 * button anymore here. Basically, just when you click upload a file, it should
 * just automatically give you the option to crop or adjust and then … when you're
 * finished, this fix up place photo modal should disappear and the photo will
 * just be populated on the place now."*
 *
 * So this is the old two-exit test collapsed to the one flow that replaced it:
 * paste a link → the ONE primary button → the crop dialog opens on the FETCHED
 * image → confirm → the row carries OUR `place-photos` object and the editor is
 * GONE. The link-first half of the old test did not disappear, it moved: it is
 * now the refusal fallback, and the next test proves it.
 *
 * THE DONOR: another seeded row's own `photo_url`. In the live directory that is
 * a `thumb.wikimedia.org` URL, which answers with `image/jpeg` and
 * `access-control-allow-origin: *` — so the copy is same-run, cross-host and
 * CORS-clean, with no host we do not already depend on.
 */
test('a pasted link is copied and framed by the one primary action, and the editor closes (place-photo-crop slice 4)', async ({
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

    // --- PASTE, PREVIEW, AND THE ONE BUTTON. The preview still appears as the
    // link is typed (the moderator has to see the picture to judge the framing),
    // and there is no second action to choose between (criterion 1). ---
    await editor.getByTestId('photo-url-input').fill(donorUrl)
    await expect(editor.getByTestId('photo-url-preview')).toBeVisible()
    await expect(editor.getByTestId('photo-crop-btn')).toHaveCount(0)
    await editor.getByTestId('photo-save-btn').click()

    // --- THE CROP DIALOG OPENS ON THE FETCHED IMAGE. `windowShape` is
    // `PLACE_PHOTO_SIZE`, so it is the rectangle variant and says so. ---
    const cropDialog = page.getByTestId('crop-photo-dialog')
    await expect(cropDialog).toBeVisible()
    await expect(cropDialog).toContainText('The rectangle is what everyone will see.')
    await cropDialog.getByTestId('crop-confirm').click()

    // --- CONFIRMING STORES OUR COPY AND CLOSES THE EDITOR (criterion 2: the
    // editor's test id is GONE, not merely a confirmation rendered). ---
    await expect(page.getByTestId('place-photo-editor')).toHaveCount(0)
    await expect(page.getByTestId('place-photo-notice')).toHaveCount(0)

    const savedAsCopy = await readTarget()
    expect(savedAsCopy.photo_url, 'the copy must not leave the remote URL on the row').not.toBe(
      donorUrl,
    )
    expect(savedAsCopy.photo_url!).toContain('/storage/v1/object/public/place-photos/')
    // The pasted URL is never written to the provenance column either.
    expect(savedAsCopy.photo_source_url).toBeNull()
    // And the card shows it, from the host's own re-read.
    await expect(page.getByTestId(`place-photo-${snapshot.id}`)).toBeVisible({ timeout: 15_000 })
  } finally {
    restoreEnvelope = await setPlacePhotos(snapshot)
    unmoderateEnvelope = await setModerator(userId, false)
  }
  expect(restoreEnvelope.ok, `the restore MUST land: ${restoreEnvelope.output}`).toBe(true)
  expect(unmoderateEnvelope.ok, `the un-elevate MUST land: ${unmoderateEnvelope.output}`).toBe(true)
  expect((await readTarget()).photo_url).toBe(snapshot.photo_url)
})

/**
 * place-photo-crop slice 4 — A REFUSED COPY STORES THE LINK AND SAYS SO.
 *
 * This is slice 2's cost ruling, which slice 4 did NOT repeal: *"we should prefer
 * hosting using whoever has already got the image hosted on their link if
 * possible … otherwise we're going to be paying to serve up every image for
 * everyone."* The framing cannot be done (the bytes cannot be read), so the
 * remote URL is stored by the SAME tap, the editor closes, and one sentence tells
 * the moderator why the picture they just saved cannot be framed.
 *
 * TWO KINDS OF REFUSAL, because they arrive as different sentences: a host the
 * browser cannot reach at all (`.invalid` is reserved by RFC 2606 and never
 * resolves, so `fetch` REJECTS — the CORS/offline branch, whose reason has to
 * name the way out), and a host that answers with something that is not an image
 * (the preview server's OWN `/` — committed and same-origin, so the content-type
 * is real rather than mocked; derived from the page's origin so this spec does not
 * care which port the private recipe used).
 */
test('a refused copy stores the remote link, closes the editor, and says why (place-photo-crop slice 4)', async ({
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

    // --- REFUSAL 1: the host cannot be reached, so `fetch` throws. The link is
    // STORED, the editor CLOSES, and the notice names the outcome before the
    // reason ("we saved the link instead"), then keeps the reason's way out. ---
    await editor.getByTestId('photo-url-input').fill('https://example.invalid/park.jpg')
    await editor.getByTestId('photo-save-btn').click()
    await expect(page.getByTestId('place-photo-editor')).toHaveCount(0)
    await expect(page.getByTestId('crop-photo-dialog')).toHaveCount(0)

    const notice = page.getByTestId('place-photo-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('We saved the link instead.')
    await expect(notice).toContainText("That site wouldn't let us copy the photo")
    await expect(notice).toContainText('Upload a file')

    const afterRefusal = await readTarget()
    expect(
      afterRefusal.photo_url,
      'a refused copy must still leave the moderator with the photo they pasted',
    ).toBe('https://example.invalid/park.jpg')
    expect(afterRefusal.photo_source_url, 'the pasted URL never enters provenance').toBeNull()
    // NOTHING IS STORED TWICE: the row carries the remote URL itself, so the
    // fallback did not also upload a `place-photos` object behind it.
    expect(afterRefusal.photo_url).not.toContain('/place-photos/')

    // --- REFUSAL 2: the host answers, with something that is not an image. ---
    await editControl.click()
    await expect(editor).toBeVisible()
    const notAnImage = new URL('/', page.url()).toString()
    await editor.getByTestId('photo-url-input').fill(notAnImage)
    await editor.getByTestId('photo-save-btn').click()
    await expect(page.getByTestId('place-photo-editor')).toHaveCount(0)
    await expect(page.getByTestId('crop-photo-dialog')).toHaveCount(0)
    await expect(notice).toContainText('We saved the link instead.')
    await expect(notice).toContainText('not an image')
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
 * v33-2 — THE ONE-STEP PANEL: file picker first, link as a field, no mode step.
 *
 * Founder annotation muyfsjwv: *"Clicking this button should just launch the
 * image upload module. There shouldn't be an extra step. This should also be the
 * priority option, so it should be shown first and then alternatively, it should
 * be like 'or paste a link'. And instead of a button, you just have a place to
 * paste it."* So opening the panel shows the file picker FIRST (it sits above the
 * link field in the DOM), the mode buttons are GONE from the DOM entirely, and
 * "Or paste a link" is an input visible without any prior interaction.
 */
test('the photo panel is one step: file picker first, link as a field, no mode step (v33-2)', async ({
  page,
}) => {
  const { userId } = readMarkerSession()
  const snapshot = await readTarget()

  const editControl = page.getByTestId(`place-edit-photo-${snapshot.id}`)

  // --- SELF-HEAL, same discipline as every test in this file. ---
  const preReset = await setPlacePhotos(snapshot)
  expect(preReset.ok, `the pre-flight row reset must land: ${preReset.output}`).toBe(true)
  const preUnmoderate = await setModerator(userId, false)
  expect(preUnmoderate.ok, `the pre-flight un-elevate must land: ${preUnmoderate.output}`).toBe(true)

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

    // NO MODE SELECTION STEP ANYWHERE: both old controls are gone from the DOM.
    await expect(editor.getByTestId('photo-mode-url')).toHaveCount(0)
    await expect(editor.getByTestId('photo-mode-upload')).toHaveCount(0)

    // THE FILE PICKER IS FIRST AND PRESENTED AS THE PRIORITY: it renders before
    // the link field in the panel's own column order.
    const fileInput = editor.getByTestId('photo-file-input')
    const urlInput = editor.getByTestId('photo-url-input')
    await expect(fileInput).toBeVisible()
    await expect(urlInput).toBeVisible()
    const fileBox = await fileInput.boundingBox()
    const urlBox = await urlInput.boundingBox()
    expect(fileBox, 'the file picker must render a box').not.toBeNull()
    expect(urlBox, 'the link field must render a box').not.toBeNull()
    expect(
      fileBox!.y,
      'the file picker must sit ABOVE the link field',
    ).toBeLessThan(urlBox!.y)

    // "OR PASTE A LINK" IS A FIELD, NOT A BUTTON: an <input>, visible without
    // any prior interaction.
    await expect(urlInput).toHaveAttribute('type', 'url')
  } finally {
    restoreEnvelope = await setPlacePhotos(snapshot)
    unmoderateEnvelope = await setModerator(userId, false)
  }
  expect(restoreEnvelope.ok, `the restore MUST land: ${restoreEnvelope.output}`).toBe(true)
  expect(unmoderateEnvelope.ok, `the un-elevate MUST land: ${unmoderateEnvelope.output}`).toBe(true)
})

/**
 * v33-2 — EDIT PHOTO RE-FRAMES THE STORED IMAGE THROUGH THE EXISTING FETCH PATH.
 *
 * Founder annotation muyfsxah: *"I would want an edit photo button somewhere."*
 * The control exists inside the panel exactly when a photo is already stored:
 * `photo-edit-current-btn`, labelled "Edit photo", opens the crop dialog on the
 * CURRENT stored photo by running the SAME fetch path the link save uses
 * (`fetchPlacePhotoFile` on `place.photo_url`) — no second fetch, no second save
 * path. Confirming writes the row; its click must not trigger Remove.
 *
 * THE DONOR ROW CARRIES A PHOTO ALREADY, so the panel opens with the control
 * present — no write needed to reach the state.
 */
test('Edit photo re-crops the stored photo through the existing fetch path (v33-2)', async ({
  page,
}) => {
  const { userId } = readMarkerSession()
  const donor = await readDonor()

  const editControl = page.getByTestId(`place-edit-photo-${donor.id}`)

  const preReset = await setPlacePhotos(donor)
  expect(preReset.ok, `the pre-flight row reset must land: ${preReset.output}`).toBe(true)
  const preUnmoderate = await setModerator(userId, false)
  expect(preUnmoderate.ok, `the pre-flight un-elevate must land: ${preUnmoderate.output}`).toBe(true)

  let restoreEnvelope: AdminResult | null = null
  let unmoderateEnvelope: AdminResult | null = null
  try {
    const elevate = await setModerator(userId, true)
    expect(elevate.ok, `the elevate call must land: ${elevate.output}`).toBe(true)
    await openDirectoryAt(page, DONOR_PLACE)
    await expect(editControl).toBeVisible()
    await editControl.click()

    const editor = page.getByTestId('place-photo-editor')
    await expect(editor).toBeVisible()

    // THE CONTROL EXISTS BECAUSE A PHOTO IS STORED, IS LABELLED "EDIT PHOTO",
    // AND IS DISTINCT FROM REMOVE.
    const editBtn = editor.getByTestId('photo-edit-current-btn')
    await expect(editBtn).toBeVisible()
    await expect(editBtn).toHaveText('Edit photo')
    await expect(editor.getByTestId('photo-clear-btn')).toBeVisible()

    // OPENING THE CROP DIALOG ON THE STORED IMAGE: the same fetch path the link
    // save uses, so the dialog appears on the decoded stored photo.
    await editBtn.click()
    const cropDialog = page.getByTestId('crop-photo-dialog')
    await expect(cropDialog).toBeVisible()
    await cropDialog.getByTestId('crop-confirm').click()

    // CONFIRMING WRITES THE ROW: read it back from the live DB — the row now
    // points at OUR OWN object, not at the donor's remote URL.
    await expect(page.getByTestId('place-photo-editor')).toHaveCount(0)
    const after = await readPlaceByName(DONOR_PLACE)
    expect(after.photo_url, 'Edit photo must store our own framed copy').toContain(
      PLACE_PHOTOS_PUBLIC_PREFIX,
    )
    expect(after.photo_url).not.toBe(donor.photo_url)

    // ITS CLICK DID NOT TRIGGER REMOVE: the row still carries a photo.
    expect(after.photo_url).not.toBeNull()
  } finally {
    restoreEnvelope = await setPlacePhotos(donor)
    unmoderateEnvelope = await setModerator(userId, false)
  }
  expect(restoreEnvelope.ok, `the restore MUST land: ${restoreEnvelope.output}`).toBe(true)
  expect(unmoderateEnvelope.ok, `the un-elevate MUST land: ${unmoderateEnvelope.output}`).toBe(true)
  expect((await readPlaceByName(DONOR_PLACE)).photo_url).toBe(donor.photo_url)
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
