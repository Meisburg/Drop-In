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

## D-019 — instrument coverage vs the violation class (the round-5 comparison, measured)
> **SUPERSEDED — 2026-10-02.** The table below describes the instrument as it stood at round 5. It no longer
> exists: **D-021** replaced the lexical arms with a canonical, *verified* provenance token, and D-020 records
> why. The table is kept as the historical record of what was measured and why the widening stopped; a reader
> looking for the current rule should read D-021 and the guard's own header, which is authoritative.

**Requested by the human 2026-10-02.** The rule was matching *examples* of the class; round 5 made it
structural. This is the coverage comparison, and **every row was measured by the orchestrator** against the
committed instrument (`1282871`), independently of the builder's own claims. The class is the human's list.

| Class shape | Covered? | Evidence |
|---|---|---|
| every occurrence on a line, not just the first | **yes** | `matchAll`; the reviewer's doubled-`265 at HEAD` line now fires |
| `N … at HEAD` (any HEAD spelling) | **yes** | arm 1 `BARE_HEAD_COUNT_AT` |
| `git <subcmd> … HEAD` (whatever the subcommand) | **yes** | arm 2 `BARE_HEAD_COUNT_CMD` — structural, not a list of six commands |
| counted command defaulting to HEAD, no revision named | **yes** | arm 3 `BARE_HEAD_COUNT_WC` (`git log … \| wc -l`) |
| `HEAD~1`, `HEAD^`, `HEAD@{…}` | **yes** | measured firing on a probe report |
| **`@` — the git shorthand for HEAD** | **NO — declared but cannot fire** | see below. The worst row in this table. |
| HEAD versus working tree | **partial** | a note fires when the root is not a git worktree; a working-tree count (`git status --porcelain \| wc -l`) is **not** flagged |
| git content versus filesystem content | **partial** | the SCOPE block states the scan is presence-on-disk; measured 120 on disk / 120 tracked / 0 untracked |
| other moving refs (branch, tag, `ORIG_HEAD`, `MERGE_HEAD`, `FETCH_HEAD`) | **no, disclosed** | named in the header's cannot-see list |
| a count with no provenance at all | **no, disclosed** | named; this is why the `ok —` claim was reworded |
| a named commit that is the WRONG commit | **no, disclosed** | naming a commit is necessary, not sufficient |
| files outside scope (`ledger.md`, `plan.md`, older lanes) | **no, disclosed** | `ledger.md:7091` recorded known-open (D-018) |

**The `@` row is a defect, not a disclosed limitation.** `MOVING_REV` explicitly lists `@` as a moving
revision and it matches when tested alone — but the composed command arm never fires for it, because of a
trailing `\b`: after `@` comes a space or a colon, both non-word, so no word boundary exists. Measured:

    $ git ls-tree -r --name-only @ .scratch | wc -l   -> 280   NOT FLAGGED
    AT   -> null  raw@matches: ["@"]        # declared, and dead
    HEAD -> ["git ls-tree -r --name-only HEAD"]  raw@matches: ["HEAD"]

**An arm the code claims to cover and cannot is the same defect shape as every previous round in this slice —
a stated capability the mechanism does not have.** It is being repaired inside round 5's bounded repair, not
deferred to a new round.

**Verdict on the instrument: it now detects the class by structure rather than by example, and it states its
own boundary in the guard header where the build law requires it.** Two of the human's named items remain
open — the `@` arm (a bug, being fixed) and the working-tree count (a disclosed gap awaiting a ruling).
The remaining rows are disclosed exclusions with reasons, not silences.

## D-020 — ESCALATION: the `no-bare-head-count` specification is the wrong object (D-016 invoked)

**Round 5 came back NEEDS_CHANGES, and per D-016 the orchestrator did NOT start a sixth fix round.** The
reviewer was instructed to return the invariant / rule / missed-shape triple instead, and did. Verifier
`VERIFY: PASS`; reviewer `NEEDS_CHANGES`.

**(a) The invariant it encodes.** Every count in a report or brief must be attributable to a fixed, immutable
revision — a commit named by sha — because a count whose provenance is a *moving* revision (`HEAD`, `@`,
`HEAD~n`, `HEAD^n`, `HEAD@{…}`, the working tree, or any ref a push/fetch can move) cannot be reproduced by a
reader and moves under the very commit that carries the sentence.

**(b) The detection rule it implements.** One per-line regex over `.scratch/v28/{reports,briefs}/*.md`, ORing
three **lexical** arms — a number ≤4 words before `at <rev>`; `git <subcmd> … <moving rev>`; and
`git <one-of-eight-names> … | wc` — with every match counted into a per-`(file::matched-text)` baseline, and a
finding only when a file's running count exceeds the recorded one.

**(c) The shapes it missed — 15 measured, in one probe set invented for the purpose.**
- **Arm 3 is a hand-typed list of eight subcommand names, and is wrong in BOTH directions.** It misses four
  commands that genuinely resolve HEAD by saying nothing — `git show | wc -l` (327), `git reflog | wc -l` (281),
  `git blame <file> | wc -l` (55), `git annotate <file> | wc -l` (55) — and it fires on two that do not resolve
  HEAD at all: `git branch | wc -l`, `git stash | wc -l`. A structural arm cannot be wrong in both directions;
  a list can.
- **Arm 1 is a set of English phrasings, and a live member of the class escapes it.** `.scratch/v28/reports/slice-6b-fix-1.md:292`
  reads *"at HEAD the corpus reports 90 documents / 7 claims / 97 quotations"* — three counts whose stated
  provenance is bare HEAD. The guard returns **PASS** on a root holding that file alone. **This shape was
  already recorded one round earlier**, in `.scratch/v28/reports/slice-6c-fix-4.md:81`, and round 5's own ceiling
  list does not mention it. Round 5 widened the arm's *ref spellings* and left its *word order* untouched.
- **Arm 2 cannot see a global option or a quoted rev**: `git --no-pager log HEAD | wc -l`,
  `git -C <dir> show HEAD:p`, `git -c core.pager=cat show HEAD`, `git show "HEAD"`, `git rev-parse 'HEAD'`.

**Why this is a specification defect and not a builder defect.** Six rounds have each widened the instrument by
exactly the shapes the *previous review* measured. The invariant is **semantic**; the detector is **lexical**,
and no amount of widening makes a regex a decision procedure for a semantic predicate. Two independent signs
that the search is not converging: (i) the human's own standard contains a member the instrument deliberately
*cannot* enforce — the HEAD-versus-working-tree distinction, because enforcing it would fail every verify lane
and the guard's own `ls | wc -l` basis — so the specification contradicts itself; and (ii) rounds 4 and 5
disagreed about which dimension of arm 1 was incomplete, and round 5's ceiling list omitted the shape round 4
had already named.

