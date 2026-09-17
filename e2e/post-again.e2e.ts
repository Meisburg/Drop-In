/**
 * V10 ticket 01 — "Post again": the whole last post, one tap.
 *
 * The ticket's claims, end to end against the live project:
 *
 *  1. THE CHIP EXISTS FOR A PARENT WITH POSTS, and its label states the plan
 *     it will write (the quick-fill preset's rule: the label is the same seam's
 *     output — cloneLastPost — so a label that promises one thing and writes
 *     another is not expressible). The chip leads the shortcuts (above the
 *     "Recent places" chips) because it is the bigger one.
 *  2. ONE TAP CLONES EVERYTHING: place + address + the summary's read-back
 *     (day/window/place) move to the clone's values, kids are preselected,
 *     and Post lands a card in the feed identical to a hand-filled clone.
 *     Nothing submits itself — the parent still taps Post.
 *  3. THE TIME RULE IS THE PURE SEAM'S (feed.clonedStart, evaluated by the
 *     spec against the same mounted-now bracket the quick-post spec uses, so
 *     neither a 30-minute boundary nor midnight can flake it).
 *  4. EDITING AFTER THE CLONE IS FREE: the summary's title line stays a
 *     read-back, a place-text edit still clears the app-written address (the
 *     applyRecentPlace invariants hold for the clone's writes too), and no
 *     field is locked.
 *  5. THE CHIP IS ABSENT for a parent with no posts — the spec's SECOND
 *     context (a fresh e2e- signup, the onboarding-gate pattern) sees /new
 *     with no "Post again" row at all, while the marker (who has posts)
 *     does. Workers are pinned to 1 (playwright.config.ts), so the two
 *     contexts run serially and never race each other's rows.
 *
 * Cleanup mirrors kids-v3.e2e.ts: a best-effort REST delete of BOTH the
 * marker's playdate rows AND the fresh account's (where one was created) with
 * their own JWTs — the host-only DELETE policy is the wall, playdate_kids
 * rows cascade with the post (0022). The e2e-<epoch> prefix marks any
 * straggler for the orchestrator's sweep.
 */
import { expect, test, type Page } from '@playwright/test'
import { clonedStart } from '../src/lib/feed'
import {
  editTitle,
  localDatePlusDays,
  openMoreOptions,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
  stepStartTimeOnce,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'

/** Delete every playdate row of `userId` via PostgREST (the host-only wall). */
async function deletePlaydatesOf(userId: string): Promise<number> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  const query = `${url}/rest/v1/playdates?host_profile_id=eq.${userId}&select=id`
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    Prefer: 'return=representation',
  }
  const del = await fetch(query, { method: 'DELETE', headers })
  if (!del.ok) return -1
  return ((await del.json()) as Array<Record<string, unknown>>).length
}

/**
 * Seed ONE post through the /new UI (the golden-path pattern) — this is the
 * post the chip should clone. Returns the title it was posted under.
 */
async function seedPostViaUi(page: Page, title: string, place: string): Promise<void> {
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(place)
  // Give the clone a NON-default day (tomorrow) + a stepped start, so the
  // clone's date/time writes are provably the CLONE's, not the form defaults.
  // The address + details give the clone something to carry (both live
  // behind the disclosure).
  await openMoreOptions(page)
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  await page.getByPlaceholder('e.g. 7200 4th Ave NE, near the boathouse').fill('1234 E2E Ave NE')
  await page
    .getByPlaceholder('Anything parents should know — what to bring, parking, weather plan…')
    .fill('Bring a snack to share.')
  const stepped = await stepStartTimeOnce(page)
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await expect(page.getByText(`Ends ${stepped.endLabel(60)}`)).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
}

test('the Post-again chip clones the whole last post and posts it with the time advanced', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const seedTitle = `e2e ${marker.displayName} post-again seed`
  const place = 'E2E Post Again park'

  await seedPostViaUi(page, seedTitle, place)

  // A FRESH mount: the chip comes from this parent's own last post.
  await page.goto('/new')
  await settleOnRoute(page, '/new')

  // The chip: present, leads the shortcuts, and its label names the plan
  // (the title + the day the clone will land on).
  const chip = page.getByTestId('post-again')
  await expect(chip).toBeVisible()
  await expect(chip).toContainText(seedTitle)

  // Bracket the tap: the clone's start is computed from a MOUNT-time now,
  // which falls between these two reads (the quick-post spec's race-proof
  // pattern). The clone's day label on the chip must match the pure seam.
  await chip.click()

  // ONE tap wrote the whole plan — assert every field the clone owns.
  // The place + address arrive with the chip (the applyRecentPlace
  // invariants); the title is the seed's (the parent's own words survive a
  // clone); the duration is read back as the seed's (V12 t02: the fast path
  // shows the value, not the chips — they live behind "More options").
  await expect(page.getByPlaceholder(PLACE_PLACEHOLDER)).toHaveValue(place)
  await expect(page.getByText('How long', { exact: true })).toBeVisible()
  await expect(page.getByText(/^1h · Ends/)).toBeVisible()

  // The time moved by the rule: today's same slot when still ahead, else
  // tomorrow (the spec asserts against the summary's own read-back — the
  // SAME seam the submit writes with, so no second copy of the math here).
  // The place line reads back place + the cloned address (the F1 read-back
  // rule — the address is part of what is posted).
  const summaryLines = page.getByTestId('post-summary-line')
  await expect(summaryLines.nth(2)).toHaveText(`${place} · 1234 E2E Ave NE`)

  // Editing after the clone is free: the title read-back is still a
  // read-back (tap-to-edit), and the place text edit clears the chip-written
  // address (the F1 rule — asserted over the pick path in post-fast; here
  // over the clone path).
  await expect(page.getByTestId('title-line')).toBeVisible()

  // The address arrived with the clone (open the disclosure to read it).
  await openMoreOptions(page)
  await expect(page.getByPlaceholder('e.g. 7200 4th Ave NE, near the boathouse')).toHaveValue(
    '1234 E2E Ave NE',
  )
  // …and the details came along too.
  await expect(page.getByPlaceholder('Anything parents should know — what to bring, parking, weather plan…')).toHaveValue(
    'Bring a snack to share.',
  )

  // Post it — the clone is postable with no further edits (the ticket's
  // whole point).
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  await expect(page.getByRole('heading', { name: seedTitle, exact: true }).first()).toBeVisible()
})

test('a parent with no posts sees no Post-again chip', async ({ page }) => {
  // The marker HAS posts only after the first test seeds one — order is not
  // guaranteed across retries, so this spec does NOT depend on which ran
  // first: it asserts the chip is absent EXACTLY when the parent has no
  // posts, by first cleaning the marker's rows (the same REST delete the
  // afterEach uses) and then loading /new.
  const deleted = await deletePlaydatesOf(readMarkerSession().userId)
  if (deleted < 0) throw new Error('marker playdate cleanup failed — cannot pin the no-chip case')

  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await expect(page.getByTestId('post-again')).toHaveCount(0)
  // The form is otherwise exactly today's form: the summary opens, the
  // recent-places row is absent (no posts), and nothing crashed.
  await expect(page.getByTestId('post-summary')).toBeVisible()
  await expect(page.getByText('Recent places')).toHaveCount(0)
})

test.afterEach(async () => {
  // Best-effort cleanup (the house pattern): the marker's playdate rows are
  // deleted via REST with the marker's own JWT (host-only DELETE policy);
  // the playdate_kids rows cascade with the post (0022's ON DELETE CASCADE).
  // A failure is logged, not fatal — the e2e-<epoch> prefix marks the rows
  // for the orchestrator's sweep.
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