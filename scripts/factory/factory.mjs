#!/usr/bin/env node
// factory — the resource scheduler and work-state CLI.
//
// The orchestrator decides what/why/evidence/dependencies. This decides
// where/when/how, and refuses to start what cannot coexist. See
// docs/agents/factory.md.
//
// Exit codes:  0 ok  1 usage/error  3 BLOCKED_RESOURCE  4 illegal transition
//
//   factory doctor
//   factory route builder [--independence-of <work-id|model>] [--json]
//   factory admit verifier --id r2-6c-verify [--model <key>] [--json]
//   factory run gate --id r2-6c-gate -- npm run verify
//   factory release <id>
//   factory reclaim
//   factory work init|list|show|ready|graph|transition

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import process from 'node:process'

import {
  DEFAULT_LANES,
  acceptanceDecision,
  admit,
  checkHealth,
  capabilityGaps,
  dependencyGraph,
  laneTransitionAllowed,
  liveReservations,
  loadConfig,
  reclaimCandidates,
  readyItems,
  residentModel,
  selectModel,
  systemProbes,
} from './scheduler.mjs'
import {
  addReservation,
  applyTransition,
  implementerOf,
  listWorkItems,
  logRun,
  logTelemetry,
  newWorkItem,
  paths,
  readReservations,
  readRuns,
  readTelemetry,
  readWorkItem,
  releaseReservation,
  writeWorkItem,
} from './state.mjs'

const argv = process.argv.slice(2)
const cmd = argv[0]
const rest = argv.slice(1)

/** Minimal flag parser: --key value, --flag, and everything after `--` verbatim. */
function parse(args) {
  const flags = {}
  const positional = []
  const passthrough = []
  let i = 0
  for (; i < args.length; i += 1) {
    const a = args[i]
    if (a === '--') {
      passthrough.push(...args.slice(i + 1))
      break
    }
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = args[i + 1]
      if (next === undefined || next.startsWith('--')) flags[key] = true
      else {
        flags[key] = next
        i += 1
      }
    } else positional.push(a)
  }
  return { flags, positional, passthrough }
}

const json = (v) => console.log(JSON.stringify(v, null, 2))
const gb = (n) => (n === null || n === undefined ? 'unknown' : `${n} GB`)
const die = (msg, code = 1) => {
  console.error(msg)
  process.exit(code)
}

const config = loadConfig(paths.config)
const reservationsNow = () => liveReservations(readReservations(), systemProbes.now())

/** Resolve --independence-of to a model set, and say whether it could be resolved. */
function avoidModelsFrom(independenceOf) {
  if (!independenceOf) return { avoid: [], requested: false, unverifiable: false }
  if (config.models[independenceOf]) return { avoid: [independenceOf], requested: true, unverifiable: false }
  const item = readWorkItem(independenceOf)
  const impl = implementerOf(item)
  if (!impl) die(`--independence-of '${independenceOf}' is neither a registered model nor a work item with an implementation lane`)
  // same_model:false is the mechanism. same_run:false is satisfied by this being a
  // fresh dispatch, and is recorded rather than enforced.
  //
  // A lane with no recorded model is a HOLE, not a pass: nothing can be excluded,
  // and the router would hand back the implementer's own model while looking like
  // it had honoured the rule. That is reported, never assumed away.
  return { avoid: impl.model ? [impl.model] : [], requested: true, unverifiable: !impl.model }
}

/**
 * The truth about independence for one routing decision, or null when it is not
 * in question.
 *
 * Why this exists: on the live registry the reviewer's floor (reasoning 3,
 * tool_use 3) is cleared by EXACTLY ONE model. So same_model:false is
 * unsatisfiable by construction whenever that model is the implementer — the
 * router's own preference order will quietly select the sibling, and a reviewer
 * that is the builder's sibling cannot break the deadlock the escalation ladder
 * exists for. Silence is the failure; a named loss is survivable.
 */
function independenceNote(kind, chosen, indep) {
  if (!indep.requested || !chosen) return null
  if (indep.unverifiable) {
    return 'INDEPENDENCE UNVERIFIABLE — the work item records no implementer model, so nothing could be excluded. Record the model on the implementation lane.'
  }
  const rule = config.task_kinds[kind]?.independence
  if (!rule?.required) return null
  if (indep.avoid.includes(chosen)) {
    return `INDEPENDENCE VIOLATED — ${chosen} IS the implementer's model.`
  }
  const floors = config.task_kinds[kind]?.capabilities ?? {}
  const qualified = Object.entries(config.models).filter(([, m]) => capabilityGaps(m, floors).length === 0).map(([k]) => k)
  const independent = qualified.filter((k) => !indep.avoid.includes(k))
  if (qualified.length && !independent.length) {
    return `INDEPENDENCE UNSATISFIABLE — '${kind}' requires same_model:false, but ${chosen} is the ONLY registered model that clears its floor. This dispatch is a SIBLING of the implementer.`
  }
  return null
}