**The contradiction, measured.** Recording the reviewer's report into `.scratch/v28/reports/` (as the batch
requires — lane evidence must persist) took the guard from **8 findings to 98**, because every report *about*
this class quotes the class. **The instrument's own evidence files are its red.** A rule whose baseline is
forward-only, over a corpus that must accumulate discussions of the rule, cannot converge.

**The three options — the human's ruling, not the orchestrator's.**
1. **Make the reporting form decidable.** Require counts in reports/briefs to carry provenance in a canonical,
   machine-checkable token (`N at <sha>`, or an explicit annotation), and make the rule about *that form*: a
   count without a canonical token fails; a token naming a sha is checkable with `git cat-file -e <sha>^{commit}`.
   **The only design under which "detects the class" is achievable rather than asymptotic.**
2. **Keep the detector, strike the overclaim.** Amend D-019 and the round-5 report to say plainly: a detector
   over named shapes with a declared ceiling; it does not detect the class. Every miss becomes a disclosed
   ceiling instead of an instance.
3. **Keep a human in the loop for the residue.** The lane's hunt caught the last six instances; leave the
   instrument as a cheap first-pass and the hunt as the enforcement.

**A sixth round is the wrong move** and would look like this: add `show|reflog|blame|annotate` to arm 3, add an
order alternative and a wider word class to arm 1, allow `--no-pager`/`-C`/quotes in arm 2 — after which arm 3
is *still* a list (any command can be absent), arm 1 *still* a phrase set (any phrasing can be absent), and the
round would again find a fresh instance of the class in its own report (it did, in rounds 1-6).

## D-021 — RULING: the reporting form is made decidable (closes D-020)

**Human ruling 2026-10-02, on the D-020 escalation. Two decisions:**

