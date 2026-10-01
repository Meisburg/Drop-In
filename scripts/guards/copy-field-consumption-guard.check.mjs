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
 *   7. A FIELD IS (SHAPE, NAME), NOT A NAME — the guard's own defect, found in
 *      review of slice 6a and fixed in fix 1. Delete every CARD's `title` read
 *      while the nudge's `title` read stays, and the guard must still name
 *      `FirstRunCardCopy.title` as unread while reporting
 *      `FIRST_RUN_NUDGE_COPY.title` as read. The first version keyed fields by
 *      bare name, so the nudge's read satisfied the card's field and this seed
 *      is what keeps that from coming back;
 *   8. NO TEST FILE is a consumer — a read of an unread field in some OTHER
 *      test file (`firstRun.test.ts`) is still a finding. Exempting only the
 *      copy module's own test would let an unread field buy immunity one file
 *      over;
 *   9. a field read ONLY by destructuring (`const { skipLabel } = …`) counts as
 *      read — otherwise the guard cries wolf at a legitimate read style;
 *  10. an allowlisted field WITH a written reason passes;
 *  11. an allowlisted field with NO reason is a finding;
 *  12. an allowlist entry for a field that IS read is a finding (stale
 *      allowance);
 *  13. an allowlist entry for a field the module does not declare is a finding
 *      (a typo'd allowance guards nothing);
 *  14. a module the parser reads no shapes from is a FAIL, not a pass — the
 *      tripwire against the guard itself going blind.
 *
 * Seeds 15-22 are the fix-2 round, one per defect that could fire on clean code
 * or make the guard lie (the brief's items A, B, C, E, F, plus the two parser
 * holes the review raised that are in the same direction):
 *
 *  15. a read-SHAPED STRING is not consumption — the old lexer asked an
 *      allowlist of keywords whether a quote opened a string, `as` was not on
 *      it, and `… as 'kidsCopy.skipLabel'` was reported as the consumption of
 *      skipLabel at exit 0. That is the guard reporting a word READ because it
 *      appears inside a string: a lie, not a miss;
 *  16. a non-object-literal export (`export const zzList = ['x']`) does not
 *      swallow the NEXT export — the old annotation group was `([\s\S]*?)` and
 *      bound zzList's NAME to the nudge literal while landing lastIndex inside
 *      the nudge body, so the nudge const vanished from the run entirely;
 *  17. an unrelated annotated const in a copy module is SKIPPED with a printed
 *      line — it used to be a hard, un-allowlistable finding, i.e. a build break
 *      for code that has no copy field in it;
 *  18. a const the guard is CONFIGURED to judge that stops being parseable IS a
 *      finding — the precise form of the blind-instrument tripwire, which is why
 *      17 skipping is safe;
 *  19. an ALIASED IMPORT (`import { FIRST_RUN_COPY as copy }`) is a consumer —
 *      the old code keyed shapes and reads by the same name, so every read in
 *      such a file was invisible and its fields were reported unread;
 *  20. a type alias referenced BEFORE it is declared resolves (the old source-
 *      order pass resolved it to the empty set and emitted a hard finding on
 *      well-formed code);
 *  21. NESTED destructuring (`const { kids: { skipLabel } } = FIRST_RUN_COPY`)
 *      counts — the old pattern stopped at the first `}` and recorded the hop
 *      name instead of the field, a false alarm at the style seed 9 exists for;
 *  22. an interface used as a Record KEY is not mistaken for a copy shape, so
 *      its own fields are not reported as unread copy.
 *
 * THE HARNESS ITSELF IS NOT ALLOWED TO CRASH (fix 2, item H). Seed inputs are
 * checked for existence and reported as named failures — a renamed or deleted
 * `firstRun.test.ts` used to throw while building the pristine snapshots,
 * OUTSIDE the try/finally, so the sandbox leaked and the run died on a stack
 * trace instead of reporting which check failed. A failed seed EDIT is likewise
 * recorded and the run continues, so one stale anchor cannot hide the verdicts
 * of the thirteen seeds behind it. And `editFile` requires the pattern to occur
 * EXACTLY ONCE: zero means the seed's premise is gone, two or more means
 * `String.replace` would delete only the first while the seed claims it deleted
 * every one. Both are reported as the SEED failing, so a red points at the seed
 * rather than at the guard. Seed 7 additionally asserts its own premise — that
 * no card-title read survives the edits — because its claim is "delete EVERY
 * card's title read" and `replace` only ever deletes one.
 *
 * Allowlist seeds key entries as `Shape.field` (`FirstRunCardCopy.zzUnread`),
 * because that is what a field IS to this guard. A bare-name entry is the F1
 * bug wearing an allowance.
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
const OTHER_TEST = path.join(sandbox, 'src', 'lib', 'firstRun.test.ts')
const PAGE = path.join(sandbox, 'src', 'pages', 'OnboardingPage.tsx')
const FOREIGN = path.join(sandbox, 'src', 'lib', 'firstRun.ts')

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    console.log(`  ✓ ${name}`)
  } else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// Pristine snapshots of every file a seed touches, so each seed starts clean.
