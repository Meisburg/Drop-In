# Slice 6c fix round 5 — REVIEW of the combined ROUND-5 + BOUNDED-REPAIR delta (V28 r2)

**Reviewer:** independent review lane (review-only; no repo file was modified — all mutation on `/tmp`).
**Delta:** base `824f419` → HEAD; commits `1282871` (round 5) and `37b8dd8` (bounded repair), plus the
lineage commits the repair builds on (`ec47f15` ocr routing, `f25d819`/`001ec5c`/`4c94071` decisions).
**Working dir:** `/home/jmeisburg/orca/workspaces/playdate-app/onboarding` (branch `Meisburg/onboarding`).
**Claim read as CLAIM only:** `.scratch/v28/reports/slice-6c-fix-5.md`. **Verifier report read, not deferred
to:** `.scratch/v28/reports/slice-6c-fix-5-verify.md`.

**DISCLOSURE (D-007/D-015):** the implementer ran on `ollama-cloud/deepseek-v4.1-flash:cloud` and so do I.
I am a **sibling, not an independent model**. Every factual sentence below was re-run against the artifact it
names; where my measurement differs from the claim, the command is printed beside it.

**Verdict: NEEDS_CHANGES** — and per the human's fifth-round rule, the next action is **not** a sixth repair
round. The centrepiece is §7: the invariant, the detection rule, and the exact shapes it missed, so the human
can rule on whether the **specification** is the thing that is wrong.

**Note on rendering.** My report lives outside the guard's scan root (it is written under the session
artifacts dir, not the repo's `.scratch/v28/`), so quoting literal tokens here cannot move the baseline. I
quote probe lines and commands **verbatim** on purpose: those are the evidence. The literal `HEAD`/`@` appears
inside quoted probe text and command lines below.

---

## 0. What I ran (all commands are reproducible; every finding cites one)

| # | purpose | command |
|---|---|---|
| M1 | my own probe of the arms (50 lines, then a clean 60-line probe) | `node scripts/guards/factory-guard.mjs --root /tmp/rev6c5/probe2` |
| M2 | same, arm-3 subcommand set both directions | `node scripts/guards/factory-guard.mjs --root /tmp/rev6c5/probe3` |
| M3 | do those commands actually resolve HEAD? | `git show \| wc -l` → 327; `git reflog \| wc -l` → 281; `git blame package.json \| wc -l` → 55; `git annotate package.json \| wc -l` → 55; `git branch \| wc -l` → 11; `git rev-parse @{2}` → `1282871…` |
| M4 | pre-repair guard vs post-repair guard on one probe | `git show 1282871:…factory-guard.mjs > /tmp/rev6c5/guard-pre.mjs` then run both with `--root /tmp/rev6c5/atrepair` |
| M5 | pre/post on the **live** working tree | `node /tmp/rev6c5/guard-pre.mjs --root $PWD` vs `node scripts/guards/factory-guard.mjs` |
| M6 | my own baseline re-derivation, at the builder's commit and now | `/tmp/rev6c5/baseline-at-commit.mjs` (root = `git archive 37b8dd8 .scratch/v28/{reports,briefs}`) |
| M7 | round-4 baseline = 23/13? | `git show e3f163d:…factory-guard.mjs \| awk '/BARE_HEAD_BASELINE/,/^\]\)/' …` |
| M8 | the live blind spot | root holding only `slice-6b-fix-1.md` → `node scripts/guards/factory-guard.mjs --root /tmp/rev6c5/live-blind` |
| M9 | the repair's own checks can fail | `/tmp/rev6c5/copy` (`cp -a`-style copy, `node_modules` symlinked) + `npx vitest run scripts/factory/scheduler.test.mjs` under three mutations |
| M10 | the new control check is vacuous? | `MOVING_REV`'s `@` lookahead removed entirely → `/tmp/rev6c5/guard-wild.mjs --root /tmp/rev6c5/atcontrol` |
| M11 | B1's pasted grep | `git show 99d044f:scripts/guards/factory-guard.mjs \| grep -c instrument-headers-honest` |
| M12 | scope/structure law | `sed -n '118,130p' docs/agents/code-structure.md`; `sed -n '58,76p' scripts/guards/factory-guard.mjs` |

`git status --porcelain` at the end of my run is unchanged from its start (`M factory/work/v28-r2-6c.json`,
`?? .scratch/v28/reports/slice-6c-fix-5-verify.md`) — the two entries were already there before I touched
anything; I created and modified nothing in the repo.

---

## 1. Does the instrument detect the CLASS, or is it still a set of examples?

**Ruling: still a set of examples — three of the dimensions the class needs are enumerated by hand, and I
found each one's boundary by probing with shapes neither the builder nor the verifier used.**

The report (`.scratch/v28/reports/slice-6c-fix-5.md:31-45`) states the invariant and the three arms. I judge
each arm against the class it claims, not against the seeds it shipped with.

### 1a. Arm 3 (`.scratch/v28/reports/slice-6c-fix-5.md:143-147`, `scripts/guards/factory-guard.mjs:454`) is a hand-typed list of eight subcommand names

The report sells arm 3 as *"a count taken from a command that resolves `HEAD` by saying nothing"*, and
`factory/decisions.md:430` (D-019) marks the class row **"counted command defaulting to HEAD, no revision
named — **yes**"**. The arm's body is:

```js
const BARE_HEAD_COUNT_WC = /\bgit\s+(?:log|rev-list|shortlog|whatchanged|cherry|stash|branch|describe)\b[^|\n]*\|\s*wc\b/g
```

Eight names, not the class. `M2` + `M3`, probes nobody has run before — every line is a *count piped to
`wc`*, and the "resolves HEAD by saying nothing?" column is a measurement, not a guess:

