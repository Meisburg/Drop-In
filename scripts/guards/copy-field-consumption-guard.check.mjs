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
 * Seeds 24-28 are the fix-3 round, written against the AST rewrite. The two
 * blocking findings they pin were both measured on the scanner, and one pair was
 * a REGRESSION against fix 1:
 *
 *  24. JSX TEXT with an apostrophe, then a quoted read (`It's 'kidsCopy.skipLabel'
 *      here`). The scanner's string rule decided whether a quote had a same-line
 *      PARTNER, not whether it OPENED a string, so an odd number of apostrophes
 *      paired with the literal's opening quote, blanked through it, and scanned
 *      the literal's BODY as code — consumption manufactured out of a word inside
 *      a string. An AST has no such decision to make: the literal is a node.
 *  25. The same, with the read inside a JSX expression container
 *      (`What's next? See {'docs.kidsCopy.skipLabel'}`). REGRESSION: fix 1 exited
 *      1 on this input, fix 2 exited 0.
 *  26. A string continued across a newline (`const zzCont = 'abc<newline>
 *      kidsCopy.skipLabel'`). REGRESSION. TypeScript's error recovery turns the
 *      second line into a REAL property-access node, so the AST alone does not
 *      close this: the guard refuses every read from a file with parse
 *      diagnostics AND reports the file, so a broken file can neither fake a read
 *      nor pass unseen. The seed asserts both halves.
 *  27. A read inside a TEMPLATE HOLE (`skipLabel={`${kidsCopy.skipLabel}`}`) IS
 *      consumption. The scanner claimed a hole was code in one line and erased it
 *      in the next, so the most natural way of rendering words came out `READ BY
 *      NOTHING` — the fires-on-clean-code class. A hole is an expression node.
 *  28. A COMPUTED-KEY destructure (`const { [zzKey]: title } = FIRST_RUN_COPY
 *      .kids`) does not count its LOCAL BINDING as a read. The scanner's
 *      `patternLeaves` returned `["k","title"]` for `[k]: title`, so a variable
 *      name became consumption — the same lying direction as 24-26.
 *
 * Seeds 29-33 are the fix-4 round. The class they close had fired three times and
 * each time was patched by making the NAME matching cleverer; fix 4 stops matching
 * names and asks the type checker which shape a value carries. Two of these seeds
 * are the reviewer's reproductions, verbatim, and both compile with zero type
 * errors:
 *
 *  29. A8 — a SAME-NAMED LOCAL manufactures a read. Delete the card's real read,
 *      define a local whose PARAMETER happens to be called `kidsCopy` with a
 *      `skipLabel` field, call it with a hard-coded word: the name-keyed `roots`
 *      table reported the field read and exited 0. That is the original defect — a
 *      hard-coded word in the chrome while the field looks read — walking through
 *      the guard built to catch it.
 *  30. A9 — a REST-ELEMENT destructure of a copy value, then a read off the rest
 *      binding, is a real read the name table reported READ BY NOTHING. A false
 *      alarm at the same style seeds 9 and 21 exist to support, so it belongs in
 *      the walk rather than in a third note.
 *  31. a NAMESPACE import is followed. The header named a `namespace imports` line
 *      label the rewrite never printed, and the limit it described is gone: the
 *      read goes through the value, not the binding.
 *  32. a `.mts` consumer is in the walk. The file walk matched only `.ts`/`.tsx`
 *      while the test-file rule accepted `[cm]?[jt]sx?`, so a future `.mts`
 *      consumer would have been skipped without a word — a missed read.
 *  33. the parse fence reads PUBLIC API. `sf.parseDiagnostics` is not in the
 *      .d.ts; a rename would have made it report "no parse errors", which looks
 *      exactly like a clean repo. Asserted on the source, because the only way to
 *      exercise a renamed API is to rename it, and a seed that stubs TypeScript is
 *      not testing the guard.
 *
 * ONE BASELINE PER SEED, NAMED. A seed that catches a regression is by
 * construction GREEN against the version that was right, so "fail it against two
 * versions" is not satisfiable. Each seed above states the ONE version it must be
 * red against; for seeds 29-33 that is `340d016` (the fix-3 guard, name-keyed
 * roots), and the measured matrix on this tree is: 5 red vs `340d016` (29, 30,
 * 31, 32, 33 — exactly the new ones, so no pre-existing seed depends on the new
 * implementation), 11 red vs `a03fc54` (the 6 the fix-3 review measured — 17, 24,
 * 25, 26, 27, 28 — plus these 5), 16 red vs `be29027` (the 11 that review
 * measured — 15, 16, 17, 18, 19, 20, 21, 22, 24, 26, 27 — plus these 5; seed 25
 * is GREEN on `be29027` because that is where the regression it pins was fixed,
 * and seed 26 is red there only for its added `does not PARSE` half — the older
 * guard exited 1 with the correct finding), and 46 ✓ / 0 ✗ on the current tree.
 *
 * Every seed added from fix 2 onward asserts its OWN PREMISE (what it deleted,
 * what still exists), because two seeds in fix 2 passed for reasons unrelated to
 * what they claimed. And every new seed must be shown to FAIL against the code
 * before the change it guards: `COPY_GUARD_UNDER_TEST=<path to the older guard>`
 * runs these same seeds against that guard, which is how the pre-fix exits in the
 * commit message were obtained. The hook exists for that proof and for nothing
 * else — pointing it at a different file does not make the check pass.
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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.join(import.meta.dirname, '..', '..')
/** `COPY_GUARD_UNDER_TEST` runs these seeds against a DIFFERENT copy of the
 *  guard — used once, to prove a new seed fails against the code it was written
 *  for (a seed that is green against the broken version is not a regression
 *  test). It is not a way to make this check pass: the default is the guard in
 *  this repo, and the run says which file it used. */
