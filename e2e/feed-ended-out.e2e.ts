/**
 * V9 ticket 04 — an ended drop-in leaves Nearby, and lands in the archive.
 *
 * Her words: "after you've attended the event, it should drop off of the nearby
 * feed. It shouldn't stay there because that's confusing. But there should be
 * like a past events place maybe where they get like archived." Before this
 * ticket the feed kept an ended drop-in for the rest of the day — greyed, at the
 * bottom of the "Today" section — and the archive (V8/04's Past list) was
 * visible nowhere from the feed.
 *
 * THE PIVOT — which assertion this file exists for (the ticket demands that the
 * spec say so):
 *
 *   (4) `getByText(endedTitle)` has COUNT 0 on `/` — THE PIVOT. The ended
 *       drop-in's title is ABSENT from the feed. RED against the pre-ticket
 *       logic, GREEN after. It is red for a reason the spec CONSTRUCTS rather
 *       than assumes: the ended window is built INSIDE today (see endedWindow),
 *       so the old cutoff — `starts_at >= start of today`, on BOTH layers — still
 *       fetched AND kept the row, and the card sat at the bottom of "Today".
 *       (A window from YESTERDAY would also be gone pre-change, so the spec
 *       would have been green before the ticket and would have proved nothing
 *       about it. That is the whole trap.)
 *
 *   (5) the feed's own READ carries the new cutoff — `ends_at=gt.<now>` and no
 *       `starts_at=gte` on the wire. The ticket's second half ("the feed's own
 *       read stops fetching them, rather than fetching and hiding them"), and
 *       the only red-before/green-after assertion here that does not depend on
 *       the wall clock. Its positive control is in the same block: the query it
 *       inspects must actually have been issued.
 *
 *   (2) and (3) are the CONTROLS that keep (4) from passing vacuously: the
 *       tomorrow post and the happening-now post MUST be on the feed. "Absent"
 *       means something only because those two are present — a feed that
 *       rendered nothing, or errored, or bounced to another route would satisfy
 *       (4) perfectly on its own.
 *
 * (3) is also the ticket's sharpest AC: a drop-in that has STARTED but not ended
 * STAYS, with its "Happening now" badge — "those are the ones a parent can still
 * walk to". A cutoff written as `starts_at >= now` (the tempting literal reading
 * of "only what is ahead") deletes exactly that post, and (3) is what catches
 * it.
 *
 * (3b) is the day-SECTION half of the same rule, and it is a pivot too (added in
 * review cycle 1, finding F1). The cutoff admits a drop-in whose window crossed
 * midnight, so grouping rows by their raw start day put a section headed with a
 * past date ("Fri, Sep 11") — holding one card badged "Happening now" — at the
 * TOP of the feed, because rows arrive starts_at-ascending. RED against that
 * grouping (which is what HEAD did), GREEN after feed.daySectionIso clamps a
 * started row to today. Such a row was unreachable before this ticket, which is
 * why no earlier spec saw it.
 *
 * WHAT IS RED BEFORE THE CHANGE, EXACTLY — this file's own accounting, corrected
 * in review cycle 1 (finding F2): the first draft called the whole archive half
 * "green before and after", which was wrong for three of its assertions, all of
 * them this ticket's own work product:
 *   (6a) the feed's "See past drop-ins" line — ADDED by this ticket (FeedPage);
 *   (6b) the Past row's title LINK on /profile — HEAD rendered a plain <p>, so
 *        the host could not open their own past post from the archive at all;
 *   (6c) the `opacity-60` mute on a Past row — `renderPostRow` took no `muted`
 *        argument at HEAD and Past/Upcoming rows looked identical.
 * Those three are pivots of the ProfilePage half this ticket also carries.
 *
 * THE GENUINELY "GREEN EITHER WAY" HALF is (7)-(9): V8/04's Past list existing
 * and being split correctly, V8/09's "Same time next week" for the host, and the
 * muted archive CARD with no "I'm going" toggle on /u/:handle. They assert
 * shipped behaviour this ticket must not change — written down because the
 * ticket's archive AC ("reachable from the feed", muted, no toggle, the next-week
 * affordance) has to be pinned somewhere, and a spec that could only ever go red
 * would not notice the archive breaking.
 *
 * (10) pins a LIMITATION rather than a feature: the archive is per HOST, so a
 * viewer who merely attended (or pinged) someone else's drop-in has no listing
 * surface — they can reach it by URL, but not from the feed's door.
 *
 * (11) is the empty state: "nothing ahead" must offer the archive without
 * implying the archive is empty — and the PLACES directory (/browse, which
 * renders the very same RadiusEmptyState) must NOT grow a link to a personal
 * archive. Those two screens cannot be produced from live data at the marker's
 * pinned location (98107 / 5 mi — the feed is never empty there, and Yakima is
 * another spec's state), so both are forced at the NETWORK layer, the technique
 * e2e/feed-empty-state.e2e.ts already uses for the states live data cannot
 * reach. The stubs are honest reads: an empty feed is `[]`, and the browse case
 * is one REAL-SHAPED place ~53 mi away, so the app's own distance math is what
 * produces the empty state, with a control that switching the distance filter to
 * "Any distance" brings that place back.
 *
 * LIVE-DATA DISCIPLINE: every assertion is about rows THIS spec created (its own
 * `e2e-<epoch>` titles) or about a request the app itself issued. Nothing here
 * asserts a count of, or the presence of, live project data it did not create —
 * leftover rows can only add cards, never falsify these assertions.
 *
 * CASCADE SAFETY: the three rows are deleted in afterEach over REST with the
 * marker's OWN JWT (the 0005 host-only DELETE policy — a plain anon delete is an
 * RLS no-op that PostgREST reports as a 2xx, the logged lesson), SCOPED to this
 * spec's titles so it can never touch another spec's rows, and best-effort:
 * a failure is logged for the orchestrator's sweep (the `e2e-` prefix) rather
 * than failing the run. The marker account itself persists by design.
 *
 * V12 ticket 03 (migration 0041) adds a fourth row and its OWN test — the
 * "ended" status: the host ends a FUTURE drop-in early ("End this post
 * now"), which is a different act from the "ended lot" above (whose clock
 * ran out). The new test ("a host-ended post ...") flips that post to
 * status='ended' over REST (the marker's own JWT), then asserts it is
 * ABSENT from the feed (the read's .neq('status', 'ended')) and PRESENT
 * in the /profile Past list with the "Ended" label.
 *
 * TWO-PHASE EXPECTATION for that test: it is RED until 0041 is applied
 * live — the live CHECK on playdates.status is still 0019's two values
 * ('on','cancelled'), so the status write comes back as the constraint
 * violation (the expected failure, the spec's red capture; the violation
 * text is carried in the assertion message). Every OTHER test in this file
 * stays green either way.
 */
