#!/usr/bin/env node
// Resource + capability scheduler — the factory's WHERE and WHEN.
//
// WHY THIS EXISTS
// ---------------
// The orchestrator decides what must happen, why, what evidence is required and
// what depends on what. It must NOT decide whether a 55 GB local model can
// coexist with the gate run it is about to trigger. On 2026-10-02 it did decide
// that, by hand, four times, and got it wrong four times: `systemd-oomd killed
// 58 process(es) in this unit` at 12:13, 13:12, 16:21 and 04:56, and each time
// the biggest cgroup — the local model — was the casualty. The last one killed a
// builder mid-slice.
//
// The lesson is not "be more careful with memory". It is that a constraint which
// lives in a prose warning is a constraint that is re-derived from scratch on
// every dispatch by an agent that is thinking about something else. So it lives
// here instead: a registry of what each model and each task kind costs, a probe
// of what the machine actually has right now, and an admission decision that
// refuses BEFORE the work starts rather than discovering the OOM after.
//
// Everything in this file is a pure function of (config, probes, reservations,
// request). The probes are injected so the tests can hand it a small machine and
// watch it refuse — see scheduler.test.mjs.
//
// Usage is the CLI (factory.mjs); this module is the decision.

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

// ---------------------------------------------------------------------------
// Real-world probes. Every one of these can fail; a probe that fails returns
// null, and null is treated as "unknown", never as "fine".
// ---------------------------------------------------------------------------

const tryExec = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

export const systemProbes = {
  /** Reclaimable-inclusive available memory. `/proc/meminfo`, never `free`. */
  availableRamGb() {
    try {
      const kb = Number(/MemAvailable:\s+(\d+) kB/.exec(readFileSync('/proc/meminfo', 'utf8'))?.[1])
      return Number.isFinite(kb) ? kb / 1048576 : null
    } catch {
      return null
    }
  },

  totalRamGb() {
    try {
      const kb = Number(/MemTotal:\s+(\d+) kB/.exec(readFileSync('/proc/meminfo', 'utf8'))?.[1])
      return Number.isFinite(kb) ? kb / 1048576 : null
    } catch {
      return null
    }
  },

  freeVramGb() {
    const out = tryExec('nvidia-smi', ['--query-gpu=memory.free', '--format=csv,noheader,nounits'])
    if (out === null) return null
    const mib = Number(out.split('\n')[0])
    return Number.isFinite(mib) ? mib / 1024 : null
  },

  /**
   * The unit's ActiveState, always one of the four, never a guess.
   *
   * `systemctl is-active` is the wrong instrument here: it exits non-zero for
   * `activating`, so a service that is LOADING reads as absent. That is the
   * state the local model crash-loops in — measured 2026-10-02, 55 attempts —
   * and treating it as absent both misses its claim on the GPU and under-charges
   * the 55 GB it is about to take. `show -p ActiveState` exits 0 and just says.
   */
  serviceState(unit) {
    if (!unit) return 'inactive'
    const out = tryExec('systemctl', ['--user', 'show', '-p', 'ActiveState', unit])
    if (out === null) return 'unknown'
    const state = out.split('=')[1]
    return ['active', 'activating', 'deactivating', 'inactive', 'failed'].includes(state) ? state : 'unknown'
  },

  serviceActive(unit) {
    return this.serviceState(unit) === 'active'
  },

  /** A unit on its way up. It has not taken its memory yet, and it will. */
  serviceActivating(unit) {
    return this.serviceState(unit) === 'activating'
  },

  /** Resident memory of a systemd user unit, or null when it is not running. */
  serviceRamGb(unit) {
    if (!unit) return null
    const out = tryExec('systemctl', ['--user', 'show', '-p', 'MemoryCurrent', unit])
    if (out === null) return null
    const bytes = Number(out.split('=')[1])
    // systemd reports [not set] or a uint64 max sentinel when the unit is down.
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes > 1e15) return 0
    return bytes / 1073741824
  },

  now() {
    return Date.now()
  },
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function loadConfig(path) {
  const config = JSON.parse(readFileSync(path, 'utf8'))
  if (config.version !== 1) throw new Error(`factory config: unsupported version ${config.version}`)
  return config
}

