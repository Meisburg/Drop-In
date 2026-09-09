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
import path from 'node:path'
import type { Page } from '@playwright/test'

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
  const tabLabel =
    routePath === '/new' ? 'Post' : routePath === '/profile' ? 'Profile' : null
  const here = () => new URL(page.url()).pathname === routePath
  for (let attempt = 0; attempt < 8; attempt++) {
    if (!here()) {
      // Client-side hop (no reload — a reload would re-run the race).
      if (tabLabel !== null) {
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