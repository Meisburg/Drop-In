#!/usr/bin/env node
/**
 * Self-check for no-bypass-guard — and the PROOF of its stated blind spot.
 *
 * WHY THIS FILE EXISTS. A verifier lane found that the guard's HISTORY grep
 * cannot see the ordinary bypass: the reflog records the action text git writes
 * (`commit: <subject>`), never the command line, so `git commit --no-verify`
 * leaves the subject in the log and the flag nowhere. The guard therefore
 * reports PASS on a repo where a bypass happened, and its PASS is not by itself
 * evidence about the flag. The guard's header and its run output now say that in
 * writing; this checker is what makes the statement checkable instead of a
 * claim — quoting `run-all.sh`: *"a checker that matches nothing looks exactly
 * like a clean repo."*
 *
 * It builds REAL temporary repositories rather than simulating git, because the
 * question is what git actually records. Four cases:
 *
 *   1. THE BLIND SPOT, PROVEN. A real repo whose hooks are wired, where a
 *      commit was made with `--no-verify` ON THE COMMAND LINE, passes the guard
 *      — and the seeded reflog is asserted to hold no `--no-verify`, so the
 *      premise ("the flag was used and git kept no trace") is verified rather
 *      than assumed. The case also requires the guard to PRINT its COVERAGE
 *      statement, so a guard whose prose says one thing and whose run says
 *      nothing cannot pass this checker.
 *   2. THE CHECK IS NOT VOID. Where the guard CAN see a bypass — a
 *      `FAST_PUSH_LOG` line — it refuses to certify, exit non-zero. A guard
 *      that failed everything would pass case 1 for the wrong reason; this case
 *      is what proves the instrument still fires where it looks.
 *   3. THE OTHER VISIBLE PATH, SEEDED. A wrapper-recorded reflog action text
 *      (a non-prose action, set with `GIT_REFLOG_ACTION`) is a refusal — the
 *      header names this path, so a case proves it rather than asserting it.
 *   4. THE STATIC HALF STILL FIRES. With `core.hooksPath` unwired the guard
 *      fails, so "the guard passed case 1" cannot mean "the guard passes
 *      anything".
 *
 * The sandboxes are throwaway temp repos the checker removes; the repo tree is
 * never touched. `.check.mjs`, NOT `.test.mjs`: `npm test` discovers
 * `*.test.mjs`, and a top-level `process.exit()` inside vitest kills the run.
 *
 * Run: node scripts/guards/no-bypass-guard.check.mjs
 * Exit 0 = the guard does what it says it does, 1 = it does not.
 */

import { execFileSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const root = path.join(import.meta.dirname, '..', '..')
const guard = path.join(root, 'scripts', 'guards', 'no-bypass-guard.sh')

if (!existsSync(guard)) {
  console.error(`check: guard missing at ${guard}`)
  process.exit(1)
}

let checks = 0
let failures = 0
const check = (name, ok, detail = '') => {
  checks += 1
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const created = []
const git = (dir, args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim()

/** A real repo with the tracked hook wired, so the STATIC half of the guard is
 *  satisfied and the HISTORY half is the thing under test. The guard under test
 *  is COPIED in, so this exercises the guard in this repo, not the base commit's. */
function makeRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'no-bypass-check-'))
  created.push(dir)
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'check@example.com'])
  git(dir, ['config', 'user.name', 'guard check'])
  git(dir, ['config', 'core.hooksPath', 'scripts/git-hooks'])
  mkdirSync(path.join(dir, 'scripts', 'git-hooks'), { recursive: true })
  const hook = path.join(dir, 'scripts', 'git-hooks', 'pre-push')
  writeFileSync(hook, '#!/usr/bin/env bash\nexit 0\n')
  chmodSync(hook, 0o755)
  mkdirSync(path.join(dir, 'scripts', 'guards'), { recursive: true })
  cpSync(guard, path.join(dir, 'scripts', 'guards', 'no-bypass-guard.sh'))
  writeFileSync(path.join(dir, 'seed.txt'), 'seed\n')
  git(dir, ['add', 'seed.txt'])
  return dir
}