| probe line (root `/tmp/rev6c5/probe3`, `--root` run) | resolves HEAD with no revision? | flagged? |
|---|---|---|
| `git show \| wc -l` | **yes** — `git show` alone = HEAD, measured `327` | **NO** |
| `git show --stat \| wc -l` | **yes** — measured `11` | **NO** |
| `git --no-pager show \| wc -l` | **yes** | **NO** |
| `git reflog \| wc -l` | **yes** — HEAD's reflog, measured `281` | **NO** |
| `git reflog show \| wc -l` | **yes** | **NO** |
| `git blame package.json \| wc -l` | **yes** — `git blame <file>` blames HEAD, measured `55` | **NO** |
| `git annotate package.json \| wc -l` | **yes** — measured `55` | **NO** |
| `git branch \| wc -l` | **NO** — 11 branch names, HEAD only marks the current one | **YES (false positive)** |
| `git stash \| wc -l` | **NO** — the stash ref, not HEAD | **YES (false positive)** |
| `git log \| wc -l`, `git rev-list \| wc -l`, `git shortlog \| wc -l`, `git cherry \| wc -l`, `git describe \| wc -l`, `git log --oneline -1 \| wc -l` | yes | YES (correct) |
| `git diff \| wc -l`, `git ls-files \| wc -l`, `git status --porcelain \| wc -l` | no (index/worktree) | no (correct) |

