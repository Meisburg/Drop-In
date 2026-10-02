#!/usr/bin/env node
// Factory guard — the rules that must not depend on anyone remembering them.
//
// WHY THIS EXISTS. The factory's review lanes JUDGE; they do not GUARANTEE. A
// reviewer reads the diff it was given; `ocr` skips config and prose; the
// verifier runs the commands it was handed. The registry, the work state and the
// reservation file are exactly the kind of artifact none of them opens — and the
// registry is where the memory arithmetic lives, so a silent error in it is a
// silent OOM.
//
// So this is the deterministic half, in the same shape as the repo's other
// guards: it either finds a violation or it does not, it costs no tokens, and it
// runs in `npm run guards` on every slice.
//
// The rules, each with the failure it prevents:
//
//   registry-fields       every model and task kind declares where its numbers
//                         came from — an unlabelled number reads as measured
//   floors-meetable       every capability floor has at least one model above it,
//                         so `route` can never be unsatisfiable by construction
//   lane-states-legal     no work item sits in a state the machine cannot reach
//   acceptance-not-early  acceptance cannot be `pass` while a required lane is
//                         not complete — the gate the orchestrator must not be
//                         able to talk its way past
//   waived-has-reason     a waiver is a written decision, never a silent green
//   deps-exist            every depends_on names a work item that exists
//   artifacts-exist       EVERY ARTIFACT PATH A WORK ITEM NAMES IS ON DISK.
//                         This is the one with teeth: an artifact named but
//                         missing is a claim with nothing behind it, which is
//                         the exact failure this factory was built to stop.
//   health-declared       every model says HOW it is known to be reachable. A
//                         model with no probe is a fallback that fails late.
//   residency-declared    every model says whether it is resident, on-demand or
//                         remote, and every remote-capable probe can be run
//   one-resident-local    at most one LOCAL model is declared resident, because
//                         they share `exclusive: local-inference` and cannot
//                         coexist — and policy and the per-model fields agree
//   reclaim-opt-in        reclamation is not automatic (D-004)
//   remote-verified       an unverified remote endpoint is never a fallback (D-003)
//   independence-satisfiable  a lane requiring same_model:false has a second
//                         model that clears its floor, or says in writing that
//                         it does not — independence is not a slogan
//   instrument-headers-honest  a guard's header block states only what a reader
//                         can point at: the counts it reports are derived at run
//                         time, and a claim about its own text names the commit
//                         or the line that shows it
//   no-bare-head-count    a count in a report or a brief names the commit it was
//                         measured at: "N at HEAD" is unreproducible by
//                         construction, because the commit carrying the sentence
//                         is the one that moves HEAD. Forward-only, and the run
//                         prints the size of the recorded baseline it passes.
//
// Usage:  node scripts/guards/factory-guard.mjs [--root <dir>]
// Exit:   0 = clean, 1 = findings

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const rootFlag = argv.indexOf('--root')
const ROOT = resolve(rootFlag === -1 ? join(import.meta.dirname, '..', '..') : argv[rootFlag + 1])

const FACTORY = join(ROOT, 'factory')
const findings = []
const fail = (check, msg) => findings.push({ check, msg })

// ---------------------------------------------------------------------------

function readConfig() {
  const path = join(FACTORY, 'config.json')
  if (!existsSync(path)) {
    fail('config-exists', `factory/config.json is missing at ${FACTORY}`)
    return null
  }
  try {
    const config = JSON.parse(readFileSync(path, 'utf8'))
    if (config.version !== 1) fail('config-version', `unsupported config version ${config.version}`)
    return config
  } catch (e) {
    fail('config-parses', `factory/config.json does not parse: ${e.message}`)
    return null
  }
}

