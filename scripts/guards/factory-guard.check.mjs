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

console.log()
if (failures === 0) {
  // Counted at run time, not typed: a hand-maintained total goes stale here just
  // as it did in the regexp-escape guard's summary line.
  console.log(`factory-guard check: all ${ran} checks passed.`)
  process.exit(0)
}
console.error(`factory-guard check: ${failures} check(s) failed — the factory guard is not doing its job.`)
process.exit(1)
