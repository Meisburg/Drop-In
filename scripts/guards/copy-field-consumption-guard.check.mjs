#!/usr/bin/env node
/**
 * Self-check for the copy-field consumption guard (V28 r2 slice 6a).
 *
 * WHY THIS FILE EXISTS: the guard's own bar, quoted from run-all.sh — *"A rule
 * whose own behavior is unchecked is a rule that can silently stop holding — a
 * checker that matches nothing looks exactly like a clean repo."* A guard that
 * parses no fields, or that treats its own module as a consumer, is
 * indistinguishable from a clean repo by eye. So every half of the rule is
 * seeded here, in a throwaway copy of src/, and each seed requires the RIGHT
 * exit code:
 *
 *   1. the clean repo passes — AND reports the field count and consumer-file
 *      count it derived (a run that reports zero of either is the broken
 *      instrument, not a clean repo);
 *   2. a field that is DECLARED and VALUED but read by nothing is caught — this
 *      is exclusions 1 and 2 at once: the declaration and the module's own data
 *      are not consumers;
 *   3. the same field read ONLY in the module's own test is still caught — a
 *      test that asserts a field is non-empty is exactly what let `skipLabel`
 *      lie, and it is not consumption;
 *   4. the same field read in a COMMENT of a consumer file is still caught —
 *      documentation about a field is not a read of it;
 *   5. the same field read as `.zzUnread` in a file that does NOT import the
 *      copy module is still caught — an unrelated property with the same name
 *      is not the copy module's field;
 *   6. THE REGRESSION ANCHOR: delete the one line that reads `skipLabel`
 *      (OnboardingPage's `skipLabel={kidsCopy.skipLabel}`) and the guard must
 *      name `skipLabel`. This is the exact defect slice 6a fixed; if it ever
 *      comes back, this seed is what says so;
 *   7. an allowlisted field WITH a written reason passes;
 *   8. an allowlisted field with NO reason is a finding;
 *   9. an allowlist entry for a field that IS read is a finding (stale
 *      allowance);
 *  10. an allowlist entry for a field the module does not declare is a finding
 *      (a typo'd allowance guards nothing);
 *  11. a module the parser reads no fields from is a FAIL, not a pass — the
 *      tripwire against the guard itself going blind.
 *
 * `.check.mjs`, NOT `.test.mjs`: `npm test` discovers `*.test.mjs`, and a
 * top-level `process.exit()` inside the vitest runner kills the run.
 *
 * Run: node scripts/guards/copy-field-consumption-guard.check.mjs
 * Exit 0 = the guard does its job, 1 = it does not.
 */

import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.join(import.meta.dirname, '..', '..')
const guard = path.join(root, 'scripts', 'guards', 'copy-field-consumption-guard.mjs')

if (!existsSync(guard)) {
  console.error(`check: guard missing at ${guard}`)
  process.exit(1)
}
if (!existsSync(path.join(root, 'src'))) {
  console.error('check: this must run from within the playdate-app repo (src/ missing)')
  process.exit(1)
}

const guardSrc = readFileSync(guard, 'utf8')
const sandbox = mkdtempSync(path.join(os.tmpdir(), 'copy-field-check-'))
cpSync(path.join(root, 'src'), path.join(sandbox, 'src'), { recursive: true })

const MOD = path.join(sandbox, 'src', 'lib', 'firstRunCopy.ts')
const TEST = path.join(sandbox, 'src', 'lib', 'firstRunCopy.test.ts')
const PAGE = path.join(sandbox, 'src', 'pages', 'OnboardingPage.tsx')
const FOREIGN = path.join(sandbox, 'src', 'lib', 'firstRun.ts')