const guard = process.env.COPY_GUARD_UNDER_TEST
  ? path.resolve(process.env.COPY_GUARD_UNDER_TEST)
  : path.join(root, 'scripts', 'guards', 'copy-field-consumption-guard.mjs')

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
// The guard now asks the TYPE CHECKER which shape a value carries, so it builds
// the same program `npm run typecheck` builds — and it reads the compiler options
// from the tree under test. A sandbox without that config is a sandbox the guard
// refuses to judge (loudly, on purpose), so it is copied alongside src.
cpSync(path.join(root, 'tsconfig.app.json'), path.join(sandbox, 'tsconfig.app.json'))
// The allowance seeds run a PATCHED COPY of the guard that lives inside the
// sandbox, and the guard imports `typescript` (it walks the AST now). Node
// resolves packages by walking up from the importing file, so the sandbox needs
// the repo's node_modules on that path — symlinked, never copied.
if (existsSync(path.join(root, 'node_modules'))) {
  symlinkSync(path.join(root, 'node_modules'), path.join(sandbox, 'node_modules'), 'dir')
}

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
  // Fix 3, L3: the skip must be VISIBLE IN THE COUNTS as well as on its own
  // line, and the line must name the remedy. A const skipped by a line that
  // scrolls past is invisible in the exit code, which is the direction this
  // guard exists to refuse — so both halves are asserted here.
  check(
    'an unrelated annotated const in a copy module is SKIPPED with a printed line, not a finding',
    r.exit === 0 &&
      /skipped consts: 1 \(zzLabels\)/.test(r.out) &&
      /skipped— exported const zzLabels/.test(r.out) &&
      /do this: if it IS copy/.test(r.out),
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
  //     Fix 3, L4: the two alias lines used to be appended with `writeFileSync`,
  //     which bypassed `editFile`'s exactly-once premise check — an invariant
  //     with one hole is a hole — so they now ride an anchored edit.
  reset()
  editFile(MOD, 'export const FIRST_RUN_COPY: FirstRunCopyByCard = {', 'export const FIRST_RUN_COPY: FirstRunCopyLater = {')
  editFile(
    MOD,
    'export const FIRST_RUN_NUDGE_COPY = {',
    'type FirstRunCopyLater = FirstRunCopyAlias;\ntype FirstRunCopyAlias = FirstRunCopyByCard;\n\nexport const FIRST_RUN_NUDGE_COPY = {',
  )
  check(
    'seed 20 put the forward aliases after the const, each terminated by a semicolon (self-verifying)',
    (() => {
      const t = readFileSync(MOD, 'utf8')
      return (
        t.indexOf('type FirstRunCopyLater') > t.indexOf('export const FIRST_RUN_COPY:') &&
        !t.includes('FIRST_RUN_COPY: FirstRunCopyByCard = {') &&
        t.includes('type FirstRunCopyLater = FirstRunCopyAlias;')
      )
    })(),
    'the aliases must sit below the const and be terminated, or an extent heuristic swallows the next declaration and the seed tests nothing',
  )
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
  // The alias read has to sit where the alias is IN SCOPE. Fix 4 made that a
  // requirement rather than an accident: the guard now asks the checker what type
  // `nameCopyAlias` has, and an identifier used outside its scope has no type to
  // ask about, so the old placement (reading the NAME card's title from the kids
  // component) was an input that never compiled — the name table let it pass
  // because a name has no scope.
  editFile(PAGE, '        title={kidsCopy.title}', '        title={nameCopyAlias.title}')
  // Leave no other card-title read standing: if the alias is not recognised as a
  // root, `FirstRunCardCopy.title` has no reader left and the run must fail.
  // Without this, a surviving read would satisfy the field and the seed would
  // pass for a reason unrelated to what it claims to test.
  for (const [find, repl] of [
    ['FIRST_RUN_COPY.name.title', 'FIRST_RUN_COPY.name.titleX'],
    ['FIRST_RUN_COPY.area.title', 'FIRST_RUN_COPY.area.titleX'],
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

  // 24. fix 3 K1a — JSX text with an apostrophe, then a quoted read. The
  //     scanner paired the apostrophe with the literal's opening quote, blanked
  //     through the literal, and scanned its body as code.
  reset()
  editFile(PAGE, '        skipLabel={kidsCopy.skipLabel}\n', '')
  editFile(PAGE, '              Add a kid\n', "              Add a kid\n              It's 'kidsCopy.skipLabel' here\n")
  let pageText = readFileSync(PAGE, 'utf8')
  check(
    'seed 24 left the quoted text and no real skipLabel read (self-verifying)',
    pageText.includes("It's 'kidsCopy.skipLabel' here") && !/kidsCopy\.skipLabel/.test(pageText.replace(/'kidsCopy\.skipLabel'/g, '')),
    'the seed must delete the real read and leave only the word inside a string',
  )
  r = run()
  check(
    "JSX text with an apostrophe before a quoted read does not manufacture consumption (K1a)",
    r.exit !== 0 && /"\S*\.skipLabel"/.test(r.out) && !/does not PARSE/.test(r.out),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 25. fix 3 K1b — the same, with the read inside a JSX expression container.
  //     REGRESSION: the fix-1 guard exited 1 here, the fix-2 guard exited 0.
  reset()
  editFile(PAGE, '        skipLabel={kidsCopy.skipLabel}\n', '')
  editFile(
    PAGE,
    '              Add a kid\n',
    "              Add a kid\n              What's next? See {'docs.kidsCopy.skipLabel'}\n",
  )
  pageText = readFileSync(PAGE, 'utf8')
  check(
    "seed 25 left a string in an expression container and no real skipLabel read (self-verifying)",
    pageText.includes("{'docs.kidsCopy.skipLabel'}") && !/kidsCopy\.skipLabel/.test(pageText.replace(/'docs\.kidsCopy\.skipLabel'/g, '')),
    'the seed must delete the real read and leave only the string',
  )
  r = run()
  check(
    'a string in a JSX expression container is not consumption (K1b, the fix-1 regression)',
    r.exit !== 0 && /"\S*\.skipLabel"/.test(r.out) && !/does not PARSE/.test(r.out),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 26. fix 3 K1c — a string continued across a newline. REGRESSION. The AST
  //     alone does NOT close it: TypeScript recovers and makes a real
  //     property-access node out of the second line, so the fence is the parse
  //     diagnostic — no read from an unparseable file counts, and the file is
  //     reported. The seed asserts both halves, because a guard that only went
  //     quiet would look like the fix.
  reset()
  editFile(PAGE, '        skipLabel={kidsCopy.skipLabel}\n', '')
  editFile(
    PAGE,
    '    const kidsCopy = FIRST_RUN_COPY.kids\n',
    "    const kidsCopy = FIRST_RUN_COPY.kids\n    const zzCont = 'abc\nkidsCopy.skipLabel'\n",
  )
  pageText = readFileSync(PAGE, 'utf8')
  check(
    'seed 26 left a string spanning a newline and no real skipLabel read (self-verifying)',
    /const zzCont = 'abc\nkidsCopy\.skipLabel'/.test(pageText) && !/skipLabel=\{/.test(pageText),
    'the seed must delete the real read and leave the split string',
  )
  r = run()
  check(
    'a string spanning a newline is not consumption, and the unparseable file is reported (K1c)',
    r.exit !== 0 && /"\S*\.skipLabel"/.test(r.out) && /does not PARSE/.test(r.out),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 27. fix 3 K2 — a read inside a TEMPLATE HOLE is consumption. The scanner
  //     erased the hole it had just scanned, so this came out READ BY NOTHING.
  reset()
  editFile(PAGE, '        skipLabel={kidsCopy.skipLabel}', '        skipLabel={`${kidsCopy.skipLabel}`}')
  pageText = readFileSync(PAGE, 'utf8')
  check(
    'seed 27 left exactly one skipLabel read and it is inside a template hole (self-verifying)',
    (pageText.match(/kidsCopy\.skipLabel/g) ?? []).length === 1 && pageText.includes('skipLabel={`${kidsCopy.skipLabel}`}'),
    `occurrences: ${(pageText.match(/kidsCopy\.skipLabel/g) ?? []).length}`,
  )
  r = run()
  check(
    'a copy read inside a template hole counts as consumption (K2 — fires on clean code)',
    r.exit === 0 && /read\s+— \S*\.skipLabel .*at src\/pages\/OnboardingPage\.tsx/.test(r.out),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 28. fix 3 L1 — a computed-key destructure. `const { [zzKey]: title } = …`
  //     reads an UNKNOWN key and binds a local named `title`; the scanner counted
  //     the local as the read, which is consumption manufactured out of a
  //     variable name.
  reset()
  for (const [find, repl] of [
    ['FIRST_RUN_COPY.name.title', 'FIRST_RUN_COPY.name.titleX'],
    ['FIRST_RUN_COPY.area.title', 'FIRST_RUN_COPY.area.titleX'],
    ['kidsCopy.title', 'kidsCopy.titleX'],
    ['areaCopy.title', 'areaCopy.titleX'],
  ]) {
    editFile(PAGE, find, repl)
  }
  editFile(
    PAGE,
    '    const kidsCopy = FIRST_RUN_COPY.kids\n',
    '    const kidsCopy = FIRST_RUN_COPY.kids\n    const { [zzKey]: title } = FIRST_RUN_COPY.kids\n',
  )
  pageText = readFileSync(PAGE, 'utf8')
  check(
    'seed 28 left no card-title read, only a binding named `title` (self-verifying)',
    (pageText.match(/\b(?:\w+|FIRST_RUN_COPY(?:\.\w+)?)\.title\b/g) ?? []).length === 0 &&
      pageText.includes('const { [zzKey]: title } = FIRST_RUN_COPY.kids'),
    `surviving title reads: ${(pageText.match(/\b(?:\w+|FIRST_RUN_COPY(?:\.\w+)?)\.title\b/g) ?? []).join(', ') || '(none)'}`,
  )
  r = run()
  check(
    'a computed-key destructure does not count its local binding as a read (L1)',
    r.exit !== 0 && /FirstRunCardCopy\.title/.test(findingLines(r.out)) && !/does not PARSE/.test(r.out),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 29. fix 4 A8 — a SAME-NAMED LOCAL MANUFACTURES A READ, and the input
  //     COMPILES. Delete the card's real read, define a local function whose
  //     PARAMETER happens to be called `kidsCopy` with a `skipLabel` field, and
  //     call it with a hard-coded word. The name-keyed `roots` table decided the
  //     parameter carried the card's shapes because its NAME matched, so the
  //     guard reported the field read and exited 0 — the original defect (a
  //     hard-coded word in the chrome while the field looks read) passing the
  //     guard built to catch it. The checker answers a different question: the
  //     parameter's type is `{ skipLabel: string }`, which is not a
  //     FirstRunCardCopy, so nothing is consumed.
  //     ONE BASELINE: red against `340d016` (the fix-3 guard, name-keyed roots),
  //     which exits 0 on exactly this input.
  reset()
  editFile(PAGE, '        skipLabel={kidsCopy.skipLabel}', "        skipLabel={zzRenderSkip({ skipLabel: 'Skip' })}")
  editFile(
    PAGE,
    '    const kidsCopy = FIRST_RUN_COPY.kids\n',
    '    const kidsCopy = FIRST_RUN_COPY.kids\n    const zzRenderSkip = (kidsCopy: { skipLabel: string }) => kidsCopy.skipLabel\n',
  )
  pageText = readFileSync(PAGE, 'utf8')
  check(
    'seed 29 left a hard-coded word at the call site and the only skipLabel read inside the local (self-verifying)',
    pageText.includes("skipLabel={zzRenderSkip({ skipLabel: 'Skip' })}") &&
      pageText.includes('const zzRenderSkip = (kidsCopy: { skipLabel: string }) => kidsCopy.skipLabel') &&
      (pageText.match(/kidsCopy\.skipLabel/g) ?? []).length === 1,
    `kidsCopy.skipLabel occurrences: ${(pageText.match(/kidsCopy\.skipLabel/g) ?? []).length}`,
  )
  r = run()
  check(
    'a same-named local parameter does NOT manufacture consumption (A8 — the original defect, compiling)',
    r.exit !== 0 && /"\S*\.skipLabel"/.test(r.out) && !/does not PARSE/.test(r.out),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 30. fix 4 A9 — a REST-ELEMENT destructure of a copy value, then a read off
  //     the rest binding, is a REAL read. The name table knew the root
  //     `FIRST_RUN_COPY` but not the binding `zzRest`, so it reported both
  //     `skipLabel` fields READ BY NOTHING on code that compiles clean: a false
  //     alarm at the same style seed 9 and seed 21 exist to support. The checker
  //     knows what type `zzRest` has, and that is the whole question.
  //     ONE BASELINE: red against `340d016`, which exits 1 on this input.
  reset()
  editFile(PAGE, '        skipLabel={kidsCopy.skipLabel}', '        skipLabel={zzRest.skipLabel}')
  editFile(
    PAGE,
    '    const kidsCopy = FIRST_RUN_COPY.kids\n',
    '    const kidsCopy = FIRST_RUN_COPY.kids\n    const { ...zzRest } = FIRST_RUN_COPY.kids\n',
  )
  pageText = readFileSync(PAGE, 'utf8')
  check(
    'seed 30 left the read going through the rest binding only (self-verifying)',
    pageText.includes('const { ...zzRest } = FIRST_RUN_COPY.kids') &&
      pageText.includes('skipLabel={zzRest.skipLabel}') &&
      (pageText.match(/kidsCopy\.skipLabel/g) ?? []).length === 0,
    `kidsCopy.skipLabel occurrences: ${(pageText.match(/kidsCopy\.skipLabel/g) ?? []).length}`,
  )
  r = run()
  check(
    'a read off a REST-ELEMENT destructure of a copy value counts as consumption (A9 — fires on clean code)',
    r.exit === 0 && /read\s+— \S*\.skipLabel .*at src\/pages\/OnboardingPage\.tsx/.test(r.out),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 31. the header used to print a `namespace imports` label that no line of the
  //     rewrite emitted, and to claim a namespace import is a missed read. Both
  //     are now false in the safe direction: attribution goes through the value,
  //     so `import * as copy from …` then `copy.kids.skipLabel` is followed.
  //     ONE BASELINE: red against `340d016`, which reports the field READ BY
  //     NOTHING here (it only printed a `limit—— namespace import …` line).
  reset()
  addFile(
    path.join(sandbox, 'src', 'lib', 'zzNamespaceConsumer.ts'),
    "import * as copy from './firstRunCopy'\n\nexport const zzSkip = copy.FIRST_RUN_COPY.kids.skipLabel\n",
  )
  editFile(PAGE, '        skipLabel={kidsCopy.skipLabel}\n', '')
  r = run()
  check(
    'a NAMESPACE import is followed — the read is real, so the limit the old header printed is gone',
    r.exit === 0 && /read\s+— \S*\.skipLabel .*at src\/lib\/zzNamespaceConsumer\.ts/.test(r.out),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 32. the file walk matched only `.ts`/`.tsx` while the test-file rule accepted
  //     `[cm]?[jt]sx?`, so a `.mts` consumer would have been skipped without a
  //     word — a blind spot in the instrument, in the direction that hides a
  //     missed read. The two rules now share one extension set.
  //     ONE BASELINE: red against `340d016`, whose walk never opens the file.
  reset()
  addFile(
    path.join(sandbox, 'src', 'lib', 'zzMtsConsumer.mts'),
    "import { FIRST_RUN_COPY } from './firstRunCopy'\n\nexport const zzSkip = FIRST_RUN_COPY.kids.skipLabel\n",
  )
  editFile(PAGE, '        skipLabel={kidsCopy.skipLabel}\n', '')
  r = run()
  check(
    'a `.mts` consumer is in the walk (one extension set, shared by the walk and the test rule)',
    r.exit === 0 && /read\s+— \S*\.skipLabel .*at src\/lib\/zzMtsConsumer\.mts/.test(r.out),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // 33. the parse fence (K1c) used `sf.parseDiagnostics`, which is NOT in the
  //     public .d.ts — a TypeScript rename would have made it return "no parse
  //     errors", which looks exactly like a clean repo. It now uses
  //     `Program.getSyntacticDiagnostics` (public) behind an assertion that the
  //     method exists, so the fence goes loud rather than silent. This asserts
  //     the SOURCE, because the only way to exercise a renamed API is to rename
  //     it, and a seed that stubs TypeScript is not testing the guard.
  check(
    'the parse fence reads public API only — no `parseDiagnostics` outside comments (fix 4)',
    !/parseDiagnostics/.test(guardSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')) &&
      /getSyntacticDiagnostics/.test(guardSrc),
    'the guard must take parse errors from Program.getSyntacticDiagnostics, not the non-public sf.parseDiagnostics',
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