// ---------------------------------------------------------------------------

function cmdDoctor() {
  const ram = systemProbes.availableRamGb()
  const total = systemProbes.totalRamGb()
  const vram = systemProbes.freeVramGb()
  const live = reservationsNow()

  console.log('factory — resource picture')
  console.log('===========================================================')
  console.log(`RAM   available ${gb(ram === null ? null : Math.round(ram))} of ${gb(total === null ? null : Math.round(total))}   reserve ${gb(config.machine.reserve_gb)}`)
  console.log(`VRAM  free      ${gb(vram === null ? null : Math.round(vram * 10) / 10)}`)
  console.log()
  console.log('local models')
  const wantResident = residentModel(config)
  for (const [key, model] of Object.entries(config.models)) {
    if (model.provider !== 'local') continue
    const state = systemProbes.serviceState(model.service)
    const resident = systemProbes.serviceRamGb(model.service)
    const mark = state === 'active' ? '●' : state === 'activating' ? '◌' : state === 'failed' ? '✗' : '○'
    const should = model.residency === 'resident' ? 'RESIDENT' : 'on-demand'
    const drift = state === 'active' && model.residency !== 'resident' ? '  ⚠ resident but declared on-demand'
      : state === 'inactive' && model.residency === 'resident' ? '  ⚠ declared resident but not running'
        : ''
    console.log(
      `  ${mark} ${key}` +
        `  ${should}  service=${model.service} ${state}` +
        `  resident=${gb(resident === null ? null : Math.round(resident * 10) / 10)}` +
        `  footprint=${model.resources.ram_gb === null ? 'UNMEASURED (inadmissible)' : gb(model.resources.ram_gb)}${drift}`,
    )
  }
  if (wantResident) console.log(`  the factory's own worker is ${wantResident} — start it with: systemctl --user start ${config.models[wantResident].service}`)

  console.log()
  console.log('remote models')
  for (const [key, model] of Object.entries(config.models)) {
    if (model.provider === 'local') continue
    const health = checkHealth(key, config, systemProbes)
    console.log(`  ${health.ok ? '●' : '○'} ${key}  ${health.ok ? 'reachable' : 'NOT REACHABLE'}  (${health.how})  cost_tier ${model.cost_tier}`)
  }
  console.log()
  console.log(`reservations (${live.length} live)`)
  if (!live.length) console.log('  none')
  for (const r of live) {
    console.log(`  ${r.id}  ${r.kind}  ${r.state}  needs ${gb(r.requiredGb)}${r.exclusive ? `  holds ${r.exclusive}` : ''}`)
  }

  console.log()
  console.log('what each task kind would do right now')
  for (const kind of Object.keys(config.task_kinds)) {
    const task = config.task_kinds[kind]
    if (Object.keys(task.capabilities ?? {}).length === 0) {
      const d = admit({ config, kind, probes: systemProbes, reservations: live })
      console.log(`  ${d.state === 'ADMITTED' ? '✓' : '✗'} ${kind.padEnd(14)} ${d.state}${d.reasons.length ? ` — ${d.reasons[0]}` : ''}`)
      continue
    }
    const routed = selectModel({ config, kind, reservations: live })
    console.log(
      `  ${routed.modelKey ? '✓' : '✗'} ${kind.padEnd(14)} ` +
        (routed.modelKey ? `${routed.modelKey}${routed.fallback ? ' (fallback)' : ''}` : routed.reason),
    )
    if (!routed.modelKey) for (const r of routed.rejected) console.log(`        ${r.modelKey}: ${r.why}`)
  }
  process.exit(0)
}

