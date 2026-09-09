/**
 * E2E setup spec (V2 ticket 00): sign up + onboard a fresh marker user
 * against the REAL Supabase project, through the app's own /login +
 * /onboarding UI, then save the resulting signed-in browser state
 * (storageState) for the specs to reuse.
 *
 * Marker pattern (same as the orchestrator's live checks, lv1–lv5): the
 * email + display name carry a deterministic `e2e-<epoch>` prefix so the
 * orchestrator can sweep stray rows later. The password is generated
 * in-memory here and never written anywhere (no secrets in specs).
 *
 * The marker must follow at least one seeded neighborhood (the 0002 seed
 * list) at /onboarding: a signed-in user with 0 memberships is gated to
 * /onboarding on every protected route, and the feed only shows posts in
 * followed neighborhoods.
 */
import { expect, test as setup } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { AUTH_DIR, MARKER_META_PATH, MARKER_STATE_PATH } from './fixtures'

/** Seeded by migration 0002 — present in the live project. */
const MARKER_NEIGHBORHOOD = 'Ballard'

setup('sign up the marker, onboard it, save the signed-in state', async ({ page, context }) => {
  const epoch = Math.floor(Date.now() / 1000)
  const email = `e2e-${epoch}@gmail.com` // gmail.com: the project rejects example.com (logged lesson)
  const displayName = `e2e-${epoch}`
  const password = `e2e-pw-${epoch}` // in-memory only — never written, never committed

  // --- Sign up through the real /login UI (signup mode). ---
  await page.goto('/login')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.locator('input[autocomplete="nickname"]').fill(displayName)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()

  // Signup lands on / and the onboarding gate (0 memberships) bounces the
  // shell to /onboarding — wait for the picker.
  await page.getByRole('heading', { name: 'Pick your neighborhoods' }).waitFor()

  // Follow one seeded neighborhood (required to clear the onboarding gate
  // and to see any posts in the feed at all).
  await page.getByRole('button', { name: MARKER_NEIGHBORHOOD, exact: true }).click()
  await page.getByRole('button', { name: /^Continue/ }).click()

  // Back on the feed — signed in, onboarded. The header handle proves the
  // session + profile round-trip worked.
  await page.getByRole('heading', { name: 'Today' }).waitFor()
  await expect(page.getByText(`@${displayName}`, { exact: true })).toBeVisible()

  // The Supabase client persists its session into localStorage on session
  // changes; wait for the blob explicitly so the saved state is complete.
  // supabase-js (v2.115) stores the raw session blob under a key like
  // `sb-<ref>-auth-token` (older releases: a MultiSession wrapper) — accept
  // both shapes.
  await page.waitForFunction(() => {
    const hasSession = (raw: unknown): boolean => {
      let blob: {
        access_token?: string
        user?: { id?: string }
        currentSession?: { access_token?: string; user?: { id?: string } }
        allSessions?: Array<{ access_token?: string; user?: { id?: string } }>
        sessions?: Array<{ access_token?: string; user?: { id?: string } }>
      } | null
      try {
        blob = JSON.parse(String(raw))
      } catch {
        return false
      }
      const session =
        (typeof blob?.access_token === 'string' ? blob : undefined) ??
        blob?.currentSession ??
        blob?.allSessions?.[0] ??
        blob?.sessions?.[0]
      return (
        session !== null &&
        session !== undefined &&
        typeof session.access_token === 'string' &&
        typeof session.user?.id === 'string'
      )
    }
    return Object.values(localStorage).some((raw) => hasSession(raw))
  })

  // Save the signed-in state + the marker's public identity (gitignored).
  mkdirSync(AUTH_DIR, { recursive: true })
  await context.storageState({ path: MARKER_STATE_PATH })
  writeFileSync(
    MARKER_META_PATH,
    JSON.stringify({ email, displayName, neighborhood: MARKER_NEIGHBORHOOD }, null, 2) + '\n',
  )
  console.log(
    `Marker ready: ${email} (handle ${displayName}, follows ${MARKER_NEIGHBORHOOD}) — state saved to ${MARKER_STATE_PATH}`,
  )
})