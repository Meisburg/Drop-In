# The factory — resources, routing, and work state

Read this **before dispatching any lane, and any time a lane is blocked.**

The orchestrator decides **what** must happen, **why**, what evidence is
required, and what depends on what. It does **not** decide whether a 55 GB local
model can coexist with the gate run it is about to trigger. That decision has a
mechanism now, and the mechanism is not a language model.

**The registry is the numbers; the CLI is the decision.** Nothing in this file
restates either — `factory/config.json` is the record, and the commands below
read it.

## Why this exists

The constraint was always known and always written down in prose, and it was
re-derived from scratch on every dispatch by an agent thinking about something
else. Measured cost on 2026-10-02: `systemd-oomd killed 58 process(es) in this
unit` four times (12:13, 13:12, 16:21, 04:56). The last one killed a builder
mid-slice. A prose warning is not a mechanism.

## The two halves

| | decides | lives in |
|---|---|---|
| **orchestrator** | what / why / evidence / dependencies | the briefs, `plan.md`, the batch ledger |
| **scheduler** | where / when / how, and *whether it may start* | `factory/config.json` + `scripts/factory/factory.mjs` |

The orchestrator never reasons about RAM. It asks.

```bash
node scripts/factory/factory.mjs doctor          # the picture, and what each kind would do now
node scripts/factory/factory.mjs route builder    # capability + resources + independence -> a model
node scripts/factory/factory.mjs admit verifier --id <work-id>-verify
node scripts/factory/factory.mjs run gate --id <work-id>-gate -- npm run verify
```

`admit` is admission control: it exits **3** with `BLOCKED_RESOURCE` rather than
starting work that cannot coexist, and it prints the arithmetic plus the command
that would unblock it. `run` is the same decision wrapped around execution, so
the check cannot be forgotten by a caller in a hurry.

**What the block looks like, from the real logs** — the state at 04:56, when a
builder died:

```
RAM: needs 7 GB (task 3 + reserve 4), usable 5 GB (available 5 - promised 0)
reclaimable: strata-max/qwen3.8-flash-next-iq3_s (55 GB) — systemctl --user stop strata-max
```

Two things are load-bearing there. The model is **not charged twice** when it is
already resident — its memory is already inside `MemAvailable` — and the reason
names what to free instead of leaving the reader to work it out.

## Capability routing, not role routing

A task kind declares a **capability floor**; the router picks any model that
clears it, is admissible, and satisfies the independence policy. Cloud versus
local is an implementation detail: `cost_tier` ascending breaks ties, and a
cloud result is reported as `fallback: true`.

**A fallback is a scheduling outcome, not an incident.** It goes in the
telemetry log. It is not a ledger entry and not an escalation — the ledger holds
decisions.

## Independence is a property, not a geography

The reviewer must sit on an **independent reasoning path** from the implementer.
That is expressed as `same_model: false` and `same_run: false`, and enforced by
excluding the implementer's model **by name**:

```bash
node scripts/factory/factory.mjs route reviewer --independence-of <work-id>
```

Local-versus-cloud is one way to satisfy it and no longer the rule. `ocr` is the
opposite case and is declared as such: it is structurally independent — its own
scaffolding, its own rule resolution — so it does **not** need model diversity.

## Work state is an artifact, and the worker is disposable

`factory/work/<id>.json`, one file per work item, is the state of the work.
Lanes are `implementation`, `verification`, `review`, `visual_validation`,
`acceptance`, and the legal transitions are in the registry. Two rules carry the
weight:

- **`complete` is terminal.** Evidence does not un-exist.
- **Acceptance cannot pass while a required lane is not complete.** The CLI
  refuses it and the guard re-checks it, so the gate cannot be talked past.

A worker that dies mid-slice is replaceable because none of that state was ever
inside the worker.

## State is not telemetry

| | what it answers | where |
|---|---|---|
| **work state** | what is true about the work | `factory/work/` — tracked |
| **decision log** | why a decision was made | the batch ledger — tracked |
| **run log** | what happened during an execution | `factory/logs/runs.jsonl` — gitignored |
| **telemetry** | what resources were consumed or unavailable | `factory/logs/telemetry.jsonl` — gitignored |
| **artifacts** | what outputs exist | named by the work item; the guard checks they are on disk |

Only the first two are record. The logs are exhaust — nothing decides from them.

## What is enforced by machine

`scripts/guards/factory-guard.mjs` runs inside `npm run verify`. It checks that
every model and task kind declares where its number came from, that every
capability floor is meetable, that no work item sits in an unreachable state,
that acceptance is not green early, and that **every artifact a work item names
is on disk**. Its own behavior check seeds each failure shape and requires the
guard to fire, because a guard that matches nothing looks exactly like a clean
repo.

## Limitations, named rather than glossed

- **Remote endpoints are not probed.** `fr-1` over the tailnet is treated as
  available because nothing checks. Only local services are measured.
- **Capability levels are declared policy, not a benchmark.** They live in the
  registry with that written next to them.
- **Two models are registered with no measured footprint**, and a null footprint
  is **inadmissible** — the registry refuses to guess rather than admitting work
  on an invented number.
- **The 55 GB and 30 GB figures are today's.** They come from the unit's own
  banner and from `nvidia-smi`, both cited in the registry; a model swap makes
  them stale.
- **Concurrency is only as good as the footprints.** The scheduler will run two
  tasks at once when their declared footprints and exclusive resources permit
  it; an under-declared footprint defeats that.
