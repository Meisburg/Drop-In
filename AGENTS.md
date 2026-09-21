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
    Slice N: parked — <finding> — Ruling: <why>

After any compaction, read the ledger and `git log` before re-dispatching.
Commits named in the ledger exist in git even when context no longer
remembers creating them. Trust the ledger over recollection.

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

     **RUN THIS, do not eyeball it** (`.scratch/check-push-range.sh`):
     ```bash
     bash .scratch/check-push-range.sh
     ```
     It applies the whole rule above mechanically and exits non-zero on any
     forbidden path. This exists because the rule was ALREADY correct and was
     still violated: on 2026-09-21 a slice ran `git add -A supabase/` and
     committed `supabase/.temp/linked-project.json` (project ref + org id,
     machine-local CLI state), then checked the range with a hand-typed regex
     that omitted `supabase/.temp/` and reported "clean". The file was caught
     by the third review lane before it reached origin — but only by luck of
     ordering. **A safety check the agent types from memory is not a check.**
     If the script is missing, write it from this rule before pushing.
  3. **Fast-forward** — plain `git push origin master`; no force, no amend,
     no rebase.
- Any one fails → STOP, report the failing check verbatim, founder decides.
- **Never `git add -A` a directory.** Stage the slice's own files by name, or
  `git add -A src/ e2e/ supabase/migrations/` — never a bare `supabase/`,
  which is what let CLI temp state into a commit.
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

### Browser-lane etiquette (founder rule, 2026-09-21 — the human works on this machine)

**The human is on this box while agents run.** A browser lane that eats CPU for
ten minutes is an interruption even when it is invisible. These rules are not
about visible windows (those were already banned) — they are about LOAD.

1. **Headless, always, and explicitly.** Every browser this repo starts passes
   `--headless=new`, a dedicated `--user-data-dir`, and its own
   `--remote-debugging-port`. Never attach to, drive, or kill the human's own
   Chrome (a Wayland `--ozone-platform=wayland` profile under
   `~/.config/google-chrome` or `/tmp/opencode/chrome-cdp` is almost always
   theirs — leave it alone).
2. **Full e2e is a BATCH-END lane, not a per-slice one.** `npm run test:e2e` is
   ~90 specs against a live database and takes **8–10 minutes** of real CPU. Run
   it ONCE per batch, when the human is away, and say so in the report.
3. **During a slice, run TARGETED specs only** — name the files the change can
   reach (`npx playwright test e2e/that-spec.e2e.ts`). That is seconds, not
   minutes, and it is what actually catches a regression in the slice's blast
   radius.
4. **Never run a browser lane in the foreground of a long turn.** Background it
   with output redirected to a file, then read the file. The full suite exceeds
   the default 600s tool timeout and will be killed mid-run otherwise.
5. **Deprioritize it.** Wrap heavy lanes in `nice -n 19` so the human's work
   always wins the CPU. There is no latency requirement on a check.
6. **Release what you start.** Kill the playtest Chrome and any preview server
   when the lane finishes — kill the LISTENER by port, not by `pkill -f`
   (which matches the agent's own shell and kills the wrong thing).
7. **NEVER open a real URL in the human's browser.** Several scripts in this
   repo drive the human's OWN Chrome over CDP to reach a logged-in session:
   `scripts/apply-migration.mjs`, `scripts/cdp-sql-runner.py`,
   `scripts/sweep-e2e-markers.mjs`, `scripts/migrate-kid-photos.mjs`. They call
   `page.goto('https://supabase.com/dashboard')`, which **visibly navigates the
   window the human is working in.** That is an interruption, and on a machine
   where the human is mid-task it is indistinguishable from a browser hijack.
   - Confirm with the human BEFORE running any of them, and say which URL will
     appear and in which window.
   - Prefer the API path where one exists: `apply-migration.mjs` and the others
     fall back to `fetch()` against `api.supabase.com/v1/projects/<ref>/
     database/query`, which needs no browser at all. Check whether the API key
     is present before reaching for CDP.
   - If you did not start a browser, do not assume a URL that appeared is
     yours — say so plainly and let the human identify it, rather than
     guessing or apologising for something you did not do.

The rule of thumb: **if a check takes longer than the human's patience, it is
a batch-end check.** Targeted runs during slices; full runs at the boundary.
And if a check would put pixels on the human's screen, it is not a check —
it is an interruption, and it needs their explicit yes first.

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

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/` (one file per ticket, no remote). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) recorded as `Status:` lines in issue files. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root (created lazily by `/domain-modeling`). See `docs/agents/domain.md`.

### Build law

`docs/agents/code-structure.md` — the written structure contract (service layer
in `src/lib/`, pure decisions, injected dependencies, sibling tests). Builders
read it before writing; reviewers check the diff against it. See "The build law"
above.

## Model notes (NInfer specifics)

- Endpoint: http://127.0.0.1:18080/v1, model id `qwen3.8-27b`.
- Do not pass request-level sampler overrides; NInfer applies Qwen3.8's
  per-mode presets. Overriding temperature disables the per-mode switch.
- Deliberate exception: per-agent frontmatter `temperature` (0.1–0.3) in
  .opencode/agents/ is intentional — opencode's implicit default is 0
  (greedy), which triggered reasoning loops on this artifact.
- Context ceiling 262K is a ceiling, not a target — keep each agent under
  ~40-60K tokens. The orchestration pattern is what keeps contexts small.

## Split-model routing (cloud orchestrator + local coders)

The factory runs two models on purpose:

- **Cloud** `deepseek-v4.1-flash:cloud` (via Ollama) — the orchestrator and
  any escalated fix round. Judgment, routing, adjudication.
- **Local** `qwen3.8-27b` (via NInfer on the RTX 5090, port 18080) — every
  builder, reviewer, verifier, and explorer. The volume work, on hardware we
  own.

Configured in `~/.dsh/settings.yaml` (`agent-default-model`) and pinned per
tool in `~/.dsh/.agent-presets/code/agent.cordis.yml`: `tool-subagent` and
`tool-subagent-fork` both carry `agentOptions: {provider: qwen-local, model:
qwen3.8-27b}`.

**Known gap:** `tool-workflow` and `tool-ralph` carry no `agentOptions`, so
their workers fall back to the agent default — cloud. Fan-out through those
tools spends cloud tokens; `subagent` is the local path.