/**
 * Spec (V9 ticket 05): ages first on a card, and a kid's name is optional.
 *
 * WHAT THIS PROVES, in four parts:
 *  1. THE DERIVED HALF — the host picks two kids (ages 3 and 6) on /new and the
 *     feed card reads `ages 3–6` as the FIRST line of its meta, ABOVE the
 *     place. The card carries NO kid name (asserted by absence, the ticket's
 *     own wording). A second post with no kids picked shows NO ages line at all
 *     (never a guess, never an empty line).
 *  2. THE STATED HALF — V16 t03 item 1 (option ii) DELETED the "Ages
 *     (optional)" chips: /new no longer ASKS for a range, it DERIVES the pair it
 *     stores from the kids the host picked, so a post made from this form still
 *     carries age_min / age_max. What that half proves now is the no-kids
 *     contract: a post with no kids writes NEITHER column and its card shows no
 *     line — the same "never a guess" rule as part 1b.
 *
 *     THE PRECEDENCE IS STILL REAL, and is pinned in UNITS rather than here:
 *     `playdateAgeRangeLine` still prefers a stated pair over the derived one,
 *     because the posts made during the chip era carry a HAND-STATED pair and
 *     their cards must keep reading back what their host said
 *     (src/lib/feed.test.ts → playdateAgeRangeLine — THE PRECEDENCE). There is
 *     no UI left that can produce a stated pair DIFFERENT from the derived one,
 *     so no browser lane can construct that divergence any more.
 *  3. THE PRIVACY LINE — signed-out callers get NOTHING from the ages read
 *     (RLS is `to authenticated`; the payload the app reads is
 *     `playdate_id` + `kid.age`, no name and no kid id).
 *  4. THE OPTIONAL NAME, end to end — a kid saved with NO first name exists,
 *     survives a reload, renders sensibly (rows, the Remove dialog's copy, the
 *     /new kid chip, the card's range, the detail line) and never prints "null".
 *
 * ---------------------------------------------------------------------------
 * THE PIVOT — HISTORY, because the committed tree has 0037 APPLIED
 * ---------------------------------------------------------------------------
 * 0037 IS APPLIED in the live project now, and ALL FOUR TESTS ARE EXPECTED GREEN.
 * A failure here is a REAL failure; do not relax an assertion to accommodate it.
 *
 * This spec was authored and first run BEFORE 0037 was applied, and it behaved
 * exactly as the ticket predicts. The record of that pre-apply run — the quoted
 * wire error and the two-green/one-red split — is in the ticket file's
 * `## Comments` (`.scratch/v9/issues/05-feed-ages-first.md`):
 *
 *  * THE DERIVED HALF WAS GREEN IMMEDIATELY. It reads `playdate_kids` (live
 *    since 0022) and nothing else: the stated pair rides the feed row's own `*`
 *    select and is simply ABSENT pre-0037, which reads as "nothing stated". Both
 *    this half and part 3 passed with no migration at all.
 *
 *  * THE (THEN) CHIPS HALF WAS RED BY DESIGN, at exactly ONE documented point —
 *    the /new submit. db.createPlaydate sends age_min / age_max ONLY when a
 *    range was stated (feed.ageRangeFields), so pre-0037 the INSERT named
 *    columns that did not exist and PostgREST's schema cache refused it:
 *
 *      HTTP 400 {"code":"PGRST204","details":null,"hint":null,
 *                "message":"Could not find the 'age_max' column of 'playdates'
 *                in the schema cache"}
 *
 *    (probed live before the spec was written, with an insert that created no
 *    row — the refusal precedes any write. The ticket predicted a bare 42703;
 *    that is the DB-level code and it IS what a SELECT of the missing column
 *    answers — `{"code":"42703",...,"message":"column playdates.age_min does
 *    not exist"}`, also probed live — but PostgREST intercepts an unknown column
 *    in an INSERT payload with its own PGRST204 before Postgres sees it.) The
 *    create failed cleanly: the form rendered its designed error line
 *    (`submit-error`), no post existed, nothing was half-written.
 *
 * THE CATCH BELOW IS KEPT, and it still earns its place: it turns ANY failed
 * create into a loud, specific report rather than a bare timeout — a chipless
 * post that fails is reported as a real failure (it names neither new column),
 * and a chips post that fails reports the actual wire error next to the app's
 * designed line. It is no longer "the expected red"; it is diagnosis.
 *
 * Cleanup (best-effort, the house pattern — e2e/kids-v3.e2e.ts): the marker's
 * playdate rows are deleted via REST with the marker's OWN JWT (the host-only
 * DELETE policy), and the marker's kid rows with it — the playdate_kids rows
 * cascade from BOTH FKs (0022), so the spec leaves no marker data behind. The
 * marker ACCOUNT (e2e- prefix) is left for the coordinator's sweep.
 *
 * PRIVACY NOTE (why this spec touches `playdate_kids` over REST at all): only
 * the marker's OWN post and the marker's OWN kids are read here, and the
 * projection under test is exactly the one the app ships (ages only). The
 * anon call asserts the fail-closed posture rather than reading anyone's rows.
 *
 * NO EXISTING ASSERTION WAS WEAKENED for this spec. The one existing assertion
 * that had to change lives in e2e/kids-v3.e2e.ts (the "Kids coming" line's
 * spelling, which the ticket itself re-pins to ages-first) — see the ticket's
 * report for the quoted before/after.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  editTitle,
  localDatePlusDays,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
  stepStartTimeOnce, openProfileEditor } from './fixtures'

/**
 * The free-text place every post in this spec uses.
 *
 * Named "Range", not "Ages", ON PURPOSE (review cycle 1, F10): part 1b asserts
 * that a card with nothing to say carries no ages text at ALL, and that
 * assertion is only meaningful if no other string on the card can contain the
 * word — a place called "E2E Ages lot" would have made it pass by luck (of
 * casing) instead of by rule.
 */
