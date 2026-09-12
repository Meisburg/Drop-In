/**
 * V9 ticket 03 — the twenty-second post: three decisions, the rest behind
 * "more".
 *
 * The ticket's claims, end to end against the live project:
 *
 *  1. THE INTERACTION BUDGET. From a cold /new to the feed: a place (typed once,
 *     picked in one tap), one duration chip, and Post. The spec COUNTS the
 *     interactions rather than describing them — a capture listener records
 *     every click AND every input/change, in sessionStorage so the count
 *     survives the navigation to the feed — and pins the AC (<= 4 taps + 1 typed
 *     place). Review cycle 1, F4: the touched-control SET is asserted exactly
 *     ({the place field, the picked row, one duration chip, Post}), because a
 *     click count alone cannot see a newly required non-click step.
 *  2. THE READ-BACK IS EXACT. The summary's lines are the pure seam
 *     (postSummary.postSummaryLines) evaluated on the values the page opened
 *     with (bracketed around the mount, so neither a 30-minute boundary nor
 *     midnight can flake it) and on the values the spec then answers — and the
 *     day, the window, the place and the ADDRESS it reads back are asserted
 *     against the card in the feed AND against the row in the database.
 *  3. THE TITLE IS NO LONGER A QUESTION. It is generated ("Playdate at
 *     <place>"), shown as a read-back line on the summary that a tap turns into
 *     the input in place (review cycle 1, F2 — so the place picker stays /new's
 *     FIRST field, ticket 01's AC), follows the place until the parent writes
 *     their own, comes back from empty, and never comes back blank.
 *  4. THE DISCLOSURE. One "More options", collapsed by default, holding the
 *     address's manual entry, the start date + the 30-minute stepper, "Kids
 *     you're bringing", Details and "Repeat weekly" — and NOTHING that changes
 *     what will be posted is hidden: the address is read back on the place line
 *     and the weekly repeat is read back only while the submit would really
 *     create that series.
 *  5. NO ERROR IS HIDDEN. A submit that fails on the start date (which lives in
 *     the disclosure) OPENS the disclosure, so the message is never rendered
 *     inside something the parent collapsed.
 *  6. NOTHING STALE HIDES BEHIND THE DOOR. Picking a place writes its published
 *     street into the address; typing over the place text drops that street with
 *     it (review cycle 1, F1) — while an address the parent TYPED survives.
 *  7. THE PHONE PASS. scripts/mobile-audit.mjs walks only the SIGNED-OUT routes
 *     (/login and the public detail page — recorded V8 ticket 01 finding #5), so
 *     it cannot cover /new: the ticket's mobile AC is asserted HERE instead, at
 *     320/375/390/430 x portrait and 667x375 landscape, with the disclosure
 *     collapsed and expanded — no horizontal overflow and every visible control
 *     at least 44px tall (the script's own tap-target rule).
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
  defaultStartDateIso,
  nextSlotMinutes,
} from '../src/lib/feed'
import type { PlaydateFormValues } from '../src/lib/feed'
import { MORE_OPTIONS_FIELDS } from '../src/lib/feed'
import { BROWSE_PLACES_LABEL, PLACE_PICKER_LABEL } from '../src/lib/places'
import {
  GENERATED_TITLE_FALLBACK,
  generatedTitle,
  postSummaryLines,
} from '../src/lib/postSummary'
import {
  openMoreOptions,
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

/** The summary's lines, in the order the seam returns them. */
async function summaryLines(page: Page): Promise<string[]> {
  const lines = page.getByTestId('post-summary-line')
  await expect(lines.first()).toBeVisible()
  return lines.allInnerTexts()
}

/**
 * Assert the summary is exactly `candidates` — the seam's own output for the
 * values the page can legitimately be holding. Two candidates, because the
 * form's `now` is read ONCE at mount and this spec brackets that instant: a run
 * crossing a 30-minute boundary (or midnight) must not flake, and the assertion
 * stays exact rather than approximate.
 */
