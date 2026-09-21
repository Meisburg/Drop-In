# Task State

> The system of record. The orchestrator updates this after every phase
> transition. Subagent chat contexts are ephemeral — this file is not. Any
> agent resuming work must reconstruct state from here, not from chat.

## Current position

- **Phase:** intake | research | planning | implementing | reviewing | verifying | blocked | done
- **Active slice:** <slice number/name or "none">
- **Next action:** <one line>

## Slices

| Slice | State | Gate | Tokens | Evidence | Notes |
|---|---|---|---|---|---|
| 1 | pending / done / blocked | PASS/FAIL | ~Nk | <review verdict, verification output pointer> | |
| 2 | pending | | | | |

> **Tokens** = the builder's peak context for that slice (from `/context` or the
> session log). Record it every slice: it is the only way slice sizing becomes
> empirical instead of a guess. Budget is one local builder window (~98k); a
> slice that runs near the ceiling was mis-sized and should split next time.

## Phase boundaries

One line per slice, recording the explicit continue / clear / compact decision.
The default is **clear** — durable state lives in plan.md, this file, the ledger,
and the commit.

    Slice N: phase boundary — CLEAR (durable: plan.md S-N, task-state.md, commit <sha7>)

## Open risks

- <risk, owner>

## Decisions log

- <date> — <decision and who made it>

## Escalations (waiting on human)

- <question, asked <date>, blocks slice N>