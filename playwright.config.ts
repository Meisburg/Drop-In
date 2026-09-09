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
    baseURL: 'http://localhost:4173',
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
    // Serves dist/ (run `npm run build` first — the pinned gate does).
    command: 'npm run preview',
    port: 4173,
    timeout: 120_000,
  },
})