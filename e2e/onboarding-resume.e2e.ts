/**
 * Spec (V28 slice 4c): the first run's card sequence is driven by the FACTS,
 * not by flags (plan defect #22). The page's card gates were local flags that
 * reset on every mount, so a parent who finished kids + photo and abandoned at
 * the last card re-entered and was offered the KIDS CARD AGAIN — re-answering
 * it calls addKid again and writes duplicate kids rows (the cap of 5 limits
 * it, it does not dedupe). Decision 6: "resume at the card they left. Never a
 * wall, never a restart."
 *
 * WHAT THIS SPEC PROVES, precisely:
 *
 * (1) RE-ENTRY RESUMES. A parent who wrote a kid row on the kids card,
 *     skipped the photo card, and abandoned at the location view (the
 *     run's last card — the most likely abandonment point) re-enters
 *     /onboarding and lands on the LOCATION VIEW, not the kids card. The
 *     photo fact is seeded the way the /profile editor would set it
 *     (REST, the owner's own JWT — the gate's rule is hasAvatarUrl, a
 *     string predicate, so the seeded URL is never fetched by this flow);
 *     the KIDS fact comes from the onboarding write itself. Re-entering
 *     offers no kids card at all, so no second addKid can run: the
 *     kids-table count is asserted to be exactly the one row the card
 *     wrote.
 *
 * (2) A FRESH PARENT'S FIRST CARD EQUALS nextUnfinishedCard(facts), and a
 *     SKIP STILL ADVANCES. For a parent with no kids, no photo and no zip
 *     (all flags false on a fresh mount), the first card shown is the kids
 *     card — nextUnfinishedCard({hasName, !hasKids, !hasPhoto, !hasZip})
 *     is exactly 'kids'. Within ONE session a flag may legitimately point
 *     FURTHER ALONG than the fact: the kids fact still says "no kids"
 *     after the parent taps Skip (firstRun's documented rule — a skipped
 *     optional card is re-offered, and `!hasKids` alone would re-render
 *     the card after its own Skip, forever), but the session flag
 *     (kidsCardDone) points past it, so the Skip advances to the photo
 *     card and the kids card never re-appears. The photo card's Skip
 *     advances the same way, onto the location view.
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

test('a returning parent with kids and a photo (and no zip) re-enters at the location view — never the kids card, no duplicate kids', async ({
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

  // KIDS CARD (3 of 5): write exactly ONE kid row — this is the row a
  // restart would DUPLICATE if the card were offered again on re-entry.
  await page.getByRole('button', { name: 'Add a kid' }).click()
  await page.getByPlaceholder('First name').fill('Remy')
  await page.getByPlaceholder('Age').fill('7')
  await page.getByRole('button', { name: /^Continue/ }).click()
  // Wait for the write to land and the card to advance BEFORE touching a Skip
  // button: until it lands, the only Skip on screen is the KIDS card's own
  // (the card chrome keeps Skip live during a write — pre-existing), and
  // clicking it would leave the kids card the wrong way for this test.
  await expect(page.getByTestId('first-run-photo-card')).toBeVisible()

  // PHOTO CARD (4 of 5): Skip — writes nothing, advances to the location
  // view (the run's last card). This is the most likely abandonment point.
  await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByRole('heading', { name: 'Set your location' }).waitFor()
  // ABANDON at the location card: leave, and come back COLD (a fresh mount —
  // the flags reset to false, which is what a restart would show again).
  await page.goto('/')

  // Seed the PHOTO fact the way the /profile editor would: owner-scoped REST
  // PATCH with the viewer's own JWT (read out of the viewer page's
  // localStorage). The gate's rule is hasAvatarUrl — a string predicate — so
  // the seeded URL is never fetched by this flow.
  const viewerSession = await readSessionFromBrowserPage(page)
  expect(viewerSession, 'the viewer page holds a Supabase session').not.toBeNull()
  const { url, anonKey } = readSupabaseEnv()
  const restHeaders: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${viewerSession!.accessToken}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
  const avatarPatch = await fetch(
    `${url}/rest/v1/profiles?id=eq.${viewerSession!.userId}`,
    {
      method: 'PATCH',
      headers: restHeaders,
      body: JSON.stringify({ avatar_url: 'https://e2e.playdate.local/r1-avatar.png' }),
    },
  )
  expect(avatarPatch.ok, `avatar_url seed PATCH failed (HTTP ${avatarPatch.status})`).toBe(true)

  // --- RE-ENTER, cold. ---
  // The facts: kids (1 row, written above), photo (seeded above), no zip.
  // The page must land on the LOCATION VIEW — and must NOT offer the kids
  // card again (defect #22's restart) nor the photo card (its fact is true).
  await page.goto('/onboarding')
  await page.getByRole('heading', { name: 'Set your location' }).waitFor()
  expect(await page.getByTestId('first-run-kids-card').count()).toBe(0)
  expect(await page.getByTestId('first-run-photo-card').count()).toBe(0)

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

  // A fresh parent: profile just created, no kids, no photo, no zip.
  // nextUnfinishedCard({signedIn, hasName, !hasKids, !hasPhoto, !hasZip})
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
  // the PHOTO card, and the kids card must never re-appear in this session.
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByTestId('first-run-photo-card')).toBeVisible()
  expect(await page.getByTestId('first-run-kids-card').count()).toBe(0)

  // The photo card's Skip advances the same way (its fact still says
  // "no photo" — same trap, same flag), onto the location view.
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('heading', { name: 'Set your location' })).toBeVisible()
  expect(await page.getByTestId('first-run-photo-card').count()).toBe(0)

  await context.close()
})