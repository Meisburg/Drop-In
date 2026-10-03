/**
 * Marker sweep — removes the `e2e-*` test accounts that every Playwright run
 * creates in the LIVE Supabase project (the specs clean up their own rows, but
 * the auth users + profiles persist by design).
 *
 * Credentials, browserless first. The SQL API is
 * POST /v1/projects/<ref>/database/query, and it accepts either:
 *   1. `SUPABASE_ACCESS_TOKEN` (a personal access token in `.env`) — the same
 *      credential `scripts/db-sql.sh` uses, and the path to prefer: no browser,
 *      works headless, repeatable from a terminal or CI; or
 *   2. a Supabase *dashboard* session token harvested from the CDP Chrome
 *      profile's Local Storage under 'supabase.dashboard.auth.token' (the
 *      2026-09-09/11 sweeps' original path, now the fallback). That path needs
 *      `bash scripts/cdp-migration-tooling.sh` first, and reading the token
 *      navigates that Chrome's window — see docs/agents/browser-lanes.md §7.
 *
 *   node scripts/sweep-e2e-markers.mjs list        # who would be deleted
 *   node scripts/sweep-e2e-markers.mjs select      # counts + the safety gate
 *   node scripts/sweep-e2e-markers.mjs collateral  # read-only cascade probe
 *   node scripts/sweep-e2e-markers.mjs delete      # REFUSES unless BOTH gates pass
 *   node scripts/sweep-e2e-markers.mjs verify      # post-sweep state (exit 1 if any remain)
 *
 * This deletes rows from production. Run `select` and read the gates first.
 *
 * TWO GATES, and the second one exists because the first was not enough.
 * `delete` refuses unless the founder-overlap gate passes AND the collateral
 * probe finds no non-marker row sitting behind a cascade. On 2026-10-03 the
 * founder gate passed, the sweep removed 2445 rows exactly as scoped, and a
 * REAL parent still lost a `going_pings` row — because
 * `going_pings.playdate_id -> playdates` is ON DELETE CASCADE and the sweep
 * deleted the marker-hosted drop-in that ping pointed at. The ping was never a
 * marker, so no marker-shaped check could see it. Scoping is not safety: see
 * the incident note in scripts/lib/sweep-e2e.mjs.
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
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import {
  collateralProbeQuery,
  collateralRefusals,
  countsQuery,
  deleteStatements,
  gateRefusal,
  markerTotal,
  parseCollateral,
  parseCounts,
  verificationProblems,
} from './lib/sweep-e2e.mjs'

const REF = 'ayzvjwxbxyrcgyoeaxuk'
const mode = process.argv[2] ?? 'select'

/**
 * `SUPABASE_ACCESS_TOKEN` from the repo `.env`, without pulling in a dotenv
 * dependency (`.env` is a flat KEY=value file, gitignored, and already the
 * source `scripts/db-sql.sh` reads).
 */
function tokenFromEnvFile() {
  try {
    const text = readFileSync(new URL('../.env', import.meta.url), 'utf8')
    const line = text.split('\n').find((l) => l.trim().startsWith('SUPABASE_ACCESS_TOKEN='))
    if (!line) return null
    return line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '') || null
  } catch {
    return null
  }
}

/**
 * The fallback: harvest the 1-hour dashboard session token from the CDP Chrome
 * on :9222. The page is reloaded first because the dashboard refreshes the token
 * on load, so a token left over from an earlier run reads back as "JWT failed
 * verification"; reloading makes the script work whenever Chrome is simply open.
 */
async function tokenFromCdp() {
  let browser
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  } catch {
    console.error(
      'No SUPABASE_ACCESS_TOKEN in the environment or .env, and no CDP Chrome on :9222.\n' +
        'Fix either way:\n' +
        "  echo 'SUPABASE_ACCESS_TOKEN=sbp_...' >> .env   # no browser at all (preferred)\n" +
        '  bash scripts/cdp-migration-tooling.sh          # or launch the CDP Chrome, then retry',
    )
    process.exit(2)
  }
  const context = browser.contexts()[0]
  const page =
    context.pages().find((p) => p.url().startsWith('https://supabase.com')) ??
    (await context.newPage())
  if (page.url() === 'about:blank') {
    await page.goto('https://supabase.com/dashboard', { waitUntil: 'domcontentloaded' })
  }
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(2500)
  const raw = await page.evaluate(() =>
    window.localStorage.getItem('supabase.dashboard.auth.token'),
  )
  await browser.close()

  if (!raw) {
    console.error(
      'No dashboard token in the CDP Chrome profile — the dashboard session is gone.\n' +
        'Sign in at supabase.com/dashboard in that Chrome (or set SUPABASE_ACCESS_TOKEN in .env), then retry.',
    )
    process.exit(2)
  }
  return JSON.parse(raw).access_token
}

const envToken = process.env.SUPABASE_ACCESS_TOKEN?.trim() || tokenFromEnvFile()
const token = envToken || (await tokenFromCdp())
if (envToken) console.log('Token: SUPABASE_ACCESS_TOKEN from the environment/.env (no browser).')

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

  // THE COLLATERAL GATE — read-only, and it runs BEFORE any delete.
  //
  // THE INCIDENT THIS BLOCKS (2026-10-03): scoping alone is not enough. This
  // sweep deletes marker PARENTS, and `ON DELETE CASCADE` then destroys any
  // child pointing at them — including rows owned by real parents, which the
  // sweep's own WHERE clauses never named and its marker counts never saw. A
  // real parent's `going_pings` row died exactly that way. So the sweep now
  // ASKS FIRST: for every cascade edge, how many rows would be destroyed
  // without having been named? A non-zero answer refuses the whole run.
  //
  // It fails CLOSED and it is not skippable: there is no flag that bypasses it.
  const collateral = parseCollateral((await sql(collateralProbeQuery()))[0])
  const collateralProblems = collateralRefusals(collateral)
  if (collateralProblems.length > 0) {
    console.error(
      '\nREFUSING — this sweep would destroy rows it did not identify as e2e-owned:',
    )
    for (const p of collateralProblems) console.error(`  - ${p}`)
    console.error(
      '\nNOTHING WAS DELETED. A marker host\'s drop-in that a real parent joined cannot be ' +
        'swept without taking that parent\'s row with it. Resolve those rows first ' +
        '(or exclude those marker accounts), then re-run.',
    )
    process.exit(5)
  }
  console.log(
    `Collateral gate passed — 0 non-marker rows sit behind any of the ` +
      `${collateral.length} cascade edge(s).`,
  )

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
} else if (mode === 'collateral') {
  // READ-ONLY. The same probe `delete` runs before it is willing to touch
  // anything, exposed on its own so the gate can be checked without a delete.
  const collateral = parseCollateral((await sql(collateralProbeQuery()))[0])
  const problems = collateralRefusals(collateral)
  console.log('Cascade collateral probe — rows a delete would destroy WITHOUT naming them:')
  for (const row of collateral) {
    console.log(
      `  ${row.child}.${row.column} -> ${row.parent}`.padEnd(46) +
        ` ${String(row.blockers).padStart(5)}`,
    )
  }
  if (problems.length > 0) {
    console.error('\nWOULD REFUSE:')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(5)
  }
  console.log('\nSafe — delete would refuse nothing.')
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
