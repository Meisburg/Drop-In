# Verifier — V28 r2 slice 6c, FIX ROUND 3

**Lane:** deterministic referee (orchestrator-verifier). I do not fix, judge style, or interpret intent.
Every number below comes from the command quoted beside it, in the same call that recorded it.

**Working directory:** `/home/jmeisburg/orca/workspaces/playdate-app/onboarding` (branch `Meisburg/onboarding`)
**Builder commits under test:** `20773ee` (slice work), `b4a8b73` (report) — base `71bdd55`
**Verdict:** **VERIFY: PASS** (full table at the end of this file)

**Claim under test:** `.scratch/v28/reports/slice-6c-fix-3.md` (the CLAIM, not the evidence).

---

## Guard files, sha256 AT START (before any command was run)

```
HEAD: 7fe70037d54e6e6dde845f20f4f541617965a887  branch: Meisburg/onboarding

5d384806a7d6a596832b80c536d011a8f2019358a3ba5ee7e47b17e3a72769b3  scripts/guards/factory-guard.mjs
fe98ace1b44af3f7c8dec687200bd43ebdc9c956531cfef4b884802569711101  scripts/guards/factory-guard.check.mjs
2922f042c0e2a59564c0c999467920cdf93f191438166ae9efdda1cd270f17f8  scripts/guards/regexp-escape-guard.mjs
8493f7e8f3ad4a7799a248138aea3d928e6615122607441461b394f68a4d7bde  scripts/guards/regexp-escape-guard.check.mjs
536bdaeac46bd6c85d3f45c3076d476fd40d6bf9b705f922e8a3707ae072aeda  scripts/guards/run-all.sh

git status --porcelain=v1:
tracked-index checksum: d4e4cf6f7e962d7c4a7aeb2fe7c5f6f301f890cff626757f308a9b1167062208
```

