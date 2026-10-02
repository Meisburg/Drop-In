# Slice 6c fix-7 — THE MACHINE CHECK (round 7, the human's ruling: build it first, let it find)

**Lane:** builder (fresh context). **Base:** `1f29068` (D-026, the escalation). **Branch:** `Meisburg/onboarding`.
**Commits (per rule, not pushed):** `ff75270` rule 1, `15c6093` rule 2, `86af333` rule 3, `2d64646` rule 4.

**Guard files, sha256 at base → at end:**

| file | at `1f29068` | at end |
|---|---|---|
| `scripts/guards/factory-guard.mjs` | `525a97099bc5c8b7…cca54a7` | `5073a1a6cd9007d7…748c9ec` |
| `scripts/guards/factory-guard.check.mjs` | `55720ffc13be25ff…86256ad5` | `311d400625fb0cb1…c736d7b` |
| `.scratch/v28/reports/slice-6c-fix-6.md` | (committed) | `d44569d28438c1b6…3ec5d8e813` |

`regexp-escape-guard.mjs` at end: `2922f042c0e2a595…270f17f8` (unchanged — see Risks: my first cut added a
second escape copy and the one-copy guard caught it).

---

## The point of the pass

Seven rounds of *prose repair* did not converge: round 6's human sweep of the same two files found 5, its
independent reviewer found 4 more — **5 found / 4 missed**. So this pass builds the *machine* first, lets it
find the instances, then fixes what it reports. The class is D-025/D-026: **a claim about the instrument — a
header sentence, a check name, a section comment, a written number, a pasted transcript — that the mechanism
it describes does not support.** Never a behavioural defect; the mechanism was verified correct every round.

**On its first run against the files at the base commit, the check found 7 findings across the two
instruments and the report — every instance the human had swept, plus the baseline number the reviewer
measured** (the three it did not find are named in §5, with reasons). The four rules below are the reviewer's
four shapes, built in the widened form the review required.

---

## §1 The four rules, and the seed / mutation that proves each

