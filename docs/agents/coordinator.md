# Coordinator role (this DeepSeek Harness session)

Read this **when acting as the human-facing coordinator in a DSH session** —
routing slices, dispatching subagents, applying migrations, or handing off.

Slice coding happens here via DSH subagents (spawned with the `subagent` tool),
not in a separate terminal multiplexer pane. The coordinator routes work, verifies
output, runs the Supabase DB apply (browser-use/CDP), and routes the next slice —
all within this session.

## Subagent access (dev work = DSH subagents)

- `subagent` — spawn a focused child agent for ONE bounded task (a slice, a
  review, an analysis). The child returns a structured report; inspect it plus
  the files before accepting.
- `subagent_fork` — inherit this conversation's context into a child when the
  task builds on what was just discussed.
- Both run in the background by default; collect results via the runtime notice
  or `job_output`. Steer a running child with `send_message`; stop it with
  `interrupt_agent`.
- Give each subagent ONE bounded outcome: working dir, context (point at
  `plan.md` / `task-state.md` — never paste chat), the deliverable, how it's
  checked, what it may change, what it must NOT touch.

## The coordinator loop (per slice)

1. Spawn a builder subagent with ONE bounded outcome: working dir, context
   (point at `plan.md` / `task-state.md` — never paste chat), the deliverable,
   how it's checked, what it may change, what it must NOT touch.
2. Collect its report when the runtime settles it. Do NOT accept a completion
   message alone: re-run the real checks (`npm run verify`) and inspect the diff
   / artifacts.
3. Once code is green, THIS session applies the new Supabase migrations via
   browser-use/CDP (task-state.md tooling note + `scripts/cdp-migration-tooling.sh`)
   and runs the live check.
4. After the ship + live check, run the Jev fresh-eyes QA lane
   (`bash scripts/qa-jev.sh`; tooling note in task-state.md) and record its
   verdict in `task-state.md` — a non-zero verdict is surfaced, never decided.
5. Route the next slice to a fresh subagent.
6. Bring the human in for judgment calls, BLOCKED states, or anything touching
   production. Otherwise work back and forth autonomously.

## Phase boundaries: continue, clear, or compact

At the end of every slice, decide **explicitly** what happens to the session
context, and write the decision in the ledger. The durable state lives outside
the context window — `plan.md`, `task-state.md`, the ledger, the slice's commit,
and the verification evidence — so the default is to **clear**:

    Slice N: phase boundary — CLEAR (durable: plan.md S-N, task-state.md, commit <sha7>)

| Choose | When |
|---|---|
| **continue** | The next task needs the *reasoning* built up in this session and there is smart-zone budget left. |
| **clear** (default) | The next task can be reconstructed from plan + ledger + commits. Cheapest and fastest. When it is 50-50 between clear and compact, **choose clear**. |
| **compact** | The reasoning behind a decision is real context the files do NOT capture, and the session is out of budget. |

Budget: one slice ≈ one local builder context. The local model's window is
**~98k tokens** (`qwen3.8-27b`, `~/.dsh/settings.yaml`) — budget slices for that,
not for a frontier model's 150k+ smart zone. Record the observed tokens per slice
in `task-state.md` beside the gate result.

> **Do not let auto-compaction decide for you.** Compaction mid-phase loses the
> train of thought and the second half of a slice drifts from the first. If a
> session is auto-compacting, the slice was mis-sized — fix the sizing.

## Coordinator guardrails

- Factual disagreements settle via tests / verifiable evidence, not opinions;
  judgment calls go to the human.
- No publish, deploy, production, or sending sensitive data externally without
  explicit human authorization. End-of-slice git pushes to origin/master are
  automatic — see `docs/agents/auto-push.md`.
- One writer per slice (the active builder subagent) in this repo — no
  concurrent-writer worktrees needed. Release resources you created (e.g. the CDP
  Chrome) when done; preserve the human's existing work and undelivered
  artifacts.
- Finish with: what completed, verification evidence, anything unresolved, and
  any subagents/worktrees still retained.

## Fleet roles (org layer around this repo)

- Cora (@orchestrator) — routes feedback and goals, owns acceptance records.
- Pete (@builder-product) — clarifies goals into specs; restates the brief back
  in his own words before ticketing.
- Emily (@emily) — eng manager; converts user feedback into tickets ONLY after a
  reproduction exists (playtest evidence or unit repro).
- Einstein (@builder-dev) — implementation via DSH subagents; never edits product
  code outside a ticket.
- Pixel (@builder-design) — design review on UI tickets before build.
- Compass — runs the always-disagree check on any plan before it dispatches.
- Every batch: build → unit gate → playtest lane → review → push (auto-push rule),
  then real-user feedback re-enters through Emily.