// The existence check is here, not inside the try: these reads used to run
// before the try/finally, so a renamed seed input crashed the harness with a
// stack trace and left the sandbox behind — a guard harness that dies instead of
// reporting is indistinguishable from a harness that found nothing.
const pristine = new Map()
for (const f of [MOD, TEST, OTHER_TEST, PAGE, FOREIGN]) {
  if (!existsSync(f)) {
    check(`seed input exists: ${path.relative(root, f)}`, false, 'missing — renamed or deleted; the seed that anchors on it cannot run')
    continue
  }
  pristine.set(f, readFileSync(f, 'utf8'))
}

/** Files a seed ADDED to the sandbox; `reset` removes them, so a seed that
 *  drops in a new consumer file cannot leak into the seeds after it. */
const extras = []
const reset = () => {
  for (const [f, text] of pristine) writeFileSync(f, text)
  for (const f of extras) rmSync(f, { force: true })
}
const addFile = (file, text) => {
  extras.push(file)
  writeFileSync(file, text)
}

const occurrences = (text, find) => text.split(find).length - 1

/** Seeds anchor on exact literals in files this guard has no contract with, so
 *  the count is CHECKED rather than assumed: `expect` occurrences or the seed
 *  failed, and a failed seed is recorded and the run continues. */
function editFile(file, find, replace, expect = 1) {
  try {
    if (!existsSync(file)) throw new Error(`${path.relative(root, file)} does not exist`)
    const text = readFileSync(file, 'utf8')
    const n = occurrences(text, find)
    if (n !== expect) {
      throw new Error(
        `${JSON.stringify(find)} occurs ${n}× in ${path.relative(root, file)}, expected ${expect} — ` +
          'the seed premise changed, not the guard',
      )
    }
    writeFileSync(file, text.replace(find, replace))
  } catch (e) {
    check(`seed edit: ${path.relative(root, file)}`, false, e instanceof Error ? e.message : String(e))
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
    'skipLabel is reported as READ, with its shape and a site outside the copy module',
    /read\s+— \S*\.skipLabel .*at src\/(pages|components)\//.test(r.out),
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

  // 7. A field is (shape, name). The card's `title` and the nudge's `title` are
  //    different fields; a read of one is not consumption of the other. This is
  //    the guard's OWN defect class, found in review of slice 6a.
  reset()
  for (const [find, repl] of [
    ['FIRST_RUN_COPY.name.title', 'FIRST_RUN_COPY.name.titleX'],
    ['FIRST_RUN_COPY.area.title', 'FIRST_RUN_COPY.area.titleX'],
    ['kidsCopy.title', 'kidsCopy.titleX'],
    ['areaCopy.title', 'areaCopy.titleX'],
  ]) {
    editFile(PAGE, find, repl)
  }
  // The seed claims it deleted EVERY card title read, and `String.replace`
  // deletes only the first occurrence — so the claim is asserted here, on the
  // edited file, before the guard is asked anything. If a second call site is
  // ever added, this line says "the seed under-deleted" instead of the next
  // check pointing at the guard.
  const surviving = readFileSync(PAGE, 'utf8').match(/\b(?:kidsCopy|areaCopy|FIRST_RUN_COPY(?:\.\w+)?)\.title\b/g) ?? []
  check(
    'seed 7 deleted every card-title read (self-verifying: the seed proves its own premise)',
    surviving.length === 0,
    `surviving reads: ${surviving.join(', ') || '(none)'}`,
  )
  r = run()
  check(
    "a sibling shape's read does NOT satisfy a shape's own field (card title unread while the nudge title is read)",
    r.exit !== 0 &&
      /FirstRunCardCopy\.title/.test(findingLines(r.out)) &&
      /read\s+— FIRST_RUN_NUDGE_COPY\.title/.test(r.out),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 8. No test file is a consumer — not just the copy module's own.
  reset()
  declareField()
  editFile(
    OTHER_TEST,
    "describe('FIRST_RUN_CARDS', () => {",
    "describe('FIRST_RUN_CARDS', () => {\n  it('zz', () => {\n    expect(FIRST_RUN_COPY.kids.zzUnread).toBe('zz')\n  })",
  )
  editFile(OTHER_TEST, "} from './firstRun'", "} from './firstRun'\nimport { FIRST_RUN_COPY } from './firstRunCopy'")
  r = run()
  check(
    'a read in ANOTHER test file is NOT consumption either',
    r.exit !== 0 && r.out.includes('zzUnread'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 9. A destructured read IS consumption — the guard must not cry wolf at a
  //    legitimate way of reading a copy value.
  reset()
  editFile(
    PAGE,
    '    const kidsCopy = FIRST_RUN_COPY.kids\n',
    '    const kidsCopy = FIRST_RUN_COPY.kids\n    const { skipLabel: destructuredSkip } = FIRST_RUN_COPY.kids\n',
  )
  editFile(PAGE, '        skipLabel={kidsCopy.skipLabel}', '        skipLabel={destructuredSkip}')
  r = run()
  check(
    'a field read only by destructuring passes',
    r.exit === 0,
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 10-13. The allowance, in both directions.
  reset()
  declareField()
  r = run(guardWithAllowlist("    'FirstRunCardCopy.zzUnread': 'a documented reason, in writing',"))
  check('allowlisted WITH a written reason passes', r.exit === 0, `exit ${r.exit}: ${findingLines(r.out)}`)

  reset()
  declareField()
  r = run(guardWithAllowlist("    'FirstRunCardCopy.zzUnread': '',"))
  check(
    'allowlisted with NO reason is a finding',
    r.exit !== 0 && r.out.includes('NO REASON'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  reset()
  r = run(guardWithAllowlist("    'FirstRunCardCopy.title': 'stale allowance',"))
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

  // 14. The guard's own tripwire: a module it parses no shapes from is blind.
  reset()
  writeFileSync(MOD, 'export {}\n')
  r = run()
  check(
    'a module with no parseable shapes FAILS instead of passing (the blind-instrument tripwire)',
    r.exit !== 0 && r.out.includes('NO declared copy shapes'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 15. fix 2 item B — a word inside a string is DATA. The old lexer asked an
  //     allowlist of preceding keywords (`from`, `return`, …) whether a quote
  //     opened a string; `as` was not on the list, so the body of the literal
  //     below was scanned as code and skipLabel was reported READ at exit 0
  //     with nothing rendering it.
  reset()
  editFile(PAGE, '        skipLabel={kidsCopy.skipLabel}\n', '')
  editFile(
    PAGE,
    '    const kidsCopy = FIRST_RUN_COPY.kids\n',
    "    const kidsCopy = FIRST_RUN_COPY.kids\n    const zzLie = FIRST_RUN_COPY.name.primaryLabel as 'kidsCopy.skipLabel'\n",
  )
  r = run()
  check(
    'a read-shaped string literal is NOT consumption (the lexer is a rule, not an allowlist)',
    r.exit !== 0 && /"\S*\.skipLabel"/.test(r.out),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 16. fix 2 item C — the annotation group `([\s\S]*?)` was unbounded, so
  //     `export const zzList = ['x']` followed by the nudge const bound
  //     zzList's NAME to the nudge's LITERAL and the nudge const was never
  //     matched at all.
  reset()
  editFile(
    MOD,
    'export const FIRST_RUN_NUDGE_COPY = {',
    "export const zzList = ['x']\n\nexport const FIRST_RUN_NUDGE_COPY = {",
  )
  r = run()
  check(
    'a non-object-literal export does not swallow the next export',
    r.exit === 0 && /read\s+— FIRST_RUN_NUDGE_COPY\.title/.test(r.out),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 17. fix 2 item A — an exported const that is not copy data is not this
  //     guard's business, and must not break the build with no way to excuse it
  //     (the ALLOWLIST is keyed by Shape.field; an unjudged const has none).
  reset()
  editFile(
    MOD,
    'export const FIRST_RUN_NUDGE_COPY = {',
    "export const zzLabels: Record<string, string> = { a: 'b' }\n\nexport const FIRST_RUN_NUDGE_COPY = {",
  )
  r = run()
  check(
    'an unrelated annotated const in a copy module is SKIPPED with a printed line, not a finding',
    r.exit === 0 && /skipped— exported const zzLabels/.test(r.out),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 18. …and the precise tripwire that makes 17 safe: a const COPY_MODULES
  //     names as the copy this guard judges MUST stay parseable, or the run
  //     fails. "Skipped" is only honest when the expected thing is still judged.
  reset()
  editFile(
    MOD,
    'export const FIRST_RUN_NUDGE_COPY = {',
    'export const FIRST_RUN_NUDGE_COPY: { title: string; body: string; actionLabel: string } = {',
  )
  r = run()
  check(
    'a JUDGED copy const that stops being parseable is a finding (the precise blind tripwire)',
    r.exit !== 0 && r.out.includes('the instrument is blind on it'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 20. fix 2 item F — a type alias used before it is declared, and an alias
  //     that names another alias. The old pass resolved aliases in source order,
  //     so `FirstRunCopyLater` resolved to the empty set, the const looked like it
  //     named no shape, and the guard emitted a hard finding on well-formed code
  //     while quietly dropping every field of that const from the run (measured:
  //     the old guard reported 3 declared fields instead of 8 on this input).
  reset()
  editFile(MOD, 'export const FIRST_RUN_COPY: FirstRunCopyByCard = {', 'export const FIRST_RUN_COPY: FirstRunCopyLater = {')
  writeFileSync(MOD, `${readFileSync(MOD, 'utf8')}\ntype FirstRunCopyLater = FirstRunCopyAlias\ntype FirstRunCopyAlias = FirstRunCopyByCard\n`)
  r = run()
  check(
    'a forward-referenced alias chain resolves (no hard finding from our own resolution order)',
    r.exit === 0 && /declared fields: 8/.test(r.out) && /read\s+— FirstRunCardCopy\.title/.test(r.out),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 21. nested destructuring — the old pattern text stopped at the first `}`, so
  //     the HOP name was recorded as the read and the field was missed: a false
  //     alarm at the very style seed 9 was added to support.
  reset()
  editFile(
    PAGE,
    '    const kidsCopy = FIRST_RUN_COPY.kids\n',
    '    const kidsCopy = FIRST_RUN_COPY.kids\n    const { kids: { skipLabel: nestedSkip } } = FIRST_RUN_COPY\n',
  )
  editFile(PAGE, '        skipLabel={kidsCopy.skipLabel}', '        skipLabel={nestedSkip}')
  r = run()
  check(
    'a field read only by NESTED destructuring counts as read',
    r.exit === 0,
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 22. an interface used as a Record KEY is not a copy shape, so its own
  //     fields are not reported as unread copy.
  reset()
  editFile(
    MOD,
    'export const FIRST_RUN_NUDGE_COPY = {',
    'interface zzCardKey {\n  zzKeyOnly: string\n}\n\nexport const zzLookup: Record<zzCardKey, FirstRunCardCopy> = {}\n\nexport const FIRST_RUN_NUDGE_COPY = {',
  )
  r = run()
  check(
    'a type used as a Record KEY contributes no copy fields',
    r.exit === 0 && !r.out.includes('zzKeyOnly'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 23. An alias of a copy value must be followed whatever the hop's KEY is and
  //     whatever whitespace sits before the terminator. Written during fix 2,
  //     found by lint: a template-literal regex lost one backslash (`\s*` →
  //     `s*`), so the alias pattern stopped tolerating the whitespace between the
  //     hop and the end of the statement. The comment on the alias line is what
  //     makes that visible: after comment-blanking it leaves spaces there, and an
  //     alias pattern that cannot skip them loses the root — which is exactly how
  //     a copy field ends up reported unread from a file that reads it.
  reset()
  editFile(
    PAGE,
    '    const kidsCopy = FIRST_RUN_COPY.kids\n',
    '    const nameCopyAlias = FIRST_RUN_COPY.name // a local alias of the name card\n    const kidsCopy = FIRST_RUN_COPY.kids\n',
  )
  editFile(PAGE, 'FIRST_RUN_COPY.name.title', 'nameCopyAlias.title')
  // Leave no other card-title read standing: if the alias is not recognised as a
  // root, `FirstRunCardCopy.title` has no reader left and the run must fail.
  // Without this, the surviving `kidsCopy.title` would satisfy the field and the
  // seed would pass for a reason unrelated to what it claims to test.
  for (const [find, repl] of [
    ['FIRST_RUN_COPY.area.title', 'FIRST_RUN_COPY.area.titleX'],
    ['kidsCopy.title', 'kidsCopy.titleX'],
    ['areaCopy.title', 'areaCopy.titleX'],
  ]) {
    editFile(PAGE, find, repl)
  }
  const titleReads = readFileSync(PAGE, 'utf8').match(/\b(?:\w+|FIRST_RUN_COPY(?:\.\w+)?)\.title\b/g) ?? []
  check(
    'seed 23 left exactly one card-title read, and it is the alias (self-verifying)',
    titleReads.length === 1 && titleReads[0] === 'nameCopyAlias.title',
    `title reads: ${titleReads.join(', ') || '(none)'}`,
  )
  r = run()
  check(
    'a local alias of a hop whose key does not end in s is still a consumer root',
    r.exit === 0 && /read\s+— FirstRunCardCopy\.title/.test(r.out),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 19. fix 2 item E — an ALIASED IMPORT. Shapes are keyed by the exported name
  //     and reads by the local one; conflating them made this whole file a
  //     non-consumer and its read fields came out `READ BY NOTHING`. Last, so
  //     its added file cannot mask the skipLabel seeds above (reset removes it).
  reset()
  addFile(
    path.join(sandbox, 'src', 'lib', 'zzAliasConsumer.ts'),
    "import { FIRST_RUN_COPY as copy } from './firstRunCopy'\n\nexport const zzSkip = (card: 'kids') => copy[card].skipLabel\n",
  )
  editFile(PAGE, '        skipLabel={kidsCopy.skipLabel}\n', '')
  r = run()
  check(
    'an aliased import is a consumer (the read is real even though the name differs)',
    r.exit === 0 && /read\s+— \S*\.skipLabel .*at src\/lib\/zzAliasConsumer\.ts/.test(r.out),
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
