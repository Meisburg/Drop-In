# Task State

> The system of record. The orchestrator updates this after every phase
> transition. Subagent chat contexts are ephemeral — this file is not. Any
> agent resuming work must reconstruct state from here, not from chat.

## Current position

- **Phase:** intake | research | planning | implementing | reviewing | verifying | blocked | done
- **Active slice:** <slice number/name or "none">
- **Next action:** <one line>

## Slices

| Slice | State | Evidence | Notes |
|---|---|---|---|
| 1 | pending / done / blocked | <review verdict, verification output pointer> | |
| 2 | pending | | |

## Open risks

- <risk, owner>

## Decisions log

- <date> — <decision and who made it>

## Escalations (waiting on human)

- <question, asked <date>, blocks slice N>