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

## D-009 — a fix round can be written into the work state

**Decided 2026-10-02, found by using the machinery.** `complete` was terminal with
no way to represent a fix round: `factory work transition v28-r2-6c implementation
running` was **REFUSED (exit 4)** during slice 6c fix round 3 — so the batch's own
escalating fix loop, which exists *precisely* to re-run a completed lane, could not
be written down at all.

A re-open is now allowed and deliberately narrow: only `complete → running`, only
when the caller passes `--reopen "<why>"`, and the reason is recorded **on the
lane**. A silent re-open is still refused, so "evidence does not un-exist"
survives — the previous round's artifacts stay named and the reason for re-opening
joins them. Enforced by `lane_reopen` in the registry and pinned by a test.

Does **not** authorize: re-opening any lane to any state, or re-opening without a
reason.

## D-010 — a lane carries the model that ran it

**Decided 2026-10-02.** `--model` was recorded in the lane's **history entry** but
not on the **lane**, and `implementerOf` reads `lanes.<lane>.model`. So the work
item kept reading as "nobody implemented this" and independence stayed
unenforceable — D-008 was recorded but not actually satisfiable.

`running → running` is correctly refused as a transition, so a field-only write
was needed: `factory work set <id> <lane> --model <m>`. The lane now carries the
model, and it is reachable on a lane already sitting in the state a caller wants to
announce itself in.

With D-007, D-008, D-009 and D-010 together, independence works end to end and
reports the truth rather than a comfortable answer:

```
$ factory route reviewer --independence-of v28-r2-6c
route reviewer -> NO ELIGIBLE MODEL          exit 3
  independence: excluded ollama-cloud/deepseek-v4.1-flash:cloud (same model as the implementer)
```

Does **not** authorize: leaving a lane's model empty and calling independence
satisfied.

## D-011 — three adjudications on the slice 6c fix-round-3 report

**Decided 2026-10-02.** The builder raised two open questions and flagged one
apparent discrepancy. All three are ruled in, none silently discarded.

**1. The N7 history half is NOT widened. Upheld.** The builder narrowed the rule
to header lines about *the instrument's own text and numbers* and named a ceiling:
a literal reading would also fire on `scripts/guards/copy-field-consumption-guard.check.mjs:67`
(`it used to be a hard, un-allowlistable finding`) and
`scripts/guards/check-acceptance-greps.mjs:61`. **Independently confirmed by the
orchestrator, read-only.** The ceiling is real, not convenient.
Widening it would create findings in *another lane's* guard file, outside the seven
findings this round was bounded to. So the two lines are **recorded as known-open
with file:line** — a decision rather than a silence — and the widening gets its own
work item, not a hijacked fix round.

**2. The historical records are NOT rewritten. Upheld.** The builder declined to
rewrite the bare `HEAD` label in the briefs, the ledger and four review/verify
records, on the grounds that those are other lanes' measurements and rewriting them
falsifies a record. That is **correct and consistent with D-002**: the record keeps
its original label; the corrected label goes in the round that owns the artifact.
A record that is retro-edited to look like it was always right is not evidence.

**3. The 2065-vs-2067 discrepancy is the ORCHESTRATOR's error, not the builder's.**
The fix-3 brief carried a stale baseline of 2065 tests; the tree already had 2067,
because D-009/D-010 added two `it(` sites to `scripts/factory/scheduler.test.mjs`
after the brief was written. The builder measured 2067 and **named the delta instead
of quietly matching its brief** — which is the behaviour this batch wants. It also
means the brief committed **the exact defect this round exists to fix**: a stated
count that does not match its instrument. Recorded as the orchestrator's, and the
cause is named: a baseline was copied forward instead of re-measured at dispatch.

Does **not** authorize: treating a stale baseline in a brief as the builder's
failure, or widening a guard rule past the round's stated scope without a ruling.

## D-012 — the resident worker and the admission reserve are mutually exclusive on this machine

**Measured 2026-10-02, live.** The human authorized "stop ninfer, start strata-max" to
unblock `ocr`. Both halves were executed and both worked:
`ninfer-serve` stopped; `strata-max` **started clean and reached ready in 20 s**
(`ready: http://127.0.0.1:8081/v1`, `NRestarts=0`) — so its 88 historical restarts were the
VRAM conflict with `ninfer-serve`, and the log line `mtp: the 512 experts do not fit in VRAM`
is a **normal host-memory fallback message, not the fault**. The declared 55 GB footprint is
real: the engine child holds **Pss 49.2 GB private** (not reclaimable cache).

