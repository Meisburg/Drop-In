# slice-6c-fix-6 — VERIFIER report (deterministic referee)

Working directory: /home/jmeisburg/orca/workspaces/playdate-app/onboarding (branch Meisburg/onboarding)
Base for this round: 1c3471a. HEAD when this verification started: ef21f96 (the report speaks of 674ad96; an orchestrator commit moved HEAD before verification began — see §5).
Brief: implement the D-021 human ruling (decidable reporting form; re-derived baseline).
This file is the CLAIM-report's referee: every number below is from the command that produced it,
in the same call. Written first, appended as produced.

## 0. Guard-file sha256 at START

```
b107bdc1bffdd947459d0675caa1620bd7e8e9255a3518a36539b9edd49535e9  scripts/guards/check-acceptance-greps.check.mjs
a8ac78a7d1aac3bd0a4c3a1a653b5b174fe263d5547222686fcb7c65475adde4  scripts/guards/check-acceptance-greps.mjs
2f985470108a1b926c911db143c5c8c29fdd9ed61902c0a6c310d44a5a8c6bd0  scripts/guards/copy-field-consumption-guard.check.mjs
d08f01017f578d8458582a8e5b8c4e261846fc128d4a81de1a62d3230944c722  scripts/guards/copy-field-consumption-guard.mjs
63c6c8dc8e80c203bea63df00b33675eaa3c7fd069032bc64325d6033d71d2fa  scripts/guards/factory-guard.check.mjs
45d3821395857f26e6c57f7cd76e145d243e17e62b63b8007e846e7aa99e9a4d  scripts/guards/factory-guard.mjs
f769553baf8e8e3edfde5e087ef99da56c72f7d304ef3e4af81ac1a94e7346da  scripts/guards/fixture-marker-guard.check.mjs
8cda106f4182d8a4925f227371f705a962c276150b17fb8f72d79608b29c006e  scripts/guards/fixture-marker-guard.mjs
d4772c6b924f59e74fa8f8c65516a052b1652a1c1f7be827ecc200426f607db7  scripts/guards/no-bypass-guard.check.mjs
3b8786c4a70b7160ec34004d73e27c4419eb8d76f9298b09c1270bde14e99edd  scripts/guards/no-bypass-guard.test.mjs
8493f7e8f3ad4a7799a248138aea3d928e6615122607441461b394f68a4d7bde  scripts/guards/regexp-escape-guard.check.mjs
2922f042c0e2a59564c0c999467920cdf93f191438166ae9efdda1cd270f17f8  scripts/guards/regexp-escape-guard.mjs
bfee13bf14adafd4de110e143f1b5a8851248bd7bbf0e683830ed8805399b35f  scripts/guards/stale-locator-guard.check.mjs
e737bd878b60c6e9a6bf056ba95914aea5a459ce33a60606f4ba3fdcce49f097  scripts/guards/stale-locator-guard.mjs
5bb4b0b6f62359add7e55f9056d1f5a258419c868b45cf789b7b88d213453968  scripts/guards/vacuous-absence-guard.check.mjs
b4c44fff5f5874e8ac5e11301989dccb181021e5f4643ff521f5fc822c6a7cc5  scripts/guards/vacuous-absence-guard.mjs
e8ade02746c7f6acc295fc175df9efabcdec49e3ab95e90d6d8475b53bd42dd4  scripts/guards/config-guard.sh
addfa41da1d9a6d06b5a0649a0a8a181004084a1a8c163443aa32c91f592f123  scripts/guards/lib-sibling-guard.sh
24ff52cf2e4d9abc7af129aac392259996702e15e79f3c1c213b398e0ba81e97  scripts/guards/no-bypass-guard.sh
536bdaeac46bd6c85d3f45c3076d476fd40d6bf9b705f922e8a3707ae072aeda  scripts/guards/run-all.sh
```

