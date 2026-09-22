/**
 * Spec (V8 ticket 04): real post lists on /u/:handle and /profile.
 *
 * Before this ticket EVERY profile claimed "No posts yet." — the block was
 * hardcoded regardless of history, so the app's best social proof was
 * invisible. This spec proves the real lists, with two rows the spec creates
 * itself:
 *
 * (a) a drop-in starting TOMORROW → the "Upcoming" section, and
 * (b) a drop-in that ENDED YESTERDAY → the "Past" section. A past start date is
 *     accepted by the /new form (its validation is shape-only, and the app
 *     never re-schedules a parent for them) — and a post that already happened
 *     is exactly the history this ticket exists to surface, so the split is
 *     asserted on both sides, not just the easy one.
 *
 * Then, on /u/<handle>:
 * (1) the tomorrow post renders under the "Upcoming" heading and the yesterday
 *     post under "Past" — each assertion SCOPED to that section, and each
 *     matched on the card LINK (`a[href^="/playdate/"]`), so this pins that the
 *     section renders the real DropInCard and not a list row (the card brings
 *     the muted/ended styling, the "Ended" chip, and the tap target with it);
 * (2) "No posts yet." appears NOWHERE on the page — the hardcoded block this
 *     ticket removes (asserting the old copy is ABSENT is the AC);
 * (3) the "Hosted N drop-ins" line is still there, exactly as it was (its N is
 *     agnostic on purpose: this spec's two posts guarantee the line renders;
 *     no live count is asserted).
 * And on /profile — V16 t04 REMOVED the "Hosted drop-ins" card from that page
 * (the founder's ask), so this spec now asserts the OPPOSITE there: the card,
 * its headings, its rows and its Duplicate action are GONE, and the page still
 * renders its own cards intact. The duplicate capability itself is NOT lost and
 * is pinned elsewhere: /new's "Duplicate existing" picker (post-again.e2e.ts,
 * which drives the `dup-duplicate` button → the `post-again` lightbox) and the
 * drop-in host panel's Duplicate button. The /u/:handle half of this spec is
 * unchanged — that page keeps its lists (t05's surface).
 *
 * LIVE-DATA DISCIPLINE: every assertion is about the two rows THIS spec
 * created (its own `e2e-<epoch>` titles). Nothing here asserts a count, or the
 * presence/absence, of live project data it did not create — leftover rows
 * from another run can only ADD cards, never falsify these assertions.
 *
 * Cleanup (best-effort per house, the golden-path pattern): both rows are
 * deleted via REST with the marker's OWN JWT (the host-only DELETE policy — a
 * plain anon delete is an RLS no-op that PostgREST reports as a 2xx, the logged
 * lesson). The delete is SCOPED to this spec's two titles, so it can never
 * touch another spec's rows; the marker account persists for the
 * orchestrator's sweep (e2e- prefix).
 */
import { expect, test, type Page } from '@playwright/test'
import {
  editTitle,
  localDatePlusDays,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
  stepStartTimeOnce,
} from './fixtures'

/**
 * The titles this run created — set by the test, read by the afterEach
 * cleanup. Module-scoped because afterEach has no access to the test body's
 * locals, and empty on a run that failed before posting anything (nothing to
 * delete).
 */
let createdTitles: string[] = []

/**
 * Post one drop-in through the /new UI on `startDate` (the golden-path /
 * host-retention flow). The start time is stepped once (the 30-minute grid is
 * what matters, not the default — stepStartTimeOnce) and the end is computed
 * from the 1h chip, so a date in the past yields a post that has ENDED.
 */
async function postDropIn(page: Page, title: string, startDate: string): Promise<void> {
  await page.goto('/new')
  // A cold load can lose the route to the onboarding-gate race — settle on
  // /new via the app's own navigation once the SPA state is warm.
  await settleOnRoute(page, '/new')
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page
    .getByPlaceholder('e.g. Green Lake playground, near the boathouse')
    .fill('E2E profile-posts lot')
  // V9 ticket 01: /new no longer asks for a neighbourhood — nothing to pick.
  // V13 ticket 02: the date + the 30-minute stepper live in the visible "When" section (the disclosure is gone).
  await page.locator('input[type="date"]').fill(startDate)
  await stepStartTimeOnce(page)
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  // /new always lands on the feed after a successful create (the past post is
  // not in the feed — the radius query starts today — which is fine: nothing
  // below asserts the feed).
  await page.waitForURL('/')
}

/** The section element whose heading is exactly `heading` (Upcoming / Past). */
function section(page: Page, heading: string) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
}

