/**
 * Spec (V28 slice 4c): the first run's card sequence is driven by the FACTS,
 * not by flags (plan defect #22). The page's card gate was a local flag that
 * reset on every mount, so a parent who finished kids and abandoned at the
 * last card re-entered and was offered the KIDS CARD AGAIN — re-answering
 * it calls addKid again and writes duplicate kids rows (the cap of 5 limits
 * it, it does not dedupe). Decision 6: "resume at the card they left. Never a
 * wall, never a restart."
 *
 * WHAT THIS SPEC PROVES, precisely:
 *
 * (1) RE-ENTRY RESUMES. A parent who wrote a kid row on the kids card and
 *     abandoned at the AREA card — the run's last card (4 of 4, V28 slice 5;
 *     before that slice it was the bare
 *     "Set your location" view, the most likely abandonment point)
 *     re-enters /onboarding and lands on the AREA CARD, not the kids card.
 *     The KIDS fact comes from the onboarding write itself. Re-entering
 *     offers no kids card at all, so no second addKid can run: the
 *     kids-table count is asserted to be exactly the one row the card
 *     wrote. (The old photo fact this test seeded is gone with the photo
 *     card — V28 r2 slice 1b removed it and its hasPhoto fact from the
 *     gate, so there is nothing to seed; the resume decision now runs on
 *     the kids + zip facts only.)
 *
 * (2) A FRESH PARENT'S FIRST CARD EQUALS nextUnfinishedCard(facts), and a
 *     SKIP STILL ADVANCES. For a parent with no kids and no zip
 *     (all flags false on a fresh mount), the first card shown is the kids
 *     card — nextUnfinishedCard({hasName, !hasKids, !hasZip})
 *     is exactly 'kids'. Within ONE session a flag may legitimately point
 *     FURTHER ALONG than the fact: the kids fact still says "no kids"
 *     after the parent taps Skip (firstRun's documented rule — a skipped
 *     optional card is re-offered, and `!hasKids` alone would re-render
 *     the card after its own Skip, forever), but the session flag
 *     (kidsCardDone) points past it, so the Skip advances to the AREA card
 *     (4 of 4, V28 slice 5 — the card the deleted photo card used to sit
 *     before) and the kids card never re-appears.
 *
 * Viewer pattern (the zip-radius one): each test signs up a SECOND
 * deterministic viewer (`e2e-r1-<epoch>` / `e2e-r2-<epoch>` prefix,
 * sweepable by the orchestrator) in a FRESH context — the default context
 * carries the marker's session, and the viewer must start signed-out.
 * The viewers are left for the sweep (no playdate rows of their own); the
 * one kids row in test 1 belongs to the sweeped profile.
 */
import { expect, test, type Browser } from '@playwright/test'
import {
  readSessionFromBrowserPage,
  readSupabaseEnv,
  signUpViewer,
} from './fixtures'

const BASE_URL = 'http://localhost:4173'

/** A fresh, signed-out viewer context (the zip-radius pattern). */
async function freshViewer(browser: Browser) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  })
  return context
}

