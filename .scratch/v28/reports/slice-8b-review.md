# Slice 8b — fresh-context review

**Verdict: NEEDS_CHANGES.**

**DISCLOSURE (required): I am a sibling model, not independent.** I am the same model family as the builder and I
was handed the builder's report as an input. Everything below that is not a *measurement I ran in this turn* is
therefore weak evidence; I have marked what I ran. No file was modified to produce this review except this report.

Reviewed range `aa331d0..HEAD` (10 commits). Worktree `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`.

## What I ran (raw, this turn)

| command | result |
|---|---|
| `git diff -w --stat aa331d0..d75c5e9` | empty — commit A is whitespace-only |
| `git diff --numstat aa331d0..d75c5e9 \| awk '$1!=1 \|\| $2!=1'` | empty — every file exactly `+1/-1` |
| `git show --stat d75c5e9` file set vs the pre-sweep guard findings | **identical 78/78 sets** (src 45 / e2e 20 / scripts 13) |
| `node scripts/guards/trailing-newline-guard.mjs /tmp/rev-prefix` (detached worktree at `aa331d0`) | `323 text file(s) read … FAIL — 78 trailing-newline finding(s).` EXIT=1 |
| `node scripts/guards/trailing-newline-guard.check.mjs` | `PASS — all 8 checks` EXIT=0 |
| `bash scripts/guards/lib-sibling-guard.sh` | `ok — all 55 non-exempt module(s) …` EXIT=0 |
| `node scripts/guards/lib-sibling-guard.check.mjs` | `PASS — all 7 checks` EXIT=0 |
| `node scripts/guards/factory-guard.check.mjs` | `all 115 checks passed` EXIT=0 |
| `bash scripts/guards/run-all.sh` | `GUARDS: PASS` EXIT=0 |
| `bash scripts/slice-diff.sh 8b` / `8a` | REFUSING, EXIT=1 (no base recorded) |
| `bash scripts/slice-diff.sh 1 -- scripts/guards/run-all.sh`; synthetic ledgers via `SLICE_DIFF_LEDGER` | ambiguous → REFUSING EXIT=1; unresolvable → EXIT=3; usage → EXIT=2 |
| widening the label predicate in a copy of the guard (`/tmp/wide/gX.mjs`) and running it on this repo | `107 raw-labelled block(s) read, 2 range summaries checked`, **143 findings**, EXIT=1 |
| throwaway factory roots against the CURRENT guard, the `f55bc12` guard and the `aa331d0` guard | see **B1** below |

I did **not** run `npm run verify` or any e2e spec (my lane may not produce the suite's evidence, and no e2e file
changed except by a newline). The report's `Test Files 71 passed (71) / Tests 2063 passed (2063) / oxlint 81` is
therefore **unverified by me** — it is specific and falsifiable, not vague, so I do not raise it as a missing-evidence
blocker; I simply did not reproduce it.

## Adjudication — one line each

- **THE ESCAPE — does not hold.** The *named* escape is closed **by deletion, not by a fourth condition** (proof
  below), but the repair's own added region kind opens a **new reachable escape with the identical signature** —
  `NOTHING was checked` + PASS, exit 0 — over a labelled, fabricated fenced block. **That is D-031's offence, paid
  a second time (`ladder:`).**
- **THE COVERAGE LOSS — the measurement is real; DECLARING is defensible; but the declaration is now incomplete.**
  I reproduced the widening: a mid-line/word-token label predicate makes the live corpus red (`107 blocks read, 2
  range summaries checked, 143 findings`, including the named false attribution at
  `.scratch/v28/reports/slice-8a-verify-4.md:122`) — see "Reproduction" below. Declaring rather than widening is the
  right call *for that shape*, and the boundary is named where it belongs (`factory-guard.mjs:1571-1576`). It is not
  an undeclared hole wearing a declaration; the undeclared hole is a different, new one (**B1**).
