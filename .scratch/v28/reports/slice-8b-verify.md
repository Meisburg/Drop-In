# Slice 8b — INDEPENDENT VERIFICATION (fresh context)

Verifier: `orchestrator-verifier`. Working dir `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`.
Tip measured: `14403db8c3a3d04d3b7073c4ca6ab07132945db9` (branch `Meisburg/onboarding`), base `aa331d0`.
The builder's report (`.scratch/v28/reports/slice-8b.md`) was read first; everything below is RE-RUN, not repeated.
Tree was clean before and after (`git status --porcelain` empty). Nothing in the repo was modified by this
verification except this report file; worktrees were created under `/tmp` and removed.

**VERIFY: PASS**

## 1. `npm run verify` — re-measured

```
$ npm run verify
 Test Files  71 passed (71)
      Tests  2063 passed (2063)
  ok — AGENTS.md (1789 words, ceiling 1800)
PASS — steering layer is clean.
GUARDS: PASS — all deterministic rules hold.
VERIFY EXIT=0
$ grep -c ": warning " <verify output>   -> 81
$ grep -c ": error "   <verify output>   -> 0
```

| quantity | builder claimed | **I measured** | agree? |
|---|---|---|---|
| exit code | 0 | **0** | yes |
| test files | 71 | **71** (vitest) — independently `find src e2e scripts -name '*.test.ts*'` = **71** | yes |
| tests | 2063 | **2063** | yes |
| lint warning lines (`grep -c ": warning "`) | 81 | **81** | yes |
| lint errors | 0 | **0** | yes |
| AGENTS.md words vs 1800 | 1789 | **1789** (`ok — AGENTS.md (1789 words, ceiling 1800)`) | yes |
| GUARDS | PASS | **PASS — all deterministic rules hold.** | yes |

## 2. Guard runner + steering lint

```
$ bash scripts/guards/run-all.sh   ->  EXIT=0
===========================================================
GUARDS: PASS — all deterministic rules hold.
$ bash scripts/steering-lint.sh    ->  EXIT=0
Steering-layer lint — 25 file(s)
[2] Size ceilings (words)
  ok — AGENTS.md (1789 words, ceiling 1800)
PASS — steering layer is clean.
```

Both new guards are registered in BOTH hard-coded places of `run-all.sh`:
`:91 for guard in … trailing-newline-guard factory-guard; do` and
`:130/:140/:141 run_check "lib-sibling-guard (behavior)" / "trailing-newline-guard (behavior)" / "factory-guard (behavior)"`.

## 3. Check counts, counted independently (not from the summary line)

`grep -c` of the `✓` lines in each checker's own output, and the checkers' tail lines:

```
$ node scripts/guards/factory-guard.check.mjs       -> EXIT=0
  ✓ a report/brief scan that read no file is a FINDING, not a pass (D-030)
  ✓ MUTATION: dropping the empty-scan finding lets that seed PASS (so the check can fail)
  ✓ control: the same clean root WITH a report file passes (so the rule is not simply always red)
  factory-guard check: all 115 checks passed.
  count of "✓" lines = 115
$ node scripts/guards/trailing-newline-guard.check.mjs -> EXIT=0
  ✓ lines = 8   PASS — all 8 checks
$ node scripts/guards/lib-sibling-guard.check.mjs      -> EXIT=0
  ✓ lines = 7   PASS — all 7 checks
```

| checker | builder claimed | **I counted** | agree? |
|---|---|---|---|
| `factory-guard.check.mjs` | 115 (was 104) | **115** | yes |
| `trailing-newline-guard.check.mjs` | 8 | **8** | yes |
| `lib-sibling-guard.check.mjs` | 7 | **7** | yes |

## 4. THE HEADLINE CLAIM — the escape is closed (re-derived, both halves)

I built my own throwaway roots under `/tmp/esc-8b/` (nothing touched in the repo). Each root carries
`factory/config.json` (the real one), one complete `factory/work/w1.json`, `notes/evidence.md`, and a report
`.scratch/v28/reports/zz.md` holding a FABRICATED transcript: `✓ 7–13 zz-spec.e2e.ts (all six legs)` — the
range spans 7 entries, the text claims six. Four shapes:

- **r1** — a `>` block under the label: `proof — raw:` then a blank line then `> ✓ 7–13 … (all six legs)`
- **r2** — the whole block quoted, label included: `> proof — raw:` / `>` / `> ✓ 7–13 … (all six legs)`
- **r3** — a `>` between the label and the summary: label, blank, `> a quote`, blank, `> ✓ 7–13 … (all six legs)`
- **r4** — an agreeing block AND a quoted fabrication in the same root: fenced `✓ 1–2 a.e2e.ts (all two legs)`,
  then `also — raw:` then `> ✓ 7–13 … (all six legs)`

