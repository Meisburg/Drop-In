#!/usr/bin/env node
/**
 * Tests for the e2e-target guard.
 *
 * WHY A TEST FOR A GUARD EXISTS AT ALL. The failure mode of a guard is not
 * "it crashed" — it is "it passed". This one decides whether the whole e2e suite
 * is allowed to write to the database real parents read, and its most likely
 * silent failure is a regex that stopped matching `.supabase.co` refs, after
 * which every run would look cleanly aimed and every run would still be live.
 * So each seeded shape below requires a non-zero exit.
 *
 * The shapes, and the one that matters most is the last:
 *   1. no `.env`                       → finding (target unresolvable)
 *   2. `.env` URL is not a supabase URL → finding (target unresolvable)
 *   3. no config file                  → finding (nothing declares the target)
 *   4. config declares neither half    → finding (empty allowlist vouches for nothing)
 *   5. unknown ref                     → finding (unrecognised target)
 *   6. production, no reason/expiry    → finding (permanent waiver)
 *   7. production, EXPIRED waiver      → finding (the waiver ran out — the point)
 *   8. test ref listed                 → PASS  (the state this guard exists to reach)
 *   9. production, live waiver         → PASS, with the loud note
 *
 * Shape 8 is the assertion that this guard can be satisfied at all. A guard no
 * configuration passes is a guard that gets disabled rather than obeyed.
 *
 * Usage:  node scripts/guards/e2e-target-guard.check.mjs
 * Exit:   0 = the guard behaves, 1 = it does not
 *
 * The `.check.mjs` suffix is deliberate: not a vitest suite, a standalone
 * checker the guards gate runs. `*.test.mjs` would be discovered by `vitest run`,
 * where a top-level `process.exit()` kills the runner.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = process.cwd()
const GUARD = path.join(ROOT, 'scripts', 'guards', 'e2e-target-guard.mjs')

const PROD_REF = 'ayzvjwxbxyrcgyoeaxuk'
const TEST_REF = 'testprojectref1234'

const failures = []

function runGuard(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'e2e-target-guard-'))
  try {
    for (const [name, contents] of Object.entries(files)) {
      const full = path.join(dir, name)
      mkdirSync(path.dirname(full), { recursive: true })
      writeFileSync(full, contents)
    }
    const result = spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: 'utf8' })
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function expectExit(label, files, wantStatus, wantText) {
  const { status, stdout, stderr } = runGuard(files)
  const output = stdout + stderr
  if (status !== wantStatus) {
    failures.push(
      `${label}: expected exit ${wantStatus}, got ${status}\n${output.trim().split('\n').map((l) => `      ${l}`).join('\n')}`,
    )
    return
  }
  if (wantText !== undefined && !output.includes(wantText)) {
    failures.push(`${label}: exit ${status} was right but output did not mention "${wantText}"`)
  }
}

const envWith = (url) => `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=anon-key-placeholder\n`
const config = (object) => JSON.stringify(object, null, 2) + '\n'

// --- 1-2: the target cannot be resolved -----------------------------------
expectExit(
  'no .env',
  { 'e2e/.e2e-target.json': config({ testRefs: [TEST_REF] }) },
  1,
  'Cannot read',
)
expectExit(
  '.env URL is not a supabase URL',
  {
    '.env': envWith('https://example.com'),
    'e2e/.e2e-target.json': config({ testRefs: [TEST_REF] }),
  },
  1,
  'not a https://<ref>.supabase.co URL',
)

// --- 3-5: the allowlist cannot vouch for the target -----------------------
expectExit(
  'no config file',
  { '.env': envWith(`https://${TEST_REF}.supabase.co`) },
  1,
  'Missing',
)
expectExit(
  'config declares neither half',
  { '.env': envWith(`https://${TEST_REF}.supabase.co`), 'e2e/.e2e-target.json': config({}) },
  1,
  'neither a testRefs entry nor a productionRef',
)
expectExit(
  'unknown ref',
  {
    '.env': envWith('https://somerefnotlisted.supabase.co'),
    'e2e/.e2e-target.json': config({ testRefs: [TEST_REF], productionRef: { ref: PROD_REF } }),
  },
  1,
  'An unrecognised target is not a safe one',
)

// --- 6-7: production without a live, reasoned, expiring waiver -------------
expectExit(
  'production with no reason or expiry',
  {
    '.env': envWith(`https://${PROD_REF}.supabase.co`),
    'e2e/.e2e-target.json': config({
      testRefs: [TEST_REF],
      productionRef: { ref: PROD_REF, environment: 'production' },
    }),
  },
  1,
  'no written reason',
)
expectExit(
  'production with an EXPIRED waiver',
  {
    '.env': envWith(`https://${PROD_REF}.supabase.co`),
    'e2e/.e2e-target.json': config({
      testRefs: [TEST_REF],
      productionRef: {
        ref: PROD_REF,
        environment: 'production',
        reason: 'no test project exists yet',
        expires: '2000-01-01',
      },
    }),
  },
  1,
  'EXPIRED',
)

// --- 6b: the environment must be STATED, never inferred ---------------------
expectExit(
  'production ref with no environment field',
  {
    '.env': envWith(`https://${PROD_REF}.supabase.co`),
    'e2e/.e2e-target.json': config({
      testRefs: [TEST_REF],
      productionRef: { ref: PROD_REF, reason: 'no test project exists yet', expires: '2099-12-31' },
    }),
  },
  1,
  'The environment is stated, never inferred',
)
expectExit(
  'environment mislabelled as staging',
  {
    '.env': envWith(`https://${PROD_REF}.supabase.co`),
    'e2e/.e2e-target.json': config({
      testRefs: [TEST_REF],
      productionRef: {
        ref: PROD_REF,
        environment: 'staging',
        reason: 'no test project exists yet',
        expires: '2099-12-31',
      },
    }),
  },
  1,
  'The environment is stated, never inferred',
)

// --- 6c: one extension, then permanent refusal ------------------------------
// The second extension is the shape that matters: it is the exact move that
// would otherwise be made silently, forever, three weeks at a time.
expectExit(
  'waiver on its SECOND extension',
  {
    '.env': envWith(`https://${PROD_REF}.supabase.co`),
    'e2e/.e2e-target.json': config({
      testRefs: [TEST_REF],
      productionRef: {
        ref: PROD_REF,
        environment: 'production',
        reason: 'no test project exists yet',
        expires: '2099-12-31',
        extensionsUsed: 2,
        extensions: [
          { on: '2026-10-01', reason: 'recruitment slipped' },
          { on: '2026-10-22', reason: 'still not built' },
        ],
      },
    }),
  },
  1,
  'a separate Supabase project or branch for e2e',
)
expectExit(
  'extensionsUsed disagrees with the recorded history',
  {
    '.env': envWith(`https://${PROD_REF}.supabase.co`),
    'e2e/.e2e-target.json': config({
      testRefs: [TEST_REF],
      productionRef: {
        ref: PROD_REF,
        environment: 'production',
        reason: 'no test project exists yet',
        expires: '2099-12-31',
        extensionsUsed: 1,
        extensions: [],
      },
    }),
  },
  1,
  'a number with no history is a number someone typed',
)
expectExit(
  'an extension with no stated reason',
  {
    '.env': envWith(`https://${PROD_REF}.supabase.co`),
    'e2e/.e2e-target.json': config({
      testRefs: [TEST_REF],
      productionRef: {
        ref: PROD_REF,
        environment: 'production',
        reason: 'no test project exists yet',
        expires: '2099-12-31',
        extensionsUsed: 1,
        extensions: [{ on: '2026-10-01' }],
      },
    }),
  },
  1,
  'indistinguishable from forgetting to fix it',
)

// --- 8: the state this guard exists to reach -------------------------------
expectExit(
  'test ref listed',
  {
    '.env': envWith(`https://${TEST_REF}.supabase.co`),
    'e2e/.e2e-target.json': config({ testRefs: [TEST_REF], productionRef: { ref: PROD_REF } }),
  },
  0,
  'PASS',
)

// --- 9: production behind a live waiver, and LOUD about it -----------------
expectExit(
  'production with a live waiver',
  {
    '.env': envWith(`https://${PROD_REF}.supabase.co`),
    'e2e/.e2e-target.json': config({
      testRefs: [TEST_REF],
      productionRef: {
        ref: PROD_REF,
        environment: 'production',
        reason: 'no test project exists yet',
        expires: '2099-12-31',
        extensionsUsed: 0,
        extensions: [],
      },
    }),
  },
  0,
  'writes to real parents',
)

// --- 10: the LAST permitted extension still passes, and says so -------------
// Without this shape the counter could be off by one and nothing would notice:
// refusing the first extension looks identical to refusing the second.
expectExit(
  'waiver on its FIRST (permitted) extension',
  {
    '.env': envWith(`https://${PROD_REF}.supabase.co`),
    'e2e/.e2e-target.json': config({
      testRefs: [TEST_REF],
      productionRef: {
        ref: PROD_REF,
        environment: 'production',
        reason: 'no test project exists yet',
        expires: '2099-12-31',
        extensionsUsed: 1,
        extensions: [{ on: '2026-10-01', reason: 'recruitment slipped' }],
      },
    }),
  },
  0,
  'the NEXT renewal is refused',
)

if (failures.length > 0) {
  console.error(`e2e-target-guard.check: FAIL — ${failures.length} shape(s) did not behave:`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('e2e-target-guard.check: PASS — 15 seeded shapes behave (11 refuse, 4 accept).')
