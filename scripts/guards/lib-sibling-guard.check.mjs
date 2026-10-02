#!/usr/bin/env node
// Behavior check for lib-sibling-guard.sh — the build-law guard must FIRE on a
// missing sibling test AND on an empty scan, and pass on a clean tree.
//
// WHY THIS EXISTS. `scripts/guards/lib-sibling-guard.sh` passed at `checked=0`:
// when every module in `src/lib` was exempt (or a `*.test.ts`), it printed
// `ok — all 0 non-exempt module(s) have a sibling .test.ts` and exited 0. It
// reported health over a measurement that did not happen — the D-030 class
// sitting inside the guard suite itself, found by slice 8a's round-2 review.
// Each verdict below therefore gets its own seed AND the mutation that flips it,
// because a rule whose check cannot fail is a comment:
//
//   1. a module with no sibling test is a FINDING, named;
//   2. the same module WITH its sibling passes (the rule is not always red);
//   3. a module on the declared EXEMPT list is skipped, not failed;
//   4. a src/lib whose ONLY entry is exempt ⇒ checked=0 ⇒ FINDING (the D-030
//      seed), with the mutation that re-opens it;
//   5. a MISSING src/lib ⇒ FINDING (the other empty-scan path).
//
// Usage: node scripts/guards/lib-sibling-guard.check.mjs
// Exit:  0 = every check ran and passed, 1 = at least one is not doing its job

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'

const GUARD = join(import.meta.dirname, 'lib-sibling-guard.sh')
const SCRATCH = []

function rootWith(files) {
  const root = mkdtempSync(join(os.tmpdir(), 'lib-sibling-'))
  SCRATCH.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const path = join(root, rel)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  return root
}

function run(root, guard = GUARD) {
  try {
    return { exit: 0, out: execFileSync('bash', [guard, root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  } catch (e) {
    return { exit: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

/** A throwaway copy of the guard with one textual mutation applied. The anchor
 * must occur exactly once: a rename that outlives this check throws instead of
 * becoming a silent no-op that makes every mutation check pass vacuously. */
function mutatedGuard(from, to) {
  const text = readFileSync(GUARD, 'utf8')
  const hits = text.split(from).length - 1
  if (hits !== 1) throw new Error(`mutation anchor occurs ${hits} time(s), not once: ${JSON.stringify(from)}`)
  const dir = mkdtempSync(join(os.tmpdir(), 'lib-sibling-mutant-'))
  SCRATCH.push(dir)
  const path = join(dir, 'lib-sibling-guard.sh')
  writeFileSync(path, text.split(from).join(to))
  return path
}

let failures = 0
let ran = 0
const check = (name, ok, detail = '') => {
  ran += 1
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('lib-sibling-guard (behavior)')
console.log('===========================================================')

// 1. The rule the guard exists for.
const orphanRoot = rootWith({ 'src/lib/orphan.ts': 'export const x = 1\n' })
const orphan = run(orphanRoot)
check('a module with no sibling test is CAUGHT and named', orphan.exit === 1 && /MISSING: src\/lib\/orphan\.ts/.test(orphan.out), `exit ${orphan.exit}`)

const noMissing = mutatedGuard('if [ ! -f "$LIB_DIR/$base.test.ts" ]; then', 'if [ "x" = "y" ]; then')
const orphanMiss = run(orphanRoot, noMissing)
check('MUTATION: dropping the missing-sibling test lets that seed PASS (so check 1 can fail)', orphanMiss.exit === 0, `exit ${orphanMiss.exit}`)

// 2. Control.
const clean = run(rootWith({ 'src/lib/ok.ts': 'export const x = 1\n', 'src/lib/ok.test.ts': 'test("x", () => {})\n' }))
check('control: a module WITH its sibling passes and the run says what it read', clean.exit === 0 && /all 1 non-exempt module\(s\)/.test(clean.out), `exit ${clean.exit}`)

// 3. The declared exemption is honored, not failed on.
const exempt = run(rootWith({ 'src/lib/types.ts': 'export type T = 1\n' }))
check('a module on the EXEMPT list is skipped, not failed', !/MISSING/.test(exempt.out), `exit ${exempt.exit}`)

// 4. D-030: exempt-only src/lib ⇒ checked=0 ⇒ FINDING, and it must have been 0.
check('the exempt-only root really did examine zero modules (the premise check 4 asserts)', exempt.exit === 1 && /the scan read nothing/.test(exempt.out), `exit ${exempt.exit}`)

const noZeroCheck = mutatedGuard('elif [ "$checked" -eq 0 ]; then', 'elif [ "x" = "y" ]; then')
const exemptMiss = run(rootWith({ 'src/lib/types.ts': 'export type T = 1\n' }), noZeroCheck)
check('MUTATION: dropping the empty-scan test lets that seed PASS (so check 4 can fail)', exemptMiss.exit === 0, `exit ${exemptMiss.exit}`)

// 5. The other empty-scan path.
const noLib = run(rootWith({ 'src/App.tsx': 'export const a = 1\n' }))
check('a MISSING src/lib is a FINDING, not a SKIP', noLib.exit === 1 && /does not exist/.test(noLib.out), `exit ${noLib.exit}`)

for (const dir of SCRATCH) rmSync(dir, { recursive: true, force: true })

console.log()
if (failures === 0) {
  console.log(`PASS — all ${ran} checks: the guard fires on both defects and only on them.`)
  process.exit(0)
}
console.log(`FAIL — ${failures} of ${ran} checks failed.`)
process.exit(1)
