/**
 * V9 ticket 03 — the twenty-second post: three decisions, the rest behind
 * "more".
 *
 * The ticket's claims, end to end against the live project:
 *
 *  1. THE INTERACTION BUDGET. From a cold /new to the feed: a place (typed once,
 *     picked in one tap) and Post — the duration is picked FOR the parent
 *     (V12 t02: the start slot auto-picks "until the next hour"; the override
 *     chips live behind "More options"). The spec COUNTS the interactions rather
 *     than describing them — a capture listener records every click AND every
 *     input/change, in sessionStorage so the count survives the navigation to
 *     the feed — and pins the AC (<= 3 taps + 1 typed place). Review cycle 1, F4:
 *     the touched-control SET is asserted exactly ({the place field, the picked
 *     row, Post}), because a click count alone cannot see a newly required
 *     non-click step.
 *  2. THE READ-BACK IS EXACT — AND IT IS NOW TITLE-ONLY (V13 ticket 02). The
 *     /new summary card shows the TITLE ONLY (`NewPlaydatePage` passes
 *     `summaryLines={[values.title]}` to the form), so `post-summary-line`
 *     yields exactly ONE line and every field that used to be a summary line is
 *     asserted against the control that actually SHOWS it:
 *
 *       - the day + duration  → the visible "When" section (`input[type=date]`
 *         and the `end-time-label` stepper), plus the row the submit writes;
 *       - the exact window    → `start-time-label` / `end-time-label`;
 *       - place (+ address)   → the place and address INPUTS (their own visible
 *         fields since V13 ticket 02 — place, then address, in that order).
 *
 *     THIS IS THE THIRD SWEEP OF THIS SAME STALENESS (V11 t05 moved the start
 *     date out of the disclosure, V13 t02 deleted the disclosure and made the
 *     card title-only). The old assertions read the DOM against
 *     `postSummaryLines(values, options)` output — a pure seam that STILL
 *     returns the old multi-line array but that `NewPlaydatePage` NO LONGER
 *     RENDERS. Do not re-add it: importing that seam for a DOM assertion is the
 *     bug, not the fixture. (The seam keeps its own unit tests; the DOM is
 *     asserted through the controls above.) The window is still computed from
 *     the SAME values the submit writes (bracketed around the mount, so neither
 *     a 30-minute boundary nor midnight can flake it) and is still checked
 *     against the card in the feed AND the row in the database.
 *  3. THE TITLE IS NO LONGER A QUESTION. It is generated ("Drop-in at
 *     <place>" — V23 renamed the prefix from "Playdate at …"), shown as a read-back line on the summary that a tap turns into
 *     the input in place (review cycle 1, F2 — so the place picker stays /new's
 *     FIRST field, ticket 01's AC), follows the place until the parent writes
 *     their own, comes back from empty, and never comes back blank. Until there
 *     are words to read back the line is the "Title" PROMPT in the quieter
 *     placeholder tone (postSummary.summaryTitleLine) — the GENERATED default
 *     ("Drop-in") is what the form HOLDS and what the submit writes, never what
 *     an empty form displays.
 *  4. THE DISCLOSURE IS GONE (V13 ticket 02). There is no "More options" door
 *     to open, so nothing that changes what will be posted can hide behind one:
 *     the address, the details, "Kids you're bringing" and — V12 t02 — the
 *     duration override chips all live in the visible flow (V11 ticket 05 had
 *     already moved the start date + the 30-minute stepper into the visible
 *     "When" section). This file therefore does NOT assert a summary read-back
 *     of the address or the weekly repeat: V13 ticket 02 made the card
 *     TITLE-ONLY, and the address is asserted where it is really shown — its own
 *     visible input — and the repeat is gone from /new entirely (V15 T05).
 *  5. NOTHING REQUIRED BEHIND A DOOR — because there is no door. V13 ticket 02
 *     deleted the disclosure outright (MORE_OPTIONS_FIELDS is empty), so a
 *     submit that fails on the start date shows its error in the visible "When"
 *     section and there is no door state left to check.
 *  6. NOTHING STALE SURVIVES A RETYPE. Picking a place writes its published
 *     street into the (now visible) address input; typing over the place text
 *     drops that street with it (review cycle 1, F1) — while an address the
 *     parent TYPED survives. Both halves are asserted against that address INPUT,
 *     which is what the parent sees and what the submit reads.
 *  7. THE PHONE PASS. scripts/mobile-audit.mjs walks only the SIGNED-OUT routes
 *     (/login and the public detail page — recorded V8 ticket 01 finding #5), so
 *     it cannot cover /new: the ticket's mobile AC is asserted HERE instead, at
 *     320/375/390/430 x portrait and 667x375 landscape — no horizontal overflow
 *     and every visible control at least 44px tall (the script's own tap-target
 *     rule). V13 ticket 02: the form is always fully visible, so there is no
 *     collapsed/expanded pass to run.
 *
 * Cleanup mirrors golden-path.e2e.ts / quick-post.e2e.ts: a best-effort REST
 * delete of the marker's playdate rows with the marker's own JWT (the host-only
 * DELETE policy is the wall). The spec posts at most one drop-in per test, with
 * no kids, no series and no comments of its own, so nothing is left hanging off
 * a deleted row; the e2e-<epoch> prefix would mark any straggler for the
 * orchestrator's sweep.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  computeEndIso,
  computeStartIso,
  defaultStartDateIso,
  localDayKey,
  nextSlotMinutes,
  suggestedDurationMinutes,
} from '../src/lib/feed'
import type { PlaydateFormValues } from '../src/lib/feed'
import { MORE_OPTIONS_FIELDS } from '../src/lib/feed'
import { BROWSE_PLACES_LABEL, PLACE_PICKER_LABEL } from '../src/lib/places'
import { generatedTitle, SUMMARY_TITLE_PLACEHOLDER } from '../src/lib/postSummary'
import {
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'
const ADDRESS_PLACEHOLDER = 'e.g. 7200 4th Ave NE, near the boathouse'
const DETAILS_PLACEHOLDER = 'Anything parents should know — what to bring, parking, weather plan…'

/** A real seeded playground (0029's seed) — the same one post-location uses. */
const PLACE_NAME = 'Green Lake Park'
/** A free-text place the directory does not know (the "Somewhere else" path). */
const FREETEXT_PLACE = 'E2E post-fast lot'
/** An address the SPEC types by hand — the parent's own value (F1's other half). */
const TYPED_ADDRESS = '1234 E2E Ave NE'

