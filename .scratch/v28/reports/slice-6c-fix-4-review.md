# Slice 6c fix round 4 — independent review

**Lane:** fresh-context reviewer (rung 5 of the ladder). **Diff:** `git diff 9f20d02..876a516`, 5 files, +521/-10.
**Repo:** `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`. HEAD was `876a516` when the review started; it moved to `824f419` while I was reviewing (two orchestrator commits, `ed0dc8f` + `824f419`, touching only `factory/decisions.md` and `.scratch/v28/ledger.md` — the files this review judges are byte-identical at both: `git diff --stat 876a516..824f419` is those two paths, and the fix-4 report's sha256 is `e0a74203…` at both). **Every measurement below is pinned to an explicit commit**, never to `HEAD`, precisely so this movement cannot touch a number in this report.

**Disclosure, carried as instructed:** the implementer ran on `ollama-cloud/deepseek-v4.1-flash:cloud` and so
did I. I am a SIBLING, not an independent model — the measured D-007 gap (the reviewer floor is cleared by
exactly one registered model). Compensation applied deliberately: every factual sentence in the builder's
report (`.scratch/v28/reports/slice-6c-fix-4.md`) is treated as a CLAIM and reproduced against the artifact it
names, in the same call that records it.

**Byte-identity guard.** The repo is left untouched: no writes, no mutation except in `/tmp`. sha256 of the two
guard files at start and at end are recorded in the closing section.

---

## Measurements as produced

(written first, appended as evidence was produced)

### M1 — B1 re-measured, and the file shift checked (the builder's own citation claim)

```
$ git ls-tree -r --name-only 71bdd55 .scratch | wc -l   → 276
$ git ls-tree -r --name-only 20773ee .scratch | wc -l   → 277
$ git ls-tree -r --name-only 876a516 .scratch | wc -l   → 281
$ git show 9f20d02:.scratch/v28/reports/slice-6c-fix-3.md | wc -l      → 593
$ git show 876a516:.scratch/v28/reports/slice-6c-fix-3.md | wc -l      → 593
$ git show 876a516:.scratch/v28/reports/slice-6c-fix-3.md | sed -n '16p;17p;129p;526p'
:16  … One finding **rejects the brief's quotation of the old docstring**, not the brief's
:17  instruction — N2's "went stale in fix round 1" — and N4's provenance note keeps a hash …
:129 $ node scripts/guards/regexp-escape-guard.check.mjs | grep -c "^  [✓✗]"  # this run's check == 04921d8's check, same sha256
:526    276 tracked `.scratch` files at 71bdd55 — see the N1 table). Left alone and **correct as written**: it is
```

`276` at `71bdd55` — CONFIRMED, unchanged. The fix names the commit — CONFIRMED. The claim that
line counts were preserved (`:129` and `:526` still point where the brief named them) — CONFIRMED: 593 lines
before and after, and the sentences at `:16`, `:129`, `:526` are the brief's lines, edited in place.

### M2 — the N3 baseline, independently recounted (is 23/13 real?)

```
$ node /tmp/rev-6c4/count.mjs .        # own scan, same regex, per-key tally
… 23 MATCH lines …
total occurrences: 23
keys: 13
```

Per-key, my independent tally equals `BARE_HEAD_BASELINE` value-for-value:
`fix-1-review:265→4`, `fix-1-verify:265→1`, `fix-2-review:265→4, 271→1, 439→1`, `fix-2-verify:265→3`,
`fix-3-review:265→1, 276 tracked .scratch files→1`, `fix-3-verify:265→1`, `fix-3:265→2`,
`fix-2.md(brief):265→1`, `fix-3.md(brief):265→2`, `fix-4.md(brief):265→1`. **23 across 13 keys, exact — no
over-recorded slack, so the count-aware baseline binds at its recorded count today.**

### M3 — the guard run on the real repo, read-only

```
$ node scripts/guards/factory-guard.mjs
  note — no-bare-head-count: baseline holds 23 recorded occurrence(s); a count labelled HEAD must not be added
  ok — 5 model(s), 8 task kind(s), 1 work item(s); every floor meetable, every artifact present, every instrument header stating only what it can point at, every report and brief count naming the commit it was measured at
PASS — …   EXIT=0
```

### M4 — the behavioural claims, reproduced by me (not read from the check file)

```
$ node /tmp/rev-6c4/repro.mjs
A. blank-line seed: BEFORE hits = 0 | AFTER hits = 1
A. AFTER finding line:  FINDING [instrument-headers-honest]: zz-blank.mjs:4: … "// all 9 checks passed after a blank line"
B. no-scripts/guards root exit = 0
B. ok line:   ok — 5 model(s), 8 task kind(s), 0 work item(s); every floor meetable, every artifact present
C. seeded new label exit = 1 | finding: FINDING [no-bare-head-count]: .scratch/v28/reports/zz-new.md:1: a count is labelled HEAD …
D. baselined label exit = 0
E. dated label exit = 0
```

N1, N2 and N3 all behave as the report claims, reproduced independently against the committed guard.

### M5 — the tracked-vs-disk seam claim, measured

```
$ find .scratch/v28/reports .scratch/v28/briefs -maxdepth 1 -name '*.md' | wc -l   → 116
$ git ls-files .scratch/v28/reports .scratch/v28/briefs | grep '\.md$' | wc -l    → 116
$ comm -3 <disk list> <tracked list>                                              → (empty)
$ git status --porcelain --ignored -- .scratch/v28/reports .scratch/v28/briefs    → (empty)
```

The report's `ladder:` note ("in the real repo every `.scratch/v28/reports/*.md` and `briefs/*.md` is
tracked, so the behaviour is equivalent there") is measured TRUE today. Disk-scan is a superset of
tracked-scan, never a subset — the seam makes the rule stricter, not weaker, in the repo.

### M6 — ownership of `factory/work/v28-r2-6c.json` (the orchestrator-state question)

```
$ git diff --stat 99d044f..876a516 -- factory/work/          → (empty)
$ git show --stat --oneline 876a516                          → 4 files: fix-3.md, fix-4.md, factory-guard.mjs, factory-guard.check.mjs
$ git show --stat --oneline 99d044f                          → factory/work/v28-r2-6c.json | 15 +++++- (14 insertions, 1 deletion)
```

**The builder did not touch orchestrator state.** The `factory/work/v28-r2-6c.json` hunk inside the
`9f20d02..876a516` range is the orchestrator's own `99d044f` ("work state: 6c fix-3 verification complete +
review failed; fix round 4 in flight") — the implementation lane's `complete → running` transition at
`12:59:58.876Z` was already in the parent of the builder's commit. The "5 files" framing is an artifact of
picking `9f20d02` as the range base; the builder's commit is 4 files, none of them work state.

### M7 — the check counters

```
$ node scripts/guards/factory-guard.check.mjs | tail -1        → factory-guard check: all 26 checks passed.
$ grep -cE '^\s+check\(' scripts/guards/factory-guard.check.mjs → 26
$ node scripts/guards/regexp-escape-guard.check.mjs | tail -1   → regexp-escape-guard check: all 12 checks passed.
```

### M8 — does the new rule see the fix-4 report's own `HEAD` measurements?

```
$ node /tmp/rev-6c4/widen.mjs
.scratch/v28/reports/slice-6c-fix-4.md: rule-regex matches=0; lines containing the word HEAD=48
   :4  **Base:** `7fe7003`; the brief itself was committed at `9f20d02`, the tree HEAD when this round started.
   :15 that produced it — and **no number is labelled `HEAD`**. Where a raw tail would have written a bare-`HEAD`
   :16 count, the label is rendered `<HEAD>` in this report and that is disclosed at the point of use: the rule this
   :29 | **N1** | … before (`git show HEAD:scripts/guards/factory-guard.mjs`): `grep -c instrument-headers-honest` → `0` …
   :57 $ git ls-tree -r --name-only HEAD .scratch | wc -l
```

The rule's pattern returns **zero** matches in the report — as the report itself claims — while the report carries
two `HEAD`-labelled measurements the pattern cannot see (`:29`, `:57-58`).

### M9 — those two measurements, re-run at the commit that carries them

```
$ git ls-tree -r --name-only HEAD .scratch | wc -l        # at 876a516, the commit carrying :57-58
281                                                        # the report says 280
$ git ls-tree -r --name-only 9f20d02 .scratch | wc -l     → 280
$ git ls-tree -r --name-only 99d044f .scratch | wc -l     → 280
$ git show HEAD:scripts/guards/factory-guard.mjs > /tmp/rev-6c4/head-guard.mjs
$ node /tmp/rev-6c4/head-guard.mjs --root /tmp/rev-6c4/nb2 | grep -c instrument-headers-honest
1                                                          # the report's N1 row says "before … → 0"
```

`280` was true at `9f20d02`/`99d044f` and is false at `876a516` — B1's exact shape: the commit that carries the
sentence is the commit that moved the count. The report's own `:15` sentence — "**no number is labelled
`HEAD`**" — is contradicted by its own `:57-58`.

### M10 — the scope boundary, measured

```
$ node -e 'the rule regex over .scratch/v28/ledger.md'   → 1 match
   :7091 259 at `32e9f48`, 265 at HEAD — 260 reproduces at no commit**, and the ledger holds no such reviewer …
$ ls .scratch/v28/plan.md                                → No such file or directory
$ grep -n "SCOPE" scripts/guards/factory-guard.mjs        → (only :283, a doc-comment reference; no SCOPE block)
$ sed -n '31,40p' scripts/guards/regexp-escape-guard.mjs  → "SCOPE — a written boundary, not a claim of totality."
```

### M11 — the rule's own hole: one match per line (undisclosed)

```
$ node /tmp/rev-6c4/repro.mjs   (case F)
F. added a 5th "265 at HEAD" to line 81 of a file with a recorded count of 4 — exit = 0 | occurrences now on disk: 5
F. finding: (none)
$ sed -n '245p;177p' .scratch/v28/reports/slice-6c-fix-2-review.md / …fix-3-review.md   # two live lines already carry two matches each
```

### M12 — the `ok —` claim against what the check establishes

```
$ node scripts/guards/factory-guard.mjs | grep 'ok —'
  ok — … every report and brief count naming the commit it was measured at        # exit 0
$ grep -n "2067 passed (2067)" .scratch/v28/reports/slice-6c-fix-4.md             # a scanned file
256:| tests | `2067 passed (2067)` | `0` | …                                        # a count with no commit named
```

---

## Blocking findings

**1. `ladder:` `.scratch/v28/reports/slice-6c-fix-4.md:57-58` is a fresh instance of B1's class, and
`:15` asserts it is not.** (evidence M8, M9)

```
:57  $ git ls-tree -r --name-only HEAD .scratch | wc -l
:58  280
:15  … **no number is labelled `HEAD`**. Where a raw tail would have written a bare-`HEAD` …
```

`280` is the count at `9f20d02` **and** at `99d044f`; at `876a516` — the commit that carries the sentence — the
same quoted command returns **`281`** (M9). That is verbatim the defect the brief names for B1: "a bare `HEAD`
inside the commit that *moves* HEAD". The report states its own convention one line above it (`:15-16`: such a
label "is rendered `<HEAD>` in this report") and then writes the literal. A second instance sits in the N1 row
at `:29` — `before (git show HEAD:scripts/guards/factory-guard.mjs): grep -c instrument-headers-honest → 0`;
re-running that quoted command at `876a516` now resolves `HEAD` to the **fixed** guard and returns **`1`**, not
`0` (M9). Both numbers were true at measurement time and are unreproducible at the commit that carries them.

