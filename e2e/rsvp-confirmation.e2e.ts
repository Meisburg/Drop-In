/**
 * V25 ticket 13 — the RSVP confirmation lightbox, end to end.
 *
 * The founder, on a drop-in's detail page: "When you click that you're going on
 * somebody's event... It would be cool if ... there was some kind of lightboxed
 * notification about how you're going to the event." The ticket reads that as
 * the RSVP on a drop-in's detail page, and its criteria are the claims below.
 *
 * WHAT THIS SPEC PROVES, in one run against the live project:
 *
 *  1. A successful RSVP raises exactly ONE lightbox, and it says "You're
 *     going!", names the drop-in it is anchored to, and states the next steps.
 *  2. It is a REAL dialog: `role="dialog"`, `aria-modal="true"`, a real
 *     accessible name, its body wired as the description, focus moved in and
 *     trapped, Escape and a visible dismiss control, and the page behind it
 *     cannot scroll.
 *  3. Dismissing leaves the parent ON the detail page with the RSVP intact
 *     ("✓ Going" still pressed), and the dismissal sticks across a RELOAD — an
 *     already-going load never raises it.
 *  4. Taking the ping back raises nothing, and re-pinging raises exactly one
 *     again (a new yes is a new confirmation) — the false→true rule, live.
 *  5. THE HOST NEVER SEES IT — the host's own view has no dialog, because the
 *     host has no ping control at all.
 *  6. The feed card's own going toggle does not raise it (the ticket's explicit
 *     non-scope). This spec asserts the user-VISIBLE follow-up the card's ping
 *     leaves behind — the shell's fallback note, because this viewer has no
 *     Notification support so the prompt cannot ask — plus the fact that the
 *     armed trigger does not trail the parent around the app. The ASK path
 *     itself (a device that supports it) is pinned by
 *     `push-subscribe.e2e.ts:505`, which is green on this tree.
 *  7. The event line is the app's ONE when-rule over the post's REAL stored
 *     window — not a string this spec invented.
 *
 * WHY THE COPY IS ASSERTED EXACTLY. The mockup promised "you'll be added to the
 * group chat soon, keep an eye out for the notification". There is no group
 * chat, and the notification prompt is deliberately deferred off this route
 * (`lib/push.ts:394` `isPlaydateDetailPath`, applied at `:436`), so a promise like that would be a defect rather than
 * copy. The sentence the app ships names the affordance that exists ("message
 * the host... in your Inbox"), and the absence of the mockup's promise is
 * pinned BOTH here (the rendered text) and in the unit table
 * (`src/lib/rsvpConfirmation.test.ts`) — so neither a component edit nor a copy
 * edit can quietly reintroduce it.
 *
 * Cleanup mirrors inbox.e2e.ts: a best-effort REST delete of the marker's
 * playdate rows with the marker's own JWT (host-only DELETE policy;
 * going_pings + messages cascade with the post, 0007/0042). The viewer accounts
 * (`e2e-v-` prefix, no playdate rows of their own) are left for the
 * orchestrator's sweep.
 */
import { expect, test } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { cardWhenLabel } from '../src/lib/feed'
import {
  E2E_BASE_URL,
  editTitle, localDatePlusDays, readMarkerMeta, readMarkerSession,
  readSupabaseEnv, settleOnRoute, finishSignup,
  signUpViewer, stepStartTimeOnce,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'

// V33-6: the message-control geometry assertions (beside the Going control,
// intrinsic width, no page widening) only make sense at a phone width — at
// Playwright's default 1280px everything fits on one row and the "not
// full-width" check is vacuous. Pinned to 390px like post-again-overflow.
test.use({ viewport: { width: 390, height: 844 } })

/** Seed ONE post through the /new UI (the golden-path pattern). */
async function seedPostViaUi(page: Page, title: string): Promise<void> {
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill('E2E rsvp lot')
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  await stepStartTimeOnce(page)
  await expect(page.getByTestId('end-time-label')).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
}

/** Look up the most-recent marker playdate id by title (the marker's JWT). */
async function latestMarkerPlaydateIdByTitle(title: string): Promise<string> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const query =
    `${url}/rest/v1/playdates?host_profile_id=eq.${userId}` +
    `&title=eq.${encodeURIComponent(title)}&order=created_at.desc&limit=1&select=id`
  const res = await fetch(query, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  })
  expect(res.ok).toBe(true)
  const rows = (await res.json()) as Array<{ id: string }>
  expect(rows.length).toBe(1)
  return rows[0].id
}

