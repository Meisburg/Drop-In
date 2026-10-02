# Slice 6c — FIX ROUND 1 — report

Committed as: `c2ec32e` — the slice commit. *(This line is written by a report-only follow-up commit: a file cannot name its own creating commit, so the hash here is the slice commit's, not this file's.)*

**Two report-only corrections in that follow-up**, both measured against `c2ec32e` rather than typed: the `Committed as` placeholder above, and the `+827` in "What this commit contains" below, which was the **pre-amend** figure — `git show --stat c2ec32e` reports **828 insertions(+), 19 deletions(-)**. Self-referential arithmetic on a file that describes itself went stale twice in this round; this is the second.

**Round:** V28 round 2, slice 6c, fix round 1. Findings G1–G4 come from
`.scratch/v28/briefs/slice-6c-fix-1.md`. This file is the artifact of record for that round: the
previous builder did the on-disk work and died before committing or reporting, and the builder before
that left a warning in a return message that never reached an artifact. **Everything below was read out
of a command run in this round.**

**Two rounds of work are in this commit.** The four on-disk files were the previous builder's
(+181/−19, uncommitted, verified by re-measurement rather than trusted); this round closed the two gaps
it left — the missing report (GAP A) and a stale number in the guard's own SCOPE header (GAP B) — and
ran the gate.

---

## Per-finding table — fixed or stated, with the measurement behind each

