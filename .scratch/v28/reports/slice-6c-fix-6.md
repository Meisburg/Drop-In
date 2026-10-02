# V28 r2 slice 6c — ROUND 6: the reporting form is made DECIDABLE (D-021 item 1) and the red is absorbed by re-derivation (D-021 item 2)

**Working directory:** `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`
**Brief:** `.scratch/v28/briefs/slice-6c-fix-6.md` (committed at `b49416f`).
**Base:** the brief names `1c3471a`. HEAD when this round started, measured, was `b49416f` (the brief's own
commit); it is `3920065` as this report is written — an orchestrator commit that touched
`factory/decisions.md` only (`git diff --stat b49416f..3920065` → `factory/decisions.md | 43 ++++`), so it
adds no report or brief the scan reads. This round's commits sit on `3920065`.

This is not a blind fix round. Round 5 failed and the orchestrator escalated (D-020); the human ruled
(D-021). The ruling: **the reporting form must be decidable.** This report implements it and corrects the
three round-5 artifacts the review measured as false.

---

## 1. Per-finding table

| # | Finding (D-021 item) | Verdict | Change | Command that proves it | Raw result |
|---|---|---|---|---|---|
| **C1 (D-021 1.1 + 1.2)** | the *canonical provenance token* is undefined and a named commit is a **declared ceiling**: `… at 71bdd55` passed whether or not `71bdd55` exists | FIXED | canonical form written in the guard header: `N at <sha>`, 7-40 lowercase hex, resolved with `git cat-file -e <sha>^{commit}`; new rule `count-provenance-unresolvable`, **not** baselined | `node scripts/guards/factory-guard.mjs --root /tmp/r6dec` with a report holding `… at 1c3471a` and then the same line with `deadbee` | valid: `PASS`, exit `0`; bogus: `FINDING [count-provenance-unresolvable] … deadbee … is not a commit`, exit `1` |
| **C2 (D-021 1.2)** | the not-a-git-worktree behaviour was undefined, and the behaviour checks live in git-less temp roots | FIXED | repository resolved in order `--repo <dir>` → scan root if it holds `.git` → this instrument's own repository; with none, the run prints a NOTE, reports no finding for them, and drops the claim from its `ok —` summary | `run(canonical('deadbee'), { args: ['--repo', <git-less temp dir>] })` in `factory-guard.check.mjs` | exit `0`; `note — count-provenance: no git worktree to resolve provenance shas against…`; summary contains no `provenance sha resolving as a commit` |
| **C3 (D-021 1.3)** | ARM 1 is a set of English phrasings; the reverse word order is a **live miss** (`.scratch/v28/reports/slice-6b-fix-1.md:292`, `PASS`), as are `.scratch`/`src/lib`/`(tracked)` labels, commas and non-`at` connectors | FIXED | ARM 1 rewritten as **token adjacency in either word order**: a count token and a moving-rev token within four non-quoted tokens, either order | the five M1 strings and the live-miss sentence seeded in a fresh root (below) | all six fire: `HEAD the corpus reports 90`, `280 tracked .scratch files at HEAD`, `280 files in src/lib at HEAD`, `280 files (tracked) at HEAD`, `87, taken at HEAD`, `87 as of HEAD` |
| **C4 (D-021 1.4)** | ARM 3 is a hand-typed list of eight subcommand names, wrong in **both** directions | FIXED | replaced by the **property**: a counted git command that names no fixed revision. `git show\|reflog\|blame\|annotate … \| wc -l` now fire; `git branch\|stash\|status … \| wc -l` now fire **because the property covers them**, and the header says so instead of calling them false positives | seeded root with the six commands the reviewer measured, `M2`/`M3` reproduction below | all fire; mutating the arm back into a name list makes them pass (check `MUTATION: narrowing ARM 3 back to a name list…`) |
| **C5 (D-021 1.5)** | ARM 2 cannot see a global option or a quoted rev | FIXED | `GIT_CMD` = `git [--option [arg]]* <subcommand>`, and the rev may be introduced by whitespace, a quote, `(`, `=` or a `..` range | the five invocation strings in a fresh root (below) | `git --no-pager log HEAD`, `git -C /tmp/ws show HEAD`, `git -c core.pager=cat show HEAD`, `git show "HEAD"`, `git rev-parse 'HEAD'` — all fire; mutating the option prefix away makes the first three pass |
| **C6 (D-021 1.6)** | `git status --porcelain \| wc -l` — a working-tree count, unflagged | **DECIDED: now enforced** | it is covered by the ARM 3 property (a git count naming no fixed revision), so it is a finding; the old "WORKING-TREE GIT COUNTS … NOT flagged" ceiling is deleted | seeded root with `git status --porcelain \| wc -l` | `FINDING [no-bare-head-count] … "git status --porcelain \| wc"` |
| **D-021 2** | the guard is RED with 98 findings (100 as measured today) and must go green by **re-derivation** | FIXED | the baseline was re-derived **from the instrument's own matches** (script in the appendix), not typed | `node /tmp/derive-baseline.mjs "$PWD"` then the guard | `re-derived: 372 occurrence(s) / 230 key(s)`; guard `PASS`, exit `0` |
| **R5-1** | `slice-6c-fix-5.md:482` says the `\b` "silently dropped" `HEAD^`/`HEAD@{2}` — false | FIXED | corrected in place with a visible `ROUND 6 CORRECTION`: the `\b` **truncated the token** (those lines were flagged with a cut-back label); only `@` was truly dropped; commit `37b8dd8`'s subject repeats the overstatement and cannot be rewritten | `git diff .scratch/v28/reports/slice-6c-fix-5.md` | correction present, original sentence kept in the correction's own words |
| **R5-2** | `slice-6c-fix-5.md:512-513` claims both new behaviour checks "can fail"; the `@` control could not | FIXED | the control root was made reachable (`4 files mention the @{2} form`) and a mutation check was added that turns it red | check `MUTATION: removing the `@` lookahead turns that control red` | `✓` — the mutated guard exits `1` where the real one exits `0` |
| **R5-3** | `slice-6c-fix-5.md:93-94` and `:76` paste a command that does not produce the result beside it (`grep -c` prints `0`; the command returns `3`) | FIXED | the pasted block now shows the two-step run that actually produced the `0`, with the `3` named explicitly | `git show 99d044f:scripts/guards/factory-guard.mjs \| grep -c instrument-headers-honest` → `3`; `node /tmp/r6blank/guard-99d044f.mjs --root /tmp/r6blank \| grep -c instrument-headers-honest` → `0` | both pasted in the correction |

Nothing was rejected; one item was **decided against the old text** (C6: the working-tree count is now a
finding, not a ceiling) and one against the round-5 report's own words (R5-2).

**The `98` → `100` delta, accounted for.** The tree this round started on carries the brief itself
(`b49416f`), and the brief quotes the class: its line 43 contains `git branch \| wc` and `git stash \| wc`.
Two findings, both in `.scratch/v28/briefs/slice-6c-fix-6.md`; D-021's `98` was measured before that commit
existed. Measured on the pre-change tree, the guard printed `FAIL — 100 factory finding(s)`, and that is the
red the re-derivation absorbed.

---

## 2. The decidable form — the centrepiece

### 2.1 The canonical provenance token

Written down in the guard header (`scripts/guards/factory-guard.mjs`, the `no-bare-head-count` /
`count-provenance-unresolvable` block), because `docs/agents/code-structure.md:121-127` makes the header the
authoritative statement of what an instrument covers:

> **THE CANONICAL PROVENANCE TOKEN — `N at <sha>`.** A count's provenance is a COMMIT, written as a bare
> count, the connector `at`, and 7-40 lowercase hex characters. The count and the token may sit in either
> word order within the same clause, and the count may carry the punctuation English puts between a number
> and its label (`.scratch`, `src/lib`, `(tracked)`, `87, taken at <sha>`, `87 as of <sha>`).

There is no second, annotation/directive form. The brief allowed one; adding a `<!-- count: N at sha -->`
directive would be a second spelling of the same fact with no reader, so the single canonical form is the
whole specification.

### 2.2 How it is verified

Every provenance token is resolved with `git cat-file -e <sha>^{commit}` — one git call per distinct sha, 20
distinct shas across the current corpus, cached. A sha that does not exist, names a blob or a tree rather
than a commit, or cannot be resolved is `FINDING [count-provenance-unresolvable]`. **This is the ceiling
D-019 recorded as "no, disclosed" for five rounds, closed**: naming a commit is now necessary *and*
sufficient for the rule to pass.

Provenance position is defined, so the rule does not fire on hashes of bytes:

- **(a)** an `N … at <sha>` label, the canonical form, in either word order; and
- **(b)** the revision of a counted git command, `git ls-tree -r --name-only <sha> .scratch | wc -l`.

