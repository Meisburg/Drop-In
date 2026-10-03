/**
 * Resource admission, capability routing, independence and work-state rules.
 *
 * WHY THIS FILE EXISTS. The constraint it pins is the one that cost four
 * `systemd-oomd` kills in a single day: a 55 GB local model cannot coexist with
 * the gate run that the same task triggers, on a 62 GB machine — and a factory
 * that discovers that AFTER starting the work has already lost the work.
 *
 * Every case here hands the scheduler a fake machine, because the point is the
 * DECISION, not the hardware. The probes are injected for exactly that reason.
 * One case uses the real `factory/config.json`, so the registry itself is under
 * test rather than a convenient copy of it.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LANES,
  acceptanceDecision,
  admit,
  capabilityGaps,
  checkHealth,
  endpointHostPort,
  heldGb,
  laneTransitionAllowed,
  liveReservations,
  readyItems,
  reclaimCandidates,
  residentModel,
  selectModel,
} from './scheduler.mjs'
import { applyFields, applyTransition, implementerOf, newWorkItem } from './state.mjs'

const realConfig = JSON.parse(readFileSync(new URL('../../factory/config.json', import.meta.url), 'utf8'))

/**
 * A 62 GB machine, the one this factory actually runs on, in a shape the tests
 * can dial. Defaults describe the state that produced the OOM: the local model
 * resident, ~5 GB left, and another inference server squatting on the VRAM.
 */
function machine({
  availableGb = 5,
  freeVramGb = 6.5,
  active = ['strata-max'],
  activating = [],
  resident = { 'strata-max': 55 },
  now = 1_000_000,
  reachable = {},
  defaultReachable = true,
} = {}) {
  const stateOf = (unit) => (active.includes(unit) ? 'active' : activating.includes(unit) ? 'activating' : 'inactive')
  return {
    availableRamGb: () => availableGb,
    totalRamGb: () => 62,
    freeVramGb: () => freeVramGb,
    serviceState: stateOf,
    serviceActive: (unit) => stateOf(unit) === 'active',
    serviceRamGb: (unit) => (resident[unit] === undefined ? 0 : resident[unit]),
    tcpReachable: (host, port) => reachable[`${host}:${port}`] ?? defaultReachable,
    now: () => now,
  }
}

const LOCAL = 'strata-max/qwen3.8-flash-next-iq3_s'
const CLOUD = 'ollama-cloud/deepseek-v4.1-flash:cloud'

