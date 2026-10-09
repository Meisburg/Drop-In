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
import { execFileSync, spawnSync } from 'node:child_process'

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

  /**
   * A TCP connect, the only availability signal that is cheap and honest for a
   * remote endpoint. Returns null when it could not be determined, which is NOT
   * the same as true — callers decide, and admission decides "no".
   *
   * Measured 2026-10-02: fr-1 (100.92.51.0:11434) timed out while carrying
   * cost_tier 1, so it was the PREFERRED fallback and could not serve. That is
   * why this exists (factory/decisions.md D-003).
   */
  tcpReachable(host, port, timeoutMs = 4000) {
    if (!host || !port) return null
    try {
      const r = spawnSync('bash', ['-c', `exec 3<>/dev/tcp/${host}/${port} && exec 3<&-`], {
        timeout: timeoutMs,
        stdio: 'ignore',
      })
      return r.status === 0
    } catch {
      return null
    }
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

/**
 * The live reservation for this task id, or null.
 *
 * The mutex is keyed on the WORK ITEM ID, not on the model or the exclusive
 * resource: two `factory run` invocations for the same `--id` are two writers on
 * one slice, and the second must refuse rather than silently interleave. An
 * id-less reservation cannot be a holder — there is nothing to name — so it is
 * skipped.
 */
export function reservationForId(reservations, id) {
  return reservations.find((r) => r?.id === id) ?? null
}

/**
 * Is this a LIVE lease for this id held by a DIFFERENT process?
 *
 * Returns null when the acquisition may proceed (no live holder, or the live
 * holder is THIS process re-entering its own lease) and a description of the
 * holder when it must refuse.
 *
 * Two properties are load-bearing and were the whole point of the slice:
 *
 *   1. LIVENESS IS A DECISION, NOT A FIELD. A record with no `pid` is a lease
 *      written by a build that did not record holder identity; it cannot be
 *      distinguished from a live one, so it is treated as HELD (conservative —
 *      refusing is recoverable, double-writing is not). A record whose pid is
 *      dead, or whose pid belongs to another user, is NOT live and does not
 *      block.
 *   2. IT IS THE SAME PID THAT IS EXCUSED, NOT THE SAME "SESSION". A worker that
 *      re-raises a lease (e.g. `run` re-admitting after `admit`) must not lock
 *      itself out; any other pid must.
 *
 * `isAlive` is injected so the test can hand it a dead pid without forking a
 * process and prove the refusal is the check and not the environment.
 */
export function holderConflict(reservations, id, selfPid, nowMs, isAlive = processAlive) {
  if (id === null || id === undefined) return null
  const existing = reservationForId(liveReservations(reservations, nowMs), id)
  if (!existing) return null
  if (existing.pid === selfPid) return null
  if (aliveByPid(existing, isAlive)) {
    return {
      id: existing.id,
      pid: existing.pid ?? null,
      startedAt: existing.startedAt ?? existing.admittedAt ?? null,
      state: existing.state ?? null,
      kind: existing.kind ?? null,
    }
  }
  return null
}

/**
 * The default liveness probe: `process.kill(pid, 0)`.
 *
 * Signal 0 sends nothing and only performs the permission/existence check, so
 * it never harms the process. `ESRCH` means no such process (dead). `EPERM`
 * means the process exists but belongs to another user — LIVE, and it must not
 * be signalled away by a `--force`. A non-integer or non-positive pid is not a
 * process and is never alive.
 */
export function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err?.code === 'EPERM'
  }
}

/**
 * A pid that is known to be alive, for the `--force`-refusal test.
 *
 * `process.pid` is this very process; it exists for the duration of the test by
 * construction. Named so the intent is unmistakable in the test body.
 */
export const CURRENT_PID = process.pid

const aliveByPid = (record, isAlive) => {
  const pid = record?.pid
  if (pid === null || pid === undefined) return true // no identity recorded: cannot prove dead, so held
  if (!Number.isInteger(pid)) return true // a malformed pid is not evidence of death
  return isAlive(pid)
}

