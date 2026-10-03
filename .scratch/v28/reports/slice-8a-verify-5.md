# Slice 8a — verification, ROUND 5 (FINAL)

**Object:** round-4 fix, commit `8006e03` (parent `0c93bd2`). Working tree was clean at the start; I made no
repository edit other than this report.

## DISCLOSURE (why this is not an independent instrument)

I am a sibling model, not an independent reviewer. I re-ran the commands and re-derived the counts from the
artefacts rather than from the report's prose. Everything below marked "measured" is a command I ran in this
session; verbatim pastes are trimmed only where noted. I did not start or stop any inference server, did not
push, and used throwaway roots under `/tmp` for every probe.

## VERDICT: **FAIL** — 2 blocking findings, both in the rule this round hardened.

The round's headline is real and I reproduced it byte-for-byte: the out-of-vocabulary count is now a finding,
the coverage note counts what was read, and the before/after on one seed file flips `PASS` → `3 findings`. The
blunt-vs-narrow tripwire price (31/104 vs 0/104) is exact. But the SHIPPED rule has a quotation exemption that
is reachable as an escape (BLK-A), and the label-form narrowing DROPS real verbatim blocks — including the
exact defect shape it exists for — while the report accounts the drop as "3 prose" when it is 6 blocks, 3 of
them genuine (BLK-B).

---

## BLOCKING

### BLK-A. [MECHANISM / FALSE NEGATIVE — the quotation exemption is an escape] `factory-guard.mjs:1655-1657`

The tripwire exempts a label whose next non-blank line begins `>`. I built the fabrication with that exact
shape (a token-form label, then a blockquote holding the §3 arithmetic):

```
# zz-quote escape

Here is the fabricated transcript, introduced as a quotation — raw: (a token-form label line)

> Running 3 tests using 1 worker
> ✓ 7–13 zz-spec.e2e.ts (all six legs)
```

Measured with the committed guard:

```
$ node scripts/guards/factory-guard.mjs --root /tmp/v5/rootQ --repo <repo>
  note — transcript-summary-agrees: 0 raw-labelled block(s) read, 0 range summaries checked — NOTHING was checked: no range summary inside a raw-labelled block exists in this scan
PASS — the registry can be trusted and no work item claims evidence it does not have.
EXIT=0
```

Seven entries, "all six", introduced as raw output, and the run says **NOTHING was checked** and PASSES. A
second variant — the label line itself inside the quotation — behaves identically (`EXIT=0`, `0 blocks read`).
This is precisely the D-030 shape the round set out to close: a label the rule SAW and read no block for, with
a live exemption that a fabricator reaches by prefixing `>`. The builder's rationale (blockquotes are "prose
quoting prose") is true of the eight live briefs, but the mechanism cannot tell a quotation from a use, so the
exemption is one character wide and it swallows the defect class. Per the brief's own criterion this is a live
hole → blocking.

### BLK-B. [COVERAGE LOSS + WRONG ACCOUNTING — `ladder:`] the label-form narrowing drops 6 blocks, not 3, and 3 of them are genuine verbatim blocks — one carrying the exact defect shape

Re-derived both directions over the live scan set (`.scratch/v28/reports/*.md` + `briefs/*.md`), old rule vs
new rule, same corpus and same day:

- OLD rule (`0c93bd2`): `11 block(s) introduced as raw:/verbatim read, 0 range summaries checked` — reproduced.
- NEW rule (`8006e03`): `8 raw-labelled block(s) read, 0 range summaries checked` — reproduced.
- Set diff: **5 kept, 6 dropped, 3 gained** (11 − 6 + 3 = 8). The dropped set is:

| dropped block | intro line (abridged) | content | judgement |
|---|---|---|---|
| `reports/slice-6b-micro.md:27` | `**After** (corrected clause, verbatim):` | quoted source-code comment | prose use — correctly dropped |
| `reports/slice-6c-fix-2-verify.md:187` | `… all three mutation anchors still exist verbatim at HEAD …` | grep commands+output | prose adverb — correctly dropped |
| `reports/slice-6c-fix-5-review.md:606` | `## Appendix A — raw firing output of my two probe roots (verbatim, …)` | guard firing output | **GENUINE raw block** |
| `reports/slice-6d-verify-5.md:120` | `Run verbatim, exactly as pasted in … §15:` | command+output | verbatim paste (borderline genuine) |
| `reports/slice-8a-review-4.md:140` | `… inside a \`raw:\`-labelled block:` | quoted guard run | prose mention — correctly dropped |
| `reports/slice-8a.md:408` | `… the real output of the command I name, verbatim (2026-10-02, tree \`3f2da79\`, …):` | full 13-test Playwright transcript | **GENUINE raw block** |

