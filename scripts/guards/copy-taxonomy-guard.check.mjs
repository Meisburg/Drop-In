#!/usr/bin/env node
/**
 * Self-check for the copy-taxonomy guard (V28 r2 slice 6d).
 *
 * WHY THIS FILE EXISTS, in run-all.sh's own words: *"A rule whose own behavior
 * is unchecked is a rule that can silently stop holding — a checker that matches
 * nothing looks exactly like a clean repo."* The guard passes on today's tree,
 * and a guard that passes is indistinguishable by eye from a guard that stopped
 * reading anything. So every half of every rule is seeded here, in a throwaway
 * copy of `src/`, and each seed requires the RIGHT exit code — and then the rule
 * itself is MUTATED and the seed is required to stop firing, which is what shows
 * the red came from that rule and not from something nearby.
 *
 * The seeds, one line each:
 *   - the tree as it stands passes, and the run reports the kinds, words, copy
 *     consts and declarations it derived (a run reporting none of those is the
 *     broken instrument, not a clean repo);
 *   - a WITHHELD kind's word added to a registered copy const is caught, and the
 *     finding names the kind (this is the acceptance seed: the word the app
 *     keeps out of a parent's way, in copy that reaches a parent);
 *   - a declaration naming a category the taxonomy does not have is caught;
 *   - a declaration naming a kind the app withholds is caught;
 *   - a declaration naming an offered kind whose word is nowhere in the copy is
 *     caught (a declaration drifted off the words it is about);
 *   - a category named in a registered module whose copy has no declaration at
 *     all is caught — the direction that makes the declarations more than a
 *     formality;
 *   - DELETING the declaration while the words still name categories is caught;
 *   - a registered copy const that is renamed, and one that is left with no
 *     string literal, are both caught (the instrument going blind in two ways);
 *   - a registered module that is deleted is caught;
 *   - a taxonomy walk that finds no kinds, and a label function that yields no
 *     word, are both caught;
 *   - a run that reads NO declaration anywhere is caught, even when the words
 *     name no category (the mechanism cannot quietly become empty);
 *   - a kind whose word cannot be told apart from the generic default is NOT
 *     judged, and the run SAYS SO on its own `limit——` line.
 *
 * THE MUTATIONS, and their anchors. Each is a textual replacement in a COPY of
 * the guard placed inside the sandbox, so the shipped guard carries no switch to
 * turn a rule off. The replacement requires its anchor exactly once: a renamed
 * or moved anchor FAILS the mutation seed instead of passing it, because a
 * mutation that silently did nothing would make the seed look like proof.
 *
 * Every seed asserts its own premise where it can (what it added, what still
 * stands), because a seed that passes for an unrelated reason is worse than no
 * seed at all.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const root = path.join(import.meta.dirname, '..', '..')
/** `COPY_TAXONOMY_GUARD_UNDER_TEST` runs these seeds against a DIFFERENT copy of
 *  the guard — used once, to show a seed fails against the code it was written
 *  for. It is not a way to make this check pass: the default is the guard in
 *  this repo, and the run says which file it used. */
const guard = process.env.COPY_TAXONOMY_GUARD_UNDER_TEST
  ? path.resolve(process.env.COPY_TAXONOMY_GUARD_UNDER_TEST)
  : path.join(root, 'scripts', 'guards', 'copy-taxonomy-guard.mjs')

if (!existsSync(guard)) {
  console.error(`check: guard missing at ${guard}`)
  process.exit(1)
}
if (!existsSync(path.join(root, 'src'))) {
  console.error('check: this must run from within the playdate-app repo (src/ missing)')
  process.exit(1)
}

const guardSrc = readFileSync(guard, 'utf8')
const sandbox = mkdtempSync(path.join(os.tmpdir(), 'copy-taxonomy-check-'))
cpSync(path.join(root, 'src'), path.join(sandbox, 'src'), { recursive: true })
// A mutated guard is written INSIDE the sandbox, so the sandbox needs the two
// things that guard imports: the repo's `node_modules` (for `typescript`) on
// node's resolution path, symlinked and never copied.
if (existsSync(path.join(root, 'node_modules'))) {
  symlinkSync(path.join(root, 'node_modules'), path.join(sandbox, 'node_modules'), 'dir')
}

