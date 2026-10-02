# Slice 6c FIX ROUND 4 — VERIFIER REPORT (V28 r2)

**Lane:** deterministic referee. Authority on "does it work". No style opinions.
**Repo:** `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
**Builder commit:** `876a516`, base `9f20d02`.
**Builder report read as CLAIM:** `.scratch/v28/reports/slice-6c-fix-4.md`.

**Repo byte-identity guard.** sha256 of the two guard files recorded at start and again at end; every mutation
of a guard file or a repo file was done on a `/tmp` copy only. No `systemctl`; no inference server touched.

Start-of-run sha256 (raw):

```
$ sha256sum scripts/guards/factory-guard.mjs scripts/guards/factory-guard.check.mjs
146bacaaf1b2f863e1cf262ae143bb95e622a24e01743c18fed907f16a2bf921  scripts/guards/factory-guard.mjs
4303e900785273eccff956a55764feb1edacda7c9e8f5a99764f3b8027250024  scripts/guards/factory-guard.check.mjs
```

Builder diff scope (raw):

```
$ git diff --name-only 9f20d02..876a516
.scratch/v28/reports/slice-6c-fix-3.md
.scratch/v28/reports/slice-6c-fix-4.md
factory/work/v28-r2-6c.json
scripts/guards/factory-guard.check.mjs
scripts/guards/factory-guard.mjs
```

No test file in the diff (raw):

```
$ git diff --name-only 9f20d02..876a516 -- '*.test.mjs' '*.test.ts'
(empty)
```

---

## Lane 1 — `npm run verify` → exit 0

Raw (from `/tmp/verify-6c4.out`, stdout redirected to a file = off-TTY):

```
$ npm run verify ; echo "VERIFY_EXIT=$?"
VERIFY_EXIT=0
$ grep -E "Test Files|Tests " /tmp/verify-6c4.out
 Test Files  71 passed (71)
      Tests  2067 passed (2067)
