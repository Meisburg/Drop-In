# Parallel development: how to run many lanes at once

Written 2026-10-07 by Hermes. The goal: replicate what poteto does at SpaceX,
scaled to **your** box. Grounded in measurements taken here, not theory.

Read `docs/adr/0005-*.md` for the groups design; this file is about *throughput*.

---

## The rule that matters most: slices must not share files

**Measured 2026-10-08.** Four slices ran in parallel and produced four branches
that **all edited the same five files**: `AGENTS.md`, `CONTEXT.md`,
`docs/RELEASE-CHECKLIST.md`, `vite.config.ts`, and `src/dev/AgentationDev.tsx`.
Every branch therefore conflicted with every other, and merging them was serial,
manual work. One conflict was real (`src/pages/OnboardingPage.tsx`).

The lesson is not "parallelism is bad." It is that **parallelism moves the
bottleneck from generation to merge** unless slices are given disjoint file sets.

### The rule

**A slice owns its product files and NOTHING else.** Shared scaffolding is owned
by the orchestrator and folded in at merge time.

| File | Who edits it |
|---|---|
| `AGENTS.md`, `CONTEXT.md` | **orchestrator only** — never a slice |
| `docs/RELEASE-CHECKLIST.md` | **orchestrator only** |
| `vite.config.ts`, `tsconfig*`, `.github/workflows/` | **nobody, without a recorded reason** (config-guard enforces this) |
| `src/dev/AgentationDev.tsx` | shared — one slice at a time, or leave it |
| `src/lib/places.ts`, `PlaceMap.tsx`, `e2e/places.e2e.ts` | **the hot files** — see below |
| the slice's own report | `.scratch/<slice>-report.md` — always unique, never shared |

Doc updates that would have been in the slice become a line in its report; the
orchestrator applies them once, at merge.

### The hot files

`src/lib/places.ts`, `src/components/PlaceMap.tsx`, and `e2e/places.e2e.ts` are
touched by a large share of slices. **Two slices that both touch a hot file are
not two slices — sequence them, or make them one slice.** Group the queue by
*area*, not by annotation ID.

### The cadence

**Merge within ~30 minutes of a slice's commit, or park it.** Branch age creates
conflicts, and a conflict discovered after three more slices land is much more
expensive than one caught immediately. Serial merges are cheap; stale branches
are not.

### What NOT to do

**Do not add lanes or machines to fix a merge backlog.** More parallel writers on
shared files produce more conflicts, not more throughput — the same principle as
*"a rate meter cannot be parallelized by adding machines."* The constraint here is
merge throughput, and it is addressed by disjoint file sets and prompt merging.

---

## The reference: what poteto actually does

From the interview clipping (`~/Documents/Obsidian Vault/Clippings/LIVE Poteto...`):

> *"these projects are... coordinator agents... really good at sort of delegating
> and not doing work of their own but they manage and supervise like almost a
> list of tasks and they spawn sub agents to go and do them."*

> *"how I arrive at 2,000 or however many PRs is the fact that I have all these
> **loops** set up... it allows me to open chain restaurants."*

> *"the big unlock for me... is starting from the question and working backwards
> of **how do I get to the point where my agent can merge its own code**."*

> *"I have some graph bots that look at my Slack channels, look at my X, uh, or my
> emails, uh, or linear, and they're just constantly... they have routines that
> subscribe."*

**Four layers, in ascending order of leverage:**

| # | Layer | What it does | Do you have it? |
|---|---|---|---|
| 1 | **Trigger** | bots watch Slack/X/Linear; work arrives without you | ❌ partial (agentation only) |
| 2 | **Coordinator** | supervisor agents that delegate, never build | ⚠️ one (Pi) |
| 3 | **Builders** | many workers, many worktrees | ⚠️ one pane |
| 4 | **Auto-merge** | the agent merges its own code | ❌ (you gate it) |

**Her PR count comes from layers 1 and 3, not from a faster builder.** She is not
running one agent faster. She is running many, fed by loops.

---

## The measured ceiling on your box

Tested live against ninfer today (Qwen 3.8 27B, 5090):

| Concurrency | Wall | Avg/req | Throughput | Note |
|---|---|---|---|---|
| 1 | 1.99s | 1.99s | 0.50 req/s | what you do now |
| 2 | 2.25s | 2.12s | 0.89 req/s | |
| **4** | **2.46s** | 2.34s | **1.62 req/s** | **sweet spot — 3.2x** |
| 6 | 4.51s | 3.43s | 1.33 req/s | degrades past the knee |

**4 concurrent lanes, no extra VRAM** (27GB of 32GB used; ninfer already has
`--max-concurrency 6`). Above 4 you lose throughput, so **4 is the cap** — do not
chase the configured 6.

This is the free multiplier: same hardware, same electricity, 3.2x the work.

