<!-- firstmate:maintained-by-project -->

# Agentic Engineering — orchestrated local-agent workflow

## What this project is

**Playdate** — a webapp for arranging playdates: parents post time+place
invitations, nearby parents see them and RSVP. Privacy-first: kids appear by
first name + age, no public profiles, parents authenticate to see anything.
Boring stack: Vite + React + TypeScript + Tailwind.

## Communication style (always on)

The human reader has ADHD. Every response follows the `i-have-adhd` ruleset —
full text: `.opencode/skills/i-have-adhd/SKILL.md`. Compact contract:

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

Applies to every session and agent. Off-switch: "stop adhd mode" or "normal
mode" — confirm in one line, then revert to default style.

## The one rule about state

**Files are the system of record. Chat is not.**

- `plan.md` — the executor-grade implementation plan, written before any
  builder dispatch. Template: `plan.template.md`.
- `task-state.md` — current phase, slice states, evidence, risks, escalations.
  The orchestrator updates it after every phase transition.
- `factory/work/<id>.json` — per-work-item lane state and artifacts; a worker
  is disposable, this is not.
- Subagents get briefs pointing at files, never pasted chat history.
- Each returns a structured report; the orchestrator routes on the report plus
  the files, not on vibes.

## Agents (defined in .opencode/agents/)

- `orchestrator` (primary) — owns plan, delegation, acceptance. Never edits
  product code, never runs builds/tests. Inspects evidence: reports, diff
  summaries, test output, reviewer verdicts. Can only spawn the five
  orchestrator-* subagents (enforced by permission.task).
- `orchestrator-explorer` — read-only codebase research, cited findings.
- `orchestrator-researcher` — read-only open-web research via Exa. Answers one
  bounded external question and returns cited findings into `research/`.
  Never edits code.
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
3. Reviewer loops escalate by **model**, not by count: rounds 1–3 resume the
   original builder, 4–5 dispatch a FRESH builder on cloud DeepSeek, and round
   5's breaker adjudicates. Five rounds maximum — see below.
4. BLOCKED anywhere means stop and surface — never silently decide.
5. Verifier (tests/lint/typecheck) is the final authority on "works"; the
   reviewer is the authority on "right".
6. **No completion claim without fresh verification evidence.** The command
   must have run this turn; a subagent's "DONE" is a belief — the diff and the
   output are evidence.
7. **`ocr` is the third review lane** — an independent, non-agentic reviewer
   with machine-enforced project rules. See "Review lanes" below.
8. **The orchestrator delegates; it never does the work itself.** Every code
   change comes from a builder dispatch. Executing a slice inline is a recorded
   deviation, not a shortcut.
9. **Adopting a lane promotes it to an invariant.** A lane that lives only in a
   pointer table is a lane that quietly stops running.

## Review lanes (three, and they ask different questions)

A slice passes through three reviewers. They are not redundant: each answers a
question the others cannot.

| Lane | Question | Mechanism |
|---|---|---|
| `orchestrator-reviewer` (agent) | Does the diff match the PLAN SLICE — intent, scope, completeness? | fresh-context subagent on local `qwen3.8-27b` |
| **`ocr`** (CLI) | Are there DEFECTS in these lines — portability, null safety, rule violations? | Alibaba's open-code-review, own tool-use loop, own rules file |
| `orchestrator-verifier` (agent) | Do the DETERMINISTIC checks actually pass? | runs the real commands |

`ocr` is a *different agent structure* — own scaffolding, tool-use loop, rule
resolution — so it is independent even on the same model family as the builder.

```bash
# The third lane, at the end of a slice (base = the commit before the slice)
ocr review --from <base-sha> --to HEAD --format json --output .scratch/ocr-<slice>.json
```

- **Rules live in `.opencodereview/rule.json`** — the build law
  (`docs/agents/code-structure.md`) as machine-enforced, path-scoped checks: no
  domain rules in pages, `lib/` modules inject their client and ship a sibling
  test, idempotent migrations, tap targets ≥44px, inputs ≥16px, new routes join
  the playtest `routes.json`. **It found a real defect on its first run.**
- Config is a custom provider on local NInfer (`ocr config set provider
  ninfer`) — this lane runs on the 5090, not cloud.
- `ocr delegate rule <files>` prints the resolved rules WITHOUT an LLM — use it
  to confirm a rule file matches before trusting it.
- **Known limitations:** `ocr` reviews CODE only — `.md`, agent definitions and
  config are `unsupported_ext`, so this file and `docs/agents/` are outside its
  view; and it trades recall for precision. It complements the agent reviewer,
  never replaces it.

## Deterministic guards (the fourth lane, and the only one that guarantees)

The three lanes above **judge**; none can *guarantee*. A reviewer misses files,
`ocr` skips config and prose, the verifier runs only what it was handed. So
`npm run guards` (inside `verify`) runs scripts that either find a violation or
do not — no model, no tokens. Four rules: a `lib/` module needs its sibling
test; a check-config change needs `ALLOW_CONFIG_CHANGE="<why>"`; tracked git
hooks stay wired; every e2e fixture stays inside the sweep's marker convention
(`docs/agents/e2e-fixture-convention.md`). Rules that parse source ship a
`.check.mjs` proving the checker fires.

