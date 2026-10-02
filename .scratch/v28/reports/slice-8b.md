# Slice 8b — mechanical determinism + the guard findings adjudicated in from 8a

Builder: `orchestrator-builder` (fresh context). Branch `Meisburg/onboarding`.
Base measured at `aa331d0` (the dispatch tip). This report is written FIRST and appended as produced.

**Scope, and where it came from.** The dispatch names two artifacts: `.scratch/v28/briefs/slice-8b.md`
(items 1 and 2 only — the trailing-newline sweep then its guard, and `scripts/slice-diff.sh`) **plus every
guard finding adjudicated in from slice 8a** (D-031, enumerated in `factory/work/v28-r2-8b.json`). This
document is `slice-8b` in that three-way split; the other two briefs are other slices (see the section
"What the three brief variants are for", below).

## The three brief variants — what each is for, and which is authoritative

| brief | subject | report | mine? |
|---|---|---|---|
| `slice-8b.md` | the ORIGINAL document: 219 lines, seven workstreams, ten top-level sections. Its own `⚠️ SCOPE CUT` header says **do only items 1 and 2** (newline sweep + its guard; `scripts/slice-diff.sh`) and that every other section "is someone else's turn". | this file | **YES — items 1 and 2, plus the inherited 8a guard findings from the dispatch.** |
| `slice-8b-2.md` | the TEST-HONESTY half: the Enter-key guard spec (item A), the failed-upload route-abort spec (item B), the two honesty fixes in `e2e/name-card-photo.e2e.ts` (item C). | `.scratch/v28/reports/slice-8b-2.md` | no |
| `slice-8b-3.md` | the CODE-FIX half: `useCropStep`'s `onConfirm` `\| void` (item A), the unguarded post-unmount effect (item B), the five honesty fixes slice 3's fix round left behind (item C). | `.scratch/v28/reports/slice-8b-3.md` | no |

**Authoritative for my scope:** `slice-8b.md` as constrained by its own SCOPE CUT (items 1 + 2), **plus** the
guard findings the dispatch explicitly registers here. The other two briefs are separate work items and I did
not touch their subjects — the only file they share with me is `scripts/guards/run-all.sh` (not protected),
which item 1 requires me to edit.

## Item table

*(appended as each item lands — symbol, re-measured line, change, proving command, raw result)*

### Item 1 — the trailing-newline sweep, then its guard, in that order

**Re-measured line numbers: none — this item has no line anchors. It has a COUNT, and the count was wrong
three ways in three documents.**

| source | count | scope | verdict |
|---|---|---|---|
| the dispatch | 65 | — | stale |
| `slice-8b.md` | 78 | `src/` 44, `e2e/` 21, `scripts/` 13 | stale breakdown |
| ledger's own correction | 79 | `src/` 44, `e2e/` 22, `scripts/` 13 | stale breakdown |
| **measured here at `aa331d0`** | **78** | **`src/` 45, `e2e/` 20, `scripts/` 13** | **used** |

Scope question, decided by measurement, not preference: the scan set is the repo's **code tree** —
`src/`, `e2e/`, `scripts/` (323 tracked files). Repo-wide over *all* tracked text files the number is **166**,
and the extra 88 are `.scratch/**` history (61), `supabase/migrations` (20), `docs/agents` + `.opencode/agents`
(9), and eight root files. Two of those root files are `vite.config.ts` and `playwright.config.ts`, which are
PROTECTED check configs: sweeping them would leave `config-guard` red against the merge-base forever, which is
the opposite of "the guard goes green after the sweep". The guard therefore states that boundary in its header
rather than pretending to a scope it does not read.

**Commit A — the sweep.**

```
$ node /tmp/sweep.mjs
files to sweep: 78
swept: 78
$ git show --stat --oneline d75c5e9 | tail -1
 78 files changed, 78 insertions(+), 78 deletions(-)
$ git diff -w --stat          # whitespace-only proof
(empty)
$ git diff --numstat | awk '$1!=1 || $2!=1'
(empty)                        # every file is exactly +1/-1
```

Committed as: **`d75c5e9`** — `8b item 1, commit A: the trailing-newline sweep`. Exactly the 78 files; the
report you are reading was not in it (it was untracked at that moment).

**Commit B — the guard `scripts/guards/trailing-newline-guard.mjs` (+ its `.check.mjs`).**

