# Slice 8b — mechanical determinism + the guard findings adjudicated in from 8a

Builder: `orchestrator-builder` (fresh context). Branch `Meisburg/onboarding`.
Base measured at `aa331d0` (the dispatch tip). This report is written FIRST and appended as produced.

**Scope, and where it came from.** The dispatch names two artifacts: `.scratch/v28/briefs/slice-8b.md`
(items 1 and 2 only — the trailing-newline sweep then its guard, and `scripts/slice-diff.sh`) **plus every
guard finding adjudicated in from slice 8a** (D-031, enumerated in `factory/work/v28-r2-8b.json`). This
document is `slice-8b` in that three-way split; the other two briefs are other slices (see the section
"What the three brief variants are for", below).

## The three brief variants — what each is for, and which is authoritative

| brief | subject | report | mine? |
|---|---|---|---|
| `slice-8b.md` | the ORIGINAL document: 219 lines, seven workstreams, ten top-level sections. Its own `⚠️ SCOPE CUT` header says **do only items 1 and 2** (newline sweep + its guard; `scripts/slice-diff.sh`) and that every other section "is someone else's turn". | this file | **YES — items 1 and 2, plus the inherited 8a guard findings from the dispatch.** |
| `slice-8b-2.md` | the TEST-HONESTY half: the Enter-key guard spec (item A), the failed-upload route-abort spec (item B), the two honesty fixes in `e2e/name-card-photo.e2e.ts` (item C). | `.scratch/v28/reports/slice-8b-2.md` | no |
| `slice-8b-3.md` | the CODE-FIX half: `useCropStep`'s `onConfirm` `\| void` (item A), the unguarded post-unmount effect (item B), the five honesty fixes slice 3's fix round left behind (item C). | `.scratch/v28/reports/slice-8b-3.md` | no |

**Authoritative for my scope:** `slice-8b.md` as constrained by its own SCOPE CUT (items 1 + 2), **plus** the
guard findings the dispatch explicitly registers here. The other two briefs are separate work items and I did
not touch their subjects — the only file they share with me is `scripts/guards/run-all.sh` (not protected),
which item 1 requires me to edit.

## Item table

*(appended as each item lands — symbol, re-measured line, change, proving command, raw result)*

### Item 1 — the trailing-newline sweep, then its guard, in that order

**Re-measured line numbers: none — this item has no line anchors. It has a COUNT, and the count was wrong
three ways in three documents.**

| source | count | scope | verdict |
|---|---|---|---|
| the dispatch | 65 | — | stale |
| `slice-8b.md` | 78 | `src/` 44, `e2e/` 21, `scripts/` 13 | stale breakdown |
| ledger's own correction | 79 | `src/` 44, `e2e/` 22, `scripts/` 13 | stale breakdown |
| **measured here at `aa331d0`** | **78** | **`src/` 45, `e2e/` 20, `scripts/` 13** | **used** |

Scope question, decided by measurement, not preference: the scan set is the repo's **code tree** —
`src/`, `e2e/`, `scripts/` (323 tracked files). Repo-wide over *all* tracked text files the number is **166**,
and the extra 88 are `.scratch/**` history (61), `supabase/migrations` (20), `docs/agents` + `.opencode/agents`
(9), and eight root files. Two of those root files are `vite.config.ts` and `playwright.config.ts`, which are
PROTECTED check configs: sweeping them would leave `config-guard` red against the merge-base forever, which is
the opposite of "the guard goes green after the sweep". The guard therefore states that boundary in its header
rather than pretending to a scope it does not read.

**Commit A — the sweep.**

```
$ node /tmp/sweep.mjs
files to sweep: 78
swept: 78
$ git show --stat --oneline d75c5e9 | tail -1
 78 files changed, 78 insertions(+), 78 deletions(-)
$ git diff -w --stat          # whitespace-only proof
(empty)
$ git diff --numstat | awk '$1!=1 || $2!=1'
(empty)                        # every file is exactly +1/-1
```

