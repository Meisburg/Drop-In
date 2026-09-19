# Agentic Engineering — orchestrated local-agent workflow

## What this project is

**Playdate** — a webapp that makes it easy for parents to arrange playdates
for their kids. Parents post time+place invitations, other parents see what's
happening nearby and RSVP. Privacy-first: kids appear by first name + age,
no public profiles, parents authenticate to see anything. Boring stack:
Vite + React + TypeScript + Tailwind.

## Communication style (always on)

The human reader has ADHD. Every response to the human follows the
`i-have-adhd` ruleset — full text: `.opencode/skills/i-have-adhd/SKILL.md`
(source: `~/Projects/skills/i-have-adhd-main/`). Compact contract:

1. Lead with the next action — first line is something doable now, not context.
2. Number multi-step work; each step one bounded action; fewest steps that work.
3. End with ONE concrete next action, doable in under two minutes.
4. Suppress tangents; surface side-issues once, at the end.
5. Restate project state every turn (active slice, what's pending, what's next).
6. Specific time estimates; never "a bit of work."
7. Make completed work visible ("X now works — try Y").
8. Matter-of-fact tone for errors: cause + fix, no "uh oh."
9. Cap lists at 5 items; rank them (do now vs later).
10. No preamble, no recap, no closing pleasantries.

Applies to every session in this repo, all agents. Off-switch: "stop adhd
mode" or "normal mode" — confirm in one line, then revert to default style.

## The one rule about state

**Files are the system of record. Chat is not.**

- `plan.md` — the executor-grade implementation plan, written before any
  builder dispatch. Template: `plan.template.md`.
- `task-state.md` — current phase, slice states, evidence, risks, escalations.
  The orchestrator updates it after every phase transition.
- Subagents receive briefs pointing at files, never pasted chat history.
- Each subagent returns its structured report; the orchestrator routes on the
  report plus the files, not on vibes.

## Agents (defined in .opencode/agents/)

- `orchestrator` (primary) — owns plan, delegation, acceptance. Never edits
  product code, never runs builds/tests. Inspects evidence: reports, diff
  summaries, test output, reviewer verdicts. Can only spawn the four
  orchestrator-* subagents (enforced by permission.task).
- `orchestrator-explorer` — read-only codebase research, cited findings.
- `orchestrator-builder` — ONE bounded slice, runs required checks itself,
  structured report.
- `orchestrator-reviewer` — fresh-context diff review, verdict
  PASS | NEEDS_CHANGES | BLOCKED, findings must cite file:line.
- `orchestrator-verifier` — runs deterministic checks, reports raw outcomes.

## Workflow invariants

1. Serialized: one builder at a time; parallelize only read-only exploration,
   and only after the base loop is proven.
2. Every slice has acceptance criteria + verification command in plan.md
   before dispatch. A slice with neither is a plan defect, not a builder
   problem.
3. Reviewer loops: max 2 NEEDS_CHANGES cycles per slice, then escalate to the
   human.
4. BLOCKED anywhere means stop and surface — never silently decide.
5. Verifier (tests/lint/typecheck) is the final authority on "works"; the
    reviewer is the authority on "right".

## Coordinator role (this DeepSeek Harness session)

This orchestrator session is the human-facing COORDINATOR operating directly in
the DeepSeek Harness. Slice coding happens here via DSH subagents (spawned with
the `subagent` tool), not in a separate terminal multiplexer pane. The coordinator
routes work, verifies output, runs the Supabase DB apply (browser-use/CDP), and
routes the next slice — all within this session.

### Subagent access (dev work = DSH subagents)
- `subagent` — spawn a focused child agent for ONE bounded task (a slice, a
  review, an analysis). The child returns a structured report; inspect it plus
  the files before accepting.
- `subagent_fork` — inherit this conversation's context into a child when the
  task builds on what was just discussed.
- Both run in the background by default; collect results via the runtime notice
  or `job_output`. Steer a running child with `send_message`; stop it with
  `interrupt_agent`.
- Give each subagent ONE bounded outcome: working dir, context (point at
  plan.md / task-state.md — never paste chat), the deliverable, how it's checked,
  what it may change, what it must NOT touch.

### The coordinator loop (per slice)
1. Spawn a builder subagent with ONE bounded outcome: working dir, context
   (point at plan.md / task-state.md — never paste chat), the deliverable, how
   it's checked, what it may change, what it must NOT touch.
2. Collect its report when the runtime settles it. Do NOT accept a completion
   message alone: re-run the real checks (`npm run build && npm run test`) and
   inspect the diff / artifacts.
3. Once code is green, THIS session applies the new Supabase migrations via
   browser-use/CDP (task-state.md tooling note + `scripts/cdp-migration-tooling.sh`)
   and runs the live check.
4. After the ship + live check, run the Jev fresh-eyes QA lane
   (`bash scripts/qa-jev.sh`; tooling note in task-state.md) and record its
   verdict in task-state.md — a non-zero verdict is surfaced, never decided.
5. Route the next slice to a fresh subagent.
6. Bring the human in for judgment calls, BLOCKED states, or anything touching
   production. Otherwise work back and forth autonomously.