Registered in BOTH hard-coded places in `scripts/guards/run-all.sh`: the `for guard in …` list and the
`run_check` block. `.check.mjs`, never `.test.mjs` (a top-level `process.exit()` in a `*.test.mjs` kills the
vitest run).

Pre-fix proof, run against the real pre-sweep tree (`git worktree add --detach /tmp/prefix-tree aa331d0`):

```
$ node scripts/guards/trailing-newline-guard.mjs /tmp/prefix-tree
  323 text file(s) read, 0 empty …, 0 binary …
  FINDING: e2e/address-maps.e2e.ts — no newline at end of file
  …
PRE-FIX EXIT=1
$ grep -c "FINDING:" /tmp/prefix.out
78
$ grep "FINDING:" /tmp/prefix.out | sed 's#.*FINDING: ##; s#/.*##' | sort | uniq -c
     20 e2e
     13 scripts
     45 src
```

The guard's own run on the swept tree, and its behavior checker (seed + mutation for the file rule AND for the
D-030 empty-scan rule):

```
$ node scripts/guards/trailing-newline-guard.mjs
  325 text file(s) read, 0 empty …, 0 binary …
PASS — the newline convention holds across the scan set.
GUARD EXIT=0
$ node scripts/guards/trailing-newline-guard.check.mjs
  ✓ a text file with no newline at EOF is CAUGHT and named
  ✓ MUTATION: dropping the last-byte test lets that seed PASS (so check 1 can fail)
  ✓ control: a text file WITH its newline passes
  ✓ control: an empty file and a binary file are counted, not read as text and not failed
  ✓ an EMPTY scan is a FINDING (D-030: zero is not health)
  ✓ MUTATION: dropping the empty-scan test lets that seed PASS (so check 4 can fail)
  ✓ an UNTRACKED text file is read (git --others, not just the index)
  ✓ control: a file OUTSIDE the scan set does not fire the rule
PASS — all 8 checks: the guard fires on the defect and only on it.
CHECK EXIT=0
```

Committed as: **see commit B below.**

### Item 2 — `scripts/slice-diff.sh`

**Re-measured anchors: the brief's claim that the file is missing is CONFIRMED** (`ls scripts/slice-diff.sh`
→ `No such file or directory` at `aa331d0`). No line numbers to re-measure.

The tool takes a SLICE NAME, not a base: it reads the ledger's `dispatched (base <sha>)` line, prints the
resolved range in its header, and refuses rather than guessing.

```
$ bash scripts/slice-diff.sh 8b        # no base recorded for 8b — must refuse
slice-diff: REFUSING — the ledger records no `dispatched (base <sha>)` line for slice '8b'.
  A diff needs a base that was written down when the slice started; this tool will not invent one.
  dispatch line(s) found for this slice, none naming a base:
    7274:Slice 8b: dispatched. Scope = .scratch/v28/briefs/slice-8b.md …
EXIT=1
$ bash scripts/slice-diff.sh 1 -- scripts/guards/run-all.sh | head -3
slice-diff: slice '1'  range '15ada15..3bd7eb3fae2aa4a77c0f4213749cae4d341e84f5'
            base '15ada15' read from .scratch/v28/ledger.md (dispatch time, not typed now)
===========================================================
$ for id in 1 3 6c 8a 8b; do bash scripts/slice-diff.sh "$id" 2>&1 | head -1; done
slice-diff: slice '1'  range '15ada15..3bd7eb3f…'
slice-diff: slice '3'  range 'c9ab382..3bd7eb3f…'
slice-diff: slice '6c'  range '68080b0..3bd7eb3f…'
slice-diff: REFUSING — the ledger records no `dispatched (base <sha>)` line for slice '8a'.
slice-diff: REFUSING — the ledger records no `dispatched (base <sha>)` line for slice '8b'.
```

Boundary measured, not assumed: `6c` has several dispatch lines but only ONE carries `(base …)`; the tool
resolves it. A slice with two different recorded bases is a REFUSAL, not a coin-flip. The tool is named in
`docs/agents/code-structure.md` under a new "How a diff is inspected", because a tool the next reviewer does
not know about is a tool nobody runs.

Committed as: **see commit 3 below.**

### Item 3 — `lib-sibling-guard.sh` passes at `checked=0` (registered D-030 instance)

**Re-measured:** the hole is LIVE at `aa331d0`. `scripts/guards/lib-sibling-guard.sh:53-56` returned
`SKIP — src/lib not found` / `exit 0`, and `:105` printed `ok — all $checked non-exempt module(s)…` with
`checked=0` when every entry was exempt or a test. The line numbers moved with this edit, so the anchors
below are the symbol, not the number.

