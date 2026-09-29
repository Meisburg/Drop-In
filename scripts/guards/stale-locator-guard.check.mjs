#!/usr/bin/env node
/**
 * Self-check for the stale-locator guard (V28 slice 7a).
 *
 * Seeds defects into a throwaway copy of the repo (src + e2e) and requires
 * the guard to catch the RIGHT shapes and only the right shapes — a guard
 * that exits 0 over a positively-used dead literal is broken, and a guard
 * that flags a deliberate absence pin (toHaveCount(0) on a string the app
 * no longer renders) would forbid the suite's own documented convention:
 *
 *   1. clean repo (minus seeds) passes — the repo's live pins stay legal;
 *   2. a positively-used dead testid (const + click) is caught, named;
 *   3. the SAME dead testid pinned with toHaveCount(0) is NOT flagged —
 *      pins of removal are the repo's convention, not a bug;
 *   4. a composed testid that is the output of a src template literal
 *      (`parent-card-${slot}`) passes even positively used — the shape
 *      over-approximation the rule is built on.
 *
 * Run: node scripts/guards/stale-locator-guard.check.mjs
 * Exit 0 = check passes, 1 = the guard is not doing its job.
 */

import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const root = path.join(import.meta.dirname, '..', '..')
const guard = path.join(root, 'scripts', 'guards', 'stale-locator-guard.mjs')

if (!existsSync(guard)) {
  console.error(`check: guard missing at ${guard}`)
  process.exit(1)
}
if (!existsSync(path.join(root, 'src')) || !existsSync(path.join(root, 'e2e'))) {
  console.error('check: this must run from within the playdate-app repo (src/ and e2e/ missing)')
  process.exit(1)
}

// Throwaway copy: src (the "what the app still says" input) + e2e (the scan
// target). The seed file is the ONLY thing that may make a run non-clean.
const sandbox = mkdtempSync(path.join(os.tmpdir(), 'stale-locator-check-'))
const run = () => {
  try {
    return { exit: 0, out: execSync(`node ${JSON.stringify(guard)} ${JSON.stringify(sandbox)}`, { encoding: 'utf8', stdio: 'pipe' }).toString() }
  } catch (e) {
    return { exit: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}
let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    console.log(`  ✓ ${name}`)
  } else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
const seed = (lines) => writeFileSync(path.join(sandbox, 'e2e', 'zz-seeded.e2e.ts'), lines.join('\n') + '\n')

try {
  cpSync(path.join(root, 'src'), path.join(sandbox, 'src'), { recursive: true })
  cpSync(path.join(root, 'e2e'), path.join(sandbox, 'e2e'), { recursive: true })

  // 1. The repo as it stands must be clean: every positively-used locator
  //    literal still exists, and every dead literal is pinned negatively.
  let result = run()
  check(
    'clean repo passes (dead literals are all negative pins)',
    result.exit === 0,
    `exit ${result.exit}: ${result.out.split('\n').find((l) => l.startsWith('  -')) ?? ''}`,
  )

  // 2. Seed the defect: a dead testid the spec CLICKS. Playwright would time
  //    out on this; the guard must say so without running anything.
  seed([
    "import { test, expect } from './fixtures'",
    '',
    "test('seeded: positively-used dead testid (guard self-check)', async ({ page }) => {",
    "  const btn = page.getByTestId('zzgonezz-button')",
    '  await btn.click()',
    '  await expect(page.getByTestId(\'zzgonezz-button\')).toBeVisible()',
    '})',
    '',
  ])
  result = run()
  check('seeded defect is caught (non-zero exit)', result.exit !== 0, `exit ${result.exit}`)
  check(
    'finding names the seeded site and literal',
    result.out.includes('e2e/zz-seeded.e2e.ts') && result.out.includes('zzgonezz-button'),
    result.out.split('\n').filter((l) => l.startsWith('  -')).join(' | '),
  )

  // 3. The SAME dead testid used only as an absence pin must NOT be caught:
  //    toHaveCount(0) on a string the app no longer renders is the repo's
  //    documented "pin of removal" habit, and flagging it would make the
  //    guard forbid the convention it is meant to protect.
  seed([
    "import { test, expect } from './fixtures'",
    '',
    "test('seeded: dead testid pinned negatively', async ({ page }) => {",
    '  // the control was removed in the app; this line pins the removal',
    '  await expect(page.getByTestId(\'zzgonezz-button\')).toHaveCount(0)',
    '})',
    '',
  ])
  result = run()
  check(
    'negative pin of a dead literal is NOT flagged (pins of removal are legal)',
    result.exit === 0,
    `exit ${result.exit}: ${result.out.split('\n').find((l) => l.startsWith('  -')) ?? ''}`,
  )

  // 4. A composed testid that is the output of a src template literal must
  //    pass even when positively used: ProfilePage renders `parent-card-${slot}`
  //    for every linked parent, so `parent-card-9` is a real target.
  seed([
    "import { test, expect } from './fixtures'",
    '',
    "test('seeded: composed testid from a src template', async ({ page }) => {",
    "  await expect(page.getByTestId('parent-card-9')).toBeVisible()",
    '})',
    '',
  ])
  result = run()
  check(
    'template-shaped literal passes positively used (no false positive)',
    result.exit === 0,
    `exit ${result.exit}: ${result.out.split('\n').find((l) => l.startsWith('  -')) ?? ''}`,
  )
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}

if (failures > 0) {
  console.error(`stale-locator-guard check: ${failures} check(s) failed — the guard is not catching its defect class.`)
  process.exit(1)
}
console.log('stale-locator-guard check: all checks passed.')