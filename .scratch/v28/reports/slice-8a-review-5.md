# Slice 8a — fresh-context review, ROUND 5 (final). Range `7b72207..8006e03`

## DISCLOSURE (required, D-007 / D-015)

**I am a sibling model, not an independent reviewer.** Fresh *conversation*, not an independent instrument.
Weigh this verdict accordingly (D-015).

**What I ran (read-only outside this report).** `git log` / `git diff` / `git show`; the real guard against
throwaway roots I built myself (`node scripts/guards/factory-guard.mjs --root <tmp> --repo <repo>`) — every
seed below is my own, none is copied from the report's pastes; a throwaway **instrumented copy** of the guard
(patched only to print which blocks it attributed and which labels it did not) run against the live tree; the
round-3 guard `git show 7b72207:scripts/guards/factory-guard.mjs` run against the live tree and against the
same throwaway roots; `node scripts/guards/factory-guard.check.mjs` (**exit 0, all 104 checks passed**); and
two throwaway harnesses pointed at a mutated guard to price the tripwire the round did **not** ship. **What I
did NOT do:** I did not run `npm run verify`, `vitest`, or any Playwright spec — the builder's pastes on that
half are unverified here, and the builder's success claim is not evidence.

**Range note — the tip moved while I reviewed.** The brief names `7b72207..8006e03`; `HEAD` is now `5b5d7b9`
("8a: fix round 4 recorded …"), which touches **`.scratch/v28/ledger.md` only** (5 inserted lines). Both guard
files are byte-identical between `8006e03` and `5b5d7b9` (`git diff --stat 8006e03 5b5d7b9 -- scripts/` is
empty), so the review object is unchanged. Recorded because a range claim should reproduce.

---

## VERDICT: **NEEDS_CHANGES** — one MECHANISM finding, three FALSE CLAIMs about the mechanism.

The round's two BLK fixes are **real and I reproduced both**: a range SEEN and not COMPARED is now a finding
(round-3 guard on the identical seed reads 1 block, counts the uncompared range as checked and PASSES; the
current guard reads 2, compares 1 and FAILS with the BLK-1 finding), and the prose-line escape between label
and fence is **closed** (one prose line and five prose lines both CAUGHT). The tripwire is real, seeded and
mutation-proven, and I re-ran the 104-check harness green myself. What blocks is the **exemption the tripwire
carves**, and the three sentences the round wrote about its own mechanism that the mechanism contradicts.

**Severity labels below: MECHANISM = would warrant another round; FALSE CLAIM / WRONG NUMBER /
UNDER-DECLARED BOUNDARY = adjudicable and recordable as known-open.**

---

## ADJUDICATIONS (one line each, as asked)

**BLK-1 — HOLDS as a counter fix; the PUBLISHED CLAIM still over-reaches in two reachable states.** The three
states the brief names all behave correctly: an out-of-vocabulary count word is a FINDING (my seed with an
`all thirteen` count on a 7–13 range → `exit 1`,
`FINDING … states a count this rule cannot resolve to a number: "(all thirteen"`); a range with no count is
skipped and **not** counted as checked (my `✓ 7–13 zz-spec.e2e.ts` with no count → `exit 0`, note `0 range
summaries checked`) — the range and `all` guards run before `ranges += 1` — `factory-guard.mjs:1618-1621`, `:1632`; a count
with no range is skipped the same way. So no line in the shape is counted as checked without being checked —
true. **But the claim the counter gates is a universal, and two reachable states falsify it**: an
exemption-skipped blockquoted summary (Q5 below) and a **second** summary on the same line as an agreeing one
(only the first `exec` match is compared). In both, `ranges > 0` and no finding, so `:1719` publishes
*"every step-range summary inside a raw-/verbatim-labelled block agrees with its own "all N" count"* over a
summary that disagrees.

