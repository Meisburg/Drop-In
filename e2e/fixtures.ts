/**
 * E2E helpers (V2 ticket 00): shared access to the marker account's state.
 *
 * - readEnvFile(): reads VITE_* vars straight from the repo .env with
 *   `node:fs` — no dotenv dependency (the file is plain KEY=VALUE).
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
import { expect, type Page } from '@playwright/test'
// The stepper's own pure math — imported so a spec's expectation is the same
// rule the form applies, never a copy of it (feed.ts is pure: its only
// imports are `import type`, erased at runtime).
import { TIME_STEP_MINUTES, formatTimeLabel, stepTimeMinutes } from '../src/lib/feed'

const CWD = process.cwd()

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
 * V20 t06 — fill the signup form and submit it.
 *
 * WHY THIS IS A SHARED HELPER AND NOT 20 INLINE COPIES. The form changed shape:
 * it used to be `input[autocomplete="nickname"]` (one "Display name" box) and
 * every spec that created a throwaway viewer drove that one selector. It is now
 * FIRST NAME + LAST NAME + HOME ADDRESS, so all 20 call sites had to change at
 * once — and the next change to this form would otherwise have to touch 20
 * files again. One helper means the specs say "sign this viewer up" and the
 * form's field list lives in exactly one place.
 *
 * `name` is the handle the caller expects the account to end up with — it is
 * what other assertions in those specs look for as `@name` — so the helper
 * splits it the way the form joins it (`composeDisplayName` puts a single space
 * between the halves). A single-word name goes entirely into the first field,
 * which composes back to the same string.
 *
 * The ADDRESS is a fixed real Seattle street address, not a per-caller value:
 * signup uses it to derive a home zip, and these specs set their own location
 * on the onboarding step immediately afterwards regardless (they all wait for
 * "Set your location" and fill the zip), so a failed geocode changes nothing
 * about what the spec goes on to assert. Making it a parameter would be a knob
 * no caller needs.
 *
 * The password is whatever the caller already generated; it is only typed here.
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
  await page.locator('input[autocomplete="given-name"]').fill(first)
  if (last !== '') await page.locator('input[autocomplete="family-name"]').fill(last)
  // The same street address every time — see the doc above.
  await page.locator('input[autocomplete="street-address"]').fill('7349 15th Ave NW, Seattle, WA 98107')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
}
