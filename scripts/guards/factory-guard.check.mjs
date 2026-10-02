#!/usr/bin/env node
// Behavior check for factory-guard.mjs — every rule must be shown to FIRE.
//
// WHY THIS EXISTS. A guard that matches nothing looks exactly like a clean
// repository. This is the same doctrine the regexp-escape guard's checker
// carries, applied to the factory: for each rule the guard claims to enforce,
// build the failing world, run the guard against it, and require a non-zero
// exit naming that rule. A rule whose check cannot fail is a comment.
//
// It runs against throwaway roots under the system temp dir, never the repo —
// `--root` is the seam that makes that possible, and it is why the guard takes
// a root at all.
//
// Usage: node scripts/guards/factory-guard.check.mjs
// Exit:  0 = every rule fired, 1 = at least one rule is not doing its job

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

const GUARD = join(import.meta.dirname, 'factory-guard.mjs')
const REAL_CONFIG = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'factory', 'config.json'), 'utf8'))

const lanes = (over = {}) => ({
  implementation: { state: 'pending' },
  verification: { state: 'pending' },
  review: { state: 'pending' },
  visual_validation: { state: 'pending' },
  acceptance: { state: 'blocked' },
  ...over,
})

/** Build a throwaway root and let `mutate` write its contents. `guard` and
 * `args` are the seams the mutation checks below need: a mutated COPY of the
 * instrument, and `--repo <dir>` so a temp root with no `.git` can still have
 * its provenance shas resolved (see the guard header's not-a-worktree note). */
