# Slice 6c — FIX ROUND 2 — report

**Committed as the single fix-round-2 commit** — parent `0205c8d`, base `50009ae`. A file cannot name
the commit that creates it, and this round is one commit by instruction, so there is no report-only
follow-up to fill this line in (the round this report is modelled on used one; this one does not).

**Base for this round:** `50009ae` (**plus the orchestrator's report-only `0205c8d`**). **Round 1's slice
commit:** `c2ec32e`.
**Findings:** `.scratch/v28/briefs/slice-6c-fix-2.md` — B1 (blocking, reviewer), N1–N4 (reviewer),
O1–O6 (`ocr`, verbatim in the brief because `ocr`'s JSON is gitignored at `.gitignore:112`).

Round 1's lanes: **verifier PASS**, **reviewer NEEDS_CHANGES**, **`ocr` 6 findings**. The gate is green
and stays green: the baseline must not move here either.

**This round continues a builder that was OOM-killed mid-sentence.** Its two guard files and this
report's skeleton were on disk, uncommitted; the brief's "STATE AT DISPATCH" named them. Its last
recorded words were *"The premise check passed on its own error message — a check that cannot fail.
Fixing:"* — so the inherited premise check was audited for exactly that defect, and the audit is under
"N3/O1/O3" below. Three findings were untouched by it and are done here: **N1, B1, N4**.

**Every number below was read out of a command run in this round, in the same call that recorded it.**
Where a finding's stated number did not reproduce, that is said, with the measurement.

---

## Per-finding table — fixed or rejected, with the measurement behind each

| Finding | Verdict | Status | The measurement it rests on |
|---|---|---|---|
| **B1** — `slice-6c.md:267` states "git TRACKS 260 files under `.scratch/`" as the reviewer's measurement; 260 reproduces at no commit and the ledger has no such reviewer measurement | reviewer | **fixed per the ruling — the number is DELETED, not replaced with 262** | `git ls-files .scratch \| wc -l` → 262 at `c484648`, 265 at HEAD; the ledger's reviewer text (`.scratch/v28/briefs/slice-6c-fix-1.md:20`) records "23 tracked `.scratch/**/*.mjs`", never 260. see "B1" below |
| **N1** — `docs/agents/code-structure.md:100-101` puts words in two lanes' mouths that only `ocr` said | reviewer | **fixed** — `ocr` quoted verbatim, second lane described as flagging the same duplication | the only wording on record is `.scratch/v28/briefs/slice-6c.md:12-13`; the guard header carried the same false attribution and was fixed the same way — see "N1" below |
| **N2** — the guard's success line claims "every other caller imports it", which the guard never measures | reviewer | **fixed** — the printed line now states only what the instrument establishes | `onlyCopy` is `hits.length === 1 && hits[0].startsWith(SANCTIONED)`; the callers are real but measured by hand, not by the guard |
| **N3 / O1 / O3** — case 4's git step pins the premise, not the mechanism, and its unguarded `execSync` can kill cases 5–9 | reviewer + `ocr` | **fixed in the ruled shape** — premise becomes its own named, wrapped check; the guard case asserts only exit + naming; **proven able to fail**, and a git failure still lets cases 5–12 and the summary run | see "N3/O1/O3" |
| **O2** — "at any depth" is stated in the header but both skip seeds sit at the sandbox root | `ocr` | **fixed** — new nested-skip case; **proven load-bearing against a root-anchored skip** | see "The two new probes are load-bearing" |
| **O4** — `.cts`/`.d.cts` stated in the header, never seeded | `ocr` | **fixed** — new `.d.cts` case; **proven load-bearing against a `SCAN_EXT` without `cts`** | same section (the `.d.mts` case re-proven too) |
| **O5** — five near-identical seed blocks; case 6 relies on `src/lib` already existing; cleanup symmetry is forgettable | `ocr` | **fixed** — one `seedCase(...)` helper does seed → run → check → `rmSync`; every seeded case creates its own parent dir | `grep -c 'writeFileSync' scripts/guards/regexp-escape-guard.check.mjs` → **3** (import + the helper + the premise seed) against **7** at `c2ec32e` (import + six per-case writes) |
| **O6** — the printed scope line splits a parenthesis across two lines | `ocr` | **fixed** — two self-contained single lines, each readable alone, no parenthesis | tail pasted in "N2 + O6" |
| **N4** — the `+181/−19` figure in `slice-6c-fix-1.md` is unverifiable by construction | reviewer | **fixed as instructed — labelled, not deleted** | `git diff --numstat c484648 c2ec32e -- <the four files>` → 191 insertions / 19 deletions |

**No finding is rejected.** All eleven were ruled in and all eleven are fixed. Nothing was silently
ignored. Two places where I did more than the finding's letter, and the reason each, are in "Where I did
not do the literal thing" below.

---

## B1 — the number nobody measured

**The ruling was explicit: delete the number, do not replace it with 262.** What was on disk at
`:264-275` of `.scratch/v28/reports/slice-6c.md` read:

> harness dirs", which was FALSE twice over, and the reviewer measured both directions: git TRACKS 260
> files under `.scratch/` (23 of them `.mjs`), so a copy seeded in one passed silently …

`260` appears at no commit, and the ledger's reviewer text does not contain it. Re-measured this round,
in the same call:

```
$ for c in c484648 ce3479c 32e9f48 c2ec32e 0205c8d; do printf "%s: " "$c"; git ls-tree -r --name-only $c .scratch | wc -l; done
c484648: 262
ce3479c: 259
32e9f48: 259
c2ec32e: 265
0205c8d: 265
$ git ls-files .scratch | wc -l          # HEAD's index, before staging this round
265
$ grep -n "23 tracked" .scratch/v28/briefs/slice-6c-fix-1.md
20:  `.scratch/**/*.mjs`**, and the reviewer's seed at `.scratch/v4/zz-probe.mjs` returned **exit=0** while `git grep`
```

The reviewer's own measurement on record is **23 tracked `.mjs`**, never a total: **260 sits at no commit
in the range** (262 at `c484648`, 259 at `ce3479c`/`32e9f48`, 265 at `c2ec32e`/`0205c8d`/HEAD). So the
paragraph now:
keeps the 23 (on record and reproducible), **deletes the total**, and points the reader at the guard
header's SCOPE — which is the one place that carries the number dated, with the command that
re-measures it (`git ls-files .scratch | wc -l`, measured at `c484648`, and a note that it grows with
every committed report). It also states, in the paragraph itself, that the deleted figure reproduced at
no commit and had no reviewer measurement behind it — so the deletion is visible to a reader who only
ever sees this file. Same shape as the G2 correction block the brief names as the model.

The same edit carries the count update the acceptance asks for (`9 checks, not 6` → `12 checks after
fix round 2, not 6`), because it is the same sentence.

## N1 — a quotation nobody said

`docs/agents/code-structure.md:100-101` said **"Two review lanes named the risk in the same words: *a
missed metacharacter in one copy silently over-matches the pin it builds*"**. Only `ocr` used those
words, and not quite: the on-record version is `.scratch/v28/briefs/slice-6c.md:12-13` —

> `ocr` called the copies *"implementations that drift independently — a missed metacharacter in one
> silently over-matches the pin"*, and the reviewer flagged the same duplication as a drift risk.

The law doc's version was a paraphrase inside quotation marks, adding "copy" and "it builds". Fixed to
the record: `ocr` verbatim, the second lane described as flagging **the same duplication**, no second
quotation invented.

**The same false attribution was in the guard's own header**, inherited from `ce3479c` (verified:
`git show c484648:scripts/guards/regexp-escape-guard.mjs` carries it), where it read *"Two independent
review lanes called that a drift risk: 'a missed metacharacter in one silently over-matches the
pin'"* — `ocr`'s exact sentence, attributed to both lanes. Since the docs section names that header as
**the authoritative statement** of the guard's scope, leaving it would have made the corrected docs
contradict the instrument they point at, and N2's ruling in this same round shows an inherited clause of
this class is not excused by being inherited. It is fixed identically and disclosed in "Where I did not
do the literal thing".

## N2 + O6 — the instrument's own success line

The success line said *"every other caller imports it"*, which the guard never measures, and it split a
parenthesis across two printed lines. Now, raw:

```
$ node scripts/guards/regexp-escape-guard.mjs ; echo exit=$?
Regexp-escape guard — one escape implementation
===========================================================
  found: src/lib/escapeForRegExp.mjs:37
  ok — one implementation, at src/lib/escapeForRegExp.mjs:37
  ok — that is the whole of what this instrument establishes: one occurrence, in the sanctioned file.
  ok — scope: the tree minus build output and the harness dirs named in SCOPE; `.scratch` is skipped whole and uncounted.

PASS — the escape has exactly one home.
exit=0
```

Each line is readable alone: line one states the invariant the code actually tests
(`hits.length === 1 && hits[0].startsWith(SANCTIONED)`), line two is the scope clause the fix was told
to keep, and neither line contains an unbalanced parenthesis. The callers *are* real — the reviewer
measured five — but the guard does not count them, so the guard no longer says it did.

## N3 / O1 / O3 — the git step: premise split out, wrapped, and unable to kill the run

The inherited shape was one case whose pass condition was
`tracked.endsWith('.scratch/zz-probe.mjs') && exit === 0 && unnamed` (`git show c2ec32e:…check.mjs`),
with two bare `execSync` calls sitting inside the script's outer `try`, which has a `finally` and **no
`catch`**. Measured consequences, both confirmed from the record and by construction:

1. **The git step is not the mechanism.** `walk()` is a `readdirSync` recursion gated by
   `SKIP_DIRS.has(entry.name)`; it never consults git, so an *untracked* `.scratch` seed is equally
   uncounted (the reviewer measured exactly that). Gating the guard's verdict on tracked-ness makes the
   case red — with the message "the guard is not doing its job" — for a reason that has nothing to do
   with the guard.
2. **A git failure took the run down.** No `catch`: a missing git or a `dubious ownership` refusal
   propagated, and cases 5–9 plus the summary never ran, so an environment hiccup was indistinguishable
   from a broken guard.

Now there are two named things: **case 4 is the PREMISE** ("the `.scratch` seed is genuinely TRACKED",
exact-equality on `git ls-files` stdout, wrapped in `try`/`catch` so failure is a named red check) and
**case 5 is the MECHANISM** (exit 0 + seed unnamed, asserting only what the guard establishes). Proven by
mutation of the check's own git step, in a single call with the file restored and hash-verified:

```
$ node /tmp/fix2-mutate.mjs premise-broken
applied premise-broken to scripts/guards/regexp-escape-guard.check.mjs

$ node scripts/guards/regexp-escape-guard.check.mjs ; echo exit=$?
  ✓ clean tree passes and names the one implementation
  ✓ a sixth copy in e2e/ is CAUGHT and named
  ✓ a sixth copy in scripts/ is CAUGHT (the guard scripts are covered too)
  ✗ PREMISE: the .scratch seed is TRACKED — the state the header’s uncounted-hole sentence describes (not a verdict about the guard) — git step failed: Command failed: git init -q && git add -f .scratch/zz-probe.mjs.does-not-exist — case 5 still runs either way, because the guard never consults git
  ✓ a .scratch copy is UNCOUNTED — the skip is by directory name, as SCOPE states
  ✓ a generated .vitest cache file holding the literal does NOT fail the lane
  ✓ a NESTED .vitest (src/deep/.vitest/) is skipped too — the skip matches a directory NAME at ANY depth
  ✓ a copy in a DECLARATION file (.d.mts) is CAUGHT — .mts is in the extension list
  ✓ a copy in a DECLARATION file (.d.cts) is CAUGHT — .cts is in the extension list, not stated-but-unpinned
  ✓ a ZERO count FAILS — an instrument that matched nothing is not a pass
  ✓ one copy in the WRONG file FAILS — the count is not the whole rule
  ✓ restored sandbox passes again

regexp-escape-guard check: 1 check(s) failed — the guard is not doing its job.
exit=1

$ node scripts/guards/regexp-escape-guard.mjs | tail -5 ; echo exit=$?
PASS — the escape has exactly one home.
exit=0

restored: guard f0fc47a07c932e9331dc90dacde0e81e8ac617374d8e34c3a255f488bce08ba -> f0fc47a07c932e9331dc90dacde0e81e8ac617374d8e34c3a255f488bce08ba ; check 6a5aa3d321d2f1479aae833dde818ff6e160fc8ed0ed5ddd9df0a2b992728aeb -> 6a5aa3d321d2f1479aae833dde818ff6e160fc8ed0ed5ddd9df0a2b992728aeb
```

That is the whole of requirement 2 and 3 of the ruling in one run: a git failure is **a named failing
check** (case 4, ✗, with the premise's name in the message), **cases 5–12 still run**, and the summary
still prints (`1 check(s) failed`, exit 1) instead of a stack trace.

### The dying builder's sentence, audited

Its words were *"The premise check passed on its own error message — a check that cannot fail."* The
defect it had caught is real and reproducible: the error text an `execSync` throws **ends with the path
argument**, so an `endsWith('.scratch/zz-probe.mjs')` assertion fed the error message passes for the
wrong reason:

```
$ node -e 'console.log("Command failed: git ls-files .scratch/zz-probe.mjs".endsWith(".scratch/zz-probe.mjs"))'; echo "node exit=$?"
true
node exit=0
```

The on-disk version it left has **no** such shape: the catch assigns `premise.tracked = false` and the
error text goes only into the human-readable detail; the assertion is `listed === '.scratch/zz-probe.mjs'`
— **exact equality on the success path's stdout**, and the mutation above shows the check goes red when
the premise is not established. A check that cannot fail is not pinning anything; this one can, and does.

## O2 / O4 — the two new probes, and the proof they are load-bearing

Two cases were added (nested skip, `.d.cts`), the old case 4's two halves were split into a premise case
and a mechanism case, and the `.d.mts` case was re-proven (9 checks → 12). Each was run against a
deliberately broken implementation in
the same call, then the file was restored and hash-verified. The mutation scripts are in this round's
session (`/tmp/fix2-mutate.mjs`, `/tmp/fix2-proofs.sh`); the mutations themselves are in the tails below.

### O2 — nested skip vs a root-anchored skip

Mutation: `walk()` stops matching a directory NAME at any depth and skips only at depth 0
(`if (!(depth === 0 && SKIP_DIRS.has(entry.name)))`). Result:

```
$ node /tmp/fix2-mutate.mjs root-anchored
applied root-anchored to scripts/guards/regexp-escape-guard.mjs

$ node scripts/guards/regexp-escape-guard.check.mjs ; echo exit=$?
  ✓ clean tree passes and names the one implementation
  ✓ a sixth copy in e2e/ is CAUGHT and named
  ✓ a sixth copy in scripts/ is CAUGHT (the guard scripts are covered too)
  ✓ PREMISE: the .scratch seed is TRACKED — the state the header’s uncounted-hole sentence describes (not a verdict about the guard)
  ✓ a .scratch copy is UNCOUNTED — the skip is by directory name, as SCOPE states
  ✓ a generated .vitest cache file holding the literal does NOT fail the lane
  ✗ a NESTED .vitest (src/deep/.vitest/) is skipped too — the skip matches a directory NAME at ANY depth — exit 1, seed named in output: true
  ✓ a copy in a DECLARATION file (.d.mts) is CAUGHT — .mts is in the extension list
  ✓ a copy in a DECLARATION file (.d.cts) is CAUGHT — .cts is in the extension list, not stated-but-unpinned
  ✓ a ZERO count FAILS — an instrument that matched nothing is not a pass
  ✓ one copy in the WRONG file FAILS — the count is not the whole rule
  ✓ restored sandbox passes again

regexp-escape-guard check: 1 check(s) failed — the guard is not doing its job.
exit=1

restored: guard f0fc47a07c932e9331dc90dacde0e81e8ac617374d8e34c3a255f488bce08ba -> f0fc47a07c932e9331dc90dacde0e81e8ac617374d8e34c3a255f488bce08ba ; check 6a5aa3d321d2f1479aae833dde818ff6e160fc8ed0ed5ddd9df0a2b992728aeb -> 6a5aa3d321d2f1479aae833dde818ff6e160fc8ed0ed5ddd9df0a2b992728aeb
```

**Exactly one check fails, and it is the nested one** — the root-level `.vitest` and `.scratch` cases
stay green, which is precisely `ocr`'s point: an implementation that anchors the skip to the root keeps
cases 5 and 6 green while the header sentence goes false. Case 7 is a regression test, not decoration.

### O4 — `.d.cts` vs a `SCAN_EXT` without `cts`

Mutation: `SCAN_EXT = /\.(ts|mts|tsx|js|jsx|mjs|cjs)$/` — `.mts` kept, `cts` dropped, so only the new
case can notice:

```
$ node /tmp/fix2-mutate.mjs no-cts
applied no-cts to scripts/guards/regexp-escape-guard.mjs

$ node scripts/guards/regexp-escape-guard.check.mjs ; echo exit=$?
  ✓ clean tree passes and names the one implementation
  ✓ a sixth copy in e2e/ is CAUGHT and named
  ✓ a sixth copy in scripts/ is CAUGHT (the guard scripts are covered too)
  ✓ PREMISE: the .scratch seed is TRACKED — the state the header’s uncounted-hole sentence describes (not a verdict about the guard)
  ✓ a .scratch copy is UNCOUNTED — the skip is by directory name, as SCOPE states
  ✓ a generated .vitest cache file holding the literal does NOT fail the lane
  ✓ a NESTED .vitest (src/deep/.vitest/) is skipped too — the skip matches a directory NAME at ANY depth
  ✓ a copy in a DECLARATION file (.d.mts) is CAUGHT — .mts is in the extension list
  ✗ a copy in a DECLARATION file (.d.cts) is CAUGHT — .cts is in the extension list, not stated-but-unpinned — exit 0, seed named in output: false
  ✓ a ZERO count FAILS — an instrument that matched nothing is not a pass
  ✓ one copy in the WRONG file FAILS — the count is not the whole rule
  ✓ restored sandbox passes again

regexp-escape-guard check: 1 check(s) failed — the guard is not doing its job.
exit=1

restored: guard f0fc47a07c932e9331dc90dacde0e81e8ac617374d8e34c3a255f488bce08ba -> f0fc47a07c932e9331dc90dacde0e81e8ac617374d8e34c3a255f488bce08ba ; check 6a5aa3d321d2f1479aae833dde818ff6e160fc8ed0ed5ddd9df0a2b992728aeb -> 6a5aa3d321d2f1479aae833dde818ff6e160fc8ed0ed5ddd9df0a2b992728aeb
```

The seed is a silent pass (`exit 0`, not named) under the broken list and a caught copy (`exit 1`,
named) under the real one — the header's closing claim about `.cts` is now pinned, not seeded.

### The `.d.mts` case re-proven (the header claims all three)

The header now claims that each of the three — "any depth", `.d.mts`, `.d.cts` — has a case that fails
against an implementation that drops it. Fix round 1 proved `.d.mts`; re-proven here against
`SCAN_EXT = /\.(ts|cts|tsx|js|jsx|mjs|cjs)$/` (`.cts` kept, `mts` dropped):

```
$ node /tmp/fix2-mutate.mjs no-mts
applied no-mts to scripts/guards/regexp-escape-guard.mjs

$ node scripts/guards/regexp-escape-guard.check.mjs ; echo exit=$?
  ✓ clean tree passes and names the one implementation
  ✓ a sixth copy in e2e/ is CAUGHT and named
  ✓ a sixth copy in scripts/ is CAUGHT (the guard scripts are covered too)
  ✓ PREMISE: the .scratch seed is TRACKED — the state the header’s uncounted-hole sentence describes (not a verdict about the guard)
  ✓ a .scratch copy is UNCOUNTED — the skip is by directory name, as SCOPE states
  ✓ a generated .vitest cache file holding the literal does NOT fail the lane
  ✓ a NESTED .vitest (src/deep/.vitest/) is skipped too — the skip matches a directory NAME at ANY depth
  ✗ a copy in a DECLARATION file (.d.mts) is CAUGHT — .mts is in the extension list — exit 0, seed named in output: false
  ✓ a copy in a DECLARATION file (.d.cts) is CAUGHT — .cts is in the extension list, not stated-but-unpinned
  ✓ a ZERO count FAILS — an instrument that matched nothing is not a pass
  ✓ one copy in the WRONG file FAILS — the count is not the whole rule
  ✓ restored sandbox passes again

regexp-escape-guard check: 1 check(s) failed — the guard is not doing its job.
exit=1

restored: guard f0fc47a07c932e9331dc90dacde0e81e8ac617374d8e34c3a255f488bce08ba -> f0fc47a07c932e9331dc90dacde0e81e8ac617374d8e34c3a255f488bce08ba ; check 6a5aa3d321d2f1479aae833dde818ff6e160fc8ed0ed5ddd9df0a2b992728aeb -> 6a5aa3d321d2f1479aae833dde818ff6e160fc8ed0ed5ddd9df0a2b992728aeb
```

## O5 — the seed scaffold

The per-case seed writes became one helper call — **six** of them at `c2ec32e` (`ocr` called the blocks
"five"; the count in the file is six), **two** today plus the import both times. Raw:

```
$ grep -n "writeFileSync" scripts/guards/regexp-escape-guard.check.mjs
50:import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
100:  writeFileSync(full, seedBody(seedName))
147:  writeFileSync(scratchSeed, seedBody('escapeScratch'))
$ grep -c "writeFileSync" scripts/guards/regexp-escape-guard.check.mjs
3
$ git show c2ec32e:scripts/guards/regexp-escape-guard.check.mjs | grep -n "writeFileSync"
34:import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
93:  writeFileSync(e2eSeed, seedBody('escapeE2e'))
104:  writeFileSync(scriptSeed, seedBody('escapeScript'))
120:  writeFileSync(scratchSeed, seedBody('escapeScratch'))
135:  writeFileSync(cacheSeed, seedBody('escapeCache'))
147:  writeFileSync(declSeed, seedBody('escapeDeclared'))
168:  writeFileSync(loneSeed, seedBody('escapeOnly'))
```

The three lines are the import, the helper's single seed write (`:100` inside `seedCase(...)` —
`mkdirSync(path.dirname(full), { recursive: true })` → write → `run()` → `check()` → `rmSync(full)`), and
the premise seed's own write (`:147`), which keeps its explicit `rmSync` after case 5 because it must
outlive its own check. No case can now forget its cleanup, and every case creates its own parent
directory — the property case 6 used to borrow from `src/lib` already existing. `extra` is the hook for
case 11's "no PASS line at all" assertion, the one thing the helper cannot know.

## N4 — the +181/−19 that nobody can reproduce

`slice-6c-fix-1.md:14` claimed the previous builder's four files were "+181/−19". Measured this round:

```
$ git diff --numstat c484648 c2ec32e -- scripts/guards/regexp-escape-guard.check.mjs scripts/guards/regexp-escape-guard.mjs docs/agents/code-structure.md .scratch/v28/reports/slice-6c.md
60	2	.scratch/v28/reports/slice-6c.md
38	0	docs/agents/code-structure.md
58	6	scripts/guards/regexp-escape-guard.check.mjs
35	11	scripts/guards/regexp-escape-guard.mjs
$ git diff --shortstat c484648 c2ec32e -- <the four files>
 4 files changed, 191 insertions(+), 19 deletions(-)

$ grep -n "181" HANDOVER.md
42:| **6c fix 1** | ⚠️ **WORK ON DISK, UNCOMMITTED, BUILDER DIED** — 4 files modified (`regexp-escape-guard{,.check}.mjs`, `docs/agents/code-structure.md`, `.scratch/v28/reports/slice-6c.md`), +181/−19. …
```

The report now states the committed **+191/−19**, names `HANDOVER.md:42` as where `+181/−19` came from,
and says plainly that the pre-round working-tree state was never committed, so 181 is unreproducible by
construction. Labelled, not deleted — the history is intact.

The `c2ec32e` **commit message** carries the same `+181/-19`. A commit message cannot be corrected
without rewriting a commit that is already in the round's history, and this round does not rewrite
history; the correction lives in the report that commit names, and this paragraph says so.

**Case numbers moved, and the fix-1 report says so now.** What that report calls "case 4/5/6"
(`.scratch`, `.vitest`, `.d.mts`) are cases 5/6/8 at HEAD, because this round split the git premise out
as its own case 4 and added the nested and `.d.cts` cases. A three-line labelled pointer was added at
the head of that report — the labels themselves are kept as that round wrote them.

## The check count moved: 9 → 12, and every place that states it

The script counts at run time (`ran`) and prints `${ran}`; the header comment no longer types a total and
says why ("a hand-typed total here went stale in fix round 1"). The places that stated a count, and what
each says now:

| Place | Was | Now |
|---|---|---|
| `regexp-escape-guard.check.mjs` printed summary | hand-typed `all 9 checks passed` | counted at run time: `all ${ran} checks passed` → **12** |
| guard header, "Behavior is proven by …" | listed the old cases, no count | lists the cases including the nested and both declaration spellings, and states it prints its own count rather than quoting one |
| `.scratch/v28/reports/slice-6c.md` correction block | "pins both directions in three new cases — **9 checks, not 6**" | "pins both directions — **12 checks after fix round 2, not 6**" |
| `.scratch/v28/reports/slice-6c.md` fix-round-1 table (G1 row) | "which now runs 9 cases" | "which then ran 9 cases and runs **12** after fix round 2 (`slice-6c-fix-2.md`)" |
| `.scratch/v28/reports/slice-6c.md` §4 tail (`all 6 checks passed`) | labelled `ce3479c` tail, kept | unchanged — it is that commit's recorded output, and the sentence beside it says so |

`regexp-escape-guard.check.mjs`'s rationale comment still quotes `"all 9 checks passed"` once, in
quotation marks, as the historical hand-typed line that went stale — that is the fact the comment exists
to record, not a current count.

## The gate — run in this round, raw tails

All four commands were run in this session, against the on-disk state this commit contains. The
`npm run verify` log is **623 lines**; the tails are pasted, not summarised.

### 1. `npm run verify` → **exit 0** — baseline unmoved

```
$ npm run verify > /tmp/f2-verify.log 2>&1; echo VERIFY EXIT=$?
VERIFY EXIT=0
$ wc -l /tmp/f2-verify.log
623 /tmp/f2-verify.log
```

The test counts, read out of that log (vitest prints its own banner):

```

 RUN  v5.0.0 /home/jmeisburg/orca/workspaces/playdate-app/onboarding

 Test Files  70 passed (70)
      Tests  2030 passed (2030)
   Start at  05:00:29
   Duration  11.94s (transform 47%, tests 42%, import 11%, worker 1%)
```

Lint: this oxlint prints **no summary line when its output is not a TTY**, so the counts are read out of
the finding lines in the same log rather than from a banner:

```
$ grep -c ": warning " /tmp/f2-verify.log
81
$ grep -c ": error " /tmp/f2-verify.log
0
```

**70 files / 2030 tests / 81 warnings / 0 errors / GUARDS PASS — exactly the brief's baseline. Nothing
was adjusted to make that true.** The build ran inside `verify` (`tsc -b && vite build`, built in 246ms +
15ms) and `verify` exited 0, so every stage — build, tests, lint, a11y, steering-lint, guards — passed.
The guards-lane tail inside that same run:

```
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

===========================================================
GUARDS: PASS — all deterministic rules hold.
```

The `55 non-exempt module(s) have a sibling .test.ts` line is unchanged (the new `src/lib/*.mjs` module is
still outside `lib-sibling-guard.sh`'s `*.ts` glob — the accepted blind spot from fix round 1, not a pass
for the new module).

### 2. `node scripts/guards/regexp-escape-guard.mjs` → **exit 0, one hit**

```
$ node scripts/guards/regexp-escape-guard.mjs > /tmp/f2-guard.log 2>&1; echo "guard exit=$?"
guard exit=0
$ cat /tmp/f2-guard.log
Regexp-escape guard — one escape implementation
===========================================================
  found: src/lib/escapeForRegExp.mjs:37
  ok — one implementation, at src/lib/escapeForRegExp.mjs:37
  ok — that is the whole of what this instrument establishes: one occurrence, in the sanctioned file.
  ok — scope: the tree minus build output and the harness dirs named in SCOPE; `.scratch` is skipped whole and uncounted.

PASS — the escape has exactly one home.
```

### 3. `node scripts/guards/regexp-escape-guard.check.mjs` → **exit 0, all 12 checks**

```
$ node scripts/guards/regexp-escape-guard.check.mjs > /tmp/f2-check.log 2>&1; echo "check exit=$?"
check exit=0
$ tail -3 /tmp/f2-check.log

regexp-escape-guard check: all 12 checks passed.
```

The twelve `✓` lines are pasted in full in the guards tail above. `12` is counted at run time (`ran`),
not typed.

### 4. `bash scripts/guards/run-all.sh` → **exit 0**

```
$ bash scripts/guards/run-all.sh > /tmp/f2-runall.log 2>&1; echo "runall exit=$?"
runall exit=0
$ wc -l /tmp/f2-runall.log
439 /tmp/f2-runall.log
$ tail -6 /tmp/f2-runall.log
  ✓ restored sandbox passes again

regexp-escape-guard check: all 12 checks passed.

===========================================================
GUARDS: PASS — all deterministic rules hold.
```

The log grew from fix round 1's **reported** 436 lines to **439** — three lines, which is the count of
added `✓` lines (premise, nested, `.d.cts`) and nothing else; the check printed 9 cases then and 12 now,
and the prose edits changed no output line count. That is what a fix that adds cases and rewrites
sentences should look like.

---

## Where I did not do the literal thing

Two, both deliberate and both named rather than buried:

1. **The guard header's lane attribution (N1's twin).** The finding names
   `docs/agents/code-structure.md:100-101`, and the same false attribution was in
   `regexp-escape-guard.mjs`'s WHY-EXISTS paragraph, inherited from `ce3479c`. Because the docs section
   names that header as the authoritative statement of the guard's scope, correcting only the docs would
   have made the two disagree, so both were corrected the same way. It is a prose-only change,
   it moves no behaviour, and the check's counts are unaffected (guard exit 0, 12/12 — tails above and
   below).