describe('admission control', () => {
  it('refuses the exact combination from the logs, before starting it', () => {
    // 2026-10-02 04:56: the local model resident at 55 GB, 5 GB available, and a
    // builder that must run `npm run verify` inside itself.
    const decision = admit({ config: realConfig, kind: 'builder', id: 'r2-6c', modelKey: LOCAL, probes: machine() })

    expect(decision.state).toBe('BLOCKED_RESOURCE')
    // The arithmetic, not just the verdict: 3 GB task + 4 GB reserve against
    // 5 GB available. The model is already resident, so it is NOT charged again
    // — and the task is still refused, which is the whole finding.
    expect(decision.requiredGb).toBe(7)
    expect(decision.usableGb).toBe(5)
    expect(decision.reasons.join(' ')).toMatch(/RAM: needs 7 GB \(task 3 \+ reserve 4\), usable 5 GB \(available 5 - promised 0\)/)
  })

  it('names what to reclaim and how, so a blocked task is actionable', () => {
    const decision = admit({ config: realConfig, kind: 'gate', modelKey: null, probes: machine() })
    // The gate is light; it is the reserve and the resident model that squeeze it.
    expect(decision.state).toBe('BLOCKED_RESOURCE')
    expect(decision.reclaimable.map((r) => r.what)).toContain(LOCAL)
    expect(decision.reclaimable.find((r) => r.what === LOCAL).how).toBe('systemctl --user stop strata-max')
  })

  it('admits the same task once the model is not resident and the machine is big enough', () => {
    const tight = admit({
      config: realConfig,
      kind: 'builder',
      id: 'r2-6c',
      modelKey: LOCAL,
      probes: machine({ availableGb: 50, active: [], resident: {}, freeVramGb: 32 }),
    })
    // 3 task + 4 reserve + 55 model load = 62 > 50 available: refused, and
    // correctly so — this machine cannot hold the model AND the gate.
    expect(tight.state).toBe('BLOCKED_RESOURCE')
    expect(tight.requiredGb).toBe(62)

    const roomy = admit({
      config: realConfig,
      kind: 'builder',
      id: 'r2-6c',
      modelKey: LOCAL,
      probes: machine({ availableGb: 62, active: [], resident: {}, freeVramGb: 32 }),
    })
    expect(roomy.state).toBe('ADMITTED')
    expect(roomy.requiredGb).toBe(62)
    expect(roomy.exclusive).toBe('local-inference')
  })

  it('does not charge twice for a model that is already resident', () => {
    // The model's 55 GB is already inside "available"; adding it again would
    // make the factory refuse work it can actually do.
    const resident = admit({ config: realConfig, kind: 'gate', id: 'g', probes: machine({ availableGb: 20 }) })
    expect(resident.requiredGb).toBe(7) // 3 task + 4 reserve, no model load
    expect(resident.state).toBe('ADMITTED')
  })

  it('counts ADMITTED promises but not RUNNING work, which the OS already accounts for', () => {
    const now = 1_000_000
    const reservations = [
      { id: 'a', state: 'ADMITTED', requiredGb: 10, expiresAt: now + 1000 },
      { id: 'b', state: 'RUNNING', requiredGb: 10 },
      { id: 'c', state: 'ADMITTED', requiredGb: 10, releasedAt: 'x' },
      { id: 'd', state: 'ADMITTED', requiredGb: 10, expiresAt: now - 1 },
    ]
    const live = liveReservations(reservations, now)
    expect(live.map((r) => r.id)).toEqual(['a', 'b'])
    expect(heldGb(live)).toBe(10) // a only: b is visible to the OS, c released, d expired
  })

  it('blocks a local model on VRAM when another inference server holds it', () => {
    const decision = admit({
      config: realConfig,
      kind: 'ocr',
      id: 'o',
      modelKey: LOCAL,
      probes: machine({ availableGb: 50, freeVramGb: 6.5, active: ['ninfer-serve'], resident: {} }),
    })
    expect(decision.state).toBe('BLOCKED_RESOURCE')
    expect(decision.reasons.join(' ')).toMatch(/VRAM/)
    expect(decision.reclaimable.map((r) => r.what)).toContain('ninfer/qwen3.8-27b')
  })

  it('serializes local inference: one exclusive holder at a time', () => {
    const probes = machine({ availableGb: 50, active: ['strata-max'], resident: { 'strata-max': 55 } })
    const reservations = [{ id: 'ocr-running', kind: 'ocr', state: 'RUNNING', requiredGb: 2, exclusive: 'local-inference' }]
    const decision = admit({ config: realConfig, kind: 'ocr', id: 'second', modelKey: LOCAL, probes, reservations })
    expect(decision.state).toBe('BLOCKED_RESOURCE')
    expect(decision.reasons.join(' ')).toMatch(/exclusive resource 'local-inference' is held by reservation 'ocr-running'/)
  })

  it('refuses to guess an unmeasured footprint', () => {
    // The subject is CONSTRUCTED, not borrowed from the registry. This case used to
    // name `ninfer`, which happened to be unmeasured when it was written; when
    // ninfer's footprint was measured (650646c) the test broke for a reason that
    // had nothing to do with the rule it protects. A check for "an unmeasured
    // footprint is refused" must own its unmeasured model, or it is really a check
    // on the registry — the exact mistake this file's own header warns about.
    const unmeasured = JSON.parse(JSON.stringify(realConfig))
    delete unmeasured.models['ninfer/qwen3.8-27b'].resources.ram_gb
    unmeasured.models['ninfer/qwen3.8-27b'].resources.footprint_source = 'unmeasured'
    // The probe must be roomy in VRAM: with the default (6.5 GB free, strata-max
    // squatting) the VRAM gate fires FIRST and this case would be asserting the
    // wrong rule — a test that passes for a reason other than the one it names.
    // Both shapes of "no measurement" are asserted, because they used to differ: a
    // null was refused and an ABSENT field was admitted as free.
    const roomy = { availableGb: 50, freeVramGb: 32, active: [], resident: {} }
    for (const shape of ['null', 'absent']) {
      const unmeasured = JSON.parse(JSON.stringify(realConfig))
      if (shape === 'null') unmeasured.models['ninfer/qwen3.8-27b'].resources.ram_gb = null
      else delete unmeasured.models['ninfer/qwen3.8-27b'].resources.ram_gb
      unmeasured.models['ninfer/qwen3.8-27b'].resources.footprint_source = 'unmeasured'
      const decision = admit({ config: unmeasured, kind: 'explorer', id: 'e', modelKey: 'ninfer/qwen3.8-27b', probes: machine(roomy) })
      expect(decision.state, `ram_gb ${shape} must be refused`).toBe('BLOCKED_RESOURCE')
      expect(decision.reasons[0]).toMatch(/no measured RAM footprint/)
    }
  })

  it('charges a model that is only ACTIVATING, and blocks it on a GPU someone else holds', () => {
    // The bug this test exists for was found live: `systemctl is-active` exits
    // non-zero for `activating`, so a model on its way up read as ABSENT — its
    // 55 GB went uncharged and its claim on the GPU was invisible. strata-max
    // sat in exactly this state while crash-looping against the VRAM that
    // ninfer-serve held.
    const decision = admit({
      config: realConfig,
      kind: 'ocr',
      id: 'o',
      modelKey: LOCAL,
      probes: machine({ availableGb: 50, freeVramGb: 6.5, active: ['ninfer-serve'], activating: ['strata-max'], resident: {} }),
    })
    expect(decision.state).toBe('BLOCKED_RESOURCE')
    expect(decision.requiredGb).toBe(61) // 2 task + 4 reserve + 55 — the load is charged
    expect(decision.reasons.join(' ')).toMatch(/VRAM: .* needs 30 GB, 6\.5 GB free — held by ninfer\/qwen3\.8-27b/)
    expect(decision.reclaimable.map((r) => r.what)).toContain('ninfer/qwen3.8-27b')
  })

  it('treats an unknown service state as not-running rather than as safe', () => {
    const probes = { ...machine({ availableGb: 50, active: [], resident: {}, freeVramGb: 32 }), serviceState: () => 'unknown' }
    const decision = admit({ config: realConfig, kind: 'explorer', id: 'e', modelKey: LOCAL, probes })
    // 2 + 4 + 55 = 61 > 50: an unknown state must never be read as "already loaded".
    expect(decision.state).toBe('BLOCKED_RESOURCE')
    expect(decision.requiredGb).toBe(61)
  })
})