import { expect, test, type Page } from '@playwright/test'
// The app's own copy, route and day rule for the archive line + the day-section
// assertion, imported so this spec asserts the string, the destination and the
// day the feed actually uses rather than copies of them (feed.ts is pure — its
// only import is `import type`).
import { localDayKey, PAST_DROP_INS_LABEL } from '../src/lib/feed'
import {
  E2E_BASE_URL,
  editTitle, localDatePlusDays, openProfileEditor, readMarkerMeta,
  readMarkerSession, readSupabaseEnv, setDirectoryRadius, settleOnRoute, finishSignup,
  signUpViewer,
  stepStartTimeOnce,
} from './fixtures'

/**
 * The titles this run created — set BEFORE posting anything (a create that
 * succeeds and then fails mid-test must still be swept), read by the afterEach
 * cleanup. Module-scoped because afterEach has no access to a test body's
 * locals.
 */
let createdTitles: string[] = []

/** A rest/v1 response row as this spec reads it back. */
interface PostWindowRow {
  id: string
  starts_at: string
  ends_at: string
}

/** Any playdates read the app issues (the feed's own query among them). */
const PLAYDATES_READ = /\/rest\/v1\/playdates\?/

/** One REST round trip as the marker, over the app's own PostgREST surface. */
async function markerRest(pathAndQuery: string, init: RequestInit = {}): Promise<Response> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  return fetch(`${url}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

/** The marker's newest post with this title (null before it lands). */
async function readNewestMarkerPostId(title: string): Promise<string | null> {
  const { userId } = readMarkerSession()
  const res = await markerRest(
    `playdates?host_profile_id=eq.${userId}&title=eq.${encodeURIComponent(title)}` +
      `&order=created_at.desc&limit=1&select=id`,
  )
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ id: string }>
  return rows[0]?.id ?? null
}

/** That post's window, as the DB actually holds it (the write's verification). */
async function readPostWindow(postId: string): Promise<PostWindowRow | null> {
  const res = await markerRest(`playdates?id=eq.${postId}&select=id,starts_at,ends_at`)
  if (!res.ok) return null
  const rows = (await res.json()) as PostWindowRow[]
  return rows[0] ?? null
}

/**
 * Move ONE of the marker's OWN posts to the window the ticket is about, with the
 * marker's JWT (the 0005 `playdates_update_host` policy is the wall).
 *
 * WHY NOT THE /new FORM ALONE: /new computes the end from the start plus a
 * duration chip, and its start default is the NEXT 30-minute slot — there is no
 * way to ask it for a window that has already closed without weakening
 * validatePlaydateForm (which this ticket forbids, and which would be a real
 * regression for parents). So the spec posts a real drop-in through the app and
 * then moves its window, which is exactly the "or edit one to have already
 * ended" path the ticket's Verify line names.
 *
 * `Prefer: return=representation` is safe HERE and is deliberately not the
 * general rule: a RETURNING on a write whose SELECT policy excludes the actor is
 * the 42501 lesson, but playdates' SELECT policy is `using (true)` for any
 * authenticated user (0005), so the row can come back. The caller still reads the
 * row again separately — a 2xx is not proof that a write landed (the logged RLS
 * no-op lesson).
 */
async function patchPostWindow(
  postId: string,
  window: { startsAt: string; endsAt: string },
): Promise<boolean> {
  const res = await markerRest(`playdates?id=eq.${postId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ starts_at: window.startsAt, ends_at: window.endsAt }),
  })
  return res.ok
}

