<!-- persisted VERBATIM by the orchestrator from the verifier's lane output (the lane is read-only and returned it inline). Content is the lane's own; not one word is the orchestrator's. -->
# Slice 6d — VERIFICATION, ROUND 2 (fresh context)

**Verdict: VERIFY PASS.**
**Worktree:** `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
**HEAD:** `a6163ac`. The guard/check blobs under review are byte-identical to `3e395ad` (the brief's
post-fix sha); `45cd77b` is the fix commit. Pre-fix sha `248d897` confirmed.

| sha | role | guard sha256 (16) |
|---|---|---|
| `248d897` | pre-fix (reviewed) | `42ae1649b401da3b` |
| `3e395ad` | post-fix / HEAD state of the two instruments | `d2f2200a2312f534` |
| worktree | equals `3e395ad` for both instruments | `d2f2200a2312f534` |

`git diff 3e395ad HEAD -- scripts/guards/ docs/agents/code-structure.md` → **empty** (post-fix commit ==
worktree for every file that matters here). Tree was clean and nothing was staged before and after this run:

```
$ git status --short
(no output)
$ git diff --cached --stat
(no output)
```

Read-only honored: no repo file was edited; the only writes were throwaway trees under `/tmp`. No inference
server was started or stopped; nothing was pushed.

---

## 1. `npm run verify` → **exit 0**

Raw tail:

```
factory-guard check: all 90 checks passed.

===========================================================
GUARDS: PASS — all deterministic rules hold.
VERIFY_EXIT=0
```

Re-measured figures (all match the fix-round report's §12 gate table):

| metric | measured | report claimed |
|---|---|---|
| exit code | **0** | 0 |
| test files | `Test Files  71 passed (71)` | 71 |
| tests | `Tests  2068 passed (2068)` | 2068 |
| lint warnings (`grep -c ": warning "`) | **81** | 81 |
| lint errors (`grep -c ": error "`) | **0** | 0 |
| AGENTS.md vs ceiling | `ok — AGENTS.md (1789 words, ceiling 1800)` | 1789 / 1800 |
| steering layer | `PASS — steering layer is clean.` | (green) |
| GUARDS | `GUARDS: PASS — all deterministic rules hold.` | PASS |
| `grep -c "^  FINDING"` | **0** | 0 |
| `grep -c FINDING` | **1** | 1 |

**The builder's disclosure is TRUE.** The single plain-`grep` match is a **passing check name**, not a
finding line:

```
$ grep -n FINDING /tmp/v28-6d-verify2.log
636:  ✓ a scan that can attribute no word to any kind is a FINDING, not a pass (B3)
```

`grep -c "^  FINDING"` (finding indent) → **0**. So the report's parenthetical ("the word appears in a
passing check NAME") is verified, not repeated.

## 2. `bash scripts/guards/run-all.sh` → **exit 0**

```
$ bash scripts/guards/run-all.sh
...
factory-guard check: all 90 checks passed.

===========================================================
GUARDS: PASS — all deterministic rules hold.
RUN_ALL_EXIT=0
```
`grep -c "^  FINDING"` on the lane output → **0**; `grep -c FINDING` → 1 (the same passing check name).

## 3. `node scripts/guards/copy-taxonomy-guard.mjs` → **exit 0**

```
GUARD_EXIT=0
  taxonomy: src/lib/places.ts
  kinds read: 10; offered: 8; words: 9
  scanned words: 9 (Park, Playground, Indoor play, Museum, Pool, Splash pad, Library, Beach, Trail)
  limit—— kind "other" is not scannable: ...
PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.
```

## 4. `node scripts/guards/copy-taxonomy-guard.check.mjs` → **exit 0**

```
CHECK_EXIT=0
copy-taxonomy-guard check: all 27 checks passed, 0 failed, across 24 guard invocations (7 of them against a mutated copy of the guard), against scripts/guards/copy-taxonomy-guard.mjs.
```

Independently counted, not taken on the summary line's word:

| metric | builder claim | my independent count | how |
|---|---|---|---|
| checks | 27 | **27** | `grep -c "^  ✓"` on the check output |
| invocations | 24 | **24** | static walk of `check.mjs`: 1 clean seed run + 6 `rule()` calls × 2 (before + after) + 11 standalone `run()` sites (declaration-deleted, renamed const, no-string-literal, module-gone, taxonomy-no-kinds, label-fn-no-word, no-declaration, limit-line, B3 seed, B3 mutation, final clean) = 1+12+11 = 24 |
| mutated invocations | 7 | **7** | `grep -c "MUTATION"` = 7; source: 6 `rule()` mutations + 1 B3 mutation |

The **B2** fix is also live-verified: `grep -c "copy-taxonomy-guard.mjs"` on the check output → **2**
(identity line + summary suffix), was 0 pre-fix.

---

## 5. B3 / D-030 — settled independently, both halves

Method (matches the reviewer's input, and the brief's): a throwaway tree per guard, `src/` copied, every
`case '<kind>':` → `return '<word>'` inside `placeKindLabel` collapsed onto the label function's **default
word** `'Place'` (9 case returns rewritten, scoped to the function; verified by the rewriter: `cases=9,
rewrote=9`). `node_modules` symlinked; the guard takes a root argument. No repo file touched.

**Pre-fix guard** (`git show 248d897:...`, sha256 prefix `42ae1649…`):

```
$ node /tmp/b3old/scripts/guards/copy-taxonomy-guard.mjs /tmp/b3old
  ...
  kinds read: 10; offered: 8; words: 9
  scanned words: 0 (none)
  limit—— kind "park" is not scannable: ...   (×10)
  ...