| Finding | Status | The measurement it rests on |
|---|---|---|
| **G1a** — a copy in a **TRACKED `.scratch` code file** passed silently while the header called `.scratch` "gitignored harness state" | **fixed by stating the hole, with a number and a reason** — `.scratch` stays in `SKIP_DIRS`; the header now says the skip is by directory **NAME**, that `.scratch` is skipped **whole**, that a copy in a tracked `.scratch` file is **UNCCOUNTED**, and why (frozen review-lane snapshots — `.scratch/guard-a03fc54.mjs` really holds the one-liner, so walking `.scratch` fails the lane on a clean tree). Pinned by **check case 4** | `git ls-files .scratch \| wc -l` → **262**; `git ls-files .scratch \| grep -c '\.mjs$'` → **23**, all under `.scratch/v4/`. Case 4 seeds a `.mjs` with the literal, `git add -f`s it, asserts `git ls-files` lists it, and requires the guard to exit 0 — see "G1, both directions" |
| **G1b** — `.vitest/` is gitignored and was **not** in `SKIP_DIRS`, so a generated cache file holding the literal **failed the lane** | **fixed in the implementation** — `.vitest` added to `SKIP_DIRS` and named in the header with its `.gitignore` line. Pinned by **check case 5** | Before/after reproduced in a throwaway copy: the **old** guard (no `.vitest`) on a `.vitest/cache.mjs` seed → **exit 1, names the file**; the **current** guard on the same seed → **exit 0**. See "The `.vitest` behaviour change, proven" |
| **G2** — the report presented `git grep … \| wc -l → 1` as the after-count; it now returns the report's own quotations | **fixed in the artifact** — inline CORRECTION at `.scratch/v28/reports/slice-6c.md` §1 naming `scripts/guards/regexp-escape-guard.mjs` as the authoritative instrument, plus a fix-round-1 table at the foot | The guard: **1 hit**, `src/lib/escapeForRegExp.mjs:37`, exit 0. The naive `git grep`: re-measured below — the count is prose, not copies |
| **G3** — `SCAN_EXT` excluded `.mts`, so a copy in a `.d.mts` was a silent pass | **fixed** — `.mts`/`.cts` added; the header's extension list names them. Pinned by **check case 6** | Case 6 seeds `src/lib/zz-seeded.d.mts` and requires exit 1 naming it. Load-bearing proof: the **old** `SCAN_EXT` makes case 6 **fail** — see "The `.vitest` behaviour change, proven" (same run) |
| **G4** — the batch's rule 1 ("write the rule into `docs/agents/code-structure.md` first, then the guard", `docs/agents/borrowed-guards.md:165-177`) was unmet | **fixed** — new section **"The one-copy rule"** in `docs/agents/code-structure.md`, in that file's shape: the rule, the module that holds it, the two properties that are part of the rule (detector-not-prohibition; a zero count fails), the header-is-authoritative sentence, and the pointer back to borrowed-guards rule 1 | `git diff --stat` for this commit lists `docs/agents/code-structure.md` (+38) |
| **GAP A** (this round) — `.scratch/v28/reports/slice-6c-fix-1.md` was referenced twice in `slice-6c.md` and did not exist | **fixed** — this file | `grep -n 'slice-6c-fix-1' .scratch/v28/reports/slice-6c.md` → two pointers, at **:275** and **:540** of the file as it stands in this commit (the brief cited `:267`/`:532`, which were the line numbers before this round's edits to that report — the pointers exist, the line numbers had already moved). This file satisfies both |
| **GAP B** (this round) — the SCOPE header's tracked-file count had drifted | **fixed** — header and `.check.mjs` case 4 comment now read **262** | `git ls-files .scratch \| wc -l` → **262** at `c484648`. **The header's 260 was the stale one; the orchestrator's 262 was right.** See "GAP B" |

---

## GAP B — which number is stale

The header said **260**. The orchestrator's read-only measurement at `4c2d2ab` said **262**. Measured in
this round, at `c484648`, against the index as it stood before this commit staged anything:

```
$ git ls-files .scratch | wc -l
262
$ git ls-files .scratch | grep -c '\.mjs$'
23
$ git ls-files .scratch | grep '\.mjs$' | sed 's|/[^/]*$||' | sort | uniq -c
     23 .scratch/v4
```

**262 is what I measured; 260 in the on-disk header was stale.** The `.mjs` figure (23, all under
`.scratch/v4/`) reproduced as written and was left alone.

Both places that carry the number are corrected: the guard's SCOPE header, and the comment above
`regexp-escape-guard.check.mjs` case 4.

**The number has a half-life, and the header now says so.** This commit itself stages three new files
under `.scratch/` (the two briefs and this report), so the same command **at the new commit returns a
larger number** — measured after staging, below. A count that moves with every committed report is
exactly the kind of figure that went stale here, so the header now names the command that re-measures
it instead of asking the reader to trust the figure.

---

## The gate — run in this round, raw tails

All four commands were run in this round, in this session, against the on-disk state that this commit
contains (i.e. **after** the GAP B correction to the header and to the case-4 comment). Full log for
`npm run verify` is 620 lines; the relevant tails are pasted, not summarised.

### 1. `npm run verify` → **exit 0**

```
$ npm run verify            # 620 lines of output; exit code read directly
EXIT=0
```

```
 Test Files  70 passed (70)
      Tests  2030 passed (2030)
   Start at  04:29:40
   Duration  10.70s (tests 48%, transform 42%, import 9%, worker 1%)
```

Lint: this oxlint prints **no summary line when its output is not a TTY**, so the counts are read out of
the finding lines rather than from a banner — `npm run lint` alone, exit 0:

```
$ npm run lint > /tmp/lint-6cfix1.log 2>&1; echo EXIT=$?
EXIT=0
$ grep -c ": warning " /tmp/lint-6cfix1.log
81
$ grep -c ": error " /tmp/lint-6cfix1.log
0
```

The guards tail inside `verify`:

```
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

===========================================================
GUARDS: PASS — all deterministic rules hold.
```

**The baseline did not move: 70 test files / 2030 tests / 81 warnings / 0 errors / GUARDS PASS — exactly
the figures the brief expects.** Nothing was adjusted to make that true.

### 2. `node scripts/guards/regexp-escape-guard.mjs` → **exit 0, one hit**

```
Regexp-escape guard — one escape implementation
===========================================================
  found: src/lib/escapeForRegExp.mjs:37
  ok — one implementation, at src/lib/escapeForRegExp.mjs:37
  ok — every other caller imports it (scope: the tree minus build output and the
       harness dirs named in SCOPE — `.scratch` skipped whole and uncounted)

PASS — the escape has exactly one home.
EXIT=0
```

### 3. `node scripts/guards/regexp-escape-guard.check.mjs` → **exit 0, all nine cases**

```
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
EXIT=0
```

### 4. `bash scripts/guards/run-all.sh` → **exit 0**

```
Build-law guard — sibling tests under src/lib/
===========================================================
  ok — all 55 non-exempt module(s) have a sibling .test.ts

PASS — build law holds.

Config-protection guard — protected check configs vs e2570c9cc483bb119b5dea61e1bc0680371879f2
===========================================================
  ok — no protected check config changed

PASS — checks still mean what they meant.
```

…(all guards and checkers in between; the full log is 436 lines)…

```
no-bypass-guard check: all 6 checks passed (the stated blind spot is proven, not asserted).

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

===========================================================
GUARDS: PASS — all deterministic rules hold.
EXIT=0
```

Note the `55 modules` figure in the lib-sibling guard: unchanged from before the new `.mjs` module, which
is the accepted blind spot (`lib-sibling-guard.sh:72` globs `*.ts` only), not a pass for the new module.

**Re-run after the report edits.** The only files changed after the gate run were the two `.md` reports, so
commands 2–4 were run again against the final on-disk state: guard **exit 0**, check **exit 0**, run-all
**exit 0**, and `diff` of the run-all output against the earlier run is **empty** (byte-identical).

---

## G1, both directions — the acceptance the round asks for

The check's **case 4** and **case 5** perform the two directions, and both are green in every run pasted
above. Because the check prints its detail only on failure, the same two states are also demonstrated
directly below, in a throwaway copy of `src/` + `e2e/` + `scripts/` under `/tmp` (the repo is never
touched; the guard copy is deleted from the sandbox for the same reason the check deletes it).

### Direction (a) — a copy in a TRACKED `.scratch` code file is UNCCOUNTED

**check case 4** does exactly this: it writes a `.mjs` seed holding the literal into the sandbox's
`.scratch/`, runs `git init -q && git add -f .scratch/zz-probe.mjs`, asserts `git ls-files` lists it, and
requires the guard to exit 0 without naming the seed. Green above (`✓ a TRACKED .scratch copy is
UNCCOUNTED …`). The direct run, with the tracking visible:

```
$ git ls-files .scratch            # the seed IS tracked
.scratch/zz-probe.mjs

$ git ls-files --error-unmatch .scratch/zz-probe.mjs   # git agrees it is tracked
.scratch/zz-probe.mjs

$ node scripts/guards/regexp-escape-guard.mjs <sandbox>
--- CURRENT guard, tracked .scratch seed -> exit 0
    Regexp-escape guard — one escape implementation
    ===========================================================
      found: src/lib/escapeForRegExp.mjs:37
      ok — one implementation, at src/lib/escapeForRegExp.mjs:37
      ok — every other caller imports it (scope: the tree minus build output and the
           harness dirs named in SCOPE — `.scratch` skipped whole and uncounted)

    PASS — the escape has exactly one home.
```

So the hole is real and it is **stated**, which is what G1 asked for. The header now says the skip is by
directory **NAME** (not a gitignore query), that `.scratch` is skipped **whole**, that a copy in one of
the 23 tracked `.scratch/**/*.mjs` files is **UNCCOUNTED**, and why. The "why" is measured too — pointing
the same guard at the real `.scratch` tree fails a clean repo, on a frozen review-lane snapshot:

```
$ node scripts/guards/regexp-escape-guard.mjs .scratch   # the same guard, root = .scratch
--- CURRENT guard, root = the real .scratch tree -> exit 1
    Regexp-escape guard — one escape implementation
    ===========================================================
      found: guard-a03fc54.mjs:635

      FINDING: 1 copy/copies of the escape, expected exactly 1.
        guard-a03fc54.mjs:635 — import { escapeForRegExp } from '<path>/src/lib/escapeForRegExp.mjs'
      MISSING: none of them is src/lib/escapeForRegExp.mjs.
```

That is why the fix is "state the hole with a number and a reason", not "walk `.scratch`": the other half
of the option the brief offered would make the lane permanently red on a file this slice's owner may not
edit. The header's `guard-a03fc54.mjs:635` citation reproduces exactly, line included.

### Direction (b) — a `.vitest` file holding the literal does NOT fail the lane

**check case 5** seeds `.vitest/cache.mjs` with the literal and requires exit 0. Green above (`✓ a
generated .vitest cache file holding the literal does NOT fail the lane`). Direct run, current guard:

```
--- CURRENT guard (SKIP_DIRS with .vitest) -> exit 0
    Regexp-escape guard — one escape implementation
    ===========================================================
      found: src/lib/escapeForRegExp.mjs:37
      ok — one implementation, at src/lib/escapeForRegExp.mjs:37
      ok — every other caller imports it (scope: the tree minus build output and the
           harness dirs named in SCOPE — `.scratch` skipped whole and uncounted)

    PASS — the escape has exactly one home.
```

---

## The `.vitest` behaviour change, proven before/after

The on-disk comment in `.check.mjs` case 5 asserts *"this seed returned exit 1 before this round —
measured"*. **No evidence for that claim existed on disk.** It is reproduced here. The old guard is
`git show HEAD:scripts/guards/regexp-escape-guard.mjs` (verified pre-round: no `.vitest` in `SKIP_DIRS`,
`SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/`), run against the **same** sandbox and the **same** seed.

```
--- OLD guard (SKIP_DIRS without .vitest, from git show HEAD:...) -> exit 1
    Regexp-escape guard — one escape implementation
    ===========================================================
      found: .vitest/cache.mjs:1
      found: src/lib/escapeForRegExp.mjs:37

      FINDING: 2 copy/copies of the escape, expected exactly 1.
        .vitest/cache.mjs:1 — import { escapeForRegExp } from '<path>/src/lib/escapeForRegExp.mjs'

    This is a deterministic finding, not an opinion. Import the one implementation;
    do not add a second copy.

--- CURRENT guard (SKIP_DIRS with .vitest) -> exit 0
      found: src/lib/escapeForRegExp.mjs:37
    PASS — the escape has exactly one home.
```

**Before: exit 1, naming the cache file. After: exit 0.** The claim in the comment is now backed.

The same proof for **G3** (`.mts`), same sandbox, same seed, two guards:

```
--- OLD guard (SCAN_EXT without .mts) -> exit 0
      found: src/lib/escapeForRegExp.mjs:37
    PASS — the escape has exactly one home.

--- CURRENT guard (SCAN_EXT with .mts) -> exit 1
      found: src/lib/escapeForRegExp.mjs:37
      found: src/lib/zz-seeded.d.mts:1

      FINDING: 2 copy/copies of the escape, expected exactly 1.
        src/lib/zz-seeded.d.mts:1 — import { escapeForRegExp } from '<path>/src/lib/escapeForRegExp.mjs'
```

### The new cases are regression tests, not decoration

*"A seed that passes against the broken version is not a regression test."* So the **current 9-case check**
was run against the **pre-round guard** — a root whose `scripts/guards/regexp-escape-guard.mjs` is the
`HEAD` version and whose `.check.mjs` is this round's:

```
=== guard in this root is the PRE-ROUND one (no .vitest, no .mts) ===
  (no .vitest in SKIP_DIRS — confirmed old)
86:const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/
=== check in this root is the CURRENT one (9 cases) ===
187:  console.log('regexp-escape-guard check: all 9 checks passed.')

=== CURRENT 9-case check run against the OLD guard ===
  ✓ clean tree passes and names the one implementation
  ✓ a sixth copy in e2e/ is CAUGHT and named
  ✓ a sixth copy in scripts/ is CAUGHT (the guard scripts are covered too)
  ✓ a TRACKED .scratch copy is UNCCOUNTED — the header states the boundary it is not counted under
  ✗ a generated .vitest cache file holding the literal does NOT fail the lane — exit 1
  ✗ a copy in a DECLARATION file (.d.mts) is CAUGHT — .mts is in the extension list — exit 0
  ✓ a ZERO count FAILS — an instrument that matched nothing is not a pass
  ✓ one copy in the WRONG file FAILS — the count is not the whole rule
  ✓ restored sandbox passes again

regexp-escape-guard check: 2 check(s) failed — the guard is not doing its job.
```

**Cases 5 and 6 fail against the pre-round guard.** They are load-bearing. Case 4 passes against it too —
expected, and stated under Risks: `.scratch` was already skipped, so case 4 guards the *sentence* against
future drift, and is not itself evidence that G1a ever existed.

---

## G2 — the naive re-run, re-measured

The needle was written to a file and matched with `-F -f`, never put on a command line:

```
$ cat /tmp/g1demo/needle.txt        # the pattern, in a file, not on a command line
/[.*+?^${}()|[\]\\]/g

$ git grep --untracked -F -f /tmp/g1demo/needle.txt -- . | wc -l
16

$ git grep --untracked -F -f /tmp/g1demo/needle.txt -- . | cut -d: -f1 | sort | uniq -c | sort -rn
     14 .scratch/v28/reports/slice-6c.md
      1 src/lib/escapeForRegExp.mjs
      1 docs/agents/code-structure.md

$ git grep --untracked -F -f /tmp/g1demo/needle.txt -- src e2e scripts supabase | wc -l   # code trees only
1

$ git grep -c -F -f /tmp/g1demo/needle.txt -- scripts/guards/regexp-escape-guard.mjs scripts/guards/regexp-escape-guard.check.mjs
  exit 1, no output — the two guard files hold ZERO raw hits (they write it split/escaped so the detector cannot count itself)
```

**The guard is the authoritative instrument and it says one** (`found: src/lib/escapeForRegExp.mjs:37`,
exit 0, pasted above). The `git grep` count is prose: 14 hits are `slice-6c.md` quoting the pattern to
discuss it, 1 is the prose quotation in the new `docs/agents/code-structure.md` section (`.md` is not in
`SCAN_EXT`, so the guard does not see it), and the single code hit is the surviving implementation.

**Self-hit, stated rather than hidden.** That block was measured before this report was finished. This
report pastes the pattern once — the `cat needle.txt` output above — so the same command **as of this
commit** returns one more, and the file list gains this report:

```
$ git grep --untracked -F -f /tmp/g1demo/needle.txt -- . | cut -d: -f1 | sort | uniq -c | sort -rn
     14 .scratch/v28/reports/slice-6c.md
      1 src/lib/escapeForRegExp.mjs
      1 .scratch/v28/reports/slice-6c-fix-1.md
      1 docs/agents/code-structure.md
$ git grep --untracked -F -f /tmp/g1demo/needle.txt -- . | wc -l
17
```

That is G2 in miniature, happening while it is being written: **the total is not a quantity, it is an
artifact of how much has been written about the pattern**, and it moves inside a single round. The stable
figures are the guard's (**1**, exit 0) and the code-tree-only grep (**1**). `slice-6c.md`'s correction
block now says so in those terms instead of pinning a total.

**And the correction block in `slice-6c.md` had itself drifted.** It recorded `15 report hits + 1
implementation`. Measured now: **14 + 1 implementation + 1 docs**. The docs section (G4's fix) landed
after that number was written and moved one hit. Per this round's rule — *a number on disk is not
evidence* — that block is corrected in this commit, and the pinned total is **removed** from it (replaced
by "do not quote a total from that command: it grows by one every time the pattern is written down,
including in the sentence that explains it"), because a total there is stale the moment anyone writes
about the pattern again.

---

## What this commit contains

One commit, not pushed (batch rule: no push mid-batch).

```
 .scratch/v28/briefs/slice-6c-fix-1-completion.md |  99 ++++++
 .scratch/v28/briefs/slice-6c-fix-1.md            |  76 ++++
 .scratch/v28/reports/slice-6c-fix-1.md           | 462 +++++++++++++++++++++++
 .scratch/v28/reports/slice-6c.md                 |  62 ++-
 docs/agents/code-structure.md                    |  38 ++
 scripts/guards/regexp-escape-guard.check.mjs     |  64 +++-
 scripts/guards/regexp-escape-guard.mjs           |  46 ++-
 7 files changed, 828 insertions(+), 19 deletions(-)
```

*(Corrected from `827` by the report-only follow-up — the `827` was measured before the amend. Re-measured with `git show --stat c2ec32e`.)*

- **The four files the previous builder left on disk** (its part of the round: G1 sentence + `.vitest` +
  `.mts`/`.cts`, the three new check cases, G4's docs section, G2's inline correction). Not redone. Two
  numbers inside them were corrected by this round after re-measurement: the `.scratch` tracked-file
  count (260 → 262, in the header and in the case-4 comment), and the G2 breakdown (15 → 14 + 1 docs).
- **This report**, GAP A.
- **The two briefs**, so the round's findings and its completion instruction are in the artifact next to
  the fix, not only in an ephemeral dispatch.

**The `.scratch` count, both sides of this commit** — because the header now carries a number that moves:

```
$ git ls-files .scratch | wc -l      # at c484648, before this commit staged anything
262
$ git ls-files .scratch | wc -l      # after staging this commit's three new .scratch files
265
$ git ls-files .scratch | grep -c '\.mjs$'   # both sides: unchanged
23
```

The header carries **262** — the figure measured against the tree this round started from — with the
re-measuring command written next to it, so the next reader gets a measurement point instead of a claim.

---

## Accepted, unchanged (the orchestrator's rulings — not touched by this round)

- **The dedupe itself (5 → 1)** — passed review and verify. Untouched.
- **The `.d.mts` declaration-drift cost** — `tsc` never reads the `.mjs` (`allowJs` off,
  `tsconfig.app.json` is `config-guard` PROTECTED), so typecheck checks call sites against the
  declaration and never the declaration against the implementation. Named, accepted.
- **`lib-sibling-guard.sh:72` cannot see the new module** (it globs `*.ts` only). Named, not this
  round's job.

## Residual risks

- **The `.scratch` tracked-file count in the header is a dated measurement, not an invariant.** It
  grows with every committed report. The header now carries the command; a reader who wants the current
  figure runs it. The alternative — dropping `.scratch` from `SKIP_DIRS` — is the other half of the
  G1 fix the brief offered, and it is **not** available: `.scratch/guard-a03fc54.mjs` contains the
  one-liner as a frozen review-lane snapshot, so walking `.scratch` makes the lane red on a clean tree
  for a file this slice's owner may not touch.
- **`SCAN_EXT` widening is a one-way door for existing files.** `.mts`/`.cts` are now scanned; if any
  such file in the tree already held the literal, the lane would now be red. It is not — the guard
  reports exactly one hit — but that is a measurement of today's tree, not a property of the change.
- **Case 4 pins the sentence, not the skip.** `.scratch` was already in `SKIP_DIRS` before this round,
  so case 4 would pass against the old guard too. That is intended — it exists to catch a future drift
  between the header's claim and the mechanism — but it means case 4 is not itself evidence that G1a
  was ever broken. The evidence for G1a is the reviewer's measurement in the brief, plus the header
  text that this round rewrote.
- **No `npm run test:e2e` in this round.** `verify` does not run Playwright; the round touches no
  shipped code, only guard prose, `SKIP_DIRS`, `SCAN_EXT`, a docs section, and a report.