async function expectSummary(page: Page, candidates: string[][]): Promise<string[]> {
  const lines = await summaryLines(page)
  expect(candidates).toContainEqual(lines)
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
    durationMinutes: 0,
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

test('a cold /new is posted in four taps or fewer, typing exactly one place', async ({ page }) => {
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

  // (a) The page opens on the SUMMARY: the day and the slot it opened with, and
  //     the two decisions a parent has not answered yet, said plainly.
  await expectSummary(page, [
    postSummaryLines(mountValues(beforeMount)),
    postSummaryLines(mountValues(afterRead)),
  ])
  // The generated title is READ BACK as text on the summary — and there is no
  // title INPUT in the form at all (review cycle 1, F2): the summary's title line
  // becomes the input when it is tapped, which is what keeps the place picker
  // /new's first field (ticket 01's AC) and makes the title not a question.
  await expect(page.getByTestId('title-line')).toHaveText(GENERATED_TITLE_FALLBACK)
  await expect(page.getByPlaceholder(TITLE_PLACEHOLDER)).toHaveCount(0)

  // (b) The three decisions are visible: the place picker, the duration chips
  //     and Post.
  await expect(page.getByText(PLACE_PICKER_LABEL, { exact: true })).toBeVisible()
  await expect(page.getByTestId('browse-places')).toHaveText(BROWSE_PLACES_LABEL)
  for (const label of DURATION_CHIP_LABELS) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: 'Post drop-in' })).toBeVisible()

  // (c) ONE typed place, one tap to pick it (the suggestion row).
  const placeInput = page.getByPlaceholder(PLACE_PLACEHOLDER)
  await placeInput.fill(PLACE_NAME)
  const suggestion = page.getByTestId('place-suggestions').getByText(PLACE_NAME, { exact: true })
  await expect(suggestion).toBeVisible()
  await suggestion.click()

  // The read-back now names the place AND the street the pick wrote (F1), and the
  // generated title line follows the place — the parent typed nothing into it.
  await expectSummary(page, [
    postSummaryLines(mountValues(beforeMount, { place: PLACE_NAME }), { address: pickedAddress }),
    postSummaryLines(mountValues(afterRead, { place: PLACE_NAME }), { address: pickedAddress }),
  ])
  await expect(page.getByTestId('title-line')).toHaveText(title)

  // (d) One tap for how long: the summary reads the duration AND the exact
  //     window back (computed the way the submit computes it).
  await page.getByRole('button', { name: '1h', exact: true }).click()
  const answered = [
    postSummaryLines(mountValues(beforeMount, { place: PLACE_NAME, durationMinutes: 60 }), {
      address: pickedAddress,
    }),
    postSummaryLines(mountValues(afterRead, { place: PLACE_NAME, durationMinutes: 60 }), {
      address: pickedAddress,
    }),
  ]
  const lines = await expectSummary(page, answered)
  const [summaryStart, summaryEnd] = parseWindowLine(lines[1])
  expect(lines[0].endsWith(' · 1h')).toBe(true)
  expect(lines[2]).toBe(`${PLACE_NAME} · ${pickedAddress}`)

  // (e) Post — the third decision. Nothing else was touched: no date, no time,
  //     no address, no kids, no details, no title.
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  const taps = await readTapCount(page)
  const touched = await readTouchedControls(page)
  console.log(
    `[e2e post-fast] cold /new → feed: ${taps} tap(s); controls touched: ` +
      `${touched.map((key) => `"${key}"`).join(', ')}. AC pin: <= 4 taps + the typed place.`,
  )
  expect(taps, 'the AC pins the interaction budget at four taps (plus the typed place)').toBeLessThanOrEqual(4)
  // …and the count is real: the pick, the chip and Post are three clicks, or
  // four if the typing itself is counted as one.
  expect(taps).toBeGreaterThanOrEqual(3)
  // The SET is the stronger pin (review cycle 1, F4): exactly four controls were
  // touched — the place field (typed), the picked row (tapped), one duration chip
  // (tapped) and Post (tapped). A fifth would be a step the parent now has to
  // take, whatever its event type.
  expect(touched).toHaveLength(4)
  expect(touched).toContain(PLACE_PLACEHOLDER)
  expect(touched).toContain('1h')
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
  // The card's first <p> is the place (DropInCard), and it is exactly the place
  // the summary read back — not a reshaped version of it. (V9 ticket 05 puts an
  // AGE RANGE above the place when a card has one to show; this post has none —
  // no kids picked and no "Ages (optional)" chip pressed — so the place is
  // still the card's first line, and the same assertion holds. e2e/feed-ages is
  // where the ages line's position above the place is pinned.)
  await expect(card.locator('p').first()).toHaveText(PLACE_NAME)

  const row = await readMarkerPost(title)
  expect(row, 'the posted drop-in must exist in the database').not.toBeNull()
  expect(row?.place).toBe(PLACE_NAME)
  expect(row?.place_id, 'the picked place carries its id').toBeTruthy()
  // The address: the street the pick wrote, read back on the summary line the
  // parent saw, and carried by the row (it is what the Maps link is built from).
  expect(row?.address).toBe(pickedAddress)
  // The day: the summary's day line is the day of the instant that was written,
  // checked against Node's own formatting rather than the app's seam (F7).
  expect(lines[0].split(' · ')[0]).toBe(nodeDayLabel(row?.starts_at ?? ''))
  // The window: exactly the start and end the summary promised.
  expect(localMinutes(row?.starts_at ?? '')).toBe(summaryStart)
  expect(localMinutes(row?.ends_at ?? '')).toBe(summaryEnd)
  expect(summaryEnd - summaryStart).toBe(60)
  // …and the feed's card shows that same window (its meta line is the card's
  // second <p>, the card's own formatTimeWindow of the stored instants).
  const metaText = (await card.locator('p').nth(1).innerText()).replace(/\s+/g, ' ').trim()
  const [cardStart, cardEnd] = parseWindowLine(metaText)
  expect([cardStart, cardEnd]).toEqual([summaryStart, summaryEnd])
})