Why it went unseen is measured, not assumed: the new rule's own pattern returns **0 matches** in that file (M8,
the report's own claim, independently reproduced), and the mandated self-check at `:218` greps only
`"at HEAD"` — neither can see `HEAD .scratch` or `git show HEAD:`. The brief's N3 self-check requirement is
explicit — "your own report must not contain a bare-`HEAD` count. If it does, the rule you wrote catches you …
which is the correct outcome and you should say so rather than weaken the rule" — and what the report says
instead is `:15`'s opposite claim. Supporting detail, same looseness: `:4` attaches "the tree HEAD when this
round started" to `9f20d02`, while the round's range shows the graph `9f20d02 → 99d044f → 876a516` and
`99d044f` (06:00:48) precedes the builder's commit (06:07:32) — the starting HEAD was `99d044f`.

*Fix (one line each):* name the commit at `:57` (`9f20d02` — 280 holds there and at `99d044f`; the guard file is
byte-identical at both) and at `:29`, or render both `<HEAD>` per the report's own stated convention. I record
the alternative adjudication for the orchestrator: rule it a historical record under D-011 item 2 and leave it,
in which case the two surviving instances belong in `factory/decisions.md` as known-open with `file:line` — not
in a `ladder:` bullet, and not under a `:15` claim that they do not exist.