function cmdRoute(args) {
  const { flags, positional } = parse(args)
  const kind = positional[0] ?? die('usage: factory route <task-kind> [--independence-of <work-id|model>]')
  const indep = avoidModelsFrom(flags['independence-of'])
  const decision = selectModel({ config, kind, reservations: reservationsNow(), avoidModels: indep.avoid })
  if (flags.json) {
    json({ ...decision, independence: independenceNote(kind, decision.modelKey, indep) })
    process.exit(0)
  }
  const note = independenceNote(kind, decision.modelKey, indep)
  console.log(`route ${kind} -> ${decision.modelKey ?? 'NO ELIGIBLE MODEL'}`)
  console.log(`  ${decision.reason}`)
  if (decision.provider) console.log(`  provider ${decision.provider}  cost_tier ${decision.costTier}${decision.fallback ? '  (fallback)' : ''}`)
  if (indep.avoid.length) console.log(`  independence: excluded ${indep.avoid.join(', ')} (same model as the implementer)`)
  if (note) {
    console.log(`  ⚠ ${note}`)
    logTelemetry({ event: 'independence_unsatisfied', kind, chosen: decision.modelKey, note, avoid: indep.avoid })
  }
  for (const r of decision.rejected) console.log(`  rejected ${r.modelKey}: ${r.why}`)
  for (const r of decision.reclaimable ?? []) console.log(`  reclaimable: ${r.what} (${gb(r.gb)}) — ${r.how}`)
  process.exit(decision.modelKey ? 0 : 3)
}

/**
 * The model a dispatch will use, or a refusal.
 *
 * A task kind that declares a capability floor NEEDS a model. If the router
 * cannot find an admissible one, admitting the task anyway would start work with
 * no worker — and an `ocr` lane with no OCR model is not a cheaper `ocr`, it is a
 * silent no-op. So the router's refusal IS the admission's refusal.
 */
function resolveModel({ kind, requested }) {
  const needsModel = Object.keys(config.task_kinds[kind]?.capabilities ?? {}).length > 0
  if (requested) return { modelKey: requested }
  const routed = selectModel({ config, kind, reservations: reservationsNow() })
  if (!routed.modelKey && needsModel) {
    return {
      blocked: true,
      reasons: [`no eligible model for '${kind}': ${routed.reason}`, ...routed.rejected.map((r) => `${r.modelKey}: ${r.why}`)],
      reclaimable: routed.reclaimable ?? [],
    }
  }
  return { modelKey: routed.modelKey ?? null }
}

function reportBlocked(head, id, kind, resolved) {
  console.log(`${head} ${id} (${kind}) -> BLOCKED_RESOURCE`)
  for (const r of resolved.reasons) console.log(`  BLOCKED: ${r}`)
  for (const r of resolved.reclaimable) console.log(`  reclaimable: ${r.what} (${gb(r.gb)}) — ${r.how}`)
  logTelemetry({ event: 'blocked_resource', id, kind, reasons: resolved.reasons, reclaimable: resolved.reclaimable })
}

function cmdAdmit(args) {
  const { flags, positional } = parse(args)
  const kind = positional[0] ?? die('usage: factory admit <task-kind> --id <id> [--model <key>]')
  const id = flags.id ?? die('factory admit: --id is required — every lease needs an owner')
  const resolved = resolveModel({ kind, requested: flags.model })
  if (resolved.blocked) {
    reportBlocked('admit', id, kind, resolved)
    process.exit(3)
  }
  const modelKey = resolved.modelKey
  const decision = admit({ config, kind, id, modelKey, probes: systemProbes, reservations: reservationsNow() })
  if (flags.json) json(decision)
  else printAdmission(kind, id, decision)

  if (decision.state === 'ADMITTED') {
    addReservation({
      id,
      kind,
      model: modelKey,
      state: 'ADMITTED',
      requiredGb: decision.requiredGb,
      exclusive: decision.exclusive ?? null,
      admittedAt: new Date().toISOString(),
      expiresAt: systemProbes.now() + 30 * 60 * 1000,
    })
    process.exit(0)
  }
  logTelemetry({ event: 'blocked_resource', id, kind, model: modelKey, reasons: decision.reasons, reclaimable: decision.reclaimable })
  process.exit(3)
}

function printAdmission(kind, id, d) {
  console.log(`admit ${id} (${kind}) -> ${d.state}`)
  if (d.model) console.log(`  model ${d.model}`)
  console.log(`  needs ${gb(d.requiredGb)}  usable ${gb(d.usableGb)}  available ${gb(d.availableGb)}  reserve ${gb(d.reserveGb)}  promised ${gb(d.heldGb)}`)
  for (const r of d.reasons) console.log(`  BLOCKED: ${r}`)
  for (const r of d.reclaimable ?? []) console.log(`  reclaimable: ${r.what} (${gb(r.gb)}) — ${r.how}`)
}

/**
 * `run` is the point of the whole thing: it admits, executes, logs and releases
 * in one place, so the check cannot be forgotten by a caller in a hurry.
 */
