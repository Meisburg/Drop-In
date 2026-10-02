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
- **The `transcript-summary-agrees` coverage loss is now MOOT, and the widening measurement is superseded.**
  The label predicate and the indented arm are deleted (fix round 1, D-032), so "the narrowed label form" no
  longer exists to widen. The figures this bullet used to carry (`102 / 2 / 100+`) were not bit-reproducible
  (review N3); the reviewer's own reproduction is the record now — a mid-line-token predicate gives
  `35 blocks / 1 summary / 54 findings` for `(?:\braw:|\bverbatim:)` and `107 / 2 / 143` for
  `(?:\braw:|\bverbatim\b)`, both EXIT=1 on this repo. **The load-bearing part of that measurement is
  unchanged and is what matters: the live corpus carries the word `verbatim` in its PROSE, so any predicate
  that reads a mid-line token fires on the reports themselves.**
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
  passed both times); no e2e spec was run by this slice, because no e2e file changed SEMANTICALLY — twenty
  e2e files did change in commit A, each by exactly one appended newline (review N8 corrected this sentence,
  which said "no e2e file changed" and was false as written).

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

---

# FIX ROUND 1 — the rule is re-scoped to "every fenced block, attribute nothing" (D-032)

Reviewed range `aa331d0..98db92f`; review at `.scratch/v28/reports/slice-8b-review.md` (VERIFY PASS, REVIEW
NEEDS_CHANGES, 3 blocking). **D-032 is the ruling and it changes the rule's SHAPE**: three repairs, three
escapes, each by breaking the *association* between a label and the block it introduces, so the rule is
re-scoped to what it can observe — **every fenced block is read, whoever wrote it and whatever precedes it.**
There is no association left to break.

