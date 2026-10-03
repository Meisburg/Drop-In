#!/usr/bin/env node
// Behavior check for lib-sibling-guard.sh — the build-law guard must FIRE on a
// missing sibling test AND on an empty scan, and pass on a clean tree.
//
// WHY THIS EXISTS. `scripts/guards/lib-sibling-guard.sh` passed at `checked=0`:
// when every module in `src/lib` was exempt (or a `*.test.ts`), it printed
// `ok — all 0 non-exempt module(s) have a sibling .test.ts` and exited 0. It
// reported health over a measurement that did not happen — the D-030 class
// sitting inside the guard suite itself, found by slice 8a's round-2 review.
// A check that cannot fail is a comment, so every verdict below carries a seed,
// and every verdict that asserts a FAILURE also carries the mutation that MOVES
// ITS EXIT CODE — not one that merely changes the message (that distinction is
// what let three mutation checks elsewhere in this suite ship blind):
//
//   1. a module with no sibling test is a FINDING, named          (seed + mutation);
//   2. the same module WITH its sibling passes                     (control);
//   3. a module on the declared EXEMPT list is skipped, not failed  (control);
//   4. a src/lib whose ONLY entry is exempt ⇒ checked=0 ⇒ FINDING   (seed + mutation);
//   5. a MISSING src/lib ⇒ FINDING naming the missing directory     (seed + mutation);
//   6. the REACH matches the NAME: `src/lib/*.mjs` and `scripts/lib/*.mjs`
//      are each scanned, and dropping either scan lets its orphan escape
//      (slice 8b — the guard read `src/lib/*.ts` alone, so a `lib/` module one
//      directory over was invisible)                                     (2 seeds + 2 mutations);
//   7. the D-030 empty-scan tripwire is PER SCAN SET (slice 8b close-out): a
//      populated `scripts/lib` no longer masks an empty `src/lib`, and a
//      `scripts/lib` holding only exempt modules is its own finding
//                                                                         (2 seeds + 2 mutations).
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

/** The same, with several replacements applied to one copy. Each anchor must
 * still occur exactly once, so a rename throws rather than turning into a silent
 * no-op. */