test('the host’s real posts: Upcoming + Past on /u/:handle and /profile, with no "No posts yet."', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const upcomingTitle = `e2e-${epoch} ${marker.displayName} upcoming lot`
  const pastTitle = `e2e-${epoch} ${marker.displayName} past lot`
  createdTitles = [upcomingTitle, pastTitle]

  // --- The two posts: tomorrow (upcoming) and yesterday (ended). ---
  await postDropIn(page, upcomingTitle, localDatePlusDays(1))
  await postDropIn(page, pastTitle, localDatePlusDays(-1))

  // --- /u/:handle — the real lists. ---
  await page.goto(`/u/${encodeURIComponent(marker.displayName)}`)
  // V13 ticket 01: the identity block (@handle + "Here since" + "Hosted N")
  // MOVED to the bottom of the page — it no longer heads the page, but the
  // @handle heading still renders (now in the bottom identity card).
  await expect(page.getByRole('heading', { name: `@${marker.displayName}` })).toBeVisible()

  // (1) The tomorrow post is in the Upcoming section, rendered as a card (the
  // DropInCard's tap target), and the ended post is in Past.
  await expect(
    section(page, 'Upcoming').locator('a[href^="/playdate/"]').filter({ hasText: upcomingTitle }),
  ).toBeVisible()
  await expect(
    section(page, 'Past').locator('a[href^="/playdate/"]').filter({ hasText: pastTitle }),
  ).toBeVisible()

  // The sections are NOT crossed: the past post is in Past only, the upcoming
  // post in Upcoming only (the ticket's split, not just "both somewhere").
  await expect(section(page, 'Past').getByText(upcomingTitle, { exact: true })).toHaveCount(0)
  await expect(section(page, 'Upcoming').getByText(pastTitle, { exact: true })).toHaveCount(0)

  // (2) The hardcoded "No posts yet." is GONE from a profile with posts.
  await expect(page.getByText('No posts yet.', { exact: true })).toHaveCount(0)

  // (3) The credibility line above the lists is untouched (its N is
  // deliberately not pinned — the marker's all-time count is live data; this
  // spec's two posts only guarantee that the line renders at all).
  await expect(page.getByText(/^Hosted \d+ drop-ins?$/)).toBeVisible()

  // --- /profile — V16 t04: the "Hosted drop-ins" EDITOR card is REMOVED. ---
  await page.goto('/profile')
  await settleOnRoute(page, '/profile')
  // V20 t01: /profile now opens on the READ view, whose own "Hosted drop-ins"
  // section is the real list (the same render /u/:handle uses) — so this
  // spec's posts are legitimately listed here. The assertions below are about
  // the EDITOR, which is where the V16 t04 removal landed, so the spec taps
  // into edit mode before checking that the card, its copy and its controls
  // are gone.
  await page.getByTestId('edit-profile').click()
  // (4) The card, its heading and its copy are gone…
  await expect(page.getByRole('heading', { name: 'Hosted drop-ins' })).toHaveCount(0)
  await expect(
    page.getByText('Duplicate one to re-post it — place, kids, and duration come along (V12 t04); you only pick a new start time.', {
      exact: true,
    }),
  ).toHaveCount(0)
  // …and neither of this spec's posts is listed in the editor (the whole list
  // went with the card, not just its heading).
  await expect(page.getByText(upcomingTitle, { exact: true })).toHaveCount(0)
  await expect(page.getByText(pastTitle, { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('duplicate-previous')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Duplicate' })).toHaveCount(0)
  // (5) The editor is otherwise intact — the identity card (photo + name) and
  // the kids card still render, so "removed a card" did not blank it.
  await expect(page.getByTestId('display-name-input')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'About the kids' })).toBeVisible()
})

test.afterEach(async () => {
  if (createdTitles.length === 0) return
  // Best-effort cleanup (per house): delete THIS spec's rows via PostgREST,
  // scoped by title, with the marker's access token (read out of the saved
  // storageState — the host-only DELETE policy). A failure is logged, not
  // fatal — the e2e-<epoch> prefix marks the rows for the orchestrator.
  try {
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken, userId } = readMarkerSession()
    const headers: Record<string, string> = {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    }
    let deleted = 0
    let remaining: number | null = 0
    for (const title of createdTitles) {
      const query =
        `${url}/rest/v1/playdates?host_profile_id=eq.${userId}` +
        `&title=eq.${encodeURIComponent(title)}&select=id`
      const del = await fetch(query, { method: 'DELETE', headers })
      const rows = del.ok ? ((await del.json()) as Array<Record<string, unknown>>) : []
      deleted += rows.length
      const check = await fetch(query, { headers })
      const left = check.ok ? ((await check.json()) as Array<Record<string, unknown>>) : null
      if (!del.ok || left === null || left.length > 0) {
        remaining = left === null ? null : (remaining ?? 0) + left.length
      }
    }
    if (remaining !== 0) {
      console.log(
        `[e2e cleanup] FAILED — deleted ${deleted} row(s), ${remaining ?? '?'} remain ` +
          `(marker ${userId}) — orchestrator sweep (e2e- prefix) will pick them up`,
      )
    } else {
      console.log(
        `[e2e cleanup] ok — deleted ${deleted} profile-posts marker row(s); ` +
          `the marker account persists for the sweep`,
      )
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${
        err instanceof Error ? err.message : err
      } — orchestrator sweep (e2e- prefix) will pick stragglers up`,
    )
  }
})