The three GAINED are genuine and were genuinely missed by the old rule: `reports/slice-6c-fix-6.md:1003`
(fenced — label 4 prose lines above the fence), `reports/slice-8a.md:653` (fenced — label 8 lines above), and
`reports/slice-8a-verify.md:161` (indented code block). 2 fenced + 1 indented, exactly as claimed.

The report's FR4-7 states "the 3 lost were prose false-attributions, the 3 gained …". That arithmetic does not
reach 8 (11 − 3 + 3 = 11), and the measurement is 6 lost, of which two are unambiguously genuine raw blocks
(one a full verbatim Playwright transcript). FR4-2.1 separately says "5 were prose" — the report contradicts
itself and neither number matches the corpus.

**The loss is not merely a printed number.** The exact defect shape, written with a prose verbatim
introduction, is caught by the old rule and missed by the current one:

```
# zz-narrowing loss

Here is the output of the command I name, verbatim (2026-10-02, tree 3f2da79):

```
Running 3 tests using 1 worker
✓ 7–13 zz.e2e.ts (all six legs)
```

$ node <PRE-FIX guard> --root /tmp/v5/rootR --repo <repo>
  note — transcript-summary-agrees: 1 block(s) introduced as raw:/verbatim read, 1 range summary checked
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz-narrow.md:7: a raw block's summary line covers 7 entries (7–13) but states "(all six" …
FAIL — 1 factory finding(s).   EXIT=1

$ node scripts/guards/factory-guard.mjs --root /tmp/v5/rootR --repo <repo>
  note — transcript-summary-agrees: 0 raw-labelled block(s) read, 0 range summaries checked — NOTHING was checked …
PASS — …   EXIT=0
```