const DURATION_CHIP_LABELS = ['1h', '1.5h', '2h', '3h']

/** The marker's row for `title` (newest first), or null. */
interface MarkerRow {
  id: string
  title: string
  place: string
  address: string | null
  starts_at: string
  ends_at: string
  place_id: string | null
}

function markerHeaders(): Record<string, string> {
  const { anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  return {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

async function readMarkerPost(title: string): Promise<MarkerRow | null> {
  const { url } = readSupabaseEnv()
  const { userId } = readMarkerSession()
  const query =
    `${url}/rest/v1/playdates?host_profile_id=eq.${userId}` +
    `&title=eq.${encodeURIComponent(title)}&order=created_at.desc&limit=1` +
    `&select=id,title,place,address,starts_at,ends_at,place_id`
  const res = await fetch(query, { headers: markerHeaders() })
  const rows = res.ok ? ((await res.json()) as MarkerRow[]) : []
  return rows[0] ?? null
}

/**
 * The seeded directory row's own address, read from the places table — so the
 * spec's expectation for the read-back is the DIRECTORY's value (what the pick
 * writes), never a hardcoded copy of it that could drift from the seed.
 */
async function readPlaceAddress(placeName: string): Promise<string> {
  const { url } = readSupabaseEnv()
  const query = `${url}/rest/v1/places?name=eq.${encodeURIComponent(placeName)}&select=address`
  const res = await fetch(query, { headers: markerHeaders() })
  const rows = res.ok ? ((await res.json()) as Array<{ address: string | null }>) : []
  return rows[0]?.address ?? ''
}

/**
 * The summary card's lines — and since V13 ticket 02 there is exactly ONE.
 *
 * The card is TITLE-ONLY: `NewPlaydatePage` passes `summaryLines={[values.title]}`,
 * so `post-summary-line` holds the title. This helper USED to be read against
 * `postSummaryLines(values, options)` (src/lib/postSummary.ts) — a pure seam that
 * still returns the old multi-line array (day · duration, window, place · address)
 * but that the /new page NO LONGER RENDERS. That is the whole third-sweep
 * lesson: the seam is not the DOM. Assert the fields on the controls that
 * actually show them (the `start-time-label` / `end-time-label` steppers, the
 * place + address inputs), not on this array.
 */
async function summaryLines(page: Page): Promise<string[]> {
  const lines = page.getByTestId('post-summary-line')
  await expect(lines.first()).toBeVisible()
  return lines.allInnerTexts()
}

/**
 * Assert the TITLE-ONLY summary (V13 ticket 02) reads back `candidates`, one
 * title each — the values the page can legitimately be holding. Two candidates
 * where a test brackets the mount (the generated title depends only on the
 * place, but keeping the shape lets the mount-bracket stay explicit); the card
 * is exactly one line, so an old multi-line read-back fails loudly here rather
 * than silently passing.
 */
async function expectTitleOnlySummary(page: Page, candidates: string[]): Promise<string[]> {
  const lines = await summaryLines(page)
  expect(lines, 'V13 ticket 02: the summary card is TITLE ONLY — exactly one line').toHaveLength(
    1,
  )
  expect(candidates).toContain(lines[0])
  return lines
}

/** The form's values as the page computes them for one `now`. */
function mountValues(nowIso: string, patch: Partial<PlaydateFormValues> = {}): PlaydateFormValues {
  return {
    title: '',
    place: '',
    neighborhoodId: '',
    startDate: defaultStartDateIso(nowIso),
    startMinutes: nextSlotMinutes(nowIso),
    // V12 t02: /new auto-picks the duration from the start slot — the page's
    // mount default now carries it, mirroring NewPlaydatePage's initialValues.
    durationMinutes: suggestedDurationMinutes(nowIso),
    ageHint: '',
    details: '',
    ...patch,
  }
}

/**
 * Record every interaction from here until the page navigates, and keep the
 * record across that navigation (sessionStorage, same origin + same tab).
 *
 * A real count, not a description: the AC is a number, so the number is
 * measured. It is installed AFTER settleOnRoute on purpose — the route's own
 * settling (a client-side hop, if the cold load lost the race) is not part of
 * the parent's posting flow.
 *
 * TWO records (review cycle 1, F4): the tap COUNT (the AC's unit) and the SET of
 * controls touched by a click, an input or a change. The set is the stronger
 * claim — "Nothing else may be required" — and it is what catches a newly
 * required step that types instead of taps, which a click counter cannot see.
 * Each control is keyed by its own testid / placeholder / aria-label, or its
 * text, so the assertion below can name what was touched.
 */
async function installInteractionRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    sessionStorage.setItem('e2e-post-fast-taps', '0')
    sessionStorage.setItem('e2e-post-fast-touched', '[]')
    const record = (event: Event): void => {
      const node = event.target
      if (!(node instanceof Element)) return
      const control = node.closest('button, input, textarea, select, a') ?? node
      const key =
        control.getAttribute('data-testid') ||
        control.getAttribute('placeholder') ||
        control.getAttribute('aria-label') ||
        (control.textContent ?? '').trim().slice(0, 32) ||
        control.tagName.toLowerCase()
      const seen = JSON.parse(sessionStorage.getItem('e2e-post-fast-touched') ?? '[]') as string[]
      if (!seen.includes(key)) seen.push(key)
      sessionStorage.setItem('e2e-post-fast-touched', JSON.stringify(seen))
      if (event.type === 'click') {
        const taps = Number(sessionStorage.getItem('e2e-post-fast-taps') ?? '0')
        sessionStorage.setItem('e2e-post-fast-taps', String(taps + 1))
      }
    }
    for (const type of ['click', 'input', 'change']) {
      document.addEventListener(type, record, true)
    }
  })
}

async function readTapCount(page: Page): Promise<number> {
  return Number((await page.evaluate(() => sessionStorage.getItem('e2e-post-fast-taps'))) ?? '0')
}

async function readTouchedControls(page: Page): Promise<string[]> {
  return page.evaluate(
    () => JSON.parse(sessionStorage.getItem('e2e-post-fast-touched') ?? '[]') as string[],
  )
}

