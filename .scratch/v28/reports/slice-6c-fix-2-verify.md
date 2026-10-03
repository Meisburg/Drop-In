# Verifier report — V28 r2 slice 6c, FIX ROUND 2

**Working directory:** `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`
**HEAD measured:** `04921d8933c24933c87b7ca52ea17320a1e72984` (`04921d8`) — matches the brief's stated slice commit.
**Base:** `0205c8d` (parent `50009ae`).
**Tree:** no tracked modifications, nothing staged. `git status --short` at the end of this report.
**`strata-max`:** not started, not probed. Its absence is not a finding.

Every number below was produced by a command in this lane; raw output is pasted, not summarised.

---

## 1. The gate — `npm run verify`

```
$ npm run verify > /tmp/verify-6c-fix2.log 2>&1; echo "EXIT=$?"; echo "LINES=$(wc -l < /tmp/verify-6c-fix2.log)"
EXIT=0
LINES=623
```

Baseline table, each figure read out of that log:

| check | expected | measured | verdict |
|---|---|---|---|
| `npm run verify` overall | exit 0 | **exit 0** | MET |
| test files | 70 passed (70) | **70 passed (70)** | MET |
| tests | 2030 passed (2030) | **2030 passed (2030)** | MET |
| lint | 81 warnings / 0 errors | **81 / 0** (finding lines, see below) | MET |
| guards | `GUARDS: PASS` | **`GUARDS: PASS — all deterministic rules hold.`** | MET |

Every stage exit code is implied by the `&&` chain in the script (`build && test && lint && a11y:focus && steering-lint && guards`) plus the observed `EXIT=0`.

Test banner (raw):

```
 Test Files  70 passed (70)
      Tests  2030 passed (2030)
   Start at  05:03:59
   Duration  10.80s (tests 48%, transform 42%, import 9%, worker 1%)
```

**Lint — I counted finding lines, and I say so.** oxlint prints **no summary banner off-TTY**; I confirmed the absence rather than assuming it (`grep -nE "Found [0-9]+ warning|Finished in" ` on the log returns nothing — the only `oxlint` line in the whole log is the echoed command at line 71). The counts are therefore read from finding lines in the lint section (log lines 70–154):

```
$ sed -n '70,154p' /tmp/verify-6c-fix2.log | grep -c ': warning '
81
$ sed -n '70,154p' /tmp/verify-6c-fix2.log | grep -c ': error '
0
```

Whole-log greps agree: `grep -c ': warning '` → 81, `grep -c ': error '` → 0. **81 warnings / 0 errors, MET.** No count was read from a banner, because there is no banner.

Other stage tails inside the same run:

```
PASS — every control that suppresses its outline provides a focus cue
...
PASS — steering layer is clean.
...
GUARDS: PASS — all deterministic rules hold.
```

The guards tail inside `verify` (log lines 605–623) carries the 12 `✓` lines and `regexp-escape-guard check: all 12 checks passed.`

**Baseline note:** the guards lane prints `ok — all 55 non-exempt module(s) have a sibling .test.ts` (line 188), same as the report claims.

---

## 2. The slice's own instruments

### 2.1 `node scripts/guards/regexp-escape-guard.mjs` → exit 0, exactly one hit

```
$ node scripts/guards/regexp-escape-guard.mjs; echo "EXIT=$?"
EXIT=0
Regexp-escape guard — one escape implementation
===========================================================
  found: src/lib/escapeForRegExp.mjs:37
  ok — one implementation, at src/lib/escapeForRegExp.mjs:37
  ok — that is the whole of what this instrument establishes: one occurrence, in the sanctioned file.
  ok — scope: the tree minus build output and the harness dirs named in SCOPE; `.scratch` is skipped whole and uncounted.

PASS — the escape has exactly one home.
```

One hit, at `src/lib/escapeForRegExp.mjs:37`. **MET.**

### 2.2 `node scripts/guards/regexp-escape-guard.check.mjs` → exit 0, printed count vs counted cases

```
$ node scripts/guards/regexp-escape-guard.check.mjs > /tmp/check-6c-fix2.log 2>&1; echo "EXIT=$?"
EXIT=0
$ wc -l < /tmp/check-6c-fix2.log
14
$ tail -2 /tmp/check-6c-fix2.log

regexp-escape-guard check: all 12 checks passed.
```