export const DEFAULT_RESERVE_GB = 4

const reserveGbOf = (config) => {
  const r = config.machine?.reserve_gb
  return Number.isFinite(r) ? r : DEFAULT_RESERVE_GB
}

// ---------------------------------------------------------------------------
// Reservations
//
// A reservation is a lease. `state` is the thing that makes the RAM maths honest:
//
//   ADMITTED — the task has been cleared but has not started, so its memory is
//              NOT yet visible in MemAvailable. It is subtracted explicitly.
//   RUNNING  — the process exists, its memory IS in MemAvailable. Subtracting
//              it again would double-count and would make the factory refuse
//              work it could actually do.
//
// `exclusive` is different: it is held for the whole life of the lease, because
// two local models cannot share one GPU whether or not either has started.
// ---------------------------------------------------------------------------

export function liveReservations(reservations, nowMs) {
  return reservations.filter((r) => {
    if (!r || r.releasedAt) return false
    if (Number.isFinite(r.expiresAt) && r.expiresAt <= nowMs) return false
    return true
  })
}

/** The GB that has been promised but is not yet observable in MemAvailable. */
export function heldGb(reservations) {
  return reservations
    .filter((r) => r.state === 'ADMITTED')
    .reduce((sum, r) => sum + (Number.isFinite(r.requiredGb) ? r.requiredGb : 0), 0)
}

export function exclusiveHolders(reservations) {
  const held = new Map()
  for (const r of reservations) {
    if (r.exclusive) held.set(r.exclusive, r.id)
  }
  return held
}

// ---------------------------------------------------------------------------
// Capability matching
// ---------------------------------------------------------------------------

export function capabilityGaps(model, floors = {}) {
  const gaps = []
  for (const [name, floor] of Object.entries(floors)) {
    const have = model.capabilities?.[name]
    if (!Number.isFinite(have)) gaps.push(`${name}: model declares nothing, task needs >= ${floor}`)
    else if (have < floor) gaps.push(`${name}: ${have} < ${floor}`)
  }
  return gaps
}

const capabilityHeadroom = (model, floors = {}) =>
  Object.entries(floors).reduce((sum, [name, floor]) => {
    const have = model.capabilities?.[name]
    return sum + (Number.isFinite(have) ? have - floor : -1000)
  }, 0)

// ---------------------------------------------------------------------------
// What a model costs to have available
// ---------------------------------------------------------------------------

/**
 * The RAM and VRAM this model needs that is NOT already paid for, plus the
 * reclaimable things standing in its way.
 */
export function modelFootprint(modelKey, config, probes) {
  const model = config.models[modelKey]
  if (!model) return { ok: false, why: `${modelKey} is not in the registry` }

  if (model.resources.ram_gb === null) {
    return {
      ok: false,
      why: `${modelKey} has no measured RAM footprint (${model.resources.footprint_source}) — the registry refuses to guess`,
    }
  }

  const isLocal = model.provider === 'local'
  const residentGb = isLocal ? probes.serviceRamGb(model.service) : 0
  const state = isLocal ? (probes.serviceState?.(model.service) ?? (probes.serviceActive(model.service) ? 'active' : 'inactive')) : 'active'
  const running = state === 'active'
  const activating = state === 'activating'

  // A local model that is already serving costs nothing extra to use. One that
  // is ON ITS WAY UP is charged in full: its memory is not in MemAvailable yet
  // and it is about to be, so not charging it is how the factory over-admits
  // and hands the machine to systemd-oomd.
  const additionalRamGb = isLocal && !running ? model.resources.ram_gb : 0

  const reclaimable = []
  if (isLocal && !running) {
    for (const [otherKey, other] of Object.entries(config.models)) {
      if (otherKey === modelKey || other.provider !== 'local') continue
      const otherGb = probes.serviceRamGb(other.service)
      const otherState = probes.serviceState?.(other.service) ?? 'inactive'
      if (otherState === 'active' || otherState === 'activating') {
        reclaimable.push({
          what: otherKey,
          gb: otherGb ? Math.round(otherGb * 10) / 10 : null,
          how: `systemctl --user stop ${other.service}`,
        })
      }
    }
    if (residentGb && residentGb > 0) {
      reclaimable.push({ what: modelKey, gb: Math.round(residentGb * 10) / 10, how: `systemctl --user stop ${model.service}` })
    }
  }

  return {
    ok: true,
    model,
    isLocal,
    state,
    running,
    activating,
    residentGb: residentGb ?? 0,
    additionalRamGb,
    vramGb: model.resources.vram_gb,
    exclusive: model.resources.exclusive ?? null,
    reclaimable,
  }
}

