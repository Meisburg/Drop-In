# Agentic Engineering — orchestrated local-agent workflow

## What this project is

**Playdate** — a webapp that makes it easy for parents to arrange playdates
for their kids. Parents post time+place invitations, other parents see what's
happening nearby and RSVP. Privacy-first: kids appear by first name + age,
no public profiles, parents authenticate to see anything. Boring stack:
Vite + React + TypeScript + Tailwind.

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

## Model notes (NInfer specifics)

- Endpoint: http://127.0.0.1:18080/v1, model id `qwen3.8-27b`.
- Do not pass request-level sampler overrides; NInfer applies Qwen3.8's
  per-mode presets. Overriding temperature disables the per-mode switch.
- Deliberate exception: per-agent frontmatter `temperature` (0.1–0.3) in
  .opencode/agents/ is intentional — opencode's implicit default is 0
  (greedy), which triggered reasoning loops on this artifact.
- Context ceiling 262K is a ceiling, not a target — keep each agent under
  ~40-60K tokens. The orchestration pattern is what keeps contexts small.