Each rule ships a **seeded violation that makes it fire** and a **mutation of the rule that makes it stop**,
both asserted in `factory-guard.check.mjs`. All are *detectors over named claim shapes with a declared
ceiling* (D-020's honest limit stands: no machine decides "the prose is true").

| # | rule (D-026 shape) | seeded violation → the guard fires | mutation that stops it → the seed passes | the instances it found at base |
|---|---|---|---|---|
| **1a** | construct presence — an exclusive git-call claim must name every git call the file makes | header says *the only git call is `cat-file -e <sha>^{commit}`* while the file also runs `execFileSync('git', ['ls-files', …])` → `FINDING zz-exclusive.mjs:2` | `if (missing.length) {` → `if (false) {` | `factory-guard.mjs:88` |
| **1b** | construct presence — a named alternative must exist in the source | *the `ZZQ` alternative matches the label* with no `ZZQ` in the file's mechanism code → `FINDING zz-alternative.mjs:2` | the alt test → `if (false) {` | the `@{…}`-style claim (no live instance this round; the fix landed in round 6) |
| **1c** | construct presence — a phrase the instrument records as *narrowed away* must not be restated as current | one file abandons `"zz-old formula"`, a second restates it → `FINDING zz-reuse.mjs:2` | the `indexOf` scan → `for (let at = -1; …)` | `factory-guard.mjs:683`, `factory-guard.check.mjs:678` |
| **1d** | construct presence — a capability claim the rule lacks: the header pointer "resolves" what it names | *the rule is about a resolvable pointer* while the rule shape-tests (`HEADER_POINTER`) → `FINDING zz-resolution.mjs:2` | the capability test → `if (false) {` | `factory-guard.mjs:48` (+`:337`), `factory-guard.check.mjs:325` |
| **2** | **check-file prose** — read body comments, and check NAMES **on the line that opens the call** (26 of this file's 90 names; a name split across lines escapes — probe F) | a claim carried by a `check('…')` NAME on the opening line → `FINDING zz-by-name.check.mjs:5` | stop reading names (`^check(` → `^zznevercheck(`) | `factory-guard.check.mjs:678` |
| **3** | **prose number vs artifact** — a stated derived quantity must equal the map/run | *the baseline is 999 recorded occurrences* vs the map's 628 → `FINDING zz-number.mjs:2` | the number test → `if (false) {` | `factory-guard.check.mjs:460` |
| **4** | **transcript reproducibility** — a pasted `count-provenance-unresolvable` transcript citing a file under `.scratch/` must cite a line carrying its sha, or be marked historical (a citation of any other path is a ceiling) | a pasted finding cites its own `:9`, which does not name the sha → `FINDING …zz-transcript.md:5` | the reproduction test → `if (false) {` | `.scratch/v28/reports/slice-6c-fix-6.md:1360` |

Rules 1 and 2 share the prose collector: rule 1 supplies the *claim tests* over every comment line; **rule 2
extends coverage to the check NAMES written on the line that opens the call** — body comments and those names
were read by nothing before this pass. A name split across lines (`check(\n  '…'`) is still NOT read: 26 of
this file's 90 names are read, 64 are not (probe F). The commit split is per rule; intermediate commits are
green.

---

## §2 Raw proof — each rule's seeded-fires and mutated-stops output

A throwaway root per rule (`scripts/guards/zz-*.mjs`, or a report for rule 4), run against the pristine guard
and then against a one-line mutant of it. Raw stdout, findings and exit codes only:

```
--- RULE 1a seeded (exit 1) ---
  FINDING [instrument-headers-honest]: zz-exclusive.mjs:2: the prose says the only git call is `cat-file -e <sha>^{commit}`, but this file also invokes `git ls-files` — name every call, or drop the exclusivity
FAIL — 1 factory finding(s).
--- RULE 1a mutated (exit 0) ---
PASS — the registry can be trusted and no work item claims evidence it does not have.
--- RULE 1b seeded (exit 1) ---
  FINDING [instrument-headers-honest]: zz-alternative.mjs:2: the prose names a `ZZQ` alternative, but no such construct appears in the file's own source
FAIL — 1 factory finding(s).
--- RULE 1b mutated (exit 0) ---
PASS — the registry can be trusted and no work item claims evidence it does not have.
--- RULE 1c seeded (exit 1) ---
  FINDING [instrument-headers-honest]: zz-reuse.mjs:2: the prose restates `zz-old formula`, which this instrument records as the wording it narrowed away — state what the mechanism does instead
FAIL — 1 factory finding(s).
--- RULE 1c mutated (exit 0) ---
PASS — the registry can be trusted and no work item claims evidence it does not have.
--- RULE 1d seeded (exit 1) ---
  FINDING [instrument-headers-honest]: zz-resolution.mjs:2: the prose claims the header pointer RESOLVES what it names, but the rule only tests the pointer's SHAPE — say what the mechanism does
FAIL — 1 factory finding(s).
--- RULE 1d mutated (exit 0) ---
PASS — the registry can be trusted and no work item claims evidence it does not have.
--- RULE 2 seeded (exit 1) ---
  FINDING [instrument-headers-honest]: zz-by-name.check.mjs:5: the prose names a `ZZQ2` alternative, but no such construct appears in the file's own source
FAIL — 1 factory finding(s).
--- RULE 2 mutated (exit 0) ---
PASS — the registry can be trusted and no work item claims evidence it does not have.
--- RULE 3 seeded (exit 1) ---
  FINDING [instrument-headers-honest]: zz-number.mjs:2: the prose says the baseline is 999, but the map derives 628 — point at the map instead of typing its size
FAIL — 1 factory finding(s).
--- RULE 3 mutated (exit 0) ---
PASS — the registry can be trusted and no work item claims evidence it does not have.
--- RULE 4 seeded (exit 1) ---
  FINDING [transcript-reproduces]: .scratch/v28/reports/zz-transcript.md:5: the pasted run cites .scratch/v28/reports/zz-transcript.md:9, which does not carry `deadbee` — a transcript that cannot reproduce at this commit (mark it historical if it is a draft)
FAIL — 1 factory finding(s).
--- RULE 4 mutated (exit 0) ---
PASS — the registry can be trusted and no work item claims evidence it does not have.
```

Each pair is also asserted as checks: `factory-guard.check.mjs` now runs **90 checks** (was 74), the 16 new
ones being these 7 seeds + their 7 mutations + the two mutations that close the pre-existing vacuity (§4.5).
The run-time counter (`ran`), the printed `✓` lines and the call sites all read **90**:

```
printed ✓: 90        call sites (^ *check\(): 90        grep 'check(': 92   (the two extras are strings)
factory-guard check: all 90 checks passed.
```

---

## §3 What the check found on its FIRST run (the point of the pass)

Run against the **base** guard, check file and report (a `/tmp` root holding the committed versions), the new
guard — before any of this pass's fixes — printed exactly this:

```
$ node scripts/guards/factory-guard.mjs --root /tmp/firstrun --repo "$PWD"
  FINDING [instrument-headers-honest]: factory-guard.check.mjs:325: the prose claims the header pointer RESOLVES what it names, but the rule only tests the pointer's SHAPE — say what the mechanism does
  FINDING [instrument-headers-honest]: factory-guard.check.mjs:460: the prose says the baseline is 4, but the map derives 628 — point at the map instead of typing its size
  FINDING [instrument-headers-honest]: factory-guard.mjs:48: the prose claims the header pointer RESOLVES what it names, but the rule only tests the pointer's SHAPE — say what the mechanism does
  FINDING [instrument-headers-honest]: factory-guard.mjs:88: the prose says the only git call is `cat-file -e <sha>^{commit}`, but this file also invokes `git ls-files` — name every call, or drop the exclusivity
  FINDING [instrument-headers-honest]: factory-guard.check.mjs:678: the prose restates `the revision of a counted git command`, which this instrument records as the wording it narrowed away — state what the mechanism does instead
  FINDING [instrument-headers-honest]: factory-guard.mjs:683: the prose restates `the revision of a counted git command`, which this instrument records as the wording it narrowed away — state what the mechanism does instead
  FINDING [transcript-reproduces]: .scratch/v28/reports/slice-6c-fix-6.md:1360: the pasted run cites .scratch/v28/reports/slice-6c-fix-6.md:1194, which does not carry `badc0de` — a transcript that cannot reproduce at this commit (mark it historical if it is a draft)
FAIL — 7 factory finding(s).
```

**7 findings, mapping to every instance the human and reviewer had found by hand, and two more they had
named but the machine had never caught together.** No mechanism was widened to produce them: the fourteen
matcher constants are untouched by this pass (the diff to `factory-guard.mjs` is prose, the new rule functions,
and no edit inside the constants block).

---

## §4 The instances, and the fix for each

### 4.1 `factory-guard.mjs:88` — "the only git call is `cat-file -e <sha>^{commit}`" (FALSE)

There are **two** git calls, and the second runs on every worktree scan: `git ls-files -z` at the tracked-set
disclosure (`:1272`; the run's own *"git tracks 126"* note is the proof). Fixed by naming both calls in the
SCOPE block:

```
//   - the git repository those provenance tokens are resolved against: the
//     `--repo <dir>` argument when given, else the scan root when it is a
//     worktree, else this instrument's own repository. Two git calls are made
//     against it: `cat-file -e <sha>^{commit}` verifies a provenance sha, and
//     `ls-files -z` reads the index to disclose which scanned report/brief files
//     git tracks.
```

and `:93`'s *"PRESENCE ON DISK, not `git ls-files`"* is qualified to say the `ls-files -z` call is the
disclosure, not the set that is read.

### 4.2 `factory-guard.mjs:682-684` — the D-025 instance surviving verbatim

The constants comment still said position (b) was *"the revision of a counted git command"* while the header
240 lines up had been narrowed to *"the FIRST sha-shaped token … the one before the first `| wc`"*. Fixed to
match the header. The header's own abandonment sentence (`used to claim … "the revision of a counted git
command"; it was narrowed`) is kept, so rule 1c remembers the phrase and will fire if it is ever restated.

### 4.3 `factory-guard.check.mjs:678` — a check NAME stating the abandoned formula

`'the revision of a counted git command is verified too (valid sha passes)'` — its sibling had been renamed
in the same commit and this one had not. Renamed to the sibling's wording, `'the FIRST sha-shaped token of a
counted git command is verified too'`. **Rule 2 is what finds it**: the name is read now (it was not before),
and rule 1c recognises the phrase the header records as abandoned.

### 4.4 The `instrument-headers-honest` rule bullet — a resolvability the rule does not have

`factory-guard.mjs:45-48` and its JSDoc said a claim *"names the commit … that shows it"* / *"what makes the
claim checkable"*, and `factory-guard.check.mjs:330` said *"a resolvable pointer"*. Measured, the rule
requires only a **hex-shaped** pointer (`HEADER_POINTER`), never a resolvable one. All three are corrected to
say hex-shaped, and the rule now states explicitly that it does not verify the commit exists (that is the
`count-provenance-unresolvable` half, for counts). **Rule 1d** is what finds the claim.

### 4.5 `factory-guard.check.mjs:460` — "the baseline for this key is 4" (the map says 2)

Rule 3 found the number. The recorded baseline for that `slice-6c-fix-1-review.md` key — the historical label
whose spelling ends in the bare `HEAD` token — is **2**, not 4.
Fixing the number alone would have left the check it belonged to **insensitive to its own named failure
mode**: with the baseline at 2, both single-match and per-line counting saw more than 2 and failed, so the
check was green with the regression in place (the reviewer's blocking 5). Fixed in both directions:

- the seed now writes **three** occurrences with **two on one line**, so single-match counting sees exactly
  the baseline (2) and passes while per-line counting sees 3 and fails;
- a new `MUTATION: restoring single-match counting lets that seed PASS` mutates
  `line.matchAll(BARE_HEAD_COUNT)` to a one-match form and turns the seed green — the named failure mode is
  now actually tested.

The same change also closed the §19 false universal: `wordClass`'s *"no single mutation makes all five pass
at once"* is false (the reviewer paired it with the gap window `{0,5}`→`{0,0}`). Rather than declare an
exception, this pass **adds that mutation** (`MUTATION: narrowing the gap window to {0,0} lets that seed
PASS`), so §19's *"Every case below is paired"* is now simply true.

### 4.6 `slice-6c-fix-6.md` — the §R15 transcript and the §R12 disclosure (FALSE)

**(a) §R15** (report `:1351-1367`) pasted a five-line run whose fifth line — a `count-provenance-unresolvable`
finding naming `badc0de` at `:1194` — **cannot be produced by the committed file**: `:1194` prints
`guard-<fragment>`, and the block dates to a draft that still held the literal. It is now labelled a
**HISTORICAL DRAFT TRANSCRIPT** with the reason, its false labels corrected (the fifth line is the **decidable
half**, not a detector-half finding; the two sha literals are not both rendered — `:1190` and `:1360` print
literals), and the broken fence pair fixed. Rule 4 is what found it (the pasted finding cites its own file at
a line that does not carry its sha).

**(b) §R12** (`:1198-1203`) claimed *"Two hex literals … are written `<bogus>`-style placeholders (the range
endpoint of the first seed and the filename fragment of the second)"*. The range endpoint at `:1190` is the
**literal** `deadbee`; only the fragment is rendered. Corrected to say which is which and why a literal in the
fragment's position would make the report a finding.

---

## §5 The fresh sweep — what the machine did NOT find, said out loud

A sentence-by-sentence read of the final `factory-guard.mjs` header/body comments and all 90 check names
against their bodies found **two** things the machine rules do not decide, plus one wording note:

1. **§19's mutation-pairing universal** — a claim *about the check file's own mutation coverage* ("no single
   mutation …"). Deciding it needs the check to run mutations against its own seeds; that is the check file's
   job, not a prose rule's. **Fixed by adding the missing mutation**, which makes the claim true rather than
   weakening it. Named here as the residue the four rules do not cover.
2. **§R12's false disclosure** — a claim about how a transcript rendered its own literals. No rule decides
   "the transcript is honest with you"; corrected by hand.
3. **"a resolvable revision" wording** (`factory-guard.check.mjs` control name; previously noted by the
   reviewer as non-blocking, "a wording note, not a defect"): the arm stands down on a `FIXED_SHA` *shape* and
   the sha is then verified separately, so the pair closes the hole. Left as-is, flagged here.

After those, **a re-read of the same two files, their body comments and all their check names found no further
instance** — by eye: the machine itself reads only 26 of the 90 names (see §10.2), so this part of the sweep is
human, not machine. The header, the constants comments, the ceilings, the SCOPE list and the names it read now
state what the mechanism does.

---

## §6 The baseline, re-derived twice (never hand-edited; idempotent)

No new bare-HEAD occurrence survived the pass, and the re-derivation reproduces the base maps **byte-for-byte**
(`git diff` on the maps: 0 changed lines). Run twice to prove stability:

```
$ node /tmp/derive-baseline.mjs "$PWD"
re-derived: no-bare-head-count 628 occurrence(s) / 399 key(s); unresolvable-sha 10 record(s) / 2 key(s)
  sha record: .scratch/v28/reports/slice-6c-fix-6-review.md::deadbee x9
  sha record: .scratch/v28/reports/slice-6c-fix-6-verify.md::deadbee x1
$ node /tmp/derive-baseline.mjs "$PWD"      # idempotent — identical
re-derived: no-bare-head-count 628 occurrence(s) / 399 key(s); unresolvable-sha 10 record(s) / 2 key(s)
```

The absorber's map is unchanged at **10 records / 2 keys**, and this report's own quotations stay inside the
628-occurrence baseline the derivation already holds.

---

## §7 The gates, raw

```
$ node scripts/guards/factory-guard.mjs
PASS — the registry can be trusted and no work item claims evidence it does not have.        exit 0
$ node scripts/guards/factory-guard.check.mjs
factory-guard check: all 90 checks passed.                                                   exit 0
$ node scripts/guards/regexp-escape-guard.check.mjs
regexp-escape-guard check: all 12 checks passed.                                             exit 0
$ bash scripts/guards/run-all.sh
GUARDS: PASS — all deterministic rules hold.                                                 exit 0
$ npm run verify                                                                             exit 0
 Test Files  71 passed (71)
      Tests  2067 passed (2067)
oxlint warnings (`: warning `)  81
oxlint errors   (`: error `)    0
  ok — AGENTS.md (1789 words, ceiling 1800)
```

| measure | base | this pass | delta |
|---|---|---|---|
| test files | 71 | **71** | 0 |
| tests | 2067 | **2067** | 0 |
| oxlint warnings | 81 | **81** | 0 |
| oxlint errors | 0 | **0** | 0 |
| `AGENTS.md` words / ceiling | 1789/1800 | **1789/1800** | 0 |
| `factory-guard.check.mjs` | 74 checks | **90 checks** | **+16** (7 seeds + 7 rule mutations + wordClass pairing + F2 single-match) |
| bare-head baseline | 628 occ / 399 keys | **628 / 399** | 0 |
| unresolvable absorber | 10 records / 2 keys | **10 / 2** | 0 |

Every verify delta is accounted for: the pass touches `scripts/guards/factory-guard.{mjs,check.mjs}` and two
`.scratch/v28/reports/*.md` only — no `src/`, no `e2e/`, no `*.test.mjs`. The +16 checks are the seven seed /
mutation pairs above plus the two that close the pre-existing vacuity.

---

## §8 Ceilings and residual risks (the honest limit)

- **What the four rules decide.** Each is a *lexical detector over named literal phrasings*, not a decision
  procedure for "the prose is true" (D-020). The per-rule phrasings and the measured residue are stated in the
  guard header and in **§10** below: **eleven fresh class instances were built and all eleven escaped.**
- **Not decided by any rule (the residue):** the §19 mutation-pairing universal and the §R12 disclosure —
  both found by this pass's sweep, both fixed, and named in §5 — plus the eleven paraphrases in §10.2.
- **`ocr`'s D-024 items remain open and untouched:** `resolveRepo` (`--repo` with no value throws),
  `isCommit`'s bare `catch` (a git-less machine inverts the check), the check harness's cleanup handler
  registered after the checks. Mechanism deliberately untouched this pass.
- **The position-(b) hole stays open by ruling:** `git diff 1c3471a..deadbee | wc -l` passes with `deadbee`
  unchecked. No matcher was widened (D-024), and the header still names the ceiling.
- **Rule 2 coverage is check names on the call's opening line — 26 of the 90 names, 64 unread (71 %).**
  A name split across lines (`check(\n  '…'`) is not read; the SCOPE line and the report now say exactly that,
  with the measured count, so no sentence claims the wider rule.
- **The one-copy guard earned its keep this pass:** my first implementation of rule 1c inlined the
  `replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` escape, and `regexp-escape-guard.check.mjs` failed it (5 findings)
  before the shared helper was avoided in favour of an `indexOf` scan. Recorded, not silenced.

---

## §9 Requirements traceability

| requirement (the brief) | status | evidence |
|---|---|---|
| Rule 1 construct presence — a named construct must exist in the file's source | **built** | §1, §2; finds `:88`, `:683`, `:48`/`:325` |
| Rule 2 check-file prose — read `*.check.mjs` names and body comments | **partially met** | body comments read; check NAMES on the opening line only (26/90; probe F escapes) — §1, §2, §10.2 |
| Rule 3 prose number vs artifact | **built (one phrasing)** | `the baseline is/holds N`; any other number phrasing escapes (probe D) — §1, §2, §10.2 |
| Rule 4 transcript reproducibility | **built (`.scratch/` citations only)** | a non-`.scratch/` citation or another rule's transcript escapes (probes E, M) — §1, §2, §10.2 |
| Each rule: a seeded violation that fires AND a mutation that stops it | **met** | §2, raw output shown for all seven |
| Fix `factory-guard.mjs:85-88` (the "only git call") | **met** | §4.1 |
| Fix `factory-guard.check.mjs:678` (abandoned formula in a name) | **met** | §4.3 |
| Fix `factory-guard.mjs:682-684` (D-025 #7 verbatim) | **met** | §4.2 |
| Fix the `instrument-headers-honest` resolvability claim | **met** | §4.4 |
| Fix the section's false universal about its own mutations | **met** | §4.5 (paired, not declared away) |
| Fix the report's §R15 transcript and false disclosure | **met** | §4.6 |
| Do NOT widen any matcher | **met** | §3; the constants block is untouched |
| Do NOT weaken a rule to pass | **met** | no rule loosened; two controls got stronger mutations |
| Do NOT hand-edit the baseline — re-derive, twice | **met** | §6 |
| Gates: guard PASS, check exit 0 with counter = independent count, regexp 12/12, run-all PASS, verify with deltas accounted | **met** | §7 |
| Commit per rule | **met** | four commits, `ff75270`/`15c6093`/`86af333`/`2d64646`, each green |
| The closing evidence: instances found on first run; a fresh sweep found none it missed | **met for the 7 findings; corrected in §10** | §3 (7 findings); §10 names the measured 11/11 paraphrase residue and the two fresh class instances this pass's own artifacts carried (B1, B2), both fixed |

---

## §10 FINAL — the deciding question, measured: the check catches the handed instances, not the class

*(Appended after the independent review returned NEEDS_CHANGES on **B1** — the rule-2 coverage claim — and **B2**
— the `transcript-reproduces` scope. The review ruled the check is the right **shape** and that it be kept; only
the CLAIMS changed. Verifier: `VERIFY: PASS`.)*

### §10.0 The deciding question, answered

The review built eleven fresh instances of the class and all eleven escaped. I rebuilt them and reproduced the
result against the committed guard (`/tmp/probes8.mjs`, throwaway roots, real `factory/config.json`, `--root`
plus `--repo`) — **11 of 11 escape, exit 0, no finding** — and the positive control (the literal *the only git
call is* phrasing) FIRES, so the harness is not why:

```
ESCAPES | A  (exit 0)   absent-construct claim in a BODY comment ("handles `--no-pager`")
ESCAPES | B  (exit 0)   false capability header sentence ("resolved against the index with `cat-file -e`")
ESCAPES | C  (exit 0)   check-NAME capability claim ON the opening line ("resolves via `git rev-parse`")
ESCAPES | D  (exit 0)   body-comment wrong number ("the map holds 999 recorded occurrences")
ESCAPES | E  (exit 0)   pasted instrument-headers-honest transcript that does not reproduce
ESCAPES | F  (exit 0)   check NAME split across lines carrying `ZZQSPLIT`
ESCAPES | G  (exit 0)   paraphrase of 1b: "an alternative for `@{x}` is matched"
ESCAPES | H  (exit 0)   paraphrase of 1a: "the sole git invocation is `cat-file -e`"
ESCAPES | L  (exit 0)   header claim naming an absent construct ("matches `git rev-parse` too")
ESCAPES | M  (exit 0)   pasted count-provenance transcript citing scripts/guards/p.mjs:99 (not `.scratch/`)
ESCAPES | N  (exit 0)   paraphrase of 1d: "the pointer is checked against git"
control 1a (literal phrasing): FIRED (harness works)

11 of 11 fresh class instances escaped
```

**This is not a defect in the rules. It is D-020's lexical/semantic limit, now measured rather than argued.**
What failed was the DECLARATION: §1/§2 and the guard header presented the rules as covering the *shapes* (C, D,
E and M are shapes rules 2/3/4 claim), which these eleven refute.

### §10.1 Each rule's TRUE boundary — the literal phrasing it is keyed to

| rule | fires on (the literal) | a paraphrase of the same shape that escapes |
|---|---|---|
| 1a exclusive git call | *the only git call is* + a backticked command | "the sole git invocation is" (H) |
| 1b named alternative | a backticked token immediately followed by the word *alternative* / "X is its own alternative" | "an alternative for `X`" (G) |
| 1c abandoned formula | a phrase the file records with *used to claim* / *was narrowed*, restated as current | a phrase not so recorded (no other abandonment is detected) |
| 1d capability claim | *resolvable pointer*, *makes the claim checkable*, *the line that shows it* | "the pointer is checked against git" (N), "resolved against the index" (B) |
| 2 check-file prose | body comments (any); check NAMES **on the call's opening line** (26 of 90 here) | a split check name (F); a capability claim in a name (C) |
| 3 prose number | *the baseline is N* / *the baseline holds N* | "the map holds 999" (D); any non-baseline number |
| 4 transcript | a pasted `count-provenance-unresolvable` finding citing `.scratch/`, whose sha is absent from the cited line | another rule's transcript (E); a non-`.scratch/` citation (M) |

The guard header now carries this boundary in the `instrument-headers-honest` bullet (the phrasings, the 11/11
paraphrase residue, and the 26-of-90 name coverage), and the `transcript-reproduces` bullet, docstring and
`ok —` claim say `.scratch/` citations only.

### §10.2 The residue, with its number

**Eleven fresh class instances constructed; eleven escaped** (A, B, C, D, E, F, G, H, L, M, N). Each rule is a
detector over the *named spellings* in §10.1, not a decision procedure for the prose; a restatement in any other
wording is invisible. Adding one phrasing per escape is explicitly NOT the fix — it is the treadmill the human's
ruling stopped; the deliverable is this declared ceiling, with its measurement.

### §10.3 The two fresh class instances in THIS pass's own artifacts — found and fixed

1. **B1 — the rule-2 coverage claim was false.** §1 row 2 said "read check NAMES and every body comment" and §2
   said rule 2 "extends coverage to the check NAMES — exactly the hole the review named". Measured: the name is
   read only on the line that opens the call — **26 of the 90 names, 64 unread (71 %)**; the same claim split
   across lines escapes (probe F). **Fixed:** §1, §2, §5, §8 and §9 now state the measured coverage; the SCOPE
   line already named the boundary but the headline did not.
2. **B2 — the `transcript-reproduces` sentence misstated its mechanism.** The header bullet, the JSDoc and the
   `ok —` claim said a transcript "that cites a file IN this repository"; the mechanism checks only `.scratch/`
   citations (`factory-guard.mjs:1424` skips every other path). Probe M (`scripts/guards/p.mjs:99`, bogus sha) →
   exit 0. **Fixed:** all three now say "cites a file under `.scratch/`", with other paths and other rules named
   as ceilings.
3. **N3 — a written number the artifacts disagreed on.** §3 said "the thirteen matcher constants"; the ledger
   said 14; the measured artifact is **14**. Corrected to fourteen — and N3 was itself an instance of the class
   (a written number the artifact contradicts).

### §10.4 What was corrected, and what was kept

- **Corrected (claims only):** report §1 rows 2 and 4; §2's rule-2 sentence; §3's count (thirteen → fourteen);
  §5's "no further instance" (now names the machine's 26/90 and says this part of the sweep is human); §8's
  rule-2 and residue bullets; §9's traceability rows; the guard's `instrument-headers-honest` bullet and its
  `transcript-reproduces` bullet, docstring and `ok —` claim.
- **Kept:** the four rules (each fires on its seed and stops on its mutation — §1/§2); the first-run **7**
  findings (§3, reproduced byte-for-byte by the review); no matcher widened; the baseline byte-identical; the
  two hand-fixed residue items (§5); **90** checks.

### §10.5 Re-measured gates (after the claim changes)

```
$ node scripts/guards/factory-guard.mjs
PASS — the registry can be trusted and no work item claims evidence it does not have.        exit 0
$ node scripts/guards/factory-guard.check.mjs
factory-guard check: all 90 checks passed.                                                   exit 0
$ node scripts/guards/regexp-escape-guard.check.mjs
regexp-escape-guard check: all 12 checks passed.                                             exit 0
$ bash scripts/guards/run-all.sh
GUARDS: PASS — all deterministic rules hold.                                                 exit 0
$ npm run verify                                                                             exit 0
 Test Files  71 passed (71)
      Tests  2067 passed (2067)
oxlint warnings (`: warning `)  81
oxlint errors   (`: error `)    0
  ok — AGENTS.md (1789 words, ceiling 1800)
```

The claim changes move no matcher and add no bare-HEAD occurrence: the baseline is unchanged at **628
occurrences / 399 keys** (absorber **10 records / 2 keys**), so no re-derivation was required.