/** Local inference units that are holding or claiming VRAM while we need some. */
function vramCompetitors(modelKey, config, probes) {
  const out = []
  for (const [otherKey, other] of Object.entries(config.models)) {
    if (otherKey === modelKey || other.provider !== 'local') continue
    const state = probes.serviceState?.(other.service) ?? 'inactive'
    if (state === 'active' || state === 'activating') out.push({ what: otherKey, how: `systemctl --user stop ${other.service}` })
  }
  return out
}

// ---------------------------------------------------------------------------
// Admission control
// ---------------------------------------------------------------------------

/**
 * Decide whether this task may start, before it starts.
 *
 * Returns state ADMITTED or BLOCKED_RESOURCE. A blocked result carries the
 * arithmetic that produced it and, where one exists, the command that would
 * unblock it.
 */
export function admit({ config, kind, id = null, modelKey = null, probes = systemProbes, reservations = [] }) {
  const task = config.task_kinds[kind]
  if (!task) return { state: 'BLOCKED_RESOURCE', reasons: [`unknown task kind '${kind}'`], reclaimable: [] }

  const nowMs = probes.now()
  const live = liveReservations(reservations, nowMs)
  const reasons = []
  const reclaimable = []

  const available = probes.availableRamGb()
  const reserve = reserveGbOf(config)
  const held = heldGb(live)

  let modelRam = 0
  let exclusive = task.resources.exclusive ?? null
  let chosenModel = null

  if (modelKey) {
    const footprint = modelFootprint(modelKey, config, probes)
    if (!footprint.ok) {
      return { state: 'BLOCKED_RESOURCE', kind, model: modelKey, reasons: [footprint.why], reclaimable: [] }
    }
    chosenModel = modelKey
    modelRam = footprint.additionalRamGb
    exclusive = exclusive ?? footprint.exclusive
    reclaimable.push(...footprint.reclaimable)

    // VRAM: a local model that cannot fit its own weights must not be selected.
    // This runs whenever the model is not already serving — including while it is
    // `activating`, which is precisely when a competitor holding the GPU is
    // fatal rather than merely slow.
    if (footprint.isLocal && !footprint.running && Number.isFinite(footprint.vramGb)) {
      const freeVram = probes.freeVramGb()
      if (freeVram !== null && freeVram < footprint.vramGb) {
        const competitors = vramCompetitors(modelKey, config, probes)
        reasons.push(
          `VRAM: ${modelKey} needs ${footprint.vramGb} GB, ${Math.round(freeVram * 10) / 10} GB free` +
            (competitors.length ? ` — held by ${competitors.map((c) => c.what).join(', ')}` : ''),
        )
        reclaimable.push(...competitors.map((c) => ({ ...c, gb: null })))
      }
    }
  }

  // One local inference at a time: the systemd units declare Conflicts=.
  if (exclusive) {
    const holder = exclusiveHolders(live).get(exclusive)
    if (holder && holder !== id) {
      reasons.push(`exclusive resource '${exclusive}' is held by reservation '${holder}'`)
    }
  }

  const taskRam = task.resources?.ram_gb
  if (taskRam === null || !Number.isFinite(taskRam)) {
    reasons.push(`task kind '${kind}' has no measured RAM footprint — refusing rather than guessing`)
    return { state: 'BLOCKED_RESOURCE', kind, model: chosenModel, reasons, reclaimable }
  }

  const required = taskRam + reserve + modelRam
  const usable = available === null ? null : available - held

  if (usable !== null && required > usable) {
    reasons.push(
      `RAM: needs ${round(required)} GB (task ${round(taskRam)} + reserve ${round(reserve)}` +
        (modelRam ? ` + model load ${round(modelRam)}` : '') +
        `), usable ${round(usable)} GB (available ${round(available)} - promised ${round(held)})`,
    )
    // A local model that is resident is the single biggest reclaimable thing on
    // this machine, and it is a managed service — so it is named, with the
    // command, rather than being silently evicted.
    if (!modelRam && available !== null) {
      for (const [otherKey, other] of Object.entries(config.models)) {
        if (other.provider !== 'local') continue
        const state = probes.serviceState?.(other.service) ?? 'inactive'
        if (state !== 'active' && state !== 'activating') continue
        const gb = probes.serviceRamGb(other.service)
        if (gb > 0) reclaimable.push({ what: otherKey, gb: round(gb), how: `systemctl --user stop ${other.service}` })
      }
    }
  }

  if (reasons.length) {
    return {
      state: 'BLOCKED_RESOURCE',
      kind,
      model: chosenModel,
      requiredGb: round(required),
      usableGb: usable === null ? null : round(usable),
      availableGb: available === null ? null : round(available),
      reserveGb: reserve,
      heldGb: round(held),
      reasons,
      reclaimable: dedupeReclaimable(reclaimable),
    }
  }

  return {
    state: 'ADMITTED',
    kind,
    model: chosenModel,
    requiredGb: round(required),
    usableGb: usable === null ? null : round(usable),
    availableGb: available === null ? null : round(available),
    reserveGb: reserve,
    heldGb: round(held),
    exclusive,
    reasons: [],
    reclaimable: [],
  }
}