$ grep -c ': warning ' /tmp/verify-6c4.out
81
$ grep -c ': error ' /tmp/verify-6c4.out
0
```

Baseline demanded: 71 files / 2067 tests / 81 warnings / 0 errors. **All four match exactly.** No test file is
in the diff (verified above), so nothing could have moved them.

## Lane 2 — `node scripts/guards/factory-guard.check.mjs` → exit 0, 26 checks

Three independent counts of the same set (raw):

```
$ node scripts/guards/factory-guard.check.mjs | grep -c '^  ✓'
26
$ grep -cE '^\s+check\(' scripts/guards/factory-guard.check.mjs
26
$ grep -c 'check(' scripts/guards/factory-guard.check.mjs          # incl. the `const check = …` definition
27
$ node scripts/guards/factory-guard.check.mjs | tail -1
factory-guard check: all 26 checks passed.
EXIT=0
```

Printed check lines `26` == indented `check(` call sites `26` == run-time counter `26`. The `27` is the
`const check = …` definition site, not a case. **All three agree; builder's "all 26 checks passed" is confirmed
(was 20, +6 new).**

## Lane 3 — `node scripts/guards/regexp-escape-guard.check.mjs` → exit 0, 12 checks

```
$ node scripts/guards/regexp-escape-guard.check.mjs | tail -1
regexp-escape-guard check: all 12 checks passed.
EXIT=0
```

Docstring map still 12: the numbered list in `regexp-escape-guard.mjs:21,39` runs `1.`…`12.` and the check's
`ran` counter (line 246) prints `12`. **Unchanged.**

## Lane 4 — `bash scripts/guards/run-all.sh` → exit 0, GUARDS: PASS

```
$ bash scripts/guards/run-all.sh | tail -3
===========================================================
GUARDS: PASS — all deterministic rules hold.
EXIT=0
```

## Lane 5 — `bash scripts/steering-lint.sh` → exit 0, AGENTS.md 1789/1800

```
$ bash scripts/steering-lint.sh | grep AGENTS
  ok — AGENTS.md (1789 words, ceiling 1800)
EXIT=0
```

All five lanes green. Now the three reproductions that matter.


## N1 — the blank-line header fix (my own reproduction)

I built my own seed, not the builder's: a blank line inside the header block, then a typed count on a later
comment line.

```
$ printf '#!/usr/bin/env node\n// zz-verify-blank — my own N1 seed, blank line inside the header\n\n// 14 cases are covered here\nprocess.exit(0)\n' > /tmp/v6c4-n1/scripts/guards/zz-verify-blank.mjs
$ node scripts/guards/factory-guard.mjs --root /tmp/v6c4-n1
  FINDING [instrument-headers-honest]: zz-verify-blank.mjs:4: the header types a count of this instrument's own cases — print the count the run derives instead: "// 14 cases are covered here"
FAIL — 1 factory finding(s).
EXIT=1
```

The typed count `14 cases` sits on line 4, AFTER the blank line on line 3. **It is NOW flagged.** The fix is the
cause, proven against the base guard extracted to `/tmp` (sha
`5d384806a7d6a596832b80c536d011a8f2019358a3ba5ee7e47b17e3a72769b3`):

```
$ git show 9f20d02:scripts/guards/factory-guard.mjs > /tmp/fg-base-9f20d02.mjs
$ node /tmp/fg-base-9f20d02.mjs --root /tmp/v6c4-n1 | grep -c instrument-headers-honest
0
$ node /tmp/fg-base-9f20d02.mjs --root /tmp/v6c4-n1
  ok — 5 model(s), 8 task kind(s), 0 work item(s); every floor meetable, every artifact present, every instrument header stating only what it can point at
PASS — the registry can be trusted and no work item claims evidence it does not have.
```

Old guard: `0` hits, PASS. New guard: `1` finding, FAIL. **The fix is real and it is the fix that fires.**

Un-flagged control (a genuinely honest header, with a blank line but no typed count):

```
$ printf '#!/usr/bin/env node\n// zz-verify-honest — a header that types no count of its own cases\n\n// it prints the count the run derives\nprocess.exit(0)\n' > /tmp/v6c4-n1/scripts/guards/zz-verify-honest.mjs
$ node scripts/guards/factory-guard.mjs --root /tmp/v6c4-n1
  ok — 5 model(s), 8 task kind(s), 0 work item(s); every floor meetable, every artifact present, every instrument header stating only what it can point at
PASS
EXIT=0
```

**Not "flag everything":** an honest header with a blank line passes, and the run still claims the header check.
The fix narrows the break condition, it does not widen the match.

## N2 — the `ok —` line claims only what ran

Root with `factory/config.json` and NO `scripts/guards` (and no `.scratch`):

```
$ node scripts/guards/factory-guard.mjs --root /tmp/v6c4-clean
  note — no scripts/guards under this root; instrument headers unchecked here
  note — no-bare-head-count: baseline holds 23 recorded occurrence(s); a count labelled HEAD must not be added
  note — no .scratch/v28/reports or briefs under this root; report and brief counts unchecked here
  ok — 5 model(s), 8 task kind(s), 0 work item(s); every floor meetable, every artifact present
PASS — the registry can be trusted and no work item claims evidence it does not have.
EXIT=0
```

**The `ok —` line ends at `every artifact present`. It does NOT claim any header was checked, and does not
claim any report/brief count was checked.** Compare the base guard on the same root, which asserted the header
claim with nothing scanned:

```
$ node /tmp/fg-base-9f20d02.mjs --root /tmp/v6c4-clean
  ok — 5 model(s), 8 task kind(s), 0 work item(s); every floor meetable, every artifact present, every instrument header stating only what it can point at
```

Controls:
- With a scanned `scripts/guards`, the summary DOES claim the header check (so the claim is not simply always
  dropped): `ok — … every instrument header stating only what it can point at`.
- A real guard failure still reports as a real failure, not as "not run":

```
$ node scripts/guards/factory-guard.mjs --root /tmp/v6c4-n1      # zz-verify-blank.mjs seeded
  FINDING [instrument-headers-honest]: zz-verify-blank.mjs:4: the header types a count of this instrument's own cases — print the count the run derives instead: "// 14 cases are covered here"
FAIL — 1 factory finding(s).
EXIT=1
```

## N3 — the `no-bare-head-count` baseline and rule

### (a) independent count of the baseline — NOT taken from the builder

I parsed the `BARE_HEAD_BASELINE` literal out of the source AND independently re-ran the rule's own regex over
the actual worktree `.scratch/v28/reports` + `.scratch/v28/briefs`, keyed `file::matched-text`:

```
$ node /tmp/v6c4-count-baseline.mjs
LITERAL baseline keys: 13
LITERAL baseline occurrences: 23
WORKTREE keys: 13
WORKTREE occurrences: 23
MISMATCHES: none
```

Run-time printed size (from the guard itself): `baseline holds 23 recorded occurrence(s)`. **All three agree:
13 keys / 23 occurrences.** The builder's 23/13 is confirmed by direct count, and by an independent rescan of
the tree (zero mismatches) — no baselined key over- or under-counts the tree.

### (b) a brand-new bare-HEAD count fires

```
$ printf 'My measurement: 412 tracked files at HEAD — see the table.\n' > /tmp/v6c4-n3-new/.scratch/v28/reports/zz-verify-new.md
$ node scripts/guards/factory-guard.mjs --root /tmp/v6c4-n3-new
  note — no-bare-head-count: baseline holds 23 recorded occurrence(s); a count labelled HEAD must not be added
  FINDING [no-bare-head-count]: .scratch/v28/reports/zz-verify-new.md:1: a count is labelled HEAD and cannot be reproduced — name the commit it was measured at: "412 tracked files at HEAD"
FAIL — 1 factory finding(s).
EXIT=1
```

### (c) a baselined historical occurrence still passes (D-011 item 2)

```
$ printf 'The corpus is 265 at HEAD by the reviewer measurement.\n' > /tmp/v6c4-n3-based/.scratch/v28/reports/slice-6c-fix-1-review.md
$ node scripts/guards/factory-guard.mjs --root /tmp/v6c4-n3-based
  ok — 5 model(s), 8 task kind(s), 0 work item(s); every floor meetable, every artifact present, every report and brief count naming the commit it was measured at
PASS — the registry can be trusted and no work item claims evidence it does not have.
EXIT=0
```

A recorded occurrence (under a baselined key) passes. Forward-only holds.

### (d) the declared hole — TESTED, and it is real

The builder states a new occurrence byte-identical to a baselined key *up to* that key's recorded count is NOT
caught. Constructed exactly: a brand-new file at a baselined path
(`.scratch/v28/reports/slice-6c-fix-1-review.md`, base count `4`) carrying **four** copies of the baselined
text `265 at HEAD`:

```
$ printf '265 at HEAD\n265 at HEAD\n265 at HEAD\n265 at HEAD\n' > /tmp/v6c4-n3-hole/.scratch/v28/reports/slice-6c-fix-1-review.md
$ node scripts/guards/factory-guard.mjs --root /tmp/v6c4-n3-hole
  ok — 5 model(s), 8 task kind(s), 0 work item(s); every floor meetable, every artifact present, every report and brief count naming the commit it was measured at
PASS
EXIT=0
```

**Not caught — the declaration is honest.** One more than the recorded count fires, so the boundary is exactly
count-aware per `file::text`:

```
$ printf '265 at HEAD\n265 at HEAD\n265 at HEAD\n265 at HEAD\n265 at HEAD\n' > /tmp/v6c4-n3-hole/.scratch/v28/reports/slice-6c-fix-1-review.md
$ node scripts/guards/factory-guard.mjs --root /tmp/v6c4-n3-hole
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-1-review.md:5: a count is labelled HEAD and cannot be reproduced — name the commit it was measured at: "265 at HEAD"
FAIL — 1 factory finding(s).
EXIT=1
```

This is a real residual gap (a brand-new file placed at a baselined path with ≤ the recorded count of a
baselined text passes). It is disclosed by the builder and it is the strictest form compatible with D-011
item 2 (keying on line numbers would move on an unrelated edit above). **Reported as a residual risk, not a
failure** — the rule meets its stated contract.

## D-011 consistency — the record-label boundary

`.scratch` diff between base and builder:

```
$ git diff --stat 9f20d02..876a516 -- .scratch/
 .scratch/v28/reports/slice-6c-fix-3.md |   8 +-
 .scratch/v28/reports/slice-6c-fix-4.md | 336 +++++++++++++++++++++++++++++++++
 2 files changed, 340 insertions(+), 4 deletions(-)
```

Only the file the brief ordered edited (`slice-6c-fix-3.md`, the 3 ordered labels: `:16` wording, `:129` N4
label, `:526` B1 label) and this round's new report changed. Every OTHER lane's/brief's file that carries a
baselined `at HEAD` label is byte-identical between base and builder:

```
UNCHANGED  .scratch/v28/briefs/slice-6c-fix-2.md
UNCHANGED  .scratch/v28/briefs/slice-6c-fix-3.md
UNCHANGED  .scratch/v28/briefs/slice-6c-fix-4.md
UNCHANGED  .scratch/v28/reports/slice-6c-fix-1-review.md
UNCHANGED  .scratch/v28/reports/slice-6c-fix-1-verify.md
UNCHANGED  .scratch/v28/reports/slice-6c-fix-2-review.md
UNCHANGED  .scratch/v28/reports/slice-6c-fix-2-verify.md
UNCHANGED  .scratch/v28/reports/slice-6c-fix-3-review.md
UNCHANGED  .scratch/v28/reports/slice-6c-fix-3-verify.md
```

Independent count of `265 at HEAD` lines in those unchanged other-lane/brief files: `1+2+1+4+1+4+3+1+1 = 18`
(plus the 2 needle-reproduction lines in the edited `slice-6c-fix-3.md`, kept) — all preserved. The three
ordered edits are present and correct:

```
$ sed -n '16p;129p;526p' .scratch/v28/reports/slice-6c-fix-3.md
beside it, in the same call that recorded it. One finding **rejects the brief's quotation of the old docstring**, not the brief's
$ node scripts/guards/regexp-escape-guard.check.mjs | grep -c "^  [✓✗]"      # this run's check == 04921d8's check, same sha256
   276 tracked `.scratch` files at 71bdd55 — see the N1 table). Left alone and **correct as written**: it is