## Non-blocking findings

**2. `scripts/guards/factory-guard.mjs:432` — the new `ok —` claim states more than the new check
establishes.** (evidence M12) The sentence is `every report and brief count naming the commit it was measured
at`; the check only rejects a count whose label is `at HEAD`. Counterexample in a scanned file:
`.scratch/v28/reports/slice-6c-fix-4.md:256` carries `2067 passed (2067)` with no commit, and the guard prints
the claim and exits 0. The same over-broad phrasing sits in the rule list at `factory-guard.mjs:47-48`. This is
N2's own class — a summary sentence doing work the mechanism did not do — recurring inside N2's fix; the header
claim at `:431` has the same looseness but is pre-existing. Suggested wording: "no count labelled HEAD in any
report or brief".

**3. `scripts/guards/factory-guard.mjs:395` — the rule sees at most one occurrence per line, and the hole is
undisclosed.** (evidence M11) `BARE_HEAD_COUNT.exec(line)` counts the first match and drops the rest, so a new
occurrence appended to a line that already carries a counted one is invisible: doubling the `265 at HEAD` on
line 81 of a `/tmp` copy of `.scratch/v28/reports/slice-6c-fix-2-review.md` leaves 5 occurrences on disk against
a recorded 4 and the guard exits 0 with no finding. Two live lines already carry two matches each
(`slice-6c-fix-2-review.md:245`, `slice-6c-fix-3-review.md:177`). The report's Risks disclose the count-aware
baseline but not this.

