# Slice 6d — independent verification (verifier lane)

**VERIFY: PASS**

- Repo: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding` (branch `Meisburg/onboarding`)
- Slice implementation commit: `248d897`; current HEAD: `587a901` (differs from `248d897` only in `factory/work/v28-r2-6d.json`)
- Method: read-only. All mutation experiments ran in throwaway copies under `os.tmpdir()` / `git archive` extracts. No repo file was edited; no server started; nothing pushed.

---

## 1. `npm run verify` → EXIT=0

Raw tail of the full gate:

```
factory-guard check: all 90 checks passed.

===========================================================
GUARDS: PASS — all deterministic rules hold.
```

Re-measured numbers, each read out of the same run log:

| metric | measured |
|---|---|
| Test Files | `Test Files  71 passed (71)` |
| Tests | `Tests  2068 passed (2068)` |
| lint warnings (`grep -c ': warning '`) | **81** |
| lint errors (`grep -c ': error '`) | **0** |
| AGENTS.md steering-lint | `ok — AGENTS.md (1789 words, ceiling 1800)` |
| `FINDING` lines in the whole gate | **0** |
| guards verdict | `GUARDS: PASS — all deterministic rules hold.` |

Lane order confirmed in the log: `build && test && lint && a11y:focus && steering-lint && guards`.
`a11y:focus` printed `PASS — every control that suppresses its outline provides a focus cue`;
`steering-lint` printed `PASS — steering layer is clean.`

## 2. `bash scripts/guards/run-all.sh` → EXIT=0

```
factory-guard check: all 90 checks passed.

===========================================================
GUARDS: PASS — all deterministic rules hold.
```

Checker summaries read from that run:

```
copy-field-consumption-guard check: all 48 checks passed, 0 failed, across 33 guard invocations...
copy-taxonomy-guard check: all 23 checks passed, 0 failed, across 22 guard invocations (6 of them against a mutated copy of the guard).
check-acceptance-greps check: all 14 checks passed.
no-bypass-guard check: all 6 checks passed (the stated blind spot is proven, not asserted).
regexp-escape-guard check: all 12 checks passed.
factory-guard check: all 90 checks passed.
```

## 3. `node scripts/guards/copy-taxonomy-guard.mjs` → EXIT=0

```
  taxonomy: src/lib/places.ts
  kinds read: 10; offered: 8; words: 9
  scanned words: 9 (Park, Playground, Indoor play, Museum, Pool, Splash pad, Library, Beach, Trail)
  limit—— kind "other" is not scannable: its word resolves to the label function's own default, ...
  module: src/lib/firstRunCopy.ts
  copy consts read: 2 of 2 named; declared claims: 0 (none)
  module: src/lib/firstRunTour.ts
  copy consts read: 4 of 4 named; declared claims: 3 (playground, pool, beach)
  module: src/lib/push.ts
  copy consts read: 1 of 1 named; declared claims: 0 (none)
  module: src/lib/theme.ts
  copy consts read: 1 of 1 named; declared claims: 0 (none)
  module: src/lib/feed.ts
  copy consts read: 2 of 2 named; declared claims: 0 (none)

PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.
```

## 4. `node scripts/guards/copy-taxonomy-guard.check.mjs` → EXIT=0

```
copy-taxonomy-guard check: all 23 checks passed, 0 failed, across 22 guard invocations (6 of them against a mutated copy of the guard).
```

- **Checks run: 23.** Recomputed by hand from the check source: 2 clean-run checks + 6 `rule(...)` calls × 2 (seed CAUGHT + mutation) = 12 + 9 single-shot seeds = 23.
- **Checks against a MUTATED copy of the guard: 6.** One per `rule(...)` invocation; the 6 seeds map to **4 distinct rule mutations** (rule 4 is seeded three ways against the same anchor).

---

## (a) Is the check set mutation-proven? — YES, all four rules re-derived by me

I did not take the builder's word. For each of the four rules I built an independent sandbox
(`cp -r src` + symlinked `node_modules` in `os.tmpdir()`), applied the seed, ran the **shipped**
guard (must exit 1 with the exact finding), then wrote a **mutated copy** of the guard with one
textual replacement (anchor asserted to occur exactly once, so a no-op mutation cannot masquerade
as proof) and re-ran the same seed (must exit 0). Raw result:

```
### rule 1 — declaration names a category PLACE_KINDS does not have
  seed vs SHIPPED guard : exit 1 (finding present: true)
  seed vs MUTATED guard (anchor "!allKindSet.has(kind)" -> "false"): exit 0

### rule 2 — declaration names a kind the app WITHHOLDS
  seed vs SHIPPED guard : exit 1 (finding present: true)
  seed vs MUTATED guard (anchor "!offeredKindSet.has(kind)" -> "false"): exit 0

### rule 3 — declaration names an offered kind whose word is nowhere in the copy
  seed vs SHIPPED guard : exit 1 (finding present: true)
  seed vs MUTATED guard (anchor "!matchesCopy(word, text)" -> "false"): exit 0