describe('capability routing', () => {
  it('treats a capability floor as a floor, not a preference', () => {
    // strata-max declares reasoning 2; ask for 3 and it must be rejected by name.
    const strict = { ...realConfig, task_kinds: { ...realConfig.task_kinds, reviewer: { ...realConfig.task_kinds.reviewer } } }
    strict.task_kinds.deep = { capabilities: { reasoning: 3, tool_use: 3 }, resources: { ram_gb: 1 }, role: 'reader' }
    const result = selectModel({ config: strict, kind: 'deep', probes: machine({ availableGb: 50, active: [], resident: {} }) })
    const rejected = result.rejected.find((r) => r.modelKey === LOCAL)
    expect(rejected.why).toMatch(/below the capability floor/)
    expect(result.modelKey).not.toBe(LOCAL)
  })

  it('breaks a tie by the CONFIGURED preference, not by capability headroom', () => {
    // Both models are cost_tier 0 and both clear the builder floor, so the tie is
    // real and something must break it. The shipped registry prefers strata-max
    // (preference -1) — but capabilityHeadroom ALREADY favours it, because that sum
    // adds raw units and its context window is 32768 larger. A case on the shipped
    // registry therefore cannot tell the two rules apart: it would pass with the
    // preference deleted, which makes it a claim, not a check. So the preference is
    // INVERTED here, against the headroom, and the assertion is that it still wins.
    const flipped = JSON.parse(JSON.stringify(realConfig))
    flipped.models['ninfer/qwen3.8-27b'].preference = -1
    flipped.models[LOCAL].preference = 0
    const roomy = machine({ availableGb: 200, active: [], resident: {}, freeVramGb: 32 })
    expect(selectModel({ config: flipped, kind: 'builder', probes: roomy }).modelKey).toBe('ninfer/qwen3.8-27b')
    // ...and on the shipped registry the same probe picks the preferred primary.
    expect(selectModel({ config: realConfig, kind: 'builder', probes: roomy }).modelKey).toBe(LOCAL)
  })

  it('never lets a configured preference promote cloud over local', () => {
    // The preference orders models that are already admissible; it does not
    // override the cost policy. A cloud model given the strongest possible
    // preference must still lose while a local model is admissible.
    const cheat = JSON.parse(JSON.stringify(realConfig))
    cheat.models[CLOUD].preference = -99
    const result = selectModel({ config: cheat, kind: 'builder', probes: machine({ availableGb: 200, active: [], resident: {}, freeVramGb: 32 }) })
    expect(result.modelKey).toBe(LOCAL)
    expect(result.costTier).toBe(0)
    expect(result.fallback).toBe(false)
  })

  it('switches the builder from the fallback to the target primary on ADMISSIBILITY alone', () => {
    // This is the RAM upgrade expressed as a test. NOTHING in the registry is
    // reconfigured between the two calls. Below the required headroom the local
    // fallback carries the work; above it the preferred model takes over by
    // itself. It is the machine check for "no manual reconfiguration after the
    // upgrade" — if a change ever makes the switch need a hand, this goes red.
    const notYet = selectModel({ config: realConfig, kind: 'builder', probes: machine({ availableGb: 40, active: [], resident: {}, freeVramGb: 32 }) })
    expect(notYet.modelKey).toBe('ninfer/qwen3.8-27b')
    expect(notYet.fallback).toBe(false) // local is local, target or not

    const enough = selectModel({ config: realConfig, kind: 'builder', probes: machine({ availableGb: 200, active: [], resident: {}, freeVramGb: 32 }) })
    expect(enough.modelKey).toBe(LOCAL)
    expect(enough.fallback).toBe(false)
  })

  it('keeps the reviewer independent of the builder, and local', () => {
    // strata-max declares reasoning 2 against a reviewer floor of 3, so the target
    // primary can NEVER review. That is independence enforced by capability rather
    // than by bookkeeping, and it means the reviewer is always a different model.
    // With the RAM upgrade that different model is the other LOCAL one — which is
    // how cloud leaves the build loop without being replaced by anything.
    const roomy = machine({ availableGb: 200, active: [], resident: {}, freeVramGb: 32 })
    const builder = selectModel({ config: realConfig, kind: 'builder', probes: roomy })
    expect(builder.modelKey).toBe(LOCAL)
    const reviewer = selectModel({ config: realConfig, kind: 'reviewer', probes: roomy, avoidModels: [builder.modelKey] })
    expect(reviewer.modelKey).toBe('ninfer/qwen3.8-27b')
    expect(reviewer.fallback).toBe(false)
    expect(reviewer.costTier).toBe(0)
  })

  it('falls back to cloud when the local preference is resource-blocked, and calls it a fallback', () => {
    // The real 04:00 decision: the model is NOT resident, reloading it would
    // cost 55 GB of a 50 GB pool, and the gate alone fits comfortably. Local is
    // cost_tier 0 and the policy preference; it is simply not admissible, so the
    // router falls back rather than failing. A fallback is an outcome, not an
    // incident — it belongs in telemetry, not in the ledger.
    // 50 GB is no longer the right machine for this case. Since ninfer's tool_use
    // was measured at 3 (650646c) the builder has a SECOND admissible local model,
    // so 50 GB now admits ninfer at cost_tier 0 and never falls back at all. The
    // case wants the local TIER blocked, both models in it, so 8 GB it is: strata
    // needs 62, ninfer needs 10, and cloud needs exactly 8.
    const result = selectModel({ config: realConfig, kind: 'builder', probes: machine({ availableGb: 8, active: [], resident: {}, freeVramGb: 32 }) })
    expect(result.modelKey).toBe(CLOUD)
    expect(result.fallback).toBe(true)
    expect(result.reason).toMatch(/fell back to cost_tier 2/)
    // And the model it refused is named, with the reason.
    expect(result.rejected.find((r) => r.modelKey === LOCAL).why).toMatch(/RAM: needs 62 GB/)
  })

  it('blocks outright when even the fallback does not fit', () => {
    // 5 GB available and a 4 GB reserve: nothing may start, cloud included.
    const result = selectModel({ config: realConfig, kind: 'builder', probes: machine() })
    expect(result.modelKey).toBeNull()
    expect(result.reason).toMatch(/every capability-qualified model is blocked on resources/)
    expect(result.reclaimable.map((r) => r.what)).toContain(LOCAL)
  })

  it('prefers the cheap tier when it is admissible', () => {
    // A task that needs no model gets no model — the gate and the browser lane.
    const gate = selectModel({ config: realConfig, kind: 'gate', probes: machine({ availableGb: 50 }) })
    expect(gate.modelKey).toBeNull()
    expect(gate.reason).toMatch(/needs no model/)

    const explorer = selectModel({ config: realConfig, kind: 'explorer', probes: machine({ availableGb: 62, active: [], resident: {}, freeVramGb: 32 }) })
    expect(explorer.costTier).toBe(0)
    expect(explorer.modelKey).toBe(LOCAL)
    expect(explorer.fallback).toBe(false)
  })

  it('excludes the implementer\u2019s model by name — independence is a property, not a machine', () => {
    const result = selectModel({
      config: realConfig,
      kind: 'reviewer',
      probes: machine({ availableGb: 50, active: [], resident: {} }),
      avoidModels: [LOCAL],
    })
    expect(result.rejected.find((r) => r.modelKey === LOCAL).why).toMatch(/excluded by independence/)
    expect(result.modelKey).not.toBe(LOCAL)
  })

  it('requires local inference when a lane declares it, and lets the ocr lane reach cloud while that policy is waived', () => {
    // PART 1 — THE MECHANISM, against an explicit FIXTURE. A lane that declares
    // `requires_local_inference` rejects EVERY non-local model by name, before
    // the capability floor is consulted (`scheduler.mjs:517`). The fixture — not
    // the ocr lane — is the subject, so a later human-authorized flip of ocr's
    // flag cannot silently disable this invariant. Remove that check and CLOUD
    // becomes a candidate, so `rejected.find(...)` is undefined: the assertion
    // is not vacuous.
    const localOnly = {
      ...realConfig,
      task_kinds: { ...realConfig.task_kinds, 'local-only': { ...realConfig.task_kinds.ocr, requires_local_inference: true } },
    }
    const strict = selectModel({ config: localOnly, kind: 'local-only', probes: machine({ availableGb: 62, active: [], resident: {}, freeVramGb: 32 }) })
    expect(strict.modelKey).toBe(LOCAL)
    expect(strict.rejected.find((r) => r.modelKey === CLOUD).why).toMatch(/requires local inference/)

    // PART 2 — THE CURRENT POLICY, against the real registry, asserted separately
    // so the two cannot be mistaken for one another (the defect this rewrite
    // repairs: the old test's NAME claimed the mechanism while its BODY asserted
    // a policy value). `ec47f15` (human-authorized, D-017) set
    // `task_kinds.ocr.requires_local_inference` false so the lane can run at all:
    // the only local model clearing ocr's floor holds 49.2 GB and cannot coexist
    // with a satisfiable admission reserve at 62 GB (D-012). Cloud is therefore
    // now an ADMISSIBLE candidate for ocr, and on a machine where the local model
    // is blocked the lane falls back to it. RESTORE the flag to true when the
    // human says so; this half then goes back to asserting CLOUD is rejected and
    // LOCAL is the only option.
    const roomy = selectModel({ config: realConfig, kind: 'ocr', probes: machine({ availableGb: 62, active: [], resident: {}, freeVramGb: 32 }) })
    expect(roomy.modelKey).toBe(LOCAL)
    expect(roomy.rejected.find((r) => r.modelKey === CLOUD)).toBeUndefined()

    const blockedLocal = selectModel({ config: realConfig, kind: 'ocr', probes: machine({ availableGb: 8, active: [], resident: {}, freeVramGb: 32 }) })
    expect(blockedLocal.modelKey).toBe(CLOUD)
    expect(blockedLocal.fallback).toBe(true)
  })

  it('reports a capability gap when no model can meet the floor', () => {
    const config = { ...realConfig, task_kinds: { ...realConfig.task_kinds, impossible: { capabilities: { reasoning: 9 }, resources: { ram_gb: 1 } } } }
    const result = selectModel({ config, kind: 'impossible', probes: machine({ availableGb: 50 }) })
    expect(result.modelKey).toBeNull()
    expect(result.reason).toMatch(/no model in the registry meets/)
  })

  it('computes gaps against every declared floor', () => {
    expect(capabilityGaps({ capabilities: { reasoning: 1, tool_use: 3 } }, { reasoning: 3, tool_use: 3 })).toEqual(['reasoning: 1 < 3'])
    expect(capabilityGaps({ capabilities: {} }, { reasoning: 1 })).toEqual(['reasoning: model declares nothing, task needs >= 1'])
  })
})