**Fix:** a missing `src/lib` is now a FINDING (was a `SKIP … exit 0`), and `checked=0` after the loop is a
FINDING. Both are the D-030 rule: the guard had examined nothing and reported health.

```
$ bash scripts/guards/lib-sibling-guard.sh          # real repo: 55 non-exempt modules
  ok — all 55 non-exempt module(s) have a sibling .test.ts
PASS — build law holds.
EXIT=0
$ node scripts/guards/lib-sibling-guard.check.mjs
  ✓ a module with no sibling test is CAUGHT and named
  ✓ MUTATION: dropping the missing-sibling test lets that seed PASS (so check 1 can fail)
  ✓ control: a module WITH its sibling passes and the run says what it read
  ✓ a module on the EXEMPT list is skipped, not failed
  ✓ the exempt-only root really did examine zero modules (the premise check 4 asserts)
  ✓ MUTATION: dropping the empty-scan test lets that seed PASS (so check 4 can fail)
  ✓ a MISSING src/lib is a FINDING, not a SKIP
PASS — all 7 checks: the guard fires on both defects and only on them.
EXIT=0
```

The new `lib-sibling-guard.check.mjs` is registered in the `run_check` block of `run-all.sh`. Two mutation
anchors were corrected while writing this (the first two tried to mutate the *printing* of the failure rather
than its *detection*, so the seed stayed red and the mutation proved nothing — a mutation that does not flip
its seed is not a mutation).

Committed as: **see commit 4 below.**

### Item 4 — `factory-guard.mjs`'s report/brief scan passed at `reportFiles: 0` (registered D-030 instance)

**Re-measured:** the hole is LIVE at `aa331d0`. The early return was at
`scripts/guards/factory-guard.mjs:1403-1406` (symbol: the `if (!files.length)` guard in
`checkReportHeadCounts`) — it printed `no .scratch/v28/reports or briefs under this root; … unchecked here`
and `count-provenance: … unchecked here`, returned `{ reportFiles: 0, provenanceChecked: false,
transcriptsChecked: false }` — **omitting `rawSummaryLines` entirely**, so by round 5 the early return silently
covered FOUR rules while naming three (the registered "now covers three" was already one short).

**Fix:** the empty scan is a FINDING (`report-scan-empty`), and the return carries `rawSummaryLines: 0` so the
destructuring sees every rule's result. The two "unchecked here" comfort notes are deleted, not restated
(D-028) — the finding carries the explanation.

The harness consequence, disclosed: every throwaway root the behavior checker builds must now actually carry a
report, or every check in it would find `report-scan-empty`. `run()` seeds one clean, claim-free report per
root by default; `report: false` is the seam that reaches the empty state for the new seed. That is one change
in one place rather than a hundred.

```
$ node scripts/guards/factory-guard.check.mjs        # 104 checks before this item
  …
  ✓ a report/brief scan that read no file is a FINDING, not a pass (D-030)
  ✓ MUTATION: dropping the empty-scan finding lets that seed PASS (so the check can fail)
  ✓ control: the same clean root WITH a report file passes (so the rule is not simply always red)

factory-guard check: all 107 checks passed.
EXIT=0
```

Committed as: **see commit 5 below.**

### Item 5 — the `transcript-summary-agrees` rule (D-031): the escape is closed

**Re-measured anchors.** Every line number in the findings was stale. Measured at `f55bc12` (before this item's
edit): `LABEL_LINE` at `:1523`, `INTRO_LINES` at `:1525`, the attribution window at `:1609-1612`, the exemption
at `:1644-1648`, the note at `:1656`, the claim universal at `:1719`, the early return at `:1403-1406`
(fixed in item 4), `discloseScanProvenance`'s `ls-files` at `:1715`. Anchors below are symbols, not numbers.

**THE RULING (D-031), stated explicitly as asked: I took the rule back to the smaller form — I did NOT add a
fourth condition.** The three additions that produced the last reviewed-good form and survived are the ones
with their own seed *and* mutation (indented regions, the unresolvable-count-is-a-finding rule, the label
tripwire). What I **removed** is the pair that created the escape and the false claims:

- the **quotation exemption** — deleted outright, not narrowed;
- the **12-line intro window** — deleted, not tuned (a line window made a legitimate long intro a finding and
  bought nothing: the label FORM is where the precision is, not a distance);
