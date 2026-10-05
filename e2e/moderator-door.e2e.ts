import { expect, test } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { readMarkerSession } from './fixtures'

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
 * HOW THE MODERATOR HALF IS TESTED, and why it is not a mock: the marker is an
 * ordinary parent, so the spec ELEVATES it, reloads so the session's profile
 * carries the flag, asserts, and RESTORES the flag — asserting the restore,
 * because a spec that left the marker a moderator would change the behaviour of
 * every spec that runs after it.
 *
 * WHY THIS USES THE HEADLESS SQL PATH rather than `runLiveSql` (the
 * `polish.e2e.ts` helper): `runLiveSql` shells out to `apply-migration.mjs`,
 * which harvests its token from a **CDP-attached Chrome on :9222** — and on
 * this machine that port belongs to a human's own desktop session. It is also
 * simply unavailable when nothing is listening there (measured:
 * `connectOverCDP ECONNREFUSED 127.0.0.1:9222`). `scripts/db-sql.sh` talks to
 * the management API with `SUPABASE_ACCESS_TOKEN` and needs no browser at all,
 * so this spec runs anywhere the repo's own migration tooling runs.
 */
function markModerator(userId: string, enabled: boolean): { ok: boolean; output: string } {
  const sql = `update public.profiles set moderators = ${enabled} where id = '${userId}';`
  const result = spawnSync('bash', ['scripts/db-sql.sh', sql], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 120_000,
  })
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  }
}

test('the moderator door is there for a moderator and never for a parent (v30-7)', async ({
  page,
}) => {
  const { userId } = readMarkerSession()
  const door = page.getByTestId('moderator-tools-link')

  // --- HALF 1 — an ordinary parent sees no moderator control at all. ---
  await page.goto('/settings')
  await expect(page.getByTestId('account-sign-out')).toBeVisible()
  await expect(door).toHaveCount(0)

  let restore: { ok: boolean; output: string } | null = null
  try {
    // --- HALF 2 — elevate, reload, and the door appears. ---
    const elevate = markModerator(userId, true)
    expect(elevate.ok, `the elevate SQL must land: ${elevate.output}`).toBe(true)

    await page.reload()
    await expect(door).toBeVisible()
    await door.click()

    // It opens the EXISTING tools: the route guard and the database remain the
    // authority, and the tool that was invisible is the one already shipped.
    await expect(page).toHaveURL(/\/mod$/)
    await expect(page.getByTestId('place-photo-tool-toggle')).toContainText('Fix a place photo')
  } finally {
    // The restore runs whatever happened above, and it must not throw here —
    // a throwing `finally` would replace the real failure with its own.
    restore = markModerator(userId, false)
  }
  expect(restore.ok, `the restore SQL MUST land: ${restore.output}`).toBe(true)

  // --- The restore is REAL: on a fresh load, the door is gone again. ---
  await page.goto('/settings')
  await expect(page.getByTestId('account-sign-out')).toBeVisible()
  await expect(door).toHaveCount(0)
})
