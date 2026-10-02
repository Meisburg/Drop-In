#!/usr/bin/env node
/**
 * Self-check for the regexp-escape guard (V28 slice 6c).
 *
 * A checker that matches nothing looks exactly like a clean repo, so the
 * guard's own behavior is proven here rather than asserted. Seeds run in a
 * throwaway copy of `src/` + `e2e/` + `scripts/` (the trees the guard walks):
 *
 *   1. the repo as it stands passes, and names the one implementation —
 *      which is also the liveness proof: if the guard's needle were mistyped
 *      it would find zero and case 1 would be red;
 *   2. a sixth copy in `e2e/` is CAUGHT and named;
 *   3. a sixth copy in `scripts/` is CAUGHT — the tree the `.mjs` guards live
 *      in, so "the guards are covered too" is measured, not claimed;
 *   4. a copy in a TRACKED `.scratch` code file is UNCCOUNTED — the boundary
 *      SCOPE states in the header, pinned here so the sentence and the skip
 *      cannot drift apart again (the file is `git add`ed first, so the case
 *      can only pass on a genuinely tracked seed);
 *   5. a generated `.vitest` cache file holding the literal does NOT fail the
 *      lane — it did before this round, and a guard that fires on a cache file
 *      is a guard people route around;
 *   6. a copy in a DECLARATION file (`zz.d.mts`) is CAUGHT — `.mts` is scanned,
 *      not silently outside the stated extension list;
 *   7. a ZERO count FAILS — delete the implementation and the guard refuses,
 *      instead of reporting a clean tree it cannot actually see;
 *   8. ONE copy in the WRONG file FAILS — the count alone is not the rule; the
 *      location is.
 *
 * Run: node scripts/guards/regexp-escape-guard.check.mjs
 * Exit 0 = check passes, 1 = the guard is not doing its job.
 */

import { execSync } from 'node:child_process'
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const root = path.join(import.meta.dirname, '..', '..')
const guard = path.join(root, 'scripts', 'guards', 'regexp-escape-guard.mjs')
const implementation = path.join('src', 'lib', 'escapeForRegExp.mjs')

// Assembled from two pieces so THIS file does not itself contain the literal
// it seeds: it lives under scripts/, which the guard walks.
const ONELINER = '/[.*+?^${}()|[\\]' + '\\\\]/g'
const seedBody = (name) => `export const ${name} = (s) => s.replace(${ONELINER}, '\\\\$&')\n`

const sandbox = mkdtempSync(path.join(os.tmpdir(), 'regexp-escape-check-'))

