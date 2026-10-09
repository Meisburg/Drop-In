#!/usr/bin/env node
// scripts/guards/factory-lease-guard.check.mjs
//
// Slice v33-15 proof: the lease-refusal guard is not vacuously green. The
// failure mode it guards is a FUTURE REGRESSION — a later slice deletes the
// refusal from an acquire path, or weakens it to a zero exit. A check that
// only asserts "the call is present on the clean tree" cannot prove that,
// because it never exercises the RED side. So this check feeds the guard's
// pure predicate `checkLeaseRefusalInvariants` mutated sources (the exact
// regressions the rule exists to catch) and asserts each one fires with the
// NAMED problem, plus that the clean baseline passes.
//
// WHY A SYNTHETIC BASELINE, NOT THE LIVE factory.mjs: a check that seeds its
// mutations off the live file is un-runnable exactly when the guard fires —
// run the suite after someone deletes a call site and the check's own
// applicability probe fails for the WRONG reason (it can no longer seed the
// mutation it exists to seed). The live-tree assertion is the GUARD's job;
// the check must hold a STABLE baseline so its seeded mutations are always
// applicable. The fixture below is the minimal v33-14 shape: the refusal
// function with its non-zero exit and one call site per acquire handler.
//
// The mutations are the exact regressions the guard guards:
//   1. refusal removed from `admit`  → RED, names the admit path
//   2. refusal removed from `run`    → RED, names the run path
//   3. refusal weakened to exit(0)   → RED, names the non-zero-exit weakening
//   4. refusal function deleted      → RED, names the missing function
//
// Pure inspection, no model, no LLM, no side effects. Mirrors
// factory-guard.check.mjs (seeded worlds + a mutation that flips the verdict)
// and vacuous-absence-guard.check.mjs.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkLeaseRefusalInvariants } from './factory-lease-guard.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FACTORY = join(HERE, '../factory/factory.mjs')

// The v33-14 shape the guard's rule targets: the refusal with its non-zero
// exit and one call site per acquire handler. `cmdDoctor` is the live tree's
// next function, kept here as the anchor mutation 4 cuts on.
const clean = `function assertAcquirable(id, label) {
  const conflict = holderConflict(readReservations(), id, process.pid, systemProbes.now())
  if (!conflict) return
  console.error(\`REFUSED: '\${id}' is already held (\${label})\`)
  process.exit(4)
}

function cmdAdmit(args) {
  const kind = positional[0] ?? die('usage: factory admit <task-kind> --id <id>')
  const id = flags.id ?? die('factory admit: --id is required')
  assertAcquirable(id, \`admit \${kind}\`)
  return resolveModel({ kind, requested: flags.model })
}

function cmdRun(args) {
  const kind = positional[0] ?? die('usage: factory run <task-kind> --id <id>')
  const id = flags.id ?? die('factory run: --id is required')
  assertAcquirable(id, \`run \${kind}\`)
  return runCommand(id, kind)
}

function cmdDoctor() {
  return doctor()
}
`

let failures = 0
function report(name, ok, detail = '') {
  if (ok) {
    console.log(`  PASS ${name}`)
    return
  }
  failures += 1
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
}

function problemsFor(mutated) {
  return checkLeaseRefusalInvariants(mutated)
}

function fires(mutated, needle) {
  const problems = problemsFor(mutated)
  return problems.some((p) => p.includes(needle))
}

console.log('factory-lease-guard.check — proving the lease-refusal guard can fire')
console.log('')

// Liveness note (informational, not a verdict): the live tree carries the call
// sites the rule looks for; the check's seeded mutations stay applicable
// because they are seeded off the baseline, not the live tree. The guard is
// the instrument that fails when the live tree regresses — this check only
// proves the rule's logic, so it never fails because of the live tree's state.
{
  let note = 'live factory.mjs not present (the guard is the instrument that fails; this check seeds mutations off the baseline fixture)'
  try {
    const live = readFileSync(FACTORY, 'utf8')
    const callSites = live.split('assertAcquirable(id, ').length - 1
    note = `live factory.mjs carries ${callSites} assertAcquirable call site(s); the check seeds mutations off the baseline fixture, not the live tree`
  } catch {
    // The live file being gone is the guard's finding, never this check's.
  }
  console.log(`  note: ${note}`)
}