## 1. npm run verify (build gate)
```
$ git diff --stat 1c3471a..HEAD
 .scratch/v28/briefs/slice-6c-fix-6.md  | 113 +++++++
 .scratch/v28/ledger.md                 |   8 +
 .scratch/v28/reports/slice-6c-fix-5.md |  28 +-
 .scratch/v28/reports/slice-6c-fix-6.md | 586 +++++++++++++++++++++++++++++++++
 factory/decisions.md                   |  47 +++
 factory/work/v28-r2-6c.json            |  22 +-
 scripts/guards/factory-guard.check.mjs | 312 +++++++++++++++++-
 scripts/guards/factory-guard.mjs       | 546 +++++++++++++++++++++++++-----
 8 files changed, 1570 insertions(+), 92 deletions(-)

$ git diff --stat 1c3471a..HEAD --name-only | grep -Ei 'test|spec'   # no test file in the delta
(none)

$ npm run verify   -> exit 0
 Test Files  71 passed (71)
      Tests  2067 passed (2067)
grep -c ': warning ' /tmp/r6verify.out -> 81
grep -c ': error '   /tmp/r6verify.out -> 0
  ok — AGENTS.md (1789 words, ceiling 1800)
verify exit code: EXIT=0
```

## 2-4. Deterministic lanes (raw)
```
$ node scripts/guards/factory-guard.mjs   -> exit 0
Factory guard — the scheduler registry and the work state
===========================================================
  note — no-bare-head-count: baseline holds 442 recorded occurrence(s); a new count resolved through bare HEAD is a finding
  note — no-bare-head-count: scanned 124 WORKING-TREE file(s); git tracks 124 under the same paths (0 untracked, 0 tracked-but-absent)
  note — count-provenance: 76 provenance token(s) in the scan, 21 distinct sha(s) resolved with `git cat-file -e <sha>^{commit}` against /home/jmeisburg/orca/workspaces/playdate-app/onboarding — 0 unresolvable
  ok — 5 model(s), 8 task kind(s), 1 work item(s); every floor meetable, every artifact present, every instrument header stating only what it can point at, no report or brief count resolved through bare HEAD beyond the recorded baseline, every count's provenance sha resolving as a commit

PASS — the registry can be trusted and no work item claims evidence it does not have.

$ node scripts/guards/factory-guard.check.mjs   -> exit 0
printed check lines (grep -c '✓'): 57
statement call sites (grep -cE '^[[:space:]]*check\('): 57
naive grep -cE '\bcheck\(' : 58  -> the extra match is the string 'check(s)' in the failure message at :787, NOT a call site
runtime counter: all 57 checks passed

$ node scripts/guards/regexp-escape-guard.check.mjs   -> exit 0

regexp-escape-guard check: all 12 checks passed.
printed lines (grep -c '✓'): 12

$ bash scripts/guards/run-all.sh   -> exit 0
factory-guard check: all 57 checks passed.

===========================================================
GUARDS: PASS — all deterministic rules hold.

$ bash scripts/steering-lint.sh   -> exit 0
  ok — AGENTS.md (1789 words, ceiling 1800)
  ok — every steering doc is reachable from AGENTS.md
```

## 5. HEAD is not frozen during verification

`git rev-parse HEAD` moved from the report's stated `674ad96` to **`ef21f96`**
("D-019 marked superseded; round-6 work state and ledger recorded") between the
brief and this verification. `git diff --stat 674ad96..ef21f96` = `.scratch/v28/ledger.md | 4 ++`,
`factory/decisions.md | 4 ++`, `factory/work/v28-r2-6c.json | 22 +++-` — no instrument,
no report/brief, no test file. All numbers below were taken against `ef21f96`
unless a command says otherwise.

## 6. THE BASELINE GREW 87/47 -> 442/255 — independently re-derived

My own script (`/tmp/r6myd/derive.mjs`), not the builder's `/tmp/derive-baseline.mjs`:
it parses `BARE_HEAD_BASELINE` out of the instrument's own source for the
"baselined" side, and for the "measured" side copies the instrument to
`/tmp/r6myd/factory-guard-emptied.mjs` with `BARE_HEAD_BASELINE.clear()` injected
(so every occurrence becomes a finding) and parses the finding lines.

