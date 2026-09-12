/**
 * Apply a migration (or run an arbitrary query) against the LIVE Supabase
 * project through the dashboard SQL API — the documented apply path for this
 * repo (see task-state.md's tooling note and README).
 *
 * Why this exists: the dashboard's own SQL editor does not hydrate in the
 * CDP-copied Chrome profile (the Monaco SPA never defines `window.monaco`),
 * and browser-use's LLM loop is unusable on this machine's local model. The
 * dashboard's HTTP SQL API does work, and its session token lives in the CDP
 * profile's Local Storage under `supabase.dashboard.auth.token` (1-hour TTL,
 * refreshed on page load — hence the reload below).
 *
 * Usage:
 *   bash scripts/cdp-migration-tooling.sh          # Chrome on :9222 (once)
 *   node scripts/apply-migration.mjs supabase/migrations/0028_x.sql
 *   node scripts/apply-migration.mjs --sql "select count(*) from playdates"
 *
 * Safety rails (this writes to PRODUCTION):
 *   - a FILE must live under supabase/migrations/ (no arbitrary paths);
 *   - `--sql` is for reads/probes; destructive statements (drop table/schema,
 *     truncate, delete from auth.users/profiles) are refused unless
 *     `--allow-destructive` is passed deliberately;
 *   - the HTTP status and the raw response body are always printed, so a
 *     failure is never mistaken for a success (the "0 rows" DML lesson).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const REF = 'ayzvjwxbxyrcgyoeaxuk'
const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations')

const args = process.argv.slice(2)
const sqlFlagIndex = args.indexOf('--sql')
const fileArg = args.find((a) => !a.startsWith('--'))
const allowDestructive = args.includes('--allow-destructive')

let query
let label
if (sqlFlagIndex !== -1) {
  query = args[sqlFlagIndex + 1]
  label = '--sql'
  if (query === undefined || query === '') {
    console.error('Usage: node scripts/apply-migration.mjs --sql "<query>"')
    process.exit(2)
  }
} else if (fileArg !== undefined) {
  const resolved = path.resolve(fileArg)
  if (!resolved.startsWith(MIGRATIONS_DIR + path.sep)) {
    console.error(`Refusing: ${fileArg} is not under supabase/migrations/.`)
    process.exit(2)
  }
  query = readFileSync(resolved, 'utf8')
  label = path.relative(process.cwd(), resolved)
} else {
  console.error(
    'Usage:\n' +
      '  node scripts/apply-migration.mjs supabase/migrations/NNNN_name.sql\n' +
      '  node scripts/apply-migration.mjs --sql "select 1"',
  )
  process.exit(2)
}

const DESTRUCTIVE = /\b(drop\s+(table|schema|database)|truncate\b|delete\s+from\s+auth\.users|delete\s+from\s+public\.profiles)/i
if (DESTRUCTIVE.test(query) && !allowDestructive) {
  console.error(
    'Refusing: this looks destructive (drop table/schema, truncate, or deleting\n' +
      'auth users / profiles). Re-run with --allow-destructive if that is really\n' +
      'the intent (the marker sweep has its own gated tool).',
  )
  process.exit(2)
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const context = browser.contexts()[0]
const page =
  context.pages().find((p) => p.url().startsWith('https://supabase.com')) ??
  (await context.newPage())
if (page.url() === 'about:blank') {
  await page.goto('https://supabase.com/dashboard', { waitUntil: 'domcontentloaded' })
}
// The token has a 1-hour TTL and the page refreshes it on load: reloading
// first makes this work whenever the CDP Chrome is simply still open.
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
await page.waitForTimeout(2500)
const raw = await page.evaluate(() => window.localStorage.getItem('supabase.dashboard.auth.token'))
await browser.close()

if (!raw) {
  console.error(
    'No dashboard token in the CDP Chrome profile — the session is gone.\n' +
      'Run: bash scripts/cdp-migration-tooling.sh   then retry.',
  )
  process.exit(2)
}
const token = JSON.parse(raw).access_token

console.log(`→ ${label} (${query.length} bytes)`)
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
})
const text = await res.text()
console.log(`HTTP ${res.status}`)
console.log(text.length > 4000 ? `${text.slice(0, 4000)}\n… (${text.length} bytes total)` : text)
process.exit(res.ok ? 0 : 1)
