# Course review: "AI Coding Crash Course" (Matt Pocock, 70 parts) against this factory

Source: `~/Videos/AI Coding Crash Course/transcripts/_ALL.md` (5h20m, 70 episodes).
Reviewed 2026-09-21. Purpose: find what the course teaches that this factory does
not already do, and what it teaches that this factory should keep ignoring.

---

## 1. Verdict up front

**The factory is ahead of the course on verification and behind it on context
hygiene.**

The course's five-step spine — *grill → spec → tickets → implement → review* —
is already this factory's spine, with more machinery around it (three review
lanes, a playtest lane, live DB checks, an escalating fix loop, an auto-push
gate). We should not restructure around the course. We should lift **four
specific techniques** and **prune one file**.

| Course area | Factory status |
|---|---|
| Grill before building | Already have it (`/grill-me`, `grilling` skill) — but **not run on most batches** |
| Spec → tickets → vertical slices | Have tickets; **slices are horizontal-ish and un-sized** |
| Three levels of checking | **We are well ahead** — verifier + reviewer + `ocr` + playtest |
| Standards enforced in the reviewer, not the implementer | **We are ahead** (`ocr` rules file), but the rule file is narrow |
| Clear / compact / handoff at phase boundaries | **We use compaction reactively; never clear deliberately** |
| Context paranoia (measure the always-on payload) | **Gap — nothing measures it** |
| `agents.md` pruning (no-ops, duplication, sediment) | **Gap — AGENTS.md is 3,150 words / ~5.5k tokens, always on** |
| Subagents for exploration | Have it, and our subagents are local (cheaper than the course's) |

---

## 2. The one thing to do first: prune AGENTS.md

The course's strongest single argument (episodes 28, 45, 53, 55) is:

> Anything loaded up front is paid for on **every model provider request**, in
> tokens *and* in attention. Every extra instruction makes every other
> instruction quieter.

Our current always-on payload, measured:

| File | Words | Status |
|---|---|---|
| `AGENTS.md` | 3,150 | **always pushed, every request, every agent** |
| `.opencode/agents/orchestrator.md` | 1,051 | pushed for the orchestrator |
| `.opencode/agents/orchestrator-builder.md` | 454 | pushed per builder |
| `docs/agents/code-structure.md` | 607 | **already behind a pointer — correct** |
| `docs/agents/playtest-lane.md` | 442 | **already behind a pointer — correct** |

- `AGENTS.md` is roughly **5.6k tokens on every single request**, and by
  inspection it is ~60% content that only applies to a narrow situation:

- The full **auto-push rule** (~35 lines) applies only at the *end* of a slice.
  A builder writing a React component does not need it, and per the course it is
  *actively harmful* there — pushed rules get misapplied (the "PCI DSS chocolate
  cake" failure mode, ep. 45).
- The **browser-lane etiquette** section (~50 lines) applies only when running a
  browser lane. Most slices never start one.
- The **fleet roles** section is org-layer context, not build instruction.
- The **model notes / split-model routing** section is about *our* infrastructure
  — it belongs in a doc, not in every builder's context.
- `### Build law` and `### Issue tracker` are **duplicate pointers** — the same
  facts already stated earlier in the same file (lines 133 and 349 point at the
  same contract). That is the course's "single source of truth" violation.

**Concrete change.** Split `AGENTS.md` into a ~60-line pushed file and four
pointed-to docs:

```
AGENTS.md                      ← pushed: what this project is, the one rule about
                                 state, agent roster, workflow invariants, and
                                 pointers with WHEN-to-read descriptions
docs/agents/auto-push.md       ← the three-condition push rule + check script
docs/agents/browser-lanes.md   ← headless/user-data-dir/load etiquette
docs/agents/coordinator.md     ← coordinator loop, guardrails, fleet roles
docs/agents/model-routing.md   ← NInfer/DSH specifics, split-model routing
```

The pointer text is the whole game (ep. 47): *"Read before any `git push` to
origin/master"* beats a bare link, and beats pushing the content.

**Test before/after:** run `/context` (or the DSH equivalent) on a fresh session
and record the number. The course's own demo dropped 68k → under 20k with no
behaviour change. We should expect a smaller but free win.

---

## 3. Five techniques worth adopting

### 3.1 Measure the always-on payload (new, cheap)

We currently have **no instrument** that reports "what am I pushing into every
agent's context right now?" The course builds one (ep. 8: a request logger; ep.
31: context in the status line). We don't need their tooling — we need the
*habit*: a script that sums the token cost of every file the harness pushes, so
pruning is measured rather than felt.

Sketch (`.scratch/context-load.sh`):

```bash
# rough: words/0.75 ≈ tokens for prose
for f in AGENTS.md .opencode/agents/*.md; do
  printf "%-45s %6s words\n" "$f" "$(wc -w < "$f")"
done
```

Later this can read DSH's session JSON to get the *real* first-request token
count. **Do now vs later:** the script is 10 minutes; the DSH integration is later.

### 3.2 Slice sizing by budget, not by feel (adopt)

The course is explicit and quantified (ep. 14, 43, 61):

- Smart zone ≈ **150k tokens** for current frontier models; the dumb zone is a
  slope, not a cliff.
- One ticket ≈ one smart zone.
- When a ticket-plan proposes 10 tickets, that is a **budget of 1.5M tokens** —
  the course cut it to 3.

**Our equivalent number is smaller and we have never written it down.** Our
builders run local `qwen3.8-27b`, and `~/.dsh/settings.yaml` pins its
`contextWindow: 98304` — **98k, not 150k**. Our smart zone is roughly **two
thirds** of the course's. That matters:

- A slice that would fit a frontier model's smart zone may not fit ours.
- Our always-on payload measures at **~5.6k tokens = 5.7% of the local window**
  before the builder reads a single line of code.

**Concrete change:** add a `- **Budget:**` line to the slice template in
`plan.template.md` (currently the template forces *Files in scope*,
*Acceptance criteria* and *Verification command* — but nothing about size), and
record the *observed* tokens per slice in `task-state.md` next to the gate
result, so sizing becomes empirical instead of vibe-based.

> Note: `contextWindow: 98304` is the *ceiling* for the local model. The course's
> 150k smart-zone heuristic is a soft attention threshold for frontier models,
> not a hard limit, so the two numbers are not strictly comparable. The
> conservative reading — budget our slices smaller than the course's — is still
> the right one, because attention degradation scales with tokens regardless of
> the declared ceiling.

### 3.3 `clear` at phase boundaries, not just `compact` (adopt)

Our ledger is built for compaction survival — which is correct — but the course
makes a sharper point (ep. 43, 64): at most phase boundaries the **cheapest and
fastest** move is `clear`, because the durable state is already *outside* the
context window.

We have far more durable state outside context than the course does: `plan.md`,
`task-state.md`, the ledger, the ticket, the commit history, and the live
verification evidence. That is exactly the course's precondition for clearing.

Its rule of thumb (ep. 64): *"if it's 50-50 between clear and compact, choose
clear — it's cheaper and faster."* And (ep. 44): *"if you're auto-compacting,
something is probably going wrong."*

**Concrete change:** in the coordinator loop, make the boundary decision
explicit and default to clear:

```
Slice N: phase boundary — CLEAR (durable: plan.md S-N, task-state.md, commit <sha7>)
```

Only compact when the *reasoning* behind a decision is not yet captured in a
file. If it is in a file, clearing is strictly better.

### 3.4 Reviewer owns the standards (adopt — we already half-do this)

Episode 68's argument is that standards belong in the **reviewer**, not the
implementer, because the reviewer has a far lighter context load: no
exploration, no implementation, no debugging.

This is exactly what our `ocr` lane already does — `.opencodereview/rule.json`
is machine-enforced build law. **We are ahead here.** The gap is *coverage*:
our rules cover pages, `lib/`, migrations, and a11y — but by our own AGENTS.md,
`ocr` **skips `.md`, agent definitions, and config** as `unsupported_ext`.

So the course's lesson applies to the blind spot: our agent definitions and
`AGENTS.md` — the files that steer *every* slice — are reviewed by nothing.
**Concrete change:** add a cheap lint for the steering layer (nav pointers that
resolve, no duplicate facts, no file over N words). Pointer rot (ep. 52: *"a
stale highway is worse than no highway"*) is a real defect class for us, and the
measurement script in §3.1 already found one live instance on its first run: it
flags `CONTEXT.md`, `routes.json` and `verdict.md` as unresolvable.

> **False-positive caveat (checked):** `routes.json` and `verdict.md` are
> *runtime outputs* under `.scratch/playtest/` — they do not exist before the
> lane runs, so they are correctly absent, not stale. And `CONTEXT.md` is absent
> **by explicit design**: `docs/agents/domain.md:5-11` instructs agents to read
> it and to *"proceed silently"* if missing, creating it lazily via
> `/domain-modeling`. So only a naive pointer-checker would call these defects —
> which is exactly why the lint needs a small allow-list rather than a bare
> `[ -e ]` test. The *real* finding here is that the check is now measured, not
> assumed.

---

### 3.5 The gap the course cannot see: our gates are not enforced (adopt — highest value)

This is **outside the course's scope and more important than anything in it.**
The course assumes a human decides when work ships. Our factory has an
**auto-push rule**: end-of-slice pushes to `origin/master` are automatic when
three conditions hold.

Recon found that nothing enforces those conditions mechanically:

- **No CI.** `.github/`, `.gitlab-ci.yml`, `.circleci` — none exist. Every gate
  (`build`, `test`, `lint`, playtest, e2e) is a thing an agent *remembers* to
  run. Nothing prevents a push from a red tree.
- **No git hooks.** `.git/hooks/` holds only `.sample` files; `core.hooksPath`
  is unset. `check-push-range.sh` — the script born precisely because the
  clean-range rule was violated once already — is a script an agent must
  *choose* to invoke.

Our own `AGENTS.md` states the principle: **"A safety check the agent types from
memory is not a check."** That argument was written about the range check, but it
applies verbatim to the entire gate stack. We corrected one instance of the
general problem and left the general problem in place.

The course's `clear`/`compact` discipline (§3.3) *depends* on the durable state
being trustworthy. If the gate is advisory, "clear and trust the ledger" is
trusting a record that nothing verified.

**Concrete change, smallest version that closes it:** put `check-push-range.sh`
in the pre-push hook path and pin the slice gate as an npm script, so the
default command is an artifact rather than a typed string:

```json
"verify": "npm run build && npm run test && npm run lint",
"typecheck": "tsc -b --noEmit"
```

**Do now vs later:** the `verify` script is 2 minutes. The hook is ~15 minutes.
Full CI is a later project — the hook closes most of the gap for a
single-machine, single-writer factory.

---

## 4. What the factory does better — keep doing it

Worth writing down so it isn't eroded by course enthusiasm:

1. **Three review lanes beat the course's one.** The course's `code-review`
   skill runs two subagents (standards + spec) and calls it done. We run an
   agent reviewer, an independent `ocr` CLI with machine-enforced rules, *and* a
   deterministic verifier — plus a headless playtest lane. The course has
   nothing like the playtest lane and explicitly notes that its agent had **no
   good feedback loop for the running UI** (ep. 64), which is why its UI bugs
   survived review. We should not trade that away.
2. **Live DB verification after apply.** The course's database is a local SQLite
   file. Ours is live Supabase with real family data, and our live checks have
   caught real regressions the unit gates could not (`42P17` self-referencing
   RLS, the 0045 radius inconsistency). This is a genuine capability the course
   has no answer for.
3. **The escalating fix loop** (rounds 4–5 change the *model*, not the count) is
   more sophisticated than anything in the course — the course never addresses
   what to do when builder and reviewer are siblings of the same model.
4. **Local coders.** The course's economics (ep. 2, 16) are built around
   $100–200/month subscriptions because it has no local inference. Our
   subagents run on owned hardware. The course's cost advice largely does not
   apply to us.
5. **The ledger.** The course's answer to compaction is "compact well". Ours is
   an append-only ledger that survives it. Better.

---

## 5. What to explicitly ignore from the course

Naming these prevents drift:

- **Its harness-specific config** (`.claude/settings.json` keys, `/model`,
  Ctrl-B backgrounding, auto-mode classifier). DSH/opencode differ; the
  *principle* — know what's in your payload — transplants, the keystrokes don't.
- **Its cost model.** Subscription vs API pricing, prefix-cache billing, effort
  min-maxing (ep. 16, 18, 19). Irrelevant to a local-inference shop, and the
  course itself says don't min-max effort.
- **Auto-memory = auto-sediment** (ep. 56) — we already have no auto-memory, and
  the course agrees with that. No action.
- **`/goal` instead of tickets** (ep. 67) — the course rejects it, and we already
  don't use `goal` for slices. Confirmation, not a change.
- **Specs as a permanent source of truth** (ep. 65) — the course says archive
  them once the code lands. Our `.scratch/<feature>/` tickets are already
  ephemeral. Good as-is.

---

## 6. Ranked change list — ALL IMPLEMENTED 2026-09-21

Everything below is now in the repo, verified. See §8 for the evidence.

### Done now (items 1–4)

1. ✅ **Pinned the gate as artifacts** — `npm run verify`
   (`build && test && lint && steering-lint`) and `npm run typecheck`, plus a
   real pre-push hook (`scripts/git-hooks/pre-push`, tracked via
   `core.hooksPath` + `scripts/install-git-hooks.sh`).
2. ✅ **Pruned `AGENTS.md`** — 3,150 → 1,660 words; four docs extracted
   (`auto-push.md`, `browser-lanes.md`, `coordinator.md`, `model-routing.md`).
3. ✅ **Slice-budget line** added to `plan.template.md`, citing the 98k window.
4. ✅ **`.scratch/context-load.sh`** kept, corrected, and used to prove the win.

### Done next (items 5–7)

5. ✅ Phase-boundary decision table lives in `docs/agents/coordinator.md`;
   `task-state.template.md` gained a `## Phase boundaries` section.
6. ✅ `task-state.template.md` slices table gained a **Tokens** column.
7. ⏳ **Outstanding — human/process, not code.** Run `/grill-me` at the front of
   the next batch. Nothing in the repo can enforce this; it is a habit change.

### Done later (items 8–10)

8. ✅ **`routes.json` armed** — 8/8 entries now assert. Public routes assert
   their own copy; the five auth-gated routes honestly assert `"Sign in"`
   (the gate redirects), rather than pretending to cover the page.
9. ✅ **`scripts/steering-lint.sh`** — covers `ocr`'s blind spot (pointers,
   size ceilings, reachability, no-op candidates). Wired into `npm run verify`.
10. ✅ The "symptom → cause" pointer discipline landed as the
    **"Where the rest lives"** table in `AGENTS.md`.

---

## 8. Verification evidence (2026-09-21)

Nothing in this list is a claim from memory — each was run on the final tree.

| Change | Evidence |
|---|---|
| `npm run verify` | exit 0 — build ok, **952 tests / 26 files pass**, oxlint 0 errors, steering-lint PASS |
| `npm run typecheck` | exit 0 (standalone `tsc -b --noEmit`) |
| Pre-push hook blocks a dirty range | Reproduced in a throwaway repo: committing `supabase/.temp/linked-project.json` → hook exit 1, *and `FAST_PUSH=1` could not bypass it* |
| Pre-push hook blocks a red gate | Injected `"verify": "exit 7"` → hook exit 1, push refused |
| Pre-push hook passes when clean+green | exit 0 |
| Hook skips non-master pushes | exit 0 without running the gate |
| `routes.json` assertions are TRUE | Playtest lane: **8/8 routes PASS, 0 JS errors** |
| `routes.json` assertions actually BITE | Negative control: a deliberately false needle correctly **FAILed** the run |
| Steering lint catches real rot | Injected a pointer to a nonexistent doc → FAIL; restored → PASS |
| Context-load win | Always-on payload **5,594 → 3,221 tokens** (−42%); `AGENTS.md` 3,150 → 1,660 words (−47%) |

### Two things found while verifying (recorded, not hidden)

- **The playtest lane had undocumented prerequisites.** `playtest_check.py`
  launches neither Chrome nor a server, `websocket-client` is absent from the
  system Python, Chrome needs `--remote-allow-origins` or the CDP handshake
  403s, and `--out` must pre-exist or the run dies *after* doing all the work.
  All four are now documented in `docs/agents/playtest-lane.md` — a lane whose
  invocation is tribal knowledge is a lane that silently stops running.
- **`pkill -f` bit me during this session, exactly as the repo warns.** Killing
  Chrome by pattern matched my own shell and killed the tool call. The repo's
  own rule (kill the listener *by port*) is correct and is now the documented
  form in the playtest doc.

---

## 9. The one-line summary

The course is a well-argued case that **context is the budget**, and our factory
did not measure that budget — it does now, at 3% of the window.

The most valuable finding, though, is one the course could not have given us:
**our verification stack was excellent and entirely voluntary.** It is now
enforced by a hook, and the gate is a single artifact (`npm run verify`) rather
than a string an agent retypes from memory.