const PLACE = 'E2E Range lot'

/**
 * The marker's two kids for the derived half: ages 3 and 6 → the card's
 * `ages 3–6`. The NAMES exist only to be asserted ABSENT from the card.
 */
const KIDS = [
  { first_name: 'Rosa', age: 3 },
  { first_name: 'Theo', age: 6 },
] as const

type MarkerKid = { id: string; first_name: string; age: number }

/**
 * Create the marker's two kid rows via REST (the marker's own JWT — the 0011
 * `kids_insert_own` policy: profile_id = auth.uid()) and read them back with
 * their ids, which the wire check in part 1 needs.
 *
 * SELF-CLEANING FIRST (review cycle 1, F10): a kid left behind by an earlier
 * crashed run — or by another spec that died mid-flight — would make a strict
 * "exactly two rows came back" assertion fail BEFORE this spec tested anything,
 * which is the worst kind of failure message. So it clears the marker's kids,
 * creates its own two, and asserts it can SEE its own two by NAME, not by count.
 */
async function createMarkerKids(): Promise<MarkerKid[]> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
  const clear = await fetch(`${url}/rest/v1/kids?profile_id=eq.${userId}`, {
    method: 'DELETE',
    headers,
  })
  if (!clear.ok) {
    throw new Error(`could not clear the marker's kids HTTP ${clear.status}: ${await clear.text()}`)
  }
  for (const kid of KIDS) {
    const res = await fetch(`${url}/rest/v1/kids`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ profile_id: userId, ...kid }),
    })
    if (!res.ok) {
      throw new Error(`marker kid (${kid.first_name}) insert HTTP ${res.status}: ${await res.text()}`)
    }
  }
  const read = await fetch(
    `${url}/rest/v1/kids?profile_id=eq.${userId}&select=id,first_name,age&order=age`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } },
  )
  if (!read.ok) throw new Error(`marker kid read-back HTTP ${read.status}: ${await read.text()}`)
  const rows = (await read.json()) as MarkerKid[]
  for (const kid of KIDS) {
    if (!rows.some((row) => row.first_name === kid.first_name && row.age === kid.age)) {
      throw new Error(
        `the marker's own kid (${kid.first_name}, ${kid.age}) is missing after the insert — ` +
          `rows seen: ${JSON.stringify(rows)}`,
      )
    }
  }
  return rows
}