describe('work state', () => {
  const item = (lanes) => ({ ...newWorkItem({ id: 'x', title: 'x', planRef: 'plan.md' }), lanes })

  it('makes complete terminal for a lane: evidence does not un-exist', () => {
    expect(laneTransitionAllowed(realConfig, 'pending', 'running')).toBe(true)
    expect(laneTransitionAllowed(realConfig, 'running', 'complete')).toBe(true)
    expect(laneTransitionAllowed(realConfig, 'complete', 'running')).toBe(false)
    expect(laneTransitionAllowed(realConfig, 'complete', 'pending')).toBe(false)
    expect(laneTransitionAllowed(realConfig, 'failed', 'running')).toBe(true)
  })

  it('refuses acceptance while a required lane is not complete — and says which', () => {
    const decision = acceptanceDecision(realConfig, item({
      implementation: { state: 'complete' },
      verification: { state: 'complete' },
      review: { state: 'running' },
      visual_validation: { state: 'pending' },
      acceptance: { state: 'blocked' },
    }))
    expect(decision.state).toBe('blocked')
    expect(decision.incomplete).toEqual(['review'])
    expect(decision.reason).toBe('cannot pass: review=running')
  })

  it('passes acceptance only when every required lane is complete', () => {
    const decision = acceptanceDecision(realConfig, item({
      implementation: { state: 'complete' },
      verification: { state: 'complete' },
      review: { state: 'complete' },
      visual_validation: { state: 'pending' }, // not required by the gate
      acceptance: { state: 'blocked' },
    }))
    expect(decision.state).toBe('pass')
    // The lane set is the configured one, not a list hard-coded in two places.
    expect(DEFAULT_LANES).toEqual(Object.keys(newWorkItem({ id: 'y', title: 'y', planRef: 'p' }).lanes))
  })

  it('offers only work whose dependencies are green, so independent work can run at once', () => {
    const done = (id) => ({
      id,
      plan_ref: 'plan.md',
      lanes: { implementation: { state: 'complete' }, verification: { state: 'complete' }, review: { state: 'complete' } },
    })
    const waiting = { id: 'b', plan_ref: 'plan.md', depends_on: ['pending-elsewhere'], lanes: { implementation: { state: 'pending' } } }
    const free = { id: 'c', plan_ref: 'plan.md', depends_on: ['a2'], lanes: { implementation: { state: 'pending' } } }
    const ready = readyItems([done('a'), done('a2'), waiting, free])
    expect(ready.map((i) => i.id)).toEqual(['a', 'a2', 'c'])
    expect(ready.map((i) => i.id)).not.toContain('b')
  })
})