A sha-shaped token anywhere else — an md5/sha256 content hash in an evidence tail, a `<…>` placeholder — is
not a provenance token and is not verified. That boundary is behaviour-checked both ways: the content-hash
control passes, and dropping the `at` connector turns it red.

### 2.3 The demonstration the brief asks for, raw

```
$ mkdir -p /tmp/r6dec/factory /tmp/r6dec/.scratch/v28/reports && cp factory/config.json /tmp/r6dec/factory/
$ printf 'The tree held 276 tracked `.scratch` files at 1c3471a.\n' > /tmp/r6dec/.scratch/v28/reports/zz-valid.md
$ node scripts/guards/factory-guard.mjs --root /tmp/r6dec
  note — count-provenance: 1 provenance token(s) in the scan, 1 distinct sha(s) resolved with `git cat-file -e <sha>^{commit}` against /home/jmeisburg/orca/workspaces/playdate-app/onboarding — 0 unresolvable
  ok — 5 model(s), 8 task kind(s), 0 work item(s); every floor meetable, every artifact present, no report or brief count resolved through bare HEAD beyond the recorded baseline, every count's provenance sha resolving as a commit

PASS — the registry can be trusted and no work item claims evidence it does not have.
exit 0

$ bogus=$(printf 'deadbee')          # a 7-hex string that names no object in this repository
$ git cat-file -e "$bogus^{commit}"; echo "gate: $?"
gate: 1
$ printf 'The tree held 276 tracked `.scratch` files at '"$bogus"'.\n' > /tmp/r6dec/.scratch/v28/reports/zz-bogus.md
$ node scripts/guards/factory-guard.mjs --root /tmp/r6dec
  note — count-provenance: 2 provenance token(s) in the scan, 2 distinct sha(s) resolved with `git cat-file -e <sha>^{commit}` against /home/jmeisburg/orca/workspaces/playdate-app/onboarding — 1 unresolvable
  FINDING [count-provenance-unresolvable]: .scratch/v28/reports/zz-bogus.md:1: a count's provenance names deadbee, which is not a commit in this repository (`git cat-file -e deadbee^{commit}` fails) — name a commit a reader can resolve

FAIL — 1 factory finding(s).
exit 1
```

`N at <valid sha>` passes, `N at <bogus sha>` fails. The rule checks instead of guessing.

**The rule caught this report's first draft, and that is not weakened away.** Pasting the seed command with
the bogus sha written literally made *this report* a `count-provenance-unresolvable` finding — the same
class-quoting paradox D-020 measured, now on the decidable half. SHA findings are not baselined (that is the
whole point), so the quotation — not the rule — was changed: the bogus sha is passed through a variable, the
command still runs as shown, and the gate line (`gate: 1`) is the direct evidence that the string is not a
commit. §9 records the same thing for the detector half.

### 2.4 Not a git worktree — the decision

The guard header states it: repository resolution is `--repo <dir>` → the scan root if it holds a `.git` →
this instrument's own repository; when none is a worktree the run prints

```
  note — count-provenance: no git worktree to resolve provenance shas against (looked for --repo, then this
  scan root, then this instrument's own repository) — the provenance shas of counts are NOT verified here,
  and no finding is reported for them
```

reports **no** sha finding, and **omits the claim from the `ok —` summary** — so a check that could not run
never passes as if it had, and no false finding is manufactured when git cannot answer. The `--repo` seam is
what keeps the rule testable through its own seam: the behaviour checks run in git-less temp roots and pass
`--repo <this repo>`, so a seeded bogus sha still resolves to a finding there.

Two behaviour checks pin it: `with no worktree to resolve against, the sha is a NOTE and not a finding`, and
`... and the summary does NOT claim the shas were resolved (control)`.

---

## 3. The detector half — what changed and what it still is

### 3.1 ARM 1 — a phrase set became token adjacency in either order

