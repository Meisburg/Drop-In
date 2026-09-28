/**
 * Regression: the "Duplicate a previous drop-in" picker rows must keep their
 * text inside the pill on a narrow phone.
 *
 * The bug (founder screenshot, 2026-09-27; recurred after an earlier "fix"):
 * the list is `flex flex-col max-h-64 overflow-y-auto`. A flex child defaults
 * to `flex-shrink: 1`, so once the rows' natural height exceeded 256px the
 * container SHRANK each row toward its `min-h-11` floor. A two-line label was
 * then painted into a 44px box and the second line landed outside the pill.
 * `min-h-11` is a floor, not a guard against shrinking — `shrink-0` on the row
 * is the fix. The earlier `w-full`/`min-w-0` changes addressed horizontal
 * overflow only and could never fix this vertical one.
 *
 * WHY THIS SPEC EXISTS AT A PHONE VIEWPORT: at Playwright's default 1280px the
 * long title fits on one line, so the rows never exceed 256px and the shrink
 * never happens. The bug is only observable at a real phone width, which is
 * exactly why prior desktop-only checks stayed green. `test.use` pins 390px.
 *
 * The marker convention is the house one: every seeded title carries
 * `e2e <displayName>`, and the afterEach deletes only THIS marker's playdates
 * (scoped by host_profile_id), so it can never touch real rows.
 */
import { expect, test } from '@playwright/test'
import { computeEndIso, computeStartIso } from '../src/lib/feed'
import {
  localDatePlusDays,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
} from './fixtures'

// A real phone width: long titles wrap to two lines, so the list genuinely
// overflows max-h-64 and flex-shrink would compress the rows if unchecked.
test.use({ viewport: { width: 390, height: 844 } })

test.afterEach(async () => {
  try {
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken, userId } = readMarkerSession()
    await fetch(`${url}/rest/v1/playdates?host_profile_id=eq.${userId}`, {
      method: 'DELETE',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'return=representation',
      },
    })
  } catch (err) {
    console.log(`[dup-overflow cleanup] ${err instanceof Error ? err.message : err}`)
  }
})

test('duplicate picker rows keep their text inside the pill on a narrow phone', async ({ page }) => {
  const marker = readMarkerMeta()
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
  // Six long-titled posts: enough rows (6 × ~92px) to exceed the 256px list.
  const date = localDatePlusDays(1)
  for (let i = 0; i < 6; i++) {
    const res = await fetch(`${url}/rest/v1/playdates`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        host_profile_id: userId,
        title: `e2e ${marker.displayName} overflow ${i} at a deliberately long park name`,
        place: 'E2E Overflow park',
        starts_at: computeStartIso(date, 9 * 60 + i * 30),
        ends_at: computeEndIso(date, 9 * 60 + i * 30, 60),
      }),
    })
    expect(res.ok, `seed ${i} must insert (HTTP ${res.status})`).toBe(true)
  }

  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await page.getByTestId('dup-duplicate').click()
  const rows = page.getByTestId('post-again')
  await expect(rows.first()).toBeVisible()
  expect(await rows.count()).toBe(6)

  // The assertion the earlier desktop-only checks could not make: no row's
  // content is taller than the row itself. Without `shrink-0` the compressed
  // rows report clientHeight 44 / scrollHeight 84 and this fails.
  const overflows = await rows.evaluateAll((els) =>
    els
      .map((el) => ({
        text: (el.textContent ?? '').trim(),
        clientHeight: Math.round(el.getBoundingClientRect().height),
        scrollHeight: el.scrollHeight,
      }))
      .filter((r) => r.scrollHeight > r.clientHeight + 1),
  )
  expect(overflows, `rows whose text overflows the pill: ${JSON.stringify(overflows)}`).toEqual([])
})
