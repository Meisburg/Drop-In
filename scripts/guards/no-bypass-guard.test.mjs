/**
 * The no-bypass guard must tell three things apart, and this file proves it by
 * building real temporary repositories rather than mocking git.
 *
 * WHY THIS TEST EXISTS. The guard's static check used to compare only the
 * EFFECTIVE `core.hooksPath` against the tracked dir. A pipeline that isolates
 * the hooks path inside a disposable copy it owns therefore failed the guard:
 * the copy's own path is not this repository's path. The guard now checks the
 * repository's own config layer (which must stay wired in every case) and
 * accepts a differing effective value only when the copy is externally owned:
 * a linked worktree whose common git dir is outside the checkout, whose
 * worktree config layer supplies the value, and whose value points inside that
 * common git dir. That acceptance must be visible, and it must never excuse a
 * bypass.
 *
 * WHY TEMPORARY REPOSITORIES. The behaviour depends on real git internals —
 * worktree config scopes, `--show-origin`, `--git-common-dir` versus
 * `--show-toplevel`. A mock would assert our model of git, not git. So each
 * case builds the filesystem git actually reads:
 *
 *   git init --bare <tmp>.git
 *   git push <tmp>.git HEAD:refs/heads/master
 *   git -C <tmp>.git config core.hooksPath scripts/git-hooks
 *   git -C <tmp>.git config extensions.worktreeConfig true
 *   git -C <tmp>.git worktree add <tmp>/copy master
 *   git -C <tmp>/copy config --worktree core.hooksPath <tmp>.git/hooks
 *
 * The working-tree guard is copied into the copy before each run so the test
 * exercises the guard under test, not the base commit's copy of it. The setup
 * push uses `--no-verify` on purpose: the repo's own pre-push hook would
 * otherwise re-run `npm run verify` inside this very test.
 *
 * It lives beside the guard (the repo colocates a script and its test, e.g.
 * `scripts/migrate-kid-photos.mjs` + `.test.mjs`), so `vitest` discovers it.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')
const GUARD_REL = 'scripts/guards/no-bypass-guard.sh'
const GUARD_ABS = path.join(HERE, 'no-bypass-guard.sh')

const TIME = 60_000
const created = []

afterEach(() => {
  while (created.length > 0) {
    rmSync(created.pop(), { recursive: true, force: true })
  }
})

function tmp(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  created.push(dir)
  return dir
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts })
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }
}

function git(cwd, args, opts = {}) {
  return run('git', args, { cwd, ...opts })
}

function must(label, result) {
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.status}): ${result.stderr || result.stdout}`)
  }
  return result
}

// A bare repo holding this commit, configured the way a tool that owns a
// disposable copy configures it.
function seedBare(root) {
  const bare = path.join(root, 'copy.git')
  must('init bare', git(root, ['init', '--bare', '-q', bare]))
  must('set bare HEAD', git(bare, ['symbolic-ref', 'HEAD', 'refs/heads/master']))
  must('push seed', git(REPO_ROOT, ['push', '--no-verify', '-q', bare, 'HEAD:refs/heads/master']))
  must('repo layer', git(bare, ['config', 'core.hooksPath', 'scripts/git-hooks']))
  must('worktree config', git(bare, ['config', 'extensions.worktreeConfig', 'true']))
  return bare
}

// The accepted case: a linked worktree whose common git dir is outside the
// checkout, with the effective hooks path isolated by the worktree layer.
function externalCopy() {
  const root = tmp('nb-guard-')
  const bare = seedBare(root)
  const copy = path.join(root, 'copy')
  must('worktree add', git(bare, ['worktree', 'add', '-q', copy, 'master']))
  copyFileSync(GUARD_ABS, path.join(copy, ...GUARD_REL.split('/')))
  must('worktree hooks', git(copy, ['config', '--worktree', 'core.hooksPath', path.join(bare, 'hooks')]))
  return { root, bare, copy, effective: path.join(bare, 'hooks') }
}

// An ordinary, non-linked checkout.
//
// NO HARDLINKS — a gate must not go red on a race.
// `git clone` of a LOCAL path hardlinks the source's objects instead of copying
// them, and git then verifies each hardlink against the source it came from. If
// that source changes while the clone is copying, the clone dies with
// `fatal: hardlink different from source at '/tmp/…/commit-graphs/tmp_graph_…'`
// and the WHOLE gate fails on a test that has nothing to do with the slice. This
// was observed once and recorded in task-state.md as a known flake (`1 failed |
// 1783 passed`), and it bites hardest exactly where it hurts most: the tracked
// pre-push hook runs this suite WHILE `git push` is running.
//
// `--no-hardlinks` removes the mechanism rather than the symptom: measured on
// this repo, the pack file's link count at the clone goes from 2 (shared inode,
// verified against the source) to 1 (an independent copy, nothing to verify).
// 16 MiB of objects, so the copy costs ~nothing.
//
// The two `gc` lines below are BELT AND BRACES, not a confirmed cause: I could
// not identify the concurrent commit-graph writer (a fresh bare does not gain a
// commit-graph from the seed push — checked). They make this test's own bare
// incapable of spawning one, which is cheap even though the hardlink fix alone
// already covers the failure.
function plainClone() {
  const root = tmp('nb-plain-')
  const bare = path.join(root, 'plain.git')
  must('init bare', git(root, ['init', '--bare', '-q', bare]))
  must('set bare HEAD', git(bare, ['symbolic-ref', 'HEAD', 'refs/heads/master']))
  must('no auto-gc', git(bare, ['config', 'gc.auto', '0']))
  must('no commit-graph', git(bare, ['config', 'gc.writeCommitGraph', 'false']))
  must('push seed', git(REPO_ROOT, ['push', '--no-verify', '-q', bare, 'HEAD:refs/heads/master']))
  const clone = path.join(root, 'clone')
  must('clone', git(root, ['clone', '-q', '--no-hardlinks', bare, clone]))
  copyFileSync(GUARD_ABS, path.join(clone, ...GUARD_REL.split('/')))
  must('repo layer', git(clone, ['config', 'core.hooksPath', 'scripts/git-hooks']))
  return { root, bare, clone }
}

function runGuard(cwd, env = {}) {
  return run('bash', [GUARD_REL], { cwd, env: { ...process.env, ...env } })
}

function gitPath(cwd, name) {
  return must('git-path', git(cwd, ['rev-parse', '--git-path', name])).stdout.trim()
}

describe('no-bypass guard: externally owned validation copies', () => {
  it('accepts an externally owned copy and prints the acceptance line', () => {
    const { copy, effective } = externalCopy()
    const r = runGuard(copy)
    expect(r.stdout).toContain('PASS')
    expect(r.status).toBe(0)
    const acceptLines = r.stdout.split('\n').filter((line) => line.includes('ACCEPT:'))
    expect(acceptLines).toHaveLength(1)
    expect(acceptLines[0]).toContain(effective)
    expect(acceptLines[0]).toContain('worktree config layer')
    expect(acceptLines[0]).toContain('externally owned')
  }, TIME)

  it('fails when the repository layer is rewired to a foreign path', () => {
    const { copy } = externalCopy()
    must('rewire repo layer', git(copy, ['config', '--local', 'core.hooksPath', '/tmp/foreign/hooks']))
    const r = runGuard(copy)
    expect(r.status).toBe(1)
    expect(r.stdout).toContain("repository's own core.hooksPath")
    expect(r.stdout).toContain('FAIL')
  }, TIME)

  it('fails when the effective value comes from a non-worktree layer', () => {
    const { copy, bare } = externalCopy()
    const r = runGuard(copy, {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: path.join(bare, 'elsewhere'),
    })
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('effective core.hooksPath')
    expect(r.stdout).not.toContain('ACCEPT:')
  }, TIME)

  // git resolves a relative core.hooksPath against the checkout toplevel (the
  // directory where hooks run), not the common git dir — the guard must
  // resolve it the same way, in both directions.
  it('fails when a relative worktree value resolves inside the checkout', () => {
    const { copy } = externalCopy()
    must('relative worktree hooks', git(copy, ['config', '--worktree', 'core.hooksPath', 'myhooks']))
    const r = runGuard(copy)
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('effective core.hooksPath')
    expect(r.stdout).not.toContain('ACCEPT:')
  }, TIME)

  it('accepts a relative worktree value that resolves inside the common git dir', () => {
    const { copy, bare } = externalCopy()
    const rel = path.relative(copy, path.join(bare, 'hooks'))
    must('relative worktree hooks', git(copy, ['config', '--worktree', 'core.hooksPath', rel]))
    const r = runGuard(copy)
    expect(r.status).toBe(0)
    const acceptLines = r.stdout.split('\n').filter((line) => line.includes('ACCEPT:'))
    expect(acceptLines).toHaveLength(1)
    expect(acceptLines[0]).toContain(rel)
  }, TIME)

  it('fails when the tracked pre-push hook is missing', () => {
    const { copy } = externalCopy()
    rmSync(path.join(copy, 'scripts', 'git-hooks', 'pre-push'))
    const r = runGuard(copy)
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('does not exist')
  }, TIME)

  it('fails when the tracked pre-push hook is not executable', () => {
    const { copy } = externalCopy()
    chmodSync(path.join(copy, 'scripts', 'git-hooks', 'pre-push'), 0o644)
    const r = runGuard(copy)
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('is not executable')
  }, TIME)

  it('fails when a bypass is recorded in the push log', () => {
    const { copy } = externalCopy()
    writeFileSync(gitPath(copy, 'FAST_PUSH_LOG'), 'push --no-verify origin master\n')
    const r = runGuard(copy)
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('recorded bypass history')
  }, TIME)

  it('fails when a bypass is recorded in the reflog', () => {
    const { copy } = externalCopy()
    appendFileSync(
      gitPath(copy, 'logs/HEAD'),
      '0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 T <t@e> 1 +0000\tpush --no-verify origin master\n',
    )
    const r = runGuard(copy)
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('recorded bypass history')
  }, TIME)

  it('does not treat a commit subject mentioning core.hooksPath as a bypass', () => {
    const { copy } = externalCopy()
    appendFileSync(
      gitPath(copy, 'logs/HEAD'),
      '0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 T <t@e> 1 +0000\tcommit: rewire core.hooksPath\n',
    )
    const r = runGuard(copy)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('NOTE: bypass-related history entries found')
    expect(r.stdout).not.toContain('recorded bypass history')
  }, TIME)

  // git's own reflog action text is prose: commit subjects (spelled
  // differently depending on how the commit was created) and branch names,
  // refs, recorded pull arguments, and URLs. None of it may fail the tree.
  it.each([
    ['commit (initial)', 'initial: mention core.hooksPath here'],
    ['commit (amend)', 'docs: explain core.hooksPath acceptance'],
    ['commit (merge)', 'merge: mention core.hooksPath'],
    ['rebase (pick)', 'picked: mentions --no-verify'],
    ['rebase (squash)', 'squashed: mentions --no-verify'],
    ['cherry-pick', 'picked: mentions --no-verify'],
    ['revert', 'Revert "feature: mentions --no-verify"'],
    ['am', 'patch: mentions --no-verify'],
    ['merge fix/core.hooksPath-guard', 'Fast-forward'],
    ['checkout', 'moving from master to fix/core.hooksPath-guard'],
    ['pull --ff-only . fix/core.hooksPath-guard', 'Fast-forward'],
    ['reset', 'moving to fix/core.hooksPath-guard'],
    ['clone', 'from https://example.invalid/core.hooksPath.git'],
  ])('does not treat a %s subject line as a bypass', (action, subject) => {
    const { copy } = externalCopy()
    appendFileSync(
      gitPath(copy, 'logs/HEAD'),
      `0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 T <t@e> 1 +0000\t${action}: ${subject}\n`,
    )
    const r = runGuard(copy)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('PASS')
    expect(r.stdout).not.toContain('recorded bypass history')
    expect(r.stdout).toContain('NOTE: bypass-related history entries found')
  }, TIME)

  it('still fails when a command-like bypass rides a wrapper-recorded reflog action', () => {
    const { copy } = externalCopy()
    appendFileSync(
      gitPath(copy, 'logs/HEAD'),
      '0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 T <t@e> 1 +0000\tpush --no-verify origin master: subject\n',
    )
    appendFileSync(
      gitPath(copy, 'logs/HEAD'),
      '0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 T <t@e> 1 +0000\tcommit --no-verify -m subject\n',
    )
    const r = runGuard(copy)
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('recorded bypass history')
  }, TIME)
})

describe('no-bypass guard: ordinary checkouts are unchanged', () => {
  it('passes when the effective value equals the repository layer', () => {
    const { clone } = plainClone()
    const r = runGuard(clone)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('ok — core.hooksPath = scripts/git-hooks')
  }, TIME)

  it('fails when the effective value was overridden from anywhere', () => {
    const { clone } = plainClone()
    const r = runGuard(clone, {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '/tmp/foreign',
    })
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('effective core.hooksPath')
    expect(r.stdout).not.toContain('ACCEPT:')
  }, TIME)

  // The env-layer acceptance path this guard adds: an override that
  // resolves to this repository's own tracked hooks dir is a no-op and
  // must be accepted with a visible line, not silently.
  it('accepts an env-layer no-op override that resolves to the tracked hooks dir', () => {
    const { clone } = plainClone()
    const r = runGuard(clone, {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: 'scripts/git-hooks',
    })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('no-op override')
  }, TIME)

  // An empty env-layer value resolves to the checkout toplevel, not the
  // tracked hooks dir — the guard must refuse it (the safe direction).
  it('refuses an empty env-layer value (it resolves to the toplevel, not the tracked dir)', () => {
    const { clone } = plainClone()
    const r = runGuard(clone, {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '',
    })
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('effective core.hooksPath')
    expect(r.stdout).not.toContain('ACCEPT:')
  }, TIME)
})