### Coordinator guardrails
- Factual disagreements settle via tests / verifiable evidence, not opinions;
  judgment calls go to the human.
- No publish, deploy, production, or sending sensitive data externally
  without explicit human authorization. End-of-slice git pushes to
  origin/master are automatic — the Auto-push rule below.
- One writer per slice (the active builder subagent) in this repo — no
  concurrent-writer worktrees needed. Release resources you created (e.g. the
  CDP Chrome) when done; preserve the human's existing work and undelivered
  artifacts.
- Finish with: what completed, verification evidence, anything unresolved, and
  any subagents/worktrees still retained.

### Auto-push (founder decision, 2026-09-17)
- End-of-slice pushes to origin/master do not need per-push human
  authorization. At the end of a slice, push when ALL THREE hold:
  1. **Gate green** — the slice's verification command (the plan slice's
     gate: `npm run build && npm run test`, plus lint / e2e where the plan
     pins them) passes on the final tree.
  2. **Clean range** — `git diff --name-only origin/master..HEAD` lists
     only the slice's intended files; zero local-only artifacts (`.agents/`,
     `.scratch/*.cjs|mjs|html`, `supabase/.temp/`, `opencode.json` —
     untracked + gitignored, `.gitignore:69`). A slice's own migration under
     `supabase/migrations/` is an intended file when the plan slice says so.
  3. **Fast-forward** — plain `git push origin master`; no force, no amend,
     no rebase.
- Any one fails → STOP, report the failing check verbatim, founder decides.
- Scope: git pushes to origin/master only. Publish, deploy, production
  changes, and sending sensitive data externally still require explicit
  human authorization.

### Playtest lane (fleet rule, 2026-09-18 — from the Grokbot Galaxy 3-day playbook)

A slice is NOT "done" on green unit tests alone. Before acceptance, the
orchestrator runs the headless playtest over the built app:

```bash
python3 scripts/playtest_check.py --base <served-dist-url> --port 9444 \
  --out .scratch/playtest --routes .scratch/playtest/routes.json
```

- `routes.json` lists public routes with `must_contain` text assertions;
  the script drives a DEDICATED headless Chrome (isolated profile
  `~/.hermes/playtest-hl`, port 9444), harvests uncaught JS errors, and
  saves a screenshot per route into `.scratch/playtest/`.
- Verdict (`verdict.md`, PASS/FAIL) gets recorded in task-state.md next to
  the gate result. A FAIL blocks acceptance exactly like a red gate.
- No visible browser windows, ever — this check is the repro-before-accept
  instrument for bot-built slices. Screenshots ARE the evidence.
- Extend `routes.json` whenever a slice adds a reachable route, so the
  lane grows with the app instead of being rebuilt per batch.
- Full doc: `docs/agents/playtest-lane.md`.

## Fleet roles (org layer around this repo)

- Cora (@orchestrator) — routes feedback and goals, owns acceptance records.
- Pete (@builder-product) — clarifies goals into specs; restates the brief
  back in his own words before ticketing.
- Emily (@emily) — eng manager; converts user feedback into tickets ONLY
  after a reproduction exists (playtest evidence or unit repro).
- Einstein (@builder-dev) — implementation via DSH subagents; never edits
  product code outside a ticket.
- Pixel (@builder-design) — design review on UI tickets before build.
- Compass — runs the always-disagree check on any plan before it dispatches.
- Every batch: build → unit gate → playtest lane → review → push (auto-push
  rule above), then real-user feedback re-enters through Emily.

## Skills (mattpocock/skills, discovered from ~/.claude/skills/)

Two orthogonal layers: agents define WHO does what; skills hold HOW to do it.

- Before orchestration (human-invoked): `/grill-me` or `/grill-with-docs`
  (alignment + CONTEXT.md/ADRs that feed plan.md Interfaces), `/to-spec`,
  `/to-tickets` (tickets → plan.md slices), `/wayfinder` (work bigger than
  one session). Run `/setup-matt-pocock-skills` once per repo; choose the
  local-files tracker.
- Inside builder slices (model-invoked): `tdd` for red-green-refactor,
  `diagnosing-bugs` when verification fails. Allowed via per-agent
  `permission.skill`; every other agent has skills denied — the reviewer
  stays skill-free and fresh.
- Do NOT run `/implement` here — it is a competing orchestration spine. The
  orchestrator pattern is the spine; skills are disciplines within it.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/` (one file per ticket, no remote). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) recorded as `Status:` lines in issue files. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root (created lazily by `/domain-modeling`). See `docs/agents/domain.md`.

## Model notes (NInfer specifics)

- Endpoint: http://127.0.0.1:18080/v1, model id `qwen3.8-27b`.
- Do not pass request-level sampler overrides; NInfer applies Qwen3.8's
  per-mode presets. Overriding temperature disables the per-mode switch.
- Deliberate exception: per-agent frontmatter `temperature` (0.1–0.3) in
  .opencode/agents/ is intentional — opencode's implicit default is 0
  (greedy), which triggered reasoning loops on this artifact.
- Context ceiling 262K is a ceiling, not a target — keep each agent under
  ~40-60K tokens. The orchestration pattern is what keeps contexts small.