#!/usr/bin/env node
/**
 * Self-check for the vacuous absence guard (V28 slice 7a).
 *
 * Seeds a structurally vacuous absence assertion into a throwaway copy of the
 * repo (a test that stands on /settings and pins an onboarding-only testid to
 * toHaveCount(0)) and requires the guard to catch it — a guard that exits 0
 * over the seeded defect is BROKEN. Also requires the clean repo (minus the
 * seed) to pass: the guard must stay silent over every legitimate absence
 * pin, which is the contract it exists to protect.
 *
 * Run: node scripts/guards/vacuous-absence-guard.check.mjs
 * Exit 0 = check passes, 1 = the guard is not doing its job.
 */

import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const root = path.join(import.meta.dirname, '..', '..')
const guard = path.join(root, 'scripts', 'guards', 'vacuous-absence-guard.mjs')

if (!existsSync(guard)) {
  console.error(`check: guard missing at ${guard}`)
  process.exit(1)
}
if (!existsSync(path.join(root, 'src')) || !existsSync(path.join(root, 'e2e'))) {
  console.error('check: this must run from within the playdate-app repo (src/ and e2e/ missing)')
  process.exit(1)
}

// Throwaway copy: src (the route table + reachability inputs) + e2e (the scan
// target). The seed file is the ONLY thing that makes the run non-clean.
const sandbox = mkdtempSync(path.join(os.tmpdir(), 'vacuous-absence-check-'))
const run = (args = []) =>
  execSync(`node ${JSON.stringify(guard)} ${JSON.stringify(sandbox)} ${args.join(' ')}`, {
    encoding: 'utf8',
    stdio: 'pipe',
  }).toString()
let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    console.log(`  ✓ ${name}`)
  } else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

try {
  cpSync(path.join(root, 'src'), path.join(sandbox, 'src'), { recursive: true })
  cpSync(path.join(root, 'e2e'), path.join(sandbox, 'e2e'), { recursive: true })

  // 1. The repo as it stands must be clean (the cut is in; no live vacuous pins).
  let out = ''
  let cleanExit = 0
  try {
    out = run()
  } catch (e) {
    cleanExit = e.status
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`
  }
  check(
    'clean repo passes (guard stays silent over legitimate absence pins)',
    cleanExit === 0,
    `exit ${cleanExit}: ${out.split('\n').find((l) => l.startsWith('  -')) ?? ''}`,
  )

  // 2. Seed a structurally vacuous pin: on /settings, an onboarding-only testid
  //    cannot render at all, so its toHaveCount(0) is guaranteed by structure.
  writeFileSync(
    path.join(sandbox, 'e2e', 'zz-seeded.e2e.ts'),
    [
      "import { test, expect } from './fixtures'",
      '',
      "test('seeded: vacuous absence (guard self-check)', async ({ page }) => {",
      "  await page.goto('/settings')",
      "  await expect(page.getByTestId('area-zip-fallback-note')).toHaveCount(0)",
      '})',
      '',
    ].join('\n'),
  )
  let seeded = ''
  let seededExit = 0
  try {
    seeded = run()
  } catch (e) {
    seededExit = e.status
    seeded = `${e.stdout ?? ''}${e.stderr ?? ''}`
  }
  check(
    'seeded defect is caught (non-zero exit)',
    seededExit !== 0,
    `exit ${seededExit}`,
  )
  check(
    'finding names the seeded site',
    seeded.includes('e2e/zz-seeded.e2e.ts') && seeded.includes('area-zip-fallback-note'),
    seeded.split('\n').filter((l) => l.startsWith('  -')).join(' | '),
  )

  // 3. The same literal on the route where it CAN render must NOT be caught —
  //    that is the legitimate conditional-absence pin the guard must preserve.
  writeFileSync(
    path.join(sandbox, 'e2e', 'zz-seeded.e2e.ts'),
    [
      "import { test, expect } from './fixtures'",
      '',
      "test('seeded: legitimate absence on the renderable route', async ({ page }) => {",
      "  await page.goto('/onboarding')",
      "  await expect(page.getByTestId('area-zip-fallback-note')).toHaveCount(0)",
      '})',
      '',
    ].join('\n'),
  )
  let legit = ''
  try {
    legit = run()
  } catch (e) {
    legit = `${e.stdout ?? ''}${e.stderr ?? ''}`
  }
  check(
    'same literal on its renderable route is NOT flagged (no false positive)',
    !legit.includes('zz-seeded.e2e.ts'),
    legit.split('\n').filter((l) => l.startsWith('  -')).join(' | '),
  )
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}

if (failures > 0) {
  console.error(`vacuous-absence-guard check: ${failures} check(s) failed — the guard is not catching its defect class.`)
  process.exit(1)
}
console.log('vacuous-absence-guard check: all checks passed.')