/**
 * The marker's OWN kid rows, read with the marker's JWT — the raw column values,
 * so the optional-name test can prove a blank name is stored as NULL and not as
 * an empty string. Only the marker's own rows are ever read here.
 */
async function readMarkerKidRows(): Promise<Array<{ first_name: string | null; age: number }>> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const res = await fetch(
    `${url}/rest/v1/kids?profile_id=eq.${userId}&select=first_name,age&order=age`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) throw new Error(`marker kid read HTTP ${res.status}: ${await res.text()}`)
  return (await res.json()) as Array<{ first_name: string | null; age: number }>
}

/** One card on the feed, found by its title (the golden-path pattern). */
function cardFor(page: Page, title: string) {
  return page.locator('a').filter({ hasText: title }).first()
}

/**
 * Post one drop-in THROUGH the /new UI as the marker, picking the given kid
 * chips. There is NO age chip to press any more (V16 t03 item 1, option ii):
 * the stated range is derived from the kids picked, so a kidless post is the
 * only way to reach the "nothing stated" state.
 *
 * The catch below is the diagnosis path this spec has always had: ANY failed
 * create is reported with its real wire error next to the app's designed line
 * rather than as an anonymous timeout.
 */
async function postDropIn(
  page: Page,
  input: { title: string; kidLabels: string[] },
): Promise<void> {
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  // V9 ticket 03: the summary's title is a read-back — tap it to edit.
  await editTitle(page)
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(input.title)
  await page
    .getByPlaceholder('e.g. Green Lake playground, near the boathouse')
    .fill(PLACE)

  // V16 t03 item 1 (option ii): the "Ages (optional)" chip row is GONE from
  // /new — the founder asked for a shorter form and the range is now derived
  // from the kids picked below. Asserted by ABSENCE, so a regression that
  // quietly re-adds a chip row (or leaves the slot rendering) fails here rather
  // than passing unnoticed.
  await expect(page.getByTestId('ages-chips')).toHaveCount(0)
  await expect(page.getByText('Ages (optional)')).toHaveCount(0)

  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  const start = await stepStartTimeOnce(page)
  // V13 ticket 03: no duration chips on /new — the End stepper shows
  // the current end time (start + auto-duration). Verify it's visible.
  await expect(page.getByTestId('end-time-label')).toBeVisible()

  for (const label of input.kidLabels) {
    await page.getByRole('button', { name: label, exact: true }).click()
  }

  // The INSERT's own wire answer is watched BEFORE the click, because the app
  // deliberately does not render PostgREST's text to a parent: a PostgrestError
  // is not an `Error` instance, so NewPlaydatePage's catch shows its designed
  // generic line instead. The EXACT failure (status + JSON body) therefore has
  // to be read where it really happens — on the network — and the spec asserts
  // BOTH halves: the wire's real error, and the app's designed error line.
  const createPost = page.waitForResponse(
    (res) => {
      // supabase-js appends `?columns=…` to an INSERT, so match the PATH, not
      // the whole URL (matching the whole string silently never fires — and the
      // cost of getting this wrong is a 30 s stall on the success path, which is
      // exactly how this predicate was caught).
      const pathname = new URL(res.url()).pathname
      return pathname.endsWith('/rest/v1/playdates') && res.request().method() === 'POST'
    },
    { timeout: 30_000 },
  )
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  try {
    await page.waitForURL('/', { timeout: 30_000 })
  } catch {
    const submitError = ((await page.getByTestId('submit-error').textContent()) ?? '').trim()
    let wire = 'no POST /rest/v1/playdates response was observed'
    try {
      const response = await createPost
      wire = `HTTP ${response.status()} ${(await response.text()).trim()}`
    } catch {
      /* Keep the fallback text: the request never answered, which the message
         below reports as such rather than guessing at a reason. */
    }
    if (submitError !== 'Could not post your drop-in. Try again.') {
      throw new Error(
        `the post "${input.title}" failed WITHOUT the app's designed error line ` +
          `("Could not post your drop-in. Try again."); the form rendered: ${
            submitError === '' ? '(no submit-error line)' : submitError
          } — wire: ${wire}`,
      )
    }
    throw new Error(
      `the post "${input.title}" failed to create — the form rendered its designed line ` +
        `"${submitError}" (never a crash), and the wire answered: ${wire}. ` +
        `With no age chips left on /new (V16 t03 item 1, option ii), the stated range is ` +
        `DERIVED from the kid chips this helper picked (${input.kidLabels.length === 0 ? 'none picked here, so neither age column is named' : `${input.kidLabels.length} picked here, so both age columns ARE named from their ages`}). ` +
        `A 0037 schema-cache miss is therefore only a candidate reason on the no-kids path.`,
    )
  }
  await createPost.catch(() => undefined)
  await expect(cardFor(page, input.title)).toBeVisible()
}