PASS — every declared taxonomy claim exists, is offered, is backed by the copy, and the copy names no category it did not declare.
OLD_EXIT=0
```

**Current guard** (`git show 3e395ad:...`, sha256 prefix `d2f2200a…`):

```
$ node /tmp/b3new/scripts/guards/copy-taxonomy-guard.mjs /tmp/b3new
  ...
  kinds read: 10; offered: 8; words: 9
  scanned words: 0 (none)
  limit—— kind "park" is not scannable: ...   (×10)
  limit—— src/lib/firstRunTour.ts: the declared kind "playground" is not scannable, so rule 3 does not check its claim (...)   (×3)
  ...

FAIL — 1 finding(s):
  - src/lib/places.ts: the scan found NO word it can attribute to a kind — every kind's word resolves to the label function's own default or is shared with another kind, so rules 3 and 4 would test NOTHING and a report of health would mean the guard did not look (see limit—— lines above)
NEW_EXIT=1
```

**Conclusion: the fix's premise is correct.** The pre-fix guard exits **0** with `scanned words: 0 (none)`
and prints PASS on a zero-word scan; the current guard exits **1** on the identical input and names why. The
tripwire `if (kindsByLabel.size === 0) fail(...)` is what flipped it (the diff shows exactly this addition,
plus the header/`limit——` prose). The `check.mjs` B3 seed asserts the same state and its mutation removes
the tripwire, restoring exit 0 — the check's premise + finding + mutation all trace to the real defect.

---

## 6. Baseline re-derivation — independently confirmed (631 → 635, new 4 / lost 0 / decreased 0)

**The guard's own printed note line:**

```
  note — no-bare-head-count: baseline holds 635 recorded occurrence(s); a new count resolved through bare HEAD is a finding
```

**Independent count #1 — parse the committed map from source** (extract the `new Map([...])` literal and
sum its values; no reliance on any report):

```
CURRENT: entries=405 sum=635
PRE-FIX: entries=401 sum=631      (git show 248d897:...)
added   (4):
   + .scratch/v28/reports/slice-6d-review.md::git diff --stat 35e3f20..HEAD
   + .scratch/v28/reports/slice-6d-verify.md::2068 at HEAD
   + .scratch/v28/reports/slice-6d-verify.md::37 tests; HEAD
   + .scratch/v28/reports/slice-6d-verify.md::HEAD the gate prints `Test Files  71
removed (0): []
increased (0): []
decreased (0): []
```

**Independent count #2 — count the occurrences the absorber actually scans.** A throwaway copy of
`factory-guard.mjs` with ONE inserted line, `BARE_HEAD_BASELINE.clear()`, makes every scanned occurrence
exceed the baseline, so the guard emits one `no-bare-head-count` finding per occurrence. I counted the raw
lines myself:

```
$ node /tmp/fgprobe/factory-guard.mjs --root <real repo>
total no-bare-head findings: 635
other FINDING checks: 635 FINDING [no-bare-head-count]
scanned 132 WORKING-TREE file(s); git tracks 132 under the same paths (0 untracked, 0 tracked-but-absent)
```

**The two counts agree and the map is complete.** sum(scan occurrences) = **635** = sum(map). The real guard
exits 0, so every key's seen-count is ≤ its recorded count; combined with equal totals that forces
seen == recorded for every key — i.e. **new 0 / lost 0 / decreased 0** against the committed map, and
**new 4 / lost 0 / decreased 0** against `248d897`. The four added keys are exactly the four lane-report
quotations the fix round recorded. The report's claims (631→635, new 4/lost 0/decreased 0; note line = map
size) are all independently reproduced, not accepted.

---

## 7. Other lanes checked

- Plan's slice verify clause (`plan.md:462`) is "`npm run verify` … **and** the guard's own `.check.mjs`" —
  both run above, both pass.
- `scripts/check_plan.py` does **not** exist in this repo (checked); nothing to run.
- `bash scripts/steering-lint.sh` runs inside `npm run verify` and passes (`AGENTS.md 1789/1800`, docs
  reachable, `steering layer is clean`).
- No separate `verify-<app>` or live-smoke lane is defined for this slice; `npm run verify` is the gate and
  it exited 0.

## 8. Discrepancies / notes

1. **Non-blocking prose staleness (pre-existing, not a fix-round claim).** The original report's §8 says
   "the instrument in the tree you are reading" is 475 / 370 lines with sha256 `42ae1649…` / `dccdec25…`.
   Measured now: guard **495** lines / sha `d2f2200a2312f534`; check **447** lines / sha `b5a6017d36ba4caa`.
   §8 was written before fix round 1 and §12 did not restate it; the numbers it prints are the pre-fix
   ones (`42ae1649…` is in fact the `248d897` guard, i.e. the *reviewed* instrument). No fix-round claim
   is false; this is a reader trap if §8 is read as current. Named with the measured numbers.
2. **B3 fix scope is honest**: the fix's own §12 note that the clean tree prints no new line is correct —
   the live run's `scanned words: 9` and no `declared kind ... is not scannable` line; the tripwire's state
   does not arise on today's taxonomy.
3. No file in the repo was modified by this verification; `git status` clean, nothing staged.

**Verdict: VERIFY PASS.** All four specified commands exit 0; B3's premise (old guard passes on a zero-word
scan, new one fails) is reproduced from scratch and correct; the baseline re-derivation (631→635) reproduces
by two independent counts; every reported count I could measure matched exactly.