**The number the run prints: `12`.** **The number I counted: `12`.** I counted it three ways:

1. `✓` lines actually emitted: `grep -c '^  ✓' /tmp/check-6c-fix2.log` → **12**.
2. Case sites in the final script: **7** `seedCase(...)` invocations (lines 128, 131, 174, 180, 184, 188, 202) plus **5** bare `check(...)` calls (lines 121, 156, 165, 194, 214) → **12**. `seedCase` contains the sixth `check(` call site (line 104) and is called 7 times.
3. The counter is genuinely run-time: `let ran = 0` (line 80), `ran += 1` (line 82), `console.log(\`... all ${ran} checks passed.\`)` (line 221).

All three agree at 12. The fix-round-1 state at `0205c8d` had **9** `check(` call sites and a **hand-typed** `console.log('regexp-escape-guard check: all 9 checks passed.')`; the report's "9 → 12" claim reproduces. **MET** — the printed count is produced, not typed, and it equals the cases that ran.

### 2.3 `bash scripts/guards/run-all.sh` → exit 0, line count

```
$ bash scripts/guards/run-all.sh > /tmp/runall-6c-fix2.log 2>&1; echo "EXIT=$?"; echo "LINES=$(wc -l < /tmp/runall-6c-fix2.log)"
EXIT=0
LINES=439
$ tail -6 /tmp/runall-6c-fix2.log
  ✓ restored sandbox passes again

regexp-escape-guard check: all 12 checks passed.

===========================================================
GUARDS: PASS — all deterministic rules hold.
```

**439 lines**, against fix round 1's measured **436** (+3 = the three added `✓` lines: premise, nested skip, `.d.cts`). **MET.**

---

## 3. Are the report's pasted tails real?

`.scratch/v28/reports/slice-6c-fix-2.md` was diffed against my own run, command by command.

| Report's claim | My measurement | Verdict |
|---|---|---|
| `npm run verify` log = **623 lines** | **623 lines** | matches |
| test files 70 / tests 2030 | **70 / 2030** | matches |
| lint 81 warnings / 0 errors, no banner | **81 / 0**, no banner present | matches |
| guards tail with 12 `✓` + `GUARDS: PASS` | byte-identical tails | matches |
| guard output block | byte-identical to my re-run (`diff` clean) | matches |
| `check` tail `all 12 checks passed` | byte-identical (`diff` clean) | matches |
| `run-all.sh` log = **439 lines** | **439 lines**, tail byte-identical | matches |
| `55 non-exempt module(s)` line unchanged | present at both | matches |

The builder's own logs survive in `/tmp` (`/tmp/f2-verify.log` 623 lines, `/tmp/f2-runall.log` 439, `/tmp/f2-check.log` 14, `/tmp/f2-guard.log` 8). Diffing the builder's `verify` log against mine, the only differences are **timings** and **oxlint's finding-line order** (oxlint writes findings in nondeterministic order); after sorting, the two warning sets are identical, 81 lines each (`diff` of the sorted sets is empty). Structural diff line count, tail figures, and the guard/check/run-all tails all reproduce exactly. **The pasted gate tails are real.**

### 3.1 FINDING (non-blocking) — the mutation-proof hash chain does not pin HEAD's guard file

The report pastes four mutation proofs, each ending:

```
restored: guard f0fc47a07c932e9331dc90dacde0e81e8ac617374d8e34c3a255f488bce08ba -> f0fc47a07c932e9331dc90dacde0e81e8ac617374d8e34c3a255f488bce08ba ; check 6a5aa3d321d2f1479aae833dde818ff6e160fc8ed0ed5ddd9df0a2b992728aeb -> 6a5aa3d321d2f1479aae833dde818ff6e160fc8ed0ed5ddd9df0a2b992728aeb
```

Measured at HEAD:

```
$ sha256sum scripts/guards/regexp-escape-guard.mjs scripts/guards/regexp-escape-guard.check.mjs
34fa7aa50bc16a28d013c26d273ae13222c5528df09650594f9c791c220fd7bb  scripts/guards/regexp-escape-guard.mjs
6a5aa3d321d2f1479aae833dde818ff6e160fc8ed0ed5ddd9df0a2b992728aeb  scripts/guards/regexp-escape-guard.check.mjs
```

