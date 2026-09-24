<!-- firstmate:maintained-by-project -->

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
- Subagents get briefs pointing at files, never pasted chat history.
- Each returns a structured report; the orchestrator routes on the report plus
  the files, not on vibes.

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
3. Reviewer loops escalate by **model**, not by count: rounds 1–3 resume the
   original local builder, rounds 4–5 dispatch a FRESH builder on cloud
   DeepSeek, and round 5's breaker hands adjudication to the orchestrator.
   Five rounds maximum. See "The escalating fix loop" below.
4. BLOCKED anywhere means stop and surface — never silently decide.
5. Verifier (tests/lint/typecheck) is the final authority on "works"; the
   reviewer is the authority on "right".
6. **No completion claim without fresh verification evidence.** If the
   command was not run in the current turn, the claim is not made. A
   subagent's "DONE" is a belief, not evidence — the diff and the command
   output are evidence.
7. **`ocr` is the third review lane** — an independent, non-agentic reviewer
   with machine-enforced project rules. See "Review lanes" below.

## Review lanes (three, and they ask different questions)

A slice passes through three reviewers. They are not redundant: each answers a
question the others cannot.

| Lane | Question | Mechanism |
|---|---|---|
| `orchestrator-reviewer` (agent) | Does the diff match the PLAN SLICE — intent, scope, completeness? | fresh-context subagent on local `qwen3.8-27b` |
| **`ocr`** (CLI) | Are there DEFECTS in these lines — portability, null safety, rule violations? | Alibaba's open-code-review, own tool-use loop, own rules file |
| `orchestrator-verifier` (agent) | Do the DETERMINISTIC checks actually pass? | runs the real commands |

`ocr` exists because the agent reviewer shares a model family with the builder.
`ocr` is a *different agent structure* — its own prompt scaffolding, its own
tool-use loop, its own rule resolution — so it is a genuinely independent
instrument even on the same underlying model.

```bash
# The third lane, at the end of a slice (base = the commit before the slice)
ocr review --from <base-sha> --to HEAD --format json --output .scratch/ocr-<slice>.json
```

- **Rules live in `.opencodereview/rule.json`** — this repo's build law
  (`docs/agents/code-structure.md`) expressed as machine-enforced, path-scoped
  checks: pages must not encode domain rules, `lib/` modules must inject their
  client and ship a sibling test, migrations must be idempotent, tap targets
  ≥44px, inputs ≥16px, new routes must join the playtest `routes.json`.
  **It found a real defect on its first run** (a committed absolute symlink).
- Config is a **custom provider** pointed at local NInfer
  (`ocr config set provider ninfer`), so this lane runs on the 5090, not cloud.
- `ocr delegate rule <files>` prints the resolved rules WITHOUT running an LLM —
  use it to confirm a rule file actually matches before trusting it. A rules
  file that silently doesn't match is worse than none.
- **Known limitations:** `ocr` reviews CODE only — it skips `.md`, agent
  definitions, and config as `unsupported_ext`, so this file and
  `docs/agents/` are outside its view. Its own README states recall is
  deliberately traded for precision, so it is a complement to the agent
  reviewer, never a replacement.

## Deterministic guards (the fourth lane, and the only one that guarantees)

The three lanes above **judge**; none can *guarantee*. A reviewer misses files,
`ocr` skips config and prose, the verifier runs only what it was handed. Some
rules must not depend on attention, so `npm run guards` (inside `verify`) runs
shell scripts that either find a violation or do not — no model, no tokens.
Three rules: a `lib/` module needs its sibling test; a check-config change
needs `ALLOW_CONFIG_CHANGE="<why>"`; the tracked git hooks stay wired.

Borrowed from `affaan-m/ECC` (MIT), reimplemented here — what was taken,
refused, and the four tests a new guard must pass: `docs/agents/borrowed-guards.md`.

## The escalating fix loop (why it escalates by model)

Builders, reviewers, and verifiers all run the same local model
(`qwen3.8-27b`). A builder and its reviewer are siblings, so a hard slice
deadlocks: the model that wrote the bug is the model judging it. Repeating the
same attempt cannot break that. Changing the model can.

| Round | Who | Model |
|---|---|---|
| 1–3 | resume the original builder with findings verbatim | local `qwen3.8-27b` |
| 4–5 | fresh builder + fresh reviewer | cloud `deepseek-v4.1-flash:cloud` |
| breaker | orchestrator adjudicates each open finding | — |