/**
 * A fresh viewer, ON the detail page, who has NOT pinged yet. Split out of the
 * ping itself so this spec can assert the cold-load state (no lightbox) before
 * the tap — the assertion `createPingingViewer` in inbox.e2e.ts cannot make,
 * because it pings as part of setup.
 */
async function openViewerOnDetail(
  browser: Browser,
  playdateId: string,
  viewerName: string,
  viewerEmail: string,
  viewerPassword: string,
  homeZip: string,
  radiusMiles: number,
): Promise<{ context: BrowserContext; page: Page }> {
  const viewerContext = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: { cookies: [], origins: [] },
  })
  const viewerPage = await viewerContext.newPage()
  await signUpViewer(viewerPage, {
    name: viewerName,
    email: viewerEmail,
    password: viewerPassword,
  })
  await finishSignup(viewerPage, { homeZip, radiusMiles })
  await viewerPage.goto(`/playdate/${playdateId}`)
  // The page is genuinely loaded (its RSVP control renders) before anything is
  // asserted about what is NOT on it.
  await expect(viewerPage.getByRole('button', { name: /^I’m going$/ })).toBeVisible()
  await expect(viewerPage.getByTestId('rsvp-confirmation')).toHaveCount(0)
  return { context: viewerContext, page: viewerPage }
}

/**
 * V28 r3-3 (r3-D1) — WHERE THE RSVP CONTROL SITS ON THE PAGE.
 *
 * The human's phone walk: "a user decides whether they are going AFTER reading
 * about the event." This REVERSES A14 (V15 ticket 08), which had moved the block
 * to the very top on the founder's earlier note. The reversal is deliberate and
 * recorded in `.scratch/v28/reports/r3-3-decision.md`; the code comment above the
 * render says so too.
 *
 * PINNED IN DOM ORDER, not by a screenshot: `compareDocumentPosition` is the same
 * mechanism `e2e/kids-surface.e2e.ts` uses, and DOM order is also the a11y reading
 * order — which is the half a visual check cannot see.
 */
