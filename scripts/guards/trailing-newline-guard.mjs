#!/usr/bin/env node
// Trailing-newline guard — every tracked text file under src/, e2e/ and scripts/
// ends its last line with a newline.
//
// WHY THIS EXISTS. The class recurred four times in V28 r2: a new file, or a
// rewritten tail, shipped with no newline at end of file, and each time a human
// reading the diff was what caught it — never a machine. Twice it happened
// inside a fix that was itself curing an earlier instance of the same class. A
// convention enforced by attention is enforced only where attention happens to
// be looking, so it is enforced here instead.
//
// WHAT IT READS. `git ls-files --cached --others --exclude-standard` under the
// three directories, so a brand-new uncommitted file is checked before it can
// be committed. Only the LAST BYTE of each file is inspected. A zero-byte file
// is counted as EMPTY, not consumed as clean; a file containing a NUL byte is
// counted as BINARY and is not read as text; a file that cannot be read at all
// is counted as UNREADABLE and is a FINDING, because a file this guard could not
// open is a file it cannot certify. All four counts are printed each run, so a
// scan that skipped a whole class of file cannot hide behind a pass.
//
// WHAT IT IS NOT. Not a reformatter and not a text-file linter: it reads the
// last byte and nothing else, so it can neither reformat nor judge a file. Its
// scan set is src/, e2e/ and scripts/ only — .scratch/, docs/, supabase/ and
// the root configs are outside it, and a file without a trailing newline there
// is a finding this guard does not make. (The root configs are protected check
// configs; touching them is a different, deliberate act.)
//
// ZERO IS A FINDING (D-030). If the scan reads no text file at all it has not
// established health — it has established that it did not look — so the run
// fails and says so. An empty scan must never read as a clean repo.
//
// Usage:  node scripts/guards/trailing-newline-guard.mjs [root]
// Exit:   0 = clean, 1 = findings

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'

const SCOPE = ['src', 'e2e', 'scripts']
const arg = process.argv[2]
let root = arg ? resolve(arg) : null
if (!root) {
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    root = process.cwd()
  }
}

/** The scan set: git's own view of the three directories, so ignored build
 * output cannot enter it and a new untracked file cannot hide from it. A root
 * that is not a git worktree falls back to a filesystem walk of the same three
 * directories, and says which one it read. */
function scanSet() {
  try {
    const out = execFileSync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...SCOPE],
      { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return { files: out.split('\0').filter(Boolean), via: 'git ls-files' }
  } catch {
    const files = []
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (entry.isFile()) files.push(relative(root, path))
      }
    }
    for (const dir of SCOPE) {
      const abs = join(root, dir)
      if (existsSync(abs) && statSync(abs).isDirectory()) walk(abs)
    }
    return { files, via: 'filesystem walk' }
  }
}

const findings = []
let text = 0
let empty = 0
let binary = 0
const unreadable = []

const { files, via } = scanSet()
for (const rel of files) {
  const abs = join(root, rel)
  let buf
  try {
    buf = readFileSync(abs)
  } catch (e) {
    // A listed file this guard cannot open (a broken symlink, a permission it
    // does not have) is neither empty, nor binary, nor checked. Dropping it
    // silently is the D-030 shape: the class disappears and the run still says
    // the convention holds.
    unreadable.push(`${rel} (${e.code ?? e.message})`)
    continue
  }
  if (buf.length === 0) {
    empty += 1
    continue
  }
  if (buf.includes(0)) {
    binary += 1
    continue
  }
  text += 1
  if (buf[buf.length - 1] !== 0x0a) {
    findings.push(rel)
  }
}

console.log(`Trailing-newline guard — ${SCOPE.join('/, ')}/ read via ${via}`)
console.log('===========================================================')
console.log(`  ${text} text file(s) read, ${empty} empty (no newline is expected in a zero-byte file), ${binary} binary (not read as text), ${unreadable.length} unreadable`)

if (text === 0) {
  // D-030 — an empty measurement consumed as health is the class this guard
  // exists to stop, one granularity below the files it judges.
  console.log('  FINDING: the scan read no text file at all — an empty scan is a finding, not a clean repo')
  console.log()
  console.log(`FAIL — ${1 + findings.length + unreadable.length} trailing-newline finding(s).`)
  process.exit(1)
}

if (unreadable.length) {
  for (const rel of unreadable) console.log(`  FINDING: ${rel} — listed in the scan set but could not be read, so its last byte was not checked`)
  console.log()
  console.log(`FAIL — ${unreadable.length + findings.length} trailing-newline finding(s).`)
  process.exit(1)
}

if (findings.length) {
  for (const rel of findings) console.log(`  FINDING: ${rel} — no newline at end of file`)
  console.log()
  console.log(`FAIL — ${findings.length} trailing-newline finding(s).`)
  process.exit(1)
}

console.log(`  ok — every one of the ${text} text file(s) in the scan ends with a newline`)
console.log()
console.log('PASS — the newline convention holds across the scan set.')
process.exit(0)
