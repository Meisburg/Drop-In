import { expect, test } from '@playwright/test'
import { readMarkerSession, setModerator, type AdminResult } from './fixtures'

/**
 * v30-7 (founder annotation 5) — THE MODERATOR DOOR IN SETTINGS.
 *
 * The founder reported the place-photo tool as missing: *"I still don't see an
 * option for me to click upload or edit a photo on each place"*. The tool
 * shipped in V28 r4 and was live for his (moderator-flagged) account — the
 * route exists, and NOTHING in the app ever linked to it. This spec pins both
 * halves of the fix: a parent sees no door, a moderator sees one that opens the
 * tools.
 *
 * THE MARKER IS AN ORDINARY PARENT, so the spec ELEVATES it for the second half.
 * Three properties make that safe, and each was an `ocr` finding in v30-10:
 *   1. the flag is reset IDEMPOTENTLY before the first assertion, so a
 *      hard-killed previous run cannot leave the marker elevated and make this
 *      spec fail for a reason that is not its own;
 *   2. the restore runs on EVERY path (catch/`finally`, not a post-`try` line
 *      that a thrown assertion skips);
 *   3. the restore's own result is asserted BEFORE the original failure is
 *      re-thrown, so a failed restore can never be silent — it would change the
 *      behaviour of every spec that runs after this one.
 *
 * WHY THE FLAG IS WRITTEN OVER POSTGREST (`setModerator`): `runLiveSql` shells
 * out to `apply-migration.mjs`, which needs a CDP Chrome on :9222 — a human's
 * desktop session on this machine, and absent in a plain run. v31-5 replaced the
 * management-API path (`SUPABASE_ACCESS_TOKEN`, ACCOUNT-level and absent in CI)
 * with the PROJECT-scoped service-role key, which is read from the repo `.env`
 * exactly as the suite's other values are and never reaches the client bundle.
 */
test('the moderator door is there for a moderator and never for a parent (v30-7)', async ({
  page,
}) => {
  const { userId } = readMarkerSession()
  const door = page.getByTestId('moderator-tools-link')

  // --- SELF-HEAL: start from a known state, whatever a killed run left. ---
  const preReset = await setModerator(userId, false)
  expect(preReset.ok, `the pre-flight reset must land: ${preReset.output}`).toBe(true)

  // --- HALF 1 — an ordinary parent sees no moderator control at all. ---
  await page.goto('/settings')
  await expect(page.getByTestId('account-sign-out')).toBeVisible()
  await expect(door).toHaveCount(0)

  let originalFailure: unknown = null
  let restore: AdminResult | null = null
  try {
    // --- HALF 2 — elevate, reload, and the door appears. ---
    const elevate = await setModerator(userId, true)
    expect(elevate.ok, `the elevate call must land: ${elevate.output}`).toBe(true)

    await page.reload()
    await expect(door).toBeVisible()
    await door.click()

    // It opens the EXISTING tools: the route guard and the database remain the
    // authority, and the tool that was invisible is the one already shipped.
    await expect(page).toHaveURL(/\/mod$/)
    await expect(page.getByTestId('place-photo-tool-toggle')).toContainText('Fix a place photo')
  } catch (error) {
    originalFailure = error
  } finally {
    restore = await setModerator(userId, false)
  }

  // The restore is verified FIRST: it is the one failure that would leak into
  // every later spec, so it may not hide behind the original one.
  expect(restore.ok, `the restore call MUST land: ${restore.output}`).toBe(true)
  if (originalFailure !== null) throw originalFailure

  // --- The restore is REAL: on a fresh load, the door is gone again. ---
  await page.goto('/settings')
  await expect(page.getByTestId('account-sign-out')).toBeVisible()
  await expect(door).toHaveCount(0)
})