test('the RSVP control renders AFTER the event information, not above it', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e ${marker.displayName} rsvp order`
  const viewerName = `e2e-v-${epoch}-rsvp-order`
  const viewerEmail = `e2e-v-${epoch}-rsvp-order@gmail.com`
  const viewerPassword = `e2e-v-pw-${epoch}-rsvp-order`

  await seedPostViaUi(page, title)
  const playdateId = await latestMarkerPlaydateIdByTitle(title)

  const viewer = await openViewerOnDetail(
    browser,
    playdateId,
    viewerName,
    viewerEmail,
    viewerPassword,
    marker.homeZip,
    marker.radiusMiles,
  )
  const viewerPage = viewer.page
  const goingButton = viewerPage.getByRole('button', { name: /^I’m going$/ })
  await expect(goingButton).toBeVisible()

  const order = await viewerPage.evaluate(() => {
    const rsvp = document.querySelector('button[aria-pressed]')
    const title = document.querySelector('h1')
    const host = Array.from(document.querySelectorAll('a')).find((a) =>
      (a.textContent ?? '').startsWith('Hosted by @'),
    )
    if (rsvp === null || title === null || host === undefined) return null
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING
    return {
      // Both must FOLLOW the title: (title before rsvp) and (title before host).
      titleBeforeRsvp: (title.compareDocumentPosition(rsvp) & FOLLOWING) !== 0,
      titleBeforeHost: (title.compareDocumentPosition(host) & FOLLOWING) !== 0,
      // And the host line must come before the control — the control is last.
      hostBeforeRsvp: (host.compareDocumentPosition(rsvp) & FOLLOWING) !== 0,
    }
  })

  expect(order).not.toBeNull()
  expect(order).toEqual({
    titleBeforeRsvp: true,
    titleBeforeHost: true,
    hostBeforeRsvp: true,
  })
})

test('an RSVP raises one lightbox, Escape closes it, and it never comes back for that yes', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e ${marker.displayName} rsvp lightbox`
  const viewerName = `e2e-v-${epoch}-rsvp`
  const viewerEmail = `e2e-v-${epoch}-rsvp@gmail.com`
  const viewerPassword = `e2e-v-pw-${epoch}-rsvp`

  // --- 1. The marker hosts a drop-in; the viewer has something to RSVP to. ---
  await seedPostViaUi(page, title)
  const playdateId = await latestMarkerPlaydateIdByTitle(title)

  const viewer = await openViewerOnDetail(
    browser,
    playdateId,
    viewerName,
    viewerEmail,
    viewerPassword,
    marker.homeZip,
    marker.radiusMiles,
  )
  const viewerPage = viewer.page

  // --- 2. THE COLD LOAD: the RSVP is un-taken and NOTHING is raised. ---
  const goingButton = viewerPage.getByRole('button', { name: /^I’m going$/ })
  await expect(goingButton).toHaveAttribute('aria-pressed', 'false')
  await expect(viewerPage.getByTestId('rsvp-confirmation')).toHaveCount(0)

  // --- 3. THE ACTION: the detail page's own RSVP control. ---
  await goingButton.click()
  const confirmButton = viewerPage.getByRole('button', { name: /^✓ Going$/ })
  await expect(confirmButton).toHaveAttribute('aria-pressed', 'true')

  // --- 4. IT IS A REAL DIALOG, and it is anchored to THIS drop-in. ---
  const dialog = viewerPage.getByTestId('rsvp-confirmation')
  await expect(dialog).toBeVisible()
  // Exactly one: a second confirmation for the same yes is the nagging failure.
  await expect(dialog).toHaveCount(1)
  await expect(dialog).toHaveAttribute('role', 'dialog')
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  // A real accessible name, wired to the rendered heading (not an aria-label
  // duplicating the visible title).
  const labelledBy = await dialog.getAttribute('aria-labelledby')
  expect(labelledBy).toBeTruthy()
  await expect(viewerPage.locator(`#${labelledBy}`)).toHaveText('You’re going!')
  // The body is the dialog's description.
  const describedBy = await dialog.getAttribute('aria-describedby')
  expect(describedBy).toBeTruthy()
  await expect(viewerPage.locator(`#${describedBy}`)).toBeVisible()
  // THE COPY: the drop-in it is for, and the next steps.
  await expect(viewerPage.getByTestId('rsvp-confirmation-event')).toContainText(title)
  const next = viewerPage.getByTestId('rsvp-confirmation-next')
  await expect(next).toContainText('message the host')
  await expect(next).toContainText('Inbox')
  // AND THE PROMISE IT MUST NOT MAKE (the mockup's example line).
  await expect(dialog).not.toContainText('group chat')
  await expect(dialog).not.toContainText('notification')
  // It is NOT the photo viewer.
  await expect(viewerPage.getByTestId('lightbox-photo')).toHaveCount(0)

  // --- 4b. v33-13 — THE DELIGHT HALF: the drop-in mark sits above the text,
  //         and the confetti layer is present, decorative, and bounded. ---
  const mark = viewerPage.getByTestId('rsvp-confirmation-mark')
  await expect(mark).toBeVisible()
  // The mark is ABOVE the event line in DOM order (the annotation's "at the top
  // above the text"), pinned by document position like the RSVP-order test.
  const markAboveEvent = await viewerPage.evaluate(() => {
    const m = document.querySelector('[data-testid="rsvp-confirmation-mark"]')
    const e = document.querySelector('[data-testid="rsvp-confirmation-event"]')
    if (m === null || e === null) return false
    return (m.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  })
  expect(markAboveEvent, 'the mark must sit above the event line').toBe(true)
  // Decorative: hidden from the accessibility tree (the title already names
  // the event), and not a second h1 / focus stop.
  await expect(mark).toHaveAttribute('aria-hidden', 'true')
  await expect(viewerPage.locator('[data-testid="rsvp-confirmation-mark"][tabindex]')).toHaveCount(0)
  const confettiLayer = viewerPage.getByTestId('rsvp-confetti')
  await expect(confettiLayer).toHaveCount(1)
  await expect(confettiLayer).toHaveAttribute('aria-hidden', 'true')
  // Bounded to the dialog: no piece escapes the panel's own box. The check
  // runs AFTER the burst has settled (the pieces' total duration is bounded
  // by the lib — `MAX_TOTAL_MS`), so every piece sits at its keyframe END,
  // which lands inside the layer; mid-flight positions are not asserted
  // because they depend on when the walk reaches this line.
  const piecesBounded = await viewerPage.evaluate(() => {
    return new Promise<boolean>((resolve) => {
      const layer = document.querySelector('[data-testid="rsvp-confetti"]')
      if (layer === null) {
        resolve(false)
        return
      }
      let attempts = 0
      const check = () => {
        attempts += 1
        const layerBox = layer.getBoundingClientRect()
        const pieces = Array.from(layer.querySelectorAll('.rsvp-confetti-piece'))
        const settled = pieces.every((piece) => getComputedStyle(piece).animationPlayState !== 'running')
        if (!settled && attempts < 60) {
          window.setTimeout(check, 50)
          return
        }
        const violations = pieces.map((piece) => {
          const box = piece.getBoundingClientRect()
          return [
            Math.round(box.left - layerBox.left),
            Math.round(box.right - layerBox.right),
            Math.round(box.top - layerBox.top),
            Math.round(box.bottom - layerBox.bottom),
          ]
        })
        console.log(
          '[v33-13] pieces=' + pieces.length + ' settled=' + settled + ' layerH=' + Math.round(layerBox.height) + ' violations=' + JSON.stringify(violations),
        )
        document.title = '[v33-13] pieces=' + pieces.length + ' settled=' + settled + ' layerH=' + Math.round(layerBox.height) + ' v=' + JSON.stringify(violations)
        resolve(
          pieces.every((piece) => {
            const box = piece.getBoundingClientRect()
            return (
              box.left >= layerBox.left - 1 &&
              box.right <= layerBox.right + 1 &&
              box.top >= layerBox.top - 1 &&
              box.bottom <= layerBox.bottom + 1
            )
          }),
        )
      }
      check()
    })
  })
  expect(piecesBounded, 'confetti pieces must stay inside the dialog').toBe(true)
  // NO LAYOUT SHIFT: the Got-it button keeps its box with the layer present.
  const gotItWithConfetti = await viewerPage.getByTestId('rsvp-confirmation-got-it').boundingBox()
  expect(gotItWithConfetti, 'Got it has no layout box').not.toBeNull()
  await viewerPage.evaluate(() => {
    const layer = document.querySelector('[data-testid="rsvp-confetti"]')
    layer?.remove()
  })
  const gotItWithoutConfetti = await viewerPage.getByTestId('rsvp-confirmation-got-it').boundingBox()
  expect(gotItWithoutConfetti, 'Got it lost its layout box').not.toBeNull()
  expect(Math.abs(gotItWithConfetti!.x - gotItWithoutConfetti!.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(gotItWithConfetti!.y - gotItWithoutConfetti!.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(gotItWithConfetti!.width - gotItWithoutConfetti!.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(gotItWithConfetti!.height - gotItWithoutConfetti!.height)).toBeLessThanOrEqual(1)
  // Restore the layer for the rest of the walk.
  await viewerPage.evaluate(() => {
    const dialogEl = document.querySelector('[data-testid="rsvp-confirmation"]')
    if (dialogEl === null) return
    const wrapper = dialogEl.querySelector(':scope > div.relative')
    if (wrapper === null) return
    const restored = document.createElement('div')
    restored.setAttribute('aria-hidden', 'true')
    restored.setAttribute('data-testid', 'rsvp-confetti')
    restored.className = 'rsvp-confetti-layer pointer-events-none'
    wrapper.appendChild(restored)
  })
  // 390×844 FITS: every control stays inside the viewport, on the ≥44px floor.
  const controlsFitted = await viewerPage.evaluate(() => {
    const dialogEl = document.querySelector('[data-testid="rsvp-confirmation"]')
    if (dialogEl === null) return null
    const boxes = [
      dialogEl,
      document.querySelector('[data-testid="rsvp-confirmation-mark"]'),
      document.querySelector('[data-testid="rsvp-confirmation-got-it"]'),
      document.querySelector('[data-testid="rsvp-confirmation-dismiss"]'),
    ].filter((el): el is Element => el !== null)
    const within = boxes.every((el) => {
      const box = el.getBoundingClientRect()
      return box.left >= 0 && box.top >= 0 && box.right <= window.innerWidth && box.bottom <= window.innerHeight
    })
    const floors = [
      document.querySelector('[data-testid="rsvp-confirmation-got-it"]'),
      document.querySelector('[data-testid="rsvp-confirmation-dismiss"]'),
    ].filter((el): el is Element => el !== null)
    const floored = floors.every((el) => {
      const box = el.getBoundingClientRect()
      return box.width >= 44 && box.height >= 44
    })
    return { within, floored }
  })
  expect(controlsFitted, 'no control box could be read').not.toBeNull()
  expect(controlsFitted!.within, 'a control escapes the 390×844 viewport').toBe(true)
  expect(controlsFitted!.floored, 'a control dropped under the 44px floor').toBe(true)

  // --- 5. FOCUS IS INSIDE, AND STAYS (the trap), and the body cannot scroll. ---
  const gotIt = viewerPage.getByTestId('rsvp-confirmation-got-it')
  const dismiss = viewerPage.getByTestId('rsvp-confirmation-dismiss')
  await expect(gotIt).toBeFocused()
  // The dismiss control is reachable without a pointer and has an accessible
  // NAME (the glyph itself is aria-hidden).
  await expect(dismiss).toHaveAttribute('aria-label', 'Close')
  // TAP TARGETS: this repo's floor is 44px in the smallest dimension
  // (`.opencodereview/rule.json`, measured by `scripts/mobile-audit.mjs`), and
  // it is asserted here because NEITHER control carries an `h-*`/`w-*` class, so
  // the static rule cannot see them. `Got it` rendered 73x42 before this
  // round's `min-h-11` (2px under); the dismiss control's own `min-h-11
  // min-w-11` was already correct. Both boxes are read from the live layout.
  for (const [label, control] of [
    ['Got it', gotIt],
    ['dismiss', dismiss],
  ] as const) {
    const box = await control.boundingBox()
    expect(box, `${label} has no layout box`).not.toBeNull()
    expect(box!.height, `${label} is under the 44px tap-target floor`).toBeGreaterThanOrEqual(44)
    expect(box!.width, `${label} is under the 44px tap-target floor`).toBeGreaterThanOrEqual(44)
  }
  // Two focusable controls, so Tab must land on the other one and then wrap —
  // either direction escaping shows up here.
  await viewerPage.keyboard.press('Tab')
  await expect(dismiss).toBeFocused()
  await viewerPage.keyboard.press('Shift+Tab')
  await expect(gotIt).toBeFocused()
  expect(
    await viewerPage.evaluate(
      () =>
        document
          .querySelector('[data-testid="rsvp-confirmation"]')
          ?.contains(document.activeElement) ?? false,
    ),
    'focus must still be inside the dialog after Tab and Shift+Tab',
  ).toBe(true)
  expect(
    await viewerPage.evaluate(() => document.body.style.overflow),
    'the page behind the dialog must not scroll',
  ).toBe('hidden')

  // --- 6. THE WRITE WAS NOT DELAYED BY ANY OF THIS: it is in the DB already,
  //         so the page behind offers the participant affordances. V33-6: the
  //         message entry point now sits in the RSVP block, beside the Going
  //         control — intrinsic width, not full-width. ---
  const goingControl = viewerPage.getByRole('button', { name: /^✓ Going$/ })
  await expect(goingControl).toBeVisible()
  const messageButton = viewerPage.getByRole('button', { name: 'Message the host' })
  await expect(messageButton).toBeVisible()
  // GEOMETRY (AC1): the two boxes overlap vertically (same row band), asserted
  // on boxes rather than DOM order.
  const goingBox = await goingControl.boundingBox()
  const messageBox = await messageButton.boundingBox()
  expect(goingBox, 'Going control has no layout box').not.toBeNull()
  expect(messageBox, 'message control has no layout box').not.toBeNull()
  expect(Math.abs(goingBox!.y - messageBox!.y)).toBeLessThan(messageBox!.height)
  // NOT FULL-WIDTH (AC2): at 390px the message control is narrower than its
  // containing row, and the page does not widen.
  const rowBox = await viewerPage.locator('button[aria-pressed]').first().locator('..').boundingBox()
  expect(rowBox, 'RSVP row has no layout box').not.toBeNull()
  expect(messageBox!.width).toBeLessThan(rowBox!.width)
  const scrollWidths = await viewerPage.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidths.scrollWidth).toBeLessThanOrEqual(scrollWidths.clientWidth + 1)
  // TAP TARGET floor: the moved control keeps ≥44px smallest dimension.
  expect(messageBox!.height).toBeGreaterThanOrEqual(44)
  expect(messageBox!.width).toBeGreaterThanOrEqual(44)

  // --- 7. ESCAPE CLOSES IT, and the parent is left on the detail page with the
  //         RSVP intact — the ticket's own criterion for dismissing.
  //
  //         Deliberately NOT asserted: focus returning to the control that
  //         opened the flow. That is a REAL gap, but it is a pre-existing
  //         defect in the shared `ModalShell`/`useFocusTrap` seam (the shell's
  //         focus effect runs before the trap's, so the trap captures the
  //         dialog's own first control and skips the restore on close), it
  //         affects all five modal callers, and this ticket does not require
  //         it. It is filed as its own follow-up ticket; pinning it here would
  //         make this spec red for someone else's bug, and pinning it as a
  //         `.skip`/`.fixme` would hide it. Focus CONTAINMENT while the dialog
  //         is open is asserted above (step 5), which is what the ticket asks. ---
  await viewerPage.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  expect(new URL(viewerPage.url()).pathname).toBe(`/playdate/${playdateId}`)
  await expect(confirmButton).toHaveAttribute('aria-pressed', 'true')
  expect(
    await viewerPage.evaluate(() => document.body.style.overflow),
    'the scroll lock must be released when the dialog closes',
  ).not.toBe('hidden')

  // --- 8. IT NEVER RE-RAISES FOR THAT YES: a reload of an already-going post
  //         does not greet the parent again. ---
  await viewerPage.reload()
  await expect(viewerPage.getByRole('button', { name: /^✓ Going$/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(viewerPage.getByTestId('rsvp-confirmation')).toHaveCount(0)

  // --- 9. TAKING THE PING BACK RAISES NOTHING. ---
  await viewerPage.getByRole('button', { name: /^✓ Going$/ }).click()
  await expect(viewerPage.getByRole('button', { name: /^I’m going$/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(viewerPage.getByTestId('rsvp-confirmation')).toHaveCount(0)

  // --- 10. RE-PINGING IS A NEW YES, so it confirms EXACTLY ONCE more — and the
  //          one-tap dismiss leaves the RSVP in place. ---
  await viewerPage.getByRole('button', { name: /^I’m going$/ }).click()
  await expect(viewerPage.getByTestId('rsvp-confirmation')).toHaveCount(1)

  // --- 10b. v33-13 — REDUCED MOTION: nothing animates, nothing is lost. The
  //          preference is per-context, so a FRESH context emulates it; the
  //          same ping raises the same dialog, and under `reduce` every piece's
  //          computed `animationName` is `none` while the title, both
  //          paragraphs, the mark and "Got it" all stay present + visible. ---
  const reducedContext = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: { cookies: [], origins: [] },
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
  })
  const reducedPage = await reducedContext.newPage()
  await signUpViewer(reducedPage, {
    name: `e2e-v-${epoch}-rsvpreduce`,
    email: `e2e-v-${epoch}-rsvpreduce@gmail.com`,
    password: `e2e-v-pw-${epoch}-rsvpreduce`,
  })
  await finishSignup(reducedPage, { homeZip: marker.homeZip, radiusMiles: marker.radiusMiles })
  await reducedPage.goto(`/playdate/${playdateId}`)
  await reducedPage.getByRole('button', { name: /^I’m going$/ }).click()
  const reducedDialog = reducedPage.getByTestId('rsvp-confirmation')
  await expect(reducedDialog).toBeVisible()
  const pieceAnimations = await reducedPage.evaluate(() => {
    const layer = document.querySelector('[data-testid="rsvp-confetti"]')
    if (layer === null) return null
    return Array.from(layer.querySelectorAll('.rsvp-confetti-piece')).map((piece) =>
      getComputedStyle(piece).animationName,
    )
  })
  expect(pieceAnimations, 'the confetti layer did not render').not.toBeNull()
  expect(pieceAnimations!.length).toBeGreaterThan(0)
  for (const name of pieceAnimations!) {
    expect(name, 'a piece still animates under prefers-reduced-motion').toBe('none')
  }
  // No content is lost: the whole dialog reads as before, just without motion.
  await expect(reducedPage.locator(`#${labelledBy}`)).toHaveText('You’re going!')
  await expect(reducedPage.getByTestId('rsvp-confirmation-event')).toBeVisible()
  await expect(reducedPage.getByTestId('rsvp-confirmation-next')).toBeVisible()
  await expect(reducedPage.getByTestId('rsvp-confirmation-mark')).toBeVisible()
  await expect(reducedPage.getByTestId('rsvp-confirmation-got-it')).toBeVisible()
  await reducedContext.close()

  // --- 10c. v33-13 — SCOPE: the delight lives in THIS component, not in
  //          `ModalShell`. Open a plain `ConfirmDialog` flow (the comment
  //          delete confirm) and assert zero confetti there. The marker is the
  //          comment's author, so the delete control is theirs to drive. ---
  await seedPostViaUi(page, `${title} scope`)
  const scopePlaydateId = await latestMarkerPlaydateIdByTitle(`${title} scope`)
  await page.goto(`/playdate/${scopePlaydateId}`)
  const scopeComment = `e2e ${marker.displayName} rsvp scope`
  await page.locator('#comment-composer').fill(scopeComment)
  await page.getByRole('button', { name: 'Comment' }).click()
  await page.locator('li').filter({ hasText: scopeComment }).first().getByRole('button', { name: 'Delete' }).click()
  const scopeDialog = page.getByTestId('comment-action-dialog')
  await expect(scopeDialog).toBeVisible()
  await expect(page.getByTestId('rsvp-confetti')).toHaveCount(0)
  await expect(page.getByTestId('rsvp-confirmation-mark')).toHaveCount(0)
  await scopeDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(scopeDialog).toHaveCount(0)

  // --- 10d. THE POSITIVE CONTROL for the motion rule: with the DEFAULT
  //          preference this panel really does run `modal-pop`, so the shipped
  //          suppression (`motion-reduce:animate-none` → `animation: none`
  //          inside the `@media (prefers-reduced-motion: reduce)` block)
  //          switches off something that exists rather than a permanently dead
  //          property. The reduced-motion half itself is asserted where it is
  //          deterministic — as a COMPUTED value under the emulated context
  //          above, which no unit test can express without a DOM. The re-ping's
  //          dialog is still open here, so the poll reads it directly. ---
  let defaultMotionSawAnimation = false
  await expect
    .poll(
      async () => {
        const name = await viewerPage
          .getByTestId('rsvp-confirmation')
          .evaluate((el) => getComputedStyle(el).animationName)
        if (name !== 'none') defaultMotionSawAnimation = true
        return defaultMotionSawAnimation
      },
      { timeout: 5000 },
    )
    .toBe(true)
  // Dismissing with the one control leaves the parent on the detail page with
  // the RSVP intact — the ticket's criterion. Opener focus-restore is NOT
  // asserted: it is a measured gap in the shared `ModalShell` seam, filed as
  // its own follow-up (see step 7 above), and not something this slice ships.
  await viewerPage.getByTestId('rsvp-confirmation-got-it').click()
  await expect(viewerPage.getByTestId('rsvp-confirmation')).toHaveCount(0)
  await expect(viewerPage.getByRole('button', { name: /^✓ Going$/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(new URL(viewerPage.url()).pathname).toBe(`/playdate/${playdateId}`)

  await viewer.context.close()
})

test('the host never sees the confirmation, and the feed card’s toggle does not raise it', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e ${marker.displayName} rsvp host-side`

  await seedPostViaUi(page, title)
  const playdateId = await latestMarkerPlaydateIdByTitle(title)

  // --- 1. THE HOST's own view: the post is loaded, the host panel is there,
  //         and there is no ping control to tap — so no confirmation. ---
  await page.goto(`/playdate/${playdateId}`)
  await expect(page.getByText('This is your post')).toBeVisible()
  await expect(page.getByTestId('rsvp-confirmation')).toHaveCount(0)
  // The host's page has no "I'm going" control at all (the client guard in
  // db.togglePing and the 0010 DB trigger are the write-side wall behind it).
  await expect(page.getByRole('button', { name: /^I’m going$/ })).toHaveCount(0)
  // V33-6: the host's message entry point is one per-pinger button, beside the
  // post panel — a stranger sees none, and the gate did not widen.
  await expect(page.locator('button').filter({ hasText: /^Message / })).toHaveCount(0)
  // The notification prompt is deferred off this route by the earlier audit
  // (lib/push.ts:394 `isPlaydateDetailPath`, applied at :436) — this slice must
  // not have re-armed it.
  await expect(page.getByTestId('push-optin-prompt')).toHaveCount(0)

  // --- 2. A VIEWER uses the FEED CARD's own going toggle. That path does not
  //         navigate to the detail page, and by design does NOT raise the
  //         confirmation (the ticket's explicit non-scope). ---
  // A FRESH context: `browser.newContext({})` would inherit the project's
  // `storageState` and be the MARKER itself — and the marker cannot ping its own
  // post (`db.togglePing`'s client guard), so the card's write would silently
  // no-op and the assertion below would be measuring the wrong account.
  const viewerContext = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: { cookies: [], origins: [] },
  })
  const viewer = await viewerContext.newPage()
  await signUpViewer(viewer, {
    name: `e2e-v-${epoch}-rsvpcard`,
    email: `e2e-v-${epoch}-rsvpcard@gmail.com`,
    password: `e2e-v-pw-${epoch}-rsvpcard`,
  })
  await finishSignup(viewer, {
    homeZip: marker.homeZip,
    radiusMiles: marker.radiusMiles,
  })

  // The card is the feed's link to the post (the house locator — card-circles
  // and guest-list use the same one).
  const card = viewer.locator('a').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  // The toggle's accessible name FLIPS with its state ("Say we're going to …"
  // → "Going — tap to take it back"), so the locator has to survive that flip:
  // an `aria-pressed`-based handle does, a name-based one stops resolving the
  // instant the write lands. (The first version of this assertion used the name
  // locator and failed with "element(s) not found" — the flip had happened.)
  const cardToggle = card.getByRole('button', { name: /^Say we’re going to/ })
  await cardToggle.click()
  const pressedToggle = card.locator('button[aria-pressed="true"]')
  // THE WRITE LANDED FIRST — the same control a parent sees, now pressed. The
  // arm below is only meaningful over a ping that actually saved; without this
  // line the `ping_saved` assertion could only ever say "the click did
  // something", and this spec exists to say the card path is UNCHANGED.
  await expect(pressedToggle).toHaveAttribute('aria-label', /^Going — tap to take it back$/)
  await expect(viewer.getByTestId('rsvp-confirmation')).toHaveCount(0)
  // THE CARD PATH IS UNCHANGED (V8 ticket 08): the ping armed the same
  // follow-up the detail page's ping does.
  //
  // Asserted as the OUTCOME the parent sees, NOT as the raw
  // `sessionStorage['dropin.push.trigger']` needle. The first version of this
  // spec polled that key and got `null`, which looked like a broken arm — it was
  // not. This viewer has no Notification support, so the shell's prompt cannot
  // ask; on the FEED it therefore surfaces the honest fallback sentence and
  // CONSUMES the trigger (`PushOptInPrompt.tsx:122 clearArmedPushPrompt`). The
  // firing note is the proof the trigger existed; the key is gone precisely
  // because the arm worked. (The ask path itself, on a device that supports it,
  // is pinned by `e2e/push-subscribe.e2e.ts:505` — 8/8 green on this tree.)
  await expect(viewer.getByTestId('push-optin-note')).toBeVisible()
  await expect(viewer.getByTestId('push-optin-note')).toContainText('While you were away')
  // And the trigger cannot trail the parent around the app.
  expect(await viewer.evaluate(() => window.sessionStorage.getItem('dropin.push.trigger'))).toBeNull()

  await viewerContext.close()
})

test('the confirmation names the drop-in’s real day and time window', async ({ page, browser }) => {
  const epoch = Math.floor(Date.now() / 1000)
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} rsvp when`

  // The `page` fixture IS the marker's own signed-in context (the setup
  // project's storageState), which is what seeds the post.
  await seedPostViaUi(page, title)

  // The marker's own stored window, read back with the marker's JWT, so the
  // expected when-line is the ROW's and not a string this spec invented.
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const res = await fetch(
    `${url}/rest/v1/playdates?host_profile_id=eq.${userId}` +
      `&title=eq.${encodeURIComponent(title)}&order=created_at.desc&limit=1` +
      `&select=id,starts_at,ends_at`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } },
  )
  expect(res.ok).toBe(true)
  const rows = (await res.json()) as Array<{ id: string; starts_at: string; ends_at: string }>
  expect(rows).toHaveLength(1)
  const expectedWhen = cardWhenLabel(rows[0].starts_at, rows[0].ends_at)

  // A fresh viewer pings it; the event line must carry that exact window.
  const viewerContext = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: { cookies: [], origins: [] },
  })
  const viewer = await viewerContext.newPage()
  await signUpViewer(viewer, {
    name: `e2e-v-${epoch}-rsvpwhen`,
    email: `e2e-v-${epoch}-rsvpwhen@gmail.com`,
    password: `e2e-v-pw-${epoch}-rsvpwhen`,
  })
  await finishSignup(viewer, {
    homeZip: marker.homeZip,
    radiusMiles: marker.radiusMiles,
  })
  await viewer.goto(`/playdate/${rows[0].id}`)
  await viewer.getByRole('button', { name: /^I’m going$/ }).click()
  await expect(viewer.getByTestId('rsvp-confirmation')).toHaveCount(1)
  await expect(viewer.getByTestId('rsvp-confirmation-event')).toContainText(title)
  await expect(viewer.getByTestId('rsvp-confirmation-event')).toContainText(expectedWhen)
  await viewerContext.close()
})

test.afterEach(async () => {
  // Best-effort cleanup (per house): delete the HOST marker's playdate rows via
  // REST with the marker's own JWT (host-only DELETE policy). going_pings +
  // messages cascade with the post (0007/0042). The viewer accounts
  // (e2e-v- prefix, no playdate rows of their own) persist for the
  // orchestrator's sweep. A failure is logged, never fatal.
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
        `[e2e cleanup] ok — deleted host marker playdate row(s) (host ${userId}); pings + messages cascaded`,
      )
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${err instanceof Error ? err.message : err}`,
    )
  }
})