**Note (recorded, not a finding):** the orchestrator is writing factory bookkeeping to this tree *while this
lane runs*. `git rev-parse HEAD` was `b4a8b735…` at the first call and `7fe70037…` a few calls later (commit
`7fe7003` = the orchestrator's D-011 log). The slice surface is byte-identical across that move: measured
`git diff b4a8b73..HEAD --stat` touches only `.scratch/v28/ledger.md`, `factory/decisions.md`,
`factory/work/v28-r2-6c.json`; the four guard files hash the same at `b4a8b73` and `HEAD`. So the gate below
was run on the slice as `20773ee`/`b4a8b73` left it.

---

## 1. `npm run verify` — the gate

```
$ npm run verify > /tmp/v28-6c-fix3-verify.log 2>&1; echo "exit=$?"
exit=0
$ wc -l < /tmp/v28-6c-fix3-verify.log
654
```

Raw tail (the summary lines, quoted from the same log):

```
$ grep -nE "Test Files|^ *Tests " /tmp/v28-6c-fix3-verify.log
60: Test Files  71 passed (71)
61:      Tests  2067 passed (2067)
$ grep -c ": warning " /tmp/v28-6c-fix3-verify.log
81
$ grep -c ": error " /tmp/v28-6c-fix3-verify.log
0
$ grep -nE "AGENTS.md \(|GUARDS:" /tmp/v28-6c-fix3-verify.log
170:  ok — AGENTS.md (1789 words, ceiling 1800)
654:GUARDS: PASS — all deterministic rules hold.
```

**Gate verdict: PASS.** `exit=0`, 71 test files (71 passed), **2067** tests (2067 passed), **81** lint
warnings (counted off-TTY with `grep -c ': warning '`), **0** errors, AGENTS.md 1789/1800 words,
`GUARDS: PASS`. The baseline that must not move (71 / 2067 / 81 / 0 / GUARDS PASS) is unmoved.

### The 2065→2067 delta — independently checked, NOT the builder's diff

The brief carried 2065; the tree carries 2067. I did not take the builder's attribution on trust. Measured:

```
$ git diff --name-only 71bdd55..b4a8b73            # the builder's own commits
.scratch/v28/reports/slice-6c-fix-2.md
.scratch/v28/reports/slice-6c-fix-3.md
.scratch/v28/reports/slice-6c.md
scripts/guards/factory-guard.check.mjs
scripts/guards/factory-guard.mjs
scripts/guards/regexp-escape-guard.check.mjs
scripts/guards/regexp-escape-guard.mjs
$ git diff --name-only 71bdd55..b4a8b73 -- '*.test.mjs' '*.test.ts' '*.test.tsx' '*.spec.*'
                                       # (no output — the builder touched no test file)
$ git diff --name-only a4b3cf5..71bdd55 -- '*.test.mjs' '*.test.ts' '*.test.tsx' '*.spec.*'
scripts/factory/scheduler.test.mjs
$ for c in a4b3cf5 68080b0 71bdd55 20773ee b4a8b73 HEAD; do printf "%-10s " $c; git show $c:scripts/factory/scheduler.test.mjs | grep -cE '^[[:space:]]*(it|test)\('; done
a4b3cf5    35
68080b0    37
71bdd55    37
20773ee    37
b4a8b73    37
HEAD       37
$ git log --oneline a4b3cf5..HEAD -- scripts/factory/scheduler.test.mjs
1281c9b D-009/D-010: a fix round can be written down, and a lane can carry its model
```

So the +2 came from `1281c9b` (factory infrastructure between the brief's base and this round), not from
`20773ee`/`b4a8b73`. And the brief's 2065 is real at its own base — reproduced in a `/tmp` copy, not inferred:

```
$ rm -rf /tmp/va4b3cf5 && mkdir -p /tmp/va4b3cf5
$ git archive a4b3cf5 | tar -x -C /tmp/va4b3cf5
$ ln -s …/onboarding/node_modules /tmp/va4b3cf5/node_modules
$ (cd /tmp/va4b3cf5 && git init -q . && git add -A -f && git commit -qm base && npx vitest run); echo exit=$?
 Test Files  71 passed (71)
      Tests  2065 passed (2065)
exit=0
```

**Confirmed:** the delta is +2 tests from `scripts/factory/scheduler.test.mjs` (35→37 `it(`/`test(` sites at
`1281c9b`), fully outside this slice. The builder's attribution is correct on both the number and the cause.

---

## 2. `bash scripts/guards/run-all.sh`

```
$ bash scripts/guards/run-all.sh > /tmp/v28-6c-fix3-runall.log 2>&1; echo "exit=$?"
exit=0
$ wc -l < /tmp/v28-6c-fix3-runall.log
470
$ grep -n "GUARDS:" /tmp/v28-6c-fix3-runall.log
470:GUARDS: PASS — all deterministic rules hold.

470 lines, `GUARDS: PASS — all deterministic rules hold.` at line 470, exit 0.

---

## 3. `node scripts/guards/factory-guard.check.mjs` — every check must fire

```
$ node scripts/guards/factory-guard.check.mjs > /tmp/v28-6c-fix3-fgcheck.log 2>&1; echo "exit=$?"
exit=0
$ cat /tmp/v28-6c-fix3-fgcheck.log
factory-guard behavior check — every rule must be able to fail
===========================================================
  ✓ a clean registry with a present artifact passes
  ✓ a model with no footprint_source is CAUGHT
  ✓ a capability floor no model can meet is CAUGHT
  ✓ an illegal lane state is CAUGHT
  ✓ acceptance=pass with review still running is CAUGHT
  ✓ a waived lane with no reason is CAUGHT
  ✓ an artifact named but not on disk is CAUGHT
  ✓ the same item passes when the artifact exists (control)
  ✓ a depends_on naming no work item is CAUGHT
  ✓ an agent default naming an unregistered model is CAUGHT
  ✓ a model with no health probe is CAUGHT
  ✓ an illegal residency value is CAUGHT
  ✓ two models declared resident at once is CAUGHT
  ✓ turning reclaim automatic is CAUGHT
  ✓ dropping the remote-verification requirement is CAUGHT
  ✓ an unacknowledged independence gap is CAUGHT
  ✓ the acknowledged gap passes (control)
  ✓ a header that types a count of its own cases is CAUGHT
  ✓ a header claiming its own text changed with no commit to check is CAUGHT
  ✓ the same root with honest headers passes (control)

factory-guard check: all 20 checks passed.
$ echo "printed total:"; grep -oE "all [0-9]+ checks passed" /tmp/v28-6c-fix3-fgcheck.log
all 20 checks passed
$ echo "independently counted check lines:"; grep -c "^  [✓✗]" /tmp/v28-6c-fix3-fgcheck.log
20
$ echo "check( call sites in the file:"; grep -cE "^\s*check\(" scripts/guards/factory-guard.check.mjs
20
$ echo "hard-typed totals in the file?"; grep -nE "all [0-9]+ checks passed" scripts/guards/factory-guard.check.mjs || echo "none"
266:  const TYPED = '#!/usr/bin/env node\n// zz-seeded — all 9 checks passed on a clean tree.\nprocess.exit(0)\n'
$ echo "how the total is computed:"; grep -nE "ran|let ran|checks passed" scripts/guards/factory-guard.check.mjs | head -20
55:let ran = 0
57:  ran += 1
266:  const TYPED = '#!/usr/bin/env node\n// zz-seeded — all 9 checks passed on a clean tree.\nprocess.exit(0)\n'
309:  console.log(`factory-guard check: all ${ran} checks passed.`)
```

**Check verdict: PASS.** exit 0; printed total **20**; independently counted **20** `✓`/`✗` lines; **20**
`check(` call sites. The total is computed at run time — `:55 let ran = 0`, `:57 ran += 1`,
`:309 console.log(\`factory-guard check: all ${ran} checks passed.\`)`. The **only** literal
`all 9 checks passed` in the file is at `:266` inside the `TYPED` seed string (the seeded violating header),
i.e. test data, not a hard-typed total. No hard-typed total anywhere.

---

## 4. `node scripts/guards/regexp-escape-guard.check.mjs` — count vs the docstring map (N3)

```
$ node scripts/guards/regexp-escape-guard.check.mjs > /tmp/v28-6c-fix3-regcheck.log 2>&1; echo "exit=$?"
exit=0
$ cat /tmp/v28-6c-fix3-regcheck.log
  ✓ clean tree passes and names the one implementation
  ✓ a sixth copy in e2e/ is CAUGHT and named
  ✓ a sixth copy in scripts/ is CAUGHT (the guard scripts are covered too)
  ✓ PREMISE: the .scratch seed is TRACKED — the state the header’s uncounted-hole sentence describes (not a verdict about the guard)
  ✓ a .scratch copy is UNCOUNTED — the skip is by directory name, as SCOPE states
  ✓ a generated .vitest cache file holding the literal does NOT fail the lane
  ✓ a NESTED .vitest (src/deep/.vitest/) is skipped too — the skip matches a directory NAME at ANY depth
  ✓ a copy in a DECLARATION file (.d.mts) is CAUGHT — .mts is in the extension list
  ✓ a copy in a DECLARATION file (.d.cts) is CAUGHT — .cts is in the extension list, not stated-but-unpinned
  ✓ a ZERO count FAILS — an instrument that matched nothing is not a pass
  ✓ one copy in the WRONG file FAILS — the count is not the whole rule
  ✓ restored sandbox passes again

regexp-escape-guard check: all 12 checks passed.
$ echo printed total; grep -oE "all [0-9]+ checks passed" /tmp/v28-6c-fix3-regcheck.log; echo counted check lines; grep -c "^  [✓✗]" /tmp/v28-6c-fix3-regcheck.log
all 12 checks passed
12
$ echo "docstring map items (numbered list):"; grep -cE "^ \* +1?[0-9]\. " scripts/guards/regexp-escape-guard.check.mjs
12
$ echo "the map, as written:"; grep -nE "^ \* +1?[0-9]\. " scripts/guards/regexp-escape-guard.check.mjs
9: *   1. the repo as it stands passes, and names the one implementation —
12: *   2. a sixth copy in `e2e/` is CAUGHT and named;
13: *   3. a sixth copy in `scripts/` is CAUGHT — the tree the `.mjs` guards live
15: *   4. PREMISE, its own named check: the `.scratch` seed of case 5 is genuinely
22: *   5. a copy in `.scratch` is UNCOUNTED — the boundary SCOPE states in the
25: *   6. a generated `.vitest` cache file holding the literal does NOT fail the
28: *   7. the same, NOT at the sandbox root (`src/deep/.vitest/`) — this pins the
31: *   8. a copy in a DECLARATION file (`zz.d.mts`) is CAUGHT — `.mts` is scanned,
33: *   9. the same for `.d.cts` — the header names `.cts` too, and a stated
35: *  10. a ZERO count FAILS — delete the implementation and the guard refuses,
37: *  11. ONE copy in the WRONG file FAILS — the count alone is not the rule; the
39: *  12. the sandbox is RESTORED and green again — case 10 deleted the
$ echo "check( call sites:"; grep -cE "^\s*check\(" scripts/guards/regexp-escape-guard.check.mjs
6
```

**Check verdict: PASS.** exit 0; printed `all 12 checks passed`; **12** `✓` lines counted; the docstring
numbered map now has **12** items (`1.` … `12.`, `:9`–`:39`), so `all N checks passed` agrees with the map —
finding **N3 fixed**. (The 6 direct `check(` sites plus the seeded cases make up the 12 assertions; the count
that matters is the 12 executed, which the run reports.)

---

## 5. `bash scripts/steering-lint.sh`

```
$ bash scripts/steering-lint.sh > /tmp/v28-6c-fix3-steering.log 2>&1; echo "exit=$?"
exit=0
$ cat /tmp/v28-6c-fix3-steering.log
Steering-layer lint — 25 file(s)
===========================================================

[1] Stale navigation pointers
  ok — every pointer resolves (or is lazily created)

[2] Size ceilings (words)
  ok — AGENTS.md (1789 words, ceiling 1800)
  ok — docs/agents/coordinator.md (700 words, ceiling 900)

[3] Reachability of steering docs
  ok — every steering doc is reachable from AGENTS.md

[4] No-op candidates (review, do not auto-delete)
  ok — no obvious no-op phrasing

===========================================================
PASS — steering layer is clean.
$ echo "AGENTS.md word count:"; wc -w < AGENTS.md
1789
```

**Steering verdict: PASS.** exit 0; `ok — AGENTS.md (1789 words, ceiling 1800)`.
`wc -w < AGENTS.md` → 1789, measured in the same call.

---

# Independent tests of the two claims that matter most

## N7 rule — `instrument-headers-honest` fires on a violation, passes an honest header, cannot pass vacuously

All mutations here are on **my own copies under `/tmp`** (`/tmp/vrroot` = `git archive HEAD`; `/tmp/vmut` =
a second copy). The repo was never touched. I wrote my own seeds; I did not reuse the builder's
`zz-typed.mjs`/`zz-history.mjs`.

**Baseline — the repo's guard against a clean full-tree copy root:**

```
$ node /tmp/vrroot/scripts/guards/factory-guard.mjs --root /tmp/vrroot
Factory guard — the scheduler registry and the work state
===========================================================
  ok — 5 model(s), 8 task kind(s), 1 work item(s); every floor meetable, every artifact present, every instrument header stating only what it can point at

PASS — the registry can be trusted and no work item claims evidence it does not have.
exit=0
```

**SEED A (mine) — a typed count in the header:**

```
seed file: scripts/guards/verifier-typed.mjs  ->  "// verifier-seeded instrument — this guard asserts 7 checks and nothing more."
$ node /tmp/vrroot/scripts/guards/factory-guard.mjs --root /tmp/vrroot
Factory guard — the scheduler registry and the work state
===========================================================
  FINDING [instrument-headers-honest]: verifier-typed.mjs:2: the header types a count of this instrument's own cases — print the count the run derives instead: "// verifier-seeded instrument — this guard asserts 7 checks and nothing more."

FAIL — 1 factory finding(s).
exit=1
```

**SEED B (mine) — a history claim with no pointer, B1's exact shape:**

```
seed file: scripts/guards/verifier-history.mjs  ->  "// verifier-seeded instrument — the count in this sentence went stale once already."
$ node /tmp/vrroot/scripts/guards/factory-guard.mjs --root /tmp/vrroot
Factory guard — the scheduler registry and the work state
===========================================================
  FINDING [instrument-headers-honest]: verifier-history.mjs:2: the header claims its own text changed and names no commit sha or file:line to check it against: "// verifier-seeded instrument — the count in this sentence went stale once already."

FAIL — 1 factory finding(s).
exit=1
```

**CONTROL (mine) — the same vocabulary WITH the pointer on the claim line:**

```
seed file: scripts/guards/verifier-honest.mjs  ->  "// verifier-seeded instrument — the count in this header used to be typed by hand and was corrected at c2ec32e."
$ node /tmp/vrroot/scripts/guards/factory-guard.mjs --root /tmp/vrroot
Factory guard — the scheduler registry and the work state
===========================================================
  ok — 5 model(s), 8 task kind(s), 1 work item(s); every floor meetable, every artifact present, every instrument header stating only what it can point at

PASS — the registry can be trusted and no work item claims evidence it does not have.
exit=0
```

**Verdict on the claim: CONFIRMED.** Both seeded shapes fire (`exit=1`, `FINDING [instrument-headers-honest]`);
the honest header passes (`exit=0`). The rule is not passing by words alone — it is passing on the pointer.

### Cannot pass vacuously — my own mutations, in a copy

`/tmp/vmut` = a second copy of HEAD. The behavior check locates the guard as its sibling
(`factory-guard.check.mjs:23 GUARD = join(import.meta.dirname, 'factory-guard.mjs')`), so mutating the copy's
guard and running the copy's check proves the cases are load-bearing.

```
$ node /tmp/vmut/scripts/guards/factory-guard.check.mjs      # unmutated copy
  ✓ a header that types a count of its own cases is CAUGHT
  ✓ a header claiming its own text changed with no commit to check is CAUGHT
  ✓ the same root with honest headers passes (control)

factory-guard check: all 20 checks passed.
exit=0

$ sed -i 's|^const HEADER_TYPED_COUNT = .*|const HEADER_TYPED_COUNT = /$^/|' /tmp/vmut/scripts/guards/factory-guard.mjs
$ node /tmp/vmut/scripts/guards/factory-guard.check.mjs      # mutation: disable TYPED_COUNT
  ✗ a header that types a count of its own cases is CAUGHT — exit 0
factory-guard check: 1 check(s) failed — the factory guard is not doing its job.
exit=1
restored: 5d384806a7d6a596832b80c536d011a8f2019358a3ba5ee7e47b17e3a72769b3

$ sed -i 's|^const HEADER_HISTORY = .*|const HEADER_HISTORY = /$^/|' /tmp/vmut/scripts/guards/factory-guard.mjs
$ node /tmp/vmut/scripts/guards/factory-guard.check.mjs      # mutation: disable HISTORY
  ✗ a header claiming its own text changed with no commit to check is CAUGHT — exit 0
factory-guard check: 1 check(s) failed — the factory guard is not doing its job.
exit=1
restored: 5d384806a7d6a596832b80c536d011a8f2019358a3ba5ee7e47b17e3a72769b3

$ sed -i 's|^const HEADER_POINTER = .*|const HEADER_POINTER = /$^/|' /tmp/vmut/scripts/guards/factory-guard.mjs
$ node /tmp/vmut/scripts/guards/factory-guard.check.mjs      # mutation: disable POINTER
  ✗ the same root with honest headers passes (control) — exit 1
factory-guard check: 1 check(s) failed — the factory guard is not doing its job.
exit=1
restored: 5d384806a7d6a596832b80c536d011a8f2019358a3ba5ee7e47b17e3a72769b3

```

**Each half of the rule, disabled, turns exactly its own case red; removing the pointer exemption turns the
CONTROL red — so the control is a real control, not decoration.** The restore hash equals the pre-mutation
hash every time, so nothing mutated is left in the copy.

**And the seed is caught BY THE RULE, not by some other check** — with the typed-count detection disabled, the
same seeded root passes:

```
$ # rule INTACT:
  FINDING [instrument-headers-honest]: verifier-vac.mjs:2: the header types a count of this instrument's own cases — print the count the run derives instead: "// verifier-seeded — this guard asserts 7 checks."
FAIL — 1 factory finding(s).
exit=1
$ # typed-count detection DISABLED, same seed:
PASS — the registry can be trusted and no work item claims evidence it does not have.
exit=0
restored: 5d384806a7d6a596832b80c536d011a8f2019358a3ba5ee7e47b17e3a72769b3
```

**Rule verdict: PASS — it fires, it has an honest control, and its cases are load-bearing under my own
mutations.**

## The named ceiling — does the rule catch `copy-field-consumption-guard.check.mjs:67`?

**It does NOT. The builder's ceiling is correct, and I confirmed it two ways.**

First, the real tree: `node scripts/guards/factory-guard.mjs --root /tmp/vrroot` (the full HEAD copy, which
contains the real `copy-field-consumption-guard.check.mjs`) exits **0** — line 67 produces no finding.

Second, isolating the reason. Line 67 is inside the leading `*` comment block, so the header scan *does* reach
it; it survives only because the line lacks a **self-subject** word (`count|number|total|header|sentence|…`).
Two probes with the exact text:

```
the exact text of line 67:
 *      line — it used to be a hard, un-allowlistable finding, i.e. a build break
$ # (a) line 67 verbatim, as a header line -> does it fire?
PASS — the registry can be trusted and no work item claims evidence it does not have.
exit=0
$ # (b) the SAME sentence with one subject word ("count") added -> does it fire?
  FINDING [instrument-headers-honest]: verifier-line67b.mjs:2: the header claims its own text changed and names no commit sha or file:line to check it against: "*      line — it used to be a count that a hard, un-allowlistable finding, i.e. a build break"
FAIL — 1 factory finding(s).
exit=1
```

So the reason is precisely the narrowing, and the line is otherwise the same shape as B1.

Third — the ceiling is not merely *asserted*, it is **exactly right**. Widening the rule (drop the
`HEADER_SELF_SUBJECT` test) and running it against the **real guard headers** fires on exactly the two lines
the builder named, and no others:

```
$ # mutation: remove the SELF_SUBJECT narrowing, run against the real guard files
Factory guard — the scheduler registry and the work state
===========================================================
  FINDING [instrument-headers-honest]: check-acceptance-greps.mjs:61: the header claims its own text changed and names no commit sha or file:line to check it against: "*      acceptance greps.\"* A comment that says \"this used to be `hasPhoto`\" is"
  FINDING [instrument-headers-honest]: copy-field-consumption-guard.check.mjs:67: the header claims its own text changed and names no commit sha or file:line to check it against: "*      line — it used to be a hard, un-allowlistable finding, i.e. a build break"

FAIL — 2 factory finding(s).
exit=1
restored: 5d384806a7d6a596832b80c536d011a8f2019358a3ba5ee7e47b17e3a72769b3
```

**Ceiling verdict: HONEST.** The claim "the narrow rule does not catch `copy-field-consumption-guard.check.mjs:67`"
is **true**, the second line it names (`check-acceptance-greps.mjs:61`) is **true**, and the widened rule fires
on those two and nothing else — the ceiling is neither understated nor inflated. Recorded as a known-open
decision (orchestrator's D-011), not a defect in this round.

---

# Spot-checks on the remaining findings (deterministic greps, read-only)

Not part of the brief's five commands; cheap, and each is a claim a reader would act on.

## B1 (blocking) — the false history clause is gone

```
$ git grep -n -f /tmp/b1-needle.txt -- scripts/guards/     # needle: "a typed count in this header went stale once already"
scripts/guards/factory-guard.check.mjs:268:    '#!/usr/bin/env node\n// zz-seeded — a typed count in this header went stale once already.\nprocess.exit(0)\n'
scripts/guards/factory-guard.mjs:286: *     ("a typed count in this header went stale once already" — a sentence whose
$ sed -n '78,90p' scripts/guards/regexp-escape-guard.mjs
 * merging them would be a behaviour change.
 *
 * Behavior is proven by `regexp-escape-guard.check.mjs` — seeded sixth copies
 * in e2e/ AND in scripts/, a `.scratch` copy, `.vitest` at the root and nested,
 * a `.d.mts` and a `.d.cts` copy, a deleted implementation, a lone copy in the
 * wrong file. It prints its own case count rather than quoting one here: the
 * printed line is the fact, a map in a comment is not. run-all.sh runs it in
 * the same gate.
```

The clause is **gone from `regexp-escape-guard.mjs`**. The phrase survives in exactly two places, neither of
which asserts the history as fact: `factory-guard.mjs:286` is the rule's own **quotation of the defect** it
catches, and `factory-guard.check.mjs:268` is the **seeded test string**. Both sit *after* the first line of
code, so the header scan never reaches them — that is why the guard passes on this repo, measured:

```
$ git log --all -p -- scripts/guards/regexp-escape-guard.mjs | grep -nE "^\+.*(checks? passed|[0-9]+ checks|case count)"
56:+ * wrong file. It prints its own case count rather than quoting one here: the
153:+ * wrong file. It prints its own case count rather than quoting one here, because
$ for c in ce3479c c2ec32e 0205c8d HEAD; do printf "%s " "$c"; git show $c:scripts/guards/regexp-escape-guard.mjs | grep -cE "checks passed|all [0-9]+ check"; done
ce3479c 0
c2ec32e 0
0205c8d 0
HEAD 0
```

(The two `+` lines are the fix-2 wording and this round's replacement of it; neither contains a typed number.
`grep -c`'s exit is 1 for a count of 0 — a match-nothing status, not a failed command.)

## N1 — the label is pinned to a commit; the bare `HEAD` label is gone from the builder-owned reports

```
$ grep -rn "265 at" .scratch/v28/reports/slice-6c.md .scratch/v28/reports/slice-6c-fix-2.md
.scratch/v28/reports/slice-6c.md:274:`c484648`, 259 at `ce3479c`/`32e9f48`, 265 at `0205c8d` — with no such reviewer measurement on record, so
.scratch/v28/reports/slice-6c-fix-2.md:30:… `git ls-files .scratch \| wc -l` → 262 at `c484648`, 265 at `0205c8d`; …
.scratch/v28/reports/slice-6c-fix-2.md:71:in the range** (262 at `c484648`, 259 at `ce3479c`/`32e9f48`, 265 at `c2ec32e`/`0205c8d`). So the
$ git ls-tree -r --name-only 0205c8d .scratch | wc -l     # is 265 real at the commit now named?
265
$ git ls-tree -r --name-only HEAD .scratch | wc -l
277
```

`265 at HEAD` is gone; all three sites name `0205c8d`, and the command reproduces **265** there. The three
remaining `at HEAD` hits in those files (`slice-6c.md:534`, `slice-6c-fix-2.md:378,548`) are ordinary prose
("unused at HEAD", "cases 5/6/8 at HEAD", "re-measuring at HEAD"), not the count label — not the N1 defect.

## N5 / N6 — a failed git step keeps git's reason, and the summary stops indicting the guard

Reproduced in `/tmp` copies with a `PATH` git shim that prints git's `fatal:` line and exits 128 — the
reviewer's own scenario. Base `71bdd55` vs this round's HEAD:

```
############ BASE (71bdd55) ############
  ✗ PREMISE: … — git step failed: Command failed: git init -q && git add -f .scratch/zz-probe.mjs — case 5 still runs either way, because the guard never consults git
regexp-escape-guard check: 1 check(s) failed — the guard is not doing its job.
exit=1

############ HEAD (this round) ############
  ✗ PREMISE: … — git step failed: fatal: detected dubious ownership in repository at '/tmp/zz-fake' — case 5 still runs either way, because the guard never consults git
regexp-escape-guard check: 1 check(s) failed — the wrapped git PREMISE, not the guard.
Every case about the guard's own behavior passed; what failed is the environment the premise
needs (git's own message is on the ✗ line above). Fix the environment, re-run, and read the
count again — this red is not a broken guard, but it is not a pass either.
exit=1

############ HEAD, git absent (shim exits 127, NO stderr) ############
  ✗ PREMISE: … — git step failed: Command failed: git init -q && git add -f .scratch/zz-probe.mjs — …
regexp-escape-guard check: 1 check(s) failed — the wrapped git PREMISE, not the guard.
exit=1
```

**N5 FIXED** (git's own reason is now on the ✗ line; the no-stderr case falls back to the command name, as
documented), **N6 FIXED** (the summary no longer says "the guard is not doing its job" when only the wrapped
premise failed), and the exit code stays 1 either way — the environment red is still a red.

---

# Machine-state guard: the repo was not modified by this lane

Every mutation above was applied under `/tmp` (`/tmp/vrroot`, `/tmp/vmut`, `/tmp/vbase`, `/tmp/vshim`). The
only commands I ran against the repo were read-only greps, `git`, and `npm run verify` (whose outputs `dist/`
and `test-results/` are gitignored build products).

Guard files, sha256 **AT END** — unchanged from the start:

```
HEAD now: 7fe70037d54e6e6dde845f20f4f541617965a887
5d384806a7d6a596832b80c536d011a8f2019358a3ba5ee7e47b17e3a72769b3  scripts/guards/factory-guard.mjs
fe98ace1b44af3f7c8dec687200bd43ebdc9c956531cfef4b884802569711101  scripts/guards/factory-guard.check.mjs
2922f042c0e2a59564c0c999467920cdf93f191438166ae9efdda1cd270f17f8  scripts/guards/regexp-escape-guard.mjs
8493f7e8f3ad4a7799a248138aea3d928e6615122607441461b394f68a4d7bde  scripts/guards/regexp-escape-guard.check.mjs

git status --porcelain=v1:
(empty = the orchestrator's own commits are the only change; no uncommitted tracked edits from this lane)
```

Start hashes were `5d384806…`, `fe98ace1…`, `2922f042…`, `8493f7e8…` — identical to the end hashes above. The
builder's report quotes the same four, so the bytes every tail in this report was produced on are the bytes
`20773ee`/`b4a8b73` contains.

---

# Verdict

**VERIFY: PASS**

| # | Command | Result |
|---|---|---|
| 1 | `npm run verify` | **PASS** — exit 0; 71 files / **2067** tests / **81** warnings / **0** errors / AGENTS.md 1789 / `GUARDS: PASS` |
| 2 | `bash scripts/guards/run-all.sh` | **PASS** — exit 0, **470** lines, `GUARDS: PASS` |
| 3 | `node scripts/guards/factory-guard.check.mjs` | **PASS** — exit 0; printed total **20** = **20** counted = **20** call sites; counter derived at run time |
| 4 | `node scripts/guards/regexp-escape-guard.check.mjs` | **PASS** — exit 0; `all 12 checks passed` = **12** counted = **12** docstring map items (N3) |
| 5 | `bash scripts/steering-lint.sh` | **PASS** — exit 0; AGENTS.md 1789/1800 |
| A | N7 rule fires / honest control passes / non-vacuous | **PASS** — both seeds fire, control passes, three mutations each kill exactly their own case |
| B | the named ceiling (`copy-field-consumption-guard.check.mjs:67`) | **HONEST** — the line does **not** fire; widening fires on exactly the two named lines |

**Baseline (71 / 2067 / 81 / 0 / GUARDS PASS) unmoved.** The brief's 2065 is real at the brief's own base —
reproduced in a `/tmp` copy — and the +2 delta is `scripts/factory/scheduler.test.mjs` (35→37 `it(` sites at
`1281c9b`), outside the builder's diff. **Attribution confirmed.**

## Residual risks (named, not silently dropped)

- **N7 scans only the leading comment block.** A history claim in a JSDoc further down a guard file is not
  caught. This is documented by the builder and is why `factory-guard.mjs:286` (the rule's own quotation of the
  B1 sentence) does not self-fire.
- **N7 requires the pointer on the claim line.** I measured the consequence: an *honest* header that wraps its
  pointer to the next line is flagged (my first control attempt failed for exactly that reason). The rule can
  false-positive on wrapped honest prose; the builder names this as a ceiling.
- **N7's sha pattern can accept a hex-looking English word** (`\b[0-9a-f]{7,40}\b`), so a claim could be
  spuriously exempted. Failure direction is lenient (a miss, not a false alarm) — as documented.
- **A root with no `scripts/guards` prints a note and passes** — vacuous by construction, but named in output,
  and impossible in the real repo (which has the directory). An empty `scripts/guards/` passes silently, which
  is structurally harmless (no instruments to check).
- **`npm run verify` was not run on a frozen checkout** — the orchestrator committed factory bookkeeping
  (`7fe7003`) during this lane. The slice surface (the four guard files) is byte-identical across the move, so
  the gate result stands; recorded so the next reader knows the HEAD moved.

No BLOCKERs. No failing lane. No command needed to be re-run with altered flags.
