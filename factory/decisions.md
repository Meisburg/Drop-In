# Factory decisions

The **decision log**. Append-only, newest at the bottom, one entry per decision
that changed how the factory behaves.

## Why this is a separate file

The ledger at `.scratch/v28/ledger.md` carries 7,112 lines of everything — the
slice ledger, dispatch receipts, OOM post-mortems, measurement tails and the
decisions that were extracted from them. It is the historical record and it is
**not being rewritten**; retro-splitting a record to make it tidier rewrites
evidence to fit a taxonomy invented afterwards.

From here on the four KINDS are separate, because they have different readers
and different lifetimes:

| Kind | Where | Who reads it | Lifetime |
|---|---|---|---|
| **decisions** | `factory/decisions.md` (this file) | a human, deciding again | permanent |
| **work state** | `factory/work/<id>.json` | the next worker, after compaction | until the work is accepted |
| **run telemetry** | `factory/logs/runs.jsonl` | debugging a dispatch | disposable |
| **resource telemetry** | `factory/logs/telemetry.jsonl` | debugging the machine | disposable |

The last two are gitignored. A decision that only exists in telemetry does not
exist for the next reader; telemetry that gets promoted to a decision gets an
entry here.

## How a decision is recorded

State the decision, the reason it was needed, and what it does *not* authorize.
A decision without its reason is a rule someone will delete.

---

## D-001 — `strata-max` is the resident local factory model

**Decided 2026-10-02.** Strata (`strata-max/qwen3.8-flash-next-iq3_s`) is the
model the machine should be holding. `ninfer-serve` and `strata-serve` are
**on-demand**: legitimate models, explicitly started when wanted, and their being
up is not the machine's normal state.

Mechanism: every model declares `residency` (`resident` | `on-demand` |
`remote`), `policies.residency` names the resident set, `factory doctor` reports
drift between what is declared and what is running, and the guard refuses a
registry with **two** declared residents — because every local model declares
`exclusive: local-inference` and they genuinely cannot coexist. Measured
2026-10-02: `ninfer-serve` holding 23.4 GB of VRAM drove `strata-max` into **176
failed starts and 88 restarts in 20 minutes**.

Does **not** authorize: stopping `ninfer-serve`. It was left running
deliberately, and no reclamation was performed on it.

## D-002 — the historical ledger stays as it is

**Decided 2026-10-02.** `.scratch/v28/ledger.md` is left intact. No retroactive
rewrite. The separation in the table above applies **going forward only**.

Does **not** authorize: moving the ledger, splitting it, or treating its
mixed-ness as a defect to be fixed in place.

## D-003 — availability is part of admission, not a privilege of a cheap tier

**Decided 2026-10-02, from a measurement.** `fr-1/glm-4.7-flash:latest` carries
`cost_tier 1`, which made it the *preferred* fallback ahead of cloud — and it was
**unreachable**: a TCP connect to `100.92.51.0:11434` timed out. Admission did
not know, so a builder would have been routed to a dead endpoint and the failure
would have surfaced a whole slice later.

So every model declares `health.probe`, and the probe runs **at admission**:

- `probe: tcp` — for a remote model. It has no unit to read and no footprint to
  charge, so connecting is the only thing that can tell the truth. An unreachable
  remote model is **rejected**, with the reason, and the router falls through to
  the next tier.
- `probe: service` — for a local model. This is **not a gate**: a stopped local
  service is a *planned start*, already accounted for by `modelFootprint`, which
  charges the whole model while it is down and nothing while it is up. Gating on
  it as well would refuse every task on a machine behaving correctly.

An **unknowable** probe (a connect that neither succeeds nor cleanly fails) is
treated as **unreachable**, never as reachable.

Cost tier remains 1 for `fr-1`. The tier says *how cheap*, never *whether it is
there*.

Does **not** authorize: treating the probe as a benchmark, or assuming cloud is
more reliable — `ollama.com:443` is probed by the same mechanism for the same
reason.

## D-004 — reclamation stays opt-in, and never kills a model that is in use

**Decided 2026-10-02.** Automatic reclamation is **not** enabled. Stopping a
resident model is destructive, and the scheduler does not yet have reliable
liveness (is anything actually using it?) or ownership (who may be told to
wait?) semantics. Until it does, `factory reclaim` is a human-typed command and
`policies.reclaim` is `opt-in`, enforced by the guard.

The invariant that **is** enforced now, in `reclaimCandidates`: reclaim refuses
to stop a model that a live (`ADMITTED` or `RUNNING`) reservation holds, and it
names the holder. A released reservation does not block reclamation forever.