function run(mutate, { guard = GUARD, args = [], report = true } = {}) {
  const root = mkdtempSync(join(os.tmpdir(), 'factory-guard-'))
  const write = (rel, value) => {
    const path = join(root, rel)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`)
  }
  try {
    mutate({ root, write })
    // Every root the report/brief scan reads must CARRY a report: a scan that
    // read no file is now a finding (D-030). This file makes no claim the rules
    // below read (no bare HEAD, no provenance sha, no label), so it changes no
    // verdict except the empty scan's; `report: false` reaches that state.
    if (report) write('.scratch/v28/reports/zz-check-root.md', '# zz-check root — a clean report file; it makes no claim\n')
    const out = execFileSync('node', [guard, '--root', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { exit: 0, out }
  } catch (e) {
    return { exit: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

/**
 * A throwaway COPY of the instrument with named textual mutations applied. This
 * is how a check proves it CAN fail: mutate the mechanism the check names, run
 * the same seeded root against the mutant, and require the seed's verdict to
 * flip. A check whose named failure mode cannot be reached by any mutation is a
 * claim, not a check — which is why the mutation count is asserted here: an
 * anchor that no longer exists is a silent no-op, and a silent no-op would make
 * every mutation check below pass vacuously.
 */
const SCRATCH_DIRS = [] // mutant copies AND scratch roots — not only mutants (D-024)
function mutatedGuard(replacements) {
  let text = readFileSync(GUARD, 'utf8')
  for (const [from, to] of replacements) {
    const hits = text.split(from).length - 1
    if (hits !== 1) throw new Error(`mutation anchor occurs ${hits} time(s), not once: ${JSON.stringify(from)}`)
    text = text.split(from).join(to)
  }
  const dir = mkdtempSync(join(os.tmpdir(), 'factory-guard-mutant-'))
  SCRATCH_DIRS.push(dir)
  const path = join(dir, 'factory-guard.mutant.mjs')
  writeFileSync(path, text)
  return path
}

/** A real repository for `--repo`: this repo, which the provenance shas live in. */
const REPO = resolve(import.meta.dirname, '..', '..')

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

/** A clean root: the real registry, one work item whose artifact exists. */
const cleanRoot = (extra = {}) => ({ write }) => {
  write('factory/config.json', REAL_CONFIG)
  write('factory/work/w1.json', {
    id: 'w1',
    title: 'clean',
    plan_ref: 'plan.md',
    depends_on: [],
    lanes: lanes({ implementation: { state: 'complete' } }),
    ...extra,
  })
  write('notes/evidence.md', 'on disk\n')
}

console.log('factory-guard behavior check — every rule must be able to fail')
console.log('===========================================================')

// 0. The clean world passes. A guard that only ever fails is not a guard.
{
  const result = run(cleanRoot())
  check('a clean registry with a present artifact passes', result.exit === 0 && /PASS/.test(result.out), `exit ${result.exit}`)
}

// 1. registry-fields — an unlabelled footprint reads as a measured one.
{
  const result = run((ctx) => {
    cleanRoot()(ctx)
    const config = JSON.parse(JSON.stringify(REAL_CONFIG))
    delete config.models['strata-max/qwen3.8-flash-next-iq3_s'].resources.footprint_source
    ctx.write('factory/config.json', config)
  })
  check('a model with no footprint_source is CAUGHT', result.exit === 1 && /registry-fields/.test(result.out), `exit ${result.exit}`)
}

// 2. floors-meetable — a floor above every model makes `route` unsatisfiable by construction.
{
  const result = run((ctx) => {
    cleanRoot()(ctx)
    const config = JSON.parse(JSON.stringify(REAL_CONFIG))
    config.task_kinds.impossible = { capabilities: { reasoning: 9 }, resources: { ram_gb: 1, footprint_source: 'measured' } }
    ctx.write('factory/config.json', config)
  })
  check('a capability floor no model can meet is CAUGHT', result.exit === 1 && /floors-meetable/.test(result.out), `exit ${result.exit}`)
}

// 3. lane-states-legal — an unreachable state is how a work item stops moving.
{
  const result = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('factory/work/w1.json', { id: 'w1', title: 'x', plan_ref: 'p', lanes: lanes({ review: { state: 'mostly-done' } }) })
  })
  check('an illegal lane state is CAUGHT', result.exit === 1 && /lane-states-legal/.test(result.out), `exit ${result.exit}`)
}

// 4. acceptance-not-early — THE rule the orchestrator must not be able to talk past.
{
  const result = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('factory/work/w1.json', {
      id: 'w1',
      title: 'x',
      plan_ref: 'p',
      lanes: lanes({ implementation: { state: 'complete' }, verification: { state: 'complete' }, review: { state: 'running' }, acceptance: { state: 'pass' } }),
    })
  })
  check('acceptance=pass with review still running is CAUGHT', result.exit === 1 && /acceptance-not-early/.test(result.out), `exit ${result.exit}`)
}

// 5. waived-has-reason — a waiver is a written decision, never a silent green.
{
  const result = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('factory/work/w1.json', { id: 'w1', title: 'x', plan_ref: 'p', lanes: lanes({ review: { state: 'waived' } }) })
  })
  check('a waived lane with no reason is CAUGHT', result.exit === 1 && /waived-has-reason/.test(result.out), `exit ${result.exit}`)
}

// 6. artifacts-exist — the one with teeth.
{
  const result = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('factory/work/w1.json', {
      id: 'w1',
      title: 'x',
      plan_ref: 'p',
      lanes: lanes({ implementation: { state: 'complete', artifacts: ['notes/evidence.md', 'notes/never-written.md'] } }),
    })
  })
  check('an artifact named but not on disk is CAUGHT', result.exit === 1 && /artifacts-exist/.test(result.out) && /never-written\.md/.test(result.out), `exit ${result.exit}`)
  // And the same item is clean when the file IS there, so the check is not simply always red.
  const clean = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('factory/work/w1.json', {
      id: 'w1',
      title: 'x',
      plan_ref: 'p',
      lanes: lanes({ implementation: { state: 'complete', artifacts: ['notes/evidence.md'] } }),
    })
  })
  check('the same item passes when the artifact exists (control)', clean.exit === 0, `exit ${clean.exit}`)
}

// 7. deps-exist — a dependency graph with a dangling node cannot be scheduled.
{
  const result = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('factory/work/w1.json', { id: 'w1', title: 'x', plan_ref: 'p', depends_on: ['ghost'], lanes: lanes() })
  })
  check('a depends_on naming no work item is CAUGHT', result.exit === 1 && /deps-exist/.test(result.out), `exit ${result.exit}`)
}

// 8. agent-model-in-registry — a default that drifts out of the registry is a
//    hardcoded role again, which is what capability routing removed.
{
  const result = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.opencode/agents/orchestrator-something.md', '---\nname: x\nmodel: some-vendor/some-model-nobody-registered\n---\n')
  })
  check('an agent default naming an unregistered model is CAUGHT', result.exit === 1 && /agent-model-in-registry/.test(result.out), `exit ${result.exit}`)
}

// 9. health-declared — a model with no availability probe is a fallback that
//    fails late, which is exactly what fr-1 did while carrying cost_tier 1.
{
  const result = run((ctx) => {
    cleanRoot()(ctx)
    const config = JSON.parse(JSON.stringify(REAL_CONFIG))
    delete config.models['fr-1/glm-4.7-flash:latest'].health
    ctx.write('factory/config.json', config)
  })
  check('a model with no health probe is CAUGHT', result.exit === 1 && /health-declared/.test(result.out), `exit ${result.exit}`)
}

// 10. residency-declared — an undeclared residency is a machine nobody described.
{
  const result = run((ctx) => {
    cleanRoot()(ctx)
    const config = JSON.parse(JSON.stringify(REAL_CONFIG))
    config.models['ninfer/qwen3.8-27b'].residency = 'sometimes'
    ctx.write('factory/config.json', config)
  })
  check('an illegal residency value is CAUGHT', result.exit === 1 && /residency-declared/.test(result.out), `exit ${result.exit}`)
}

// 11. one-resident-local — two residents would be a registry contradicting the
//     hardware: local models share `exclusive: local-inference` and cannot coexist.
{
  const result = run((ctx) => {
    cleanRoot()(ctx)
    const config = JSON.parse(JSON.stringify(REAL_CONFIG))
    config.models['ninfer/qwen3.8-27b'].residency = 'resident'
    config.policies.residency.resident.push('ninfer/qwen3.8-27b')
    ctx.write('factory/config.json', config)
  })
  check('two models declared resident at once is CAUGHT', result.exit === 1 && /one-resident-local/.test(result.out), `exit ${result.exit}`)
}

// 12. reclaim-opt-in / remote-verified — the two policy decisions (D-003, D-004)
//     that must not be quietly relaxed to make a red gate green.
{
  const result = run((ctx) => {
    cleanRoot()(ctx)
    const config = JSON.parse(JSON.stringify(REAL_CONFIG))
    config.policies.reclaim = 'auto'
    ctx.write('factory/config.json', config)
  })
  check('turning reclaim automatic is CAUGHT', result.exit === 1 && /reclaim-opt-in/.test(result.out), `exit ${result.exit}`)

  const result2 = run((ctx) => {
    cleanRoot()(ctx)
    const config = JSON.parse(JSON.stringify(REAL_CONFIG))
    delete config.policies.remote_verification
    ctx.write('factory/config.json', config)
  })
  check('dropping the remote-verification requirement is CAUGHT', result2.exit === 1 && /remote-verified/.test(result2.out), `exit ${result2.exit}`)
}

// 13. independence-satisfiable — a lane demanding same_model:false with only one
//     qualified model is a rule that cannot be obeyed. It must be acknowledged.
{
  const result = run((ctx) => {
    cleanRoot()(ctx)
    const config = JSON.parse(JSON.stringify(REAL_CONFIG))
    delete config.task_kinds.reviewer._independence_gap
    ctx.write('factory/config.json', config)
  })
  check('an unacknowledged independence gap is CAUGHT', result.exit === 1 && /independence-satisfiable/.test(result.out), `exit ${result.exit}`)

  // Control: the same registry WITH the acknowledgement passes, so the rule is
  // a demand for a decision, not a demand for a particular registry.
  const control = run(cleanRoot())
  check('the acknowledged gap passes (control)', control.exit === 0, `exit ${control.exit}`)
}

// 14. instrument-headers-honest — a header is the statement of what the guard
//     covers, so a header that types a count of its own cases goes stale the
//     moment the file grows, and a header that claims its own prose changed with
//     no commit to check is the claim that turned out false. Three roots: the
//     typed count, that exact sentence, and a control that keeps both the
//     vocabulary and the number out of it by pointing at a commit.
{
  const TYPED = '#!/usr/bin/env node\n// zz-seeded — all 9 checks passed on a clean tree.\nprocess.exit(0)\n'
  const HISTORY =
    '#!/usr/bin/env node\n// zz-seeded — a typed count in this header went stale once already.\nprocess.exit(0)\n'
  const HONEST = '#!/usr/bin/env node\n// zz-honest — prints its own totals at run time; the map of what it covers is\n// the numbered list in the usage line.\nprocess.exit(0)\n'
  const HONEST_POINTED =
    '#!/usr/bin/env node\n// zz-honest-pointed — the typed count in this header used to be wrong and was corrected at c2ec32e.\nprocess.exit(0)\n'

  const typed = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('scripts/guards/zz-seeded.mjs', TYPED)
  })
  check(
    'a header that types a count of its own cases is CAUGHT',
    typed.exit === 1 && /instrument-headers-honest/.test(typed.out),
    `exit ${typed.exit}`,
  )

  const history = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('scripts/guards/zz-seeded.mjs', HISTORY)
  })
  check(
    'a header claiming its own text changed with no commit to check is CAUGHT',
    history.exit === 1 && /instrument-headers-honest/.test(history.out),
    `exit ${history.exit}`,
  )

  // Control: the second header carries BOTH the count vocabulary and a
  // staleness claim, and passes because the claim names a hex-shaped commit
  // pointer. The rule is about the pointer's SHAPE, not about the words — a rule
  // that fired on the words alone would fire on this repo's own headers.
  const honest = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('scripts/guards/zz-honest.mjs', HONEST)
    ctx.write('scripts/guards/zz-honest-pointed.mjs', HONEST_POINTED)
  })
  check('the same root with honest headers passes (control)', honest.exit === 0, `exit ${honest.exit}`)
}

// 15. instrument-headers-honest — a BLANK line inside the header block must not
//     end the scan. It used to: an empty line is not a comment, so the scan
//     stopped and a typed count after it went unflagged. Seeded with exactly
//     that shape (the gap the reviewer found latent in the scan).
{
  const BLANK_THEN_TYPED =
    '#!/usr/bin/env node\n// zz-seeded — the first header comment.\n\n// all 9 checks passed after a blank line.\nprocess.exit(0)\n'
  const result = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('scripts/guards/zz-blank.mjs', BLANK_THEN_TYPED)
  })
  check(
    'a typed count AFTER a blank line in the header is CAUGHT',
    result.exit === 1 && /instrument-headers-honest/.test(result.out),
    `exit ${result.exit}`,
  )
}

// 16. The summary line claims only the checks that actually ran. A root with no
//     scripts/guards has no instrument header to vouch for, and a summary that
//     claims a check it skipped is the failure this whole guard is about.
{
  const bare = run(cleanRoot())
  check(
    'with no scripts/guards the summary does NOT claim the headers were checked',
    bare.exit === 0 && /PASS/.test(bare.out) && !/ok — .*instrument header/.test(bare.out),
    `exit ${bare.exit}`,
  )
  const withHeaders = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('scripts/guards/zz-honest.mjs', '#!/usr/bin/env node\n// zz-honest — prints its own totals at run time.\nprocess.exit(0)\n')
  })
  check(
    'with a scanned guard the summary DOES claim the headers were checked (control)',
    withHeaders.exit === 0 && /ok — .*every instrument header stating only what it can point at/.test(withHeaders.out),
    `exit ${withHeaders.exit}`,
  )
}

// 17. no-bare-head-count — a count labelled HEAD in a report or a brief cannot be
//     reproduced: the commit that carries the sentence is the one that moves
//     HEAD. Forward-only (D-011 item 2), so a recorded historical label still
//     passes; a report that names its commit passes. A rule whose check cannot
//     fail is a comment.
{
  const seeded = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-seeded.md', 'The tree holds 276 tracked `.scratch` files at HEAD.\n')
  })
  check(
    'a report labelling a count HEAD is CAUGHT',
    seeded.exit === 1 && /no-bare-head-count/.test(seeded.out),
    `exit ${seeded.exit}`,
  )

  const baselined = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/slice-6c-fix-1-review.md', 'measured across the lane: 265 at HEAD, listed for the record\n')
  })
  check(
    'a RECORDED historical label still passes (D-011 control)',
    baselined.exit === 0,
    `exit ${baselined.exit}`,
  )

  const dated = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-dated.md', 'The tree held 276 tracked `.scratch` files at 71bdd55.\n')
  })
  check(
    'a report naming the commit it measured at passes (control)',
    dated.exit === 0,
    `exit ${dated.exit}`,
  )
}

// 18. no-bare-head-count — the WIDENED class. The old pattern matched only
//     `N at HEAD`, so `git ls-tree … HEAD | wc -l` and `git show HEAD:<path>`
//     were invisible. These seeds are those shapes, plus the per-line counting
//     fix (F2): a SECOND occurrence appended to an already-counted line must be
//     seen, and the old `.exec()` could not see it.
{
  const lsd = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-head-tree.md', '$ git ls-tree -r --name-only HEAD .scratch | wc -l\n280\n')
  })
  check(
    'a `git ls-tree` count against a bare moving revision is CAUGHT (widened shape)',
    lsd.exit === 1 && /no-bare-head-count/.test(lsd.out),
    `exit ${lsd.exit}`,
  )

  const shown = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-head-show.md', 'before (`git show HEAD:scripts/guards/factory-guard.mjs`): `grep -c x` -> `0`\n')
  })
  check(
    'a `git show <rev>:` read against a bare moving revision is CAUGHT (widened shape)',
    shown.exit === 1 && /no-bare-head-count/.test(shown.out),
    `exit ${shown.exit}`,
  )

  const countedDefault = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-head-log.md', '$ git log --oneline | wc -l\n412\n')
  })
  check(
    'a counted command defaulting to a bare moving revision is CAUGHT',
    countedDefault.exit === 1 && /no-bare-head-count/.test(countedDefault.out),
    `exit ${countedDefault.exit}`,
  )

  // Control: the same three shapes naming a commit all pass, so the rule is
  // about bare HEAD, not about git verbs or counters.
  const named = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write(
      '.scratch/v28/reports/zz-named.md',
      '$ git ls-tree -r --name-only 876a516 .scratch | wc -l\n281\n' +
        'before (`git show 876a516:scripts/guards/factory-guard.mjs`): `grep -c x` -> `1`\n' +
        '$ git log --oneline 876a516 | wc -l\n5\n',
    )
  })
  check('the same shapes naming the commit pass (control)', named.exit === 0, `exit ${named.exit}`)

  // F2: this key's recorded baseline is 2 (a historical lane file). The seed
  // writes THREE occurrences, TWO of them on one line — single-match counting
  // sees two and passes, counting every match sees three and fails — and the
  // mutation below restores single-match counting and turns the seed green,
  // which is what makes per-line counting load-bearing rather than claimed.
  const doubledSeed = (ctx) => {
    cleanRoot()(ctx)
    ctx.write(
      '.scratch/v28/reports/slice-6c-fix-1-review.md',
      'first: 265 at HEAD\n' +
        'two here: 265 at HEAD "then" 265 at HEAD\n',
    )
  }
  const doubled = run(doubledSeed)
  check(
    'a SECOND occurrence on an already-counted line is CAUGHT (per-line counting)',
    doubled.exit === 1 && /no-bare-head-count/.test(doubled.out),
    `exit ${doubled.exit}`,
  )
  const singleMatch = mutatedGuard([['for (const match of line.matchAll(BARE_HEAD_COUNT)) {', 'for (const match of [line.match(new RegExp(BARE_HEAD_COUNT.source))].filter(Boolean)) {']])
  const doubledMiss = run(doubledSeed, { guard: singleMatch })
  check(
    'MUTATION: restoring single-match counting lets that seed PASS (so per-line counting is load-bearing)',
    doubledMiss.exit === 0,
    `exit ${doubledMiss.exit}`,
  )

  // The `@` shorthand — a declared arm that used to be DEAD. Both composed
  // patterns ended in `\b`, and `@` ends in a non-word character, so the `@`
  // arm matched nothing while MOVING_REV still listed it. It is now `(?![\w])`.
  const atForm = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write(
      '.scratch/v28/reports/zz-head-at.md',
      '$ git ls-tree -r --name-only @ .scratch | wc -l\n280\n' +
        '$ git show @:scripts/guards/factory-guard.mjs | wc -l\n500\n' +
        '280 tracked files at @\n',
    )
  })
  check(
    'the `@` shorthand (a git read and a count label) is CAUGHT',
    atForm.exit === 1 && /no-bare-head-count/.test(atForm.out),
    `exit ${atForm.exit}`,
  )

  // N2, REPAIRED. `@{2}` is a moving revision in its own right — measured,
  // `git rev-parse @{2}` == `git rev-parse HEAD@{2}` — and until the bounded
  // repair the `@` lookahead suppressed the bare reflog form while the header
  // called `@` a moving revision. The seed below fires, matched by the `@`
  // alternative whose END assertion admits `{` (there is no separate `@{…}` arm).
  // The mutation RE-ADDS the round-5 lookahead, which is the mechanism the seed
  // depends on: with it back, `@{2}` is suppressed again and the seed PASSES.
  const bareReflog = (ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-reflog.md', 'The tree held 276 tracked files at @{2}.\n')
  }
  const reflogRun = run(bareReflog)
  check(
    'a bare `@{2}` reflog label is CAUGHT (a moving revision, N2)',
    reflogRun.exit === 1 && /no-bare-head-count/.test(reflogRun.out),
    `exit ${reflogRun.exit}`,
  )
  const noBareReflog = mutatedGuard([['|@`', '|@(?![{\\w])`']])
  const reflogMiss = run(bareReflog, { guard: noBareReflog })
  check(
    'MUTATION: re-adding the round-5 `@` lookahead lets that seed PASS (so the check can fail)',
    reflogMiss.exit === 0,
    `exit ${reflogMiss.exit}`,
  )

  // The false-positive control for the `@` token. `@` followed by a word
  // character is not a standalone token, and the mechanism that says so is the
  // token's own END assertion — no separate lookahead. The control root carries
  // a decorator and a count so the failure mode is REACHABLE: the mutation
  // removes the end assertion and the root goes red.
  const notARevision = (ctx) => {
    cleanRoot()(ctx)
    ctx.write(
      '.scratch/v28/reports/zz-not-a-rev.md',
      'write to user@example.com about it\n' +
        'the @decorator style was used in 4 files\n' +
        'the count is 5 at user@example.com\n',
    )
  }
  const notARevisionRun = run(notARevision)
  check(
    'an email and a @decorator next to a count are NOT flagged (control)',
    notARevisionRun.exit === 0,
    `exit ${notARevisionRun.exit}`,
  )
  const looseEnd = mutatedGuard([['working (?:tree|copy|directory))(?!\\w)', 'working (?:tree|copy|directory))']])
  const atControlFired = run(notARevision, { guard: looseEnd })
  check(
    'MUTATION: dropping the token END assertion turns that control red (so the control CAN fail)',
    atControlFired.exit === 1 && /no-bare-head-count/.test(atControlFired.out),
    `exit ${atControlFired.exit}`,
  )
}


// 19. no-bare-head-count, ARM 1 — widened from a set of English PHRASINGS to the
//     moving-rev TOKEN adjacent to a count in EITHER word order. Round 5's arm
//     matched the literal word `at` after the number, so it PASSED the reverse
//     order — a shape live in the corpus at
//     `.scratch/v28/reports/slice-6b-fix-1.md:292` — and it could not spell a
//     label like (tracked), src/lib or .scratch. Every case below is paired with
//     the mutation that reaches its failure mode, `wordClass` included — the
//     reviewer's own pairing (the gap window `{0,5}`→`{0,0}`) is the mutation
//     here, so the seed is a paired case rather than a declared exception.
{
  const reverseOrder = (ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-rev-order.md', 'brief; at HEAD the corpus reports 90 documents / 7 claims / 97 quotations. Nothing regressed —\n')
  }
  const reverse = run(reverseOrder)
  check(
    'a count AFTER a bare moving revision is CAUGHT (either word order)',
    reverse.exit === 1 && /no-bare-head-count/.test(reverse.out),
    `exit ${reverse.exit}`,
  )
  const forwardOnly = mutatedGuard([['|${REV_TOKEN}${COUNT_GAP}${COUNT_TOKEN}', '']])
  const missed = run(reverseOrder, { guard: forwardOnly })
  check(
    'MUTATION: dropping the reverse alternative lets that seed PASS (so the check can fail)',
    missed.exit === 0,
    `exit ${missed.exit}`,
  )

  const wordClassSeed = (ctx) => {
    cleanRoot()(ctx)
    ctx.write(
      '.scratch/v28/reports/zz-wordclass.md',
      '280 tracked `.scratch` files at HEAD\n280 files in src/lib at HEAD\n280 files (tracked) at HEAD\n87, taken at HEAD\nthe count was 87 as of HEAD\n',
    )
  }
  const wordClass = run(wordClassSeed)
  check(
    'labels the round-5 word class could not spell are CAUGHT',
    wordClass.exit === 1 && /no-bare-head-count/.test(wordClass.out),
    `exit ${wordClass.exit}`,
  )
  const narrowWindow = mutatedGuard([['{0,5}', '{0,0}']])
  const wordClassMiss = run(wordClassSeed, { guard: narrowWindow })
  check(
    'MUTATION: narrowing the gap window to {0,0} lets that seed PASS (so the window is load-bearing)',
    wordClassMiss.exit === 0,
    `exit ${wordClassMiss.exit}`,
  )

  // The reachable control for ARM 1's proximity window: the same two tokens in
  // one sentence, far enough apart that the number's subject is not the
  // revision. It passes — and the mutation below turns it red, which is what
  // makes the window a control rather than a claim.
  const farApart = (ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-far.md', 'HEAD is the moving revision this rule is about, and this report measured 231 files in total.\n')
  }
  const far = run(farApart)
  check('a moving revision and a number >4 tokens away are NOT flagged (control)', far.exit === 0, `exit ${far.exit}`)
  const wideWindow = mutatedGuard([["(?:\\s[^\\s'\"“”]+){0,5}\\s+", "(?:\\s[^\\s'\"“”]+){0,60}\\s+"]])
  const overMatch = run(farApart, { guard: wideWindow })
  check(
    'MUTATION: widening ARM 1\'s window turns that control red (over-matching is reachable)',
    overMatch.exit === 1 && /no-bare-head-count/.test(overMatch.out),
    `exit ${overMatch.exit}`,
  )

  // The revision-token boundary. `MERGE_HEAD` and `ORIG_HEAD` hold the bare
  // token as a substring and are other moving refs (a disclosed ceiling), and
  // `<HEAD>` is how a report names the bare token while quoting it. Neither is
  // read as a revision. This control is REACHABLE — dropping the left token
  // boundary turns it red below — which is the repair for round 5's unreachable
  // `@` control.
  const placeholder = (ctx) => {
    cleanRoot()(ctx)
    ctx.write(
      '.scratch/v28/reports/zz-placeholder.md',
      'the header names MERGE_HEAD and this lane measured 276 files with it\nthe header writes the placeholder `<HEAD>` and this lane measured 276 files with it\n',
    )
  }
  const held = run(placeholder)
  check('the `MERGE_HEAD` substring and the `<HEAD>` placeholder are NOT flagged (control)', held.exit === 0, `exit ${held.exit}`)
  const looseBoundary = mutatedGuard([['(?<![\\w<])', '']])
  const fired = run(placeholder, { guard: looseBoundary })
  check(
    'MUTATION: dropping the token boundary turns that control red (so the control CAN fail)',
    fired.exit === 1 && /no-bare-head-count/.test(fired.out),
    `exit ${fired.exit}`,
  )
}

// 20. count-provenance-unresolvable — THE DECIDABLE HALF. A count's provenance is
//     a commit sha, and the sha is CHECKED against a real repository instead of
//     guessed at. `N at <valid sha>` passes; `N at <bogus sha>` fails. This is
//     the ceiling D-021 closed: "a wrong named commit" was declared for five
//     rounds and now produces a finding — a NEW one; the historical quotations
//     the absorber holds (D-023) are the header's business, not this section's.
{
  const canonical = (sha) => (ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-canon.md', `The tree held 276 tracked \`.scratch\` files at ${sha}.\n`)
  }
  const valid = run(canonical('1c3471a'), { args: ['--repo', REPO] })
  check(
    'a count naming a sha that IS a commit passes (canonical form accepted)',
    valid.exit === 0,
    `exit ${valid.exit}`,
  )
  const bogus = run(canonical('deadbee'), { args: ['--repo', REPO] })
  check(
    'a count naming a sha that is NOT a commit is CAUGHT',
    bogus.exit === 1 && /count-provenance-unresolvable/.test(bogus.out) && /deadbee/.test(bogus.out),
    `exit ${bogus.exit}`,
  )
  const noVerification = mutatedGuard([['for (const pattern of [COUNT_AT_SHA, COUNT_CMD_SHA])', 'for (const pattern of [])']])
  const uncaught = run(canonical('deadbee'), { guard: noVerification, args: ['--repo', REPO] })
  check(
    'MUTATION: removing the sha scan lets that bogus sha PASS (so the check can fail)',
    uncaught.exit === 0,
    `exit ${uncaught.exit}`,
  )

  // The counted-command position: the revision of a `git … | wc` count is the
  // count's provenance too, and it is verified the same way.
  const countedCommand = (sha) => (ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-cmd.md', `$ git ls-tree -r --name-only ${sha} .scratch | wc -l\n280\n`)
  }
  const cmdValid = run(countedCommand('1c3471a'), { args: ['--repo', REPO] })
  check('the FIRST sha-shaped token of a counted git command is verified too (valid sha passes)', cmdValid.exit === 0, `exit ${cmdValid.exit}`)
  const cmdBogus = run(countedCommand('deadbee'), { args: ['--repo', REPO] })
  check(
    'the FIRST sha-shaped token of a counted git command is verified too (bogus sha is CAUGHT)',
    cmdBogus.exit === 1 && /count-provenance-unresolvable/.test(cmdBogus.out),
    `exit ${cmdBogus.exit}`,
  )

  // The control for the canonical form's CONNECTOR: a content hash next to a
  // count is a hash of bytes, not a commit, and is not a provenance token. It
  // passes — and making the connector optional turns it red, so the control is
  // reachable rather than decorative.
  const contentHash = (ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-hash.md', 'md5sum before/after 3 files: 7627fc37f932a2e66352e31e709beb81 -> 7627fc37f932a2e66352e31e709beb81\n')
  }
  const hashControl = run(contentHash, { args: ['--repo', REPO] })
  check('an md5/sha256 content hash next to a count is NOT a provenance token (control)', hashControl.exit === 0, `exit ${hashControl.exit}`)
  const looseConnector = mutatedGuard([
    ['}at\\s+(?:the\\s+)?', '}(?:at\\s+(?:the\\s+)?)?'],
    ['|at\\s+(?:the\\s+)?', '|(?:at\\s+(?:the\\s+)?)?'],
  ])
  const hashCaught = run(contentHash, { guard: looseConnector, args: ['--repo', REPO] })
  check(
    'MUTATION: dropping the `at` connector turns that control red (over-matching is reachable)',
    hashCaught.exit === 1 && /count-provenance-unresolvable/.test(hashCaught.out),
    `exit ${hashCaught.exit}`,
  )

  // NOT A GIT WORKTREE. The behaviour checks live in git-less temp roots; with
  // `--repo` naming a directory that is not a worktree the run must SAY the
  // shas were not verified, report no finding for them, and drop the claim from
  // its summary — never a manufactured finding, never a silent pass.
  const notARepo = mkdtempSync(join(os.tmpdir(), 'factory-guard-norepo-'))
  SCRATCH_DIRS.push(notARepo)
  const unverifiable = run(canonical('deadbee'), { args: ['--repo', notARepo] })
  check(
    'with no worktree to resolve against, the sha is a NOTE and not a finding',
    unverifiable.exit === 0 && /no git worktree to resolve provenance shas against/.test(unverifiable.out) && !/count-provenance-unresolvable/.test(unverifiable.out),
    `exit ${unverifiable.exit}`,
  )
  // The assertion is on the LIVE claim text. It used to name the round-6 wording
  // (`provenance sha resolving as a commit`), which D-023 replaced — a negative
  // assertion on a phrase the guard no longer contains can never fire, so the
  // check was a claim. The mutation below re-instates the claim unconditionally
  // and requires this check to go red, which is what makes it a check.
  check(
    '... and the summary omits the provenance claim when the shas could not be resolved (control)',
    unverifiable.exit === 0 && /ok —/.test(unverifiable.out) && !/unresolvable beyond the recorded records/.test(unverifiable.out),
    `exit ${unverifiable.exit}`,
  )
  const claimAlways = mutatedGuard([['if (provenanceChecked) claims.push(', 'if (true) claims.push(']])
  const claimFired = run(canonical('deadbee'), { guard: claimAlways, args: ['--repo', notARepo] })
  check(
    'MUTATION: printing the claim unconditionally turns that control red (so the control CAN fail)',
    claimFired.exit === 0 && /unresolvable beyond the recorded records/.test(claimFired.out),
    `exit ${claimFired.exit}`,
  )
}

// 21. no-bare-head-count, ARM 3 — the eight-name subcommand LIST replaced by the
//     PROPERTY: a counted git command that names no fixed revision. The list was
//     wrong in both directions, and the reviewer measured both:
//       missed — `git show | wc -l` (327), `git reflog | wc -l` (281),
//                `git blame <file> | wc -l` (55), `git annotate <file> | wc -l`
//       fired  — `git branch | wc -l`, `git stash | wc -l`
//     Under the property all of them fire, because a count whose command names no
//     commit is unreproducible — including `git status --porcelain | wc -l`, the
//     working-tree count the human named. Naming a fixed revision is the fix, and
//     the control below proves that.
{
  const byProperty = (ctx) => {
    cleanRoot()(ctx)
    ctx.write(
      '.scratch/v28/reports/zz-arm3.md',
      '$ git show | wc -l\n327\n$ git reflog | wc -l\n281\n$ git blame package.json | wc -l\n55\n$ git annotate package.json | wc -l\n55\n$ git branch | wc -l\n11\n$ git stash | wc -l\n1\n$ git status --porcelain | wc -l\n3\n',
    )
  }
  const property = run(byProperty)
  check(
    'every counted git command naming no fixed revision is CAUGHT (the property, not the list)',
    property.exit === 1 && /no-bare-head-count/.test(property.out),
    `exit ${property.exit}`,
  )
  const listAgain = mutatedGuard([['[a-z][a-z-]*\\b', '(?:log|rev-list)\\b']])
  const listMiss = run(byProperty, { guard: listAgain })
  check(
    'MUTATION: narrowing ARM 3 back to a name list lets those seeds PASS (so the check can fail)',
    listMiss.exit === 0,
    `exit ${listMiss.exit}`,
  )

  const named = (ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-arm3-named.md', '$ git log --oneline 1c3471a | wc -l\n5\n')
  }
  const namedRun = run(named, { args: ['--repo', REPO] })
  check('the same count once it names a resolvable revision passes (control)', namedRun.exit === 0, `exit ${namedRun.exit}`)
}

// 22. ARM 2 with the spelling the old pattern could not see: global options
//     before the subcommand, and a quoted revision. Both are real invocations,
//     both were measured unflagged by round 5.
{
  const options = (ctx) => {
    cleanRoot()(ctx)
    ctx.write(
      '.scratch/v28/reports/zz-git-options.md',
      '$ git --no-pager log HEAD | wc -l\n412\n$ git -C /tmp/ws show HEAD:scripts/guards/factory-guard.mjs | wc -l\n500\n$ git -c core.pager=cat show HEAD | wc -l\n500\n',
    )
  }
  const optRun = run(options)
  check('a git read behind a global option is CAUGHT', optRun.exit === 1 && /no-bare-head-count/.test(optRun.out), `exit ${optRun.exit}`)
  const noOpts = mutatedGuard([['(?:--?[A-Za-z][\\w-]*(?:[=\\s]\\S{1,40})?\\s+){0,4}', '(?:){0,4}']])
  const optMiss = run(options, { guard: noOpts })
  check(
    'MUTATION: dropping the global-option prefix lets those seeds PASS (so the check can fail)',
    optMiss.exit === 0,
    `exit ${optMiss.exit}`,
  )

  const quoted = (ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-git-quoted.md', '$ git show "HEAD"\n$ git rev-parse \'HEAD\'\n')
  }
  const quoteRun = run(quoted)
  check('a quoted moving revision is CAUGHT', quoteRun.exit === 1 && /no-bare-head-count/.test(quoteRun.out), `exit ${quoteRun.exit}`)
  const unquoted = mutatedGuard([["[\\s\"'", '[\\s']])
  const quoteMiss = run(quoted, { guard: unquoted })
  check(
    'MUTATION: dropping the quote from the rev lead lets those seeds PASS (so the check can fail)',
    quoteMiss.exit === 0,
    `exit ${quoteMiss.exit}`,
  )
}