function mutatedGuard2(replacements) {
  let text = readFileSync(GUARD, 'utf8')
  for (const [from, to] of replacements) {
    const hits = text.split(from).length - 1
    if (hits !== 1) throw new Error(`mutation anchor occurs ${hits} time(s), not once: ${JSON.stringify(from)}`)
    text = text.split(from).join(to)
  }
  const dir = mkdtempSync(join(os.tmpdir(), 'lib-sibling-mutant-'))
  SCRATCH.push(dir)
  const path = join(dir, 'lib-sibling-guard.sh')
  writeFileSync(path, text)
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

const noMissing = mutatedGuard('if [ ! -f "$dir/$base$sibling" ]; then', 'if [ "x" = "y" ]; then')
const orphanMiss = run(orphanRoot, noMissing)
check('MUTATION: dropping the missing-sibling test lets that seed PASS (so check 1 can fail)', orphanMiss.exit === 0, `exit ${orphanMiss.exit}`)

// 2. Control.
const clean = run(rootWith({ 'src/lib/ok.ts': 'export const x = 1\n', 'src/lib/ok.test.ts': 'test("x", () => {})\n' }))
check('control: a module WITH its sibling passes and the run says what it read', clean.exit === 0 && /all 1 non-exempt module\(s\)/.test(clean.out), `exit ${clean.exit}`)

// 3. The declared exemption is honored, not failed on.
const exempt = run(rootWith({ 'src/lib/types.ts': 'export type T = 1\n' }))
check('a module on the EXEMPT list is skipped, not failed', !/MISSING/.test(exempt.out), `exit ${exempt.exit}`)

// 4. D-030: exempt-only src/lib ⇒ checked=0 ⇒ FINDING, and it must have been 0.
check('the exempt-only root really did examine zero src/lib modules (the premise check 4 asserts)', exempt.exit === 1 && /holds no non-exempt module/.test(exempt.out), `exit ${exempt.exit}`)

const noZeroCheck = mutatedGuard('if [ "$checked" -eq 0 ]; then', 'if [ "x" = "y" ]; then')
const exemptMiss = run(rootWith({ 'src/lib/types.ts': 'export type T = 1\n' }), noZeroCheck)
check('MUTATION: dropping the empty-scan test lets that seed PASS (so check 4 can fail)', exemptMiss.exit === 0, `exit ${exemptMiss.exit}`)

// 5. The other empty-scan path.
const noLibRoot = rootWith({ 'src/App.tsx': 'export const a = 1\n' })
const noLib = run(noLibRoot)
check('a MISSING src/lib is a FINDING, not a SKIP', noLib.exit === 1 && /does not exist/.test(noLib.out), `exit ${noLib.exit}`)

// The mutation removes BOTH zero-checks, because either one alone keeps this seed
// red (the missing-directory branch exits 1 by itself, and the checked=0 branch
// would fire after it). A mutant that stayed red would prove nothing — the seed's
// exit code must move for the check to be load-bearing.
const noZeroPaths = mutatedGuard2([
  ['if [ ! -d "$LIB_DIR" ]; then', 'if [ "x" = "y" ]; then'],
  ['if [ "$checked" -eq 0 ]; then', 'if [ "x" = "y" ]; then'],
])
const noLibMiss = run(noLibRoot, noZeroPaths)
check('MUTATION: dropping BOTH zero-checks lets that seed PASS (exit 1 -> 0, a DETECTION flip)', noLibMiss.exit === 0, `exit ${noLibMiss.exit}`)

// 6. THE REACH MATCHES THE NAME (slice 8b). A `lib/` module one directory over,
// or with the other extension, is a module the rule named and the guard did not
// read. Each new scan set carries its own seed and its own exit-moving mutation,
// so a future edit that narrowed the reach back would move a verdict, not a
// message. The seeds carry a passing src/lib/*.ts pair so that the D-030
// checked=0 path is NOT what fires: what fires is the MISSING sibling.
const mjsRoot = rootWith({
  'src/lib/ok.ts': 'export const x = 1\n',
  'src/lib/ok.test.ts': 'test("x", () => {})\n',
  'src/lib/plain.mjs': 'export const x = 1\n',
})
const mjsOrphan = run(mjsRoot)
check('a src/lib/*.mjs module with no sibling test is CAUGHT and named', mjsOrphan.exit === 1 && /MISSING: src\/lib\/plain\.mjs/.test(mjsOrphan.out), `exit ${mjsOrphan.exit}`)

const noSrcMjs = mutatedGuard('scan_set "$LIB_DIR" ".mjs" ".test.ts"', ': # the src/lib .mjs scan is dropped by this mutation')
const mjsMiss = run(mjsRoot, noSrcMjs)
check('MUTATION: dropping the src/lib/*.mjs scan lets that seed PASS (exit 1 -> 0, a DETECTION flip)', mjsMiss.exit === 0, `exit ${mjsMiss.exit}`)

const scriptLibRoot = rootWith({
  'src/lib/ok.ts': 'export const x = 1\n',
  'src/lib/ok.test.ts': 'test("x", () => {})\n',
  'scripts/lib/orphan.mjs': 'export const x = 1\n',
})
const scriptLibOrphan = run(scriptLibRoot)
check('a scripts/lib/*.mjs module with no sibling check is CAUGHT and named', scriptLibOrphan.exit === 1 && /MISSING: scripts\/lib\/orphan\.mjs has no scripts\/lib\/orphan\.check\.mjs/.test(scriptLibOrphan.out), `exit ${scriptLibOrphan.exit}`)

const noScriptLib = mutatedGuard2([
  ['scan_set "$SCRIPTS_LIB_DIR" ".mjs" ".check.mjs"', ': # the scripts/lib scan is dropped by this mutation'],
  ['if [ -d "$SCRIPTS_LIB_DIR" ] && [ "$checked_scripts" -eq 0 ]; then', 'if [ "x" = "y" ]; then'],
])
const scriptLibMiss = run(scriptLibRoot, noScriptLib)
check('MUTATION: dropping the scripts/lib scan AND its own empty-set check lets that seed PASS (exit 1 -> 0, a DETECTION flip)', scriptLibMiss.exit === 0, `exit ${scriptLibMiss.exit}`)

// 7. Control: the scripts/lib convention (a sibling .check.mjs, not a .test.ts)
// is honored, so the new reach is not simply always red.
const scriptLibClean = run(rootWith({
  'src/lib/ok.ts': 'export const x = 1\n',
  'src/lib/ok.test.ts': 'test("x", () => {})\n',
  'scripts/lib/ok.mjs': 'export const x = 1\n',
  'scripts/lib/ok.check.mjs': 'console.log("ok")\n',
}))
check('control: a scripts/lib module WITH its .check.mjs sibling passes', scriptLibClean.exit === 0 && /all 2 non-exempt module\(s\)/.test(scriptLibClean.out), `exit ${scriptLibClean.exit}`)

// 8. D-030 IS PER SCAN SET (slice 8b close-out). The widening made `checked` the
// UNION of the scan sets, so a hollow src/lib beside a populated scripts/lib
// passed silently (`ok — all 1 non-exempt`, exit 0). Each set now carries its own
// count, so neither can mask the other. Both arms are seeded, with the mutation
// that removes that set's own check.
const maskedRoot = rootWith({
  'src/lib/types.ts': 'export type T = 1\n',
  'scripts/lib/keep.mjs': 'export const x = 1\n',
  'scripts/lib/keep.check.mjs': 'console.log("ok")\n',
})
const masked = run(maskedRoot)
check('a hollow src/lib beside a populated scripts/lib is CAUGHT (the count is per set, not the union)', masked.exit === 1 && /src\/lib holds no non-exempt module/.test(masked.out), `exit ${masked.exit}`)

const noLibSet = mutatedGuard('if [ "$checked" -eq 0 ]; then', 'if [ "x" = "y" ]; then')
const maskedMiss = run(maskedRoot, noLibSet)
check('MUTATION: dropping the src/lib set check lets that seed PASS (exit 1 -> 0, a DETECTION flip)', maskedMiss.exit === 0, `exit ${maskedMiss.exit}`)

// The other arm: a scripts/lib that holds only exempt modules read nothing.
const emptyScriptsRoot = rootWith({
  'src/lib/ok.ts': 'export const x = 1\n',
  'src/lib/ok.test.ts': 'test("x", () => {})\n',
  'scripts/lib/fence-scanner.mjs': 'export const y = 2\n', // on the EXEMPT list
})
const emptyScripts = run(emptyScriptsRoot)
check('a scripts/lib whose only module is exempt is a FINDING for that set (D-030, per set)', emptyScripts.exit === 1 && /scripts\/lib holds no non-exempt module/.test(emptyScripts.out), `exit ${emptyScripts.exit}`)

const noScriptsSet = mutatedGuard('if [ -d "$SCRIPTS_LIB_DIR" ] && [ "$checked_scripts" -eq 0 ]; then', 'if [ "x" = "y" ]; then')
const emptyScriptsMiss = run(emptyScriptsRoot, noScriptsSet)
check('MUTATION: dropping the scripts/lib set check lets that seed PASS (exit 1 -> 0, a DETECTION flip)', emptyScriptsMiss.exit === 0, `exit ${emptyScriptsMiss.exit}`)

for (const dir of SCRATCH) rmSync(dir, { recursive: true, force: true })

console.log()
if (failures === 0) {
  console.log(`PASS — all ${ran} checks: the guard fires on every seeded defect and only on them.`)
  process.exit(0)
}
console.log(`FAIL — ${failures} of ${ran} checks failed.`)
process.exit(1)