```

**The D-011 boundary held:** the builder edited only the file the brief ordered edited; no other lane's
historical `at HEAD` label was touched.

## Repo byte-identity

```
$ sha256sum scripts/guards/factory-guard.mjs scripts/guards/factory-guard.check.mjs   # END of run
146bacaaf1b2f863e1cf262ae143bb95e622a24e01743c18fed907f16a2bf921  scripts/guards/factory-guard.mjs
4303e900785273eccff956a55764feb1edacda7c9e8f5a99764f3b8027250024  scripts/guards/factory-guard.check.mjs
$ git diff --cached --name-only      # staged
(empty)
$ git status --porcelain             # worktree
(empty)
```

Start == end for both guard files. No staged files. Clean worktree. All mutation experiments ran in `/tmp`;
no `systemctl`, no inference server touched.

## Verdict

**VERIFY: PASS.**

- Lane 1 `npm run verify` → exit 0; 71 test files / 2067 tests / 81 warnings / 0 errors — baseline reproduced
  exactly, and no test file is in the diff.
- Lane 2 `factory-guard.check.mjs` → exit 0; printed `26` = indented `check(` sites `26` = run-time `26`.
- Lane 3 `regexp-escape-guard.check.mjs` → exit 0; `all 12 checks passed`, docstring map still 12.
- Lane 4 `run-all.sh` → exit 0; `GUARDS: PASS`.
- Lane 5 `steering-lint.sh` → exit 0; `AGENTS.md (1789 words, ceiling 1800)`.
- N1 fix fires on a blank-line header (base guard does not); honest header stays un-flagged.
- N2 summary claims only what ran; controls show the claim is not always dropped and a real failure still FAILs.
- N3 baseline independently counted 13 keys / 23 occurrences, matching run-time and a tree rescan; new
  occurrence fires, baselined occurrence passes, and the declared count-aware hole reproduces as declared.
- D-011 boundary held.

**Residual risks (disclosed, not failures):**
1. `no-bare-head-count` is count-aware per `file::text`: a brand-new file at a baselined path with ≤ the
   recorded count of a baselined text is not caught (reproduced). Strictest forward-only form under D-011.
2. The rule scans only `.scratch/v28/reports` and `.scratch/v28/briefs` — a bare-`HEAD` count in
   `.scratch/v28/ledger.md`, `plan.md`, or an older lane is not scanned (builder-disclosed scope).
3. "tracked" is implemented as "present on disk under `--root`"; in this repo that coincides with tracked, but
   an untracked file under `.scratch/v28/reports` would be scanned too.
4. `every floor meetable` / `every artifact present` remain unconditional even with zero work items or zero
   floors (pre-existing, builder-disclosed, out of this slice's scope).
