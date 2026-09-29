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
 *
 * V28 slice 3b: the account is card 1 of 5, so the marker's first run goes
 * through the real UI end to end — email + password on /login (the signup
 * form is email + password ONLY now; the name and address fields moved onto
 * the first run's cards), then the NAME card creates the profiles row, then
 * the AREA card sets the marker's home zip + radius. There is no more
 * geocode branch to settle: every new parent lands on /onboarding, so the
 * location step is deterministic. The REST PATCH below stays as the
 * marker's backstop.
 *
 * V28 slice 5: the location step IS the area card (5 of 5, decision 9 —
 * address-first, ZIP as fallback). This walk types an address that never
 * resolves (no such street exists), so the card's bounded lookup settles to
 * "absent" and reveals the ZIP field + the in-card notice, and the typed
 * marker zip + radius finish the card — the same deterministic outcome the
 * old location step gave. (The RESOLVED-address path — home zip set with no
 * typed zip — is exercised by e2e/signup-zip-fallback.e2e.ts, which
 * intercepts the card's Nominatim lookup.)
 */
import { expect, test as setup } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { AUTH_DIR, MARKER_META_PATH, MARKER_STATE_PATH, readSupabaseEnv } from './fixtures'

/** Seeded by migration 0002 — the display label the marker's posts use. */
const MARKER_NEIGHBORHOOD = 'Ballard'
/** The marker's discovery location (V2 slice 3): a seeded WA zip + default radius. */
const MARKER_HOME_ZIP = '98107'
const MARKER_RADIUS_MILES = 5
/**
 * V28 slice 5 — the area card's address entry in THIS walk. It must never
 * resolve to a seeded gazetteer zip: no such street exists anywhere, so the
 * card's bounded lookup settles to "absent" (Nominatim answers empty, or
 * the sandbox has no network at all) and reveals the ZIP fallback the walk
 * fills. A REAL street here would make the marker's zip depend on the
 * network's answer — exactly the non-determinism the deterministic zip below
 * exists to avoid.
 */
const MARKER_ADDRESS = '1 E2E Loop, Nowhere'

setup('sign up the marker, onboard it (zip + radius), save the signed-in state', async ({ page, context }) => {
  const epoch = Math.floor(Date.now() / 1000)
  const email = `e2e-${epoch}@gmail.com` // gmail.com: the project rejects example.com (logged lesson)

  // --- Sign up through the real /login UI (signup mode). ---
  //
  // V28 slice 3b: the form is EMAIL + PASSWORD ONLY (the account is card 1
  // of 5). The marker's handle is still COMPOSED — "e2e-<epoch> Marker" —
  // but now by the NAME CARD on /onboarding (card 2, V28 slice 3a): same
  // two halves, same composeDisplayName join, so every downstream
  // `@handle` assertion that looks for `${displayName}` keeps holding.
  // The address field is gone from the signup flow entirely (the location
  // card owns it), so there is nothing to geocode and no branch to settle.
  const firstName = `e2e-${epoch}`
  const lastName = 'Marker'
  const displayName = `${firstName} ${lastName}`
  const password = `e2e-pw-${epoch}` // in-memory only — never written, never committed

  await page.goto('/login')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()

  // Signup lands on /onboarding (V28 slice 3b: card 1 of 5 is done, card 2
  // is next). The NAME card creates the profiles row — the first use of the
  // card's form-attribute association in a spec file (its Continue button
  // lives outside the <form> and is joined to it by the HTML form
  // attribute; if the two drift, the profile row is never created and the
  // location step below never renders).
  //
  // NOTE (V28 slice 3b): `firstName` here EQUALS the card's prefill — the
  // email's local part (suggestedHandle's fallback) — so this fill is a no-op
  // change and the field's VISIBLE value comes from the prefill, not from
  // this line. The name card keeps each prefill half until THAT field is
  // edited (per-field touched flags in OnboardingPage); with the old shared
  // flag the family-name fill wiped the first-name prefill and the required
  // field silently blocked this submit. If the card's touched handling ever
  // regresses, this is the line that breaks — and it breaks as a 120s
  // timeout waiting for the location step below, not an assertion.
  await page.locator('input[autocomplete="given-name"]').fill(firstName)
  await page.locator('input[autocomplete="family-name"]').fill(lastName)
  await page.getByRole('button', { name: /^Continue/ }).click()

  // V28 slice 4a: the KIDS card ("3 of 5") now sits between the name card and
  // the location step — the new parent's first run is account → name → kids
  // → photo → area. This spec's walk predates the cards and used to land
  // straight on the location step, so it taps each skippable card's Skip
  // control (Skip writes NOTHING — the marker gets its kids, if any, via
  // the /profile editor or REST, never through onboarding). The Skip button
  // is FirstRunCard's chrome control, and the location view has none.
  await page.getByRole('button', { name: 'Skip' }).click()
  // V28 slice 4b: the PHOTO card ("4 of 5") now sits between the kids card
  // and the location step, showing the same chrome Skip control — after the
  // kids card's Skip the photo card replaces it, so the same locator
  // re-resolves onto the photo card's Skip. Its Skip writes nothing too (the
  // avatar upload only ever runs inside the card's crop step, which this
  // walk never opens), so the marker's walk stays deterministic.
  await page.getByRole('button', { name: 'Skip' }).click()

  // V28 slice 5: the AREA card ("5 of 5", decision 9): address-first, ZIP as
  // fallback. This walk types an address that never resolves (MARKER_ADDRESS
  // above), so the card's bounded lookup settles to "absent" and reveals the
  // ZIP field + the in-card notice; the typed marker zip + radius then finish
  // the card. (The card's primary reads "Finish" — FIRST_RUN_COPY.area; while
  // the lookup is in flight it reads "Checking your address…" and is
  // disabled, so the second click below auto-waits for the settle.)
  const addressField = page.getByPlaceholder('e.g. 1200 1st Ave S, Seattle')
  await addressField.fill(MARKER_ADDRESS)
  await page.getByRole('button', { name: 'Finish' }).click()
  // The unresolvable address reveals the ZIP fallback (never blocks, never
  // loses the address). The zip select renders its pinned options
  // (1/2/5/10/20/35; 5 mi is the default).
  await page.getByPlaceholder('e.g. 98107').fill(MARKER_HOME_ZIP)
  await page.locator('select').first().selectOption({ label: `${MARKER_RADIUS_MILES} miles` })
  await page.getByRole('button', { name: 'Finish' }).click()

  // V28 slice 6 (defect #19): the area card's save renders the run's FINISH
  // CARD on /onboarding (the re-keyed guard removed the feed bounce) — tap
  // its CTA before the feed assertions below.
  await page.getByTestId('first-run-finish-card').waitFor()
  await page.getByRole('button', { name: 'Go to your feed' }).click()

  // Back on the feed — signed in, onboarded (home zip set).
  await page.getByRole('heading', { name: 'Near you' }).waitFor()
  // The handle round-trip is still proven, but NOT from the header: V21 t10
  // removed the header's duplicate `@handle` link (founder: "it bothers me to
  // have a profile section in two different areas"), so the header renders it
  // nowhere. /profile's identity card carries the same `@handle` as its own
  // heading — the same assertion `profile.e2e.ts` uses to prove the row loaded
  // (a failed profile load has no name to render).
  await page.goto('/profile')
  await expect(
    page.getByRole('heading', { name: `@${displayName}`, exact: true }),
  ).toBeVisible()
  await page.goto('/')

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