- **THE TWO NEW GUARDS' CHECKERS — neither ships a seed *and a mutation* for every check.** `trailing-newline-guard.check.mjs`
  = **8 checks / 2 mutation calls**; `lib-sibling-guard.check.mjs` = **7 checks / 2 mutation calls**. `lib-sibling-guard.check.mjs:10`
  claims "Each verdict below therefore gets its own seed AND the mutation that flips it" over five verdicts of which
  three have no mutation → **FALSE CLAIM** (non-blocking, N4). The two mutations that do exist in each are *real*
  detection mutations (the mutant's exit flips to 0) — verified.
- **DOES `lib-sibling-guard` FAIL AT `checked=0`?** **HOLDS.** `lib-sibling-guard.sh:120` (`elif [ "$checked" -eq 0 ]`)
  sets `FAIL=1`, and the checker's exempt-only root exits 1 with `the scan read nothing`; the missing-`src/lib` path
  (`:53-56` before) is a FINDING, not a `SKIP … exit 0`. The `checked=0` hole it was registered for is closed.
- **THE ORDERING — HOLDS, and is better than reported.** Sweep `d75c5e9` is separate and first; the guard `3bd7eb3`
  fires on the pre-sweep tree (`78 findings, EXIT=1`) and is green on the swept tree; the sweep's file set is
  **identical** to the pre-sweep finding set, so "only trailing newlines" is proven for the *right* 78 files.
- **`slice-diff.sh` — the no-base refusal behaves; the script's declared behaviour is FALSE for slice `6c`** (**B3**),
  and its `-- usage` output is truncated mid-sentence (N5). The refusal paths themselves are correct and I exercised
  all four exit codes.
- **The three brief variants.** `slice-8b.md` = items 1-2 only (its own SCOPE CUT), `slice-8b-2.md` = the two specs +
  the two honesty fixes, `slice-8b-3.md` = the `| void` tightening + the post-unmount effect + the five leftovers.
  All three scope themselves clearly, and the builder's table is accurate. The defect is structural and worth naming
  (**N1**): the split was by subject, and `slice-8b.md` **§6 (the `useCropStep` await guard)** match none of the three
  subjects, so it was owned by nobody; meanwhile `slice-8b.md`'s own **Acceptance list still demands it** (its
  criterion 5: "guard count increased by two (the newline guard and the await guard)"; criterion 6). A brief whose
  acceptance criteria are unsatisfiable under its own scope cut is a brief defect. The builder caught it and
  registered it in `plan.md` rather than dropping it silently — the right move.

## BLOCKING FINDINGS

### B1 — `ladder:` [MECHANISM / reachable escape] the new blockquote region arm opens a D-031-shaped escape

`scripts/guards/factory-guard.mjs:1618` adds a fourth **region kind** (`} else if (/^\s*>/.test(line)) {`). A region
*consumes the nearest label above it* (`:1646-1651`, `previousEnd = region.end`). So a blockquote line placed between
a `raw:`-labelled intro and the fenced block that intro actually introduces **steals the label**: the fence gets
`intro === -1` (unread), the label is in `attributed` (so the tripwire at `:1684` does not fire), and the run PASSES
while printing the D-031 signature.

