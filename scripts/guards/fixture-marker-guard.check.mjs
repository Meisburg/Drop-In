#!/usr/bin/env node
/**
 * Tests for the fixture-marker guard.
 *
 * WHY A TEST FOR A GUARD EXISTS AT ALL. The failure mode of a guard is not
 * "it crashed" — it is "it passed". A regex-driven checker that silently
 * stopped matching would look exactly like a clean repo, and the leak it exists
 * to prevent would ship while `npm run verify` stayed green. So this proves the
 * guard FIRES on the real defect class, by seeding that defect into a throwaway
 * copy and requiring a non-zero exit.
 *
 * The three seeded defects are the three ways the audit's production leak could
 * happen again:
 *   1. an account outside the sweep's `e2e-%` scope,
 *   2. a fixture drop-in titled like a real parent's post,
 *   3. a DELETE broad enough to reach a row the spec did not create.
 *
 * Usage:  node scripts/guards/fixture-marker-guard.check.mjs
 * Exit:   0 = the guard behaves, 1 = it does not
 *
 * The `.check.mjs` suffix is deliberate: it is NOT a vitest suite, it is a
 * standalone checker the guards gate runs. Naming it `*.test.mjs` would put it
 * in `vitest run`'s discovery, where a top-level `process.exit()` kills the
 * runner — and "a test file with no tests" is a broken test file, not a test.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = process.cwd()
const GUARD = path.join(ROOT, 'scripts', 'guards', 'fixture-marker-guard.mjs')

const failures = []

function runGuard(cwd) {
  const result = spawnSync(process.execPath, [GUARD], { cwd, encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/** A throwaway copy of the repo pieces the guard reads. */
function sandbox() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fixture-marker-guard-'))
  cpSync(path.join(ROOT, 'e2e'), path.join(dir, 'e2e'), { recursive: true })
  cpSync(path.join(ROOT, 'scripts'), path.join(dir, 'scripts'), { recursive: true })
  cpSync(path.join(ROOT, 'docs'), path.join(dir, 'docs'), { recursive: true })
  return dir
}

function withSandbox(fn) {
  const dir = sandbox()
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Append a spec file into the sandbox's e2e/ directory. */
function seedSpec(dir, name, source) {
  const file = path.join(dir, 'e2e', name)
  writeFileSync(file, source)
  return file
}

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok — ${label}`)
  } else {
    console.log(`  FAIL — ${label}`)
    if (detail !== undefined) console.log(detail.split('\n').slice(0, 12).join('\n'))
    failures.push(label)
  }
}

console.log('Fixture-marker guard — behavior test')
console.log('===========================================================')

// 1. The real repo passes. A guard that fails on its own repo is a guard nobody
//    can wire into the gate.
{
  const { status, stdout } = runGuard(ROOT)
  check('the guard passes on this repo', status === 0, stdout)
}

// 2. An account outside the sweep's scope is caught.
withSandbox((dir) => {
  seedSpec(
    dir,
    'seeded-plain-account.e2e.ts',
    [
      "import { test } from '@playwright/test'",
      "import { signUpViewer } from './fixtures'",
      '',
      "test('seeded', async ({ page }) => {",
      "  await signUpViewer(page, { name: 'Real Parent', email: 'parent@example.com', password: 'x' })",
      '})',
      '',
    ].join('\n'),
  )
  const { status, stdout } = runGuard(dir)
  check('an unmarked account address is a finding', status !== 0, stdout)
  check('the finding names the address', stdout.includes('parent@example.com'), stdout)
})

// 3. A realistic fixture title is caught.
withSandbox((dir) => {
  seedSpec(
    dir,
    'seeded-realistic-title.e2e.ts',
    [
      "import { test } from '@playwright/test'",
      "import { postDropIn } from './fixtures'",
      '',
      "test('seeded', async ({ page }) => {",
      "  await postDropIn(page, { title: 'Green Lake playground playdate', kidLabels: [] })",
      '})',
      '',
    ].join('\n'),
  )
  const { status, stdout } = runGuard(dir)
  check('an unmarked fixture title is a finding', status !== 0, stdout)
  check('the finding names the title', stdout.includes('Green Lake playground'), stdout)
})

// 4. A broad DELETE is caught.
withSandbox((dir) => {
  seedSpec(
    dir,
    'seeded-broad-delete.e2e.ts',
    [
      "import { test } from '@playwright/test'",
      '',
      "test('seeded', async ({ page }) => {",
      '  const url = `https://example.test/rest/v1/playdates?title=like.*cleanup*`',
      "  await fetch(url, { method: 'DELETE' })",
      '})',
      '',
    ].join('\n'),
  )
  const { status, stdout } = runGuard(dir)
  check('a broad DELETE filter is a finding', status !== 0, stdout)
  check('the finding names the filter', stdout.includes('title=like'), stdout)
})

// 5. The guard does NOT cry wolf about a display value that merely shares a
//    parameter name with an account local-part. `name` is a kid's first name in
//    one helper and the local part of a viewer's address in another; a guard
//    that cannot tell those apart gets deleted, not fixed.
withSandbox((dir) => {
  seedSpec(
    dir,
    'seeded-display-name.e2e.ts',
    [
      "import { test } from '@playwright/test'",
      '',
      'async function createMarkerKid(e: Env, name: string) {',
      "  await fetch(`${e.url}/rest/v1/kids`, {",
      "    method: 'POST',",
      "    body: JSON.stringify({ profile_id: e.markerUserId, first_name: name }),",
      '  })',
      '}',
      '',
      'async function signUpStranger(browser: Browser, name: string) {',
      "  return `${name}@gmail.com`",
      '}',
      '',
      "test('seeded', async () => {",
      "  await createMarkerKid(e, `E2E Photo ${epoch}`)",
      "  await signUpStranger(browser, `e2e-v-photo-${epoch}`)",
      '})',
      '',
    ].join('\n'),
  )
  const { status, stdout } = runGuard(dir)
  check('a display-only parameter does not produce a finding', status === 0, stdout)
})

// 6. The guard is bound to the convention document: removing the doc must fail
//    rather than quietly leaving the rule undocumented.
withSandbox((dir) => {
  rmSync(path.join(dir, 'docs', 'agents', 'e2e-fixture-convention.md'), { force: true })
  const { status, stdout } = runGuard(dir)
  check('a missing convention document is a finding', status !== 0, stdout)
})

// 6. The guard is bound to the sweep: narrowing the marker must fail.
withSandbox((dir) => {
  const sweepPath = path.join(dir, 'scripts', 'sweep-e2e-markers.mjs')
  // EVERY occurrence, not just the first: the sweep states the marker a dozen
  // times (the count query, the safety gate, the deletes), and the point of this
  // check is that the guard reads the sweep's actual scope.
  const sweep = readFileSync(sweepPath, 'utf8').replaceAll("like 'e2e-%'", "like 'zzz-%'")
  writeFileSync(sweepPath, sweep)
  check(
    'the seeded sandbox really does narrow the sweep',
    !readFileSync(sweepPath, 'utf8').includes("like 'e2e-%'"),
  )
  const { status, stdout } = runGuard(dir)
  check('a sweep that stopped matching the marker is a finding', status !== 0, stdout)
})

console.log()
if (failures.length === 0) {
  console.log('PASS — the guard fires on every seeded defect and passes a clean repo.')
  process.exit(0)
}
console.log(`FAIL — ${failures.length} check(s) did not behave:`)
for (const f of failures) console.log(`  - ${f}`)
process.exit(1)