So a block introduced in the live corpus's own style (`… , verbatim (date, tree <sha>):`, the form
`slice-8a.md:408` actually uses) can carry `✓ 7–13 … (all six)` and reach a reviewer unread. No live block in
the corpus currently carries the watched range shape (both runs print `0 range summaries checked`, so zero
comparisons were lost on today's corpus), but the round traded a genuine false-negative for the false positives
it removed. Per the brief's criterion — "if a real block was DROPPED by the narrowing, that is coverage loss
and a blocking finding" — this is blocking.

---

## NON-BLOCKING

1. **[Instrument gap]** The `fence-INLINE label` check (`factory-guard.check.mjs:1386`) is the only one of the
   six new areas with **no mutation check**. The other five each ship a mutation (and the out-of-vocab and
   tripwire paths also ship a control). The inline check CAN fail (removing inline detection yields
   `0 blocks read`, exit 0, which fails its `exit === 1` assertion), but no committed mutation proves it — the
   same "a check whose named failure cannot be reached by any mutation is a claim" standard the harness states
   for itself.
2. **[Report arithmetic]** FR4-7's "3 lost … 3 gained" does not sum to the printed `11 → 8`. See BLK-B.
3. **[Naming, inherited]** The note still prints `N raw-labelled block(s) read` as a coverage number while the
   read set is defined by a label-form heuristic; after BLK-B the number under-counts genuine raw blocks. The
   round-4 BLK-2 class (a coverage number read as coverage) survives in the opposite direction.

---

## THE FOUR RE-DERIVATIONS

### (a) Before/after on one 3-seed file — REPRODUCED EXACTLY

Seed root `/tmp/v5/root`: A = `all thirteen` on a 7–13 range under its label; B = a token label with no block;
C = an indented raw block with `all six` on a 7–13 range. Pre-fix guard via
`git show 0c93bd2:scripts/guards/factory-guard.mjs`.

```
=== PRE-FIX (0c93bd2) ===
  note — transcript-summary-agrees: 1 block(s) introduced as raw:/verbatim read, 1 range summary checked
PASS — the registry can be trusted and no work item claims evidence it does not have.
EXIT=0

=== CURRENT (8006e03) ===
  note — transcript-summary-agrees: 2 raw-labelled block(s) read, 1 range summary checked
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz-seeds.md:9: a raw block's summary line states a count this rule cannot resolve to a number: "(all thirteen" — a range SEEN and not compared is a finding, not a pass
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz-seeds.md:23: a raw block's summary line covers 7 entries (7–13) but states "(all six" — a block claiming to be raw must reproduce its own arithmetic
  FINDING [transcript-summary-agrees]: .scratch/v28/reports/zz-seeds.md:14: a line introduces a block as raw:/verbatim but no captured-output block was attributed to it: "proof — raw:" — a label this rule saw and did not read
FAIL — 3 factory finding(s).
EXIT=1
```

Line numbers, note text and findings are identical to FR4-1's paste. The pre-fix rule read 1 of 3 blocks,
counted the UNCOMPARED range as checked, published the claim, and PASSED. The fix's premise holds.

### (b) `all thirteen` is a finding, and its mutation re-publishes the bug — REPRODUCED

Current guard, seed A alone: `EXIT=1`, `1 raw-labelled block(s) read, 0 range summaries checked`, and the
finding `states a count this rule cannot resolve to a number: "(all thirteen"`. With the harness's own mutation
`… : WORDS[word]` → `… : span` ("assume it agrees"):

```
  note — transcript-summary-agrees: 1 raw-labelled block(s) read, 1 range summary checked
  ok — … every step-range summary inside a raw-/verbatim-labelled block agrees with its own "all N" count …
PASS — …        EXIT=0
```

The mutation flips the finding back to PASS AND re-publishes the exact coverage claim — the original BLK-1 bug,
reproduced by mutation.

### (c) Tripwire cost, both ways — MEASURED INDEPENDENTLY

I built mutant copies of the committed instrument and ran the committed harness against each (a copy of
`factory-guard.check.mjs` with only its `REPO` constant repointed at the real repo, so `--repo` provenance
resolution is faithful; the unmutated copy reproduced `104 ✓` as a control).

```
control (shipped narrow tripwire):   104 pass / 0 fail   -> 0 of 104 break
blunt tripwire (ranges === 0 -> fail):  73 pass / 31 fail  -> 31 of 104 break
```

The builder's `31 of 104` and `0 of 104` are both exact. (The round-4 review measured `30 of 93` for a
slightly different blunt form; the builder's claimed numbers are the ones reproduced here.)

### (d) The exemption is reachable — YES, and it passes (BLK-A above)

- Fabricated token label + blockquote with `✓ 7–13 (all six)`: `EXIT=0`, `0 blocks read … NOTHING was checked`,
  PASS.
- Same with the label itself inside the quotation: `EXIT=0`, `0 blocks read`, PASS.
- **Live fires of the shipped rule: 0.** `node scripts/guards/factory-guard.mjs` on the live corpus →
  `8 raw-labelled block(s) read, 0 range summaries checked`, `0` findings, `EXIT=0`. All 8 unread labels are
  quote-exempt.
- **Live label set, independently re-derived:** 16 label lines total; 8 attributed/read; 8 unattributed, and
  **all 8 unattributed have a blockquote as their next non-blank line**. Fires with the exemption removed
  (mutant): `EXIT=1`, **8 findings**, every one in `briefs/`, every one a `Verbatim:`/`**Reviewer, verbatim:**`
  heading introducing a blockquote:

```
briefs/slice-1-fix-1.md:52   "Verbatim:"
briefs/slice-1-fix-1.md:66   "bounded.** Verbatim:"
briefs/slice-2a-fix-1.md:52  "Verbatim:"
briefs/slice-6c-fix-2.md:54  "**Reviewer, verbatim:**"
briefs/slice-6c-fix-2.md:85  "**Reviewer, verbatim:**"
briefs/slice-6c-fix-2.md:104 "**Reviewer, verbatim:**"
briefs/slice-6c-fix-2.md:118 "**Reviewer, verbatim:**"
briefs/slice-6c-fix-2.md:205 "**Reviewer, verbatim:**"
```

  So the builder's justification for the exemption is accurate (a no-exemption rule is red on other lanes'
  briefs), and the exemption is exactly as wide as the escape in BLK-A.

---

## ITEM 5 — the label-form narrowing's accounting (see BLK-B)

- **Gained: confirmed.** 3 previously unread real blocks, 2 fenced + 1 indented, each a genuine captured-output
  block (a guard firing run, the §3 mutation transcript, and the Playwright revert run).
- **Dropped: NOT as claimed.** 6 blocks are no longer read, not 3; 3 are prose uses and 3 introduce genuine
  captured output (`slice-6c-fix-5-review.md:606`, `slice-6d-verify-5.md:120`, `slice-8a.md:408`). The last is
  a full 13-test verbatim transcript. No dropped block carries the watched `✓ N–M (all N)` shape, so zero live
  comparisons were lost on today's corpus — but the same defect written in that introduction style is now
  missed (BLK-B counterexample).

