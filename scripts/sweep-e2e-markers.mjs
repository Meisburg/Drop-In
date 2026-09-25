/**
 * Marker sweep — removes the `e2e-*` test accounts that every Playwright run
 * creates in the LIVE Supabase project (the specs clean up their own rows, but
 * the auth users + profiles persist by design).
 *
 * Path (proved by the 2026-09-09 and 2026-09-11 sweeps): the Supabase
 * dashboard session token lives in the CDP Chrome profile's Local Storage
 * under 'supabase.dashboard.auth.token', and the dashboard SQL API accepts
 * queries at POST /v1/projects/<ref>/database/query. Start Chrome with
 * `bash scripts/cdp-migration-tooling.sh` first.
 *
 *   node scripts/sweep-e2e-markers.mjs list     # who would be deleted
 *   node scripts/sweep-e2e-markers.mjs select   # counts + the safety gate
 *   node scripts/sweep-e2e-markers.mjs delete   # REFUSES unless the gate passes
 *   node scripts/sweep-e2e-markers.mjs verify   # post-sweep state (exit 1 if any remain)
 *
 * This deletes rows from production. Run `select` and read the gate first.
 *
 * FIRST-USE AUDIT (ticket 05) MADE IT PROVE ITSELF. The audit found a fixture
 * drop-in sitting in the production discovery feed, which means the sweep had
 * been trusted rather than checked: it printed nothing about what it removed,
 * and nothing verified that the removal happened. Both halves matter — a sweep
 * that silently removes nothing looks exactly like a sweep that worked, and the
 * next release ships the leak again. So `delete` reports the exact rows it
 * removed per table and then RE-READS the database, failing loudly if a marker
 * row survived or a table's total did not drop by exactly the amount the report
 * claimed. `verify` exits non-zero when a marker remains, so it can gate a
 * release instead of being a log line nobody reads.
 *
 * THE DECISION LIVES IN scripts/lib/sweep-e2e.mjs, WITH ITS TESTS. This file is
 * only the parts that cannot be unit-tested: the CDP token dance, the SQL
 * transport, and the console output. The proof itself — the part that must not
 * be wrong, because a verifier that always says "clean" is worse than none — is
 * pure and covered by scripts/lib/sweep-e2e.test.mjs.
 *
 * WHAT IT STILL DOES NOT DO: it cannot see fixture content created by an
 * account OUTSIDE the marker convention (a real account a spec posted from).
 * That is the repo-side guard's job — scripts/guards/fixture-marker-guard.mjs,
 * which fails the normal `npm run verify` gate when a spec invents a fixture the
 * sweep's scope does not cover. The two halves are documented together in
 * docs/agents/e2e-fixture-convention.md.
 *
 * Deliberately NOT deletable by this script: it removes rows scoped to
 * `e2e-%` accounts. It never widens to "looks like test data".
 */
import { chromium } from '@playwright/test'
import {
  countsQuery,
  deleteStatements,
  gateRefusal,
  markerTotal,
  parseCounts,
  verificationProblems,
} from './lib/sweep-e2e.mjs'

const REF = 'ayzvjwxbxyrcgyoeaxuk'
const mode = process.argv[2] ?? 'select'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const context = browser.contexts()[0]
const page =
  context.pages().find((p) => p.url().startsWith('https://supabase.com')) ??
  (await context.newPage())
if (page.url() === 'about:blank') {
  await page.goto('https://supabase.com/dashboard', { waitUntil: 'domcontentloaded' })
}
// The dashboard token has a 1-hour TTL and the page refreshes it on load, so a
// token left over from an earlier run reads back as "JWT failed verification".
// Reloading first makes the script work whenever Chrome is simply still open.
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
await page.waitForTimeout(2500)
const raw = await page.evaluate(() => window.localStorage.getItem('supabase.dashboard.auth.token'))
await browser.close()

if (!raw) {
  console.error(
    'No dashboard token in the CDP Chrome profile — the session is gone.\n' +
      'Run: bash scripts/cdp-migration-tooling.sh  (launches the CDP Chrome), then retry.',
  )
  process.exit(2)
}
const token = JSON.parse(raw).access_token

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

/** The safety gate: a founder/moderator account inside the marker set. */
const GATE = `
  select
    (select count(*) from auth.users where email like 'e2e-%') as e2e_users,
    (select count(*) from auth.users) as all_users,
    (select count(*) from profiles p join auth.users u on u.id = p.id
      where u.email like 'e2e-%' and (p.moderators is true or p.display_name ilike '%meisburg%')) as founder_overlap`

async function countMarkerRows() {
  const [row] = await sql(countsQuery())
  return parseCounts(row)
}

function printCounts(title, counts) {
  console.log(title)
  for (const c of counts) {
    console.log(`  ${c.table.padEnd(20)} ${String(c.marker).padStart(5)} marker row(s)`)
  }
  console.log(`  ${'TOTAL'.padEnd(20)} ${String(markerTotal(counts)).padStart(5)}`)
}

if (mode === 'select') {
  console.log(JSON.stringify(await sql(GATE), null, 1))
  printCounts('\nMarker rows currently in production:', await countMarkerRows())
} else if (mode === 'list') {
  console.log(
    JSON.stringify(
      await sql(
        `select email, id, created_at from auth.users where email like 'e2e-%' order by created_at`,
      ),
      null,
      1,
    ),
  )
} else if (mode === 'delete') {
  const gate = (await sql(GATE))[0]
  const refusal = gateRefusal(gate)
  if (refusal !== null) {
    console.error(refusal, gate ?? '(no gate row)')
    process.exit(3)
  }
  if (Number(gate.e2e_users) === 0) {
    console.log('Nothing to do — no e2e- accounts.')
    process.exit(0)
  }
  console.log(`Gate passed (${gate.e2e_users} accounts, 0 founder overlap).`)

  const before = await countMarkerRows()
  printCounts('\nRemoving:', before)

  // FK-safe order, scoped to the marker rows only.
  await sql(deleteStatements().join('\n'))
  console.log('\nDelete statements executed.')

  // THE PROOF: re-read, and fail loudly if the database disagrees with the
  // report. A sweep that removes nothing must not look like a sweep that worked.
  const after = await countMarkerRows()
  const problems = verificationProblems(before, after)

  console.log(`\nRemoved ${markerTotal(before)} marker row(s) across ${before.length} table(s).`)
  printCounts('\nMarker rows remaining:', after)

  if (problems.length > 0) {
    console.error('\nSWEEP FAILED VERIFICATION — do not treat this release as clean:')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(4)
  }
  console.log(
    '\nVerified: zero marker rows remain, and every total moved by exactly the amount removed.',
  )
} else if (mode === 'verify') {
  const counts = await countMarkerRows()
  const remaining = markerTotal(counts)
  printCounts('Post-sweep state:', counts)
  const [state] = await sql(`select
    (select count(*) from auth.users) as all_users,
    (select count(*) from profiles) as all_profiles,
    (select count(*) from playdates) as all_playdates,
    (select count(*) from profiles where moderators is true) as moderators_left`)
  console.log(JSON.stringify(state, null, 1))
  if (remaining > 0) {
    console.error(
      `\nVERIFY FAILED: ${remaining} marker row(s) are still in production — ` +
        'the discovery feed can show them to real parents.',
    )
    process.exit(1)
  }
  console.log('\nVerified: no marker rows remain.')
} else {
  console.error(`Unknown mode "${mode}" — use list | select | delete | verify.`)
  process.exit(1)
}