// Pristine snapshots of every file a seed touches, so each seed starts clean.
const pristine = new Map(
  [MOD, TEST, PAGE, FOREIGN].map((f) => [f, readFileSync(f, 'utf8')]),
)
const reset = () => {
  for (const [f, text] of pristine) writeFileSync(f, text)
}
const editFile = (file, find, replace) => {
  const text = readFileSync(file, 'utf8')
  if (!text.includes(find)) throw new Error(`seed: could not find ${JSON.stringify(find)} in ${file}`)
  writeFileSync(file, text.replace(find, replace))
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
const findingLines = (out) =>
  out
    .split('\n')
    .filter((l) => l.startsWith('  - '))
    .join(' | ')

/** Run the guard (optionally a copy with a patched ALLOWLIST) over the sandbox. */
function run(script = guard) {
  try {
    const out = execSync(`node ${JSON.stringify(script)} ${JSON.stringify(sandbox)}`, {
      encoding: 'utf8',
      stdio: 'pipe',
    })
    return { exit: 0, out }
  } catch (e) {
    return { exit: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}
/** A copy of the guard whose ALLOWLIST carries `entries` — the allowance seeds
 *  must exercise the real guard, so the allowance is patched into a copy of it
 *  rather than reimplemented here. */
function guardWithAllowlist(entries) {
  const anchor = "  'src/lib/firstRunCopy.ts': {"
  if (!guardSrc.includes(anchor)) throw new Error('seed: ALLOWLIST anchor not found in the guard')
  const dir = path.join(sandbox, 'scripts', 'guards')
  mkdirSync(dir, { recursive: true })
  const p = path.join(dir, 'zz-allowlist-guard.mjs')
  writeFileSync(p, guardSrc.replace(anchor, `${anchor}\n${entries}`))
  return p
}

// A field that is declared and valued, so only a READ can save it.
const declareField = () => {
  editFile(MOD, '  skipLabel?: string', '  skipLabel?: string\n  zzUnread?: string')
  editFile(MOD, "    skipLabel: 'Skip',", "    skipLabel: 'Skip',\n    zzUnread: 'zz',")
}

try {
  // 1. The repo as it stands is clean — and the run proves it LOOKED.
  reset()
  let r = run()
  check('clean repo passes', r.exit === 0, `exit ${r.exit}: ${findingLines(r.out)}`)
  const declared = /declared fields: (\d+)/.exec(r.out)
  const consumers = /consumer files[^:]*: (\d+)/.exec(r.out)
  check(
    'the run reports a non-zero field count and consumer-file count (it matched something)',
    Number(declared?.[1]) > 0 && Number(consumers?.[1]) > 0,
    `declared=${declared?.[1]} consumers=${consumers?.[1]}`,
  )
  check(
    'skipLabel is reported as READ, with a site outside the copy module',
    /read\s+— skipLabel .*at src\/(pages|components)\//.test(r.out),
    r.out.split('\n').filter((l) => l.includes('skipLabel')).join(' | '),
  )

  // 2. Declared + valued + unread. The declaration and the data are the two
  //    sites that LOOK like evidence and are not.
  reset()
  declareField()
  r = run()
  check('declared+valued+unread field is caught', r.exit !== 0, `exit ${r.exit}`)
  check('the finding names the field', r.out.includes('zzUnread'), findingLines(r.out))

  // 3. The module's OWN TEST reads it. Still a finding.
  reset()
  declareField()
  editFile(
    TEST,
    "describe('FIRST_RUN_COPY', () => {",
    "describe('FIRST_RUN_COPY', () => {\n  it('zz', () => {\n    expect(FIRST_RUN_COPY.kids.zzUnread).toBe('zz')\n  })",
  )
  r = run()
  check(
    "the module's own test is NOT a consumer (a read there is still a finding)",
    r.exit !== 0 && r.out.includes('zzUnread'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 4. A comment in a real consumer file names the chain. Still a finding.
  reset()
  declareField()
  editFile(
    PAGE,
    '        skipLabel={kidsCopy.skipLabel}',
    '        // zzUnread comes from FIRST_RUN_COPY.kids.zzUnread\n        skipLabel={kidsCopy.skipLabel}',
  )
  r = run()
  check(
    'a comment naming the chain is NOT consumption',
    r.exit !== 0 && r.out.includes('zzUnread'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 5. The same property name read in a file that never imports the module.
  reset()
  declareField()
  editFile(
    FOREIGN,
    "export type FirstRunCardId",
    "export const zzProbe = (o: { zzUnread: string }) => o.zzUnread\n\nexport type FirstRunCardId",
  )
  r = run()
  check(
    'a same-named field in a non-importing file is NOT consumption',
    r.exit !== 0 && r.out.includes('zzUnread'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 6. The regression anchor: the real defect, reproduced by deleting the one
  //    line that reads skipLabel.
  reset()
  editFile(PAGE, '        skipLabel={kidsCopy.skipLabel}\n', '')
  r = run()
  check(
    'deleting the skipLabel read is caught (the slice 6a defect, re-seeded)',
    r.exit !== 0 && /".*skipLabel.*"/.test(r.out) && r.out.includes('READ BY NOTHING'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 7-10. The allowance, in both directions.
  reset()
  declareField()
  r = run(guardWithAllowlist("    zzUnread: 'a documented reason, in writing',"))
  check('allowlisted WITH a written reason passes', r.exit === 0, `exit ${r.exit}: ${findingLines(r.out)}`)

  reset()
  declareField()
  r = run(guardWithAllowlist('    zzUnread: \'\','))
  check(
    'allowlisted with NO reason is a finding',
    r.exit !== 0 && r.out.includes('NO REASON'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  reset()
  r = run(guardWithAllowlist("    title: 'stale allowance',"))
  check(
    'an allowance for a field that IS read is a finding (stale allowance)',
    r.exit !== 0 && r.out.includes('stale allowance is a hole'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  reset()
  r = run(guardWithAllowlist("    zzTypo: 'names nothing',"))
  check(
    'an allowance for an undeclared field is a finding (a typo guards nothing)',
    r.exit !== 0 && r.out.includes('zzTypo'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 11. The guard's own tripwire: a module it parses no fields from is blind.
  reset()
  writeFileSync(MOD, 'export {}\n')
  r = run()
  check(
    'a module with no parseable fields FAILS instead of passing (the blind-instrument tripwire)',
    r.exit !== 0 && r.out.includes('NO declared copy fields'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )
} finally {
  reset()
  rmSync(sandbox, { recursive: true, force: true })
}

if (failures > 0) {
  console.error(
    `copy-field-consumption-guard check: ${failures} check(s) failed — the guard is not catching its defect class.`,
  )
  process.exit(1)
}
console.log('copy-field-consumption-guard check: all checks passed.')
