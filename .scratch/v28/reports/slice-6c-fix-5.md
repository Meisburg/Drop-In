# Slice 6c — FIX ROUND 5 (V28 r2) — the LADDER'S LAST ROUND

**Brief:** `.scratch/v28/briefs/slice-6c-fix-5.md` (authoritative for this round), plus the orchestrator's
mid-run STEER ("do not add another narrow pattern — cover the CLASS").
**Base:** the brief names `824f419`; the working tree this round actually started from is `e3f163d`, and the
orchestrator moved HEAD under the round (`ec47f15` → `f25d819` → `001ec5c`). Every measurement below names the
commit it was taken against.
**Round 4:** builder `876a516`; verifier PASS; reviewer NEEDS_CHANGES. **This report was written before the
commit and appended to as evidence was produced.**

**Machine state, not a finding.** Routed to cloud. The local `strata-max` worker is PARKED (49.2 GB private,
D-012). No inference server was started or stopped.

**Rendering convention (the one round 4 broke).** Everywhere below, the literal token `HEAD` inside a number
label or a git command is written **`<HEAD>`**, and where a commit is known it is named. The seed files on
disk carried the literal; rendering it is exactly what keeps this report from tripping the rule it documents.
The guard is then run over this report at the end, with the output pasted — empty or not.

---

## The one-read comparison (invariant / rule / class / misses)

The orchestrator's STEER asks for this in one read, because round 6 only happens if review finds a *new*
shape of this same class.

**The invariant it encodes.** *A count in a report or brief must be attributable to a fixed commit. A count
whose provenance is a MOVING revision (bare `HEAD`, `@`, a branch/tag, or `HEAD~n`) is unreproducible by
construction: the commit that carries the sentence is the one that moves `HEAD`.*

**The detection rule (what the instrument actually does).** For every line of `.scratch/v28/reports/*.md` and
`.scratch/v28/briefs/*.md`, one scan over three structural arms — matched by the *shape of the reference*, not
by the six command strings that happened to fail a review:

| arm | shape | matched by |
|---|---|---|
| 1 | a count **labelled** at a moving ref — `N … at <HEAD>`, `… at <HEAD>~1`, `… at @`, `… at the working tree` | a number, ≤4 lowercase words, `at (the )?` + moving ref |
| 2 | a `git` read whose **revision** is a moving ref, any subcommand — `git ls-tree … <HEAD>`, `git show <HEAD>:p`, `git rev-parse <HEAD>`, `git diff <HEAD>`, `git cat-file -p <HEAD>:p` | `git <subcmd> … <moving ref>` |
| 3 | a **counted** `git` command that defaults to `<HEAD>` with no revision named — a `git log` / `git rev-list` style command piped to a word count | a `<HEAD>`-defaulting subcommand followed by a pipe to `wc`, with no fixed sha in the command |

`factory/config.json` D-011 item 2 still binds: historical occurrences keep their bytes and are absorbed by the
baseline; only an occurrence **beyond** the recorded baseline fails. The run prints the baseline's size.

**The class it claims to cover.** "A count whose provenance is a moving revision." The three arms are the
class's *reporting* shape (a label), its *named-reference* shape (a git command that spells the moving ref),
and its *defaulted-reference* shape (a git command that resolves to `HEAD`/the worktree by saying nothing).

**What it still cannot see — the exact shapes, named:**

1. **Other moving refs**: a branch name (`main`), a tag, `ORIG_HEAD`, `MERGE_HEAD`, `FETCH_HEAD`,
   `REBASE_HEAD`, `refs/heads/*`, `refs/remotes/*`. They move on a push/fetch exactly as `HEAD` moves on a
   commit, but they are indistinguishable from ordinary prose, so they are deliberately not matched.
2. **A count with no provenance at all**: `2067 passed (2067)` names no commit and no `HEAD`, and the
   instrument cannot tell whether it was measured at a commit or in the working tree. It is silent on it —
   which is why the `ok —` summary no longer claims the opposite (F3).
3. **A wrong named commit**: `… at 71bdd55` passes whether or not `71bdd55` is the tree measured. Naming a
   commit is necessary, not sufficient.
4. **Filesystem counts**: `ls | wc -l`, `wc -l < file`. They read the *working tree*, which is at no commit,
   but they are also the guard's own basis, and forbidding them would forbid every verify run. Not flagged.
5. **Files outside SCOPE**: `.scratch/v28/ledger.md:7091` (recorded known-open in `factory/decisions.md`
   D-018), `plan.md`, older V28 lanes, and every non-`.md` extension.
