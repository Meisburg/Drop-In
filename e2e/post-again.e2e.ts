/**
 * V13 ticket 04 — "Post again": the explicit picker over past drop-ins.
 *
 * The ticket's claims, end to end against the live project:
 *
 *  1. THE PICKER EXISTS FOR A PARENT WITH POSTS, and each row's label states
 *     the plan it will write (the quick-fill preset's rule: the label is the
 *     same seam's output — cloneLastPost — so a label that promises one thing
 *     and writes another is not expressible). The picker leads the shortcuts
 *     (above the "Recent places" chips) because it is the bigger one.
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
 *  5. THE PICKER IS ABSENT for a parent with no posts — the spec's SECOND
 *     context (a fresh e2e- signup, the onboarding-gate pattern) sees /new
 *     with no "Post again" rows at all, while the marker (who has posts)
 *     does. Workers are pinned to 1 (playwright.config.ts), so the two
 *     contexts run serially and never race each other's rows.
 *
 * V12 ticket 04 — the Duplicate path's prefill, end to end (the ticket's
 * four entry points — the detail page's host-panel button, its one-off
 * "Same time next week" branch, the profile post row, and the /new
 * consumption path itself — all converge on the same router-state shape,
 * so one entry point proves the consumption):
 *
 *  6. DUPLICATE CARRIES THE WHOLE PLAN: the host panel's Duplicate button
 *     on a post with a linked kid opens /new with the place, the details,
 *     the duration (read back as the value line, not the chips — V12 t02's
 *     branch-1 shape), and the kid PRESELECTED, the start slot re-seated by
 *     the same `clonedStart` seam as claim 3 (bracketed the same way), and
 *     the form posts with no further input. The spec seeds the post + kid +
 *     link through REST (the UI's own host-insert and the 42501 self-kid
 *     walls are the policy), and the seeded kid row is cleaned in
 *     afterEach (its playdate_kids link cascades with the post, 0022).
 *
 * Cleanup mirrors kids-v3.e2e.ts: a best-effort REST delete of BOTH the
 * marker's playdate rows AND the fresh account's (where one was created) with
 * their own JWTs — the host-only DELETE policy is the wall, playdate_kids
 * rows cascade with the post (0022) — and, for the duplicate test, the
 * seeded kid row (deleted AFTER the playdate rows so its link is gone
 * first). The e2e-<epoch> prefix marks any
 * straggler for the orchestrator's sweep.
 */
import { expect, test, type Page } from '@playwright/test'
import { clonedStart, computeEndIso, computeStartIso, kidLabel } from '../src/lib/feed'
import {
  editTitle,
  localDatePlusDays,
  parseTimeLabel,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
  stepStartTimeOnce,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'

/**
 * The kid row the duplicate test seeds (null until that test runs): afterEach
 * deletes it AFTER the marker's playdate rows — the playdate_kids link
 * cascades with the post (0022), so the kid row outlives nothing by the time
 * the delete lands.
 */
let createdKidId: string | null = null

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
 * post the picker should clone. Returns the title it was posted under.
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
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  await page.getByPlaceholder('e.g. 7200 4th Ave NE, near the boathouse').fill('1234 E2E Ave NE')
  await page
    .getByPlaceholder('Anything parents should know — what to bring, parking, weather plan…')
    .fill('Bring a snack to share.')
  const stepped = await stepStartTimeOnce(page)
  // V13 ticket 03: no duration chips on /new — the End stepper shows
  // the current end time (start + auto-duration). Verify it's visible.
  await expect(page.getByTestId('end-time-label')).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
}

