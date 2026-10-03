# Slice 6d — FRESH-CONTEXT VERIFICATION, ROUND 4

**Verdict: VERIFY: PASS**

**Working dir:** `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`
**Commit under test:** `c70070a` (`git rev-parse HEAD` = `c70070aa1d0bbf6ed613f3e019bed8dd5bafcd84`, tree clean, `git status --porcelain` empty).
**Lineage confirmed myself:** `c70070a` ← `f51b2a4` (lane record) ← `ad817cc` (fix round 3) ← `2e46235` (review-3 persisted) ← `4b9a8ef` (state round 3 reviewed). Round 3's fix diff touches the four guard/report files
(`git diff --name-only 4b9a8ef ad817cc`): `scripts/guards/copy-taxonomy-guard.mjs`,
`scripts/guards/copy-taxonomy-guard.check.mjs`, `scripts/guards/factory-guard.mjs`,
`.scratch/v28/reports/slice-6d.md` (plus `factory/decisions.md` and the two lane reports).

**Read first:** `.scratch/v28/reports/slice-6d-review-3.md` (NEEDS_CHANGES on F1/F2/F3, non-blocking F4/F5/F6).

**Read-only discipline:** no repo file was edited; every experiment ran in `/tmp/rev4/`. `git status --porcelain`
was empty before and after every command. No inference server touched, nothing pushed.

---

## 1. `npm run verify` → **exit 0**

`npm run verify` = build + test + lint + a11y:focus + steering-lint + guards. Exit **0**.

| measurement | value | how |
|---|---|---|
| test files | **71 passed (71)** | `Test Files  71 passed (71)` |
| tests | **2068 passed (2068)** | `Tests  2068 passed (2068)` |
| lint warnings | **81** | `grep -c ': warning ' verify.log` |
| lint errors | **0** | `grep -c ': error ' verify.log` = 0 |
| AGENTS.md figure | **1789 words / ceiling 1800** | steering-lint `ok — AGENTS.md (1789 words, ceiling 1800)` |
| GUARDS | **PASS** | `GUARDS: PASS — all deterministic rules hold.` |
| lines matching `^  FINDING` | **0** | `grep -cE '^  FINDING' verify.log` = 0 |
| plain `grep -c FINDING` | **2** | both are PASSING check names (see below) |

The two `FINDING` hits are confirmed to be the disclosure the brief named — **passing check names, not printed
findings** (both carry the `✓` pass mark, not the `  - ` finding bullet):
```
635:  ✓ a declared claim rule 3 cannot CHECK is a FINDING, not a limit line (B2b)
639:  ✓ a scan that can attribute no word to any kind is a FINDING, not a pass (B3)
```
So "plain `grep -c FINDING` returns 2" is a true-but-misleading count, exactly as the brief disclosed; the
anchored finding shape `^  FINDING` is 0. Disclosed, not repeated.

No oxlint banner prints off-TTY; the only two `error` strings inside the lint region are inside warning help text
(`…Consider handling this error.`, `…additional error handling…`), not diagnostics.

## 2. `bash scripts/guards/run-all.sh` → **exit 0**

`GUARDS: PASS — all deterministic rules hold.` Copy-taxonomy check line unchanged: `all 29 checks passed, 0
failed, across 26 guard invocations (8 of them against a mutated copy of the guard)`. factory-guard check: `all
90 checks passed`.

## 3. `node scripts/guards/copy-taxonomy-guard.mjs` (real tree) → **exit 0**

```
  kinds read: 10; offered: 8; words: 9
  scanned words: 9 (Park, Playground, Indoor play, Museum, Pool, Splash pad, Library, Beach, Trail)
  ...
  module: src/lib/firstRunTour.ts
  copy consts read: 4 of 4 named; declared claims: 3 (playground, pool, beach)
  ...
  declared claims CHECKED by rule 3: 3 of 3 the taxonomy accepts
PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.
```
The round-3-added printed pair **prints** and **N = M = 3** on the healthy tree. Confirmed.

## 4. `node scripts/guards/copy-taxonomy-guard.check.mjs` → **exit 0**

