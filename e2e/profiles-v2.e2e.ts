/**
 * Spec (V2 ticket 02, re-homed by V13 ticket 01): the marker's rich profile.
 * On /profile the marker saves their own parent card (name + a short "About me")
 * + a kid row (first name + age ONLY — the privacy pin, max 5 app-enforced) and
 * sees both on /u/<handle>. V15 T07 removed the /settings nudge banner ("Finish
 * your profile" / "Still to add: ...") — this spec no longer asserts it.
 * V27: the account-level bio field is gone; the parent card's "About me" is the
 * one place a parent writes about themself, saved with the card's own button.
 *
 * Cleanup (best-effort per ticket, e2e-<epoch> marker prefix so the
 * orchestrator's sweep picks stragglers up): the marker's kid rows and parent
 * cards are deleted via REST with the marker's own JWT. A failure here is
 * logged, not fatal.
 */
import { expect, test } from '@playwright/test'
import { kidLabel } from '../src/lib/feed'
import { readMarkerMeta, readMarkerSession, readSupabaseEnv, settleOnRoute, openProfileEditor } from './fixtures'

const KID_AGE = 7

async function markerRest(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  return fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

test('marker saves a parent card + kid row, sees them on /u/<handle>', async ({ page }) => {
  const marker = readMarkerMeta()
  const about = `E2E about me — ${marker.displayName}, parks and snacks`
  const kidName = `e2e ${marker.displayName}`

  // A deterministic starting point: no leftover parent cards from other specs.
  await markerRest('DELETE', `parent_cards?profile_id=eq.${readMarkerSession().userId}`)

  // V13 ticket 01: the profile editor MOVED from /settings to /profile (the
  // now-editable "what other families see" view). V20 t01: /profile opens on the
  // READ view, so the editor is behind the Edit profile toggle.
  await page.goto('/profile')
  await openProfileEditor(page)

  // V27: the parent's own words are the CARD's "About me" (the account-level bio
  // field is gone). The card saves with its own button — not autosave.
  await page.getByTestId('parent-name-1').fill(marker.displayName)
  await page.getByTestId('parent-about-1').fill(about)
  await page.getByTestId('parent-save-1').click()
  await expect(page.getByTestId('parent-save-1')).toHaveText('Saved')

  // Kid row: first name + age ONLY (no full names, no gender — privacy pin).
  await page.getByPlaceholder('First name').fill(kidName)
  await page.getByPlaceholder('Age').fill(String(KID_AGE))
  await page.getByRole('button', { name: 'Add kid', exact: true }).click()
  // The row is editable IN PLACE, so the kid's values live in the row's own
  // fields rather than in a "{name} · {age}" text line. The assertion is the
  // same fact — the kid stands on /profile with that name and that age — read
  // off those fields. The /u/<handle> render below is still the static text
  // line.
  const kidRow = page.getByTestId('kid-row-editor').first()
  await expect(kidRow.getByTestId('kid-name')).toHaveValue(kidName)
  await expect(kidRow.getByTestId('kid-age')).toHaveValue(String(KID_AGE))
  // The row is editable IN PLACE, and editing a field rides the autosave engine.
  // "Add kid" writes immediately, but the always-on note tracks the autosave
  // pass, so nudge the likes line and wait for that pass to land before the
  // /u/<handle> read below (no racing write).
  await kidRow.getByTestId('kid-likes').fill('e2e likes: sand and slides')
  await expect(page.getByTestId('profile-save-note')).toHaveText('Saved.')

  // V15 T07: the /settings nudge banner ("Finish your profile" / "Still to add:
  // a photo.") was removed — assert its ABSENCE as the flip of the old
  // persistence check.
  await page.goto('/settings')
  await settleOnRoute(page, '/settings')
  await expect(page.getByText('Still to add: a photo.')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Add them on your profile page' })).toHaveCount(0)

  // The public face (/u/<handle>) renders the parent row and the kid (first name
  // + age only).
  await page.goto(`/u/${encodeURIComponent(marker.displayName)}`)
  await expect(page.getByText(about)).toBeVisible()
  // V15.2 fix: V15 ticket 05 (A13) made `kidLabel` emit "Name · Age 7" — the
  // bare "Name · 7" this asserted is the OLD format, so it could never match.
  // The expectation is built from the app's own seam so it tracks the rule.
  //
  // V25 t09 (the founder's annotation 3) restructured the row's TYPE, not its
  // TEXT: the name and the age are now separate elements with separate styling,
  // but adjacent, and the split concatenates to exactly this string (the
  // round-trip is pinned in src/lib/feed.test.ts). So this assertion stays
  // EXACTLY as it was and still passes — which is the point: the privacy fact
  // it pins ("first name · Age 7", never "Name · 7") cannot drift with a styling
  // change.
  await expect(page.getByText(kidLabel(kidName, KID_AGE), { exact: true })).toBeVisible()

  // The parent card persists into the editor, re-seeded from the saved row.
  await page.goto('/profile')
  await openProfileEditor(page)
  await expect(page.getByTestId('parent-about-1')).toHaveValue(about)
})

test.afterEach(async () => {
  // Best-effort cleanup (per ticket): the marker's kid rows + parent cards, via
  // the marker's own JWT (owner policies). Logged, never fatal.
  try {
    const { userId } = readMarkerSession()
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken } = readMarkerSession()
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
    await fetch(`${url}/rest/v1/parent_cards?profile_id=eq.${userId}`, {
      method: 'DELETE',
      headers,
    })
    console.log(`[e2e cleanup] ok — deleted ${kids.length} marker kid row(s) and parent cards`)
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${
        err instanceof Error ? err.message : err
      } — orchestrator sweep (e2e- prefix) will pick stragglers up`,
    )
  }
})