**WHICH BRANCH OF D-032 I TOOK: I KEPT THE RULE. I did not delete it**, because the new shape did NOT open a
hole of the same family. I attacked it eleven ways (the reviewer's seed plus ten separators, below) and every
one is caught. The rule is now literal, so the last-attempt clause does not apply.

## B1 — the escape the review found, and its fix by DELETION

**What was deleted, and there is nothing left of it:**

| deleted | why it existed | state now |
|---|---|---|
| `LABEL_LINE` (the label regex) | to mark a block as captured output | **gone** (`grep -n LABEL_LINE` → no hits) |
| the nearest-label-above attribution + `previousEnd` bookkeeping | to associate a label with a block | **gone** |
| the blockquote REGION arm | so `>`-introduced labels in `briefs/` would be read | **gone** |
| the label tripwire (`attributed` / `inBlock` / `unreadLabel`) | D-030 for "a label I saw and did not read" | **gone** |
| the Markdown INDENTED region arm | it existed to serve the label machinery | **gone**, declared as a ceiling |
| `INTRO_LINES` | a label's search distance | already gone at `eeac917` |

**The reviewer's exact seed, against both binaries.** Seed: a `raw:` label, a blank line, a blockquote line,
a blank line, then the fenced block the label introduces. (Displayed below with the fence markers spelled
`FENCE-OPEN` / `FENCE-CLOSE`, because a literal fence here would put a bad `✓ A–B … (all N)` line inside a
fenced block of MY OWN report and make this report fire the rule it is documenting — which is also the
cleanest statement of D-032's declared cost.)

    # zz

    proof — raw:

    > a quote with no range in it

    FENCE-OPEN
    ✓ 7–13 zz-spec.e2e.ts (all six legs)
    FENCE-CLOSE

```
$ node /tmp/b1/prefix.mjs --root /tmp/b1 --repo .   # the guard at 98db92f, pre-change
  note — transcript-summary-agrees: 1 raw-labelled block(s) read, 0 range summaries checked — NOTHING was
         checked: this scan read no line that states a step range beside its count
PASS — the registry can be trusted and no work item claims evidence it does not have.
PRE EXIT=0

$ node scripts/guards/factory-guard.mjs --root /tmp/b1 --repo .
  note — transcript-summary-agrees: 1 fenced block(s) read, 1 range summary checked
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz.md:8: a fenced block's summary line covers
          7 entries (7–13) but states "(all six" — a captured transcript must reproduce its own arithmetic
FAIL — 1 factory finding(s).
NEW EXIT=1
```

**Pre-change PASS, post-change FAIL — the escape is closed.**

**NO NEW ESCAPE OF THE FAMILY: eleven attempts, all CAUGHT.** Pre-change = the guard at `98db92f`;
"caught" means the mutant-free guard exits 1 **with the arithmetic finding**, i.e. the block was READ (not
merely tripped by the label wire):

```
SEPARATOR        PRE      NEW      VERDICT
heading          1        1        CAUGHT      label, then a heading, then the fence
listitem         1        1        CAUGHT      label, then a list item, then the fence
paragraph        1        1        CAUGHT      label, then an ordinary paragraph, then the fence
listlabel        1        1        CAUGHT      the label INSIDE a list item
blockquote       0        1        CAUGHT      <- B1's shape: PRE-CHANGE ESCAPED (exit 0)
indentbetween    0        1        CAUGHT      <- an indented line between label and fence: escaped pre-change
htmlcomment      1        1        CAUGHT      an HTML comment between
twolabels        1        1        CAUGHT      two labels before one fence
tildeonly        1        1        CAUGHT      the block in a ~~~ fence only
tildelabel       1        1        CAUGHT      a label on the ~~~ fence's own line
labelinside      1        1        CAUGHT      the label inside the fence's opening line
```

`tildeonly` is the extra one this round closed beyond the review's list: the fence parser now reads **both**
markdown fence kinds (` ``` ` and `~~~`), paired with a fence of its own kind — a fence line of the OTHER kind
inside an open block is content, as markdown says. Reading only backticks left `~~~`-fenced content unread,
which is the same family of gap. Live corpus: 644 → **645** fenced blocks read, same two findings.

## B2 — the three mutations that moved PRINTING, not DETECTION

`factory-guard.check.mjs:1338-1346`, `:1365-1376`, `:1481-1489` were the `boundedWindow`, `noIndented` and
`noQuoteRegion` mutations. **All three are DELETED, together with the label machinery they mutated** — there
is no anchor for them left in the guard. The re-audit asked for, over every mutation this slice ships:

| mutation | seed → mutant verdict | flips? |
|---|---|---|
| `assumesAgreement` (`if (count === span) continue` → `if (true) continue`) | 1 → 0 | **yes** (7 checks use it) |
| `wordAssumesAgreement` (`WORDS[word]` → `span`) | 1 → 0 | **yes** |
| `greedyCount` (lazy `[^\n]*?` → greedy `[^\n]*`) | 0 → 1 | **yes** (the both-correct two-pair seed goes RED) |
| `noZeroBlocks` | 1 → 0 | **yes** |
| `noEmptyScan` | 1 → 0 | **yes** (required `files.length > 0` on the block tripwire so the two zero states are separable) |
| `mutatedGuard('if (buf[buf.length - 1] !== 0x0a) {', …)` (newline guard) | 1 → 0 | **yes** |
| `mutatedGuard('if (text === 0) {', …)` | 1 → 0 | **yes** |
| `mutatedGuard('if (unreadable.length) {', …)` (new, N6) | 1 → 0 | **yes** |
| `mutatedGuard('if [ ! -f "$LIB_DIR/$base.test.ts" ]; then', …)` | 1 → 0 | **yes** |
| `mutatedGuard('elif [ "$checked" -eq 0 ]; then', …)` | 1 → 0 | **yes** |
| `mutatedGuard2([two zero-check anchors])` (new, N4) | 1 → 0 | **yes** |

Every mutation check now asserts the seed's **exit code moves**. The two controls in each checker (a clean
tree passes) carry no mutation, and the checkers' headers now SAY which verdicts carry one — which is N4.

## B3 — `slice-diff.sh` resolved slice `6c` to a FIX-ROUND base and printed "dispatch time"

Fixed in the direction the review demanded ("a wrong base is worse than a refusal"): **dispatch lines are
split into BUILD dispatches and FIX-ROUND dispatches**, only the build lines' `(base <sha>)` counts, and when
the only recorded base sits on a fix-round line the tool REFUSES and says why.

```
$ bash scripts/slice-diff.sh 6c
slice-diff: REFUSING — slice '6c' has a base recorded only on a FIX-ROUND line.
  A fix-round base is a commit AFTER the slice's implementation; diffing from it would
  hide the slice's own work. A wrong base is worse than a refusal.
    7156:Slice 6c: fix round 3/5 dispatched (base `68080b0`, model cloud …)
EXIT=1
$ for id in 1 3 6c 8a 8b; do bash scripts/slice-diff.sh "$id" 2>&1 | head -1; done
slice-diff: slice '1'  range '15ada15..98db92f5bcb9536b9b966b45c85f532035f8395d'
slice-diff: slice '3'  range 'c9ab382..98db92f5bcb9536b9b966b45c85f532035f8395d'
slice-diff: REFUSING — slice '6c' has a base recorded only on a FIX-ROUND line.
slice-diff: REFUSING — the ledger records no `dispatched (base <sha>)` line for slice '8a'.
slice-diff: REFUSING — the ledger records no `dispatched (base <sha>)` line for slice '8b'.
```

**N5** also fixed: the usage block no longer truncates mid-sentence (it printed `2 = usage, 3 = base` and
stopped), and a leading `--` is stripped so the pathspec echo reads `(diff restricted to: scripts/…)`.

## The other findings

| finding | disposition |
|---|---|
| **N2** — `matchAll` over ranges but the count read once per line | **FIXED**: one regex pairs each `✓ A–B` with the `(all N)` that FOLLOWS it. New seed (two correct pairs on one line → pass, `2 range summaries checked`) + a mutation whose mutant goes RED (`greedyCount`). |
| **N3** — the widening figures were not reproducible | **FIXED** in the Risks section: my `102 / 2 / 100+` is superseded by the reviewer's reproduction table and the point that matters (prose `verbatim`), and the widening is now moot — the label is deleted. |
| **N4** — false claims in the two checkers' headers | **FIXED**: both headers now say which verdicts carry a mutation and which are controls, and `lib-sibling-guard.check.mjs` gained a real mutation for its missing-`src/lib` verdict. |
| **N5** — truncated usage, `--` echoed | **FIXED** (above). |
| **N6** — an unreadable file was silently `continue`d | **FIXED**: it is counted, named, and a FINDING (an uncertified file is not a clean one). Seed = a broken symlink (git lists it; `readFileSync` cannot open it) + a mutation whose mutant exits 0. Checker 8 → 10 checks. |
| **N7** — `rawSummaryLines === 0` drops the transcript claim silently | **unchanged, declared.** The claim is published only when a comparison ran, which is the honest half; on this repo the rule now compares **2** range summaries, so the claim IS published. |
| **N8** — my report said "no e2e file changed" | **FIXED**: say "no e2e file changed SEMANTICALLY"; twenty e2e files changed in commit A, each by exactly one newline. |
| **N9** — the coverage-loss deviation | **superseded** by the deletion; recorded above with the reviewer's figures. |
| **N10** — `lib-sibling-guard.sh` fires only when EVERY module is exempt | **unchanged, recorded.** An allowlist that grows until one module remains unchecked still prints `ok — all 1 non-exempt module(s)`. A baseline (the module count at the slice's base) would be needed to close it, and that is a re-derivation decision, not a builder's. |

## RAW VERIFY — `npm run verify` is RED, and ONLY from lane-report quotations

```
$ npm run verify
> npm run build && npm run test && npm run lint && npm run a11y:focus && npm run steering-lint && npm run guards
 Test Files  71 passed (71)
      Tests  2063 passed (2063)
 oxlint: 81 warning lines, 0 errors
  ok — AGENTS.md (1789 words, ceiling 1800)
PASS — steering layer is clean.
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/slice-8a-verify-5.md:37: a fenced block's summary
          line covers 7 entries (7–13) but states "(all six" — a captured transcript must reproduce its own arithmetic
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/slice-8b-review.md:89: (the same shape, the review's
          own quotation of the B1 seed)
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-8b-review.md:191: a count quoted against the bare
          moving revision (the review's own pasted run line, `<sha>`-less)
  FINDING [no-bare-head-count]: .scratch/v28/reports/slice-8b-review.md:193: the same class, twice on one line
FAIL — 4 factory finding(s).
GUARDS: FAIL — 1 guard(s) reported findings:  (factory-guard)
VERIFY EXIT=1
```

**Every one of the four is a QUOTATION inside a LANE report, and none is in a file this slice owns.**

- The two `transcript-summary-agrees` findings are D-032's **declared cost**, paid: `slice-8a-verify-5.md:37`
  is slice 8a's verifier quoting the 8a-round-4 escape seed; `slice-8b-review.md:89` is THIS review quoting
  the B1 seed inside a `~~~` block. Both are bad blocks *quoted to demonstrate the rule*, not fabrications.
- The two `no-bare-head-count` findings are **pre-existing at `98db92f`**, not added by this round — measured
  with the head version of the guard against the same tree: `FAIL — 2 factory finding(s)`, both on
  `slice-8b-review.md:191/:193`. They are another lane's quotations of `HEAD` inside a run transcript, and the
  baseline they exceed is re-derived by the orchestrator.
- **I did not hand-edit either lane report.** Clearing the two transcript findings needs one of: (a) re-word
  the quoted line in those two reports so it is not a fenced `✓ A–B … (all N)` (drop the parenthetical, or put
  the quotation in an indented block — indented code is outside this rule's scan set); or (b) delete the rule
  (D-032's escape hatch), which I did not take because no hole of the family remains. Clearing the two
  bare-HEAD findings is a baseline re-derivation, which the dispatch reserves to the orchestrator.

## Fix-round risks

- **The gate is red, from lane-report quotations only.** Stated plainly because it is the one thing a reader
  must not have to discover: `npm run verify` exits 1 at the guards step, and every finding names
  `.scratch/v28/reports/slice-8a-verify-5.md` or `.scratch/v28/reports/slice-8b-review.md`.
- **The declared cost is now a real one, on this corpus.** D-032 accepted that a report quoting a bad block
  will fire. It does — twice, right now. If that is unacceptable for a report that is *demonstrating* the
  rule, the only structurally safe absorber would need its own seed and mutation **and** must not be writable
  by a fabricator, which no shape I could find satisfies.
- **`ponytail:`** — the fence parser reads both fence kinds with same-kind pairing; the ceiling is that a
  mismatch (a ` ``` ` inside a `~~~` block) is treated as content, which is markdown's rule but is not a
  general parser.
- The rule's live signal: **2** range summaries compared on this corpus now (was 0), both from the two quoted
  seeds — so its live signal is still quotation, not a real transcript.

## Fix-round 1 — committed, and the state it hands over

Committed as: **`0f17891`** (plus a header-completeness follow-up in the same turn: the guard's own rule list
did not name `transcript-summary-agrees` at all, so the header — which `docs/agents/code-structure.md` makes
the authoritative statement of what the guard covers — now carries it).

**Fresh, at the committed state: `npm run verify` EXIT=1, and the failure is one guard, on four findings, all
quotations inside two LANE reports.** Everything before the guards step is green: `Test Files 71 passed (71)`,
`Tests 2063 passed (2063)`, oxlint `81 warnings / 0 errors`, `AGENTS.md (1789 words, ceiling 1800)`,
`PASS — steering layer is clean.`

| finding | file | what it is | who clears it |
|---|---|---|---|
| `transcript-summary-agrees` | `.scratch/v28/reports/slice-8a-verify-5.md:37` | 8a's verifier quoting the round-4 escape seed | a lane report — not mine |
| `transcript-summary-agrees` | `.scratch/v28/reports/slice-8b-review.md:89` | THIS review quoting the B1 seed | a lane report — not mine |
| `no-bare-head-count` | `.scratch/v28/reports/slice-8b-review.md:191` | the review's pasted run line, quoted against the moving revision | **PRE-EXISTING at `98db92f`** (measured: the head guard reports 2 findings on the same tree) — baseline re-derivation |
| `no-bare-head-count` | `.scratch/v28/reports/slice-8b-review.md:193` | the same class, twice on one line | as above |

**Say-so, per the dispatch:** `run-all.sh` is red ONLY from lane-report quotations, so I did not hand-edit a
report that is not mine, and the baseline re-derivation is the orchestrator's. The two clearance routes are
(a) re-word the two quoted lines so they are not fenced `✓ A–B … (all N)` (indented code, or dropping the
parenthetical, is enough — indented code is outside this rule's scan set), and (b) re-derive the
`no-bare-head-count` baseline. **Neither is a builder's edit, and both are named rather than assumed.**

**The build-law half of this rule is proven at the committed state**: `factory-guard.check.mjs` 112/112 (exit
0), `trailing-newline-guard.check.mjs` 10/10, `lib-sibling-guard.check.mjs` 8/8; the reviewer's seed exits 0
on the pre-change guard and 1 here; eleven separation attempts are all CAUGHT.

---

# FIX ROUND 2 — the declared cost becomes PAYABLE: a recorded baseline (D-033)

**This section SUPERSEDES fix round 1's handover.** Round 1 ended with `npm run verify` red on four findings, all
quotations inside two lane reports, and stopped there because hand-editing a lane report is forbidden. D-033 rules
that a declared cost which the evidence trail cannot pay is a hole with better manners, and names the payable
form: **a recorded baseline, which a report cannot forge** — not a rule about what a quotation looks like, which
the content can write. The gate is green again and nothing in a lane report was edited.

## 1. `transcript-summary-agrees` gets the same absorber as every other rule in this suite

Copied from `no-bare-head-count`'s form, mechanism and all: a committed map of `file::line-text → count`,
re-derived from the instrument's own matches, never hand-added, printing its size on every run, and
**forward-only** — a new key, or a second occurrence of a recorded one in the same file, exceeds the record and
still fires. The line the run prints on this repo, verbatim:

```
  note — transcript-summary-agrees: quotation baseline holds 2 recorded site(s), re-derived and never hand-added;
         a NEW site, or a second occurrence of a recorded one in the same file, is a finding
```

When a recorded site stops matching, that line gains a clause naming the shortfall (measured in a copy with one
stale key, so this one is described rather than pasted as if it were this repo's output):
`— N of the 2 ABSORBED this scan (LOST COVERAGE 2 − N)`. On this repo the clause is **absent**, which is the
fully-covered state. **Round 3 correction (review NB3/NB4):** "ABSORBED" is the honest word, not "matched" —
the counter counts absorbed FINDINGS, so a recorded line whose arithmetic had become correct would return before
the count and read as lost coverage; and the sibling `UNRESOLVABLE_SHA_BASELINE` clause is conditional while this
one is not, so round 2's claim that this one "mirrors" it was false.

The two entries, derived by blanking the map in a throwaway copy and recording the instrument's own findings:

    // transcript-summary-agrees: 2 distinct key(s), 2 occurrence(s)
      [".scratch/v28/reports/slice-8a-verify-5.md::> ✓ 7–13 zz-spec.e2e.ts (all six legs)", 1],
      [".scratch/v28/reports/slice-8b-review.md::✓ 7–13 zz-spec.e2e.ts (all six legs)", 1],

**Derived TWICE, byte-identical** (`diff -q` → no difference), at both the middle and the final state of this
round. The derivation is a command, not a promise: `node /tmp/derive.mjs <rule> <mapVar>` blanks the named map in
a copy of the guard, runs that copy over the repo, and prints ready-to-paste entries.

## 2. UNFORGEABILITY — proven, and it is the requirement that decides the ruling

**The seed: a NEW file quoting the SAME text still FIRES.** A throwaway root holding the recorded site AND a new
file (`zz-new-quoter.md`) with the identical line:

```
$ node scripts/guards/factory-guard.mjs --root /tmp/forg --repo .
  note — transcript-summary-agrees: quotation baseline holds 2 recorded site(s) … — 1 of the 2 matched this scan (LOST COVERAGE 1)
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz-new-quoter.md:4: a fenced block's summary line
          covers 7 entries (7–13) but states "(all six" …
FAIL — 1 factory finding(s).        # the recorded file is ABSENT from the findings; only the newcomer fires
```

**And the mutation proves the FILE in the key is what does it**: an absorber keyed on the TEXT alone
(`[...keys()].some((k) => k.endsWith('::' + line))`) absorbs the newcomer too and the seed PASSES — so the check
can fail, and the property it asserts is the mechanism, not the wording. Harness, verbatim:

```
  ✓ a RECORDED quotation site is absorbed — the baseline absorbs it, not its shape
  ✓ MUTATION: with no absorber the recorded site goes RED (exit 0 -> 1 — a DETECTION flip)
  ✓ UNFORGEABILITY: a NEW file quoting the SAME text still FIRES, and the recorded file does not
  ✓ MUTATION: an absorber keyed on the TEXT alone lets that newcomer pass (exit 1 -> 0) — the FILE in the key is
    what makes the record unforgeable
  ✓ a SECOND occurrence of a recorded line, in the same file, is a finding (the baseline records a COUNT)
  ✓ MUTATION: a count-free lookup absorbs the second occurrence too (exit 1 -> 0 — a DETECTION flip)
  ✓ the DECLARED boundary: an INDENTED fabricated transcript is OUTSIDE the scan set (no finding)
  ✓ MUTATION: reading unfenced content makes that indented fabrication FIRE (exit 0 -> 1) — the fenced boundary is
    what keeps it out
```

`factory-guard.check.mjs`: **112 → 120 checks** (round 3 adds ten more — six sweep shapes and four empty-record
verdicts — for **130**, re-measured). Every new check carries a mutation whose **exit code moves**. *(Round 2
said "the six new checks", which matched no subset: eight were added, and the reviewer counted them.)*

## 3. The indented-code boundary, DECLARED — with its own seed

D-033 item 3 asks for the scope boundary to be stated where the rule states its scope, not implied. It is now in
the ceiling list in those words: *this rule reads FENCED blocks; an indented code block is outside its scan set —
which is also the second way a lane report can clear a quotation, by indenting it, at the cost of no longer being
a fenced block.* The seed (indented, so it is not inside a fence itself — `FENCE-OPEN`/`FENCE-CLOSE` stand in for
the fence markers, or this report would be displaying a block it reads):

    # zz indented
    FENCE-OPEN
    no step ranges in this one
    FENCE-CLOSE

        proof — raw:

        ✓ 7–13 zz-spec.e2e.ts (all six legs)

→ **exit 0, `1 fenced block(s) read`, no finding.** Its mutation reads unfenced content and the same seed goes RED
(`covers 7 entries`), so the boundary is load-bearing rather than incidental.

## 4. `no-bare-head-count` — RE-DERIVED, and it reproduced itself exactly

The map was emptied in a throwaway copy, the instrument run over this corpus, its own matches recorded, and the
result compared to the committed map:

```
committed: 437 key(s), 671 occurrence(s)
derived  : 437 key(s), 671 occurrence(s)
LOST coverage (baselined key no longer matched): 0
GAINED (new key): 0
COUNT CHANGED: 0
order-insensitive equality with the committed map: true
```

Derived **twice, byte-identical**. The committed map now equals a fresh derivation, so **lost coverage is 0 and
no shared count moved** — nothing was typed away and nothing was quietly dropped. (For the record, the
intermediate state was 435 keys / 669 occurrences + the two new `slice-8b-review.md` entries; the count grew to
**671** as printed, which is `669 + 2`.)

**One addition beyond the literal ask, declared:** `no-bare-head-count`'s run now also prints
`671 of the 671 recorded occurrence(s) matched this scan (LOST COVERAGE 0)`. *(Round 2 called this a "mirror" of
`UNRESOLVABLE_SHA_BASELINE`'s clause; the reviewer measured that the sibling is conditional on loss and this one
was unconditional, so the word was false — see the round-3 correction above.)* Without it, "lost coverage" is a
claim made in a report rather than a number the run produces — the shape D-030 exists to catch.

## RAW VERIFY — `npm run verify` is exit 0

```
$ npm run verify
 Test Files  71 passed (71)
      Tests  2063 passed (2063)
 oxlint: 81 warning lines, 0 errors
  ok — AGENTS.md (1789 words, ceiling 1800)
PASS — steering layer is clean.
  note — no-bare-head-count: baseline holds 671 recorded occurrence(s) …
  note — transcript-summary-agrees: quotation baseline holds 2 recorded site(s), re-derived and never hand-added …
  note — no-bare-head-count: 671 of the 671 recorded occurrence(s) matched this scan (LOST COVERAGE 0)
GUARDS: PASS — all deterministic rules hold.
VERIFY EXIT=0
$ bash scripts/guards/run-all.sh
GUARDS: PASS — all deterministic rules hold.        RUNALL EXIT=0
$ bash scripts/steering-lint.sh
PASS — steering layer is clean.                      EXIT=0
```

Every number above is re-measured in this round; the two baseline sizes are quoted **as the guard prints them**,
never as prose.

## Fix-round-2 risks

- **The absorber is a record, so it must be re-derived when the corpus's quotations change.** If a lane report
  re-words a recorded quotation the old entry goes stale and the run prints `LOST COVERAGE 1`; the remedy is a
  re-derivation, never a hand-edit of an entry. The clause is printed for exactly that reason.
- **The count is per (file, line-text), not per line number**: a recorded line that MOVES inside its file stays
  absorbed (the key has no line number), which is deliberate — a lane report that grows a paragraph must not
  redden the gate — and a second occurrence still fires.
- **The indented boundary remains a boundary**: a fabricated transcript written as indented code is not read by
  this rule. That is declared in the ceiling, is now seeded in the harness, and is the one shape the next reader
  should attack if they want a fifth attempt at this rule.

---

# FIX ROUND 3 — the claims come down to what the mechanism keeps (D-028/D-030)

Scope: **lowering claims**, plus the two real fixes the review named. D-032's shape is untouched; the absorber's
design is untouched; no lane report and no `factory/` file was edited. The gate stays exit 0 with both baselines
derived and lost coverage 0.

## BLK1 — the absorber's claim was too strong; the sentences now say what it does

The reviewer answered the converse question with a measurement: **a report alone CAN reach a pass by rewriting a
report AT a recorded path** (throwaway root, exit 0, PASS, and no `LOST COVERAGE` clause — silent). The key names a
*path*, and a path is writable. The mechanism's real guarantee is about **content and count**, not about which prose
a path holds. Both over-claims are lowered to that, and the boundary is now declared where the rule states its
scope:

| | before | after |
|---|---|---|
| docblock | *"A baseline is not forgeable from a report … **Producing a baselined citation requires editing THIS guard**, which is a reviewed diff."* | *"The record is not reachable by CONTENT … **THE BOUNDARY THE RECORD DOES NOT CROSS, stated here because the mechanism does not enforce it (D-033, review round 2 BLK1): the key names a PATH, and a path is writable.** A report that REUSES a recorded path and carries the recorded text up to its recorded count is absorbed — the record cannot tell such a report's quotation from a fabrication that copied the citation."* |
| header (the build law's authoritative statement) | *"absorbed only by the RECORDED baseline (D-033), **which a report cannot forge**"* | *"absorbed only by the RECORDED baseline (D-033). **Not by CONTENT**: the key carries the FILE, so the same text at a new path, or a second occurrence at a recorded path, still fires. **It IS reachable at a recorded path** — the recorded text there is absorbed, and the record cannot separate a quotation there from a fabrication that copied the citation."* |
| the ceiling bullet | "a new file … or a second occurrence … still fires" | the same, plus: "the recorded text AT the recorded path is absorbed, and the record cannot tell a quotation there from a fabrication that copied the citation." |

**No machinery was added to close it** — the fix is the sentence, as instructed. The existing harness check was
**re-named to name the boundary**, so it is declared *and* seeded rather than declared and unmentioned:

```
  ✓ the DECLARED path-occupancy boundary: the recorded text AT a recorded path is absorbed (the record cannot tell
    a quotation there from a fabrication that copied the citation — see the rule header)
  ✓ MUTATION: with no absorber the recorded site goes RED (exit 0 -> 1 — a DETECTION flip)
```

**For the orchestrator, one thing I could not fix:** `factory/decisions.md` D-033 carries the same overstatement
("they would have to edit the guard, which is a reviewed diff"). `factory/` is off-limits to this lane, so the
ruling's sentence still promises more than the mechanism keeps; the guard's header, which
`docs/agents/code-structure.md` makes authoritative for coverage, no longer does.

## BLK2 — the coverage clause: its comment was false, and `0 of 0` was vacuous

The comment said the clause "appears only when the number is non-zero, exactly like the unresolvable-sha note
beside it". **The `console.log` was unconditional and the sibling IS conditional** — D-028's shape, a sentence about
the mechanism shipped in the same commit as the mechanism. Fixed in the direction D-030 requires: **the empty record
is now a FINDING and the clause is printed only when there is a record to print it about.**

```
  note — no-bare-head-count: baseline holds 671 recorded occurrence(s); a new count resolved through bare HEAD is a finding
  note — no-bare-head-count: 671 of the 671 recorded occurrence(s) matched this scan (LOST COVERAGE 0)
  [with an EMPTY record:  FINDING [no-bare-head-count]: the recorded baseline is EMPTY — there is no record to
   absorb anything with, so a run must not print a coverage clause over it as if the record were fully covered (D-030)]
  [transcript, same shape: FINDING [transcript-summary-agrees]: the quotation baseline is EMPTY …]
```

Proven with a seed **and a mutation whose exit code moves** (`emptyMapCopy` empties the map literal — the seam a
textual anchor cannot reach, and the only way to reach the state):

```
  ✓ an EMPTY bare-head record is a FINDING (D-030: 0 of 0 cannot read as fully covered)
  ✓ MUTATION: dropping that finding lets the empty record PASS (exit 1 -> 0 — a DETECTION flip)
  ✓ an EMPTY quotation record is a FINDING (D-030), the same shape one rule over
  ✓ MUTATION: dropping that finding lets the empty quotation record PASS (exit 1 -> 0 — a DETECTION flip)
```

**What is still only a snapshot, stated rather than implied (review NB2):** a *partial* loss prints
`LOST COVERAGE N` and does not move the exit code. Making it fatal would redden every temp-root run — the map
covers **this** corpus and a fixture root is not it — so it is declared as a process promise: the number is printed,
the map can be edited, and the guard cannot tell. What it can no longer do is print the greenest value over **no
record at all**.

## The non-blocking findings

| finding | disposition |
|---|---|
| **NB1** wrong number | FIXED — round 2 said "the six new checks"; eight were added. Round 3's own count is stated as **130**, re-measured. |
| **NB2** the clause is a snapshot, not a tripwire | FIXED **by stating it** — the docblock now says both the printed number and the process promise are process-level, and the empty case gates. |
| **NB3** "mirroring" the conditional sha clause | FIXED — both the report and the docblock corrected; the transcript note's word is `ABSORBED`, not "matched". |
| **NB4** `absorbed` counts absorbed FINDINGS, not matched sites | FIXED in the wording — the note prints `ABSORBED`, and the docblock says so with the reason (an agreeing line returns before the count). |
| **NB5** the eleven-shape sweep was harness-seeded for five | FIXED — the other **six are now seeds**, each with the shared detection mutation: an indented line between, an HTML comment between, two labels before one fence, the block in a `~~~` fence only, a label on the `~~~` fence line, a label on the ``` fence line (all CAUGHT, all mutants PASS). The review's reading of my ambiguous "label inside the fence's opening line" is the *unfenced* ceiling — now declared and seeded as such. |
| **NB6** §1's "verbatim" block mixed real and synthetic output | FIXED — the real line is pasted verbatim; the conditional clause is described as measured-in-a-copy, not pasted. |

## "Which set did I just stop watching?" — round 3's answers

1. **The two recorded sites** — watched by the derivation (emptied map reproduces them exactly) and by the
   declared path-occupancy check.
2. **The two added bare-head keys** — same derivation, and `LOST COVERAGE 0` is printed every run.
3. **The path-occupancy direction** — DECLARED in the docblock, the authoritative header and the ceiling list, and
   seeded by the re-named check. Not closed, and no longer claimed closed.
4. **The six unseeded separators** — now six seeds in the harness.
5. **The `LOST COVERAGE` clause itself** — the empty state is a FINDING with an exit-moving mutation; the partial
   state is a declared snapshot with its reason printed in the docblock.
6. **The claim list when coverage is lost** — the claim is about *findings* ("beyond the recorded baseline"), which
   stays true; and the state where it was published over an EMPTY record now fails instead.

## RAW VERIFY (fresh, at the committed state)

```
 Test Files  71 passed (71)      Tests  2063 passed (2063)
 oxlint: 81 warnings / 0 errors   ok — AGENTS.md (1789 words, ceiling 1800)
PASS — steering layer is clean.   GUARDS: PASS — all deterministic rules hold.
VERIFY EXIT=0                     RUNALL EXIT=0
checkers: factory-guard 130/130, trailing-newline 10/10, lib-sibling 8/8
baselines as printed: no-bare-head-count 671 ; transcript-summary-agrees 2 ; LOST COVERAGE 0
```

---

# FIX ROUND 4 — the baseline family gets one empty-record form, and the last four non-blocking findings land

Scope: **BLK3** (the third baseline's zero state) plus **NB-a, NB-b, NB-c, NB-d**. D-032's rule shape is untouched
— round 3's review ruled it sound and this round did not go near it. The absorber's design is untouched, the
declared path-occupancy boundary is still declared and still open, and no lane report and no `factory/` file was
edited.

## BLK3 — one shared empty-record mechanism, routed through by all three baselines

The empty-record finding existed for two baselines and not for the third: `UNRESOLVABLE_SHA_BASELINE` still passed
at nothing-recorded while the claim list published `no count's provenance sha unresolvable beyond the recorded
records` over the empty record. A third hand-written condition would have been the same defect one round later, so
the finding is now **one shared mechanism in the guard**, `recordIsAbsorbable(check, record, size)`: it returns
`true` when there is a record, and on an empty record it files **that record's own finding** and returns `false`.
Each of the three baselines prints its coverage note **only inside that call**, so the empty decision and the note it
suppresses are the same form rather than two conditions that can drift. The comment states why the form is shared:
three copies of one condition is the defect the fourth record is written without.

Raw evidence — each map emptied over a clean throwaway root, then the same seed with that record's own call to the
shared mechanism neutered:

| record | emptied map | emptied, call neutered |
|---|---|---|
| `BARE_HEAD_BASELINE` | exit 1, `the recorded baseline is EMPTY` | exit 0 |
| `UNRESOLVABLE_SHA_BASELINE` | exit 1, `the unresolvable-sha record is EMPTY` | exit 0 |
| `TRANSCRIPT_QUOTATION_BASELINE` | exit 1, `the quotation baseline is EMPTY` | exit 0 |

The emptied map is reached with `emptyMapCopy` — the seam a textual anchor cannot reach — and the harness carries
all three in **one loop** (map, check, record), three seeds and three mutations whose exit code moves `1 -> 0`.
The third baseline now has a seed and a mutation where it had neither.

## NB-a — the harness's own sentences come down to the measured boundary

The `UNFORGEABILITY` comment asserted a blanket property ("a baseline entry must NOT be reachable by writing a
file") and the mutation's check name said the FILE in the key "makes the record unforgeable". Both are flatly
contradicted by the declared boundary and by the measured path-occupancy direction — a fabrication written at a
recorded path is absorbed. The heading, the clause and the check name now say the measured thing,
**`NOT REACHABLE BY CONTENT`**: a new path quoting the same text still fires, and the comment states in words that
a rewrite AT a recorded path is absorbed, so nothing there claims the record is unforgeable. No machinery was added
to this one, as instructed — it is a sentence.

## NB-b — the mid-line member of the unfenced ceiling, named and seeded

Round 3 said the ambiguous shape was "declared and seeded as such", but the seed carried was the *indented*
variant; the member the round-2 review actually read — **a fence marker with text before it on the line** — still
escaped and had no seed. It is now named in the rule's ceiling list (a marker is read only at the start of a line,
after leading whitespace) **and seeded**: the seed exits 0 with the block count printed and no finding, and a
mutation that reads markers anywhere on the line makes the same content FIRE (exit 1). So the round-3 sentence is
now true by measurement rather than corrected by wording.

## NB-c — the orphaned JSDoc

The `mutatedGuard` docblock sat directly above `emptyMapCopy`, the helper this diff's earlier round had inserted
between them, leaving `mutatedGuard` documented by nothing. It is moved back above `mutatedGuard`; no sentence was
changed.

## NB-d — the range-claim gate gets a check

The summary publishes "every step-range-and-count line read inside a fenced block agrees with its own count" only
when range lines were actually read. That gate stops the universal claim being asserted over zero comparisons, and
no seed re-ran it. It is a **claim gate, not a finding, so its mutation moves the published claim and not an exit
code** — which is exactly why it needs a check: an edit dropping the gate would keep the harness green while the
claim was asserted over nothing. The new checks are check 16's shape for the range claim: at zero range lines the
run prints that nothing was compared and does **not** assert the ranges agree; with a range line read it **does**;
and a mutation that drops the gate asserts the claim over zero comparisons, so the seed can fail.

## RAW VERIFY (fresh, at the committed state)

```
 Test Files  71 passed (71)
      Tests  2063 passed (2063)
 oxlint: 81 warning lines, 0 errors
  ok — AGENTS.md (1789 words, ceiling 1800)
PASS — steering layer is clean.
GUARDS: PASS — all deterministic rules hold.
VERIFY EXIT=0
RUNALL EXIT=0  (bash scripts/guards/run-all.sh)
STEERING EXIT=0  (bash scripts/steering-lint.sh)
checkers: factory-guard 137/137 (was 130), trailing-newline 10/10, lib-sibling 8/8
baselines as the run prints them: no-bare-head-count 671 of the 671 recorded occurrence(s) matched
this scan (LOST COVERAGE 0) ; transcript-summary-agrees quotation baseline holds 2 recorded site(s) ;
count-provenance 10 recorded unresolvable-sha record(s) absorbed
```

## Baselines re-derived — all three, twice, lost coverage 0

Blanked-map re-derivation of each record, over this corpus, with the parser keyed to the same key each map uses
(`file::text`, `file::sha`, `file::line-text`), compared against the committed map:

| record | committed | derived | lost | gained | changed | equal |
|---|---|---|---|---|---|---|
| bare-head | 437 key(s), 671 occurrence(s) | 437, 671 | 0 | 0 | 0 | true |
| unresolvable-sha | 2 key(s), 10 occurrence(s) | 2, 10 | 0 | 0 | 0 | true |
| quotation | 2 key(s), 2 occurrence(s) | 2, 2 | 0 | 0 | 0 | true |

Run twice at the committed state; the printed derivation is byte-identical across the two runs.

## "Which set did I just stop watching?" — round 4's answers

1. **The third record's zero state** — now a finding with its own seed and an exit-moving mutation; it was the
   blocking gap.
2. **The shared empty-record mechanism** — one form, three call sites, one loop in the harness; a fourth record
   enters by one call whose finding and note-suppression come together.
3. **The mid-line member of the unfenced ceiling** — named in the ceiling list and seeded, with a mutation that
   makes it fire. It remains open by declaration.
4. **The range-claim gate at zero comparisons** — now re-run by a check; the mutation moves the claim, not the
   exit code, and that is stated rather than hidden.
5. **The path-occupancy boundary** — untouched, still declared, still not closed (D-033's ruling).
6. **`factory/`'s corrected ruling** — not mine to edit; untouched this round.

## Fix-round-4 risks

- **NB-d's check asserts a claim, not a verdict.** A claim gate cannot redden a run by construction, so its
  mutation moves the *published claim* and not an exit code. This is the one new check whose mutation does not move
  the exit code; every new finding check (three empty-record seeds, the mid-line ceiling seed) does.
- **The shared mechanism is a function, not a loop in the guard.** The reviewer's rung was a shared form; the form
  is `recordIsAbsorbable`, and the loop lives in the harness over the three records. The guard cannot loop over the
  notes themselves because each note reads a different counter at a different point in the scan; the call site is
  the unit that keeps the finding and the note-suppression together.
- **`ponytail:`** — the derivation comparison is a script under `/tmp`, not a committed instrument; a future round
  must re-derive rather than trust this number. The committed maps are still the only absorber.

# FIX ROUND 5 — the fence parser is made CommonMark-conformant, check 13's fixture leaves the live registry, and two claim gates stop publishing over zero

Scope: **FIX 1** (the fence parser + the three sentences it falsified), **FIX 2** (check 13's seed), **FIX 3** (the two
claim gates), **FIX 4** (the `lib-sibling-guard.sh` sentence). `transcript-summary-agrees`'s RULE shape is untouched
(D-032), the declared path-occupancy boundary is untouched (D-033), no `factory/` file and no ledger was edited, and
neither of the two lane reports was hand-edited. All probes ran in `/tmp` throwaway roots or against the real corpus;
the only files changed are the two factory-guard files and `lib-sibling-guard.sh`.

## FIX 1 — the fence parser now follows CommonMark's closure rules (not a fourth guess)

**The escape, reproduced against the old parser at `HEAD`** (a throwaway root holding one report file, the standard
nested-fence idiom with a fabricated transcript inside):

```
$ node /tmp/g-head.mjs --root /tmp/probe8b --repo .     # the HEAD guard
  note — transcript-summary-agrees: 2 fenced block(s) read, 0 range summaries checked — NOTHING was compared: no fenced block in this scan states a step range beside its count
  note — transcript-summary-agrees: quotation baseline holds 2 recorded site(s) … 0 of the 2 ABSORBED this scan (LOST COVERAGE 2)
PASS — the registry can be trusted and no work item claims evidence it does not have.
OLD_EXIT=0
```

The seed file is (indented, with `FENCE-OPEN`/`FENCE-CLOSE` standing in for the markers — this report's own
convention, so that quoting the seed does not put a bad range line inside a fence OF THIS REPORT and make the report
fire the rule it documents; a literal fence here would read the fabricated line):

    # zz nested fence probe

    FENCE-OPEN md
    FENCE-OPEN js
    ✓ 7–13 zz-spec.e2e.ts (all six legs)
    FENCE-CLOSE
    FENCE-CLOSE

The old parser closed the outer block on ANY same-kind marker line — the inner `` ```js `` info string, or a shorter
run — so the fabricated line fell in NO parsed block. **The fix is conformance, not a heuristic:** an opener is `≥3`
of one char, a backtick opener's info string may not contain a backtick, and a closer is a same-kind run `≥` the
opener's length carrying nothing but whitespace; any other same-kind line is content. The parser branch:

```js
      const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line)
      if (!marker) continue
      const run = marker[1]
      const info = marker[2]
      const kind = run[0]
      if (!open) {
        if (kind === '`' && info.includes('`')) continue
        open = { kind, length: run.length, at: index }
      } else if (kind === open.kind && run.length >= open.length && info.trim() === '') {
        fenced.push({ content: open.at + 1, end: index })
        open = null
      }
```

**The same input, the new guard:** the fabricated line is now read and the contradiction caught, exit 1:

```
$ node scripts/guards/factory-guard.mjs --root /tmp/probe8b --repo .
  note — transcript-summary-agrees: 2 fenced block(s) read, 1 range summary checked
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz-nest.md:5: a fenced block's summary line covers 7 entries (7–13) but states "(all six" — a captured transcript must reproduce its own arithmetic
FAIL — 1 factory finding(s).
NEW_EXIT=1
```

### The CommonMark cross-check (the guard's parse and `marked`'s parse agree on that input)

```
$ node /tmp/cm-agree.mjs
guard fenced-block ranges: [{"content":3,"end":5},{"content":7,"end":8}]
the ✓ line is line 5 -> guard reads it: true
CommonMark (marked): the same line is inside <pre><code>: true
AGREE
```

The `marked` render of the same file (indented, so the literal fabricated line is not inside a fence of this report):

    $ node -e "…marked.parse(seed)…"
    <h1>zz nested fence probe</h1>
    <pre><code class="language-md">```js
    ✓ 7–13 zz-spec.e2e.ts (all six legs)
    </code></pre>
    <pre><code></code></pre>

`marked` puts the fabricated line inside the outer `<pre><code class="language-md">`; the guard's parse now puts it in
block `[3,5)` — line 5 — i.e. the same block. The two parses agree.

### Both halves of the new check

```
  ✓ a NESTED fence (outer ```md, inner ```js) does NOT hide the transcript: CAUGHT
  ✓ MUTATION: restoring the loose closer (any same-kind marker) lets that seed PASS (exit 1 -> 0 — a DETECTION flip)
```

The mutation replaces the closer condition with the old loose `} else if (kind === open.kind) {`; the seed then
PASSES, so the check's verdict moves and the closure rules are load-bearing.

### The three sentences the escape falsified

| where | before | after |
|---|---|---|
| header (`:91-95`) | "EVERY fenced block, of either markdown fence kind **and however it is introduced**, is read" | "EVERY fenced block **whose marker starts a line** is read, by CommonMark's own fence rules: an opener is a run of three or more backticks or tildes (after leading whitespace), and a same-kind line closes it only when its run is at least as long and carries nothing but whitespace — so a nested fence's content stays inside the block that opened first, where it is read." |
| docblock (`:1629-1632`) | "Every fenced block in the scan set, **wherever it sits in the file**, … **paired with a fence of its own kind**" | "Every fenced block **whose marker starts a line**, in the scan set, … read by CommonMark's own closure rules: an opener is a run of three or more of one character (after leading whitespace), and a same-kind line closes the block only when its run is at least as long and carries nothing but whitespace — any other same-kind line is content." |
| parser comment (`:1745-1749`) | "a fence line of the OTHER kind inside an open block is content, **as markdown says**" | "THE FENCE RULES ARE COMMONMARK'S, implemented rather than guessed at … A same-kind line CLOSES the block only when its run is at least as long as the opener's and carries nothing but whitespace; any other same-kind line is CONTENT … a fence line of the OTHER kind inside an open block is content too." |

None was restated into a new shape; each now states what the fixed parser does, and the two over-claiming phrases
("however it is introduced", "wherever it sits in the file", "as markdown says") are gone.

### The ninth finding the brief did not anticipate — and why it is a TRUE positive

The fixed parser reads one block boundary the old parser split: `.scratch/v28/reports/slice-8b-review.md` opens a
`~~~text` fence and **never closes it** — a `~~~text` line carries an info string, so per CommonMark it is not a
closer — which keeps line 193 (a PROSE quotation of the round-5 seed) inside that code block. `marked` agrees: the
file's only `<pre><code>` contains it. So line 193 **is** read now and its `✓ 7–13 … (all six legs)` pair genuinely
contradicts its count. It is exactly the D-033 cost — a report quoting a bad block — so it is paid by the recorded
baseline, re-derived, not by widening the rule:

```
$ node /tmp/g-empty-quot.mjs --root "$PWD" --repo "$PWD"   # the quotation baseline blanked
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/slice-8a-verify-5.md:37: … covers 7 entries (7–13) but states "(all six" …
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/slice-8b-review.md:89: … covers 7 entries (7–13) but states "(all six" …
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/slice-8b-review.md:193: … covers 7 entries (7–13) but states "(all six" …
  FINDING [transcript-summary-agrees]: the quotation baseline is EMPTY …
```

The re-derived set is exactly three sites; the third is line 193, whose line text carries TWO range/count pairs, so
its recorded count is 2 (`TRANSCRIPT_QUOTATION_BASELINE_SIZE` 2 → 4). The run then reports `0 of the 4` for a clean
fixture root and `2 of the 4 ABSORBED … LOST COVERAGE 1` for the earlier partial world.

## FIX 2 — check 13's fixture leaves the live registry

The checker was RED at the base commit — and only on check 13, exactly as the two reviews found:

```
$ (worktree at HEAD) node scripts/guards/factory-guard.check.mjs
  ✗ an unacknowledged independence gap is CAUGHT — exit 0
factory-guard check: 1 check(s) failed — the factory guard is not doing its job.
HEAD_CHECKER_EXIT=1
```

The seed deleted `task_kinds.reviewer._independence_gap` from the LIVE `REAL_CONFIG` and required the live registry
to hold exactly one reviewer-qualified model. `D-034` (`c4a981d`) registered a second, so the seed's world stopped
existing. The seed is now a FIXTURE **built by reducing whatever the registry actually holds to one qualifier**
(strongest kept, so the other task kinds' floors stay meetable) — it keeps the two-qualifier world it now lives in
and still reaches the rule. Both halves plus the control:

```
  ✓ an unacknowledged independence gap is CAUGHT
  ✓ MUTATION: dropping the gap condition lets the one-model registry PASS (exit 1 -> 0 — a DETECTION flip)
  ✓ the one-qualified world WITH the acknowledgement passes (control)
```

The mutation neuters `if (qualified.length < 2 && !task._independence_gap) {`; the same seed then passes, so the
check is not always-red.

## FIX 3 — two claim gates stop publishing over ZERO measurements

`provenanceChecked = Boolean(repo)` and `checkTranscripts`' constant `true` published their universals over zero
provenance tokens and zero pasted transcripts. Both now return **a count** — the same form `rawSummaryLines` already
uses — so the `claims.push` gates that were already there publish only when there is something to publish about. Raw
measurement at `HEAD`'s guard on a root with a clean report: both claims appeared after `0 provenance token(s)`;
now they do not. Both halves for each gate:

```
  ✓ at zero provenance tokens the summary does NOT claim the shas were verified (D-030)
  ✓ with a provenance token read the summary DOES claim the shas were verified (control)
  ✓ MUTATION: printing the provenance claim unconditionally publishes it over ZERO tokens (so the seed can fail)
  ✓ at zero pasted transcripts the summary does NOT claim the transcripts reproduce (D-030)
  ✓ with a pasted transcript compared the summary DOES claim they reproduce (control)
  ✓ MUTATION: printing the transcript claim unconditionally publishes it over ZERO transcripts (so the seed can fail)
```

No third hand-written condition was added: the gate is the existing `if (provenanceTokens)` / `if (transcriptsCompared)`
over a count, exactly like `if (rawSummaryLines)`.

## FIX 4 — the false `lib-sibling-guard.sh` sentence DELETED

`scripts/guards/lib-sibling-guard.sh:117-119` printed "`src/lib` had entries, but all were exempt or test files" for
an EMPTY directory. The sentence could not be kept true without a second branch, so it is deleted (D-028 item 4, net
prose shrinks); the remaining two lines are true of both the empty and the exempt-only case:

```
$ bash scripts/guards/lib-sibling-guard.sh /tmp/glsib-empty   # EMPTY src/lib
  FINDING: src/lib holds no non-exempt module — the scan read nothing.
  An empty scan is not a clean repo (D-030).
FAIL — build law violated.   exit=1
$ bash scripts/guards/lib-sibling-guard.sh /tmp/glsib-exempt  # exempt-only src/lib
  (identical)                exit=1
```

## RAW VERIFY (fresh, this turn)

```
 Test Files  71 passed (71)
      Tests  2063 passed (2063)
 oxlint: 81 warning lines, 0 errors
  ok — AGENTS.md (1789 words, ceiling 1800)
PASS — steering layer is clean.
PASS — every positively-used e2e locator literal still exists in src.
PASS — the escape has exactly one home.
PASS — the newline convention holds across the scan set.
FAIL — 8 factory finding(s).                       <- all 8 are no-bare-head-count, in the two lane reports
PASS — all 8 checks: the guard fires on both defects and only on them.   (lib-sibling)
PASS — all 10 checks: the guard fires on the defect and only on it.      (trailing-newline)
factory-guard check: all 146 checks passed.        (was 137; +9 = check-13 mutation, nested seed+mutation, 20B's six)
GUARDS: FAIL — 1 guard(s) reported findings: - factory-guard
VERIFY EXIT=1
```

**`npm run verify` is NOT exit 0 at this handoff, and the ONLY cause is the 8 `no-bare-head-count` findings in
`.scratch/v28/reports/slice-8b-review-4.md` and `slice-8b-review-independent.md`** — the two lane reports the brief
assigned to the orchestrator ("that is the orchestrator's to settle, not yours"), now recorded **known-open with
file:line by D-036** rather than edited or absorbed (D-027: lower the claim, never widen the mechanism). The guard's
findings are exactly those 8 and nothing else; the ninth — the `slice-8b-review.md:193` site the CommonMark fix newly
reads — is a QUOTATION of the bad seed, which is the D-033 baseline's job, and it is absorbed there by re-derivation
above; the two are different rules with different absorbers, which is why one is recorded known-open and the other is
recorded in the quotation baseline. Correcting the two reports to name the commit they measured at is what turns
`GUARDS: PASS` and `VERIFY EXIT=0`; that is the reports' authors' work, not this round's.

## Fix-round-5 risks

- **`npm run verify` is red on the 8 lane-report counts, not on this round's work.** D-036 records them known-open
  with file:line; the checker (137 → 146, all green, including this round's `check 13`) and `factory-guard.check.mjs`
  are the round's gate-critical instruments and both are green now.
- **The quotation baseline grew 2 → 4 occurrences (3 keys), by re-derivation, not hand-adding.** The third site is a
  CONSEQUENCE of the CommonMark fix reading a `~~~text` region the old parser split; it is a quotation of the bad
  seed, the exact object the D-033 baseline records, and a future round re-derives rather than trusting the number.
  This is NOT the same move D-036 forbids for the 8 bare-HEAD counts: those are true findings in lane prose with no
  absorber of their kind, so they stay known-open.
- **The checker's one-qualified world is still DERIVED from the live registry** (reduced to one qualifier). It no
  longer REQUIRES a registry shape, but if a future registry is legal with <2 reviewer-qualified models the seed
  throws loudly instead of passing vacuously; if deleting the weaker qualifier would break another task kind's floor,
  the control fails loudly. Both are loud, not silent.
- **`ladder:`** the parser fix is conformance to a closed specification (CommonMark), not another shape guess; if a
  future reviewer finds a fence shape the guard reads differently from CommonMark, the rung is the reference
  implementation, not a fifth condition.
- **FIX 4 deleted a sentence rather than restating it.** The empty-dir case is now covered by the same true sentence
  as exempt-only; the `lib-sibling` checker still passes 8/8 (its check 4 asserts `/the scan read nothing/`).

---

# BREAKER-ADJUDICATED REPAIR (fix round 6)

Authorised as a NAMED CLAUSE of a closed specification, not as a blind round: CommonMark's fence-closure rule is
closed and has reference implementations, so the fix is decidable and checkable. The verifier's 20,000-input fuzz
(0 divergences at ≤3-space indent) is the evidence that the parser had converged everywhere else. The stop
condition stands: a SEVENTH divergence in fence closure after this fix is reported, not fixed, and triggers
D-032.

## Repair 1 — the closer-indent clause

`factory-guard.mjs` used ONE regex for opener and closer (`^\s*(` + run + `)`), so a same-kind line indented four
spaces — or tab-indented — CLOSED a block that CommonMark keeps open. Both lanes measured it independently, with a
reference parser, on this input (the literal check-mark is written `[CHECK-MARK]` in this listing so that quoting
the seed does not redden this report's own scan; the fixture uses the literal mark):

    input:  ```md / harmless / "    ```" / [CHECK-MARK] 7–13 zz-spec.e2e.ts (all six legs) / ```

Seed red / mutation green, both halves on the verifier's exact input (raw output, throwaway root):

    $ node /tmp/g-prefix.mjs --root <seed root> --repo <repo>        # the guard at f3cf360
      note — transcript-summary-agrees: 2 fenced block(s) read, 0 range summaries checked — NOTHING was compared …
      PASS — …
      EXIT=0
    $ node scripts/guards/factory-guard.mjs --root <seed root> --repo <repo>   # this change
      note — transcript-summary-agrees: 1 fenced block(s) read, 1 range summary checked
      FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz-raw.md:6: … covers 7 entries (7–13) but states "(all six" …
      EXIT=1

The parser now implements CommonMark's closing-fence clause: same kind, run at least the opener's length,
indented at most three SPACES, followed only by spaces or tabs. The opener keeps the declared any-whitespace
over-read. The ceiling sentence that called leading-whitespace acceptance "the safe direction" is corrected with
the code — it is true for an OPENER (recognising more openers reads more) and false for a CLOSER — in the header
rule list, the docblock, the ceiling list and the parser comment.

The checker carries the seed and its exit-moving mutation:

      ✓ a CLOSER indented four spaces is CONTENT, so the transcript below it is CAUGHT
      ✓ MUTATION: dropping the closer indent limit lets that seed PASS (exit 1 -> 0 — a DETECTION flip)

and, for the review's non-blocking item, the LENGTH face of the fifth shape now has its own seed and mutation (the
fifth-shape seed covered only the info-string variant):

      ✓ a SHORTER closer run does NOT close a longer opener: the transcript below it is CAUGHT
      ✓ MUTATION: dropping the run-length comparison lets that shorter-closer seed PASS (exit 1 -> 0 — a DETECTION flip)

## Repair 2 — the conformance claim is now a check

The tree ships no markdown parser, and none was added. Instead a differential fixture is committed:
`scripts/guards/fence-conformance.fixture.json`, 26 fence cases with the code-content boundaries a REFERENCE
implementation derives, and `factory-guard.check.mjs` runs the guard's OWN parser — the bytes lifted from
`factory-guard.mjs` by anchors, not a copy — over every case, failing on any divergence. A fixture whose
expectations came from a reference is evidence; one typed from a reading of the spec is a second opinion.

- Reference: `commonmark 0.31.2` — the canonical reference, and the authority for every case — cross-checked
  against `marked 18.0.14`.
- Derivation, recorded in the fixture's own header (the references live in a throwaway root, not in this tree):

      (cd /tmp/mdref && npm i commonmark@0.31.2 marked@18.0.14)
      MDREF=/tmp/mdref node scripts/guards/fence-conformance.derive.mjs > scripts/guards/fence-conformance.fixture.json

- Coverage: nested same-kind fences; info-string closers; shorter and longer runs; the ≤3-space and ≥4-space
  closer indents; tab-indented closers; trailing text after a closer; trailing spaces and other suffix kinds;
  tilde fences; a backtick opener whose info string contains a backtick; unclosed fences; other-kind
  nesting inside; two blocks; indented openers.

Result, measured this turn — the guard's own parser against the fixture table:

    PRE-FIX f3cf360: divergences=6 of 26
       - closer indented four spaces stays content
       - closer indented eight spaces stays content
       - tab-indented closer stays content
       - closer with a vertical-tab suffix stays content
       - closer with an NBSP suffix stays content
       - tilde closer indented four spaces stays content
    CURRENT: divergences=0 of 26

All six are the same closing-fence clause — its indentation bound and its suffix kinds — not a seventh shape.

The one shape the brief names as "tab-suffixed" is where the two references DISAGREE, and per D-037 the seed is
shrunk to where they agree rather than the disagreement settled in prose: it is NOT in the table. Measured — the
spec allows spaces or tabs after a closing run, `commonmark 0.31.2` closes on the tab, `marked 18.0.14` keeps the
line as content. The guard closes, matching the spec and commonmark. The derive script prints the disagreement
count, which is 0 for the committed table.

## Repair 3 — the false number, deleted not softened

`factory-guard.mjs` carried the comment "LOST COVERAGE 0 — every recorded key still matches", which is false: the
live run prints `3 of the 4 ABSORBED this scan (LOST COVERAGE 1)`, and 0 is mechanism-impossible for that rule (the
counter counts PAIRS, `absorbed` counts FAILING pairs). D-028: the claim is DELETED, not restated. This report's
own copy of the same false claim — the fix-round-5 sentence "on the live corpus it is `LOST COVERAGE 0`" — is
deleted here too.

## Gate (final)

`node scripts/guards/factory-guard.check.mjs` -> `factory-guard check: all 178 checks passed.` (exit 0). The new
fixture block contributes 28 of those (26 cases + the non-empty-table guard + the divergence summary); the rest of
the increase is the closer-indent seed/mutation pair and the length seed/mutation pair.

`npm run verify` -> exit 0: `Test Files 71 passed (71)`, `Tests 2063 passed (2063)`, lint 81 warnings / 0 errors,
AGENTS.md 1789 words of a 1800 ceiling, `GUARDS: PASS — all deterministic rules hold.`

At dispatch the guard was red on ONE factory finding that was NOT from this slice:

    FINDING [no-bare-head-count]: .scratch/v28/reports/slice-8b-review-5.md:129: a count is resolved through bare HEAD …

`f3cf360` — the tip this round was dispatched from — added that lane report, so the guard was red at the tip before
this change: stashing this entire diff and re-running reproduced the identical single finding. It is D-036's class:
a lane report's own sentence making a true statement in an unreproducible form. Editing another lane's report is
forbidden and absorbing a true finding into the baseline is forbidden (D-027), so this lane left it standing and
reported it rather than touching it. That report's OWN author then fixed the provenance token in the same commit
that carries these repairs; that edit is not this slice's, and this slice's own files add zero findings. With it
fixed, both gate commands exit 0 as shown above.

## Unanticipated

- The reference table caught FIVE divergences beyond the one clause the brief named — the eight-space and
  tab-indented closers, the vertical-tab and NBSP suffixes, and the tilde-indented closer. All are the SAME named
  clause (the closing fence's whitespace), so this completes the clause; it is not a seventh shape.
- The brief lists a "tab-suffixed" closer among the shapes CommonMark keeps open, and both lanes repeated it.
  Measured against the references, it is wrong: the spec allows spaces OR TABS after a closing run, and commonmark
  closes on a trailing tab. `marked` disagrees with the spec on exactly that input, so per D-037 the case was
  DROPPED from the table (shrink to where the references agree) rather than adjudicated in prose; the guard's
  behaviour — it closes, matching the spec — is reported here and not pinned by the fixture.
- The opener's any-whitespace over-read is left in place (declared). Every fixture case opens at ≤3 spaces, so the
  table measures the closure rules and not that declared ceiling.
- The guard was red on another lane's report when this round was dispatched; see Gate. Reported rather than
  fixed, per the brief; that report's author fixed it in the same commit.