```
$ node /tmp/r6myd/basesize.mjs       # parses git show 1c3471a:scripts/guards/factory-guard.mjs
BASE (1c3471a) BASELINE: 47 key(s), 87 occurrence(s)

$ node /tmp/r6myd/derive.mjs
BASELINED: 255 key(s), 442 occurrence(s)
emptied-baseline run: exit 1
MEASURED (from emptied baseline): 255 key(s), 442 occurrence(s) [printed FINDING lines: 442]
EXTRA (measured, not baselined): 0 key(s), 0 occurrence(s)
STALE (baselined, not measured): 0 key(s), 0 occurrence(s)
SLACK (baseline > measured, over-recorded): 0 key(s), 0 occurrence(s)
SHORT (baseline < measured): 0 key(s), 0 occurrence(s)
```

- **Measured occurrences 442 / keys 255. Baselined occurrences 442 / keys 255.**
- **extra = 0/0, stale = 0/0, every-key shortfall = 0, and NO key is over-recorded
  (slack = 0).** The baseline is not padded; it is exactly the set of matches the
  instrument currently produces.
- **The `442` the guard prints at run time is the same `442`:**
  `note — no-bare-head-count: baseline holds 442 recorded occurrence(s)`.

### It was RED at the base, and the greenness is re-derivation, not deletion

```
$ node /tmp/r6myd/guard-base.mjs --root "$PWD"     # 1c3471a instrument, current corpus
EXIT=1
108  (grep -c "FINDING [no-bare-head-count]")
FAIL — 108 factory finding(s).
```
The base instrument is red (108 findings on today's corpus; the report's `100`
was measured two commits earlier, and D-021's `98` before the brief existed — all
three are the same red). Deleted lines in the instrument diff are exactly the three
superseded arm regexes (`BARE_HEAD_COUNT_AT`, `BARE_HEAD_COUNT_CMD`, the
`(?:log|rev-list|…)` name list) plus baseline keys that the widened arms re-keyed;
**each arm has a strictly wider replacement**, so no detection capability was
removed:

```
$ git diff 1c3471a..HEAD -- scripts/guards/factory-guard.mjs | grep -E '^-' | grep -vE '^---|^-\s*(\*|//)'
-const BARE_HEAD_COUNT_AT = new RegExp( … old phrase-set form … )
-const BARE_HEAD_COUNT_CMD = new RegExp(String.raw`\bgit\s+[a-z][a-z-]*[^\n|`]*?\s(?:${MOVING_REV})(?![\w])`, 'g')
-const BARE_HEAD_COUNT_WC = /\bgit\s+(?:log|rev-list|shortlog|whatchanged|cherry|stash|branch|describe)\b[^|\n]*\|\s*wc\b/g
-  [".scratch/v28/briefs/slice-6c-fix-3.md::265 at HEAD", 2],
-  … 5 more re-keyed baseline lines …
```

### Classification of the absorbed occurrences — is the growth legitimate?

Per-file tally of the 442 absorbed occurrences (my own parse of the baseline):

```
 170  .scratch/v28/reports/slice-6c-fix-5-review.md
  70  .scratch/v28/reports/slice-6c-fix-6.md
  16  .scratch/v28/reports/slice-6c-fix-1-verify.md
  15  .scratch/v28/reports/slice-6c-fix-2-review.md
  14  .scratch/v28/briefs/slice-6c-fix-6.md
  … 37 more files …