test('typing over a picked place drops the address it came with — and a typed address survives', async ({
  page,
}) => {
  // The defect this test pins (review cycle 1, F1): the address is invisible
  // behind the disclosure but it is part of what is posted (the detail page's
  // Maps link is built from place + address). Pick a place — one tap writes the
  // street — then type over the place text, and the row must NOT still carry the
  // picked place's street.
  const pickedAddress = await readPlaceAddress(PLACE_NAME)
  const title = generatedTitle(FREETEXT_PLACE)

  await page.goto('/new')
  await settleOnRoute(page, '/new')

  const placeInput = page.getByPlaceholder(PLACE_PLACEHOLDER)
  const addressInput = page.getByPlaceholder(ADDRESS_PLACEHOLDER)

  // (1) Pick: place + address arrive together, and the summary reads both back.
  await placeInput.fill(PLACE_NAME)
  const suggestion = page.getByTestId('place-suggestions').getByText(PLACE_NAME, { exact: true })
  await expect(suggestion).toBeVisible()
  await suggestion.click()
  expect((await summaryLines(page))[2]).toBe(`${PLACE_NAME} · ${pickedAddress}`)

  // (2) Type over the place text: the directory link is dropped (V8 ticket 07)
  //     and the address the pick wrote goes with it — the place text no longer
  //     names that place, and behind the door nobody would see the stale street.
  await placeInput.fill(FREETEXT_PLACE)
  await expect(page.getByTestId('place-suggestions')).toBeVisible()
  await page.getByTestId('place-somewhere-else').click()
  expect((await summaryLines(page))[2]).toBe(FREETEXT_PLACE)
  // …and the address field itself is empty: "nothing hidden" means nothing, not
  // "nothing visible".
  await openMoreOptions(page)
  await expect(addressInput).toHaveValue('')

  // (3) The post that lands carries no place link and no address.
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  const row = await readMarkerPost(title)
  expect(row, 'the retyped post must exist in the database').not.toBeNull()
  expect(row?.place).toBe(FREETEXT_PLACE)
  expect(row?.address ?? null).toBeNull()
  expect(row?.place_id ?? null).toBeNull()

  // (4) The NON-DESTRUCTIVE half: an address the PARENT typed is theirs, so
  //     correcting the place text must not wipe it — and the summary reads it
  //     back, typed or not.
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await openMoreOptions(page)
  await addressInput.fill(TYPED_ADDRESS)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(FREETEXT_PLACE)
  await expect(addressInput).toHaveValue(TYPED_ADDRESS)
  expect((await summaryLines(page))[2]).toBe(`${FREETEXT_PLACE} · ${TYPED_ADDRESS}`)
})