- the **`exec`-reads-one-summary** hole — the line is read with `matchAll` now, so every `✓ N–M … (all N)` on
  a line is compared.

What I **added** is one region kind, and it is what closes the escape: **a blockquote run is a region**, so a
`>`-prefixed fabricated transcript is READ instead of exempted. No new predicate, no new condition on the
label.

**THE ESCAPE, PROVEN CLOSED against the pre-fix guard binary** (`git show aa331d0:scripts/guards/factory-guard.mjs`),
on four throwaway roots (`r1` `>` then a contradiction; `r2` the whole block quoted; `r3` quote, blank,
quote; `r4` one agreeing block PLUS a quoted fabrication — the case where the old guard *published* its claim):

```
r1 PRE-FIX : note … 0 raw-labelled block(s) read, 0 range summaries checked — NOTHING was checked …  PASS exit 0
r1 CURRENT : note … 1 raw-labelled block(s) read, 1 range summary checked
             FINDING [transcript-summary-agrees]: …zz.md:5: covers 7 entries (7–13) but states "(all six"  FAIL exit 1
r2 PRE-FIX : 0 read … NOTHING was checked … PASS exit 0
r2 CURRENT : 1 read, 1 checked → FINDING … FAIL exit 1
r3 PRE-FIX : 0 read … NOTHING was checked … PASS exit 0
r3 CURRENT : 1 read, 1 checked → FINDING … FAIL exit 1
r4 PRE-FIX : 1 read, 1 checked, then `ok — … every step-range summary inside a raw-/verbatim-labelled block
             agrees with its own "all N" count …`   PASS exit 0   <- THE CLAIM PUBLISHED OVER THE FABRICATION
r4 CURRENT : 2 read, 2 checked → FINDING … FAIL exit 1
```

Live corpus (unchanged by the item except for the count): the rule now reads **16** raw-labelled blocks where
it previously read **8** (the 8 briefs labels whose next line is `>` are regions now), and still compares **0**
range summaries, with **0 findings** — the guard passes on its own repo.

