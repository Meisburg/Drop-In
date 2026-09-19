/**
 * Spec (V2 ticket 02, re-homed by V13 ticket 01): the marker's rich profile.
 * On /profile the marker saves a bio (<= 500 chars) + a kid row (first name +
 * age ONLY — the privacy pin, max 5 app-enforced) and sees both on
 * /u/<handle>; the /settings nudge banner persists while the photo is still
 * missing.
 *
 * Cleanup (best-effort per ticket, e2e-<epoch> marker prefix so the
 * orchestrator's sweep picks stragglers up): the marker's kid rows are
 * deleted and the bio nulled via REST with the marker's own JWT (the
 * owner-only kids DELETE + profiles UPDATE policies from 0011). A failure
 * here is logged, not fatal.
 */
import { expect, test } from '@playwright/test'
import { readMarkerMeta, readMarkerSession, readSupabaseEnv, settleOnRoute } from './fixtures'

const KID_AGE = 7

test('marker saves a bio + kid row, sees them on /u/<handle>, nudge stays for the photo', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const bio = `E2E bio — ${marker.displayName}, friendly family`
  const kidName = `e2e ${marker.displayName}`

  // V13 ticket 01: the bio + kid editor MOVED from /settings to /profile
  // (the now-editable "what other families see" view). The autosave machine
  // is the same V12 t01 engine — no save control anywhere on /profile either,
  // so the typed bio lands on its own after the debounce settles and the
  // always-on indicator says "Saved."
  await page.goto('/profile')
  await settleOnRoute(page, '/profile')

  // Bio: the /profile "About the parents" field (app-capped at 500 chars, the
  // 0011 CHECK is the DB backstop). Located by its placeholder (the house
  // pattern for a textarea with no testid).
  await page.getByPlaceholder('Who’s in your family, and what are you into? (optional)').fill(bio)
  await expect(page.getByTestId('profile-save-note')).toHaveText('Saved.')

  // Kid row: first name + age ONLY (no full names, no gender — privacy pin).
  await page.getByPlaceholder('First name').fill(kidName)
  await page.getByPlaceholder('Age').fill(String(KID_AGE))
  await page.getByRole('button', { name: 'Add kid', exact: true }).click()
  // The row is editable IN PLACE, so the kid's values live in the row's own
  // fields rather than in a "{name} · {age}" text line. The assertion is the
  // same fact — the kid stands on /profile with that name and that age — read
  // off those fields. The /u/<handle> render below is still the static text
  // line.
  const kidRow = page.getByTestId('kid-row').first()
  await expect(kidRow.getByTestId('kid-name')).toHaveValue(kidName)
  await expect(kidRow.getByTestId('kid-age')).toHaveValue(String(KID_AGE))
  // The row's write rides the same autosave engine — wait for it to land so
  // the /u/<handle> read below sees the new row (not a racing write).
  await expect(page.getByTestId('profile-save-note')).toHaveText('Saved.')

  // The nudge banner persists while the photo is still missing (it is —
  // this spec never uploads one). It lives on /settings (the count-only
  // kids read + the missingProfileItems seam), not on /profile. V13 ticket 01:
  // the banner now links to /profile where the photo controls live.
  await page.goto('/settings')
  await settleOnRoute(page, '/settings')
  await expect(page.getByText('Still to add: a photo.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add them on your profile page' })).toBeVisible()

  // The public face (/u/<handle>) renders the bio + the kid (first name +
  // age only).
  await page.goto(`/u/${encodeURIComponent(marker.displayName)}`)
  await expect(page.getByText(bio)).toBeVisible()
  await expect(page.getByText(`${kidName} · ${KID_AGE}`, { exact: true })).toBeVisible()
})

test.afterEach(async () => {
  // Best-effort cleanup (per ticket): the marker's kid rows + bio, via the
  // marker's own JWT (owner policies). Logged, never fatal.
  try {
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken, userId } = readMarkerSession()
    const headers: Record<string, string> = {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    }
    const kidsQ = `${url}/rest/v1/kids?profile_id=eq.${userId}&select=id`
    const kidsRes = await fetch(kidsQ, { headers })
    const kids = kidsRes.ok ? ((await kidsRes.json()) as Array<{ id: string }>) : []
    for (const kid of kids) {
      await fetch(`${url}/rest/v1/kids?id=eq.${kid.id}&profile_id=eq.${userId}`, {
        method: 'DELETE',
        headers,
      })
    }
    await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ bio: null }),
    })
    console.log(`[e2e cleanup] ok — deleted ${kids.length} marker kid row(s), bio nulled`)
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${
        err instanceof Error ? err.message : err
      } — orchestrator sweep (e2e- prefix) will pick stragglers up`,
    )
  }
})