function cmdRun(args) {
  const { flags, positional, passthrough } = parse(args)
  const kind = positional[0] ?? die('usage: factory run <task-kind> --id <id> -- <command...>')
  const id = flags.id ?? die('factory run: --id is required')
  if (!passthrough.length) die('factory run: no command given (use `-- <command...>`)')
  const resolved = resolveModel({ kind, requested: flags.model })
  if (resolved.blocked) {
    reportBlocked('run', id, kind, resolved)
    process.exit(3)
  }
  const modelKey = resolved.modelKey

  const decision = admit({ config, kind, id, modelKey, probes: systemProbes, reservations: reservationsNow() })
  printAdmission(kind, id, decision)
  if (decision.state !== 'ADMITTED') {
    logTelemetry({ event: 'blocked_resource', id, kind, model: modelKey, reasons: decision.reasons, reclaimable: decision.reclaimable })
    process.exit(3)
  }

  addReservation({
    id,
    kind,
    model: modelKey,
    state: 'RUNNING',
    requiredGb: decision.requiredGb,
    exclusive: decision.exclusive ?? null,
    admittedAt: new Date().toISOString(),
  })

  const startedAt = Date.now()
  const [bin, ...binArgs] = passthrough
  const result = spawnSync(bin, binArgs, { stdio: 'inherit', cwd: process.cwd(), env: process.env })
  const durationMs = Date.now() - startedAt

  logRun({ id, kind, model: modelKey, command: passthrough, exitCode: result.status, durationMs })
  logTelemetry({
    event: 'run_complete',
    id,
    kind,
    model: modelKey,
    exitCode: result.status,
    durationMs,
    ramAvailableAfterGb: Math.round((systemProbes.availableRamGb() ?? 0) * 10) / 10,
  })
  releaseReservation(id)
  process.exit(result.status ?? 1)
}

function cmdRelease(args) {
  const id = args[0] ?? rest[0] ?? die('usage: factory release <id>')
  releaseReservation(id)
  console.log(`released ${id}`)
  process.exit(0)
}

/**
 * Reclaiming a resident local model is a side effect on a service the human
 * owns, so it is opt-in and named — never automatic.
 */
function cmdReclaim() {
  const { candidates, refused } = reclaimCandidates(config, systemProbes, reservationsNow())

  for (const r of refused) {
    console.log(`REFUSING to stop ${r.service} (${r.key}) — a live reservation holds it: ${r.heldBy}`)
    logTelemetry({ event: 'reclaim_refused', what: r.key, service: r.service, heldBy: r.heldBy })
  }
  if (!candidates.length) {
    console.log(refused.length ? 'nothing else resident to reclaim' : 'nothing resident to reclaim')
    process.exit(0)
  }
  for (const c of candidates) {
    console.log(`stopping ${c.service} (${c.key}, state ${c.state}, frees ${gb(c.gb)})`)
    const r = spawnSync('systemctl', ['--user', 'stop', c.service], { stdio: 'inherit' })
    logTelemetry({ event: 'reclaim', what: c.key, service: c.service, state: c.state, freedGb: c.gb, exitCode: r.status })
  }
  process.exit(0)
}

function cmdWork(args) {
  const { flags, positional } = parse(args)
  const sub = positional[0]
  const id = positional[1]

  if (sub === 'list') {
    const items = listWorkItems()
    if (flags.json) json(items)
    else for (const i of items) console.log(`${i.id.padEnd(18)} ${summarize(i)}`)
    process.exit(0)
  }

  if (sub === 'show') {
    const item = readWorkItem(id) ?? die(`no work item '${id}'`)
    if (flags.json) json(item)
    else printItem(item)
    process.exit(0)
  }

  if (sub === 'init') {
    const planRef = flags['plan-ref'] ?? die('factory work init: --plan-ref is required')
    const item = newWorkItem({
      id,
      title: flags.title ?? id,
      planRef,
      track: flags.track ?? null,
      base: flags.base ?? null,
      dependsOn: flags['depends-on'] ? String(flags['depends-on']).split(',').map((s) => s.trim()).filter(Boolean) : [],
    })
    writeWorkItem(item)
    console.log(`created factory/work/${id}.json`)
    process.exit(0)
  }

  if (sub === 'transition') {
    const lane = positional[2] ?? die('usage: factory work transition <id> <lane> <state> [--note ...]')
    const to = positional[3] ?? die('usage: factory work transition <id> <lane> <state>')
    const item = readWorkItem(id) ?? die(`no work item '${id}'`)
    if (!DEFAULT_LANES.includes(lane)) die(`unknown lane '${lane}' (known: ${DEFAULT_LANES.join(', ')})`)

    if (lane === 'acceptance') {
      if (to === 'pass') {
        const decision = acceptanceDecision(config, item)
        if (decision.state !== 'pass') die(`REFUSED: ${decision.reason}`, 4)
      }
      if (to === 'waived' && !flags.reason) die('REFUSED: acceptance may be waived only with --reason "<why>"', 4)
    } else {
      const from = item.lanes[lane]?.state
      if (!laneTransitionAllowed(config, from, to)) die(`REFUSED: ${lane} cannot go ${from} -> ${to}`, 4)
    }

    const meta = {
      note: flags.note ?? null,
      actor: flags.actor ?? null,
      model: flags.model ?? null,
      fields: {
        ...(flags.artifacts ? { artifacts: String(flags.artifacts).split(',').map((s) => s.trim()) } : {}),
        ...(flags.evidence ? { evidence: String(flags.evidence).split(',').map((s) => s.trim()) } : {}),
        ...(flags.owner ? { owner: flags.owner } : {}),
        ...(flags.reason ? { reason: flags.reason } : {}),
      },
    }
    const before = item.lanes[lane]?.state
    const { ok } = applyTransition(item, lane, to, meta)
    if (!ok) die('transition failed', 4)
    writeWorkItem(item)
    console.log(`${id}: ${lane} ${before} -> ${to}`)
    process.exit(0)
  }

  if (sub === 'ready') {
    const items = listWorkItems()
    const ready = readyItems(items)
    if (flags.json) json(ready.map((i) => i.id))
    else if (!ready.length) console.log('nothing ready (dependencies unmet, or no work items)')
    else for (const i of ready) console.log(`${i.id.padEnd(18)} ${summarize(i)}`)
    process.exit(0)
  }

  if (sub === 'graph') {
    json(dependencyGraph(listWorkItems()))
    process.exit(0)
  }

  die('usage: factory work init|list|show|ready|graph|transition')
}