So arm 3 is wrong in **both** directions at once: it misses four commands that genuinely default to HEAD
(`show`, `reflog`, `blame`, `annotate` — the same shape as the arm's own `git log … | wc -l` example), and it
fires on two (`branch`, `stash`) that do not resolve HEAD at all. A structural arm cannot be wrong in both
directions; a list of names can. This is the same defect shape the round exists to kill, one rung up: the
*claim* about the arm ("defaults to HEAD") is broader than the *mechanism* (eight spellings).

### 1b. Arm 1 (`.scratch/v28/reports/slice-6c-fix-5.md:36`, `scripts/guards/factory-guard.mjs:442-444`) is a set of English phrasings

The report's own table states the match as *"a number, ≤4 lowercase words, `at (the )?` + moving ref"*. That
is a phrase pattern, and I found its edges (`M1`, root `/tmp/rev6c5/probe2`):

| probe line (verbatim) | should fire (count labelled at a moving rev)? | fired? |
|---|---|---|
| ``280 tracked `.scratch` files at HEAD`` | yes | yes |
| `280 tracked .scratch files at HEAD` | yes | **NO** — a word starting with `.` breaks the `[a-z\`]` word class |
| `280 files in src/lib at HEAD` | yes | **NO** — a word containing `/` |
| `280 files (tracked) at HEAD` | yes | **NO** — `(` |
| `280 tracked file(s) at HEAD` | yes | **NO** — `(` in the word |
| `87, taken at HEAD` | yes | **NO** — a comma directly after the number kills `\s+` |
| `the count was 87 as of HEAD` | arguably yes (provenance named) | **NO** — the single literal preposition `at` |
| `the count was 87 measured on HEAD` | arguably yes | **NO** |
| `at HEAD: 87 occurrences` (number **after** the phrase) | yes | **NO** — see the live case below |
| `the total is 265 at HEAD and 87 at HEAD` | yes (2 matches on one line) | yes, 2 findings (F2 works) |
| `1,207 files at HEAD` | yes | yes (matches at `207`) |
| `1.5 at HEAD` | no (ratio/fragment) | no (correct) |

**The number-after-phrase order has a live instance in the corpus, and it was already named as a blind spot
one round ago.** `M8`, a root holding only `slice-6b-fix-1.md`:

```
$ node scripts/guards/factory-guard.mjs --root /tmp/rev6c5/live-blind
  ok — 5 model(s), 8 task kind(s), 0 work item(s); every floor meetable, every artifact present,
       every instrument header stating only what it can point at, no report or brief count resolved
       through bare HEAD beyond the recorded baseline
PASS — the registry can be trusted and no work item claims evidence it does not have.
$ sed -n '292p' /tmp/rev6c5/live-blind/.scratch/v28/reports/slice-6b-fix-1.md
   brief; at HEAD the corpus reports 90 documents / 7 claims / 97 quotations. Nothing regressed —
```

Three counts (`90`, `7`, `97`) whose stated provenance is bare `HEAD`; the instrument returns PASS. And
`.scratch/v28/reports/slice-6c-fix-4.md:81` — a **previous round's committed report** — says of the very
pattern round 5 kept: *"It deliberately does NOT match a number that comes AFTER the phrase (`… at HEAD the
corpus reports 90 documents`)"*. Round 5 widened arm 1's *ref spellings* and left its *word order, word class
and preposition* exactly as they were, and its ceiling list (`.scratch/v28/reports/slice-6c-fix-5.md:47-64`)
does not mention the order shape at all. So a documented, live miss survived the round whose stated purpose
was to cover the class.

### 1c. Arm 2 (`.scratch/v28/reports/slice-6c-fix-5.md:141-142`, `scripts/guards/factory-guard.mjs:450`) cannot see a global option or a quoted revision

The report claims arm 2 matches *"**any** git subcommand whose argument is a moving ref"*; the guard header
(`scripts/guards/factory-guard.mjs:49-50`) claims *"a `git … HEAD` read whatever the subcommand"*; D-019
(`factory/decisions.md:429`) marks that row **yes**. The pattern is `\bgit\s+[a-z][a-z-]*…`, i.e. the
subcommand must be the token **immediately** after `git`. Measured (`M1`, `/tmp/rev6c5/probe2`):

| probe line | should fire? | fired? |
|---|---|---|
| `git -C /tmp/ws show HEAD:scripts/guards/factory-guard.mjs` | yes — same read, another workspace | **NO** |
| `git --no-pager log HEAD \| wc -l` | yes — this is a *count*, and the round's own STEER named "HEAD-dependent output" | **NO** |
| `git -c core.pager=cat show HEAD` | yes | **NO** |
| `git show "HEAD"` / `git rev-parse 'HEAD'` | yes — a quoted spelling of the same rev | **NO** |
| `git show HEAD`, `git ls-tree -r --name-only HEAD`, `git cat-file -p HEAD:factory/config.json`, `git merge-base HEAD main`, `git rev-list --count HEAD`, `git show HEAD~1`, `git show HEAD@{upstream}` | yes | correct |
| `git show HEAD2` | no (not a rev) | no (correct) |
| `git show HEAD.patch` | **no** — that is a filename, not a revision | **YES** (matches the truncated token `git show HEAD`; pre-existing, the same over-match exists under `\b`) |

The subcommand *dimension* of arm 2 is genuinely structural (any subcommand, one scan) — this is real progress
over round 4. What is still enumerated is where the token may appear.

### 1d. What the probes did NOT find: false positives from the widened boundary

My own no-fire controls, all `PASS exit 0` (`M1`, `/tmp/rev6c5/probe2`, and the `M10` variant):
`write to user@example.com about it`, `the @decorator style is used`, `the count is 5 at user@example.com`,
`@media (max-width: 40em) block`, `the @ sign alone in prose`, `refs at @{2} are not HEAD by default`,
`The head of the report is fine`, `https://example.com/HEAD/x has no count`, `grep HEAD file | wc -l`,
`git status --porcelain | wc -l`, `ls .scratch/v28/reports | wc -l`, `git tag | wc -l`,
`git for-each-ref | wc -l`, `git worktree list | wc -l`, `1.5 at HEAD`, `280 at origin/main`,
`280 at ORIG_HEAD`. **No false positive found** for the `@`/`HEAD^`/`HEAD@{}` boundary changes.

**Every-match-per-line (F2) is real:** `the total is 265 at HEAD and 87 at HEAD` produced **two** findings on
one line, and my independent baseline re-derivation (§3) reproduces the per-key *counts*, including the two
doubled lines (`slice-6c-fix-2-review.md::271 at HEAD` = 2, `slice-6c-fix-3-review.md::265 at HEAD` = 2).

---

## 2. The `@` arm — the fix is real, no false positives found, and the report's sentence about it overstates

### 2a. The arm was genuinely dead and is genuinely fixed (reproduced)

`M4`, one probe root (`/tmp/rev6c5/atrepair`), two guards — round-5's committed guard vs the repair:

```
$ node /tmp/rev6c5/guard-pre.mjs  --root /tmp/rev6c5/atrepair     # git show 1282871:…factory-guard.mjs
L1  -> "git show HEAD"       L2 -> "git show HEAD"     L3 -> "git show HEAD"      (HEAD^ / HEAD@{2} truncated)
L5  -> "git show HEAD~1"     L6 -> "280 tracked files at HEAD" …
$ node /tmp/rev6c5/guard-post.mjs --root /tmp/rev6c5/atrepair    # git show 37b8dd8:…factory-guard.mjs
L1  -> "git show HEAD"   L2 -> "git show HEAD^"   L3 -> "git show HEAD@{2}"  L4 -> "git show @"
L5  -> "git show HEAD~1" L6 -> "280 tracked files at HEAD"  L7 -> "…at HEAD^"  L8 -> "…at HEAD@{2}"  L9 -> "…at @"
```

`git show @` and `280 tracked files at @` produced **no finding** before the repair and **do** after it. The
report's mechanism claim (`.scratch/v28/reports/slice-6c-fix-5.md:478-482`) is correct as to the `@` arm.

### 2b. No false positives (my own controls, not the builder's or the verifier's)

`M1`/`M10`: `user@example.com` (both as prose and inside `the count is 5 at user@example.com`), `@decorator`,
`@media`, bare `@` in prose, `@{2}` in prose, `@{upstream}` in prose, `The head of the report is fine`,
`HEAD2`, `https://example.com/HEAD/x` — all `PASS exit 0`. I also ran the maximally over-matching variant
(`MOVING_REV`'s `@` lookahead deleted entirely, `/tmp/rev6c5/guard-wild.mjs`) over my full probe root: the
result is **unchanged** (21 findings before and after), which tells me the `@` boundary is not load-bearing
for the corpus prose — see §6b, where that same fact makes the repair's new *control* check vacuous.

### 2c. RULING on the builder's `\b` sentence: it is an instance of the class, measured

The claim, in the committed report and in the commit subject:

- `.scratch/v28/reports/slice-6c-fix-5.md:482` — *"which also restored `HEAD^` and `HEAD@{2}` (both were
  **silently dropped** by the same `\b`)."*
- commit `37b8dd8` — *"R2 fix dead '@' arm (\b -> (?![\w]), also restores HEAD^ and HEAD@{...})"*.

Measured, `M4` lines L2/L3 and `M5` on the **live** tree: the pre-repair guard **did flag** those lines. It
matched the truncated token and printed `"git show HEAD"` / `"280 tracked files at HEAD"`, i.e. the finding
existed and only the *label* was cut. On the live tree right now:

```
$ node /tmp/rev6c5/guard-pre.mjs --root $PWD | grep -c 'FINDING \[no-bare-head-count\]'
2
  FINDING …: .scratch/v28/reports/slice-6c-fix-5-verify.md:179 … "git ls-tree -r --name-only HEAD"   # line is HEAD^
  FINDING …: .scratch/v28/reports/slice-6c-fix-5-verify.md:180 … "git ls-tree -r --name-only HEAD"   # line is HEAD@{2}
$ node /tmp/rev6c5/guard-post.mjs --root $PWD | grep -c 'FINDING \[no-bare-head-count\]'
8
```

So: a false negative existed for `@` **only**. `HEAD^`/`HEAD@{2}` were caught before and after; what the fix
bought them was an **exact token in the message**, and what it bought the guard was `@` coverage. "Both were
silently dropped" is false as written — a history claim about its own artifact that the artifact does not
support. **The human's instruction is explicit: "a sentence in the report that overstates what was broken is
itself an instance of the class this whole slice exists to kill — rule on it." I rule that it is an instance.**
(The verifier reached the same measurement; my ruling is my own, and I am the authority on it here.)

This is the **sixth consecutive round** with an instance of the class in the round's own report. That is the
fact that drives §7.

---

## 3. The baseline — independently re-derived by me, and it holds; the repo is nonetheless RED right now

I re-implemented the derivation (pattern read out of the committed guard at run time; walk, per-line
`matchAll`, per-(file,text) counting and the shape-3 fixed-sha skip written by me — `M6`):

```
# root = the .scratch/v28/{reports,briefs} trees exported from the builder's commit 37b8dd8
$ git archive 37b8dd8 .scratch/v28/reports .scratch/v28/briefs | tar -x -C /tmp/rev6c5/at37b8dd8
$ node /tmp/rev6c5/baseline-at-commit.mjs
scanned files      : 120
measured occurrences: 87   keys: 47
embedded occurrences: 87   keys: 47
measured keys missing from baseline (extra): 0
baseline keys with no measured occurrence (stale): 0
key count mismatches: 0
keys binding exactly: 47 / 47
```

**87 occurrences / 47 keys, zero slack, all 47 keys binding exactly — reproduced independently.** The
builder's "23/13 → 87/47" is also correct: `M7` sums the round-4 maps at `e3f163d` and `876a516` to `23`
occurrences across the `13` keys the report names. And the baseline was **not** edited to pass: the
`BARE_HEAD_BASELINE` block is byte-identical between `1282871` and `37b8dd8` (`M12`-adjacent check:
`diff` of the two extracted Maps → identical), so the repair added coverage without adding records — which is
the honest outcome the report claims.

**But the repository is red, and that matters for criterion 6.** At the current working tree my derivation
gives **95 occurrences / 52 keys**: the five extra keys (8 occurrences) are all in
`.scratch/v28/reports/slice-6c-fix-5-verify.md`, the verifier's report, written **after** the builder's commit
and left untracked:

```
$ node scripts/guards/factory-guard.mjs
  note — no-bare-head-count: scanned 121 WORKING-TREE file(s); git tracks 120 under the same paths (1 untracked, 0 tracked-but-absent)
  note — .scratch/v28/reports/slice-6c-fix-5-verify.md is UNTRACKED: its counts are working-tree content, at no commit
  FINDING … :161 "git ls-tree -r --name-only @"   …:162 "280 tracked files at @"   …:163 "git show @"
  FINDING … :168 …:169 …:170  (the same three)     …:179 "…HEAD^"   …:180 "…HEAD@{2}"
FAIL — 8 factory finding(s).        EXIT=1
```

This is **not** a defect in the builder's diff (it is the verifier's own probe seeds landing in the scanned
tree afterwards), and it is *positive evidence for R2*: the pre-repair guard found 2 of those 8, the repaired
guard finds all 8. But two consequences should be recorded, because the reviewed artefact chain currently
asserts otherwise: (i) the premise *"the no-bare-head-count guard PASSES on the repo"* is **false as of now**;
(ii) any lane's note that the guard is green at HEAD is stale the moment another lane writes a probe into
`.scratch/v28/reports/` — the baseline is per-(file,text) and forward-only, so a lane's own evidence file
becomes the next lane's red. `.scratch/v28/reports/slice-6c-fix-5.md:318-330` asserts a green run; that run
was green when taken (its own report was the sole untracked file), and I reproduce the *shape* of it, not the
current state.