**BLK-2 — the coverage number IS what was read (verified, 8 of 8 genuine); the prose-line escape is CLOSED.**
I instrumented the rule itself and it attributes **8** blocks on the live corpus, every one under a genuine
`raw:`/`verbatim:`-ending label that introduces a real captured-output fence (`.scratch/v28/reports/`
`slice-6c-fix-2.md:110`, `:328`, `slice-6c-fix-5.md:511`, `slice-6c-fix-6.md:1003`, `slice-6d.md:35`, `:108`,
`slice-8a-verify.md:161` (the indented block), `slice-8a.md:653`). One prose line between label and fence is
now CAUGHT, and so are five (`✓ 7–13 zz-spec.e2e.ts (all six legs)` under a `proof — raw:` label with `the
transcript follows.` between → `exit 1`, `covers 7 entries (7–13)`). **But the number is not the whole of what
was seen**: 16 label-form lines match, 8 are read and **8 are skipped by the quotation exemption** (all in
`briefs/`, all confirmed by reading them: `briefs/slice-1-fix-1.md:52`, `:66`,
`briefs/slice-2a-fix-1.md:52`, and five `**Reviewer, verbatim:**` lines in `briefs/slice-6c-fix-2.md`), and the
narrowed label form silently drops three genuine raw-labelled blocks the round-3 form read (BLK-2b below). So
"the number is what was read" is true; "the corpus's raw-labelled blocks were read" is not.

**The label tripwire — HOLDS as a mechanism (own seed + mutation + control, re-run green), with the exempt set
unwatched.** `node scripts/guards/factory-guard.check.mjs` → **104/104**, exit 0 (`an out-of-vocabulary count
word … is CAUGHT`, `a raw:/verbatim label with no block to read is CAUGHT (the label tripwire)`, its
`MUTATION: dropping the label tripwire lets that seed PASS`, and the witness control that pins the printed
input number). Independently: my own two label-to-no-block seeds (a label 13 blank lines above its fence, and a
label 12 lines above a fence with prose between) → `exit 1`, `a label this rule saw and did not read`. **The exemption has no seed, no mutation and no control** — see
BLK-4.