describe('the registry itself', () => {
  it('every capability floor is meetable by at least one registered model', () => {
    for (const [kind, task] of Object.entries(realConfig.task_kinds)) {
      const floors = task.capabilities ?? {}
      if (!Object.keys(floors).length) continue
      const meetable = Object.values(realConfig.models).some((m) => capabilityGaps(m, floors).length === 0)
      expect(meetable, `task kind '${kind}' has a floor no model can meet`).toBe(true)
    }
  })

  it('every task kind declares a footprint, and an unknown one is null rather than a guess', () => {
    for (const [kind, task] of Object.entries(realConfig.task_kinds)) {
      expect(task.resources, `task kind '${kind}' has no resources block`).toBeTruthy()
      expect(task.resources.footprint_source, `task kind '${kind}' does not say where its number came from`).toBeTruthy()
    }
  })

  it('refuses a SILENT re-open of a completed lane, and allows a declared one (the fix-round case)', () => {
    // Found live: `factory work transition v28-r2-6c implementation running` was
    // refused on a completed lane during fix round 3, so the batch's own escalating
    // fix loop could not be written down at all. The exception is narrow: the
    // caller declares it AND says why.
    expect(laneTransitionAllowed(realConfig, 'complete', 'running')).toBe(false)
    expect(laneTransitionAllowed(realConfig, 'complete', 'running', { reopen: true })).toBe(false)
    expect(laneTransitionAllowed(realConfig, 'complete', 'running', { reopen: false, reason: 'x' })).toBe(false)
    expect(laneTransitionAllowed(realConfig, 'complete', 'running', { reopen: true, reason: 'fix round 3' })).toBe(true)
    // Only the declared target is reachable, and only from `complete`.
    expect(laneTransitionAllowed(realConfig, 'complete', 'failed', { reopen: true, reason: 'x' })).toBe(false)
    expect(laneTransitionAllowed(realConfig, 'pending', 'running', { reopen: true, reason: 'x' })).toBe(true) // the normal path still works
  })

  it('records lane fields without moving state, so the implementer is reachable (D-008)', () => {
    // `running -> running` is correctly refused as a transition, so without a
    // field-only write the model is unreachable on a lane already in the state a
    // caller wants to announce itself in — and the work item keeps reading as
    // "nobody implemented this", which is how independence silently vanished.
    const item = newWorkItem({ id: 'w', title: 't', planRef: 'p' })
    applyTransition(item, 'implementation', 'running')
    applyTransition(item, 'implementation', 'complete')
    expect(implementerOf(item).model).toBe(null)
    const r = applyFields(item, 'implementation', { model: 'some/model' })
    expect(r.ok).toBe(true)
    expect(item.lanes.implementation.state).toBe('complete') // state untouched
    expect(implementerOf(item).model).toBe('some/model')
    expect(item.history.at(-1).note).toMatch(/no state change/)
  })

  it('creates work items in states its OWN guard calls legal (constructor vs validator)', () => {
    // Found live by slice 6d's builder as a BLOCKED gate, on the orchestrator's
    // freshly-initialized registry: `newWorkItem` defaulted every lane — including
    // `acceptance` — to `pending`, while the guard's `lane-states-legal` rule reads
    // the acceptance lane's legal set from `acceptance_states` = {blocked,pass,waived},
    // which has no `pending`. So `factory work init` produced a repo its own guard
    // called illegal, on every item, every time — an instrument whose default output
    // its own validator rejects. 6c escaped notice only because its acceptance had
    // already reached a legal terminal state. This mirrors the guard's rule so the
    // constructor cannot drift away from its validator again.
    const item = newWorkItem({ id: 'fresh', title: 't', planRef: 'p' })
    const workStates = Object.keys(realConfig.lane_states)
    const acceptanceStates = Object.keys(realConfig.acceptance_states)
    for (const [lane, value] of Object.entries(item.lanes)) {
      const legal = lane === 'acceptance' ? acceptanceStates : workStates
      expect(legal, `lane '${lane}' starts at '${value.state}', which its vocabulary cannot reach`).toContain(value.state)
    }
  })

  it('gives every model a capability set, a footprint source and a cost tier', () => {
    for (const [key, model] of Object.entries(realConfig.models)) {
      expect(model.capabilities, key).toBeTruthy()
      expect(model.resources.footprint_source, key).toBeTruthy()
      expect(Number.isFinite(model.cost_tier), key).toBe(true)
      expect(['local', 'cloud'], key).toContain(model.provider)
    }
  })

  it('declares exactly one RESIDENT local model, because local models cannot coexist', () => {
    expect(realConfig.models[residentModel(realConfig)].residency).toBe('resident')
    const residentLocals = Object.entries(realConfig.models)
      .filter(([, m]) => m.provider === 'local' && m.residency === 'resident')
      .map(([k]) => k)
    expect(residentLocals).toHaveLength(1)
    // Policy and the per-model field must agree, or `doctor` and the router
    // would be reading two different intentions.
    expect(realConfig.policies.residency.resident).toEqual(residentLocals)
  })

  it('gives every model a health probe, and derives a remote endpoint from one place', () => {
    for (const [key, model] of Object.entries(realConfig.models)) {
      expect(['service', 'tcp'], `${key} declares a probe`).toContain(model.health?.probe)
      if (model.health.probe === 'tcp') expect(endpointHostPort(model)).toBeTruthy()
    }
    expect(endpointHostPort(realConfig.models['fr-1/glm-4.7-flash:latest'])).toEqual({ host: '100.92.51.0', port: 11434 })
    expect(endpointHostPort(realConfig.models['ollama-cloud/deepseek-v4.1-flash:cloud'])).toEqual({ host: 'ollama.com', port: 443 })
  })
})