---

## Why your spine currently says no, and why that changes

`orchestrator.md:295` says:

> *"One writer per slice. **No concurrent-writer worktrees are needed here.**
> Parallelize read-only exploration only, **and only after the base loop is
> proven**."*

Two readings matter:

1. **"are needed here"** is a judgment, not a law. It was written when there was
   one lane and no verification.
2. **"only after the base loop is proven"** is a *sequencing* condition, and you
   now satisfy it: V32 landed and was browser-verified, V33 is running.

**The apparent conflict is not real.** "One writer per slice" and "many parallel
worktrees" are compatible — *different worktrees are different slices*. What is
forbidden is two writers on **one checkout**, and that stays forbidden. The rule
that protects you is one-writer-per-worktree, and parallel worktrees honor it.

You already run 7 worktrees (`~/orca/workspaces/playdate-app/`: Drop-Ins, Inbox,
onboarding, places, post-drop-in, settings, v27). The infrastructure exists.

---

## The plan: five stages, cheapest first

**Do not skip stages.** Each one is a prerequisite for the next, and the failure
mode of skipping is the phone-lane file clobber returning.

### Stage 1 — Read-only lanes concurrent (free, do now)

Your spine already permits it: *"Independent read-only lanes (review, verify,
`ocr`) may run concurrently."*

- While a builder runs a slice, start its `ocr` review and verifier **at the same
  time**, not after.
- Uses ~3 of the 4 measured slots.
- **Cannot clobber anything** — only the builder writes.
- Expected: the review phase stops being serial dead time.

**Verify it worked:** the batch wall-clock drops without any builder change.

### Stage 2 — Two builder panes, two worktrees

The first real parallelism, and the first real risk.

- Split a second herdr pane, run `dsh-herdr` in it.
- **Each builder gets its own worktree.** Never the same checkout.
- Pi dispatches to the second pane by pane id (`herdr pane run`), not by agent
  name — dsh is a *reported* agent, not a detected one.
- Dispatch **independent** slices only (no shared files, no shared migrations).
- Cap: **2 builders**. Stage 4 raises it to 3, never past 4.

**Verify it worked:** `git worktree list` shows both branches; `git status` in
each is clean of the other's files. If a file ever appears in both lanes'
diffs, stop and back out — that is the clobber.

### Stage 3 — A second coordinator

Pi is one supervisor. A second Pi pane can own a second *workstream* (e.g. V34
groups) while the first owns V33 annotations.

- Two coordinators, two workstreams, disjoint slice sets.
- **They must not share a task board.** Two dispatchers over one queue is the
  original failure.
- This is where cloud earns its place: coordinators need reasoning, and your
  budget supports it (`verdict: OK`, ~36% weekly).

**Verify:** each coordinator's reports name only its own slices.

### Stage 4 — Raise the builder cap to 3

Only after stage 2 has run several batches clean. The GPU measurement says 4
concurrent, minus one slot for read-only lanes, minus headroom = 3 builders max.

**Do not go to 4 builders.** That leaves zero slots for review, and the
measurement showed 6 degrades.

### Stage 5 — Agents merge their own code

The actual unlock, and the highest trust rung. Not a config change — a policy
change, and it needs the verification first.

Prerequisites, in order:

1. `verify-drop-in` covering every feature in the map (partially done: 5 of ~11).
2. The overnight contract running clean for a week (job `0f2f09574e7d`).
3. A recorded decision on what "merge" means: auto-push to master, or auto-merge
   to a staging branch you review as a batch.

**Do not climb this rung until 1 and 2 hold.** This is the step that turns 2,500
PRs from reckless into safe, and it is entirely about verification coverage.

---

## What is different about your situation vs poteto's

Honest differences, so you don't chase the wrong number:

| | Poteto | You |
|---|---|---|
| Hardware | cloud, effectively unlimited | one 5090 → **4 lanes** |
| Trigger layer | bots on Slack/X/Linear | agentation annotations only |
| Merge | agents self-merge | you gate, nothing pushed |
| Repo count | many | one primary (playdate-app) |
| Model | frontier (Opus 5.5, grok) | local 27B + cloud overflow |

**Your ceiling is 4 concurrent lanes, not 2,500 PRs/month.** But 4 lanes running
clean without you in the loop is a genuine 4x, and it is available today for
free. That is the real target.

**The leverage is in stages 1 and 5, not 2-4.** Stage 1 is free throughput. Stage
5 is the multiplier that makes throughput safe. Stages 2-4 are plumbing.

---

## What to do first

1. **Stage 1 today** — it is free and your spine already permits it.
2. **Measure the batch wall-clock** before and after. If it does not drop, the
   parallelism is not real and stage 2 should wait.
3. Write down the *one* rule that must never break: **one writer per worktree.**
   Everything else here is negotiable; that one is not.
