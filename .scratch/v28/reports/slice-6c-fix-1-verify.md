# Verifier report — V28 r2 slice 6c, fix round 1 (round 2, post-micro-commit)

Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`
Referee role: run the real commands, paste raw output, fix nothing, commit nothing.

## 0. Tree identity, before anything

```
$ git rev-parse HEAD
50009ae4978353555a7b5fc9bdbca41383a9f8f0

$ git log --oneline -5
50009ae V28 r2 slice 6c fix 1 micro: pin the slice commit's id in its own report, and the stat it got wrong
c2ec32e V28 r2 slice 6c fix 1: the guard's scope sentence becomes the mechanism, and the round gets its report
c484648 V28 r2: the local model is up and serving, and I record the four instrument failures and the config damage I did and undid
c336d07 V28 r2: the local model was crash-looping rather than stopped, and two more instruments lied while I found that out
4c2d2ab V28 r2: handover written for a new session, and 6c-fix-1's uncommitted work preserved
```

Brief says base `c484648`, slice commit `c2ec32e`, HEAD a report-only micro commit. **HEAD is `50009ae`** — confirmed above.

Micro commit touches exactly one file, a `.scratch/v28/reports/*.md`:

```
$ git show --stat HEAD
commit 50009ae4978353555a7b5fc9bdbca41383a9f8f0
Author: Meisburg <331023862+Meisburg@users.noreply.github.com>
Date:   Fri Oct 2 04:40:32 2026 -0700

    V28 r2 slice 6c fix 1 micro: pin the slice commit's id in its own report, and the stat it got wrong
    ...
 .scratch/v28/reports/slice-6c-fix-1.md | 8 ++++++--
 1 file changed, 6 insertions(+), 2 deletions(-)

$ git show --name-only --format="%H" HEAD | tail -5
50009ae4978353555a7b5fc9bdbca41383a9f8f0

.scratch/v28/reports/slice-6c-fix-1.md
```

**Confirmed:** one file, `.scratch/v28/reports/slice-6c-fix-1.md`, no code/guard/docs.

---

## 1. The gate — `npm run verify` (single run, exit code read directly)

```
$ npm run verify    # full log 620 lines
EXIT=0
```

### Expected figures, and whether each was met

| check | expected | measured | met? |
|---|---|---|---|
| `npm run verify` overall | exit 0 | **exit 0** | **YES** |
| test files | 70 passed (70) | **`Test Files  70 passed (70)`** | **YES** |
| tests | 2030 passed (2030) | **`Tests  2030 passed (2030)`** | **YES** |
| lint | 81 warnings / 0 errors | **81 / 0** (counted, not bannered — see below) | **YES** |
| guards | `GUARDS: PASS` | **`GUARDS: PASS — all deterministic rules hold.`** | **YES** |

**The baseline did not move.** No figure differs by any amount. Nothing was adjusted.

### Raw stage tails

Build head/tail (stage 1) — exit 0 implicit (chain reached `test`):

```
$ drop-in@0.0.0 build
> tsc -b && vite build
...
✓ built in 242ms
[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
...
PWA v1.3.0
mode      injectManifest
format:   es
precache  22 entries (1177.96 KiB)
files generated
  dist/sw.js
```

Test (stage 2):

```
$ drop-in@0.0.0 test
> vitest run

 RUN  v5.0.0 /home/jmeisburg/orca/workspaces/playdate-app/onboarding

 Test Files  70 passed (70)
      Tests  2030 passed (2030)
   Start at  04:41:02
   Duration  22.77s (tests 65%, transform 29%, import 5%, worker 1%)
```

Lint (stage 3): **oxlint printed no summary banner — output was not a TTY.** I counted the finding
lines instead:

```
$ drop-in@0.0.0 lint
> oxlint --ignore-pattern '.scratch/**' --ignore-pattern '.agents/**' --ignore-pattern '.qa/**' --ignore-pattern 'dist/**'
...(no banner; raw finding lines only)...

# I DID COUNT THE FINDING LINES (this is not read from any banner):
$ grep -c ': warning ' /tmp/verify6c/verify.log        # whole log
81
$ grep -c ': error ' /tmp/verify6c/verify.log          # whole log
0
$ sed -n '70,155p' verify.log | grep -c ': warning '   # lint stage range only
81
$ sed -n '70,155p' verify.log | grep -c ': error '     # lint stage range only
0
```

Both the whole-log count and the lint-stage-restricted count are **81 warnings / 0 errors**. No other
line in the log has the shape `: warning ` or `: error ` (checked; only 4 non-matching `warning|error`
lines exist, all build/chunk text or a11y `note:` lines). Lint exit was 0 (the `&&` chain advanced to
`a11y:focus`).

a11y:focus (stage 4):

```
$ drop-in@0.0.0 a11y:focus
> node scripts/focus-indicator-check.mjs

PASS — every control that suppresses its outline provides a focus cue
```

steering-lint (stage 5) — exit 0 implicit (chain reached `guards`); its output carries `note:` lines,
no findings.

guards (stage 6) — tail:

```
  ✓ restored sandbox passes again

regexp-escape-guard check: all 9 checks passed.

===========================================================
GUARDS: PASS — all deterministic rules hold.
```

Whole-log check: `grep -c '✗' verify.log` → **0**. Every guard case in the gate run is green.

---

## 2. The slice's own instruments, run directly, in the foreground

### 2.1 `node scripts/guards/regexp-escape-guard.mjs` → **exit 0, exactly one hit**

```
$ node scripts/guards/regexp-escape-guard.mjs
EXIT=0
Regexp-escape guard — one escape implementation
===========================================================
  found: src/lib/escapeForRegExp.mjs:37
  ok — one implementation, at src/lib/escapeForRegExp.mjs:37
  ok — every other caller imports it (scope: the tree minus build output and the
       harness dirs named in SCOPE — `.scratch` skipped whole and uncounted)

PASS — the escape has exactly one home.
```

**One hit, `src/lib/escapeForRegExp.mjs:37` — as the brief expects.**

### 2.2 `node scripts/guards/regexp-escape-guard.check.mjs` → **exit 0, all 9 checks**

```
$ node scripts/guards/regexp-escape-guard.check.mjs
EXIT=0
  ✓ clean tree passes and names the one implementation
  ✓ a sixth copy in e2e/ is CAUGHT and named
  ✓ a sixth copy in scripts/ is CAUGHT (the guard scripts are covered too)
  ✓ a TRACKED .scratch copy is UNCCOUNTED — the header states the boundary it is not counted under
  ✓ a generated .vitest cache file holding the literal does NOT fail the lane
  ✓ a copy in a DECLARATION file (.d.mts) is CAUGHT — .mts is in the extension list
  ✓ a ZERO count FAILS — an instrument that matched nothing is not a pass
  ✓ one copy in the WRONG file FAILS — the count is not the whole rule
  ✓ restored sandbox passes again

regexp-escape-guard check: all 9 checks passed.
```

**Nine cases, not six — as the brief requires. `all 9 checks passed` literally.**

### 2.3 `bash scripts/guards/run-all.sh` → **exit 0**

```
$ bash scripts/guards/run-all.sh        # full log 436 lines
EXIT=0
```

Tail:

```
  ✓ the guard STATES its coverage in the run (the PASS does not read as evidence about the flag)
  ✓ the HISTORY check still fires on a bypass it CAN see (FAST_PUSH_LOG)
  ✓ the HISTORY check fires on a WRAPPER-recorded reflog action text
  ✓ the STATIC check still fires when core.hooksPath is unwired
no-bypass-guard check: all 6 checks passed (the stated blind spot is proven, not asserted).

  ✓ clean tree passes and names the one implementation
  ... (all nine regexp-escape case lines) ...
  ✓ restored sandbox passes again

regexp-escape-guard check: all 9 checks passed.

===========================================================
GUARDS: PASS — all deterministic rules hold.
```

Also, head of that run:

```
Build-law guard — sibling tests under src/lib/
===========================================================
  ok — all 55 non-exempt module(s) have a sibling .test.ts
```

All three instruments exit 0. All were foreground commands; no background job, no poll, no `pgrep`/`rg`.

---

## 3. Are the report's pasted tails real? (`.scratch/v28/reports/slice-6c-fix-1.md`)

Diffed the report's quoted numbers against what this run produces:

| figure the report quotes | report says | my run | same? |
|---|---|---|---|
| `npm run verify` exit | exit 0 | exit 0 | **YES** |
| verify log length | 620 lines | **620 lines** | **YES** |
| test files | 70 passed (70) | 70 passed (70) | **YES** |
| tests | 2030 passed (2030) | 2030 passed (2030) | **YES** |
| lint warnings / errors | 81 / 0 | 81 / 0 (counted) | **YES** |
| guards verdict | GUARDS: PASS | GUARDS: PASS | **YES** |
| guard.mjs | exit 0, `src/lib/escapeForRegExp.mjs:37` | exit 0, same hit | **YES** |
| check.mjs | exit 0, `all 9 checks passed` | exit 0, `all 9 checks passed` | **YES** |
| run-all | exit 0, 436 lines, `all 55 non-exempt module(s)` | exit 0, **436 lines**, `all 55 non-exempt module(s)` | **YES** |
| `git show --stat c2ec32e` | 828 insertions(+), 19 deletions(-) | **828 insertions(+), 19 deletions(-)** | **YES** |
| `.scratch` tracked count | 262 @ c484648, 265 after staging, 23 `.mjs` | 262 / 265 / 23 | **YES** |

**Nine, not six** — confirmed two ways:

- My run of the check prints nine `✓` cases and `all 9 checks passed`.
- The guards tail *inside* `npm run verify` shows the same nine green (verify.log lines 607–617,
  `all 9 checks passed` at line 617; zero `✗` in the entire log).
- The pre-round count **still appears in the older report**: `.scratch/v28/reports/slice-6c.md:303`
  reads `regexp-escape-guard check: all 6 checks passed.` That older report explicitly labels that
  6-case tail as the `ce3479c` tail ("**9 checks, not 6**, so the `all 6 checks passed` line quoted
  below is the `ce3479c` tail, not today's", `slice-6c.md:273-274`). So `six` is present where it is
  expected, correctly attributed to the old commit, and not claimed as today's result.

**Non-deterministic differences only (not findings):** the report's pasted test block says
`Start at 04:29:40` / `Duration 10.70s (tests 48%, transform 42%, import 9%, worker 1%)`; mine says
`Start at 04:41:02` / `Duration 22.77s (tests 65%, transform 29%, import 5%, worker 1%)`. Both are
timing metadata from separate runs; all counts are identical. **No quoted count in the report failed
to reproduce.**

**Every pasted tail I re-ran is real.** The report's quoted runs happened and still reproduce.

---

## 4. Specific claims — deterministic checks

### 4.1 `git ls-files .scratch | wc -l` — is the header's 262 real, at c484648 and HEAD?

Measured at `c484648` **without checking anything out** (read from the object store, so the working
tree was untouched):

```
$ git ls-tree -r --name-only c484648 .scratch | wc -l
262
$ git rev-parse HEAD
50009ae4978353555a7b5fc9bdbca41383a9f8f0
$ git ls-files .scratch | wc -l          # index == HEAD (nothing staged)
265
$ git ls-tree -r --name-only HEAD .scratch | wc -l
265
```

Difference between the two trees is exactly the three `.scratch` files the slice commit added:

```
$ diff <(git ls-tree -r --name-only c484648 .scratch | sort) \
       <(git ls-tree -r --name-only HEAD .scratch | sort)
153a154,155
> .scratch/v28/briefs/slice-6c-fix-1-completion.md
> .scratch/v28/briefs/slice-6c-fix-1.md
175a178
> .scratch/v28/reports/slice-6c-fix-1.md
```

The guard header (`scripts/guards/regexp-escape-guard.mjs:44-46`) says:

```
 *   - `.scratch` is skipped WHOLE, and that hole has a number on it: git TRACKS
 *     262 files under `.scratch/` (`git ls-files .scratch | wc -l`, measured at
 *     c484648 — it grows with every committed report, so re-measure it rather
 *     than trust this figure), 23 of them `.mjs` ...
```

**What I measure matches what the header says:** 262 at `c484648`, and the header *states* it is a
dated measurement at that commit plus the exact command to re-measure, not an invariant. At HEAD the
count is **265** (262 + the 3 `.scratch` files this slice commit added), which the report also records
correctly. **Consistent, and correctly framed as a dated measurement.**

### 4.2 `git ls-files '.scratch/**/*.mjs' | wc -l` — header claims 23, all under `.scratch/v4/`