const summarize = (item) =>
  Object.entries(item.lanes)
    .map(([lane, v]) => `${lane}=${v.state}`)
    .join('  ')

function printItem(item) {
  console.log(`${item.id} — ${item.title}`)
  console.log(`  plan_ref   ${item.plan_ref}`)
  console.log(`  base       ${item.base ?? '-'}`)
  console.log(`  depends_on ${(item.depends_on ?? []).join(', ') || '-'}`)
  for (const [lane, v] of Object.entries(item.lanes)) {
    console.log(`  ${lane.padEnd(18)} ${v.state}${v.model ? `  model=${v.model}` : ''}${v.reason ? `  reason=${v.reason}` : ''}`)
    for (const a of v.artifacts ?? []) console.log(`      artifact ${a}${existsSync(a) ? '' : '   ** MISSING **'}`)
  }
  if (item.history?.length) {
    console.log('  history')
    for (const h of item.history.slice(-8)) console.log(`      ${h.at}  ${h.lane} ${h.from} -> ${h.to}${h.note ? `  (${h.note})` : ''}`)
  }
}

function cmdStatus(args) {
  const { flags } = parse(args)
  if (flags.json) {
    json({ reservations: reservationsNow(), runs: readRuns(20), telemetry: readTelemetry(20) })
    process.exit(0)
  }
  console.log('last runs')
  for (const r of readRuns(10)) console.log(`  ${r.at}  ${r.id} (${r.kind})  ${r.model ?? '-'}  exit ${r.exitCode}  ${Math.round(r.durationMs / 1000)}s`)
  console.log('last telemetry')
  for (const t of readTelemetry(10)) console.log(`  ${t.at}  ${t.event}  ${t.id ?? t.what ?? ''}  ${t.reasons ? t.reasons.join(' | ') : ''}`)
  process.exit(0)
}

function cmdHelp() {
  console.log(`factory — resource scheduler and work-state CLI

  doctor                              the resource picture, and what each kind would do now
  route <kind> [--independence-of X]  capability + resource + independence routing
  admit <kind> --id <id> [--model M]  admission control; exit 3 = BLOCKED_RESOURCE
  run <kind> --id <id> -- <cmd...>    admit, execute, log, release
  release <id>
  reclaim                             stop resident local models (opt-in, logged)
  work init|list|show|ready|graph|transition
  status [--json]

  config: factory/config.json   state: factory/work/   logs: factory/logs/
  docs:   docs/agents/factory.md`)
  process.exit(0)
}

switch (cmd) {
  case 'doctor': cmdDoctor(); break
  case 'route': cmdRoute(rest); break
  case 'admit': cmdAdmit(rest); break
  case 'run': cmdRun(rest); break
  case 'release': cmdRelease(rest); break
  case 'reclaim': cmdReclaim(); break
  case 'work': cmdWork(rest); break
  case 'status': cmdStatus(rest); break
  case 'help': case '--help': case undefined: cmdHelp(); break
  default: die(`unknown command '${cmd}' — try: factory help`)
}