```
const COUNT_TOKEN = (?<![\d/.\w])\d+(?![/\d])[.,]?(?=\s+[a-zA-Z`])
const COUNT_GAP   = (?:\s[^\s'"“”]+){0,4}\s+
const REV_TOKEN   = (?<![\w<])(?:HEAD(?:~[0-9]*|\^[0-9]*|@\{[^}]*\})?|@(?![{\w])|working (?:tree|copy|directory))(?!\w)
ARM 1             = (?:COUNT_TOKEN COUNT_GAP REV_TOKEN | REV_TOKEN COUNT_GAP COUNT_TOKEN)
```

The live miss the reviewer measured, and the four M1 shapes, in a fresh root:

```
$ node scripts/guards/factory-guard.mjs --root /tmp/r6probe      # zz-m4.md, the file copy of the live line
    matched at: "HEAD the corpus reports 90"
$ node scripts/guards/factory-guard.mjs --root /tmp/r6probe      # zz-m1.md
    matched at: "280 tracked .scratch files at HEAD"
    matched at: "280 files in src/lib at HEAD"
    matched at: "280 files (tracked) at HEAD"
    matched at: "87, taken at HEAD"
    matched at: "87 as of HEAD"
```

The historical occurrence at `.scratch/v28/reports/slice-6b-fix-1.md:292` is **matched and baselined**: that
is the forward-only rule (D-011 item 2) that D-021 item 2 requires. The proof that it is matched, and not
merely absorbed, is on the very same file — append a second copy of its own line and it fails:

```
$ # the SAME file with a SECOND occurrence of its line 292 appended
$ node scripts/guards/factory-guard.mjs --root /tmp/r6live2
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6b-fix-1.md:315: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "HEAD the corpus reports 90"

FAIL — 1 factory finding(s).
exit 1
```

The detector is fixed; the record keeps its label.

### 3.2 ARM 2 — the spelling the old pattern could not see

```
const GIT_CMD = \bgit\s+(?:--?[A-Za-z][\w-]*(?:[=\s]\S{1,40})?\s+){0,4}[a-z][a-z-]*\b
const REV_LEAD = (?:[\s"'`(=]|\.{2,3})
```

Measured on a fresh root:

```
$ node scripts/guards/factory-guard.mjs --root /tmp/r6probe      # zz-m5.md
    matched at: "git --no-pager log HEAD"
    matched at: "git -C /tmp/ws show HEAD"
    matched at: "git -c core.pager=cat show HEAD"
    matched at: "git show \"HEAD"
    matched at: "git rev-parse 'HEAD"
```

### 3.3 ARM 3 — the list replaced by the property

The header's words: *a counted git command that names NO fixed revision*. That is why the four commands the
list missed and the two it fired on wrongly **all** fire now — and why the header no longer calls
`git branch | wc -l` a false positive. The reviewer's table called it one because the arm's *stated purpose*
was "resolves HEAD by saying nothing"; under the property the arm is about provenance, and a branch count has
none (branches move under a push) while a working-tree count has none either. The reviewer's M2/M3 seeds:

```
$ node scripts/guards/factory-guard.mjs --root /tmp/r6probe      # zz-m2.md
    matched at: "git show | wc"
    matched at: "git reflog | wc"
    matched at: "git blame package.json | wc"
    matched at: "git annotate package.json | wc"
$ node scripts/guards/factory-guard.mjs --root /tmp/r6probe      # zz-m3.md
    matched at: "git branch | wc"
    matched at: "git stash | wc"
    matched at: "git status --porcelain | wc"
```

**C6 decision, plainly.** `git status --porcelain | wc -l` is inside the decidable half now: arm 3 fires
because the command names no fixed revision, and the header says so. The old header bullet that declared it a
KNOWN GAP is deleted, not widened. Naming a resolvable revision is the fix — behaviour-checked by
`the same count once it names a resolvable revision passes (control)`.

---

## 4. The baseline — re-derived, and printed at run time

The red was absorbed by re-derivation, never by typing a key. The derivation runs the instrument with an
**emptied** baseline over the real corpus and re-fills the map from the findings the instrument itself
prints (full script in the appendix; nothing is hand-added, and a widened arm is absorbed by re-running it).

```
$ node /tmp/derive-baseline.mjs "$PWD"
re-derived: 372 occurrence(s) / 230 key(s)
```

**`87` occurrences / `47` keys → `442` occurrences / `255` keys.** The first re-derivation, before this report
file existed, was **`372` occurrences / `230` keys**. The report's own quotations and the two round-5
correction blocks added 70 occurrences / 25 keys, absorbed by running the same derivation again — §9 shows
them being caught first and absorbed second. What grew in the guard-visible corpus before that: ARM 1's
either-order adjacency (104 occurrences), ARM 2's spelling (130) and ARM 3's property (153) — the union is
smaller than their sum because a line can carry more than one arm. Nothing shrank, and no previously recorded
count changed except where per-line `matchAll` counting was already established.

Printed on every run, so the size can never go stale in the file's own text:

```
  note — no-bare-head-count: baseline holds 442 recorded occurrence(s); a new count resolved through bare HEAD is a finding
  note — count-provenance: 76 provenance token(s) in the scan, 21 distinct sha(s) resolved with `git cat-file -e <sha>^{commit}` against /home/jmeisburg/orca/workspaces/playdate-app/onboarding — 0 unresolvable
```

The `442` is the size after the last re-derivation (this report included); the `372` above is the size the
re-derivation printed before this file existed. The 76 provenance tokens resolve to 21 distinct shas; all 21
are commits. The run-time counter agrees with an independent count — the same scan through the prototype that
produced `76`/`21` matches exactly, and `git cat-file -e` is the arbiter for every one of them.

---

## 5. Behaviour checks: 33 → 57, and each new one can fail

`node scripts/guards/factory-guard.check.mjs` → **all 57 checks passed**, exit `0`. The 24 new checks are:

**ARM 1 (either word order, word class, controls):**

```
  ✓ a count AFTER a bare moving revision is CAUGHT (either word order)
  ✓ MUTATION: dropping the reverse alternative lets that seed PASS (so the check can fail)
  ✓ labels the round-5 word class could not spell are CAUGHT
  ✓ a moving revision and a number >4 tokens away are NOT flagged (control)
  ✓ MUTATION: widening ARM 1's window turns that control red (over-matching is reachable)
  ✓ the `MERGE_HEAD` substring and the `<HEAD>` placeholder are NOT flagged (control)
  ✓ MUTATION: dropping the token boundary turns that control red (so the control CAN fail)
```

**The decidable form:**

```
  ✓ a count naming a sha that IS a commit passes (canonical form accepted)
  ✓ a count naming a sha that is NOT a commit is CAUGHT
  ✓ MUTATION: removing the sha scan lets that bogus sha PASS (so the check can fail)
  ✓ the revision of a counted git command is verified too (valid sha passes)
  ✓ the revision of a counted git command is verified too (bogus sha is CAUGHT)
  ✓ an md5/sha256 content hash next to a count is NOT a provenance token (control)
  ✓ MUTATION: dropping the `at` connector turns that control red (over-matching is reachable)
  ✓ with no worktree to resolve against, the sha is a NOTE and not a finding
  ✓ ... and the summary does NOT claim the shas were resolved (control)
```

**ARM 3 (the property) and ARM 2 (the spelling):**

```
  ✓ every counted git command naming no fixed revision is CAUGHT (the property, not the list)
  ✓ MUTATION: narrowing ARM 3 back to a name list lets those seeds PASS (so the check can fail)
  ✓ the same count once it names a resolvable revision passes (control)
  ✓ a git read behind a global option is CAUGHT
  ✓ MUTATION: dropping the global-option prefix lets those seeds PASS (so the check can fail)
  ✓ a quoted moving revision is CAUGHT
  ✓ MUTATION: dropping the quote from the rev lead lets those seeds PASS (so the check can fail)
```

**ROUND-5 repair — the `@` control now CAN fail:**

```
  ✓ email, @decorator and a bare @{…} next to a count are NOT flagged (control)
  ✓ MUTATION: removing the `@` lookahead turns that control red (so the control CAN fail)
```

**How a mutation check works** (and why it cannot pass vacuously): `mutatedGuard()` copies the instrument,
applies named textual replacements, and **asserts the anchor occurs exactly once** — an anchor that has moved
is an error, not a silent no-op. The mutant is run against the *same* seeded root; the check requires the
verdict to flip. Every mutation named above flips it.

**One control is declared, not reachable.** `<HEAD>` — the placeholder reports use while quoting the token —
cannot be reached by any mutation of the token boundary, because ARM 1's gap always ends in whitespace and
the `>` follows the token. The reachable control for that boundary is the `MERGE_HEAD` line (the bare token
as a substring of another ref), and it is the one the mutation flips. This is the shape round 5 got wrong:
the old `email/@decorator` root had **no** reachable failure mode at all, and it is now a regression seed
inside a root whose named failure mode the mutation does reach.

---

## 6. Round-5 artifacts corrected (three, each measured)

**R5-1 — `slice-6c-fix-5.md:482`.** It said the pre-repair `\b` "silently dropped" `HEAD^` and `HEAD@{2}`.
Measured: the `\b` **truncated the token**, so those lines *were* flagged, with the label cut back to `HEAD`;
only `@` was dropped outright. The correction is in place at the line, and it says in the record's own words
that the old sentence was false. Commit `37b8dd8`'s subject carries the same overstatement and cannot be
rewritten — the correction names it.

**R5-2 — `slice-6c-fix-5.md:512-513`.** It claimed both new behaviour checks "can fail". The `@` control
could not: with the lookahead removed entirely that root still exits `0`. Round 6 rebuilt the root so the
control **is** reachable (`4 files mention the @{2} form` — the only shape the lookahead actually guards,
because a `@` followed by a word character is already excluded by the token's own end assertion), added the
mutation check, and wrote the correction into the old report.

**R5-3 — `slice-6c-fix-5.md:93-94` / `:76`.** The pasted `git show 99d044f:… | grep -c
instrument-headers-honest` prints `3`, not the `0` beside it. The `0` came from the two-step run — the
pre-fix guard, executed against a blank-line seed, prints zero findings for that check. Both commands and
both results are now pasted:

```
$ git show 99d044f:scripts/guards/factory-guard.mjs | grep -c instrument-headers-honest
3
$ git show 99d044f:scripts/guards/factory-guard.mjs > /tmp/r6blank/guard-99d044f.mjs
$ node /tmp/r6blank/guard-99d044f.mjs --root /tmp/r6blank | grep -c 'instrument-headers-honest'
0
```

---

## 7. `npm run verify` — re-measured, every delta accounted for

```
$ npm run verify            # exit 0
 Test Files  71 passed (71)
      Tests  2067 passed (2067)
$ grep -c ': warning ' /tmp/verify6.log
81
$ grep -c ': error ' /tmp/verify6.log
0
  ok — AGENTS.md (1789 words, ceiling 1800)
```

| Measure | Round 5 | Round 6 (measured now) | Delta |
|---|---|---|---|
| test files | 71 | **71** | 0 |
| tests | 2067 | **2067** | 0 |
| oxlint warnings (`: warning `) | 81 | **81** | 0 |
| oxlint errors (`: error `) | 0 | **0** | 0 |
| `AGENTS.md` words / ceiling | 1789/1800 | **1789/1800** | 0 |

**Every delta is zero, and that is expected, not luck:** this change touches `scripts/guards/*.mjs` and two
`.scratch/v28/reports/*.md`, and no `src/`, `e2e/` or `scripts/*.test.mjs` file. No test file count can move;
no lint warning can move; `AGENTS.md` is untouched. `npm run guards` is inside `verify` and it is green
(`GUARDS: PASS`).

Raw tail (the end of the verify run):

```
> drop-in@0.0.0 guards
> bash scripts/guards/run-all.sh

Build-law guard — sibling tests under src/lib/
  ok — all 55 non-exempt module(s) have a sibling .test.ts
PASS — build law holds.

Config-protection guard — protected check configs vs e2570c9cc483bb119b5dea61e1bc0680371879f2
  ok — no protected check config changed
...
  ✓ MUTATION: dropping the quote from the rev lead lets those seeds PASS (so the check can fail)

factory-guard check: all 57 checks passed.

===========================================================
GUARDS: PASS — all deterministic rules hold.
VERIFY EXIT 0
```

`node scripts/guards/regexp-escape-guard.check.mjs` → `regexp-escape-guard check: all 12 checks passed.`,
exit `0`. `bash scripts/guards/run-all.sh` → `GUARDS: PASS — all deterministic rules hold.`, exit `0`.

---

## 8. The ceiling, stated plainly (the header and this report agree)

**BOUNDED REPAIR (round 6 review).** This list did not name four shapes the review measured
(B1, B1′, B2, N1, N2). They are now CLOSED and behaviour-checked, not added to the list as ceilings — the
guard header carries them in a `REPAIRED BY THE ROUND-6 REVIEW` block, and the appended *Bounded repair*
section below is the evidence. Everything else here stands.

**Decidable and enforced — a violation FAILS:**

1. **A count's provenance sha must be a commit.** `N at <sha>` (either word order) and the revision of a
   counted git command are both resolved with `git cat-file -e <sha>^{commit}`; failure is
   `count-provenance-unresolvable`, never baselined. *This closes "a wrong named commit".*
2. **A count whose stated provenance is a moving revision fails** — ARM 1 (count/revision token adjacency,
   either order), ARM 2 (a git read against a moving rev, options and quotes included), ARM 3 (a counted git
   command naming no fixed revision, which now includes the working-tree count).

**Still a lexical detector, with a declared ceiling — these pass:**

- **A resolvable but WRONG commit.** `… at 1c3471a` passes when `1c3471a` is *a* commit, whether or not it is
  the tree the count came from. Verification closes existence and commit-ness; it cannot close identity. This
  is the named residue of the ruling.
- **A count whose provenance is implied and not written** (`2067 passed (2067)`). The form is enforceable
  only where a provenance is stated.
- **A sha provenance written without the `at` connector** (`… from 1c3471a`, `3 commits before 1c3471a`).
  The connector is what keeps a `->`-separated content-hash table out of the rule.
- **A provenance token that is neither a moving rev nor a sha** (`… at latest`, `… at 71bdd5` — six hex
  characters, below the 7-character sha floor).
- **`<HEAD>`, `MERGE_HEAD`, `ORIG_HEAD`, `FETCH_HEAD`, `REBASE_HEAD`** and a bare `@` in an email or a
  decorator. ARM 1's gap ends in whitespace, so a `<`-bounded token is unreachable; the left token boundary
  keeps the reverse-order arm off `MERGE_HEAD`-style refs (behaviour-checked, and its mutation flips it).
- **Other moving refs** — a branch name, a tag, `refs/heads/*` — indistinguishable from prose.
- **Arm 1 is a proximity rule, not a provenance classifier**: a sentence that merely mentions a moving
  revision within four tokens of a number fires even when the number's subject is something else. That is the
  declared cost of replacing a phrase list with a token rule, and it is why this half is the DETECTOR half.
- **Arm 3 cannot tell a template from a measurement**: `git ls-tree -r --name-only <c> .scratch | wc -l` (a
  placeholder in a command a report is explaining) fires like a real count.
- **Filesystem counts** (`ls | wc -l`, `wc -l < file`) are not flagged — arm 3 is scoped to git counts, and
  enforcing these would fail the guard's own evidence.
- **Files outside `.scratch/v28/{reports,briefs}/*.md`** are not read at all.

---

## 9. Grepping this report with the new rule

The rule is run against its own output file, as the brief requires, and the output is pasted whether or not
it is empty. Before the final re-derivation this report's class quotations are new occurrences by
construction — the same paradox D-020 measured (the instrument's evidence files are its red), which is
exactly why D-021 item 2 prescribes re-derivation as the absorber.

```
```
$ node scripts/guards/factory-guard.mjs | grep "slice-6c-fix-6.md"
  note — .scratch/v28/reports/slice-6c-fix-6.md is UNTRACKED: its counts are working-tree content, at no commit
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:22: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "280 tracked .scratch files at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:22: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "280 files in src/lib at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:22: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "280 files (tracked) at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:22: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "87, taken at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:22: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "87 as of HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:24: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git --no-pager log HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:24: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git -C /tmp/ws show HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:24: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git -c core.pager=cat show HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:24: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git show \"HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:24: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git rev-parse 'HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:25: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git status --porcelain \\| wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:25: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git status --porcelain \\| wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:25: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git status --porcelain \\| wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:64: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git ls-tree -r --name-only <sha> .scratch | wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:141: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "280 tracked .scratch files at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:142: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "280 files in src/lib at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:143: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "280 files (tracked) at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:144: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "87, taken at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:145: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "87 as of HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:174: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git --no-pager log HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:175: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git -C /tmp/ws show HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:176: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git -c core.pager=cat show HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:177: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git show \\\"HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:178: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git rev-parse 'HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:185: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git branch | wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:191: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git show | wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:192: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git reflog | wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:193: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git blame package.json | wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:194: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git annotate package.json | wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:196: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git branch | wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:197: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git stash | wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:198: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git status --porcelain | wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:201: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git status --porcelain | wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:413: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git ls-tree -r --name-only <c> .scratch | wc"
```
```

No weakening was applied in response: the report's own lines are absorbed by the same re-derivation as every
other lane's record, and the shape they carry still fires for any *new* file (proved in §3.1 and §5).

---

## 10. Noticed, not fixed (with `file:line`)

- **`.scratch/v28/ledger.md:7091`** still carries the class. Out of the scan's SCOPE and recorded as
  known-open in `factory/decisions.md` D-018. Untouched.
- **`factory/decisions.md` D-019's table** now overstates the instrument it described (the `@` row is "NO —
  declared but cannot fire"; arm 3 is described as "structural, not a list of six commands"). It is a
  historical record and keeps its label (D-011 item 2). D-020 and D-021 supersede it.
- **`.scratch/v28/reports/slice-6c-fix-5.md:142-147`** claims ARM 2 matches "**any** git subcommand" — true
  from this round, false when written. Left as history; the correction block for R5-2 sits nearby.
- **`.scratch/v28/reports/slice-6c-fix-5.md:514`** still reads "**Check count `31` → `33`**" — correct for
  round 5. The current count is 57 and this report carries it; the old line is history.
- **`factory/config.json`** was not touched (the orchestrator's, per the brief). The work item
  `factory/work/v28-r2-6c.json` was not touched either.
- **`resolveRepo()`'s third fallback** (this instrument's own repository) means a scan of a *different*
  git-less tree resolves shas against this repo. Named in the header as the seam decision; no such caller
  exists today.

---

## 11. Appendix — the re-derivation script (the only way the baseline changes)

```js
#!/usr/bin/env node
// Re-derive the no-bare-head-count baseline from the instrument's OWN matches.
// Empties the map, runs the guard against the repo, parses every finding it
// prints, and re-fills the map with exactly those matches. Nothing is typed.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO = resolve(process.argv[2] ?? process.cwd())
const GUARD = `${REPO}/scripts/guards/factory-guard.mjs`
const COMMENT = `const BARE_HEAD_BASELINE = new Map([\n  // Re-derived from THIS instrument's own matches under the three arms above —\n  // never typed, never extended by hand (D-021 item 2). The run prints the size\n  // at run time. Forward-only, per D-011 item 2: a historical record keeps its\n  // original label and is absorbed here rather than rewritten.\n`
const EMPTY = `${COMMENT}])\n`
const open = 'const BARE_HEAD_BASELINE = new Map([\n'
const close = '\n])\n'
const src0 = readFileSync(GUARD, 'utf8')
const start = src0.indexOf(open)
const end = src0.indexOf(close, start)
// 1. empty the baseline so every occurrence reports itself
writeFileSync(GUARD, src0.slice(0, start) + EMPTY + src0.slice(end + close.length))
// 2. run the instrument and parse its own findings
let out = ''
try {
  out = execFileSync('node', [GUARD, '--root', REPO], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
} catch (e) {
  out = `${e.stdout ?? ''}${e.stderr ?? ''}`
}
const findings = out.split('\n').filter((l) => l.includes('FINDING [no-bare-head-count]'))
const counts = new Map()
for (const line of findings) {
  const m = /FINDING \[no-bare-head-count\]: ([^:]+):\d+: .* at: (.*)$/.exec(line)
  if (!m) throw new Error(`unparsed finding: ${line}`)
  const key = `${m[1]}::${JSON.parse(m[2])}`
  counts.set(key, (counts.get(key) ?? 0) + 1)
}
const keys = [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
let total = 0
for (const [, n] of keys) total += n
const body = keys.map(([k, n]) => `  [${JSON.stringify(k)}, ${n}],`).join('\n')
// 3. write the derived map back
const src1 = readFileSync(GUARD, 'utf8')
const s1 = src1.indexOf(open)
const e1 = src1.indexOf(close, s1)
writeFileSync(GUARD, src1.slice(0, s1) + COMMENT + body + src1.slice(e1))
console.log(`re-derived: ${total} occurrence(s) / ${keys.length} key(s)`)
```

## 12. Final state

```
$ node scripts/guards/factory-guard.mjs | grep "slice-6c-fix-6.md"
  note — .scratch/v28/reports/slice-6c-fix-6.md is UNTRACKED: its counts are working-tree content, at no commit
```

No finding for this file. The note is the guard's untracked-file disclosure — the report is written before it
is committed, which is the order the brief prescribes. After committing, the same grep prints nothing at all.

```
$ node scripts/guards/factory-guard.mjs            # exit 0
  note — no-bare-head-count: baseline holds 442 recorded occurrence(s); a new count resolved through bare HEAD is a finding
  note — no-bare-head-count: scanned 124 WORKING-TREE file(s); git tracks 124 under the same paths (0 untracked, 0 tracked-but-absent)
  note — count-provenance: 76 provenance token(s) in the scan, 21 distinct sha(s) resolved with `git cat-file -e <sha>^{commit}` against /home/jmeisburg/orca/workspaces/playdate-app/onboarding — 0 unresolvable
  ok — 5 model(s), 8 task kind(s), 1 work item(s); every floor meetable, every artifact present, every instrument header stating only what it can point at, no report or brief count resolved through bare HEAD beyond the recorded baseline, every count's provenance sha resolving as a commit

PASS — the registry can be trusted and no work item claims evidence it does not have.

$ node scripts/guards/factory-guard.check.mjs      # exit 0
factory-guard check: all 57 checks passed.
$ node scripts/guards/regexp-escape-guard.check.mjs # exit 0
regexp-escape-guard check: all 12 checks passed.
$ bash scripts/guards/run-all.sh                   # exit 0
GUARDS: PASS — all deterministic rules hold.
$ npm run verify                                   # exit 0
 Test Files  71 passed (71)
      Tests  2067 passed (2067)
$ grep -c ': warning ' /tmp/verify6.log
81
$ grep -c ': error ' /tmp/verify6.log
0
  ok — AGENTS.md (1789 words, ceiling 1800)
```

The baseline holds 38 keys for this report's own quotations; they are printed on every run by the note above,
and any *new* occurrence of any of those shapes still fails — proved in §3.1 on a real lane file.

---

# Bounded repair (round 6 review)

**Reviewed:** `.scratch/v28/reports/slice-6c-fix-6-review.md` (the reviewer's verdict was
**NEEDS_CHANGES**, and it ruled the four findings an **implementation** defect inside D-021, not a
specification defect: *"they are token definitions plus the ceiling wording, all inside the artifact D-021
already authorises."* No new ruling was sought and none is needed.)

**Base for this repair:** `ef21f96`. The whole of the round-6 report above is unchanged except for the
ceiling pointer at §8 and this section. Nothing in it is re-litigated; three of its numbers are superseded
by the repair and are named in §R4 below.

## R1 — the four measured shapes, and what happened to each

The reviewer measured these against the committed instrument and proved each with a command. All four are
now **CLOSED** — not declared, not narrowed: the token definitions were widened to the form the header
already wrote down, and each has a behaviour check that goes red when its own anchor is mutated.

| # | Shape (the reviewer's measurement) | Was | Now | Check that proves it |
|---|---|---|---|---|
| **B1** | a dressed count naming a WRONG sha: `The tree held **412** tracked files at <bogus>.`, `412 (tracked) files at <bogus>`, `\| 412 \| tracked files at <bogus> \|` — all PASS, 76 tokens (*not one counted*) | PASS | **FINDING** `count-provenance-unresolvable`, and the run reports **3** provenance tokens | `a dressed count naming a bogus sha is CAUGHT (B1: the decidable half)` + `... and all three dressed counts are COUNTED as provenance tokens, not skipped` |
| **B1′** | the same dress with `at HEAD`: `**412** tracked files at HEAD`, `\| 412 \| tracked files \| at HEAD \|`, `"412" … at HEAD`, `412: … at HEAD` | PASS | **FINDING** `no-bare-head-count` | `a dressed count resolved through bare HEAD is CAUGHT (B1: the detector half)` |
| **B2** | punctuation directly after the sha: `The corpus stands at <bogus>, 276 …`, `… at <bogus>: 276 …`, `The corpus, at <bogus>, held 276 …` — PASS and the token counter did not move | PASS | **FINDING**, and those tokens are **counted** (3) | `a canonical \`at <sha>\` followed by a comma or a colon is CAUGHT when the sha is bogus (B2)` + `... and those tokens are COUNTED` |
| **N1** | a counted git command piped through a filter: `git log --oneline \| grep -c "round 6" \| wc -l`, `git ls-files src \| grep -c "\.ts$" \| wc -l` | PASS | **FINDING** | `a counted git command piped through a filter is CAUGHT (N1: the property, not the spelling)` |
| **N2** | a bare `@{2}` reflog label: `276 tracked files at @{2}` (`git rev-parse @{2}` == `git rev-parse HEAD@{2}`, measured) | PASS | **FINDING** | `a bare \`@{2}\` reflog label is CAUGHT (a moving revision, N2)` |
| **N3** | `resolveRepo()` short-circuits the header's three-step order and the NOTE claims all three were consulted | false NOTE | the NOTE names what happened; a stale `--repo` is reported as the reason | `a stale \`--repo\` is reported as the reason, naming the argument (N3)` + `... and the note no longer claims all three candidates were consulted (N3, control)` |

The reviewer's own words for the seeds, with the bogus sha written `<bogus>`: pasting that 7-hex string
*literally* next to a count makes **this report** a `count-provenance-unresolvable` finding, which is exactly
what B1 says and exactly what the widened rule now does — §R8 pastes the run that caught it. The raw output
below carries the string as the instrument printed it, where it sits in prose rather than in a provenance
token.

Raw, on fresh roots, with the repaired instrument. The bogus sha is written `<bogus>` in every seed,
and in the instrument's own output lines below; the string the run used is the 7-hex `deadbee` named in the
paragraph above. The substitution is of the string only — every verdict, exit code and token count is as the
run printed it — and it is necessary for the same reason §2.3 gives: a bogus sha sitting in a provenance
position makes THIS report a `count-provenance-unresolvable` finding, which is exactly what B1 reports.

```
$ node scripts/guards/factory-guard.mjs --root /tmp/r6seed-xxxx --repo "$PWD"   # seed "The tree held **412** tracked files at <bogus>."
  note — count-provenance: 1 provenance token(s) in the scan, 1 distinct sha(s) … — 1 unresolvable
  FINDING [count-provenance-unresolvable]: .scratch/v28/reports/b1-dress-bogus.md:1: a count's provenance names deadbee, which is not a commit in this repository …                                                                     exit 1
$ … seed "The tree held 412 (tracked) files at <bogus>."          → same FINDING                              exit 1
$ … seed "| 412 | tracked files at <bogus> |"                     → same FINDING                              exit 1
$ … seed "The tree held **412** tracked files at HEAD."           → FINDING [no-bare-head-count] "412** tracked files at HEAD"                exit 1
$ … seed "| 412 | tracked files | at HEAD |"                      → FINDING [no-bare-head-count] "412 | tracked files | at HEAD"              exit 1
$ … seed "The tree held \"412\" tracked files at HEAD."           → FINDING [no-bare-head-count] "412\" tracked files at HEAD"               exit 1
$ … seed "The tree held 412: tracked files at HEAD."              → FINDING [no-bare-head-count] "412: tracked files at HEAD"                 exit 1
$ … seed "The corpus stands at <bogus>, 276 tracked files were counted."   → FINDING [count-provenance-unresolvable] “deadbee …”            exit 1
$ … seed "The corpus stands at <bogus>: 276 tracked files were counted."   → FINDING [count-provenance-unresolvable] “deadbee …”            exit 1
$ … seed "The corpus, at 1c3471a, held 276 tracked files."        → 1 provenance token, 0 unresolvable, PASS                                  exit 0
$ … seed "git log --oneline | grep -c \"round 6\" | wc -l"        → FINDING [no-bare-head-count]                                            exit 1
$ … seed "git ls-files src | grep -c \"\.ts$\" | wc -l"           → FINDING [no-bare-head-count]                                            exit 1
$ … seed "The tree held 276 tracked files at @{2}."               → FINDING [no-bare-head-count] "276 tracked files at @{2}"                 exit 1
```

### What changed, mechanically

```
-MOVING_REV   HEAD(?:~[0-9]*|\^[0-9]*|@\{[^}]*\})?|@(?![{\w])
+MOVING_REV   HEAD(?:~[0-9]*|\^[0-9]*|@\{[^}]*\})?|@
-COUNT_TOKEN  (?<![\d/.\w])\d+(?![/\d])[.,]?(?=\s+[a-zA-Z`])
+COUNT_TOKEN  (?<![\d/.\w])\d+(?![/\d])[^\s\w/]{0,3}(?=\s[^\s]*\s?[a-zA-Z`])
-COUNT_GAP    (?:\s[^\s'"“”]+){0,4}\s+
+COUNT_GAP    [^\s]*?(?:\s[^\s'"“”]+){0,5}\s+
-ARM 3 middle [^\n|`]{0,120}?
+ARM 3 middle [^\n`]{0,160}?
```

- **`COUNT_TOKEN`** now accepts the dress a report puts around a count: up to three attached punctuation
  characters (`**412**`, `"412"`, `` `412` ``, `412:`) and up to two tokens of label between the number and
  its word (`412 (tracked) files`, `| 412 | tracked files`). The label lookahead is kept, so a number that is
  not a quantity (a version fragment, a table cell holding another number) is still not a count.
- **`COUNT_GAP`** now tolerates punctuation attached to the token that precedes it, on either side of the
  connector (`at 1c3471a, 276 files`), and the window is **five** tokens, not four, because a table row puts
  a cell separator between a count and its label (`| 412 | tracked files | at HEAD |`).
- **`MOVING_REV`** drops the `@` lookahead. The end assertion `(?!\w)` is the single mechanism that keeps
  `@` off `user@example.com` and `@decorator`, and the bare shorthand covers `@{2}` as well as `at @`, so the
  separate `@\{[^}]*\}` alternative I first added was unreachable and was removed — an arm that cannot fire
  is the defect shape this rule exists to stop, not something to leave in the diff.
- **ARM 3's middle** crosses pipes. A command piped through a filter names no more revision than one piped
  straight to `wc`, and the arm's stated property is *a counted git command that names no fixed revision*.
- **`MOVING_REV_RE`** is now built from `REV_TOKEN`, so the arm-3 fixed-sha exemption asks the same question
  the arms do ("does this text carry a standalone moving rev?") instead of "does it contain `@` or `HEAD`".
- **`resolveRepo()`** returns `{ repo, why }`; `--repo` is an instruction (a non-worktree `--repo` is
  reported as the reason and the other candidates are *not* substituted silently), and the NOTE prints the
  reason instead of a step-order sentence that was not true.

## R2 — the four LIVE corpus lines the reviewer named

They were absorbed by **re-derivation** (D-011 item 2 — historical records keep their labels), never by
hand-adding a key. Two of them are detector-half instances and now fire; the other two carry a *real* sha in
a dressed count, so what they needed was the sha to be **counted and verified** — and that is what changed
for them:

```
$ node scripts/guards/factory-guard.mjs | grep -E 'slice-6c-fix-2-review.md:226|slice-6c-fix-3-review.md:165'
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-2-review.md:226: … : "3** at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-3-review.md:165: … : "2067** at its HEAD"
```

and the token counter, before → after, for the same corpus:

```
before:  note — count-provenance: 76 provenance token(s) in the scan, 21 distinct sha(s) … 0 unresolvable
after:   note — count-provenance: 100 provenance token(s) in the scan, 23 distinct sha(s) … 0 unresolvable
```

`slice-6c-fix-1-review.md:18` and `briefs/slice-6c-fix-2.md:60` are "**265** at `c2ec32e`/HEAD." — the sha
is `c2ec32e`, a real commit, so those two lines are *counted and verified* rather than flagged: the defect
was that they were invisible to the verification, not that they were wrong.

## R3 — the baseline: re-derived, and no occurrence lost

```
$ node /tmp/derive-baseline.mjs "$PWD"
re-derived: 488 occurrence(s) / 304 key(s)
$ node /tmp/derive-baseline.mjs "$PWD"      # again, once this appended section existed
re-derived: 551 occurrence(s) / 336 key(s)
```

**`442` occurrences / `255` keys → `488` / `304`.** That is the state after the mechanism change. Running the
same derivation again once *this appended section* existed — §R8's own grep output quotes the class, exactly
as §9 of the round-6 report does — took it to **`551` / `336`**, absorbed the same way and never by hand; the
size the run prints is the live one, and both figures are re-derived, not typed. The
re-keying is a consequence of a wider token: a match can now start earlier (`262 @` instead of
`@ c484648 / 23`), so the same occurrence is recorded under a different span. **It is not a coverage loss,
and that was measured rather than asserted** — the two instruments' own regexes were run over the corpus and
the per-line match sets compared:

```
lines with a match — old instrument: 330, new instrument: 369
lines that LOST every match: 0
lines newly matched: 39
```

The 11 re-keyed keys, named (each line still matches; only the span moved):

```
.scratch/v28/briefs/slice-2-verify.md::git rev-parse HEAD                         (x6, the slice-2 family)
.scratch/v28/reports/slice-6c-fix-1-verify.md::@ c484648 / 23
.scratch/v28/reports/slice-6c-fix-1-verify.md::@ c484648, 265 after staging, 23
.scratch/v28/reports/slice-6c-fix-4-review.md::259 at `32e9f48`, 265 at HEAD
.scratch/v28/reports/slice-6c-fix-4-verify.md::265 at HEAD\n265 at HEAD
.scratch/v28/reports/slice-6c-fix-5-review.md::git blame package.json' 'git annotate … | wc
```

**Independent agreement with the run-time counter** (a separate script, the token definitions the header
documents, counted the way the guard counts them — non-overlapping):

```
independent count: 100 provenance token(s), 23 distinct sha(s), 0 unresolvable
run-time counter:  100 provenance token(s) in the scan, 23 distinct sha(s) … 0 unresolvable

(Those two are the corpus before this section existed. Live, with this section's own provenance lines in the
scan, both print **105** tokens / 23 distinct shas / 0 unresolvable — the run's note is the one to read.)
```

## R4 — behaviour checks: 57 → 72, and each new claim has its mutation

```
$ node scripts/guards/factory-guard.check.mjs
factory-guard check: all 72 checks passed.                                        exit 0
```

```
  ✓ a dressed count naming a bogus sha is CAUGHT (B1: the decidable half)
  ✓ ... and all three dressed counts are COUNTED as provenance tokens, not skipped (B1)
  ✓ MUTATION: narrowing the count token back lets that bogus sha PASS (so the check can fail)
  ✓ a dressed count resolved through bare HEAD is CAUGHT (B1: the detector half)
  ✓ a canonical `at <sha>` followed by a comma or a colon is CAUGHT when the sha is bogus (B2)
  ✓ ... and those tokens are COUNTED, so the run does not silently skip them (B2)
  ✓ MUTATION: dropping the attached-punctuation lead lets that bogus sha PASS (so the check can fail)
  ✓ the same parenthetical naming a real commit passes and is counted (control)
  ✓ a counted git command piped through a filter is CAUGHT (N1: the property, not the spelling)
  ✓ MUTATION: restoring the pipe-excluding middle lets that seed PASS (so the check can fail)
  ✓ a bare `@{2}` reflog label is CAUGHT (a moving revision, N2)
  ✓ MUTATION: dropping the `@{…}` alternative lets that seed PASS (so the check can fail)
  ✓ a stale `--repo` is reported as the reason, naming the argument (N3)
  ✓ ... and the note no longer claims all three candidates were consulted (N3, control)
  ✓ with no --repo, the fallback to this instrument's repository is named (control)
  ✓ an email and a @decorator next to a count are NOT flagged (control)
  ✓ MUTATION: dropping the token END assertion turns that control red (so the control CAN fail)
```

Two notes on the checks themselves, because the reviewer measured the previous versions as claims:

- The **`@` control is now reachable by one mutation**. The `@{2}` line moved OUT of the control root and
  into its own seed (it is a moving revision, not a false positive — the reviewer's N2), and the control's
  failure mode is now the token's END assertion, with a seeded `@decorator … in 4 files` line so removing
  the assertion turns the root red.
- The **`MUTATION: narrowing the count token back`** anchor is the guard's own `String.raw` + `BACKTICK`
  concatenation crossing the regex text; `mutatedGuard` asserts the anchor occurs exactly once, so a moved
  anchor is an error rather than a silent no-op.

## R5 — verification, re-measured

```
$ node scripts/guards/factory-guard.mjs      → 1 finding, exit 1   (see §R6 — NOT this slice's)
$ node scripts/guards/factory-guard.check.mjs → all 72 checks passed, exit 0
$ node scripts/guards/regexp-escape-guard.check.mjs → all 12 checks passed, exit 0
$ bash scripts/guards/run-all.sh             → GUARDS: FAIL — 1 guard(s) reported findings: - factory-guard
$ npm run verify                             → VERIFY EXIT 1
```

`npm run verify` reaches the guards step green everywhere else, and every number is unchanged from round 6:

| Measure | Round 6 | This repair | Delta |
|---|---|---|---|
| test files | 71 | **71** | 0 |
| tests | 2067 | **2067** | 0 |
| oxlint warnings (`: warning `) | 81 | **81** | 0 |
| oxlint errors (`: error `) | 0 | **0** | 0 |
| `AGENTS.md` words / ceiling | 1789/1800 | **1789/1800** | 0 |

The deltas are zero because this repair touches `scripts/guards/*.mjs` and this report only: no `src/`, no
`e2e/`, no `*.test.mjs`. **The one non-zero is the exit code**, and its cause is §R6.

## R6 — the red that was NOT this slice's (resolved: the orchestrator's missing copy)

**RESOLVED — and it was the orchestrator's omission, caught by this rule doing its job.** The red below was
real when it was written and it is kept for the record: `artifacts-exist` fired because
`factory/work/v28-r2-6c.json` named `.scratch/v28/reports/slice-6c-fix-6-review.md`, which lived only in the
lane's artifacts directory. The orchestrator's commit `6fbc2ad` updated the work state naming that artifact
WITHOUT performing the evidence-persistence copy it had performed for rounds 1-5. It has now copied both
round-6 lane reports into `.scratch/v28/reports/` verbatim (`slice-6c-fix-6-review.md`, 368 lines;
`slice-6c-fix-6-verify.md`, 447 lines), the finding is gone, and the growth it caused is **expected and is
not this slice's error** — the two reports quote the class on nearly every line, including the probe seeds.
I did not copy them myself and did not silence the rule: the builder's job is to name the cause, and the
rule's job is to have one. The raw measurement is kept here because the finding was real.

`factory-guard.mjs` exits 1 with exactly one finding, and it is the orchestrator's own state file naming
another lane's artifact:

```
  FINDING [artifacts-exist]: v28-r2-6c.json: lane 'review' names artifact '.scratch/v28/reports/slice-6c-fix-6-review.md', which is not on disk

FAIL — 1 factory finding(s).
```

It is **pre-existing on this branch, not caused by, and not fixable inside, this slice** — measured against
the committed instrument at `ef21f96` (the tree this repair started from, before any edit of mine):

```
$ git show HEAD:scripts/guards/factory-guard.mjs > /tmp/guard-ef21f96.mjs
$ node /tmp/guard-ef21f96.mjs --root "$PWD"
  FINDING [artifacts-exist]: v28-r2-6c.json: lane 'review' names artifact '.scratch/v28/reports/slice-6c-fix-6-review.md', which is not on disk

FAIL — 1 factory finding(s).
```

`factory/work/v28-r2-6c.json` is the orchestrator's work state, and the missing file is the round-6
reviewer's report, which lives in the lane's artifacts directory (`~/.pi/agent/sessions/…/subagent-artifacts/
outputs/e6ac2432-…/.scratch/v28/reports/slice-6c-fix-6-review.md`) and has not been copied into the repo.
Both halves of the fix — copying the report in, or amending the work item — are the orchestrator's to make;
manufacturing another lane's artifact, or hand-editing the work state to silence the rule, is not something
this slice may do. **Every rule of this instrument is green**; the only finding is that one, and it is
reported here rather than worked around. It was sent to the supervisor as a blocking decision.

## R7 — the ceiling, re-stated so this report and the guard header agree

The guard header now carries a **REPAIRED BY THE ROUND-6 REVIEW'S BOUNDED REPAIR** block naming the four
shapes above as closed with their checks, and the round-6 ceiling list at §8 is unchanged for everything
else. Corrected by this section, and superseded: §4's and §12's `442 / 255` (now `551 / 336`, re-derived), and
§8's list, which did not name the four shapes — it does now, in the header, as closed.

What remains a declared ceiling, unchanged:

- **A resolvable but WRONG commit** — `… at 1c3471a` passes when `1c3471a` is *a* commit. Verification closes
  existence and commit-ness, not identity; D-021 prescribes exactly `git cat-file -e <sha>^{commit}`.
- **A count whose provenance is implied and not written** (`2067 passed (2067)`).
- **A sha provenance written without the `at` connector** (`… from 1c3471a`) — the connector is what keeps a
  `->`-separated content-hash table out of the rule.
- **A provenance token that is neither a moving rev nor a sha** (`… at latest`, `… at 71bdd5`).
- **`<HEAD>`, `MERGE_HEAD`-style refs, a bare `@` inside a word** — the token boundaries, behaviour-checked.
- **Other moving refs** (branch names, tags, `refs/heads/*`).
- **ARM 1's proximity window**, now five tokens, with the dress window on the count: a lexical rule's
  precision cost, declared and measured (39 newly matched lines, absorbed by re-derivation).
- **ARM 3 does not tell a template from a measurement** (`git ls-tree -r --name-only <c> .scratch | wc -l`).
- **Filesystem counts** (`ls | wc -l`) and **files outside `.scratch/v28/{reports,briefs}/*.md`**.

## R8 — grepping this section with the widened rule

The widened rule run against this report, before the re-derivation that absorbs it — pasted whether or not
it is empty, as the brief requires. After the last re-derivation the same grep prints **nothing** for this
file (measured, §R3), so the round-6 report joins every other lane record in the baseline rather than being
exempted from the rule.

```
```
$ node scripts/guards/factory-guard.mjs | grep "slice-6c-fix-6.md"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:610: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "412** tracked files at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:610: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "412 \\| tracked files \\| at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:610: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "412\" … at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:610: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "412: … at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:612: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git log --oneline \\| grep -c \"round 6\" \\| wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:612: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git ls-files src \\| grep -c \"\\.ts$\" \\| wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:613: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "276 tracked files at @"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:613: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "2}` (`git rev-parse @"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:613: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "2}` == `git rev-parse HEAD@{2}"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:634: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "412** tracked files at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:634: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "412** tracked files at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:635: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "412 | tracked files | at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:635: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "412 | tracked files | at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:636: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "412\\\" tracked files at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:636: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "412\\\" tracked files at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:637: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "412: tracked files at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:637: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "412: tracked files at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:641: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git log --oneline | grep -c \\\"round 6\\\" | wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:642: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git ls-files src | grep -c \\\"\\.ts$\\\" | wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:643: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "276 tracked files at @"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:643: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "276 tracked files at @"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:665: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "412 | tracked files | at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:667: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "2}` as well as `at @"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:687: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "3** at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:688: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "2067** at its HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:710: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "262 @"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:711: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "@ c484648 / 23`),"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:724: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git rev-parse HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:726: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "@ c484648, 265"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:727: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "259 at `32e9f48`, 265 at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:728: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "265 at HEAD\\n265 at HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:729: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git blame package.json' 'git annotate … | wc"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:815: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git show HEAD"
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-6.md:849: a count is resolved through bare HEAD and cannot be reproduced — name the commit it was measured at: "git ls-tree -r --name-only <c> .scratch | wc"
```
```

## R9 — the two lane reports: the absorber, and the property it narrows

The orchestrator copied the round-6 review and verify reports into `.scratch/v28/reports/` (the
evidence-persistence step for rounds 1-5 that `6fbc2ad` skipped). They are other lanes' historical records and
they quote the class on nearly every line — so the re-derivation absorbed the detector half, and the
**decidable** half produced two findings that re-derivation could not absorb, because round 6 deliberately
left SHA findings out of the baseline:

```
$ node scripts/guards/factory-guard.mjs
  FINDING [count-provenance-unresolvable]: .scratch/v28/reports/slice-6c-fix-6-review.md:109: a count's provenance names <bogus>, which is not a commit in this repository … — name a commit a reader can resolve
  FINDING [count-provenance-unresolvable]: .scratch/v28/reports/slice-6c-fix-6-verify.md:223: a count's provenance names <bogus>, which is not a commit in this repository … — name a commit a reader can resolve
```

Both lines are the lane QUOTING a probe seed — `"The tree held **412** tracked files at <bogus>."  PASS`,
`$ printf '… at <bogus>.\n' > …/zz-bogus.md` — written down precisely to show that the rule fires on them.
The rule firing is *correct*: the sentence does claim a count's provenance is `deadbee`. What makes them
different from a violation is the **use/mention distinction**: the class is a report **using** a bogus sha as
its own provenance; these are a report **mentioning** one to demonstrate the rule. The HEAD half already
absorbs exactly this case, and the human ruled the mechanic himself — `factory/decisions.md` D-021 item 2,
verbatim: *"all in lane reports that discuss the class and therefore quote it … absorbed by a re-derivation,
never by hand-adding a key."* A permanently red gate over ten quotation lines would teach the next reader that
red is normal, which is the failure this whole batch exists to prevent.

**The ruling, and how it is bounded: the absorber exists ONLY for historical quotations.** `UNRESOLVABLE_SHA_
BASELINE` records them, keyed `file::sha` **with a count**, re-derived (never typed), and the run prints the
size on every run.

```
$ node /tmp/derive-baseline.mjs "$PWD"
re-derived: no-bare-head-count 617 occurrence(s) / 395 key(s); unresolvable-sha 10 record(s) / 2 key(s)
  sha record: .scratch/v28/reports/slice-6c-fix-6-review.md::deadbee x9
  sha record: .scratch/v28/reports/slice-6c-fix-6-verify.md::deadbee x1
```

`10` records across `2` keys — not `2`, because the review report quotes the seed nine times. The count is
load-bearing, which the proofs below are the point of.

**One reconciliation with D-023, which says "the printed counter reads 2."** It reads **10** — because it
counts OCCURRENCES across 2 keys, exactly as the detector arm's baseline counts its own occurrences across
its own keys,
and the review report quotes the seed nine times (compare the other arm, whose recorded occurrences are
counted the same way). Counting occurrences is what makes the per-file count
load-bearing (proof 2 above: a tenth occurrence in that file fails while the nine recorded ones pass); a
per-file boolean would let a report add quotations indefinitely. If D-023's "2" was meant as the key count,
nothing is wrong and the note above it says "10 recorded … record(s) … 2 keys" would be clearer — say the word
and I will reword the note rather than the mechanism.

### The property NARROWS, and it is named in three places

**"Never a broken sha" became "never a NEW broken sha."** The round-6 report claimed the strong form and the
round-6 reviewer validated it ("A bogus sha **is** a finding, it is **not** in the baseline"). That sentence is
now false as stated, so it is corrected where it lives: the guard header (a `THE PROPERTY IS "NEVER A NEW
BROKEN SHA"` paragraph that says who narrowed it, when, and why), §R7 below, the per-rule header bullet
("NEVER A NEW BROKEN SHA: a historical lane record that QUOTES a probe seed is absorbed by re-derivation"),
and the run's own summary line, which now reads:

```
  ok — 5 model(s), 8 task kind(s), 1 work item(s); every floor meetable, every artifact present, every
  instrument header stating only what it can point at, no report or brief count resolved through bare HEAD
  beyond the recorded baseline, no count's provenance sha unresolvable beyond the recorded records
```

and the run prints the absorber's size, and whether it applied to this scan at all:

```
  note — count-provenance: 10 recorded unresolvable-sha record(s) absorbed (historical lane records that QUOTE
  a probe seed, by re-derivation); a NEW unresolvable sha, or a second occurrence of a recorded one in the
  same file, is a finding
  note — count-provenance: … a NEW unresolvable sha, or a second occurrence of a recorded one in the same
  file, is a finding — 0 of the 10 matched this scan        (a throwaway root: the absorber did NOT apply)
```

### The mandatory proofs — the absorber cannot swallow a violation

All six were run with the repository's own reports present in the root, so the baseline is live and a `PASS`
means something. Raw:

**(1) a NEW unresolvable sha in a FRESH file → FINDING, exit 1**

```
$ printf 'The tree held 276 tracked files at <bogus-2>.\n' > <root>/.scratch/v28/reports/zz-fresh.md
$ node scripts/guards/factory-guard.mjs --root <root> --repo "$PWD"
  note — count-provenance: 128 provenance token(s) … 26 distinct sha(s) … 11 unresolvable
  FINDING [count-provenance-unresolvable]: .scratch/v28/reports/zz-fresh.md:1: a count's provenance names <bogus-2>, which is not a commit in this repository …                                                                              exit 1
```

**(2) a SECOND occurrence of a recorded sha in the SAME file → FINDING (the count is load-bearing)**

```
$ printf 'The tree held 276 tracked files at <bogus>.\n' >> <root>/.scratch/v28/reports/slice-6c-fix-6-verify.md   # recorded x1
$ node scripts/guards/factory-guard.mjs --root <root> --repo "$PWD"
  FINDING [count-provenance-unresolvable]: .scratch/v28/reports/slice-6c-fix-6-verify.md:448: … names <bogus> …                                                                                                                            exit 1

$ printf 'A tenth: 276 tracked files at <bogus>.\n' >> <root>/.scratch/v28/reports/slice-6c-fix-6-review.md      # recorded x9
$ node scripts/guards/factory-guard.mjs --root <root> --repo "$PWD"
  FINDING [count-provenance-unresolvable]: .scratch/v28/reports/slice-6c-fix-6-review.md:369: … names <bogus> …
  FINDING [count-provenance-unresolvable]: .scratch/v28/reports/slice-6c-fix-6-verify.md:448: … names <bogus> …                                                                                                                             exit 1
```

Nine recorded occurrences still pass; the tenth fails. That is the whole bounded-ness of the absorber.

**(3) the B1 dressed-count seed → FINDING, with the absorber in place**

```
$ … seed "The tree held **412** tracked files at <bogus>."                 → FINDING [count-provenance-unresolvable]  exit 1
$ … seed "The tree held 412 (tracked) files at <bogus>."                  → FINDING …                                exit 1
$ … seed "| 412 | tracked files at <bogus> |"                             → FINDING …                                exit 1
```

**(4) the B2 seed → FINDING**

```
$ … seed "The corpus stands at <bogus>, 276 tracked files were counted."  → FINDING [count-provenance-unresolvable]  exit 1
$ … seed "The corpus stands at <bogus>: 276 tracked files were counted."  → FINDING …                                exit 1
```

**(5) all 72 checks still exit 0 and their mutation proofs still flip** — including the two the round-6
review named, because a check whose seed the absorber now eats would be the trap:

```
  ✓ a dressed count naming a bogus sha is CAUGHT (B1: the decidable half)
  ✓ MUTATION: narrowing the count token back lets that bogus sha PASS (so the check can fail)
  ✓ a dressed count resolved through bare HEAD is CAUGHT (B1: the detector half)
  ✓ a canonical `at <sha>` followed by a comma or a colon is CAUGHT when the sha is bogus (B2)
  ✓ MUTATION: dropping the attached-punctuation lead lets that bogus sha PASS (so the check can fail)
  ✓ a counted git command piped through a filter is CAUGHT (N1: the property, not the spelling)
  ✓ a bare `@{2}` reflog label is CAUGHT (a moving revision, N2)
factory-guard check: all 72 checks passed.                                          exit 0
```

The check roots are throwaway directories with no baseline files, so the absorber cannot reach their seeds —
and the run says so (`0 of the 10 matched this scan`).

**(6) the printed counter reads 10 across 2 keys**, and the `ok —` claim is reworded as above.

**(7) no matched line was lost across the widening** — re-measured after the absorber, both instruments'
regexes over the corpus (now 126 files):

```
lines with a match — old instrument: 388, new instrument: 482
lines that LOST every match: 0
lines newly matched: 94
```

### The baseline, final

| | round 6 | after the repair | after the two lane reports |
|---|---|---|---|
| no-bare-head-count baseline | 442 / 255 | 488 / 304 | **617 occurrences / 395 keys** |
| unresolvable-sha records | — (none possible) | — | **10 occurrences / 2 keys** |
| provenance tokens in the scan | 76 / 21 | 100 / 23 | **127 / 25** |

Every figure is re-derived from the instrument's own matches; nothing was typed, and neither lane report was
edited.

## R10 — final state, end to end

```
$ node scripts/guards/factory-guard.mjs                 # exit 0
  note — no-bare-head-count: baseline holds 617 recorded occurrence(s); a new count resolved through bare HEAD is a finding
  note — no-bare-head-count: scanned 126 WORKING-TREE file(s); git tracks 126 under the same paths (0 untracked, 0 tracked-but-absent)
  note — count-provenance: 127 provenance token(s) in the scan, 25 distinct sha(s) resolved with `git cat-file -e <sha>^{commit}` against /home/jmeisburg/orca/workspaces/playdate-app/onboarding (the scan root) — 10 unresolvable
  note — count-provenance: 10 recorded unresolvable-sha record(s) absorbed (historical lane records that QUOTE a probe seed, by re-derivation); a NEW unresolvable sha, or a second occurrence of a recorded one in the same file, is a finding
  ok — 5 model(s), 8 task kind(s), 1 work item(s); every floor meetable, every artifact present, every instrument header stating only what it can point at, no report or brief count resolved through bare HEAD beyond the recorded baseline, no count's provenance sha unresolvable beyond the recorded records

PASS — the registry can be trusted and no work item claims evidence it does not have.

$ node scripts/guards/factory-guard.check.mjs            # exit 0
factory-guard check: all 72 checks passed.
$ node scripts/guards/regexp-escape-guard.check.mjs      # exit 0
regexp-escape-guard check: all 12 checks passed.
$ bash scripts/guards/run-all.sh                         # exit 0
GUARDS: PASS — all deterministic rules hold.
$ npm run verify                                         # exit 0
 Test Files  71 passed (71)
      Tests  2067 passed (2067)
$ grep -c ': warning ' /tmp/verify7c.log
81
$ grep -c ': error ' /tmp/verify7c.log
0
  ok — AGENTS.md (1789 words, ceiling 1800)
```

| Measure | Round 6 | This repair | Delta |
|---|---|---|---|
| test files | 71 | **71** | 0 |
| tests | 2067 | **2067** | 0 |
| oxlint warnings (`: warning `) | 81 | **81** | 0 |
| oxlint errors (`: error `) | 0 | **0** | 0 |
| `AGENTS.md` words / ceiling | 1789/1800 | **1789/1800** | 0 |
| `factory-guard.mjs` | exit 1 (98→100 findings at the base) | **exit 0, PASS** | — |
| `run-all.sh` | — | **GUARDS: PASS** | — |

Every delta is zero: this repair touches `scripts/guards/*.mjs` and this report, and the two lane reports the
orchestrator copied in. No `src/`, no `e2e/`, no `*.test.mjs`.

## R11 — grepping this section too

```
```
$ node scripts/guards/factory-guard.mjs | grep "slice-6c-fix-6.md"
```

Empty: this report is inside the recorded baseline (617 occurrences / 395 keys) and its probe quotations
render the sha as `<bogus>`, so the widened rule has nothing left to say about it. §R8 above is the run that
caught it *before* the re-derivation that absorbed it — the same two-step every lane record went through.
```
