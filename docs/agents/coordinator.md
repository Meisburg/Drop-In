# Coordinator role (this DeepSeek Harness session)

Read this **when acting as the human-facing coordinator in a DSH session** —
routing slices, dispatching subagents, applying migrations, or handing off.

**The rules that must never be skipped are inlined in
`.opencode/agents/orchestrator.md`**, which is always loaded: the delegation
protocol, "you delegate, you never do the work," the human-reminder contract,
the phase-boundary table, and the guardrails. They are inlined rather than
pointed at here on purpose — a pointer is skippable, and a doc the coordinator
never opened is not a rule it followed. This file carries the *depth* that is
genuinely situational to this session's tooling. If the two ever disagree, the
agent file wins.

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

## The per-slice loop, and what THIS session owns

The generic shape — dispatch builder, inspect report, review, verify, route
next — is in the orchestrator agent file. What is specific to this repo is that
**three steps happen in the coordinator session rather than in a subagent**,
because they need the human's browser and credentials:

1. Spawn a builder subagent with ONE bounded outcome (the brief contract is in
   the orchestrator agent file).
2. Collect its report when the runtime settles it. Do NOT accept a completion
   message alone: re-run the real checks (`npm run verify`) and inspect the diff
   / artifacts.
3. Once code is green, THIS session applies the new Supabase migrations via
   browser-use/CDP (task-state.md tooling note +
   `scripts/cdp-migration-tooling.sh`) and runs the live check.
4. After the ship + live check, run the Jev fresh-eyes QA lane
   (`bash scripts/qa-jev.sh`; tooling note in task-state.md) and record its
   verdict in `task-state.md` — a non-zero verdict is surfaced, never decided.
5. Route the next slice to a fresh subagent.
6. Bring the human in for judgment calls, BLOCKED states, or anything touching
   production. Otherwise work back and forth autonomously.

> **Step 3 is the one that gets skipped, and skipping it is how a slice ships
> green and dies in production.** A migration that was never applied against the
> live project makes the next slice's green gate meaningless — the code passes
> against a schema the database does not have. If you cannot run it, report the
> slice BLOCKED with that reason. Never let it pass as "not applicable".

## Reminding the human (do not let work strand)

The contract itself — `ACTION REQUIRED` lines and open `## Escalations (waiting
on human)` entries, restated in prose in every end-of-batch report — is in the
orchestrator agent file. The reminder mechanism is
`scripts/remind-human.sh`; full details in `docs/agents/auto-push.md`.

## Fleet roles (org layer around this repo)

- Cora (@orchestrator) — routes feedback and goals, owns acceptance records.
- Pete (@builder-product) — clarifies goals into specs; restates the brief back
  in his own words before ticketing.
- Emily (@emily) — eng manager; converts user feedback into tickets ONLY after
  a reproduction exists (playtest evidence or unit repro).
- Einstein (@builder-dev) — implementation via DSH subagents; never edits product
  code outside a ticket.
- Pixel (@builder-design) — design review on UI tickets before build.
- Compass — runs the always-disagree check on any plan before it dispatches.
- Every batch: build → unit gate → playtest lane → review → push (auto-push rule),
  then real-user feedback re-enters through Emily.