Borrowed from `affaan-m/ECC` (MIT): `docs/agents/borrowed-guards.md` — what was
taken, refused, the four tests.

## The escalating fix loop (why it escalates by capability)

A builder and its reviewer can end up as siblings — the model that wrote the bug
judging it — and repeating an attempt cannot break that. Escalation changes the
worker's capability ceiling instead, and `factory route --independence-of` keeps
the reviewer off the implementer's model by name. Rounds 1–3 resume the original
builder; 4–5 dispatch a fresh, higher-ceiling worker and a fresh reviewer; the
orchestrator is the breaker. Every adjudication is a **ledger entry**, never a
silent discard.

## The build law

`docs/agents/code-structure.md` is the written structure contract: domain logic
in `src/lib/` as pure functions with injected dependencies, React renders and
does not decide, every `lib/*.ts` ships a `lib/*.test.ts` sibling. Builders
read it before writing; reviewers check the diff against it.

## The ledger (compaction survival)

task-state.md is the long-lived record. Alongside it the active batch keeps a
short append-only ledger, one line per event — compaction destroys conversation
memory, and the expensive failure is a controller that lost its place and
re-dispatched completed work:

    Slice N: dispatched (base <sha7>)
    Slice N: complete (commits <base7>..<head7>, review clean)
    Slice N: fix round R/5 (<X> addressed, <Y> open)
    Slice N: parked — <finding> — Ruling: <why the code stands>

After compaction, read the ledger and `git log` before re-dispatching. Trust
the ledger over recollection — ledger-named commits exist in git even when
context forgets them.

## Slice budget

One slice ≈ one local builder context. The local window is **~98k tokens**
(`qwen3.8-27b`) — smaller than a frontier model's 150k+ smart zone, so budget
accordingly, and record observed tokens per slice in `task-state.md` beside the
gate result.

At every phase boundary decide **explicitly**: continue, clear, or compact, and
write it in the ledger. Default **clear** — durable state lives outside the
window. The decision table, and the rule against letting auto-compaction choose
for you, are inlined in `.opencode/agents/orchestrator.md`.

## Where the rest lives (read on demand, do not push)

Read it when its situation arrives — the pointer says when.

| Read before | File |
|---|---|
| Any `git push` to origin/master | `docs/agents/auto-push.md` — the three conditions, staging rules, enforcing hook |
| Starting ANY browser lane (e2e, playtest, audits) | `docs/agents/browser-lanes.md` — the human works here; never touch their Chrome |
| A slice touches an external API, library, or version-specific behavior | `docs/agents/grounding-gates.md` — Exa grounding before dispatch; findings into `research/` |
| Acting as the DSH coordinator | `docs/agents/coordinator.md` — dispatch mechanics, this session's migration/QA steps, fleet roles |
| Running agents in Orca (worktrees, terminals, diff, browser) | `docs/agents/orca.md` — the workspace substrate, and what it must never own |
| Changing a lane's model, or a lane is resource-blocked | `docs/agents/factory.md` — admission, capability routing, work state; model specifics in `docs/agents/model-routing.md` |
| Writing or reviewing a diff | `docs/agents/code-structure.md` — the build law |
| Adding a deterministic guard, or evaluating an external agent framework | `docs/agents/borrowed-guards.md` — provenance, refusals, the four tests |
| Running the playtest lane | `docs/agents/playtest-lane.md` — routes, verdict, evidence |
| Filing or triaging a ticket | `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md` |
| Naming a domain concept | `docs/agents/domain.md` — `CONTEXT.md` + `docs/adr/`, created lazily |
| CI is red, or changing `.github/workflows/` | `docs/agents/ci.md` — what CI runs, the two repo variables, what it skips |

**A pointer is skippable; a file you never opened is not a rule you followed.**
The unconditional rules — delegate and never do the work yourself; the
phase-boundary decision; the human-reminder contract; the guardrails; the
mandatory reads before a first dispatch — are inlined in
`.opencode/agents/orchestrator.md`, always loaded. If the agent file and a doc
disagree, the agent file wins.

Gate for a slice: **`npm run verify`** (build + test + lint). Steering payload:
`bash .scratch/context-load.sh`, under ~5% of the 98k window.

## Skills (mattpocock/skills, discovered from ~/.claude/skills/)

Two layers: agents define WHO does what; skills hold HOW.

- Before orchestration (human-invoked): `/grill-me` or `/grill-with-docs`
  (alignment + CONTEXT.md/ADRs feeding plan.md Interfaces), `/to-spec`,
  `/to-tickets` (tickets → plan.md slices), `/wayfinder` (work bigger than one
  session). Run `/setup-matt-pocock-skills` once per repo.
- Inside builder slices (model-invoked): `tdd` for red-green-refactor,
  `diagnosing-bugs` when verification fails, `codebase-design` for module
  boundaries, and `verification-before-completion` before any success claim.
  Allowed via per-agent `permission.skill`; every other agent has skills
  denied — the reviewer stays skill-free and fresh, because a reviewer that
  loads a workflow skill stops being an independent judge.
- Do NOT run `/implement` or `superpowers:subagent-driven-development` — both
  are competing orchestration spines. The orchestrator pattern is the spine;
  skills are disciplines within it (worktrees, ledgers, verification).