// 23. B1 (round-6 review, BLOCKING) — a DRESSED COUNT naming a sha. The count
//     token used to require whitespace then a letter immediately after the
//     digits, so `**412**`, `412 (tracked)` and `| 412 |` were not counts at all,
//     `COUNT_AT_SHA` never saw the provenance, and A WRONG SHA PASSED — in the
//     spellings lane reports actually use (four live corpus lines). Both halves
//     are checked here: the decidable half (a bogus sha in a dressed count is a
//     finding) and the detector half (`at HEAD` in the same dress is a finding).
{
  const dressedSha = (ctx) => {
    cleanRoot()(ctx)
    ctx.write(
      '.scratch/v28/reports/zz-dress-sha.md',
      'The tree held **412** tracked files at deadbee.\n' +
        'The tree held 412 (tracked) files at deadbee.\n' +
        '| 412 | tracked files at deadbee |\n',
    )
  }
  const dressed = run(dressedSha, { args: ['--repo', REPO] })
  check(
    'a dressed count naming a bogus sha is CAUGHT (B1: the decidable half)',
    dressed.exit === 1 && /count-provenance-unresolvable/.test(dressed.out) && /deadbee/.test(dressed.out),
    `exit ${dressed.exit}`,
  )
  check(
    '... and all three dressed counts are COUNTED as provenance tokens, not skipped (B1)',
    /count-provenance: 3 provenance token\(s\)/.test(dressed.out),
    `note: ${(/note — count-provenance: [^\n]*/.exec(dressed.out) ?? [''])[0]}`,
  )
  const narrowCount = mutatedGuard([['[^\\s\\w/]{0,3}(?=\\s[^\\s]*\\s?[a-zA-Z`', '(?=\\s+[a-zA-Z`']])
  const dressedMiss = run(dressedSha, { guard: narrowCount, args: ['--repo', REPO] })
  check(
    'MUTATION: narrowing the count token back lets that bogus sha PASS (so the check can fail)',
    dressedMiss.exit === 0,
    `exit ${dressedMiss.exit}`,
  )

  const dressedHead = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write(
      '.scratch/v28/reports/zz-dress-head.md',
      'The tree held **412** tracked files at HEAD.\n' +
        'The tree held 412 (tracked) files at HEAD.\n' +
        '| 412 | tracked files | at HEAD |\n' +
        'The tree held "412" tracked files at HEAD.\n' +
        'The tree held 412: tracked files at HEAD.\n',
    )
  })
  check(
    'a dressed count resolved through bare HEAD is CAUGHT (B1: the detector half)',
    dressedHead.exit === 1 && /no-bare-head-count/.test(dressedHead.out),
    `exit ${dressedHead.exit}`,
  )
}