**The four escapes — 3 CLOSED (each re-measured), 1 NAMED and the name is accurate.** (1) out-of-vocabulary
count word → FINDING (verified). (2) fence-inline label (```` ```raw: ```` as the opening line) → the block is
read and its contradiction CAUGHT (verified, `exit 1`). (3) label ≥4 blank lines above its fence → 11 blank
lines is inside `INTRO_LINES = 12` and the block is read and CAUGHT; 13 blank lines exceeds it and the label
tripwire FIRES (verified, `exit 1`, `a label this rule saw and did not read`) — so the window cannot narrow
silently. (4) a labelled block outside top-level `reports/`+`briefs/` `*.md` → **NAMED**, and the ceiling names
it in words (`factory-guard.mjs:1560-1561`), matching the code (`:1397`, `:1401` in `checkReportHeadCounts`:
`readdirSync(dir).filter(f => f.endsWith('.md'))`, no recursion). Honest.

---

## THE TWO THINGS THE BRIEF MOST WANTED

### 1. THE QUOTATION EXEMPTION — **IT IS REACHABLE AS AN ESCAPE. MECHANISM.**

The exemption is `!/^\s*>/.test(lines.slice(index + 1).find((l) => l.trim() !== '') ?? '')`
(`factory-guard.mjs:1644-1648`): a label is not watched if the next non-blank line begins with `>`. Tested
with my own fabricated transcripts (the same defect as the deleted §3 block — seven entries, six counted):

| seed | verdict |
|---|---|
| `proof — raw:` then `> ✓ 7–13 zz-spec.e2e.ts (all six legs)` | **exit 0**, note `0 raw-labelled block(s) read, 0 range summaries checked — NOTHING was checked`, no finding |
| the whole block quoted, label included (`> proof — raw:` / `>` / `> ✓ 7–13 … (all six legs)`) | **exit 0**, same silent note |
| `proof — raw:` then `> a quote` then blank then `> ✓ 7–13 … (all six legs)` | **exit 0**, same silent note |

**A fabrication hides behind the exemption, and it is silent.** The strongest form is the one where the
declared price is invisible because the claim IS published: the same quoted fabrication in a root that also
holds one properly labelled agreeing block →

```
  note — transcript-summary-agrees: 1 raw-labelled block(s) read, 1 range summary checked
  ok — … every step-range summary inside a raw-/verbatim-labelled block agrees with its own "all N" count …
PASS — the registry can be trusted and no work item claims evidence it does not have.
```

That is the published coverage claim asserted while a raw-labelled summary that contradicts itself sits
unread one line under a `>` — BLK-1's exact defect, re-entering through the exemption.

**So the answer to the brief's question is YES, and the rule's own promise is false of it.** The docblock says
(`factory-guard.mjs:1548-1551`): *"That is what keeps "no raw block exists here" and "raw blocks I failed to
attribute" from looking alike, and it is why no parse window can narrow silently: the zero case is
unreachable while a label is unread."* On the **live corpus, every run**, the guard prints
`0 range summaries checked — NOTHING was checked` and PASSES **while 8 label-form lines — labels by the
docblock's own definition at `:1537-1538` — have no block attributed to them**. The sentence is falsified by
the guard's own output. This is the exemption defeating the tripwire's stated purpose for exactly the shape a
*quotation of a bad block* takes, and it is the brief's designated MECHANISM class.

**It is honestly declared as a price** (`slice-8a.md:959-963`: "a label that introduces a quotation and no
code block is not a fire"), so the defect is **not** under-declaration of the price — it is that the price is
paid on the one shape that matters, and that two sentences beside it claim the opposite.

### 2. THE LABEL-FORM NARROWING — **NOT SOUND AS REPORTED. It dropped three real blocks; FALSE CLAIM.**

"the line above carries the token" → "the line ENDS with the token" (`LABEL_LINE`, `:1523`) is a *narrowing*
of the predicate (every line matching `LABEL_LINE` also matched the old `/raw:|verbatim/i`), so it cannot
admit a label line the old form admitted. The window did widen (4-lines-nearest-non-empty → any label within
12 lines), and I tested whether that admits a new false attribution: it does (a label 6 lines above a *non-raw*
fence is attributed and read, and a `✓ N–M (all six)` line there is a **false FAIL**) — but no live file has
that shape (the instrumented run shows 0 unread labels and 8 attributed, all genuine), so it is a latent
vector, not a live one.

**The narrowing is not sound because it dropped real blocks.** Running the round-3 guard and the current guard
against the same live tree:
`node /tmp/guard-r3.mjs --root . --repo .` → `11 block(s) introduced as raw:/verbatim read`;
`node scripts/guards/factory-guard.mjs` → `8 raw-labelled block(s) read`. Six blocks left the read set and
three entered it (11 − 6 + 3 = 8). The three that entered are the real ones the old parity bug missed
(`slice-6c-fix-6.md:1003`, `slice-8a-verify.md:161`, `slice-8a.md:653`). **Three of the six that left are
genuine raw-labelled blocks that the round-3 form read and the round-4 form no longer reads:**

| label line the new form drops | the block it introduces |
|---|---|
| `.scratch/v28/reports/slice-6c-fix-5-review.md:606` — `## Appendix A — raw firing output of my two probe roots (verbatim, so the reader can re-run)` | a real fenced probe transcript |
| `.scratch/v28/reports/slice-6d-verify-5.md:120` — `Run verbatim, exactly as pasted in `.scratch/v28/reports/slice-6d.md` §15:` | a real pasted command + output |
| `.scratch/v28/reports/slice-8a.md:408` — `command I name, verbatim (2026-10-02, tree `3f2da79`, with the fix round's new assertion in the walk):` | the real 13-test e2e transcript |

`.scratch/v28/reports/slice-8a-review-4.md:140` (`… inside a `raw:`-labelled block:`) is a fourth, likewise
carrying a real pasted guard run. `slice-8a.md:1056` says *"the 3 lost were prose false-attributions, the 3
gained are the previously unread real blocks"*; the losses are **six**, and at least three of them are not
prose. `slice-8a.md:931` says *"all 8 real, none prose"* — true of the 8 read, but the net-delta reasoning
behind it hides the six that stopped being read. **The coverage claim at `:1719` is quantified over "every
step-range summary inside a raw-/verbatim-labelled block"; the mechanism reads a strictly smaller set, and by
plain reading three of those blocks are raw/verbatim-labelled.**

---

## FINDINGS

### BLK-1. [MECHANISM] The quotation exemption is a one-line-wide escape on the shape the rule exists for.

`scripts/guards/factory-guard.mjs:1644-1648`. Seeds and outputs in the section above. The rule "can now
produce a FOURTH sighting of the original defect": **yes, exactly this way** — write `✓ 7–13 … (all six legs)`
under any label whose next non-blank line begins `>`, or write the whole thing as a blockquote; `exit 0`, no
finding. Round 4 did not widen the hole (a blockquote was never read), but it added a tripwire whose stated
purpose is to make an unread label impossible, and then exempted the shape a bad-block quotation takes. If the
orchestrator accepts the exemption as a known-open price, the two sentences at `:1548-1551` and `:1719`, and
`slice-8a.md:931`/`:1056`, must come down to it (D-028: delete, do not restate).

### BLK-2. [FALSE CLAIM] `factory-guard.mjs:1550-1551` — "the zero case is unreachable while a label is unread".

Falsified on the live corpus every run: `node scripts/guards/factory-guard.mjs` →
`note — transcript-summary-agrees: 8 raw-labelled block(s) read, 0 range summaries checked — NOTHING was
checked: …` then `PASS`, with **16** lines matching `LABEL_LINE` (the docblock's own definition) and **8** of
them attributed to no block. `:1548-1549` ("keeps 'no raw block exists here' and 'raw blocks I failed to
attribute' from looking alike") falls with it.

### BLK-3. [FALSE CLAIM] `slice-8a.md:931` and `:1056` — the narrowing's delta accounting.

"all 8 real, none prose" is true of the 8 read; "the 3 lost were prose false-attributions" is false — six
blocks left the read set and three of them (`slice-6c-fix-5-review.md:606`, `slice-6d-verify-5.md:120`,
`slice-8a.md:408`) are genuine raw-labelled blocks. The measurement that shows it:
`node /tmp/guard-r3.mjs --root . --repo .` prints `11` where `node scripts/guards/factory-guard.mjs` prints
`8`, and the instrumented membership diff is 6 out / 3 in.

### BLK-4. [FALSE CLAIM + MECHANISM] `slice-8a.md:990` — "Seed + mutation + control for every new path".

The exemption is a new path in the same commit and has **no** seed, mutation or control: `grep -n "exempt\|blockquote\|Quot" scripts/guards/factory-guard.check.mjs` finds no such check (the `quote` hits at `:810-821`
are about quoted git revisions). The exempt set is therefore an **unwatched set** — D-030's own question
("which set did I just stop watching?") applied one granularity down. A future edit to the `>` test or to
`LABEL_LINE` can move the exempt set with nothing failing.

### BLK-5. [FALSE CLAIM / UNDER-DECLARED BOUNDARY] `factory-guard.mjs:1719` — the claim's universal is wider than the mechanism.

Two reachable states publish it over an unread disagreeing summary: an exempted blockquoted summary, and a
**second** `✓ N–M … (all N)` on the same line as one that agrees — my seed
`✓ 1–6 a.e2e.ts (all six legs)  ✓ 7–13 b.e2e.ts (all six legs)` (one line, in a `raw:`-labelled fence) →
`exit 0`, note `1 range summary checked`, claim published (`exec` reads the first pair only, `:1618`, `:1620`).
Not named in the ceiling ("ONE shape is read" does not say one pair per line).

### NON-BLOCKING

1. **[WRONG NUMBER / `slice-8a.md:953`]** *"blunt tripwire (fire when ranges === 0): 31 of 104 checks
   break"*. I could not reproduce the quoted price with two plausible mutants of the form it describes. (a) I
   appended `fail('transcript-summary-agrees', …)` when `ranges === 0` before the note in the committed guard
   and pointed a copy of the committed harness at it → **38 check(s) failed** (`38 of 104`); conditioning it
   on `files.length` or on `blocks === 0` gives the same 38. (b) The same mutant built from the round-3 guard
   and run against the round-3 harness (`93` `check(` sites) → **37 of 93**, where the round-4 review quotes
   *"30 of the 93"*. The direction of FR4-3's point is unaffected — the narrow form is free (the shipped
   harness is 104/104, re-run by me) — but the price is quoted low under either reading, and the review's pair
   and the builder's pair come from different denominators, so the two are not comparable as written.
2. **[UNDER-DECLARED BOUNDARY / `factory-guard.mjs:1523` vs `:1537-1538`]** The docblock defines a label as
   *"a line whose LAST token is `raw:` or `verbatim:`"*, but `LABEL_LINE = /(?:raw|verbatim):\s*\*{0,2}\s*$/i`
   has no word boundary on the left, so `the sketch is a draw:` and `withdraw:` are labels: a prose line
   ending in either, followed by a fence, is read as raw (false FAIL on a contradicting line), and with no
   block under it the tripwire fires — `exit 1`, `a line introduces a block as raw:/verbatim but no
   captured-output block was attributed to it: "the sketch is a draw:"`. The over-match is not new; making it a
   **tripwire** is, and it is undeclared. No live file has such a line (0 unread labels).
3. **[BOUNDARY / `factory-guard.mjs:1609-1612`]** `INTRO_LINES = 12` is counted in *lines*, so a label 12+
   lines above its fence — prose between them counts toward the window — is a FINDING (a false FAIL on a
   legitimate long intro) rather than a skip. Declared as a fire in FR4-4 escape (3), not as a cost.
4. **[BOUNDARY / `factory-guard.mjs:1656`]** The note's clause *"no range summary inside a raw-labelled block
   exists in this scan"* is printed in states where a range line exists inside a raw-labelled block and only
   its `(all N)` is missing (`✓ 7–13 zz-spec.e2e.ts` alone → `exit 0`, exactly that clause). True of the
   mechanism's definition of "range summary", false to a plain reader. "NOTHING was checked" is true.
5. **[MECHANISM — pre-existing, extended, declared for 8b]** `factory-guard.mjs:1403-1406`: the
   no-reports/briefs early return omits `rawSummaryLines`, so the rule does not run and prints only a generic
   note covering three rules now. This is the 8b-registered path, restated in `slice-8a.md:1059`; it is the
   one place where the round's own "the size printed each run" ceiling does not hold.
6. **[Latent / `factory-guard.mjs:1679`]** `discloseScanProvenance` compares a **recursive**
   `git ls-files` set against the **top-level-only** on-disk scan. Today they agree exactly
   (`scanned 149 WORKING-TREE file(s); git tracks 149 under the same paths (0 untracked, 0 tracked-but-absent)`),
   but a subdirectory under `reports/` would make "under the same paths" compare different sets.
7. **[Residual evidence, builder-pasted]** `npm run verify` `71 / 2063`, `vitest … 5 passed`, the three
   `avatarUrl` mutations and the warning/error line counts are pastes; my lane does not run the suite. The
   guards half I corroborated independently: `factory-guard.check.mjs` 104/104 exit 0; the live guard exit 0
   with the note above; the round-3 guard's `11` and the current `8` reproduced from their own file at
   `7b72207`.

---

## THE CLASS HUNT (D-025 / D-030) IN WHAT ROUND 4 ADDED

| round-4 surface | can come back empty/wrong as | consumed as |
|---|---|---|
| `ranges` (`:1632`, gate `:1719`) | unresolvable count → FINDING (closed); **but 0 on the live corpus every run** | disclosed note + PASS; the claim is omitted when 0 — correct — but see next row |
| `blocks` / `attributed` (`:1614-1616`, `:1656`) | exempted labels are seen and never read, and are not printed as skipped | the tripwire is believed to make the zero unreachable; it does not (BLK-1/BLK-2) |
| the exemption (`:1644-1648`) | reachable silent escape on the target shape | PASS; with any agreeing block, the published claim (BLK-1) |
| the exempt set | no seed, mutation or control anywhere in `factory-guard.check.mjs` | unwatched (BLK-4) |
| the claim text (`:1719`) | universal over a set the label form and the exemption both shrink | a FALSE CLAIM in two reachable states (BLK-5) |
| `WORDS` (`:1572` — `one`…`twelve`) | out-of-table → FINDING; verified for `thirteen`/`twenty` | correct; the mutation now isolates the branch (`check.mjs` anchor `if (count === span) continue`) |
| the early return (`:1403-1406`) | no reports under the root → the rule does not run, and says so only generically | PASS (8b-registered, `slice-8a.md:1059`) |
| the 11 new checks (`check.mjs`, `:1215-1390`) | all three mutation anchors exist (the harness throws if one occurs ≠1) and all 11 flip their seed | honest; **but blind to the exemption**, by construction |
| `LABEL_LINE` (`:1523`) | no left word boundary → `draw:`/`withdraw:` are labels | false FAIL / false tripwire (non-blocking 2) |

**Claims the mechanism does not support, listed:** (a) *"the zero case is unreachable while a label is
unread"* (`:1550-1551`); (b) *"every step-range summary inside a raw-/verbatim-labelled block agrees"*
(`:1719`) against exempted blockquotes and second-on-a-line summaries; (c) *"the 3 lost were prose
false-attributions / all 8 real, none prose"* (`slice-8a.md:931`, `:1056`); (d) *"Seed + mutation + control for
every new path"* (`slice-8a.md:990`); (e) *"31 of 104 checks break"* (`slice-8a.md:953`); (f) *"a line whose
LAST token is raw:/verbatim:"* (`:1537-1538`) vs a regex with no left boundary.
**Measurements that can come back empty and be consumed as health, listed:** `ranges === 0` (declared, and
live); the **exempt-label set** (undeclared as a set, unchecked, and the live reason the zero is reached);
`blocks === 0` on a root whose labels are all quotations; the early return (`:1403-1406`, declared 8b).

## CAN THE RULE NOW PRODUCE A FOURTH SIGHTING OF THE ORIGINAL DEFECT?

**YES — and the corpus already contains the spelling that lets it.** Three routes, each measured green:

1. **The exemption.** Any `raw:`/`verbatim:`-ending label whose next non-blank line begins `>`: the whole
   fabricated transcript passes with `exit 0`, and with one agreeing block elsewhere the guard publishes the
   claim over it.
2. **A label the narrowed form does not recognise.** `… verbatim, so the reader can re-run)`,
   `Run verbatim, exactly as pasted in …:`, `command I name, verbatim (2026-10-02, tree 3f2da79 …):` — three
   such lines are **live in the corpus right now** (`slice-6c-fix-5-review.md:606`,
   `slice-6d-verify-5.md:120`, `slice-8a.md:408`); the round-3 form read their blocks, the round-4 form does
   not, and no tripwire fires because they are not labels by `LABEL_LINE`.
3. **Two summaries on one line.** `✓ 1–6 … (all six legs)  ✓ 7–13 … (all six legs)` → `exit 0`, claim
   published, `1 range summary checked`.

Only the fenced, token-ending, one-summary-per-line spelling is gated. The structural route's *common form* is
a real gate — I re-introduced the deleted block in a throwaway root and the guard caught it — but the route is
not "the shape cannot reach a reviewer again"; it is "this spelling of the shape cannot".

---

## REQUIREMENTS TRACEABILITY (round-4 remit)

| requirement | ruling | evidence |
|---|---|---|
| BLK-1: an unresolvable count word is a FINDING, not a skip | **MET** | my `all thirteen` seed → exit 1, `cannot resolve to a number`; `all twenty` → same; a digit count agrees and passes; `ranges += 1` now after the check (`:1632`) |
| BLK-1: no claim published over an uncompared range | **PARTIALLY MET** | the counter is right; the claim still over-reaches for exempted and second-on-a-line summaries (BLK-5) |
| BLK-2: the coverage number is what was read | **MET for the number** | instrumented rule → 8 attributed, all 8 genuine; live note `8 raw-labelled block(s) read`; round-3 → 11 |
| BLK-2: a prose line between the label and its fence no longer hides a fabrication | **MET** | one prose line and five → CAUGHT; the width is pinned by a mutation check |
| BLK-2: name the escapes / stop printing an attribution count as coverage | **PARTIALLY MET** | the ceiling now names the scan set and "any other label spelling"; the count is still printed without the 8 labels it skipped, and the losses are mis-described (BLK-3) |
| the zero case: the reviewer's narrow label tripwire, implemented | **MET in form** | `a raw:/verbatim label with no block to read is CAUGHT` + mutation + control; 104/104 |
| the zero case: "no raw block exists here" distinguishable from "raw blocks I failed to attribute" | **NOT MET** | the exemption restores the ambiguity for the quotation shape (BLK-1/BLK-2) |
| the tripwire's cost measured both ways | **PARTIALLY MET** | narrow = 0 of 104 (re-verified); blunt = 38 of 104, not the quoted 31 (non-blocking 1) |
| the four escapes: 3 closed, 1 named | **MET** | each re-measured above; the ceiling's scan-set sentence matches the code |
| seed + mutation + control for every new path | **NOT MET** | the exemption has none (BLK-4) |
| no test or guard weakened; the round removed a false claim | **MET** | `factory-guard.check.mjs` 90 → 93 → 104 `check(` sites; `git show 7b72207:…:1543` carries the old counter; the harness green |
| test delta zero; only the two guard files moved | **MET** | `git diff --stat 7b72207..8006e03` = the two guard files, this lane's reports and records; `avatarUrl.test.ts` is not in the round-4 diff |
| scope: every changed line traces to the slice | **MET** | in-range diff touches `factory-guard.mjs`, `factory-guard.check.mjs`, `slice-8a.md`, the two lane records and `ledger.md` — nothing else |

## RESIDUAL RISKS

- The test half of `npm run verify` (71 / 2063), the `vitest` count and the `avatarUrl` mutation outputs are
  builder-pasted; I did not run them. I did run the guard check harness (104/104) and both guards.
- The rule has **never compared anything on the live corpus** (`0 range summaries checked` every run): its
  entire firing evidence is synthetic seeds. The round's fix moved `ranges` from "counted an uncompared range"
  to "counted only compared ranges", which is correct, but the live signal stays zero — the exemption and the
  three dropped label spellings are the reason a future real sighting would not have to be silent only if it
  chose the fenced spelling.
- The exempt set and the label spellings that no longer match are, jointly, the route by which the original
  defect can return. They are now *described*; they are not *guarded*.
- `lib-sibling-guard.sh`'s `checked=0` and the `:1403-1406` early return remain live and 8b-owned.

**Recommended next action (one line):** either read the exempt labels (a blockquote region is a region, and a
`>`-quoted raw block whose summary contradicts itself is exactly what the rule exists for), or correct the
three sentences to the price — `:1550-1551`, `:1719`, and `slice-8a.md:931`/`:1056` — and add the
seed/mutation/control the exemption's own new path is missing; the BLK-1 counter fix and the prose-line
closure I would sign off as they stand.