/**
 * Set ONE of the marker's OWN posts' status over REST (V12 t03: 0041's
 * `playdates_update_host` probe admitted 'ended' into the write path — the
 * CHECK is the wall, not RLS). Returns the body with the ok flag: the
 * pre-0041-apply RED capture needs the constraint violation TEXT in the
 * assertion message, not just a pass/fail.
 */
async function patchPostStatus(
  postId: string,
  status: string,
): Promise<{ ok: boolean; body: string }> {
  const res = await markerRest(`playdates?id=eq.${postId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
  const body = await res.text()
  return { ok: res.ok, body }
}

/** The post's status as the DB actually holds it (the write's verification). */
async function readPostStatus(postId: string): Promise<string | null> {
  const res = await markerRest(`playdates?id=eq.${postId}&select=status`)
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ status: string | null }>
  return rows[0]?.status ?? null
}

/**
 * The ENDED window: a drop-in that STARTED TODAY and is already over. It ends a
 * second ago and starts 90 minutes earlier — never before local midnight, hence
 * the `Math.max`, so it is inside today whatever time the suite runs at. That
 * "inside today" is what makes assertion (4) a real pivot: the OLD cutoff
 * (`starts_at >= start of today`) returned this row, so the feed really did show
 * it before this ticket.
 */
function endedWindow(): { startsAt: string; endsAt: string } {
  const nowMs = Date.now()
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const startsAt = Math.max(nowMs - 90 * 60_000, midnight.getTime() + 1000)
  return {
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(nowMs - 1000).toISOString(),
  }
}

/**
 * The HAPPENING-NOW window, and it CROSSES MIDNIGHT: it started on the PREVIOUS
 * local day and has not ended. The AC calls this post out by name ("STARTED but
 * not ended STAYS … with its 'Happening now' badge"); it is the one a
 * `starts_at >= now` cutoff would silently delete, AND the one whose DAY SECTION
 * the review caught — grouped by its raw start day it would head a section
 * labelled "Fri, Sep 11" while its own card said "Happening now", and because
 * rows arrive starts_at-ascending that section is the first thing on the screen
 * (assertion 3b).
 *
 * The window is therefore LONGER than a parent would type: it must hold two
 * properties at whatever hour the suite runs — a start on the previous local day
 * (23:30 yesterday) and an end still in the future. A natural 23:30 + 3h window
 * (which /new really produces — `computeEndIso` pins the roll-over) is only
 * still-running between 23:30 and 02:30, which no spec can depend on. Every
 * timestamp here is real data and every badge on the card is computed from it;
 * only the duration is deliberately unrealistic.
 */
function crossMidnightLiveWindow(): { startsAt: string; endsAt: string } {
  const nowMs = Date.now()
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  return {
    startsAt: new Date(midnight.getTime() - 30 * 60_000).toISOString(), // 23:30 yesterday
    endsAt: new Date(nowMs + 45 * 60_000).toISOString(),
  }
}

/**
 * Post one drop-in through the real /new form (the golden-path /
 * profile-posts flow, V9 ticket 03's summary + "More options" shape) and return
 * its id.
 */
async function postDropIn(page: Page, title: string, startDate: string): Promise<string> {
  await page.goto('/new')
  // A cold load can lose the route to the onboarding-gate race — settle on /new
  // via the app's own navigation once the SPA state is warm.
  await settleOnRoute(page, '/new')
  // The summary's title is a read-back: tap it to edit (the input is what the
  // specs drive).
  await editTitle(page)
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  // A place name that resolves to nothing in the directory, so the post keeps
  // `place_id` NULL and the radius filter falls back to the host's own zip —
  // which is the viewer's zip, so this post is 0 mi away and certainly on the
  // feed (the controls below depend on that).
  await page
    .getByPlaceholder('e.g. Green Lake playground, near the boathouse')
    .fill('E2E ended-out lot, not a real place')
  // The date + the 30-minute stepper live behind "More options".
  await page.locator('input[type="date"]').fill(startDate)
  await stepStartTimeOnce(page)
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  // A successful create always lands on the feed.
  await page.waitForURL('/')
  const id = await readNewestMarkerPostId(title)
  expect(id, `the post "${title}" must exist before the spec can move its window`).not.toBeNull()
  return id as string
}

/** The section element whose heading is exactly `heading` (Upcoming / Past). */
function section(page: Page, heading: string) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
}

/** The card for `title` on a page that renders DropInCards (the feed, /u/:handle). */
function cardFor(page: Page, title: string) {
  return page.locator('a[href^="/playdate/"]').filter({ hasText: title })
}

test('an ended drop-in leaves the feed, a live one stays, and the archive still has it', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const liveTitle = `e2e-${epoch} ${marker.displayName} live lot`
  const nowTitle = `e2e-${epoch} ${marker.displayName} happening lot`
  const endedTitle = `e2e-${epoch} ${marker.displayName} ended lot`
  // Set BEFORE the first post: a run that dies mid-test still knows what to
  // delete.
  createdTitles = [liveTitle, nowTitle, endedTitle]

  // --- The three rows: tomorrow (the live control), and two TODAY rows whose
  // windows are moved to "happening now" and "already over". ---
  await postDropIn(page, liveTitle, localDatePlusDays(1))
  const nowId = await postDropIn(page, nowTitle, localDatePlusDays(0))
  const endedId = await postDropIn(page, endedTitle, localDatePlusDays(0))

  const nowWindow = crossMidnightLiveWindow()
  const ended = endedWindow()
  const nowPatched = await patchPostWindow(nowId, nowWindow)
  const endedPatched = await patchPostWindow(endedId, ended)

  // The write is VERIFIED, not assumed: a PATCH that RLS quietly ignored, or one
  // whose id matched nothing, comes back 2xx exactly like a real one. Comparing
  // parsed instants (not strings): PostgREST hands timestamptz back in Postgres'
  // `+00:00` form, so a raw string compare would fail on formatting alone.
  const nowRow = await readPostWindow(nowId)
  const endedRow = await readPostWindow(endedId)
  expect(nowPatched && endedPatched, 'both window writes must be accepted').toBe(true)
  expect(
    Date.parse(nowRow?.starts_at ?? ''),
    'the happening-now window must be on the row (a 2xx is not proof)',
  ).toBe(Date.parse(nowWindow.startsAt))
  expect(Date.parse(nowRow?.ends_at ?? '')).toBe(Date.parse(nowWindow.endsAt))
  // …and it really crosses midnight: its start is on the PREVIOUS local day.
  // `feed.localDayKey` is the app's own day rule, imported for exactly this.
  const nowStartDay = localDayKey(nowRow?.starts_at ?? '')
  const previousDay = localDayKey(new Date(Date.now() - 24 * 60 * 60_000).toISOString())
  expect(nowStartDay, 'the happening-now row must START on the previous local day').toBe(previousDay)
  expect(nowStartDay).not.toBe(localDayKey(new Date().toISOString()))
  expect(Date.parse(nowRow?.ends_at ?? '')).toBeGreaterThan(Date.now())
  expect(
    Date.parse(endedRow?.starts_at ?? ''),
    'the ended window must be on the row, and must still be INSIDE TODAY — that is what makes the pivot real',
  ).toBe(Date.parse(ended.startsAt))
  expect(Date.parse(endedRow?.ends_at ?? '')).toBe(Date.parse(ended.endsAt))
  expect(Date.parse(endedRow?.ends_at ?? '')).toBeLessThanOrEqual(Date.now())

  // --- The feed. Every playdates read the page issues is captured, so the
  // cutoff can be asserted on the wire as well as in the rendered list. ---
  const playdateReads: string[] = []
  page.on('request', (request) => {
    if (PLAYDATES_READ.test(request.url())) playdateReads.push(request.url())
  })
  await page.goto('/')
  await settleOnRoute(page, '/')

  // (2) CONTROL: a live drop-in IS on the feed. Without this, (4) below would
  // pass on an empty page, an error state, or the wrong route.
  await expect(cardFor(page, liveTitle)).toBeVisible()
  // (3) CONTROL + the ticket's sharpest AC: a drop-in that has STARTED but not
  // ended STAYS, and it says so on the card.
  const happeningCard = cardFor(page, nowTitle)
  await expect(happeningCard).toBeVisible()
  await expect(happeningCard).toContainText('Happening now')
  // V27 slice 2: the live card also states the time left, not only the state.
  await expect(happeningCard.getByTestId('card-countdown')).toContainText(/ends in|ending/)

  // (3b) …and the DAY SECTION follows the same rule as the cutoff (V9 ticket 04,
  // review cycle 1 / F1): this row's window began YESTERDAY, so grouping it by
  // its raw start day put a section headed "Fri, Sep 11" — holding one card
  // badged "Happening now" — at the TOP of the feed (rows arrive
  // starts_at-ascending, so the oldest start sorts first). The section that
  // contains the card must be headed Today. RED against the pre-fix grouping
  // (which produced a bare past date here); the row itself was unreachable
  // before this ticket, which is why nothing covered it.
  const nowSection = page.locator('section').filter({ hasText: nowTitle })
  await expect(nowSection).toHaveCount(1)
  await expect(
    nowSection.locator('p').first(),
    'a still-running drop-in belongs to TODAY, not to the day it started on',
  ).toHaveText('Today')
  // The section header is a bare day label — never a rendered date for this row.
  await expect(nowSection.locator('p').first()).not.toHaveText(/[A-Z][a-z]{2}, [A-Z][a-z]{2} \d/)

  // (4) THE PIVOT: the ended drop-in is GONE from the feed — not greyed, not
  // demoted, absent. RED against the pre-ticket cutoff (the window is inside
  // today, so the old query fetched it and the old filter kept it), GREEN now.
  await expect(page.getByText(endedTitle, { exact: true })).toHaveCount(0)

  // (5) The read itself no longer fetches it. Asserted on the URLs the app
  // issued, with its own control: the feed query must have been seen at all
  // (otherwise this block asserts nothing).
  expect(playdateReads.length, 'the app must have issued its playdates read').toBeGreaterThan(0)
  expect(
    playdateReads.some((url) => url.includes('ends_at=gt.')),
    `the feed's read must cut on ends_at > now; saw: ${playdateReads.join(' | ')}`,
  ).toBe(true)
  expect(
    playdateReads.some((url) => url.includes('starts_at=gte')),
    `the old starts_at cutoff must be gone from the feed's read; saw: ${playdateReads.join(' | ')}`,
  ).toBe(false)

  // --- (6) V16 t04 MOVED THIS BLOCK'S ARCHIVE OFF /profile. The feed's own door
  // ("See past drop-ins") still navigates to /profile, but /profile no longer
  // renders the "Hosted drop-ins" list (the founder removed it; the load went
  // with it). The archive lists this block pins — the Past/Upcoming split, the
  // row-is-a-door link, the opacity-60 mute — are all still asserted, on the
  // surface that still renders them and always did: /u/<handle> (block 8
  // below, which is why block 6's assertions are now made there).
  // (6a)
  await expect(page.getByRole('link', { name: PAST_DROP_INS_LABEL })).toBeVisible()
  await page.getByRole('link', { name: PAST_DROP_INS_LABEL }).click()
  // V16 t04 moved the door's DESTINATION. It used to land on /profile, whose
  // "Hosted drop-ins" card held the Past list; that card is gone, so the door
  // now opens the viewer's own public page, which is the surface that really
  // lists their past drop-ins.
  await settleOnRoute(page, `/u/${encodeURIComponent(marker.displayName)}`)
  // The archive list genuinely IS here (the door is honest now)...
  await expect(section(page, 'Past').getByText(endedTitle, { exact: true })).toBeVisible()
  // ...and /profile's EDITOR no longer claims to hold it (V20 t01: /profile
  // opens on the read view, which legitimately lists the host's own posts — the
  // same render as /u/:handle — so the "no Hosted drop-ins list here" claim now
  // belongs to the EDITOR, where V16 t04 removed the card). Asserted explicitly
  // rather than deleted, so the day this is reconsidered the spec says why.
  await page.goto('/profile')
  await openProfileEditor(page)
  await expect(page.getByRole('heading', { name: 'Hosted drop-ins' })).toHaveCount(0)
  await expect(page.getByText(endedTitle, { exact: true })).toHaveCount(0)

  // --- (7) Through the door: the host's "Same time next week" (V8/09). GREEN
  // EITHER WAY (this one shipped in V8/09 and this ticket must not change it).
  // This is the HOST half of the gate; the pinger half ("only the host and the
  // families who pinged it") is pinned where the write path lives, in
  // e2e/loop-closing.e2e.ts. The door is now the archive CARD on /u/:handle —
  // the surface that still lists the host's past drop-ins. ---
  await page.goto(`/u/${encodeURIComponent(marker.displayName)}`)
  const pastRow = section(page, 'Past')
    .locator('a[href^="/playdate/"]')
    .filter({ hasText: endedTitle })
  await expect(pastRow).toBeVisible()
  await pastRow.click()
  await expect(page.getByTestId('same-time-next-week')).toBeVisible()
  await expect(page.getByText('Same time next week?')).toBeVisible()
  await expect(page.getByTestId('same-time-next-week-action')).toBeVisible()

  // --- (8) The archive CARD's rules, on the surface that renders cards
  // (/u/:handle — V8/04's Past section). GREEN EITHER WAY. ---
  await page.goto(`/u/${encodeURIComponent(marker.displayName)}`)
  // V25 ticket 05: the CARD, not its anchor. The card's box is the element that
  // carries `opacity-60` and the border/radius — the body <Link> inside it is
  // only the tap target now (the address's Maps row is the box's second child,
  // and it must mute with the card). Every assertion below is about the card,
  // and the muted class is only findable on the box, so this reads the box.
  const pastCard = section(page, 'Past')
    .getByTestId('dropin-card')
    .filter({ hasText: endedTitle })
  await expect(pastCard).toBeVisible()
  // Muted, with the "Ended" chip: DropInCard's `isEnded` styling — the SAME
  // signal the archive rows on /profile now carry.
  await expect(pastCard).toHaveClass(/opacity-60/)
  await expect(pastCard).toContainText('Ended')
  // The card is a real card (the tap target + its "More info" affordance), so
  // the next assertion is about a DropInCard and not about some plain row.
  await expect(pastCard).toContainText('More info')
  // (9) …and it carries NO controls: the feed's "I'm going" toggle is the FEED's
  // control (the page passes `pingToggle`; no archive list does). The control
  // for "a card of this shape CAN carry one" lives where the toggle does —
  // e2e/card-circles.e2e.ts asserts it on the feed for a non-host viewer.
  await expect(pastCard.getByRole('button')).toHaveCount(0)

  // --- (10) The archive is PER HOST, not per attendance — the limitation of the
  // AC's own placement ("the archive is /profile's Past list"), pinned so a
  // future change to that surface is deliberate rather than accidental. ---
  // A brand-new parent is the likeliest tapper of "See past drop-ins" (the link
  // exists precisely where their feed would otherwise be a dead end), and a
  // parent who PINGED someone else's ended drop-in has no listing surface at
  // all. Neither is visible from the marker's own session, so this uses a fresh
  // viewer: the documented `e2e-v-<epoch>` pattern (persists by design; the
  // orchestrator sweeps it).
  const viewerName = `e2e-v-${epoch}-archive`
  const viewerEmail = `${viewerName}@gmail.com` // gmail.com: the project rejects example.com
  const viewerPassword = `e2e-v-pw-${epoch}` // in-memory only — never written, never committed
  const viewerContext = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: { cookies: [], origins: [] },
  })
  const viewerPage = await viewerContext.newPage()
  // V20 t06: signup is first + last name + address now — one shared helper
  // (`signUpViewer`) so the form's field list lives in one place.
  await signUpViewer(viewerPage, {
    name: viewerName,
    email: viewerEmail,
    password: viewerPassword,
  })
  await finishSignup(viewerPage, {
    homeZip: marker.homeZip,
  })

  // Their own profile page, which V20 t01 now opens on the READ view. The
  // assertion is unchanged and still the point: this page lists the VIEWER's
  // own posts (their read view has a Hosted drop-ins section), and it must not
  // contain the marker's — the ended drop-in is not offered to a parent who
  // merely attended it, because only /u/<marker> lists the HOST's posts.
  await viewerPage.goto('/profile')
  await settleOnRoute(viewerPage, '/profile')
  await expect(viewerPage.getByText(endedTitle, { exact: true })).toHaveCount(0)
  // …and the ended drop-in IS reachable by URL for that viewer (the detail page
  // is the surface that holds their relationship to it: V8/09's affordance is
  // host-or-pinger gated, so a stranger gets the page without the offer).
  await viewerPage.goto(`/playdate/${endedId}`)
  await expect(viewerPage.getByRole('heading', { name: endedTitle, exact: true })).toBeVisible()
  await expect(viewerPage.getByTestId('same-time-next-week')).toHaveCount(0)
  await viewerContext.close()
  console.log(
    `[e2e markers] viewer ${viewerEmail} persists by design (e2e-v- prefix) — orchestrator sweep`,
  )
})