Committed as: **`d75c5e9`** — `8b item 1, commit A: the trailing-newline sweep`. Exactly the 78 files; the
report you are reading was not in it (it was untracked at that moment).

**Commit B — the guard `scripts/guards/trailing-newline-guard.mjs` (+ its `.check.mjs`).**

Registered in BOTH hard-coded places in `scripts/guards/run-all.sh`: the `for guard in …` list and the
`run_check` block. `.check.mjs`, never `.test.mjs` (a top-level `process.exit()` in a `*.test.mjs` kills the
vitest run).

Pre-fix proof, run against the real pre-sweep tree (`git worktree add --detach /tmp/prefix-tree aa331d0`):

```
$ node scripts/guards/trailing-newline-guard.mjs /tmp/prefix-tree
  323 text file(s) read, 0 empty …, 0 binary …
  FINDING: e2e/address-maps.e2e.ts — no newline at end of file
  …
PRE-FIX EXIT=1
$ grep -c "FINDING:" /tmp/prefix.out
78
$ grep "FINDING:" /tmp/prefix.out | sed 's#.*FINDING: ##; s#/.*##' | sort | uniq -c
     20 e2e
     13 scripts
     45 src
```

The guard's own run on the swept tree, and its behavior checker (seed + mutation for the file rule AND for the
D-030 empty-scan rule):

```
$ node scripts/guards/trailing-newline-guard.mjs
  325 text file(s) read, 0 empty …, 0 binary …
PASS — the newline convention holds across the scan set.
GUARD EXIT=0
$ node scripts/guards/trailing-newline-guard.check.mjs
  ✓ a text file with no newline at EOF is CAUGHT and named
  ✓ MUTATION: dropping the last-byte test lets that seed PASS (so check 1 can fail)
  ✓ control: a text file WITH its newline passes
  ✓ control: an empty file and a binary file are counted, not read as text and not failed
  ✓ an EMPTY scan is a FINDING (D-030: zero is not health)
  ✓ MUTATION: dropping the empty-scan test lets that seed PASS (so check 4 can fail)
  ✓ an UNTRACKED text file is read (git --others, not just the index)
  ✓ control: a file OUTSIDE the scan set does not fire the rule
PASS — all 8 checks: the guard fires on the defect and only on it.
CHECK EXIT=0
```

Committed as: **see commit B below.**

### Item 2 — `scripts/slice-diff.sh`

**Re-measured anchors: the brief's claim that the file is missing is CONFIRMED** (`ls scripts/slice-diff.sh`
→ `No such file or directory` at `aa331d0`). No line numbers to re-measure.

The tool takes a SLICE NAME, not a base: it reads the ledger's `dispatched (base <sha>)` line, prints the
resolved range in its header, and refuses rather than guessing.

```
$ bash scripts/slice-diff.sh 8b        # no base recorded for 8b — must refuse
slice-diff: REFUSING — the ledger records no `dispatched (base <sha>)` line for slice '8b'.
  A diff needs a base that was written down when the slice started; this tool will not invent one.
  dispatch line(s) found for this slice, none naming a base:
    7274:Slice 8b: dispatched. Scope = .scratch/v28/briefs/slice-8b.md …
EXIT=1
$ bash scripts/slice-diff.sh 1 -- scripts/guards/run-all.sh | head -3
slice-diff: slice '1'  range '15ada15..3bd7eb3fae2aa4a77c0f4213749cae4d341e84f5'
            base '15ada15' read from .scratch/v28/ledger.md (dispatch time, not typed now)
===========================================================
$ for id in 1 3 6c 8a 8b; do bash scripts/slice-diff.sh "$id" 2>&1 | head -1; done
slice-diff: slice '1'  range '15ada15..3bd7eb3f…'
slice-diff: slice '3'  range 'c9ab382..3bd7eb3f…'
slice-diff: slice '6c'  range '68080b0..3bd7eb3f…'
slice-diff: REFUSING — the ledger records no `dispatched (base <sha>)` line for slice '8a'.
slice-diff: REFUSING — the ledger records no `dispatched (base <sha>)` line for slice '8b'.
```