Minimal seed (`.scratch/v28/reports/zz-raw.md` in a throwaway factory root — the checker's own `cleanRoot()` shape):

~~~text
# zz

proof — raw:

> a quote with no range in it

```
✓ 7–13 zz-spec.e2e.ts (all six legs)
```
~~~text

Measured, same root, three binaries:

~~~text
HEAD      exit=0   note — transcript-summary-agrees: 1 raw-labelled block(s) read, 0 range summaries checked
                   — NOTHING was checked: this scan read no line that states a step range beside its count
                   ok — … every floor meetable, every artifact present …
                   PASS — the registry can be trusted and no work item claims evidence it does not have.

f55bc12   exit=1   FINDING [transcript-summary-agrees]: …zz-raw.md:8: a raw block's summary line covers 7 entries
                   (7–13) but states "(all six" — a block claiming to be raw must reproduce its own arithmetic
aa331d0   exit=1   (identical)
~~~text

So: **pre-slice CAUGHT, post-slice PASSES**, and the guard publishes its PASS line over a labelled fabrication whose
arithmetic it never read. Control: the same seed with the `>` line replaced by nothing is CAUGHT at HEAD, so it is the
blockquote arm — not the rest of the rewrite — that opens this.

Three things make this the ruling's offence rather than a nit:

1. It is the **same signature** D-031 named: `0 … read`, `NOTHING was checked`, `PASS exit 0`.
2. It is **caused by the addition** made to close the previous escape (the arm was added so the 8 legitimate
   `>`-introduced brief labels would be read rather than trip the wire) — a repair trading a hole for an escape, one
   region kind over.
3. **The checker cannot see it, and the mutation it does ship actively conceals it.**
   `scripts/guards/factory-guard.check.mjs:1481-1489` removes the arm and asserts `quotedMiss.exit === 1 && /did not
   read/` — i.e. the mutant is **still red** (the tripwire fires). A mutation whose seed stays red cannot show that the
   arm is what prevents a pass; it only shows the *wording* changes. Had the check asserted "removing the arm returns
   the escape (exit 0)", the new shape would have been visible immediately.

There is **no seed anywhere in `factory-guard.check.mjs`** for "a region between a label and its fence" (I read the
whole file). The class is older than this slice in its *indented* spelling (an indented line between a label and its
fence passes on `aa331d0` too — measured), but the `>` spelling — the one D-031 is about — is a **new regression**,
and the arm's own justification is what makes it reachable in reports that quote.

**Adjudication of the ruling itself, stated plainly:** *no fourth condition on the label was added.* `LABEL_LINE`
was in fact **narrowed** (left word boundary, `:1533`). Two conditions were **deleted** — the quotation exemption
(`grep -n "lines.slice(index + 1)" scripts/guards/factory-guard.mjs` → no hits) and the 12-line window
(`grep -n "INTRO_LINES" …` → no hits); both confirmed in the diff as removed hunks. And the escape is closed **by the
deletion**: with the arm removed but the exemption still gone, the direct `>` fabrication still exits 1 (tripwire).
So the ruling was followed in form. It was violated in substance, by the *addition* made to preserve coverage.

### B2 — `ladder:` [MECHANISM] three of the new mutation checks in `factory-guard.check.mjs` mutate the failure's PRINTING, not its DETECTION

The report's own words: *"it had shipped two mutation anchors which mutated a failure's PRINTING rather than its
DETECTION — the seed stayed red, so the mutation proved nothing — and it copied a uniqueness `throw` into both new
checkers to prevent it."* That is true of `lib-sibling-guard.check.mjs`, and the uniqueness `throw` **is** present in
both new checkers. It is **not true of `factory-guard.check.mjs`**, where the same defect ships, measured:

| check | line | seed → mutant | verdict |
|---|---|---|---|
| `MUTATION: dropping the blockquote arm …` | `:1481-1489` | exit 1 COMPARISON → exit 1 TRIPWIRE | **printing only** |
| `MUTATION: bounding the label search to one line …` | `:1338-1346` | exit 1 COMPARISON → exit 1 TRIPWIRE | **printing only** |
| `MUTATION: dropping indented-block detection …` | `:1365-1376` | exit 1 COMPARISON → exit 1 TRIPWIRE | **printing only** |
| `MUTATION: not reading the label on the fence line …` | `:1395-1401` | exit 1 → exit 0 | real (detection) |

Each was run by me against its own seed with the mutation applied. The uniqueness `throw` does not protect against
this: the anchor is found exactly once, the mutation applies cleanly, and the seed's *verdict* never moves. The
assertions do require a message change, so the checks are not vacuous — but they cannot show the property their names
claim, which is precisely the blindness that let **B1** ship. This is the batch's oldest finding (the report itself
names it) reproduced inside the pass that claims to have caught and closed it.

### B3 — [FALSE CLAIM / coverage loss] `slice-diff.sh` resolves slice `6c` to a *fix-round* base and prints it as the slice's dispatch base

`scripts/slice-diff.sh:61-64` accepts **any** ledger line matching `^[^|]*Slice <id>` that also contains "dispatch"
— including fix-round lines. The ledger's only such line for 6c is:

`.scratch/v28/ledger.md:7156` — ``Slice 6c: fix round 3/5 dispatched (base `68080b0`, model cloud …)``

so:

```
$ bash scripts/slice-diff.sh 6c | head -2
slice-diff: slice '6c'  range '68080b0..14403db8c3a3d04d3b7073c4ca6ab07132945db9'
            base '68080b0' read from .scratch/v28/ledger.md (dispatch time, not typed now)
```