`all 29 checks passed, 0 failed, across 26 guard invocations (8 of them against a mutated copy of the guard),
against scripts/guards/copy-taxonomy-guard.mjs`.

Counts are **UNCHANGED** from round 3 (round-3 review reported the same `29 / 26 / 8`). No new check was added.
The zoo seed **now asserts BOTH fragments** (`check.mjs:282-293`): the `expect` argument is an array of two
strings, and `rule()` (changed this round, `check.mjs:221-228`) requires `wants.every(fragment => out.includes(fragment))`:

1. rule-1's finding — `the declaration names the category "zoo", which PLACE_KINDS does not have`
2. the new rule-3 limit-line reason (F6) — `the declared kind "zoo" is not scannable: the taxonomy has no kind "zoo" at all`

Both are load-bearing: dropping either fragment now turns the check red (the old single-string `expect` could not
pin the F6 reason). The B2b/B3 mutations were retargeted to the new tripwire text
`if (claimsChecked < claimsAccepted) {` (present verbatim at `guard.mjs:515`), and the check passes.

---

## 5. THE THING THAT MOST NEEDED SETTLING — testing the counter itself

The tripwire reads `claimsChecked < claimsAccepted` (`guard.mjs:515`), where `claimsAccepted` counts declared
kinds rule 1 accepted. All experiments below ran the **real** guard against throwaway trees under `/tmp/rev4/`.

### (a) Zero-denominator edge — `claimsAccepted === 0`. **No hole.**

Tree: `TOUR_TAXONOMY_CLAIMS = ['zoo']` (zoo is not in `PLACE_KINDS`).
Result: **exit 1, `FAIL — 4 finding(s)`**, printed pair `0 of 0 the taxonomy accepts`.

The `0 < 0` tripwire itself does **not** fire. **Rule 1 owns it**, exactly as expected:
```
  - src/lib/firstRunTour.ts: the declaration names the category "zoo", which PLACE_KINDS does not have — a category this copy names must be one of the kinds the app has
  - …the copy names "Playground" … undeclared …   (rule 4, x3: the three previously-declared kinds are now undeclared)
```
and the per-kind limit line is the new F6 reason: `the declared kind "zoo" is not scannable: the taxonomy has no
kind "zoo" at all, which is rule 1's finding, so rule 3 has nothing to check`.

This is not a special case — it is the invariant:
- If `claimsAccepted === 0` with at least one declared kind, **every** declared kind is absent from `allKindSet`,
  so `missing` is non-empty and **rule 1 fires**.
- If the declaration is empty (`TOUR_TAXONOMY_CLAIMS = []`), I reproduced **exit 1** with the `claimsRead === 0`
  tripwire (`no declaration was read from any registered module…`) plus rule 4.
- If `allKindSet` is itself empty, the guard already fails on the taxonomy-walk finding (reproduced: 10 findings).

So there is **no reachable state with `claimsAccepted === 0` that passes**. The counter cannot fire at `0 < 0`,
but rule 1 (or the taxonomy/`claimsRead` tripwires) owns that state and the run still FAILS.

### (b) The wired orphan does something — **N < M, exit 1.**