```
$ git ls-files '.scratch/**/*.mjs' | wc -l
23
$ git ls-files '.scratch/**/*.mjs' | sed 's|/[^/]*$||' | sort | uniq -c
     23 .scratch/v4
$ git ls-files .scratch | grep -c '\.mjs$'
23
```

**23, all under `.scratch/v4/` — matches the header exactly.**

### 4.3 `.scratch/guard-a03fc54.mjs:635` — the cited one-liner

```
$ awk 'NR==635{printf "635: %s\n", $0}' .scratch/guard-a03fc54.mjs
635: const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
```

That is the one-liner the guard's `NEEDLE` (`/[.*+?^${}()|[\]\\]/g`) matches. Reproduced the header's
stated consequence directly (read-only; repo untouched):

```
$ node scripts/guards/regexp-escape-guard.mjs .scratch
EXIT=1
Regexp-escape guard — one escape implementation
===========================================================
  found: guard-a03fc54.mjs:635

  FINDING: 1 copy/copies of the escape, expected exactly 1.
    guard-a03fc54.mjs:635 — import { escapeForRegExp } from '<path>/src/lib/escapeForRegExp.mjs'
  MISSING: none of them is src/lib/escapeForRegExp.mjs.

This is a deterministic finding, not an opinion. Import the one implementation;
do not add a second copy.
```