// 24. B2 (round-6 review, BLOCKING) — punctuation directly after the SHA. The
//     gap required whitespace immediately after the sha, so a canonical
//     `at <sha>` written inside a comma or a colon was not a provenance token at
//     all: a bogus sha passed and the run's own token counter did not move, so a
//     reader was not even told a token had been skipped.
{
  const punctBogus = (ctx) => {
    cleanRoot()(ctx)
    ctx.write(
      '.scratch/v28/reports/zz-punct-sha.md',
      'The corpus stands at deadbee, 276 tracked files were counted.\n' +
        'The corpus stands at deadbee: 276 tracked files were counted.\n' +
        'The corpus, at deadbee, held 276 tracked files.\n',
    )
  }
  const punct = run(punctBogus, { args: ['--repo', REPO] })
  check(
    'a canonical `at <sha>` followed by a comma or a colon is CAUGHT when the sha is bogus (B2)',
    punct.exit === 1 && /count-provenance-unresolvable/.test(punct.out),
    `exit ${punct.exit}`,
  )
  check(
    '... and those tokens are COUNTED, so the run does not silently skip them (B2)',
    /count-provenance: 3 provenance token\(s\)/.test(punct.out),
    `note: ${(/note — count-provenance: [^\n]*/.exec(punct.out) ?? [''])[0]}`,
  )
  const noAttachedPunct = mutatedGuard([['[^\\s]*?(?:\\s[^\\s\'"“”]+){0,5}\\s+', '(?:\\s[^\\s\'"“”]+){0,5}\\s+']])
  const punctMiss = run(punctBogus, { guard: noAttachedPunct, args: ['--repo', REPO] })
  check(
    'MUTATION: dropping the attached-punctuation lead lets that bogus sha PASS (so the check can fail)',
    punctMiss.exit === 0,
    `exit ${punctMiss.exit}`,
  )
  // Control: the same parenthetical with a RESOLVABLE sha passes AND is counted —
  // the recognised half the reviewer measured as skipped.
  const punctValid = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-punct-ok.md', 'The corpus, at 1c3471a, held 276 tracked files.\n')
  }, { args: ['--repo', REPO] })
  check(
    'the same parenthetical naming a real commit passes and is counted (control)',
    punctValid.exit === 0 && /count-provenance: 1 provenance token\(s\)/.test(punctValid.out),
    `exit ${punctValid.exit}`,
  )
}