/**
 * Minutes since local midnight from EITHER of the app's two time labels.
 *
 * The summary speaks `feed.formatTimeLabel` ("3:30 PM", always with minutes);
 * the FEED CARD speaks `feed.formatTimeWindow` (locale-formatted, and it drops
 * the ":00" of an on-the-hour time — "10 AM"). Comparing the two read-backs
 * therefore has to go through the minutes they both mean. `fixtures.parseTimeLabel`
 * is the stepper's own parser and refuses "10 AM" on purpose (the stepper never
 * renders that), which is exactly what this one adds.
 */
function parseAnyTimeLabel(label: string): number {
  const match = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i.exec(label.trim())
  if (match === null) throw new Error(`Not a time label: "${label}"`)
  const hour12 = Number(match[1]) % 12
  const base = match[3].toUpperCase() === 'PM' ? hour12 + 12 : hour12
  return base * 60 + Number(match[2] ?? '0')
}

/** Minutes since local midnight, wrapped onto a single day. */
const DAY_MINUTES = 24 * 60
function wrapMinutes(minutes: number): number {
  return ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
}

/** "3:30 PM–4:30 PM" → [startMinutes, endMinutes] (either label format). */
function parseWindowLine(line: string): [number, number] {
  const [start, end] = line.split('–')
  expect(end, `the window line must be a start–end range: "${line}"`).toBeTruthy()
  return [parseAnyTimeLabel(start), parseAnyTimeLabel(end)]
}

/** Minutes since local midnight of an ISO instant, on the spec's own clock. */
function localMinutes(iso: string): number {
  const date = new Date(iso)
  return date.getHours() * 60 + date.getMinutes()
}

/**
 * "Sat, Sep 12" for an ISO instant, from NODE's own English date formatting —
 * deliberately NOT `feed.formatStartDayLabel` (review cycle 1, F7): comparing
 * the summary's day line against the same seam that produced it would pass even
 * if that seam were wrong, which is not a check. `toDateString()` gives
 * "Sat Sep 12 2026", so the words are lifted out of it.
 */
function nodeDayLabel(iso: string): string {
  const date = new Date(iso)
  const text = date.toDateString()
  return `${text.slice(0, 3)}, ${text.slice(4, 7)} ${date.getDate()}`
}

/**
 * Every visible control inside the form (which contains the summary), with its
 * rendered height — the shape scripts/mobile-audit.mjs measures on the
 * signed-out routes: `button, a[href], label[for]`, plus the inputs, skipping
 * zero-size elements and inline links (running text, not controls).
 */
async function measureControls(
  page: Page,
): Promise<{
  controls: Array<{ label: string; height: number }>
  scrollWidth: number
  innerWidth: number
}> {
  return page.evaluate(() => {
    const selector =
      'form button, form a[href], form label[for], form input, form textarea, form select'
    const controls: Array<{ label: string; height: number }> = []
    for (const el of Array.from(document.querySelectorAll(selector))) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (getComputedStyle(el).display === 'inline') continue
      const label = (
        el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') ||
        el.textContent ||
        ''
      )
        .trim()
        .slice(0, 32)
      controls.push({
        label: `${el.tagName.toLowerCase()} "${label}"`,
        height: Math.round(rect.height),
      })
    }
    return {
      controls,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }
  })
}