test('the title is generated, read back, editable in place — and the rest is behind "More options"', async ({
  page,
}) => {
  await page.goto('/new')
  await settleOnRoute(page, '/new')

  const titleInput = page.getByPlaceholder(TITLE_PLACEHOLDER)
  const titleLine = page.getByTestId('title-line')

  // (1) THE READ-BACK (review cycle 1, F2): the generated title is shown as
  //     TEXT, and the form has no title input until the line is tapped.
  await expect(titleLine).toHaveText(GENERATED_TITLE_FALLBACK)
  await expect(titleInput).toHaveCount(0)

  // (2) It FOLLOWS the place — typed free text first, read back on the summary…
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(FREETEXT_PLACE)
  await expect(page.getByTestId('place-suggestions')).toBeVisible()
  await page.getByTestId('place-somewhere-else').click()
  await expect(titleLine).toHaveText(generatedTitle(FREETEXT_PLACE))

  // …then a directory pick, which replaces it (the title never names a place the
  // post is not at) and brings its address into the read-back.
  const pickedAddress = await readPlaceAddress(PLACE_NAME)
  const placeInput = page.getByPlaceholder(PLACE_PLACEHOLDER)
  await placeInput.fill(PLACE_NAME)
  const suggestion = page.getByTestId('place-suggestions').getByText(PLACE_NAME, { exact: true })
  await expect(suggestion).toBeVisible()
  await suggestion.click()
  await expect(titleLine).toHaveText(generatedTitle(PLACE_NAME))
  const followed = await summaryLines(page)
  expect(followed).toHaveLength(3)
  expect(followed[2]).toBe(`${PLACE_NAME} · ${pickedAddress}`)

  // (3) TAPPING THE LINE makes it the input in place — the same value, the
  //     field's own placeholder and its live n/80 counter (the specs that type a
  //     title drive exactly this input).
  await titleLine.click()
  await expect(titleLine).toHaveCount(0)
  await expect(titleInput).toHaveValue(generatedTitle(PLACE_NAME))
  await expect(page.getByText(`${generatedTitle(PLACE_NAME).length}/80`)).toBeVisible()
  // It is still ON the summary — the summary's lines are unchanged by editing it.
  await expect(page.getByTestId('post-summary-line')).toHaveCount(3)

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

  // (6) The disclosure: collapsed by default, holding the OPTIONAL answers and
  //     the date/time adjustment — nothing that changes what will be posted.
  const toggle = page.getByTestId('more-options')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  for (const absent of [
    page.getByPlaceholder(ADDRESS_PLACEHOLDER),
    page.locator('input[type="date"]'),
    page.getByTestId('start-time-label'),
    page.getByRole('button', { name: 'Later start time' }),
    page.getByText("Kids you're bringing"),
    page.getByPlaceholder(DETAILS_PLACEHOLDER),
    page.getByTestId('repeat-weekly'),
    page.getByTestId('more-options-body'),
  ]) {
    await expect(absent).toHaveCount(0)
  }

  await openMoreOptions(page)
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const body = page.getByTestId('more-options-body')
  await expect(body).toBeVisible()
  await expect(page.getByPlaceholder(ADDRESS_PLACEHOLDER)).toBeVisible()
  await expect(page.locator('input[type="date"]')).toBeVisible()
  await expect(page.getByTestId('start-time-label')).toBeVisible()
  await expect(page.getByPlaceholder(DETAILS_PLACEHOLDER)).toBeVisible()
  await expect(page.getByTestId('repeat-weekly')).toBeVisible()

  // The disclosure really renders a control for every field the page will open
  // it for (feed.MORE_OPTIONS_FIELDS) — so that list and this markup cannot drift
  // apart silently (review cycle 1, F7).
  expect([...MORE_OPTIONS_FIELDS]).toEqual(['startDate', 'startMinutes'])
  await expect(body.locator('input[type="date"]')).toBeVisible() // startDate
  await expect(body.getByTestId('start-time-label')).toBeVisible() // startMinutes

  // (7) "Repeat weekly" is behind the door — and the summary states the series
  //     ONLY while the submit would really create one (review cycle 1, F3).
  const repeat = page.getByTestId('repeat-weekly')
  const dateInput = page.locator('input[type="date"]')
  const dateValue = await dateInput.inputValue()
  expect(dateValue).not.toBe('')
  await expect(repeat).toHaveAttribute('aria-pressed', 'false')
  await repeat.click()
  await expect(repeat).toHaveAttribute('aria-pressed', 'true')
  const repeatLine = postSummaryLines(
    { ...mountValues(new Date().toISOString()), startDate: dateValue, place: FREETEXT_PLACE },
    { repeatsWeekly: true },
  )
  let lines = await summaryLines(page)
  expect(lines).toHaveLength(4)
  expect(lines[3]).toBe(repeatLine[3])
  expect(lines[3].startsWith('Repeats every ')).toBe(true)

  // Clear the start date: the submit would create NO series (its own guard needs
  // a weekday), so the promise goes — and the control says why. The old version
  // of this spec pinned the opposite, which is the silent series of F3.
  await dateInput.fill('')
  lines = await summaryLines(page)
  expect(lines).toHaveLength(3)
  await expect(repeat).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByText('Pick a start date and this becomes a standing weekly meetup.'),
  ).toBeVisible()

  // Put the date back → the promise returns; then turn it off for the post below.
  await dateInput.fill(dateValue)
  expect(await summaryLines(page)).toHaveLength(4)
  await repeat.click()
  await expect(repeat).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('post-summary-line')).toHaveCount(3)

  // (8) A TYPED title is the title that posts (the affordance proved, not
  //     assumed): type it, answer the duration, post, and read the feed.
  const posted = 'Our post-fast park plan'
  await titleInput.fill(posted)
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  await expect(page.getByRole('heading', { name: posted, exact: true })).toBeVisible()
  const row = await readMarkerPost(posted)
  expect(row, 'the post with the typed title must exist in the database').not.toBeNull()
  expect(row?.title).toBe(posted)
})