### rule 4 — a WITHHELD kind named in the copy (undeclared)
  seed vs SHIPPED guard : exit 1 (finding present: true)
  seed vs MUTATED guard (anchor ".filter((word) => matchesCopy(word, text))" -> ".filter(() => false)"): exit 0

=== SUMMARY ===
PROVEN  rule 1 ... (seed exit 1, mutated exit 0)
PROVEN  rule 2 ... (seed exit 1, mutated exit 0)
PROVEN  rule 3 ... (seed exit 1, mutated exit 0)
PROVEN  rule 4 ... (seed exit 1, mutated exit 0)
```

**All four rules are mutation-proven: I re-derived each one myself (not the two the brief asked for
as a minimum).** None were taken on trust.

---

## (b) Is "nothing I touched changed" true? — YES for every slice-work file

`git rev-parse <commit>:<path>` for the files named in the report's table, at the pre-D-029 report
commit `7564034`, the D-029 fix `35e3f20`, and the slice implementation commit `248d897`:

| file | `7564034` | `35e3f20` | `248d897` |
|---|---|---|---|
| `scripts/guards/copy-taxonomy-guard.mjs` | `21f53d8` | `21f53d8` | `21f53d8` |
| `scripts/guards/copy-taxonomy-guard.check.mjs` | `186062c` | `186062c` | `186062c` |
| `src/lib/firstRunTour.ts` | `ccea378` | `ccea378` | `ccea378` |
| `docs/agents/code-structure.md` | `d28e159` | `d28e159` | `d28e159` |
| `scripts/guards/run-all.sh` | `9d69ea1` | `9d69ea1` | `9d69ea1` |
| `.scratch/v28/reports/slice-6d.md` | `37bc9a5` | `37bc9a5` | **`a1c6a6b`** |

**Result: the five slice-work artifacts are byte-identical at `7564034`, `35e3f20` and `248d897`.**
The D-029 fix did **not** change any slice work. The only row that differs at `248d897` is the
report *itself*, which the slice's own later commits edited — that is the report being updated, not
the D-029 fix rewriting work it claimed to leave alone.

Corroboration: the D-029 fix commit `35e3f20` (`git diff --stat 7564034 35e3f20`) touches only
`.scratch/v28/tmp/firstRunTour.pristine.ts` (a throwaway snapshot), `factory/decisions.md`,
five `factory/work/*.json` items, `scripts/factory/scheduler.test.mjs` and `scripts/factory/state.mjs`
— none of the five slice-work files.

---

## Test count: 2068 at HEAD vs 2067 baseline — the +1 is the D-029 regression test

I measured the baseline independently by extracting the pre-D-029 tree with `git archive 7564034`
(read-only) into `/tmp`, symlinking `node_modules`, and running vitest there:

```
Test Files  1 failed | 70 passed (71)      # the 26 failures are only no-bypass-guard.test.mjs
Tests  26 failed | 2041 passed (2067)      # needing a real git repo, absent under /tmp
```

At HEAD the gate prints `Test Files  71 passed (71)` / `Tests  2068 passed (2068)`.
So total tests: **2067 → 2068, +1.**

Attribution of the +1:

- `git diff 7564034 248d897 -- scripts/factory/scheduler.test.mjs` adds exactly **one** `it(...)`:
  *"creates work items in states its OWN guard calls legal (constructor vs validator)"* — the D-029
  regression test. `grep -cE '^\+.*\bit\(|^\+.*\btest\('` on that diff = **1**.
- Focused measurement of that file: `7564034` → 37 tests; HEAD → 38 tests (`+1`), all passing.
- Test files: **71** at `7564034`, **71** at `35e3f20`, **71** at `248d897` (`git ls-tree -r` count of
  `*.test.*`/`*.spec.*`). Between `7564034` and `248d897` the only changed test file is
  `scripts/factory/scheduler.test.mjs` with status `M` — **no test file added or removed.**

Conclusion: the +1 is exactly the D-029 regression test, and the file count stayed at 71.

---

## Discrepancies (named, with the numbers I measured)

1. **The brief's framing of the blob table is off by one row and one endpoint.** The brief says the
   builder claimed *"its five files"* byte-identical at `7564034` and `248d897`. The report's table
   actually has **six rows** (the five artifacts **plus the report itself**) and compares
   `7564034` vs `35e3f20` (the D-029 fix), not `248d897`. Measured outcome: the five slice-work files
   are identical at all three commits; the sixth row (`.scratch/v28/reports/slice-6d.md`) is
   `37bc9a5` at `7564034`/`35e3f20` but `a1c6a6b` at `248d897`. This is the report being edited by
   later slice commits, not the D-029 fix changing slice work. **No slice work file differs.**
2. No other discrepancy found: every number in the task brief (exit codes, 23 checks, 6 mutated,
   71 files, 2067→2068, 81 warnings, 1789/1800 words, GUARDS: PASS) was reproduced and matched,
   except the row/endpoint framing above.

---

## Verdict

VERIFY: PASS. All four deterministic commands exit 0. All four copy-taxonomy rules are
mutation-proven by independent re-derivation. The D-029 fix did not alter any slice-work artifact.
The test-count delta is exactly the D-029 regression test, with the test-file count unchanged at 71.