function checkRegistry(config) {
  if (!config) return
  for (const [key, model] of Object.entries(config.models ?? {})) {
    if (!model.provider) fail('registry-fields', `${key}: no provider`)
    if (!model.capabilities) fail('registry-fields', `${key}: no capabilities`)
    if (!model.resources) fail('registry-fields', `${key}: no resources`)
    else if (!model.resources.footprint_source) {
      fail('registry-fields', `${key}: resources has no footprint_source — an unlabelled number reads as measured`)
    }
    if (!Number.isFinite(model.cost_tier)) fail('registry-fields', `${key}: no cost_tier`)
    const probe = model.health?.probe
    if (!model.health) fail('health-declared', `${key}: no health block — a model with no availability check is a fallback that fails late`)
    else if (!['service', 'tcp'].includes(probe)) fail('health-declared', `${key}: health.probe is '${probe}', not one of service|tcp`)
    else if (probe === 'tcp' && !model.endpoint) fail('health-declared', `${key}: probe tcp needs an endpoint to derive host and port from`)
    else if (probe === 'service' && !model.service) fail('health-declared', `${key}: probe service needs a systemd unit name`)
    if (!['resident', 'on-demand', 'remote'].includes(model.residency)) {
      fail('residency-declared', `${key}: residency is ${JSON.stringify(model.residency)}, not one of resident|on-demand|remote`)
    }
    if (model.residency === 'resident' && model.provider !== 'local') {
      fail('residency-declared', `${key}: declared 'resident' but is not a local model`)
    }
  }

  // At most ONE local model may be declared resident. Every local model declares
  // `exclusive: local-inference` because they genuinely cannot coexist — measured
  // 2026-10-02, when ninfer-serve holding the GPU drove strata-max into 176 failed
  // starts in 20 minutes. Two residents would be a registry that contradicts the
  // hardware it describes.
  const residentLocals = Object.entries(config.models ?? {})
    .filter(([, m]) => m.provider === 'local' && m.residency === 'resident')
    .map(([k]) => k)
  if (residentLocals.length > 1) {
    fail('one-resident-local', `${residentLocals.length} local models are declared resident (${residentLocals.join(', ')}) — they share the 'local-inference' resource and cannot coexist`)
  }
  if (residentLocals.length === 0) {
    fail('one-resident-local', 'no local model is declared resident — the factory has no worker it expects to be running')
  }
  const declaredResidents = config.policies?.residency?.resident
  if (declaredResidents && JSON.stringify([...declaredResidents].sort()) !== JSON.stringify([...residentLocals].sort())) {
    fail('one-resident-local', `policies.residency.resident (${declaredResidents.join(', ')}) disagrees with the per-model residency fields (${residentLocals.join(', ')})`)
  }

  // Reclaim must never be able to kill a model that is in use, and it is not
  // automatic until the scheduler has liveness and ownership semantics (D-004).
  if (config.policies?.reclaim !== 'opt-in') {
    fail('reclaim-opt-in', `policies.reclaim is ${JSON.stringify(config.policies?.reclaim)} — automatic reclamation is a later change and must be a deliberate one`)
  }

  if (config.policies?.remote_verification !== 'required') {
    fail('remote-verified', `policies.remote_verification is ${JSON.stringify(config.policies?.remote_verification)} — an unverified remote endpoint must not be treated as a fallback (D-003)`)
  }

  for (const [kind, task] of Object.entries(config.task_kinds ?? {})) {
    if (!task.resources) fail('registry-fields', `task kind '${kind}': no resources`)
    else if (!task.resources.footprint_source) fail('registry-fields', `task kind '${kind}': no footprint_source`)
  }

  const gaps = (model, floors) =>
    Object.entries(floors ?? {}).filter(([name, floor]) => {
      const have = model.capabilities?.[name]
      return !Number.isFinite(have) || have < floor
    })

  for (const [kind, task] of Object.entries(config.task_kinds ?? {})) {
    const floors = task.capabilities ?? {}
    if (!Object.keys(floors).length) continue
    const models = Object.values(config.models ?? {})
    const eligible = models.filter((m) => gaps(m, floors).length === 0 && (!task.requires_local_inference || m.provider === 'local'))
    if (!eligible.length) {
      fail('floors-meetable', `task kind '${kind}' has a capability floor (or a local-inference requirement) no registered model can meet — route can never succeed`)
    }
  }

  // Independence is a property, not a slogan. A lane that declares
  // `same_model: false` needs at least TWO models that clear its floor, or the
  // rule cannot be satisfied and the router will hand back the implementer's own
  // sibling. Either register a second model, or ACKNOWLEDGE the gap in the
  // registry — an unacknowledged gap is one nobody has decided about.
  for (const [kind, task] of Object.entries(config.task_kinds ?? {})) {
    if (!task.independence?.required || task.independence.same_model !== false) continue
    const floors = task.capabilities ?? {}
    const qualified = Object.entries(config.models ?? {}).filter(([, m]) => gaps(m, floors).length === 0)
    if (qualified.length < 2 && !task._independence_gap) {
      fail(
        'independence-satisfiable',
        `task kind '${kind}' requires same_model:false but only ${qualified.length} model(s) clear its floor — either register a second, or record task_kinds.${kind}._independence_gap saying so`,
      )
    }
  }

  const lanes = config.lane_states ?? {}
  const laneNames = config.lanes ?? []
  const acceptanceStates = config.acceptance_states ?? {}
  if (!Object.keys(lanes).length) fail('lane-states-legal', 'config has no lane_states table')
  if (!laneNames.length) fail('lane-states-legal', 'config declares no lane set')
  if (!Object.keys(acceptanceStates).length) fail('lane-states-legal', 'config has no acceptance_states table')
  for (const [from, tos] of Object.entries(lanes)) {
    if (!Array.isArray(tos)) fail('lane-states-legal', `lane_states['${from}'] is not a list`)
  }

  const requires = config.acceptance_gate?.requires
  if (!Array.isArray(requires) || !requires.length) {
    fail('acceptance-not-early', 'config has no acceptance_gate.requires list')
  } else {
    // `requires` names LANES, not states. Comparing it against the state table
    // was this guard's own first bug, caught by its behavior check.
    for (const lane of requires) {
      if (!laneNames.includes(lane)) fail('acceptance-not-early', `acceptance_gate.requires names '${lane}', which is not a declared lane`)
    }
  }
}