`PRE-FIX` = the base binary, extracted with `git show aa331d0:scripts/guards/factory-guard.mjs` (1729 lines).
`CURRENT` = `scripts/guards/factory-guard.mjs` at the tip `14403db`. Both invoked identically:
`node <guard> --root <root> --repo <repo>`.

**ALL EIGHT RESULTS, RAW:**

```
########## r1 PRE-FIX ##########
  note — transcript-summary-agrees: 0 raw-labelled block(s) read, 0 range summaries checked — NOTHING was checked: no range summary inside a raw-labelled block exists in this scan
PASS — the registry can be trusted and no work item claims evidence it does not have.
PRE-FIX RAW EXIT=0

########## r1 CURRENT ##########
  note — transcript-summary-agrees: 1 raw-labelled block(s) read, 1 range summary checked
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz.md:5: a raw block's summary line covers 7 entries (7–13) but states "(all six" — a block claiming to be raw must reproduce its own arithmetic
FAIL — 1 factory finding(s).
CURRENT RAW EXIT=1

########## r2 PRE-FIX ##########
  note — transcript-summary-agrees: 0 raw-labelled block(s) read, 0 range summaries checked — NOTHING was checked: no range summary inside a raw-labelled block exists in this scan
PASS — the registry can be trusted and no work item claims evidence it does not have.
PRE-FIX RAW EXIT=0

########## r2 CURRENT ##########
  note — transcript-summary-agrees: 1 raw-labelled block(s) read, 1 range summary checked
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz.md:5: a raw block's summary line covers 7 entries (7–13) but states "(all six" — a block claiming to be raw must reproduce its own arithmetic
FAIL — 1 factory finding(s).
CURRENT RAW EXIT=1

########## r3 PRE-FIX ##########
  note — transcript-summary-agrees: 0 raw-labelled block(s) read, 0 range summaries checked — NOTHING was checked: no range summary inside a raw-labelled block exists in this scan
PASS — the registry can be trusted and no work item claims evidence it does not have.
PRE-FIX RAW EXIT=0

########## r3 CURRENT ##########
  note — transcript-summary-agrees: 1 raw-labelled block(s) read, 1 range summary checked
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz.md:7: a raw block's summary line covers 7 entries (7–13) but states "(all six" — a block claiming to be raw must reproduce its own arithmetic
FAIL — 1 factory finding(s).
CURRENT RAW EXIT=1

########## r4 PRE-FIX ##########
  note — transcript-summary-agrees: 1 raw-labelled block(s) read, 1 range summary checked
  ok — … every step-range summary inside a raw-/verbatim-labelled block agrees with its own "all N" count (the range shape only — see transcript-summary-agrees's ceiling)
PASS — the registry can be trusted and no work item claims evidence it does not have.
PRE-FIX RAW EXIT=0        <-- THE COVERAGE CLAIM PUBLISHED OVER THE FABRICATION

########## r4 CURRENT ##########
  note — transcript-summary-agrees: 2 raw-labelled block(s) read, 2 range summaries checked
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz.md:11: a raw block's summary line covers 7 entries (7–13) but states "(all six" — a block claiming to be raw must reproduce its own arithmetic
FAIL — 1 factory finding(s).
CURRENT RAW EXIT=1
```

(The `ok —` line above is trimmed to the clause that matters; the full line in r4 PRE-FIX is the one sentence
naming `every step-range summary inside a raw-/verbatim-labelled block agrees with its own "all N" count`.)

**VERDICT ON THE ESCAPE: CLOSED, independently reproduced. Pre-fix 4/4 PASS (r1–r3 saying `0 … NOTHING was
checked`, r4 publishing its claim), current 4/4 FAIL with `covers 7 entries`.**
No fabricated shape still passes. Two extra probes I added on top of the brief:

- **control r5** (`> ✓ 7–13 zz-spec.e2e.ts (all seven legs)`, an AGREEING quote): CURRENT `1 raw-labelled
  block(s) read, 1 range summary checked` → **PASS, exit 0**. So the current guard is not "any quote fails".
- **live corpus**: `node scripts/guards/factory-guard.mjs` → `note — transcript-summary-agrees: 16 raw-labelled
  block(s) read, 0 range summaries checked …`, `PASS`, exit 0. The 8 → 16 read-count claim is reproduced; the
  rule's live signal is still 0 comparisons (the builder says so; it is still true).

