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
import { dirname, join } from 'node:path'
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

/** Build a throwaway root and let `mutate` write its contents. */
function run(mutate) {
  const root = mkdtempSync(join(os.tmpdir(), 'factory-guard-'))
  const write = (rel, value) => {
    const path = join(root, rel)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`)
  }
  try {
    mutate({ root, write })
    const out = execFileSync('node', [GUARD, '--root', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { exit: 0, out }
  } catch (e) {
    return { exit: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

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
  // email address, a decorator, or a bare reflog. Neither is vacuous.
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

  const notARevision = run((ctx) => {
    cleanRoot()(ctx)
    ctx.write(
      '.scratch/v28/reports/zz-not-a-rev.md',
      'write to user@example.com about it\n' +
        'the @decorator style is used\n' +
        'the @{2} form means no revision here\n' +
        'the count is 5 at user@example.com\n',
    )
  })
  check(
    'email, @decorator and bare @{…} are NOT flagged (control)',
    notARevision.exit === 0,
    `exit ${notARevision.exit}`,
  )
}

console.log()
if (failures === 0) {
  // Counted at run time, not typed: a hand-maintained total goes stale here just
  // as it did in the regexp-escape guard's summary line.
  console.log(`factory-guard check: all ${ran} checks passed.`)
  process.exit(0)
}
console.error(`factory-guard check: ${failures} check(s) failed — the factory guard is not doing its job.`)
process.exit(1)