// 25. N1 + N3 (round-6 review, non-blocking) — a count taken through a FILTER,
//     and the `--repo` NOTE's step-order sentence.
{
  const filtered = (ctx) => {
    cleanRoot()(ctx)
    ctx.write(
      '.scratch/v28/reports/zz-filter.md',
      '$ git log --oneline | grep -c "round 6" | wc -l\n12\n$ git ls-files src | grep -c "\\.ts$" | wc -l\n340\n',
    )
  }
  const filter = run(filtered)
  check(
    'a counted git command piped through a filter is CAUGHT (N1: the property, not the spelling)',
    filter.exit === 1 && /no-bare-head-count/.test(filter.out),
    `exit ${filter.exit}`,
  )
  // The mutation has to cross the guard's own `String.raw` + BACKTICK concatenation,
  // so the anchor is assembled from the two spellings the arm is written in.
  const BT = String.fromCharCode(96)
  const arm3Middle = '[^\\n' + BT + ' + BACKTICK + String.raw' + BT + ']{0,160}?\\|\\s*wc\\b'
  const oldMiddle = mutatedGuard([[arm3Middle, arm3Middle.replace('[^\\n', '[^\\n|')]])
  const filterMiss = run(filtered, { guard: oldMiddle })
  check(
    'MUTATION: restoring the pipe-excluding middle lets that seed PASS (so the check can fail)',
    filterMiss.exit === 0,
    `exit ${filterMiss.exit}`,
  )

  // N3: with `--repo` given, the note must say what actually happened — an
  // explicit --repo is an instruction, so the scan root was NOT consulted — and
  // must not repeat the old sentence claiming all three candidates were tried.
  const notARepo = mkdtempSync(join(os.tmpdir(), 'factory-guard-norepo2-'))
  SCRATCH_DIRS.push(notARepo)
  const staleRepo = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-canon.md', 'The tree held 276 tracked `.scratch` files at deadbee.\n')
  }, { args: ['--repo', notARepo] })
  check(
    'a stale `--repo` is reported as the reason, naming the argument (N3)',
    staleRepo.exit === 0 && new RegExp(`--repo ${notARepo} was given and is not a git worktree`).test(staleRepo.out),
    `exit ${staleRepo.exit}`,
  )
  check(
    '... and the note names what it did NOT consult instead of claiming a lookup order it never walked (N3, control)',
    staleRepo.exit === 0 && /neither the scan root nor this instrument's own repository was consulted/.test(staleRepo.out),
    `exit ${staleRepo.exit}`,
  )
  // The mutation puts the old step-order sentence back, and the assertion above
  // is on the live text, so this check goes red the moment the note lies again.
  const oldNote = mutatedGuard([
    ['so neither the scan root nor this instrument\'s own repository was consulted', "looked for --repo, then this scan root, then this instrument's own repository"],
  ])
  const noteFired = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-canon.md', 'The tree held 276 tracked `.scratch` files at deadbee.\n')
  }, { guard: oldNote, args: ['--repo', notARepo] })
  check(
    'MUTATION: restoring the old step-order sentence turns that control red (so the control can fail)',
    noteFired.exit === 0 && /looked for --repo/.test(noteFired.out),
    `exit ${noteFired.exit}`,
  )
  // Control: with no --repo at all and a git-less root, the fallback still works
  // and says so — the root was not a worktree, this instrument's repository was.
  const fallback = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-canon.md', 'The tree held 276 tracked `.scratch` files at 1c3471a.\n')
  })
  check(
    'with no --repo, the fallback to this instrument\'s repository is named (control)',
    fallback.exit === 0 && /this instrument's own repository/.test(fallback.out),
    `exit ${fallback.exit}`,
  )
}