/**
 * V12 ticket 03 — the "ended" status: a host ends a FUTURE drop-in early.
 * Unlike the "ended lot" above (whose clock ran out), this post's window has
 * NOT started — only the host's explicit "End this post now" takes it out of
 * the feed (AC3: `isStillAhead` treats 'ended' as past). RED until 0041 is
 * applied live (the status write hits the live two-value CHECK — the
 * violation text lands in the first assertion message); green after.
 */
test('a host-ended post (status="ended") is absent from the feed and lands in Past (V12 t03)', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const earlyEndedTitle = `e2e-${epoch} ${marker.displayName} ended-early lot`
  // Set BEFORE posting (the module-scoped sweep contract).
  createdTitles = [earlyEndedTitle]

  // --- The row: a FUTURE drop-in (two days out — its window has not started).
  const endedEarlyId = await postDropIn(page, earlyEndedTitle, localDatePlusDays(2))

  // --- The status write, over REST with the marker's JWT (the 0005 host
  // policy is the wall; 0041 admits 'ended' into the CHECK). PRE-0041-APPLY
  // this expect IS the red capture: the live CHECK is still 0019's
  // ('on','cancelled'), so the violation text comes back in the body.
  const { ok, body } = await patchPostStatus(endedEarlyId, 'ended')
  expect(
    ok,
    `the status='ended' write must be accepted (pre-0041-apply this is the expected RED — ` +
      `the live CHECK violation: ${body})`,
  ).toBe(true)
  // …and it must be ON THE ROW (a 2xx is not proof — the logged RLS lesson).
  expect(await readPostStatus(endedEarlyId), 'status must read back as "ended" on the row').toBe(
    'ended',
  )

  // --- The feed: ABSENT. The read's .neq('status', 'ended') is what keeps it
  // out (the FUTURE window is the control: a clock-based cutoff would keep it
  // for two more days).
  await page.goto('/')
  await settleOnRoute(page, '/')
  await expect(page.getByText(earlyEndedTitle, { exact: true })).toHaveCount(0)

  // --- The archive: the owner's Past list on /profile, with the "Ended" label
  // (AC4: distinct from "Cancelled" — this row's window never ran out, the
  // host ended it early).
  //
  // V15.2 fix: the "See past drop-ins" link lives INSIDE the feed's non-empty
  // branch — with `posts.length === 0` the page renders `RadiusEmptyState`
  // instead, which has no archive door. This spec's only post is future-dated
  // and then marked ended, so the feed was EMPTY and the click waited its full
  // 120s on a link that is not rendered in that state. Seed one live post so the
  // feed is non-empty for the reason it is non-empty in real use — a parent
  // looking at this week's drop-ins — and the assertion tests the door.
  const liveControlTitle = `e2e-${epoch} ${marker.displayName} live control`
  createdTitles = [earlyEndedTitle, liveControlTitle]
  await postDropIn(page, liveControlTitle, localDatePlusDays(1))
  await page.goto('/')
  await settleOnRoute(page, '/')

  await page.getByRole('link', { name: PAST_DROP_INS_LABEL }).click()
  // V16 t04: the archive door now lands on the viewer's OWN public page, not
  // /profile — the "Hosted drop-ins" card that used to hold this Past list was
  // removed from /profile, which made the old destination a dead end.
  //
  // The ROW SHAPE changed with the surface, so the locator had to change too:
  // /profile rendered `<li>` rows, but /u/:handle renders DropInCard `<a>`
  // cards (see the passing locators at :461 and :473 above). A bare
  // `locator('li')` finds nothing here.
  await settleOnRoute(page, `/u/${encodeURIComponent(marker.displayName)}`)
  const pastRow = section(page, 'Past')
    .locator('a[href^="/playdate/"]')
    .filter({ hasText: earlyEndedTitle })
  await expect(pastRow, 'the ended-early post must be in the Past list').toBeVisible()
  await expect(section(page, 'Past').getByText(earlyEndedTitle, { exact: true })).toBeVisible()
  await expect(section(page, 'Upcoming').getByText(earlyEndedTitle, { exact: true })).toHaveCount(0)
  await expect(pastRow).toContainText('Ended')
})

