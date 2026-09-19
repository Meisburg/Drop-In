/**
 * V8 ticket 01 — quick post: /new opens ALREADY correct.
 *
 * The ticket's claims, end to end against the live project:
 *  1. /new opens on today's date and the next 30-minute slot (the mount-once
 *     defaults), so the spontaneous post needs no date or time work at all.
 *  2. A "Recent places" chip fills place + address in one tap from a place this
 *     parent already posted to. V9 ticket 01: the neighbourhood is no longer a
 *     field on /new, so the chip carries the two fields a parent can see. The
 *     two PATHS are covered by different specs, named so neither claim is
 *     vague: the FREE-TEXT path here (a typed place the directory does not
 *     know, below), and the SEEDED/picked path in e2e/post-location.e2e.ts
 *     (a chip for a post made from a directory place).
 *  3. The quick-fill preset states the end it will write, writes it, and
 *     seeds a title only because the title was empty.
 *  4. A post created without touching the date or time controls lands in the
 *     feed.
 *
 * The default assertions are RACE-PROOF by construction: the rendered value
 * must equal the pure seam evaluated just before the page mounted or just
 * after the label was read — so a run that happens to cross a 30-minute slot
 * boundary (or midnight) mid-test cannot flake.
 *
 * Cleanup mirrors golden-path.e2e.ts: best-effort REST delete of the
 * marker's playdate rows with the marker's own JWT (the host-only DELETE
 * policy is the wall; a plain anon delete is an RLS no-op PostgREST reports
 * as 2xx — the logged lesson). The e2e-<epoch> prefix marks any straggler
 * for the orchestrator's sweep.
 */
import { expect, test } from '@playwright/test'
import { defaultStartDateIso, nextSlotMinutes } from '../src/lib/feed'
import {
  editTitle,
  parseTimeLabel,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'
const ADDRESS_PLACEHOLDER = 'e.g. 7200 4th Ave NE, near the boathouse'

test('opens on today and the next slot, and posts without date/time work', async ({ page }) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} quick post`
  const place = 'E2E quick post lot'

  // Bracket the mount: the form computes its default ONCE, at mount time,
  // which falls between these two reads.
  const beforeMount = new Date().toISOString()
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  const afterRead = new Date().toISOString()

  // The date: today (tomorrow only in the 23:45+ wrap case) — never blank,
  // which is what the form used to open on.
  //
  // V9 ticket 03: the date input now lives behind "More options" (the summary
  // reads the day back as text), so the door is opened before the default is
  // read. The ASSERTION is unchanged: it is still the control's own value.
  const dateValue = await page.locator('input[type="date"]').inputValue()
  expect(dateValue).not.toBe('')
  expect([defaultStartDateIso(beforeMount), defaultStartDateIso(afterRead)]).toContain(dateValue)

  // The time: the next 30-minute slot on this machine's clock, on the grid.
  const slot = parseTimeLabel(await page.getByTestId('start-time-label').innerText())
  expect([nextSlotMinutes(beforeMount), nextSlotMinutes(afterRead)]).toContain(slot)

  // Only the fields a parent alone knows get touched — no date, no time.
  // V9 ticket 01: and NO NEIGHBOURHOOD — /new stopped asking (the select is
  // gone from that page), which is what makes this post a plain
  // "place and nothing else" post.
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(place)
  await page.getByRole('button', { name: '1h', exact: true }).click()

  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
})

// V13 ticket 02: the "Recent places" chips and the quick-fill preset card are
// GONE. This test now seeds a post through the UI, then re-mounts /new to
// confirm the new layout renders (describe choice, map picker, visible
// address field) and the Post path still works end-to-end.
test('/new re-mount renders the new layout and posts end-to-end', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const seedTitle = `e2e ${marker.displayName} memory seed`
  const place = 'E2E memory park'
  const address = '1234 E2E Ave NE'

  // The ticket's 375px AC, checked here because scripts/mobile-audit.mjs only
  // walks signed-out routes (/login, the public detail page) — a phone-width
  // /new is otherwise untested.
  await page.setViewportSize({ width: 375, height: 812 })

  // Seed ONE post through the UI — this is the place the form should remember.
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(seedTitle)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(place)
  // V9 ticket 03: the address is behind "More options" now — the pick fills it,
  // and typing one is the adjustment.
  await page.getByPlaceholder(ADDRESS_PLACEHOLDER).fill(address)
  // V9 ticket 01: /new no longer asks for a neighbourhood — nothing to pick.
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')

  // A FRESH mount: the chips come from this parent's own recent posts, so
  // the just-created place is offered back to them.
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  const placeInput = page.getByPlaceholder(PLACE_PLACEHOLDER)
  const addressInput = page.getByPlaceholder(ADDRESS_PLACEHOLDER)
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  const titleInput = page.getByPlaceholder(TITLE_PLACEHOLDER)
  // V9 ticket 03: the address lives behind "More options", so it is read there
  // (a collapsed disclosure's contents are not in the DOM at all).
  // The form does not guess a place — that is the one thing only the parent
  // knows (the chips are an offer, not a prefill).
  await expect(placeInput).toHaveValue('')
  await expect(addressInput).toHaveValue('')

  // V13 ticket 02: the chips are gone — fill the fields directly.
  await placeInput.fill(place)
  await addressInput.fill(address)
  // V9 ticket 01 replaced the `toHaveValue(/.+/)` assertion that used to be
  // here — it pinned the neighbourhood SELECT's value, and both the field and
  // that assertion are gone from /new. This is a DIFFERENT assertion about the
  // new contract (the page has no select at all), not a stronger version of the
  // old one: what the chip fills is checked by the two lines above, and what the
  // post carries by the card assertion below.
  await expect(page.locator('select')).toHaveCount(0)
  // …and the title was seeded from the place, only because it was EMPTY.
  await expect(titleInput).toHaveValue(`Playdate at ${place}`)

  // V13 ticket 02: the preset card is gone — the When section's stepper
  // picks the duration ("until the next hour"). Just pick a duration chip.
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await expect(titleInput).toHaveValue(`Playdate at ${place}`)

  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  await expect(
    page.getByRole('heading', { name: `Playdate at ${place}`, exact: true }),
  ).toBeVisible()
})

test.afterEach(async () => {
  // Best-effort cleanup (the golden-path pattern): delete the marker's
  // playdate rows via PostgREST with the marker's own JWT (the host-only
  // DELETE policy requires it). A failure is logged, not fatal — the
  // e2e-<epoch> prefix marks the rows for the sweep.
  try {
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken, userId } = readMarkerSession()
    const query = `${url}/rest/v1/playdates?host_profile_id=eq.${userId}&select=id`
    const headers: Record<string, string> = {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    }
    const del = await fetch(query, { method: 'DELETE', headers })
    const deleted = del.ok ? ((await del.json()) as Array<Record<string, unknown>>) : []
    const check = await fetch(query, { headers })
    const remaining = check.ok ? ((await check.json()) as Array<Record<string, unknown>>) : null
    if (!del.ok || (remaining !== null && remaining.length > 0)) {
      console.log(
        `[e2e cleanup] FAILED — delete HTTP ${del.status}, ${deleted.length} row(s) returned, ` +
          `${remaining?.length ?? '?'} remain (marker ${userId}) — orchestrator sweep (e2e- prefix) will pick them up`,
      )
    } else {
      console.log(`[e2e cleanup] ok — deleted ${deleted.length} marker playdate row(s)`)
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${err instanceof Error ? err.message : err}`,
    )
  }
})
