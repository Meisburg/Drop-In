/**
 * Spec (V2 ticket 02): the marker's rich profile. On /profile the marker
 * saves a bio (<= 500 chars) + a kid row (first name + age ONLY — the
 * privacy pin, max 5 app-enforced) and sees both on /u/<handle>; the
 * /profile nudge banner persists while the photo is still missing.
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

  await page.goto('/profile')
  await settleOnRoute(page, '/profile')

  // Bio: the /profile editor (app-capped at 500 chars, the 0011 CHECK is
  // the DB backstop).
  await page.getByPlaceholder('A few words about your family (optional)').fill(bio)
  await page.getByRole('button', { name: 'Save bio', exact: true }).click()
  await expect(page.getByText('Bio saved.')).toBeVisible()

  // Kid row: first name + age ONLY (no full names, no gender — privacy pin).
  await page.getByPlaceholder('First name').fill(kidName)
  await page.getByPlaceholder('Age').fill(String(KID_AGE))
  await page.getByRole('button', { name: 'Add kid', exact: true }).click()
  await expect(page.getByText(`${kidName} · ${KID_AGE}`, { exact: true })).toBeVisible()

  // The nudge banner persists while the photo is still missing (it is —
  // this spec never uploads one).
  await expect(page.getByText('Still to add: a photo.')).toBeVisible()

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