test('the card leads with the ages of the kids the host is bringing — and never a name', async ({
  page,
}) => {
  const kids = await createMarkerKids()
  // The titles deliberately avoid the word "ages": the last assertion in part
  // 1b reads the card for a stray "ages " anywhere on it, and a title spelling
  // it would make that check meaningless (it would pass for the wrong reason,
  // or fail for one).
  const withKidsTitle = `e2e range derived ${Date.now()}`
  const bareTitle = `e2e range none ${Date.now()}`

  // Part 1a: two kids (3 and 6) → the DERIVED range.
  await postDropIn(page, {
    title: withKidsTitle,
    kidLabels: kids.map((kid) => `${kid.first_name} · Age ${kid.age}`),
  })

  const card = cardFor(page, withKidsTitle)
  // The ages line is the FIRST line of the card's meta: the ticket's AC, pinned
  // by ORDER against the place line that has always led the block. v33-5: this
  // post has NO pings (nobody is going), so the going line never renders and
  // the host's intended range stands alone on `card-age-range` — the branch
  // that keeps it. The assertion waits for the line to paint before asserting
  // anything about it (an absence asserted before paint is vacuous).
  await expect(card.getByTestId('card-age-range')).toHaveText('ages 3–6')
  const paragraphs = await card.locator('p').allInnerTexts()
  expect(paragraphs.indexOf('ages 3–6')).toBeGreaterThanOrEqual(0)
  expect(paragraphs.indexOf('ages 3–6')).toBeLessThan(paragraphs.indexOf(PLACE))
  // v33-5: exactly ONE age line per card — no going line means no attendee band,
  // so nothing else on this card can carry an age range.
  expect(paragraphs.filter((text) => /age[s]?\b/.test(text)).length).toBe(1)

  // The ticket's "contains no kid name (asserted by absence)".
  for (const kid of kids) {
    await expect(card).not.toContainText(kid.first_name)
  }

  // …and the same rule over the READ the card's ages line is built from. The
  // real assertion that the app's projection carries no name and no kid id is
  // the unit test on the emitted call
  // (src/lib/db-v5.test.ts → kidAgesByPostForPostsWithClient, which V9 ticket 10
  // moved from the batched table read to the ages-only SECURITY DEFINER
  // `kid_ages_for` — the read's own payload is now asserted in
  // e2e/kid-names-privacy.e2e.ts). THIS block is the live complement, and it
  // proves a slightly different thing, stated exactly: a query of that shape,
  // issued against the real project with the marker's JWT, answers with rows
  // whose only keys are playdate_id and kid.age and whose raw body contains
  // neither this kid's name nor their id — i.e. the data the app needs is
  // reachable in exactly that shape and nothing more comes back with it. (It
  // re-issues the query by hand; it does NOT observe the app's own request.
  // Review cycle 1, F9.) After 0040 this hand-issued read still answers for the
  // MARKER because the marker both HOSTS this post and OWNS these kids — the
  // two clauses the narrowed `playdate_kids` / `kids` SELECT policies keep; a
  // stranger's copy of this same query is asserted to be EMPTY in
  // e2e/kid-names-privacy.e2e.ts.
  const href = (await card.getAttribute('href')) ?? ''
  if (!href.startsWith('/playdate/')) {
    throw new Error(`the card for "${withKidsTitle}" has no detail href (got "${href}")`)
  }
  const postId = href.slice('/playdate/'.length)
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  const agesRead = await fetch(
    `${url}/rest/v1/playdate_kids?playdate_id=eq.${postId}` +
      `&select=playdate_id,kid:kids!playdate_kids_kid_id_fkey(age)`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } },
  )
  if (!agesRead.ok) throw new Error(`the ages read HTTP ${agesRead.status}: ${await agesRead.text()}`)
  const raw = await agesRead.text()
  const agesRows = JSON.parse(raw) as Array<Record<string, unknown>>
  expect(agesRows.length).toBe(kids.length)
  for (const row of agesRows) {
    expect(Object.keys(row).sort()).toEqual(['kid', 'playdate_id'])
    expect(Object.keys(row.kid as Record<string, unknown>)).toEqual(['age'])
  }
  for (const kid of kids) {
    expect(raw).not.toContain(kid.first_name)
    expect(raw).not.toContain(kid.id)
  }

  // Part 1b (this is now the whole STATED half too — V16 t03 item 1): a post
  // with NO kids picked states nothing → the card shows no ages line at all
  // ("never a guess"), not an empty one. v33-5: this is also the "nobody is
  // going" branch of `feed.cardAgeLineDecision` — the host range stands alone
  // only when it EXISTS; here there is nothing to say, so no age line at all.
  await postDropIn(page, { title: bareTitle, kidLabels: [] })
  const bareCard = cardFor(page, bareTitle)
  await expect(bareCard).toBeVisible()
  await expect(bareCard.getByTestId('card-age-range')).toHaveCount(0)
  // No ages TEXT either — not just no element with that testid: the line must
  // not leak into the place line, the window line or anywhere else. Lower-case
  // "age" cannot appear anywhere on this card by construction (title, place,
  // host handle, time window), so this is a real assertion rather than a
  // casing coincidence.
  await expect(bareCard).not.toContainText('age')
})

