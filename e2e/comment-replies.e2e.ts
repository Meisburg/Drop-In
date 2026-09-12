/**
 * Spec (V3 ticket 10): one-level comment replies — comment → reply →
 * nested render + delete permission (the ticket's e2e AC).
 *
 * The host marker (the setup spec's signed-in state — signup + onboarding
 * zip + radius happen in the setup project) posts a drop-in. A first
 * viewer marker (`e2e-v-<epoch>-1` — a FRESH context with a clean
 * storageState, onboarding through the location step, the comments.e2e.ts
 * viewer pattern) comments top-level on the detail page; a second viewer
 * (`e2e-v-<epoch>-2`) taps "Reply" on that comment — the composer's
 * "Replying to @handle" mode (Run C's reply UI; the submit carries the
 * parent's id as parent_id, migration 0023) — and posts the reply. The
 * nested render (the pure groupCommentsForRender seam, trust.ts): the
 * parent group's children ul (ml-8 indent) holds the reply row with the
 * 24px avatar (h-6 w-6 — the HostAvatar sm size), and the header count
 * reads "Comments (2)" (the count includes replies). The reply row offers
 * NO "Reply" affordance (the one-level pin — the pure
 * planCommentAction's canReply: top-level rows only, any authenticated
 * user; no reply-to-replies). Delete permission (the per-row plan +
 * 0013's UNCHANGED comments_delete_author_or_host, 0023 header (d) — the
 * rule keys on the ROW's own author, the parent's author is out): the
 * event's host gets a Delete on the reply (the host branch of the ticket
 * rule); the PARENT's author sees the nested row (the thread renders for
 * ANY signed-in viewer — no privacy wall on the thread) but offers NO
 * Delete on it (the pin); the REPLY's author deletes it — the nested row
 * is gone, the parent stays, the count back to "Comments (1)".
 *
 * Pre-0023-apply this spec is RED by design (the 0022 discipline, the
 * same class as tickets 08/09): the live comments table has no parent_id
 * column, so db.listComments' select (which now carries parent_id — Run
 * C) 42703s live and the detail page's caught load (the `.catch(() =>
 * null)` discipline) hides the WHOLE comments section (`state.comments`
 * null). The failure lands at the FIRST section assertion — the composer
 * is absent on the first viewer's detail page (section hidden / 42703 /
 * column-missing class, never a crash). The host's post stands (the
 * playdates table is live) and a plain comment insert would work
 * pre-apply too (addComment omits the parent_id key) — but it is
 * unreachable through the UI while the section is hidden. GREEN = 0023
 * applied (the live-check line: npm run test:e2e with this spec +
 * comments.e2e.ts green; the pre-apply class is proven by a REST select
 * of parent_id with the marker's JWT 42703ing).
 *
 * Cleanup (best-effort per house, the comments/address-maps pattern):
 * the host marker's playdate rows are deleted via REST with the marker's
 * own JWT (host-only DELETE policy); the comments + replies cascade with
 * the post (0013's playdate_id FK + 0023's parent_id self-FK, both ON
 * DELETE CASCADE — pre-apply there are no reply rows to cascade, the
 * delete just removes the standing post + the parent comment). The marker
 * accounts (the e2e- host + the e2e-v- viewers, no playdate rows) persist
 * by the standing pattern — the orchestrator's sweep (family 10 = this
 * pre-apply run; the post-apply live-check run appends family 11).
 */
import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import {
  localDatePlusDays,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
  stepStartTimeOnce,
} from './fixtures'

const PLACE = 'E2E replies lot'

/**
 * Post a drop-in THROUGH the /new UI (the golden-path pattern) as the
 * marker (the signed-in default context), then return the feed card's
 * detail href — a real /playdate/:id. (The post stands pre-0023-apply:
 * the playdates table + every /new field it writes are live.)
 */
async function postMarkerDropIn(page: Page, title: string): Promise<string> {
  await page.goto('/new')
  // A cold load can lose the route to the onboarding-gate race — settle on
  // /new via the app's own navigation once the SPA state is warm.
  await settleOnRoute(page, '/new')
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page
    .getByPlaceholder('e.g. Green Lake playground, near the boathouse')
    .fill(PLACE)
  // V9 ticket 01: /new no longer asks for a neighbourhood — nothing to pick.
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  const start = await stepStartTimeOnce(page)
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await expect(page.getByText(`Ends ${start.endLabel(60)}`)).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  await page.getByRole('heading', { name: 'Near you' }).waitFor()
  const card = page.locator('a').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  const href = (await card.getAttribute('href')) ?? ''
  if (!href.startsWith('/playdate/')) {
    throw new Error(`The feed card for "${title}" has no detail href (got "${href}")`)
  }
  return href
}

/**
 * A fresh viewer marker: sign up + onboard (zip + radius) in a CLEAN
 * context (the comments.e2e.ts viewer pattern — the default context
 * carries the host marker's session, so each viewer gets its own). The
 * zip is the MARKER's own (the post is in-radius) + the default radius.
 */