test('a cold /new is posted in three taps or fewer, typing exactly one place', async ({ page }) => {
  // The title is GENERATED now — the parent types a place and nothing else.
  const title = generatedTitle(PLACE_NAME)
  // The street the PICK will write, read from the directory itself: the summary
  // must read it back, and the row must carry it (F1).
  const pickedAddress = await readPlaceAddress(PLACE_NAME)
  expect(pickedAddress, `the seeded place "${PLACE_NAME}" must have an address`).not.toBe('')

  // Bracket the mount: the form computes its defaults ONCE, at mount, between
  // these two reads (the quick-post pattern).
  const beforeMount = new Date().toISOString()
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  const afterRead = new Date().toISOString()

  await installInteractionRecorder(page)

  // (a) The page opens on the SUMMARY — and V13 ticket 02 made that card
  //     TITLE ONLY, so it reads back the title and NOTHING else. The
  //     day and the slot it opened with are NOT summary lines any more: they are
  //     asserted on the controls that really show them, below.
  //
  //     The line's WORDS are the new display rule (postSummary.summaryTitleLine):
  //     a title the parent has not written is the "Title" PROMPT, not the
  //     generated default ("Drop-in") the form holds — an empty form must not
  //     look as though it already has a title. The form VALUE is unchanged (see
  //     the new-form-draft spec, which still pins it); only this line's text is.
  await expectTitleOnlySummary(page, [SUMMARY_TITLE_PLACEHOLDER])
  // The title read-back is a PROMPT, not a value, until the parent writes one —
  // and there is no title INPUT in the form at all (review cycle 1, F2): the
  // summary's title line becomes the input when it is tapped, which is what keeps
  // the place picker /new's first field (ticket 01's AC) and makes the title not
  // a question.
  await expect(page.getByTestId('title-line')).toHaveText(SUMMARY_TITLE_PLACEHOLDER)
  await expect(page.getByPlaceholder(TITLE_PLACEHOLDER)).toHaveCount(0)

  // (b) The decisions are visible: the place picker and Post — and the duration
  //     is picked FOR the parent (V13 ticket 03): the End stepper shows
  //     start + auto-duration in the visible flow, no "How long" label, no chips.
  await expect(page.getByText(PLACE_PICKER_LABEL, { exact: true })).toBeVisible()
  await expect(page.getByTestId('browse-places')).toHaveText(BROWSE_PLACES_LABEL)
  await expect(page.getByTestId('end-time-label')).toBeVisible()
  await expect(page.getByRole('button', { name: '1h', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Post drop-in' })).toBeVisible()

  // (c) ONE typed place, one tap to pick it (the suggestion row).
  const placeInput = page.getByPlaceholder(PLACE_PLACEHOLDER)
  await placeInput.fill(PLACE_NAME)
  const suggestion = page.getByTestId('place-suggestions').getByText(PLACE_NAME, { exact: true })
  await expect(suggestion).toBeVisible()
  await suggestion.click()

  // The summary now reads back the PLACE-GENERATED TITLE (the parent typed
  // nothing into it), and the street the pick wrote (F1) is asserted where it is
  // really shown — the visible address INPUT (V13 ticket 02).
  await expectTitleOnlySummary(page, [title])
  await expect(page.getByPlaceholder(PLACE_PLACEHOLDER)).toHaveValue(PLACE_NAME)
  await expect(page.getByPlaceholder(ADDRESS_PLACEHOLDER)).toHaveValue(pickedAddress)
  await expect(page.getByTestId('title-line')).toHaveText(title)

  // (d) No tap for how long (V12 t02): the start slot picked the duration at
  //     mount — "until the next hour". V13 ticket 02: the WINDOW is no longer a
  //     summary line — it is read off the two steppers that show it, the start
  //     (`start-time-label`) and the end (`end-time-label`), which is the same
  //     window the submit writes (`start + durationMinutes`). `now` is read ONCE
  //     at mount and bracketed by beforeMount/afterRead, so a run crossing a
  //     30-minute boundary still matches one of the two candidates.
  const windowCandidates = [mountValues(beforeMount), mountValues(afterRead)].map(
    (values) => [values.startMinutes, values.startMinutes + values.durationMinutes] as const,
  )
  const readStepper = async (testid: string): Promise<string> =>
    (await page.getByTestId(testid).innerText()).replace(/\s+/g, ' ').trim()
  // Each stepper is parsed on its OWN: `parseAnyTimeLabel` folds a label onto a
  // single day, so a window that crosses midnight would read as a NEGATIVE
  // duration if the two were parsed as one range. Comparing the steppers as a
  // pair of wall-clock minutes is exact for both cases.
  const [shownStart, shownEnd] = [
    parseAnyTimeLabel(await readStepper('start-time-label')),
    parseAnyTimeLabel(await readStepper('end-time-label')),
  ]
  expect(
    windowCandidates.map(([start, end]) => [start, wrapMinutes(end)]),
    `the visible When section must show the mounted window (start stepper "${await readStepper(
      'start-time-label',
    )}", end stepper "${await readStepper('end-time-label')}")`,
  ).toContainEqual([shownStart, shownEnd])
  // The auto-picked duration is one hour (V12 t02) — modulo the day, so a
  // 11:30 PM start ending at 12:30 AM is still the one-hour window it promises.
  expect(wrapMinutes(shownEnd - shownStart)).toBe(60)
  const [summaryStart, summaryEnd] = [shownStart, shownEnd]
  // The visible "When" section's date input, read HERE — the form is gone once
  // the submit navigates to the feed, so this is the last moment it exists (V13
  // ticket 02: the day is a visible control, not a summary line).
  const shownDate = await page.locator('input[type="date"]').inputValue()
  expect(shownDate, 'the visible start date must be answered before posting').not.toBe('')

  // (e) Post — the last decision. Nothing else was touched: no date, no time
  //     (both sit in the visible "When" section now — V11 ticket 05 — and the
  //     duration was picked FOR the parent at mount — V12 t02 — so the ledger's
  //     set and the budget are unchanged), no address, no kids, no details, no
  //     title.
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  const taps = await readTapCount(page)
  const touched = await readTouchedControls(page)
  console.log(
    `[e2e post-fast] cold /new → feed: ${taps} tap(s); controls touched: ` +
      `${touched.map((key) => `"${key}"`).join(', ')}. AC pin: <= 3 taps + the typed place.`,
  )
  expect(taps, 'the AC pins the interaction budget at three taps (plus the typed place)').toBeLessThanOrEqual(3)
  // …and the count is real: the pick and Post are two clicks, or three if the
  // typing itself is counted as one.
  expect(taps).toBeGreaterThanOrEqual(2)
  // The SET is the stronger pin (review cycle 1, F4): exactly three controls
  // were touched — the place field (typed), the picked row (tapped) and Post
  // (tapped). A fourth would be a step the parent now has to take, whatever its
  // event type.
  expect(touched).toHaveLength(3)
  expect(touched).toContain(PLACE_PLACEHOLDER)
  expect(touched).toContain('Post drop-in')
  expect(
    touched.some((key) => key.startsWith(PLACE_NAME)),
    `the picked suggestion row must be one of the touched controls (got ${JSON.stringify(touched)})`,
  ).toBe(true)

  // (f) What landed: the summary's read-back, the feed's card, and the row in
  //     the database all say the same thing.
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  const card = page.locator('a').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  // The card's PLACE line (DropInCard) is exactly the place the summary read
  // back — not a reshaped version of it. (V9 ticket 05 puts an AGE RANGE above
  // the place when a card has one to show; this post has none — no kids picked,
  // and since V16 t03 item 1 there is no "Ages (optional)" chip that could state
  // one. e2e/feed-ages is where the ages line's position above the place is
  // pinned.)
  //
  // V25 ticket 05: read by `data-testid`, NOT by a `p` index. The card now leads
  // with its own WHEN line ("Sat, Sep 26 · 10 AM–11 AM"), so the place is no
  // longer the first <p> — an index would have silently asserted the wrong
  // element (and did, in this file's own history). The testid is the seam.
  await expect(card.getByTestId('card-place')).toHaveText(PLACE_NAME)

  const row = await readMarkerPost(title)
  expect(row, 'the posted drop-in must exist in the database').not.toBeNull()
  expect(row?.place).toBe(PLACE_NAME)
  expect(row?.place_id, 'the picked place carries its id').toBeTruthy()
  // The address: the street the pick wrote, read back in the visible address
  // input the parent saw (V13 ticket 02 — no longer a summary line), and carried
  // by the row (it is what the Maps link is built from).
  expect(row?.address).toBe(pickedAddress)
  // The day: the date the visible "When" section showed before the submit is the
  // day of the instant that was written — the same calendar day, compared
  // through NODE'S own formatting on both sides rather than the app's seam (F7).
  // V13 ticket 02: the day is a visible DATE INPUT now, not a summary line, and
  // V15 T05: the store also carries the time, so the input's DATE part is what
  // this compares (read before the post — see above).
  expect(nodeDayLabel(row?.starts_at ?? '')).toBe(nodeDayLabel(`${shownDate}T12:00:00`))
  // The window: exactly the start and end the two steppers showed (compared
  // modulo the day, so a window that crosses midnight is still the one hour the
  // steppers promised). V13 ticket 02: the steppers are where the window is
  // shown now — there is no summary window line to read.
  expect(localMinutes(row?.starts_at ?? '')).toBe(summaryStart)
  expect(localMinutes(row?.ends_at ?? '')).toBe(summaryEnd)
  expect(wrapMinutes(summaryEnd - summaryStart)).toBe(60)
  // …and the feed's card shows that same window, on the card's WHEN line (V25
  // ticket 05: `data-testid="card-when"` — the card's own formatTimeWindow of
  // the stored instants, now with the day in front of it, which is why this
  // parses the window out of the line rather than comparing the whole string).
  const whenText = (await card.getByTestId('card-when').innerText()).replace(/\s+/g, ' ').trim()
  const [cardStart, cardEnd] = parseWindowLine(whenText)
  expect([cardStart, cardEnd]).toEqual([summaryStart, summaryEnd])
})

/**
 * v33-7a — the founder's "I don't want it to be telling people it has to be an
 * hour" (annotation muyefjzq), proven end to end: a 30-minute window is
 * postable from /new's own End stepper, and the row in the database carries
 * that exact span.
 *
 * The defect this spec pins: the End stepper writes `durationMinutes =
 * (end − start) mod 1440` (PlaydateFormFields' endBlock), so one step of the
 * End control yields a 30-minute window — reachable from the app's own
 * controls, yet `validatePlaydateForm` refused it with "Pick a duration."
 * because its gate was chip membership (`isDuration`). The fix swaps the gate
 * for `isPostableDuration` (positive, on the 30-minute grid, up to 24h); this
 * spec proves the round trip: the stepper shows the 30-minute window, the
 * submit lands, and the LIVE ROW reads back `start_at` / `ends_at` exactly 30
 * minutes apart.
 */
test('a 30-minute window posts and the live row carries the exact span (v33-7a)', async ({ page }) => {
  // The marker's seeded place — the same directory row post-fast uses.
  const pickedAddress = await readPlaceAddress(PLACE_NAME)
  expect(pickedAddress, `the seeded place "${PLACE_NAME}" must have an address`).not.toBe('')
  const title = generatedTitle(PLACE_NAME)

  await page.goto('/new')
  await settleOnRoute(page, '/new')

  // (a) Pick the place (one tap, as the cold-post test does).
  const placeInput = page.getByPlaceholder(PLACE_PLACEHOLDER)
  await placeInput.fill(PLACE_NAME)
  const suggestion = page.getByTestId('place-suggestions').getByText(PLACE_NAME, { exact: true })
  await expect(suggestion).toBeVisible()
  await suggestion.click()
  await expect(placeInput).toHaveValue(PLACE_NAME)

  // (b) Read the mounted window off the two steppers (the visible "When"
  //     section — V11 t05 / V13 t02: the steppers are where the window shows).
  const readStepper = async (testid: string): Promise<string> =>
    (await page.getByTestId(testid).innerText()).replace(/\s+/g, ' ').trim()
  const shownStart = parseAnyTimeLabel(await readStepper('start-time-label'))
  const shownEndBefore = parseAnyTimeLabel(await readStepper('end-time-label'))
  // The mount auto-picks "until the next hour" (V12 t02) — a 60-minute window.
  expect(wrapMinutes(shownEndBefore - shownStart)).toBe(60)

  // (c) Step the End stepper ONCE EARLIER: the 30-minute window. This is the
  //     reachable-but-refused value the slice fixes — before v33-7a, the
  //     submit below would have failed with "Pick a duration."
  await page.getByRole('button', { name: 'Earlier end time' }).click()
  const shownEnd = parseAnyTimeLabel(await readStepper('end-time-label'))
  expect(wrapMinutes(shownEnd - shownStart), 'one earlier step must yield the 30-minute window').toBe(30)

  // (d) Post. The form's validator now accepts the 30-minute duration
  //     (isPostableDuration), so the submit lands.
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()

  // (e) THE LIVE ROW: read start_at / ends_at back from the database and
  //     prove the exact 30-minute span. The expected instants are computed
  //     from the SAME values the form wrote (the row's own day + the
  //     stepper's start + 30), so the comparison is exact, not approximate.
  //     The DB stores timestamptz as `+00:00` (not `Z`), so compare through
  //     Date.parse, not string equality.
  const row = await readMarkerPost(title)
  expect(row, 'the posted drop-in must exist in the database').not.toBeNull()
  const rowDay = localDayKey(row?.starts_at ?? '')
  const expectedStartIso = computeStartIso(rowDay, shownStart)
  const expectedEndIso = computeEndIso(rowDay, shownStart, 30)
  console.log(
    `[e2e v33-7a] live row: start_at=${row?.starts_at} ends_at=${row?.ends_at} ` +
      `span=${Math.round((Date.parse(row?.ends_at ?? '') - Date.parse(row?.starts_at ?? '')) / 60_000)}min`,
  )
  expect(Date.parse(row?.starts_at ?? ''), 'the row\'s start_at must match the stepper\'s start').toBe(
    Date.parse(expectedStartIso),
  )
  expect(Date.parse(row?.ends_at ?? ''), 'the row\'s ends_at must be start + 30 minutes').toBe(
    Date.parse(expectedEndIso),
  )
  expect(Date.parse(row?.ends_at ?? '') - Date.parse(row?.starts_at ?? '')).toBe(30 * 60_000)
})

/**
 * v33-7b — START AND END READ AS ONE WINDOW, AND STEPPING ONE END NEVER
 * SILENTLY DRAGS THE OTHER.
 *
 * The founder (muyefjzq, second half): *"There's got to be a more elegant and
 * refined way to show off setting your start time and your end time. And I don't
 * want them to be linked together because people can make it as long or as short
 * as they want it to be."*
 *
 * THE DEFECT THIS PINS IS THE SILENT DRAG, not the geometry. Before this slice
 * the Start stepper wrote `startMinutes` alone and left `durationMinutes`
 * untouched, so the END rode along with every start step — the two were exactly
 * the "linked together" the founder rejected, and nothing on screen said so.
 *
 * WHAT IS PROVEN HERE, in the order the acceptance lists it:
 *   1. one window: both steppers sit in one section (`window-section`) under a
 *      single "When" heading, and their boxes share a band at 390px;
 *   2. the LENGTH survives a step of either end (the "as long or as short as
 *      they want" half);
 *   3. stepping an end INTO the other one keeps a 30-minute window AND SHOWS THE
 *      NOTE — asserted on the rendered text, then its absence in the ordinary
 *      case (a note that is always on proves nothing);
 *   4. no copy on /new states or implies a fixed length.
 */
test('Start and End are one window, and stepping one end never silently drags the other (v33-7b)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/new')
  await settleOnRoute(page, '/new')

  const readStepper = async (testid: string): Promise<number> =>
    parseAnyTimeLabel(
      (await page.getByTestId(testid).innerText()).replace(/\s+/g, ' ').trim(),
    )

  // ----------------------------------------------------------------
  // AC 1: ONE WINDOW — one section, one heading, one band.
  // ----------------------------------------------------------------
  const section = page.getByTestId('window-section')
  await expect(section).toHaveCount(1)
  // A SINGLE heading for the pair. `getByText('When')` is scoped to the section's
  // PARENT (the section itself holds the two end labels), so this counts the
  // heading over both steppers rather than one per end.
  await expect(page.getByTestId('window-section').locator('xpath=..').getByText('When', { exact: true })).toHaveCount(1)
  // ...and inside the section there is exactly ONE "Start" and ONE "End" label,
  // so the two steppers are the two ends of one answer.
  await expect(section.getByText('Start', { exact: true })).toHaveCount(1)
  await expect(section.getByText('End', { exact: true })).toHaveCount(1)

  const startBox = await page.getByTestId('start-time-label').boundingBox()
  const endBox = await page.getByTestId('end-time-label').boundingBox()
  const sectionBox = await section.boundingBox()
  expect(startBox, 'the start stepper must render').not.toBeNull()
  expect(endBox, 'the end stepper must render').not.toBeNull()
  expect(sectionBox, 'the window section must render').not.toBeNull()
  // ONE BAND: both steppers live inside the section's own box (not merely on the
  // page), which is what "read as one window" means structurally.
  for (const [name, box] of [['start', startBox!], ['end', endBox!]] as const) {
    expect(box.y, `the ${name} stepper must sit inside the window section`).toBeGreaterThanOrEqual(
      sectionBox!.y - 1,
    )
    expect(
      box.y + box.height,
      `the ${name} stepper must end inside the window section`,
    ).toBeLessThanOrEqual(sectionBox!.y + sectionBox!.height + 1)
  }
  // And the house tap-target floor survives on both steppers' BUTTONS. The
  // floor belongs to the tappable controls, not to the time text between them:
  // `start-time-label` / `end-time-label` are the label spans (26px of text), so
  // measuring THOSE for 44px would be measuring the wrong element — the AC is
  // about the ±  buttons a thumb actually hits.
  for (const [name, buttonName] of [
    ['start', 'Later start time'],
    ['start', 'Earlier start time'],
    ['end', 'Later end time'],
    ['end', 'Earlier end time'],
  ] as const) {
    const button = page.getByRole('button', { name: buttonName })
    await expect(button).toBeVisible()
    const buttonBox = await button.boundingBox()
    expect(buttonBox, `${buttonName} must render a box`).not.toBeNull()
    expect(
      buttonBox!.height,
      `${buttonName} must keep a 44px target`,
    ).toBeGreaterThanOrEqual(44)
    expect(
      buttonBox!.width,
      `${buttonName} must keep a 44px target`,
    ).toBeGreaterThanOrEqual(44)
    void name
  }

  // ----------------------------------------------------------------
  // AC 4 (checked FIRST, so the absence is about the untouched mount): no copy
  // on /new implies a fixed length. These are the exact strings the removed
  // controls used to render.
  // ----------------------------------------------------------------
  await expect(page.getByText('How long', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '1h', exact: true })).toHaveCount(0)
  await expect(page.getByText(/^Ends /)).toHaveCount(0)

  // ----------------------------------------------------------------
  // AC 2a: THE ORDINARY CASE SHOWS NO NOTE. The mount window is untouched (a
  // step has not happened yet), so a note here would be a false claim.
  // ----------------------------------------------------------------
  const note = page.getByTestId('window-adjusted-note')
  await expect(note).toHaveCount(0)

  // ----------------------------------------------------------------
  // AC 2b: STEPPING THE START LEAVES THE END WHERE IT WAS. This is the defect:
  // the old code kept `durationMinutes` fixed, so BOTH ends moved on a single
  // step — the "linked together" the founder rejected. Asserting the LENGTH
  // would prove nothing here (the old code preserved it too); the claim that can
  // fail is that the END did not move.
  // ----------------------------------------------------------------
  const mountedStart = await readStepper('start-time-label')
  const mountedEnd = await readStepper('end-time-label')
  const mountedLength = wrapMinutes(mountedEnd - mountedStart)
  expect(mountedLength, 'the mount window must be a real window').toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Later start time' }).click()
  const startAfter = await readStepper('start-time-label')
  const endAfter = await readStepper('end-time-label')
  expect(
    wrapMinutes(startAfter - mountedStart),
    'one later step must move the START by exactly one 30-minute slot',
  ).toBe(30)
  expect(
    endAfter,
    'the END must not ride along with the start — the parent moved one end',
  ).toBe(mountedEnd)
  // ...and because the end held still, the window is now one slot SHORTER —
  // the "as long or as short as they want" half, visible in the numbers.
  expect(
    wrapMinutes(endAfter - startAfter),
    'the length follows the two ends the parent chose',
  ).toBe(mountedLength - 30)
  // The ordinary step moved nothing but the start, so STILL no note.
  await expect(note, 'an ordinary start step must not claim an adjustment').toHaveCount(0)

  // ----------------------------------------------------------------
  // AC 2c: A STEP THAT WOULD BREAK end > start KEEPS 30 MINUTES AND SHOWS THE
  // NOTE. Stepping the START later eventually reaches the end; the rule then
  // moves the OTHER end forward by the minimum and SAYS SO.
  //
  // The loop steps until the note appears (bounded by a full day of slots), so it
  // does not depend on the mounted window's length — the mount slot is
  // time-of-day dependent and a hard-coded step count would flake.
  // ----------------------------------------------------------------
  let collidedStart = await readStepper('start-time-label')
  let collidedEnd = await readStepper('end-time-label')
  for (let i = 0; i < 48 && (await note.count()) === 0; i += 1) {
    await page.getByRole('button', { name: 'Later start time' }).click()
    collidedStart = await readStepper('start-time-label')
    collidedEnd = await readStepper('end-time-label')
  }
  await expect(
    note,
    'stepping the start into the end must move the other end and SAY SO',
  ).toBeVisible()
  await expect(note).toContainText('30 minutes')
  expect(
    wrapMinutes(collidedEnd - collidedStart),
    'a collision must still leave a window of at least the 30-minute minimum',
  ).toBeGreaterThanOrEqual(30)
  console.log(
    `[e2e v33-7b] mount ${mountedStart}→${mountedEnd} (${mountedLength}min); ` +
      `after a start step ${startAfter}→${endAfter} (end UNMOVED, ${wrapMinutes(endAfter - startAfter)}min, no note); ` +
      `after stepping the start into the end ${collidedStart}→${collidedEnd} ` +
      `(${wrapMinutes(collidedEnd - collidedStart)}min, note shown)`,
  )
})