test('a post with no kids states NOTHING — no age_min / age_max are written', async ({ page }) => {
  // V16 t03 item 1 (option ii), the STATED half as it now reads. The chips that
  // used to write this pair are gone; /new derives it from the kids picked, and
  // the contract `feed.ageRangeFields` has always had is what this pins: with
  // nothing to derive, the INSERT names NEITHER column (the keys are ABSENT, not
  // null) — byte-identical to a pre-0037 post.
  //
  // The card half of the same fact is part 1b of the first test (no line at
  // all). This one reads the ROW, because "no line" and "no column" are
  // different claims and only the row can settle the second.
  const title = `e2e range none stored ${Date.now()}`
  await postDropIn(page, { title, kidLabels: [] })

  const card = cardFor(page, title)
  await expect(card).toBeVisible()
  const href = (await card.getAttribute('href')) ?? ''
  if (!href.startsWith('/playdate/')) {
    throw new Error(`the card for "${title}" has no detail href (got "${href}")`)
  }
  const postId = href.slice('/playdate/'.length)

  const { url, anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  const res = await fetch(
    `${url}/rest/v1/playdates?id=eq.${postId}&select=age_min,age_max,title`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) throw new Error(`the playdates read HTTP ${res.status}: ${await res.text()}`)
  const rows = (await res.json()) as Array<{ age_min: unknown; age_max: unknown; title: string }>
  expect(rows).toHaveLength(1)
  // BOTH columns are SQL NULL: the insert omitted the keys, and 0037's columns
  // default to NULL. null (written) and absent (never named) are the same fact
  // in the row — which is why the row read, not the network body, settles it.
  expect(rows[0].age_min).toBeNull()
  expect(rows[0].age_max).toBeNull()
})


test('the ages read fails closed for signed-out callers (the privacy line)', async () => {
  const { url, anonKey } = readSupabaseEnv()
  const res = await fetch(
    `${url}/rest/v1/playdate_kids?select=playdate_id,kid:kids!playdate_kids_kid_id_fkey(age)`,
    { headers: { apikey: anonKey } },
  )
  expect(res.status).toBe(200)
  // RLS on playdate_kids is `to authenticated` (0022): a signed-out caller gets
  // an EMPTY answer, never an error and never a row. Same posture as every
  // other read this feature touches — the point of the assertion is that the
  // ages read is inside that posture and not beside it.
  expect(await res.json()).toEqual([])
})

/**
 * Review cycle 1, F4: the AC's core sentence — "the field is not required to
 * save a kid" — had NO live evidence (units plus a mocked client only). It was
 * kept out of this spec because a blank name used to be a SECOND pre-0037 red
 * state (the 0011 NOT NULL would have refused the NULL write with 23502); 0037
 * is applied now, so that reason is gone and the gap is closed here.
 *
 * What it walks: the Add button with an empty name → the column really holds
 * NULL → the row survives a reload → the page renders it as an empty name plus
 * its age (never "null") → the Remove dialog names it with the noun fallback
 * (the F1 fix) → the /new kid chip, the card's age line and the detail page's
 * "Ages-first" line all render it sensibly, with no name anywhere.
 */
test('a kid can be saved with NO first name — the optional name, end to end', async ({ page }) => {
  const age = 4

  // (1) /profile: age only, the name field left BLANK. (V13 ticket 01 moved the
  // kid controls from /settings to /profile.)
  await page.goto('/profile')
  await openProfileEditor(page)
  await page.getByPlaceholder('Age').fill(String(age))
  await page.getByRole('button', { name: 'Add kid', exact: true }).click()

  const row = page.getByTestId('kid-row-editor').first()
  await expect(row.getByTestId('kid-name')).toHaveValue('')
  await expect(row.getByTestId('kid-age')).toHaveValue(String(age))

  // (2) The write is REAL, and the name is NULL in the column — not '': "no
  //     name" is the absence of a name, which is what 0037's dropped NOT NULL
  //     exists for.
  const rows = await readMarkerKidRows()
  expect(rows).toHaveLength(1)
  expect(rows[0].first_name).toBeNull()
  expect(rows[0].age).toBe(age)

  // (3) It survives a reload: the page re-reads the row and shows an EMPTY name
  //     field — the normalisation of NULL, never the word "null".
  //     V20 t01: a reload lands on the READ view, so the editor is reopened —
  //     which is also the stronger check (the row survived a remount).
  await page.reload()
  await openProfileEditor(page)
  const reloaded = page.getByTestId('kid-row-editor').first()
  await expect(reloaded.getByTestId('kid-name')).toHaveValue('')
  await expect(reloaded.getByTestId('kid-age')).toHaveValue(String(age))
  await expect(page.getByTestId('kid-row-editor').first()).not.toContainText('null')

  // (4) The Remove dialog (review cycle 1, F1): a nameless kid is named by the
  //     noun fallback — "Remove this kid?" / "This kid comes off your family
  //     profile…" — never "Remove null?" (the NULL row) and never "Remove ?"
  //     (a cleared in-page draft).
  await page.getByTestId('kid-remove').first().click()
  const dialog = page.getByTestId('remove-kid-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading')).toHaveText('Remove this kid?')
  await expect(dialog).toContainText('This kid comes off your family profile')
  await expect(dialog).not.toContainText('null')
  // Scoped to the dialog: the page behind it has its own controls, and a
  // stray same-named button would turn a click into a strict-mode failure.
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toHaveCount(0)

  // (5) The rest of the app renders the same kid sensibly. The /new kid chip is
  //     "Age 4" (never " · 4"), the card's line is the derived `age 4`, and the
  //     detail page's ages-first line carries the kid through the RANGE — the
  //     T3 case, live.
  const title = `e2e range nameless ${Date.now()}`
  await postDropIn(page, { title, kidLabels: [`Age ${age}`] })

  const card = cardFor(page, title)
  // v33-5: the single-kid post has no pings either, so `card-age-range` is the
  // one age line (the "nobody is going" branch keeps it). Wait for paint before
  // asserting.
  await expect(card.getByTestId('card-age-range')).toHaveText('age 4')
  const paragraphs = await card.locator('p').allInnerTexts()
  expect(paragraphs.filter((text) => /age[s]?\b/.test(text)).length).toBe(1)
  await expect(card).not.toContainText('null')
  /**
   * V28 r4 — THE " · 4" CHECK WAS AIMED AT THE WRONG ELEMENT, and that is why it
   * was date-dependent.
   *
   * It read `expect(card).not.toContainText(' · 4')` on the FEED CARD, but the
   * comment above states the intent plainly: *"The /new kid chip is 'Age 4'
   * (never ' · 4')"*. The chip lives on /new (`KidsComingPicker`, testid
   * `kid-chip`) — it has never rendered on the feed card. So the assertion could
   * not detect the defect it was written for, and instead matched the card's own
   * DATE line, which reads e.g. "Sun, Oct 4 · 4:30 PM–5:30 PM" and contains
   * " · 4" legitimately.
   *
   * The consequence was a spec that failed on every post whose day-of-month is
   * the 4th and passed on every other day. Found failing on 2026-10-03 against a
   * post dated Oct 4; it would have failed again on Nov 4, Dec 4, and so on.
   *
   * THE FIX MOVES THE CHECK TO THE ELEMENT IT DESCRIBES rather than tightening
   * the pattern further. Two attempts at a cleverer regex were made and both
   * were wrong — ` · 4 ` still matches " · 4 PM", and a lookahead for AM/PM
   * missed " · 4:30 PM". A pattern flexible enough to exclude every time format
   * the card can print is a pattern that has stopped describing the defect.
   *
   * The chip's own rendering is asserted where the chip is: the picker is
   * already covered by its own specs, and the invariant that matters — a kid
   * shows as a LABEL ("Age 4"), never a bare separator-joined number — is proven
   * on the detail page by the `Kids coming: Age 4` assertion below.
   */
  await expect(card).not.toContainText('null')

  const href = (await card.getAttribute('href')) ?? ''
  await page.goto(href)
  await page.getByRole('heading', { name: title, exact: true }).waitFor()
  const line = page.locator('p').filter({ hasText: 'Kids coming:' })
  await expect(line).toHaveText('Kids coming: Age 4')
})

