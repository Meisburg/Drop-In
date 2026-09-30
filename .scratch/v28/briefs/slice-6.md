# Slice 6 — `skipLabel` stops lying, and two guards so these classes cannot recur

You are `orchestrator-builder`. **Read `docs/agents/code-structure.md` before writing anything.**
Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
**Read `plan.md` §6 slice 6** — this brief is a pointer with measurements.

## Part 1 — the lie, and the fix is TRUTHFULNESS, not a redesign

The module says `skipLabel: 'Skip for now'` (`src/lib/firstRunCopy.ts:48`), the test pins only that
it is non-empty (`firstRunCopy.test.ts:28`), and **the UI renders the hard-coded word `Skip`**
(`src/components/FirstRunCard.tsx`, the Skip control) — so the module's field is read by nobody and
describes words that never appear.

**Keep the rendered word `Skip`.** Make the module say `Skip`, and make the control read it.

**The mechanism is decided by the file's own documented design.** `FirstRunCard.tsx`'s header says
the primary label **"is a PROP, so the caller keeps its own copy ("Continue") — the chrome renders
it, it never composes it"**. So `skipLabel` becomes **a prop, symmetrically**, passed by the caller
the same way `primaryLabel` is — not the chrome reaching into the copy module. Match that existing
shape; do not invent a second convention for the same problem.

## Part 2 — the first guard: an unconsumed copy field is a defect

**This is the FOURTH instance of the class in this batch**, which is the batch's own rule for when a
guard is owed: *the second occurrence means build a guard, not another one-off fix.*

Rule: **every field of `FIRST_RUN_COPY` must be consumed somewhere in `src/`, or be explicitly
allowlisted in the guard.** A field nobody reads is a lie waiting to be told.

**How a guard is registered (measured, `scripts/guards/run-all.sh`):**
- Guards live in `scripts/guards/` as `.sh` or `.mjs` and are named in a **hard-coded `for guard in
  …` list** — a new guard that is not in that list **does not run**.
- Checkers are registered separately in the `run_check` block.
- **`.check.mjs`, NOT `.test.mjs`** — and the reason is load-bearing, spelled out in that file:
  `npm test` discovers `*.test.mjs`, and a top-level `process.exit()` inside the vitest runner kills
  the run.
- The bar the file sets for checkers: *"A rule whose own behavior is unchecked is a rule that can
  silently stop holding — a checker that matches nothing looks exactly like a clean repo."*
- And: *"Fix the cause; do not silence the guard. If a rule is genuinely wrong, change the rule file
  and say why in the commit."*

## Part 3 — the second guard, and ⚠️ THE TRAP THE PLAN DID NOT SEE

The planning defect was made **twice in an hour**: two acceptance criteria claiming a **zero over an
unscoped directory** — `rg "of 5" src/` (32 hits, only 21 the label; 10 are star ratings) and
`rg "hasPhoto" src/` (an unrelated local in `src/lib/places.ts:1070`). The checkable rule is: **a
zero-hit claim must not match in a file the document never mentions.**

### ⚠️ But the plan's mechanism would fire on its own documentation
The plan says the guard "extracts every acceptance grep line from `plan.md` and
`.scratch/v28/briefs/*.md`". **Measured: those docs QUOTE the bad greps as defects** —

| Where | What it says |
|---|---|
| `plan.md:239` | "⚠️ **A blanket `rg "of 5" src/` is NOT [scoped]**" |
| `plan.md:300` | "Measured today, `rg -n "middle name" src/` matches three files" |
| `.scratch/v28/briefs/slice-2.md:49` | "The plan's first acceptance was `rg -n "middle name" src/` → 0 hits. That criterion is itself a defect." |
| `.scratch/v28/briefs/explore-r2-restructure.md:65` | `rg -n "of 5" src/ e2e/` |

**A naive prose parser fails on the documentation of the rule it enforces** — and it would fail on
the brief that exists to explain the defect. That is not a nit; it is the difference between a guard
and a nuisance.

**RULED: the guard reads TAGGED claims only, on an explicit convention you define and document in the
guard's own header** — for example a line tag such as `ACCEPTANCE-GREP:` — so that a *claim* is
machine-distinguishable from a *quotation of a bad claim*. Then **retrofit the tag onto the real
acceptance greps in `plan.md` and the slice briefs**, and add to the guard the second, purely
syntactic rule that is the actual defect class: **a zero-hit claim's scope must name a path, not a
bare directory.** Both rules are deterministic; the prose parser is not.

## Acceptance (demonstrate each — the two-sided ones are the point)

1. The rendered Skip label and the module agree; `rg -n "skipLabel" src/` shows a **render** site,
   not just the module — i.e. **the module's field is read**.
2. The copy-field guard **passes on HEAD** and **fails when a field is made unconsumed** (seed it and
   show the failure).
3. `check-acceptance-greps.mjs` (in `scripts/guards/`, registered in both places) **passes on the
   current `plan.md` and briefs — which STILL QUOTE the three bad greps as defects** — and **fails on
   the two recorded pre-fix fixtures** (`of 5` and `hasPhoto`).
4. `run-all.sh` includes both new guards **and** both new `.check.mjs` checkers.
5. `npm run verify` exits 0 (guards run last), and each new `.check.mjs` exits 0 when run directly.

## Verify

`npm run verify`, plus each new `.check.mjs` run directly. **Targeted e2e only** — the Skip control is
ridden by `e2e/signup-zip-fallback.e2e.ts` and `e2e/onboarding-resume.e2e.ts`, both of which assert
the Skip button **by role and name**; if you change the rendered word, every such site breaks, which
is why the ruling is to keep it `Skip`. Kill listeners **by port**, never `pkill -f`.

**Two known flakes — re-run once before reporting either:** `scripts/guards/no-bypass-guard` and
`e2e/places.e2e.ts:2759`.

## Report format

- **Committed as: `<sha7>`** — or say plainly *"not committed"* and why; an absent field is read as
  evidence.
- Files changed with `+/-` counts.
- For each acceptance criterion: **the command and its raw output tail** — and for the guards, both
  halves: the passing run and the seeded failing run.
- **State the tag convention you chose and show one tagged claim and one untagged quotation**, so I
  can see the guard's boundary.
- `npm run verify`: exit code, test-file count, test count, lint counts.
- Anything the plan did not anticipate — **say it rather than quietly fixing it.**