2. **N4's fix touched one more thing than the figure.** While editing
   `slice-6c-fix-1.md:14`, this round's case renumbering made that report's "case 4/5/6" labels point at
   different checks. A short labelled pointer was added; the labels are kept as written. Nothing
   else in that report was rewritten.

Everything else is literally what the finding asked for.

## Residual risks

- **The two mutation harnesses are session-local** (`/tmp/fix2-mutate.mjs`, `/tmp/fix2-proofs.sh`). The
  proofs are pasted above with before/after hashes, but the harness itself is not committed, so
  re-running them means rewriting the two mutations (each is a one-line `SWAP`, quoted in the tails).
  Committing a mutation harness would be a new artifact in the guards lane; I did not add one without
  being asked. *(If the reviewer wants it, the cheap form is a `--mutation <name>` flag on the check
  itself, which I judged out of scope for a fix round.)*
- **`ocr`'s O1/O3 shape was implemented as ruled, not as `ocr` offered it.** `ocr` offered "wrap the git
  setup and feed the outcome to `check(...)`, **or** drop the git step entirely"; the orchestrator ruled
  out the second, and named the first as the shape. That is what is on disk.
- **The `.scratch` tracked count still has a half-life.** The header carries a dated figure (`262` at
  `c484648`) plus the command to re-measure it. This commit adds six new `.scratch` files (three briefs,
  three reports), so re-measuring at HEAD returns a larger number — by design, and now stated in the
  header rather than implied.
- **`strata-max` was not started** (deliberately stopped for this round; its absence is not a finding).
  The local model was not used by this builder.
- **Pre-existing, left alone:** `slice-6c.md:282` says "the drift the two review lanes named" and then
  quotes `ocr`. It does not attribute `ocr`'s words to both lanes (the sentence distinguishes them), so
  it is not the N1 defect; it is noted here rather than reworded.