function checkWorkItems(config) {
  const workDir = join(FACTORY, 'work')
  if (!existsSync(workDir)) return
  const items = readdirSync(workDir).filter((f) => f.endsWith('.json')).map((f) => ({ file: f, item: JSON.parse(readFileSync(join(workDir, f), 'utf8')) }))
  const ids = new Set(items.map(({ item }) => item.id))

  for (const { file, item } of items) {
    const laneNames = config?.lanes ?? []
    const workStates = Object.keys(config?.lane_states ?? {})
    const acceptanceStates = Object.keys(config?.acceptance_states ?? {})

    for (const [lane, value] of Object.entries(item.lanes ?? {})) {
      if (laneNames.length && !laneNames.includes(lane)) {
        fail('lane-states-legal', `${file}: lane '${lane}' is not a declared lane`)
        continue
      }
      // The acceptance lane is the gate over the work, so it has its own
      // vocabulary rather than sharing the work-lane state table.
      const legal = lane === 'acceptance' ? acceptanceStates : workStates
      if (!legal.includes(value.state)) {
        fail('lane-states-legal', `${file}: lane '${lane}' is in state '${value.state}', which is not a legal state for that lane`)
      }
      if (value.state === 'waived' && !value.reason) {
        fail('waived-has-reason', `${file}: lane '${lane}' is waived with no reason — a waiver is a written decision`)
      }
    }

    // An artifact named but missing is a claim with nothing behind it.
    for (const [lane, value] of Object.entries(item.lanes ?? {})) {
      for (const artifact of value.artifacts ?? []) {
        const path = isAbsolute(artifact) ? artifact : join(ROOT, artifact)
        if (!existsSync(path)) fail('artifacts-exist', `${file}: lane '${lane}' names artifact '${artifact}', which is not on disk`)
      }
    }

    for (const dep of item.depends_on ?? []) {
      if (!ids.has(dep)) fail('deps-exist', `${file}: depends_on names '${dep}', which is not a work item`)
    }

    const requires = config?.acceptance_gate?.requires ?? []
    const acceptance = item.lanes?.acceptance
    if (acceptance?.state === 'pass') {
      const incomplete = requires.filter((lane) => item.lanes?.[lane]?.state !== 'complete')
      if (incomplete.length) {
        fail(
          'acceptance-not-early',
          `${file}: acceptance is 'pass' while ${incomplete.map((l) => `${l}=${item.lanes?.[l]?.state ?? 'missing'}`).join(', ')} — the gate cannot be talked past`,
        )
      }
    }
  }
}

/**
 * Agent definitions may declare a DEFAULT model, but it must be a model the
 * registry knows. A `model:` naming something absent from the registry is how a
 * role quietly goes back to being hardcoded — the exact drift capability routing
 * exists to remove. The live harness's agent dir is machine-local, so it is
 * checked when present and named as skipped when not.
 */
function checkAgentModels(config) {
  if (!config) return
  const known = new Set(Object.keys(config.models ?? {}))
  const sources = [{ dir: join(ROOT, '.opencode', 'agents'), label: 'in-repo' }]
  const piAgents = join(homedir(), '.pi', 'agent', 'agents')
  if (existsSync(piAgents)) sources.push({ dir: piAgents, label: 'live harness' })
  else console.log('  note — the live harness agent dir is absent; its defaults are unchecked here')

  for (const { dir, label } of sources) {
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const text = readFileSync(join(dir, file), 'utf8')
      const declared = /^model:\s*(\S+)\s*$/m.exec(text)?.[1]
      if (!declared) continue
      if (!known.has(declared)) {
        fail('agent-model-in-registry', `agents/${file} (${label}) pins model '${declared}', which is not in factory/config.json — a default that drifts out of the registry is a hardcoded role again`)
      }
    }
  }
}