const TOUR = path.join(sandbox, 'src', 'lib', 'firstRunTour.ts')
const COPY = path.join(sandbox, 'src', 'lib', 'firstRunCopy.ts')
const PLACES = path.join(sandbox, 'src', 'lib', 'places.ts')
const THEME = path.join(sandbox, 'src', 'lib', 'theme.ts')

const PLACES_LINE = "detail: 'look up a playground, a pool, a beach, and pick where to host',"
const DECLARES = "export const TOUR_TAXONOMY_CLAIMS: readonly PlaceKind[] = ['playground', 'pool', 'beach']"
const ACCOUNT_BODY =
  "body: 'Email and password — that is all it takes to start. The rest of the setup takes about a minute.',"

let failures = 0
let passes = 0
let guardRuns = 0
let mutationRuns = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    passes += 1
    console.log(`  ✓ ${name}`)
  } else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// Pristine snapshots, so each seed starts clean and a seed that deleted a file
// puts it back. The existence check is here and not inside the try: a renamed
// input used to crash a harness like this one with a stack trace and leave the
// sandbox behind, which reads as a harness that found nothing.
const pristine = new Map()
for (const file of [TOUR, COPY, PLACES, THEME]) {
  if (!existsSync(file)) {
    check(`seed input exists: ${path.relative(root, file)}`, false, 'missing — renamed or deleted; every seed anchored on it cannot run')
    continue
  }
  pristine.set(file, readFileSync(file, 'utf8'))
}
const reset = () => {
  for (const [file, text] of pristine) writeFileSync(file, text)
}

const occurrences = (text, find) => text.split(find).length - 1

/** Seeds anchor on exact literals in files this guard has a contract with, so
 *  the count is CHECKED rather than assumed: the expected number of occurrences
 *  or the seed itself failed, recorded as a failure and the run continues. */