Tree: the `case 'beach': return 'Beach'` pair deleted from `placeKindLabel` (round-3 review's own repro).
Result: **exit 1**, printed pair **`2 of 3 the taxonomy accepts`** (N=2 < M=3), with the finding:
```
  - 1 declared claim(s) this guard accepted as kinds could not be CHECKED by rule 3 — src/lib/firstRunTour.ts claims "beach". …
  limit—— src/lib/firstRunTour.ts: the declared kind "beach" is not scannable, so rule 3 does not check its claim (its word is the label function default…)
```
The counter is the live mechanism: one accepted claim went unchecked, the printed pair shows `2 of 3`, and the
run exits 1. Confirmed.

### (c) The deleted orphan lost nothing — **both kinds named per KIND; nothing observable lost.**

Tree: `case 'museum': return 'Library'` (museum and library — both NON-declared — share the word `Library`).
Result: **exit 0 (PASS)** — ambiguity of non-declared kinds is deliberately not a failure — with **two per-KIND**
limit lines:
```
  scanned words: 7 (Park, Playground, Indoor play, Pool, Splash pad, Beach, Trail)
  limit—— kind "museum" is not scannable: its word "Library" is the label of 2 kinds (museum, library), …
  limit—— kind "library" is not scannable: its word "Library" is the label of 2 kinds (museum, library), …
```
Both affected kinds are named individually, and each line carries the shared word (`"Library"`), the arity
(`2 kinds`) and the full owner list (`museum, library`). There is no `limit—— the word "…"` line (the per-word
printer is gone).

Compared against the earlier guards on the **same** tree (both installed under `/tmp/rev4/`, run against
`/tmp/rev4/shared`):
- **Round-2 guard `a6d72f6`** (per-word printer already removed, `ambiguousWords` still populated but dead):
  output limit lines are **byte-identical** to the current guard's. So round 3's deletion of `ambiguousWords`
  changed **nothing observable** — the array had only an assignment (`:318`) and a push (`:336`) and no reader,
  confirmed by `grep -n ambiguousWords`.
- **Pre-round-2 guard `efeeeda`** (per-word printer present): it printed one aggregate line
  `limit—— the word "Library" is the label of 2 kinds (museum, library), so a copy match is not attributed to either of them and neither is scanned`.
  The replacement is strictly more granular (one line per affected *kind*), and every field the old line carried
  (word, count, member list) is present on each new line. The single old clause not repeated verbatim is
  "neither is scanned" — and its content is still observable: `scanned words: 7` omits both Museum and Library
  (was 9), and the header's `WHERE IT STOPS` states such kinds are kept out of the scan.

**Conclusion:** nothing available before is missing now. The per-kind form names both kinds; the round-3 deletion
was a no-op on a dead array.

---

## 6. Round-3 fix claims (from review-3) spot-checked

| review-3 finding | state at `c70070a` |
|---|---|
| **F1** header claimed per-word printing | **fixed** — `guard.mjs:60` now reads "per such kind, NAMING WHICH of the three applies"; `grep 'or per shared word'` → none |
| **F2** sweep row's "printed per word" reason | **fixed** — `slice-6d.md:822` now says each affected KIND prints a limit line naming the shared word and its owners |
| **F3** two dead arrays | **fixed** — `ambiguousWords` deleted; `claimsChecked` is now the tripwire's subject (`guard.mjs:515`), so nothing is computed and thrown away |
| **F4** backwards ordering sentence | **fixed** — `slice-6d.md:920` records the ordering claim deleted |
| **F5** D-030 title count | **fixed** — `factory/decisions.md:826` now "four instances" |
| **F6** rule-1-absent kind's generic reason | **fixed** — prints its own reason ("the taxonomy has no kind X at all"); pinned by the zoo seed's second fragment |

---

## 7. Verdict

**VERIFY: PASS.** Every specified lane exits 0, every number re-measured against the live run, and the counter
survives the falsification brief: the zero-denominator state FAILS via rule 1 (no hole), the wired orphan yields
`2 of 3` and exit 1, and the deleted `ambiguousWords` lost nothing observable.

### Residual risks / notes (non-blocking)
- The "counter is the invariant" property holds **because rule 1 covers the `claimsAccepted === 0` case**. If a
  future change ever disabled rule 1 while keeping the counter, the zero-accepted state would go unwatched by the
  counter; today rule 1 fires. (The check's rule-1 mutation confirms rule 1 is load-bearing for the zoo seed.)
- `claimsAccepted - claimsChecked` equals `claimsUnchecked.length` by construction (each accepted kind is either
  checked or pushed), so the finding's count and its named list cannot disagree.
- e2e / playtest were not run; the slice gate is `npm run verify`, whose full lane set all passed.
- Measurement method disclosures: warnings are `grep -c ': warning '` (off-TTY oxlint prints no banner); the
  `FINDING` count uses the anchored `^  FINDING` shape, and the plain count of 2 was verified as two passing
  check names.