/**
 * Decide whether `--force` may clear a lease: ONLY when the holder pid is dead.
 *
 * The rule is asymmetric on purpose. A dead holder's lease leaks forever — the
 * process that would have called `release` no longer exists — so reclaiming it
 * is recovery. A live holder's lease is held by that holder, and clearing it
 * would let two writers run at once; `--force` must refuse and say who holds it.
 * No identity recorded is likewise a refusal: `--force` may not guess.
 */
export function forceDecision(reservations, id, nowMs, isAlive = processAlive) {
  const existing = reservationForId(liveReservations(reservations, nowMs), id)
  if (!existing) return { ok: true, reason: 'no live lease' }
  const pid = existing.pid
  if (pid === null || pid === undefined || !Number.isInteger(pid)) {
    return {
      ok: false,
      reason: `lease '${id}' records no holder pid — refusing to force-clear a lease whose owner cannot be proven dead`,
      holder: { pid: pid ?? null, startedAt: existing.startedAt ?? existing.admittedAt ?? null },
    }
  }
  if (isAlive(pid)) {
    return {
      ok: false,
      reason: `lease '${id}' is held by live pid ${pid} (started ${existing.startedAt ?? existing.admittedAt ?? 'unknown'}) — refusing --force; the holder is still running`,
      holder: { pid, startedAt: existing.startedAt ?? existing.admittedAt ?? null },
    }
  }
  return {
    ok: true,
    reason: `lease '${id}' holder pid ${pid} is dead — safe to force-clear`,
    holder: { pid, startedAt: existing.startedAt ?? existing.admittedAt ?? null },
  }
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
/** host:port out of an endpoint, so there is one source of truth for where a model lives. */
export function endpointHostPort(model) {
  try {
    const u = new URL(model.endpoint)
    return { host: u.hostname, port: Number(u.port || (u.protocol === 'https:' ? 443 : 80)) }
  } catch {
    return null
  }
}

/**
 * Is this model reachable right now, by the mechanism it declares?
 *
 * `probe:tcp` is a GATE: a remote endpoint has no unit to read and no footprint
 * to charge, so connecting is the only thing that can tell the truth, and an
 * unreachable one is rejected rather than selected and failed into.
 *
 * `probe:service` is NOT a gate. A stopped local service is a planned start, and
 * its state is already accounted for by `modelFootprint` — which charges the
 * whole model when it is down and nothing when it is up. Gating on it as well
 * would refuse every task on a machine that is doing exactly what it should.
 */
export function checkHealth(modelKey, config, probes) {
  const model = config.models[modelKey]
  if (!model) return { ok: false, gated: true, how: `unregistered model '${modelKey}'` }
  const probe = model.health?.probe
  if (probe === 'service') {
    return { ok: true, gated: false, how: `systemd ${model.service} ${probes.serviceState(model.service)} (footprint already accounts for this)` }
  }
  if (probe === 'tcp') {
    const where = endpointHostPort(model)
    if (!where) return { ok: false, gated: true, how: 'no parseable endpoint' }
    const reachable = probes.tcpReachable?.(where.host, where.port, model.health.timeout_ms) ?? null
    return { ok: reachable === true, gated: true, how: `tcp ${where.host}:${where.port}${reachable === null ? ' (unknown)' : ''}` }
  }
  return { ok: false, gated: true, how: `no health probe declared for '${modelKey}' — an unprobed model is not a verified one` }
}

/** The one local model the machine should actually be holding, per policy. */
export function residentModel(config) {
  return Object.entries(config.models).find(([, m]) => m.residency === 'resident')?.[0] ?? null
}

/**
 * Which resident models a human-typed `reclaim` may stop.
 *
 * The invariant enforced here is the one that must never break: reclaim does not
 * kill a model a live reservation holds. Whether reclaim runs AUTOMATICALLY is a
 * separate question — it does not, and it needs liveness and ownership semantics
 * this scheduler does not have yet (factory/decisions.md D-004).
 */
export function reclaimCandidates(config, probes, reservations = []) {
  const live = reservations.filter((r) => r.state === 'ADMITTED' || r.state === 'RUNNING')
  const inUse = new Set(live.map((r) => r.model))
  const candidates = []
  const refused = []
  for (const [key, model] of Object.entries(config.models)) {
    if (model.provider !== 'local') continue
    const state = probes.serviceState(model.service)
    if (state !== 'active' && state !== 'activating') continue
    const gbRam = probes.serviceRamGb(model.service)
    const entry = { key, service: model.service, state, gb: gbRam ? Math.round(gbRam * 10) / 10 : null }
    if (inUse.has(key)) {
      const holder = live.find((r) => r.model === key)
      refused.push({ ...entry, heldBy: holder.id, heldSince: holder.admittedAt ?? null })
    } else {
      candidates.push(entry)
    }
  }
  return { candidates, refused }
}

export function modelFootprint(modelKey, config, probes) {
  const model = config.models[modelKey]
  if (!model) return { ok: false, why: `${modelKey} is not in the registry` }

  // A MISSING footprint is as inadmissible as a null one. This guard used to test
  // `=== null` only, so a model whose `ram_gb` was simply ABSENT — a typo, a field
  // dropped in an edit — fell through to `ok: true` and was admitted as if it cost
  // nothing, which is how the factory over-admits and hands the machine to
  // systemd-oomd. D-030: zero and null are FINDINGS, never passes; a missing number
  // is neither zero nor null and must not be a pass either.
  if (!Number.isFinite(model.resources?.ram_gb)) {
    return {
      ok: false,
      why: `${modelKey} has no measured RAM footprint (${model.resources?.footprint_source ?? 'absent'}) — the registry refuses to guess`,
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
  // The configured preference that step 5 of the decision order names. LOWER wins
  // and the default is 0, so a model opts IN to outranking its peers. It sits
  // AFTER the cost tier, because a preference must never promote a cloud model
  // over a local one, and BEFORE capability headroom, because that sum adds raw
  // units — a context window in tokens beside a reasoning level out of five — so
  // leaving the order to it means an accidental unit scale picks the model. It
  // orders models that are already admissible and already past the floor; it can
  // never make an inadmissible model admissible, and it is never a capability
  // claim (D-034: capability values are measured or left alone, never adjusted to
  // steer routing).
  const preference = (k) => config.models[k].preference ?? 0
  candidates.sort((a, b) => {
    const d = policy === 'local-preferred' ? tier(a) - tier(b) : 0
    if (d !== 0) return d
    const p = preference(a) - preference(b)
    if (p !== 0) return p
    const h = capabilityHeadroom(config.models[b], floors) - capabilityHeadroom(config.models[a], floors)
    if (h !== 0) return h
    return a.localeCompare(b)
  })

  const blockedFor = []
  for (const modelKey of candidates) {
    const decision = admit({ config, kind, modelKey, probes, reservations })
    if (decision.state === 'ADMITTED') {
      // Availability is part of admission, not a privilege of a cheap tier. A model
      // that is tier 1 but unreachable is not a fallback, it is a delayed failure.
      const health = checkHealth(modelKey, config, probes)
      if (health.gated && !health.ok) {
        blockedFor.push({ modelKey, why: `unreachable (${health.how})` })
        continue
      }
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

/**
 * Is this lane transition legal?
 *
 * `complete` is terminal for a ROUND — evidence does not un-exist, and the
 * artifacts a completed lane names stay named. But a fix round legitimately
 * re-opens a completed lane, and pretending otherwise means the batch's own
 * escalating fix loop cannot be represented in the work state at all. Found by
 * using it: `factory work transition <id> implementation running` on a completed
 * lane was REFUSED, and the lane model had no way to say "this is round 2".
 *
 * So a re-open is allowed ONLY when it declares itself and says why: `opts.reopen`
 * with a reason. Silent re-opens stay refused, and the guard's `reopen-has-reason`
 * re-checks that every lane standing in a re-opened state carries its reason.
 */
export function laneTransitionAllowed(config, from, to, opts = {}) {
  const table = config.lane_states ?? {}
  if (!(from in table)) return false
  if (table[from].includes(to)) return true
  const reopen = config.lane_reopen
  if (opts.reopen && reopen?.allowed?.includes(to) && reopen?.from?.includes(from)) {
    return Boolean(opts.reason && String(opts.reason).trim())
  }
  return false
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