Does **not** authorize: auto-reclaim later without adding liveness and ownership
first. This is a sequencing decision, not a permanent refusal of the idea.

## D-005 — `~/.pi/agent/agents/` should be repo-tracked; not enforced yet

**Decided 2026-10-02.** Those files materially control factory behavior — they
set each lane's model — and they live **outside the repository and outside every
guard**. A steering file with no diff and no review is the hole this factory is
supposed to close. The intention is to require them to be tracked.

**Inspected before enforcing, as required.** Findings:

- `~/.pi` is **not a git repository** at all, and is **not tracked** anywhere.
- The directory holds **12 `.bak-*` files** alongside the 5 authoritative ones.
  They are machine-local history, and the **only** thing that differs between a
  live file and its backups is the `model:` line (the lane-model swaps).
- The 5 authoritative files (`orchestrator-{builder,explorer,researcher,reviewer,verifier}.md`)
  contain **zero machine-local content** — no absolute paths, no IP addresses, no
  tokens, no service names, no `systemctl`, no GPU references. They are portable.
- `~/.pi/agent/` also holds `sessions/` and `skills/`, which are machine state.

So the tracking unit must be **`agents/*.md` only**, never the parent directory,
and the `.bak-*` files must be excluded rather than tracked. There is **no**
legitimate machine-local configuration that would be swept up by that scope.

Does **not** authorize: enforcing the check yet, tracking `sessions/` or any part
of `~/.pi` other than `agents/*.md`, or committing the `.bak-*` files.

## D-006 — the dispatch-interception layer is the next infrastructure task

**Decided 2026-10-02.** Today the scheduler is **called**; it does not
**intercept**. The orchestrator is required to run `factory admit` before a
dispatch, but nothing structurally prevents a worker being launched without it.

The next factory infrastructure improvement, **after** the current product work,
is an admission-token / dispatch-interception layer: a worker cannot be launched
without passing the resource scheduler, and the token is the proof it did.

**Not implemented yet, by instruction.** Recorded here so it is not
rediscovered, and so the gap is a known one rather than an assumption.

Does **not** authorize: building it now, or weakening the current convention on
the grounds that "the layer will enforce it eventually".

## D-007 — an unsatisfiable independence rule is reported, never silently ignored

**Decided 2026-10-02, from a measurement.** The reviewer lane declares
`same_model: false` — the reviewer must not be the implementer's sibling, because
a sibling cannot break the deadlock the escalation ladder exists for. Measuring
the registry showed the rule is **unsatisfiable by construction**: the reviewer's
floor (`reasoning 3`, `tool_use 3`) is cleared by **exactly one** registered
model, `ollama-cloud/deepseek-v4.1-flash:cloud`.

Worse, it failed *silently*. `factory/work/v28-r2-6c.json` recorded `model: null`
on every lane, so `implementerOf` returned nothing, so
`--independence-of <work-id>` excluded **nothing** — and `route reviewer` returned
the implementer's own model while looking like it had honoured the rule. A rule
that reports success when it cannot act is worse than no rule.

Two mechanisms, both enforced now:

1. `route` prints `INDEPENDENCE UNVERIFIABLE` when the work item records no
   implementer model, and `INDEPENDENCE UNSATISFIABLE — <model> is the ONLY
   registered model that clears its floor` when excluding the implementer leaves
   nothing. Both go to the telemetry log. Measured: `route reviewer
   --independence-of ollama-cloud/deepseek-v4.1-flash:cloud` → **exit 3, NO
   ELIGIBLE MODEL**, with all five models named and the reason for each.
2. `factory-guard.mjs` **fails** an independence-required lane that has fewer
   than two qualified models, unless the registry records the gap in writing
   (`task_kinds.<lane>._independence_gap`). The acknowledgement is in
   `factory/config.json` for `reviewer`.

The gap is closed by **registering a second model that clears the floor**. It is
explicitly **not** closed by raising a declared capability value — those are
`DECLARED policy, not a benchmark`, and editing one to silence a warning would be
editing the measurement to fit the answer.

Does **not** authorize: treating a sibling reviewer as acceptable, or deleting
`_independence_gap` without registering the second model.

## D-008 — every dispatch records the model that ran it

**Decided 2026-10-02, as the precondition for D-007.** `factory/work/<id>.json`
lane records must carry the `model` that did the work, because `implementerOf`
reads it and independence is unenforceable without it. An empty model field is a
hole that reads as a pass, which is how the v28 r2 slice 6c work item silently
had no independence at all.

Does **not** authorize: inferring the model from the agent definition's `model:`
default, which is a declared default and not the routed decision.
