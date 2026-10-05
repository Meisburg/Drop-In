import path from 'node:path'
import { defineConfig } from '@playwright/test'

/**
 * E2E foundation (V2 ticket 00): Chromium only, against a `vite preview`
 * of the built app (dist/) on port 4173, specs live in e2e/.
 *
 * Project ordering (Playwright's setup/teardown pattern): the `setup`
 * project signs up + onboards a fresh marker user (e2e-<epoch>@gmail.com,
 * the live-check marker pattern) against the real Supabase project and
 * saves the signed-in browser state (storageState) to e2e/.auth/ —
 * gitignored, never committed. The `chromium` project depends on it and
 * reuses that state for the specs; the specs themselves carry no
 * passwords or keys (the REST cleanup reads .env at run time).
 *
 * Spec files are named *.e2e.ts (not *.spec.ts) on purpose: the pinned
 * unit gate `npm run test` (vitest) would otherwise pick them up via
 * its default `*.test.*` / `*.spec.*` include and try to run browser
 * tests in Node.
 */
const markerState = path.join(process.cwd(), 'e2e', '.auth', 'marker-state.json')

/**
 * THE ONE BASE URL, read from the environment so a run can be pointed at a
 * private port. `e2e/fixtures.ts` exports the same constant with the same
 * default, and the specs' own `browser.newContext` calls use it — because until
 * 2026-10-05 most of them hardcoded `http://localhost:4173` for their OWN
 * contexts, so a config-level override covered only the specs that used this
 * `baseURL`. With `reuseExistingServer: true` (below) and another checkout
 * holding `:4173`, that made a local green measure the wrong app.
 *
 *   npx vite preview --port 4180 --strictPort &
 *   E2E_BASE_URL=http://localhost:4180 npx playwright test e2e/that-spec.e2e.ts
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4173'
const PREVIEW_PORT = Number(new URL(BASE_URL).port || 80)

export default defineConfig({
  testDir: './e2e',
  // The specs drive the live Supabase project through the app's UI;
  // round-trips (signup, onboarding, posting, feed) can be slow.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // The specs share one live project + one marker account — keep them
  // deterministic and serial.
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      // The setup spec: signs up the marker, saves the storageState.
      name: 'setup',
      testMatch: '**/auth.setup.ts',
    },
    {
      // The specs: reuse the marker's signed-in state.
      name: 'chromium',
      testMatch: '**/*.e2e.ts',
      dependencies: ['setup'],
      use: { storageState: markerState },
    },
  ],
  webServer: {
    // V22 slice 12: rebuild before serving, so a reused server can never hand
    // the suite a STALE dist/.
    //
    // WHY THIS MATTERS, and why `reuseExistingServer` needed this: this machine
    // usually already has a preview up (the human's lane), so Playwright reuses
    // it rather than starting its own. But `npm run test:e2e` does NOT build —
    // it trusts whatever dist/ the running server was started from. Without the
    // build here, a spec could pass against yesterday's bundle after you changed
    // src/, which is exactly the "gate turned green by not running the real
    // code" failure this repo's config-guard exists to prevent. Building first
    // makes reuse safe: the server restarts on the fresh output.
    //
    // `--strictPort` (added 2026-10-05): without it `vite preview` silently
    // moves to the next free port when the one asked for is taken, and
    // Playwright then waits on the port nobody is serving. It only ever runs
    // when nothing is listening — `reuseExistingServer` short-circuits first.
    command: `npm run build && npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
    port: PREVIEW_PORT,
    timeout: 180_000,
    reuseExistingServer: true,
  },
})