/**
 * A guard's header is the statement of what the guard covers —
 * `docs/agents/code-structure.md` names `regexp-escape-guard.mjs`'s header as
 * authoritative for its scope — so a header that states something other than the
 * mechanism is a defect a reader acts on. Two shapes have actually gone wrong,
 * and both are cheap to catch:
 *
 *   - a COUNT of the instrument's own cases typed into the header ("all 9 checks
 *     passed", "12 cases"). The file grows, the sentence does not, and the
 *     sentence is what a reviewer trusts. Print the derived count instead.
 *   - a HISTORY claim about the header's own text with nothing that resolves it
 *     ("a typed count in this header went stale once already" — a sentence whose
 *     claimed commit does not exist). A commit sha or a `file:line` is what makes
 *     the claim checkable; without one, a reader has to take it on faith, and the
 *     pointer has to sit on the line that makes the claim — a header is short,
 *     and a claim whose evidence is three lines away is the shape that failed.
 *
 * The second shape is matched only where the line is about THIS instrument's own
 * text or numbers (count/number/total/header/sentence/prose/label/map). A header
 * that says some OTHER file's comment "used to be X" is documentation of the
 * codebase, not a claim about this header; flagging that would fire the rule on
 * prose about the repo.
 */
const HEADER_TYPED_COUNT = /\d+\s*[-\s]?\s*(?:check|checks|case|cases|test|tests)\b|checks?\s+passed|\ball\s+\d+\s+check/i
const HEADER_HISTORY = /\b(?:went stale|was once|used to be|has grown)\b/i
const HEADER_SELF_SUBJECT = /\b(?:count|counts|number|total|header|sentence|prose|label|map)\b/i
const HEADER_POINTER = /\b[0-9a-f]{7,40}\b|[\w@./-]+:\d+/

