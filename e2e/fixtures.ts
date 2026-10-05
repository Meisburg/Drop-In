/**
 * E2E helpers (V2 ticket 00): shared access to the marker account's state.
 *
 * - readEnvFile(): reads VITE_* vars straight from the repo .env with
 *   `node:fs` — no dotenv dependency (the file is plain KEY=VALUE).
 * - setModerator / readPlaceByName / setPlacePhotos (v31-5): typed PostgREST
 *   calls authenticated with the PROJECT-scoped service-role key, read from that
 *   same .env file at call time (never a VITE_ variable, never in the bundle) —
 *   the path the moderator and place-photo specs write the live database with.
 * - The marker's signed-in browser state (storageState) is written by
 *   e2e/auth.setup.ts into e2e/.auth/ (gitignored, never committed) and
 *   reused by the specs via the chromium project's storageState in
 *   playwright.config.ts. No secrets live in the specs.
 *
 * Playwright is invoked from the repo root (the `test:e2e` npm script),
 * so everything here resolves off process.cwd().
 */
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { expect, type Page, type Route } from '@playwright/test'
// The stepper's own pure math — imported so a spec's expectation is the same
// rule the form applies, never a copy of it (feed.ts is pure: its only
// imports are `import type`, erased at runtime).
import { TIME_STEP_MINUTES, formatTimeLabel, stepTimeMinutes } from '../src/lib/feed'

const CWD = process.cwd()

/** The card's Nominatim request (lib/geocode's searchFirst, one URL shape).
 *
 *  EXPORTED, and the ONE copy (V28 r2 slice 8a fix round 1, one-copy rule):
 *  `e2e/signup-zip-fallback.e2e.ts` held a byte-identical second copy, and this
 *  module is the channel every spec already imports from. The app's own URL
 *  literal lives in `src/lib/geocode.ts` (`NOMINATIM_URL`, not exported) and a
 *  divergence from it is LOUD rather than silent: `finishSignup`'s stub asserts
 *  that it fired, so a pattern that stops matching fails the walk in ~5s. */
export const NOMINATIM_ROUTE = /https:\/\/nominatim\.openstreetmap\.org\/search\?/
/**
 * The address `finishSignup` types into the area card. A REAL street, because
 * the answer the fixture returns claims it (postcode + house_number 1200, the
 * precision rule's proof): the pair has to be consistent or the walk is
 * asserting a resolution that does not match the text.
 */
const FINISH_SIGNUP_ADDRESS = '1200 1st Ave S, Seattle'

/** The repo .env (gitignored; holds the Supabase project credentials). */
export const ENV_PATH = path.join(CWD, '.env')