test('a returning parent with kids (and no zip) re-enters at the area card — never the kids card, no duplicate kids', async ({
  browser,
}) => {
  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-r1-${epoch}`
  const viewerEmail = `e2e-r1-${epoch}@gmail.com` // gmail.com: the project rejects example.com
  const viewerPassword = `e2e-r1-pw-${epoch}` // in-memory only — never written, never committed
  const context = await freshViewer(browser)
  const page = await context.newPage()

  // --- Walk the first run to the LAST card, then abandon. ---
  // signUpViewer completes the account + name cards (card 1 + card 2).
  await signUpViewer(page, {
    name: viewerName,
    email: viewerEmail,
    password: viewerPassword,
  })

  // KIDS CARD (3 of 4): write exactly ONE kid row — this is the row a
  // restart would DUPLICATE if the card were offered again on re-entry.
  await page.getByRole('button', { name: 'Add a kid' }).click()
  await page.getByPlaceholder('First name').fill('Remy')
  await page.getByPlaceholder('Age').fill('7')
  await page.getByRole('button', { name: /^Continue/ }).click()
  // Wait for the write to land and the card to advance: until it lands,
  // the kids card is still on screen. (V28 r2 slice 1b deleted the photo
  // card, so the card the run lands on now — and this test's resume
  // checkpoint — is the AREA card itself.)
  await expect(page.getByTestId('first-run-area-card')).toBeVisible()
  // ABANDON at the area card (the run's last card — it has no Skip
  // control): leave, and come back COLD (a fresh mount —
  // the flags reset to false, which is what a restart would show again).
  await page.goto('/')

  // The photo fact this walk used to seed (the /profile editor's avatar
  // upload, owner-scoped REST PATCH) is no longer part of the gate — V28
  // r2 slice 1b removed the photo card and its hasPhoto fact — so there
  // is nothing to seed; the resume decision runs on the kids fact (one
  // row, written above) + the zip fact (absent) alone.
  const viewerSession = await readSessionFromBrowserPage(page)
  expect(viewerSession, 'the viewer page holds a Supabase session').not.toBeNull()
  const { url, anonKey } = readSupabaseEnv()
  // READ-ONLY headers: the only request this object feeds is the GET below.
  // `Content-Type` and `Prefer: return=representation` were written for the
  // avatar-seed PATCH that V28 r2 slice 1b deleted with the photo card — with
  // no writer left they were write-only headers on a read (slice 8a).
  const restHeaders: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${viewerSession!.accessToken}`,
  }

  // --- RE-ENTER, cold. ---
  // The facts: kids (1 row, written above), no zip. The page must land on
  // the AREA CARD — and must NOT offer the kids card again (defect #22's
  // restart).
  await page.goto('/onboarding')
  await page.getByTestId('first-run-area-card').waitFor()
  expect(await page.getByTestId('first-run-kids-card').count()).toBe(0)

  // No duplicate kids: the kids table holds exactly the one row the card
  // wrote — a re-offered card would have been the only way a second addKid
  // could run, and it was not offered.
  const kids = await fetch(
    `${url}/rest/v1/kids?profile_id=eq.${viewerSession!.userId}&select=id,first_name,age`,
    { headers: restHeaders },
  )
  const kidRows = (await kids.json()) as Array<{ id: string; first_name: string; age: number }>
  expect(kidRows).toHaveLength(1)
  expect(kidRows[0].first_name).toBe('Remy')

  await context.close()
})

test('a fresh parent (all flags false) starts at nextUnfinishedCard(facts), and each Skip advances in-session even though the fact still says "offer again" (the flag points further)', async ({
  browser,
}) => {
  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-r2-${epoch}`
  const viewerEmail = `e2e-r2-${epoch}@gmail.com`
  const viewerPassword = `e2e-r2-pw-${epoch}`
  const context = await freshViewer(browser)
  const page = await context.newPage()

  // A fresh parent: profile just created, no kids, no zip.
  // nextUnfinishedCard({signedIn, hasName, !hasKids, !hasZip})
  // is 'kids' — the first card the page shows must be the kids card.
  await signUpViewer(page, {
    name: viewerName,
    email: viewerEmail,
    password: viewerPassword,
  })
  await expect(page.getByTestId('first-run-kids-card')).toBeVisible()

  // The SKIP LOOP is the trap this slice closes: the kids fact STILL says
  // "no kids" after a Skip (a skipped optional card is re-offered by
  // firstRun's documented rule), so a gate of `!hasKids` alone would
  // re-render the kids card the instant Skip is tapped — forever. The
  // session flag (kidsCardDone) points past it: the Skip must advance to
  // the AREA card (4 of 4 — the card the deleted photo card used to sit
  // before, V28 r2 slice 1b), and the kids card must never re-appear in
  // this session.
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByTestId('first-run-area-card')).toBeVisible()
  expect(await page.getByTestId('first-run-kids-card').count()).toBe(0)

  // The area card is the run's LAST card (V28 slice 5 — the old "Set your
  // location" view is the card now): it is required, so it carries NO Skip
  // control. The one the run has is the kids card's own — the photo card
  // used to add a second one, which V28 r2 slice 1b deleted. The absence
  // of any Skip button here is the pin that the walk has reached the end.
  expect(await page.getByRole('button', { name: 'Skip' }).count()).toBe(0)

  await context.close()
})