**And it did not achieve the goal.** With the resident worker up, `MemAvailable` fell to
**2 GB** against a declared reserve of **4 GB**, so *every* admission was refused — including
`ocr`'s own lease:

    admit r2-6c-ocr (ocr) -> BLOCKED_RESOURCE
      strata-max: RAM: needs 6 GB (task 2 + reserve 4), usable -17.1 GB (available 2.9 - promised 20)

**The arithmetic is not wrong; the policy pair is unsatisfiable at 62 GB.** Subtracting a
resident worker of 49.2 GB and a machine reserve of 4 GB from 62 GB, with a desktop resident,
leaves no room for any task. **A `residency: resident` worker and a satisfiable admission
reserve cannot both hold on this machine** — the reserve can never be met while the resident
model is loaded. Recorded as the measured ceiling, not as a bug.

**Does not authorize:** lowering `machine.reserve_gb` to make the refusal disappear — that is
editing the measurement to fit the answer, the same refusal made for strata-max's `reasoning`.

**Consequence for independence:** `ocr` is pinned to that one worker, because the `ocr` task
kind declares `requires_local_inference: true` **and** `strata-max` is the only local model
clearing its floor (`tool_use 3`). Note what `factory/config.json` already says about why ocr
is independent: *"its own scaffolding, its own rule resolution — so it does NOT need model
diversity."* Independence comes from the **scaffolding**, not from where the model is hosted —
so `requires_local_inference: true` is orthogonal to ocr's independence and is the single
declared value that pins this lane to a 49 GB worker. **Reconsidering that flag is a policy
decision for the human, not a defect to fix silently.**

## D-013 — two measured admission defects, found by using the scheduler

**1. `reserve_gb` is charged once per reservation instead of once per machine.**
`held` sums every ADMITTED reservation's `requiredGb` (`scheduler.mjs:178`), and
`requiredGb` already includes `reserveGb` (`.mjs:454/468`). Three concurrent lanes therefore
promised **20 GB, of which 12 GB was phantom reserve** (3 × 4 GB) — a machine-level constant
multiplied by concurrency. Measured: the three fix-4 lanes (build 7 + verify 7 + review 6)
reported as `promised 20` while all three ran **on cloud**.

**2. A remote-residency model charges local task RAM it will never use.** The builder kind
charges `task 3 + reserve 4` against **local** RAM even when the model is
`residency: remote`. `additionalRamGb` is correctly 0 for a remote model
(`scheduler.mjs:310`), but the task's own RAM is still charged locally.

Both make local admission look tighter than the machine is, which is the **opposite** failure
to the one this batch fears: not a hidden resource failure, but a *phantom* one — three cloud
lanes starving a local lane. Recorded; **not fixed** (a fix round was in flight, and changing
the admission arithmetic mid-verification would invalidate the evidence being gathered).

## D-014 — `factory reclaim` mutates without being asked to

**Measured.** `node scripts/factory/factory.mjs reclaim`, run **intending a read-only listing
of who holds what**, executed `systemctl --user stop ninfer-serve` (`factory.mjs:373-374`:
log `stopping …` then `spawnSync('systemctl', ['--user','stop', …])`). The human's inference
server was stopped by a command invoked as an inspection — the **second** time this pattern has
cost the batch (the first was the botched D-004 demo).

The guard's own rule (D-004) is *reclaim is opt-in, never kill in-use* — and it honoured the
in-use half (there was no live reservation holding ninfer). What it lacks is the **opt-in half
for the caller**: there is no dry-run default and no `--apply`. A query that stops a service
cannot be a query.

**Fix direction (not built):** `reclaim` prints the plan unless `--apply` is passed, and the
plan is what the human reads before authorizing. Until then, **the orchestrator does not run
`reclaim` to look at reservations** — it reads `factory/state/reservations.json`.

## D-015 — the factory's meaning of "independence" is weaker than the word (recorded, NOT built)

**Raised by the human 2026-10-02**, while unblocking the `ocr` lane: *"A separate lane or separate run is
not sufficient if it uses the same model and reasoning context as the builder."*

**What the factory means today — read out of `factory/config.json`, not assumed:**