function editFile(file, find, replace, expect = 1) {
  try {
    if (!existsSync(file)) throw new Error(`${path.relative(root, file)} does not exist`)
    const text = readFileSync(file, 'utf8')
    const found = occurrences(text, find)
    if (found !== expect) {
      throw new Error(
        `${JSON.stringify(find)} occurs ${found}× in ${path.relative(root, file)}, expected ${expect} — ` +
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

function run(script = guard) {
  guardRuns += 1
  try {
    const out = execSync(`node ${JSON.stringify(script)} ${JSON.stringify(sandbox)}`, { encoding: 'utf8', stdio: 'pipe' })
    return { exit: 0, out }
  } catch (e) {
    return { exit: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

/** A copy of the guard with ONE textual replacement made, written inside the
 *  sandbox. The anchor must occur exactly once — a mutation that matched nothing
 *  would leave the guard intact and the seed would look like proof of a rule it
 *  never exercised. */
function mutate(replacements) {
  const dir = path.join(sandbox, 'scripts', 'guards')
  mkdirSync(dir, { recursive: true })
  let text = guardSrc
  for (const [find, replace] of replacements) {
    if (occurrences(text, find) !== 1) {
      throw new Error(`mutation anchor ${JSON.stringify(find)} occurs ${occurrences(text, find)}× — the mutation would do nothing`)
    }
    text = text.replace(find, replace)
  }
  const file = path.join(dir, 'zz-mutated-guard.mjs')
  writeFileSync(file, text)
  return file
}

/** Run one seed against the shipped guard and then against the mutated one: the
 *  seed must find the finding, and the mutation must make it stop. `expect` is
 *  the fragment of the finding line the seed is about. */
function rule(name, expect, mutation, seed) {
  reset()
  seed()
  const before = run()
  check(`${name} — the seed is CAUGHT`, before.exit === 1 && before.out.includes(expect), `exit ${before.exit}: ${findingLines(before.out) || '(no findings)'}`)
  let script
  try {
    script = mutate(mutation)
  } catch (e) {
    check(`${name} — MUTATION: the rule can be removed (so the seed proves it)`, false, e instanceof Error ? e.message : String(e))
    return
  }
  mutationRuns += 1
  const after = run(script)
  check(`${name} — MUTATION: dropping the rule lets that seed PASS (so the check can fail)`, after.exit === 0, `exit ${after.exit}: ${findingLines(after.out)}`)
}

let r = { exit: 0, out: '' }
try {
  // --- the tree as it stands -------------------------------------------------
  reset()
  const clean = run()
  check(
    'the tree passes, and the run reports the taxonomy, the words and the declarations it derived',
    clean.exit === 0 &&
      /kinds read: 10; offered: 8; words: 9/.test(clean.out) &&
      /declared claims: 3 \(playground, pool, beach\)/.test(clean.out) &&
      /copy consts read: 4; declared claims: 3/.test(clean.out),
    `exit ${clean.exit}: ${clean.out.split('\n').slice(2, 6).join(' | ')}`,
  )
  check(
    'the run reports how many copy consts it read, so a const dropping out of the walk cannot read as clean',
    /module: src\/lib\/firstRunCopy\.ts\n  copy consts read: 2/.test(clean.out),
    clean.out.split('\n').filter((l) => l.includes('copy consts read')).join(' | '),
  )

  // --- rule 4: a withheld kind's word in the copy ----------------------------
  rule(
    'a withheld kind named in the copy (the acceptance seed)',
    'the copy names "Park" — the taxonomy kind "park", a kind the app WITHHOLDS',
    [['.filter((word) => matchesCopy(word, text))', '.filter(() => false)']],
    () => editFile(TOUR, PLACES_LINE, "detail: 'look up a playground, a pool, a beach, a park, and pick where to host',"),
  )

  // --- rule 1: a declared category the taxonomy lacks ------------------------
  rule(
    'a declaration naming a category the taxonomy does not have',
    'the declaration names the category "zoo", which PLACE_KINDS does not have',
    [['!allKindSet.has(kind)', 'false']],
    () => editFile(TOUR, DECLARES, "export const TOUR_TAXONOMY_CLAIMS: readonly PlaceKind[] = ['playground', 'pool', 'beach', 'zoo']"),
  )

  // --- rule 2: a declared kind the app withholds -----------------------------
  rule(
    'a declaration naming a kind the app withholds',
    'the declaration names "park", a kind the app WITHHOLDS',
    [['!offeredKindSet.has(kind)', 'false']],
    () => {
      editFile(TOUR, DECLARES, "export const TOUR_TAXONOMY_CLAIMS: readonly PlaceKind[] = ['playground', 'pool', 'beach', 'park']")
      editFile(TOUR, PLACES_LINE, "detail: 'look up a playground, a pool, a beach, a park, and pick where to host',")
    },
  )

  // --- rule 3: a declaration the words do not back ---------------------------
  rule(
    'a declaration naming an offered kind that appears nowhere in the copy',
    'the declaration names "museum", whose word "Museum" appears nowhere',
    [['!matchesCopy(word, text)', 'false']],
    () => editFile(TOUR, DECLARES, "export const TOUR_TAXONOMY_CLAIMS: readonly PlaceKind[] = ['playground', 'pool', 'beach', 'museum']"),
  )

  // --- rule 4 again, in a module that declares nothing -----------------------
  rule(
    'a withheld kind named in a registered module whose copy declares nothing',
    'the copy names "Park"',
    [['.filter((word) => matchesCopy(word, text))', '.filter(() => false)']],
    () => editFile(COPY, ACCOUNT_BODY, "body: 'Find a park near you, then add a place.',"),
  )

  // --- rule 4 again, with a declaration that names too FEW categories -------
  rule(
    'a declaration that names fewer categories than the words do',
    'the copy names "Pool"',
    [['.filter((word) => matchesCopy(word, text))', '.filter(() => false)']],
    () => editFile(TOUR, DECLARES, "export const TOUR_TAXONOMY_CLAIMS: readonly PlaceKind[] = ['playground']"),
  )

  // --- the declaration deleted, with the words still naming categories -------
  reset()
  editFile(TOUR, `${DECLARES}\n\n`, '')
  r = run()
  check(
    'the declaration deleted while the words still name categories is a finding on both counts',
    r.exit === 1 &&
      r.out.includes('"TOUR_TAXONOMY_CLAIMS" is not an exported array of string literals') &&
      r.out.includes('the copy names "Playground"'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // --- the instrument going blind -------------------------------------------
  reset()
  editFile(TOUR, "export const TOUR_PROGRESS_LABEL = 'All done'", 'export const TOUR_PROGRESS_LABEL_X = \'All done\'')
  r = run()
  check(
    'a registered copy const that was renamed is a finding (not a silent drop)',
    r.exit === 1 && r.out.includes('the copy const "TOUR_PROGRESS_LABEL" is not an exported top-level const'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  reset()
  editFile(TOUR, "export const TOUR_TITLE = 'How Drop In works'", "export const TOUR_TITLE = zzTitleFromSomewhere")
  r = run()
  check(
    'a registered copy const left with no string literal is a finding',
    r.exit === 1 && r.out.includes('"TOUR_TITLE" carries no string literal at all'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  reset()
  rmSync(THEME)
  r = run()
  check(
    'a registered module that is gone is a finding',
    r.exit === 1 && r.out.includes('src/lib/theme.ts: the copy module this guard is configured to judge is GONE'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  reset()
  editFile(PLACES, 'export const PLACE_KINDS = [', 'export const PLACE_KINDS = []\nconst ZZUNUSED_KINDS = [')
  r = run()
  check(
    'a taxonomy walk that reads no kinds is a finding',
    r.exit === 1 && r.out.includes('no PLACE_KINDS array of string literals'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  reset()
  editFile(PLACES, 'export function placeKindLabel(kind: PlaceKind | string): string {', 'export function placeKindLabelGone(kind: PlaceKind | string): string {')
  r = run()
  check(
    'a label function that yields no word is a finding',
    r.exit === 1 && r.out.includes('yielded no kind word'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  reset()
  editFile(TOUR, DECLARES, '')
  editFile(TOUR, PLACES_LINE, "detail: 'look up a place, and pick where to host',")
  r = run()
  check(
    'a run that reads no declaration anywhere is a finding, even when the words name no category',
    r.exit === 1 && r.out.includes('no declaration was read from any registered module'),
    `exit ${r.exit}: ${findingLines(r.out)}`,
  )

  // --- the stated limit is IN THE RUN, not only in the header ----------------
  reset()
  editFile(PLACES, "    case 'beach':\n      return 'Beach'\n", '')
  r = run()
  check(
    'a kind whose word collapses to the generic default is not judged, and the run prints its limit line',
    r.exit === 0 && r.out.includes('limit—— kind "beach" is not scannable'),
    `exit ${r.exit}: ${r.out.split('\n').filter((l) => l.includes('limit——')).join(' | ') || '(no limit line)'}`,
  )

  // --- the check itself is not vacuous --------------------------------------
  reset()
  check(
    'the seeds left the tree as it was — the clean run still passes at the end',
    run().exit === 0,
    'a seed leaked into the tree and the final run is red',
  )
} finally {
  reset()
  rmSync(sandbox, { recursive: true, force: true })
}

if (failures > 0) {
  console.error(
    `copy-taxonomy-guard check: ${failures} check(s) failed — the guard is not catching its defect class.`,
  )
  process.exit(1)
}
console.log(
  `copy-taxonomy-guard check: all ${passes} checks passed, 0 failed, across ${guardRuns} guard invocations ` +
    `(${mutationRuns} of them against a mutated copy of the guard).`,
)