TOTAL 255 keys, 442 occ across 42 files
```
**240 of 442 (54%) sit in two files that are themselves reports/briefs discussing
this class** (`slice-6c-fix-5-review.md`, `slice-6c-fix-6.md`); the whole 442 is
`.scratch/v28/{reports,briefs}` prose. That is the "lane reports that discuss the
class" absorption, and it dominates.

Arm attribution (combined-regex match fully covered by one arm):
```
ARM1 (either-order count<->moving-rev label): 57 keys / 111 occ
ARM2 (git read with a moving revision):       82 keys / 150 occ
ARM3 (counted git command, no fixed revision):107 keys / 168 occ
combined-regex-only (span differs):            9 keys /  13 occ
```

I read all 57 ARM1 keys and their source lines. **Genuine class instances vs
ordinary prose caught by proximity — 8 clear false positives (9 occurrences incl.
one borderline):**

| occurrence(s) | location | matched text | why it is NOT the class |
|---|---|---|---|
| 1 | slice-6c-fix-5-review.md:78 | `11 branch names, HEAD` | 11 = branch names; HEAD marks the current one |
| 2 | slice-6c-fix-3-review.md:116 | `2 working tree` | "round-2 working tree" — 2 is the round number |
| 1 | slice-6c-fix-5-review.md:362 | `4 control lines, wildcard @` | 4 = control lines; `@` is a regex char |
| 1 | slice-6c-fix-5-verify.md:190 | `0 findings: the @` | 0 = findings; `@` is the shorthand under test |
| 1 | slice-6c-fix-5.md:107 | `HEAD when round 4` | "round 4" — 4 is the round number |
| 1 | slice-6c-fix-1-verify.md:407 | `@ c484648 / 23` | `@` is English "at"; the sha is FIXED (c484648) |
| 1 | slice-6c-fix-1-verify.md:242 | `@ c484648, 265 after staging, 23` | same: `@` = "at", fixed sha named |
| 1 | slice-6c-fix-1-verify.md:267 | `262 real, at c484648 and HEAD` | count's provenance co-names the fixed c484648 (borderline) |

All ARM2/ARM3 keys are `git …` command strings; under the arms' stated properties
they are genuine (a git read naming a moving rev, or a counted git command naming
no fixed revision), including template placeholders — which the header declares.

**Answer to the question that matters: the growth is legitimate absorption, not
the widened rule's own over-firing being baselined away.** 8–9 occurrences of 442
(≈2%) are ARM 1 proximity false positives; the remaining ≈433 are genuine class
instances (counts labelled with a moving rev) or genuine counted-git-command
matches, quoted or used inside lane reports. No key is over-recorded (slack = 0),
so nothing is hidden by a padded count.

## 7. THE SHA VERIFICATION — the decidability claim, independently reproduced

Root `/tmp/r6b` = `factory/config.json` + one `.scratch/v28/reports/zz.md`.

**B1 — `N at <valid sha>` passes:**
```
$ printf 'The tree held 276 tracked `.scratch` files at 1c3471a.\n' > /tmp/r6b/.scratch/v28/reports/zz-valid.md
$ node scripts/guards/factory-guard.mjs --root /tmp/r6b
  note — count-provenance: 1 provenance token(s) in the scan, 1 distinct sha(s) resolved with `git cat-file -e <sha>^{commit}` against /home/jmeisburg/orca/workspaces/playdate-app/onboarding — 0 unresolvable
PASS — the registry can be trusted and no work item claims evidence it does not have.
exit=0
```

**B2 — `N at <bogus sha>` produces `count-provenance-unresolvable`, exit 1:**
```
$ printf 'The tree held 276 tracked `.scratch` files at deadbee.\n' > /tmp/r6b/.scratch/v28/reports/zz-bogus.md
$ node scripts/guards/factory-guard.mjs --root /tmp/r6b
  note — count-provenance: 1 provenance token(s) in the scan, 1 distinct sha(s) resolved with `git cat-file -e <sha>^{commit}` … — 1 unresolvable
  FINDING [count-provenance-unresolvable]: .scratch/v28/reports/zz-bogus.md:1: a count's provenance names deadbee, which is not a commit in this repository (`git cat-file -e deadbee^{commit}` fails) — name a commit a reader can resolve