The **check** hash matches exactly. The **guard** hash does not: `f0fc47a0…` ≠ `34fa7aa5…`. The hash function is plain `sha256sum` on the file (per the report's own harness, `/tmp/fix2-proofs.sh`), so the delta is real content. The builder's backups are still on disk and confirm `f0fc47a0` was the true pre-mutation guard at proof time:

```
$ sha256sum /tmp/fix2-bak-no-cts/guard.mjs
f0fc47a07c932e9331dc90dacde0e81e8ac617374d8e34c3a255f488bce08ba  /tmp/fix2-bak-no-cts/guard.mjs
$ stat -c '%y %n' /tmp/fix2-bak-no-cts/guard.mjs scripts/guards/regexp-escape-guard.mjs
2026-10-02 04:58:42.214164416 -0700 /tmp/fix2-bak-no-cts/guard.mjs
2026-10-02 04:59:00.168211885 -0700 scripts/guards/regexp-escape-guard.mjs
```

The delta is the report's own **N1-twin header correction**, applied 18 s after the last proof — comment-only:

```
$ diff -u /tmp/fix2-bak-no-cts/guard.mjs scripts/guards/regexp-escape-guard.mjs
@@ -8,9 +8,11 @@
- * `scripts/guards/vacuous-absence-guard.mjs`. Two independent review lanes
- * called that a drift risk: "a missed metacharacter in one silently
- * over-matches the pin". Slice 6c collapsed all five onto ONE module —
+ * `scripts/guards/vacuous-absence-guard.mjs`. Two lanes reached that from
+ * opposite directions: `ocr` called the copies "implementations that drift
+ * independently — a missed metacharacter in one silently over-matches the pin",
+ * and the reviewer flagged the same duplication as a drift risk. Slice 6c
+ * collapsed all five onto ONE module —
```

The mutated code paths are untouched by that edit, and all three mutation anchors still exist verbatim at HEAD, so the proofs still speak for the committed code:

```
$ grep -n -A3 "function walk(dir" scripts/guards/regexp-escape-guard.mjs   # line 126, anchor present
$ grep -n "SCAN_EXT =" scripts/guards/regexp-escape-guard.mjs              # 118: /\.(ts|mts|cts|tsx|js|jsx|mjs|cjs)$/
$ grep -n "git init -q" scripts/guards/regexp-escape-guard.check.mjs       # 150: anchor present
```

**What this is:** a comment-only edit landed after the proofs, so the report's pasted guard hash pins a *byte-different* artifact than HEAD's guard. The proof conclusion survives (code identical); the hash chain as pasted does not pin the committed file. Reported as measured, not explained away. I did **not** re-run the mutations (that would edit the tree).

---

## 4. The deterministic claims

### 4.1 `260` in `.scratch/v28/reports/slice-6c.md`

```
$ grep -n "260" .scratch/v28/reports/slice-6c.md; echo "grep exit=$?"
grep exit=1
```

**Absent — zero occurrences** (the same grep finds 0 in that file; for the record `slice-6c-fix-1.md` and `slice-6c-fix-2.md` each contain it only inside the "reproduced at no commit" correction text).

**What replaced it** (from `git diff 0205c8d..HEAD -- .scratch/v28/reports/slice-6c.md`): the sentence no longer states a total at all. It now says `.scratch` is skipped WHOLE while git tracks code files inside it — **23 of them `.mjs`** — and that "The tracked-file count itself lives in the header's SCOPE, dated, with the command that re-measures it (`regexp-escape-guard.mjs`), because it grows with every committed report." It records that the deleted figure "reproduced at no commit — 262 at `c484648`, 259 at `ce3479c`/`32e9f48`, 265 at HEAD — with no such reviewer measurement on record".

**The re-measuring command the replacement names** is `git ls-files .scratch | wc -l` (stated in the guard header, `scripts/guards/regexp-escape-guard.mjs:46`). Run at HEAD:

```
$ git ls-files .scratch | wc -l
271
$ git rev-parse --short HEAD
04921d8
$ git ls-tree -r --name-only c484648 .scratch | wc -l
262
```

**271 at `04921d8`.** The header's dated figure (`262`, measured at `c484648`) reproduces exactly. The header's other pinned claims also reproduce: `git ls-files '.scratch/**/*.mjs' | wc -l` → **23**, and its named `.scratch/guard-a03fc54.mjs:635` really is the one-liner (`const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`), the only `.scratch/**.mjs` file containing it.

**FINDING (non-blocking, stale-figure class).** The replacement paragraph itself enumerates "**265 at HEAD**". At the HEAD this commit creates, that figure is **271** — the re-measuring command returns 271, so the parenthetical's last entry is 6 low as written at `04921d8` (`265` was HEAD's *pre-commit* index value; `git ls-tree -r --name-only 0205c8d .scratch | wc -l` → 265). The report discloses the half-life and dates the header figure, so this is the disclosed drift landing inside the very paragraph written to remove it, not a missing disclosure. Recorded because a moved count is the finding, not something to explain away.