async function createOnboardedViewer(
  browser: Browser,
  name: string,
  email: string,
  password: string,
  zip: string,
): Promise<Page> {
  const context = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.locator('input[autocomplete="nickname"]').fill(name)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('heading', { name: 'Set your location' }).waitFor()
  await page.getByPlaceholder('e.g. 98107').fill(zip)
  await page.locator('select').first().selectOption({ label: '5 miles' })
  await page.getByRole('button', { name: /^Continue/ }).click()
  await page.getByRole('heading', { name: 'Near you' }).waitFor()
  return page
}

test('a comment → reply renders nested, with the one-level + delete-permission pins', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e cmt-r ${epoch}`
  const parentBody = `e2e reply-parent ${epoch} — is the lot open on weekends?`
  const replyBody = `e2e reply ${epoch} — we’ll bring a stroller, hope that’s okay`
  const viewer1 = {
    name: `e2e-v-${epoch}-1`,
    email: `e2e-v-${epoch}-1@gmail.com`, // gmail.com: the project rejects example.com
    password: `e2e-v-pw-${epoch}-1`, // in-memory only — never written
  }
  const viewer2 = {
    name: `e2e-v-${epoch}-2`,
    email: `e2e-v-${epoch}-2@gmail.com`,
    password: `e2e-v-pw-${epoch}-2`,
  }
  // Sweep evidence (the marker accounts persist by the standing pattern —
  // the orchestrator's sweep family 10; exact emails resolved at sweep
  // time via the SQL API).
  console.log(
    `[e2e comment-replies] markers this run: host ${marker.email} (setup) + ` +
      `${viewer1.email} / ${viewer2.email} (viewers — persist by design, orchestrator sweep)`,
  )

  // (1) The host (the marker's signed-in default context) posts the
  //     drop-in — the thread it will host.
  const detailPath = await postMarkerDropIn(page, title)

  // (2) Viewer 1 (the PARENT's author) comments top-level (the plain
  //     composer — no reply-to mode yet).
  const v1 = await createOnboardedViewer(
    browser,
    viewer1.name,
    viewer1.email,
    viewer1.password,
    marker.homeZip,
  )
  await v1.goto(detailPath)
  await v1.getByRole('heading', { name: title, exact: true }).waitFor()
  // The comment section (0013, live). Pre-0023-apply it is HIDDEN (the
  // listComments 42703 -> the caught load nulls the thread, the 0022
  // DB-not-applied discipline) — the spec's documented RED-by-design
  // lands on this first section assertion (the composer absent).
  await expect(v1.locator('#comment-composer')).toBeVisible()
  await v1.locator('#comment-composer').fill(parentBody)
  await v1.getByRole('button', { name: 'Comment', exact: true }).click()
  const v1Thread = v1.locator('div.rounded-xl', { hasText: 'Comments (' })
  await expect(v1Thread.getByRole('heading', { name: 'Comments (1)', exact: true })).toBeVisible()
  const v1ParentGroup = v1Thread.locator('ul.mt-3 > li').filter({ hasText: parentBody })
  await expect(v1ParentGroup).toBeVisible()
  await expect(v1ParentGroup.locator('ul.ml-8')).toHaveCount(0) // flat before the reply

  // (3) Viewer 2 (the REPLY's author) taps "Reply" on the parent comment
  //     — the composer's "Replying to @handle" mode (the submit carries
  //     the parent's id as parent_id — 0023's insert; pre-apply that
  //     42703s and the error line is the designed surface) — and posts.
  const v2 = await createOnboardedViewer(
    browser,
    viewer2.name,
    viewer2.email,
    viewer2.password,
    marker.homeZip,
  )
  await v2.goto(detailPath)
  await v2.getByRole('heading', { name: title, exact: true }).waitFor()
  const v2Thread = v2.locator('div.rounded-xl', { hasText: 'Comments (' })
  await expect(v2Thread.getByText(parentBody)).toBeVisible()
  const v2ParentGroup = v2Thread.locator('ul.mt-3 > li').filter({ hasText: parentBody })
  await v2ParentGroup.getByRole('button', { name: 'Reply', exact: true }).click()
  await expect(
    v2Thread.locator('p').filter({ hasText: 'Replying to' }),
  ).toHaveText(`Replying to @${viewer1.name}`)
  await v2.locator('#comment-composer').fill(replyBody)
  await v2.getByRole('button', { name: 'Comment', exact: true }).click()
  // The nested render (0023 + the groupCommentsForRender seam): the
  // parent group's children ul (ml-8 indent) holds the reply row with
  // the 24px avatar (h-6 w-6); the header count includes the reply; the
  // reply row offers NO Reply (the one-level pin — top-level rows only).
  const nestedUl = v2ParentGroup.locator('ul.ml-8')
  await expect(nestedUl).toBeVisible()
  const replyRow = nestedUl.locator('> li').filter({ hasText: replyBody })
  await expect(replyRow).toBeVisible()
  await expect(replyRow.locator('.h-6.w-6')).toHaveCount(1) // the 24px avatar
  await expect(v2Thread.getByRole('heading', { name: 'Comments (2)', exact: true })).toBeVisible()
  await expect(replyRow.getByRole('button', { name: 'Reply', exact: true })).toHaveCount(0)
  await expect(v2ParentGroup.getByRole('button', { name: 'Reply', exact: true })).toHaveCount(1)

  // (4) The event's host: the reply row offers a Delete (the ticket's
  //     delete rule — the reply's author OR the event's host; 0013's
  //     unchanged comments_delete_author_or_host, 0023 header (d)).
  await page.goto(detailPath)
  await page.getByRole('heading', { name: title, exact: true }).waitFor()
  const hostThread = page.locator('div.rounded-xl', { hasText: 'Comments (' })
  const hostReplyRow = hostThread
    .locator('ul.mt-3 > li')
    .filter({ hasText: parentBody })
    .locator('ul.ml-8 > li')
    .filter({ hasText: replyBody })
  await expect(hostReplyRow.getByRole('button', { name: 'Delete', exact: true })).toBeVisible()

  // (5) The parent's author (viewer 1 — a DIFFERENT signed-in account, so
  //     the nested thread also proves there is no privacy wall on the
  //     thread): the reply row is visible but offers NO Delete (the pin
  //     — the parent's author does NOT delete replies; the per-row plan
  //     keys on the row's own author).
  await v1.reload()
  const v1bThread = v1.locator('div.rounded-xl', { hasText: 'Comments (' })
  const v1bParentGroup = v1bThread.locator('ul.mt-3 > li').filter({ hasText: parentBody })
  const v1bReplyRow = v1bParentGroup.locator('ul.ml-8 > li').filter({ hasText: replyBody })
  await expect(v1bReplyRow).toBeVisible()
  await expect(v1bReplyRow.locator('.h-6.w-6')).toHaveCount(1)
  await expect(v1bReplyRow.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0)
  // Per-row evaluation: the parent row itself still offers Delete to its
  // own author (the existing ticket-04 author delete, unchanged).
  await expect(v1bParentGroup.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(1)

  // (6) The reply's author (viewer 2) deletes the reply — the nested row
  //     is gone (the parent stays; the count back to (1)).
  await v2.reload()
  const v2bThread = v2.locator('div.rounded-xl', { hasText: 'Comments (' })
  const v2bParentGroup = v2bThread.locator('ul.mt-3 > li').filter({ hasText: parentBody })
  const v2bReplyRow = v2bParentGroup.locator('ul.ml-8 > li').filter({ hasText: replyBody })
  await expect(v2bReplyRow.getByRole('button', { name: 'Delete', exact: true })).toBeVisible()
  await v2bReplyRow.getByRole('button', { name: 'Delete', exact: true }).click()
  // V8 ticket 10: the delete confirms first (it used to fire on the tap). The
  // dialog names the reply's author; confirming is the tap that used to be the
  // whole action. The assertions below are unchanged.
  const replyConfirm = v2.getByTestId('comment-action-dialog')
  await expect(replyConfirm).toBeVisible()
  await expect(replyConfirm).toContainText('Delete this comment?')
  await replyConfirm.getByTestId('confirm-dialog-confirm').click()
  await expect(v2bParentGroup.locator('ul.ml-8')).toHaveCount(0) // the nested row is gone
  await expect(v2bThread.getByRole('heading', { name: 'Comments (1)', exact: true })).toBeVisible()
  await expect(v2bThread.getByText(parentBody)).toBeVisible() // the parent stays

  await v1.context().close()
  await v2.context().close()
})

test.afterEach(async () => {
  // Best-effort cleanup (per house): delete the HOST marker's playdate
  // rows via REST with the marker's own JWT (host-only DELETE policy);
  // the comments + replies cascade with the post (0013's playdate_id FK
  // + 0023's parent_id self-FK, both ON DELETE CASCADE — pre-apply the
  // reply insert never stood, so the cascade covers the parent comment
  // only). The marker accounts (the e2e- host + the e2e-v- viewers, no
  // playdate rows) are left for the orchestrator's sweep. A failure is
  // logged, not fatal.
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
    const check = await fetch(query, { headers })
    const remaining = check.ok
      ? ((await check.json()) as Array<Record<string, unknown>>)
      : null
    if (!del.ok || (remaining !== null && remaining.length > 0)) {
      console.log(
        `[e2e cleanup] FAILED — playdate delete HTTP ${del.status}, ` +
          `${remaining?.length ?? '?'} remain (host ${userId}) — orchestrator sweep (e2e- prefix) will pick them up`,
      )
    } else {
      console.log(
        `[e2e cleanup] ok — deleted host marker playdate row(s) (host ${userId}); ` +
          `comment + reply rows cascaded with the post (0013 / 0023)`,
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