**The behavior checker: 104 → 115 checks**, every new path with a seed and a mutation (the D-031 "unwatched
exempt set" is now a watched read path):

```
  ✓ a `>`-prefixed fabrication is CAUGHT (the D-031 escape is closed)
  ✓ the WHOLE block quoted, label included, is CAUGHT
  ✓ a quote, a blank line, then a quoted contradiction is CAUGHT (the quote region survives a blank line)
  ✓ an agreeing block ALONGSIDE a quoted fabrication no longer republishes the claim — the quoted block is read
  ✓ control: an AGREEING quote passes (so reading quotes is not "any quote fails")
  ✓ MUTATION: dropping the blockquote arm turns the escape CAUGHT-comparison into the label tripwire
  ✓ control: `the sketch is a draw:` is NOT a label (the left word boundary), so its block is not read
  ✓ MUTATION: not reading the label on the fence line lets that fabrication PASS (fence-inline mutation — the missing one)
  ✓ MUTATION: bounding the label search to one line turns that CAUGHT comparison into the tripwire
  …
factory-guard check: all 115 checks passed.   EXIT=0
```

Also fixed in the same rule: `LABEL_LINE` now carries a **left word boundary** (`/(?:\braw:|\bverbatim:)\s*\*{0,2}\s*$/i`),
so `withdraw:` and `the sketch is a draw:` are no longer labels (the control above); the note's zero clause no
longer says "no range summary … exists" when a range line does exist without a count; the claim universal now
names the label form it actually reads; and `discloseScanProvenance` restricts `git ls-files` to the SAME depth
the scan reads (top-level only), so a subdirectory under `reports/` can no longer make "under the same paths"
compare two different sets.

**DELIBERATE DEVIATION — the "coverage loss" finding, measured, and NOT fixed by widening.** The round-5 review
named three live blocks the narrowed label form stopped reading (`slice-6c-fix-5-review.md:606`,
`slice-6d-verify-5.md:120`, `slice-8a.md:408`) — all three introduced by a mid-sentence use of `verbatim`
(`… (verbatim, so the reader can re-run)`, `Run verbatim, exactly as pasted in …:`,
`command I name, verbatim (2026-10-02, tree 3f2da79 …):`). I re-measured the widening the finding implies and it
is **not landable**: with a mid-line token predicate the rule fires on the live corpus —

```
$ node /tmp/wide/guard.mjs --root <repo> --repo <repo>
  note — transcript-summary-agrees: 102 raw-labelled block(s) read, 2 range summaries checked
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/slice-8a-verify-4.md:122: covers 7 entries …
  … and 100+ `a label this rule saw and did not read` findings, every one an ordinary prose use of the word
  "verbatim" in a brief or report (".scratch/v28/briefs/slice-2-verify.md:56: Report counts verbatim. …")
EXIT=1
```

The word `verbatim` appears in the PROSE of hundreds of lines in this corpus — it is the word the reports use to
say "pasted exactly". A mid-line predicate therefore turns prose into labels, and the false attribution at
`slice-8a-verify-4.md:122` (a prose line that merely NAMES the rule, 8 lines above an indented block that
QUOTES the seed) makes the gate red on its own repo. The narrower read set is not an accident of the last
round: it is what makes the label mean "this line is introducing captured output".

So, per D-028, the response is to make the claim true rather than to widen into a rule that is red: the
docblock now states the label form as the boundary and says what it costs, and the claim universal names it.
**This is the one item in the dispatch I did not do as written, and the measurement above is why.** It is
flagged again under Risks and Unresolved questions.

**REPORT PROSE I DID NOT TOUCH.** Findings (4) and (5) name false claims inside **`slice-8a.md`** itself
(`:931` "all 8 real, none prose", `:953` "blunt tripwire … 31 of 104 checks break", `:990` "Seed + mutation +
control for every new path", `:1056` "the 3 lost were prose false-attributions"). I did not edit that file:
the dispatch says *"never hand-edit another lane's report"* and re-derivation of another slice's record is the
orchestrator's. The corrected measurements, for whoever retires them:

- `:953`'s **31 of 104** was not reproducible at round 5 (38/104 measured there), and it is stale the moment
  this item lands: **the harness is now 115 checks**, so any fixed denominator in that sentence is wrong.
- `:1056`'s **"the 3 lost were prose false-attributions"** is false: round 5 measured 6 dropped / 3 gained, and
  three of the six dropped are genuine (reproduced in the "escape" section above at `slice-8a-review-5.md:146-148`).
- `:931`'s "all 8 real, none prose" is true of what was read; it is `:1056`'s net-delta arithmetic that is false.
- `:990`'s "seed + mutation + control for every new path" was false of the exemption, which had none; the
  exemption no longer exists.

Committed as: **see commit 6 below.**

## Per-item table (the summary)

| # | item | symbol / anchor | re-measured line | change | proving command | raw result |
|---|---|---|---|---|---|---|
| 1a | newline sweep | the 78 files themselves | no line anchors; the COUNT was stale (65 / 78 / 79) | +1 newline at EOF on 78 files under `src/ e2e/ scripts/` | `git diff -w --stat` | empty (whitespace-only) |
| 1b | trailing-newline guard | `scripts/guards/trailing-newline-guard.mjs` (new) | n/a | new guard + `.check.mjs` + both `run-all.sh` registrations | `node …guard.mjs` / `node …check.mjs` | guard PASS; 8/8 checks |
| 2 | `slice-diff.sh` | `scripts/slice-diff.sh` (new) | file absent at `aa331d0` | slice-name tool, ledger base, refuses to guess | `bash scripts/slice-diff.sh 8b` | REFUSING, exit 1 |
| 3 | lib-sibling `checked=0` | `lib-sibling-guard.sh` (`if [ ! -d "$LIB_DIR" ]`, the tail `if/elif`) | `:53-56`, `:105` before; moved by the edit | missing `src/lib` and `checked=0` are FINDINGS | `node …lib-sibling-guard.check.mjs` | 7/7 checks |
| 4 | report scan `reportFiles: 0` | `factory-guard.mjs` `checkReportHeadCounts` early return | `:1403-1406` before; `:1405-1415` after | finding `report-scan-empty`; return carries `rawSummaryLines` | `node …factory-guard.check.mjs` | 107/107 at this commit |
| 5 | `transcript-summary-agrees` | `LABEL_LINE` / `checkRawBlockSummaries` / the claim at the summary | `:1523`, `:1525`, `:1609-1612`, `:1644-1648`, `:1656`, `:1719`, `:1715` before; all moved | exemption deleted, window deleted, blockquote regions added, `matchAll`, left word boundary, claim + note + `ls-files` depth corrected | `node …factory-guard.mjs --root <quoted-fabrication root>` | FAIL with `covers 7 entries` (was PASS) |
| 5b | the escape, against the PRE-fix binary | `git show aa331d0:scripts/guards/factory-guard.mjs` | n/a | — | pre-fix on `r1..r4` | PASS exit 0 (r4 publishes the claim); current: exit 1 |
| 5c | unreproduced number + report prose | `slice-8a.md` (`:931`, `:953`, `:990`, `:1056`) | not re-measured line-by-line (not edited) | **not touched** — another slice's report | `grep -n "31 of 104" .scratch/v28/reports/slice-8a.md` | present; corrected measurement below |

## Evidence about the brief — items ALREADY fixed, or already re-assigned

The brief warns that a stale item is evidence about the brief, not work. Measured at `eeac917`:

| brief item | measured | verdict |
|---|---|---|
| `slice-8b.md` §6/§7 — the `ProfilePage.tsx` call site passes `void handleKidPhotoUpload(...)` at `:1373` | `grep -rn "void handleKidPhotoUpload" src/` → **no match**; the live call site is `src/pages/ProfilePage.tsx:1382` `onUpload={(k, source, rect) => handleKidPhotoUpload(k, source, rect)}` (an expression body, so the promise is returned) | **ALREADY FIXED** — slice 3's fix round landed it. Evidence about the brief. |
| `slice-8b.md` §7 — `src/components/useCropStep.tsx:27` still admits `\| void` | `grep -n onConfirm src/components/useCropStep.tsx` → `:27  onConfirm: (source: ImageBitmap, rect: CropRect) => Promise<void> \| void,` | **STILL LIVE** — and it is `slice-8b-3.md`'s item A, not mine. Not touched. |
| `slice-8b.md` §7 — `e2e/onboarding-kid-photo.e2e.ts` now ends `)\n\n` (an extra blank line) | `tail -c 20 … \| xxd` → `… 2c0a 290a` = `,\n)\n` — it ends with exactly one newline, no blank line; it was **not** in the sweep's 78 | **ALREADY FIXED** (or never as written). Evidence about the brief. |
| `slice-8b-3.md` item C — `e2e/weekly-series.e2e.ts:21` imports `readMarkerSession` unused | `grep -n readMarkerSession e2e/weekly-series.e2e.ts` → **one** hit, the import at `:21` | **STILL LIVE**, and it is 8b-3's item C. Not touched. |
| `slice-8b.md` §6 — "the useCropStep await guard, and its own proof" (a NEW guard in `scripts/guards/`) | not in `slice-8b.md`'s SCOPE CUT items 1-2, not in `slice-8b-2.md` (specs), not in `slice-8b-3.md` (the `\| void` type fix only) | **UNASSIGNED across the three variants** — see Unresolved questions. Not built. |

## The guard-rule ruling, stated plainly, with before/after

**D-031 asked: take the rule back to its last reviewed-good form where that is simpler than a fourth condition.
I did that. I did NOT add a fourth condition, and I did not tune the existing ones — I DELETED the two
additions that produced the escape and the false claims, and ADDED exactly one region kind.**

| aspect | BEFORE (`aa331d0`) | AFTER (`eeac917`) |
|---|---|---|
| label predicate | `/(?:raw\|verbatim):\s*\*{0,2}\s*$/i` — no left boundary, so `draw:`/`withdraw:` were labels | `/(?:\braw:\|\bverbatim:)\s*\*{0,2}\s*$/i` — left word boundary added |
| regions read | fenced + Markdown-indented | fenced + indented + **blockquote run** (the fix that closes the escape) |
| label→region attribution | nearest label within **12 lines**, outside an earlier block | nearest label above, outside an earlier region — **no line window** |
| quotation exemption | **YES** — a label whose next non-blank line began `>` was exempted, and its block was never read | **DELETED** |
| range summaries per line | first pair only (`exec`) | **every** pair (`matchAll`) |
| label tripwire | a label with no block → finding, *minus the exemption* | a label with no region → finding, no exemption |
| escape reachable? | **YES** — `>` prefix ⇒ `0 … NOTHING was checked`, exit 0; with an agreeing block the claim was PUBLISHED over the fabrication | **NO** — the quoted block is read; `covers 7 entries`, exit 1 |
| live-corpus read count | 8 blocks | **16 blocks** (the 8 briefs `>`-introduced labels are read now) |
| harness | 104 checks | **115 checks** |
| declared boundary | "every step-range summary inside a raw-/verbatim-labelled block agrees" (wider than the mechanism) | "every step-range-and-count line read inside a region whose introducing line ENDS with raw:/verbatim" |

## The three registered `checked=0` paths — all closed

| guard | before | after |
|---|---|---|
| `lib-sibling-guard.sh` | `SKIP … exit 0` on a missing `src/lib`; `ok — all 0 non-exempt module(s)` at `checked=0` | both are FINDINGS; `lib-sibling-guard.check.mjs`, 7 checks with a seed and a mutation for each path |
| `factory-guard.mjs` report/brief scan | `reportFiles: 0` + `unchecked here` + exit 0 | FINDING `report-scan-empty`; 3 new checks (seed, mutation, control) |
| the early return "covering three" | returned without `rawSummaryLines`, so it had grown to cover four rules | fails, and its return carries every rule's result |

## Raw verify (fresh, this turn)

```
$ npm run verify
> npm run build && npm run test && npm run lint && npm run a11y:focus && npm run steering-lint && npm run guards
 Test Files  71 passed (71)
      Tests  2063 passed (2063)
 oxlint: 81 warning lines, 0 errors          # re-counted from the lint block; the 2 the first run added were fixed
  ok — AGENTS.md (1789 words, ceiling 1800)
PASS — steering layer is clean.
GUARDS: PASS — all deterministic rules hold.
VERIFY EXIT=0
```

`bash scripts/guards/run-all.sh` → `GUARDS: PASS — all deterministic rules hold.` exit 0. `scripts/steering-lint.sh`
→ `PASS — steering layer is clean.` Every number above is re-measured in this turn, not carried.

## Commits (one per item; the sweep FIRST, its guard second)

| commit | item |
|---|---|
| `d75c5e9` | item 1, commit A — the trailing-newline sweep (78 files, whitespace-only) |
| `3bd7eb3` | item 1, commit B — the `trailing-newline-guard` + `.check.mjs` + both `run-all.sh` registrations |
| `ccd9c19` | item 2 — `scripts/slice-diff.sh` + the `code-structure.md` note |
| `6cef89d` | item 3 — `lib-sibling-guard.sh` fails at `checked=0`, + its checker |
| `f55bc12` | item 4 — the report/brief scan fails on an empty scan (D-030) |
| `eeac917` | item 5 — the `transcript-summary-agrees` escape is closed (D-031) |
| `2ff8888` | the lint-warning regression from a check NAME removed, + this report's tables |

**Order was load-bearing and is satisfied.** The guard in `3bd7eb3` exists only after the sweep in `d75c5e9`;
run against the sweep's parent `aa331d0` it reports 78 findings and exits 1, and against the swept tree it is
green. Had they landed together, the guard would have been red from birth.

## Risks

- **`ponytail:`-class simplifications, named.** (1) The newline guard's scan set is the repo's CODE TREE
  (`src/ e2e/ scripts/`, 323 tracked files), not every tracked text file (166): `.scratch/**` history (61),
  `supabase/migrations` (20), `docs/agents` + `.opencode/agents` (9) and eight root files are out, and the
  guard's header says so. Two of the excluded root files are PROTECTED check configs — sweeping them would
  leave `config-guard` red against the merge-base for the rest of the batch. Ceiling: a missing newline in
  `.scratch/`, `docs/` or `supabase/` is invisible to this guard, by declaration. (2) `slice-diff.sh` refuses
  on an ambiguous ledger rather than selecting a round; the ceiling is a `ponytail:` comment in the file.
- **The `transcript-summary-agrees` coverage loss is declared, not restored** — see item 5. Widening the label
  to a mid-line token makes the live corpus red (100+ findings, measured). This is the one dispatch item not
  done as written.
- **`slice-8a.md`'s false claims are NOT edited.** `:931`, `:953` (31 of 104 — unreproducible, and the harness
  is now 115 checks), `:990`, `:1056` stand as written. The dispatch says never hand-edit another lane's
  report, and re-derivation of another slice's record is the orchestrator's. Corrected measurements are above.
- **The rule's live signal is still zero.** It compares **0** range summaries on this corpus every run; its
  entire firing evidence is synthetic. That was true before this slice and is unchanged — but it means the
  escape proof is a seeded proof, not a live one.
- **`slice-diff.sh 8b` refuses for 8b itself**, because the ledger's 8b dispatch line records no base. That is
  the tool working (it must not guess) and also a gap the orchestrator owns: the ledger, not this slice.
- **`ladder:`** — I copied `mutatedGuard`'s uniqueness assertion (`throw` unless the anchor occurs exactly once)
  from `factory-guard.check.mjs` into both new checkers, because I had already shipped two mutation checks in
  `lib-sibling-guard.check.mjs` whose anchors mutated the *printing* of a failure (so the seed stayed red and
  the "mutation" proved nothing). A mutation anchor that no longer exists is a silent no-op, and a silent no-op
  makes every mutation check pass vacuously; the throw is the structural constraint that keeps that out.
- **Two mutation anchors were corrected mid-item** (lib-sibling): the first two mutated the failure's *printing*
  and not its *detection*, so both seeds stayed red and neither mutation could flip. Recorded rather than
  quietly fixed.
- `scripts/guards/no-bypass-guard` and `e2e/places.e2e.ts:2759` are the brief's two named flakes. Neither was
  touched and neither failed in the two full `npm run verify` runs (`no-bypass-guard` is in the suite and
  passed both times); no e2e spec was run by this slice, because no e2e file changed.

## Unresolved questions (for the orchestrator)

1. **`slice-8b.md` §6 — "the `useCropStep` await guard, and its own proof" — is unassigned across the three
   brief variants.** It is not in 8b's SCOPE CUT (items 1-2), not in `slice-8b-2.md` (specs), and not in
   `slice-8b-3.md` (which takes the `| void` type tightening). `grep -n onConfirm src/components/useCropStep.tsx`
   shows `:27` still admits `| void` and `:167` still passes `onConfirm={(rect) => void confirm(rect)}`. If the
   guard is wanted, it is one more `scripts/guards/*.mjs` + `.check.mjs` + two registrations; if the type
   tightening in 8b-3 is judged sufficient, §6 should be deleted from the brief rather than left unowned.
2. **May `slice-8a.md`'s four false claims be edited?** I read "never hand-edit another lane's report" as
   covering it and left it alone. If you want them retired (D-028: delete, do not restate), it is a
   delete-only diff in a closed slice's report and I can do it on one word from you.
3. **The coverage-loss call.** I chose the label form as the boundary over widening into a red gate. If you
   would rather have the three prose-introduced blocks read, the only green options I measured are a wide label
   with a small window plus a COARSE (whole-scan) tripwire — which trades the per-label tripwire away, the one
   D-030 property the round-5 reviewer explicitly asked for. Say which you prefer and I will re-cut it.


## Anchor re-measurement — what stayed and what moved

Every anchor was re-measured **by symbol, not by number**. Pre-edit file states: `factory-guard.mjs` at
`6cef89d` (before item 5), `lib-sibling-guard.sh` at `ccd9c19` (before item 3), the sweep count at `aa331d0`.

| symbol | finding's anchor | measured | verdict |
|---|---|---|---|
| `checkReportHeadCounts` early return | `factory-guard.mjs:1403-1406` | `:1403` | matched |
| `LABEL_LINE` | `:1523` | `:1523` | matched |
| the docblock label definition | `:1537-1538` | `:1537` | matched |
| "the zero case is unreachable while a label is unread" | `:1550-1551` | `:1551` | matched |
| the attribution window | `:1609-1612` | `:1610` | matched |
| the quotation exemption | `:1644-1648` | `:1648` | matched |
| the note's zero clause | `:1656` | `:1656` | matched |
| `discloseScanProvenance`'s `git ls-files` | `:1679` | `:1679` | matched |
| the claim universal | `:1719` | `:1719` | matched |
| `lib-sibling-guard.sh` missing-`src/lib` SKIP | — (no number given) | `:33-34` | measured |
| `lib-sibling-guard.sh` `ok — all $checked …` | `:105` (round-5 review) | `:100` | **corrected — the review's number had drifted by 5** |
| the sweep count | 65 (dispatch), 78 (brief), 79 (ledger) | **78** (`src` 45, `e2e` 20, `scripts` 13) | **corrected — all three were stale** |
| the tripwire's cost | "31 of 104 checks break" | **unreproducible** (round 5: 38/104); harness now 115 | **corrected — see item 5** |

**So: the 8a findings' line numbers had NOT drifted** — they were written against `8006e03` and only the
item-4 early-return edit sits between it and my measurement. **The drift was in the COUNTS**: the file count
(four different values across three documents) and the harness cost (unreproducible). Two anchors did move by
symbol: the `lib-sibling-guard.sh` `ok —` line (+5 against the review) and the harness size (104 → 115 by the
end of this slice).