function checkInstrumentHeaders() {
  const dir = join(ROOT, 'scripts', 'guards')
  if (!existsSync(dir)) {
    console.log('  note — no scripts/guards under this root; instrument headers unchecked here')
    return 0
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.mjs'))
  for (const file of files) {
    const lines = readFileSync(join(dir, file), 'utf8').split('\n')
    for (const [index, line] of lines.entries()) {
      const text = line.trim()
      // The header block: the leading comment lines, before the first line of
      // code. `#` covers the shebang; the rest are the block-comment spellings.
      // A BLANK line is part of the block, not the end of it — treating it as
      // "not a comment" used to stop the scan silently, so a typed count after
      // one went unflagged (the gap this scan's own behaviour check now seeds).
      if (!text) continue
      if (!/^(?:\/\/|\/\*|\*|#)/.test(text)) break
      if (HEADER_TYPED_COUNT.test(text)) {
        fail(
          'instrument-headers-honest',
          `${file}:${index + 1}: the header types a count of this instrument's own cases — print the count the run derives instead: ${JSON.stringify(text)}`,
        )
      }
      if (HEADER_HISTORY.test(text) && HEADER_SELF_SUBJECT.test(text) && !HEADER_POINTER.test(text)) {
        fail(
          'instrument-headers-honest',
          `${file}:${index + 1}: the header claims its own text changed and names no commit sha or file:line to check it against: ${JSON.stringify(text)}`,
        )
      }
    }
  }
  return files.length
}

/**
 * A count in a report or a brief must name the commit it was measured at.
 *
 * WHY THIS EXISTS. `instrument-headers-honest` reads guard HEADERS; this class
 * kept recurring in report PROSE, where no instrument was looking. A count
 * written as "N at HEAD" is unreproducible BY CONSTRUCTION — the commit that
 * carries the sentence is the one that moves HEAD, so the number was measured at
 * one commit and read at another. It has now cost four review rounds.
 *
 * FORWARD-ONLY, and that is a hard requirement. `factory/decisions.md` D-011
 * item 2 rules that a historical record KEEPS its original label: a record
 * retro-edited to look always-right is not evidence. So the known occurrences
 * are recorded in the baseline below, the run PRINTS the baseline's size at run
 * time (a size typed into the header would go stale in this file's own text),
 * and only an occurrence that is not in it fails. The baseline shrinks only by a
 * deliberate edit.
 */
const BARE_HEAD_COUNT = /(?<![\d/.\w])\d+(?![/\d])\s+(?:[a-z`][\w`.-]*\s+){0,4}\bat (?:the )?HEAD\b/
const BARE_HEAD_BASELINE = new Map([
  ['.scratch/v28/briefs/slice-6c-fix-2.md::265 at HEAD', 1],
  ['.scratch/v28/briefs/slice-6c-fix-3.md::265 at HEAD', 2],
  ['.scratch/v28/briefs/slice-6c-fix-4.md::265 at HEAD', 1],
  ['.scratch/v28/reports/slice-6c-fix-1-review.md::265 at HEAD', 4],
  ['.scratch/v28/reports/slice-6c-fix-1-verify.md::265 at HEAD', 1],
  ['.scratch/v28/reports/slice-6c-fix-2-review.md::265 at HEAD', 4],
  ['.scratch/v28/reports/slice-6c-fix-2-review.md::271 at HEAD', 1],
  ['.scratch/v28/reports/slice-6c-fix-2-review.md::439 at HEAD', 1],
  ['.scratch/v28/reports/slice-6c-fix-2-verify.md::265 at HEAD', 3],
  ['.scratch/v28/reports/slice-6c-fix-3-review.md::265 at HEAD', 1],
  ['.scratch/v28/reports/slice-6c-fix-3-review.md::276 tracked `.scratch` files at HEAD', 1],
  ['.scratch/v28/reports/slice-6c-fix-3-verify.md::265 at HEAD', 1],
  ['.scratch/v28/reports/slice-6c-fix-3.md::265 at HEAD', 2],
])
const BARE_HEAD_BASELINE_SIZE = [...BARE_HEAD_BASELINE.values()].reduce((sum, n) => sum + n, 0)

function checkReportHeadCounts() {
  console.log(`  note — no-bare-head-count: baseline holds ${BARE_HEAD_BASELINE_SIZE} recorded occurrence(s); a count labelled HEAD must not be added`)
  const dirs = ['reports', 'briefs'].map((d) => join(ROOT, '.scratch', 'v28', d))
  const files = []
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.md'))) files.push(join(dir, f))
  }
  if (!files.length) {
    console.log('  note — no .scratch/v28/reports or briefs under this root; report and brief counts unchecked here')
    return 0
  }
  const seen = new Map()
  for (const path of files) {
    const rel = relative(ROOT, path)
    const lines = readFileSync(path, 'utf8').split('\n')
    for (const [index, line] of lines.entries()) {
      const match = BARE_HEAD_COUNT.exec(line)
      if (!match) continue
      const key = `${rel}::${match[0].trim()}`
      const seenCount = (seen.get(key) ?? 0) + 1
      seen.set(key, seenCount)
      if (seenCount > (BARE_HEAD_BASELINE.get(key) ?? 0)) {
        fail(
          'no-bare-head-count',
          `${rel}:${index + 1}: a count is labelled HEAD and cannot be reproduced — name the commit it was measured at: ${JSON.stringify(match[0].trim())}`,
        )
      }
    }
  }
  return files.length
}

// ---------------------------------------------------------------------------

console.log('Factory guard — the scheduler registry and the work state')
console.log('===========================================================')

const config = readConfig()
checkRegistry(config)
checkWorkItems(config)
checkAgentModels(config)
const headerFiles = checkInstrumentHeaders()
const reportFiles = checkReportHeadCounts()

if (!findings.length) {
  const items = existsSync(join(FACTORY, 'work')) ? readdirSync(join(FACTORY, 'work')).filter((f) => f.endsWith('.json')).length : 0
  const models = Object.keys(config?.models ?? {}).length
  const kinds = Object.keys(config?.task_kinds ?? {}).length
  // The summary claims only the checks that were actually run: a root with no
  // scripts/guards has no header to vouch for, and saying otherwise is the same
  // failure this guard exists to catch.
  const claims = ['every floor meetable', 'every artifact present']
  if (headerFiles) claims.push('every instrument header stating only what it can point at')
  if (reportFiles) claims.push('every report and brief count naming the commit it was measured at')
  console.log(`  ok — ${models} model(s), ${kinds} task kind(s), ${items} work item(s); ${claims.join(', ')}`)
  console.log()
  console.log('PASS — the registry can be trusted and no work item claims evidence it does not have.')
  process.exit(0)
}

for (const f of findings) console.log(`  FINDING [${f.check}]: ${f.msg}`)
console.log()
console.log(`FAIL — ${findings.length} factory finding(s).`)
process.exit(1)