/** Plain KEY=VALUE parser for the repo .env (no dotenv dependency). */
export function readEnvFile(filePath: string = ENV_PATH): Record<string, string> {
  if (!existsSync(filePath)) {
    throw new Error(`Cannot read ${filePath} — run e2e from the repo root (the app's .env).`)
  }
  const out: Record<string, string> = {}
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

/** VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY from the repo .env (throws when missing). */
export function readSupabaseEnv(): { url: string; anonKey: string } {
  const env = readEnvFile()
  const url = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY
  if (url === undefined || anonKey === undefined) {
    throw new Error(`VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from ${ENV_PATH}`)
  }
  return { url, anonKey }
}

/** Where the setup spec saves the marker's signed-in state (gitignored). */
export const AUTH_DIR = path.join(CWD, 'e2e', '.auth')
export const MARKER_STATE_PATH = path.join(AUTH_DIR, 'marker-state.json')
export const MARKER_META_PATH = path.join(AUTH_DIR, 'marker.json')

/** The marker's public identity (no secrets — the password never leaves the setup spec). */
export interface MarkerMeta {
  email: string
  displayName: string
  /** The seeded neighborhood (0002 seed list) the marker's posts use (display label). */
  neighborhood: string
  /** The marker's home zip (V2 slice 3 — the discovery center, set by the setup spec). */
  homeZip: string
  /** The marker's discovery radius in miles (V2 slice 3 — the pinned default). */
  radiusMiles: number
}

export function readMarkerMeta(): MarkerMeta {
  if (!existsSync(MARKER_META_PATH)) {
    throw new Error(
      `${MARKER_META_PATH} missing — run the full e2e suite (the setup project writes it).`,
    )
  }
  return JSON.parse(readFileSync(MARKER_META_PATH, 'utf8')) as MarkerMeta
}

/** The marker's Supabase session, read out of the storageState file. */
export interface MarkerSession {
  accessToken: string
  userId: string
}

/**
 * Parse the marker's session (access token + user id) from the Playwright
 * storageState file. supabase-js persists its session in localStorage under
 * a key like `sb-<project-ref>-auth-token`; depending on the version/config
 * the blob is either the raw session object ({ access_token, user, ... })
 * or a MultiSession wrapper ({ currentSession | allSessions | sessions }) —
 * this accepts both.
 */
export function readMarkerSession(statePath: string = MARKER_STATE_PATH): MarkerSession {
  if (!existsSync(statePath)) {
    throw new Error(`${statePath} missing — run the full e2e suite (the setup project writes it).`)
  }
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as {
    origins?: Array<{
      origin: string
      localStorage?: Array<{ name: string; value: string }>
    }>
  }
  for (const origin of state.origins ?? []) {
    for (const item of origin.localStorage ?? []) {
      if (!item.name.includes('auth')) continue
      let blob:
        | {
            access_token?: string
            user?: { id?: string }
            currentSession?: { access_token?: string; user?: { id?: string } }
            allSessions?: Array<{ access_token?: string; user?: { id?: string } }>
            sessions?: Array<{ access_token?: string; user?: { id?: string } }>
          }
        | null
        | undefined
      try {
        blob = JSON.parse(item.value)
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
  }
  throw new Error(`No Supabase session found in ${statePath} — re-run the setup project.`)
}

/** Local calendar date N days from today, as YYYY-MM-DD (a date input's value). */
export function localDatePlusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/** "3:30 PM" → minutes since local midnight (the stepper's label form). */
export function parseTimeLabel(label: string): number {
  const match = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(label.trim())
  if (match === null) throw new Error(`Not a stepper time label: "${label}"`)
  const hour12 = Number(match[1]) % 12
  const base = match[3].toUpperCase() === 'PM' ? hour12 + 12 : hour12
  return base * 60 + Number(match[2])
}

/**
 * Open /new's summary TITLE line for editing (V9 ticket 03, review cycle 1 F2).
 *
 * On /new the title is a READ-BACK: the generated title is shown as text in the
 * summary, and a tap turns that line into the ordinary title input, in place.
 * The reason it is not an always-open input is ticket 01's AC — "/new's FIRST
 * field is the place picker" — which an input at the top of the form would
 * invert (it would be the form's first input AND its first tab stop).
 *
 * This is the one step specs that fill or read the title need, in one place. It
 * is IDEMPOTENT: once the line is tapped the read-back button is gone and the
 * input is there, so a second call does nothing. On /edit there is no read-back
 * line at all (the input is always rendered), so the call is a no-op there too —
 * which is why a shared helper can carry it.
 */
export async function editTitle(page: Page): Promise<void> {
  const line = page.getByTestId('title-line')
  const input = page.getByPlaceholder('e.g. Playground time at Green Lake')
  // Wait for whichever state the page is in BEFORE deciding: on a cold /new the
  // form may not have painted yet, and `count()` does not retry — reading it
  // first would skip the tap and then wait 15s for an input that only appears
  // once the line is tapped.
  await expect(line.or(input).first()).toBeVisible()
  if ((await line.count()) > 0) {
    await line.click()
  }
  await expect(input).toBeVisible()
}

/**
 * The /new start-time stepper, made DEFAULT-AGNOSTIC (V8 ticket 01).
 *
 * Ticket 01 changed the stepper's mount-once default from a hardcoded
 * 10:00 AM to the next 30-minute slot on the parent's clock, so every spec
 * that pinned "10:30 AM" after one + press was pinning the OLD DEFAULT
 * rather than the contract. This helper reads the label the form actually
 * rendered, presses + once, and hands the spec the parsed start — so the
 * spec asserts the RELATIONSHIP (one press is exactly +30 minutes, and the
 * end is start + duration), which is the pinned contract and is immune to
 * both the default and the wall clock.
 *
 * V9 ticket 03: the stepper lived inside the "More options" disclosure, so this
 * helper opened it first (the specs that call it do not have to know).
 * V11 ticket 05: the stepper moved into the visible "When" section, so opening
 * the door is no longer needed for it — the open call stays (idempotent, a
 * no-op when the door is already open) because the disclosure still holds the
 * fields some specs drive AFTER stepping the time.
 *
 * `endLabel(durationMinutes)` is the "Ends …" copy the form computes.
 */
export async function stepStartTimeOnce(page: Page): Promise<{
  startMinutes: number
  startLabel: string
  /** V13 ticket 03: the end stepper's current label (read from the DOM, not
      computed from a duration) — the /new flow now shows an End stepper
      instead of the "Ends …" read-back line. */
  endLabel: () => Promise<string>
}> {
  // V13 ticket 02: the "More options" disclosure is gone — the start-time
  // stepper lives in the visible "When" section, so no door to open.
  const label = page.getByTestId('start-time-label')
  const before = parseTimeLabel(await label.innerText())
  await page.getByRole('button', { name: 'Later start time' }).click()
  const startMinutes = stepTimeMinutes(before, TIME_STEP_MINUTES)
  const startLabel = formatTimeLabel(startMinutes)
  await expect(label).toHaveText(startLabel)
  return {
    startMinutes,
    startLabel,
    endLabel: async () => (await page.getByTestId('end-time-label').innerText()),
  }
}

/**
 * Settle the page on `routePath` after a full (cold) navigation.
 *
 * Historical note (ticket 00): the app's onboarding gate used to race the
 * membership fetch on a cold page load (the shell bounced a signed-in
 * user through /onboarding → / before the fetch landed), which is why
 * this helper settles via the app's own navigation. Ticket 06 fixed the
 * race — the gate now renders the shell's loading state until the fetch
 * settles, so a fresh full-page load lands on its requested route
 * directly (see e2e/onboarding-gate.e2e.ts, which deliberately skips
 * this helper). settleOnRoute is kept for the existing specs and stays
 * harmless: with the fix, the first `here()` check already holds and it
 * returns after one beat.
 *
 * Reaching the URL is not enough: a cold-load redirect can still be in
 * flight (the document load event fires before the gate's client-side
 * Navigate), so the route only counts as settled once it SURVIVES a
 * re-render beat (the 800 ms wait below).
 */
export async function settleOnRoute(page: Page, routePath: string): Promise<void> {
  // V22 slice 12: `/new` is no longer a nav destination. Apple's tab-bar
  // guidance ("use a tab bar to support navigation, not to provide actions")
  // moved the Post action onto the Feed, so the hop is now: land on the feed,
  // then tap its "Post a drop-in" call to action. This helper is the ONE place
  // that mapping lives, which is why the change is here rather than in the ~47
  // call sites across the suite.
  const tabLabel = routePath === '/profile' ? 'Profile' : null
  const here = () => new URL(page.url()).pathname === routePath
  for (let attempt = 0; attempt < 8; attempt++) {
    if (!here()) {
      // Client-side hop (no reload — a reload would re-run the race).
      if (routePath === '/new') {
        // The Post CTA lives on the feed, so land there before tapping it.
        if (new URL(page.url()).pathname !== '/') await page.goto('/')
        await page.getByTestId('feed-post-drop-in').click()
      } else if (tabLabel !== null) {
        await page.getByRole('link', { name: tabLabel, exact: true }).click()
      } else {
        await page.goto(routePath)
      }
    }
    // Let the shell's gate re-evaluate; a bounced route shows up here.
    await page.waitForTimeout(800)
    if (here()) return
  }
  if (!here()) {
    throw new Error(`Could not settle on ${routePath} (page is at ${page.url()})`)
  }
}

/**
 * V20 t01: SETTLE ON /profile AND OPEN ITS EDITOR.
 *
 * /profile opens on the READ view (the same face a @handle link shows); the
 * editing controls this app has always had sit behind the "Edit profile"
 * button at the top. Specs that drive an editing control (the name input, the
 * bio textarea, the kid rows, the avatar/family-photo pickers) need that one
 * extra tap, and they all need it for the same reason — so it is one helper
 * rather than the same two lines copied through the suite.
 *
 * The click is asserted by waiting for a control that only exists in edit mode
 * (`done-editing-profile`), so a spec that calls this and then drives a field
 * can never race the mode switch.
 */
export async function openProfileEditor(page: Page): Promise<void> {
  await settleOnRoute(page, '/profile')
  await page.getByTestId('edit-profile').click()
  await page.getByTestId('done-editing-profile').waitFor({ state: 'visible' })
}

/**
 * Run ONE statement through the repo's documented live SQL path
 * (scripts/apply-migration.mjs → the Supabase dashboard SQL API, the token
 * read out of the CDP Chrome profile on :9222). Used by the one spec that
 * cannot prove its point with a marker JWT (V8 ticket 10: a marker cannot
 * make itself a moderator — 0011's self-elevation trigger blocks the JWT
 * write, and the dashboard path runs with auth.uid() IS NULL, which the
 * trigger passes through by design).
 *
 * `ok: false` means the PATH is unavailable (no CDP Chrome, a stale dashboard
 * session) — not that the statement failed; the caller decides whether that is
 * a skip or a failure, and the raw output travels with the result so the
 * reason is never guessed. The script's own guard still applies: it refuses
 * anything that looks destructive (drop/truncate/deleting users or profiles).
 */
export function runLiveSql(sql: string): { ok: boolean; output: string } {
  const result = spawnSync('node', ['scripts/apply-migration.mjs', '--sql', sql], {
    cwd: CWD,
    encoding: 'utf8',
    timeout: 120_000,
  })
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  }
}

/**
 * v31-5 — THE PROJECT-SCOPED POSTGREST PATH, for specs that must write as a
 * moderator or adjust a place row.
 *
 * WHY IT EXISTS BESIDE `runLiveSql`: that helper (still used, by `polish.e2e.ts`)
 * shells out to `apply-migration.mjs`, which harvests its token from a
 * **CDP-attached Chrome on :9222** — a human's own desktop session on this
 * machine, and simply absent in a plain run (`connectOverCDP ECONNREFUSED
 * 127.0.0.1:9222`, which is how the first draft of the moderator-door spec
 * failed).
 *
 * WHY NOT `SUPABASE_ACCESS_TOKEN`: v30 routed these specs through
 * `scripts/db-sql.sh` → the Supabase **Management API**, whose token is
 * ACCOUNT-level (`sbp_…`) and can run arbitrary SQL against every project. That
 * token is deliberately not given to CI, so three specs failed in the nightly
 * (`37321138731`) with `SUPABASE_ACCESS_TOKEN: FATAL: not set`. The transport is
 * now the narrowest privilege that still covers them: PostgREST over HTTPS,
 * authenticated with the PROJECT-scoped **service-role** key, whose blast radius
 * is this one project. `scripts/db-sql.sh` is untouched — it stays the
 * migration/read tool and keeps its own management token.
 *
 * THE KEY IS READ FROM THE REPO `.env` FILE, like every other value the suite
 * uses, and it is NOT a `VITE_` variable: it must never be compiled into the
 * client bundle. MEASURED (v31-5, `npm run build` then grep `dist/assets/*.js`):
 * the FULL key, its 24-character SIGNATURE tail, and the literal `service_role`
 * each have **zero** hits, while the same probes for the public anon key each
 * hit (the instrument works). The key's first 24 characters DO hit once — a
 * legacy Supabase anon JWT and a legacy service-role JWT share those 24
 * characters, because they are the base64url of the JWT header
 * `{"alg":"HS256","typ":"JWT"}`; the prefix is therefore not distinguishing, and
 * it is the anon key's own copy in the bundle that matches. See `docs/agents/ci.md`.
 *
 * A MISSING KEY FAILS BY NAME. The check runs BEFORE any request, so an
 * unconfigured lane reports `SUPABASE_SERVICE_ROLE_KEY missing from …/.env`
 * rather than the opaque `fetch failed` an `undefined` header produces.
 */
export interface AdminResult {
  /** `false` means the REQUEST or its read-back failed; `output` carries the raw reason. */
  ok: boolean
  output: string
}

/** Kept under Playwright's 120s test timeout, so a hung request reports itself. */
const POSTGREST_TIMEOUT_MS = 30_000

/** PostgREST base URL + the service-role key, both out of the repo `.env`. */
function postgrestCredentials(): { restUrl: string; key: string } {
  const env = readEnvFile()
  const url = env.VITE_SUPABASE_URL
  if (url === undefined || url === '') {
    throw new Error(`VITE_SUPABASE_URL missing from ${ENV_PATH} — the PostgREST helper needs it`)
  }
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (key === undefined || key === '') {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY missing from ${ENV_PATH} — the moderator/place-photo specs ` +
        `write through PostgREST with the PROJECT-scoped service-role key (it bypasses RLS, so ` +
        `it is a SECRET and is not committed). Add it to the repo .env, or to the scheduled ` +
        `lane's repository secrets for CI.`,
    )
  }
  return { restUrl: `${url.replace(/\/+$/, '')}/rest/v1`, key }
}

/**
 * One PostgREST call. `output` is built from the LABEL, the status line and the
 * response body — never from the request headers, so the key cannot reach a
 * test's failure message. A write asks for `return=representation`, which is
 * what lets a caller read its own write back in the same round-trip.
 */
async function postgrest<T>(
  label: string,
  method: 'GET' | 'PATCH',
  path: string,
  options: { body?: unknown } = {},
): Promise<{ result: AdminResult; rows: T[] }> {
  const { restUrl, key } = postgrestCredentials()
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    // Ask for the written row back: a PATCH that matched nothing is a silent
    // no-op in the database, and the read-back is what makes it loud.
    headers.Prefer = 'return=representation'
  }
  let status: number
  let statusText: string
  let text: string
  try {
    const response = await fetch(`${restUrl}/${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(POSTGREST_TIMEOUT_MS),
    })
    status = response.status
    statusText = response.statusText
    text = await response.text()
  } catch (error) {
    return { result: { ok: false, output: `${label}: ${String(error)}` }, rows: [] }
  }
  const head = `${label}: HTTP ${status} ${statusText}`
  if (!responseOk(status)) {
    return { result: { ok: false, output: `${head} ${text}`.trim() }, rows: [] }
  }
  let rows: T[] = []
  if (text !== '') {
    try {
      const parsed: unknown = JSON.parse(text)
      if (Array.isArray(parsed)) rows = parsed as T[]
      else return { result: { ok: false, output: `${head} (expected a JSON array, got ${text})` }, rows: [] }
    } catch {
      return { result: { ok: false, output: `${head} (unparseable JSON: ${text})` }, rows: [] }
    }
  }
  return { result: { ok: true, output: head }, rows }
}

function responseOk(status: number): boolean {
  return status >= 200 && status < 300
}

/**
 * Set a profile's `moderators` flag and READ IT BACK from the PATCH's own
 * representation. The read-back is the point: with the flag unset the door is
 * absent for a moderator too, so a request that landed on zero rows (a stale id)
 * would otherwise look exactly like a successful elevation.
 */
export async function setModerator(userId: string, enabled: boolean): Promise<AdminResult> {
  const { result, rows } = await postgrest<{ id: string; moderators: boolean }>(
    `set profiles.moderators=${enabled} on ${userId}`,
    'PATCH',
    `profiles?id=eq.${encodeURIComponent(userId)}&select=id,moderators`,
    { body: { moderators: enabled } },
  )
  if (!result.ok) return result
  if (rows.length !== 1 || rows[0].moderators !== enabled) {
    return {
      ok: false,
      output: `${result.output}; read-back returned ${rows.length} row(s) ${JSON.stringify(rows)} — wanted exactly one with moderators=${enabled}`,
    }
  }
  return result
}

/** The place columns the photo specs snapshot and restore (null = no photo). */
export interface PlacePhotoRow {
  id: string
  photo_url: string | null
  photo_source_url: string | null
  photo_license: string | null
  photo_author: string | null
  photo_attribution: string | null
}

const PLACE_PHOTO_FIELDS = [
  'photo_url',
  'photo_source_url',
  'photo_license',
  'photo_author',
  'photo_attribution',
] as const
const PLACE_PHOTO_COLUMNS = ['id', ...PLACE_PHOTO_FIELDS].join(',')

/**
 * Read ONE place by its exact display name. Throws rather than returning a
 * result: the call sites are snapshot reads that cannot proceed without a row,
 * and a thrown message names the name and the count it got (the same failure
 * the raw-SQL reader reported).
 */
export async function readPlaceByName(name: string): Promise<PlacePhotoRow> {
  const { result, rows } = await postgrest<PlacePhotoRow>(
    `read places where name=${name}`,
    'GET',
    `places?name=eq.${encodeURIComponent(name)}&select=${PLACE_PHOTO_COLUMNS}`,
  )
  if (!result.ok) throw new Error(`reading the place failed: ${result.output}`)
  if (rows.length !== 1) {
    throw new Error(`expected exactly one place named ${name}, got ${rows.length}`)
  }
  return rows[0]
}

/**
 * Write the five photo columns of one row back (null clears) and read them back
 * in the same round-trip. The read-back compares EVERY snapshot column, not just
 * `photo_url`: the restore's whole job is to leave the live row exactly as it was
 * found, and v30 recorded what a half-restore costs.
 */
export async function setPlacePhotos(row: PlacePhotoRow): Promise<AdminResult> {
  const body: Record<string, string | null> = {}
  for (const field of PLACE_PHOTO_FIELDS) body[field] = row[field]
  const { result, rows } = await postgrest<PlacePhotoRow>(
    `write place photos on ${row.id}`,
    'PATCH',
    `places?id=eq.${encodeURIComponent(row.id)}&select=${PLACE_PHOTO_COLUMNS}`,
    { body },
  )
  if (!result.ok) return result
  if (rows.length !== 1) {
    return {
      ok: false,
      output: `${result.output}; read-back returned ${rows.length} row(s) — wanted exactly one for id ${row.id}`,
    }
  }
  const written = rows[0]
  const mismatched = PLACE_PHOTO_FIELDS.filter((field) => written[field] !== row[field])
  if (mismatched.length > 0) {
    return {
      ok: false,
      output: `${result.output}; read-back differs from the snapshot on ${mismatched.join(', ')}`,
    }
  }
  return result
}


/**
 * V20 t06 → V28 slice 3b — fill the signup form, submit it, and complete the
 * name card.
 *
 * WHY THIS IS A SHARED HELPER AND NOT 20 INLINE COPIES. The form changed shape
 * twice: it used to be `input[autocomplete="nickname"]` (one "Display name"
 * box), then FIRST NAME + LAST NAME + HOME ADDRESS on /login, and since V28
 * slice 3b it is EMAIL + PASSWORD ONLY (the account is card 1 of 4). One
 * helper means the specs say "sign this viewer up" and the form's field list
 * lives in exactly one place.
 *
 * The name moved onto the name card at /onboarding (card 2 of 4, V28 slice
 * 3a) — the SAME `autoComplete="given-name"` / `"family-name"` selectors the
 * old /login form carried. `name` is the handle the caller expects the
 * account to end up with, so the helper splits it the way the card composes
 * it (`composeDisplayName` puts a single space between the halves). A
 * single-word name goes entirely into the first field, which composes back
 * to the same string.
 *
 * THE NAME CARD'S CONTINUE IS THE FORM-ASSOCIATION PIN: the card's primary
 * button sits OUTSIDE its `<form>` and is joined to it only by the HTML
 * `form` attribute (FirstRunCard.tsx). If the id and the attribute drift, the
 * click submits nothing — the profile row is never created, the area card
 * never renders, and the caller's `finishSignup` hangs at its area-card
 * wait. That failure is the pin for the association.
 *
 * The password is whatever the caller already generated; it is only typed
 * here. The home location is set by the caller's `finishSignup` on the
 * location step that follows the name card.
 *
 * ⚠️ THE PRE-FILL TRIPWIRE (moved here from e2e/auth.setup.ts by V28 r2 slice
 * 8a, which made this helper the marker's walk too): when the caller's `name`
 * EQUALS the card's pre-fill — the email's local part, `suggestedHandle`'s
 * fallback, which is exactly what the marker's `e2e-<epoch>` name is — the
 * given-name fill above is a no-op change and the field's VISIBLE value comes
 * from the pre-fill, not from the line. The card keeps each pre-fill half until
 * THAT field is edited (per-field touched flags in OnboardingPage); with the old
 * shared flag the family-name fill wiped the first-name pre-fill and the
 * required field silently blocked the submit. If that handling ever regresses,
 * THESE fills are what break — and it breaks as a 120s timeout waiting for the
 * next card, not as an assertion.
 */
export async function signUpViewer(
  page: Page,
  options: { name: string; email: string; password: string },
): Promise<void> {
  const { name, email, password } = options
  const space = name.indexOf(' ')
  const first = space === -1 ? name : name.slice(0, space)
  const last = space === -1 ? '' : name.slice(space + 1)

  await page.goto('/login')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()

  // V28 slice 3b: signup lands on /onboarding, where the name card (card 2)
  // creates the profile row. Its Continue is the pin described above.
  await page.locator('input[autocomplete="given-name"]').fill(first)
  if (last !== '') await page.locator('input[autocomplete="family-name"]').fill(last)
  await page.getByRole('button', { name: /^Continue/ }).click()
}

/**
 * FINISH SIGNUP — walk the kids card, then complete the AREA card.
 * (V28 slice 3b; first-use audit, ticket 02; V28 slice 4a: the kids hop;
 * V28 slice 5: the area card; V28 r2 slice 1b deleted the photo card from
 * the first run, so the old photo hop is gone — the photo now lives on the
 * name card, V28 r2 slice 2, and this helper's name hop skips it: the
 * photo is optional, so filling the two name fields and clicking Continue
 * walks the card exactly as before.)
 *
 * The signup form no longer carries an address, so `signUpViewer` lands the
 * new parent on /onboarding ALWAYS: the name card comes next
 * (signUpViewer completes it), then the KIDS card ("3 of 4", V28 slice 4a),
 * and then the AREA card ("4 of 4", V28 slice 5 — address-first,
 * decision 9).
 *
 * ⚠️ THE ADDRESS LOOKUP IS ANSWERED BY THIS FIXTURE, AND THE FIXTURE IS
 * OBSERVED (V28 r2 slice 8a; the observation is round 1's fix). Until this
 * slice the helper typed an address that could not resolve and walked the ZIP
 * fallback — which put a REAL Nominatim request in every one of this helper's
 * consumers (bounded at `ADDRESS_LOOKUP_TIMEOUT_MS` = 10s, ~170s of suite-wide
 * worst case) and left a tail risk that the fake address resolved into the
 * seeded gazetteer. Now the helper intercepts the card's request and fulfils it
 * with the CALLER'S OWN ZIP (`postcode: options.homeZip` + a house number, the
 * precision rule), so:
 *
 *   - the walk types an address, picks the radius, and taps Finish ONCE — the
 *     intercepted answer resolves to the caller's zip, `handleAreaFinish` writes
 *     zip + radius, and the run renders its ending card. No typed ZIP, no
 *     fallback notice.
 *   - the radius is chosen BEFORE that tap, because on the resolved path the one
 *     Finish is the last thing the card does.
 *   - the caller's zip must be one the gazetteer knows (`validateHomeZip` is the
 *     same gate the typed path used — every existing consumer already passed it).
 *
 * ⚠️ AND THE STUB IS NOT ALLOWED TO FAIL SILENTLY (D-030: an instrument that
 * did not look must not report health). A route that matched nothing looks
 * exactly like a healthy one, and this walk's failure mode is NOT
 * self-refuting: the address typed is REAL, so with the stub absent the network
 * answers — `zipFromResult` accepts that answer, the postcode Nominatim returns
 * for THIS address is a SEEDED gazetteer zip (0012 holds 98104 and 98134), so
 * `validateHomeZip` passes and the walk lands GREEN having written the WRONG
 * home zip. With no network it would instead hang ~30s at the ending-card wait,
 * which says nothing about the cause. So the helper carries TWO instruments,
 * which all 18 consumers inherit:
 *
 *   1. THE STUB COUNTS ITS OWN MATCHES and the count is ASSERTED (>= 1)
 *      immediately after the Finish tap — a zero-match run FAILS in ~5s saying
 *      the stub never fired, rather than proceeding or timing out;
 *   2. THE ZIP THE WALK WROTE IS ASSERTED, on the feed's own location line
 *      (`feedLocationSummary` renders `Near <home_zip> · within <radius> miles`),
 *      so green cannot mean "one of the seeded postcodes, whichever arrived".
 *      No consumer pinned the written zip before round 1 — `zip-radius` asserts
 *      only `N mi`, and `auth.setup.ts` re-PATCHes the column afterwards.
 *
 * The old "an address that can never resolve" guard is gone WITH the mechanism
 * it guarded: it made a network failure loud by landing on a fallback the
 * fixture then filled by hand. The two assertions above are strictly stronger —
 * they fail on a WRONG ZIP, where the old guard could only fail on a hang.
 *
 * Both faces of the fallback remain pinned where they belong:
 * e2e/signup-zip-fallback.e2e.ts intercepts the same request and pins the
 * resolved leg AND the empty-answer leg (note + field + the typed zip) — the
 * helper no longer re-walks the empty leg for the 18 specs that never asserted
 * it.
 *
 * THE LANDING (V28 slice 6, plan defect #19 → V28 r2 slice 5 → **V28 r3-6**):
 * the area card's save does not navigate; the page resolves the run as finished
 * and **navigates straight to the feed**.
 *
 * ⚠️ V28 r3-6 (r3-D3) REMOVED the ending card this helper used to tap. Until
 * r3-6 the page rendered the "How Drop In works" tour in place and this helper
 * waited for `first-run-finish-card`, then tapped its "Go to your feed" CTA. The
 * human's phone walk reversed that: the run now ends IN the app. So the walk's
 * last hop is gone — **the feed itself is the assertion**, which is stricter than
 * the old wait-then-tap because it proves the landing rather than a card's
 * presence.
 *
 * (`HowItWorksCard` and `firstRunTour.ts` still exist and are deliberately NOT
 * deleted — r3-7's tooltips are their likely consumer. No spec references their
 * testid any more except the one that pins the OLD behaviour's absence; see
 * `signup-zip-fallback.e2e.ts`.)
 *
 * THE KIDS HOP: the kids card is skippable, so this helper taps its Skip
 * control — writing NOTHING (no kid rows) — and proceeds to the AREA card.
 * (The photo card that used to sit between them was deleted in V28 r2
 * slice 1b; the photo now joins the name card in slice 2.) The Skip
 * button (FirstRunCard's chrome) is the card's only control
 * that advances without touching the DB, which keeps the 18 specs that
 * consume this helper on the deterministic no-kids path: their assertions
 * about kids (kid-names-privacy and friends) create their kids through the
 * /profile editor or REST, never through onboarding. A spec that wants the
 * kids WRITE is one that should not be using this helper.
 *
 * THE COUNT, and the instrument that does not count itself (round 1: the number
 * 17 sat in five other comments, and this slice's own 18th consumer —
 * e2e/auth.setup.ts — made every one of them stale):
 *
 *     grep -rln "finishSignup(" e2e/*.ts | grep -v "/fixtures.ts" | wc -l
 *
 * That is files which MENTION the call, minus this module (the definer, which
 * mentions it in this very paragraph): 17 at `8d1170d`, 18 at `ae578c2` and now.
 * Writing the command literally here is safe precisely BECAUSE the definer is
 * excluded — a metric written into the file it counts is otherwise the
 * self-matching instrument this batch keeps finding.
 *
 * It NEVER forces a reload: a spec that counts requests during the cold load
 * still counts only the cold load's.
 */
export async function finishSignup(
  page: Page,
  options: { homeZip: string; radiusMiles?: number | string },
): Promise<void> {
  const feed = page.getByRole('heading', { name: 'Near you' })

  // THE CARD'S ONE REQUEST IS ANSWERED HERE, AND COUNTED (V28 r2 slice 8a — see
  // the docblock for why the count is asserted and not merely kept). Installed
  // before the address is typed, so no lookup can escape it, and removed at the
  // end of this helper so no LATER request on this page is answered by a stub
  // built for the walk.
  let intercepted = 0
  const answerAddressLookup = (route: Route): Promise<void> => {
    intercepted += 1
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          lat: '47.6205',
          lon: '-122.3414',
          address: { postcode: options.homeZip, house_number: '1200' },
        },
      ]),
    })
  }
  await page.route(NOMINATIM_ROUTE, answerAddressLookup)

  // V28 slice 4a: the kids card (3 of 4) sits between the name card and the
  // area card. It is the ONLY view that renders the card's Skip control
  // (the area card has none — it is required), so waiting for it is the hop
  // itself — and it absorbs the same profile-load settle beat the area-card
  // wait absorbs. (V28 slice 4b's photo card used to sit between them with
  // a second Skip; V28 r2 slice 1b deleted it, so the walk is: wait,
  // click — one hop.)
  const skip = page.getByRole('button', { name: 'Skip' })
  await skip.waitFor({ timeout: 30_000 })
  await skip.click()

  // V28 slice 5: the AREA card ("4 of 4") is the last view — address-first
  // (decision 9). The address is the entry (the card has no Skip), and the
  // intercepted lookup above resolves it to the CALLER'S zip, so nothing is
  // typed into a ZIP field. Waiting on the card's testid rather than the DOM
  // keeps a cold-load beat harmless: the card renders once the profile load
  // settles, and the wait absorbs that.
  const areaCard = page.getByTestId('first-run-area-card')
  await areaCard.waitFor({ timeout: 30_000 })
  await page.getByPlaceholder('e.g. 1200 1st Ave S, Seattle').fill(FINISH_SIGNUP_ADDRESS)
  // The radius is chosen BEFORE the Finish tap, because on the resolved path
  // that one tap is the last thing the card does (it writes the zip the lookup
  // returned + this radius and renders the ending card).
  //
  // The radius only matters to specs that assert on distance; anything else
  // takes the app's own default (5 mi) rather than restating it. The select's
  // options are LABELS ("20 miles"), so the option may be given as one of
  // those labels verbatim or as a number of miles; V28 slice 4a widens the
  // type to `number | string` because zip-radius.e2e.ts has always passed
  // the full label ('20 miles') and the number-form would have produced
  // "20 miles miles" (a latent defect predating V28, surfaced when 4a ran
  // the spec for the first time).
  const radiusLabel =
    options.radiusMiles === undefined
      ? '5 miles'
      : typeof options.radiusMiles === 'string'
        ? options.radiusMiles
        : `${options.radiusMiles} miles`
  await page
    .locator('select')
    .first()
    .selectOption({ label: radiusLabel })
  // The card's primary reads "Finish" (FIRST_RUN_COPY.area); while the lookup
  // is in flight it reads "Checking your address…" and is disabled, so the
  // click auto-waits for the (intercepted, instant) settle and the save.
  await page.getByRole('button', { name: 'Finish' }).click()
  // ⚠️ THE TRIPWIRE, AND WHY IT SITS HERE RATHER THAN AFTER THE WALK. The tap
  // above is what issues the request, so a stub that did not fire is provable
  // NOW — and it must fail HERE, in ~5s and with this message, because the two
  // alternatives both lie: the ending-card wait below would time out for 30s
  // (silent about the cause), and a real answer that happens to be a seeded
  // postcode would let the walk finish green with the wrong zip.
  await expect
    .poll(() => intercepted, {
      timeout: 5_000,
      message:
        `finishSignup's address-lookup stub NEVER FIRED: the area card's Nominatim request did not reach ` +
        `page.route(NOMINATIM_ROUTE). Either the route pattern no longer matches the URL the app requests, or the ` +
        `card never asked. This is a FINDING, not a flake — without the stub the walk is answered by the REAL ` +
        `network, whose postcode for "${FINISH_SIGNUP_ADDRESS}" is a SEEDED gazetteer zip, so validateHomeZip would ` +
        `pass and this walk would write a DIFFERENT home zip while still going green. Fix the stub or the address.`,
    })
    .toBeGreaterThan(0)

  // V28 r3-6 (r3-D3): the area card's save now lands the parent DIRECTLY on the
  // feed — the run's ending screen is gone, and the page navigates itself. There
  // is no card to wait for and no CTA to tap; the feed's arrival IS the
  // assertion, and it is the stricter one (the old shape proved a card rendered,
  // this proves the run actually finished and left).
  await feed.waitFor({ timeout: 30_000 })

  // The stub's job is over: it answered the walk's ONE request, and leaving it
  // installed would silently answer any LATER Nominatim request this page makes
  // (an Apply-time geocode, the directory) with this walk's zip and pin. That
  // is latent today — no consumer geocodes after the walk — so this is the
  // boundary rather than a comment claiming there is one.
  await page.unroute(NOMINATIM_ROUTE, answerAddressLookup)

  // ⚠️ THE ZIP THE WALK WROTE IS PINNED HERE, and this is the assertion that
  // makes the fixture honest: `feedLocationSummary` renders
  // `Near <home_zip> · within <radius> miles` off the profile row the save just
  // wrote, so a walk that wrote some OTHER seeded postcode — the shape of every
  // silent-stub failure — cannot pass. Green now means "the zip the caller asked
  // for reached the database", not "a walk finished". No consumer asserted this
  // before round 1.
  await expect(page.getByTestId('feed-location-control')).toContainText(options.homeZip)
}

/**
 * V28 slice 4c — read the Supabase session (access token + user id) OUT of a
 * browser page's localStorage, the in-browser twin of readMarkerSession (the
 * setup spec's markerCreds block is the same parse, run in-page). Specs that
 * sign a SECOND viewer up in a fresh context (the zip-radius pattern) get
 * their OWN JWT this way — the owner-scoped policies (PATCH profiles, SELECT
 * own kids) only accept the owner's own token. Returns null when the page
 * holds no session blob (the caller decides: skip, or fail).
 */
export async function readSessionFromBrowserPage(
  page: Page,
): Promise<{ accessToken: string; userId: string } | null> {
  return page.evaluate((): { accessToken: string; userId: string } | null => {
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
}

/**
 * V25 ticket 13 — DISMISS THE RSVP CONFIRMATION LIGHTBOX IF IT IS OPEN.
 *
 * A ping on a drop-in's detail page raises the confirmation dialog, whose
 * backdrop covers the whole page. Specs that ping a post and then keep driving
 * that page (to open the thread, to react to a message, to follow the
 * "same time next week" link — inbox.e2e, reactions.e2e and loop-closing.e2e
 * all do) would otherwise find their NEXT tap landing on the backdrop.
 *
 * WHY THIS IS A HELPER AND NOT A `.click({ force: true })` OR A PAGE RELOAD:
 *  - it dismisses the dialog the way a parent does — the visible "Got it"
 *    control — so the spec still exercises the real UI;
 *  - it is a no-op when nothing is open (`count() === 0`), so a helper that
 *    pings something which does NOT raise the lightbox (the feed card's own
 *    toggle, an un-ping) can call it unconditionally;
 *  - it leaves the page in the state the caller expects afterwards (still
 *    `✓ Going`, still on the detail page) rather than navigating around the
 *    assertion.
 *
 * The existence check is a plain `count()` rather than a race against a
 * timeout: every call site has already settled the write (the button reads
 * "✓ Going"), so the dialog is either open now or was never going to open.
 */
export async function dismissRsvpConfirmationIfOpen(page: Page): Promise<void> {
  const gotIt = page.getByTestId('rsvp-confirmation-got-it')
  if ((await gotIt.count()) === 0) return
  await gotIt.click()
  await expect(page.getByTestId('rsvp-confirmation')).toHaveCount(0)
}
