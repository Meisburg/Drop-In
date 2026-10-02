# Slice 6c fix round 5 — VERIFIER (V28 r2)

**Delta under test:** base `824f419` → HEAD, commits `1282871` (round 5) and `37b8dd8` (bounded repair),
plus `ec47f15` (temporary ocr routing), decisions `f25d819`/`4c94071`.
**Working dir:** `/home/jmeisburg/orca/workspaces/playdate-app/onboarding` (branch `Meisburg/onboarding`).
**Claim file read as CLAIM only:** `.scratch/v28/reports/slice-6c-fix-5.md`.

**Verdict: VERIFY: PASS** — every executable lane exits 0; claims A, B, C reproduced; claim D
(the flake) NOT reproduced (see §D — reported plainly, not as failure).

**Tree integrity.** No repository file was modified. All mutation was on `/tmp` copies.
Guard-file sha256 at start and end are byte-identical (full list in §Integrity). `git status --porcelain`
count = `0` at end. No `systemctl`, no inference server touched.

---

## 1. `npm run verify` — EXIT 0 (raw)

Command: `npm run verify` — `> npm run build && npm run test && npm run lint && npm run a11y:focus && npm run steering-lint && npm run guards`

```
  Test Files  71 passed (71)
       Tests  2067 passed (2067)
  ok — AGENTS.md (1789 words, ceiling 1800)
GUARDS: PASS — all deterministic rules hold.
VERIFY_EXIT=0
```

oxlint prints NO summary banner off-TTY, so counted by grep over the same captured run:

```
$ grep -c ': warning ' verify.raw
81
$ grep -c ': error ' verify.raw
0
```

**Every expected number matched exactly:** 71 test files / 2067 tests / 81 warnings / 0 errors /
AGENTS.md 1789/1800 / `GUARDS: PASS`. **0 failing tests.** The pre-repair red is confirmed separately
(§A2): the pre-repair `scheduler.test.mjs` fails against the current tree with
`TypeError: Cannot read properties of undefined (reading 'why')` at `:251`. The gate is genuinely green now;
the failure count is genuinely `0`, not swallowed.

## 2. `node scripts/guards/factory-guard.check.mjs` — EXIT 0

```
factory-guard check: all 33 checks passed.
EXIT=0
```

Three independent counts of the same quantity, all agreeing:

```
$ node scripts/guards/factory-guard.check.mjs | grep -c '✓'
33                                     # printed check lines
$ grep -cE '^\s*check\(' scripts/guards/factory-guard.check.mjs
33                                     # check() call sites in source
$ node scripts/guards/factory-guard.check.mjs | tail -1
factory-guard check: all 33 checks passed.   # run-time counter
```

`grep -c 'check('` = `34` (includes the `const check = …` definition site, not a case). **33 == 33 == 33.
Builder's 31 → 33 confirmed.**

## 3. `node scripts/guards/regexp-escape-guard.check.mjs` — EXIT 0

```
regexp-escape-guard check: all 12 checks passed.
EXIT=0
```

## 4. `bash scripts/guards/run-all.sh` — EXIT 0

```
===========================================================
GUARDS: PASS — all deterministic rules hold.
EXIT=0
```

## 5. `bash scripts/steering-lint.sh` — EXIT 0

```
[2] Size ceilings (words)
  ok — AGENTS.md (1789 words, ceiling 1800)
PASS — steering layer is clean.
EXIT=0
```

---

## A. The rewritten `scheduler.test.mjs` tests the MECHANISM and is NOT vacuous

**File is still 37 tests:**
```
$ grep -cE '^\s*(it|test)\(' scripts/factory/scheduler.test.mjs
37
```