`:106` is the false sentence. Measured: `68080b0` is **23 commits and 41 files after** 6c's build tip
(`git merge-base --is-ancestor ce3479c 68080b0` → true; `git log --oneline ce3479c..68080b0 | wc -l` → 23;
`git diff --name-only ce3479c..68080b0 | wc -l` → 41). So a reviewer who runs the tool to review slice 6c — which is
the tool's entire purpose — is shown fix rounds 3-6 and told, in the header, that the base was *"chosen by
construction"* at the slice's dispatch. The refusal (`scripts/slice-diff.sh:88-93`) fires only on **ambiguity** (two distinct bases), so
this case passes silently. The tool prevents *typing* the base; it does not prevent *choosing* the wrong one, which is
the failure the brief says it exists to prevent. Contrast the two cases where it is right: line 18
(`Slice 1: dispatched (base 15ada15, …)`) and line 3191 (`## Slice 3: DISPATCHED (base c9ab382)`).

This is also the report's own evidence of the tool working: *"`6c` has several dispatch lines but only ONE carries
`(base …)`; the tool resolves it."* The resolution is what is wrong.

## NON-BLOCKING FINDINGS

- **N1 [MECHANISM, process]** One slice, three briefs, and one work item owned by none: `slice-8b.md` §6's
  `useCropStep` await guard is in no variant, while `slice-8b.md`'s Acceptance 5/6 still demand it
  (`src/components/useCropStep.tsx:27` still reads `Promise<void> | void`; `:167` still `=> void confirm(rect)`).
  Registered in `plan.md` by the builder — correct — but the brief's acceptance list should have been re-cut with its
  scope.
- **N2 [MECHANISM]** `scripts/guards/factory-guard.mjs:1659-1661`: `matchAll` iterates every range, but `stated` is
  extracted **once per line** (`:1660`), so a line with two pairs whose counts differ is compared against the wrong
  count and the guard emits a finding whose message asserts a contradiction the line does not contain. Measured:
  seed ``✓ 1–2 a.e2e.ts (all two legs) and ✓ 7–13 b.e2e.ts (all seven legs)`` (both correct) → HEAD **exit 1** with
  `covers 7 entries (7–13) but states "(all two"`; `aa331d0` → exit 0. The hole it was written for **is** closed
  (the round-5 seed ``✓ 1–6 … (all six legs)  ✓ 7–13 … (all six legs)``: pre-fix exit 0, HEAD exit 1), but **there is
  no seed or mutation for that shape in the checker** — the fix is unproven by the harness that claims a seed for
  every new path. The docblock's "EVERY such pair on a line is read, so no range is counted as checked without being
  checked" is therefore not supported as written.