FAIL — 1 factory finding(s).
exit=1
```
A sha that exists but is a **blob** (`d8b4d2fd…`) or a **tree** (`c3e0cbc0…`),
written `N at <sha>`, is likewise a `count-provenance-unresolvable` finding, exit 1.
The rule checks instead of guessing **for the sha-not-a-commit case**.

**B-boundaries the builder declared as ceilings — measured:**

| boundary | seed | result | verdict |
|---|---|---|---|
| sha exists but is the WRONG commit | `276 tracked files at 1c3471a` (a real commit, not the count's) | `PASS`, exit 0 | **ceiling — NOT closed** |
| sha WITHOUT the `at` connector | `276 tracked files 1c3471a` | `PASS`, 0 provenance tokens, exit 0 | **ceiling — declared** |
| count `->` sha arrow (table style) | `\| files \| 276 \| -> 1c3471a \|` | `PASS`, 0 provenance tokens, exit 0 | **ceiling — declared** |
| md5/sha256 content-hash table | `\| 4f2a…82736 \| 276 \|` | `PASS`, 0 provenance tokens, exit 0 | intended exclusion, no false finding |
| count with no provenance at all | `The tree held 276 tracked files.` | `PASS`, 0 provenance tokens, exit 0 | **ceiling — declared** |

- **Wrong-but-valid commit: NOT closed.** The instrument can verify a sha *is a
  commit*; it cannot know *which* commit a count came from, so `N at <any real
  commit>` always passes. The guard header states exactly this ("A RESOLVABLE BUT
  WRONG COMMIT … it cannot close 'the sha is the wrong one'. This is the residue
  of the ruling and it is declared, not implied"). D-021's sentence "a wrong named
  commit stops being a declared ceiling and becomes a finding" is true **only for
  a sha that does not resolve**; the wrong-but-resolvable commit remains a ceiling.
- **The `->` exclusion does swallow a real class instance** (`276 files -> 1c3471a`
  passes unverified), but the header declares it and names the trade ("Requiring
  the connector is what keeps a `->`-separated content-hash table from being read
  as provenance"), so it is a disclosed ceiling, not a silence.

**B — not-a-git-worktree behaviour, three independent ways:**
```
### --repo points at a git-less dir (no worktree anywhere) ###
exit=0
  note — count-provenance: no git worktree to resolve provenance shas against (looked for --repo, then this scan root, then this instrument's own repository) — the provenance shas of counts are NOT verified here, and no finding is reported for them
  ok — … no report or brief count resolved through bare HEAD beyond the recorded baseline
PASS
```
- With a **bogus** sha seeded in that git-less root and `--repo` git-less: *still*
  exit 0, the NOTE, **no finding** (no false finding manufactured), and the summary
  does **not** contain the phrase `every count's provenance sha resolving as a commit`
  — the claim is dropped. Exactly as claimed.
- With the instrument copied to `/tmp` (so its own repo is gone), a git-less scan
  root with no `--repo`: same NOTE, exit 0, no finding. Exactly as claimed.

**DIVERGENCE FROM THE LITERAL BRIEF, one case.** A scan root that is not a repo,
with **no `--repo`**, and the instrument living inside *a* repo, does **not** produce
the NOTE: `resolveRepo()` falls back to the instrument's own repository and verifies
against it.
```
### scan root NOT a repo, no --repo (fallback to instrument's own repo) ###
  note — count-provenance: 1 provenance token(s) in the scan, 1 distinct sha(s) resolved … against /home/jmeisburg/orca/workspaces/playdate-app/onboarding — 0 unresolvable
  ok — … every count's provenance sha resolving as a commit
PASS
$ # same root, BOGUS sha:
FAIL — 1 factory finding(s).   (exit 1)
```
So for that path the NOTE does not fire and a finding **can** be produced against
the instrument's repo. The header declares the fallback order explicitly ("else
THIS instrument's own repository"), and every behaviour check and temp root passes
`--repo`, so this is a declared design seam — but it means the brief's literal
"a scan root that is not a repo must produce a NOTE and NO finding" holds only when
**no** candidate is a worktree. Flagged for the orchestrator; not a rule failure.

**One report-accuracy nit.** `slice-6c-fix-6.md` §2.3 pastes `git cat-file -e
"$bogus^{commit}"; echo "gate: $?"` as `gate: 1`. Run verbatim here it prints
`gate: 128` (`fatal: Not a valid object name deadbee^{commit}`); all bogus forms
(`deadbee`, `0000000`, `zzzzzzz`, 40-zero) return **128**, not 1. The guard's
`isCommit()` catches any non-zero, so the mechanism is unaffected, but the pasted
number does not reproduce.

## 8. DO THE 57 CHECKS EACH GENUINELY FAIL? — my own mutations

Copy tree at `/tmp/r6chk` (guard + check + `factory/config.json`; `/tmp/r6chk/.git`
symlinked to the real `.git` so the checks' `--repo` seam resolves). Pristine copy:

```
$ node /tmp/r6chk/scripts/guards/factory-guard.check.mjs
factory-guard check: all 57 checks passed.        exit=0     (57 ✓ lines)
```

Pairing: **9 `MUTATION:` checks to 9 `mutatedGuard(...)` call sites — 1:1.**

I applied **my own** mutations (not the builder's anchors) to the guard copy:

```
### MUTATION mut1: isCommit() made to always return true (sha verification neutered) ###
exit=1
  ✗ a count naming a sha that is NOT a commit is CAUGHT — exit 0
  ✗ the revision of a counted git command is verified too (bogus sha is CAUGHT) — exit 0
  ✗ MUTATION: dropping the `at` connector turns that control red (over-matching is reachable) — exit 0
factory-guard check: 3 check(s) failed

### MUTATION mut2: MOVING_REV `@(?![{\w])` -> `@`  (the round-5 `@` control) ###
exit=1
  ✗ email, @decorator and a bare @{…} next to a count are NOT flagged (control) — exit 1
Error: mutation anchor occurs 0 time(s), not once: "@(?![{\\w])"

### MUTATION mut3: drop ARM1's reverse-order alternative `|${REV_TOKEN}${COUNT_GAP}${COUNT_TOKEN}` ###
exit=1
  ✗ a count AFTER a bare moving revision is CAUGHT (either word order) — exit 0
Error: mutation anchor occurs 0 time(s), not once: "|${REV_TOKEN}${COUNT_GAP}${COUNT_TOKEN}"
```

- **mut1** — neutering the one git call turns the two sha checks red. The sha
  verification is genuinely load-bearing.
- **mut2** — removing the `@` lookahead turns the control red, exit 1. **The round-5
  `@` control is now genuinely reachable** (round 5 measured it vacuous, because the
  `@` arm could never fire). The control's own mutation check is on line 524–527.
- **mut3** — removing the reverse alternative turns the either-order check red.
- The `Error: mutation anchor occurs 0 time(s)` lines are the **anchor assertion
  doing its job**: after my own mutation destroyed the anchor the builder's mutation
  check names, `mutatedGuard` refuses to be a silent no-op. That is the exactly-once
  assertion (`scripts/guards/factory-guard.check.mjs:66-72`), observed live.

The `@` arm is genuinely live, not merely non-vacuous: a root seeded with
`git show @` / `280 tracked files at @` produces `no-bare-head-count` findings
(check `the `@` shorthand (a git read and a count label) is CAUGHT`, ✓).

## 9. ARM 1 ON ORDINARY PROSE — my own probe, quantified

My probe (`/tmp/r6probe/.scratch/v28/reports/zz-ordinary-prose.md`), 13 lines of
prose a real report would contain — 11 ordinary lines (test/file/word counts, round
numbers, lane counts) each with a moving rev within four tokens, and 2 positive
controls:

```
$ node scripts/guards/factory-guard.mjs --root /tmp/r6probe
FAIL — 13 factory finding(s).   exit=1
  FINDING [no-bare-head-count]: …:1: … "2067 tests and 71 files; HEAD"          ← FP
  FINDING [no-bare-head-count]: …:2: … "12 lanes ran this round; HEAD"         ← FP
  FINDING [no-bare-head-count]: …:3: … "5 added 24 behaviour checks; HEAD~1"    ← FP
  FINDING [no-bare-head-count]: …:4: … "11 under the ceiling; @"                ← FP
  FINDING [no-bare-head-count]: …:5: … "81 warnings; HEAD"                      ← FP
  FINDING [no-bare-head-count]: …:6: … "8 contributors and 3 reviewers; HEAD"   ← FP
  FINDING [no-bare-head-count]: …:7: … "6 arms and 24 checks; HEAD~3"           ← FP
  FINDING [no-bare-head-count]: …:8: … "1800 ceiling, and HEAD"                 ← FP
  FINDING [no-bare-head-count]: …:9: … "33 checks wide; HEAD~2"                 ← FP
  FINDING [no-bare-head-count]: …:10: … "5 open findings; @"                    ← FP
  FINDING [no-bare-head-count]: …:11: … "6 fixed 3 corrections; HEAD"           ← FP
  FINDING [no-bare-head-count]: …:12: … "276 tracked `.scratch` files at HEAD"  ← genuine
  FINDING [no-bare-head-count]: …:13: … "git show | wc"                          ← genuine
```

**False positives: 11 of 11 ordinary-prose lines (100% of the adversarial prose
bank).** Every one is a number whose subject is something else (files, lanes,
checks, words, warnings, contributors, ceiling, corrections) flagged because a
`HEAD`/`HEAD~n`/`@` token sat within four tokens. Positive controls fired 2 of 2,
so the arm is not simply broken — it is a proximity rule, exactly as advertised.

**Is the declared ceiling stated honestly in the guard header? YES.** The header
says, in its own ceiling list:

> - ARM 1 IS A LEXICAL PROXIMITY RULE, not a provenance classifier: a sentence
>   that merely mentions a moving revision within four tokens of a number fires
>   even when the number's subject is something else. That is the declared cost of
>   a token rule where a phrase list used to be, and it is why this half is the
>   DETECTOR half while `N at <sha>` + verification is the DECIDABLE half.

The 100% FP rate on adversarial prose is the arithmetic of "declared cost", not a
hidden one. On the real corpus the same arm produces 8–9 false positives out of 442
(§6) because real reports mostly quote genuine instances.

## 10. VERDICT

**VERIFY: PASS**

Every command the brief specifies exited as claimed: build gate `npm run verify`
exit 0 (71 files / 2067 tests / 81 warnings / 0 errors / AGENTS.md 1789/1800, and
no test file in the delta); `factory-guard.mjs` exit 0 PASS with a self-printed
442-occurrence baseline; `factory-guard.check.mjs` 57 = 57 printed = 57 statement
call sites = run-time counter; `regexp-escape-guard.check.mjs` 12/12;
`run-all.sh` GUARDS: PASS; `steering-lint.sh` 1789/1800. The baseline growth
(47/87 → 255/442) is a **true re-derivation**: measured == baselined exactly, with
0 extra, 0 stale, 0 slack, and it was RED (108 findings) at the base. The sha
verification passes a valid sha and fails a bogus/blob/tree sha with
`count-provenance-unresolvable` exit 1, and the not-a-worktree path prints its NOTE,
reports no finding, and drops the claim. My own mutations flip the sha check, the
either-order ARM 1 check, and the round-5 `@` control (now reachable).

**Residual items the orchestrator should record (none blocks the verdict):**
1. **Wrong-but-valid commit is still a ceiling** — `N at <any real commit>` passes;
   only the sha-exists-as-a-commit half is decidable. D-021's "a wrong named commit
   … becomes a finding" holds only for unresolvable shas. Declared in the header.
2. **Non-`at` sha provenance is unverified** (`N <sha>` no connector, `N -> <sha>`,
   `N from <sha>`) — declared trade, but a real class instance (`276 files -> sha`)
   passes silently.
3. **A git-less scan root with no `--repo` falls back to the instrument's repo and
   can produce a finding** — diverges from the brief's literal "a scan root that is
   not a repo must produce a NOTE and NO finding"; the fallback is stated in the
   header and the NOTE branch is reachable via `--repo <non-repo>` or when the
   instrument's repo is absent.
4. **Report-accuracy nit:** `slice-6c-fix-6.md` §2.3's pasted `gate: 1` for
   `git cat-file -e deadbee^{commit}` prints `128` here (all bogus forms → 128).
5. **ARM 1 proximity over-firing** is ~8–9/442 on the corpus and 11/11 on
   adversarial prose; declared in the header, but it is the reason the detector half
   is a detector, not a decision procedure.

## 11. Guard-file sha256 at END

```
b107bdc1bffdd947459d0675caa1620bd7e8e9255a3518a36539b9edd49535e9  scripts/guards/check-acceptance-greps.check.mjs
a8ac78a7d1aac3bd0a4c3a1a653b5b174fe263d5547222686fcb7c65475adde4  scripts/guards/check-acceptance-greps.mjs
2f985470108a1b926c911db143c5c8c29fdd9ed61902c0a6c310d44a5a8c6bd0  scripts/guards/copy-field-consumption-guard.check.mjs
d08f01017f578d8458582a8e5b8c4e261846fc128d4a81de1a62d3230944c722  scripts/guards/copy-field-consumption-guard.mjs
63c6c8dc8e80c203bea63df00b33675eaa3c7fd069032bc64325d6033d71d2fa  scripts/guards/factory-guard.check.mjs
45d3821395857f26e6c57f7cd76e145d243e17e62b63b8007e846e7aa99e9a4d  scripts/guards/factory-guard.mjs
f769553baf8e8e3edfde5e087ef99da56c72f7d304ef3e4af81ac1a94e7346da  scripts/guards/fixture-marker-guard.check.mjs
8cda106f4182d8a4925f227371f705a962c276150b17fb8f72d79608b29c006e  scripts/guards/fixture-marker-guard.mjs
d4772c6b924f59e74fa8f8c65516a052b1652a1c1f7be827ecc200426f607db7  scripts/guards/no-bypass-guard.check.mjs
3b8786c4a70b7160ec34004d73e27c4419eb8d76f9298b09c1270bde14e99edd  scripts/guards/no-bypass-guard.test.mjs
8493f7e8f3ad4a7799a248138aea3d928e6615122607441461b394f68a4d7bde  scripts/guards/regexp-escape-guard.check.mjs
2922f042c0e2a59564c0c999467920cdf93f191438166ae9efdda1cd270f17f8  scripts/guards/regexp-escape-guard.mjs
bfee13bf14adafd4de110e143f1b5a8851248bd7bbf0e683830ed8805399b35f  scripts/guards/stale-locator-guard.check.mjs
e737bd878b60c6e9a6bf056ba95914aea5a459ce33a60606f4ba3fdcce49f097  scripts/guards/stale-locator-guard.mjs
5bb4b0b6f62359add7e55f9056d1f5a258419c868b45cf789b7b88d213453968  scripts/guards/vacuous-absence-guard.check.mjs
b4c44fff5f5874e8ac5e11301989dccb181021e5f4643ff521f5fc822c6a7cc5  scripts/guards/vacuous-absence-guard.mjs
e8ade02746c7f6acc295fc175df9efabcdec49e3ab95e90d6d8475b53bd42dd4  scripts/guards/config-guard.sh
addfa41da1d9a6d06b5a0649a0a8a181004084a1a8c163443aa32c91f592f123  scripts/guards/lib-sibling-guard.sh
24ff52cf2e4d9abc7af129aac392259996702e15e79f3c1c213b398e0ba81e97  scripts/guards/no-bypass-guard.sh
536bdaeac46bd6c85d3f45c3076d476fd40d6bf9b705f922e8a3707ae072aeda  scripts/guards/run-all.sh
```