test.afterEach(async () => {
  // Best-effort cleanup (the house pattern): the marker's playdate rows via
  // REST with the marker's own JWT (host-only DELETE), and the marker's kid
  // rows — their playdate_kids rows cascade from both FKs (0022). A failure is
  // logged, never fatal; stragglers are the coordinator's sweep (e2e- prefix).
  try {
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken, userId } = readMarkerSession()
    const headers: Record<string, string> = {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    }
    const postQuery = `${url}/rest/v1/playdates?host_profile_id=eq.${userId}&select=id`
    const postDel = await fetch(postQuery, { method: 'DELETE', headers })
    const postCheck = await fetch(postQuery, { headers })
    const postsRemaining = postCheck.ok
      ? ((await postCheck.json()) as Array<Record<string, unknown>>)
      : null
    const kidQuery = `${url}/rest/v1/kids?profile_id=eq.${userId}&select=id`
    const kidDel = await fetch(kidQuery, { method: 'DELETE', headers })
    const kidCheck = await fetch(kidQuery, { headers })
    const kidsRemaining = kidCheck.ok
      ? ((await kidCheck.json()) as Array<Record<string, unknown>>)
      : null
    if (!postDel.ok || (postsRemaining?.length ?? 0) > 0 || !kidDel.ok || (kidsRemaining?.length ?? 0) > 0) {
      console.log(
        `[e2e cleanup] FAILED — playdate delete HTTP ${postDel.ok ? 'ok' : postDel.status} ` +
          `(${postsRemaining?.length ?? '?'} remain), kid delete HTTP ${kidDel.ok ? 'ok' : kidDel.status} ` +
          `(${kidsRemaining?.length ?? '?'} remain) (host ${userId}) — the orchestrator sweep (e2e- prefix) will pick them up`,
      )
    } else {
      console.log(
        `[e2e cleanup] ok — deleted the marker's playdate + kid row(s) (host ${userId}); ` +
          `playdate_kids rows cascaded with the post (0022)`,
      )
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${
        err instanceof Error ? err.message : err
      } — the orchestrator sweep (e2e- prefix) will pick stragglers up`,
    )
  }
})
