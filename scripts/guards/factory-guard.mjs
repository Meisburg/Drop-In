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
//
// Usage:  node scripts/guards/factory-guard.mjs [--root <dir>]
// Exit:   0 = clean, 1 = findings

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
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

// ---------------------------------------------------------------------------

console.log('Factory guard — the scheduler registry and the work state')
console.log('===========================================================')

const config = readConfig()
checkRegistry(config)
checkWorkItems(config)
checkAgentModels(config)

if (!findings.length) {
  const items = existsSync(join(FACTORY, 'work')) ? readdirSync(join(FACTORY, 'work')).filter((f) => f.endsWith('.json')).length : 0
  const models = Object.keys(config?.models ?? {}).length
  const kinds = Object.keys(config?.task_kinds ?? {}).length
  console.log(`  ok — ${models} model(s), ${kinds} task kind(s), ${items} work item(s); every floor meetable, every artifact present`)
  console.log()
  console.log('PASS — the registry can be trusted and no work item claims evidence it does not have.')
  process.exit(0)
}

for (const f of findings) console.log(`  FINDING [${f.check}]: ${f.msg}`)
console.log()
console.log(`FAIL — ${findings.length} factory finding(s).`)
process.exit(1)