function run(dir) {
  try {
    const out = execFileSync('bash', [path.join(dir, 'scripts', 'guards', 'no-bypass-guard.sh')], {
      cwd: dir,
      encoding: 'utf8',
      stdio: 'pipe',
    }).toString()
    return { exit: 0, out }
  } catch (e) {
    return { exit: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

try {
  // 1. The blind spot: a --no-verify commit passes, and the reflog proves the
  //    flag was never recorded.
  const dir = makeRepo()
  git(dir, ['commit', '-q', '--no-verify', '-m', 'seeded commit, made with the flag'])
  const reflog = git(dir, ['reflog'])
  check(
    'premise: the seeded commit was made with --no-verify and git kept no trace of the flag',
    reflog.includes('seeded commit, made with the flag') && !reflog.includes('--no-verify'),
    `reflog: ${reflog}`,
  )
  let r = run(dir)
  check(
    'THE BLIND SPOT: the guard reports PASS on a repo where --no-verify was used',
    r.exit === 0 && /PASS — git hook enforcement is intact/.test(r.out),
    `exit ${r.exit}: ${r.out.split('\n').filter(Boolean).join(' | ')}`,
  )
  check(
    'the guard STATES its coverage in the run (the PASS does not read as evidence about the flag)',
    /COVERAGE: HISTORY reads the reflog's action text/.test(r.out) && /NOT evidence about the flag/.test(r.out),
    r.out.split('\n').filter((l) => l.includes('COVERAGE')).join(' | ') || '(no coverage line)',
  )

  // 2. The check fires where it CAN see: a FAST_PUSH_LOG line is a refusal.
  const dir2 = makeRepo()
  git(dir2, ['commit', '-q', '-m', 'clean commit'])
  writeFileSync(path.join(dir2, '.git', 'FAST_PUSH_LOG'), 'push --no-verify by wrapper\n')
  r = run(dir2)
  check(
    'the HISTORY check still fires on a bypass it CAN see (FAST_PUSH_LOG)',
    r.exit !== 0 && /recorded bypass history/.test(r.out),
    `exit ${r.exit}: ${r.out.split('\n').filter(Boolean).join(' | ')}`,
  )

  // 3. The OTHER visible path the header names: a WRAPPER-recorded reflog
  //    action text (a non-prose action, set with GIT_REFLOG_ACTION) is a refusal.
  //    Seeded so the coverage statement is proven on both visible paths.
  const dir3 = makeRepo()
  execFileSync('git', ['-C', dir3, 'commit', '-q', '-m', 'wrapper commit'], {
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, GIT_REFLOG_ACTION: 'push-wrapper: git push --no-verify' },
  })
  r = run(dir3)
  check(
    'the HISTORY check fires on a WRAPPER-recorded reflog action text',
    r.exit !== 0 && /recorded bypass history/.test(r.out),
    `exit ${r.exit}: ${r.out.split('\n').filter(Boolean).join(' | ')}`,
  )

  // 4. The static half fires: unwired hooksPath is a finding.
  const dir4 = makeRepo()
  git(dir4, ['config', '--unset', 'core.hooksPath'])
  r = run(dir4)
  check(
    'the STATIC check still fires when core.hooksPath is unwired',
    r.exit !== 0 && /core\.hooksPath is/.test(r.out),
    `exit ${r.exit}: ${r.out.split('\n').filter(Boolean).join(' | ')}`,
  )
} finally {
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
}

if (failures > 0) {
  console.error(`no-bypass-guard check: ${failures} of ${checks} check(s) failed — the guard does not do what it says.`)
  process.exit(1)
}
console.log(`no-bypass-guard check: all ${checks} checks passed (the stated blind spot is proven, not asserted).`)