---

## THE STANDING GATES (items 1–3)

```
$ npm run verify
EXIT=0
 Test Files  71 passed (71)
      Tests  2063 passed (2063)
warning lines=81 error lines=0
  ok — AGENTS.md (1789 words, ceiling 1800)
PASS — steering layer is clean.
GUARDS: PASS — all deterministic rules hold.

$ bash scripts/guards/run-all.sh   -> exit 0, GUARDS: PASS — all deterministic rules hold.
$ bash scripts/steering-lint.sh    -> exit 0, PASS — steering layer is clean.
$ node scripts/guards/factory-guard.check.mjs -> exit 0, all 104 checks passed (104 ✓, 0 ✗)
$ node scripts/guards/factory-guard.mjs       -> exit 0, 8 raw-labelled block(s) read, 0 findings
```

- **test files 71 / tests 2063 / warnings 81 / errors 0 / AGENTS.md 1789 vs ceiling 1800** — all re-measured
  (lint re-run standalone: 81 warnings, 0 errors).
- **test-file delta zero** — `git diff --stat 0c93bd2..8006e03` touches exactly
  `.scratch/v28/reports/slice-8a.md`, `scripts/guards/factory-guard.check.mjs`, `scripts/guards/factory-guard.mjs`.
  No `.test.`, no `.e2e.`, no `src/` file moved, so 2063 cannot have changed.
- **93 → 104** — I extracted the `0c93bd2` harness into `/tmp` and ran it: `all 93 checks passed`. The committed
  harness prints `all 104 checks passed`, and `git diff` shows exactly **11 added `check(` call sites**.
- **The six new areas, each checked:** out-of-vocabulary count ✔ (seed + mutation + control); label tripwire ✔
  (seed + mutation, plus the witness control); input-count witness ✔ (the `2 blocks, 1 range summary` control);
  prose-crossed label ✔ (seed + mutation); indented block ✔ (seed + mutation); fence-inline label ✔ seed, **no
  mutation** (NON-BLOCKING 1).

## REQUIREMENTS TRACEABILITY

| requirement | ruling | evidence |
|---|---|---|
| `npm run verify` exit 0; test/lint/AGENTS/GUARDS figures | **MET** | 71 / 2063 / 81 / 0 / 1789 of 1800; GUARDS PASS |
| `run-all.sh` exit 0; `steering-lint.sh` PASS | **MET** | both exit 0 |
| guard check exit 0, 104 checks, 93→104 | **MET** | 104 ✓ / 0 ✗; pre-fix harness 93; 11 added check sites |
| the six new areas each with a mutation | **PARTIALLY MET** | fence-inline has no mutation |
| (a) before/after on one file | **MET** | reproduced byte-for-byte |
| (b) out-of-vocab count is a finding; mutation re-publishes | **MET** | reproduced |
| (c) blunt 31/104, narrow 0/104 | **MET** | measured |
| (d) exemption reachable as an escape | **NOT MET** | fabrication passes, exit 0 (BLK-A) |
| live fires stated and read | **MET** | shipped 0; no-exemption mutant 8, all briefs, all blockquotes |
| narrowing accounting: 3 dropped prose / 3 gained real | **NOT MET** | 6 dropped, 3 genuine (BLK-B) |

## RESIDUAL RISKS

- The two blockers are both in `checkRawBlockSummaries`; the round's other three fixes (count-first, attribution
  window, indented blocks) I would sign off as they stand.
- Neither blocker is exercised by the live corpus today (no live block carries the range shape), so the guard
  is green; both are reachable by the exact writing styles already present in the corpus.
- `factory-guard.mjs`'s no-report-dirs early return still omits `rawSummaryLines` (registered for 8b).
- I did not run any Playwright spec, vitest, or the inference stack.