**A1 — PROOF IT CAN FAIL (mechanism removal).** Built `/tmp/v28-6c5-A` as a `cp -a` copy of the repo
(scheduler files' start hashes matched the repo). Control first:

```
$ npx vitest run scripts/factory/scheduler.test.mjs      # clean copy (control)
 Test Files  1 passed (1)
      Tests  37 passed (37)
CONTROL_EXIT=0
```

Then neutered the mechanism in the copy (`scripts/factory/scheduler.mjs:517`,
`if (task.requires_local_inference && …)` → `if (false && task.requires_local_inference && …)`):

```
--- a/scripts/factory/scheduler.mjs
+++ b/scripts/factory/scheduler.mjs
@@ -514,7 +514,7 @@ export function selectModel(...)
-    if (task.requires_local_inference && model.provider !== 'local') {
+    if (false && task.requires_local_inference && model.provider !== 'local') {
```

```
$ npx vitest run scripts/factory/scheduler.test.mjs      # neutered copy
 ❯ scripts/factory/scheduler.test.mjs (37 tests | 1 failed) 15ms
     × requires local inference when a lane declares it, and lets the ocr lane reach cloud while that policy is waived 4ms
 FAIL  scripts/factory/scheduler.test.mjs > capability routing > requires local inference when a lane declares it, and lets the ocr lane reach cloud while that policy is waived
TypeError: Cannot read properties of undefined (reading 'why')
 ❯ scripts/factory/scheduler.test.mjs:262:61
    262|     expect(strict.rejected.find((r) => r.modelKey === CLOUD).why).toMa…
 Test Files  1 failed (1)
      Tests  1 failed | 36 passed (37)
NEUTERED_EXIT=1
```

The failure is at **`:262` — the PART 1 mechanism assertion against the fixture**, not the policy half.
Restoring `scheduler.mjs` returns the file to `37 passed`. **The mechanism test dies with the mechanism:
not vacuous.** The two halves are genuinely separated — PART 1 uses a `local-only` FIXTURE with
`requires_local_inference: true`; PART 2 asserts the current policy (`ocr` cloud admissible / fallback)
against `realConfig` and cites D-017. `factory/config.json` was not touched (confirmed: `ocr.requires_local_inference`
is `false` on HEAD, `factory/config.json:172`).

**A2 — the pre-repair test was genuinely RED (supports the "gate was RED" claim).** Same `/tmp` copy, with
`git show 1282871:scripts/factory/scheduler.test.mjs` written in and the current config:

```
$ npx vitest run scripts/factory/scheduler.test.mjs
     × requires local inference for the ocr lane and never routes it to cloud 3ms
 FAIL  scripts/factory/scheduler.test.mjs > capability routing > requires local inference for the ocr lane and never routes it to cloud
TypeError: Cannot read properties of undefined (reading 'why')
 ❯ scripts/factory/scheduler.test.mjs:251:61
 Test Files  1 failed (1)
      Tests  1 failed | 36 passed (37)
PRE_REPAIR_TEST_EXIT=1
```

## B. The dead `@` arm is genuinely fixed, with no false positives

**B1 — all three forms FIRE (my own probe root).** `/tmp/v28-6c5-Bfire/` holds `factory/config.json` and
`.scratch/v28/reports/zz-at-fire.md`:

```
# probe: the `@` shorthand must FIRE
$ git ls-tree -r --name-only @ .scratch | wc -l
280 tracked files at @
$ git show @:scripts/guards/factory-guard.mjs | wc -l
```

```
$ node scripts/guards/factory-guard.mjs --root /tmp/v28-6c5-Bfire
  FINDING [no-bare-head-count]: .scratch/v28/reports/zz-at-fire.md:2: … "git ls-tree -r --name-only @"
  FINDING [no-bare-head-count]: .scratch/v28/reports/zz-at-fire.md:3: … "280 tracked files at @"
  FINDING [no-bare-head-count]: .scratch/v28/reports/zz-at-fire.md:4: … "git show @"
FAIL — 3 factory finding(s).
FIRE_EXIT=1
```

All three `@` shapes caught (arm 2 twice, arm 1 once). `HEAD^` and `HEAD@{2}` also now fire (arm 2):

```
$ node scripts/guards/factory-guard.mjs --root /tmp/v28-6c5-Bhead
  FINDING … "git ls-tree -r --name-only HEAD^"
  FINDING … "git ls-tree -r --name-only HEAD@{2}"
HEADFORMS_EXIT=1
```

**B2 — the arm was GENUINELY DEAD before the fix.** The pre-repair guard (`git show 1282871:scripts/guards/factory-guard.mjs`,
whose composed arms still ended in `\b`) against the SAME `@`-fire root:

```
$ node /tmp/v28-verify-6c5/guard-pre-repair.mjs --root /tmp/v28-6c5-Bfire
PASS — the registry can be trusted and no work item claims evidence it does not have.
PRE_EXIT=0                     # 0 findings: the @ arm could not fire
```

Correction to the builder's narrative (minor, non-blocking): the pre-repair `\b` did **not** "silently
drop" `HEAD^`/`HEAD@{2}` — it matched the bare `HEAD` prefix and still flagged the line (with a truncated
label). The genuinely dead case was `@`, and that one is real and now fixed. The behavioural outcome for
`HEAD^`/`HEAD@{2}` is coverage of the exact token; no false-negative existed there.