1. **Make the reporting form decidable.** Counts in reports and briefs must carry their provenance in a
   **canonical, machine-checkable token** — a commit sha — and the instrument must **verify** it. A token
   naming a sha is checkable with `git cat-file -e <sha>^{commit}`, so **"a wrong named commit" stops being a
   declared ceiling and becomes a finding.** This is the ruling that ends the widening treadmill: the class is
   made *decidable* rather than *hunted*. It is the only design under which "detects the class" is achievable
   rather than asymptotic (D-020's option 1).
2. **Absorb the red into a re-derived baseline.** The guard currently fails with **98 findings**, all in lane
   reports that *discuss* the class and therefore quote it. They are absorbed by a **re-derivation** — never by
   hand-adding a key — so the guard is green while this specification is implemented.

**What the ruling does NOT license.** It does not license weakening the rule to make it pass, and it does not
make the residue disappear: the *prose* half of the class (a count whose provenance is implied in a shape no
token carries) remains a lexical detector with a declared ceiling. The difference is that from here the
**canonical form is enforceable and verified**, and whatever remains is a named ceiling rather than an
open-ended hunt. The header must say which half is which — this is what `docs/agents/code-structure.md:121-127`
means by the header being the authoritative statement of scope.

**Also owed from the round-5 review, in the same change** (D-019's own artifacts asserted otherwise): the
false *"both were silently dropped by the same `\b`"* in `.scratch/v28/reports/slice-6c-fix-5.md:482`, a
behaviour check whose named failure mode is unreachable, and a pasted grep printing `0` where the command
returns `3`.

## D-022 — RECORDED, NOT FIXED: an unprobeable machine is ADMITTED (the `ocr` lane's critical find)

**Found by the `ocr` CLI lane** on the 6c delta, and **independently verified by the orchestrator** by reading
the code and by controlled execution. Factory infrastructure, **not** slice 6c — recorded here so it is a
decision rather than a silence, and deliberately **not fixed** while 6c is in flight.

**The defect.** `scripts/factory/scheduler.mjs:427-429`:

    const usable = available === null ? null : available - held
    if (usable !== null && required > usable) {   // ← short-circuits when the probe failed

When the RAM probe fails, `available` is `null`, so `usable` is `null`, the `usable !== null` guard
short-circuits, and **the RAM check is skipped entirely**. Admission then proceeds.

**Measured, controlled** (real `systemProbes`, only `availableRamGb` replaced; `admit(kind: 'builder')`):

    healthy machine (48 GB)   available=48    usable=48    required=7  -> ADMITTED
    honest low RAM (1 GB)     available=1     usable=1     required=7  -> BLOCKED_RESOURCE
    UNPROBEABLE MACHINE       available=null  usable=null  required=7  -> ADMITTED    ← THE BUG

**A machine with 1 GB is correctly refused; a machine whose RAM cannot be read at all is admitted.** This
**inverts the module's own stated contract** — *"a probe that fails returns null, and null is treated as
'unknown', never as 'fine'"* — and it re-opens precisely the over-admission that produced the four
`systemd-oomd` kills recorded in this batch. **The stricter the machine's unreadability, the weaker the gate.**

`ocr` reported the same shape for VRAM (`freeVramGb()` returning `null` lets a local model be selected whose
weights may not fit), which the orchestrator did not verify independently.

**Why this was missed.** Six rounds of agent review — reviewer, verifier, and the orchestrator — all read
`scheduler.mjs` and none found it. The `ocr` lane found it because it read the *code* against the *contract*,
not the *diff* against the *brief*. That is the argument for keeping a non-agentic lane, and it is the answer
to D-020's coverage question: **the lanes fail in different directions and neither is a substitute for the other.**

**Also recorded from the same `ocr` run (18 comments, unverified by the orchestrator beyond the two above):**
a bare `--reopen` flag parsed as boolean `true` and accepted as a valid re-open reason, defeating
`lane_reopen.requires_reason`; the acceptance lane not validated against `config.acceptance_states`, so it can
move out of a terminal state; `factory work init` with the id omitted writing `factory/work/undefined.json`;
`checkWorkItems` parsing each work file with an unguarded `JSON.parse`, so a malformed file kills the guard
instead of producing a named finding; and `checkAgentModels` always reading the machine-local
`~/.pi/agent/agents` regardless of `--root`, contradicting the checker's own hermeticity claim.
**`ocr`'s round 2 timed out (`context deadline exceeded`) and its findings are round-1 only** — the run is
partial and should be repeated on a narrower range.

## D-023 — the decidability half gets a forward-only absorber, and the property narrows in writing

**Ruling by the orchestrator 2026-10-02, on a builder escalation.** The round-6 repair made the guard green
everywhere except **two findings**, both on the sha-verification half, and re-derivation could not absorb them
because round 6 deliberately gave that half **no absorber** ("a re-derivation can absorb a historical bare-HEAD
label, never a broken sha") — a property the round-6 reviewer checked and endorsed.

The two lines are `slice-6c-fix-6-review.md:109` and `slice-6c-fix-6-verify.md:223`, and both are lane reports
**quoting a probe seed** (`"The tree held **412** tracked files at deadbee."  PASS`) to demonstrate that the
rule fires. **This is a use-mention distinction:** the class is about a report *using* a bogus sha as
provenance; these *mention* one. The HEAD half already absorbs exactly this case, and the human prescribed the
mechanic — **D-021 item 2**: *"all in lane reports that discuss the class and therefore quote it … absorbed by
a re-derivation, never by hand-adding a key."*

**Ruled: the sha half takes the same forward-only mechanic.** The baseline becomes `file::sha -> count` for
unresolvable tokens, the run prints the number of recorded records, and a **NEW** unresolvable sha — or a
second occurrence in the same file — is still a finding.

**The property narrows: "never a broken sha" becomes "never a NEW broken sha."** This is recorded, and required
to be stated in the guard header, in the report, and in the `ok —` claim, together with the reason. A narrowing
that is written down is a decision; a narrowing discovered later is a defect. **The round-6 reviewer's validated
property was deliberately narrowed here, and that is said out loud rather than left for a future reader to find.**

**Rejected alternatives.** *(B) leave it red as known-open* — a permanently red gate over two **quotation**
lines would teach the next reader that red is normal, which is worse than the narrowing and is the failure mode
this batch exists to prevent. *(C) rewrite the probe sha as a placeholder in the lane reports* — **forbidden**:
it retro-edits another lane's measurement record, which D-011 item 2 forbids; the builder proposed it and
advised against it, correctly.

**Mandatory proofs, required of the builder:** a new unresolvable sha in a fresh file fails; a second
occurrence in the same file fails; the B1 dressed-count seed and the B2 punctuation seed still fail (the
absorber must not eat the very findings the repair was for); and all 72 checks still exit 0 **with their
mutation proofs still flipping**.

**CORRECTION (orchestrator's own error, 2026-10-02).** This entry first required "the printed counter reads
2". It reads **10**, and the builder was right: the guard prints **occurrences**, and the absorber holds **2
keys** — `.scratch/v28/reports/slice-6c-fix-6-review.md::deadbee -> 9` and
`.scratch/v28/reports/slice-6c-fix-6-verify.md::deadbee -> 1`. The `2` was the count of FINDINGS (one reported
per file), which is not the same quantity as the occurrences absorbed. **The instruction was imprecise, not the
mechanism** — recorded rather than quietly dropped, because a stale number in a decision record is the exact
class this slice exists to kill, and this one was mine.

## D-024 — the completed `ocr` run: seven more, and one is the class again

**Recorded, not fixed** (the round-6 repair's lanes are running). The narrower `ocr` re-run finished cleanly
(no round-2 timeout) over `3920065..HEAD`: 2 files reviewed, 7 comments, 26 minutes.

**MEDIUM, all in `scripts/guards/factory-guard.mjs` — the guard the whole slice is about:**
- `:856` — `resolve(argv[repoFlag + 1])` **throws** when `--repo` is passed with no value (e.g. as the final
  argument): `argv[repoFlag + 1]` is `undefined`.
- `:863` — a **bare `catch` maps every failure to `false`**, including `ENOENT` when the `git` binary is
  absent. So a machine without `git` would report **every sha as unresolvable** — a false-finding generator of
  the same shape as D-022 (a failure to *measure* read as a *measurement result*). The two defects rhyme: the
  unprobeable machine was ADMITTED; an uncheckable sha would be CONDEMNED.
- `:577` — the counted-command matcher does **not implement what the header claims** for provenance position
  (b), "the revision of a counted git command". **A header/implementation disagreement** — which
  `docs/agents/code-structure.md:121-127` makes *the* defect, and which is the fourth time this batch has found
  it.

**LOW:** `:895` a NOTE claiming a lookup order it does not always walk (the same shape the round-6 review
already caught once); and on `factory-guard.check.mjs` — `:567` **Section 19 claims "Every case below is paired
with the mutation that reaches its failure mode", and the `wordClass` seed is not paired** (the vacuity class
again, inside the check file that exists to prevent it); `:686` `MUTANT_DIRS` holding a non-mutant scratch dir;
`:776` the `exit` cleanup handler registered *after* the checks run, so temp dirs are created before it is
installed.

**The pattern worth naming:** `ocr`'s two runs found defects of a kind the agent lanes did not — a crash path,
a failure-read-as-result, and an unpaired check whose section claims otherwise. The agent lanes found the
prose/class defects `ocr` is blind to. **Neither is a substitute for the other** (D-022 made the same point
from the other direction).

## D-025 — the recurring class, named at last: a stated capability the mechanism does not have

**Recorded 2026-10-02, after the seventh instance.** The round-6 repair review returned NEEDS_CHANGES on
**two header/implementation disagreements** and nothing else — and it reproduced every mechanism measurement as
correct. Its words: *"The MECHANISM is right… What fails is the HEADER, and it fails in the one way
`docs/agents/code-structure.md:121-127` calls the defect: the header still states a capability the mechanism
does not have."*

**Every round of this slice has failed on this one shape — never on behaviour:**

| round | the claim | the reality |
|---|---|---|
| 1-2 | a typed test count in a docstring | the count was stale / derived elsewhere |
| 3 (B1) | "went stale", "used to be" — no pointer | nothing a reader could check |
| 4 | a bare `HEAD` count label | 280 at the commit carrying the sentence is 281 |
| 5 | "both were silently dropped by the `\b`" | they were caught, with a truncated label |
| 6 (B1/B2) | the header accepts count dress; "either word order" | the token refused both |
| 6-repair (1) | "`@{…}` is matched by its own alternative" | the alternative was deleted in the same commit, and the same file says so at `:619-621` |
| 6-repair (2) | position (b) verifies "the revision of a counted git command" | a range endpoint escapes (`git diff 1c3471a..deadbee \| wc -l`) |

**The instrument for catching this class is currently a human-invoked review, not a guard.** Every instance was
found by the reviewer by hand, one round at a time — which is exactly the situation D-020 described for the
`HEAD` class before the human made the form decidable. **The same move is available here:** make the
*mechanism-vs-prose* relation decidable, so a header claim that names a concrete construct must be backed by
that construct.

**The proposed systemic fix (NOT built — the human said not to redesign the factory while 6c is in flight).**
Extend `instrument-headers-honest` from *count* claims to *mechanism* claims: a guard header that names a
regex construct — an alternative (`X is matched by its own alternative`), a lookahead, a subcommand list, a
character class — must have that construct present in the file's own source, or fail. This is mechanically
checkable in the narrow form that would have caught blocking 1 (the string `@\{…\}` named in prose, absent from
`MOVING_REV`) and in the form that would have caught several earlier rounds. It is **not** a decision procedure
for "the prose is true" — the same lexical/semantic limit D-020 identified applies — but it converts the
*cheapest, commonest* instance of the class into a machine check. **Queue it as a factory-hardening item after
6c closes, not now.**

## D-026 — ESCALATION (D-016 invoked a second time): the prose-repair instrument is not converging

**Verdicts: verifier `VERIFY: FAIL`, reviewer `NEEDS_CHANGES`. Both fail on the CLASS, not on behaviour.**
The verifier's own words: *"not on behaviour, and not on the two blocking sentences, which are now TRUTHFUL… It
fails on the pass's own purpose: **the class is not eliminated**."*

**The measured hit rate of the instrument we have been using.** The builder swept the whole header and all 74
check names and found **five**. The reviewer's independent sweep of the same two files found **four more** —
one **introduced by the sweep's own rewritten text**, two contradicted by the commit subject that claims they
were fixed. **5 found / 4 missed.** Seven rounds, eight instances, and the instrument that catches them is a
human reading prose.

**The invariant** (unchanged, and never the thing that failed): *every claim about the instrument — a header
sentence, a check name, a section comment, a written number, a pasted transcript — must be backed by the
mechanism it describes.*

**The detection rule today:** a human reading prose, once per round. **No machine rule covers it.**

**The missed shapes, measured this pass** (all in `scripts/guards/factory-guard.mjs` /
`factory-guard.check.mjs`):
1. a **construct named in prose but absent from the source** (the `@{…}` alternative — deleted in the same
   commit, and the same file contradicted itself 60 lines later);
2. **check-file prose is not read at all** — `instrument-headers-honest` scans only the *leading comment block*
   of `scripts/guards/*.mjs`, so check names and body comments are unguarded, and two of the four new instances
   are there;
3. a **written number that the artifact contradicts** (a "baseline is 4" and a "20" that the map and the run
   disagree with);
4. a **pasted transcript that does not reproduce** (the pass's R15 block);
5. a **check name left stating a formula the header had just abandoned** — the sibling was renamed, this one
   was not, in the same commit;
6. **"the only git call is `cat-file -e <sha>^{commit}`"** in the SCOPE block, against a real
   `git ls-files -z` at `:1272` that runs on every scan.

**The reviewer's judgement, which is the useful return:** *"another prose repair is not the right instrument
for the class — it is the right instrument for these six instances, and it should be the last one done this
way. D-025's proposed check is the correct move and needs to be broader than D-025 wrote it."* It names four
rule shapes: construct-presence, **check-file prose** (missing entirely), **prose-number-vs-artifact**, and
**transcript reproducibility**. The honest limit stands (D-020): no machine decides "the prose is true" — but
after seven rounds *"the burden of proof has moved to anyone proposing an eighth manual sweep."*

**Not doing anything further until the human rules.** No eighth sweep, no new round.

## D-027 — the machine check measured: it catches phrasings, not the class — and that is now DECLARED

**Verifier `VERIFY: PASS`; reviewer `NEEDS_CHANGES`, and the reviewer ruled the check the right SHAPE and said
to keep it.** The failing part is the DECLARATION, not the rules.

**The measurement, and it is the definitive statement of D-020's limit.** The reviewer constructed **eleven
fresh instances of the class** that the mechanism does not support and ran the committed guard against each.
**Eleven of eleven escaped** — exit 0, no finding. The reason is exact and now measured rather than argued:
each of the four rules is **keyed to one literal phrasing** —

| rule | its literal key |
|---|---|
| construct presence | `the only git call is`, `` `X` alternative `` |
| check-file prose | `resolvable pointer` / `makes the claim checkable` / `the line that shows it` |
| prose number vs artifact | `the baseline is N` |
| transcript reproducibility | the `badc0de`-style sha line |

— so a **restatement of the same shape in any other wording is invisible.** Escapes include a **check-NAME
capability claim**, a **body-comment wrong number**, and **pasted transcripts that do not reproduce** — three
shapes the second, third and fourth rules claim to cover.

**The review's own words: *"Not by itself a defect (D-020 allows a declared ceiling)."*** A lexical detector
over a semantic predicate is what D-020 said it could never be more than. The check is a **cheap literal-phrase
first pass**, and the enforcement for the residue remains the lane hunt.

**Ruling: fix the CLAIMS, not the rules — and do NOT add one phrasing per escape.** Adding coverage for each of
the eleven would be the treadmill the human ruled to stop (D-026), and the next paraphrase escapes anyway. The
deliverable is an honest declaration: each rule's literal key stated in the header, the residue named **with
its number** (11 constructed, 11 escaped, listed), and §1/§2's "covers the shape" claims corrected to "detects
the recorded phrasing". This is the ninth instance of the class in this slice, and it is closed the only way
that works — by lowering the claim to the mechanism, not by raising the mechanism to the claim.

## D-028 — the terminal method: where a claim cannot be kept true, DELETE it

**Ruled 2026-10-02 after the tenth instance of the class.** The pass that existed to correct under-declared
claims introduced two fresh ones — **a pointer at `factory-guard.mjs:1424` where the mechanism is at `:1446`,
and a "fourteen matcher constants" where the reproducible count is thirteen.** The second is the sharper
lesson: **it replaced a true number with a false one while asserting a measurement.**

**The evidence, over ten rounds:** the *mechanism* was verified correct every single time. Every failure was
prose *about* the mechanism, and eleven passes of writing that prose produced a fresh instance each time. So
the activity, not any individual sentence, is what fails.

**The ruling: where a claim cannot be made reproducible, DELETE THE CLAIM rather than restate it.**
1. A wrong pointer or a wrong number — **delete it**, do not correct it. A sentence that needs no line number
   cannot have a wrong one.
2. Where a number is load-bearing, make it reproducible or **drop the quantification**.
3. Where a referent is unclear (a true "26 of 90" whose 90 live in a different file), **name the file or delete
   the ratio** — a true number with a wrong referent is still a false claim.
4. **Do not add a sentence to explain a deleted one.** Net prose must SHRINK, and the shrink is reported as a
   measurement, not asserted.

**This is the terminal move of the slice, and it generalises past it.** A guard header's job is to tell a
reader what the instrument does; a *number* or a *line* in it is a claim that will rot the moment the code
moves, and every rot is a false statement. The durable form is fewer, coarser claims — which is also why the
guard's own header is the authoritative statement of scope (`code-structure.md:121-127`) rather than a report's
prose: it must stay small enough to stay true.

## D-029 — a constructor whose default output its own validator rejects

**Found live 2026-10-02** by slice 6d's builder returning **BLOCKED**: `npm run verify` exited 1 for a cause
*outside* the slice — five `lane-states-legal` findings on `factory/work/v28-r2-*.json`, measured identically at
the base commit. **The orchestrator had produced them minutes earlier by running `factory work init`.**

**The defect.** `newWorkItem` (`scripts/factory/state.mjs`) defaulted *every* lane — including `acceptance` — to
`pending`. But `factory-guard.mjs` reads each lane's legal set from a different table: work lanes from
`lane_states`, and **the acceptance lane from `acceptance_states` = `{blocked, pass, waived}`**, because
acceptance is the gate *over* the work and has its own vocabulary. `pending` is not in it. So
**`factory work init` produced a repo `npm run guards` called illegal — on every item, every time.**

**Why it went unnoticed until now:** slice 6c is the only pre-existing item, and its acceptance had already
reached a legal terminal state (`pass`) before the rule could see it. The defect was invisible until the
registry held an item that was *actually new*.

**Repair:** the constructor now emits `acceptance: { state: 'blocked' }` — the vocabulary's own "not yet
decided", which can only go to `pass` or `waived`. The five items are repaired (recorded in each item's own
history with the reason). A regression test mirrors the guard's rule against `realConfig`, and is
**mutation-proven**: restoring the old default makes it fail with
`expected ['blocked','pass','waived'] to include 'pending'`.

**Why this is D-025's class again, and worth a name of its own.** It is *a stated capability the mechanism does
not have* — here, "this tool creates a work item" while what it actually created was something the repo's own
gate rejects. The two agents and the guard had been pointed at **product** code for eleven rounds while the
instrument that *creates the record of the work* disagreed with the instrument that *checks it*. **A guard is
only as good as its coverage, and the orchestrator's own tooling was outside it.** Worth asking of every
generator in this repo: *does its default output satisfy its own validator?*

## D-030 — an empty measurement read as a clean result (a named class)

**Found 2026-10-02 as slice 6d review's B3, and recognised immediately as the third sighting.** The pattern is
not "a claim the mechanism does not support" (D-025) — it is sharper: **a measurement that did not happen, or
came back empty, being consumed as evidence of health.** A failure to measure, read as a measurement result.

| # | Where | The empty measurement | Read as |
|---|---|---|---|
| 1 | the scheduler's admission check (**D-022**) | a health probe that failed → `available === null` | **ADMITTED** — the `usable !== null` guard short-circuits, so *an unprobeable machine passes the RAM check the module exists to enforce* |
| 2 | the sha resolver's bare `catch` (**D-024**) | `git` absent → every lookup fails | **"unresolvable sha"** — on a machine without git, *every* sha would be condemned |
| 3 | the taxonomy guard's scan set (**B3**) | every label collapsed → `scanned words: 0 (none)` | **PASS** — rule 3 never ran, rule 4 matched nothing, and the guard's own header says *"an instrument that matches nothing looks exactly like a clean repo"* — **which is the precise state it just passed in** |
| 4 | the SAME guard, one granularity down (**B2b**, found by the round-1 fix review) | only the *declared* kinds collapsed → `scanned words: 6`, three `limit——` lines saying rule 3 checks nothing | **PASS, exit 0** — and the round-1 check *required* that exit to be 0, so the instrument **pinned the class green while fixing it** |

**Instance 3 is the sharpest because the guard REFUTES ITSELF.** Its header names the exact failure mode, and
then its implementation commits it: there is no tripwire on the scan set, so a zero-word scan reports clean.

**Instance 4 is the one to remember.** The fix for instance 3 added a tripwire on *the whole scan set* and left
the next set — the declared kinds that rule 3 actually tests — with no tripwire at all. **The repair repeated
the class one level down, and shipped a check that asserted the repetition was correct.** That is the general
hazard: *an invariant declared at one granularity is a claim at every other granularity.* When you fix one of
these, the question to ask is not "is this set empty?" but **"which set did I just stop watching?"**

**The rule for every instrument in this repo, now written down:** **zero and `null` are findings, never passes.**
An instrument that scanned nothing, probed nothing, or resolved nothing has not established health — it has
established that it did not look. Whatever produced the empty set must be reported, and the run must fail.
This is the same invariant as the module's own stated contract (`null` is *unknown*, never *fine*) — the
scheduler inverted it (D-022), the sha resolver inverted it (D-024), and twice now the taxonomy guard has.

**Consequence for the hardening set:** D-022's one-line fix, D-024's cluster, and B3 are **one repair in three
places**, and B3 ships with the slice because it is a mechanism defect with a live refutation in its own header.

**Consequence for the hardening set:** D-022's one-line fix, D-024's cluster, and B3 are **one repair in three
places**, and B3 ships with the slice because it is a mechanism defect with a live refutation in its own header.

## D-031 — a repair that introduces a reachable escape while closing a smaller hole is a net regression

**Ruled 2026-10-02 at slice 8a's breaker, on the fifth and final review round.** Round 4 rewrote the
`transcript-summary-agrees` rule to close two real holes — an out-of-vocabulary count word silently skipping
the comparison, and a coverage number that was wrong in both directions. It closed both. **It also created a
worse one.**

**What it created, measured by two independent lanes:**

- **A reachable escape.** To stop the rule's tripwire firing on 8 legitimate labels in `briefs/` (where a label
  introduces a blockquote), it **exempted quotation-introduced labels**. A fabricated transcript then escapes by
  **prefixing `>`**: the run prints `0 raw-labelled block(s) read … NOTHING was checked` and **PASS, exit 0**.
  An independent reviewer reached the same state three ways, and **in a root holding one agreeing block the guard
  PUBLISHES ITS CLAIM** over the fabrication. The exemption's *price* was declared; its *reachability* is the
  defect.
- **Coverage loss.** The label form narrowed to "the line ends with the token", so live blocks went 11 → 8 — but
  the diff is **5 kept / 6 dropped / 3 gained**, and **three of the six dropped are genuine raw-labelled blocks**
  the previous form read. "The exact defect written in that intro style is caught pre-fix and missed by the
  current guard."
- **And the exempted set is unwatched** — a new code path in the same commit, with no seed, no mutation and no
  control, while the round's own report claimed seed+mutation+control for every new path. *Which set did I just
  stop watching?* (D-030.)

**The ruling, and why it is not another patch.** The guard suite already owns a slice — **8b** — and already
holds three registered `checked=0` paths. These findings are guard internals; **consolidating them there is one
coherent change, where a sixth patch inside a product slice is a third attempt at the same rule in three rounds.**
So: **every open finding on this rule is adjudicated to 8b, enumerated rather than summarised — not re-registered
as a note, but FIXED there.** 8a closes on its product work, which five rounds verified.

**The lesson, which generalises past guards:** a repair is not judged by what it closes. **A repair that trades a
small hole for a reachable escape has made the instrument less trustworthy, and the honest response is to take it
back to its last reviewed-good form and do the work in the slice that owns it — not to add a fourth condition to a
rule that has already been wrong in three different ways.** This is the same shape as D-028 (when the same thing
is the finding for the third time, stop correcting it) applied to a MECHANISM instead of a sentence.

## D-032 — when the same rule opens a new escape on each of three fixes, the rule is the wrong object

**Ruled 2026-10-02 at slice 8b, one round after D-031, on the same rule.** D-031 said a repair that trades a
small hole for a reachable escape is a net regression. **This rule has now done exactly that twice more.**

| attempt | what it did | what it cost |
|---|---|---|
| 8a round 3 | the rule, as first written | worked — **it caught the live fabricated transcript** |
| 8a round 4 | closed two real holes | **opened a reachable escape** — a fabricator prefixed `>` and the exemption let it pass |
| 8b | closed that escape **by deletion**, as D-031's method required | **opened a new reachable escape with the identical signature** — the blockquote region arm **steals the label from the fence the label actually introduces**, so a `raw:` label, a blank line, a blockquote line, a blank line, then the fence passes at exit 0 |

**The diagnosis, and it is structural, not another defect.** Every form of this rule requires **attributing a
label to a block**, and attribution is a *parsing* problem being solved by regex. **Any rule that needs the
attribution can be evaded by breaking the association** — which is precisely what both escapes did. Fixing the
association moves the hole; it does not close it.

**Therefore the ruling: the rule's shape changes, not its conditions.**

- **Check EVERY fenced block. Attribute nothing.** A `✓ A–B` line and a stated count on the same line, inside a
  fenced block, must agree — whoever wrote the block and whatever precedes it. There is no association to break,
  so there is **no escape of this family left to find**.
- **The price changes from a hole into a cost, and costs are allowed.** A report that *quotes* a bad block will
  fire. That is a **cost**, declared and paid in the report — where the old exemption was a **hole**, undeclared
  until a reviewer found it. **A declared cost beats an undeclared escape**, and any future exemption for quoted
  content must itself ship a seed and a mutation, which is exactly what the last one lacked.
- **This is the last attempt on this rule.** If this shape opens a hole of the same family, the rule is **deleted
  and the defect recorded as known-open** — because a guard that has been wrong in four ways is worse than no
  guard: it teaches that a green run means something it does not.

**The general law, and it outranks the rule:** **a heuristic that has to guess at structure will keep moving its
hole until it stops guessing.** D-020 found this in a *semantic-vs-lexical* mismatch; this is the same lesson
one level down — a rule that must infer an association it cannot see should be **re-scoped to what it can
observe**, even at the price of firing on things it would rather not.

## D-033 — a declared cost must be PAYABLE, and the payable form is a record, not a syntax

**Ruled 2026-10-02 at slice 8b, immediately after D-032 was executed successfully.** D-032 chose a **declared cost**
over an exemption: *check every fenced block, attribute nothing, and accept that a block quoting a bad transcript
now fires.* The rule was rebuilt that way by deletion, and proved — **eleven escape attempts, all caught.**

**Then the cost came due, and it cannot be paid:**
- the rule fires on two LANE REPORTS (`.scratch/v28/reports/slice-8a-verify-5.md:37`, `slice-8b-review.md:89`) —
- **because those reports QUOTE the fabricated block to prove the fix**, which they must;
- and **hand-editing another lane's report is forbidden** (D-011 item 2 / D-021 item 2).

So a rule whose cost falls on the repo's own evidence trail **reddens the gate permanently** — and a permanently
red gate is not a cost, it is a broken instrument. **A declared cost that cannot be paid is just a hole with
better manners.**

**The ruling — and the distinction that makes it safe.** The exemption D-032 removed was **a SYNTAX a fabricator
can write**: any block prefixed `>` was exempt, so the content itself chose whether the rule looked. **That is
forgeable by the very thing the rule is meant to catch.** A **recorded baseline** is not forgeable **by content**:
it is a map of `file::matched-text → count`, committed in the guard, and **the text alone cannot manufacture a
baselined citation.** *That is the limit of it — the key names a PATH, and a path is writable, which the correction
below measures. **A sentence that used to stand here claimed the record was "unforgeable" and that a fabricator
"would have to edit the guard"; it was measured FALSE and deleted for that reason rather than softened.***

**So `transcript-summary-agrees` gets the same absorber every other rule in this suite uses:**
1. **A recorded baseline** of known quotation sites, **re-derived, never hand-added**, printing its size on every
   run and shrinking only by re-derivation — exactly `no-bare-head-count`'s established form.
2. **Not forgeable BY CONTENT:** a *new path* quoting the *same* text still **FIRE**s, and a *second* occurrence at
   a recorded path still fires. Both are seeded and mutation-proven. **This is the WHOLE of it — see the correction
   below for the boundary it does not cross.**

**CORRECTION, ruled at 8b's round-2 review — the sentence above promised more than the mechanism keeps.** The
first draft of this ruling said the record was "unforgeable" and that "a fabricator cannot produce a baselined
citation from a report". **Measured, it can: the key names a PATH, and a path is writable.** A report that
**reuses a recorded path** and carries the recorded text up to its recorded count **is absorbed** — the record
cannot tell that report's quotation from a fabrication that copied the citation. What the record buys is
narrower and still worth having: **you cannot reach a pass by writing a NEW file, and you cannot add a second
occurrence to a recorded one.** The boundary is declared in the rule's own docblock, header and ceiling list.

**The ruling stands; its reach did not.** That distinction is the point: **D-033's decision — use a record, not a
syntax — is right and verified; the claim about how far it reaches was an over-claim of exactly the class this
batch spent 6c on, and the repair was the sentence, not new machinery.**

**And the same rung applies to the OTHER two baselines in this suite** — ruled one round later at 8b's round-3
review (BLK3): `UNRESOLVABLE_SHA_BASELINE` still kept the 0-of-0 state, passing while publishing its claim over an
empty record, while the other two had been fixed. **A rung is a SHARED FORM over every baseline of the family, not
a third hand-written `if`** — the fix is one form, one check each.
3. **The indented-code boundary is declared, not implied:** this rule reads **fenced** blocks; an indented code
   block is outside its scan set. That is a scope boundary and must be stated where the rule states its scope —
   and it is why a lane report can also clear a quotation by indenting it, at the cost of no longer being a
   fenced block.

**The general law:** *a rule may not impose a cost that its own evidence trail cannot pay.* Where a defect must be
quoted to be reported, the instrument needs **a record of what it has already seen** — not a rule about what the
quotation looks like. **This is the third form of the same lesson in three rulings: D-028 (stop correcting the
sentence), D-030 (zero is a finding), D-032 (stop guessing at structure), and now D-033 (do not charge the
evidence trail). Every one of them is the same move: put the judgement where it can be checked.**

## D-034 — independence is FAMILY independence, and it is bought by registering a model, never by raising a value

**Done 2026-10-02, on the human's instruction ("I'll register a second model").** D-007/D-008 measured the hole:
the reviewer/verifier floor (`reasoning 3` + `tool_use 3`) was cleared by **exactly one registered model**, which
was also the implementer, so **`same_model: false` was unsatisfiable by construction** and every review this batch
received was a **sibling** — disclosed in every lane, and never a substitute for independence.

**Registered: `ollama-cloud/glm-5.3`** — and the choice is the point. **Not another DeepSeek.** A second size of the
same family is a *different model* and not a *different mind*; the builder is DeepSeek, so a DeepSeek reviewer
would have satisfied the letter of the rule and none of its purpose. **GLM is a different family, so this is
diversity of the kind D-015 said the rule was groping toward.**

**Every declared number carries its source, and the three kinds of source are kept distinct:**
- **`tool_use` — VERIFIED EMPIRICALLY, not assumed.** A tool-call round trip against `https://ollama.com/v1`
  returned **HTTP 200 in 2099 ms** with a correct `tool_calls` payload. **A capability declared for a model that
  cannot tool-call would be this batch's own class**, so the one axis a reviewer's floor actually turns on was
  measured before registration rather than after.
- **`context_window` — READ from the model's own metadata** (`glm_dsa_moe.context_length = 1048576` via
  `/api/show`), not typed.
- **`reasoning` and `coding` — DECLARED POLICY** from the model's class, **explicitly NOT benchmarked here** and
  labelled as declarations in `_capability_source`. *Capability levels are declared policy, not a benchmark* —
  the field exists so a reader can tell which is which.

**And the gap note was itself a claim that went false the moment the second model existed.** It said the floor was
"cleared by EXACTLY ONE registered model" — true when written, false one commit later. It now records the
**resolution**, and the original measurement survives in D-007/D-008. **A note about a gap is a claim like any
other, and it expires with the gap.**

**D-034 addendum — TWO registries, and one of them needs a reload.** A model must be registered in **both** places to be usable by a lane, and they are separate files with separate lifecycles:
- **`factory/config.json`** — the factory's registry: routing, capability floors, cost tiers, residency, health. This is what `route`, `admit` and the guards read. **Registered there: done, guard green.**
- **`~/.pi/agent/models.json`** — Pi's own registry, which is what a **subagent** needs. The model id was added there and enriched with only sourced fields (`contextWindow` 1048576 read from the model's metadata, `input: ["text"]`, `reasoning: true`); a backup of the previous file was taken first.

**Measured, and worth knowing before anyone repeats this:** `pi --list-models` in a **fresh process** sees it (`ollama-cloud  glm-5.3  1.0M  thinking yes`), but the **running session's registry was loaded at startup and does not reload** — a subagent spawned in this session reports `Unknown subagent model`. **So a model registered mid-session is usable by the NEXT session, not the current one.** That is a fact about the harness, not a defect in the registration, and it is the kind of thing that otherwise gets discovered as a mystery.

**And it did not block the work:** Pi already knew `ollama/glm-5.3-flash:cloud` — **also GLM, also a different family from the DeepSeek builder** — so the first genuinely independent review of this batch was dispatched on that model immediately rather than waiting for a reload. *The independence was available; it took looking for the route rather than assuming the missing one.*

## D-035 — the family-independent reviewer found what four siblings could not, three hours after it was bought

**D-034 registered a GLM because the reviewer floor had exactly one qualifier, which was also the implementer.**
The first review that model ever ran **falsified the rule four sibling reviews had called sound** — not a
disagreement about taste, a **reachable escape**:

**The fifth shape: the fence parser is not CommonMark, and three sentences say it is.** `factory-guard.mjs:1751-1758`
closed a fenced block on **any** same-kind marker line — **no length check, no nothing-after check.** CommonMark
closes only on a run of the same character **≥ the opener's length** followed by **only whitespace**. So an inner
```js **wrongly closes** an outer ``` block, and the standard markdown idiom for **quoting a fenced block** puts
the inner content in **no parsed block at all**: `2 fenced block(s) read, 0 range summaries checked — NOTHING was
compared` → **exit 0, PASS.** Same signature D-031 and D-032 were built to close, and it falsified the header
(`:91-95`), the docblock (`:1629-1632`), and the parser comment that says **"as markdown says"** (`:1745-1749`).

**Why this is a ruling and not just a bug report.** D-032 said the next hole of that family would mean **deleting
the rule**, and this round's authorisation turns on a distinction that is worth keeping: **every previous attempt
guessed at a SHAPE; this one conforms to a SPECIFICATION.** CommonMark's fence rules are closed and have reference
implementations, so the fix is decidable and checkable against a real parser (`marked`) — **a fix with a spec is not
a blind fix round.** The rule's shape is untouched (check every fenced block, attribute nothing, which the reviewer
confirmed is sound); **the PARSER was wrong, one level down.** *And the escape was not reachable in the live corpus
— latent, found by construction, which is the only reason a fifth round was affordable.*

**The measured lesson, and the reason to keep paying for family diversity: four fresh-context siblings and one
different family looked at the same code, and the siblings converged. A shared blind spot is not a shared
verdict — it is one verdict counted four times.** Fresh context buys independence from *context*; it does not buy
independence from *prior*. The floor now has two qualifiers and they are different families **on purpose.**

## D-036 — the corpus paradox has a second face: an UNTRACKED lane report

**D-020 measured that a lane's own evidence file can become the next lane's red.** The guard's scan set is
deliberately the top-level `*.md` of `.scratch/v28/reports` (`:1671`), so this was known and accepted.

**What was not known: the red can arrive from a file at NO COMMIT AT ALL.** The guard now reports **8 findings
against two review reports** — `slice-8b-review-4.md` and `slice-8b-review-independent.md` — every one of them a
count written **"at HEAD"** when the reviewer meant "at the tip I reviewed", while HEAD **moved underneath both
lanes during the run** (the verifier says so in its own report: `7c16e7a` → `4b2939c` → `05a264c`). **The guard is
right and the text is wrong:** a count at bare HEAD cannot be reproduced, which is what the rule exists to say.
**Measured separation: move only those two files aside and the guard exits 0 — so all 8 are theirs and nothing
else; the CHECKER's red is independent and survives, because it is D-034's damage to check 13's seed.**

**The reporting-form rule, stated so the next lane does not have to rediscover it:** **a lane report names the
commit it measured at.** `at HEAD` is not a provenance token. The lanes' reports are not the orchestrator's to
write, so these 8 are recorded **known-open with file:line** rather than edited or absorbed — **absorbing them into
the `no-bare-head-count` baseline would be re-deriving a record to silence a true finding, which D-027 forbids: you
lower the claim, you never widen the mechanism.**

## D-037 — the fence-parser stop condition, sharpened by the independent reviewer

**The hard stop was mine; the reviewer that found the fifth shape improved it, and its sharpenings are adopted
verbatim because each one is a failure mode I would have hit.** The stop: *this is the last repair to the fence
parser; a SEVENTH fence-closure divergence triggers D-032 and the RULE IS DELETED, recorded known-open, never
silent.* Four sharpenings:

1. **The stop fires on a PROSE narrowing too.** *"A fifth rewrite of the same sentence with the parser still
   divergent is not a repair, it is the ladder finding arriving on schedule."* — **A repair attempt is an attempt
   whether it touches the parser or the sentence about the parser.** Otherwise the stop is evadable by rewording.
2. **The oracle is the REFERENCE'S BEHAVIOUR, not anyone's reading of the spec.** Run the reference over the
   checker's seeds and the reviewer's constructions; **if the references agree with each other and the guard still
   parses differently, the trigger fires.** *Where the references disagree among themselves that is an ORACLE BUG,
   not a seventh divergence — shrink the seed to where they agree rather than adjudicating by prose.* **A stop
   condition decided by argument is not a stop condition.**
3. **UNDER-read only.** Every one of the six shapes is *a reference-fenced line the guard DROPS*. An **over-read**
   — the declared indented-opener boundary, already priced in the ceiling — **must not trip the stop, or it fires
   on day one from our own declared boundary.**
4. **Constructible counts; latency does not exempt.** Shapes 5 and 6 were both **latent on the live corpus** when
   found. *Latency is what makes a repair AFFORDABLE; it is never what DEFINES the trigger.* If only live
   divergences could fire it, the ceiling would re-open the same `NOTHING was compared` signature every third round.

## D-038 — the rung BELOW the stop: hand the parser the reference's fence recognition

**The reviewer's amendment, recorded because it is a better structural answer than the stop.** If the next
divergence appears against a **hand-written** parser, the move is **not** deletion and **not** a seventh clause: it
is to **stop hand-writing the parser and take the reference's fence recognition** — import `marked` or **vendor its
fence scanner (~15 lines)**. Then the seventh divergence is **structurally impossible rather than merely
forbidden.**

**Why the trade-off is real and must be decided with the fixture in hand:**
- **A dependency is a supply-chain surface AND a meaning risk** — a `marked` major bump could parse differently and
  thereby **shift the guard's scope silently**, which is the exact failure this suite exists to prevent.
- **Vendoring avoids that** but puts borrowed code in the guard — which is what **`docs/agents/borrowed-guards.md`
  exists for**: provenance, what was taken and refused, and the four tests.
- **The reference-derived fixture required this round is the instrument that makes the swap provable** — a swap
  demonstrated behaviour-preserving against a fixture whose expectations came from the reference is a one-call
  derivation, not a transcription.

**And deletion is not free, which is why the rung sits BELOW the stop rather than replacing it:** deleting
`transcript-summary-agrees` stops watching fenced fabricated-count arithmetic — **a class that paid off once for
real.** So: **the rung is taken before the delete, and if the rung is skipped and a divergence recurs anyway, D-032's
terminal clause fires — delete, record known-open, never silent.**

## D-039 — the seventh divergence fired, and the rung was taken instead of the delete

**Adjudicated at 8b round 6, on two lanes that converged again.** The verifier and the independent reviewer,
working separately, both falsified the same sentence — and the reviewer found a **seventh fence-closure
divergence**:

**`factory-guard.mjs:1766`** — the marker regex ends `(.*)$` and nothing normalizes `\r`, so **in a CRLF file NO
fence is recognized at all.** In a mixed scan (one LF report gives the scan a real block) the D-030 empty-set
tripwire stays **silent** and a reference-fenced fabricated transcript **passes at exit 0**. Both references agree,
the corpus is all-LF, and **D-037 §4 says latency does not exempt.**

**And the same round falsified the sentence both lanes had been told to trust:** `:1671-1673` priced the opener
over-read as *"recognising more openers reads MORE, which is the safe direction."* **Both lanes measured it false by
construction** — an indented opener followed by a bare same-kind line **consumes the next fence's opener as its
closer**, and a reference-fenced fabricated line lands in **no guard block**: `0 range summaries checked`, PASS,
exit 0. 98 of 30 172 fuzz drops, **all opener-rooted, zero with conformant openers.**

**So D-032/D-037 fired, and D-038's rung is what fires instead of the delete.** D-038 placed the rung **below** the
stop deliberately: *"the rung is taken before the delete."* **Three rounds of clause-patching have now produced a
divergence in the CLOSER (indentation, `\r` suffix) and a divergence in the OPENER (the over-read). The hand-written
parser is the defect, not any single clause of it.** The rung: **share ONE fence scanner between the guard and the
fixture, derived from the reference**, vendored with provenance under `docs/agents/borrowed-guards.md` — **not a
dependency**, because a guard that changes meaning when a package bumps is the exact failure this suite exists to
prevent.

**Why the rung is decidable and not another guess:** the round-6 verifier re-ran the derivation and got a
**byte-identical** table (26 cases, 0 reference-vs-reference disagreements), proved the table **fails when
corrupted**, and proved the `new Function` anchor seam **throws rather than silently lifting nothing**. **The
instrument that judges the swap is already built and already trusted.**

**THE HARD LIMIT, recorded so it is a rule rather than an intention:** *if a divergence still appears AFTER the
rung, it is not patched — the rule is deleted and the defect recorded known-open.* Deletion is not free (it stops
watching fenced fabricated-count arithmetic, a class that paid off once for real), which is why the rung is tried
first and the delete comes second — **never the reverse, and never silently.**
