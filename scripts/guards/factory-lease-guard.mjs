#!/usr/bin/env node
// scripts/guards/factory-lease-guard.mjs
//
// Slice v33-15: the lease-refusal invariant must be an INVARIANT, not a soft
// check. v33-14 added a verify-mutex / lease-holder check to the factory CLI:
// two processes may never acquire the same task id. That check lives in
// factory.mjs as `assertAcquirable()`, and it is wired into BOTH acquire
// subcommands (`admit` and `run`), refusing with a non-zero exit when the id
// is already held by a different live process.
//
// This guard is the deterministic rule that the refusal path still exists and
// is still wired into both acquire paths:
//   1. `assertAcquirable()` exists and, on a held id, exits NON-ZERO (the
//      refusal is not a silent no-op that lets a second writer through).
//   2. `cmdAdmit()` calls `assertAcquirable()` — the admit path is guarded.
//   3. `cmdRun()` calls `assertAcquirable()` — the run path is guarded.
//
// If a future edit deletes the refusal from either acquire path, or weakens the
// refusal to a zero exit, this guard goes RED. Pure source inspection — no
// model, no LLM, no side effects.
//
// A sibling `factory-lease-guard.check.mjs` proves the rule can fire (it is
// not vacuously green): it feeds the rule mutated sources (refusal removed from
// one path, exit weakened, function deleted) and asserts each fires with the
// named problem, and that the clean tree passes.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// The refusal function and the two acquire command handlers in factory.mjs.
// Hardcoded by name (matching the sibling guards' convention): if a future
// slice renames `assertAcquirable` the guard goes red, which is correct — the
// invariant is the refusal, and a rename that drops the call sites is a real
// break, not a cosmetic one.
export const REFUSAL_HEADER = 'function assertAcquirable('
export const ACQUIRE_HEADERS = ['function cmdAdmit(', 'function cmdRun(']

// Extract the brace-delimited body of `function <name>(...` from source text.
// Returns the `{...}` body (braces included), or null if the header is absent.
export function extractBlock(source, header) {
  const i = source.indexOf(header)
  if (i === -1) return null
  let depth = 0
  let start = -1
  for (let j = i; j < source.length; j += 1) {
    const ch = source[j]
    if (ch === '{') {
      if (start === -1) start = j
      depth += 1
    } else if (ch === '}') {
      depth -= 1
      if (start !== -1 && depth === 0) return source.slice(start, j + 1)
    }
  }
  return source.slice(i)
}

// Does a function body contain at least one `process.exit(N)` with N != 0?
export function hasNonZeroExit(body) {
  const re = /process\.exit\(\s*(\d+)\s*\)/g
  for (const m of body.matchAll(re)) {
    if (Number(m[1]) !== 0) return true
  }
  return false
}

// The rule. `source` is the full text of scripts/factory/factory.mjs.
// Returns an array of human-readable problems (empty when the invariant holds).
export function checkLeaseRefusalInvariants(source) {
  const problems = []

  const refusalBody = extractBlock(source, REFUSAL_HEADER)
  if (!refusalBody) {
    // Short-circuit: if the refusal function is gone, the path checks are moot
    // (the call sites are now dangling). Report the single root problem.
    return [
      `${REFUSAL_HEADER.trim()} is missing from factory.mjs — the lease-refusal path does not exist; two processes can now both acquire one task id`,
    ]
  }

  if (!hasNonZeroExit(refusalBody)) {
    problems.push(
      `${REFUSAL_HEADER.trim()} no longer exits non-zero on a held id (found only process.exit(0) or no exit) — the refusal is now a silent no-op`,
    )
  }

  for (const header of ACQUIRE_HEADERS) {
    const body = extractBlock(source, header)
    if (!body) {
      problems.push(
        `${header.trim()} is missing from factory.mjs — cannot verify it refuses a held id`,
      )
      continue
    }
    if (!body.includes('assertAcquirable(')) {
      const path = header === 'function cmdAdmit(' ? 'admit' : 'run'
      problems.push(
        `${header.trim()} no longer calls assertAcquirable() — the lease-refusal invariant is not enforced on the ${path} acquire path`,
      )
    }
  }

  return problems
}

// ---------------------------------------------------------------------------
// CLI: run against the real tree.
// ---------------------------------------------------------------------------
// Gated behind is-main so the exported predicate stays a clean, side-effect-
// free import target: the sibling check imports `checkLeaseRefusalInvariants`
// to prove the rule can fire, and importing this module must NOT re-run the
// live-tree verdict (which would set process.exitCode from the live tree and
// couple the check's exit to it). run-all.sh invokes `node scripts/guards/
// factory-lease-guard.mjs` from the repo root, so argv[1] is relative; the
// pathToFileURL comparison is robust to both relative and absolute argv[1].
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const FACTORY = join(HERE, '../factory/factory.mjs')
  const source = readFileSync(FACTORY, 'utf8')
  const problems = checkLeaseRefusalInvariants(source)
  if (problems.length) {
    for (const p of problems) console.error(`[factory-lease] ${p}`)
    process.exitCode = 1
  } else {
    console.log('[factory-lease] ok — lease-refusal wired into both acquire paths, exits non-zero on a held id')
  }
}
