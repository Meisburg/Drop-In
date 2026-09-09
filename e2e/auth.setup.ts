/**
 * E2E setup spec (V2 ticket 00; V2 slice 3): sign up + onboard a fresh
 * marker user against the REAL Supabase project, through the app's own
 * /login + /onboarding UI, then save the resulting signed-in browser state
 * (storageState) for the specs to reuse.
 *
 * V2 slice 3: the onboarding gate keys on the home zip (neighborhoods are
 * display labels only), so the setup completes the location step — home
 * zip 98107 (a seeded WA zip) + the default 5-mi radius — and then SETS
 * + VERIFIES both via REST (the marker's own JWT, read out of
 * localStorage): the marker must satisfy the new onboarding gate AND the
 * radius feed. Pre-0012-apply this step fails (the profiles columns +
 * zip_codes table don't exist yet) — an expected failure until the
 * orchestrator applies migration 0012 live.
 *
 * Marker pattern (same as the orchestrator's live checks, lv1–lv5): the
 * email + display name carry a deterministic `e2e-<epoch>` prefix so the
 * orchestrator can sweep stray rows later. The password is generated
 * in-memory here and never written anywhere (no secrets in specs).
 */
import { expect, test as setup } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { AUTH_DIR, MARKER_META_PATH, MARKER_STATE_PATH, readSupabaseEnv } from './fixtures'

/** Seeded by migration 0002 — the display label the marker's posts use. */
const MARKER_NEIGHBORHOOD = 'Ballard'
/** The marker's discovery location (V2 slice 3): a seeded WA zip + default radius. */
const MARKER_HOME_ZIP = '98107'
const MARKER_RADIUS_MILES = 5

setup('sign up the marker, onboard it (zip + radius), save the signed-in state', async ({ page, context }) => {
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

  // Signup lands on / and the onboarding gate (home zip unset, V2 slice 3)
  // bounces the shell to /onboarding — wait for the location step.
  await page.getByRole('heading', { name: 'Set your location' }).waitFor()

  // The location step (V2 slice 3: replaces the neighborhood picker): home
  // zip from the seeded gazetteer + the radius select (5 mi is the
  // default — the pinned options are 2/5/10/20/35).
  await page.getByPlaceholder('e.g. 98107').fill(MARKER_HOME_ZIP)
  await page.locator('select').first().selectOption({ label: `${MARKER_RADIUS_MILES} miles` })
  await page.getByRole('button', { name: /^Continue/ }).click()

  // Back on the feed — signed in, onboarded (home zip set). The header
  // handle proves the session + profile round-trip worked.
  await page.getByRole('heading', { name: 'Today' }).waitFor()
  await expect(page.getByText(`@${displayName}`, { exact: true })).toBeVisible()

  // Set + verify the marker's location via REST (the marker's own JWT, read
  // out of the session blob localStorage): the UI's Continue already wrote
  // it (updateHomeZipRadius), this PATCH is the idempotent backstop and the
  // GET proves the row (the marker must satisfy the gate + radius feed).
  // Pre-0012-apply this is an expected failure — logged, not fatal.
  const markerCreds = await page.evaluate((): { accessToken: string; userId: string } | null => {
    for (const raw of Object.values(localStorage)) {
      let blob:
        | {
            access_token?: string
            user?: { id?: string }
            currentSession?: { access_token?: string; user?: { id?: string } }
            allSessions?: Array<{ access_token?: string; user?: { id?: string } }>
            sessions?: Array<{ access_token?: string; user?: { id?: string } }>
          }
        | null
      try {
        blob = JSON.parse(String(raw))
      } catch {
        continue
      }
      const session =
        (typeof blob?.access_token === 'string' ? blob : undefined) ??
        blob?.currentSession ??
        blob?.allSessions?.[0] ??
        blob?.sessions?.[0]
      if (
        session !== null &&
        session !== undefined &&
        typeof session.access_token === 'string' &&
        typeof session.user?.id === 'string'
      ) {
        return { accessToken: session.access_token, userId: session.user.id }
      }
    }
    return null
  })
  if (markerCreds !== null) {
    const { url, anonKey } = readSupabaseEnv()
    const headers: Record<string, string> = {
      apikey: anonKey,
      Authorization: `Bearer ${markerCreds.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }
    const patch = await fetch(`${url}/rest/v1/profiles?id=eq.${markerCreds.userId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ home_zip: MARKER_HOME_ZIP, radius_miles: MARKER_RADIUS_MILES }),
    })
    const rows = patch.ok
      ? ((await patch.json()) as Array<{ home_zip: string | null; radius_miles: number }>)
      : []
    const row = rows[0]
    if (
      !patch.ok ||
      row === undefined ||
      row.home_zip !== MARKER_HOME_ZIP ||
      row.radius_miles !== MARKER_RADIUS_MILES
    ) {
      console.log(
        `[e2e setup] FAILED to set/verify marker location via REST (HTTP ${patch.status}) — ` +
          `needs migration 0012 applied (profiles.home_zip / radius_miles + zip_codes)`,
      )
    } else {
      console.log(
        `[e2e setup] marker location set + verified via REST: home_zip=${MARKER_HOME_ZIP}, radius_miles=${MARKER_RADIUS_MILES}`,
      )
    }
  }

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
    JSON.stringify(
      {
        email,
        displayName,
        neighborhood: MARKER_NEIGHBORHOOD,
        homeZip: MARKER_HOME_ZIP,
        radiusMiles: MARKER_RADIUS_MILES,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    `Marker ready: ${email} (handle ${displayName}, home zip ${MARKER_HOME_ZIP} / ${MARKER_RADIUS_MILES} mi, post label ${MARKER_NEIGHBORHOOD}) — state saved to ${MARKER_STATE_PATH}`,
  )
})