**Line 635 really does hold the one-liner, and walking `.scratch` measurably fails the lane on a clean
tree (exit 1), which is the header's stated reason for skipping `.scratch` whole. The header's citation
reproduces line-for-line.**

Observation (not a defect in the report): the `— import { escapeForRegExp } from '<path>/...'` text in
the guard's FINDING block is a **fixed remedy template** the guard prints for any non-sanctioned hit
(guard source, the `else` branch), not the literal content of the hit line. The report pasted the
guard's output verbatim, so its pasted block is faithful; the header's separate citation of *line 635*
is the part that must (and does) match the line content.

### 4.4 `.gitignore` — the two cited lines, quoted

```
$ awk 'NR==50 {printf "%d: %s\n", NR, $0}' .gitignore
50: .scratch/**/*.mjs

$ awk 'NR>=60 && NR<=61 {printf "%d: %s\n", NR, $0}' .gitignore
60: # Vitest's own cache directory. Never source, never committed.
61: .vitest/
```

Both cited lines exist, and line 60 is the exact comment the guard header quotes for `.vitest`. Line
50 is the `.scratch/**/*.mjs` ignore rule the header leans on for "tracked `/*.mjs` under `.scratch`
are the count that hole has". **Both quotes match the file.**

---

## 5. Not done, as instructed