// 26. V28 slice 6c fix-7 — the mechanism-vs-prose rules (D-025/D-026). Each of
//     the four ships the failing world it was built to catch, and a mutation of
//     the rule that turns that seed green, so the rule is a check rather than a
//     comment. The claim shapes are seeded in a throwaway guard/check/report, so
//     nothing here reads or writes the real instruments.
{
  // RULE 1a — a claim that the file makes only ONE git call must name every git
  // call it makes. The seed makes the claim and only one of its two calls.
  const exclusiveClaim =
    '#!/usr/bin/env node\n' +
    '// zz-seeded — the only git call is `cat-file -e <sha>^{commit}`.\n' +
    "import { execFileSync } from 'node:child_process'\n" +
    "execFileSync('git', ['ls-files', '-z'], { stdio: 'ignore' })\n" +
    'process.exit(0)\n'
  const exclusive = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('scripts/guards/zz-exclusive.mjs', exclusiveClaim)
  })
  check(
    'an exclusive git-call claim the file itself contradicts is CAUGHT',
    exclusive.exit === 1 && /instrument-headers-honest/.test(exclusive.out) && /git ls-files/.test(exclusive.out),
    `exit ${exclusive.exit}`,
  )
  const noExclusive = mutatedGuard([['if (missing.length) {', 'if (false) {']])
  const exclusiveMiss = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('scripts/guards/zz-exclusive.mjs', exclusiveClaim)
  }, { guard: noExclusive })
  check(
    'MUTATION: dropping the exclusive-git-claim test lets that seed PASS (so the check can fail)',
    exclusiveMiss.exit === 0,
    `exit ${exclusiveMiss.exit}`,
  )

  // RULE 1b — a named construct must appear in the file's own source.
  const namedAlternative =
    '#!/usr/bin/env node\n' +
    '// zz-seeded — the `ZZQ` alternative matches the label.\n' +
    'process.exit(0)\n'
  const alternative = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('scripts/guards/zz-alternative.mjs', namedAlternative)
  })
  check(
    'a named alternative with no such construct in the source is CAUGHT',
    alternative.exit === 1 && /instrument-headers-honest/.test(alternative.out),
    `exit ${alternative.exit}`,
  )
  const noAlternative = mutatedGuard([['if (!PROSE_NEGATION.test(seg.text) && !PROSE_NEGATION.test(prev) && core.length >= 2 && !code.includes(core)) {', 'if (false) {']])
  const alternativeMiss = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('scripts/guards/zz-alternative.mjs', namedAlternative)
  }, { guard: noAlternative })
  check(
    'MUTATION: dropping the named-construct test lets that seed PASS (so the check can fail)',
    alternativeMiss.exit === 0,
    `exit ${alternativeMiss.exit}`,
  )

  // RULE 1d — a claim of a CAPABILITY the rule does not have: the pointer test is
  // a shape test, so calling the pointer resolvable claims a lookup it never does.
  const resolutionClaim =
    '#!/usr/bin/env node\n' +
    '// zz-seeded — the rule is about a resolvable pointer, not about the words.\n' +
    'process.exit(0)\n'
  const resolution = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('scripts/guards/zz-resolution.mjs', resolutionClaim)
  })
  check(
    'a prose claim that the pointer RESOLVES is CAUGHT (a capability the rule lacks)',
    resolution.exit === 1 && /instrument-headers-honest/.test(resolution.out),
    `exit ${resolution.exit}`,
  )
  const noResolution = mutatedGuard([['if (POINTER_RESOLUTION_CLAIM.test(seg.text) && !/\\bcannot\\b/i.test(seg.text)) {', 'if (false) {']])
  const resolutionMiss = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('scripts/guards/zz-resolution.mjs', resolutionClaim)
  }, { guard: noResolution })
  check(
    'MUTATION: dropping the capability-claim test lets that seed PASS (so the check can fail)',
    resolutionMiss.exit === 0,
    `exit ${resolutionMiss.exit}`,
  )

  // RULE 1c — a phrase the instrument records as the wording it narrowed away
  // must not be restated as current prose. The seed abandons a phrase in one
  // guard and restates it in another, which is the shape that survived in a
  // check name and a constants comment while the header had been narrowed.
  const abandonedSeed = (ctx) => {
    cleanRoot()(ctx)
    ctx.write('scripts/guards/zz-old.mjs', '#!/usr/bin/env node\n// zz-seeded — the header used to claim the "zz-old formula" and it was narrowed.\nprocess.exit(0)\n')
    ctx.write('scripts/guards/zz-reuse.mjs', '#!/usr/bin/env node\n// a second file restates the zz-old formula as current.\nprocess.exit(0)\n')
  }
  const reuse = run(abandonedSeed)
  check(
    'an abandoned formula restated as current prose is CAUGHT',
    reuse.exit === 1 && /instrument-headers-honest/.test(reuse.out) && /zz-reuse/.test(reuse.out),
    `exit ${reuse.exit}`,
  )
  const noReuse = mutatedGuard([['for (let at = f.joined.indexOf(phrase); at !== -1; at = f.joined.indexOf(phrase, at + phrase.length)) {', 'for (let at = -1; at !== -1; at = f.joined.indexOf(phrase, at + phrase.length)) {']])
  const reuseMiss = run(abandonedSeed, { guard: noReuse })
  check(
    'MUTATION: dropping the abandoned-formula scan lets that seed PASS (so the check can fail)',
    reuseMiss.exit === 0,
    `exit ${reuseMiss.exit}`,
  )

  // RULE 2 — the claim sits in a check NAME, which the leading-block scan could
  // not see. The seed is a `.check.mjs` whose name makes the claim; the mutation
  // stops reading check names and the seed goes green, which is what proves the
  // COVERAGE is load-bearing.
  const checkNameClaim =
    '#!/usr/bin/env node\n' +
    '// zz-seeded check file.\n' +
    "import process from 'node:process'\n" +
    'const check = (name, ok) => { if (!ok) process.exit(1) }\n' +
    "check('the `ZZQ2` alternative is what this proves', true)\n" +
    'process.exit(0)\n'
  const byName = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('scripts/guards/zz-by-name.check.mjs', checkNameClaim)
  })
  check(
    'a claim carried by a check NAME is read and CAUGHT (check-file prose)',
    byName.exit === 1 && /instrument-headers-honest/.test(byName.out),
    `exit ${byName.exit}`,
  )
  const noNames = mutatedGuard([["const nameMatch = /^\\s*check\\(\\s*(['\"`])(.*?)\\1/.exec(line)", "const nameMatch = /^\\s*zznevercheck\\(\\s*(['\"`])(.*?)\\1/.exec(line)"]])
  const byNameMiss = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('scripts/guards/zz-by-name.check.mjs', checkNameClaim)
  }, { guard: noNames })
  check(
    'MUTATION: not reading check names lets that seed PASS (so the coverage can fail)',
    byNameMiss.exit === 0,
    `exit ${byNameMiss.exit}`,
  )

  // RULE 3 — a number written about a derived quantity must equal the
  // quantity. The seed states a baseline the map does not derive.
  const wrongBaseline =
    '#!/usr/bin/env node\n' +
    '// zz-seeded — the baseline is 999 recorded occurrences.\n' +
    'process.exit(0)\n'
  const number = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('scripts/guards/zz-number.mjs', wrongBaseline)
  })
  check(
    'a prose number the map contradicts is CAUGHT (prose number vs artifact)',
    number.exit === 1 && /instrument-headers-honest/.test(number.out) && /999/.test(number.out),
    `exit ${number.exit}`,
  )
  const noNumber = mutatedGuard([['if (baseline && Number(baseline[1]) !== BARE_HEAD_BASELINE_SIZE) {', 'if (false) {']])
  const numberMiss = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('scripts/guards/zz-number.mjs', wrongBaseline)
  }, { guard: noNumber })
  check(
    'MUTATION: dropping the number-vs-artifact test lets that seed PASS (so the check can fail)',
    numberMiss.exit === 0,
    `exit ${numberMiss.exit}`,
  )

  // RULE 4 — a pasted `count-provenance-unresolvable` transcript that cites a
  // file in the repo must cite a line that carries the sha. The seed cites its
  // own line 9, which does not name the sha; marking it historical stands it
  // down, which the second control proves.
  const badTranscript =
    '# zz-seeded transcript\n\n' +
    '```\n' +
    '$ node scripts/guards/factory-guard.mjs --root /tmp/zz\n' +
    "  FINDING [count-provenance-unresolvable]: .scratch/v28/reports/zz-transcript.md:9: a count's provenance names deadbee, which is not a commit here — name a commit a reader can resolve\n" +
    '```\n\n' +
    'the cited line is filler\n' +
    'filler nine — no sha here\n'
  const transcript = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-transcript.md', badTranscript)
  }, { args: ['--repo', REPO] })
  check(
    'a pasted transcript citing a line without its sha is CAUGHT (reproducibility)',
    transcript.exit === 1 && /transcript-reproduces/.test(transcript.out),
    `exit ${transcript.exit}`,
  )
  const noTranscript = mutatedGuard([['if (!targetLine.includes(sha)) {', 'if (false) {']])
  const transcriptMiss = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-transcript.md', badTranscript)
  }, { guard: noTranscript, args: ['--repo', REPO] })
  check(
    'MUTATION: dropping the transcript test lets that seed PASS (so the check can fail)',
    transcriptMiss.exit === 0,
    `exit ${transcriptMiss.exit}`,
  )

  // RULE 5 — a block introduced as `raw:`/`verbatim` claims CAPTURED output, so its
  // own arithmetic has to hold: a step RANGE and the count it states must agree.
  // The seed is the shape V28 r2 slice 8a's §3 block carried for three review
  // rounds (✓ 7–13, seven entries, "all six legs"); the control is the same line
  // with the count right, which proves the rule is not merely a fence detector.
  const rawSeed =
    '# zz-seeded raw block\n\n' +
    'proof — raw:\n\n' +
    '```\n' +
    'Running 3 tests using 1 worker\n' +
    '✓ 7–13 zz-spec.e2e.ts (all six legs)\n' +
    '```\n'
  const raw = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-raw.md', rawSeed)
  }, { args: ['--repo', REPO] })
  check(
    "a raw block's step range contradicting its own count is CAUGHT (transcript-summary-agrees)",
    raw.exit === 1 && /transcript-summary-agrees/.test(raw.out),
    `exit ${raw.exit}`,
  )
  const noRawSummaries = mutatedGuard([['if (count === span) continue', 'if (true) continue']])
  const rawMiss = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-raw.md', rawSeed)
  }, { guard: noRawSummaries, args: ['--repo', REPO] })
  check(
    'MUTATION: dropping the range/count agreement lets that seed PASS (so the check can fail)',
    rawMiss.exit === 0,
    `exit ${rawMiss.exit}`,
  )
  const rawControl = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-raw.md', rawSeed.replace('(all six legs)', '(all seven legs)'))
  }, { args: ['--repo', REPO] })
  check(
    'control: the same raw block with its count RIGHT passes (so the rule is not just a fence detector)',
    rawControl.exit === 0,
    `exit ${rawControl.exit}`,
  )

  // A count OUTSIDE the vocabulary (`all thirteen`) used to be counted as CHECKED
  // and the rule's claim published over a comparison that never ran. It is now a
  // finding: a range SEEN and not COMPARED cannot pass.
  const thirteen = rawSeed.replace('(all six legs)', '(all thirteen legs)')
  const outOfTable = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-raw.md', thirteen)
  }, { args: ['--repo', REPO] })
  check(
    'an out-of-vocabulary count word (all thirteen) is CAUGHT, not skipped',
    outOfTable.exit === 1 && /transcript-summary-agrees/.test(outOfTable.out) && /cannot resolve to a number/.test(outOfTable.out),
    `exit ${outOfTable.exit}`,
  )
  const wordAssumesAgreement = mutatedGuard([['const count = /^\\d+$/.test(word) ? Number(word) : WORDS[word]', 'const count = /^\\d+$/.test(word) ? Number(word) : span']])
  const outOfTableMiss = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-raw.md', thirteen)
  }, { guard: wordAssumesAgreement, args: ['--repo', REPO] })
  check(
    'MUTATION: an unresolvable count assumed to agree lets that seed PASS (so the check can fail)',
    outOfTableMiss.exit === 0,
    `exit ${outOfTableMiss.exit}`,
  )
  const digitCount = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-raw.md', thirteen.replace('(all thirteen legs)', '(all 7 legs)'))
  }, { args: ['--repo', REPO] })
  check(
    'control: the same range with its count as a DIGIT passes (so the rule is not "big words fail")',
    digitCount.exit === 0,
    `exit ${digitCount.exit}`,
  )

  // THE LABEL TRIPWIRE — "no raw block exists" must not look like "raw blocks I
  // failed to attribute". A label the rule saw and read no block for is a finding.
  const orphanLabel =
    '# zz-orphan label\n\n' +
    'proof — raw:\n\n' +
    'Running 3 tests using 1 worker\n'
  const orphan = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-raw.md', orphanLabel)
  }, { args: ['--repo', REPO] })
  check(
    'a raw:/verbatim label with no block to read is CAUGHT (the label tripwire)',
    orphan.exit === 1 && /transcript-summary-agrees/.test(orphan.out) && /did not read/.test(orphan.out),
    `exit ${orphan.exit}`,
  )
  const noTripwire = mutatedGuard([['const unreadLabel =', 'const unreadLabel = false &&']])
  const orphanMiss = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-raw.md', orphanLabel)
  }, { guard: noTripwire, args: ['--repo', REPO] })
  check(
    'MUTATION: dropping the label tripwire lets that seed PASS (so the check can fail)',
    orphanMiss.exit === 0,
    `exit ${orphanMiss.exit}`,
  )

  // The witness for the INPUT number, and the tripwire's control: a label WITH a
  // block is attributed and passed, and the note says how many blocks were READ
  // and how many compared — so a narrowed parse window cannot hide behind a zero.
  const twoLabels =
    '# zz-raw count witness\n\n' +
    'first — raw:\n\n' +
    '```\n' +
    '✓ 7–13 zz-spec.e2e.ts (all seven legs)\n' +
    '```\n\n' +
    'second — raw:\n\n' +
    '```\n' +
    'nothing to compare here\n' +
    '```\n'
  const witness = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-raw.md', twoLabels)
  }, { args: ['--repo', REPO] })
  check(
    'control: a label with a block passes, and the note states what it READ (2 blocks, 1 range summary)',
    witness.exit === 0 && /2 raw-labelled block\(s\) read, 1 range summary checked/.test(witness.out),
    `exit ${witness.exit}`,
  )

  // The label may sit above a PROSE line, not only directly above its fence. One
  // prose line between the two used to leave the identical fabrication unlabelled
  // while the run said NOTHING was checked.
  const proseCrossed = rawSeed.replace('proof — raw:\n\n```', 'proof — raw:\n\nthe transcript follows.\n\n```')
  const crossed = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-raw.md', proseCrossed)
  }, { args: ['--repo', REPO] })
  check(
    'a label one PROSE line above its fence is still read, and the fabrication CAUGHT',
    crossed.exit === 1 && /covers 7 entries/.test(crossed.out),
    `exit ${crossed.exit}`,
  )
  const narrowWindow = mutatedGuard([['const INTRO_LINES = 12', 'const INTRO_LINES = 1']])
  const crossedMiss = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-raw.md', proseCrossed)
  }, { guard: narrowWindow, args: ['--repo', REPO] })
  check(
    'MUTATION: narrowing the intro window turns that CAUGHT comparison into the tripwire (so the width is pinned)',
    crossedMiss.exit === 1 && /did not read/.test(crossedMiss.out) && !/covers 7 entries/.test(crossedMiss.out),
    `exit ${crossedMiss.exit}`,
  )

  // A raw-labelled block written as an INDENTED code block (no fence) used to be
  // invisible: the rule walked fences only.
  const indentedSeed =
    '# zz-indented raw block\n\n' +
    'proof — raw:\n\n' +
    '    Running 3 tests using 1 worker\n' +
    '    ✓ 7–13 zz-spec.e2e.ts (all six legs)\n'
  const indented = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-raw.md', indentedSeed)
  }, { args: ['--repo', REPO] })
  check(
    'an INDENTED raw block is READ, and its contradiction is CAUGHT',
    indented.exit === 1 && /covers 7 entries/.test(indented.out) && /1 raw-labelled block\(s\) read/.test(indented.out),
    `exit ${indented.exit}`,
  )
  const noIndented = mutatedGuard([
    ["if (/^(\\t| {4,})\\S/.test(line) && (index === 0 || lines[index - 1].trim() === '')) {", "if (/^(\\t| {9999,})\\S/.test(line) && (index === 0 || lines[index - 1].trim() === '')) {"],
  ])
  const indentedMiss = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-raw.md', indentedSeed)
  }, { guard: noIndented, args: ['--repo', REPO] })
  check(
    'MUTATION: dropping indented-block detection reads 0 blocks and lets the fabrication hide (tripwire instead)',
    indentedMiss.exit === 1 && /0 raw-labelled block\(s\) read/.test(indentedMiss.out) && /did not read/.test(indentedMiss.out),
    `exit ${indentedMiss.exit}`,
  )

  // A fence-INLINE label (the fence's own line carries it) is read, rather than
  // escaping because the label is not on a line of its own.
  const inlineSeed =
    '# zz-fence-inline label\n\n' +
    '```raw:\n' +
    'Running 3 tests using 1 worker\n' +
    '✓ 7–13 zz-spec.e2e.ts (all six legs)\n' +
    '```\n'
  const inline = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write('.scratch/v28/reports/zz-raw.md', inlineSeed)
  }, { args: ['--repo', REPO] })
  check(
    'a fence-INLINE label is READ, and its contradiction is CAUGHT',
    inline.exit === 1 && /covers 7 entries/.test(inline.out),
    `exit ${inline.exit}`,
  )

  // THE REPORT/BRIEF SCAN'S OWN ZERO CASE (D-030). The scan used to print
  // "unchecked here" and exit 0 when the root carried no report or brief, so a
  // run that read nothing reported health over four rules (the bare-HEAD counts,
  // the provenance shas, the pasted transcripts, the raw-block arithmetic). An
  // empty scan and a clean repo must not print the same green. `report: false`
  // is the seam that reaches the empty state, and the control is the same root
  // WITH a report file.
  const noReportSeed = run((ctx) => {
    cleanRoot()(ctx)
  }, { report: false })
  check(
    'a report/brief scan that read no file is a FINDING, not a pass (D-030)',
    noReportSeed.exit === 1 && /report-scan-empty/.test(noReportSeed.out),
    `exit ${noReportSeed.exit}`,
  )
  const noEmptyScan = mutatedGuard([['if (!files.length) {', 'if (false) {']])
  const noReportSeedMiss = run((ctx) => {
    cleanRoot()(ctx)
  }, { guard: noEmptyScan, report: false })
  check(
    'MUTATION: dropping the empty-scan finding lets that seed PASS (so the check can fail)',
    noReportSeedMiss.exit === 0,
    `exit ${noReportSeedMiss.exit}`,
  )
  const reportControl = run((ctx) => {
    cleanRoot()(ctx)
  })
  check(
    'control: the same clean root WITH a report file passes (so the rule is not simply always red)',
    reportControl.exit === 0,
    `exit ${reportControl.exit}`,
  )
}

process.on('exit', () => {
  for (const dir of SCRATCH_DIRS) rmSync(dir, { recursive: true, force: true })
})

console.log()
if (failures === 0) {
  // Counted at run time, not typed: a hand-maintained total goes stale here just
  // as it did in the regexp-escape guard's summary line.
  console.log(`factory-guard check: all ${ran} checks passed.`)
  process.exit(0)
}
console.error(`factory-guard check: ${failures} check(s) failed — the factory guard is not doing its job.`)
process.exit(1)