describe('remote availability is part of admission (D-003)', () => {
  it('refuses a tier-1 remote model that cannot be reached, and falls through to tier 2', () => {
    // The real shape: the local model cannot fit, so the tier-1 tailnet model is
    // the next preference — and it is down. Before this rule, admission would pass
    // and the failure would land on the builder, a whole slice later.
    const probes = machine({ availableGb: 12, active: [], activating: [], resident: {}, reachable: { '100.92.51.0:11434': false } })
    const routed = selectModel({ config: realConfig, kind: 'explorer', probes })
    const fr1 = routed.rejected.find((r) => r.modelKey.startsWith('fr-1'))
    expect(fr1, 'fr-1 must be rejected, not silently skipped').toBeTruthy()
    expect(fr1.why).toMatch(/unreachable \(tcp 100\.92\.51\.0:11434\)/)
    expect(routed.modelKey).toBe('ollama-cloud/deepseek-v4.1-flash:cloud')
    expect(routed.fallback).toBe(true)
  })

  it('still selects it when the probe says it is there — cost tier is not the disqualifier', () => {
    const probes = machine({ availableGb: 50, reachable: { '100.92.51.0:11434': true } })
    const health = checkHealth('fr-1/glm-4.7-flash:latest', realConfig, probes)
    expect(health).toEqual({ ok: true, gated: true, how: 'tcp 100.92.51.0:11434' })
  })

  it('treats an UNKNOWABLE probe as unreachable, never as reachable', () => {
    const probes = { ...machine({ availableGb: 50 }), tcpReachable: () => null }
    const health = checkHealth('fr-1/glm-4.7-flash:latest', realConfig, probes)
    expect(health.ok).toBe(false)
    expect(health.how).toMatch(/unknown/)
  })

  it('does NOT gate a local model on its service being up — a stopped service is a planned start', () => {
    // The distinction that matters: a local model's state is MODELED by its
    // footprint (charged in full while down, nothing while up). Gating on it too
    // would refuse every task on a machine that is behaving correctly.
    const probes = machine({ availableGb: 50, active: [], activating: [], resident: {} })
    const health = checkHealth('strata-max/qwen3.8-flash-next-iq3_s', realConfig, probes)
    expect(health.gated).toBe(false)
    expect(health.ok).toBe(true)
  })
})

