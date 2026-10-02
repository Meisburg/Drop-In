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
function run(mutate, { guard = GUARD, args = [] } = {}) {
  const root = mkdtempSync(join(os.tmpdir(), 'factory-guard-'))
  const write = (rel, value) => {
    const path = join(root, rel)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`)
  }
  try {
    mutate({ root, write })
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
const MUTANT_DIRS = []
function mutatedGuard(replacements) {
  let text = readFileSync(GUARD, 'utf8')
  for (const [from, to] of replacements) {
    const hits = text.split(from).length - 1
    if (hits !== 1) throw new Error(`mutation anchor occurs ${hits} time(s), not once: ${JSON.stringify(from)}`)
    text = text.split(from).join(to)
  }
  const dir = mkdtempSync(join(os.tmpdir(), 'factory-guard-mutant-'))
  MUTANT_DIRS.push(dir)
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
  // staleness claim, and passes because the claim names the commit that shows
  // it. The rule is about a resolvable pointer, not about the words — a rule
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

  // F2: the baseline for this key is 4 (a recorded historical file). Five
  // occurrences on disk, TWO of them on one line, is the reviewer's proof:
  // single-match counting saw 4 and passed; counting every match sees 5 and
  // fails. If that baseline count ever moves, this seed moves with it.
  const doubled = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write(
      '.scratch/v28/reports/slice-6c-fix-1-review.md',
      'measured: 265 at HEAD\n' +
        'two on one line: 265 at HEAD and 265 at HEAD\n' +
        'again 265 at HEAD\n' +
        'finally 265 at HEAD\n',
    )
  })
  check(
    'a SECOND occurrence on an already-counted line is CAUGHT (per-line counting)',
    doubled.exit === 1 && /no-bare-head-count/.test(doubled.out),
    `exit ${doubled.exit}`,
  )

  // The `@` shorthand — a declared arm that used to be DEAD. Both composed
  // patterns ended in `\b`, and `@` ends in a non-word character, so the `@`
  // arm matched nothing while MOVING_REV still listed it. It is now `(?![\w])`.
  // These two cases are the fix's own guard: the first goes red if `@` stops
  // matching; the second goes red if the wider boundary starts firing on an
  // email address, a decorator, or a bare reflog.
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

  // ROUND 6 repair. Round 5 called this root a control and said it could fail;
  // it could not — none of its four lines put a `@{…}` token within four tokens
  // of a count, so no mutation to the `@` lookahead changed its verdict. The
  // `@{2}` line below does, and the mutation proves it. The email and
  // `@decorator` lines stay in the root as regression seeds: a `@` followed by a
  // word character is unreachable by construction (the token must end at a
  // non-word character), so they are not the control's named failure mode.
  const notARevision = (ctx) => {
    cleanRoot()(ctx)
    ctx.write(
      '.scratch/v28/reports/zz-not-a-rev.md',
      'write to user@example.com about it\n' +
        'the @decorator style is used\n' +
        '4 files mention the @{2} form\n' +
        'the count is 5 at user@example.com\n',
    )
  }
  const notARevisionRun = run(notARevision)
  check(
    'email, @decorator and a bare @{…} next to a count are NOT flagged (control)',
    notARevisionRun.exit === 0,
    `exit ${notARevisionRun.exit}`,
  )
  const noAtLookahead = mutatedGuard([['@(?![{\\w])', '@']])
  const atControlFired = run(notARevision, { guard: noAtLookahead })
  check(
    'MUTATION: removing the `@` lookahead turns that control red (so the control CAN fail)',
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
//     the mutation that reaches its failure mode.
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

  const wordClass = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write(
      '.scratch/v28/reports/zz-wordclass.md',
      '280 tracked `.scratch` files at HEAD\n280 files in src/lib at HEAD\n280 files (tracked) at HEAD\n87, taken at HEAD\nthe count was 87 as of HEAD\n',
    )
  })
  check(
    'labels the round-5 word class could not spell are CAUGHT',
    wordClass.exit === 1 && /no-bare-head-count/.test(wordClass.out),
    `exit ${wordClass.exit}`,
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
  const wideWindow = mutatedGuard([["(?:\\s[^\\s'\"“”]+){0,4}\\s+", "(?:\\s[^\\s'\"“”]+){0,60}\\s+"]])
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
//     rounds and now produces a finding.
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
  check('the revision of a counted git command is verified too (valid sha passes)', cmdValid.exit === 0, `exit ${cmdValid.exit}`)
  const cmdBogus = run(countedCommand('deadbee'), { args: ['--repo', REPO] })
  check(
    'the revision of a counted git command is verified too (bogus sha is CAUGHT)',
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
  MUTANT_DIRS.push(notARepo)
  const unverifiable = run(canonical('deadbee'), { args: ['--repo', notARepo] })
  check(
    'with no worktree to resolve against, the sha is a NOTE and not a finding',
    unverifiable.exit === 0 && /no git worktree to resolve provenance shas against/.test(unverifiable.out) && !/count-provenance-unresolvable/.test(unverifiable.out),
    `exit ${unverifiable.exit}`,
  )
  check(
    '... and the summary does NOT claim the shas were resolved (control)',
    unverifiable.exit === 0 && /ok —/.test(unverifiable.out) && !/provenance sha resolving as a commit/.test(unverifiable.out),
    `exit ${unverifiable.exit}`,
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

process.on('exit', () => {
  for (const dir of MUTANT_DIRS) rmSync(dir, { recursive: true, force: true })
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