### 4.2 The check count, from the diff

```
$ git diff 0205c8d..HEAD --stat -- scripts/guards/regexp-escape-guard.check.mjs
 scripts/guards/regexp-escape-guard.check.mjs | 172 ++++++++++++++++-----------
 1 file changed, 103 insertions(+), 69 deletions(-)
```

- **Seeded cases in the final file: 7** (`seedCase` calls: e2e copy, scripts copy, `.vitest` cache, nested `.vitest`, `.d.mts`, `.d.cts`, wrong-file-only). Two are new (nested skip, `.d.cts`); one is the split-out mechanism half of old case 4.
- **Bare `check(...)` calls in the final file: 5** (clean tree, PREMISE, `.scratch` uncounted, ZERO count, restored sandbox).
- **7 + 5 = 12**, and the printed summary is `${ran}` → **12**. The `0205c8d` version had 9 call sites and a typed `all 9 checks passed`. Printed count, counted `✓` lines, and call sites are all 12. Consistent.

### 4.3 `.scratch` tracked count at HEAD

```
$ git ls-files .scratch | wc -l
271
```

**271 at `04921d8`** (265 at `0205c8d`; the +6 is exactly the six `.scratch` files this commit adds: three briefs and three reports). The header's dated figure remains `262` at `c484648`, as it says.

---

## 5. What I did not run

`npm run test:e2e` was **not** run, per the brief: `verify` excludes Playwright (`build && test && lint && a11y:focus && steering-lint && guards`), and this round's diff touches only two guard files, two docs/report files, and `.scratch` — no shipped code. Recording it as a residual risk rather than a lane result.

`strata-max` was not started; no command in this lane touched it.

The four mutation proofs were **not** re-run: running them mutates tracked files, and the instruction is to leave the tree unchanged. I verified them structurally instead (hashes, backups, anchors, comment-only delta) as recorded in 3.1.

---

## Verdict

**`VERIFY: PASS`** — every specified command exited 0 and every baseline figure is exactly where the brief says it is: `npm run verify` **exit 0**, **70 files / 2030 tests / 81 warnings / 0 errors / GUARDS PASS**; `regexp-escape-guard.mjs` **exit 0, one hit**; `regexp-escape-guard.check.mjs` **exit 0, prints 12, 12 counted**; `bash scripts/guards/run-all.sh` **exit 0, 439 lines**. No failing output to paste.

Two measured, non-blocking findings, both in sections 3.1 and 4.1:

1. the report's pasted guard hash `f0fc47a0…` does **not** match HEAD's guard `34fa7aa5…` — the delta is a comment-only header edit made after the proofs; the mutated code is identical, but the pasted hash chain does not pin the committed file;
2. `.scratch`'s tracked count at `04921d8` is **271**, while the replacement paragraph in `slice-6c.md` still reads "265 at HEAD".

---

## `git status --short` at the end (tree as found)

```
?? .scratch/v28/briefs/slice-6c-fix-2-review.md
?? .scratch/v28/briefs/slice-6c-fix-2-verify.md
```

No tracked file modified, nothing staged, no leftover seed artifacts (`find . -name 'zz-*'` empty; no `.vitest`, no `src/deep/.vitest`, no `.scratch/zz-probe.mjs`, no `e2e/zz-only.e2e.ts`). HEAD still `04921d8`. Nothing fixed, nothing committed, nothing staged.