Boundary measured, not assumed: `6c` has several dispatch lines but only ONE carries `(base …)`; the tool
resolves it. A slice with two different recorded bases is a REFUSAL, not a coin-flip. The tool is named in
`docs/agents/code-structure.md` under a new "How a diff is inspected", because a tool the next reviewer does
not know about is a tool nobody runs.

Committed as: **see commit 3 below.**

### Item 3 — `lib-sibling-guard.sh` passes at `checked=0` (registered D-030 instance)

**Re-measured:** the hole is LIVE at `aa331d0`. `scripts/guards/lib-sibling-guard.sh:53-56` returned
`SKIP — src/lib not found` / `exit 0`, and `:105` printed `ok — all $checked non-exempt module(s)…` with
`checked=0` when every entry was exempt or a test. The line numbers moved with this edit, so the anchors
below are the symbol, not the number.

**Fix:** a missing `src/lib` is now a FINDING (was a `SKIP … exit 0`), and `checked=0` after the loop is a
FINDING. Both are the D-030 rule: the guard had examined nothing and reported health.

```
$ bash scripts/guards/lib-sibling-guard.sh          # real repo: 55 non-exempt modules
  ok — all 55 non-exempt module(s) have a sibling .test.ts
PASS — build law holds.
EXIT=0
$ node scripts/guards/lib-sibling-guard.check.mjs
  ✓ a module with no sibling test is CAUGHT and named
  ✓ MUTATION: dropping the missing-sibling test lets that seed PASS (so check 1 can fail)
  ✓ control: a module WITH its sibling passes and the run says what it read
  ✓ a module on the EXEMPT list is skipped, not failed
  ✓ the exempt-only root really did examine zero modules (the premise check 4 asserts)
  ✓ MUTATION: dropping the empty-scan test lets that seed PASS (so check 4 can fail)
  ✓ a MISSING src/lib is a FINDING, not a SKIP
PASS — all 7 checks: the guard fires on both defects and only on them.
EXIT=0
```

The new `lib-sibling-guard.check.mjs` is registered in the `run_check` block of `run-all.sh`. Two mutation
anchors were corrected while writing this (the first two tried to mutate the *printing* of the failure rather
than its *detection*, so the seed stayed red and the mutation proved nothing — a mutation that does not flip
its seed is not a mutation).

Committed as: **see commit 4 below.**

### Item 4 — `factory-guard.mjs`'s report/brief scan passed at `reportFiles: 0` (registered D-030 instance)

**Re-measured:** the hole is LIVE at `aa331d0`. The early return was at
`scripts/guards/factory-guard.mjs:1403-1406` (symbol: the `if (!files.length)` guard in
`checkReportHeadCounts`) — it printed `no .scratch/v28/reports or briefs under this root; … unchecked here`
and `count-provenance: … unchecked here`, returned `{ reportFiles: 0, provenanceChecked: false,
transcriptsChecked: false }` — **omitting `rawSummaryLines` entirely**, so by round 5 the early return silently
covered FOUR rules while naming three (the registered "now covers three" was already one short).

**Fix:** the empty scan is a FINDING (`report-scan-empty`), and the return carries `rawSummaryLines: 0` so the
destructuring sees every rule's result. The two "unchecked here" comfort notes are deleted, not restated
(D-028) — the finding carries the explanation.

The harness consequence, disclosed: every throwaway root the behavior checker builds must now actually carry a
report, or every check in it would find `report-scan-empty`. `run()` seeds one clean, claim-free report per
root by default; `report: false` is the seam that reaches the empty state for the new seed. That is one change
in one place rather than a hundred.

```
$ node scripts/guards/factory-guard.check.mjs        # 104 checks before this item
  …
  ✓ a report/brief scan that read no file is a FINDING, not a pass (D-030)
  ✓ MUTATION: dropping the empty-scan finding lets that seed PASS (so the check can fail)
  ✓ control: the same clean root WITH a report file passes (so the rule is not simply always red)

factory-guard check: all 107 checks passed.
EXIT=0
```

Committed as: **see commit 5 below.**