/**
 * (11) The empty state, and the one place the archive link must NOT appear.
 *
 * The feed's empty state must offer the archive ("nothing ahead" is not "nothing
 * every"), and it must not imply anything about what is in it. /browse renders
 * the SAME component for the PLACES directory — a personal archive link there
 * would promise the viewer their own history from a screen about parks — so the
 * two callers are asserted against each other.
 *
 * Neither state can be produced from live data at the marker's pinned location,
 * so both are forced at the network layer (the feed's own read returns [], and
 * /browse's places read returns one REAL-SHAPED place ~15 mi away — outside the
 * marker's stored radius, so the app's own distance math is what empties the
 * screen). The route stubs are installed before the first navigation, because
 * the places read is cached per SPA session.
 */
test('the empty state offers the archive; the places directory does not', async ({ page }) => {
  const marker = readMarkerMeta()

  // The feed's own read, emptied. `[]` is exactly what PostgREST hands back for
  // no rows.
  await page.route(PLAYDATES_READ, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  // One place ~15 mi from 98107 (lat/lng chosen for distance, not for reality):
  // in radius terms the default view does not reach it, which is the state
  // Browse's empty state exists for — and the widest the LOCATION control offers
  // (its slider's max, 30) does, which is what makes the control assertion below
  // a real check rather than a stub that could never be shown.
  //
  // V31 map-and-distance: this stub used to sit ~53 mi out, because the radius
  // was changed by the DISTANCE pill, whose top ladder entry was 35. That pill is
  // deleted; with the location control as the one radius door, a place the
  // control cannot reach would make the "the far place is really there" control
  // impossible to satisfy. The distance was reduced to ~15 mi, which still loses
  // the place at the marker's stored radius (5) — the property this stub is for.
  const farPlace = {
    id: 'e2e-ended-out-place',
    name: 'E2E far park',
    kind: 'park',
    address: 'Far away, WA',
    lat: 47.4502,
    lng: -122.3779,
    indoor: false,
    age_min: null,
    age_max: null,
    notes: null,
    photo_url: null,
    neighborhood_id: null,
    source: 'hand',
  }
  await page.route(/\/rest\/v1\/places\?/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([farPlace]),
    }),
  )

  await page.goto('/')
  await settleOnRoute(page, '/')
  const empty = page.getByTestId('empty-radius-state')
  await expect(empty).toBeVisible()
  // The honest count is untouched by this ticket.
  await expect(empty).toContainText(`Nothing within ${marker.radiusMiles} miles yet.`)
  // V23 slice 1: the feed's ONE location control (the secondary button in the action
  // row) opens the shared LocationModal. V16 t06 item 1 used to suppress the empty
  // state's escape buttons HERE, because a persistent radius picker sat directly above
  // this state (a near-identical radius-button row one line apart — the two controls
  // that look alike doing the same job). V23 removed that picker, and V27 slice 1
  // stopped the feed opting out of the escapes: they are the feed's one-tap widen
  // path now, and the modal button alongside them is not a duplicate (one opens a
  // picker, the others widen inline). So this block asserts both render. Browse
  // renders the same component and checks the escapes in its own visit below.
  await expect(page.getByTestId('feed-location-control')).toBeVisible()
  await expect(empty.getByRole('button', { name: 'Widen to 20 miles' })).toHaveCount(1)
  // V23 slice 1: the empty state no longer renders its own "Post a drop-in" link
  // — the action row at the top of the page owns the ONE primary CTA.
  await expect(empty.getByRole('link', { name: 'Post a drop-in' })).toHaveCount(0)
  // V13 ticket 05 (A1): the empty-radius state no longer carries the archive
  // link — it was removed from RadiusEmptyState. The day-sections archive line
  // (FeedPage's own link under the feed) is the only remaining one, and it is
  // NOT visible in the empty state (no posts = no day sections).
  await expect(empty.getByRole('link', { name: PAST_DROP_INS_LABEL })).toHaveCount(0)

  // --- The same component, the other caller. ---
  await page.goto('/browse')
  await settleOnRoute(page, '/browse')
  const browseEmpty = page.getByTestId('empty-radius-state')
  await expect(browseEmpty).toBeVisible()
  // The radius IS the reason (the far place is real and in the directory), so
  // this is the same state the feed shows — with no archive line, because the
  // places directory has no personal archive behind it.
  await expect(browseEmpty.getByRole('link', { name: PAST_DROP_INS_LABEL })).toHaveCount(0)
  await expect(page.getByRole('link', { name: PAST_DROP_INS_LABEL })).toHaveCount(0)
  // CONTROL for the stub: the far place is really there — widening the radius to
  // the most the location control offers renders it, which proves the empty state
  // above was the radius's doing and not a page that failed to load its
  // directory. V31 map-and-distance: that control is `set-location-btn`'s modal
  // now (the distance pill and its sheet are deleted).
  await setDirectoryRadius(page)
  await expect(page.getByTestId('place-row')).toHaveCount(1)
  await expect(page.getByText(farPlace.name)).toBeVisible()
})

test.afterEach(async () => {
  if (createdTitles.length === 0) return
  // Best-effort cleanup (per house): delete THIS spec's rows over PostgREST,
  // scoped by title, with the marker's own access token (read out of the saved
  // storageState — the 0005 host-only DELETE policy). A failure is logged, not
  // fatal: the `e2e-<epoch>` prefix marks the rows for the orchestrator's sweep.
  try {
    const { userId } = readMarkerSession()
    let deleted = 0
    let remaining: number | null = 0
    for (const title of createdTitles) {
      const query =
        `playdates?host_profile_id=eq.${userId}` +
        `&title=eq.${encodeURIComponent(title)}&select=id`
      const del = await markerRest(query, { method: 'DELETE', headers: { Prefer: 'return=representation' } })
      const rows = del.ok ? ((await del.json()) as Array<Record<string, unknown>>) : []
      deleted += rows.length
      const check = await markerRest(query)
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
        `[e2e cleanup] ok — deleted ${deleted} feed-ended-out marker row(s); ` +
          `the marker account persists for the sweep`,
      )
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${
        err instanceof Error ? err.message : err
      } — orchestrator sweep (e2e- prefix) will pick stragglers up`,
    )
  } finally {
    createdTitles = []
  }
})