- `npm run test:e2e` **not run**. `verify` does not include Playwright and this round touches no
  shipped code. Stated as a residual risk below.
- Nothing fixed. Nothing `git add`ed. Nothing committed. The gate/build wrote only into `dist/`
  (gitignored) and `test-results/` (gitignored); the tracked tree is byte-identical.

### Final tree state

```
$ git status --short
?? .scratch/v28/briefs/slice-6c-fix-1-review.md
?? .scratch/v28/briefs/slice-6c-fix-1-verify.md

$ git rev-parse HEAD
50009ae4978353555a7b5fc9bdbca41383a9f8f0
```

The only entries are the two untracked brief files that were already present before this verification
ran (present in the `git status --short` taken at the start of this session, before any command).
**Tree unchanged; HEAD unchanged.**

---

## Verdict

Every command the brief specifies was run, exit codes read directly.

- `npm run verify` → **exit 0**; **70 test files / 2030 tests / 81 warnings / 0 errors / GUARDS PASS** — every expected figure met, none moved.
- `node scripts/guards/regexp-escape-guard.mjs` → **exit 0**, exactly one hit at `src/lib/escapeForRegExp.mjs:37`.
- `node scripts/guards/regexp-escape-guard.check.mjs` → **exit 0**, `all 9 checks passed` (nine, not six).
- `bash scripts/guards/run-all.sh` → **exit 0**, `GUARDS: PASS`.
- The report's pasted numbers reproduce; its tails are real; nine-not-six confirmed; the four specific
  claims (262 @ c484648 / 23 `.mjs` under `.scratch/v4` / guard line 635 = the one-liner / the two
  `.gitignore` lines) all check out.
- Tree and HEAD unchanged.

**VERIFY: PASS**

### Residual risks

- **No `npm run test:e2e`.** `verify` excludes Playwright; the round changes no shipped code, so e2e
  is not load-bearing for acceptance. Untested by this round.
- **The `.scratch` count is a dated measurement, not an invariant.** It is 265 at HEAD and grows with
  every committed report. The header now carries the re-measuring command instead of asserting a
  constant, which is the right handling — but any *future* quotation of 262 without the commit is a
  stale figure waiting to happen.
- **The lint count is a line-count, not a banner.** oxlint prints no summary off-TTY. I counted
  `: warning ` (81) and `: error ` (0) lines; this is sound for this run, but a future oxlint output
  change that splits one finding across two lines would change the count without changing the findings.
- **`.scratch/guard-a03fc54.mjs` is itself untracked** (`git ls-files --error-unmatch` → *did not match
  any file(s) known to git*). It is one of the frozen review-lane snapshots, not one of the 23 tracked
  `.scratch/**/*.mjs`. The header's reasoning still holds (the guard walks the filesystem, not git, so
  the file makes the lane red regardless of tracking) — noted only because the header's "262 tracked
  files / 23 `.mjs`" and the file that motivates the skip are disjoint sets.
