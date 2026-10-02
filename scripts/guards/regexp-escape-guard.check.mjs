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
 *   4. PREMISE, its own named check: the `.scratch` seed of case 5 is genuinely
 *      TRACKED. The guard never consults git, so tracked-ness cannot move the
 *      guard's verdict — it is the premise of the header's "23 tracked `.mjs`
 *      are uncounted" sentence, and it is asserted as itself. The git step is
 *      wrapped: a missing git, a `dubious ownership` refusal, or a failed
 *      `git add` is a NAMED failing check, never an exception that takes cases
 *      5-12 and the summary down with it;
 *   5. a copy in `.scratch` is UNCOUNTED — the boundary SCOPE states in the
 *      header, pinned so the sentence and the skip cannot drift apart again.
 *      Asserts only what the guard establishes: exit 0, seed unnamed;
 *   6. a generated `.vitest` cache file holding the literal does NOT fail the
 *      lane — it did before fix round 1, and a guard that fires on a cache file
 *      is a guard people route around;
 *   7. the same, NOT at the sandbox root (`src/deep/.vitest/`) — this pins the
 *      "at any depth" half of the header, which case 6 cannot: a root-anchored
 *      skip keeps case 6 green and fails this one;
 *   8. a copy in a DECLARATION file (`zz.d.mts`) is CAUGHT — `.mts` is scanned,
 *      not silently outside the stated extension list;
 *   9. the same for `.d.cts` — the header names `.cts` too, and a stated
 *      extension nobody seeds is a stated extension that can vanish;
 *  10. a ZERO count FAILS — delete the implementation and the guard refuses,
 *      instead of reporting a clean tree it cannot actually see;
 *  11. ONE copy in the WRONG file FAILS — the count alone is not the rule; the
 *      location is.
 *
 * Run: node scripts/guards/regexp-escape-guard.check.mjs
 * Exit 0 = check passes, 1 = the guard is not doing its job.
 *
 * The number in the summary line is COUNTED at run time (`ran`), not typed. A
 * hand-typed total here went stale in fix round 1 ("all 9 checks passed" out of
 * a script that had grown), so the script no longer states a count it did not
 * produce. The numbered list above is the map; the printed line is the fact.
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
let ran = 0
const check = (name, ok, detail = '') => {
  ran += 1
  if (ok) {
    console.log(`  ✓ ${name}`)
  } else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// One seeded case = create the parent dir, write the seed, run, check, remove.
// Five of these were five near-identical blocks before fix round 2, and the
// repetition is where drift crept in: one of them relied on `src/lib` already
// existing, and "the seed is removed before the next case" was a habit rather
// than a property. `expectNamed` is the direction of the assertion — true for
// a copy that must be CAUGHT, false for a path that must be skipped.
const seedCase = (title, rel, seedName, expectExit, expectNamed, extra) => {
  const full = path.join(sandbox, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, seedBody(seedName))
  const result = run()
  const found = result.out.includes(path.basename(rel))
  const ok = result.exit === expectExit && found === expectNamed && (extra ? extra(result) : true)
  check(title, ok, `exit ${result.exit}, seed named in output: ${found}`)
  rmSync(full)
  return result
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
  seedCase('a sixth copy in e2e/ is CAUGHT and named', 'e2e/zz-seeded.e2e.ts', 'escapeE2e', 1, true)

  // 3. Sixth copy in scripts/ — the tree the .mjs guards live in.
  seedCase('a sixth copy in scripts/ is CAUGHT (the guard scripts are covered too)', 'scripts/zz-seeded.mjs', 'escapeScript', 1, true)

  // 4. PREMISE ONLY, as its own named check. G1a was that the header called
  //    `.scratch` "gitignored harness state" while tracked `.mjs` files live in
  //    it, so case 5's seed has to be genuinely tracked for its sentence to mean
  //    anything. But the guard skips by directory NAME and never consults git
  //    (`walk()` is a readdirSync recursion gated by SKIP_DIRS name matching),
  //    so tracked-ness cannot move the guard's verdict — an untracked seed in a
  //    skipped directory is equally uncounted. Therefore: premise here, mechanism
  //    in case 5, and the git calls wrapped so an environment failure is a
  //    named red check rather than an exception that ends the run. The
  //    assertion is EXACT EQUALITY on `git ls-files` stdout, not `endsWith`: the
  //    first version of this line used endsWith and passed on its own failure
  //    message, which ends with the command string, which ends with the path.
  const scratchSeed = path.join(sandbox, '.scratch', 'zz-probe.mjs')
  mkdirSync(path.dirname(scratchSeed), { recursive: true })
  writeFileSync(scratchSeed, seedBody('escapeScratch'))
  let premise = { tracked: false, note: '' }
  try {
    execSync('git init -q && git add -f .scratch/zz-probe.mjs', { cwd: sandbox, stdio: 'pipe' })
    const listed = execSync('git ls-files .scratch/zz-probe.mjs', { cwd: sandbox, encoding: 'utf8' }).trim()
    premise = { tracked: listed === '.scratch/zz-probe.mjs', note: `git ls-files -> "${listed}"` }
  } catch (e) {
    premise = { tracked: false, note: `git step failed: ${String(e && e.message ? e.message : e).split('\n')[0]}` }
  }
  check(
    'PREMISE: the .scratch seed is TRACKED — the state the header\u2019s uncounted-hole sentence describes (not a verdict about the guard)',
    premise.tracked,
    `${premise.note || 'no output'} \u2014 case 5 still runs either way, because the guard never consults git`,
  )

  // 5. The mechanism itself: `.scratch` is skipped WHOLE, by directory name.
  //    Asserts only what this instrument establishes — exit 0, seed unnamed.
  result = run()
  check(
    'a .scratch copy is UNCOUNTED — the skip is by directory name, as SCOPE states',
    result.exit === 0 && !result.out.includes('zz-probe'),
    `exit ${result.exit}`,
  )
  rmSync(scratchSeed)

  // 6. A generated cache file is not a sixth copy: `.vitest` is skipped (this
  //    seed returned exit 1 before fix round 1 — measured, see that report).
  seedCase('a generated .vitest cache file holding the literal does NOT fail the lane', '.vitest/cache.mjs', 'escapeCache', 0, false)

  // 7. The "at any depth" half of the header, pinned. Cases 5 and 6 seed at the
  //    sandbox root, so an implementation that anchored the skip to the root
  //    (comparing path.join(ROOT, name), or filtering only at depth 1) keeps
  //    them green while the header sentence goes false. This one does not.
  seedCase('a NESTED .vitest (src/deep/.vitest/) is skipped too — the skip matches a directory NAME at ANY depth', 'src/deep/.vitest/nested-cache.mjs', 'escapeNestedCache', 0, false)

  // 8. A declaration file is source too — `.d.mts` ends in `.mts`, which the
  //    extension list names.
  seedCase('a copy in a DECLARATION file (.d.mts) is CAUGHT — .mts is in the extension list', 'src/lib/zz-seeded.d.mts', 'escapeDeclared', 1, true)

  // 9. The header names `.cts` as well, and a stated extension nobody seeds is
  //    an extension a later edit can drop without anything noticing.
  seedCase('a copy in a DECLARATION file (.d.cts) is CAUGHT — .cts is in the extension list, not stated-but-unpinned', 'src/lib/zz-seeded.d.cts', 'escapeDeclaredCts', 1, true)

  // 10. Zero count: the blind case must FAIL, not pass.
  const impl = path.join(sandbox, implementation)
  rmSync(impl)
  result = run()
  check(
    'a ZERO count FAILS — an instrument that matched nothing is not a pass',
    result.exit === 1 && result.out.includes('MISSING'),
    `exit ${result.exit}`,
  )

  // 11. One copy, but not the sanctioned file. The `extra` hook is the part
  //     seedCase cannot know: no PASS line may be printed at all.
  seedCase(
    'one copy in the WRONG file FAILS — the count is not the whole rule',
    'e2e/zz-only.e2e.ts',
    'escapeOnly',
    1,
    true,
    (r) => !r.out.includes('PASS'),
  )

  // Restore and confirm the sandbox is green again.
  copyFileSync(path.join(root, implementation), impl)
  result = run()
  check('restored sandbox passes again', result.exit === 0, `exit ${result.exit}`)
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}

console.log()
if (failures === 0) {
  console.log(`regexp-escape-guard check: all ${ran} checks passed.`)
  process.exit(0)
}
console.error(`regexp-escape-guard check: ${failures} check(s) failed — the guard is not doing its job.`)
process.exit(1)