**B3 — NO false positives.** Two independent no-fire roots, both PASS exit 0:

```
# root 1
write to user@example.com about it
the @decorator style is used
the @{2} form means no revision here
the count is 5 at user@example.com
-> PASS, NOFIRE_EXIT=0

# root 2 (expanded reflog spellings)
write to user@example.com about it
the @decorator style is used
refs at @{2} are not HEAD by default
@{upstream} means the tracking branch
resolve @{now} is a reflog time form
email me at a.b@c.example for the count 5
the @ sign alone in prose
-> PASS, NOFIRE2_EXIT=0
```

`user@example.com`, `@decorator`, bare `@`, `@{2}`, `@{upstream}`, `@{now}` all do NOT fire.

## C. The baseline is independently derived

Own script (`/tmp/v28-verify-6c5/recount-baseline.mjs`) — replicates the guard's documented three-arm
pattern, walks every `.scratch/v28/{reports,briefs}/*.md`, counts every match per line, applies the
shape-3 fixed-sha skip, then parses the embedded `BARE_HEAD_BASELINE` Map from source and diffs:

```
scanned files: 120
occurrences:   87
keys:          47
baseline keys: 47
baseline occ:  87
diffs: extra=0 staleOrSlack=0 countDiff=0
baseline keys with slack (over-recorded): 0
baseline keys binding exactly:            47
```

**Independent count = 87 occurrences / 47 keys = the embedded baseline exactly.** The count-aware baseline
has **ZERO slack**: all 47 keys bind exactly (none over-recorded), no key is stale, no measured key is
missing. It binds; nothing is padded. Matches the guard's own run-time line
(`baseline holds 87 recorded occurrence(s)`).

## D. The flake claim — could NOT be reproduced

**Raw pass/fail of every full-suite run** (`npm run test` = `vitest run`; each run ~8.5s):

```
 runs 1–6 :  Tests 2067 passed (2067)   exit 0   ×6
 run  7   :  Tests 2067 passed (2067)   exit 0   (timed: real 0m8.509s)
 runs 8–37:  Tests 2067 passed (2067)   exit 0   ×30
```

**Total: 37 full-suite runs, 37 green, 0 failures. 0 / 37 flakes observed.** No `no-bypass-guard.test.mjs`
failure, no `Error: clone failed`, no `hardlink`/`commit-graphs/tmp_graph_*` string appeared in any run.

**Plain statement, not a verdict on the diff:** I **cannot confirm** the builder's "~1 in 5" diagnosis
from execution — I did not observe the environmental `git clone` hardlink race, so I do not repeat it as
fact. What I can say from the sample: 0/37 is **statistically inconsistent with a ~20% rate**
(P(0 in 37 | p=0.2) ≈ 3×10⁻⁴); the observed data are consistent only with a rate below ~8% (one-sided 95%
upper bound ≈ 0.08). Two readings, neither provable here: (i) the true rate is much lower than reported;
or (ii) the race is sensitive to concurrent git activity on the repo *outside* the test process (e.g. other
agents running git while my loop ran), which my run window did not reproduce. Either way **the flake is not
observed as a symptom of this diff** in my runs, and the no-bypass test passed alone and in-suite
throughout. Residual uncertainty is named, not resolved.

---

## Integrity

```
$ diff hashes-start.txt hashes-end.txt
IDENTICAL
$ git status --porcelain | wc -l
0
```

Hashed files (unchanged start→end): `scripts/guards/factory-guard.mjs`,
`scripts/guards/factory-guard.check.mjs`, `scripts/guards/regexp-escape-guard.check.mjs`,
`scripts/guards/run-all.sh`, `scripts/guards/no-bypass-guard.test.mjs`,
`scripts/factory/scheduler.test.mjs`, `scripts/factory/scheduler.mjs`, `factory/config.json`, `AGENTS.md`.

## Notes / residual risks

- Claim D is the only unreproduced item; it is a pre-existing test's environmental failure mode, not
  this diff, and nothing in the diff depends on it.
- The builder's prose that `\b` "silently dropped" `HEAD^`/`HEAD@{2}` overstates the pre-repair behaviour
  (they were caught with a truncated label); the `@` arm WAS genuinely dead and IS genuinely fixed. No code
  or gate is affected.
- The temporary `ec47f15` waiver remains live (`factory/config.json:172` = `false`); the repaired test
  correctly separates it from the mechanism, so a future revert to `true` will not need a test rewrite —
  PART 2's comment says so.