describe('reclaim never kills a model that is in use (D-004)', () => {
  const live = [
    { id: 'r2-6c-gate', kind: 'gate', model: 'strata-max/qwen3.8-flash-next-iq3_s', state: 'RUNNING', admittedAt: '2026-10-02T12:00:00.000Z' },
  ]

  it('refuses to stop a model a live reservation holds, and names the holder', () => {
    const probes = machine({ active: ['strata-max'], resident: { 'strata-max': 55 } })
    const { candidates, refused } = reclaimCandidates(realConfig, probes, live)
    expect(candidates.map((c) => c.key)).not.toContain('strata-max/qwen3.8-flash-next-iq3_s')
    const r = refused.find((x) => x.key === 'strata-max/qwen3.8-flash-next-iq3_s')
    expect(r.heldBy).toBe('r2-6c-gate')
  })

  it('still reclaims a resident model nobody holds — the rule is ownership, not refusal to act', () => {
    const probes = machine({ active: ['strata-max'], resident: { 'strata-max': 55 } })
    const { candidates, refused } = reclaimCandidates(realConfig, probes, [])
    expect(candidates.map((c) => c.key)).toContain('strata-max/qwen3.8-flash-next-iq3_s')
    expect(refused).toHaveLength(0)
  })

  it('ignores a RELEASED reservation, so a finished lane does not block reclamation forever', () => {
    const probes = machine({ active: ['strata-max'], resident: { 'strata-max': 55 } })
    const released = [{ ...live[0], state: 'RELEASED', releasedAt: '2026-10-02T12:10:00.000Z' }]
    const { candidates } = reclaimCandidates(realConfig, probes, released)
    expect(candidates.map((c) => c.key)).toContain('strata-max/qwen3.8-flash-next-iq3_s')
  })

  it('reclaim is opt-in by policy — this is not an automatic behaviour', () => {
    expect(realConfig.policies.reclaim).toBe('opt-in')
  })
})