**4. `scripts/guards/factory-guard.mjs:47-52` states no scope, and the scope statement lives in a
non-authoritative place — a build-law finding.** (evidence M10) `docs/agents/code-structure.md:121-127`: "The
guard's header states its SCOPE — the directories and extensions it reads, and what it therefore does not
count — and that header, not this paragraph, is the authoritative statement of what the guard covers."
`regexp-escape-guard.mjs:31` is the repo's worked example of that block; `factory-guard.mjs`'s header has none
(the only `SCOPE` mention is a doc-comment reference at `:283`). The new rule's scope and its exclusions are
argued instead in report prose at `.scratch/v28/reports/slice-6c-fix-4.md:305-308`.

**5. `.scratch/v28/reports/slice-6c-fix-4.md:306` names `.scratch/v28/plan.md` as an unscanned location;
measured, that path does not exist** (`plan.md` lives at the repo root and in other lanes). The other location
it names — `.scratch/v28/ledger.md` — is real and really holds an occurrence (M10). Wording only.

**6. Coverage gap, recorded so it is a decision rather than a silence.** The rule cannot see a `HEAD`-labelled
count that is not the `N … at HEAD` shape — including the two instances this diff itself introduces
(`:29`, `:57-58`) and the `HEAD`-identity form N4 was about. The brief specified this match ("a digit near
`at HEAD`"), so this is not a deviation from the brief; but a rule named for the class should be known to be
narrower than the class, in the header, with a pointer here.

## Adjudications the brief asked for

- **Scan scope `.scratch/v28/{reports,briefs}` only — reasonable boundary, not a convenient one, but it
  should be written down as a known-open.** M10: the excluded `.scratch/v28/ledger.md` really does carry the
  class at `:7091` (`265 at HEAD`), so the boundary is load-bearing rather than theoretical. It is still the
  right boundary: the brief named the reports and the briefs, and the ledger's mixed history is a written,
  deliberate decision — `docs/agents/factory.md:138-140` and `factory/decisions.md:53-59` (D-002: "left intact.
  No retroactive rewrite … going forward only"). What I would change is the recording: one line in
  `factory/decisions.md` naming `ledger.md:7091` as known-open with `file:line`, the way D-011 item 1 recorded
  its two lines. An exclusion that lives only in a `ladder:` bullet is a silence with a footnote.

- **Disk ("present under the root") over `git ls-files`: honest, and measured true.** M5: 116 `.md` on disk
  under the two scan dirs, 116 tracked, `comm -3` empty, nothing untracked or ignored in scope. Disk-scan is a
  superset of tracked-scan, so the seam makes the rule stricter in the real repo, never weaker, and it is what
  makes the git-less behaviour check possible. The report's `ladder:` note is accurate today.
- **Count-aware baseline per `file::matched-text`: accept.** M2 recounted all 13 keys independently — 23
  occurrences, exact, no key over-recorded. With zero slack the baseline binds at its recorded count today, so
  it is not "a hole shaped to pass", it is the strictest form that keeps the historical records byte-identical
  (D-011 item 2, whose text — `factory/decisions.md:250-255` — says exactly that). The real hole is finding 3,
  which is not the count-awareness.
- **N2's scope — `every floor meetable` / `every artifact present` stay unconditional: accept, not a
  finding.** `checkRegistry` and `checkWorkItems` run on every invocation regardless of `--root`
  (`factory-guard.mjs:417-419`), so both claims are backed by checks that ran; with zero items they are
  vacuously true. That is a different shape from finding 2, where the claim outruns the mechanism.
- **Is the new rule honest or shaped to pass? Honest.** It fires on a seeded new occurrence (M4/C, exit 1,
  naming file:line), the baseline is exact (M2), the baselined control passes and the dated control passes
  (M4/D, M4/E), and the size is printed at run time on every invocation (M3), so it can only shrink by a
  deliberate edit. Its boundary is the brief's boundary; its weaknesses are findings 2, 3 and 6.
- **`factory/work/v28-r2-6c.json`: not the builder's edit.** M6 — `git diff --stat 99d044f..876a516 --
  factory/work/` is empty; the hunk in the `9f20d02..876a516` range is the orchestrator's own `99d044f`. The
  builder's commit is 4 files, none of them orchestrator state. No lane violation.
- **The builder's shift claim — `:129` and `:526` still point where the brief named them: TRUE.** M1 — 593
  lines before and after; the four edits are in place at `:16-17`, `:129`, `:526`.

## Requirements traceability

| Brief requirement | Status | Evidence |
|---|---|---|
| B1 — `slice-6c-fix-3.md:526` names the commit, number unchanged | **met** | M1: reads `276 tracked .scratch files at 71bdd55`; `71bdd55` measures 276 |
| N1 — blank line no longer truncates the header scan, with a seed for that shape | **met** | M4/A: 0 → 1 hit, `FINDING … zz-blank.mjs:4`; check at `factory-guard.check.mjs:317` |
| N2 — the `ok —` line claims only what ran, plus a control | **met** | M4/B: header claim absent with no `scripts/guards`, present when a guard is scanned |
| N3 — `no-bare-head-count`, forward-only, recorded baseline, size printed, seeded failure, baselined + dated controls, registered | **met with findings 2, 3, 6** | M2 (23/13 exact), M3 (note printed), M4/C-D-E (exit 1 / 0 / 0), header list `factory-guard.mjs:47-52`, ok-line `:432` |
| N4 — `:129` names the commit, number 12 unchanged | **met** | M1 (`04921d8`); check run: `all 12 checks passed`, 12 `✓` lines |
| N5 — `:16` wording agrees with round 3's own `:31` | **met** | M1; `.scratch/v28/reports/slice-6c-fix-3.md:31` reads "REJECTED as worded, FIXED as a claim" |
| The round's own rule: the builder's report contains no bare-`HEAD` count | **not met** | finding 1: `:57-58` (280, now 281) and `:29` (0, now 1) against `:15`'s claim |
| Verification items 1-3 (checks exit 0, guard PASS) | **met** | M7, M3 — reproduced read-only; I did not run `npm run verify` (verifier's lane) |
| Verification items 1-6 for N3 (seeded failure, baselined control, dated control, blank-line repro) | **met** | M4 (all five cases, reproduced by me against the committed guard) |
| Report states its own measured verify numbers, delta accounted for | **reported, not verified in this lane** | `.scratch/v28/reports/slice-6c-fix-4.md:247-260`; the one test-visible claim I can check holds — no `.test.*` file is in the commit (M6) |
| Anything noticed and not fixed, named with file:line | **met** | `:299-317`; one of its path names is wrong (finding 5) |

## Verdict: NEEDS_CHANGES

Every one of the five brief findings is fixed and every behavioural claim reproduced. The round nonetheless
fails on its own centrepiece: the report committed by this diff contains a count labelled with an unresolvable
head (`:57-58`, `280` → `281` at the carrying commit, plus `:29`), states at `:15` that no number is labelled
`HEAD`, and the rule written to kill that class cannot see either instance. The remaining findings are wording
and coverage, and the ownership question resolves in the builder's favour.

**Recommended next action:** one round, one commit — name the commit for the two `HEAD` measurements in
`.scratch/v28/reports/slice-6c-fix-4.md:29,:57` (or render them `<HEAD>`), reword
`scripts/guards/factory-guard.mjs:432`, re-run `bash scripts/guards/run-all.sh`, then re-review; findings 3-6
can ride along or be ruled out of scope in writing.

---

## Byte-identity, closing

```
start  sha256 146bacaaf1b2f863e1cf262ae143bb95e622a24e01743c18fed907f16a2bf921  scripts/guards/factory-guard.mjs
start  sha256 4303e900785273eccff956a55764feb1edacda7c9e8f5a99764f3b8027250024  scripts/guards/factory-guard.check.mjs
end    sha256 146bacaaf1b2f863e1cf262ae143bb95e622a24e01743c18fed907f16a2bf921  scripts/guards/factory-guard.mjs
end    sha256 4303e900785273eccff956a55764feb1edacda7c9e8f5a99764f3b8027250024  scripts/guards/factory-guard.check.mjs
end    git status --porcelain  → (empty)
```

Both check scripts sandbox under `os.tmpdir()` (`factory-guard.check.mjs:37`, `regexp-escape-guard.check.mjs:69`),
so running them touched no repo path. No `systemctl`, no inference server started or stopped, no write anywhere
except `/tmp/rev-6c4/` and this report's own path.


## Note recorded at the end: HEAD moved during this review

`.scratch/v28/ledger.md` and `factory/decisions.md` were committed by the orchestrator (`ed0dc8f`, `824f419`) while
I was reviewing. Nothing I measured changed. Worth recording because it is a live demonstration of the boundary
this review adjudicates: at `824f419` the excluded `.scratch/v28/ledger.md` **still** carries the class at
`:7091` (`265 at HEAD`) — measured again at that commit — and the guard passes, as designed. That is the
`known-open` the adjudication above asks to have written into `factory/decisions.md` with its `file:line`.