**Bonus re-derivation of the D-030 hole (item 4), since it is the same rule set.** Same root, with NO
report/brief file:
```
PRE-FIX : note — no .scratch/v28/reports or briefs under this root; report and brief counts unchecked here
          PASS, exit 0                     <- the hole was LIVE at aa331d0
CURRENT : FINDING [report-scan-empty]: the report/brief scan read no .md file under … (D-030)
          FAIL — 1 factory finding(s), exit 1
```

## 5. The sweep's own proof — ORDER, reproduced

Worktree at the sweep's PARENT: `git worktree add --detach /tmp/prefix-tree aa331d0` (`git rev-parse d75c5e9^`
= `aa331d03c55a21ac10901519f25c059ea4cf6716`, i.e. the parent is exactly the base).

```
$ node scripts/guards/trailing-newline-guard.mjs /tmp/prefix-tree      # NEW guard against PRE-SWEEP tree
Trailing-newline guard — src/, e2e/, scripts/ read via git ls-files
  323 text file(s) read, 0 empty …, 0 binary …
  FINDING: e2e/address-maps.e2e.ts — no newline at end of file
  FINDING: src/pages/OnboardingPage.tsx — no newline at end of file
  …
FAIL — 78 trailing-newline finding(s).
PRE-SWEEP EXIT=1
$ grep -c "FINDING:" /tmp/prefix-guard.out
78
$ grep "FINDING:" /tmp/prefix-guard.out | sed 's#.*FINDING: ##; s#/.*##' | sort | uniq -c
     20 e2e
     13 scripts
     45 src

$ node scripts/guards/trailing-newline-guard.mjs                        # NEW guard against the swept tree (tip 14403db)
  327 text file(s) read, 0 empty …, 0 binary …
  ok — every one of the 327 text file(s) in the scan ends with a newline
PASS — the newline convention holds across the scan set.
POST-SWEEP EXIT=0

$ node scripts/guards/trailing-newline-guard.mjs /tmp/sweep-tree        # and at the sweep commit itself
  323 text file(s) read …
PASS — the newline convention holds across the scan set.
SWEEP-TREE EXIT=0
```

- **78 findings, exit 1, `src` 45 / `e2e` 20 / `scripts` 13 — reproduced exactly**, from the guard at the tip
  `14403db` against the pre-sweep tree.
- The guard **goes green on the post-sweep tree** (exit 0 at the tip `14403db`) and was already green **at the sweep commit
  `d75c5e9` itself** — i.e. it would have been green from birth had the two landed together, and it is not
  red-on-arrival.
- **Ordering confirmed:** `d75c5e9` (sweep, commit A) is the first commit after `aa331d0`;
  `3bd7eb3` (guard + checker) is second (`git log --diff-filter=A` for the guard file names only `3bd7eb3`).