test('a submit that fails on a hidden field opens the disclosure instead of hiding the error', async ({
  page,
}) => {
  await page.goto('/new')
  await settleOnRoute(page, '/new')

  // Answer the two VISIBLE required decisions, so the only failure left is the
  // start date — the field that lives inside "More options".
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(FREETEXT_PLACE)
  await page.getByRole('button', { name: '1h', exact: true }).click()

  await openMoreOptions(page)
  const dateInput = page.locator('input[type="date"]')
  await dateInput.fill('')
  // Collapse it again: the parent has put the door back.
  await page.getByTestId('more-options').click()
  await expect(page.getByTestId('more-options')).toHaveAttribute('aria-expanded', 'false')

  await page.getByRole('button', { name: 'Post drop-in' }).click()

  // The form OPENS what it needs the parent to see, and says what is wrong —
  // inside the disclosure it just opened, never behind a collapsed box.
  const toggle = page.getByTestId('more-options')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('more-options-body')).toBeVisible()
  await expect(page.getByText('Pick a start date.')).toBeVisible()
  // Nothing was posted: the designed submit error is NOT rendered (that line is
  // for a failed create, not for a validation stop), and the route is still /new.
  await expect(page.getByTestId('submit-error')).toHaveCount(0)
  expect(new URL(page.url()).pathname).toBe('/new')
})

test('the phone pass: /new at 320/375/390/430 and both orientations, collapsed and expanded', async ({
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

    const collapsed = await measureControls(page)
    expect(
      collapsed.scrollWidth,
      `${viewport.width}px: nothing may push the page sideways`,
    ).toBeLessThanOrEqual(collapsed.innerWidth)
    // A sweep that found nothing would pass vacuously: the three decisions and
    // their affordances are always there.
    expect(collapsed.controls.length).toBeGreaterThanOrEqual(8)
    for (const control of collapsed.controls) {
      expect(
        control.height,
        `${viewport.width}px collapsed: ${control.label} must be >= 44px (got ${control.height})`,
      ).toBeGreaterThanOrEqual(44)
    }

    await openMoreOptions(page)
    const expanded = await measureControls(page)
    expect(expanded.scrollWidth).toBeLessThanOrEqual(expanded.innerWidth)
    expect(expanded.controls.length).toBeGreaterThan(collapsed.controls.length)
    for (const control of expanded.controls) {
      expect(
        control.height,
        `${viewport.width}px expanded: ${control.label} must be >= 44px (got ${control.height})`,
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