6. **Working-tree git counts** (added in the Bounded repair, from the orchestrator's measurement):
   `git status --porcelain | wc -l`. `git status` reads the working tree/index, not `HEAD`, so it is not arm 3
   (whose list is commands that resolve `HEAD` by default) and it is **not flagged**. It is named on its own
   rather than folded into item 4: the same classification-not-enforcement applies to `git ls-files | wc -l`,
   `git diff | wc -l`, and `git grep | wc`. The human's "HEAD versus working tree" half is a *classification*
   the instrument can make, not an *enforcement* it performs.

This is a DETECTOR over the class's shapes, not a proof that no other shape exists.

---

## Per-finding table

| # | Finding | Verdict | Change | Command that proves it | Raw result |
|---|---|---|---|---|---|
| **B1 (BLOCKING)** | `.scratch/v28/reports/slice-6c-fix-4.md:57-58` a fresh bare-`<HEAD>` count (`280`); `:29` a `git show <HEAD>:` read; `:15` asserts no number is labelled; `:4` wrong attribution | FIXED | `:4` now names the round's starting HEAD `99d044f`; `:57` and `:29` name `99d044f` instead of `<HEAD>`; `:15` is now true | `git ls-tree -r --name-only <c> .scratch \| wc -l` at `9f20d02`/`99d044f`/`876a516`; `git show 99d044f:scripts/guards/factory-guard.mjs \| grep -c instrument-headers-honest` | `280`/`280`/`281`; `0` (the pre-fix guard) |
| **F1** | the pattern matched examples, not the class (`<HEAD> .scratch`, `git show <HEAD>:`) | FIXED | `no-bare-head-count` widened to one scan over three structural arms; baseline re-derived from the widened instrument's real matches | `node scripts/guards/factory-guard.mjs` on a `/tmp` root seeded with both shapes, old guard vs new | old guard: `0` findings, exit `0`; new guard: `2` findings, exit `1` |
| **F2** | `factory-guard.mjs:395` `.exec()` counted at most ONE match per line | FIXED | `line.matchAll(BARE_HEAD_COUNT)` counts every match; baseline counts moved where a line carries two (`slice-6c-fix-2-review.md:245`, `slice-6c-fix-3-review.md:177`) | `/tmp` root with 5 on disk, two on one line, old guard vs new | old guard: `0` findings, exit `0`; new guard: `1` finding, exit `1` |
| **F3** | `:432` `ok —` claim states more than the check does; same over-broad phrasing at `:47-48` | FIXED | both now read `no report or brief count resolved through bare HEAD beyond the recorded baseline` | `node scripts/guards/factory-guard.mjs \| grep 'ok —'` | claim ends `… no report or brief count resolved through bare HEAD beyond the recorded baseline` |
| **F4** | header has no SCOPE block (`code-structure.md:121-127`) | FIXED | added a `SCOPE —` block naming every directory + extension read and what is therefore not counted | `sed -n '/^\/\/ SCOPE/,/^\/\/   is not seen/p' scripts/guards/factory-guard.mjs` | present; see "The SCOPE block" |
| **F5** | `.scratch/v28/reports/slice-6c-fix-4.md:306` names `.scratch/v28/plan.md`, which does not exist | FIXED | path corrected to `plan.md` (repo root) | `ls plan.md .scratch/v28/plan.md` | `plan.md` exists; `.scratch/v28/plan.md` → `No such file or directory` |
| **D1** | the ledger exclusion lives only in a `ladder:` bullet | FIXED | `factory/decisions.md` **D-018** records `.scratch/v28/ledger.md:7091` as known-open with `file:line`; `ledger.md` itself untouched (D-002) | `git diff factory/decisions.md`; `sed -n '7091p' .scratch/v28/ledger.md` | D-018 added; ledger line reads `259 at 32e9f48, 265 at <HEAD> — …` (unchanged) |

`Nothing was rejected outright.`

### B1 — the measurements, raw

```
$ for c in 9f20d02 99d044f 876a516; do printf "%s %s\n" "$c" "$(git ls-tree -r --name-only $c .scratch | wc -l)"; done
9f20d02 280
99d044f 280
876a516 281
$ git show 99d044f:scripts/guards/factory-guard.mjs | grep -c instrument-headers-honest
0
```

`280` holds at `9f20d02` **and** `99d044f`, so naming `99d044f` makes `:57-58` reproducible and the `280` in the
raw tail keeps its measured value. `99d044f` is the tree HEAD when round 4 started — the commit before the
builder's `876a516` — which is exactly the commit `:29`'s "before" guard must resolve to (it returns `0`, the
pre-N1-fix guard; `876a516`'s returns `1`, the fixed one). After the edit the four sites read:

```
$ sed -n '4p;29p;57p;58p;307p' .scratch/v28/reports/slice-6c-fix-4.md
**Base:** `7fe7003`; the brief itself was committed at `9f20d02`, and the tree HEAD when this round started was `99d044f`.
| **N1** | `factory-guard.mjs:315`: … | before (`git show 99d044f:scripts/guards/factory-guard.mjs`): `grep -c instrument-headers-honest` → `0`. After: `1`, finding at `zz-blank.mjs:4`. |
$ git ls-tree -r --name-only 99d044f .scratch | wc -l
280
   `.scratch/v28/ledger.md`, `plan.md`, or an older-version lane is not scanned. The brief named
```

With `:29` and `:57` naming `99d044f`, `:15`'s claim — "**no number is labelled `HEAD`**" — is now true. The one
`<HEAD>`-shaped line left in `slice-6c-fix-4.md` is `:180`, a raw tail quoting the committed guard for the N1
proof; it is a *read*, not a labelled number, so `:15` is still true, and it is baselined (D-011 item 2). Named
under "Noticed and NOT fixed".

---

## The widened rule (F1 + F2) — pattern, baseline, ceilings, checks

### The pattern

```js
const MOVING_REV = String.raw`HEAD(?:~[0-9]*|\^[0-9]*|@\{[^}]*\})?|@(?![{\w])`
const FIXED_SHA = /\b[0-9a-f]{7,40}\b/

// arm 1 — a count LABELLED at a moving ref
const BARE_HEAD_COUNT_AT = new RegExp(
  String.raw`(?<![\d/.\w])\d+(?![/\d])\s+(?:[a-z` + '`' + String.raw`][\w` + '`' + String.raw`.-]*\s+){0,4}\bat (?:the )?(?:${MOVING_REV}|working (?:tree|copy|directory))\b`,
  'g',
)
// arm 2 — a git read whose REVISION is a moving ref, ANY subcommand
const BARE_HEAD_COUNT_CMD = new RegExp(String.raw`\bgit\s+[a-z][a-z-]*[^\n|` + '`' + String.raw`]*?\s(?:${MOVING_REV})\b`, 'g')
// arm 3 — a COUNTED git command that defaults to <HEAD> with no revision named
const BARE_HEAD_COUNT_WC = /\bgit\s+(?:log|rev-list|shortlog|whatchanged|cherry|stash|branch|describe)\b[^|\n]*\|\s*wc\b/g

// one scan over all three arms, every match on the line
const BARE_HEAD_COUNT = new RegExp([BARE_HEAD_COUNT_AT.source, BARE_HEAD_COUNT_CMD.source, BARE_HEAD_COUNT_WC.source].join('|'), 'g')
```

The change from round 4 is structural, not a longer list: arm 2 matches **any** git subcommand whose argument
is a moving ref (`git show`, `git rev-parse`, `git diff`, `git archive`, `git cat-file`, `git ls-tree`, …), and
arm 1 accepts **any** moving-ref spelling, not the single token `HEAD`. Arm 3 is new: a count taken from a
command that resolves `HEAD` by *saying nothing* (a `git log`-style command piped to a
word count), which is the "HEAD-dependent output
without naming a commit" the STEER named; it requires a `| wc` so it stays a count rule and does not fire on
ordinary prose commands.

### The baseline — re-derived, not edited

Derived by running the instrument itself with an empty baseline and parsing its **87 findings**, then pasting
the result. Nothing was typed to make a run green. Printed size at run time:

```
  note — no-bare-head-count: baseline holds 87 recorded occurrence(s); a new count resolved through bare HEAD is a finding
```

**`23` occurrences / `13` keys → `87` occurrences / `47` keys.** The brief and D-011 item 2 said it would grow;
that is honest. The growth is `+34` keys, all of them **historical records of other lanes or of the
orchestrator**, absorbed not rewritten.

**The F2 delta, measured:** two live lines carry two matches each, and only those two counts move —
`.scratch/v28/reports/slice-6c-fix-2-review.md :: 271 at <HEAD>` `1 → 2` (line 245 previously reported only its
first match, `265 at <HEAD>`) and `.scratch/v28/reports/slice-6c-fix-3-review.md :: 265 at <HEAD>` `1 → 2`
(line 177 carries the token twice). Every other round-4 key keeps its recorded count exactly; the widened arms
add keys but change no existing one.

Key set (the literal `HEAD` token rendered `<HEAD>`; the guard's Map holds the literal):

```
.scratch/v28/briefs/slice-1-verify.md::git rev-parse <HEAD>                                      1
.scratch/v28/briefs/slice-2-verify.md::git rev-parse <HEAD>                                      1
.scratch/v28/briefs/slice-2a-verify.md::git rev-parse <HEAD>                                     1
.scratch/v28/briefs/slice-2b-verify.md::git rev-parse <HEAD>                                     1
.scratch/v28/briefs/slice-2c-verify.md::git rev-parse <HEAD>                                     1
.scratch/v28/briefs/slice-3a-verify.md::git rev-parse <HEAD>                                     1
.scratch/v28/briefs/slice-3b-verify.md::git rev-parse <HEAD>                                     1
.scratch/v28/briefs/slice-3c-verify.md::git rev-parse <HEAD>                                     1
.scratch/v28/briefs/slice-4a-verify.md::git rev-parse <HEAD>                                     1
.scratch/v28/briefs/slice-4b-verify.md::git rev-parse <HEAD>                                     1
.scratch/v28/briefs/slice-4c-verify.md::git rev-parse <HEAD>                                     1
.scratch/v28/briefs/slice-6c-fix-2.md::265 at <HEAD>                                             1
.scratch/v28/briefs/slice-6c-fix-3.md::265 at <HEAD>                                             2
.scratch/v28/briefs/slice-6c-fix-4.md::265 at <HEAD>                                             1
.scratch/v28/briefs/slice-6c-fix-5.md::265 at <HEAD>                                             2
.scratch/v28/briefs/slice-6c-fix-5.md::git ls-tree -r --name-only <HEAD>                         2
.scratch/v28/briefs/slice-6c-fix-5.md::git ls-tree … <HEAD>                                      1
.scratch/v28/briefs/slice-6c-fix-5.md::git show <HEAD>                                           5
.scratch/v28/reports/slice-6b-fix-1.md::git show <HEAD>                                          1
.scratch/v28/reports/slice-6c-fix-1-review.md::265 at <HEAD>                                     4
.scratch/v28/reports/slice-6c-fix-1-verify.md::265 at <HEAD>                                     1
.scratch/v28/reports/slice-6c-fix-1-verify.md::git ls-tree -r --name-only <HEAD>                 2
.scratch/v28/reports/slice-6c-fix-1-verify.md::git rev-parse <HEAD>                              3
.scratch/v28/reports/slice-6c-fix-1-verify.md::git show --name-only --format="%H" <HEAD>         1
.scratch/v28/reports/slice-6c-fix-1-verify.md::git show --stat <HEAD>                            1
.scratch/v28/reports/slice-6c-fix-1.md::git show <HEAD>                                          2
.scratch/v28/reports/slice-6c-fix-2-review.md::265 at <HEAD>                                     4
.scratch/v28/reports/slice-6c-fix-2-review.md::271 at <HEAD>                                     2
.scratch/v28/reports/slice-6c-fix-2-review.md::439 at <HEAD>                                     1
.scratch/v28/reports/slice-6c-fix-2-review.md::git ls-tree -r --name-only <HEAD>                 1
.scratch/v28/reports/slice-6c-fix-2-verify.md::265 at <HEAD>                                     3
.scratch/v28/reports/slice-6c-fix-2-verify.md::git rev-parse --short <HEAD>                      1
.scratch/v28/reports/slice-6c-fix-3-review.md::265 at <HEAD>                                     2
.scratch/v28/reports/slice-6c-fix-3-review.md::276 tracked `.scratch` files at <HEAD>            1
.scratch/v28/reports/slice-6c-fix-3-verify.md::265 at <HEAD>                                     1
.scratch/v28/reports/slice-6c-fix-3-verify.md::git archive <HEAD>                                1
.scratch/v28/reports/slice-6c-fix-3-verify.md::git ls-tree -r --name-only <HEAD>                 1
.scratch/v28/reports/slice-6c-fix-3-verify.md::git rev-parse <HEAD>                              1
.scratch/v28/reports/slice-6c-fix-3.md::265 at <HEAD>                                            2
.scratch/v28/reports/slice-6c-fix-3.md::git rev-parse <HEAD>                                     1
.scratch/v28/reports/slice-6c-fix-4-review.md::265 at <HEAD>                                     5
.scratch/v28/reports/slice-6c-fix-4-review.md::git ls-tree -r --name-only <HEAD>                 3
.scratch/v28/reports/slice-6c-fix-4-review.md::git show <HEAD>                                   4
.scratch/v28/reports/slice-6c-fix-4-verify.md::265 at <HEAD>                                     6
.scratch/v28/reports/slice-6c-fix-4-verify.md::412 tracked files at <HEAD>                       2
.scratch/v28/reports/slice-6c-fix-4.md::git show <HEAD>                                          1
.scratch/v28/reports/slice-6c.md::git show <HEAD>                                                4
```

The `slice-6c-fix-4-review.md` and `slice-6c-fix-4-verify.md` keys are the orchestrator's copied round-4 lane
reports (the 15 findings the STEER says are not mine). They are other lanes' measurement records, so under
D-011 item 2 they **keep** their labels and are absorbed here. They were absorbed by a full re-derivation from
the instrument's matches — no key was hand-added.

### Git content vs filesystem content (the "awareness" half)

The report/brief scan walks the WORKING TREE. Rather than assume disk equals the tracked set, the run
cross-checks and says which it read:

```
  note — no-bare-head-count: scanned 119 WORKING-TREE file(s); git tracks 119 under the same paths (0 untracked, 0 tracked-but-absent)
```

`discloseScanProvenance()` runs `git ls-files` only when the root is a git worktree (`ROOT/.git` exists), and
prints a plain "read FILESYSTEM (working-tree) content only" note otherwise — which is what every throwaway
`--root` in the behaviour check sees. A scanned file git does not track is disclosed as working-tree content
(at no commit). This is a **disclosure, not a rule** (a round legitimately writes reports before committing
them), and it replaces round 4's prose assumption that "disk happens to be a superset".

### The SCOPE block (F4)

`docs/agents/code-structure.md:121-127` makes the header authoritative. `factory-guard.mjs` now carries a
`// SCOPE —` block enumerating: `factory/config.json` (JSON); `factory/work/*.json` (JSON, one level);
`.opencode/agents/*.md` and the live harness `~/.pi/agent/agents/*.md` (markdown, `model:` line only);
`scripts/guards/*.mjs` (JavaScript, one level, leading comment block); and `.scratch/v28/reports/*.md` +
`.scratch/v28/briefs/*.md` (markdown, one level). It states what is **not** counted — `ledger.md`, `plan.md`,
other lanes, no recursion, other extensions — and that the report scan is **presence on disk, not
`git ls-files`** (a tracked file absent from the tree is not seen; a present untracked file is).

### Exact behaviour-check output (both new checks included)

```
  ✓ a `git ls-tree` count against a bare moving revision is CAUGHT (widened shape)
  ✓ a `git show <rev>:` read against a bare moving revision is CAUGHT (widened shape)
  ✓ a counted command defaulting to a bare moving revision is CAUGHT
  ✓ the same shapes naming the commit pass (control)
  ✓ a SECOND occurrence on an already-counted line is CAUGHT (per-line counting)

factory-guard check: all 31 checks passed.
```

**Each new check can fail — proved against the round-4 guard** (`git show e3f163d:scripts/guards/factory-guard.mjs`),
not merely asserted:

```
# widened shapes — /tmp/v28-6c5 seeds `git ls-tree -r --name-only <HEAD> … | wc -l` + 280,
# and `before (git show <HEAD>:…) … -> 0`
$ node /tmp/guard-before-6c5.mjs --root /tmp/v28-6c5 | grep -c 'FINDING \[no-bare-head-count\]'
0            # old guard: blind, exit 0
$ node scripts/guards/factory-guard.mjs --root /tmp/v28-6c5 | grep -E 'FINDING|PASS|FAIL'
  FINDING [no-bare-head-count]: .scratch/v28/reports/zz-show.md:1: … "git show <HEAD>"
  FINDING [no-bare-head-count]: .scratch/v28/reports/zz-tree.md:1: … "git ls-tree -r --name-only <HEAD>"
FAIL — 2 factory finding(s).      # exit 1

# F2 — 5 occurrences on disk, TWO on one line, in a file whose baseline key is 4
$ grep -o 'at HEAD' /tmp/v28-6c5-f2/.scratch/v28/reports/slice-6c-fix-1-review.md | wc -l
5
$ node /tmp/guard-before-6c5.mjs --root /tmp/v28-6c5-f2 | grep -c 'FINDING \[no-bare-head-count\]'
0            # `.exec()` saw 4 (== baseline) and passed
$ node scripts/guards/factory-guard.mjs --root /tmp/v28-6c5-f2 | grep -E 'FINDING|PASS|FAIL'
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6c-fix-1-review.md:4: … "265 at <HEAD>"
FAIL — 1 factory finding(s).      # exit 1

# baselined historical occurrences still pass
$ grep -o 'at HEAD' /tmp/v28-6c5-base/.scratch/v28/reports/slice-6c-fix-1-review.md | wc -l
4
$ node scripts/guards/factory-guard.mjs --root /tmp/v28-6c5-base | grep -E 'PASS|FAIL'
PASS — the registry can be trusted and no work item claims evidence it does not have.   # exit 0
```

`In every pasted tail, the literal token inside a matched label is rendered `<HEAD>`; the seed files on disk
carried the literal.`

### Self-check: the widened rule over this report — it CAUGHT me, and I rendered rather than weakened

The first draft of this report tripped the widened rule **8 times**. The instrument found its own document
before I committed it, which is the outcome the brief asks for. The caught shapes, from the run:

```
slice-6c-fix-5.md:38   "git log … + wc"        (arm 3 — a literal example of the log-piped-to-wc shape)
slice-6c-fix-5.md:38   "git rev-list … + wc"   (arm 3 — a literal example of the rev-list-piped-to-wc shape)
slice-6c-fix-5.md:127  "git command that defaults to <HEAD>"   (arm 2 — prose, wildcard subcommand)
slice-6c-fix-5.md:137  "git log … + wc"         (arm 3 — a literal example)
slice-6c-fix-5.md:245  "git ls-tree … <HEAD>"   (arm 2 — a pasted check NAME carrying the token)
slice-6c-fix-5.md:246  "git show <HEAD>"        (arm 2 — a pasted check NAME carrying the token)
slice-6c-fix-5.md:268  "265 at <HEAD>"          (arm 1 — a proof command quoting the seed)
slice-6c-fix-5.md:277  "265 at <HEAD>"          (arm 1 — a proof command quoting the seed)
```

(The matched tokens above are rendered `<HEAD>`, and the arm-3 pipe is shown as `+`, so this record of the
catch does not itself re-match the rule — the same convention the rest of the report uses.)

**I did not weaken the rule.** I fixed the report: arm-3 examples now read "a `git log`-style command piped to a
word count" (no pipe token), the prose token is `<HEAD>`, the check names were renamed in
`factory-guard.check.mjs` to say "a bare moving revision" instead of spelling the token, and the seed-count
proofs use `grep -o 'at HEAD'` (no digit before it, so arm 1 does not match). The final grep is **empty**:

```
$ node scripts/guards/factory-guard.mjs
Factory guard — the scheduler registry and the work state
===========================================================
  note — no-bare-head-count: baseline holds 87 recorded occurrence(s); a new count resolved through bare HEAD is a finding
  note — no-bare-head-count: scanned 120 WORKING-TREE file(s); git tracks 119 under the same paths (1 untracked, 0 tracked-but-absent)
  note — .scratch/v28/reports/slice-6c-fix-5.md is UNTRACKED: its counts are working-tree content, at no commit
  ok — 5 model(s), 8 task kind(s), 1 work item(s); every floor meetable, every artifact present, every instrument header stating only what it can point at, no report or brief count resolved through bare HEAD beyond the recorded baseline

PASS — the registry can be trusted and no work item claims evidence it does not have.

$ node <the widened regex> over .scratch/v28/reports/slice-6c-fix-5.md
matches: 0
```

The `1 untracked` in that run is this report itself — written before its commit, and disclosed by the git/disk
cross-check rather than hidden. (The token `HEAD` inside the quoted `ok —` line and the notes is the guard's own
**output**, not a scanned report line, so it is not counted.)

---

## `npm run verify` — measured numbers, every delta accounted for

```
> npm run build && npm run test && npm run lint && npm run a11y:focus && npm run steering-lint && npm run guards
```

| measure | this round | round-4 figure | delta | accounted for |
|---|---|---|---|---|
| build | exit `0` | `0` | `0` | no build input changed |
| test files | `71` (`70 passed | 1 failed`) | `71 passed` | `0` files | no `.test.*` file in the diff; the new cases are `.check.mjs` behaviour checks run by `run-all.sh`, not discovered by vitest |
| tests | `2067` (`2066 passed, 1 failed`) | `2067 passed` | `1 now fails` | **NOT this slice.** `scripts/factory/scheduler.test.mjs:248` asserts ocr routes to the LOCAL model; the orchestrator's committed temporary routing change (`ec47f15`, D-017) sets `ocr.requires_local_inference` false, so the assertion's target (cloud rejected `/requires local inference/`) no longer exists. `realConfig` is read straight from `factory/config.json` (`scheduler.test.mjs:35`). Left untouched per the STEER ("do not revert it, do not report it"). A second, unrelated failure in `scripts/guards/no-bypass-guard.test.mjs` appeared in ONE full-suite run and not in another, and passes alone — a pre-existing flake, named below, not mine. |
| lint warnings | `81` (`grep -c ': warning '`) | `81` | `0` | `factory-guard.mjs` added no warning; oxlint prints no banner off-TTY, so the count is by grep |
| lint errors | `0` | `0` | `0` | — |
| a11y:focus | exit `0` | `0` | `0` | not touched |
| steering-lint | `AGENTS.md (1789 words, ceiling 1800)` | `1789` | `0` | `AGENTS.md` not edited |
| guards | `GUARDS: PASS` | PASS | — | `factory-guard.check.mjs` `31` run-time checks (was `26`), `regexp-escape-guard.check.mjs` `12` |

`npm run verify` therefore exits **`1`**, on the single pre-existing `scheduler.test.mjs` failure above. Every
other stage was run separately and exits `0`; the guard is green. I did not edit `factory/config.json` or the
scheduler test to make the gate green.

### Raw verify tail

```
 FAIL  scripts/factory/scheduler.test.mjs > capability routing > requires local inference for the ocr lane and never routes it to cloud
TypeError: Cannot read properties of undefined (reading 'why')
 ❯ scripts/factory/scheduler.test.mjs:251:61
    251|     expect(result.rejected.find((r) => r.modelKey === CLOUD).why).toMa…
      |                                                             ^

 Test Files  1 failed | 70 passed (71)
      Tests  1 failed | 2066 passed (2067)
```

### The other gates, raw tails

```
$ node scripts/guards/factory-guard.check.mjs
factory-guard check: all 31 checks passed.        # exit 0
$ node scripts/guards/regexp-escape-guard.check.mjs
regexp-escape-guard check: all 12 checks passed.  # exit 0
$ bash scripts/guards/run-all.sh
GUARDS: PASS — all deterministic rules hold.      # exit 0
$ npm run lint
81 (warnings) / 0 (errors)                        # exit 0
$ npm run steering-lint
  ok — AGENTS.md (1789 words, ceiling 1800)       # exit 0
$ npm run a11y:focus
PASS — every control that suppresses its outline provides a focus cue   # exit 0
```

### Counter agreement

```
$ node scripts/guards/factory-guard.check.mjs | tail -1
factory-guard check: all 31 checks passed.
$ grep -cE '^\s+check\(' scripts/guards/factory-guard.check.mjs
31                        # == the run-time counter
$ grep -c 'check(' scripts/guards/factory-guard.check.mjs
32                        # incl. the `const check = …` definition site, not a case
```

---

## Noticed and NOT fixed (each named with `file:line`)

1. **`.scratch/v28/reports/slice-6c-fix-4.md:180`** — a raw tail still carries `git show <HEAD>:…` (the N1
   "committed guard" repro). It is a *read*, not a labelled number, so `:15`'s corrected claim is true; it is
   another round's record, so D-011 item 2 keeps it. Baselined. Left alone.
2. **`scripts/guards/run-all.sh:44-51`** — the one-line `factory` guard summary still does not enumerate the
   newer rules (`no-bare-head-count`, `agent-model-in-registry`, `independence-satisfiable`). It is a summary,
   not the authoritative list (which is the guard header). Left alone.
3. **`scripts/factory/scheduler.test.mjs:248-252`** vs **`factory/config.json` `task_kinds.ocr`** — the
   pre-existing failure accounted for above. Out of this slice; the STEER forbids touching the config and it is
   not mine to edit the test.
4. **`scripts/guards/no-bypass-guard.test.mjs`** — flaked **once** in a full `npm run test` run (`passes when
   the effective value equals the repository layer`, `2 failed | 69 passed`), and passed on an immediate re-run
   (`1 failed | 70 passed`) and alone (`26 passed`). Pre-existing, order/environment-dependent, untouched by
   this diff, not fixed (out of scope). Named here so the number is accounted for.
4. **`.scratch/v28/briefs/slice-6c-fix-5.md`** (this round's brief) and the other briefs/reports carry
   `<HEAD>`-shaped occurrences — the orchestrator's and other lanes' documents. Absorbed by the baseline
   (D-011 item 2), never rewritten.
5. **`.scratch/v28/ledger.md:7091`** — carries the class and is now recorded known-open in `factory/decisions.md`
   **D-018** (D1). `ledger.md` untouched (D-002).

## Risks and ceilings (`ladder:`)

- **`ladder:` the rule is named `no-bare-head-count` but arm 2 also flags a bare `git rev-parse <HEAD>` /
  `git show <HEAD>:p` read that carries no count.** The name is kept because the brief and four prior rounds
  name it, and every arm is the provenance of a count; the header states the class precisely so the name is a
  short form, not a claim. If a reader wants the name to match exactly, rename it — but that is a rename, not a
  rule change.
- **`ladder:` arm 3 has zero matches in the current corpus** (`grep` for `git (log|rev-list|…) | wc` over
  reports+briefs returns nothing). It is present because the STEER asks for the class, not the examples, and it
  is behaviour-checked, so it cannot silently rot. Its absence from the baseline is a real measurement.
- **`ladder:` the baseline now absorbs 87 historical occurrences, including branch-name-free `git rev-parse
  <HEAD>` lines in eleven older verify briefs.** A legitimate future report that runs `git rev-parse <HEAD>`
  will fail until it either names a commit or the baseline is deliberately extended — that is the detector
  working, but it is a real tax on ordinary prose, and it is worth the orchestrator's eye.
- **`ladder:` "tracked" is still implemented as presence-on-disk in the scan itself.** The new cross-check
  *discloses* the disk/tracked relationship, but the rule still fails on a filesystem file; it does not require
  git tracking. That is deliberate (the `--root` temp-root seam makes a git call untestable).
- **`ladder:` the F2 behaviour seed pins the baseline count of `slice-6c-fix-1-review.md::265 at <HEAD>` at 4.**
  If that historical file's count ever moves, the seed must move with it; it is a recorded historical file, so
  it should not.

---

## Bounded repair (orchestrator-owned damage + one dead arm — NOT a fix round, NOT a finding)

**Scope:** repair of the orchestrator's own `ec47f15` and one arm the round-5 instrument *declared* but could
not fire. The round-5 findings and verdict above are **unchanged**.

### R1 — `scripts/factory/scheduler.test.mjs:246-252`: policy asserted inside a mechanism test

The old test's NAME claimed the mechanism ("requires local inference … never routes it to cloud") while its
BODY asserted a POLICY value (ocr is local). `ec47f15` (human-authorized, D-017) set
`task_kinds.ocr.requires_local_inference` false, so `selectModel` stopped rejecting CLOUD for ocr and the line
`expect(result.rejected.find(r => r.modelKey === CLOUD).why)` threw
`TypeError: Cannot read properties of undefined (reading 'why')`.

Rewritten as ONE test — the file's count stays `37` — with two clearly separated halves:

- **PART 1 — the MECHANISM, against an explicit FIXTURE.** A `local-only` task kind declared with
  `requires_local_inference: true`; cloud must be rejected by name with `toMatch(/requires local inference/)`.
  Remove the check at `scheduler.mjs:517` and CLOUD becomes a candidate, so `rejected.find(...)` is `undefined`
  and the test goes red. It is not vacuous, not deleted, and not loosened to match-anything.
- **PART 2 — the CURRENT POLICY, against the real registry, asserted separately.** With the waiver in place,
  CLOUD is an admissible candidate for ocr (`rejected.find(CLOUD)` is `undefined`), and on a machine where the
  local model is blocked the lane falls back to CLOUD. The comment names D-017, why the waiver exists, and
  what to restore when the human reverses it. `factory/config.json` was **not touched**.

```
$ npx vitest run scripts/factory/scheduler.test.mjs
 Test Files  1 passed (1)
      Tests  37 passed (37)
```

### R2 — `factory-guard.mjs`: the `@` arm was DECLARED but DEAD

`MOVING_REV` lists `@` (git's shorthand for HEAD) and `@` matches alone — but both composed arms ended in
`\b`, and `@` ends in a non-word character, so the composed arms could never fire on it. An arm written down
that cannot fire is the same defect shape as every earlier round. Fixed by ending each arm with `(?![\w])` — a
correct end-of-token assertion for a non-word token, equivalent to `\b` for word-terminated ones like `HEAD` —
which also restored `HEAD^` and `HEAD@{2}` (both were silently dropped by the same `\b`).

Measured, current guard (the `@` token rendered `<@>` here, as `HEAD` is rendered `<HEAD>`; the seeds carried
the literal):

```
zz-head-at.md:1  "git ls-tree … <@>"       CAUGHT
zz-head-at.md:3  "git show <@>"             CAUGHT
zz-head-at.md:5  "280 tracked files at <@>" CAUGHT
```

And the **same root against a copy with `\b` restored: `0` findings, exit `0`** — so the new behaviour check
can fail. Raw:

```
$ node /tmp/guard-dead-at.mjs --root /tmp/v28-6c5-at | grep -c 'FINDING \[no-bare-head-count\]'
0
$ node scripts/guards/factory-guard.mjs --root /tmp/v28-6c5-at | grep -c 'FINDING \[no-bare-head-count\]'
3
```

**False positives verified explicitly** (the root passes, exit `0`):

```
write to user@example.com about it            not flagged
the @decorator style is used                  not flagged
the @{2} form means no revision here         not flagged
the count is 5 at user@example.com           not flagged
```

New behaviour checks (each can fail): `the `@` shorthand (a git read and a count label) is CAUGHT` and
`email, @decorator and bare @{…} are NOT flagged (control)`. **Check count `31` → `33`.**

**Baseline: DID NOT MOVE — still `87` occurrences / `47` keys.** Re-derived independently under the fixed
boundary and diffed against the in-file Map: `occurrences 87 keys 47`, `diffs: 0`. No `@`, `HEAD^` or
`HEAD@{…}` occurrence exists in the current reports+briefs, so the fix adds coverage without adding records.

### R3 — `git status --porcelain | wc -l` named as its own known gap

Added to the guard header and to item 6 of the list above: a count taken from the *working tree*, not from
bare `HEAD`, so it
is not arm 3 and is not flagged. Recorded as a distinct KNOWN GAP with its own reason rather than folded into
the filesystem bullet.

### R4 — the reported flake: an environmental git-clone hardlink race, not a symptom

`scripts/guards/no-bypass-guard.test.mjs` failed once in a full run with:

```
Error: clone failed (128): fatal: hardlink different from source at
'/tmp/nb-plain-…/clone/.git/objects/info/commit-graphs/tmp_graph_…'
```

That is `plainClone()`'s local `git clone` racing a concurrent git write on a `commit-graphs/tmp_graph_*` file:
git's local-clone hardlink path aborts when the source file is a temp file another git process is still
writing. It lives in the test's own scaffolding, touches nothing in this diff (no git objects, no
no-bypass code), and passes alone (`26 passed`) and on re-run. **A real flake, environmental, not a symptom.**

Raw counts, five full-suite runs (two from round 5, three from this repair):

```
round-5 run A: 2 failed | 69 passed (71)   [scheduler] + [no-bypass hardlink race]
round-5 run B: 1 failed | 70 passed (71)   [scheduler]
repair run 1:  71 passed (71) | 2067 passed (2067)
repair run 2:  71 passed (71) | 2067 passed (2067)
repair run 3:  71 passed (71) | 2067 passed (2067)
```

The test was not deleted, skipped, retried-until-green, or marked flaky.

### Repair verification — raw

```
$ npx vitest run scripts/factory/scheduler.test.mjs
 Test Files  1 passed (1)
      Tests  37 passed (37)

$ npm run verify            # EXIT 0
 Test Files  71 passed (71)
      Tests  2067 passed (2067)
 warnings 81, errors 0
   ok — AGENTS.md (1789 words, ceiling 1800)
   factory-guard check: all 33 checks passed.
 GUARDS: PASS

$ bash scripts/guards/run-all.sh   # EXIT 0
 GUARDS: PASS — all deterministic rules hold.
```

**Test count:** `2067` did **not** move. The broken test was rewritten in place (mechanism half + policy half
inside one `it`), so the file stays at `37` and the suite at `2067`.