test('typing over a picked place drops the address it came with — and a typed address survives', async ({
  page,
}) => {
  // The defect this test pins (review cycle 1, F1): the address is part of what
  // is posted (the detail page's Maps link is built from place + address). Pick a
  // place — one tap writes the street — then type over the place text, and the
  // row must NOT still carry the picked place's street.
  //
  // V13 ticket 02 made the summary card TITLE-ONLY and gave the address its own
  // VISIBLE input (the third sweep of this staleness — do not put these back on
  // `postSummaryLines`): every assertion below reads the ADDRESS INPUT, which is
  // the control the parent sees and the one the submit reads.
  const pickedAddress = await readPlaceAddress(PLACE_NAME)
  const title = generatedTitle(FREETEXT_PLACE)

  await page.goto('/new')
  await settleOnRoute(page, '/new')

  const placeInput = page.getByPlaceholder(PLACE_PLACEHOLDER)
  const addressInput = page.getByPlaceholder(ADDRESS_PLACEHOLDER)

  // (1) Pick: place + address arrive together, and BOTH are read back in the
  //     visible flow — the place input and the address input, in that order.
  await placeInput.fill(PLACE_NAME)
  const suggestion = page.getByTestId('place-suggestions').getByText(PLACE_NAME, { exact: true })
  await expect(suggestion).toBeVisible()
  await suggestion.click()
  await expect(placeInput).toHaveValue(PLACE_NAME)
  await expect(addressInput).toHaveValue(pickedAddress)
  // …and the title-only summary card reads back the place-generated title (V13
  // ticket 02) — the card's one and only line.
  await expectTitleOnlySummary(page, [generatedTitle(PLACE_NAME)])

  // (2) Type over the place text: the directory link is dropped (V8 ticket 07)
  //     and the address the pick wrote goes with it — the place text no longer
  //     names that place, so the stale street must not survive in the input the
  //     submit reads.
  await placeInput.fill(FREETEXT_PLACE)
  await expect(page.getByTestId('place-suggestions')).toBeVisible()
  await page.getByTestId('place-somewhere-else').click()
  await expect(placeInput).toHaveValue(FREETEXT_PLACE)
  await expect(addressInput).toHaveValue('')
  // The title follows the new place text (the retype is what the parent said).
  await expectTitleOnlySummary(page, [title])

  // (3) The post that lands carries no place link and no address.
  // V13 ticket 03: no duration chips on /new — the auto-duration is already set.
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  const row = await readMarkerPost(title)
  expect(row, 'the retyped post must exist in the database').not.toBeNull()
  expect(row?.place).toBe(FREETEXT_PLACE)
  expect(row?.address ?? null).toBeNull()
  expect(row?.place_id ?? null).toBeNull()

  // (4) The NON-DESTRUCTIVE half: an address the PARENT typed is theirs, so
  //     correcting the place text must not wipe it — asserted on the address
  //     input, which is where the parent typed it and where the submit reads it.
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await addressInput.fill(TYPED_ADDRESS)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(FREETEXT_PLACE)
  await expect(addressInput).toHaveValue(TYPED_ADDRESS)
  // The title-only card still reads back the title, and it does NOT read back
  // the address (that is the point of V13 ticket 02: no multi-line card).
  await expectTitleOnlySummary(page, [title])
})