- **N3 [UNDER-DECLARED BOUNDARY]** The widening measurement is real in kind but **not reproducible as stated**: the
  widened predicate is not recorded, and my reproductions give `35 blocks / 1 summary / 54 findings` for
  `(?:\braw:|\bverbatim:)` and `107 / 2 / 143` for `(?:\braw:|\bverbatim\b)`. The report's `102 blocks, 2 range
  summaries, 100+ findings` sits in that family and the named false attribution reproduces exactly
  (`.scratch/v28/reports/slice-8a-verify-4.md:122` → `covers 7 entries (7–13) but states "(all six"`), so the claim
  is **true in substance**; the figures are not bit-reproducible from the artifact (D-028: a load-bearing number
  should be reproducible, or dropped).
- **N4 [FALSE CLAIM]** `scripts/guards/lib-sibling-guard.check.mjs:10` — "Each verdict below therefore gets its own
  seed AND the mutation that flips it" over five verdicts; the missing-`src/lib` verdict (check 5) has a seed and **no**
  mutation, and the two controls have neither (controls need none). Same shape, one degree weaker, in
  `trailing-newline-guard.check.mjs:8-11` ("The two D-030 properties this guard carries get their own seeds and their
  own mutation") — only the empty-scan property is D-030; "this file has no newline" is not.
- **N5 [MECHANISM, cosmetic]** `scripts/slice-diff.sh:33` — `sed -n '/^# USAGE$/,/^# Exit:/p'` prints the `Exit:`
  line and stops, so the usage text ends mid-sentence: `Exit: 0 = diff printed, 1 = no base recorded (or ambiguous),
  2 = usage, 3 = base`. Also `slice-diff.sh` with pathspecs echoes the separator (`(diff restricted to: --
  scripts/guards/run-all.sh)`).
- **N6 [MECHANISM, D-030 residue]** `scripts/guards/trailing-newline-guard.mjs:89-91` — a file that fails to read is
  `continue`d: it is neither counted as text/empty/binary nor reported. A partial read failure is therefore silently
  dropped from the scan set; the header's "a scan that skipped a whole class of file cannot hide behind a pass" holds
  for the *empty* and *binary* classes, not this one. (A total failure still trips `if (text === 0)` at `:111`.)
- **N7 [MECHANISM, D-030 residue, pre-existing and declared]** `factory-guard.mjs:1755-1758`: every claim line is
  gated on its own non-zero count, so `rawSummaryLines === 0` silently drops the transcript claim from the `ok —`
  line while the run still prints `PASS — the registry can be trusted …`. On this repo the rule compares **0** range
  summaries every run (I reproduced: `16 raw-labelled block(s) read, 0 range summaries checked`), so *this rule's
  live signal is entirely synthetic* — declared in the report's Risks, unchanged by this slice, and it is the reason
  **B1** was invisible to the whole guard suite.
- **N8 [FALSE CLAIM, report honesty]** `.scratch/v28/reports/slice-8b.md` (Verify section): "no e2e spec was run by
  this slice, because **no e2e file changed**." Twenty e2e files changed in commit A (`d75c5e9`: `e2e/` 20). The
  intent ("no e2e file changed semantically") is true; the sentence is false as written.
- **N9 [declared deviation, correctly disclosed]** The coverage loss (dispatch finding 2) is DECLARED, not restored,
  and the dispatch said "FIXED there, not re-registered as a note". The builder says so plainly and measures why the
  alternative is a red gate. I judge declaring defensible *for that shape*; the item is not satisfied in the letter.
  Also left unedited (and disclosed with corrected numbers): `slice-8a.md:931/:953/:990/:1056`.
- **N10 [MECHANISM]** `scripts/guards/lib-sibling-guard.sh:120` only trips when **every** module is exempt/test. An
  allowlist that grows until one module remains unchecked still prints `ok — all 1 non-exempt module(s)`. The
  granularity gap is exactly D-030 instance 4's. The reason requirement on `EXEMPT` entries is enforced by comment
  only (`:47-58`).

## "Which set did I just stop watching?" (D-030, applied to this diff)

1. **The region-attribution set (new, blocking).** Adding the blockquote arm means the nearest-label-above rule can
   attach a label to a *different* region than the one it introduces, and the region that loses its label is read by
   nothing and reported by nothing (B1).
2. **The in-block set.** Every quoted line now enters `inBlock` (`:1640`), and `:1684` skips in-block labels. A label
   inside a blockquote that is not that quote's first line is therefore neither attributed nor tripped — the same
   silence the deleted exemption provided, at one granularity down.
3. **The unreadable-file set** (N6) and the **`repo: null` / provenance-unchecked set** (`factory-guard.mjs:1369-1383`
   — declared policy: "a printed note and no finding").
4. **The claim list.** The `ok —` line lists only claims whose count was non-zero, so the guard publishes *fewer*
   claims exactly when it checked less (N7) — the honest half of D-030, and the reason B1 reads as trusted.

## Requirements traceability

| requirement | status | evidence |
|---|---|---|
| `slice-8b.md` Acc 1 — commit A touches only trailing newlines | **met** | `git diff -w --stat` empty; numstat all `1/1`; file set identical to the pre-sweep finding set (78/78) |
| Acc 2 — guard in both `run-all.sh` places, `.check.mjs`, run against the pre-fix state | **met** | `:91` for-guard list + `:140` `run_check`; pre-sweep worktree → 78 findings EXIT=1 |
| Acc 3 — `slice-diff.sh` refuses a slice with no recorded base, output names the range | **met** (with B3) | `8b`/`8a` REFUSING EXIT=1; `1`/`3`/`6c` resolve; ambiguous → EXIT=1; unresolvable → EXIT=3 |
| Acc 4 — both specs able to fail; Enter phase 1 passes | **not met in this slice** | `slice-8b-2.md`'s subject; the builder did not do it (disclosed) |
| Acc 5 — `npm run verify` 0; guard count +2 (newline guard AND await guard) | **partially met** | guard count **+1**; the await guard is unassigned (N1). Verify claim reported, not reproduced by me |
| Acc 6 — the await guard catches the real `ProfilePage.tsx` case | **not met** | unassigned; `useCropStep.tsx:27` still `\| void` |
| Acc 7 — item 7's five honesty fixes; warnings still 81 | **not met in this slice** | `slice-8b-3.md`'s subject; `e2e/weekly-series.e2e.ts:21` still imports `readMarkerSession` unused |
| 8a finding 1 — the escape | **partially met / re-opened** | named spelling closed by deletion (proven); **new spelling open (B1)** |
| 8a finding 2 — coverage loss | **declared, not fixed** | reproduces; deviation disclosed (N9) |
| 8a finding 3 — the exempt set unwatched | **met, one granularity down** | exemption deleted; new sets 1-2 above |
| 8a finding 4 — false claims | **partially met** | `:1550-1551`'s sentence GONE; the claim universal rewritten and honest for the read set; a new falsifying state exists (B1); `slice-8a.md` untouched (N9) |
| 8a finding 5 — the unreproduced `31 of 104` | **declared, not fixed** | not touched; corrected measurement supplied (another lane's report) |
| 8a finding 6 — the missing fence-inline mutation | **met** | `check.mjs:1395-1401`, a real detection mutation (exit 1 → 0) |
| 8a finding 7 — `LABEL_LINE` left word boundary | **met** | `factory-guard.mjs:1533`; control `the sketch is a draw:` |
| 8a finding 8 — `INTRO_LINES` window | **met (by deletion)** | `grep -n "INTRO_LINES"` → no hits |
| 8a finding 9 — the early return omitting `rawSummaryLines` | **met** | `:1408-1414` returns all four keys + `report-scan-empty` finding |
| 8a finding 10 — recursive `ls-files` vs top-level scan | **met** | the `.filter((p) => p.split('/').length === 4)` depth filter |
| the two registered `checked=0` paths | **met** | `lib-sibling-guard.sh:120`; `factory-guard.mjs:1408-1414`; both seeded, both mutated |

## Reproduction of the widening (asked for explicitly)

In a copy of `factory-guard.mjs` I replaced only `const LABEL_LINE = /(?:\braw:|\bverbatim:)\s*\*{0,2}\s*$/i`:

| predicate in the copy | note | transcript findings |
|---|---|---|
| `(?:\braw:|\bverbatim:)` | `35 raw-labelled block(s) read, 1 range summary checked` | 54 |
| `(?:\braw:|\bverbatim\b)` | `107 raw-labelled block(s) read, 2 range summaries checked` | 143 |
| `(?:\braw\b|\bverbatim\b)` | `201 … read, 2 … checked` | 322 |
| `(?:\braw|\bverbatim)` | `202 … read, 2 … checked` | 332 |

Every one EXIT=1 against this repo, and each includes the false attribution the report quotes
(`.scratch/v28/reports/slice-8a-verify-4.md:122: … covers 7 entries (7–13) but states "(all six"`). **The measurement
is real**: widening the label to a mid-line token turns the gate red on the repo's own prose. My figures differ from
the report's `102 / 2 / 100+` because the report does not record which widened predicate it used (N3).

## Recommended next action

Fix **B1** first and in the shape the ruling implies: either take the attribution back so a region cannot steal a
label from a later region (the label belongs to the region it *introduces*), or delete the blockquote arm and accept
the 8 tripwire findings on the briefs. Ship a seed for "a region between a label and its fence" and a mutation whose
mutant **passes** (exit 0), not one whose wording changes; then re-cut **B2**'s three mutations to the same standard.
Then correct **B3**'s base selection/provenance sentence. Report's own class finding stands otherwise: the deletions
are real, the ordering is real, the sweep is exact, and `checked=0` is closed in both registered places.
