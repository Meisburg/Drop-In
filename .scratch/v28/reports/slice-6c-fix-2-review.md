# Reviewer — V28 r2 slice 6c, FIX ROUND 2 (base `0205c8d` → slice commit `04921d8` = HEAD)

**Verdict: NEEDS_CHANGES** — one blocking finding (a *new* false sentence introduced by this diff,
decisively measured), plus one same-class stale label and five low items. **All eleven findings of the
round are genuinely addressed and none is rejected as the builder claims; all seven probes pass, and the
two new probes are load-bearing — I reproduced all three mutations myself.** The blocking finding is a
one-line truthfulness fix in a header comment; it exists because the round introduced, while fixing B1's
class, a fresh instance of the same class.

I did not modify the repository: every mutation was applied to copies under `/tmp`, and the working tree
is unchanged (`git status --short` → only the two untracked orchestrator briefs). Hashes of the repo's
two guard files after my run: `34fa7aa50bc16a28d013c26d273ae13222c5528df09650594f9c791c220fd7bb`
(`regexp-escape-guard.mjs`) and `6a5aa3d321d2f1479aae833dde818ff6e160fc8ed0ed5ddd9df0a2b992728aeb`
(`regexp-escape-guard.check.mjs`) — the committed values.

---

## What I ran (and what I deliberately did not)