const round = (n) => Math.round(n * 10) / 10

function dedupeReclaimable(list) {
  const seen = new Map()
  for (const item of list) if (item?.what && !seen.has(item.what)) seen.set(item.what, item)
  return [...seen.values()]
}

// ---------------------------------------------------------------------------
// The router — capability based, resource aware, independence aware
// ---------------------------------------------------------------------------

/**
 * Pick a model for a task kind.
 *
 * Order of decision, which is the order the requirements name:
 *   1. required capabilities   — a floor that is not met is a rejection, not a warning
 *   2. resource availability   — an admissible model, or no model
 *   3. independence            — the excluded models are excluded by NAME in the output
 *   4. cost policy             — local-preferred means cost_tier ascending
 *   5. configured preference   — ties broken deterministically, never randomly
 *   6. fallback policy         — cloud is a fallback, and a fallback is an outcome, not an incident
 */
export function selectModel({ config, kind, probes = systemProbes, reservations = [], avoidModels = [], policyOverride = null }) {
  const task = config.task_kinds[kind]
  if (!task) return { modelKey: null, provider: null, reason: `unknown task kind '${kind}'`, rejected: [] }

  const floors = task.capabilities ?? {}
  // A task that declares no capability floor needs no model at all — the gate
  // and the browser lane are the two that do not. Selecting the cheapest model
  // anyway would be a decision nobody asked for.
  if (!Object.keys(floors).length) {
    return { modelKey: null, provider: null, costTier: null, fallback: false, reason: 'task kind declares no model capability — it needs no model', rejected: [] }
  }
  const rejected = []
  const candidates = []

  for (const [modelKey, model] of Object.entries(config.models)) {
    if (task.requires_local_inference && model.provider !== 'local') {
      rejected.push({ modelKey, why: 'task requires local inference' })
      continue
    }
    if (avoidModels.includes(modelKey)) {
      rejected.push({ modelKey, why: 'excluded by independence (same model as the implementer)' })
      continue
    }
    const gaps = capabilityGaps(model, floors)
    if (gaps.length) {
      rejected.push({ modelKey, why: `below the capability floor — ${gaps.join('; ')}` })
      continue
    }
    candidates.push(modelKey)
  }

  const policy = policyOverride ?? config.policies?.cost ?? 'local-preferred'
  const tier = (k) => config.models[k].cost_tier ?? 2
  candidates.sort((a, b) => {
    const d = policy === 'local-preferred' ? tier(a) - tier(b) : 0
    if (d !== 0) return d
    const h = capabilityHeadroom(config.models[b], floors) - capabilityHeadroom(config.models[a], floors)
    if (h !== 0) return h
    return a.localeCompare(b)
  })

  const blockedFor = []
  for (const modelKey of candidates) {
    const decision = admit({ config, kind, modelKey, probes, reservations })
    if (decision.state === 'ADMITTED') {
      const wasPreferred = tier(modelKey) === 0 && policy === 'local-preferred'
      return {
        modelKey,
        provider: config.models[modelKey].provider,
        costTier: tier(modelKey),
        // A fallback is reported as what it is: a scheduling outcome.
        fallback: !wasPreferred,
        reason: wasPreferred
          ? `capability floors met, admissible, cost_tier ${tier(modelKey)} (${policy})`
          : `capability floors met and admissible; preferred tier unavailable, fell back to cost_tier ${tier(modelKey)}`,
        rejected: [...rejected, ...blockedFor],
        admission: decision,
      }
    }
    blockedFor.push({ modelKey, why: decision.reasons.join(' | '), reclaimable: decision.reclaimable })
  }

  return {
    modelKey: null,
    provider: null,
    fallback: false,
    reason: candidates.length
      ? 'every capability-qualified model is blocked on resources'
      : 'no model in the registry meets this task kind\'s capability floor',
    rejected: [...rejected, ...blockedFor],
    reclaimable: dedupeReclaimable(blockedFor.flatMap((b) => b.reclaimable ?? [])),
  }
}