---

## 4. SCOPE block and the `ok —` claim — both MET (the two-round-running finding is closed)

**SCOPE.** `docs/agents/code-structure.md:121-127` makes the guard header, not a report's prose, the
authoritative statement of coverage and calls a header/implementation disagreement *the* defect.
`scripts/guards/factory-guard.mjs:58-76` now carries `// SCOPE — …`, enumerating exactly the reads I find in
the implementation —

| SCOPE line | implementation |
|---|---|
| `factory/config.json` | `factory-guard.mjs:98` |
| `factory/work/*.json`, ONE level | `:226-228` (`readdirSync`, `.json` filter) |
| `.opencode/agents/*.md` + `~/.pi/agent/agents/*.md`, `model:` line only | `:288-295` |
| `scripts/guards/*.mjs`, ONE level, leading comment block | `:335-340` |
| `.scratch/v28/reports/*.md` + `briefs/*.md`, ONE level | `:517-521` |

and states what is **not** counted (`ledger.md`, `plan.md`, other lanes, no recursion, other extensions) and
that the report scan is **presence-on-disk, not `git ls-files`**. Every walk is `readdirSync` (non-recursive),
so the header is true. One small tension, non-blocking: `discloseScanProvenance()` (`:564-584`) *does* invoke
`git ls-files` to print the disk/tracked relationship; the SCOPE sentence is about what is *counted*, and the
note's own wording says the scan read working-tree content, so the header is not false — but "not `git
ls-files`" and a `git ls-files` call in the same function is a sentence a reader can trip on.

**`ok —`.** `scripts/guards/factory-guard.mjs:609` — the claim is now *"no report or brief count resolved
through bare HEAD beyond the recorded baseline"*, which is exactly what the mechanism establishes (forward-only,
baseline-absorbed), and `:608-609` make each claim conditional on its scan having actually run. **F3 is
fixed**: the two-round-running finding (a summary that claimed more than the check did) does not survive.
Reproduced:

```
$ node scripts/guards/factory-guard.mjs | grep 'ok —'
  ok — 5 model(s), 8 task kind(s), 1 work item(s); every floor meetable, every artifact present, every
       instrument header stating only what it can point at, no report or brief count resolved through bare
       HEAD beyond the recorded baseline