Every adjudication is a **ledger entry**, never a silent discard:

    Slice N: parked — <finding> — Ruling: <why the code stands>
    Slice N: Ruling: <decision> — <why> — <cost if wrong>

## The build law

`docs/agents/code-structure.md` is the written structure contract: domain logic
in `src/lib/` as pure functions with injected dependencies, React renders and
does not decide, every `lib/*.ts` ships a `lib/*.test.ts` sibling. Builders
read it before writing; reviewers check the diff against it. It exists because
the workflow is the part that is not native to the agent.

## The ledger (compaction survival)

task-state.md is the long-lived record. Alongside it, the active batch keeps a
short append-only ledger of one line per event, because compaction destroys
conversation memory and the expensive failure is a controller that lost its
place and re-dispatched completed work:

    Slice N: dispatched (base <sha7>)
    Slice N: complete (commits <base7>..<head7>, review clean)
    Slice N: fix round R/5 (<X> addressed, <Y> open)
    Slice N: parked — <finding> — Ruling: <why the code stands>

After compaction, read the ledger and `git log` before re-dispatching.
Ledger-named commits exist in git even when context forgets them. Trust the
ledger over recollection.

## Slice budget

One slice ≈ one local builder context. The local model's window is **~98k
tokens** (`qwen3.8-27b`) — smaller than the 150k+ smart zone of a frontier
model, so budget slices accordingly. Record the observed tokens per slice in
`task-state.md` beside the gate result, so sizing becomes empirical.

At every phase boundary, decide **explicitly** whether to continue, clear, or
compact, and write it in the ledger. Default: **clear** — durable state
(plan, ledger, commit, evidence) lives outside the window. Full decision
table: `docs/agents/coordinator.md`.

## Where the rest lives (read on demand, do not push)

Read it when its situation arrives — the pointer says when. Keep this file lean: prefer pruning, or a pointer to the authoritative doc, over restating it.

| Read before | File |
|---|---|
| Any `git push` to origin/master | `docs/agents/auto-push.md` — the three conditions, staging rules, and the enforcing hook |
| Starting ANY browser lane (e2e, playtest, audits) | `docs/agents/browser-lanes.md` — the human works here; load rules and never-touch-their-Chrome rules |
| Acting as the DSH coordinator | `docs/agents/coordinator.md` — dispatch, the per-slice loop, phase-boundary decisions, fleet roles |
| Changing agent models or debugging a lane's cost | `docs/agents/model-routing.md` — cloud/local split, NInfer specifics |
| Writing or reviewing a diff | `docs/agents/code-structure.md` — the build law |
| Adding a deterministic guard, or evaluating an external agent framework | `docs/agents/borrowed-guards.md` — provenance, refusals, the four tests a new guard must pass |
| Running the playtest lane | `docs/agents/playtest-lane.md` — routes, verdict, evidence |
| Filing or triaging a ticket | `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md` |
| Naming a domain concept | `docs/agents/domain.md` — `CONTEXT.md` + `docs/adr/`, created lazily |
| CI is red, or changing `.github/workflows/` | `docs/agents/ci.md` — what CI runs, the two repo variables, what it deliberately skips |

The gate for a slice is **`npm run verify`** (build + test + lint). The
steering payload is measured by `bash .scratch/context-load.sh` —
keep it under ~5% of the 98k window.

## Skills (mattpocock/skills, discovered from ~/.claude/skills/)

Two layers: agents define WHO does what; skills hold HOW.

- Before orchestration (human-invoked): `/grill-me` or `/grill-with-docs`
  (alignment + CONTEXT.md/ADRs that feed plan.md Interfaces), `/to-spec`,
  `/to-tickets` (tickets → plan.md slices), `/wayfinder` (work bigger than
  one session). Run `/setup-matt-pocock-skills` once per repo; choose the
  local-files tracker.
- Inside builder slices (model-invoked): `tdd` for red-green-refactor,
  `diagnosing-bugs` when verification fails, `codebase-design` for module
  boundaries, and `verification-before-completion` before any success claim.
  Allowed via per-agent `permission.skill`; every other agent has skills
  denied — the reviewer stays skill-free and fresh, because a reviewer that
  loads a workflow skill stops being an independent judge.
- Do NOT run `/implement` here — it is a competing orchestration spine. The
  orchestrator pattern is the spine; skills are disciplines within it. The
  same reasoning rejects `superpowers:subagent-driven-development`: it is a
  second spine. Its *disciplines* (worktrees, ledgers, verification, the
  escalating fix loop) are already adopted above; the spine is ours.