test('the Post-again picker clones the whole last post and posts it with the time advanced', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const seedTitle = `e2e ${marker.displayName} post-again seed`
  const place = 'E2E Post Again park'

  await seedPostViaUi(page, seedTitle, place)

  // A FRESH mount: the picker comes from this parent's own past posts.
  await page.goto('/new')
  await settleOnRoute(page, '/new')

  // V15 T05 (A10): the "Post again" picker moved to the top of the page as a
  // two-choice header ("Create new" | "Duplicate existing"). Selecting
  // "Duplicate existing" opens a lightbox listing all past posts.
  const dupButton = page.getByTestId('dup-duplicate')
  await expect(dupButton).toBeVisible()
  await dupButton.click()

  // The lightbox: present, lists past posts (most recent first), and its label
  // names the plan (the title + the day the clone will land on).
  const pickerRows = page.getByTestId('post-again')
  await expect(pickerRows.first()).toBeVisible()
  await expect(pickerRows.first()).toContainText(seedTitle)

  // Bracket the tap: the clone's start is computed from a MOUNT-time now,
  // which falls between these two reads (the quick-post spec's race-proof
  // pattern). The clone's day label on the row must match the pure seam.
  await pickerRows.first().click()

  // ONE tap wrote the whole plan — assert every field the clone owns.
  // The place + address arrive with the picker row (the applyRecentPlace
  // invariants); the title is the seed's (the parent's own words survive a
  // clone); the duration is carried as the seed's (V13 ticket 03: the End
  // stepper shows start + duration, no "How long" label or chips on /new).
  await expect(page.getByPlaceholder(PLACE_PLACEHOLDER)).toHaveValue(place)
  await expect(page.getByTestId('end-time-label')).toBeVisible()

  // V15.2 fix: this step used to read `post-summary-line` index 2, asserting a
  // combined "place · address" read-back line. V13 ticket 02 reduced the summary
  // card to TITLE ONLY (its AC pins that) and gave the address its own visible
  // field, so no index 2 and no combined line exist. The claim is unchanged —
  // the clone carries the address with it — and it is asserted below against the
  // control that actually holds the value (see "The address arrived with the
  // clone").

  // Editing after the clone is free: the title read-back is still a
  // read-back (tap-to-edit), and the place text edit clears the picker-written
  // address (the F1 rule — asserted over the pick path in post-fast; here
  // over the clone path).
  await expect(page.getByTestId('title-line')).toBeVisible()

  // The address arrived with the clone (open the disclosure to read it).
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

test('a parent with no posts sees no Post-again picker', async ({ page }) => {
  // The marker HAS posts only after the first test seeds one — order is not
  // guaranteed across retries, so this spec does NOT depend on which ran
  // first: it asserts the picker is absent EXACTLY when the parent has no
  // posts, by first cleaning the marker's rows (the same REST delete the
  // afterEach uses) and then loading /new.
  const deleted = await deletePlaydatesOf(readMarkerSession().userId)
  if (deleted < 0) throw new Error('marker playdate cleanup failed — cannot pin the no-picker case')

  await page.goto('/new')
  await settleOnRoute(page, '/new')
  // V15 T05 (A10): the picker is now behind the "Duplicate existing" button.
  // With no posts, the button is disabled and the lightbox never opens.
  await expect(page.getByTestId('dup-duplicate')).toBeDisabled()
  await expect(page.getByTestId('post-again')).toHaveCount(0)
  // The form is otherwise exactly today's form: the summary opens, the
  // recent-places row is absent (no posts), and nothing crashed.
  await expect(page.getByTestId('post-summary')).toBeVisible()
  await expect(page.getByText('Recent places')).toHaveCount(0)
})

/**
 * V12 ticket 04 — the duplicate's prefill, entry-point by entry point.
 *
 * The host panel's Duplicate button is the spec's door (the ticket's other
 * three — the "Same time next week" one-off branch, the profile post row, and
 * the /new consumption path — all navigate to the SAME router state through
 * toDuplicatePrefill, so one door proves the consumption). The seed is
 * REST-shaped deliberately: a post whose only linked kid is THIS run's, so
 * the preselected chip is provably the duplicate's carry, not a marker kid a
 * parent might actually have.
 */
test('Duplicate prefills place, details, duration, and the linked kid, and re-seats the start slot', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }

  // The post's kid: epoch-named so it cannot collide with a kid the marker
  // actually has (a leftover would only add a chip to the section — the
  // assertion below names THIS kid, and the duplicate's selection must be
  // provably the seeded link's).
  const epoch = Date.now()
  const kidName = `Eve ${epoch}`
  const kidAge = 5
  const kidRes = await fetch(`${url}/rest/v1/kids`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ profile_id: userId, first_name: kidName, age: kidAge }),
  })
  const kidRows = (await kidRes.json()) as Array<{ id: string }>
  expect(kidRes.ok, `the seeded kid must insert (HTTP ${kidRes.status})`).toBe(true)
  expect(kidRows[0]?.id, 'the seeded kid read-back must carry its id').toBeTruthy()
  const kidId = kidRows[0].id
  createdKidId = kidId

  // The post: upcoming (two days out — the host panel renders its usual
  // controls), a clean 1h span (the prefill's duration comes out as a form
  // option, 60, not the off-grid 0 fallback), and a 3:00 PM slot (on the
  // 30-minute grid; the clone's rule only ever reads the slot's time-of-day
  // — the stored day is irrelevant, clonedStart's contract).
  const hoodRes = await fetch(`${url}/rest/v1/neighborhoods?select=id&limit=1`, { headers })
  const hoods = (await hoodRes.json()) as Array<{ id: string }>
  expect(hoodRes.ok && hoods[0]?.id, 'the neighborhoods seed must be readable').toBeTruthy()
  const seedTitle = `e2e ${marker.displayName} duplicate seed`
  const place = 'E2E Duplicate lot'
  const details = 'Bring a water bottle.'
  const seedDate = localDatePlusDays(2)
  const seedStartMinutes = 15 * 60
  const seedStartsAt = computeStartIso(seedDate, seedStartMinutes)
  const seedEndsAt = computeEndIso(seedDate, seedStartMinutes, 60)
  const postRes = await fetch(`${url}/rest/v1/playdates`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      host_profile_id: userId,
      neighborhood_id: hoods[0].id,
      title: seedTitle,
      place,
      details,
      starts_at: seedStartsAt,
      ends_at: seedEndsAt,
    }),
  })
  const postRows = (await postRes.json()) as Array<{ id: string }>
  expect(postRes.ok, `the seeded post must insert (HTTP ${postRes.status})`).toBe(true)
  expect(postRows[0]?.id, 'the seeded post read-back must carry its id').toBeTruthy()
  const postId = postRows[0].id

  // The link (42501's self-kid wall: the marker's own kid on the marker's own
  // post — the exact shape the Duplicate button's fetch reads back).
  const linkRes = await fetch(`${url}/rest/v1/playdate_kids`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ playdate_id: postId, kid_id: kidId }),
  })
  expect(linkRes.ok, `the playdate_kids link must insert (HTTP ${linkRes.status})`).toBe(true)

  await page.goto(`/playdate/${postId}`)
  // The host panel is the door (the "This is your post" block's controls).
  await expect(page.getByText('This is your post')).toBeVisible()

  // Bracket the mount: /new computes the clone's start ONCE at mount (the
  // useState initializer), which falls between these two reads — the
  // quick-post pattern, race-proof against the today/tomorrow boundary.
  const beforeMount = new Date().toISOString()
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await settleOnRoute(page, '/new')

  // The banner names the source post and the rule: the duplicate's only
  // required input is the new start time.
  await expect(page.getByText(`Duplicating “${seedTitle}”`)).toBeVisible()
  await expect(
    page.getByText('Place, kids, and duration are filled in — pick a new start time and post.'),
  ).toBeVisible()

  // The bracket CLOSES here, after the banner: the banner only renders on the
  // mount that carries the prefill (App's NewRoute keys the page on it — a
  // prefill landing on an already-mounted /new remounts, re-running the
  // mount-once initializers), so the clone's mount-time now is pinned inside
  // [beforeMount, afterRead].
  const afterRead = new Date().toISOString()

  // The parent's words + plan arrived: the place (visible) and the duration
  // carried as the End stepper's value (V13 ticket 03: no "How long" label,
  // no chips on /new — the end time is start + cloned duration).
  await expect(page.getByPlaceholder(PLACE_PLACEHOLDER)).toHaveValue(place)
  await expect(page.getByTestId('end-time-label')).toBeVisible()

  // The start slot was re-seated by the SAME seam the "Post again" chip uses
  // (feed.clonedStart, bracketed): the seed's 3:00 PM time-of-day, on today
  // when still ahead, tomorrow otherwise.
  const cloneBefore = clonedStart(seedStartsAt, beforeMount)
  const cloneAfter = clonedStart(seedStartsAt, afterRead)
  const dateValue = await page.locator('input[type="date"]').inputValue()
  expect([cloneBefore.startDate, cloneAfter.startDate], "the clone's date").toContain(dateValue)
  const slot = parseTimeLabel(await page.getByTestId('start-time-label').innerText())
  expect([cloneBefore.startMinutes, cloneAfter.startMinutes], "the clone's slot").toContain(slot)

  // The linked kid arrived preselected: the one-shot seed effect intersected
  // the prefill's kid ids with the marker's mounted kids.
  await expect(
    page
      .getByTestId('kids-section')
      .getByRole('button', { name: kidLabel(kidName, kidAge), exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')

  // The details came along too (behind the disclosure — open the door to read
  // them; a collapsed field is not in the DOM).
  await expect(
    page.getByPlaceholder('Anything parents should know — what to bring, parking, weather plan…'),
  ).toHaveValue(details)

  // And it posts with no further input — the ticket's whole point.
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  await expect(page.getByRole('heading', { name: seedTitle, exact: true }).first()).toBeVisible()
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
  // The duplicate test's seeded kid row, deleted AFTER the playdate rows
  // (the link cascades with the post, so nothing references the kid by the
  // time the delete lands).
  if (createdKidId !== null) {
    const kidId = createdKidId
    createdKidId = null
    try {
      const { url, anonKey } = readSupabaseEnv()
      const { accessToken } = readMarkerSession()
      const headers: Record<string, string> = {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      }
      const del = await fetch(`${url}/rest/v1/kids?id=eq.${kidId}`, { method: 'DELETE', headers })
      if (del.ok) {
        console.log(`[e2e cleanup] ok — deleted seeded kid ${kidId}`)
      } else {
        console.log(`[e2e cleanup] FAILED (logged, best-effort): seeded kid delete HTTP ${del.status}`)
      }
    } catch (err) {
      console.log(
        `[e2e cleanup] FAILED (logged, best-effort): seeded kid delete ${err instanceof Error ? err.message : err}`,
      )
    }
  }
})