| lane | independence | meaning |
|---|---|---|
| `reviewer` | `required: true, same_model: false` | must not be the implementer's model |
| `verifier` | `required: true, same_model: false` | same |
| `ocr` | `required: true, same_model: true` | **model diversity explicitly waived** |

and the router implements exactly one exclusion (`scheduler.mjs:522`): a model is filtered out by NAME when
`same_model` is false. So the factory's entire notion of independence is **"a different registered model"** —
and for `ocr`, **nothing at all is enforced about the model.**

**Two measured facts make this the weak spot it is:**
1. The reviewer floor is cleared by **exactly one** registered model (D-007), so `same_model: false` is
   unsatisfiable by construction and **every review this batch has received is a sibling**.
2. `ocr`'s independence claim rests on its **scaffolding** (own tool-use loop, own rule resolution, own rules
   file). That is a real and separate axis — but routing `ocr` to cloud now means it runs the **same model as
   the builder**, so it contributes **scaffolding diversity, not model independence.**

**The stronger semantics to model (future work, deliberately NOT built while 6c is in flight):** independence
is a property of a tuple — **model identity, reasoning context, harness/scaffolding, and information access** —
and a lane is independent only if it differs on the axes that could make it repeat the author's mistake. A
distinct lane or a distinct run is not sufficient; neither is a distinct model that shares the same reasoning
context.

**Not a defect in the factory's honesty:** the config already concedes `ocr` is not model-independent
(`same_model: true`). The gap is that the *word* `independence.required` reads stronger than the property it
enforces, and a consumer of `route` output can mistake "independence: satisfied" for "a genuinely independent
judgment happened." **When this is built, `route` should report which axes were actually satisfied and which
were waived, rather than a boolean.**

## D-016 — "independent" must be earned in the report, and the loop stops instead of guessing

**Human instruction, 2026-10-02.** Two rules for how this batch reports and escalates:

1. **Verify what independence means before calling a lane independent** — and do not use the word for a lane
   that shares the implementer's model and reasoning context. Report the axis that was satisfied
   (scaffolding) and the axis that was not (model), so a reader cannot mistake the one for the other. See D-015.
2. **The class-matching loop stops rather than repeats.** The 6c round-5 instrument was matching *examples* of
   a violation class rather than the class. If review fails **again** for another instance of the same class,
   do **not** start another blind fix round. **Stop and present, in one read: the invariant, the detection
   rule, and the missed shape** — so the human can decide whether the *specification itself* is incomplete.
   A fifth round that fixes the fifth example is evidence the specification is wrong, not the builder.

## D-017 — `ocr` routed to cloud: a temporary routing change, with its cost named

**Human-authorized 2026-10-02, "for this round" only.** `task_kinds.ocr.requires_local_inference` was `true`,
which pinned the lane to `strata-max` — the one local model clearing its floor — and that model holds
**49.2 GB private** and is mutually exclusive with a satisfiable admission reserve at 62 GB (D-012). So the
lane could not run at all.

**Change:** `requires_local_inference: false` (commit `ec47f15`), with the rationale recorded inline in
`factory/config.json`. The lane's **capability floor and `independence.required` are untouched** — only the
*placement* requirement was removed. `admit ocr` now succeeds, routing to
`ollama-cloud/deepseek-v4.1-flash:cloud`.

**What this does NOT buy, stated plainly:** the routed model is the same model the builder uses. So this
purchase is **scaffolding diversity**, not model independence (D-015). The ocr lane brings its own tool-use
loop, its own rule resolution and its own rules file, which is a genuinely different failure mode from the
agent reviewer — but it is **not** an independent judgment in the sense the human asked about.

**Revert when the human says so.** The flag went from `true` to `false`; restoring it is a one-line edit.

## D-018 — the widened bare-HEAD scan's excluded ledger line, recorded as known-open

**Decided 2026-10-02, slice 6c fix round 5.** The widened `no-bare-head-count` rule scans
`.scratch/v28/reports/*.md` and `.scratch/v28/briefs/*.md`. `.scratch/v28/ledger.md:7091`
(`259 at 32e9f48, 265 at HEAD — …`) carries the class and is **outside that scope**, so it is
recorded here as **known-open with file:line**, the way D-011 item 1 recorded its two header-scan
lines — an exclusion that lives only in a guard's `ladder:` bullet is a silence with a footnote.

Does **not** authorize: editing `.scratch/v28/ledger.md` (D-002 keeps it as it is), or widening the
scan to the ledger or to `plan.md` without its own work item.