```

---

## 5. The repaired `scheduler.test.mjs` — the split is honest, and neither half is vacuous (my own mutation)

Read the diff (`git diff 1282871 37b8dd8 -- scripts/factory/scheduler.test.mjs`, 38 lines, one `it`
rewritten in place — file stays at `37` tests, reproduced: `grep -cE '^\s*(it|test)\(' = 37`):

- **PART 1** (`scripts/factory/scheduler.test.mjs:248-263`) asserts the *mechanism* against an explicit
  fixture (`'local-only'` = ocr's kind + `requires_local_inference: true`) — the subject is the fixture, not
  the waived lane. **Honest.**
- **PART 2** (`:265-283`) asserts the *current policy* against `realConfig`, with a comment naming `ec47f15`,
  D-017, D-012 and saying this half must be restored when the human reverses the waiver. **Honest** — and note
  the comment's claim is the *opposite* of the verifier's note (see §6d).

**My own two mutations** (`M9`, on `/tmp/rev6c5/copy`; the verifier used `false &&` on the condition, I did
not):

| mutation I applied | result |
|---|---|
| control, unmutated copy | `Tests 37 passed (37)` |
| **#1** — `scheduler.mjs:518` `why: 'task requires local inference'` → `'blocked for reasons'` (the *reason contract*, not the branch) | **RED** — `AssertionError: expected 'blocked for reasons' to match /requires local inference/` at `scheduler.test.mjs:262` (PART 1) |
| **#2** — delete the whole `requires_local_inference` rejection block from `scheduler.mjs:517-520` (a different edit from the verifier's `false &&`) | **RED** — `TypeError: Cannot read properties of undefined (reading 'why')` (PART 1) |
| **#3** — flip the copy's `factory/config.json:172` back to `true` (revert the D-017 waiver) | **RED** — `AssertionError: expected { …(2) } to be undefined` on PART 2's `expect(roomy.rejected.find((r) => r.modelKey === CLOUD)).toBeUndefined()` |

Mutation #1 is the one worth having done: it shows PART 1 pins the *named* rejection, not merely "something
was rejected" — so the mechanism half is not a shape-shaped assertion either. Mutation #3 shows PART 2 is a
live policy assertion, i.e. the waiver is genuinely under test and a revert *will* require editing that half —
which is what the test's own comment says and what §6d corrects in the verifier's report.

---

## 6. Fresh instance of the class in this round's own artifacts

Five rounds running, this review has had to return one. It has one again. I report four, in descending
severity, each with the command.

### 6a. `.scratch/v28/reports/slice-6c-fix-5.md:482` — "silently dropped"

Ruled in §2c. False as written; measured (`M4`, `M5`). An instance of the class the slice exists to kill.

### 6b. `.scratch/v28/reports/slice-6c-fix-5.md:512-513` — "each can fail" for a check that cannot fail

The report lists the repair's two new behaviour checks and asserts the control *"goes red if the wider boundary
starts firing on an email address, a decorator, or a bare reflog"*
(`scripts/guards/factory-guard.check.mjs:471-485`, the `notARevision` case, whose four lines are
`write to user@example.com…` / `the @decorator style…` / `the @{2} form…` / `the count is 5 at user@example.com`).
Measured (`M10`): I removed the `@` lookahead **entirely** (`MOVING_REV` → `…|@`, i.e. exactly "the wider
boundary starts firing on an email") and ran that root:

```
$ node /tmp/rev6c5/guard-wild.mjs --root /tmp/rev6c5/atcontrol     # 4 control lines, wildcard @
PASS — the registry can be trusted and no work item claims evidence it does not have.    exit 0
$ node /tmp/rev6c5/guard-wild.mjs --root /tmp/rev6c5/probe2 | grep -c 'FINDING \[no-bare-head-count\]'
21      # == the unmutated guard's count, i.e. the wildcard @ added nothing anywhere
```

The control cannot go red for the failure it names: nothing in those four lines is reachable by any of the
three arms (`arm 1` needs a digit and the literal `at` immediately before the token; `arm 2` needs `git`), so
the check is a no-op for the `@` boundary in both directions. The *fire* check is a real check (it dies when
the fix is reverted — the verifier and I agree), but the control is not: a behaviour check whose named failure
mode is unreachable is a claim in the report, in the shape a check is supposed to make impossible.

### 6c. The coverage claims about arm 3 (and arm 2's boundary)

- `.scratch/v28/reports/slice-6c-fix-5.md:142-147` — *"Arm 3 is new: a count taken from a command that
  resolves `HEAD` by saying nothing"* → measured false (`M2`/`M3`, §1a): `git show | wc -l`, `git reflog |
  wc -l`, `git blame <file> | wc -l`, `git annotate <file> | wc -l` are all exactly that and none is flagged,
  while `git branch | wc -l` (not HEAD) is.
- `factory/decisions.md:430` (D-019) — the class row *"counted command defaulting to HEAD, no revision named —
  **yes**"* → same measurement, same result.
- `factory/decisions.md:452` (D-019's verdict) — *"it now detects the class by structure rather than by
  example"* → falsified by §1a/§1b/§1c.
- `.scratch/v28/reports/slice-6c-fix-5.md:141-142` / `scripts/guards/factory-guard.mjs:49-50` — *"any git
  subcommand whose argument is a moving ref" / "whatever the subcommand"* → true of the *subcommand*
  dimension, false of a global option or a quoted ref (`git --no-pager log HEAD | wc -l`, `git -C <dir> show
  HEAD:p`, `git show "HEAD"`).
- **The shape it missed, named in one line:** *"a count taken from a command that resolves HEAD by saying
  nothing"* is enforced as the set `{log, rev-list, shortlog, whatchanged, cherry, stash, branch, describe}` —
  a list that is simultaneously missing four true members and containing two false ones.

### 6d. Minor, on the verifier's report (not the diff): its note contradicts its own measurement

`.scratch/v28/reports/slice-6c-fix-5-verify.md` (Notes / residual risks) says a future revert of the D-017
waiver *"will not need a test rewrite — PART 2's comment says so"*. My mutation #3 shows a revert turns PART 2
**red** (`AssertionError: expected { …(2) } to be undefined`), and the tested comment
(`scripts/factory/scheduler.test.mjs:270-275`) says the opposite — *"this half then goes back to asserting
CLOUD is rejected and LOCAL is the only option"*. The test is right; the verifier's sentence is wrong. Not a
finding against the diff, recorded because the parent reads both.

### 6e. A compressed command in the B1 raw block does not produce the result printed beside it

`.scratch/v28/reports/slice-6c-fix-5.md:93-94` (and the B1 row at `:76`, whose "Command that proves it" is the same grep) prints:

```
$ git show 99d044f:scripts/guards/factory-guard.mjs | grep -c instrument-headers-honest
0
```

Measured (`M11`): that command returns **3** (lines 43, 318, 324 carry the string). The number `0` is true of
the measurement round 4 actually made — its raw tail (`.scratch/v28/reports/slice-6c-fix-4.md:180-182`) shows
the two-step `node /tmp/before-guard-6c4.mjs --root /tmp/nb2 | grep -c instrument-headers-honest` → `0`, a
*finding* count against a probe root. Round 5 dropped the `node … --root` half when it re-pasted the evidence,
so the pasted line is not the command that produced the printed number. The commit IS named (so the number is
attributable), which is why this is the mildest of the four — but "a reader can run this and get the number
shown" is the property the B1 fix existed to establish, and as pasted it fails.

---

## 7. CENTREPIECE — the invariant, the rule, and the shape it missed (the human's escalation, in one read)

The fifth-round rule is explicit: fail it again for this class and do **not** recommend a sixth fix round.
I fail it, so here is the triple, and then the specification question it implies.

**(a) The invariant the instrument encodes.**
*Every count in a report or brief must be attributable to a fixed, immutable revision — a commit named by sha
— because a count whose provenance is a moving revision (`HEAD`, `@`, `HEAD~n`, `HEAD^n`, `HEAD@{…}` — and, by
the same reasoning, the working tree or any ref a push/fetch can move) cannot be reproduced by the reader and
moves under the very commit that carries the sentence.* (`.scratch/v28/reports/slice-6c-fix-5.md:31-35`,
`scripts/guards/factory-guard.mjs:47-56`.)

**(b) The detection rule it implements.**
One per-line regex over `.scratch/v28/reports/*.md` and `.scratch/v28/briefs/*.md`, ORing three lexical arms,
with every match on a line counted into a per-`(file::matched-text)` count baseline, and a finding only when a
file's running count for a key exceeds the recorded one:

1. `(?<![\d/.\w])\d+(?![/\d])\s+(?:[a-z\`][\w\`.-]*\s+){0,4}\bat (?:the )?(?:HEAD(?:~…|\^…|@\{…\})?|@|working (tree|copy|directory))(?![\w])`
2. `\bgit\s+[a-z][a-z-]*[^\n|\`]*?\s(?:<moving-rev>)(?![\w])`
3. `\bgit\s+(?:log|rev-list|shortlog|whatchanged|cherry|stash|branch|describe)\b[^|\n]*\|\s*wc\b`

(`scripts/guards/factory-guard.mjs:437-457`.)

**(c) The exact shape it missed** — measured, each with a command run above:

| # | shape | fires? | command |
|---|---|---|---|
| 1 | **arm 3's own class, one token over:** `git show \| wc -l` (327), `git reflog \| wc -l` (281), `git blame package.json \| wc -l` (55), `git annotate package.json \| wc -l` (55) — every one resolves HEAD with no revision named | **NO** | `M2`, `M3` |
| 2 | and arm 3 **fires on** `git branch \| wc -l` (11 branches), `git stash \| wc -l` (stash ref) — no HEAD involvement | **YES** (over-match) | `M2`, `M3` |
| 3 | **the label in the other word order:** `at HEAD the corpus reports 90 documents / 7 claims / 97 quotations` — *live in the corpus*, `.scratch/v28/reports/slice-6b-fix-1.md:292`, and already recorded as this rule's blind spot at `.scratch/v28/reports/slice-6c-fix-4.md:81` | **NO** | `M8` (PASS exit 0 on a root holding that file alone) |
| 4 | a label word the word-class cannot spell: `280 tracked .scratch files at HEAD`, `280 files in src/lib at HEAD`, `280 files (tracked) at HEAD`, `87, taken at HEAD`, `the count was 87 as of HEAD` | **NO** | `M1` |
| 5 | a git invocation carrying a global option or a quoted rev: `git --no-pager log HEAD \| wc -l`, `git -C <dir> show HEAD:p`, `git -c core.pager=cat show HEAD`, `git show "HEAD"`, `git rev-parse 'HEAD'` | **NO** | `M1` |

**One sentence, for the human:** *the instrument detects the class's shapes one at a time and each widening is
bought with a fresh review; the shape that this round still misses is the one its own third arm declares — "a
count from a command that resolves HEAD by saying nothing" — because that arm is enforced as an eight-name
list (`show`, `reflog`, `blame`, `annotate` are true members and are not in it; `branch`, `stash` are in it and
are not members).*

### Why this is a SPECIFICATION problem, not a builder problem

Six rounds have each widened the instrument by exactly the shapes the previous review measured. The invariant
is **semantic** ("this number's provenance is a fixed revision"); the detector is **lexical** (three regexes
over Markdown prose). No amount of widening makes a lexical detector a decision procedure for a semantic
predicate, and my probe set alone — invented in one sitting, without reading the builder's or verifier's seeds —
found 15 unflagged class shapes (the table below, plus the two further invocation variants in §1a) and 2 false positives, all in one probe set. Two independent signs say the
search space is not converging:

1. **The human's own standard contains a member the instrument deliberately cannot enforce.** *"the actual
   HEAD versus working tree distinction"* — `git status --porcelain | wc -l` is a count whose provenance is not
   a fixed commit, so it satisfies the report's own stated invariant; the round could only answer it with a
   *classification* (a note, `scripts/guards/factory-guard.mjs:405-412`) rather than *enforcement*, because
   enforcing it would fail every verify lane and the guard's own `ls | wc -l` basis. That is a contradiction
   inside the specification, not a missing arm.
2. **Rounds 4 and 5 disagreed about which dimension of arm 1 was incomplete.** Round 4 recorded the
   *word-order* blind spot (`.scratch/v28/reports/slice-6c-fix-4.md:81`); round 5 widened the arm's *ref
   spellings* (`@`, `HEAD^`, `HEAD@{}`) and left the order untouched, then listed as its remaining ceilings six
   shapes that do not include the one round 4 had already named. Each round optimises what the last review
   measured.

**The three options — this is the ruling the human has to make, and it is not mine to make:**

- **(1) Make the reporting form decidable.** Require counts in reports/briefs to carry their provenance in a
  canonical, machine-checkable token (e.g. `N at <sha>` *plus* an explicit marker, or a `<!-- count: N at sha -->`
  annotation), and make `no-bare-head-count` a rule about *that form*: a count without a canonical provenance
  token fails; a count whose token names a sha is checkable with `git cat-file -e <sha>^{commit}`. Then the
  class is decidable, and this whole round of arm-widening stops. **This is the only design under which
  "detects the class" is achievable rather than asymptotic**, and it is the option I would recommend.
- **(2) Keep the detector, strike the overclaim.** Amend `factory/decisions.md:430,452` and
  `.scratch/v28/reports/slice-6c-fix-5.md:31-64` to say plainly: *this is a detector over named shapes with a
  declared ceiling; it does not detect the class*. Then every miss above is a disclosed ceiling rather than an
  instance of the class, and the guard stops pretending otherwise.
- **(3) Keep a human in the loop for the residue.** The reviewer/verifier hunt for the class's shapes is what
  actually caught the last six instances; leave the instrument as a cheap first-pass and the hunt as the
  enforcement.

**What a sixth round would look like, and why it is the wrong move:** add `show|reflog|blame|annotate` to
arm 3, add an order-alternative and a wider word class to arm 1, allow `--no-pager`/`-C`/quotes in arm 2. That
round would again find one fresh instance of this class in its own report (§2c/§6b/§6e show how reliably that
happens), arm 3 would still be a list (any command can be absent), and arm 1 would still be a phrase set (any
phrasing can be absent). A sixth example-fix is evidence the specification, not the builder, is the wrong
object.

---

## 8. Findings

### Blocking

1. **`scripts/guards/factory-guard.mjs:454` — the third arm is a hand-typed list of eight subcommand names, and
   the round's artifacts assert it detects the class.** Measured (`M2`/`M3`, root `/tmp/rev6c5/probe3`):
   `git show | wc -l` (HEAD by default, 327 lines), `git show --stat | wc -l` (11), `git reflog | wc -l` (281),
   `git blame package.json | wc -l` (55), `git annotate package.json | wc -l` (55), `git --no-pager show | wc -l`
   produce **no finding**; `git branch | wc -l` (11 branch names) and `git stash | wc -l` (stash ref) **do**.
   The claim is made at `.scratch/v28/reports/slice-6c-fix-5.md:142-147`, `factory/decisions.md:430` and
   `factory/decisions.md:452`.
2. **`scripts/guards/factory-guard.mjs:442-444` (arm 1) is a set of English phrasings, and a live member of the
   class escapes it.** `at HEAD the corpus reports 90 documents / 7 claims / 97 quotations`
   (`.scratch/v28/reports/slice-6b-fix-1.md:292`) → the guard returns `PASS` on a root holding that file alone
   (`M8`); the same order-blindness is recorded one round earlier at
   `.scratch/v28/reports/slice-6c-fix-4.md:81` and is absent from round 5's ceiling list
   (`.scratch/v28/reports/slice-6c-fix-5.md:47-64`). Also unflagged (`M1`): `280 tracked .scratch files at
   HEAD`, `280 files in src/lib at HEAD`, `280 files (tracked) at HEAD`, `87, taken at HEAD`,
   `the count was 87 as of HEAD`.
3. **`scripts/guards/factory-guard.mjs:450` (arm 2) cannot see a global option or a quoted revision, against
   the header's own words.** `git --no-pager log HEAD | wc -l`, `git -C /tmp/ws show HEAD:…`,
   `git -c core.pager=cat show HEAD`, `git show "HEAD"`, `git rev-parse 'HEAD'` → no finding (`M1`). Header
   claim: `scripts/guards/factory-guard.mjs:49-50` ("a `git … HEAD` read whatever the subcommand"); report
   claim: `.scratch/v28/reports/slice-6c-fix-5.md:140-142` ("**any** git subcommand").
4. **`.scratch/v28/reports/slice-6c-fix-5.md:482` overstates what was broken** — "both were silently dropped by
   the same `\b`" (and the same in commit `37b8dd8`'s subject). Measured (`M4`, `M5`): the pre-repair guard
   flagged `HEAD^` and `HEAD@{2}` with a truncated label; only `@` was dropped. The human's rule is explicit
   that such a sentence is itself an instance of the class; I rule that it is.
5. **`.scratch/v28/reports/slice-6c-fix-5.md:512-513` claims both new behaviour checks "can fail"; the control
   cannot.** With `MOVING_REV`'s `@` lookahead removed entirely (maximally over-matching), the control root
   still exits `0` (`M10`), and the wildcard adds no finding anywhere in my probe corpus — the four control
   lines are unreachable by all three arms.
6. **`.scratch/v28/reports/slice-6c-fix-5.md:93-94` / `:76` print a command that does not produce the result
   beside it**: `git show 99d044f:scripts/guards/factory-guard.mjs | grep -c instrument-headers-honest` → printed
   `0`, measured **3** (`M11`). The number `0` is true of the two-step measurement round 4 actually ran
   (`.scratch/v28/reports/slice-6c-fix-4.md:180-182`); the pasted one-liner is not that command.

### Non-blocking

- `scripts/guards/factory-guard.check.mjs:471-485` — the `@{…}` control line asserts *"the @{2} form means no
  revision here"*, but `git rev-parse @{2}` = `128287105…`, a real revision (HEAD's reflog). The `@(?![{\w])`
  boundary (`scripts/guards/factory-guard.mjs:437`) therefore excludes bare `@{…}` while including
  `HEAD@{…}` — a HEAD spelling uncovered by design, and pinned as correct by a check. Not in the ceiling list.
- `scripts/guards/factory-guard.mjs:450` — `git show HEAD.patch` is flagged as `"git show HEAD"` (a filename
  read as the token); pre-existing under `\b` as well, harmless, named for completeness.
- The disclosed ceilings I accept as honest and correctly classified: working-tree git counts
  (`git status --porcelain | wc -l`, `:405-412`), filesystem counts (`ls | wc -l`), a wrong named commit, other
  moving refs (branch/tag/`ORIG_HEAD`…), files outside SCOPE, and `ledger.md:7091` recorded known-open as D-018
  (`factory/decisions.md` D-018) — reproduced: `sed -n '7091p' .scratch/v28/ledger.md` reads
  `259 at 32e9f48, 265 at HEAD — …` and `ledger.md` is untouched in the delta.
- `.scratch/v28/reports/slice-6c-fix-5-verify.md` (Notes) — its claim that reverting D-017 "will not need a test
  rewrite" is contradicted by my mutation #3 and by the test's own comment (`scripts/factory/scheduler.test.mjs:270-275`).
  The verifier's sentence, not the diff, is wrong.
- **State of the tree, reported not blamed:** the guard is **RED at the current working tree** — 8
  `no-bare-head-count` findings, all in the untracked `.scratch/v28/reports/slice-6c-fix-5-verify.md`
  (`:161-163`, `:168-170`, `:179-180`). The builder's commit was green when taken; the verifier's probe seeds
  landed in the scan afterwards. Anyone re-running `npm run guards` right now gets exit 1.
- Scope/noise audit of the delta: `git diff 1282871 37b8dd8 --stat` = 5 files (2 lane documents, 2 guard files,
  1 test), all tracing to R1–R4; no reformatting or drive-by churn found in the guard diff, the baseline Map is
  byte-identical between `1282871` and `37b8dd8` (verified by extracting both), and `factory/config.json` is
  untouched by the repair (`git diff 1282871 37b8dd8 -- factory/config.json` is empty; the waiver at
  `factory/config.json:172` is `ec47f15`'s, not this delta's).

---

## 9. Requirements traceability (against the human's clarified standard)

| Requirement | Verdict | Evidence |
|---|---|---|
| Every matching occurrence, not only the first per line | **met** | `matchAll` + per-key counts (`factory-guard.mjs:535-550`); `the total is 265 at HEAD and 87 at HEAD` → 2 findings (`M1`); my baseline re-derivation reproduces the doubled counts (`M6`) |
| The baseline is independently derived and was never modified to pass | **met** | my own derivation at `37b8dd8`: 120 files / **87 occ / 47 keys**, 0 extra, 0 stale, 0 count diffs, 47/47 binding exactly (`M6`); Map identical `1282871`↔`37b8dd8`; round-4 figure 23/13 reproduced (`M7`) |
| The actual HEAD-vs-working-tree distinction | **partially met** | classification, not enforcement: note at `factory-guard.mjs:405-412`; `git status --porcelain \| wc -l` is unflagged though it satisfies the report's own invariant (`M1`) — declared, and part of the specification question in §7 |
| Git content vs filesystem content | **met (as disclosure)** | `discloseScanProvenance()` `:564-584` prints WORKING-TREE vs tracked counts and names untracked files; reproduced live: "scanned 121 … git tracks 120 … (1 untracked)" |
| Unlabeled or ambiguous HEAD references | **partially met** | arm 1 catches `N … at <rev>`; it misses the reverse order (live at `slice-6b-fix-1.md:292`), non-`at` prepositions, and label words the word class cannot spell (`M1`, `M8`) |
| The full set of relevant command and reporting shapes | **not met** | §1a–1c and §7(c): 15 unflagged class shapes — 4 true members missing from arm 3 plus 2 false members, the reverse-order label, 4 label spellings, 5 invocation spellings — each with a command run |
| The `@` dead arm fixed with no false positives | **met** | `M4` (pre: no finding for `git show @` / `at @`; post: both flagged); `M1`/`M10` controls all PASS |
| SCOPE block per `docs/agents/code-structure.md:121-127` | **met** | `factory-guard.mjs:58-76`, table in §4, every read verified non-recursive |
| `ok —` claims only what the mechanism establishes | **met** | `factory-guard.mjs:608-610`; claim reproduced in §4 |
| `scheduler.test.mjs` split honest, neither half vacuous | **met** | `M9`: 3 independent mutations, the mechanism half dies for the reason contract and for the branch, the policy half dies on a waiver revert; `factory/config.json` untouched by the delta |
| A fresh instance of the class in this round's own report | **not met** | four found, §6a–6e (six consecutive rounds) |
| No repo mutation by the reviewer | **met** | `git status --porcelain` = the 2 pre-existing entries before and after; all mutation on `/tmp` copies; no `systemctl`, no inference server, `ocr` not run |

## 10. Verdict and next action

**NEEDS_CHANGES.** The `@` repair, the F2 per-line counting, the baseline, the SCOPE block, the `ok —` claim
and the scheduler-test split are all sound and reproduced. The round fails on the two things it is actually
judged on: the instrument still detects the class one shape at a time (blocking 1–3, with 15 measured unflagged
shapes and 2 false positives), and the round's own artifacts carry fresh instances of the class it exists to
kill (blocking 4–6).

Per the escalation rule I do **not** recommend a sixth repair round. **Recommended next action: the human rules
on the SPECIFICATION in §7 — canonical machine-checkable counts (option 1), or strike the "detects the class"
claim and keep a declared-ceiling detector (option 2), or keep a human in the loop for the residue (option 3) —
before any further work on `no-bare-head-count`.** Separately, and cheap: the red working tree (the untracked
verify report's 8 occurrences) needs either absorption into the baseline by whoever owns the next round or
deletion of the probe seeds, and `.scratch/v28/reports/slice-6c-fix-5.md:482` should be corrected to "the same
`\b` truncated the token for `HEAD^`/`HEAD@{}` and dropped `@` entirely".
---

## Appendix A — raw firing output of my two probe roots (verbatim, so the reader can re-run)

```
$ cd /home/jmeisburg/orca/workspaces/playdate-app/onboarding
$ node scripts/guards/factory-guard.mjs --root /tmp/rev6c5/probe2 | grep 'no-bare-head-count' | grep FINDING
  …:1  "280 tracked files at HEAD"            …:3  "280 tracked `.scratch` files at HEAD"
  …:17 "git show HEAD"                        …:29 "git log --oneline HEAD~1"
  …:32 "265 at the working tree"              …:35 "git show HEAD@{upstream}"
  …:36 "git log -1 --format=%H | wc"          …:38 "git rev-parse HEAD"
  …:41 "git log HEAD"                         …:42 "207 files at HEAD"
  …:44 "git ls-tree -r --name-only HEAD"      …:47 "git stash list | wc"
  …:48 "git describe | wc"                    …:49 "git merge-base HEAD"
  …:50 "280 tracked files at HEAD"            …:51 "git show HEAD"
  …:54 "git cat-file -p HEAD"                 …:58 "git rev-list --count HEAD"
  …:59 "87 occurrences at HEAD"               …:60 "265 at HEAD"    …:60 "87 at HEAD"   (two on one line)

$ node scripts/guards/factory-guard.mjs --root /tmp/rev6c5/probe3 | grep 'no-bare-head-count' | grep FINDING
  …:8  "git branch | wc"      …:9  "git stash | wc"     …:10 "git shortlog | wc"
  …:11 "git cherry | wc"      …:12 "git describe | wc"  …:13 "git log | wc"
  …:14 "git rev-list | wc"    …:18 "git show HEAD~3"    …:19 "git diff --cached HEAD"
  …:20 "git log --oneline -1 | wc"
  # NOT flagged: :1 git show | wc -l   :2 git show --stat | wc -l   :3 git --no-pager show | wc -l
  #              :4 git reflog | wc -l :5 git reflog show | wc -l   :6 git blame package.json | wc -l
  #              :7 git annotate package.json | wc -l

$ for p in 'git show' 'git show --stat' 'git reflog' 'git blame package.json' 'git annotate package.json' 'git branch' 'git stash list'; do printf '%-30s %s\n' "$p" "$(eval $p | wc -l)"; done
git show                       327
git show --stat                11
git reflog                     281
git blame package.json         55
git annotate package.json      55
git branch                     11
git stash list                 0
$ git rev-parse @{2}
128287105dd3969b3651c212460f3ab106b859b1
```

## Appendix B — integrity of my run

```
$ git status --porcelain          # before and after the review, identical
 M factory/work/v28-r2-6c.json
?? .scratch/v28/reports/slice-6c-fix-5-verify.md
$ node scripts/guards/factory-guard.check.mjs | tail -1
factory-guard check: all 33 checks passed.        # exit 0
```

No repository file was created, modified or deleted by this review. All mutation was confined to `/tmp/rev6c5/`
(probe roots, two guard revisions extracted with `git show`, a copy of the tree for the three test mutations
with `node_modules` symlinked from the repo — read-only — and the artifact of `git archive 37b8dd8`). No
`systemctl` call, no inference server started or stopped, `ocr` not run.
