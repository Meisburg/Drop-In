#!/usr/bin/env node
// Behavior check for trailing-newline-guard.mjs — the guard must FIRE on the
// real defect shape and only on it.
//
// WHY THIS EXISTS. A guard that matches nothing looks exactly like a clean
// repository. So for each property the guard claims, build the failing world in
// a throwaway git root, run the guard against it, and require a non-zero exit
// naming that property. A rule whose check cannot fail is a comment. The two
// D-030 properties this guard carries get their own seeds and their own
// mutation, because "the scan read nothing" and "this file has no newline" are
// different failures that must not be able to hide behind each other:
//
//   1. a text file with no newline at EOF is a FINDING, named;
//   2. a clean text file passes (so the rule is not simply always red);
//   3. a zero-byte file and a NUL-bearing binary are COUNTED, not read as text
//      and not failed on (they cannot corrupt the sweep, and the guard says so);
//   4. an EMPTY scan (no src/e2e/scripts content at all) is a FINDING — D-030,
//      an empty measurement is not health;
//   5. the guard reads UNTRACKED files too, so a file is checked before it can
//      be committed.
//
// The mutations prove each verdict CAN flip: neuter the last-byte test and the
// seed passes (so check 1 can fail); neuter the empty-scan test and that seed
// passes (so check 4 can fail).
//
// Usage: node scripts/guards/trailing-newline-guard.check.mjs
// Exit:  0 = every check ran and passed, 1 = at least one is not doing its job

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'

const GUARD = join(import.meta.dirname, 'trailing-newline-guard.mjs')
const SCRATCH = []

function rootWith(files) {
  const root = mkdtempSync(join(os.tmpdir(), 'trailing-newline-'))
  SCRATCH.push(root)
  execFileSync('git', ['init', '-q'], { cwd: root })
  for (const [rel, content] of Object.entries(files)) {
    const path = join(root, rel)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  return root
}

function run(root, guard = GUARD) {
  try {
    return { exit: 0, out: execFileSync('node', [guard, root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  } catch (e) {
    return { exit: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

/** A throwaway copy of the guard with one textual mutation applied. The anchor
 * must occur exactly once, so a rename that outlives this check throws instead
 * of turning into a silent no-op that makes every mutation check pass. */
function mutatedGuard(from, to) {
  const text = readFileSync(GUARD, 'utf8')
  const hits = text.split(from).length - 1
  if (hits !== 1) throw new Error(`mutation anchor occurs ${hits} time(s), not once: ${JSON.stringify(from)}`)
  const path = join(mkdtempSync(join(os.tmpdir(), 'trailing-newline-mutant-')), 'guard.mjs')
  SCRATCH.push(dirname(path))
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

console.log('trailing-newline-guard (behavior)')
console.log('===========================================================')

// 1. The real defect shape: content, no newline at EOF.
const badRoot = rootWith({ 'src/lib/a.ts': 'export const a = 1' })
const bad = run(badRoot)
check('a text file with no newline at EOF is CAUGHT and named', bad.exit === 1 && /src\/lib\/a\.ts/.test(bad.out), `exit ${bad.exit}`)

const neutered = mutatedGuard('if (buf[buf.length - 1] !== 0x0a) {', 'if (false) {')
const badMiss = run(badRoot, neutered)
check('MUTATION: dropping the last-byte test lets that seed PASS (so check 1 can fail)', badMiss.exit === 0, `exit ${badMiss.exit}`)

// 2. Control: a clean file passes, so the rule is not a fence detector.
const clean = run(rootWith({ 'src/lib/a.ts': 'export const a = 1\n' }))
check('control: a text file WITH its newline passes', clean.exit === 0 && /1 text file\(s\) read/.test(clean.out), `exit ${clean.exit}`)

// 3. Zero-byte and binary files are counted, not read as text, and not failed.
const mixed = rootWith({
  'src/lib/a.ts': 'export const a = 1\n',
  'scripts/empty.sh': '',
  'e2e/blob.bin': Buffer.from([0x00, 0x01, 0xff, 0x00]),
})
const mixedRun = run(mixed)
check(
  'control: an empty file and a binary file are counted, not read as text and not failed',
  mixedRun.exit === 0 && /1 text file\(s\) read, 1 empty .* 1 binary/.test(mixedRun.out),
  `exit ${mixedRun.exit} :: ${mixedRun.out.split('\n').filter((l) => /text file/.test(l)).join(' | ')}`,
)

// 4. D-030 — an empty scan is a finding, never a pass.
const emptyRoot = rootWith({})
const empty = run(emptyRoot)
check('an EMPTY scan is a FINDING (D-030: zero is not health)', empty.exit === 1 && /read no text file at all/.test(empty.out), `exit ${empty.exit}`)

const noZeroCheck = mutatedGuard('if (text === 0) {', 'if (false) {')
const emptyMiss = run(emptyRoot, noZeroCheck)
check('MUTATION: dropping the empty-scan test lets that seed PASS (so check 4 can fail)', emptyMiss.exit === 0, `exit ${emptyMiss.exit}`)

// 5. The scan set is git's own view including UNTRACKED files — the sweep has to
// see a file before it is committed, or the class returns through the gap
// between "written" and "staged".
const untracked = rootWith({ 'src/new/thing.ts': 'export const b = 2\n' })
const untrackedRun = run(untracked)
check('an UNTRACKED text file is read (git --others, not just the index)', untrackedRun.exit === 0 && /1 text file\(s\) read/.test(untrackedRun.out), `exit ${untrackedRun.exit}`)

// 6. Only src/ e2e/ scripts/ are read: a root-level file without a newline is
// out of the scan set, which is the boundary the header states.
const outOfScope = run(rootWith({ 'README.md': 'no newline here', 'src/lib/a.ts': 'x\n' }))
check('control: a file OUTSIDE the scan set does not fire the rule', outOfScope.exit === 0, `exit ${outOfScope.exit}`)

for (const dir of SCRATCH) rmSync(dir, { recursive: true, force: true })

console.log()
if (failures === 0) {
  console.log(`PASS — all ${ran} checks: the guard fires on the defect and only on it.`)
  process.exit(0)
}
console.log(`FAIL — ${failures} of ${ran} checks failed.`)
process.exit(1)