- **The 78 files were not touched again** after the sweep: `git diff --name-only d75c5e9..14403db` ∩ (sweep's 78)
  = **(empty)**.

**"ONLY appended newlines" — checked per-file, all 78 (not a sample).** For every file in the commit I rebuilt
`parent-content + "\n"` and `cmp`'d it against the committed content, and separately asserted the new file ends
in exactly one `0a` byte:

```
files in commit: 78
non-append-only files: 0          # for ALL 78: new == old + exactly one "\n", old had no trailing newline
$ git diff --numstat d75c5e9^ d75c5e9 | awk '$1!=1 || $2!=1'
(empty)                           # every file exactly +1/-1
$ git diff -w --stat d75c5e9^ d75c5e9
(empty)                           # whitespace-insensitive diff is empty
$ git show --pretty=format: --name-only d75c5e9 | grep -vE '^(src|e2e|scripts)/'
(none)                            # no report, no config, no file outside the declared scan set
$ git show --stat --oneline d75c5e9 | tail -1
 78 files changed, 78 insertions(+), 78 deletions(-)
```

Sample raw diff (representative of the shape every file has):
```
e2e/address-maps.e2e.ts   (content lines only; hunk header elided, see the note below)
-})
\ No newline at end of file
+})
src/pages/OnboardingPage.tsx   (content lines only)
-}
\ No newline at end of file
+}
```
**No file in the sweep shows any change other than the appended newline.** None.

*(The raw hunk headers are elided in that excerpt, not paraphrased: a pasted `,N @@` hunk line is itself a
bare-HEAD count under this repo's factory guard (the `@` revision token), and pasting one into this report
would make the gate red on its own verification record. The content lines above are pasted verbatim from
`git --no-pager diff d75c5e9^ d75c5e9 -- <path>`.)*

## 6. `scripts/slice-diff.sh`

```
$ bash scripts/slice-diff.sh 8b
slice-diff: REFUSING — the ledger records no `dispatched (base <sha>)` line for slice '8b'.
  A diff needs a base that was written down when the slice started; this tool will not invent one.
  dispatch line(s) found for this slice, none naming a base:
    7274:Slice 8b: dispatched. Scope = .scratch/v28/briefs/slice-8b.md …
EXIT=1

$ bash scripts/slice-diff.sh 1 -- 3bd7eb3fae2aa4a77c0f4213749cae4d341e84f5
slice-diff: slice '1'  range '15ada15..14403db8c3a3d04d3b7073c4ca6ab07132945db9'
            base '15ada15' read from .scratch/v28/ledger.md (dispatch time, not typed now)
===========================================================
(diff restricted to: -- 3bd7eb3fae2aa4a77c0f4213749cae4d341e84f5)
EXIT=0
```

- The refusal is a **refusal**: exit 1, a reason, and the dispatch lines it found — **not** a silent success
  with empty output (a silent success would be exit 0; it is 1, and the reason is on stdout/stderr).
- `-- <sha>` prints the resolved range and exits 0, as specified. Also `1 / 3 / 6c` resolve
  (`15ada15..14403db`, `c9ab382..14403db`, `68080b0..14403db`) and `8a` refuses for the same no-base reason.
- The tool is not inert: `bash scripts/slice-diff.sh 1 -- scripts/guards/run-all.sh` exits 0 and prints a real
  87-line, 4-hunk diff, byte-identical in header to `git --no-pager diff 15ada15..14403db -- scripts/guards/run-all.sh`.

## Discrepancies named (numbers I measured that differ from something written down)

1. **Text-file count in the scan set: builder wrote "325 text file(s) read"; I measure 327 at the tip `14403db`.** Cause is
   benign and re-derivable: the scan set is `src/ e2e/ scripts/` read via `git ls-files`, and two files were
   added to `scripts/` AFTER the moment the builder took that number (`ccd9c19` added
   `scripts/slice-diff.sh`; `6cef89d` added `scripts/guards/lib-sibling-guard.check.mjs`). 323 at `aa331d0`,
   325 at `3bd7eb3`, 327 at the tip `14403db` — all three are the same claim at three times. **No effect on any verdict.**
2. **`bash scripts/slice-diff.sh 1 -- <sha>` exits 0 with an EMPTY diff body.** The script forwards trailing
   args to `git diff` as a PATHSPEC, so a 40-hex sha matches no path and git prints nothing, exit 0. The
   specified behaviour ("prints a range and exits 0") holds, and the exit code here is therefore a range-
   resolution signal, not a diff-content signal. Flagged so nobody reads that exit 0 as "a diff was produced";
   the real-path invocation above is the one that produces the diff. This is a note, not a blocking finding.
3. Nothing else differs. Every count in the builder's per-item table that I could re-derive (115 / 8 / 7 /
   71 / 2063 / 81 / 0 / 1789 / 78 / 45 / 20 / 13) I re-derived to the same number.

## Residual risks / notes

- The rule's live signal is still **0 range summaries compared** on this corpus (16 labelled blocks read). The
  escape proof is therefore a **seeded** proof; that is inherent to the rule, not a defect of this slice.
- The `transcript-summary-agrees` label form is narrower than the dispatch asked (mid-line `verbatim` prose is
  not read). The builder declared this and measured why widening makes the live corpus red. I did not
  re-measure the widening (out of the brief's scope) — the declaration itself is accurate about the mechanism.
- `/tmp/rev-prefix` (a worktree at `aa331d0`) already existed when I started; it is not mine and I left it.
  My two worktrees (`/tmp/prefix-tree`, `/tmp/sweep-tree`) were removed and `git worktree prune` run; the repo
  tree is clean and the tip unchanged at `14403db`.
- No inference server was started or stopped; nothing was pushed; `npm run verify` wrote only to gitignored
  build/test output (`git status --porcelain` empty after).

**Post-report gate check.** A verification record is itself scanned by the factory guard, so I re-ran the gates
AFTER writing this file: `bash scripts/guards/run-all.sh` -> `GUARDS: PASS`, exit 0, and
`node scripts/guards/factory-guard.mjs` -> `PASS`, exit 0, with a note (not a finding) that this report is
UNTRACKED, so its counts live in the working tree until it is committed. The first draft of this file DID make
the gate red: the factory guard flagged counts attached to a bare revision label, and two pasted hunk headers.
Neither survives here — the tip commit is named explicitly (`14403db`) and hunk headers are elided on purpose,
as the note above says.

**VERIFY: PASS** — every number in the brief re-measured; the escape is closed on a re-derived proof; the
sweep's order and whitespace-only claim hold; `slice-diff.sh` refuses correctly; no blocking finding.