test('the title is generated, read back, editable in place — the extras are behind "More options" (V11 t05: the start is the visible "When" section)', async ({
  page,
}) => {
  await page.goto('/new')
  await settleOnRoute(page, '/new')

  const titleInput = page.getByPlaceholder(TITLE_PLACEHOLDER)
  const titleLine = page.getByTestId('title-line')

  // (1) THE READ-BACK (review cycle 1, F2): the form has no title input until
  //     the line is tapped — and with nothing written the line is the "Title"
  //     PROMPT, not the generated default the form holds (the display rule in
  //     postSummary.summaryTitleLine; the saved value is unchanged).
  await expect(titleLine).toHaveText(SUMMARY_TITLE_PLACEHOLDER)
  await expect(titleInput).toHaveCount(0)

  // (2) It FOLLOWS the place — typed free text first, read back on the summary…
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(FREETEXT_PLACE)
  await expect(page.getByTestId('place-suggestions')).toBeVisible()
  await page.getByTestId('place-somewhere-else').click()
  await expect(titleLine).toHaveText(generatedTitle(FREETEXT_PLACE))

  // …then a directory pick, which replaces it (the title never names a place the
  // post is not at) and brings its address into the visible address INPUT.
  const pickedAddress = await readPlaceAddress(PLACE_NAME)
  const placeInput = page.getByPlaceholder(PLACE_PLACEHOLDER)
  await placeInput.fill(PLACE_NAME)
  const suggestion = page.getByTestId('place-suggestions').getByText(PLACE_NAME, { exact: true })
  await expect(suggestion).toBeVisible()
  await suggestion.click()
  await expect(titleLine).toHaveText(generatedTitle(PLACE_NAME))
  // The card is TITLE ONLY (V13 ticket 02) — exactly one line, and it is the
  // title. The picked street is asserted where the parent can see it: the
  // address input.
  const followed = await expectTitleOnlySummary(page, [generatedTitle(PLACE_NAME)])
  expect(followed).toHaveLength(1)
  await expect(page.getByPlaceholder(ADDRESS_PLACEHOLDER)).toHaveValue(pickedAddress)

  // (3) TAPPING THE LINE makes it the input in place — the same value, the
  //     field's own placeholder and its live n/80 counter (the specs that type a
  //     title drive exactly this input).
  await titleLine.click()
  await expect(titleLine).toHaveCount(0)
  await expect(titleInput).toHaveValue(generatedTitle(PLACE_NAME))
  await expect(page.getByText(`${generatedTitle(PLACE_NAME).length}/80`)).toBeVisible()
  // It is still ON the summary — and V13 ticket 02's card is TITLE ONLY, so the
  // summary's line count is still exactly one while the title is being edited.
  await expectTitleOnlySummary(page, [generatedTitle(PLACE_NAME)])

  // (4) The parent's own words WIN: typing a title stops the generated one from
  //     following the place, for good.
  const ownTitle = 'Our Saturday park plan'
  await titleInput.fill(ownTitle)
  await placeInput.fill(FREETEXT_PLACE)
  await expect(titleInput).toHaveValue(ownTitle)

  // (5) …but CLEARING it is not "writing one" (review cycle 1, F6): the generated
  //     title comes back rather than leaving an empty line the validator then
  //     refuses.
  await titleInput.fill('')
  await expect(titleInput).toHaveValue('')
  await placeInput.fill(PLACE_NAME)
  await expect(titleInput).toHaveValue(generatedTitle(PLACE_NAME))
  await placeInput.fill(FREETEXT_PLACE)

  // (6) V13 ticket 02: the "More options" disclosure is GONE — every field
  //     (address, details, repeat weekly, kids) now has a visible home in the
  //     form's tail block. Pin their presence directly; there is no door to
  //     open and no more-options-body container.
  await expect(page.getByTestId('more-options')).toHaveCount(0)
  await expect(page.getByTestId('more-options-body')).toHaveCount(0)
  // The "When" section is in the VISIBLE flow.
  await expect(page.getByText('When', { exact: true })).toBeVisible()
  await expect(page.locator('input[type="date"]')).toBeVisible()
  await expect(page.getByTestId('start-time-label')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Later start time' })).toBeVisible()
  // The visible tail block: address, details render.
  await expect(page.getByPlaceholder(ADDRESS_PLACEHOLDER)).toBeVisible()
  await expect(page.getByPlaceholder(DETAILS_PLACEHOLDER)).toBeVisible()
  // V15 T05 (A12): the "Repeat weekly" toggle is gone from /new.
  await expect(page.getByTestId('repeat-weekly')).toHaveCount(0)
  // V13 ticket 03 (A16/A17): /new has NO "How long" control and NO duration
  // chips — the END stepper is the duration control, and the auto-picked
  // duration is simply the gap between the two steppers. Pin the absence so a
  // regression that re-adds a chip row to /new is caught here.
  for (const label of DURATION_CHIP_LABELS) {
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0)
  }
  await expect(page.getByText('How long', { exact: true })).toHaveCount(0)
  // …and the duration IS shown, on the two steppers that replaced it.
  await expect(page.getByTestId('start-time-label')).toBeVisible()
  await expect(page.getByTestId('end-time-label')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Later end time' })).toBeVisible()

  // V13 ticket 02: MORE_OPTIONS_FIELDS is empty (the disclosure is gone, so
  // there are no fields behind a door) — pinned here so a regression that
  // re-introduces a hidden field set is caught.
  expect([...MORE_OPTIONS_FIELDS]).toEqual([])

  // (8) A TYPED title is the title that posts (the affordance proved, not
  //     assumed): type it, post (V13 ticket 03: auto-duration is already set),
  //     and read the feed.
  const posted = 'Our post-fast park plan'
  await titleInput.fill(posted)
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  await expect(page.getByRole('heading', { name: posted, exact: true })).toBeVisible()
  const row = await readMarkerPost(posted)
  expect(row, 'the post with the typed title must exist in the database').not.toBeNull()
  expect(row?.title).toBe(posted)
})

test('a submit that fails on the start date shows its error in the visible "When" section, door still closed', async ({
  page,
}) => {
  await page.goto('/new')
  await settleOnRoute(page, '/new')

  // Answer the one VISIBLE required decision (the place) — the duration was
  // picked FOR the parent at mount (V12 t02), so the only failure left is the
  // start date. V11 ticket 05: it lives in the visible "When" section now (V9
  // t03's disclosure era is over), so clearing it needs no disclosure at all.
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(FREETEXT_PLACE)

  const dateInput = page.locator('input[type="date"]')
  await expect(dateInput).toBeVisible() // the When section, in the visible flow
  await dateInput.fill('')

  await page.getByRole('button', { name: 'Post drop-in' }).click()

  // The error renders WHERE the field is — the visible "When" section.
  // V13 ticket 02: the disclosure is gone, so there is no door state to check.
  await expect(page.getByText('Pick a start date.')).toBeVisible()
  await expect(page.getByTestId('more-options')).toHaveCount(0)
  await expect(page.getByTestId('more-options-body')).toHaveCount(0)
  // Nothing was posted: the designed submit error is NOT rendered (that line is
  // for a failed create, not for a validation stop), and the route is still /new.
  await expect(page.getByTestId('submit-error')).toHaveCount(0)
  expect(new URL(page.url()).pathname).toBe('/new')
})

test('the phone pass: /new at 320/375/390/430 and both orientations', async ({
  page,
}) => {
  // scripts/mobile-audit.mjs cannot walk /new (it is behind the session and the
  // script's contexts are signed out — V8 ticket 01 finding #5), so the ticket's
  // mobile AC is asserted here, on the real page, with the real session. 320 is
  // the tightest width the AC names (review cycle 1, F5): it is the one where a
  // control's padding is most likely to push the page sideways.
  for (const viewport of [
    { width: 320, height: 812 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/new')
    await settleOnRoute(page, '/new')
    // ⚠️ WAIT FOR WHAT THIS SWEEP MEASURES (nightly 2026-10-05). On CI the sweep
    // found ZERO controls and the vacuity guard below fired — correctly, but on a
    // page whose `<form>` had not mounted yet. That guard can only mean "the form
    // is absent" if the form has had its chance to arrive; without this wait it
    // also means "the machine was slow", which costs a whole nightly run.
    await page.locator('form').first().waitFor({ state: 'attached' })

    // V13 ticket 02: the disclosure is gone — the form is always fully visible,
    // so there is no collapsed/expanded distinction. Measure once per viewport.
    const measured = await measureControls(page)
    expect(
      measured.scrollWidth,
      `${viewport.width}px: nothing may push the page sideways`,
    ).toBeLessThanOrEqual(measured.innerWidth)
    // A sweep that found nothing would pass vacuously: the decisions and their
    // affordances are always in the DOM.
    expect(measured.controls.length).toBeGreaterThanOrEqual(8)
    for (const control of measured.controls) {
      expect(
        control.height,
        `${viewport.width}px: ${control.label} must be >= 44px (got ${control.height})`,
      ).toBeGreaterThanOrEqual(44)
    }
  }
})

test.afterEach(async () => {
  // Best-effort cleanup (the golden-path / quick-post pattern): delete the
  // marker's playdate rows via PostgREST with the marker's own JWT — the
  // host-only DELETE policy is the wall. A failure is logged, not fatal: the
  // e2e-<epoch> prefix marks the rows for the orchestrator's sweep.
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