**Recommended next action:** narrow the exemption to something a fabricator cannot reach (e.g. exempt only a
label that is itself inside a quotation, or require the blockquote to carry no `✓`/range line) and either
restore reading for prose "verbatim" introductions that name output or state in the ceiling that they are no
longer read — and correct FR4-7's `3 lost / 3 gained` accounting to `6 dropped (3 genuine raw blocks) / 3
gained`.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Returned the slice verdict (FAIL) with every number re-measured and residual risks stated: the four re-derivations were run, the standing gates re-run, and two blocking findings named with reproduction commands."
    }
  ],
  "changedFiles": [
    ".scratch/v28/reports/slice-8a-verify-5.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    { "command": "npm run verify", "result": "passed", "summary": "exit 0; Test Files 71, Tests 2063, warnings 81, errors 0, AGENTS.md 1789/1800, GUARDS PASS" },
    { "command": "bash scripts/guards/run-all.sh", "result": "passed", "summary": "exit 0, GUARDS: PASS" },
    { "command": "bash scripts/steering-lint.sh", "result": "passed", "summary": "exit 0, PASS — steering layer is clean" },
    { "command": "node scripts/guards/factory-guard.check.mjs", "result": "passed", "summary": "exit 0, all 104 checks passed (104 ✓, 0 ✗)" },
    { "command": "node <pre-fix harness 0c93bd2>", "result": "passed", "summary": "all 93 checks passed — baseline for 93->104" },
    { "command": "node <mutant: ranges===0 -> fail> + committed harness", "result": "failed", "summary": "73 pass / 31 fail — blunt tripwire breaks 31 of 104; shipped narrow breaks 0 of 104" },
    { "command": "node scripts/guards/factory-guard.mjs --root /tmp/v5/rootQ --repo <repo>", "result": "passed", "summary": "blockquote-exempt fabrication PASSES exit 0 with 0 blocks read — BLK-A" },
    { "command": "node <pre-fix guard> vs <current guard> --root /tmp/v5/rootR", "result": "failed", "summary": "old catches a range in a prose-verbatim block; current passes with 0 blocks read — BLK-B" },
    { "command": "node <labels re-derivation over reports/briefs>", "result": "passed", "summary": "16 label lines, 8 read, 8 unread — all 8 quote-introduced; shipped fires 0, no-exemption mutant fires 8" },
    { "command": "node <block-set re-derivation old vs new>", "result": "passed", "summary": "11 old / 8 new / 5 kept / 6 dropped / 3 gained" }
  ],
  "validationOutput": [
    "npm run verify: EXIT=0; Test Files 71 passed (71); Tests 2063 passed (2063); warning lines=81 error lines=0; AGENTS.md 1789 words (ceiling 1800); GUARDS: PASS",
    "run-all.sh exit 0 GUARDS: PASS; steering-lint.sh exit 0 PASS",
    "factory-guard.check.mjs: all 104 checks passed; pre-fix harness: all 93 checks passed; 11 added check( sites",
    "(a) pre-fix: 1 block(s) read, 1 range summary checked, PASS exit 0; current: 2 raw-labelled block(s) read, 1 range summary checked, 3 findings, exit 1",
    "(b) current fails on (all thirteen); mutation 'assume it agrees' -> exit 0 with the coverage claim re-published",
    "(c) blunt 31/104, narrow 0/104",
    "(d) fabricated blockquote-labelled transcript: exit 0, 0 blocks read, 'NOTHING was checked'"
  ],
  "residualRisks": [
    "Both blockers are latent on today's corpus (no live block carries the watched range shape) but reachable by writing styles already present in the corpus.",
    "factory-guard.mjs no-report-dirs early return still omits rawSummaryLines (8b-registered).",
    "No Playwright/vitest spec or inference server was run; the test-half figures are re-measured from npm run verify."
  ],
  "noStagedFiles": true,
  "diffSummary": "Read-only verification; only this report file added under .scratch/v28/reports/. No source, guard, test, or e2e file changed; no staged files. The new report does not move the guard's note (still 8 blocks, 0 findings, GUARDS PASS).",
  "reviewFindings": [
    "blocker: scripts/guards/factory-guard.mjs:1655-1657 - the quotation (>) exemption is reachable as an escape: a token-form raw label followed by a blockquote holding the 7-13 range with (all six) passes with exit 0 and 'NOTHING was checked'",
    "blocker: scripts/guards/factory-guard.mjs label-form narrowing - 6 blocks dropped not 3; slice-6c-fix-5-review.md:606 and slice-8a.md:408 are genuine raw blocks, and a 'verbatim (date, tree <sha>):' intro carrying the 7-13 / (all six) defect is caught pre-fix and missed now",
    "non-blocking: factory-guard.check.mjs:1386 - the fence-INLINE check has no mutation check while the other five new areas each ship one"
  ],
  "manualNotes": "Read-only verification of 8006e03. The four re-derivations were all performed: (a),(b),(c) reproduce exactly; (d) is a live hole. Full report lives at .scratch/v28/reports/slice-8a-verify-5.md and leaves the gate green (8 blocks, 0 findings, GUARDS PASS)."
}
```