const run = () => {
  try {
    return {
      exit: 0,
      out: execSync(`node ${JSON.stringify(guard)} ${JSON.stringify(sandbox)}`, {
        encoding: 'utf8',
        stdio: 'pipe',
      }).toString(),
    }
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

try {
  cpSync(path.join(root, 'src'), path.join(sandbox, 'src'), { recursive: true })
  cpSync(path.join(root, 'e2e'), path.join(sandbox, 'e2e'), { recursive: true })
  cpSync(path.join(root, 'scripts'), path.join(sandbox, 'scripts'), { recursive: true })
  // The guard skips itself by ABSOLUTE path; inside the sandbox it is a
  // different path, so the copy is removed here rather than special-cased in
  // the guard. (Not load-bearing today — the guard's own text never contains
  // the literal — but it keeps this check honest if a later edit quotes it.)
  rmSync(path.join(sandbox, 'scripts', 'guards', 'regexp-escape-guard.mjs'))

  // 1. Clean repo: passes AND names the implementation (liveness).
  let result = run()
  check(
    'clean tree passes and names the one implementation',
    result.exit === 0 && result.out.includes(implementation.split(path.sep).join('/')),
    `exit ${result.exit}`,
  )

  // 2. Sixth copy in e2e/.
  const e2eSeed = path.join(sandbox, 'e2e', 'zz-seeded.e2e.ts')
  writeFileSync(e2eSeed, seedBody('escapeE2e'))
  result = run()
  check(
    'a sixth copy in e2e/ is CAUGHT and named',
    result.exit === 1 && result.out.includes('zz-seeded.e2e.ts'),
    `exit ${result.exit}`,
  )
  rmSync(e2eSeed)

  // 3. Sixth copy in scripts/ — the tree the .mjs guards live in.
  const scriptSeed = path.join(sandbox, 'scripts', 'zz-seeded.mjs')
  writeFileSync(scriptSeed, seedBody('escapeScript'))
  result = run()
  check(
    'a sixth copy in scripts/ is CAUGHT (the guard scripts are covered too)',
    result.exit === 1 && result.out.includes('zz-seeded.mjs'),
    `exit ${result.exit}`,
  )
  rmSync(scriptSeed)

  // 4. `.scratch` is skipped WHOLE — the stated boundary, not a silent pass.
  //    The header carries the number (git tracks 262 files there, 23 of them
  //    `.mjs`) and the reason (frozen review-lane snapshots, one of which holds
  //    the one-liner). Git-added here so this case can only pass on a tracked
  //    seed, which is the situation that sentence describes.
  const scratchSeed = path.join(sandbox, '.scratch', 'zz-probe.mjs')
  mkdirSync(path.dirname(scratchSeed), { recursive: true })
  writeFileSync(scratchSeed, seedBody('escapeScratch'))
  execSync('git init -q && git add -f .scratch/zz-probe.mjs', { cwd: sandbox, stdio: 'pipe' })
  const tracked = execSync('git ls-files .scratch/zz-probe.mjs', { cwd: sandbox, encoding: 'utf8' }).trim()
  result = run()
  check(
    'a TRACKED .scratch copy is UNCCOUNTED — the header states the boundary it is not counted under',
    tracked.endsWith('.scratch/zz-probe.mjs') && result.exit === 0 && !result.out.includes('zz-probe'),
    `tracked=${tracked || 'NOT TRACKED'} exit ${result.exit}`,
  )
  rmSync(scratchSeed)

  // 5. A generated cache file is not a sixth copy: `.vitest` is skipped (this
  //    seed returned exit 1 before this round — measured, see the fix report).
  const cacheSeed = path.join(sandbox, '.vitest', 'cache.mjs')
  mkdirSync(path.dirname(cacheSeed), { recursive: true })
  writeFileSync(cacheSeed, seedBody('escapeCache'))
  result = run()
  check(
    'a generated .vitest cache file holding the literal does NOT fail the lane',
    result.exit === 0 && !result.out.includes('cache.mjs'),
    `exit ${result.exit}`,
  )
  rmSync(cacheSeed)

  // 6. A declaration file is source too — `.d.mts` ends in `.mts`, which the
  //    extension list names.
  const declSeed = path.join(sandbox, 'src', 'lib', 'zz-seeded.d.mts')
  writeFileSync(declSeed, seedBody('escapeDeclared'))
  result = run()
  check(
    'a copy in a DECLARATION file (.d.mts) is CAUGHT — .mts is in the extension list',
    result.exit === 1 && result.out.includes('zz-seeded.d.mts'),
    `exit ${result.exit}`,
  )
  rmSync(declSeed)

  // 7. Zero count: the blind case must FAIL, not pass.
  const impl = path.join(sandbox, implementation)
  rmSync(impl)
  result = run()
  check(
    'a ZERO count FAILS — an instrument that matched nothing is not a pass',
    result.exit === 1 && result.out.includes('MISSING'),
    `exit ${result.exit}`,
  )

  // 8. One copy, but not the sanctioned file.
  const loneSeed = path.join(sandbox, 'e2e', 'zz-only.e2e.ts')
  writeFileSync(loneSeed, seedBody('escapeOnly'))
  result = run()
  check(
    'one copy in the WRONG file FAILS — the count is not the whole rule',
    result.exit === 1 && !result.out.includes('PASS'),
    `exit ${result.exit}`,
  )
  rmSync(loneSeed)

  // Restore and confirm the sandbox is green again.
  copyFileSync(path.join(root, implementation), impl)
  result = run()
  check('restored sandbox passes again', result.exit === 0, `exit ${result.exit}`)
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}

console.log()
if (failures === 0) {
  console.log('regexp-escape-guard check: all 9 checks passed.')
  process.exit(0)
}
console.error(`regexp-escape-guard check: ${failures} check(s) failed — the guard is not doing its job.`)
process.exit(1)
