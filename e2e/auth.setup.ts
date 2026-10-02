/**
 * E2E setup spec (V2 ticket 00; V2 slice 3): sign up + onboard a fresh
 * marker user against the REAL Supabase project, through the app's own
 * /login + /onboarding UI, then save the resulting signed-in browser state
 * (storageState) for the specs to reuse.
 *
 * V2 slice 3: the setup completes the location step — home zip 98107 (a
 * seeded WA zip) + the default 5-mi radius — and then SETS + VERIFIES both
 * via REST (the marker's own JWT, read out of localStorage). ⚠️ The line
 * this paragraph used to carry, "the marker must satisfy the new onboarding
 * gate", is FALSE since V28 slice 2b: nothing is gated on the home zip any
 * more (docs/adr/0001-home-zip-stops-being-a-gate.md). What the marker needs
 * the zip for is the radius FEED (a no-zip parent gets the location notice
 * instead of rows), which is why the REST write below still exists.
 * Pre-0012-apply the REST step failed (the profiles columns + the zip_codes
 * table did not exist yet) — an expected failure until the orchestrator
 * applied migration 0012 live, kept as history.
 *
 * Marker pattern (same as the orchestrator's live checks, lv1–lv5): the
 * email + display name carry a deterministic `e2e-<epoch>` prefix so the
 * orchestrator can sweep stray rows later. The password is generated
 * in-memory here and never written anywhere (no secrets in specs).
 *
 * ⚠️ THE WALK ITSELF IS NOT WRITTEN HERE (V28 r2 slice 8a). This spec used to
 * hold its own copy of the sequence — signup, the name card, the kids Skip, the
 * area card with its address/Finish/zip/radius/Finish and the ending card's CTA
 * — which is exactly what e2e/fixtures.ts's `signUpViewer` + `finishSignup`
 * already own. Two walks that must agree is the drift the one-copy rule exists
 * to stop, and this is the walk 60 spec files depend on: the helpers are now the
 * only copy, so a renamed control cannot leave this spec behind (which is the
 * failure the ledger records three times for specs that carried their own
 * locator). The helpers' own docblocks carry what the walk does and why —
 * including that `finishSignup` answers the card's address lookup with the
 * caller's zip instead of making a real Nominatim request.
 *
 * The REST PATCH below stays as the marker's backstop, and the /profile
 * @handle assertion below stays here: it is this spec's own proof that the row
 * exists under the composed handle.
 */
import { expect, test as setup } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import {
  AUTH_DIR,
  finishSignup,
  MARKER_META_PATH,
  MARKER_STATE_PATH,
  readSupabaseEnv,
  signUpViewer,
} from './fixtures'

/** Seeded by migration 0002 — the display label the marker's posts use. */
const MARKER_NEIGHBORHOOD = 'Ballard'
/** The marker's discovery location (V2 slice 3): a seeded WA zip + default radius. */
const MARKER_HOME_ZIP = '98107'
const MARKER_RADIUS_MILES = 5
setup('sign up the marker, onboard it (zip + radius), save the signed-in state', async ({ page, context }) => {
  const epoch = Math.floor(Date.now() / 1000)
  const email = `e2e-${epoch}@gmail.com` // gmail.com: the project rejects example.com (logged lesson)

  // --- Sign up + walk the run with the SHARED HELPERS (V28 r2 slice 8a) ---
  //
  // The marker's handle is still COMPOSED — "e2e-<epoch> Marker" — and the NAME
  // CARD on /onboarding composes it from the same two halves with the same
  // `composeDisplayName` join, so every downstream `@handle` assertion that looks
  // for `${displayName}` keeps holding.
  //
  // This block used to be the walk itself (signup → name card → kids Skip → the
  // area card's address/Finish/zip/radius/Finish → the ending card's CTA). All of
  // it is e2e/fixtures.ts's `signUpViewer` + `finishSignup`, and keeping a second
  // copy of a walk 60 spec files depend on is the drift this slice removed. The
  // details a reader of THIS file needs are in the helpers' docblocks:
  // `signUpViewer`'s pre-fill tripwire (the marker's `e2e-<epoch>` name EQUALS the
  // card's pre-fill, the email's local part, so the given-name fill is a no-op
  // change and the field's visible value comes from the pre-fill) and
  // `finishSignup`'s intercepted address lookup (the card's one Nominatim request
  // is fulfilled with MARKER_HOME_ZIP — no network, and the radius is picked
  // before the single Finish tap).
  const firstName = `e2e-${epoch}`
  const lastName = 'Marker'
  const displayName = `${firstName} ${lastName}`
  const password = `e2e-pw-${epoch}` // in-memory only — never written, never committed

  await signUpViewer(page, { name: displayName, email, password })
  // Ends on the feed — signed in, onboarded (home zip set + radius).
  await finishSignup(page, { homeZip: MARKER_HOME_ZIP, radiusMiles: MARKER_RADIUS_MILES })

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
  // out of the session blob localStorage): the walk's Finish already wrote it
  // (updateHomeZipRadius), this PATCH is the idempotent backstop and the GET
  // proves the row (the marker needs the zip for the radius FEED — there is no
  // zip gate since V28 slice 2b).
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