// 0) The clean baseline must pass — otherwise the mutations below prove
//    nothing about the GREEN side.
{
  const problems = problemsFor(clean)
  report(
    'clean baseline: no problems (guard is green on the v33-14 shape)',
    problems.length === 0,
    problems.join(' | '),
  )
}

// 1) Refusal removed from the ADMI acquire path.
{
  const mutated = clean.replace(/  assertAcquirable\(id, `admit \$\{kind\}`\)\n/g, '')
  if (mutated === clean) {
    report('admit-path mutation is applicable to the baseline', false, 'the baseline fixture lost its admit call site — restore it')
  } else {
    report('mutation 1: refusal removed from admit path', fires(mutated, 'cmdAdmit'))
    report('mutation 1 problem names the admit acquire path', fires(mutated, 'admit'))
  }
}

// 2) Refusal removed from the RUN acquire path.
{
  const mutated = clean.replace(/  assertAcquirable\(id, `run \$\{kind\}`\)\n/g, '')
  if (mutated === clean) {
    report('run-path mutation is applicable to the baseline', false, 'the baseline fixture lost its run call site — restore it')
  } else {
    report('mutation 2: refusal removed from run path', fires(mutated, 'cmdRun'))
    report('mutation 2 problem names the run acquire path', fires(mutated, 'run'))
  }
}

// 3) Refusal weakened to a zero exit — the conflict is detected but the
//    second writer is allowed through. This is the "soft check" regression:
//    the invariant exists only if the refusal actually stops the process.
{
  const mutated = clean.replace(/(function assertAcquirable\(id, label\) \{[\s\S]*?process\.exit\()4\)/, '$10)')
  if (mutated === clean) {
    report('weakened-exit mutation is applicable to the baseline', false, 'the baseline fixture lost its process.exit(4) — restore it')
  } else {
    report('mutation 3: refusal weakened to process.exit(0)', fires(mutated, 'no longer exits non-zero'))
  }
}

// 4) The refusal function is deleted outright — the guard must catch the
//    missing function (and not crash on a dangling call site).
{
  const start = clean.indexOf('function assertAcquirable(')
  const end = clean.indexOf('function cmdDoctor(')
  if (start === -1 || end === -1 || end <= start) {
    report('delete-function mutation is applicable to the baseline', false, 'the baseline fixture lost its function anchors — restore it')
  } else {
    const mutated = clean.slice(0, start) + clean.slice(end)
    report('mutation 4: refusal function deleted', fires(mutated, 'is missing from factory.mjs'))
  }
}

// 5) Vacuity cross-check: a baseline where BOTH call sites are removed AND the
//    exit is weakened must report MORE than one problem — the rule is
//    independent, not a single boolean that happens to be green.
{
  const both = clean
    .replace(/  assertAcquirable\(id, `admit \$\{kind\}`\)\n/g, '')
    .replace(/  assertAcquirable\(id, `run \$\{kind\}`\)\n/g, '')
    .replace(/(function assertAcquirable\(id, label\) \{[\s\S]*?process\.exit\()4\)/, '$10)')
  const problems = problemsFor(both)
  report(
    'compound mutation: all three problems reported (independent checks, not one boolean)',
    problems.length >= 3,
    `got ${problems.length} problem(s): ${problems.join(' | ')}`,
  )
}

if (failures) {
  console.error(`\nfactory-lease-guard.check: ${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('\nfactory-lease-guard.check: ok — the lease-refusal guard fires on every reachable mutation and passes on the clean baseline')
