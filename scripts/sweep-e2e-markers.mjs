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
 *   node scripts/sweep-e2e-markers.mjs verify   # post-sweep state
 *
 * This deletes rows from production. Run `select` and read the gate first.
 */
import { chromium } from '@playwright/test'

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

const VICTIMS = `(select id from auth.users where email like 'e2e-%')`

const COUNTS = `
  select
    (select count(*) from auth.users where email like 'e2e-%') as e2e_users,
    (select count(*) from auth.users) as all_users,
    (select count(*) from profiles p join auth.users u on u.id = p.id
      where u.email like 'e2e-%' and (p.moderators is true or p.display_name ilike '%meisburg%')) as founder_overlap,
    (select count(*) from profiles p join auth.users u on u.id = p.id where u.email like 'e2e-%') as e2e_profiles,
    (select count(*) from playdates where host_profile_id in ${VICTIMS}) as e2e_playdates,
    (select count(*) from going_pings where profile_id in ${VICTIMS}) as e2e_pings,
    (select count(*) from comments where author_profile_id in ${VICTIMS}) as e2e_comments,
    (select count(*) from kids where profile_id in ${VICTIMS}) as e2e_kids,
    (select count(*) from memberships where profile_id in ${VICTIMS}) as e2e_memberships,
    (select count(*) from blocks where blocker_profile_id in ${VICTIMS} or blocked_profile_id in ${VICTIMS}) as e2e_blocks,
    (select count(*) from reports where reporter_profile_id in ${VICTIMS}) as e2e_reports`

if (mode === 'select') {
  console.log(JSON.stringify(await sql(COUNTS), null, 1))
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
  const [gate] = await sql(COUNTS)
  if (gate.founder_overlap > 0) {
    console.error('REFUSING: a founder/moderator account is inside the e2e- set.', gate)
    process.exit(3)
  }
  if (gate.e2e_users === 0) {
    console.log('Nothing to do — no e2e- accounts.')
    process.exit(0)
  }
  console.log(`Gate passed (${gate.e2e_users} accounts, 0 founder overlap). Deleting…`)
  // FK-safe order, scoped to the marker users only.
  await sql(`
    delete from playdate_kids where kid_id in (select id from kids where profile_id in ${VICTIMS});
    delete from comments where author_profile_id in ${VICTIMS};
    delete from going_pings where profile_id in ${VICTIMS};
    delete from reports where reporter_profile_id in ${VICTIMS};
    delete from blocks where blocker_profile_id in ${VICTIMS} or blocked_profile_id in ${VICTIMS};
    delete from memberships where profile_id in ${VICTIMS};
    delete from kids where profile_id in ${VICTIMS};
    delete from playdates where host_profile_id in ${VICTIMS};
    delete from profiles where id in ${VICTIMS};
    delete from auth.users where email like 'e2e-%';`)
  console.log('Deleted. Run `verify` to confirm.')
} else if (mode === 'verify') {
  console.log(
    JSON.stringify(
      await sql(`select
        (select count(*) from auth.users) as all_users,
        (select count(*) from profiles) as all_profiles,
        (select count(*) from playdates) as all_playdates,
        (select count(*) from auth.users where email like 'e2e-%') as e2e_left,
        (select count(*) from profiles where moderators is true) as moderators_left`),
      null,
      1,
    ),
  )
} else {
  console.error(`Unknown mode "${mode}" — use list | select | delete | verify.`)
  process.exit(1)
}