| # | command | result |
|---|---|---|
| 1 | `git diff 0205c8d..HEAD` (all 11 files) | read, judged |
| 2 | `for c in c484648 4c2d2ab c336d07 ce3479c 32e9f48 c2ec32e 0205c8d HEAD; do git ls-tree -r --name-only $c .scratch \| wc -l; done` | 262, 262, 262, 259, 259, 265, 265, **271** |
| 3 | `git ls-files .scratch \| wc -l` (index/HEAD) | **271** |
| 4 | `PATH=/tmp/nogit:$PATH node scripts/guards/regexp-escape-guard.check.mjs` (git shim exits 127) | **probe 3A**: premise ✗, cases 5–12 still ran, summary printed, **exit 1**, no stack trace |
| 5 | `PATH=/tmp/badadd:$PATH …` (real `git init`, `git add` → exit 128) | **probe 3B**: same shape, premise ✗ named, exit 1, no stack trace |
| 6 | `PATH=/tmp/badls:$PATH …` (real init/add, `git ls-files` → 128) | **probe 3C**: same shape, exit 1, no stack trace |
| 7 | copied `src/ e2e/ scripts/` → `/tmp/probe6c2`, mutated the **copy's** guard, ran the **copy's** check (3 mutations × 1) | **probe 4**: each mutation flips exactly one case (below) |
| 8 | `bash scripts/guards/run-all.sh` | exit 0, **439 lines**, `GUARDS: PASS` |
| 9 | `node scripts/guards/regexp-escape-guard.mjs` | exit 0, one hit, 8 output lines, every line paren-balanced |
| 10 | `node scripts/guards/regexp-escape-guard.check.mjs` | exit 0, **12** `✓`/`✗` lines printed, `all 12 checks passed` |
| 11 | `grep`/`sha256sum` over `/tmp/f2-verify.log`, `/tmp/fix2-bak-*` (builder's still-on-disk evidence) | the verify claim and the mutation-backup hashes are checkable; see non-blocking 5 |
| — | `npm run verify` | **not run** (verifier lane owns the gate). I verified the builder's artifact of it instead: `/tmp/f2-verify.log` exists, `wc -l` → 623, `Test Files 70 passed (70)`, `Tests 2030 passed (2030)`, `grep -c ': warning '` → 81, `grep -c ': error '` → 0, last line `GUARDS: PASS — all deterministic rules hold.` |

---

## Blocking findings

### 1. `ladder:` `scripts/guards/regexp-escape-guard.mjs:83-84` — a false history claim, added by this diff

> `* wrong file. It prints its own case count rather than quoting one here, because`
> `* a typed count in this header went stale once already. run-all.sh runs it in`

**This header never contained a typed count.** Reproduction:

```
$ git log --all -p -- scripts/guards/regexp-escape-guard.mjs | grep -nE "^\+.*(checks? passed|[0-9]+ checks|case count)"
92:+ * wrong file. It prints its own case count rather than quoting one here, because

$ for c in ce3479c c2ec32e 0205c8d HEAD; do git show $c:scripts/guards/regexp-escape-guard.mjs | grep -cE "checks passed|all [0-9]+ check"; done
0 0 0 0
```

The only line in that file's entire history that mentions a typed count is the sentence making the
claim. The old header enumerated the check's cases with **no number** ("seeded sixth copy in `e2e/` AND
in `scripts/`, a deleted implementation, a lone copy in the wrong file" — `git show 0205c8d:…`), and
under the other possible referent ("this header" = the *check's* header, which the sentence's subject
"it" describes) it is false too: the check's typed total lived in the **summary print line**, not its
header comment — which is exactly what the check's own docstring says one file over.

**Why this is blocking rather than a nit:** this batch rules that a sentence stating something other
than the mechanism is a claim a future reader acts on; the orchestrator ruled all five N-findings of
this very round in for that reason; and `docs/agents/code-structure.md:123` names *this header* as
the authoritative statement of what the guard covers. Worse, the round's own sibling sentence
(`regexp-escape-guard.check.mjs:43-46`) states the supportable version of the same fact —
measured: `git diff c484648 c2ec32e -- scripts/guards/regexp-escape-guard.check.mjs | grep -E "^[-+].*checks passed"`
→ `-…all 6 checks passed.` / `+…all 9 checks passed.`, i.e. the hand-typed total *was* hand-edited in
fix round 1 — so the two copies of one claim now disagree, which is the drift-between-copies failure
this slice exists to prevent.

`ladder:` because the class (a stated count that does not match its instrument) is the class B1 came
from, and B1 was itself a ladder finding in round 1's review
(`.scratch/v28/reports/slice-6c-fix-1-review.md:14`). Per the ladder rule the *class* belongs one rung
down — a rule/guard that no instrument header may assert a history it cannot point at — not in a third
full round. The sentence itself is a one-line truthfulness edit.

---

## Non-blocking findings

### 2. `ladder:` `265 at HEAD` in `.scratch/v28/reports/slice-6c.md:274` (and `.scratch/v28/reports/slice-6c-fix-2.md:30,71`)

> `… 262 at` / `` `c484648`, 259 at `ce3479c`/`32e9f48`, 265 at HEAD — with no such reviewer measurement on record ``

Measured at the commit that carries the sentence:

```
$ git ls-files .scratch | wc -l                    # HEAD index/tree
271
$ git ls-tree -r --name-only HEAD .scratch | wc -l
271
```

265 is real at `c2ec32e`/`0205c8d` (the fix-2 report names both), so the **value** is on record and is
not the B1 defect; the **label** is: a bare `HEAD` inside the commit that moves HEAD. Same class,
third instance → `ladder:`. The pointer the ruling ordered is honest: the header
(`regexp-escape-guard.mjs:45-48`) carries `262`, dated `c484648`, with the re-measuring command, and
that figure **reproduced for me** (262 at `c484648`, 23 `.mjs`, all `.scratch/v4/`).

Adjacent, same line-pair: `slice-6c.md:271-272` says the header has "the command that re-measures it
(`regexp-escape-guard.mjs`)" — the parenthetical names the *file* where the command is, not the command
(`git ls-files .scratch | wc -l`). Reads as if the file were the command. Low; the fix-2 report states
the command correctly.

### 3. `ladder:` `scripts/guards/regexp-escape-guard.check.mjs:43-45` — the sibling sentence is ambiguous and quotes the *corrected* value

> `* A hand-typed total here went stale in fix round 1 ("all 9 checks passed" out of a script that had grown)`

At fix round 1's commit the printed total was **correct**: `git show c2ec32e:…check.mjs` has 9 `check(`
sites and prints `all 9 checks passed`; the committed verifier tail shows nine `✓`
(`.scratch/v28/reports/slice-6c-fix-1-verify.md:183`). The hand edit in that round's diff was
`all 6 checks passed` → `all 9 checks passed` (reproduction in finding 1). The event the parenthetical
describes — a typed total out of a script that had grown — is the **round-2 dispatch** state (12 cases
against the committed `all 9`), one round later than claimed, and the quoted string is the value that
was right, not the stale one. Substance (the mechanism was hand-maintained and this round counted it at
run time) survives; `ladder:` because it is the same class as finding 1 and needs no separate round.

### 4. The docstring map is 11 cases; the script is 12 — and case 4's comment counts to 12

`regexp-escape-guard.check.mjs:9-39` numbers cases 1–11; `:46` states "The numbered list above is the
map; the printed line is the fact"; but `check.mjs:211-214` (restore) executes a 12th check and `:20-21` refers
to "cases 5-12". Measured: `grep -c "^  [✓✗]"` on the check's own log → **12**, matching `all 12 checks
passed`. Low: the sentence pre-declares that the printed line, not the map, is the fact — but a reader
following "cases 5-12" cannot find case 12 on the map. (The same map-vs-count gap existed at
`ce3479c`: 5 items, 6 checks.)

### 5. The mutation proofs were run against a code-identical but superseded guard; the quoted hashes cannot be checked from the commit

`slice-6c-fix-2.md:174,233,266,299` all quote
`guard f0fc47a07c932e9331dc90dacde0e81e8ac617374d8e34c3a255f488bce08ba -> …` and
`check 6a5aa3d3…`. The **check** hash is byte-exact for HEAD. The **guard** hash is not: HEAD's guard is
`34fa7aa5…`. The builder's mutation-time backups are still on disk, and they resolve it:

```
$ sha256sum /tmp/fix2-bak-*/guard.mjs /tmp/fix2-bak-*/check.mjs | sort -u
f0fc47a0…  /tmp/fix2-bak-root-anchored/guard.mjs   (+ the other three backup dirs)
6a5aa3d3…  /tmp/fix2-bak-root-anchored/check.mjs
$ diff -u /tmp/fix2-bak-root-anchored/guard.mjs scripts/guards/regexp-escape-guard.mjs
  (only the N1 lane-attribution prose edit)
```

So the difference is prose-only and the mutated code was identical — but as committed, the "restored,
hash-verified" claim in the report is not checkable by a reader, who cannot reproduce `f0fc47a0` from
the repo. I reproduced the three load-bearing properties independently against HEAD's guard (probe 4),
so the substance holds; the report should say the proofs predate the header edit.

### 6. Diagnosability of a failed `git add`

`regexp-escape-guard.check.mjs:150` pipes the `init && add` call, and `:154` keeps only
`e.message.split('\n')[0]`, which for `execSync` is `Command failed: <the command>` — the git reason is
dropped. Measured (probe 3B): the ✗ line reads `git step failed: Command failed: git init -q && git
add -f .scratch/zz-probe.mjs` with no mention of *why*; by contrast `:151` omits `stdio:'pipe'`, so in
probe 3C git's `fatal: detected dubious ownership in repository` is printed raw into the check's output.
Premise is still named (the ruling's requirement); the two calls just handle stderr inconsistently.

### 7. The final summary line still frames an environment failure as a broken guard

`regexp-escape-guard.check.mjs:224` (unchanged line, so not scope) prints
`… 1 check(s) failed — the guard is not doing its job.` when the only failure is the wrapped premise.
`ocr`'s finding was that an environment hiccup must be distinguishable from a broken guard; it now is
(the ✗ line names the premise, per the ruling), but the last line a CI reader sees still asserts the
guard is broken.

---

## Probes — measured results

**Probe 1 (B1).** `260` appears in **no** normative sentence of `slice-6c.md` (`grep -n 260` over that
file → empty); the only remaining occurrences are historical quotations in the fix-1/fix-2 reports. The
replacement points at the header's dated figure, and that figure reproduces: **262 at `c484648`**
(headline also 23 `.mjs`, all `.scratch/v4/`). Command as ordered:
`git ls-files .scratch | wc -l` → 262 at `c484648` (via `ls-tree`), 271 at HEAD. The sentence's own
provenance list carries the stale label of finding 2. → **substantively fixed, one label stale.**

**Probe 2 (N1).** Verbatim and correctly attributed in both files. Compared byte-for-byte against the
record at `.scratch/v28/briefs/slice-6c.md:11-13`: the em-dash sentence
`implementations that drift independently — a missed metacharacter in one silently over-matches the pin`
matches exactly, the second lane is described as flagging **the same duplication** (no second quotation
invented), and "Two lanes reached it from opposite directions" is itself on record
(`slice-6c.md:11`, .scratch/v28/briefs/slice-6.md:131). The guard header got the same correction and
**did not acquire a new false attribution** — but it did acquire the new false *history* claim of
blocking finding 1, which is what probe 2's second half was aimed at.

**Probe 3 (premise check).** The inherited shape (`git show c2ec32e:…check.mjs`:
`tracked.endsWith('.scratch/zz-probe.mjs') && exit === 0 && unnamed`, with bare `execSync` inside a
`try` that had only `finally`) is gone. The new assertion is `listed === '.scratch/zz-probe.mjs'`
(`:152`) — exact equality on the success path's stdout, so the error message (which ends with the path
argument) can no longer satisfy it; I confirmed the failure mode is real:
`node -e 'console.log("Command failed: git ls-files .scratch/zz-probe.mjs".endsWith(".scratch/zz-probe.mjs"))'`
→ `true`. Breaking the git step three ways (git absent via PATH shim; real init + failing `add`; real
init/add + failing `ls-files`): in **all three** the premise check went ✗ with the premise named, cases
5–12 and the restore still ran, the summary still printed, exit was **1**, and there was **no stack
trace** (`grep -nE "^\s+at |Error:"` over each log → none). → **claim verified; the escaping-exception
finding is closed.**

**Probe 4 (load-bearing, my own mutations, on a copy at `/tmp/probe6c2`).** Baseline copy: 12/12 green.
Then, one mutation per run, the case that flipped (and only that case):

| mutation (in the copy's guard) | flipped | all others |
|---|---|---|
| root-anchored skip: `if (!(SKIP_DIRS.has(entry.name) && path.resolve(dir) === path.resolve(ROOT))) walk(…)` | `✗ a NESTED .vitest (src/deep/.vitest/) is skipped too — the skip matches a directory NAME at ANY depth` (`exit 1, seed named in output: true`) | green |
| `SCAN_EXT` without `cts` | `✗ a copy in a DECLARATION file (.d.cts) is CAUGHT — .cts is in the extension list, not stated-but-unpinned` (`exit 0, seed named in output: false`) | green |
| `SCAN_EXT` without `mts` | `✗ a copy in a DECLARATION file (.d.mts) is CAUGHT — .mts is in the extension list` (`exit 0, seed named in output: false`) | green |

Each run exited 1 with `1 check(s) failed`; the copy's guard was restored to the HEAD hash
(`34fa7aa5…`) afterwards, and the repo's files were never touched. **The two new probes are regression
tests, not decoration.** I also falsified the adjacent comment
(`check.mjs:113-117`, "Not load-bearing today" about removing the guard copy from the sandbox): with the
`rmSync` deleted, the check's output is byte-identical (12/12) → the comment's claim holds.

**Probe 5 (count).** `ran` is incremented only in `check()` (`:80-82`), and the script has **12**
`check()` invocations — 7 through `seedCase` (cases 2, 3, 6, 7, 8, 9, 11) and 5 direct (cases 1, 4, 5,
10, 12). The run prints **12** `✓` lines and `all 12 checks passed` (`grep -c "^  [✓✗]"` → 12). The
self-reported number equals the assertions executed. The only place that states a count today is the
summary line; every other `9 checks` string left in the tree is a labelled historical quotation
(`slice-6c.md:278,308` label the `all 6 checks passed` tail `ce3479c`; the fix-1 reports and briefs are that round's
record; `docs/` has none).

**Probe 6 (seed symmetry).** `seedCase()` (`check.mjs:97-107`, comment `:91-96`) does `mkdirSync(path.dirname(full), {recursive:
true})` → write → run → check → `rmSync(full)` for every seeded case, so no case can inherit a
directory (`src/deep/.vitest/` is created by the case that needs it — measured: `src/deep` does not exist in
the repo (`ls -d src/deep` → No such file or directory), so `check.mjs:99` is what creates it) and each removes its own seed. The one manual seed (premise, `:145-147`)
creates its own dir and is removed at `:170`, after the mechanism case that depends on it. The
asymmetry `ocr` named is gone: at `c2ec32e`, `declSeed` was written without any `mkdirSync` and relied
on `src/lib` existing (`git diff 0205c8d..HEAD` shows the removed block). Measured: `grep -c
writeFileSync` → **3** at HEAD (import, helper, premise) vs **7** at `c2ec32e`. Leftover empty parent
directories are harmless (a directory holds no literal).

**Probe 7 (sentences vs mechanism).** Beyond findings 1–7, I checked the new claims against the code:
the header's "each of those three has a case that FAILS against an implementation that drops it"
(`:60-64`) → verified by probe 4; "It prints its own case count rather than quoting one here" → the
check does (`:221`), the header quotes none; "a `.scratch` copy is UNCOUNTED" asserts only exit 0 + seed
unnamed (`:165-169`) as the ruling required; the two new success lines (`guard.mjs:157-158`) state only
`hits.length === 1 && hits[0].startsWith(SANCTIONED)` and the scope clause the finding told it to keep,
and every printed line is paren-balanced (measured per line); `docs/agents/code-structure.md:99-103`
now contradicts nothing else in that section. `check.mjs:20-21` "cases 5-12 and the summary" → verified
by probe 3.

---

## Requirements traceability

| Criterion (brief §Acceptance) | Verdict | Evidence |
|---|---|---|
| 1. **B1** — no unreproducible number in `slice-6c.md`, no measurement attributed to a lane not on record | **met, one label stale** | `260` gone; attribution corrected and on record; header figure 262@`c484648` reproduces. `265 at HEAD` (finding 2) measures 271 at HEAD. |
| 2. N1, N2, N3, N4, O1, O2, O3, O4, O5, O6 fixed or stated with a reason | **met** (11/11; none rejected — the builder's claim is true) | N1 verbatim vs `briefs/slice-6c.md:11-13`; N2 printed-line tail; N3/O1/O3 probes 3A–C; N4 `+191/−19` + `HANDOVER.md:42` reproduced; O2/O4 probe 4; O5 3 vs 7 `writeFileSync`; O6 paren balance per line. Caveat: findings 1 and 3 are new/ambiguous sentences in the same class. |
| 3. Both new probes load-bearing, proven against the pre-round implementation | **met** | probe 4 table: exactly one case flips per mutation, case names quoted from my own runs. |
| 4. `npm run verify` exit 0, baseline unmoved; count updated everywhere it is stated | **not run by me (by instruction); builder's evidence verified** | `/tmp/f2-verify.log`: 623 lines, `70 passed (70)`, `2030 passed (2030)`, 81 warnings, 0 errors, `GUARDS: PASS`. Count: 12 everywhere current (probe 5). |
| 5. guard exit 0 · check exit 0 · `run-all.sh` exit 0 | **met** | I ran all three: guard exit 0 (one hit); check exit 0, 12/12; `run-all.sh` exit 0, **439 lines**, `GUARDS: PASS` — matching the report's 439 claim. |
| 6. Report `.scratch/v28/reports/slice-6c-fix-2.md` with per-finding table, raw tails, both proofs | **met** | 533 lines; table (11 rows, all "fixed"); tails for all four gate commands; mutation tails. Defects: the guard hash is of a superseded state (finding 5); "No finding is rejected" — I confirm that is accurate. |
| 7. One commit, everything committed, not pushed | **met** | single commit `04921d8`, 11 files; the two lane reports and this round's brief are tracked; `git status -sb` → `ahead 163`, HEAD on no remote branch. |

## What I could not verify

- `npm run verify` itself (not run, by instruction). The pasted tail is consistent with the on-disk log
  I inspected, but that log lives in `/tmp` and is not committed, so a third party can re-run it, not
  re-read it.
- Whether the mutation harness (`/tmp/fix2-mutate.mjs`) applied exactly the mutations it describes — the
  reported *effects* I reproduced independently (probe 4), and the backups show the mutated code matched
  HEAD's code, so I treat the effect claims as verified and the mechanism description as unverified.
- `fix round 1's 436-line run-all log` (not committed; only the 439 at HEAD is checkable, and it is
  correct).

## Recommended next action

Fix the one blocking sentence — `scripts/guards/regexp-escape-guard.mjs:83-84` must stop asserting a
typed count in a header that never had one (the check's own docstring `:43-46` already carries the
supportable form) — and pin the two `265 at HEAD` occurrences to a commit id while you are in the file.
Everything else in this diff I would sign off on; per the ladder rule the *class* (a stated number or
history that cannot be pointed at) belongs one rung down in `docs/ladder.md` / the repo-wide honesty
guard, not in a third round of slice 6c.