// ---------------------------------------------------------------------------
// Work state
// ---------------------------------------------------------------------------

export const DEFAULT_LANES = ['implementation', 'verification', 'review', 'visual_validation', 'acceptance']

export function laneTransitionAllowed(config, from, to) {
  const table = config.lane_states ?? {}
  if (!(from in table)) return false
  return table[from].includes(to)
}

/**
 * Acceptance is the one lane with a rule rather than a graph: it cannot pass
 * while a lane it requires is not complete. `waived` is reachable only with a
 * written reason — there is no silent path to a green acceptance.
 */
export function acceptanceDecision(config, item) {
  const requires = config.acceptance_gate?.requires ?? ['implementation', 'verification', 'review']
  const lanes = item.lanes ?? {}
  const incomplete = requires.filter((lane) => lanes[lane]?.state !== 'complete')
  if (incomplete.length === 0) return { state: 'pass', reason: `required lanes complete: ${requires.join(', ')}` }
  return {
    state: 'blocked',
    reason: `cannot pass: ${incomplete.map((l) => `${l}=${lanes[l]?.state ?? 'missing'}`).join(', ')}`,
    incomplete,
  }
}

/** Items whose dependencies are all complete — eligible to run concurrently. */
export function readyItems(items) {
  const byId = new Map(items.map((i) => [i.id, i]))
  const done = (id) => {
    const item = byId.get(id)
    if (!item) return false
    const gates = ['implementation', 'verification', 'review']
    return gates.every((l) => item.lanes?.[l]?.state === 'complete')
  }
  return items.filter((i) => (i.depends_on ?? []).every(done))
}

/** The dependency graph as an adjacency map, for `factory graph`. */
export function dependencyGraph(items) {
  return Object.fromEntries(items.map((i) => [i.id, i.depends_on ?? []]))
}
